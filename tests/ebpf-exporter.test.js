const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");

const result = spawnSync(
  process.execPath,
  ["scripts/build-ebpf-overlay.js", "fixtures/ebpf-export-inputs"],
  {
    cwd: root,
    encoding: "utf8"
  }
);

assert.equal(result.status, 0, result.stderr);

const overlay = JSON.parse(result.stdout);
assert.ok(Array.isArray(overlay.sources.ebpf));
assert.equal(overlay.sources.ebpf.length, 2);

const apex = overlay.sources.ebpf.find((sample) => sample.runId === "provider-run-9001");
assert.equal(apex.ebpfExportId, "ebpf-2026-05-week-4");
assert.equal(apex.collector, "bpftrace-summary");
assert.equal(apex.host, "h100-a1-01.internal");
assert.equal(apex.node, "A1-01");
assert.equal(apex.namespace, "frontier-training");
assert.equal(apex.podName, "apex-70b-pretrain-9001-worker-0");
assert.equal(apex.containerName, "trainer");
assert.equal(apex.cpu.offCpuTimePct, 9);
assert.equal(apex.scheduler.runQueueLatencyMsP95, 12);
assert.equal(apex.network.tcpRetransmitPct, 3.2);
assert.equal(apex.network.utilizationPct, 74);
assert.equal(apex.storage.blockIoLatencyMsP95, 7);
assert.equal(apex.noise.noiseEvents, 1);

const vectorcart = overlay.sources.ebpf.find((sample) => sample.runId === "provider-svc-4102");
assert.equal(vectorcart.noise.noisyNeighborScore, 71);
assert.equal(vectorcart.noise.noiseEvents, 3);

console.log("eBPF exporter tests passed");
