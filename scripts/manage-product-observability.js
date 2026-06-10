#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  parseArgs,
  readProductConfig
} = require("../lib/product-config");

const root = path.join(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const configPath = args.config || "ops/turbalance-product.example.json";
const config = readProductConfig(configPath);
const action = String(args.action || "status").toLowerCase();
const apply = Boolean(args.apply);
const timeoutMs = Number(args.timeout || 10000);
const secureMode = String(args.secure || "auto").toLowerCase();
const tokenFile = path.resolve(root, args["prometheus-api-token-file"] || config.observability.prometheusApiTokenFile || defaultPrometheusApiTokenFile());
const runtimeTokenFile = path.resolve(root, args["prometheus-runtime-token-file"] || path.join("build", "product-runtime", "prometheus-secrets", "api-viewer-token"));

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({
    status: "failed",
    action,
    error: error?.stack || String(error)
  }, null, 2)}\n`);
  process.exitCode = 1;
});

async function main() {
  if (!["up", "restart", "stop", "status"].includes(action)) {
    throw new Error(`unsupported action ${action}; use up, restart, stop, or status`);
  }
  const securePrometheus = shouldUseSecurePrometheus();
  const composeFiles = composeFileArgs(securePrometheus);
  const plan = buildPlan(composeFiles, securePrometheus);
  let results = [];
  if (apply) {
    results = applyPlan(plan);
  }
  const checks = await statusChecks();
  const report = {
    status: apply ? (results.every((step) => step.ok) ? "applied" : "failed") : "dry-run",
    action,
    secureMode,
    securePrometheus,
    tokenFile: redactPath(tokenFile),
    runtimeTokenFile: redactPath(runtimeTokenFile),
    composeFiles: composeFiles.map((item) => path.relative(root, item)),
    plan: plan.map((item) => ({ step: item.step, command: redactCommand(item.command) })),
    results,
    checks
  };
  if (report.status === "failed") process.exitCode = 1;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function buildPlan(composeFiles, securePrometheus) {
  if (action === "status") return [];
  const envPrefix = securePrometheus
    ? `TURBALANCE_PROMETHEUS_API_TOKEN_FILE=${shellQuote(runtimeTokenFile)} `
    : "";
  const compose = `${envPrefix}docker compose ${composeFiles.flatMap((file) => ["-f", shellQuote(file)]).join(" ")}`;
  const plan = [];
  if (securePrometheus && ["up", "restart"].includes(action)) {
    plan.push({ step: "prepare-prometheus-api-token-secret", command: preparePrometheusTokenCommand() });
  }
  if (action === "up") {
    plan.push({ step: "start-observability-stack", command: `${compose} up -d` });
    return plan;
  }
  if (action === "restart") {
    plan.push({ step: "restart-observability-stack", command: `${compose} up -d --force-recreate prometheus grafana` });
    return plan;
  }
  if (action === "stop") {
    return [{ step: "stop-observability-stack", command: `${compose} stop` }];
  }
  return [];
}

function applyPlan(plan) {
  const results = [];
  for (const item of plan) {
    const result = spawnSync("sh", ["-lc", item.command], {
      cwd: path.join(root, "deploy", "docker"),
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120000
    });
    results.push({
      step: item.step,
      ok: result.status === 0,
      status: result.status ?? -1,
      signal: result.signal || "",
      stdout: redactText(result.stdout).slice(-4000),
      stderr: redactText(result.stderr).slice(-4000)
    });
    if (result.status !== 0) break;
  }
  return results;
}

async function statusChecks() {
  const checks = [];
  checks.push(await httpCheck("prometheus-ready", `${config.observability.prometheusUrl.replace(/\/+$/, "")}/-/ready`));
  checks.push(await httpCheck("grafana-health", `${config.observability.grafanaUrl.replace(/\/+$/, "")}/api/health`));
  checks.push(await prometheusTargetsCheck());
  checks.push(containerCheck("turbalance-prometheus-runtime"));
  checks.push(containerCheck("turbalance-grafana-runtime"));
  return checks;
}

function prometheusTargetsCheck() {
  const url = `${config.observability.prometheusUrl.replace(/\/+$/, "")}/api/v1/targets?state=active`;
  return httpJson(url).then((payload) => {
    if (!payload || payload.status !== "success") {
      return { name: "prometheus-targets", status: "warn", detail: "target API did not return a success payload" };
    }
    const targets = payload.data?.activeTargets || [];
    const down = targets
      .filter((target) => target.health !== "up")
      .map((target) => ({
        job: target.labels?.job || "",
        instance: target.labels?.instance || "",
        health: target.health,
        error: target.lastError || ""
      }));
    return {
      name: "prometheus-targets",
      status: down.length ? "fail" : "pass",
      activeTargets: targets.length,
      down
    };
  }).catch((error) => ({
    name: "prometheus-targets",
    status: "warn",
    detail: error.message
  }));
}

function containerCheck(name) {
  const result = spawnSync("docker", ["inspect", "-f", "{{.State.Status}}", name], {
    cwd: root,
    encoding: "utf8",
    timeout: 10000
  });
  const state = result.status === 0 ? result.stdout.trim() : "missing";
  return {
    name: `container-${name}`,
    status: state === "running" ? "pass" : "fail",
    detail: state
  };
}

function httpCheck(name, url) {
  const target = new URL(url);
  const client = target.protocol === "https:" ? https : http;
  return new Promise((resolve) => {
    const request = client.request(target, { method: "GET", timeout: timeoutMs }, (response) => {
      response.resume();
      response.on("end", () => resolve({
        name,
        status: response.statusCode && response.statusCode < 500 ? "pass" : "fail",
        httpStatus: response.statusCode || 0,
        detail: response.statusCode && response.statusCode < 500 ? "reachable" : "unhealthy"
      }));
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", (error) => resolve({ name, status: "fail", detail: error.message }));
    request.end();
  });
}

function httpJson(url) {
  const target = new URL(url);
  const client = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(target, { method: "GET", timeout: timeoutMs }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > 1024 * 1024) request.destroy(new Error("response too large"));
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", reject);
    request.end();
  });
}

function shouldUseSecurePrometheus() {
  if (secureMode === "true" || secureMode === "1" || secureMode === "yes") return true;
  if (secureMode === "false" || secureMode === "0" || secureMode === "no") return false;
  return Boolean(config.security.requireApiAuth && fs.existsSync(tokenFile));
}

function composeFileArgs(securePrometheus) {
  const files = [path.join(root, "deploy", "docker", "grafana-runtime-compose.yml")];
  if (securePrometheus) files.push(path.join(root, "deploy", "docker", "grafana-runtime-compose.secure.yml"));
  return files;
}

function defaultPrometheusApiTokenFile() {
  if (config.security.apiTokensFile) {
    return path.join(path.dirname(config.security.apiTokensFile), "api-viewer-token");
  }
  return path.join("build", "product-secrets", "api-viewer-token");
}

function preparePrometheusTokenCommand() {
  return [
    `test -s ${shellQuote(tokenFile)}`,
    `mkdir -p ${shellQuote(path.dirname(runtimeTokenFile))}`,
    `cp ${shellQuote(tokenFile)} ${shellQuote(runtimeTokenFile)}`,
    `chmod 0444 ${shellQuote(runtimeTokenFile)}`
  ].join(" && ");
}

function redactCommand(value) {
  return redactText(value)
    .split(tokenFile).join("[REDACTED_TOKEN_FILE]")
    .split(runtimeTokenFile).join("[REDACTED_RUNTIME_TOKEN_FILE]")
    .replace(/TURBALANCE_PROMETHEUS_API_TOKEN_FILE=([^ ]+)/g, "TURBALANCE_PROMETHEUS_API_TOKEN_FILE=[REDACTED_PATH]");
}

function redactText(value) {
  return String(value || "").replace(/(TOKEN|SECRET|PASSWORD|PRIVATE|API_KEY|HMAC|BEARER|AUTHORIZATION|KEY)=([^\n\r ]*)/gi, "$1=[REDACTED]");
}

function redactPath(value) {
  return value ? value.replace(/api-viewer-token$/, "api-viewer-token") : "";
}

function shellQuote(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:@,%+=-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}
