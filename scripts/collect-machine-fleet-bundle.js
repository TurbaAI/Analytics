#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { assertValidSourceBundle } = require("../lib/source-bundle-validator.js");

const args = parseArgs(process.argv.slice(2));
const root = path.join(__dirname, "..");
const outPath = args.out || "";
const hostUrl = args["host-url"] || process.env.TURBALANCE_MACHINE_DEMO_URL || "http://192.168.10.101:8000";
const remoteRoot = args["remote-root"] || process.env.TURBALANCE_REMOTE_MACHINE_ROOT || "$HOME/turbalance-analytics";
const remotes = arrayArg(args.remote);
const includeLocal = args["no-local"] !== true;

const bundles = [];
if (includeLocal) bundles.push(collectLocalBundle());
remotes.forEach((remote) => bundles.push(collectRemoteBundle(remote)));

const bundle = combineBundles(bundles);
assertValidSourceBundle(bundle);

const output = `${JSON.stringify(bundle, null, 2)}\n`;
if (outPath) {
  const fullPath = path.resolve(outPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, output);
} else {
  process.stdout.write(output);
}

function collectLocalBundle() {
  return runJson(process.execPath, [
    path.join(root, "scripts", "collect-local-machine-bundle.js"),
    "--host-url",
    hostUrl
  ]);
}

function collectRemoteBundle(remote) {
  const command = [
    "cd",
    remoteRoot,
    "&&",
    "node",
    "scripts/collect-local-machine-bundle.js",
    "--host-url",
    shellQuote(hostUrl)
  ].join(" ");

  return runJson("ssh", [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=8",
    remote,
    command
  ]);
}

function runJson(bin, commandArgs) {
  const output = execFileSync(bin, commandArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
    maxBuffer: 50 * 1024 * 1024
  });

  return JSON.parse(output);
}

function combineBundles(bundles) {
  const generatedAt = new Date().toISOString();
  const ingestion = {
    schemaVersion: "turba.ingestion.v1",
    entities: {},
    runs: [],
    sourceAdapters: []
  };

  bundles.forEach((bundle) => {
    mergeEntities(ingestion.entities, bundle.ingestion?.entities || {});
    ingestion.runs.push(...(bundle.ingestion?.runs || []));
    ingestion.sourceAdapters = unique([
      ...ingestion.sourceAdapters,
      ...(bundle.ingestion?.sourceAdapters || []),
      ...(bundle.metadata?.sourceAdapters || [])
    ]);
  });

  const observedHosts = unique(ingestion.runs
    .map((run) => run.sourceContext?.hostname)
    .filter(Boolean));

  return {
    metadata: {
      generatedAt,
      source: "collect-machine-fleet-bundle.js",
      observedHosts,
      note: "Strict live machine fleet observation. Each run is collected from that host and no Kubernetes, DCGM, eBPF, scheduler, provider, billing, SLO, or opportunity overlays are synthesized."
    },
    ingestion,
    sources: {}
  };
}

function mergeEntities(target, source) {
  Object.entries(source).forEach(([group, values]) => {
    target[group] = target[group] || {};
    Object.entries(values || {}).forEach(([key, value]) => {
      target[group][key] = target[group][key] || value;
    });
  });
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

function arrayArg(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
