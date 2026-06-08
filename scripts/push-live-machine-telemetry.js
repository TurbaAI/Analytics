#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const args = parseArgs(process.argv.slice(2));
const root = path.join(__dirname, "..");
const collectorUrl = args["collector-url"] || process.env.TURBALANCE_COLLECTOR_URL || "http://192.168.10.30:8801/v1/source-bundles";
const tenantId = args["tenant-id"] || process.env.TURBALANCE_TENANT_ID || "dgx-lab";
const configuredHostId = args["host-id"] || process.env.TURBALANCE_HOST_ID || "";
const agentId = args["agent-id"] || process.env.TURBALANCE_AGENT_ID || "live-machine-push";
const hostUrl = args["host-url"] || process.env.TURBALANCE_MACHINE_DEMO_URL || "http://192.168.10.30:8000";
const outPath = args.out || "";
const loopMs = numberArg(args["loop-ms"], 0);
const token = args.token || process.env.TURBALANCE_COLLECTOR_TOKEN || "";
const fastRefresh = args["fast-refresh"] === undefined ? "1" : String(args["fast-refresh"]);
const ollamaProbe = args["ollama-probe"] === undefined ? "0" : String(args["ollama-probe"]);
const dgxInterconnectInterface = args["dgx-interconnect-interface"] || process.env.TURBALANCE_DGX_INTERCONNECT_INTERFACE || "enp1s0f1np1";
const dgxInterconnectSubnetPrefix = args["dgx-interconnect-subnet-prefix"] || process.env.TURBALANCE_DGX_INTERCONNECT_SUBNET_PREFIX || "192.168.100.";
const networkInterface = args["network-interface"] || process.env.TURBALANCE_LIVE_NETWORK_INTERFACE || "";

if (loopMs > 0) {
  runLoop().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
} else {
  runOnce().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}

async function runLoop() {
  while (true) {
    const startedAt = Date.now();
    try {
      await runOnce();
    } catch (error) {
      process.stderr.write(`${JSON.stringify({
        failedAt: new Date().toISOString(),
        status: "push_failed",
        collectorUrl,
        error: error?.message || String(error)
      })}\n`);
    }
    await delay(Math.max(0, loopMs - (Date.now() - startedAt)));
  }
}

async function runOnce() {
  const bundle = collectLocalBundle();
  if (outPath) writeFileAtomic(path.resolve(outPath), `${JSON.stringify(bundle, null, 2)}\n`);
  const hostId = configuredHostId || liveBundleHostId(bundle);
  const response = await postJson(collectorUrl, {
    tenantId,
    hostId,
    agentId,
    bundle
  });
  process.stdout.write(`${JSON.stringify({
    pushedAt: new Date().toISOString(),
    status: response.status || "accepted",
    hostId,
    rowCount: response.rowCount || 0,
    collectorUrl
  })}\n`);
}

function collectLocalBundle() {
  const commandArgs = [
    path.join(root, "scripts", "collect-local-machine-bundle.js"),
    "--host-url",
    hostUrl,
    "--no-fleet",
    "1",
    "--fast-refresh",
    fastRefresh,
    "--ollama-probe",
    ollamaProbe,
    ...networkArgs()
  ];
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`collect-local-machine-bundle.js failed with status ${result.status}: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function networkArgs() {
  const values = [];
  if (networkInterface) values.push("--network-interface", networkInterface);
  if (dgxInterconnectInterface) values.push("--dgx-interconnect-interface", dgxInterconnectInterface);
  if (dgxInterconnectSubnetPrefix) values.push("--dgx-interconnect-subnet-prefix", dgxInterconnectSubnetPrefix);
  return values;
}

function liveBundleHostId(bundle) {
  return String(bundle?.ingestion?.runs?.[0]?.sourceContext?.hostname || "live-machine");
}

function postJson(url, payload) {
  const target = new URL(url);
  const body = Buffer.from(JSON.stringify(payload));
  const client = target.protocol === "https:" ? https : http;
  const headers = {
    "content-type": "application/json",
    "content-length": body.length
  };
  if (token) headers.authorization = `Bearer ${token}`;

  return new Promise((resolve, reject) => {
    const request = client.request({
      method: "POST",
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      headers
    }, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        responseBody += chunk;
      });
      response.on("end", () => {
        const parsed = parseJson(responseBody);
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`collector returned ${response.statusCode}: ${responseBody}`));
          return;
        }
        resolve(parsed || { status: "accepted" });
      });
    });
    request.on("error", reject);
    request.end(body);
  });
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function writeFileAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, content);
  fs.renameSync(tempPath, filePath);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function numberArg(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else if (parsed[key] === undefined) {
      parsed[key] = next;
      index += 1;
    } else if (Array.isArray(parsed[key])) {
      parsed[key].push(next);
      index += 1;
    } else {
      parsed[key] = [parsed[key], next];
      index += 1;
    }
  }
  return parsed;
}
