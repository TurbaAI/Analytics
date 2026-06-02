#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const inputDir = path.resolve(process.argv[2] || path.join(__dirname, "..", "fixtures", "scheduler-export-inputs"));

function readJsonArray(fileName) {
  const fullPath = path.join(inputDir, fileName);
  if (!fs.existsSync(fullPath)) return [];

  const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`${fileName} must contain a JSON array`);
  }

  return parsed;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => (
      entry !== undefined
      && entry !== null
      && entry !== ""
      && !(typeof entry === "number" && Number.isNaN(entry))
      && !(typeof entry === "object" && !Array.isArray(entry) && Object.keys(entry).length === 0)
    ))
  );
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function pick(row, ...keys) {
  return keys.map((key) => row[key]).find((value) => value !== undefined && value !== null && value !== "");
}

const rows = readJsonArray("scheduler-events.json");

const scheduler = rows
  .map((row) => compactObject({
    runId: row.runId,
    schedulerExportId: row.schedulerExportId,
    schedulerName: pick(row, "schedulerName", "scheduler"),
    queueName: pick(row, "queueName", "queue", "partition"),
    priorityClass: pick(row, "priorityClass", "priority", "qos"),
    admissionClass: pick(row, "admissionClass", "admission"),
    requestedGpuShape: pick(row, "requestedGpuShape", "shape"),
    localityPreference: pick(row, "localityPreference", "locality"),
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
    events: Array.isArray(row.events) ? row.events : undefined,
    sourceContext: compactObject({
      cluster: row.cluster,
      namespace: row.namespace,
      slurmJobId: row.slurmJobId,
      kueueWorkload: row.kueueWorkload
    })
  }))
  .filter((sample) => sample.runId);

process.stdout.write(`${JSON.stringify({ sources: { scheduler } }, null, 2)}\n`);
