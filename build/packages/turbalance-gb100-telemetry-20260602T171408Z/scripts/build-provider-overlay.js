#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const inputDir = path.resolve(process.argv[2] || path.join(__dirname, "..", "fixtures", "provider-export-inputs"));

function readJsonArray(fileName) {
  const fullPath = path.join(inputDir, fileName);
  if (!fs.existsSync(fullPath)) return [];

  const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`${fileName} must contain a JSON array`);
  }

  return parsed;
}

function byRunId(rows, getter = (row) => row.runId) {
  const index = new Map();

  rows.forEach((row) => {
    const runId = String(getter(row) || "").trim();
    if (!runId) return;
    index.set(runId, { ...(index.get(runId) || {}), ...row });
  });

  return index;
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

function label(labels, key) {
  return labels?.[key] || labels?.[`turba.ai/${key}`];
}

const kubernetesJobs = byRunId(readJsonArray("kubernetes-jobs.json"));
const slurmJobs = byRunId(readJsonArray("slurm-jobs.json"), (row) => row.runId || row.job_id || row.jobId);
const billingRecords = byRunId(readJsonArray("billing-records.json"));
const supportTickets = byRunId(readJsonArray("support-tickets.json"));

const runIds = new Set([
  ...kubernetesJobs.keys(),
  ...slurmJobs.keys(),
  ...billingRecords.keys(),
  ...supportTickets.keys()
]);

const provider = Array.from(runIds).sort().map((runId) => {
  const kubernetes = kubernetesJobs.get(runId) || {};
  const slurm = slurmJobs.get(runId) || {};
  const billing = billingRecords.get(runId) || {};
  const support = supportTickets.get(runId) || {};
  const labels = kubernetes.labels || {};

  return compactObject({
    runId,
    tenant: label(labels, "tenant") || billing.tenant || support.tenant,
    account: label(labels, "account") || slurm.account || billing.account,
    reservation: label(labels, "reservation") || slurm.reservation || billing.reservation,
    providerExportId: billing.providerExportId,
    billingAccountId: billing.billingAccountId,
    reservationWindow: billing.reservationWindow || slurm.reservationWindow,
    sourceContext: compactObject({
      namespace: kubernetes.namespace,
      podSelector: kubernetes.podSelector,
      slurmJobId: slurm.job_id || slurm.jobId
    }),
    commercial: compactObject({
      billingModel: billing.billingModel,
      customerTier: billing.customerTier,
      contractId: billing.contractId,
      listGpuHourRate: numeric(billing.listGpuHourRate),
      floorGpuHourCost: numeric(billing.floorGpuHourCost),
      committedGpuHours: numeric(billing.committedGpuHours),
      burstGpuHours: numeric(billing.burstGpuHours),
      billableGpuHours: numeric(billing.billableGpuHours ?? slurm.elapsedGpuHours),
      sellableGpuHours: numeric(billing.sellableGpuHours ?? slurm.elapsedGpuHours)
    }),
    slo: compactObject({
      priority: label(labels, "priority") || slurm.qos || support.priority,
      targetStartMinutes: numeric(support.targetStartMinutes ?? slurm.targetStartMinutes),
      targetEfficiency: numeric(support.targetEfficiency),
      supportTicketId: label(labels, "support-ticket") || support.supportTicketId
    })
  });
});

process.stdout.write(`${JSON.stringify({ sources: { provider } }, null, 2)}\n`);
