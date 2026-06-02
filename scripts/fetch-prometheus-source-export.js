#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { assertValidSourceBundle } = require("../lib/source-bundle-validator.js");

const DEFAULT_QUERIES = {
  prometheus: {
    turba_gpu_utilization_ratio: "avg(DCGM_FI_DEV_GPU_UTIL) / 100",
    turba_useful_compute_ratio: "avg(DCGM_FI_PROF_PIPE_TENSOR_ACTIVE) / 100",
    turba_nccl_time_ratio: "avg(turbalance_nccl_time_ratio)",
    turba_network_wait_ratio: "avg(turbalance_network_wait_ratio)",
    turba_network_utilization_ratio: "avg(turbalance_network_utilization_ratio)",
    turba_dataloader_stall_ratio: "avg(turbalance_dataloader_stall_ratio)",
    turba_storage_wait_ratio: "avg(turbalance_storage_wait_ratio)",
    turba_cpu_prep_ratio: "avg(turbalance_cpu_prep_ratio)",
    turba_queue_wait_minutes: "avg(turbalance_queue_wait_minutes)",
    turba_step_regularity_ratio: "avg(turbalance_step_regularity_ratio)"
  },
  dcgm: {
    DCGM_FI_PROF_SM_OCCUPANCY: "avg(DCGM_FI_PROF_SM_OCCUPANCY)",
    DCGM_FI_PROF_PIPE_TENSOR_ACTIVE: "avg(DCGM_FI_PROF_PIPE_TENSOR_ACTIVE)",
    DCGM_FI_DEV_FB_USED_RATIO: "avg(DCGM_FI_DEV_FB_USED / DCGM_FI_DEV_FB_TOTAL) * 100",
    DCGM_FI_PROF_DRAM_ACTIVE: "avg(DCGM_FI_PROF_DRAM_ACTIVE)",
    DCGM_FI_DEV_MEM_FRAGMENTATION: "avg(DCGM_FI_DEV_MEM_FRAGMENTATION)",
    DCGM_FI_DEV_KV_CACHE_PRESSURE: "avg(DCGM_FI_DEV_KV_CACHE_PRESSURE)"
  }
};

const args = parseArgs(process.argv.slice(2));
const baseUrl = args.url || process.env.TURBALANCE_PROMETHEUS_URL || "";
const runId = args["run-id"] || process.env.TURBALANCE_PROMETHEUS_RUN_ID || "";
const bearerToken = args["bearer-token"] || process.env.TURBALANCE_PROMETHEUS_BEARER_TOKEN || "";
const outputPath = args.out || process.env.TURBALANCE_PROMETHEUS_EXPORT_OUTPUT || "";
const outputDir = args["out-dir"] || process.env.TURBALANCE_PROMETHEUS_EXPORT_OUT_DIR || "";
const queriesFile = args["queries-file"] || process.env.TURBALANCE_PROMETHEUS_QUERIES_FILE || "";
const allowMissing = Boolean(args["allow-missing"] || process.env.TURBALANCE_PROMETHEUS_ALLOW_MISSING);

if (!baseUrl || !runId) {
  process.stderr.write("usage: fetch-prometheus-source-export.js --url http://prometheus:9090 --run-id RUN_ID [--queries-file queries.json] [--out bundle.json] [--out-dir input-dir]\n");
  process.exit(1);
}

(async () => {
  const warnings = [];
  const queryGroups = loadQueryGroups(queriesFile);
  const prometheusMetrics = await collectGroup({
    baseUrl,
    bearerToken,
    queries: queryGroups.prometheus || {},
    allowMissing,
    warnings
  });
  const dcgmFields = await collectGroup({
    baseUrl,
    bearerToken,
    queries: queryGroups.dcgm || {},
    allowMissing,
    warnings
  });

  const sources = compactObject({
    prometheus: Object.keys(prometheusMetrics).length > 0 ? [{
      runId,
      metrics: prometheusMetrics
    }] : [],
    dcgm: Object.keys(dcgmFields).length > 0 ? [{
      runId,
      fields: dcgmFields
    }] : []
  });
  const bundle = { sources };
  const validation = assertValidSourceBundle(bundle, { requireSourceExport: true });

  if (outputPath) {
    writeJsonFile(outputPath, bundle);
  }
  if (outputDir) {
    if (sources.prometheus) writeJsonFile(path.join(outputDir, "prometheus.json"), sources.prometheus);
    if (sources.dcgm) writeJsonFile(path.join(outputDir, "dcgm.json"), sources.dcgm);
  }

  if (!outputPath && !outputDir) {
    process.stdout.write(`${JSON.stringify(bundle, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    runId,
    outputPath: outputPath ? path.resolve(outputPath) : "",
    outputDir: outputDir ? path.resolve(outputDir) : "",
    sourceCounts: validation.sourceCounts,
    warnings
  }, null, 2)}\n`);
})().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

function loadQueryGroups(filePath) {
  if (!filePath) return DEFAULT_QUERIES;
  const parsed = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
  return {
    prometheus: isPlainObject(parsed.prometheus) ? parsed.prometheus : {},
    dcgm: isPlainObject(parsed.dcgm) ? parsed.dcgm : {}
  };
}

async function collectGroup({ baseUrl, bearerToken, queries, allowMissing, warnings }) {
  const values = {};

  for (const [name, query] of Object.entries(queries)) {
    try {
      const value = await queryPrometheus({ baseUrl, bearerToken, query });
      if (Number.isFinite(value)) {
        values[name] = value;
      }
    } catch (error) {
      if (!allowMissing) throw new Error(`${name}: ${error.message}`);
      warnings.push(`${name}: ${error.message}`);
    }
  }

  return values;
}

async function queryPrometheus({ baseUrl, bearerToken, query }) {
  const url = prometheusQueryUrl(baseUrl, query);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: compactObject({
        accept: "application/json",
        authorization: bearerToken ? `Bearer ${bearerToken}` : ""
      })
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Prometheus returned ${response.status}: ${text}`);
    }
    const payload = JSON.parse(text);
    if (payload.status !== "success") {
      throw new Error(payload.error || "Prometheus query failed");
    }
    return prometheusNumericValue(payload.data);
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Prometheus query timed out after 15000 ms");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function prometheusQueryUrl(baseUrl, query) {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/$/, "");
  url.pathname = `${basePath}/api/v1/query`;
  url.search = "";
  url.searchParams.set("query", query);
  return url;
}

function prometheusNumericValue(data) {
  const resultType = data?.resultType;
  const result = data?.result;

  if (resultType === "scalar") {
    return numeric(Array.isArray(result) ? result[1] : undefined);
  }

  if (resultType === "vector") {
    return average((Array.isArray(result) ? result : []).map((entry) => numeric(entry?.value?.[1])));
  }

  if (resultType === "matrix") {
    return average((Array.isArray(result) ? result : []).flatMap((entry) => (
      Array.isArray(entry.values) ? entry.values.map((value) => numeric(value?.[1])) : []
    )));
  }

  throw new Error(`unsupported Prometheus result type ${resultType || "unknown"}`);
}

function average(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) throw new Error("Prometheus query returned no numeric values");
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => (
      entry !== undefined
      && entry !== null
      && entry !== ""
      && !(Array.isArray(entry) && entry.length === 0)
    ))
  );
}

function writeJsonFile(filePath, value) {
  const fullPath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(value, null, 2)}\n`);
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
