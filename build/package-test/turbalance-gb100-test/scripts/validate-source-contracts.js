#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { validateSourceBundle } = require("../lib/source-bundle-validator.js");

const args = parseArgs(process.argv.slice(2));
const root = path.join(__dirname, "..");
const configPath = args.config || process.env.TURBALANCE_SOURCE_CONTRACTS || path.join(root, "ops", "source-contracts.example.json");
const config = JSON.parse(fs.readFileSync(path.resolve(configPath), "utf8"));
const runId = args["run-id"] || config.runId || process.env.TURBALANCE_SOURCE_CONTRACT_RUN_ID || `contract-${Date.now()}`;
const outDir = args["out-dir"] || fs.mkdtempSync(path.join(os.tmpdir(), "turba-source-contracts-"));
const keepStaging = Boolean(args["keep-staging"] || args["out-dir"]);
const contracts = Array.isArray(config.contracts) ? config.contracts.filter((contract) => contract.enabled !== false) : [];

if (contracts.length === 0) {
  process.stderr.write("source contract config must include at least one enabled contract\n");
  process.exit(1);
}

try {
  fs.mkdirSync(path.resolve(outDir), { recursive: true });
  const results = contracts.map((contract) => validateContract(contract, { runId, outDir }));
  const bundle = buildBundle(outDir);
  const validation = validateSourceBundle(bundle, { requireSourceExport: true });
  if (!validation.ok) {
    throw new Error(validation.errors.join("; "));
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    runId,
    outDir: path.resolve(outDir),
    keepStaging,
    contracts: results,
    sourceCounts: validation.sourceCounts,
    runIds: validation.runIds
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

function validateContract(contract, { runId, outDir }) {
  const system = String(contract.system || "").toLowerCase();
  const url = contract.url;
  if (!system || !url) throw new Error("each source contract needs system and url");
  const bearerToken = contract.bearerToken || (contract.bearerTokenEnv ? process.env[contract.bearerTokenEnv] : "");

  if (system === "prometheus" || system === "prometheus-dcgm") {
    runNode([
      "scripts/fetch-prometheus-source-export.js",
      "--url",
      url,
      "--run-id",
      runId,
      "--queries-file",
      contract.queriesFile || "fixtures/prometheus-collector-queries.json",
      "--out-dir",
      outDir,
      ...(bearerToken ? ["--bearer-token", bearerToken] : []),
      ...(contract.allowMissing ? ["--allow-missing"] : [])
    ]);
  } else {
    runNode([
      "scripts/fetch-source-system-export.js",
      "--system",
      system,
      "--url",
      url,
      "--out-dir",
      outDir,
      ...(bearerToken ? ["--bearer-token", bearerToken] : [])
    ]);
  }

  return {
    system,
    url,
    ok: true
  };
}

function buildBundle(outDir) {
  const result = runNode(["scripts/build-provider-pilot-bundle.js", outDir]);
  return JSON.parse(result.stdout);
}

function runNode(commandArgs) {
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`${commandArgs.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result;
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
