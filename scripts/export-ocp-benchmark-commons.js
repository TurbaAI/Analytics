#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { validateSourceBundle } = require("../lib/source-bundle-validator.js");

const args = parseArgs(process.argv.slice(2));
const bundlePath = args.bundle || args.input || "";
const outPath = args.out || "";
const dataset = args.dataset || process.env.TURBALANCE_OCP_COMMONS_DATASET || "ocp-benchmark-commons-proposed-v1";
const memberId = args["member-id"] || process.env.TURBALANCE_OCP_COMMONS_MEMBER_ID || "redacted-member";
const salt = args.salt || process.env.TURBALANCE_OCP_COMMONS_SALT || `local-${dataset}`;

if (!bundlePath) fail("usage: node scripts/export-ocp-benchmark-commons.js --bundle source-bundle.json [--out ocp-commons.json]");

const bundle = readJson(bundlePath);
const validation = validateSourceBundle(bundle);
if (!validation.ok) fail(`source bundle validation failed: ${validation.errors.join("; ")}`);

const records = ingestionRuns(bundle)
  .map((run) => ocpBenchmarkRecord(run, { dataset, memberId, salt, hardwareClass: args["hardware-class"] || "" }))
  .filter(Boolean);

const exportPayload = {
  schemaVersion: "turba.ocp_benchmark_commons.v1",
  generatedAt: new Date().toISOString(),
  dataset,
  member: {
    idHash: stableHash(memberId, salt),
    label: memberId === "redacted-member" ? "redacted-member" : "member-hash"
  },
  policy: {
    visibility: "aggregate-anonymized",
    hostIdentity: "salted sha256 hash",
    prohibitedFields: ["hostname", "ipAddress", "tenantId", "accountId", "billingAccountId"],
    intendedUse: "OCP member hardware cross-comparison and binning"
  },
  records
};

writeJsonOrStdout(outPath, exportPayload);

function ocpBenchmarkRecord(run, options) {
  const context = isPlainObject(run.sourceContext) ? run.sourceContext : {};
  const metrics = benchmarkMetrics(context);
  if (Object.keys(metrics).length === 0) return null;

  const hardwareClass = options.hardwareClass
    || context.benchmarkOcpCommonsHardwareClass
    || inferHardwareClass(context);
  const configFingerprint = context.benchmarkOcpCommonsConfigHash
    || stableHash([
      context.platform,
      context.arch,
      context.cpuModel,
      context.cpuCount,
      context.gpuName,
      context.gpuMemoryTotalMiB,
      context.gpuPcie,
      context.networkLinkSpeedMbps,
      context.benchmarkSuiteName
    ].filter(Boolean).join("|"), options.salt);

  return {
    recordId: `ocp-${stableHash(run.id || context.hostname || "run", options.salt)}`,
    runHash: stableHash(run.id || "", options.salt),
    hostHash: stableHash(context.hostname || context.node || context.machineInventoryKey || "", options.salt),
    dataset: context.benchmarkOcpCommonsDataset || options.dataset,
    generatedAt: context.benchmarkGeneratedAt || context.generatedAt || "",
    benchmarkSuite: {
      name: context.benchmarkSuiteName || "",
      status: context.benchmarkSuiteStatus || "",
      durationMs: finiteOrUndefined(context.benchmarkDurationMs),
      sampleCached: Boolean(context.benchmarkSampleCached)
    },
    hardware: {
      class: hardwareClass,
      configFingerprint,
      platform: context.platform || "",
      arch: context.arch || "",
      cpuModel: context.cpuModel || "",
      cpuCount: finiteOrUndefined(context.cpuCount),
      gpuModel: context.gpuName || "",
      gpuPresent: Boolean(context.gpuPresent || context.gpuName),
      gpuMemoryMiB: finiteOrUndefined(context.gpuMemoryTotalMiB),
      networkLinkSpeedMbps: finiteOrUndefined(context.networkLinkSpeedMbps)
    },
    corpusComparison: {
      peerCount: finiteOrUndefined(context.benchmarkOcpCommonsPeerCount),
      percentile: finiteOrUndefined(context.benchmarkOcpCommonsPercentile),
      score: finiteOrUndefined(context.benchmarkOcpCommonsScore || context.benchmarkGlobalScore),
      binning: context.benchmarkOcpCommonsBinning || "",
      referenceUrl: context.benchmarkOcpCommonsUrl || context.benchmarkGlobalUrl || ""
    },
    metrics,
    provenance: {
      sourceRun: "redacted",
      sourceAdapters: Array.isArray(run.importedSources) ? run.importedSources : [],
      dataBoundary: "member-submitted benchmark evidence"
    }
  };
}

function benchmarkMetrics(context) {
  const entries = [
    ["cpuOpsPerSecond", context.benchmarkCpuOpsPerSecond, "ops/s"],
    ["memoryMiBps", context.benchmarkMemoryMiBps, "MiB/s"],
    ["diskWriteMiBps", context.benchmarkDiskWriteMiBps, "MiB/s"],
    ["diskReadMiBps", context.benchmarkDiskReadMiBps, "MiB/s"],
    ["gpuScore", context.benchmarkGpuScore, "score"],
    ["gpuMemoryMiBps", context.benchmarkGpuMemoryMiBps, "MiB/s"],
    ["gpuTensorOpsPerSecond", context.benchmarkGpuTensorOpsPerSecond, "ops/s"],
    ["networkMbps", context.benchmarkNetworkMbps, "Mbps"],
    ["networkLatencyUs", context.benchmarkNetworkLatencyUs, "us"],
    ["compositeScore", context.benchmarkScore, "score"]
  ];
  return Object.fromEntries(entries
    .map(([key, value, unit]) => [key, metricValue(value, unit)])
    .filter(([, value]) => value));
}

function metricValue(value, unit) {
  const parsed = finiteOrUndefined(value);
  return Number.isFinite(parsed) ? { value: parsed, unit } : null;
}

function inferHardwareClass(context) {
  if (context.gpuName) return `${context.gpuName} host`;
  if (context.cpuModel) return `${context.cpuModel} host`;
  return [context.platform, context.arch].filter(Boolean).join("/") || "unclassified hardware";
}

function ingestionRuns(payload) {
  if (Array.isArray(payload?.ingestion?.runs)) return payload.ingestion.runs;
  if (payload?.schemaVersion === "turba.ingestion.v1" && Array.isArray(payload.runs)) return payload.runs;
  if (Array.isArray(payload?.runs)) return payload.runs;
  return [];
}

function stableHash(value, saltValue) {
  return crypto
    .createHash("sha256")
    .update(`${saltValue}:${String(value || "")}`)
    .digest("hex")
    .slice(0, 24);
}

function finiteOrUndefined(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function writeJsonOrStdout(filePath, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  if (!filePath) {
    process.stdout.write(body);
    return;
  }
  const fullPath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, body);
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
