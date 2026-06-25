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
const lakehousePath = path.join(tempDir, "lakehouse");
fs.mkdirSync(lakehousePath, { recursive: true });
fs.writeFileSync(path.join(lakehousePath, "part-000.jsonl"), `${JSON.stringify({ ok: true })}\n`);
const result = spawnSync(process.execPath, [
  "scripts/collect-local-machine-bundle.js",
  "--out",
  outPath,
  "--host-url",
  "http://192.168.10.30:8000",
  "--run-id",
  "machine-demo-test",
  "--ollama-probe",
  "0",
  "--lake-root",
  lakehousePath
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
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gpuBackendRequested, "string");
assert.ok(Array.isArray(bundle.ingestion.runs[0].sourceContext.gpuAttemptedSources));
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gpuProcessInspector, "object");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gpuProcessInspectorStatus, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gpuProcessInspectorSummary, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gpuProcessCount, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gpuProcessMemoryMiB, "number");
assert.ok(Array.isArray(bundle.ingestion.runs[0].sourceContext.gpuProcessOwners));
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gpuThermalQualification, "object");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gpuThermalQualificationStatus, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gpuThermalQualificationSummary, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gpuThermalQualificationComparable, "boolean");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gpuThermalThrottleActive, "boolean");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gpuTopology, "object");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gpuTopologyStatus, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gpuTopologyFingerprint, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gpuTopologySummary, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gpuTopologyDeviceCount, "number");
assert.ok(Array.isArray(bundle.ingestion.runs[0].sourceContext.gpuTopologyMatrix));
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
assert.equal(bundle.ingestion.runs[0].sourceContext.lakehouseRoot, lakehousePath);
assert.equal(bundle.ingestion.runs[0].sourceContext.lakehouseExists, true);
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.lakehouseMeasuredAt, "string");
assert.ok(bundle.ingestion.runs[0].sourceContext.lakehouseUsedBytes > 0);
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.lakehouseDiskTotalBytes, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.lakehouseDiskUsedBytes, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.lakehouseDiskAvailableBytes, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.lakehouseDiskUsedPct, "number");
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
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.networkRxDropsDelta, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.networkTxDropsDelta, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.networkRxErrorsDelta, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.networkTxErrorsDelta, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.networkCounterBaselineEstablished, "boolean");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.networkCounterResetObserved, "boolean");
if ("networkUtilizationPct" in bundle.ingestion.runs[0].sourceContext) {
  assert.equal(typeof bundle.ingestion.runs[0].sourceContext.networkUtilizationPct, "number");
}
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.appMetricsReachable, "boolean");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.collectorGatewayReachable, "boolean");
if ("collectorIncomingReportsPerMinute" in bundle.ingestion.runs[0].sourceContext) {
  assert.equal(typeof bundle.ingestion.runs[0].sourceContext.collectorIncomingReportsPerMinute, "number");
}
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.hardwareHealthScore, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.hardwareFaultScore, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.hardwareFaultLevel, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.hardwareFaultCount, "number");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.hardwareRepairAction, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.hardwareRepairRequiresApproval, "boolean");
assert.ok(Array.isArray(bundle.ingestion.runs[0].sourceContext.hardwareFaults));
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
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.benchmarkOcpCommonsDataset, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.benchmarkOcpCommonsUrl, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.benchmarkOcpCommonsHardwareClass, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.benchmarkOcpCommonsConfigHash, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.benchmarkOcpCommonsBinning, "string");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.benchmarkOcpCommonsPolicy, "string");
assert.ok(bundle.metadata.note.includes("Kubernetes, DCGM"));
assert.ok(bundle.metadata.note.includes("not synthesized"));
assert.ok(bundle.metadata.note.includes("gpustat/NVML"));
const localCollectorSource = fs.readFileSync(path.join(root, "scripts/collect-local-machine-bundle.js"), "utf8");
const fleetCollectorSource = fs.readFileSync(path.join(root, "scripts/collect-machine-fleet-bundle.js"), "utf8");
assert.ok(localCollectorSource.includes("collectKafkaSmokeEvidence"));
assert.ok(localCollectorSource.includes("kafkaSmokeMessageId"));
assert.ok(localCollectorSource.includes("collectOllamaTelemetry"));
assert.ok(localCollectorSource.includes("parseCollectorGatewayMetrics"));
assert.ok(localCollectorSource.includes("turbalance_collector_incoming_telemetry_reports_per_minute"));
assert.ok(localCollectorSource.includes("collectHardwareHealth"));
assert.ok(localCollectorSource.includes("machine-check"));
assert.ok(localCollectorSource.includes("hardwareRepairAction"));
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
assert.ok(localCollectorSource.includes("gpustat --json"));
assert.ok(localCollectorSource.includes("TURBALANCE_GPU_BACKEND"));
assert.ok(localCollectorSource.includes("TURBALANCE_GPUSTAT_BIN"));
assert.ok(localCollectorSource.includes("parseGpustatJson"));
assert.ok(localCollectorSource.includes("fan.speed"));
assert.ok(localCollectorSource.includes("clocks.current.graphics"));
assert.ok(localCollectorSource.includes("clocks.current.sm"));
assert.ok(localCollectorSource.includes("clocks.current.memory"));
assert.ok(localCollectorSource.includes("gpu-process-inspector"));
assert.ok(localCollectorSource.includes("gpu-thermal-qualification"));
assert.ok(localCollectorSource.includes("gpu-topology"));
assert.ok(localCollectorSource.includes("nvidia-smi topo -m"));
assert.ok(localCollectorSource.includes("TEMPERATURE,PERFORMANCE,POWER"));
assert.ok(localCollectorSource.includes("gpuThermalQualificationComparable"));
assert.ok(localCollectorSource.includes("gpuTopologyFingerprint"));
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
assert.ok(localCollectorSource.includes("networkNewDropCount"));
assert.ok(localCollectorSource.includes("networkCounterBaselineEstablished"));
assert.ok(localCollectorSource.includes("TURBALANCE_LAKE_ROOT"));
assert.ok(localCollectorSource.includes("lakehouseUsedBytes"));
assert.ok(localCollectorSource.includes("collectBenchmarkSuite"));
assert.ok(localCollectorSource.includes("benchmarkCpuOpsPerSecond"));
assert.ok(localCollectorSource.includes("TURBALANCE_BENCHMARK_OCP_DATASET"));
assert.ok(localCollectorSource.includes("benchmarkOcpCommonsPolicy"));
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
  "0",
  "--lake-root",
  lakehousePath
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

const gpustatOutPath = path.join(tempDir, "live-machine-bundle-gpustat.json");
const fakeBinDir = path.join(tempDir, "fake-bin");
fs.mkdirSync(fakeBinDir, { recursive: true });
const fakeGpustatPath = path.join(fakeBinDir, "gpustat");
fs.writeFileSync(fakeGpustatPath, `#!/usr/bin/env node
console.log(JSON.stringify({
  hostname: "fake-gpu-host",
  gpus: [{
    index: 0,
    uuid: "GPU-fake-gpustat",
    name: "NVIDIA GB10",
    "temperature.gpu": 47,
    "utilization.gpu": 42,
    "utilization.memory": 12,
    "memory.used": 512,
    "memory.total": 4096,
    "power.draw": 35.5,
    "fan.speed": 44,
    "clocks.current.graphics": 1515,
    "clocks.current.sm": 1485,
    "clocks.current.memory": 5001,
    processes: [{ pid: 1234, command: "python", username: "user", gpu_memory_usage: 256 }]
  }]
}));
`);
fs.chmodSync(fakeGpustatPath, 0o755);
const gpustatResult = spawnSync(process.execPath, [
  "scripts/collect-local-machine-bundle.js",
  "--out",
  gpustatOutPath,
  "--host-url",
  "http://192.168.10.30:8000",
  "--run-id",
  "machine-demo-gpustat-test",
  "--gpu-backend",
  "gpustat",
  "--ollama-probe",
  "0",
  "--lake-root",
  lakehousePath
], {
  cwd: root,
  encoding: "utf8",
  env: {
    ...process.env,
    PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH || ""}`
  },
  maxBuffer: 20 * 1024 * 1024
});
assert.equal(gpustatResult.status, 0, gpustatResult.stderr);
const gpustatBundle = JSON.parse(fs.readFileSync(gpustatOutPath, "utf8"));
const gpustatContext = gpustatBundle.ingestion.runs[0].sourceContext;
assert.equal(gpustatContext.gpuSource, "gpustat");
assert.equal(gpustatContext.gpuBackendRequested, "gpustat");
assert.equal(gpustatContext.gpuName, "NVIDIA GB10");
assert.equal(gpustatContext.gpuUtilizationPct, 42);
assert.equal(gpustatContext.gpuMemoryUsedMiB, 512);
assert.equal(gpustatContext.gpuMemoryTotalMiB, 4096);
assert.equal(gpustatContext.gpuMemoryUtilizationPct, 12);
assert.equal(gpustatContext.gpuPowerWatts, 35.5);
assert.equal(gpustatContext.gpuTemperatureC, 47);
assert.equal(gpustatContext.gpuFanSpeedPct, 44);
assert.equal(gpustatContext.gpuClockMHz, 1515);
assert.equal(gpustatContext.gpuSmClockMHz, 1485);
assert.equal(gpustatContext.gpuMemoryClockMHz, 5001);
assert.equal(gpustatContext.gpuComputeProcesses[0].pid, 1234);
assert.equal(gpustatContext.gpuComputeProcesses[0].processName, "python");
assert.equal(gpustatContext.gpuComputeProcesses[0].usedMemoryMiB, 256);
assert.ok(gpustatBundle.ingestion.sourceAdapters.includes("gpustat"));
assert.ok(!gpustatBundle.ingestion.sourceAdapters.includes("nvidia-smi"));

const fakeNvidiaSmiPath = path.join(fakeBinDir, "nvidia-smi");
fs.writeFileSync(fakeNvidiaSmiPath, `#!/usr/bin/env node
const args = process.argv.slice(2);
const joined = args.join(" ");
if (args[0] === "topo" && args[1] === "-m") {
  console.log("        GPU0    GPU1    CPU Affinity    NUMA Affinity");
  console.log("GPU0    X       NV4     0-31            0");
  console.log("GPU1    NV4     X       0-31            0");
  console.log("");
  console.log("Legend:");
  console.log("  NV4 = bonded NVLink");
} else if (joined.includes("--query-compute-apps=")) {
  console.log("GPU-fake-smi-0,4321,python-train,1024");
} else if (joined.includes("--query-gpu=")) {
  console.log("NVIDIA H100,0,GPU-fake-smi-0,76,44,20480,81920,312.5,47,5,16,62,1785,1710,2619");
  console.log("NVIDIA H100,1,GPU-fake-smi-1,73,41,19800,81920,301.2,48,5,16,60,1770,1700,2619");
} else if (args[0] === "-q") {
  console.log("GPU 00000000:01:00.0");
  console.log("    Product Name                    : NVIDIA H100");
  console.log("    Temperature");
  console.log("        GPU Current Temp            : 47 C");
  console.log("        GPU Slowdown Temp           : 87 C");
  console.log("        GPU Shutdown Temp           : 95 C");
  console.log("        GPU Max Operating Temp      : 83 C");
  console.log("        Memory Current Temp         : 55 C");
  console.log("        Memory Max Operating Temp   : 95 C");
  console.log("    Performance State               : P0");
  console.log("    Clocks Throttle Reasons");
  console.log("        Active                      : None");
  console.log("        HW Slowdown                 : Not Active");
  console.log("        HW Thermal Slowdown         : Not Active");
  console.log("    Power Readings");
  console.log("        Power Draw                  : 312.5 W");
  console.log("        Power Limit                 : 700.0 W");
} else {
  process.exit(1);
}
`);
fs.chmodSync(fakeNvidiaSmiPath, 0o755);

const nvidiaSmiOutPath = path.join(tempDir, "live-machine-bundle-nvidia-smi.json");
const nvidiaSmiResult = spawnSync(process.execPath, [
  "scripts/collect-local-machine-bundle.js",
  "--out",
  nvidiaSmiOutPath,
  "--host-url",
  "http://192.168.10.30:8000",
  "--run-id",
  "machine-demo-nvidia-smi-test",
  "--gpu-backend",
  "nvidia-smi",
  "--ollama-probe",
  "0",
  "--lake-root",
  lakehousePath
], {
  cwd: root,
  encoding: "utf8",
  env: {
    ...process.env,
    PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH || ""}`
  },
  maxBuffer: 20 * 1024 * 1024
});
assert.equal(nvidiaSmiResult.status, 0, nvidiaSmiResult.stderr);
const nvidiaSmiBundle = JSON.parse(fs.readFileSync(nvidiaSmiOutPath, "utf8"));
const nvidiaSmiContext = nvidiaSmiBundle.ingestion.runs[0].sourceContext;
assert.equal(nvidiaSmiContext.gpuSource, "nvidia-smi");
assert.equal(nvidiaSmiContext.gpuName, "NVIDIA H100");
assert.equal(nvidiaSmiContext.gpuComputeProcesses[0].gpuUuid, "GPU-fake-smi-0");
assert.equal(nvidiaSmiContext.gpuComputeProcesses[0].processName, "python-train");
assert.equal(nvidiaSmiContext.gpuProcessInspectorStatus, "observed");
assert.equal(nvidiaSmiContext.gpuProcessCount, 1);
assert.equal(nvidiaSmiContext.gpuProcessMemoryMiB, 1024);
assert.equal(nvidiaSmiContext.gpuThermalQualificationStatus, "pass");
assert.equal(nvidiaSmiContext.gpuThermalQualificationComparable, true);
assert.equal(nvidiaSmiContext.gpuThermalMarginToSlowdownC, 40);
assert.equal(nvidiaSmiContext.gpuPowerLimitWatts, 700);
assert.equal(nvidiaSmiContext.gpuTopologyStatus, "observed");
assert.equal(nvidiaSmiContext.gpuTopologyDeviceCount, 2);
assert.equal(nvidiaSmiContext.gpuTopologyNvlinkLinks, 1);
assert.ok(nvidiaSmiContext.gpuTopologyFingerprint);
assert.ok(nvidiaSmiBundle.ingestion.sourceAdapters.includes("nvidia-smi"));
assert.ok(nvidiaSmiBundle.ingestion.sourceAdapters.includes("gpu-process-inspector"));
assert.ok(nvidiaSmiBundle.ingestion.sourceAdapters.includes("gpu-thermal-qualification"));
assert.ok(nvidiaSmiBundle.ingestion.sourceAdapters.includes("gpu-topology"));

const gpuTopResult = spawnSync(process.execPath, [
  "scripts/turbalance-gpu-top.js",
  "--bundle",
  nvidiaSmiOutPath
], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 2 * 1024 * 1024
});
assert.equal(gpuTopResult.status, 0, gpuTopResult.stderr);
assert.ok(gpuTopResult.stdout.includes("GPU Process Inspector"));
assert.ok(gpuTopResult.stdout.includes("Thermal Qualification"));
assert.ok(gpuTopResult.stdout.includes("Topology Fingerprint"));
assert.ok(gpuTopResult.stdout.includes("python-train"));

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
  "--benchmark-ocp-dataset",
  "ocp-benchmark-commons-2026-design-partner",
  "--benchmark-ocp-peer-count",
  "128",
  "--benchmark-ocp-percentile",
  "74.5",
  "--benchmark-ocp-hardware-class",
  "edge-cpu-small",
  "--benchmark-ocp-binning",
  "p50-p75",
  "--ollama-probe",
  "0",
  "--lake-root",
  lakehousePath
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
assert.equal(benchmarkContext.benchmarkOcpCommonsDataset, "ocp-benchmark-commons-2026-design-partner");
assert.equal(benchmarkContext.benchmarkOcpCommonsPeerCount, 128);
assert.equal(benchmarkContext.benchmarkOcpCommonsPercentile, 74.5);
assert.equal(benchmarkContext.benchmarkOcpCommonsHardwareClass, "edge-cpu-small");
assert.equal(benchmarkContext.benchmarkOcpCommonsBinning, "p50-p75");
assert.equal(benchmarkContext.benchmarkOcpCommonsPolicy, "aggregate-anonymized");
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
