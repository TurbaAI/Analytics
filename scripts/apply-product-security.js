#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const {
  parseArgs,
  readProductConfig
} = require("../lib/product-config");

const root = path.join(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const configPath = args.config || "ops/turbalance-product.example.json";
const config = readProductConfig(configPath);
const secretsDir = path.resolve(root, args["secrets-dir"] || "build/product-secrets");
const apply = Boolean(args.apply);
const timeoutMs = Number(args.timeout || 10000);
const skipAgentRollout = Boolean(args["skip-agent-rollout"]);
const skipControllerRestart = Boolean(args["skip-controller-restart"]);
const skipVerifyPush = Boolean(args["skip-verify-push"]);
const outPath = args.out || "";

main().catch((error) => {
  const report = {
    status: "failed",
    generatedAt: new Date().toISOString(),
    error: error?.stack || String(error)
  };
  writeReport(report);
  process.exitCode = 1;
});

async function main() {
  const secrets = readSecrets(secretsDir);
  const groups = agentGroups(config);
  const report = {
    status: apply ? "applied" : "dry-run",
    generatedAt: new Date().toISOString(),
    product: config.product,
    secretsDir,
    plan: {
      agentRollout: !skipAgentRollout,
      controllerRestart: !skipControllerRestart,
      verifyPush: !skipVerifyPush,
      groups: groups.map((group) => ({
        name: group.name,
        systemdMode: group.systemdMode,
        remoteRoot: group.remoteRoot,
        remotes: group.remotes
      }))
    },
    checks: []
  };

  if (apply && !skipAgentRollout) {
    report.agentRollout = groups.map((group) => rolloutGroup(group, secrets));
    const failed = report.agentRollout.some((group) => group.status !== "applied");
    if (failed) {
      report.status = "failed";
      writeReport(report);
      process.exitCode = 1;
      return;
    }
  }

  if (apply && !skipControllerRestart) {
    report.controllerRestart = restartController(secrets);
    if (report.controllerRestart.status !== "restarted") {
      report.status = "failed";
      writeReport(report);
      process.exitCode = 1;
      return;
    }
  }

  if (apply) {
    report.checks.push(await collectorReadyCheck());
    report.checks.push(await apiReadyCheck());
    report.checks.push(await apiAuthChallengeCheck(secrets));
    if (!skipVerifyPush) report.checks.push(verifyCollectorPush(secrets));
    if (report.checks.some((check) => check.status !== "pass")) {
      report.status = "failed";
      process.exitCode = 1;
    }
  }

  writeReport(report);
}

function readSecrets(dir) {
  const required = {
    collectorToken: "collector-token",
    collectorHmacSecret: "collector-hmac-secret",
    apiViewerToken: "api-viewer-token",
    apiAdminToken: "api-admin-token",
    apiTokens: "api-tokens",
    controllerEnv: "controller-secure.env",
    agentEnv: "agent-auth.env"
  };
  const values = {};
  for (const [key, fileName] of Object.entries(required)) {
    const filePath = path.join(dir, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`missing product secret file ${filePath}; run scripts/generate-product-secrets.js first`);
    }
    values[key] = fs.readFileSync(filePath, "utf8").trim();
  }
  return values;
}

function agentGroups(config) {
  const sparkRemotes = config.fleet.machines
    .filter((machine) => machine.enabled && machine.role === "spark" && machine.remote)
    .map((machine) => machine.remote);
  const piRemotes = config.fleet.machines
    .filter((machine) => machine.enabled && machine.role === "pi" && machine.remote)
    .map((machine) => machine.remote);
  return [
    {
      name: "spark-user-agents",
      systemdMode: args["spark-systemd-mode"] || "user",
      remoteRoot: args["spark-remote-root"] || "/home/user/turbalance-analytics",
      remotes: sparkRemotes
    },
    {
      name: "pi-system-agents",
      systemdMode: args["pi-systemd-mode"] || "system",
      remoteRoot: args["pi-remote-root"] || config.fleet.defaultRemoteRoot || "/opt/turbalance/Analytics",
      remotes: piRemotes
    }
  ].filter((group) => group.remotes.length);
}

function rolloutGroup(group, secrets) {
  const reportPath = path.join("build", "product-runtime", `${group.name}-security-rollout.json`);
  const commandArgs = [
    "scripts/rollout-production-fleet.js",
    "--apply",
    "--sync",
    "0",
    "--benchmarks",
    "--systemd-mode",
    group.systemdMode,
    "--remote-root",
    group.remoteRoot,
    "--collector-url",
    config.controller.collectorUrl,
    "--host-url",
    config.controller.staticUrl,
    "--tenant-id",
    config.fleet.tenantId,
    "--product-version",
    config.product.version,
    "--deployment-environment",
    config.product.environment,
    "--agent-loop-ms",
    String(config.fleet.agentLoopMs),
    "--post-timeout-ms",
    String(config.fleet.postTimeoutMs),
    "--command-timeout-ms",
    "120000",
    "--out",
    reportPath,
    ...group.remotes.flatMap((remote) => ["--remote", remote])
  ];
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: 300000,
    env: {
      ...process.env,
      TURBALANCE_COLLECTOR_TOKEN: secrets.collectorToken,
      TURBALANCE_COLLECTOR_HMAC_SECRET: secrets.collectorHmacSecret
    }
  });
  return {
    name: group.name,
    status: result.status === 0 ? "applied" : "failed",
    reportPath,
    stdout: redactText(result.stdout).slice(-4000),
    stderr: redactText(result.stderr).slice(-4000)
  };
}

function restartController() {
  const controllerEnvPath = path.join(secretsDir, "controller-secure.env");
  if (!fs.existsSync(controllerEnvPath)) {
    return {
      status: "failed",
      error: "missing controller-secure.env"
    };
  }

  const logsDir = path.join(root, "build", "logs");
  fs.mkdirSync(logsDir, { recursive: true });

  const apiPids = findPids(/uvicorn\s+api_server\.app:app/);
  const collectorPids = findPids(/uvicorn\s+collector_gateway\.app:app/);
  const stopped = {
    api: stopPids(apiPids),
    collector: stopPids(collectorPids)
  };
  const controllerEnv = parseEnvFile(controllerEnvPath);

  const collector = startDetachedService({
    name: "collector-gateway",
    module: "collector_gateway.app:app",
    port: 8801,
    logPath: path.join(logsDir, "collector-gateway.log"),
    pidPath: path.join(logsDir, "collector-gateway.pid"),
    pythonPath: [
      path.join(root, "services", "collector-gateway"),
      path.join(root, "services", "raw-writer"),
      path.join(root, "services", "platform_common")
    ],
    controllerEnv
  });
  const api = startDetachedService({
    name: "api-server",
    module: "api_server.app:app",
    port: 8080,
    logPath: path.join(logsDir, "api-server.log"),
    pidPath: path.join(logsDir, "api-server.pid"),
    pythonPath: [
      path.join(root, "services", "api-server"),
      path.join(root, "services", "duckdb-query-service"),
      path.join(root, "services", "raw-writer"),
      path.join(root, "services", "platform_common"),
      path.join(root, "services", "alert-engine")
    ],
    controllerEnv
  });

  sleepMs(2000);
  const running = {
    api: isProcessAlive(api.pid),
    collector: isProcessAlive(collector.pid)
  };
  return {
    status: running.api && running.collector ? "restarted" : "failed",
    stopped,
    started: { api, collector },
    running
  };
}

function findPids(pattern) {
  const result = spawnSync("ps", ["-eo", "pid=,cmd="], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    timeout: 10000
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      return match ? { pid: Number(match[1]), command: match[2] } : null;
    })
    .filter(Boolean)
    .filter((entry) => entry.pid !== process.pid && pattern.test(entry.command))
    .map((entry) => entry.pid);
}

function stopPids(pids) {
  const uniquePids = [...new Set(pids.filter((pid) => Number.isInteger(pid) && pid > 0))];
  uniquePids.forEach((pid) => {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Process already exited.
    }
  });
  sleepMs(1000);
  uniquePids.forEach((pid) => {
    if (!isProcessAlive(pid)) return;
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Process already exited.
    }
  });
  return uniquePids.map((pid) => ({ pid, aliveAfterStop: isProcessAlive(pid) }));
}

function startDetachedService({ name, module, port, logPath, pidPath, pythonPath, controllerEnv }) {
  const outFd = fs.openSync(logPath, "a");
  const errFd = fs.openSync(logPath, "a");
  try {
    const child = spawn(".venv-lakehouse/bin/python", [
      "-m",
      "uvicorn",
      module,
      "--host",
      "0.0.0.0",
      "--port",
      String(port)
    ], {
      cwd: root,
      detached: true,
      stdio: ["ignore", outFd, errFd],
      env: {
        ...process.env,
        ...controllerEnv,
        TURBALANCE_PRODUCT_VERSION: config.product.version,
        TURBALANCE_DEPLOYMENT_ENVIRONMENT: config.product.environment,
        PYTHONPATH: pythonPath.join(":")
      }
    });
    child.unref();
    fs.writeFileSync(pidPath, `${child.pid}\n`);
    return { name, pid: child.pid, port, pidPath: path.relative(root, pidPath), logPath: path.relative(root, logPath) };
  } finally {
    fs.closeSync(outFd);
    fs.closeSync(errFd);
  }
}

function parseEnvFile(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .reduce((env, rawLine) => {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) return env;
      const index = line.indexOf("=");
      if (index <= 0) return env;
      const key = line.slice(0, index).trim();
      env[key] = parseEnvValue(line.slice(index + 1).trim());
      return env;
    }, {});
}

function parseEnvValue(value) {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\(["'\\nrt])/g, (_, char) => {
      if (char === "n") return "\n";
      if (char === "r") return "\r";
      if (char === "t") return "\t";
      return char;
    });
  }
  return value;
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

async function collectorReadyCheck() {
  const response = await requestJson(collectorBaseUrl("/ready"));
  const auth = response.body?.auth || {};
  return {
    name: "collector-auth-ready",
    status: response.statusCode === 200 && auth.bearerToken === true && auth.hmac === true ? "pass" : "fail",
    httpStatus: response.statusCode,
    auth
  };
}

async function apiReadyCheck() {
  const response = await requestJson(`${config.controller.apiUrl.replace(/\/+$/, "")}/ready`);
  return {
    name: "api-auth-ready",
    status: response.statusCode === 200 && response.body?.authRequired === true ? "pass" : "fail",
    httpStatus: response.statusCode,
    authRequired: Boolean(response.body?.authRequired)
  };
}

async function apiAuthChallengeCheck(secrets) {
  const baseUrl = config.controller.apiUrl.replace(/\/+$/, "");
  const unauthenticated = await requestJson(`${baseUrl}/v1/me`, { allowError: true });
  const authenticated = await requestJson(`${baseUrl}/v1/me`, {
    headers: { Authorization: `Bearer ${secrets.apiViewerToken}` },
    allowError: true
  });
  return {
    name: "api-auth-challenge",
    status: unauthenticated.statusCode === 401 && authenticated.statusCode === 200 ? "pass" : "fail",
    unauthenticatedStatus: unauthenticated.statusCode,
    authenticatedStatus: authenticated.statusCode,
    authenticatedBody: authenticated.body ? {
      role: authenticated.body.role,
      tenantId: authenticated.body.tenantId,
      authRequired: authenticated.body.authRequired
    } : null
  };
}

function verifyCollectorPush(secrets) {
  const result = spawnSync(process.execPath, [
    "scripts/push-live-machine-telemetry.js",
    "--collector-url",
    config.controller.collectorUrl,
    "--host-url",
    config.controller.staticUrl,
    "--agent-id",
    "controller-security-verify",
    "--host-id",
    "NUC14E-security-verify",
    "--fast-refresh",
    "1",
    "--ollama-probe",
    "0"
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: 60000,
    env: {
      ...process.env,
      TURBALANCE_COLLECTOR_TOKEN: secrets.collectorToken,
      TURBALANCE_COLLECTOR_HMAC_SECRET: secrets.collectorHmacSecret,
      TURBALANCE_PRODUCT_VERSION: config.product.version
    }
  });
  const stdout = redactText(result.stdout).slice(-4000);
  return {
    name: "collector-authenticated-push",
    status: result.status === 0 && !/collector returned 401|invalid collector|missing collector/i.test(`${stdout}\n${result.stderr}`) ? "pass" : "fail",
    exitStatus: result.status ?? -1,
    stdout,
    stderr: redactText(result.stderr).slice(-4000)
  };
}

function collectorBaseUrl(suffix) {
  const target = new URL(config.controller.collectorUrl);
  return `${target.protocol}//${target.host}${suffix}`;
}

function requestJson(url, options = {}) {
  const target = new URL(url);
  const client = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(target, {
      method: "GET",
      timeout: timeoutMs,
      headers: options.headers || {}
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        const parsed = parseJson(body);
        if (!options.allowError && (response.statusCode < 200 || response.statusCode >= 300)) {
          reject(new Error(`${url} returned ${response.statusCode}: ${body}`));
          return;
        }
        resolve({ statusCode: response.statusCode || 0, body: parsed, rawBody: body });
      });
    });
    request.on("timeout", () => request.destroy(new Error(`${url} timed out after ${timeoutMs}ms`)));
    request.on("error", reject);
    request.end();
  });
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function redactText(value) {
  let text = String(value || "");
  for (const secret of [
    safeRead(path.join(secretsDir, "collector-token")),
    safeRead(path.join(secretsDir, "collector-hmac-secret")),
    safeRead(path.join(secretsDir, "api-viewer-token")),
    safeRead(path.join(secretsDir, "api-admin-token"))
  ].filter(Boolean)) {
    text = text.split(secret.trim()).join("[REDACTED]");
  }
  return text.replace(/(TOKEN|SECRET|PASSWORD|PRIVATE|API_KEY|HMAC|BEARER|AUTHORIZATION|KEY)=([^\n\r]*)/gi, "$1=[REDACTED]");
}

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function writeReport(report) {
  const redacted = JSON.parse(redactText(JSON.stringify(report)));
  const body = `${JSON.stringify(redacted, null, 2)}\n`;
  if (outPath) {
    const fullPath = path.resolve(root, outPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, body);
  }
  process.stdout.write(body);
}
