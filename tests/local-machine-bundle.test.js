const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { validateSourceBundle } = require("../lib/source-bundle-validator.js");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-machine-bundle-"));
const outPath = path.join(tempDir, "live-machine-bundle.json");
const fleetOutPath = path.join(tempDir, "live-machine-fleet-bundle.json");
const benchmarkOutPath = path.join(tempDir, "live-machine-benchmark-bundle.json");
const benchmarkCachePath = path.join(tempDir, "live-pi-benchmark-cache.json");
const result = spawnSync(process.execPath, [
  "scripts/collect-local-machine-bundle.js",
  "--out",
  outPath,
  "--host-url",
  "http://192.168.10.30:8000",
  "--run-id",
  "machine-demo-test",
  "--ollama-probe",
  "0"
], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024
});

assert.equal(result.status, 0, result.stderr);
assert.ok(fs.existsSync(outPath));

const bundle = JSON.parse(fs.readFileSync(outPath, "utf8"));
const validation = validateSourceBundle(bundle);
assert.equal(validation.ok, true, validation.errors.join("; "));
assert.equal(bundle.ingestion.schemaVersion, "turba.ingestion.v1");
assert.equal(bundle.ingestion.runs.length, 1);
assert.equal(bundle.ingestion.runs[0].id, "machine-demo-test");
assert.ok(bundle.ingestion.runs[0].sourceContext.hostname);
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.platform, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.arch, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.uptimeSeconds, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.clockSource, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.clockSynchronized, "boolean");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.clockTimeUnixMs, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.clockTimeUnixNs, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.clockPtpInstalled, "boolean");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.clockPtpActive, "boolean");
assert.ok(Array.isArray(bundle.ingestion.runs[0].sourceContext.clockSyncServices));
if ("cpuTemperatureC" in bundle.ingestion.runs[0].sourceContext) {
  assert.equal(typeof bundle.ingestion.runs[0].sourceContext.cpuTemperatureC, "number");
}
assert.deepEqual(bundle.sources, {});
assert.ok(bundle.ingestion.sourceAdapters.includes("local-machine"));
assert.ok(bundle.ingestion.runs[0].importedSources.includes("local-machine"));
assert.ok(!bundle.ingestion.runs[0].importedSources.includes("dcgm"));
assert.ok(!bundle.ingestion.runs[0].importedSources.includes("ebpf"));
assert.ok(!bundle.ingestion.runs[0].importedSources.includes("scheduler"));
assert.ok(!bundle.ingestion.runs[0].importedSources.includes("provider"));
assert.ok(Array.isArray(bundle.ingestion.runs[0].sourceContext.dockerContainers));
assert.ok(Array.isArray(bundle.ingestion.runs[0].sourceContext.observedServices));
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gpuComputeProcessQuerySkipped, "boolean");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gpuSampleCached, "boolean");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gpuSampleAgeMs, "number");
assert.ok(Array.isArray(bundle.ingestion.runs[0].sourceContext.ollamaRunningModels));
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.ollamaTelemetryStatus, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.ollamaTokensPerSecond, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.ollamaTimeToFirstTokenMs, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.ollamaProbeCached, "boolean");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.ollamaProbeAgeMs, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gb10Present, "boolean");
assert.ok(Array.isArray(bundle.ingestion.runs[0].sourceContext.gb10MonitoringList));
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gb10MonitoringSummary, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.linuxUmaMemoryTotalBytes, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.linuxUmaMemoryAvailableBytes, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.linuxUmaMemoryUsedPct, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.networkInterface, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.networkLocalAddress, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.networkPeerAddress, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.networkLinkRole, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.networkSelectionReason, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.networkLinkSpeedMbps, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.networkRxBytes, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.networkTxBytes, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.networkRxDrops, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.networkTxDrops, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.networkRxErrors, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.networkTxErrors, "number");
if ("networkUtilizationPct" in bundle.ingestion.runs[0].sourceContext) {
  assert.equal(typeof bundle.ingestion.runs[0].sourceContext.networkUtilizationPct, "number");
}
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.appMetricsReachable, "boolean");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.nsightCuptiProfilingStatus, "string");
assert.ok(Array.isArray(bundle.ingestion.runs[0].sourceContext.nsightCuptiProfilingScripts));
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.ncclRuntimePresent, "boolean");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.ncclRuntimeStatus, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.ncclRuntimeSource, "string");
assert.ok(Array.isArray(bundle.ingestion.runs[0].sourceContext.ncclRuntimeContainers));
assert.ok(Array.isArray(bundle.ingestion.runs[0].sourceContext.ncclRuntimeImages));
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.ncclRuntimeSocketIfname, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.ncclRuntimeHostIp, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.ncclRuntimeDetail, "string");
assert.ok(bundle.metadata.note.includes("Kubernetes, DCGM"));
assert.ok(bundle.metadata.note.includes("not synthesized"));
const localCollectorSource = fs.readFileSync(path.join(root, "scripts/collect-local-machine-bundle.js"), "utf8");
const fleetCollectorSource = fs.readFileSync(path.join(root, "scripts/collect-machine-fleet-bundle.js"), "utf8");
assert.ok(localCollectorSource.includes("collectKafkaSmokeEvidence"));
assert.ok(localCollectorSource.includes("kafkaSmokeMessageId"));
assert.ok(localCollectorSource.includes("collectOllamaTelemetry"));
assert.ok(localCollectorSource.includes("timeToFirstTokenMs"));
assert.ok(localCollectorSource.includes("collectCpuTemperatureC"));
assert.ok(localCollectorSource.includes("vcgencmd"));
assert.ok(localCollectorSource.includes("collectClockSync"));
assert.ok(localCollectorSource.includes("ptp4l"));
assert.ok(localCollectorSource.includes("phc2sys"));
assert.ok(localCollectorSource.includes("chronyc"));
assert.ok(localCollectorSource.includes("TURBALANCE_LINUXPTP_CONTAINERS"));
assert.ok(localCollectorSource.includes("firstRunningDockerContainer"));
assert.ok(localCollectorSource.includes("dockerProcessRunning"));
assert.ok(localCollectorSource.includes("ptpManagementCommand"));
assert.ok(localCollectorSource.includes("GET PORT_DATA_SET"));
assert.ok(localCollectorSource.includes("timesync-status"));
assert.ok(localCollectorSource.includes("parseTimedateTimesyncStatus"));
assert.ok(localCollectorSource.includes("durationTextToNanoseconds"));
assert.ok(localCollectorSource.includes("clockOffsetNs"));
assert.ok(localCollectorSource.includes("buildGb10MonitoringList"));
assert.ok(localCollectorSource.includes("gb10-nvml-nvidia-smi"));
assert.ok(localCollectorSource.includes("linux-uma-memory"));
assert.ok(localCollectorSource.includes("app-metrics"));
assert.ok(localCollectorSource.includes("nsight-cupti-profiling"));
assert.ok(localCollectorSource.includes("detectNcclRuntime"));
assert.ok(localCollectorSource.includes("nccl-runtime"));
assert.ok(localCollectorSource.includes("ncclRuntimePresent"));
assert.ok(localCollectorSource.includes("DGX interconnect"));
assert.ok(localCollectorSource.includes("TURBALANCE_DGX_INTERCONNECT_INTERFACE"));
assert.ok(localCollectorSource.includes("192.168.100."));
assert.ok(localCollectorSource.includes("live-network-rate-cache.json"));
assert.ok(localCollectorSource.includes("readNetworkRateCache"));
assert.ok(localCollectorSource.includes("collectBenchmarkSuite"));
assert.ok(localCollectorSource.includes("benchmarkCpuOpsPerSecond"));
assert.ok(localCollectorSource.includes("live-pi-benchmark-cache.json"));
assert.ok(localCollectorSource.includes("TURBALANCE_PI_BENCHMARKS"));
assert.ok(fleetCollectorSource.includes("TURBALANCE_REMOTE_MACHINES"));
assert.ok(fleetCollectorSource.includes("PI_FLEET_REMOTES"));
assert.ok(fleetCollectorSource.includes("TURBALANCE_PI_FLEET"));
assert.ok(fleetCollectorSource.includes("TURBALANCE_PI_BENCHMARKS"));
assert.ok(fleetCollectorSource.includes("pi-benchmarks"));
assert.ok(fleetCollectorSource.includes("TURBALANCE_DGX_INTERCONNECT_INTERFACE"));
assert.ok(fleetCollectorSource.includes("--dgx-interconnect-interface"));
assert.ok(fleetCollectorSource.includes("buildRemoteUnavailableBundle"));
assert.ok(fleetCollectorSource.includes("remoteCollectionFailures"));
assert.ok(fleetCollectorSource.includes("/home/pi/Analytics"));
assert.ok(fleetCollectorSource.includes("/home/ssh/Analytics"));

const fastOutPath = path.join(tempDir, "live-machine-bundle-fast.json");
const fastResult = spawnSync(process.execPath, [
  "scripts/collect-local-machine-bundle.js",
  "--out",
  fastOutPath,
  "--host-url",
  "http://192.168.10.30:8000",
  "--run-id",
  "machine-demo-fast-test",
  "--fast-refresh",
  "--ollama-probe",
  "0"
], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024
});

assert.equal(fastResult.status, 0, fastResult.stderr);
const fastBundle = JSON.parse(fs.readFileSync(fastOutPath, "utf8"));
assert.equal(fastBundle.ingestion.runs[0].id, "machine-demo-fast-test");
assert.equal(fastBundle.ingestion.runs[0].sourceContext.gpuComputeProcessQuerySkipped, true);
assert.equal(fastBundle.ingestion.runs[0].sourceContext.gpuSampleCached, false);

const benchmarkResult = spawnSync(process.execPath, [
  "scripts/collect-local-machine-bundle.js",
  "--out",
  benchmarkOutPath,
  "--host-url",
  "http://192.168.10.30:8000",
  "--run-id",
  "machine-demo-benchmark-test",
  "--benchmark-suite",
  "--benchmark-duration-ms",
  "25",
  "--benchmark-buffer-mib",
  "1",
  "--benchmark-disk-mib",
  "1",
  "--benchmark-cache",
  benchmarkCachePath,
  "--ollama-probe",
  "0"
], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024
});

assert.equal(benchmarkResult.status, 0, benchmarkResult.stderr);
const benchmarkBundle = JSON.parse(fs.readFileSync(benchmarkOutPath, "utf8"));
const benchmarkContext = benchmarkBundle.ingestion.runs[0].sourceContext;
assert.equal(benchmarkContext.benchmarkSuiteName, "pi-light-v1");
assert.equal(benchmarkContext.benchmarkSuiteStatus, "fresh");
assert.equal(typeof benchmarkContext.benchmarkCpuOpsPerSecond, "number");
assert.equal(typeof benchmarkContext.benchmarkMemoryMiBps, "number");
assert.equal(typeof benchmarkContext.benchmarkDiskWriteMiBps, "number");
assert.equal(typeof benchmarkContext.benchmarkDiskReadMiBps, "number");
assert.equal(typeof benchmarkContext.benchmarkScore, "number");
assert.ok(benchmarkContext.benchmarkCpuOpsPerSecond > 0);
assert.ok(benchmarkContext.benchmarkMemoryMiBps > 0);
assert.ok(benchmarkContext.benchmarkDiskWriteMiBps > 0);
assert.ok(benchmarkContext.benchmarkDiskReadMiBps > 0);
assert.ok(benchmarkBundle.ingestion.sourceAdapters.includes("pi-benchmark"));

const fleetResult = spawnSync(process.execPath, [
  "scripts/collect-machine-fleet-bundle.js",
  "--out",
  fleetOutPath,
  "--host-url",
  "http://192.168.10.30:8000"
], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024
});

assert.equal(fleetResult.status, 0, fleetResult.stderr);
const fleetBundle = JSON.parse(fs.readFileSync(fleetOutPath, "utf8"));
const fleetValidation = validateSourceBundle(fleetBundle);
assert.equal(fleetValidation.ok, true, fleetValidation.errors.join("; "));
assert.equal(fleetBundle.metadata.source, "collect-machine-fleet-bundle.js");
assert.ok(fleetBundle.metadata.note.includes("fleet observation"));
assert.deepEqual(fleetBundle.sources, {});
assert.ok(fleetBundle.ingestion.runs.length >= 1);

console.log("local machine bundle tests passed");
