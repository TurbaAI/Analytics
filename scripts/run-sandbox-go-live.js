#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const args = parseArgs(process.argv.slice(2));
const root = path.join(__dirname, "..");
const configPath = args.config || process.env.TURBALANCE_PILOT_CONFIG || path.join(root, "ops", "pilot-provider.sandbox.json");
const contractsPath = args.contracts || process.env.TURBALANCE_SOURCE_CONTRACTS || path.join(root, "ops", "source-contracts.sandbox.json");
const outDir = path.resolve(args["out-dir"] || process.env.TURBALANCE_GO_LIVE_OUT_DIR || path.join(root, "build", "provider-go-live-sandbox"));
const iterations = args.iterations || process.env.TURBALANCE_BURN_IN_ITERATIONS || "2";
const sourcePort = Number(args["source-port"] || process.env.TURBALANCE_SANDBOX_SOURCE_PORT || 8891);
const ingestPort = Number(args["ingest-port"] || process.env.TURBALANCE_SANDBOX_INGEST_PORT || 8890);
const registryPort = Number(args["registry-port"] || process.env.TURBALANCE_SANDBOX_REGISTRY_PORT || 5000);
const dryRun = Boolean(args["dry-run"] || process.env.TURBALANCE_DRY_RUN);
const token = args.token || process.env.TURBALANCE_INGEST_TOKEN || "tenant-token";
const tenant = args.tenant || process.env.TURBALANCE_INGEST_TENANT || "tenant-a";
const runId = `${Date.now()}-${process.pid}`;
const registryName = `turbalance-sandbox-registry-${runId}`;
const ingestionName = `turbalance-sandbox-ingestion-${runId}`;
const sourceUrl = `http://127.0.0.1:${sourcePort}`;
const ingestUrl = `http://127.0.0.1:${ingestPort}/v1/ingestion`;
const config = JSON.parse(fs.readFileSync(path.resolve(configPath), "utf8"));
let sourceGateway = null;
let registryContainer = "";
let ingestionContainer = "";

const plan = {
  ok: true,
  dryRun,
  configPath: path.resolve(configPath),
  contractsPath: path.resolve(contractsPath),
  outDir,
  image: config.image,
  services: {
    registry: `http://127.0.0.1:${registryPort}/v2/`,
    sourceGateway: sourceUrl,
    ingestion: ingestUrl
  },
  commands: [
    `docker run -d --rm --name ${registryName} -p 127.0.0.1:${registryPort}:5000 registry:2`,
    `node scripts/build-publish-ingestion-image.js --config ${relative(configPath)} --push`,
    `node scripts/run-sandbox-source-gateway.js --port ${sourcePort}`,
    `docker run -d --rm --name ${ingestionName} -p 127.0.0.1:${ingestPort}:8787 ${config.image}`,
    `node scripts/run-provider-go-live-gates.js --config ${relative(configPath)} --contracts ${relative(contractsPath)} --push-image --iterations ${iterations} --ingest-url ${ingestUrl} --token ${token} --tenant ${tenant} --out-dir ${outDir}`
  ]
};

if (dryRun) {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  process.exit(0);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}).finally(cleanup);

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  registryContainer = runCapture([
    "docker",
    "run",
    "-d",
    "--rm",
    "--name",
    registryName,
    "-p",
    `127.0.0.1:${registryPort}:5000`,
    "registry:2"
  ]).trim();
  await waitForHttp(`http://127.0.0.1:${registryPort}/v2/`, "registry");

  runNode(["scripts/build-publish-ingestion-image.js", "--config", configPath, "--push"]);

  sourceGateway = spawn(process.execPath, [
    "scripts/run-sandbox-source-gateway.js",
    "--port",
    String(sourcePort)
  ], {
    cwd: root,
    stdio: ["ignore", "ignore", "inherit"]
  });
  await waitForHttp(`${sourceUrl}/health`, "source gateway");

  ingestionContainer = runCapture([
    "docker",
    "run",
    "-d",
    "--rm",
    "--name",
    ingestionName,
    "-p",
    `127.0.0.1:${ingestPort}:8787`,
    "-e",
    "TURBALANCE_INGEST_HOST=0.0.0.0",
    "-e",
    `TURBALANCE_TENANT_TOKENS=${tenant}:${token}:operator:burn-in-operator,admin:admin-token:admin:platform-admin`,
    "-e",
    "TURBALANCE_UPLOAD_SECRET=burn-in-secret",
    "-e",
    "TURBALANCE_DATA_DIR=/tmp/turbalance-data",
    config.image
  ]).trim();
  await waitForHttp(`http://127.0.0.1:${ingestPort}/health`, "ingestion");

  const goLive = runJson([
    "scripts/run-provider-go-live-gates.js",
    "--config",
    configPath,
    "--contracts",
    contractsPath,
    "--push-image",
    "--iterations",
    iterations,
    "--ingest-url",
    ingestUrl,
    "--token",
    token,
    "--tenant",
    tenant,
    "--out-dir",
    outDir
  ]);

  const report = {
    ...plan,
    dryRun: false,
    goLive
  };
  fs.writeFileSync(path.join(outDir, "sandbox-go-live-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function cleanup() {
  if (sourceGateway && !sourceGateway.killed) {
    sourceGateway.kill("SIGTERM");
  }
  if (ingestionContainer) {
    spawnSync("docker", ["rm", "-f", ingestionContainer], { cwd: root, stdio: "ignore" });
  }
  if (registryContainer) {
    spawnSync("docker", ["rm", "-f", registryContainer], { cwd: root, stdio: "ignore" });
  }
}

function runJson(commandArgs) {
  const result = runNode(commandArgs);
  return JSON.parse(result.stdout);
}

function runNode(commandArgs) {
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024
  });
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${commandArgs.join(" ")} failed`);
  }
  return result;
}

function runCapture(commandArgs) {
  const result = spawnSync(commandArgs[0], commandArgs.slice(1), {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024
  });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${commandArgs.join(" ")} failed${result.stdout ? `: ${result.stdout}` : ""}`);
  }
  return result.stdout;
}

async function waitForHttp(url, label) {
  const deadline = Date.now() + 30000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `${response.status} ${await response.text()}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} did not become ready at ${url}: ${lastError}`);
}

function relative(filePath) {
  return path.relative(root, path.resolve(filePath)) || ".";
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    parsed[arg.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : "1";
  }
  return parsed;
}
