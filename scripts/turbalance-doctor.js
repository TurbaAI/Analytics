#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  parseArgs,
  readProductConfig,
  redactConfig
} = require("../lib/product-config");

const root = path.join(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const config = readProductConfig(args.config || "ops/turbalance-product.example.json");
const remoteChecks = Boolean(args["remote-checks"]);
const noFail = Boolean(args["no-fail"]);
const timeoutMs = Number(args.timeout || 5000);

main().catch((error) => {
  const report = {
    status: "failed",
    generatedAt: new Date().toISOString(),
    error: error?.stack || String(error)
  };
  writeReport(report);
  if (!noFail) process.exitCode = 1;
});

async function main() {
  const checks = [];
  checks.push(await httpCheck("static-dashboard", config.controller.staticUrl, { expectText: "turbalance Analytics" }));
  checks.push(await httpCheck("product-api-health", `${config.controller.apiUrl}/health`));
  checks.push(await httpCheck("product-api-ready", `${config.controller.apiUrl}/ready`));
  checks.push(await httpCheck("product-api-version", `${config.controller.apiUrl}/version`));
  checks.push(await httpCheck("collector-health", collectorBaseUrl(config.controller.collectorUrl, "/health")));
  checks.push(await httpCheck("collector-ready", collectorBaseUrl(config.controller.collectorUrl, "/ready")));
  checks.push(await httpCheck("collector-version", collectorBaseUrl(config.controller.collectorUrl, "/version")));
  checks.push(await httpCheck("prometheus-ready", `${config.observability.prometheusUrl.replace(/\/$/, "")}/-/ready`, { expectText: "Ready" }));
  checks.push(await prometheusTargetsCheck(config.observability.prometheusUrl));
  checks.push(await httpCheck("grafana-health", `${config.observability.grafanaUrl.replace(/\/$/, "")}/api/health`));
  if (config.security.tlsMode !== "lab-http") {
    checks.push(...(await productEdgeChecks()));
  }
  checks.push(localFileCheck("live-machine-bundle", path.resolve(root, config.controller.remoteRoot === root ? config.controller.liveBundlePath : config.controller.liveBundlePath)));
  checks.push(...controllerProcessChecks(config));
  if (remoteChecks) {
    for (const machine of config.fleet.machines.filter((item) => item.enabled && item.remote)) {
      checks.push(remoteAgentCheck(machine));
    }
  }

  const status = aggregateStatus(checks);
  const report = {
    status,
    generatedAt: new Date().toISOString(),
    product: config.product,
    controller: {
      host: config.controller.host,
      staticUrl: config.controller.staticUrl,
      apiUrl: config.controller.apiUrl,
      collectorUrl: config.controller.collectorUrl,
      grafanaUrl: config.observability.grafanaUrl,
      prometheusUrl: config.observability.prometheusUrl
    },
    fleet: {
      configuredMachines: config.fleet.machines.length,
      enabledMachines: config.fleet.machines.filter((machine) => machine.enabled).length
    },
    checks,
    config: redactConfig(config)
  };
  writeReport(report);
  if (status === "fail" && !noFail) process.exitCode = 1;
}

async function httpCheck(name, url, options = {}) {
  const startedAt = Date.now();
  try {
    const response = await requestText(url, timeoutMs, options.maxBytes || 256 * 1024);
    const ok = response.statusCode >= 200 && response.statusCode < 300;
    const bodyMatches = options.expectText ? response.body.includes(options.expectText) : true;
    return {
      name,
      type: "http",
      status: ok && bodyMatches ? "pass" : "fail",
      target: url,
      httpStatus: response.statusCode,
      latencyMs: Date.now() - startedAt,
      detail: ok && bodyMatches ? "reachable" : `unexpected response${options.expectText ? `, missing ${options.expectText}` : ""}`,
      sample: response.body.slice(0, 500)
    };
  } catch (error) {
    return {
      name,
      type: "http",
      status: "fail",
      target: url,
      latencyMs: Date.now() - startedAt,
      detail: error?.message || String(error)
    };
  }
}

async function prometheusTargetsCheck(prometheusUrl) {
  const target = `${prometheusUrl.replace(/\/$/, "")}/api/v1/targets?state=active`;
  try {
    const response = await requestText(target, timeoutMs, 1024 * 1024);
    const payload = JSON.parse(response.body);
    const activeTargets = payload?.data?.activeTargets || [];
    const down = activeTargets
      .filter((item) => item.health !== "up")
      .map((item) => ({
        job: item.labels?.job || "",
        instance: item.labels?.instance || "",
        health: item.health || "",
        error: item.lastError || ""
      }));
    return {
      name: "prometheus-targets",
      type: "prometheus",
      status: response.statusCode >= 200 && response.statusCode < 300 && !down.length ? "pass" : "fail",
      target,
      httpStatus: response.statusCode,
      detail: `${activeTargets.length} active targets, ${down.length} down`,
      activeTargets: activeTargets.length,
      down
    };
  } catch (error) {
    return {
      name: "prometheus-targets",
      type: "prometheus",
      status: "fail",
      target,
      detail: error?.message || String(error)
    };
  }
}

function requestText(url, timeout, maxBytes = 8192) {
  const target = new URL(url);
  const client = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(target, { method: "GET", timeout }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > maxBytes) request.destroy(new Error(`response exceeds ${maxBytes} bytes`));
      });
      response.on("end", () => resolve({ statusCode: response.statusCode || 0, headers: response.headers, body }));
    });
    request.on("timeout", () => request.destroy(new Error(`timed out after ${timeout}ms`)));
    request.on("error", reject);
    request.end();
  });
}

async function productEdgeChecks() {
  const ca = readOptional(path.resolve(root, config.security.tlsCaFile));
  const cert = readOptional(path.resolve(root, config.security.collectorClientCertFile));
  const key = readOptional(path.resolve(root, config.security.collectorClientKeyFile));
  const edgeBase = `https://${config.controller.host}:${config.security.edgeHttpsPort}`;
  const mtlsBase = `https://${config.controller.host}:${config.security.collectorMtlsPort}`;
  return [
    await httpsCheck("product-edge-dashboard", `${edgeBase}/`, { ca, expectText: "turbalance Analytics" }),
    await httpsCheck("product-edge-api-ready", `${edgeBase}/api/ready`, { ca, expectText: "ready" }),
    await httpsCheck("product-edge-collector-mtls-ready", `${mtlsBase}/ready`, { ca, cert, key, expectText: "ready" }),
    await httpsRejectsWithoutClientCert(`${mtlsBase}/ready`, ca)
  ];
}

async function httpsRejectsWithoutClientCert(url, ca) {
  const check = await httpsCheck("product-edge-collector-mtls-rejects-missing-cert", url, { ca, expectText: "ready" });
  if (check.status === "fail") return { ...check, status: "pass", detail: `rejected without client certificate: ${check.detail}` };
  return { ...check, status: "fail", detail: "mTLS endpoint accepted a request without a client certificate" };
}

function httpsCheck(name, url, options = {}) {
  const startedAt = Date.now();
  if (!options.ca) {
    return Promise.resolve({ name, type: "https", status: "fail", target: url, detail: "missing product edge CA" });
  }
  const target = new URL(url);
  return new Promise((resolve) => {
    const request = https.request({
      method: "GET",
      hostname: target.hostname,
      port: target.port || 443,
      path: `${target.pathname}${target.search}`,
      ca: options.ca,
      cert: options.cert,
      key: options.key,
      ...servernameOption(target.hostname),
      timeout: timeoutMs
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > 256 * 1024) request.destroy(new Error("response too large"));
      });
      response.on("end", () => {
        const ok = response.statusCode >= 200 && response.statusCode < 300;
        const bodyMatches = options.expectText ? body.includes(options.expectText) : true;
        resolve({
          name,
          type: "https",
          status: ok && bodyMatches ? "pass" : "fail",
          target: url,
          httpStatus: response.statusCode || 0,
          latencyMs: Date.now() - startedAt,
          detail: ok && bodyMatches ? "reachable" : "unexpected response"
        });
      });
    });
    request.on("timeout", () => request.destroy(new Error(`timed out after ${timeoutMs}ms`)));
    request.on("error", (error) => resolve({ name, type: "https", status: "fail", target: url, latencyMs: Date.now() - startedAt, detail: error.message }));
    request.end();
  });
}

function readOptional(filePath) {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

function servernameOption(hostname) {
  return /^\d+\.\d+\.\d+\.\d+$/.test(hostname) ? {} : { servername: hostname };
}

function collectorBaseUrl(collectorUrl, suffix) {
  const target = new URL(collectorUrl);
  return `${target.protocol}//${target.host}${suffix}`;
}

function localFileCheck(name, filePath) {
  try {
    const stat = fs.statSync(filePath);
    const ageMs = Date.now() - stat.mtimeMs;
    let hostCount = 0;
    try {
      const bundle = JSON.parse(fs.readFileSync(filePath, "utf8"));
      hostCount = new Set((bundle?.ingestion?.runs || []).map((run) => run.sourceContext?.hostname).filter(Boolean)).size;
    } catch {
      // Existence and freshness still matter when the bundle is being atomically swapped.
    }
    return {
      name,
      type: "file",
      status: ageMs <= 120000 ? "pass" : "warn",
      target: filePath,
      detail: `${Math.round(ageMs / 1000)}s old, ${hostCount} hosts`,
      ageMs,
      hostCount
    };
  } catch (error) {
    return {
      name,
      type: "file",
      status: "warn",
      target: filePath,
      detail: error?.message || String(error)
    };
  }
}

function controllerProcessChecks(config) {
  const checks = [];
  for (const service of Object.values(config.controller.services)) {
    if (!service.container) continue;
    const result = run("docker", ["inspect", "-f", "{{.State.Status}}", service.container]);
    checks.push({
      name: `container-${service.container}`,
      type: "container",
      status: result.status === 0 && result.stdout.trim() === "running" ? "pass" : "warn",
      target: service.container,
      detail: result.status === 0 ? result.stdout.trim() : (result.stderr || "not found").trim()
    });
  }
  return checks;
}

function remoteAgentCheck(machine) {
  const command = [
    "set -e",
    "printf 'hostname='; hostname",
    "system_agent=$(systemctl is-active turbalance-live-machine-agent.service 2>/dev/null || true)",
    "user_agent=$(systemctl --user is-active turbalance-live-machine-agent.service 2>/dev/null || true)",
    "case \"$system_agent,$user_agent\" in *active*) agent=active ;; *) agent=inactive ;; esac",
    "printf 'agent='; echo \"$agent\"",
    "printf 'system_agent='; echo \"${system_agent:-unknown}\"",
    "printf 'user_agent='; echo \"${user_agent:-unknown}\"",
    "system_benchmark=$(systemctl is-active turbalance-machine-benchmark.timer 2>/dev/null || true)",
    "user_benchmark=$(systemctl --user is-active turbalance-machine-benchmark.timer 2>/dev/null || true)",
    "case \"$system_benchmark,$user_benchmark\" in *active*) benchmark=active ;; *) benchmark=inactive ;; esac",
    "printf 'benchmark='; echo \"$benchmark\"",
    "printf 'system_benchmark='; echo \"${system_benchmark:-unknown}\"",
    "printf 'user_benchmark='; echo \"${user_benchmark:-unknown}\"",
    "if [ -s /etc/turbalance/live-machine-agent.env ]; then env_path=/etc/turbalance/live-machine-agent.env; elif [ -s \"$HOME/.config/turbalance/live-machine-agent.env\" ]; then env_path=\"$HOME/.config/turbalance/live-machine-agent.env\"; else env_path=missing; fi",
    "printf 'env='; test \"$env_path\" != missing && echo present || echo missing",
    "printf 'env_path='; echo \"$env_path\"",
    "printf 'spool='; { find /var/spool/turbalance/live-machine-agent \"$HOME/.local/state/turbalance/live-machine-agent/spool\" -type f 2>/dev/null || true; } | wc -l"
  ].join("; ");
  const result = run("ssh", [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=8",
    "-o", "StrictHostKeyChecking=accept-new",
    machine.remote,
    command
  ]);
  const output = result.stdout || "";
  const agentActive = /agent=active/.test(output);
  const envPresent = /env=present/.test(output);
  return {
    name: `agent-${machine.id}`,
    type: "remote-agent",
    status: result.status === 0 && agentActive && envPresent ? "pass" : "warn",
    target: machine.remote,
    role: machine.role,
    detail: result.status === 0 ? output.trim() : (result.stderr || "ssh failed").trim()
  };
}

function run(command, commandArgs) {
  return spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024
  });
}

function aggregateStatus(checks) {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "warn")) return "warn";
  return "pass";
}

function writeReport(report) {
  const body = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) {
    const fullPath = path.resolve(root, args.out);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, body);
  }
  process.stdout.write(body);
}
