#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const args = parseArgs(process.argv.slice(2));
const root = path.join(__dirname, "..");
const collectorUrl = args["collector-url"] || process.env.TURBALANCE_COLLECTOR_URL || "http://192.168.10.30:8801/v1/source-bundles";
const tenantId = args["tenant-id"] || process.env.TURBALANCE_TENANT_ID || "dgx-lab";
const configuredHostId = args["host-id"] || process.env.TURBALANCE_HOST_ID || "";
const agentId = args["agent-id"] || process.env.TURBALANCE_AGENT_ID || "live-machine-push";
const productVersion = args.version || process.env.TURBALANCE_PRODUCT_VERSION || "0.1.0";
const hostUrl = args["host-url"] || process.env.TURBALANCE_MACHINE_DEMO_URL || "http://192.168.10.30:8000";
const outPath = args.out || "";
const loopMs = numberArg(args["loop-ms"] || process.env.TURBALANCE_AGENT_LOOP_MS, 0);
const token = args.token || secretEnv("TURBALANCE_COLLECTOR_TOKEN", "TURBALANCE_COLLECTOR_TOKEN_FILE");
const hmacSecret = args["hmac-secret"] || secretEnv("TURBALANCE_COLLECTOR_HMAC_SECRET", "TURBALANCE_COLLECTOR_HMAC_SECRET_FILE");
const collectorCaFile = args["collector-ca-file"] || process.env.TURBALANCE_COLLECTOR_CA_FILE || "";
const collectorClientCertFile = args["collector-client-cert-file"] || process.env.TURBALANCE_COLLECTOR_CLIENT_CERT_FILE || "";
const collectorClientKeyFile = args["collector-client-key-file"] || process.env.TURBALANCE_COLLECTOR_CLIENT_KEY_FILE || "";
const collectorTlsSkipVerify = flagArg(args["collector-tls-skip-verify"]) || process.env.TURBALANCE_COLLECTOR_TLS_SKIP_VERIFY === "1";
const fastRefresh = args["fast-refresh"] === undefined ? "1" : flagValue(args["fast-refresh"]);
const ollamaProbe = args["ollama-probe"] === undefined ? "0" : flagValue(args["ollama-probe"]);
const benchmarkSuite = flagArg(args["benchmark-suite"]) || process.env.TURBALANCE_MACHINE_BENCHMARKS === "1" || process.env.TURBALANCE_PI_BENCHMARKS === "1";
const replayOnly = flagArg(args["replay-only"]);
const spoolEnabled = !flagArg(args["no-spool"]) && process.env.TURBALANCE_AGENT_DISABLE_SPOOL !== "1";
const spoolDir = args["spool-dir"] || process.env.TURBALANCE_AGENT_SPOOL_DIR || path.join(root, "build", "agent-spool", safeId(os.hostname()));
const sequencePath = args["sequence-path"] || process.env.TURBALANCE_AGENT_SEQUENCE_PATH || path.join(root, "build", "agent-state", safeId(os.hostname()), "sequence-no");
const maxReplay = numberArg(args["max-replay"] || process.env.TURBALANCE_AGENT_MAX_REPLAY, 25);
const postTimeoutMs = numberArg(args["post-timeout-ms"] || process.env.TURBALANCE_AGENT_POST_TIMEOUT_MS, 10000);
const dgxInterconnectInterface = args["dgx-interconnect-interface"] || process.env.TURBALANCE_DGX_INTERCONNECT_INTERFACE || "enp1s0f1np1";
const dgxInterconnectSubnetPrefix = args["dgx-interconnect-subnet-prefix"] || process.env.TURBALANCE_DGX_INTERCONNECT_SUBNET_PREFIX || "192.168.100.";
const networkInterface = args["network-interface"] || process.env.TURBALANCE_LIVE_NETWORK_INTERFACE || "";

if (replayOnly) {
  replaySpool().then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.failed > 0) process.exitCode = 1;
  }).catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
} else if (loopMs > 0) {
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
      await replaySpool({ quiet: true });
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
  bundle.metadata = {
    ...(bundle.metadata || {}),
    productVersion,
    agentId
  };
  if (outPath) writeFileAtomic(path.resolve(outPath), `${JSON.stringify(bundle, null, 2)}\n`);
  const hostId = configuredHostId || liveBundleHostId(bundle);
  const payload = {
    tenantId,
    hostId,
    agentId,
    sequenceNo: nextSequenceNo(sequencePath),
    bundle
  };
  let response;
  try {
    response = await postJson(collectorUrl, payload);
  } catch (error) {
    if (!spoolEnabled) throw error;
    const spoolPath = writeSpool(payload, {
      reason: error?.message || String(error),
      collectorUrl
    });
    response = { status: "spooled", rowCount: 0, spoolPath };
  }
  process.stdout.write(`${JSON.stringify({
    pushedAt: new Date().toISOString(),
    status: response.status || "accepted",
    hostId,
    agentId,
    productVersion,
    sequenceNo: payload.sequenceNo,
    rowCount: response.rowCount || 0,
    collectorUrl,
    spoolPath: response.spoolPath || undefined
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
    ...optionalCollectorArg("gpu-backend"),
    ...optionalCollectorArg("gpustat-bin"),
    ...(benchmarkSuite ? ["--benchmark-suite", "1"] : []),
    ...optionalCollectorArg("benchmark-ttl-ms"),
    ...optionalCollectorArg("benchmark-duration-ms"),
    ...optionalCollectorArg("benchmark-buffer-mib"),
    ...optionalCollectorArg("benchmark-disk-mib"),
    ...optionalCollectorArg("benchmark-cache"),
    ...optionalCollectorArg("run-id"),
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

function optionalCollectorArg(name) {
  const envName = `TURBALANCE_${name.toUpperCase().replace(/-/g, "_")}`;
  const value = args[name] || process.env[envName] || "";
  return value ? [`--${name}`, String(value)] : [];
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
    "content-length": body.length,
    "x-turbalance-agent-id": agentId
  };
  if (token) headers.authorization = `Bearer ${token}`;
  if (hmacSecret) Object.assign(headers, signedHeaders(body));

  return new Promise((resolve, reject) => {
    const request = client.request({
      method: "POST",
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      headers,
      ...tlsRequestOptions(target)
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
    if (postTimeoutMs > 0) {
      request.setTimeout(postTimeoutMs, () => {
        request.destroy(new Error(`collector request timed out after ${postTimeoutMs}ms`));
      });
    }
    request.end(body);
  });
}

function tlsRequestOptions(target) {
  if (target.protocol !== "https:") return {};
  const options = {};
  if (collectorCaFile) options.ca = fs.readFileSync(collectorCaFile);
  if (collectorClientCertFile) options.cert = fs.readFileSync(collectorClientCertFile);
  if (collectorClientKeyFile) options.key = fs.readFileSync(collectorClientKeyFile);
  if (collectorTlsSkipVerify) options.rejectUnauthorized = false;
  return options;
}

async function replaySpool({ quiet = false } = {}) {
  if (!spoolEnabled || maxReplay <= 0) {
    return { status: "disabled", replayed: 0, failed: 0, remaining: 0, spoolDir };
  }
  const files = listSpoolFiles().slice(0, maxReplay);
  let replayed = 0;
  let failed = 0;
  for (const filePath of files) {
    const entry = readSpool(filePath);
    if (!entry?.payload) {
      moveSpoolAside(filePath, "invalid");
      failed += 1;
      continue;
    }
    try {
      await postJson(entry.collectorUrl || collectorUrl, entry.payload);
      fs.unlinkSync(filePath);
      replayed += 1;
    } catch (error) {
      failed += 1;
      updateSpoolFailure(filePath, entry, error);
      break;
    }
  }
  const result = {
    status: failed ? "partial" : "ok",
    replayed,
    failed,
    remaining: listSpoolFiles().length,
    spoolDir
  };
  if (!quiet && (replayed || failed)) process.stdout.write(`${JSON.stringify({ replayedAt: new Date().toISOString(), ...result })}\n`);
  return result;
}

function signedHeaders(body) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const signature = crypto
    .createHmac("sha256", hmacSecret)
    .update(Buffer.from(`${timestamp}.${nonce}.`, "utf8"))
    .update(body)
    .digest("hex");
  return {
    "x-turbalance-timestamp": timestamp,
    "x-turbalance-nonce": nonce,
    "x-turbalance-signature": `v1=${signature}`
  };
}

function nextSequenceNo(filePath) {
  const fullPath = path.resolve(filePath);
  let current = 0;
  try {
    current = Number(fs.readFileSync(fullPath, "utf8").trim()) || 0;
  } catch {
    current = 0;
  }
  const next = current + 1;
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileAtomic(fullPath, `${next}\n`);
  return next;
}

function writeSpool(payload, metadata) {
  const now = new Date();
  const dir = path.resolve(spoolDir, `dt=${now.toISOString().slice(0, 10)}`);
  const filePath = path.join(dir, `source-bundle-${now.toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID()}.json`);
  const entry = {
    spooledAt: now.toISOString(),
    collectorUrl,
    attempts: 0,
    ...metadata,
    payload
  };
  writeFileAtomic(filePath, `${JSON.stringify(entry, null, 2)}\n`);
  return filePath;
}

function listSpoolFiles() {
  const rootDir = path.resolve(spoolDir);
  if (!fs.existsSync(rootDir)) return [];
  const files = [];
  walk(rootDir, files);
  return files
    .filter((filePath) => filePath.endsWith(".json") && !filePath.endsWith(".invalid.json"))
    .sort();
}

function walk(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    else if (entry.isFile()) files.push(fullPath);
  }
}

function readSpool(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function updateSpoolFailure(filePath, entry, error) {
  const nextEntry = {
    ...entry,
    attempts: Number(entry.attempts || 0) + 1,
    lastAttemptAt: new Date().toISOString(),
    lastError: error?.message || String(error)
  };
  writeFileAtomic(filePath, `${JSON.stringify(nextEntry, null, 2)}\n`);
}

function moveSpoolAside(filePath, suffix) {
  fs.renameSync(filePath, `${filePath}.${suffix}.json`);
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

function flagArg(value) {
  return value === true || value === "1" || value === "true" || value === "yes" || value === "on";
}

function flagValue(value) {
  if (value === true) return "1";
  if (value === false) return "0";
  return String(value);
}

function safeId(value) {
  return String(value || "unknown").toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function secretEnv(valueName, fileName) {
  const direct = process.env[valueName] || "";
  if (direct) return direct;
  const filePath = process.env[fileName] || "";
  if (!filePath) return "";
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
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
