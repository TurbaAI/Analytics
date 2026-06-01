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
assert.ok(Array.isArray(fixture.sources.ebpf));
assert.equal(fixture.sources.provider.length, 2);
assert.equal(fixture.sources.ebpf.length, 2);

const providerRun = fixture.ingestion.runs.find((run) => run.id === "provider-run-9001");
const providerOverlay = fixture.sources.provider.find((sample) => sample.runId === "provider-run-9001");
const ebpfOverlay = fixture.sources.ebpf.find((sample) => sample.runId === "provider-run-9001");

assert.equal(providerRun.refs.tenant, "apex-ai");
assert.equal(providerRun.refs.reservation, "rsv-h100-frontier-q2");
assert.equal(providerOverlay.commercial.billingModel, "reserved-cluster");
assert.equal(providerOverlay.commercial.customerTier, "strategic");
assert.equal(providerOverlay.slo.priority, "p1");
assert.equal(providerOverlay.slo.supportTicketId, "CS-2044");
assert.equal(ebpfOverlay.ebpfExportId, "ebpf-2026-05-week-4");
assert.equal(ebpfOverlay.network.tcpRetransmitPct, 3.2);
assert.equal(ebpfOverlay.storage.blockIoLatencyMsP95, 7);

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

console.log("neo-cloud provider fixture tests passed");
