#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

function parseArgs(argv) {
  const args = {
    apiUrl: process.env.TURBALANCE_API_URL || "http://127.0.0.1:8080",
    collectorUrl: process.env.TURBALANCE_COLLECTOR_URL || "",
    apiToken: process.env.TURBALANCE_API_TOKEN || "",
    collectorToken: process.env.TURBALANCE_COLLECTOR_TOKEN || "",
    hmacSecret: process.env.TURBALANCE_COLLECTOR_HMAC_SECRET || "",
    requests: Number(process.env.TURBALANCE_BURN_IN_REQUESTS || 25),
    concurrency: Number(process.env.TURBALANCE_BURN_IN_CONCURRENCY || 4),
    out: "",
    dryRun: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (!(key in args)) throw new Error(`Unknown argument ${arg}`);
      args[key] = need(arg, next);
      index += 1;
    } else {
      throw new Error(`Unexpected argument ${arg}`);
    }
  }
  args.requests = Number(args.requests);
  args.concurrency = Number(args.concurrency);
  return args;
}

function need(flag, value) {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: scripts/run-lakehouse-burn-in.js [--api-url <url>] [--collector-url <url>] [--dry-run]

Runs a small collector load test and verifies health, covariance, principal-mode, and alert API responses.`);
}

function runLoadTest(args) {
  if (!args.collectorUrl) return null;
  const command = [
    "scripts/run-lakehouse-load-test.js",
    "--url",
    args.collectorUrl,
    "--requests",
    String(args.requests),
    "--concurrency",
    String(args.concurrency),
    ...(args.collectorToken ? ["--bearer-token", args.collectorToken] : []),
    ...(args.hmacSecret ? ["--hmac-secret", args.hmacSecret] : [])
  ];
  const result = spawnSync(process.execPath, command, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.status !== 0) {
    return { ok: false, error: result.stderr || result.stdout, command: command.join(" ") };
  }
  return { ok: true, result: JSON.parse(result.stdout), command: command.join(" ") };
}

async function getJson(args, route) {
  const headers = args.apiToken ? { Authorization: `Bearer ${args.apiToken}` } : {};
  const response = await fetch(`${args.apiUrl.replace(/\/$/, "")}${route}`, { headers });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { route, status: response.status, ok: response.ok, body };
}

function buildChecks(loadTest, responses) {
  const byRoute = Object.fromEntries(responses.map((response) => [response.route, response]));
  return [
    { name: "collector_load", passed: !loadTest || (loadTest.ok && loadTest.result.status !== "degraded") },
    { name: "api_health", passed: Boolean(byRoute["/health"]?.ok) },
    { name: "covariance_query", passed: Boolean(byRoute["/v1/virtual-sensors/covariance"]?.ok) },
    { name: "principal_mode_query", passed: Boolean(byRoute["/v1/virtual-sensors/principal-resource-mode"]?.ok) },
    { name: "alerts_query", passed: Boolean(byRoute["/v1/alerts"]?.ok) },
    {
      name: "covariance_shape",
      passed: Array.isArray(byRoute["/v1/virtual-sensors/covariance"]?.body?.rows)
    },
    {
      name: "principal_mode_shape",
      passed: Array.isArray(byRoute["/v1/virtual-sensors/principal-resource-mode"]?.body?.loadings)
    }
  ];
}

async function main() {
  const args = parseArgs(process.argv);
  const plan = {
    apiUrl: args.apiUrl,
    collectorUrl: args.collectorUrl,
    requests: args.requests,
    concurrency: args.concurrency,
    routes: ["/health", "/v1/virtual-sensors/covariance", "/v1/virtual-sensors/principal-resource-mode", "/v1/alerts"]
  };
  if (args.dryRun) {
    write(args.out, { status: "dry-run", plan });
    return;
  }
  if (typeof fetch !== "function") throw new Error("This script requires Node.js fetch support");
  const loadTest = runLoadTest(args);
  const responses = [];
  for (const route of plan.routes) {
    responses.push(await getJson(args, route));
  }
  const checks = buildChecks(loadTest, responses);
  const failed = checks.filter((check) => !check.passed);
  write(args.out, {
    status: failed.length ? "failed" : "ok",
    plan,
    loadTest,
    responses,
    checks
  });
  if (failed.length) process.exitCode = 1;
}

function write(out, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, body);
  }
  process.stdout.write(body);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
