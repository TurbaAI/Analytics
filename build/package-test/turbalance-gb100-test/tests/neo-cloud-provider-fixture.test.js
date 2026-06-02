const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const analytics = require("../analytics-core.js");

const fixturePath = path.join(__dirname, "../fixtures/neo-cloud-provider-bundle.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

function approximately(actual, expected, epsilon = 0.01) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be within ${epsilon} of ${expected}`);
}

assert.equal(fixture.ingestion.schemaVersion, "turba.ingestion.v1");
assert.equal(fixture.ingestion.runs.length, 2);
assert.equal(fixture.ingestion.entities.tenants["apex-ai"].label, "Apex AI");
assert.equal(fixture.ingestion.entities.reservations["rsv-h100-frontier-q2"].label, "H100 Frontier Q2");
assert.ok(Array.isArray(fixture.sources.provider));
assert.ok(Array.isArray(fixture.sources.prometheus));
assert.ok(Array.isArray(fixture.sources.scheduler));
assert.ok(Array.isArray(fixture.sources.grafana));
assert.ok(Array.isArray(fixture.sources.ebpf));
assert.ok(Array.isArray(fixture.sources.opportunities));
assert.equal(fixture.sources.provider.length, 2);
assert.equal(fixture.sources.scheduler.length, 2);
assert.equal(fixture.sources.grafana.length, 2);
assert.equal(fixture.sources.ebpf.length, 2);
assert.equal(fixture.sources.opportunities.length, 2);

const providerRun = fixture.ingestion.runs.find((run) => run.id === "provider-run-9001");
const providerOverlay = fixture.sources.provider.find((sample) => sample.runId === "provider-run-9001");
const schedulerOverlay = fixture.sources.scheduler.find((sample) => sample.runId === "provider-run-9001");
const grafanaOverlay = fixture.sources.grafana.find((sample) => sample.runId === "provider-run-9001");
const ebpfOverlay = fixture.sources.ebpf.find((sample) => sample.runId === "provider-run-9001");
const opportunityOverlay = fixture.sources.opportunities.find((sample) => sample.runId === "provider-run-9001");

assert.equal(providerRun.refs.tenant, "apex-ai");
assert.equal(providerRun.refs.reservation, "rsv-h100-frontier-q2");
assert.equal(providerOverlay.commercial.billingModel, "reserved-cluster");
assert.equal(providerOverlay.commercial.customerTier, "strategic");
assert.equal(providerOverlay.slo.priority, "p1");
assert.equal(providerOverlay.slo.supportTicketId, "CS-2044");
assert.equal(schedulerOverlay.schedulerExportId, "sched-2026-05-week-4");
assert.equal(schedulerOverlay.placementRetries, 8);
assert.equal(schedulerOverlay.localityMisses, 4);
assert.equal(grafanaOverlay.dashboardUid, "turbalance-provider-overview");
assert.equal(grafanaOverlay.links[0].type, "dashboard");
assert.equal(ebpfOverlay.ebpfExportId, "ebpf-2026-05-week-4");
assert.equal(ebpfOverlay.network.tcpRetransmitPct, 3.2);
assert.equal(ebpfOverlay.storage.blockIoLatencyMsP95, 7);
assert.equal(opportunityOverlay.category, "Fabric + Topology");
assert.equal(opportunityOverlay.owner, "Provider capacity desk");

const finalized = analytics.finalizeSummary({
  allocatedGpuHours: providerRun.allocation.allocatedGpuHours,
  usefulCompute: providerRun.utilization.usefulCompute,
  queueWaitMinutes: providerRun.scheduler.queueWaitMinutes,
  provider: providerOverlay.commercial,
  slo: providerOverlay.slo
}, providerOverlay.commercial.listGpuHourRate);

const economics = analytics.summarizeProviderEconomics(finalized, {
  rate: providerOverlay.commercial.listGpuHourRate
});

approximately(economics.sellableWasteValue, 8732.63);
approximately(economics.queueSloPct, 155);
approximately(economics.queueSloGapMinutes, 11);
approximately(economics.efficiencyGap, 13);
assert.ok(economics.grossMarginPct > 40);

const opportunityEngine = analytics.generateOpportunities({
  ...finalized,
  scope: "job",
  key: providerRun.id,
  label: providerRun.name,
  count: 1,
  gpus: providerRun.allocation.gpus,
  ncclTime: providerRun.communication.ncclTime,
  networkWait: providerRun.communication.networkWait,
  crossPodTraffic: providerRun.communication.crossPodTraffic,
  crossRackTraffic: providerRun.communication.crossRackTraffic,
  placementQuality: providerRun.scheduler.placementQuality,
  partialNodes: providerRun.scheduler.partialNodes,
  idleGpus: providerRun.scheduler.idleGpus,
  noiseEvents: providerRun.reliability.noiseEvents,
  contentionPct: providerRun.reliability.contentionPct,
  stepRegularity: providerRun.reliability.stepRegularity,
  latencyTail: providerRun.reliability.latencyTail,
  cpuPrep: providerRun.inputPipeline.cpuPrep,
  storageWait: providerRun.inputPipeline.storageWait,
  dataloaderStall: providerRun.inputPipeline.dataloaderStall,
  inferenceRequestsM: providerRun.work.inferenceRequestsM,
  provider: providerOverlay.commercial,
  slo: providerOverlay.slo,
  importedOpportunities: [opportunityOverlay],
  sourceItems: [providerRun]
}, { provider: economics, rate: providerOverlay.commercial.listGpuHourRate });
assert.ok(opportunityEngine.opportunities.some((opportunity) => opportunity.title === "Move Apex pretraining into a single pod admission window"));

const schedulerSimulator = analytics.simulateSchedulerScenarios({
  ...finalized,
  gpus: providerRun.allocation.gpus,
  placementQuality: providerRun.scheduler.placementQuality,
  partialNodes: providerRun.scheduler.partialNodes,
  idleGpus: providerRun.scheduler.idleGpus,
  crossPodTraffic: providerRun.communication.crossPodTraffic,
  crossRackTraffic: providerRun.communication.crossRackTraffic,
  ncclTime: providerRun.communication.ncclTime,
  provider: providerOverlay.commercial,
  slo: providerOverlay.slo,
  schedulerEvidence: {
    eventCount: schedulerOverlay.events.length,
    placementRetries: schedulerOverlay.placementRetries,
    localityMisses: schedulerOverlay.localityMisses,
    backfillCandidates: schedulerOverlay.backfillCandidates,
    pendingJobsAhead: schedulerOverlay.pendingJobsAhead,
    pendingGpuHoursAhead: schedulerOverlay.pendingGpuHoursAhead,
    gpusPerNode: schedulerOverlay.gpusPerNode
  }
}, { rate: providerOverlay.commercial.listGpuHourRate });
assert.ok(schedulerSimulator.recommended.evidence.includes("Scheduler evidence"));
assert.ok(schedulerSimulator.scenarios.some((scenario) => scenario.sourceEvidence.schedulerEvents > 0));

console.log("neo-cloud provider fixture tests passed");
