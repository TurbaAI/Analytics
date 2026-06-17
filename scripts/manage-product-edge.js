#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
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
const tlsDir = path.resolve(root, args["tls-dir"] || "build/product-tls");
const edgePort = Number(args["edge-port"] || config.security.edgeHttpsPort || 8443);
const mtlsPort = Number(args["mtls-port"] || config.security.collectorMtlsPort || 9443);

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
  const plan = buildPlan();
  let results = [];
  if (apply) results = applyPlan(plan);
  const checks = await statusChecks();
  const report = {
    status: apply ? (results.every((step) => step.ok) ? "applied" : "failed") : "dry-run",
    action,
    edgeUrl: edgeUrl("/"),
    apiReadyUrl: edgeUrl("/api/ready"),
    collectorMtlsReadyUrl: mtlsUrl("/ready"),
    tlsDir,
    plan: plan.map((item) => ({ step: item.step, command: item.command })),
    results,
    checks
  };
  if (report.status === "failed") process.exitCode = 1;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function buildPlan() {
  if (action === "status") return [];
  const compose = `docker compose -f ${shellQuote(path.join(root, "deploy", "docker", "product-edge-compose.yml"))}`;
  if (action === "stop") return [{ step: "stop-product-edge", command: `${compose} stop` }];
  const generate = `node scripts/generate-product-edge-tls.js --config ${shellQuote(configPath)} --out-dir ${shellQuote(path.relative(root, tlsDir))} --apply`;
  const up = `${compose} up -d`;
  if (action === "up") {
    return [
      { step: "generate-product-edge-tls", command: generate },
      { step: "start-product-edge", command: up }
    ];
  }
  return [
    { step: "generate-product-edge-tls", command: generate },
    { step: "restart-product-edge", command: `${up} --force-recreate edge` }
  ];
}

function applyPlan(plan) {
  const results = [];
  for (const item of plan) {
    const result = spawnSync("sh", ["-lc", item.command], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120000
    });
    results.push({
      step: item.step,
      ok: result.status === 0,
      status: result.status ?? -1,
      signal: result.signal || "",
      stdout: result.stdout.slice(-3000),
      stderr: result.stderr.slice(-3000)
    });
    if (result.status !== 0) break;
  }
  return results;
}

async function statusChecks() {
  const ca = readOptional(path.join(tlsDir, "ca.crt"));
  const clientCert = readOptional(path.join(tlsDir, "agent-client.crt"));
  const clientKey = readOptional(path.join(tlsDir, "agent-client.key"));
  return [
    await httpsCheck("edge-dashboard", edgeUrl("/"), { ca, expectText: "turbalance Analytics" }),
    await httpsCheck("edge-api-ready", edgeUrl("/api/ready"), { ca, expectText: "ready" }),
    await httpsCheck("edge-grafana-health", edgeUrl("/grafana/api/health"), { ca, expectText: "database" }),
    await httpsCheck("edge-collector-mtls-ready", mtlsUrl("/ready"), { ca, cert: clientCert, key: clientKey, expectText: "ready" }),
    await httpsRejectsWithoutClientCert(),
    containerCheck("turbalance-product-edge")
  ];
}

function httpsCheck(name, url, options = {}) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    if (!options.ca) {
      resolve({ name, type: "https", status: "warn", target: url, detail: "missing product edge CA" });
      return;
    }
    const target = new URL(url);
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

async function httpsRejectsWithoutClientCert() {
  const ca = readOptional(path.join(tlsDir, "ca.crt"));
  const check = await httpsCheck("edge-collector-mtls-rejects-missing-cert", mtlsUrl("/ready"), { ca, expectText: "ready" });
  if (check.status === "warn") return check;
  if (check.status === "fail") {
    return { ...check, status: "pass", detail: `rejected without client certificate: ${check.detail}` };
  }
  return { ...check, status: "fail", detail: "collector mTLS endpoint accepted a request without a client certificate" };
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
    type: "container",
    status: state === "running" ? "pass" : "warn",
    target: name,
    detail: state
  };
}

function edgeUrl(route) {
  return `https://${config.controller.host}:${edgePort}${route}`;
}

function mtlsUrl(route) {
  return `https://${config.controller.host}:${mtlsPort}${route}`;
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

function shellQuote(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:@,%+=-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}
