const assert = require("node:assert/strict");
const vm = require("node:vm");
const analytics = require("../analytics-core.js");

const { appBundleSource } = require("./_app-bundle.js");
const appSource = appBundleSource();
const storage = new Map();
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
  URLSearchParams,
  window: {
    TurbaAnalytics: analytics,
    TurbaNcclTraceParser: null,
    TurbaNcclTraceFixtures: [],
    location: {
      search: "",
      hostname: "example.test"
    },
    localStorage: {
      getItem: (key) => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => {
        storage.set(key, String(value));
        return true;
      },
      removeItem: (key) => {
        storage.delete(key);
      }
    }
  },
  document: {
    addEventListener: () => {}
  }
};

vm.createContext(context);
vm.runInContext(appSource, context);

function machineItem(host, timestamp, cpu, ram, gpu = 0) {
  return {
    id: `run-${host}-${timestamp}`,
    name: host,
    cluster: host,
    gpuUtil: gpu,
    hbmCapacity: 10,
    source: {
      adapters: ["local-machine"],
      context: {
        hostname: host,
        generatedAt: timestamp,
        cpuUsagePct: cpu,
        memoryUsedPct: ram,
        diskUsedPct: 40,
        gpuPresent: true,
        gpuUtilizationPct: gpu,
        gpuMemoryUsedPct: 10,
        memoryTotalBytes: 1024,
        memoryAvailableBytes: 512,
        networkRxBytesPerSecond: 1000,
        networkTxBytesPerSecond: 2000
      }
    }
  };
}

context.recordLiveTelemetrySamplesFromItems([
  machineItem("secret-host-a", "2026-06-24T12:00:00.000Z", 10, 20, 30)
]);
context.recordLiveTelemetrySamplesFromItems([
  machineItem("secret-host-b", "2026-06-24T12:00:01.000Z", 40, 50, 60)
]);
context.recordLiveTelemetrySamplesFromItems([
  machineItem("secret-host-a", "2026-06-24T12:00:02.000Z", 15, 25, 35)
]);

let history = vm.runInContext("liveTelemetryHistory", context);
assert.equal(history.length, 3);
assert.equal(context.liveTelemetrySamplesForHost("secret-host-a").length, 2);
assert.equal(context.liveTelemetrySamplesForHost("secret-host-b").length, 1);
assert.equal(context.liveTelemetryRetainedHostCount(), 2);

let persisted = JSON.parse(storage.get("turba.analytics.workspace.v2"));
assert.equal(persisted.liveTelemetryHistory.length, 3, "live samples should be saved into the workspace store");
assert.equal(persisted.liveTelemetryHistory.filter((sample) => sample.host === "secret-host-a").length, 2);

context.recordLiveTelemetrySamplesFromItems([
  machineItem("secret-host-b", "2026-06-24T12:00:01.000Z", 41, 51, 61)
]);
history = vm.runInContext("liveTelemetryHistory", context);
assert.equal(history.length, 3, "same host/timestamp samples should dedupe");
assert.equal(context.liveTelemetrySamplesForHost("secret-host-b")[0].cpu, 41);
persisted = JSON.parse(storage.get("turba.analytics.workspace.v2"));
assert.equal(persisted.liveTelemetryHistory.length, 3);
assert.equal(persisted.liveTelemetryHistory.find((sample) => sample.host === "secret-host-b").cpu, 41);

const store = vm.runInContext(`createWorkspaceStore(activeIngestion, {
  savedAt: new Date("2026-06-24T12:00:03.000Z"),
  lastAnalysisAt: state.lastAnalysis,
  liveTelemetryHistory
})`, context);
assert.equal(store.liveTelemetryHistory.length, 3);

const redacted = context.redactWorkspaceStore(store);
const serialized = JSON.stringify(redacted);
assert.ok(!serialized.includes("secret-host-a"));
assert.ok(!serialized.includes("secret-host-b"));
assert.deepEqual(
  JSON.parse(JSON.stringify(redacted.liveTelemetryHistory.map((sample) => sample.host))),
  ["host-1", "host-2", "host-1"]
);

const series = context.fleetAggregateTelemetrySeries({
  rows: [
    { host: "secret-host-a", key: "secrethosta", cpuUsagePct: 15, memoryUsedPct: 25, diskUsedPct: 40, gpuPresent: true, gpuUtilizationPct: 35, networkThroughputBps: 2000, score: 90 },
    { host: "secret-host-b", key: "secrethostb", cpuUsagePct: 41, memoryUsedPct: 51, diskUsedPct: 40, gpuPresent: true, gpuUtilizationPct: 61, networkThroughputBps: 2000, score: 80 }
  ]
}, "cpu");
assert.equal(series.length, 2);
assert.notEqual(series[0].color, series[1].color);
assert.equal(series[0].history.length, 2);
assert.equal(series[1].history.length, 1);

console.log("live telemetry history tests passed");
