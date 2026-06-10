#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  parseArgs,
  readProductConfig,
  renderEnv
} = require("../lib/product-config");

const root = path.join(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const configPath = args.config || "ops/turbalance-product.example.json";
const config = readProductConfig(configPath);
const action = String(args.action || "status").toLowerCase();
const apply = Boolean(args.apply);
const mode = normalizeMode(args.mode || "user");
const restart = args.restart === undefined ? true : flagArg(args.restart);
const cleanupOrphans = args["cleanup-orphans"] === undefined ? true : flagArg(args["cleanup-orphans"]);
const enableLinger = args["enable-linger"] === undefined ? mode === "user" : flagArg(args["enable-linger"]);
const timeoutMs = Number(args.timeout || 10000);
const envPath = args["env-path"] || defaultEnvPath();
const unitDir = args["unit-dir"] || defaultUnitDir();
const pythonBin = args.python || defaultPythonBin();
const nodeBin = args.node || "/usr/bin/env node";
const gpustatBin = args["gpustat-bin"] || defaultGpustatBin();
const lakeRoot = args["lake-root"] || config.controller.lakeRoot;

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({
    status: "failed",
    action,
    error: error?.stack || String(error)
  }, null, 2)}\n`);
  process.exitCode = 1;
});

async function main() {
  if (!["install", "restart", "stop", "status"].includes(action)) {
    throw new Error(`unsupported action ${action}; use install, restart, stop, or status`);
  }
  const plan = buildPlan();
  let results = [];
  if (apply) {
    results = applyPlan(plan);
  }
  const checks = await statusChecks();
  const report = {
    status: apply ? (results.every((step) => step.ok) ? "applied" : "failed") : "dry-run",
    action,
    mode,
    root,
    envPath,
    unitDir,
    restart,
    cleanupOrphans,
    enableLinger,
    plan: redactPlan(plan),
    results,
    checks
  };
  if (report.status === "failed") process.exitCode = 1;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function buildPlan() {
  const units = controllerUnits();
  if (action === "status") return [];
  const plan = [];
  if (action === "install") {
    plan.push({ step: "prepare-controller-service-dirs", command: prepareCommand() });
    plan.push({ step: "install-controller-env", command: installTextCommand(envPath, renderEnv(controllerEnv()), "600") });
    for (const unit of units) {
      plan.push({
        step: `install-${unit.name}`,
        command: installTextCommand(path.posix.join(unitDir, unit.name), unit.content, "644")
      });
    }
    if (mode === "user" && enableLinger) {
      plan.push({ step: "enable-systemd-user-linger", command: tolerantCommand(`loginctl enable-linger ${shellQuote(os.userInfo().username)}`) });
    }
    plan.push({ step: "systemd-daemon-reload", command: systemd("daemon-reload") });
  }
  if (["install", "restart", "stop"].includes(action)) {
    for (const unit of units) {
      plan.push({ step: `stop-${unit.name}`, command: tolerantSystemd(`stop ${unit.name}`) });
    }
    if (cleanupOrphans) {
      plan.push({ step: "stop-orphan-controller-processes", command: cleanupOrphanCommand() });
    }
  }
  if (["install", "restart"].includes(action) && restart) {
    for (const unit of units) {
      plan.push({ step: `enable-${unit.name}`, command: systemd(`enable ${unit.name}`) });
      plan.push({ step: `start-${unit.name}`, command: systemd(`restart ${unit.name}`) });
    }
  }
  return plan;
}

function applyPlan(plan) {
  const results = [];
  for (const item of plan) {
    const result = spawnSync("sh", ["-lc", item.command], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 60000
    });
    results.push({
      step: item.step,
      ok: result.status === 0,
      status: result.status ?? -1,
      signal: result.signal || "",
      stdout: redact(result.stdout).slice(-2000),
      stderr: redact(result.stderr).slice(-4000)
    });
    if (result.status !== 0) break;
  }
  return results;
}

function controllerUnits() {
  return [
    {
      name: "turbalance-product-dashboard.service",
      content: unit("Turbalance product static dashboard", [
        `EnvironmentFile=-${envPath}`,
        `WorkingDirectory=${root}`,
        `ExecStart=${pythonBin} -m http.server ${servicePort("staticDashboard", 8000)} --bind 0.0.0.0`
      ], { after: "network-online.target" })
    },
    {
      name: "turbalance-product-collector.service",
      content: unit("Turbalance collector gateway", [
        `EnvironmentFile=-${envPath}`,
        `Environment=PYTHONPATH=${[
          path.join(root, "services", "collector-gateway"),
          path.join(root, "services", "raw-writer"),
          path.join(root, "services", "platform_common")
        ].join(path.delimiter)}`,
        `WorkingDirectory=${root}`,
        `ExecStart=${pythonBin} -m uvicorn collector_gateway.app:app --host 0.0.0.0 --port ${servicePort("collector", 8801)}`
      ], { after: "network-online.target" })
    },
    {
      name: "turbalance-product-api.service",
      content: unit("Turbalance product API", [
        `EnvironmentFile=-${envPath}`,
        `Environment=PYTHONPATH=${[
          path.join(root, "services", "api-server"),
          path.join(root, "services", "duckdb-query-service"),
          path.join(root, "services", "raw-writer"),
          path.join(root, "services", "platform_common"),
          path.join(root, "services", "alert-engine")
        ].join(path.delimiter)}`,
        `WorkingDirectory=${root}`,
        `ExecStart=${pythonBin} -m uvicorn api_server.app:app --host 0.0.0.0 --port ${servicePort("api", 8080)}`
      ])
    },
    {
      name: "turbalance-product-live-fleet.service",
      content: unit("Turbalance live fleet bundle loop", [
        `EnvironmentFile=-${envPath}`,
        `WorkingDirectory=${root}`,
        `ExecStart=${nodeBin} ${path.join(root, "scripts", "run-live-lakehouse-fleet.js")} ${liveFleetArgs().join(" ")}`
      ])
    }
  ];
}

function unit(description, serviceLines, { after = "network-online.target turbalance-product-collector.service" } = {}) {
  return [
    "[Unit]",
    `Description=${description}`,
    "Documentation=file:" + path.join(root, "docs", "customer-productization.md"),
    "Wants=network-online.target",
    `After=${after}`,
    "",
    "[Service]",
    "Type=simple",
    ...serviceLines,
    "Restart=always",
    "RestartSec=5",
    "TimeoutStopSec=20",
    "KillSignal=SIGINT",
    "NoNewPrivileges=true",
    "PrivateTmp=true",
    "",
    "[Install]",
    "WantedBy=" + (mode === "user" ? "default.target" : "multi-user.target"),
    ""
  ].join("\n");
}

function controllerEnv() {
  return {
    TURBALANCE_PRODUCT_NAME: config.product.name,
    TURBALANCE_PRODUCT_VERSION: config.product.version,
    TURBALANCE_DEPLOYMENT_ENVIRONMENT: config.product.environment,
    TURBALANCE_TENANT_ID: config.fleet.tenantId,
    TURBALANCE_CONTROLLER_HOST: config.controller.host,
    TURBALANCE_STATIC_URL: config.controller.staticUrl,
    TURBALANCE_MACHINE_DEMO_URL: config.controller.staticUrl,
    TURBALANCE_API_URL: config.controller.apiUrl,
    TURBALANCE_COLLECTOR_URL: config.controller.collectorUrl,
    TURBALANCE_LAKE_ROOT: lakeRoot,
    TURBALANCE_LIVE_MACHINE_BUNDLE: config.controller.liveBundlePath,
    TURBALANCE_LIVE_FLEET_LOOP_MS: config.controller.loopMs,
    TURBALANCE_TRANSFORM_INTERVAL_MS: config.controller.transformIntervalMs,
    TURBALANCE_RETENTION_DAYS: config.controller.dataRetentionDays,
    TURBALANCE_API_REQUIRE_AUTH: config.security.requireApiAuth ? "true" : "false",
    TURBALANCE_API_TOKENS_FILE: config.security.apiTokensFile,
    TURBALANCE_CORS_ORIGINS: config.security.allowedCorsOrigins.join(","),
    TURBALANCE_COLLECTOR_TOKEN: config.security.collectorToken,
    TURBALANCE_COLLECTOR_TOKEN_FILE: config.security.collectorTokenFile,
    TURBALANCE_COLLECTOR_HMAC_SECRET: config.security.collectorHmacSecret,
    TURBALANCE_COLLECTOR_HMAC_SECRET_FILE: config.security.collectorHmacSecretFile,
    TURBALANCE_GRAFANA_PUBLIC_URL: config.observability.grafanaUrl,
    TURBALANCE_PROMETHEUS_URL: config.observability.prometheusUrl,
    TURBALANCE_OTEL_EXPORTER_OTLP_ENDPOINT: config.observability.otelEndpoint,
    TURBALANCE_GPU_BACKEND: "auto",
    TURBALANCE_GPUSTAT_BIN: gpustatBin,
    TURBALANCE_SKIP_LAKEHOUSE_WRITE: "1",
    TURBALANCE_INCLUDE_LOCAL_FLEET_HOST: "1",
    TURBALANCE_PI_FLEET: config.fleet.includePiFleet ? "1" : "0",
    TURBALANCE_PI_BENCHMARKS: "1"
  };
}

function liveFleetArgs() {
  const remotes = config.fleet.machines
    .filter((machine) => machine.enabled && machine.role === "spark" && machine.remote)
    .flatMap((machine) => ["--remote", shellQuote(machine.remote)]);
  return [
    "--out", shellQuote(config.controller.liveBundlePath),
    "--lake-root", shellQuote(lakeRoot),
    "--host-url", shellQuote(config.controller.staticUrl),
    "--include-local",
    config.fleet.includePiFleet ? "--pi-fleet" : "",
    "--pi-benchmarks",
    "--skip-lakehouse",
    "--gpu-backend", "auto",
    gpustatBin ? `--gpustat-bin ${shellQuote(gpustatBin)}` : "",
    "--loop-ms", String(config.controller.loopMs),
    ...remotes
  ].filter(Boolean);
}

async function statusChecks() {
  const unitNames = controllerUnits().map((item) => item.name);
  const checks = unitNames.map((name) => ({
    name,
    active: systemctlText(`is-active ${name}`).trim() || "unknown",
    enabled: systemctlText(`is-enabled ${name}`).trim() || "unknown"
  }));
  checks.push(await httpCheck("static-dashboard", config.controller.staticUrl));
  checks.push(await httpCheck("api-ready", `${config.controller.apiUrl.replace(/\/+$/, "")}/ready`));
  checks.push(await httpCheck("collector-ready", collectorReadyUrl()));
  checks.push({
    name: "user-linger",
    active: mode === "user" ? userLingerState() : "system-mode",
    enabled: mode === "user" && userLingerState() === "yes" ? "boot-persistent" : (mode === "user" ? "enable-linger-for-boot" : "not-needed")
  });
  return checks;
}

function httpCheck(name, url) {
  const target = new URL(url);
  const client = target.protocol === "https:" ? https : http;
  return new Promise((resolve) => {
    const request = client.request(target, { method: "GET", timeout: timeoutMs }, (response) => {
      response.resume();
      response.on("end", () => resolve({ name, active: String(response.statusCode || 0), enabled: response.statusCode && response.statusCode < 500 ? "reachable" : "unhealthy" }));
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", (error) => resolve({ name, active: "error", enabled: error.message }));
    request.end();
  });
}

function prepareCommand() {
  const dirs = [
    unitDir,
    path.posix.dirname(envPath),
    path.join(root, "build", "logs"),
    path.join(root, "build", "demo")
  ];
  return asPrivileged(`mkdir -p ${dirs.map(shellQuote).join(" ")}`);
}

function installTextCommand(filePath, content, modeValue) {
  const encoded = Buffer.from(content, "utf8").toString("base64");
  const write = `mkdir -p ${shellQuote(path.posix.dirname(filePath))} && printf %s ${shellQuote(encoded)} | base64 -d > ${shellQuote(filePath)} && chmod ${shellQuote(modeValue)} ${shellQuote(filePath)}`;
  return asPrivileged(write);
}

function cleanupOrphanCommand() {
  const patterns = [
    /uvicorn\s+api_server\.app:app/,
    /uvicorn\s+collector_gateway\.app:app/,
    /http\.server\s+8000/,
    /run-live-lakehouse-fleet\.js/
  ];
  const pids = findPids(patterns);
  if (!pids.length) return "true";
  return `kill ${pids.join(" ")} 2>/dev/null || true; sleep 1; kill -9 ${pids.join(" ")} 2>/dev/null || true`;
}

function findPids(patterns) {
  const result = spawnSync("ps", ["-eo", "pid=,cmd="], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024
  });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/)
    .map((line) => line.trim().match(/^(\d+)\s+(.+)$/))
    .filter(Boolean)
    .map((match) => ({ pid: Number(match[1]), command: match[2] }))
    .filter((entry) => entry.pid !== process.pid && patterns.some((pattern) => pattern.test(entry.command)))
    .map((entry) => entry.pid);
}

function systemd(command) {
  return mode === "user" ? `systemctl --user ${command}` : `sudo -n systemctl ${command}`;
}

function tolerantSystemd(command) {
  return `${systemd(command)} || true`;
}

function tolerantCommand(command) {
  return `${command} || true`;
}

function systemctlText(command) {
  const result = spawnSync("sh", ["-lc", `${systemd(command)} 2>/dev/null || true`], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 10000
  });
  return result.stdout || "";
}

function asPrivileged(command) {
  return mode === "user" ? command : `sudo -n sh -lc ${shellQuote(command)}`;
}

function servicePort(name, fallback) {
  return config.controller.services[name]?.port || fallback;
}

function collectorReadyUrl() {
  const target = new URL(config.controller.collectorUrl);
  return `${target.protocol}//${target.host}/ready`;
}

function defaultEnvPath() {
  return mode === "user"
    ? path.posix.join(os.homedir(), ".config", "turbalance", "product-controller.env")
    : "/etc/turbalance/product-controller.env";
}

function defaultUnitDir() {
  return mode === "user"
    ? path.posix.join(os.homedir(), ".config", "systemd", "user")
    : "/etc/systemd/system";
}

function defaultPythonBin() {
  const venvPython = path.join(root, ".venv-lakehouse", "bin", "python");
  return fs.existsSync(venvPython) ? venvPython : "/usr/bin/env python3";
}

function defaultGpustatBin() {
  const candidate = path.posix.join(os.homedir(), ".local", "share", "turbalance", "gpustat-venv", "bin", "gpustat");
  return fs.existsSync(candidate) ? candidate : "";
}

function userLingerState() {
  const result = spawnSync("loginctl", ["show-user", os.userInfo().username, "-p", "Linger"], {
    cwd: root,
    encoding: "utf8",
    timeout: 10000
  });
  return result.status === 0 ? result.stdout.trim().replace(/^Linger=/, "") : "unknown";
}

function redactPlan(plan) {
  return plan.map((item) => ({
    step: item.step,
    command: redactCommand(item)
  }));
}

function redactCommand(item) {
  if (item.step.startsWith("install-")) {
    return redact(item.command).replace(/printf %s [A-Za-z0-9+/=]+ \| base64 -d/g, "printf %s [REDACTED_BASE64] | base64 -d");
  }
  return redact(item.command);
}

function redact(value) {
  return String(value || "").replace(/(TOKEN|SECRET|PASSWORD|PRIVATE|API_KEY|HMAC|BEARER|AUTHORIZATION|KEY)=([^\n\r ]*)/gi, "$1=[REDACTED]");
}

function normalizeMode(value) {
  return String(value || "user").toLowerCase() === "system" ? "system" : "user";
}

function flagArg(value) {
  return value === true || value === "1" || value === "true" || value === "yes" || value === "on";
}

function shellQuote(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:@,%+=-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}
