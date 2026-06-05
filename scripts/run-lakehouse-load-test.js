#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const root = path.join(__dirname, "..");

function parseArgs(argv) {
  const options = {
    url: process.env.TURBALANCE_COLLECTOR_URL || "http://127.0.0.1:8801",
    requests: Number(process.env.TURBALANCE_LOAD_REQUESTS || 25),
    concurrency: Number(process.env.TURBALANCE_LOAD_CONCURRENCY || 4),
    fixture: "fixtures/external-source-bundle.json",
    tenantId: "load-test",
    hostId: "load-host",
    agentId: "load-agent",
    bearerToken: process.env.TURBALANCE_COLLECTOR_TOKEN || "",
    hmacSecret: process.env.TURBALANCE_COLLECTOR_HMAC_SECRET || "",
    dryRun: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (!(key in options)) throw new Error(`Unknown option ${arg}`);
      options[key] = argv[index + 1];
      index += 1;
    }
  }
  options.requests = Number(options.requests);
  options.concurrency = Number(options.concurrency);
  if (!Number.isFinite(options.requests) || options.requests < 1) throw new Error("--requests must be positive");
  if (!Number.isFinite(options.concurrency) || options.concurrency < 1) throw new Error("--concurrency must be positive");
  return options;
}

function buildBody(options, sequenceNo) {
  const fixturePath = path.resolve(root, options.fixture);
  const bundle = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  return JSON.stringify(
    {
      tenantId: options.tenantId,
      hostId: `${options.hostId}-${sequenceNo % Math.max(1, options.concurrency)}`,
      agentId: options.agentId,
      bundle
    },
    null,
    0
  );
}

function headersFor(options, body, sequenceNo) {
  const headers = {
    "content-type": "application/json",
    "x-turbalance-agent-id": options.agentId
  };
  if (options.bearerToken) {
    headers.authorization = `Bearer ${options.bearerToken}`;
  }
  if (options.hmacSecret) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = `load-${Date.now()}-${sequenceNo}-${crypto.randomUUID()}`;
    const signature = crypto
      .createHmac("sha256", options.hmacSecret)
      .update(`${timestamp}.${nonce}.`)
      .update(body)
      .digest("hex");
    headers["x-turbalance-timestamp"] = timestamp;
    headers["x-turbalance-nonce"] = nonce;
    headers["x-turbalance-signature"] = `v1=${signature}`;
  }
  return headers;
}

async function sendOne(options, sequenceNo) {
  const body = buildBody(options, sequenceNo);
  const started = performance.now();
  const response = await fetch(`${options.url.replace(/\/$/, "")}/v1/source-bundles`, {
    method: "POST",
    headers: headersFor(options, body, sequenceNo),
    body
  });
  const elapsedMs = performance.now() - started;
  const text = await response.text();
  return { status: response.status, elapsedMs, body: text.slice(0, 300) };
}

async function runLoad(options) {
  const results = [];
  let next = 0;
  async function worker() {
    while (next < options.requests) {
      const sequenceNo = next;
      next += 1;
      results.push(await sendOne(options, sequenceNo));
    }
  }
  await Promise.all(Array.from({ length: Math.min(options.concurrency, options.requests) }, () => worker()));
  return summarize(options, results);
}

function summarize(options, results) {
  const durations = results.map((result) => result.elapsedMs).sort((left, right) => left - right);
  const statusCounts = {};
  for (const result of results) {
    statusCounts[result.status] = (statusCounts[result.status] || 0) + 1;
  }
  return {
    status: Object.keys(statusCounts).some((status) => Number(status) >= 500) ? "degraded" : "ok",
    url: options.url,
    requests: results.length,
    concurrency: options.concurrency,
    statusCounts,
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    maxMs: durations.at(-1) || 0
  };
}

function percentile(values, percentileValue) {
  if (!values.length) return 0;
  const index = Math.min(values.length - 1, Math.floor(values.length * percentileValue));
  return Number(values[index].toFixed(2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.dryRun) {
    console.log(JSON.stringify({ status: "dry-run", ...options, bearerToken: Boolean(options.bearerToken), hmacSecret: Boolean(options.hmacSecret) }, null, 2));
    return;
  }
  if (typeof fetch !== "function") {
    throw new Error("This script requires Node.js fetch support");
  }
  console.log(JSON.stringify(await runLoad(options), null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
