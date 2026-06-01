const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const analytics = require("../analytics-core.js");

const appSource = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const context = {
  console,
  Date,
  Intl,
  JSON,
  Map,
  Math,
  Number,
  Object,
  Set,
  String,
  window: {
    TurbaAnalytics: analytics,
    TurbaNcclTraceParser: null,
    TurbaNcclTraceFixtures: [],
    localStorage: {
      getItem: () => null,
      setItem: () => true
    }
  },
  document: {
    addEventListener: () => {}
  }
};

vm.createContext(context);
vm.runInContext(appSource, context);

assert.throws(
  () => context.buildIngestionFromExternalPayload({ sources: { provider: [{}] } }),
  /sources\.provider\[1\] is missing runId\./
);

assert.throws(
  () => context.buildIngestionFromExternalPayload({ sources: { prometheus: [null] } }),
  /sources\.prometheus\[1\] must be an object\./
);

assert.throws(
  () => context.buildIngestionFromExternalPayload({ sources: { ebpf: [{}] } }),
  /sources\.ebpf\[1\] is missing runId\./
);

assert.throws(
  () => context.buildIngestionFromExternalPayload({ ncclTraces: [{ events: [] }] }),
  /ncclTraces\[1\] is missing runId\./
);

const providerTemplate = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/provider-overlay-template.json"), "utf8"));
const sourceBundle = context.buildIngestionFromExternalPayload(providerTemplate);
assert.ok(sourceBundle.sourceAdapters.includes("provider"));

const ebpfBundle = context.buildIngestionFromExternalPayload({
  ingestion: {
    schemaVersion: "turba.ingestion.v1",
    runs: [
      {
        id: "run-ebpf",
        name: "ebpf import",
        allocation: { allocatedGpuHours: 10 }
      }
    ]
  },
  sources: {
    ebpf: [
      {
        runId: "run-ebpf",
        ebpfExportId: "ebpf-test",
        host: "host-a",
        node: "node-a",
        namespace: "training",
        podName: "trainer-0",
        containerName: "trainer",
        cgroupPath: "/kubepods.slice/training/trainer-0",
        cpu: { offCpuTimePct: 11, cpuThrottlePct: 7 },
        scheduler: { runQueueLatencyMsP95: 21 },
        network: { tcpRetransmitPct: 3, socketLatencyMsP95: 42 },
        storage: { blockIoLatencyMsP95: 11, filesystemLatencyMsP95: 16 },
        noise: { noisyNeighborScore: 67, noiseEvents: 2 }
      }
    ]
  }
});
const ebpfRun = ebpfBundle.runs[0];
assert.ok(ebpfBundle.sourceAdapters.includes("ebpf"));
assert.ok(ebpfRun.communication.networkWait > 0);
assert.ok(ebpfRun.inputPipeline.storageWait > 0);
assert.ok(ebpfRun.inputPipeline.cpuPrep > 0);
assert.equal(ebpfRun.reliability.noiseEvents, 2);
assert.equal(ebpfRun.sourceContext.ebpfExportId, "ebpf-test");
assert.equal(ebpfRun.sourceContext.cgroupPath, "/kubepods.slice/training/trainer-0");

console.log("source bundle validation tests passed");
