#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const args = parseArgs(process.argv.slice(2));
const system = (args.system || process.env.TURBALANCE_SOURCE_SYSTEM || "").toLowerCase();
const url = args.url || process.env.TURBALANCE_SOURCE_EXPORT_URL || "";
const bearerToken = args["bearer-token"] || process.env.TURBALANCE_SOURCE_EXPORT_BEARER_TOKEN || "";
const outDir = args["out-dir"] || process.env.TURBALANCE_SOURCE_EXPORT_OUT_DIR || "";
const outPath = args.out || process.env.TURBALANCE_SOURCE_EXPORT_OUTPUT || "";

if (!system || !url) {
  process.stderr.write("usage: fetch-source-system-export.js --system kubernetes|scheduler-admission|grafana|billing-slo|ebpf|redfish|nccl|opportunities --url https://source.example/export [--out-dir provider-inputs]\n");
  process.exit(1);
}

(async () => {
  const payload = await fetchJson(url, bearerToken);
  const files = normalize(system, payload);

  if (outDir) {
    Object.entries(files).forEach(([fileName, value]) => {
      writeJsonFile(path.join(outDir, fileName), value);
    });
  }

  const report = {
    ok: true,
    system,
    url,
    outDir: outDir ? path.resolve(outDir) : "",
    files: Object.fromEntries(Object.entries(files).map(([fileName, value]) => [fileName, Array.isArray(value) ? value.length : 1]))
  };

  if (outPath) {
    writeJsonFile(outPath, {
      system,
      files
    });
    report.outPath = path.resolve(outPath);
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
})().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

async function fetchJson(target, bearerToken) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(target, {
      signal: controller.signal,
      headers: compactObject({
        accept: "application/json",
        authorization: bearerToken ? `Bearer ${bearerToken}` : ""
      })
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${target} returned ${response.status}: ${text}`);
    }
    return JSON.parse(text);
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`${target} timed out after 15000 ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalize(system, payload) {
  if (system === "kubernetes") {
    const items = arrayPayload(payload);
    return {
      "kubernetes.json": items.map(toKubernetesSample).filter((row) => row.runId),
      "kubernetes-jobs.json": items.map(toKubernetesJob).filter((row) => row.runId)
    };
  }

  if (system === "scheduler" || system === "scheduler-admission") {
    const rows = arrayPayload(payload).map(toSchedulerSample).filter((row) => row.runId);
    return {
      "scheduler.json": rows,
      "slurm-jobs.json": rows.map(toSlurmJob).filter((row) => row.runId)
    };
  }

  if (system === "grafana") {
    return {
      "grafana.json": arrayPayload(payload).map(toGrafanaSample).filter((row) => row.runId)
    };
  }

  if (system === "billing" || system === "slo" || system === "billing-slo") {
    return {
      "billing-records.json": arrayPayload(payload.billingRecords || payload.billing || payload.records).map(compactObject).filter((row) => row.runId),
      "support-tickets.json": arrayPayload(payload.supportTickets || payload.support || payload.slo).map(compactObject).filter((row) => row.runId)
    };
  }

  if (system === "ebpf") {
    return {
      "ebpf.json": arrayPayload(payload).map(compactObject).filter((row) => row.runId)
    };
  }

  if (system === "redfish") {
    return {
      "redfish.json": redfishPayloadSamples(payload).map(toRedfishSample).filter((row) => row.runId)
    };
  }

  if (system === "nccl") {
    return {
      "nccl-traces.json": arrayPayload(payload).map(compactObject).filter((row) => row.runId)
    };
  }

  if (system === "opportunities" || system === "opportunity") {
    return {
      "opportunities.json": arrayPayload(payload).map(compactObject).filter((row) => row.runId)
    };
  }

  throw new Error(`unsupported source system ${system}`);
}

function toKubernetesSample(item) {
  const metadata = item.metadata || {};
  const labels = metadata.labels || item.labels || {};
  const annotations = metadata.annotations || item.annotations || {};
  const selector = item.spec?.selector?.matchLabels || item.podSelector || {};
  const runId = item.runId || label(labels, "run-id") || label(annotations, "run-id");

  return compactObject({
    runId,
    namespace: metadata.namespace || item.namespace,
    podSelector: typeof selector === "string" ? selector : selectorString(selector),
    labels,
    status: item.status?.phase || item.status?.conditions?.at(-1)?.type || item.status,
    allocation: item.allocation,
    metrics: item.metrics
  });
}

function toKubernetesJob(item) {
  const metadata = item.metadata || {};
  const labels = metadata.labels || item.labels || {};
  const annotations = metadata.annotations || item.annotations || {};
  return compactObject({
    runId: item.runId || label(labels, "run-id") || label(annotations, "run-id"),
    namespace: metadata.namespace || item.namespace,
    name: metadata.name || item.name,
    labels,
    podSelector: toKubernetesSample(item).podSelector
  });
}

function toSchedulerSample(row) {
  return compactObject({
    runId: row.runId || row.job_id || row.jobId,
    schedulerExportId: row.schedulerExportId,
    schedulerName: row.schedulerName || row.scheduler || "scheduler",
    queueName: row.queueName || row.queue || row.partition,
    priorityClass: row.priorityClass || row.qos,
    admissionClass: row.admissionClass,
    requestedGpuShape: row.requestedGpuShape,
    localityPreference: row.localityPreference,
    queuedAt: row.queuedAt,
    admittedAt: row.admittedAt,
    startedAt: row.startedAt,
    queueWaitMinutes: numeric(row.queueWaitMinutes),
    placementQuality: numeric(row.placementQuality),
    idleGpus: numeric(row.idleGpus),
    partialNodes: numeric(row.partialNodes),
    preemptionCount: numeric(row.preemptionCount),
    placementRetries: numeric(row.placementRetries),
    localityMisses: numeric(row.localityMisses),
    backfillCandidates: numeric(row.backfillCandidates),
    pendingJobsAhead: numeric(row.pendingJobsAhead),
    pendingGpuHoursAhead: numeric(row.pendingGpuHoursAhead),
    gpusPerNode: numeric(row.gpusPerNode),
    targetStartMinutes: numeric(row.targetStartMinutes),
    events: row.events,
    sourceContext: row.sourceContext
  });
}

function toSlurmJob(row) {
  return compactObject({
    runId: row.runId || row.job_id || row.jobId,
    job_id: row.job_id || row.jobId || row.runId,
    account: row.account,
    qos: row.qos || row.priorityClass,
    reservation: row.reservation,
    elapsedGpuHours: numeric(row.elapsedGpuHours),
    targetStartMinutes: numeric(row.targetStartMinutes)
  });
}

function toGrafanaSample(row) {
  const variables = row.variables || {};
  return compactObject({
    runId: row.runId || variables.run || variables.runId,
    grafanaBaseUrl: row.grafanaBaseUrl || row.baseUrl,
    dashboardUid: row.dashboardUid || row.uid,
    dashboardTitle: row.dashboardTitle || row.title,
    datasourceUid: row.datasourceUid,
    dashboardUrl: row.dashboardUrl || row.url,
    exploreUrl: row.exploreUrl,
    timeRange: row.timeRange,
    variables
  });
}

function toRedfishSample(row) {
  const serviceRoot = row.serviceRoot || {};
  const metrics = row.metrics || {};
  const health = row.health || {};
  const sourceContext = row.sourceContext || {};

  return compactObject({
    runId: row.runId || row.hostId || sourceContext.hostId,
    hostId: row.hostId || sourceContext.hostId,
    sourceSystem: row.sourceSystem || "redfish",
    collectedAt: row.collectedAt,
    redfishBaseUrl: row.redfishBaseUrl || sourceContext.redfishBaseUrl,
    serviceRoot: compactObject({
      redfishVersion: serviceRoot.redfishVersion || serviceRoot.RedfishVersion,
      uuid: serviceRoot.uuid || serviceRoot.UUID,
      name: serviceRoot.name || serviceRoot.Name,
      vendor: serviceRoot.vendor || serviceRoot.Vendor,
      product: serviceRoot.product || serviceRoot.Product
    }),
    systems: arrayPayload(row.systems).map(compactObject),
    chassis: arrayPayload(row.chassis).map(compactObject),
    managers: arrayPayload(row.managers).map(compactObject),
    firmwareInventory: arrayPayload(row.firmwareInventory).map(compactObject),
    eventService: row.eventService,
    telemetryService: row.telemetryService,
    metrics: compactMetrics(metrics),
    health: compactObject({
      rollup: health.rollup,
      unhealthyResources: arrayPayload(health.unhealthyResources).map(compactObject),
      warnings: arrayPayload(health.warnings)
    }),
    sourceContext: compactObject({
      ...sourceContext,
      redfishBaseUrl: row.redfishBaseUrl || sourceContext.redfishBaseUrl,
      redfishServiceUuid: sourceContext.redfishServiceUuid || serviceRoot.uuid || serviceRoot.UUID,
      redfishVersion: sourceContext.redfishVersion || serviceRoot.redfishVersion || serviceRoot.RedfishVersion,
      redfishHealthRollup: sourceContext.redfishHealthRollup || health.rollup,
      redfishSystemCount: numeric(sourceContext.redfishSystemCount ?? arrayPayload(row.systems).length),
      redfishChassisCount: numeric(sourceContext.redfishChassisCount ?? arrayPayload(row.chassis).length),
      redfishManagerCount: numeric(sourceContext.redfishManagerCount ?? arrayPayload(row.managers).length),
      redfishUnhealthyResources: numeric(sourceContext.redfishUnhealthyResources ?? arrayPayload(health.unhealthyResources).length)
    })
  });
}

function redfishPayloadSamples(payload) {
  if (Array.isArray(payload.sources?.redfish)) return payload.sources.redfish;
  if (Array.isArray(payload.sourceExports?.redfish)) return payload.sourceExports.redfish;
  if (payload && typeof payload === "object" && !Array.isArray(payload) && (payload.runId || payload.systems || payload.chassis || payload.serviceRoot)) return [payload];
  return arrayPayload(payload);
}

function arrayPayload(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.dashboards)) return payload.dashboards;
  return [];
}

function compactMetrics(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, entry]) => Number.isFinite(Number(entry)))
      .map(([key, entry]) => [key, Number(entry)])
  );
}

function label(labels, key) {
  return labels?.[key] || labels?.[`turba.ai/${key}`] || labels?.[`turbalance.ai/${key}`];
}

function selectorString(selector) {
  return Object.entries(selector || {}).map(([key, value]) => `${key}=${value}`).join(",");
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, entry]) => (
      entry !== undefined
      && entry !== null
      && entry !== ""
      && !(typeof entry === "number" && Number.isNaN(entry))
      && !(Array.isArray(entry) && entry.length === 0)
      && !(typeof entry === "object" && !Array.isArray(entry) && Object.keys(entry).length === 0)
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
