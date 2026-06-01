const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const parser = require("../nccl-trace-parser.js");

const fixturePath = path.join(__dirname, "../fixtures/external-source-bundle.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

assert.equal(fixture.sources.prometheus.length, 1);
assert.equal(fixture.sources.prometheus[0].runId, "run-7421");
assert.equal(fixture.sources.prometheus[0].metrics.turba_useful_compute_ratio, 0.52);
assert.equal(fixture.sources.provider.length, 1);
assert.equal(fixture.sources.provider[0].commercial.billingModel, "reserved-cluster");
assert.equal(fixture.sources.provider[0].slo.supportTicketId, "CS-1842");
assert.equal(fixture.sources.ebpf.length, 1);
assert.equal(fixture.sources.ebpf[0].ebpfExportId, "ebpf-2026-05-week-4");
assert.equal(fixture.sources.ebpf[0].network.tcpRetransmitPct, 2.4);
assert.equal(fixture.ncclTraces.length, 1);

const topologyIndex = {
  "A1-01": { pod: "pod-a", rack: "A1" },
  "A1-02": { pod: "pod-a", rack: "A1" },
  "A1-03": { pod: "pod-a", rack: "A1" },
  "A2-01": { pod: "pod-a", rack: "A2" },
  "A2-02": { pod: "pod-a", rack: "A2" },
  "B1-01": { pod: "pod-b", rack: "B1" },
  "B2-02": { pod: "pod-b", rack: "B2" }
};

const parsedTrace = parser.parseNcclTrace(fixture.ncclTraces[0], topologyIndex);

assert.equal(parsedTrace.runId, "run-7421");
assert.equal(parsedTrace.eventCount, 3);
assert.equal(parsedTrace.totalDurationMs, 1160);
assert.equal(parsedTrace.hottestTier.tier, "cross-pod");
assert.ok(parsedTrace.crossPodTraffic > 50);
assert.ok(parsedTrace.crossRackTraffic > parsedTrace.crossPodTraffic);

console.log("external-ingestion fixture tests passed");
