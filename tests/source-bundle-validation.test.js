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
  () => context.buildIngestionFromExternalPayload({ sources: { scheduler: [{}] } }),
  /sources\.scheduler\[1\] is missing runId\./
);

assert.throws(
  () => context.buildIngestionFromExternalPayload({ sources: { grafana: [{}] } }),
  /sources\.grafana\[1\] is missing runId\./
);

assert.throws(
  () => context.buildIngestionFromExternalPayload({ sources: { opportunities: [{}] } }),
  /sources\.opportunities\[1\] is missing runId\./
);

assert.throws(
  () => context.buildIngestionFromExternalPayload({ ncclTraces: [{ events: [] }] }),
  /ncclTraces\[1\] is missing runId\./
);

const providerTemplate = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/provider-overlay-template.json"), "utf8"));
const sourceBundle = context.buildIngestionFromExternalPayload(providerTemplate);
assert.ok(sourceBundle.sourceAdapters.includes("provider"));
assert.ok(sourceBundle.sourceAdapters.includes("scheduler"));
assert.ok(sourceBundle.sourceAdapters.includes("grafana"));
assert.ok(sourceBundle.sourceAdapters.includes("opportunities"));

const opportunityBundle = context.buildIngestionFromExternalPayload({
  ingestion: {
    schemaVersion: "turba.ingestion.v1",
    runs: [
      {
        id: "run-opportunity",
        name: "opportunity import",
        allocation: { allocatedGpuHours: 10 }
      }
    ]
  },
  sources: {
    opportunities: [
      {
        runId: "run-opportunity",
        category: "Inference Economics",
        title: "Tune batch sizing",
        impactDollars: 120,
        impactGpuHours: 20,
        riskScore: 66,
        confidence: 80
      }
    ]
  }
});
assert.ok(opportunityBundle.sourceAdapters.includes("opportunities"));
assert.equal(opportunityBundle.runs[0].opportunities[0].title, "Tune batch sizing");

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
        network: { tcpRetransmitPct: 3, socketLatencyMsP95: 42, utilizationPct: 63 },
        storage: { blockIoLatencyMsP95: 11, filesystemLatencyMsP95: 16 },
        noise: { noisyNeighborScore: 67, noiseEvents: 2 }
      }
    ]
  }
});
const ebpfRun = ebpfBundle.runs[0];
assert.ok(ebpfBundle.sourceAdapters.includes("ebpf"));
assert.ok(ebpfRun.communication.networkWait > 0);
assert.equal(ebpfRun.communication.networkUtilization, 63);
assert.ok(ebpfRun.inputPipeline.storageWait > 0);
assert.ok(ebpfRun.inputPipeline.cpuPrep > 0);
assert.equal(ebpfRun.reliability.noiseEvents, 2);
assert.equal(ebpfRun.sourceContext.ebpfExportId, "ebpf-test");
assert.equal(ebpfRun.sourceContext.cgroupPath, "/kubepods.slice/training/trainer-0");

const schedulerBundle = context.buildIngestionFromExternalPayload({
  ingestion: {
    schemaVersion: "turba.ingestion.v1",
    runs: [
      {
        id: "run-scheduler",
        name: "scheduler import",
        allocation: { allocatedGpuHours: 10, gpus: 8 }
      }
    ]
  },
  sources: {
    scheduler: [
      {
        runId: "run-scheduler",
        schedulerExportId: "sched-test",
        schedulerName: "kueue",
        queueName: "training",
        priorityClass: "p1",
        requestedGpuShape: "1x8-h100",
        queuedAt: "2026-05-30T10:00:00Z",
        startedAt: "2026-05-30T10:22:00Z",
        placementQuality: 61,
        partialNodes: 1,
        placementRetries: 3,
        localityMisses: 2,
        events: [
          { type: "placement_retry" },
          { type: "locality_miss" }
        ]
      }
    ]
  }
});
const schedulerRun = schedulerBundle.runs[0];
assert.ok(schedulerBundle.sourceAdapters.includes("scheduler"));
assert.equal(schedulerRun.scheduler.queueWaitMinutes, 22);
assert.equal(schedulerRun.scheduler.placementQuality, 61);
assert.equal(schedulerRun.schedulerEvidence.schedulerName, "kueue");
assert.equal(schedulerRun.schedulerEvidence.eventCount, 2);
assert.equal(schedulerRun.schedulerEvidence.placementRetries, 3);
assert.equal(schedulerRun.sourceContext.schedulerExportId, "sched-test");
assert.equal(schedulerRun.sourceContext.queueName, "training");

const grafanaBundle = context.buildIngestionFromExternalPayload({
  ingestion: {
    schemaVersion: "turba.ingestion.v1",
    runs: [
      {
        id: "run-grafana",
        name: "grafana import",
        allocation: { allocatedGpuHours: 10 }
      }
    ]
  },
  sources: {
    grafana: [
      {
        runId: "run-grafana",
        grafanaBaseUrl: "https://grafana.example",
        instanceName: "grafana-prod",
        orgId: "1",
        dashboardUid: "turbalance-provider-overview",
        dashboardTitle: "turbalance Provider Overview",
        datasourceUid: "prometheus-main",
        datasourceName: "Prometheus Main",
        timeRange: { from: "now-6h", to: "now" },
        variables: { run: "run-grafana", tenant: "tenant-a" },
        dashboardUrl: "https://grafana.example/d/turbalance-provider-overview/turbalance-provider-overview?var-run=run-grafana",
        exploreUrl: "https://grafana.example/explore?orgId=1"
      }
    ]
  }
});
const grafanaRun = grafanaBundle.runs[0];
assert.ok(grafanaBundle.sourceAdapters.includes("grafana"));
assert.equal(grafanaRun.grafanaContext.dashboardUid, "turbalance-provider-overview");
assert.equal(grafanaRun.grafanaContext.datasourceName, "Prometheus Main");
assert.equal(grafanaRun.grafanaContext.links.length, 2);
assert.equal(grafanaRun.sourceContext.grafanaInstance, "grafana-prod");
assert.equal(grafanaRun.sourceContext.grafanaDatasourceUid, "prometheus-main");

console.log("source bundle validation tests passed");
