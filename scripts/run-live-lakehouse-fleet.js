#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_SPARK_REMOTES = ["user@192.168.10.20", "user@192.168.10.21"];
const PI_FLEET_REMOTES = Array.from({ length: 12 }, (_unused, index) => `pi@pi${index + 1}`);

const args = parseArgs(process.argv.slice(2));
const root = path.join(__dirname, "..");
const outPath = args.out || process.env.TURBALANCE_LIVE_MACHINE_BUNDLE || "build/demo/live-machine-bundle.json";
const lakeRoot = args["lake-root"] || process.env.TURBALANCE_LAKE_ROOT || "build/lakehouse";
const tenantId = args["tenant-id"] || process.env.TURBALANCE_TENANT_ID || "dgx-lab";
const hostId = args["host-id"] || process.env.TURBALANCE_HOST_ID || "dgx-spark-fleet";
const agentId = args["agent-id"] || process.env.TURBALANCE_AGENT_ID || "live-lakehouse-fleet";
const hostUrl = args["host-url"] || process.env.TURBALANCE_MACHINE_DEMO_URL || "http://192.168.10.30:8000";
const loopMs = numberArg(args["loop-ms"], 1000);
const transformIntervalMs = numberArg(args["transform-interval-ms"], 10000);
const skipLakehouse = args["skip-lakehouse"] === true || process.env.TURBALANCE_SKIP_LAKEHOUSE_WRITE === "1";
const skipTransform = args["skip-transform"] === true || process.env.TURBALANCE_SKIP_TRANSFORM === "1";
const includeLocal = args["include-local"] === true || process.env.TURBALANCE_INCLUDE_LOCAL_FLEET_HOST === "1";
const includePiFleet = args["pi-fleet"] === true || process.env.TURBALANCE_PI_FLEET === "1";
const includePiBenchmarks = args["pi-benchmarks"] === true || process.env.TURBALANCE_PI_BENCHMARKS === "1";
const remotes = resolveRemoteFleet();
const remoteRoot = args["remote-root"] || process.env.TURBALANCE_REMOTE_MACHINE_ROOT || "";
const pythonBin = args.python || process.env.PYTHON || "python3";
const dgxInterconnectInterface = args["dgx-interconnect-interface"] || process.env.TURBALANCE_DGX_INTERCONNECT_INTERFACE || "enp1s0f1np1";
const dgxInterconnectSubnetPrefix = args["dgx-interconnect-subnet-prefix"] || process.env.TURBALANCE_DGX_INTERCONNECT_SUBNET_PREFIX || "192.168.100.";
let lastTransformAt = 0;

if (loopMs > 0) {
  runLoop();
} else {
  runOnce();
}

function runLoop() {
  while (true) {
    const startedAt = Date.now();
    runOnce();
    sleep(Math.max(0, loopMs - (Date.now() - startedAt)));
  }
}

function runOnce() {
  collectFleetBundle();
  let lakehouse = null;
  let transform = null;
  if (!skipLakehouse) {
    lakehouse = writeLakehouse();
    if (!skipTransform && Date.now() - lastTransformAt >= transformIntervalMs) {
      transform = materializeTransforms();
      lastTransformAt = Date.now();
    }
  }
  process.stdout.write(`${JSON.stringify({
    collectedAt: new Date().toISOString(),
    outPath,
    remotes,
    remoteRoot: remoteRoot || null,
    lakehouse,
    transform
  })}\n`);
}

function collectFleetBundle() {
  const commandArgs = [
    path.join(root, "scripts", "collect-machine-fleet-bundle.js"),
    "--out",
    outPath,
    "--host-url",
    hostUrl,
    ...(remoteRoot ? ["--remote-root", remoteRoot] : []),
    "--dgx-interconnect-interface",
    dgxInterconnectInterface,
    "--dgx-interconnect-subnet-prefix",
    dgxInterconnectSubnetPrefix,
    ...(includePiFleet ? ["--pi-fleet"] : []),
    ...(includePiBenchmarks ? ["--pi-benchmarks"] : []),
    ...remotes.flatMap((remote) => ["--remote", remote])
  ];
  if (!includeLocal) commandArgs.push("--no-local");
  runRequired(process.execPath, commandArgs, nodeEnv());
}

function writeLakehouse() {
  const output = runRequired(pythonBin, [
    "-m",
    "raw_writer",
    "--input",
    outPath,
    "--lake-root",
    lakeRoot,
    "--source-bundle",
    "--tenant-id",
    tenantId,
    "--host-id",
    hostId,
    "--agent-id",
    agentId
  ], pythonEnv([
    "services/platform_common",
    "services/raw-writer"
  ]));
  return parseJson(output);
}

function materializeTransforms() {
  const output = runRequired(pythonBin, [
    "-m",
    "transform_runner",
    "--lake-root",
    lakeRoot,
    "--tenant-id",
    tenantId
  ], pythonEnv([
    "services/platform_common",
    "services/raw-writer",
    "services/duckdb-query-service",
    "services/transform-runner"
  ]));
  return parseJson(output);
}

function runRequired(bin, commandArgs, env) {
  const result = spawnSync(bin, commandArgs, {
    cwd: root,
    encoding: "utf8",
    env,
    maxBuffer: 100 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`${bin} ${commandArgs.join(" ")} failed with status ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result.stdout;
}

function nodeEnv() {
  return {
    ...process.env,
    TURBALANCE_DISABLE_LOCAL_FLEET_DELEGATION: "1"
  };
}

function pythonEnv(paths) {
  return {
    ...process.env,
    PYTHONPATH: paths.join(path.delimiter)
  };
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function splitList(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => String(item || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean));
}

function resolveRemoteFleet() {
  const configured = splitList(args.remote || process.env.TURBALANCE_REMOTE_MACHINES || "");
  if (includePiFleet) {
    return unique([
      ...configured,
      ...PI_FLEET_REMOTES
    ]);
  }
  return configured.length ? unique(configured) : DEFAULT_SPARK_REMOTES;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
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
