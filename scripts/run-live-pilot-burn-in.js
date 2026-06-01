#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { validateSourceBundle } = require("../lib/source-bundle-validator.js");

const args = parseArgs(process.argv.slice(2));
const root = path.join(__dirname, "..");
const iterations = Math.max(1, Number(args.iterations || process.env.TURBALANCE_BURN_IN_ITERATIONS || 1));
const contractsPath = args.contracts || process.env.TURBALANCE_SOURCE_CONTRACTS || "";
const ingestUrl = args["ingest-url"] || process.env.TURBALANCE_INGEST_URL || "";
const ingestToken = args.token || process.env.TURBALANCE_INGEST_TOKEN || "";
const ingestTenant = args.tenant || process.env.TURBALANCE_INGEST_TENANT || "";
const keepStaging = Boolean(args["keep-staging"] || process.env.TURBALANCE_BURN_IN_KEEP_STAGING);
const burnInDir = args["out-dir"] || fs.mkdtempSync(path.join(os.tmpdir(), "turba-burn-in-"));
let inputDir = args["input-dir"] || process.env.TURBALANCE_EXPORT_INPUT_DIR || path.join(root, "fixtures", "provider-pilot-export-inputs");

(async () => {
  fs.mkdirSync(path.resolve(burnInDir), { recursive: true });

  let contractReport = null;
  if (contractsPath) {
    inputDir = path.join(burnInDir, "source-contracts");
    const result = runNode([
      "scripts/validate-source-contracts.js",
      "--config",
      contractsPath,
      "--out-dir",
      inputDir
    ]);
    contractReport = JSON.parse(result.stdout);
  }

  const runs = [];
  for (let index = 0; index < iterations; index += 1) {
    const bundleResult = runNode(["scripts/build-provider-pilot-bundle.js", inputDir]);
    const bundle = JSON.parse(bundleResult.stdout);
    const validation = validateSourceBundle(bundle, { requireSourceExport: true });
    if (!validation.ok) {
      throw new Error(validation.errors.join("; "));
    }

    const bundlePath = path.join(burnInDir, `burn-in-${index + 1}.source-bundle.json`);
    fs.writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);

    let ingest = null;
    if (ingestUrl) {
      if (!ingestToken) throw new Error("--token or TURBALANCE_INGEST_TOKEN is required when --ingest-url is set");
      ingest = await postBundle({
        ingestUrl,
        ingestToken,
        ingestTenant,
        bundle
      });
    }

    runs.push({
      iteration: index + 1,
      bundlePath,
      sourceCounts: validation.sourceCounts,
      runIds: validation.runIds,
      ingestStatus: ingest?.status || null,
      ingestOk: ingest ? ingest.status >= 200 && ingest.status < 300 : null
    });
  }

  const ok = runs.every((run) => run.ingestOk !== false);
  process.stdout.write(`${JSON.stringify({
    ok,
    iterations,
    inputDir: path.resolve(inputDir),
    burnInDir: path.resolve(burnInDir),
    keepStaging,
    contractReport,
    runs
  }, null, 2)}\n`);
})().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

async function postBundle({ ingestUrl, ingestToken, ingestTenant, bundle }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(ingestUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${ingestToken}`,
        "content-type": "application/json",
        ...(ingestTenant ? { "x-turbalance-tenant": ingestTenant } : {})
      },
      body: JSON.stringify(bundle)
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`ingestion failed with ${response.status}: ${text}`);
    }
    return { status: response.status, body: text };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("ingestion timed out after 15000 ms");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
