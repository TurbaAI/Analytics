#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const inputDir = path.resolve(args["input-dir"] || process.env.TURBALANCE_EXPORT_INPUT_DIR || path.join(root, "fixtures", "provider-pilot-export-inputs"));
const outputPath = args.out || process.env.TURBALANCE_EXPORT_OUTPUT;
const ingestUrl = args["ingest-url"] || process.env.TURBALANCE_INGEST_URL || "";
const token = args.token || process.env.TURBALANCE_INGEST_TOKEN || "";
const tenant = args.tenant || process.env.TURBALANCE_INGEST_TENANT || "";

const build = spawnSync(process.execPath, [path.join(root, "scripts", "build-provider-pilot-bundle.js"), inputDir], {
  cwd: root,
  encoding: "utf8"
});

if (build.status !== 0) {
  process.stderr.write(build.stderr || build.stdout);
  process.exit(build.status || 1);
}

const bundle = build.stdout;

if (outputPath) {
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, bundle);
}

(async () => {
  let ingest = null;
  if (ingestUrl) {
    if (!token) throw new Error("TURBALANCE_INGEST_TOKEN or --token is required when ingest URL is set");
    ingest = await postJson(ingestUrl, bundle, {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(tenant ? { "x-turbalance-tenant": tenant } : {})
    });
  }

  const report = {
    ok: true,
    inputDir,
    outputPath: outputPath ? path.resolve(outputPath) : "",
    ingestStatus: ingest?.status || null,
    ingestResponse: ingest?.body || null
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
})().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    parsed[arg.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : "1";
  }
  return parsed;
}

async function postJson(target, body, headers) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(target, {
      method: "POST",
      signal: controller.signal,
      headers: {
        ...headers
      },
      body
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
