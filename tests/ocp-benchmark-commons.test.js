const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-ocp-commons-"));
const bundlePath = path.join(tempDir, "source-bundle.json");
const outPath = path.join(tempDir, "ocp-commons.json");

const sourceBundle = {
  ingestion: {
    schemaVersion: "turba.ingestion.v1",
    runs: [
      {
        id: "run-private-host-a",
        importedSources: ["local-machine", "pi-benchmark"],
        sourceContext: {
          hostname: "private-host-a",
          platform: "linux",
          arch: "arm64",
          cpuModel: "ARM Neoverse-N-class",
          cpuCount: 20,
          gpuPresent: true,
          gpuName: "NVIDIA GB10",
          gpuMemoryTotalMiB: 131072,
          gpuPowerWatts: 45,
          gpuPcie: "gen5 x16",
          gpuProcessInspectorStatus: "observed",
          gpuProcessCount: 1,
          gpuProcessMemoryMiB: 256,
          gpuThermalQualificationStatus: "pass",
          gpuThermalQualificationComparable: true,
          gpuThermalQualificationSummary: "pass: max GPU 47 C with 40 C slowdown margin",
          gpuThermalMarginToSlowdownC: 40,
          gpuThermalMarginToMaxOperatingC: 36,
          gpuThermalThrottleActive: false,
          gpuPowerLimitWatts: 80,
          gpuTopologyStatus: "observed",
          gpuTopologyFingerprint: "topology-private-fingerprint",
          gpuTopologySummary: "1 GPU, 0 NVLink peer links, 0 PCIe/host peer links",
          gpuTopologyPeerLinkCount: 0,
          gpuTopologyNvlinkLinks: 0,
          gpuTopologyPcieLinks: 0,
          hardwareFaultLevel: "healthy",
          hardwareGpuXidCount: 0,
          networkLinkSpeedMbps: 10000,
          benchmarkSuiteName: "pi-light-v1",
          benchmarkSuiteStatus: "fresh",
          benchmarkGeneratedAt: "2026-06-16T00:00:00.000Z",
          benchmarkDurationMs: 450,
          benchmarkCpuOpsPerSecond: 4200000,
          benchmarkMemoryMiBps: 18500,
          benchmarkDiskReadMiBps: 920,
          benchmarkDiskWriteMiBps: 760,
          benchmarkScore: 83.2,
          benchmarkOcpCommonsDataset: "ocp-design-partner-corpus",
          benchmarkOcpCommonsPeerCount: 128,
          benchmarkOcpCommonsPercentile: 74.5,
          benchmarkOcpCommonsBinning: "p50-p75"
        }
      }
    ],
    sourceAdapters: ["local-machine", "pi-benchmark"]
  },
  sources: {}
};

fs.writeFileSync(bundlePath, `${JSON.stringify(sourceBundle, null, 2)}\n`);

const result = spawnSync(process.execPath, [
  "scripts/export-ocp-benchmark-commons.js",
  "--bundle",
  bundlePath,
  "--out",
  outPath,
  "--dataset",
  "ocp-benchmark-commons-proposed-v1",
  "--member-id",
  "Turbalance Internal Private Member",
  "--salt",
  "test-salt"
], {
  cwd: root,
  encoding: "utf8"
});

assert.equal(result.status, 0, result.stderr);
assert.ok(fs.existsSync(outPath));

const exported = JSON.parse(fs.readFileSync(outPath, "utf8"));
assert.equal(exported.schemaVersion, "turba.ocp_benchmark_commons.v1");
assert.equal(exported.records.length, 1);
assert.equal(exported.records[0].dataset, "ocp-design-partner-corpus");
assert.equal(exported.records[0].hardware.class, "NVIDIA GB10 host");
assert.equal(exported.records[0].hardware.gpuModel, "NVIDIA GB10");
assert.equal(exported.records[0].hardware.gpuPcie, "gen5 x16");
assert.equal(exported.records[0].hardware.topologyFingerprint, "topology-private-fingerprint");
assert.equal(exported.records[0].qualification.comparable, true);
assert.equal(exported.records[0].qualification.status, "qualified");
assert.equal(exported.records[0].qualification.thermalStatus, "pass");
assert.equal(exported.records[0].qualification.thermalMarginToSlowdownC, 40);
assert.equal(exported.records[0].qualification.topologyStatus, "observed");
assert.equal(exported.records[0].qualification.processInspectorStatus, "observed");
assert.equal(exported.records[0].qualification.requiredEvidence.thermal, true);
assert.equal(exported.records[0].qualification.requiredEvidence.topology, true);
assert.equal(exported.records[0].metrics.cpuOpsPerSecond.value, 4200000);
assert.equal(exported.records[0].metrics.memoryMiBps.unit, "MiB/s");
assert.equal(exported.records[0].corpusComparison.peerCount, 128);
assert.equal(exported.records[0].corpusComparison.percentile, 74.5);
assert.ok(exported.records[0].recordId.startsWith("ocp-"));

const outputText = fs.readFileSync(outPath, "utf8");
assert.ok(!outputText.includes("private-host-a"));
assert.ok(!outputText.includes("Turbalance Internal Private Member"));

const schema = JSON.parse(fs.readFileSync(path.join(root, "schemas/turba-ocp-benchmark-commons.v1.schema.json"), "utf8"));
const fixture = JSON.parse(fs.readFileSync(path.join(root, "fixtures/ocp-benchmark-commons.example.json"), "utf8"));
assert.equal(schema.properties.schemaVersion.const, "turba.ocp_benchmark_commons.v1");
assert.equal(fixture.schemaVersion, "turba.ocp_benchmark_commons.v1");
assert.ok(fixture.records[0].metrics.cpuOpsPerSecond);

console.log("OCP benchmark commons export tests passed");
