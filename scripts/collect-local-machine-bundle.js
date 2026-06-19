#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync, spawn, spawnSync } = require("node:child_process");
const { assertValidSourceBundle } = require("../lib/source-bundle-validator.js");

const args = parseArgs(process.argv.slice(2));
const outPath = args.out || "";
const hostUrl = args["host-url"] || process.env.TURBALANCE_MACHINE_DEMO_URL || `http://${primaryAddress()}:8000`;
const windowMinutes = numberArg(args["window-minutes"], 60);
const fastRefresh = args["fast-refresh"] === "1" || args["skip-gpu-processes"] === "1";
const loopMs = numberArg(args["loop-ms"], 0);
const gpuSampleMs = numberArg(args["gpu-sample-ms"], fastRefresh ? 2000 : 0);
const gpuBackend = (args["gpu-backend"] || process.env.TURBALANCE_GPU_BACKEND || "auto").toLowerCase();
const gpustatBin = args["gpustat-bin"] || process.env.TURBALANCE_GPUSTAT_BIN || "gpustat";
const gpuDiagnosticsEnabled = args["gpu-diagnostics"] !== "0" && process.env.TURBALANCE_GPU_DIAGNOSTICS !== "0";
const gpuDiagnosticsTtlMs = numberArg(args["gpu-diagnostics-ttl-ms"] || process.env.TURBALANCE_GPU_DIAGNOSTICS_TTL_MS, fastRefresh ? 30000 : 10000);
const ollamaProbeEnabled = args["ollama-probe"] !== "0";
const ollamaProbeMs = numberArg(args["ollama-probe-ms"], 30000);
const skipValidation = args["skip-validation"] === "1";
const compactOutput = args.compact === true || process.env.TURBALANCE_COMPACT_BUNDLE === "1";
const benchmarkEnabled = args["benchmark-suite"] === "1"
  || process.env.TURBALANCE_MACHINE_BENCHMARKS === "1"
  || process.env.TURBALANCE_PI_BENCHMARKS === "1";
const benchmarkTtlMs = numberArg(args["benchmark-ttl-ms"] || process.env.TURBALANCE_BENCHMARK_TTL_MS, 15 * 60 * 1000);
const benchmarkDurationMs = numberArg(args["benchmark-duration-ms"] || process.env.TURBALANCE_BENCHMARK_DURATION_MS, 450);
const benchmarkBufferBytes = numberArg(args["benchmark-buffer-mib"] || process.env.TURBALANCE_BENCHMARK_BUFFER_MIB, 8) * 1024 * 1024;
const benchmarkDiskBytes = numberArg(args["benchmark-disk-mib"] || process.env.TURBALANCE_BENCHMARK_DISK_MIB, 16) * 1024 * 1024;
const benchmarkCachePath = args["benchmark-cache"]
  || process.env.TURBALANCE_BENCHMARK_CACHE
  || defaultBenchmarkCachePath();
const benchmarkOcpCommons = {
  dataset: args["benchmark-ocp-dataset"] || process.env.TURBALANCE_BENCHMARK_OCP_DATASET || "",
  url: args["benchmark-ocp-url"] || process.env.TURBALANCE_BENCHMARK_OCP_URL || "",
  hardwareClass: args["benchmark-ocp-hardware-class"] || process.env.TURBALANCE_BENCHMARK_OCP_HARDWARE_CLASS || "",
  configHash: args["benchmark-ocp-config-hash"] || process.env.TURBALANCE_BENCHMARK_OCP_CONFIG_HASH || "",
  binning: args["benchmark-ocp-binning"] || process.env.TURBALANCE_BENCHMARK_OCP_BINNING || "",
  policy: args["benchmark-ocp-policy"] || process.env.TURBALANCE_BENCHMARK_OCP_POLICY || "aggregate-anonymized",
  peerCount: optionalFinite(args["benchmark-ocp-peer-count"] || process.env.TURBALANCE_BENCHMARK_OCP_PEER_COUNT),
  percentile: optionalFinite(args["benchmark-ocp-percentile"] || process.env.TURBALANCE_BENCHMARK_OCP_PERCENTILE),
  score: optionalFinite(args["benchmark-ocp-score"] || process.env.TURBALANCE_BENCHMARK_OCP_SCORE)
};
const explicitNetworkInterface = args["network-interface"]
  || process.env.TURBALANCE_LIVE_NETWORK_INTERFACE
  || "";
const dgxInterconnectInterface = args["dgx-interconnect-interface"]
  || process.env.TURBALANCE_DGX_INTERCONNECT_INTERFACE
  || "enp1s0f1np1";
const dgxInterconnectSubnetPrefix = args["dgx-interconnect-subnet-prefix"]
  || process.env.TURBALANCE_DGX_INTERCONNECT_SUBNET_PREFIX
  || "192.168.100.";
const lakehouseRoot = args["lake-root"]
  || args["lakehouse-root"]
  || process.env.TURBALANCE_LAKE_ROOT
  || path.join("build", "lakehouse");
const linuxPtpContainerNames = (process.env.TURBALANCE_LINUXPTP_CONTAINERS || "turbalance-linuxptp,turbalance-ptp4l")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const networkRateCachePath = args["network-rate-cache"]
  || process.env.TURBALANCE_NETWORK_RATE_CACHE
  || defaultNetworkRateCachePath();
const delegatedFleetRemotes = localFleetRemotes();
let previousGpu = null;
let previousGpuDiagnostics = null;
let previousOllamaTelemetry = null;
let previousNetwork = null;

if (delegatedFleetRemotes.length > 0) {
  runDelegatedFleetLoop(delegatedFleetRemotes).catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
} else if (loopMs > 0) {
  runLoop().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
} else {
  collectAndWrite();
}

async function runLoop() {
  const includeProcesses = !fastRefresh;
  previousGpu = collectGpu({ includeProcesses });
  let gpuRefreshInFlight = null;

  while (true) {
    const startedAt = Date.now();
    const nowMs = Date.now();
    const gpuAgeMs = previousGpu ? nowMs - previousGpu.collectedAtMs : Number.POSITIVE_INFINITY;
    if (!gpuRefreshInFlight && gpuAgeMs >= gpuSampleMs) {
      gpuRefreshInFlight = collectGpuAsync({ includeProcesses })
        .then((gpu) => {
          previousGpu = gpu;
        })
        .catch(() => {})
        .finally(() => {
          gpuRefreshInFlight = null;
        });
    }

    collectAndWrite({ gpuOverride: gpuSampleForWrite(previousGpu, Date.now(), includeProcesses) });
    await delay(Math.max(0, loopMs - (Date.now() - startedAt)));
  }
}

async function runDelegatedFleetLoop(remotes) {
  while (true) {
    const startedAt = Date.now();
    runDelegatedFleetOnce(remotes);
    if (loopMs <= 0) return;
    await delay(Math.max(0, loopMs - (Date.now() - startedAt)));
  }
}

function runDelegatedFleetOnce(remotes) {
  const commandArgs = [
    path.join(__dirname, "collect-machine-fleet-bundle.js"),
    "--host-url",
    hostUrl,
    ...(outPath ? ["--out", outPath] : []),
    ...remotes.flatMap((remote) => ["--remote", remote]),
    ...collectorNetworkArgs()
  ];
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    env: {
      ...process.env,
      TURBALANCE_DISABLE_LOCAL_FLEET_DELEGATION: "1"
    },
    maxBuffer: 50 * 1024 * 1024
  });
  if (result.stdout && !outPath) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`collect-machine-fleet-bundle.js failed with status ${result.status}`);
  }
}

function collectAndWrite({ gpuOverride = null } = {}) {
  const generatedAt = new Date();
  const host = collectHost({ cpuSampleMs: fastRefresh ? 80 : 250 });
  host.network = withNetworkRates(host.network, previousNetwork || readNetworkRateCache(host.network));
  previousNetwork = host.network;
  writeNetworkRateCache(host.network);
  const gpu = gpuOverride || collectGpu({
    includeProcesses: !fastRefresh,
    previousGpu,
    maxAgeMs: gpuSampleMs,
    nowMs: generatedAt.getTime()
  });
  if (!gpuOverride) previousGpu = gpu;
  const docker = collectDocker();
  const ncclRuntime = detectNcclRuntime({ docker, network: host.network });
  const benchmark = collectBenchmarkSuite({ host });
  const services = collectServices(hostUrl);
  const hardware = collectHardwareHealth({ host, gpu, docker, services, benchmark });
  const metrics = deriveMetrics({ host, gpu, docker, services, windowMinutes });
  const runId = args["run-id"] || `machine-${safeId(host.hostname)}-${timestampId(generatedAt)}`;
  const bundle = buildBundle({ runId, host, gpu, docker, services, metrics, hostUrl, generatedAt, windowMinutes, ncclRuntime, benchmark, hardware });

  if (!skipValidation) {
    assertValidSourceBundle(bundle);
  }

  const output = `${compactOutput ? JSON.stringify(bundle) : JSON.stringify(bundle, null, 2)}\n`;
  if (outPath) {
    const fullPath = path.resolve(outPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileAtomic(fullPath, output);
  } else {
    process.stdout.write(output);
  }
}

function collectHost({ cpuSampleMs = 250 } = {}) {
  const meminfo = readMeminfo();
  const disk = diskInfo("/");
  const lakehouse = lakehouseInfo(lakehouseRoot);
  const cpuSample = cpuUsageSample(cpuSampleMs);
  const net = primaryNetworkStats();
  const load = os.loadavg();
  const cpus = os.cpus();
  const lscpu = command("lscpu");
  const hostname = os.hostname();
  const osRelease = readOsRelease();
  const uptimeSeconds = os.uptime();
  const cpuTemperatureC = collectCpuTemperatureC();
  const clock = collectClockSync();

  return {
    hostname,
    platform: os.platform(),
    arch: os.arch(),
    kernel: os.release(),
    osName: osRelease.PRETTY_NAME || `${os.type()} ${os.release()}`,
    cpuModel: cpus[0]?.model || valueFromText(lscpu, "Model name") || "unknown CPU",
    cpuCount: cpus.length || Number(valueFromText(lscpu, "CPU(s)")) || 1,
    load1: load[0] || 0,
    load5: load[1] || 0,
    load15: load[2] || 0,
    cpuUsagePct: cpuSample,
    cpuTemperatureC,
    memoryTotalBytes: meminfo.MemTotal || os.totalmem(),
    memoryAvailableBytes: meminfo.MemAvailable || os.freemem(),
    swapTotalBytes: meminfo.SwapTotal || 0,
    swapFreeBytes: meminfo.SwapFree || 0,
    disk,
    lakehouse,
    network: net,
    clock,
    uptimeSeconds,
    addresses: nonInternalAddresses()
  };
}

function collectCpuTemperatureC() {
  const thermalFiles = [
    "/sys/class/thermal/thermal_zone0/temp",
    "/sys/class/hwmon/hwmon0/temp1_input"
  ];
  for (const filePath of thermalFiles) {
    const raw = readFile(filePath);
    const value = optionalFinite(raw);
    if (Number.isFinite(value) && value > 0) {
      return value > 1000 ? value / 1000 : value;
    }
  }

  const vcgencmd = command("vcgencmd", ["measure_temp"]);
  const match = vcgencmd.match(/temp=([\d.]+)/i);
  return match ? optionalFinite(match[1]) : undefined;
}

function collectClockSync() {
  const nowMs = Date.now();
  const timedate = parseKeyValueLines(command("timedatectl", ["show", "-p", "NTPSynchronized", "-p", "TimeUSec", "-p", "Timezone", "-p", "LocalRTC"]));
  const timesync = parseTimedateTimesyncStatus(command("timedatectl", ["timesync-status"]));
  const chrony = parseChronyTracking(command("chronyc", ["tracking"]));
  const ptp = collectPtpStatus();
  const systemdTimesyncdActive = serviceActive("systemd-timesyncd");
  const services = [
    serviceState("systemd-timesyncd", systemdTimesyncdActive),
    serviceState("chrony", serviceActive("chrony")),
    serviceState("chronyd", serviceActive("chronyd")),
    serviceState("ptp4l", ptp.ptp4lActive),
    serviceState("phc2sys", ptp.phc2sysActive)
  ];
  const synchronized = timedate.NTPSynchronized === "yes" || Boolean(chrony.reference) || ptp.active;
  const source = ptp.active
    ? "ptp"
    : chrony.reference ? "chrony"
      : systemdTimesyncdActive ? "systemd-timesyncd"
        : timedate.NTPSynchronized === "yes" ? "timedatectl"
          : "unsynchronized";
  const offsetNs = Number.isFinite(ptp.offsetNs) ? ptp.offsetNs : Number.isFinite(chrony.lastOffsetNs) ? chrony.lastOffsetNs : timesync.offsetNs;
  const rmsOffsetNs = Number.isFinite(chrony.rmsOffsetNs) ? chrony.rmsOffsetNs : timesync.jitterNs;
  const detailParts = [
    synchronized ? "clock synchronized" : "clock not synchronized",
    ptp.installed ? `PTP ${ptp.active ? "active" : "installed/inactive"}` : "PTP tools missing",
    chrony.reference ? `chrony ${chrony.reference}` : "",
    timesync.server ? `timesync ${timesync.server}` : "",
    systemdTimesyncdActive ? "systemd-timesyncd active" : ""
  ].filter(Boolean);

  return {
    source,
    synchronized,
    timeUnixMs: nowMs,
    timeUnixNs: command("date", ["+%s%N"]).trim() || `${Math.round(nowMs)}000000`,
    timezone: timedate.Timezone || "",
    localRtc: timedate.LocalRTC === "yes",
    offsetNs,
    rmsOffsetNs,
    ptpInstalled: ptp.installed,
    ptpActive: ptp.active,
    ptp4lActive: ptp.ptp4lActive,
    phc2sysActive: ptp.phc2sysActive,
    ptpPortState: ptp.portState || "",
    ptpGrandmaster: ptp.grandmaster || "",
    chronyReference: chrony.reference || timesync.server || "",
    chronyStratum: chrony.stratum,
    services,
    detail: detailParts.join("; ")
  };
}

function collectPtpStatus() {
  const ptp4lInstalled = Boolean(command("which", ["ptp4l"]).trim());
  const phc2sysInstalled = Boolean(command("which", ["phc2sys"]).trim());
  const pmcInstalled = Boolean(command("which", ["pmc"]).trim());
  const linuxPtpContainer = firstRunningDockerContainer(linuxPtpContainerNames);
  const dockerPtp4lActive = Boolean(linuxPtpContainer);
  const dockerPhc2sysActive = linuxPtpContainer
    ? dockerProcessRunning(linuxPtpContainer, "phc2sys")
    : false;
  const ptp4lActive = serviceActive("ptp4l") || dockerPtp4lActive;
  const phc2sysActive = serviceActive("phc2sys") || dockerPhc2sysActive;
  const hostPmc = serviceActive("ptp4l") && pmcInstalled
    ? ptpManagementCommand("", "GET TIME_STATUS_NP")
    : "";
  const hostPortData = serviceActive("ptp4l") && pmcInstalled
    ? ptpManagementCommand("", "GET PORT_DATA_SET")
    : "";
  const dockerPmc = !hostPmc && linuxPtpContainer
    ? ptpManagementCommand(linuxPtpContainer, "GET TIME_STATUS_NP")
    : "";
  const dockerPortData = !hostPortData && linuxPtpContainer
    ? ptpManagementCommand(linuxPtpContainer, "GET PORT_DATA_SET")
    : "";
  const pmc = hostPmc || dockerPmc;
  const portData = hostPortData || dockerPortData;
  const offsetMatch = pmc.match(/\bmaster_offset\s+(-?\d+)/i);
  const grandmasterMatch = pmc.match(/\bgmIdentity\s+([0-9a-f:.]+)/i);
  const portStateMatch = portData.match(/\bportState\s+([A-Z_]+)/i);
  return {
    installed: ptp4lInstalled || phc2sysInstalled || dockerPtp4lActive,
    active: ptp4lActive || phc2sysActive,
    ptp4lActive,
    phc2sysActive,
    offsetNs: offsetMatch ? optionalFinite(offsetMatch[1]) : undefined,
    grandmaster: grandmasterMatch?.[1] || "",
    portState: portStateMatch?.[1] || ""
  };
}

function ptpManagementCommand(container, request) {
  const pmcArgs = ["pmc", "-u", "-b", "0", request];
  return container
    ? command("docker", ["exec", container, ...pmcArgs])
    : command("pmc", pmcArgs.slice(1));
}

function firstRunningDockerContainer(names) {
  return names.find((name) => dockerContainerRunning(name)) || "";
}

function dockerContainerRunning(name) {
  return command("docker", ["inspect", "-f", "{{.State.Running}}", name]).trim() === "true";
}

function dockerProcessRunning(container, processName) {
  return Boolean(command("docker", ["exec", container, "pgrep", "-x", processName]).trim());
}

function parseChronyTracking(text) {
  if (!text.trim()) return {};
  return {
    reference: (text.match(/^Reference ID\s*:\s*(.+)$/m) || [])[1]?.trim() || "",
    stratum: optionalFinite((text.match(/^Stratum\s*:\s*(\d+)/m) || [])[1]),
    lastOffsetNs: secondsLineToNanoseconds(text, "Last offset"),
    rmsOffsetNs: secondsLineToNanoseconds(text, "RMS offset")
  };
}

function parseTimedateTimesyncStatus(text) {
  if (!text.trim()) return {};
  const offsetText = (text.match(/^\s*Offset:\s*([+-]?[\d.]+\s*(?:ns|us|\u00b5s|ms|s))/mi) || [])[1] || "";
  const jitterText = (text.match(/^\s*Jitter:\s*([+-]?[\d.]+\s*(?:ns|us|\u00b5s|ms|s))/mi) || [])[1] || "";
  return {
    server: (text.match(/^\s*Server:\s*(.+)$/mi) || [])[1]?.trim() || "",
    offsetNs: durationTextToNanoseconds(offsetText),
    jitterNs: durationTextToNanoseconds(jitterText)
  };
}

function secondsLineToNanoseconds(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^${escaped}\\s*:\\s*([+-]?\\d+(?:\\.\\d+)?)\\s+seconds`, "mi"));
  const seconds = match ? optionalFinite(match[1]) : undefined;
  return Number.isFinite(seconds) ? seconds * 1_000_000_000 : undefined;
}

function durationTextToNanoseconds(text) {
  const match = String(text || "").trim().match(/^([+-]?\d+(?:\.\d+)?)\s*(ns|us|\u00b5s|ms|s)$/i);
  if (!match) return undefined;
  const value = optionalFinite(match[1]);
  if (!Number.isFinite(value)) return undefined;
  const unit = match[2].toLowerCase();
  if (unit === "ns") return value;
  if (unit === "us" || unit === "\u00b5s") return value * 1000;
  if (unit === "ms") return value * 1_000_000;
  return value * 1_000_000_000;
}

function parseKeyValueLines(text) {
  return Object.fromEntries(text.split("\n")
    .map((line) => line.match(/^([^=]+)=(.*)$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]));
}

function serviceActive(name) {
  return command("systemctl", ["is-active", name]).trim() === "active";
}

function serviceState(name, active) {
  return { name, active: Boolean(active) };
}

function collectGpu({ includeProcesses = true, previousGpu: cachedGpu = null, maxAgeMs = 0, nowMs = Date.now() } = {}) {
  if (cachedGpu && maxAgeMs > 0 && nowMs - cachedGpu.collectedAtMs < maxAgeMs) {
    return cloneGpuSample({
      ...cachedGpu,
      sampleCached: true,
      sampleAgeMs: nowMs - cachedGpu.collectedAtMs,
      processesSkipped: !includeProcesses || cachedGpu.processesSkipped,
      processesObserved: includeProcesses && cachedGpu.processesObserved
    });
  }

  return collectGpuByBackend({ includeProcesses });
}

async function collectGpuAsync({ includeProcesses = true } = {}) {
  return collectGpuByBackendAsync({ includeProcesses });
}

function collectGpuByBackend({ includeProcesses = true } = {}) {
  const failures = [];
  for (const backend of gpuBackendOrder()) {
    const sample = collectGpuFromBackend(backend, { includeProcesses });
    if (sample.present) {
      return attachGpuDiagnostics({
        ...sample,
        requestedSource: gpuBackend
      }, { includeProcesses });
    }
    failures.push(sample);
    if (gpuBackend !== "auto") break;
  }
  const fallback = failures[failures.length - 1] || unavailableGpuSample({
    source: "gpu-telemetry-unavailable",
    error: "No GPU telemetry backend attempted",
    includeProcesses
  });
  return attachGpuDiagnostics({
    ...fallback,
    requestedSource: gpuBackend,
    attemptedSources: failures.map((failure) => failure.source).filter(Boolean),
    error: compactWhitespace(failures.map((failure) => failure.error).filter(Boolean).join("; ") || fallback.error)
  }, { includeProcesses });
}

async function collectGpuByBackendAsync({ includeProcesses = true } = {}) {
  const failures = [];
  for (const backend of gpuBackendOrder()) {
    const sample = await collectGpuFromBackendAsync(backend, { includeProcesses });
    if (sample.present) {
      return attachGpuDiagnostics({
        ...sample,
        requestedSource: gpuBackend
      }, { includeProcesses });
    }
    failures.push(sample);
    if (gpuBackend !== "auto") break;
  }
  const fallback = failures[failures.length - 1] || unavailableGpuSample({
    source: "gpu-telemetry-unavailable",
    error: "No GPU telemetry backend attempted",
    includeProcesses
  });
  return attachGpuDiagnostics({
    ...fallback,
    requestedSource: gpuBackend,
    attemptedSources: failures.map((failure) => failure.source).filter(Boolean),
    error: compactWhitespace(failures.map((failure) => failure.error).filter(Boolean).join("; ") || fallback.error)
  }, { includeProcesses });
}

function attachGpuDiagnostics(sample, { includeProcesses = true } = {}) {
  const normalized = {
    ...sample,
    processes: normalizeGpuProcesses(sample.processes || [], sample.gpus || [])
  };
  const processInspector = buildGpuProcessInspector(normalized, { includeProcesses });
  const diagnostics = gpuDiagnosticsEnabled
    ? collectGpuDiagnostics(normalized)
    : emptyGpuDiagnostics("disabled");
  return {
    ...normalized,
    processInspector,
    topology: diagnostics.topology,
    thermalQualification: diagnostics.thermalQualification,
    diagnosticsCollectedAtMs: diagnostics.collectedAtMs,
    diagnosticsSampleCached: diagnostics.sampleCached,
    diagnosticsError: diagnostics.error || ""
  };
}

function collectGpuDiagnostics(sample) {
  const nowMs = Date.now();
  const cacheKey = gpuDiagnosticsCacheKey(sample);
  if (
    previousGpuDiagnostics
    && previousGpuDiagnostics.cacheKey === cacheKey
    && nowMs - previousGpuDiagnostics.collectedAtMs >= 0
    && nowMs - previousGpuDiagnostics.collectedAtMs < gpuDiagnosticsTtlMs
  ) {
    return {
      ...previousGpuDiagnostics,
      sampleCached: true
    };
  }

  const diagnostics = {
    cacheKey,
    collectedAtMs: nowMs,
    sampleCached: false,
    topology: collectGpuTopologyFingerprint(sample),
    thermalQualification: collectGpuThermalQualification(sample),
    error: ""
  };
  previousGpuDiagnostics = diagnostics;
  return diagnostics;
}

function emptyGpuDiagnostics(status) {
  return {
    collectedAtMs: Date.now(),
    sampleCached: false,
    topology: emptyGpuTopology(status),
    thermalQualification: emptyGpuThermalQualification(status),
    error: ""
  };
}

function gpuDiagnosticsCacheKey(sample) {
  const ids = (sample.gpus || [])
    .map((gpu) => gpu.uuid || `${gpu.index}:${gpu.name}`)
    .filter(Boolean)
    .join("|");
  return `${sample.source || ""}:${ids || "no-gpu"}`;
}

function normalizeGpuProcesses(processes, gpus) {
  const gpuByUuid = new Map((gpus || []).map((gpu) => [String(gpu.uuid || ""), gpu]));
  const gpuByIndex = new Map((gpus || []).map((gpu) => [String(gpu.index), gpu]));
  return enrichGpuProcessesWithPs((processes || []).map((entry) => {
    const gpu = gpuByUuid.get(String(entry.gpuUuid || "")) || gpuByIndex.get(String(entry.gpuIndex));
    return {
      pid: Number(entry.pid),
      processName: String(entry.processName || entry.command || entry.name || ""),
      command: String(entry.command || entry.processName || entry.name || ""),
      username: String(entry.username || ""),
      gpuUuid: String(entry.gpuUuid || gpu?.uuid || ""),
      gpuIndex: Number.isFinite(Number(entry.gpuIndex)) ? Number(entry.gpuIndex) : finite(gpu?.index),
      gpuName: String(entry.gpuName || gpu?.name || ""),
      usedMemoryMiB: finite(entry.usedMemoryMiB, finite(entry.gpuMemoryUsageMiB, 0))
    };
  }).filter((entry) => Number.isFinite(entry.pid)));
}

function enrichGpuProcessesWithPs(processes) {
  const missing = processes.filter((processEntry) => !processEntry.username || !processEntry.command);
  if (missing.length === 0) return processes;
  const pids = [...new Set(missing.map((processEntry) => processEntry.pid).filter(Number.isFinite))].slice(0, 64);
  if (pids.length === 0) return processes;
  const psText = command("ps", ["-o", "pid=,user=,comm=,args=", "-p", pids.join(",")]);
  const psByPid = new Map(psText.split("\n").map((line) => {
    const match = line.trim().match(/^(\d+)\s+(\S+)\s+(\S+)\s*(.*)$/);
    return match ? [Number(match[1]), { username: match[2], processName: match[3], command: match[4] || match[3] }] : null;
  }).filter(Boolean));
  return processes.map((processEntry) => {
    const ps = psByPid.get(processEntry.pid) || {};
    return {
      ...processEntry,
      username: processEntry.username || ps.username || "",
      processName: processEntry.processName || ps.processName || "",
      command: processEntry.command || ps.command || processEntry.processName || ""
    };
  });
}

function buildGpuProcessInspector(sample, { includeProcesses = true } = {}) {
  const processes = sample.processes || [];
  const totalMemoryMiB = processes.reduce((total, processEntry) => total + finite(processEntry.usedMemoryMiB, 0), 0);
  const byGpu = Array.from(groupBy(processes, (processEntry) => processEntry.gpuUuid || String(processEntry.gpuIndex ?? "unknown")).entries())
    .map(([gpuKey, rows]) => ({
      gpuKey,
      gpuIndex: firstFiniteNumber(...rows.map((row) => row.gpuIndex)),
      gpuUuid: rows.find((row) => row.gpuUuid)?.gpuUuid || "",
      gpuName: rows.find((row) => row.gpuName)?.gpuName || "",
      processCount: rows.length,
      usedMemoryMiB: round(rows.reduce((total, row) => total + finite(row.usedMemoryMiB, 0), 0), 2)
    }))
    .sort((left, right) => finite(left.gpuIndex, 999) - finite(right.gpuIndex, 999));
  const ownerNames = [...new Set(processes.map((processEntry) => processEntry.username).filter(Boolean))].sort();
  const topProcesses = [...processes]
    .sort((left, right) => finite(right.usedMemoryMiB, 0) - finite(left.usedMemoryMiB, 0))
    .slice(0, 8);
  const largest = topProcesses[0] || null;
  return {
    status: sample.present
      ? sample.processesSkipped || !includeProcesses ? "skipped"
        : processes.length > 0 ? "observed" : "empty"
      : "unavailable",
    source: sample.source || "",
    processCount: processes.length,
    totalUsedMemoryMiB: round(totalMemoryMiB, 2),
    ownerCount: ownerNames.length,
    ownerNames,
    byGpu,
    topProcesses,
    largestProcess: largest ? {
      pid: largest.pid,
      processName: largest.processName,
      username: largest.username || "",
      gpuIndex: largest.gpuIndex,
      gpuUuid: largest.gpuUuid || "",
      usedMemoryMiB: round(finite(largest.usedMemoryMiB, 0), 2)
    } : null,
    summary: sample.present
      ? sample.processesSkipped || !includeProcesses ? "GPU process query skipped"
        : processes.length > 0 ? `${processes.length} GPU compute process${processes.length === 1 ? "" : "es"} using ${round(totalMemoryMiB, 1)} MiB`
        : "No GPU compute processes observed"
      : sample.error || "GPU process inspector unavailable"
  };
}

function collectGpuTopologyFingerprint(sample) {
  if (!sample.present) return emptyGpuTopology("unavailable", sample.error || "No GPU telemetry");
  const result = commandResult("nvidia-smi", ["topo", "-m"], { timeout: 3000 });
  if (result.status !== 0 || !result.stdout.trim()) {
    return emptyGpuTopology(result.errorCode === "ENOENT" ? "nvidia-smi-not-found" : "unavailable", compactWhitespace(result.stderr || result.errorMessage || "nvidia-smi topo -m returned no topology"));
  }
  return parseNvidiaSmiTopology(result.stdout);
}

function parseNvidiaSmiTopology(text) {
  const lines = String(text || "").split("\n").map((line) => line.trimEnd()).filter(Boolean);
  const headerLine = lines.find((line) => /\bGPU\d+\b/.test(line) && !line.startsWith("GPU"));
  const headers = headerLine ? headerLine.trim().split(/\s+/) : [];
  const peerHeaders = headers.filter((token) => /^(GPU\d+|MIG\d+|NIC\d+|mlx\d+)/i.test(token));
  const rows = lines
    .filter((line) => line !== headerLine)
    .map((line) => line.trim())
    .filter((line) => /^(GPU\d+|MIG\d+|NIC\d+|mlx\d+)\b/i.test(line))
    .map((line) => {
      const parts = line.split(/\s+/);
      const label = parts.shift();
      const links = {};
      peerHeaders.forEach((header, index) => {
        links[header] = parts[index] || "";
      });
      return { label, links };
    });
  const gpuRows = rows.filter((row) => /^GPU\d+$/i.test(row.label));
  const linkCounts = {};
  const peerLinks = [];
  gpuRows.forEach((row) => {
    Object.entries(row.links).forEach(([peer, link]) => {
      if (!/^GPU\d+$/i.test(peer) || peer <= row.label || !link || link === "X") return;
      linkCounts[link] = (linkCounts[link] || 0) + 1;
      peerLinks.push({ from: row.label, to: peer, link });
    });
  });
  const nvlinkLinks = peerLinks.filter((link) => /^NV/i.test(link.link)).length;
  const pcieLinks = peerLinks.filter((link) => !/^NV/i.test(link.link)).length;
  const normalized = {
    devices: gpuRows.map((row) => row.label),
    peerLinks,
    linkCounts
  };
  return {
    status: gpuRows.length > 0 ? "observed" : "unavailable",
    source: "nvidia-smi topo -m",
    deviceCount: gpuRows.length,
    peerLinkCount: peerLinks.length,
    nvlinkLinks,
    pcieLinks,
    linkCounts,
    matrix: rows,
    fingerprint: stableLocalHash(JSON.stringify(normalized)),
    rawDigest: stableLocalHash(lines.join("\n")),
    summary: gpuRows.length > 0
      ? `${gpuRows.length} GPU${gpuRows.length === 1 ? "" : "s"}, ${nvlinkLinks} NVLink peer link${nvlinkLinks === 1 ? "" : "s"}, ${pcieLinks} PCIe/host peer link${pcieLinks === 1 ? "" : "s"}`
      : "GPU topology table did not include GPU rows",
    error: ""
  };
}

function emptyGpuTopology(status, error = "") {
  return {
    status,
    source: "",
    deviceCount: 0,
    peerLinkCount: 0,
    nvlinkLinks: 0,
    pcieLinks: 0,
    linkCounts: {},
    matrix: [],
    fingerprint: "",
    rawDigest: "",
    summary: error || "GPU topology unavailable",
    error
  };
}

function collectGpuThermalQualification(sample) {
  if (!sample.present) return emptyGpuThermalQualification("unavailable", sample.error || "No GPU telemetry");
  const result = commandResult("nvidia-smi", ["-q", "-d", "TEMPERATURE,PERFORMANCE,POWER"], { timeout: 3000 });
  const details = result.status === 0 && result.stdout.trim()
    ? parseNvidiaSmiThermalPerformance(result.stdout)
    : {};
  const error = result.status === 0 ? "" : compactWhitespace(result.stderr || result.errorMessage || "nvidia-smi -q returned no thermal/performance output");
  return qualifyGpuThermal(sample, details, error);
}

function parseNvidiaSmiThermalPerformance(text) {
  const gpuSections = splitNvidiaSmiQuerySections(text);
  const devices = gpuSections.map((section) => {
    const field = (label) => nvidiaSmiQueryField(section, label);
    const throttleValues = [
      field("Clocks Throttle Reasons Active"),
      field("Active"),
      field("HW Slowdown"),
      field("HW Thermal Slowdown"),
      field("SW Thermal Slowdown"),
      field("HW Power Brake Slowdown")
    ].filter(Boolean);
    return {
      productName: field("Product Name"),
      gpuCurrentTempC: optionalFinite(field("GPU Current Temp")),
      memoryCurrentTempC: optionalFinite(field("Memory Current Temp")),
      gpuSlowdownTempC: optionalFinite(field("GPU Slowdown Temp")),
      gpuShutdownTempC: optionalFinite(field("GPU Shutdown Temp")),
      gpuMaxOperatingTempC: optionalFinite(field("GPU Max Operating Temp")),
      memoryMaxOperatingTempC: optionalFinite(field("Memory Max Operating Temp")),
      powerDrawWatts: optionalFinite(field("Power Draw")),
      powerLimitWatts: optionalFinite(field("Power Limit")),
      throttleActive: throttleValues.some((value) => /active|yes/i.test(value) && !/not active|no/i.test(value)),
      throttleReasons: throttleValues
    };
  }).filter((device) => Object.values(device).some((value) => value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0)));
  return { devices };
}

function splitNvidiaSmiQuerySections(text) {
  const lines = String(text || "").split("\n");
  const sections = [];
  let current = [];
  lines.forEach((line) => {
    if (/^GPU\s+\d+\s*:/.test(line) && current.length > 0) {
      sections.push(current.join("\n"));
      current = [line];
    } else {
      current.push(line);
    }
  });
  if (current.length > 0) sections.push(current.join("\n"));
  return sections.length > 1 ? sections : [String(text || "")];
}

function nvidiaSmiQueryField(section, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(section || "").match(new RegExp(`^\\s*${escaped}\\s*:\\s*(.+?)\\s*$`, "mi"));
  return match ? match[1].trim() : "";
}

function qualifyGpuThermal(sample, details = {}, error = "") {
  const devices = Array.isArray(details.devices) && details.devices.length > 0
    ? details.devices
    : (sample.gpus || []).map((gpu) => ({
      productName: gpu.name || "",
      gpuCurrentTempC: optionalFinite(gpu.temperatureC),
      powerDrawWatts: optionalFinite(gpu.powerDrawWatts)
    }));
  const currentTemps = devices.map((device) => device.gpuCurrentTempC).filter(Number.isFinite);
  const memoryTemps = devices.map((device) => device.memoryCurrentTempC).filter(Number.isFinite);
  const slowdownTemps = devices.map((device) => device.gpuSlowdownTempC).filter(Number.isFinite);
  const maxOperatingTemps = devices.map((device) => device.gpuMaxOperatingTempC).filter(Number.isFinite);
  const powerDraws = devices.map((device) => device.powerDrawWatts).filter(Number.isFinite);
  const powerLimits = devices.map((device) => device.powerLimitWatts).filter(Number.isFinite);
  const maxTemp = currentTemps.length ? Math.max(...currentTemps) : undefined;
  const maxMemoryTemp = memoryTemps.length ? Math.max(...memoryTemps) : undefined;
  const slowdownTemp = slowdownTemps.length ? Math.min(...slowdownTemps) : undefined;
  const maxOperatingTemp = maxOperatingTemps.length ? Math.min(...maxOperatingTemps) : undefined;
  const marginToSlowdownC = Number.isFinite(maxTemp) && Number.isFinite(slowdownTemp) ? slowdownTemp - maxTemp : undefined;
  const marginToMaxOperatingC = Number.isFinite(maxTemp) && Number.isFinite(maxOperatingTemp) ? maxOperatingTemp - maxTemp : undefined;
  const throttleActive = devices.some((device) => Boolean(device.throttleActive));
  const hasThresholdEvidence = Number.isFinite(slowdownTemp) || Number.isFinite(maxOperatingTemp);
  const checks = [
    qualificationCheck("gpu-temperature", Number.isFinite(maxTemp), Number.isFinite(maxTemp) ? `max GPU ${round(maxTemp, 1)} C` : "GPU temperature unavailable"),
    qualificationCheck("threshold-evidence", hasThresholdEvidence, hasThresholdEvidence ? "thermal thresholds observed" : "thermal threshold evidence unavailable"),
    qualificationCheck("thermal-throttle", !throttleActive, throttleActive ? "thermal/performance slowdown active" : "no active slowdown observed"),
    qualificationCheck("margin-to-slowdown", !Number.isFinite(marginToSlowdownC) || marginToSlowdownC >= 8, Number.isFinite(marginToSlowdownC) ? `${round(marginToSlowdownC, 1)} C to slowdown` : "slowdown margin unavailable"),
    qualificationCheck("power-limit", powerLimits.length > 0, powerLimits.length > 0 ? `power limit ${round(Math.min(...powerLimits), 1)} W` : "power limit unavailable")
  ];
  const hardFail = throttleActive
    || (Number.isFinite(marginToSlowdownC) && marginToSlowdownC <= 0)
    || (Number.isFinite(maxTemp) && maxTemp >= 92);
  const warning = !hardFail && (
    !hasThresholdEvidence
    || (Number.isFinite(marginToSlowdownC) && marginToSlowdownC < 8)
    || (Number.isFinite(maxTemp) && maxTemp >= 82)
    || Boolean(error)
  );
  const status = hardFail ? "fail" : warning ? "warn" : "pass";
  return {
    status,
    source: details.devices?.length ? "nvidia-smi -q" : sample.source || "gpu-sample",
    benchmarkComparable: status === "pass",
    requiredForBenchmark: true,
    throttleActive,
    maxGpuTemperatureC: roundOptional(maxTemp, 2),
    maxMemoryTemperatureC: roundOptional(maxMemoryTemp, 2),
    gpuSlowdownTemperatureC: roundOptional(slowdownTemp, 2),
    gpuMaxOperatingTemperatureC: roundOptional(maxOperatingTemp, 2),
    marginToSlowdownC: roundOptional(marginToSlowdownC, 2),
    marginToMaxOperatingC: roundOptional(marginToMaxOperatingC, 2),
    maxPowerDrawWatts: roundOptional(powerDraws.length ? Math.max(...powerDraws) : undefined, 2),
    powerLimitWatts: roundOptional(powerLimits.length ? Math.min(...powerLimits) : undefined, 2),
    checks,
    deviceCount: devices.length,
    summary: thermalQualificationSummary(status, {
      maxTemp,
      marginToSlowdownC,
      throttleActive,
      hasThresholdEvidence,
      error
    }),
    error
  };
}

function qualificationCheck(id, passed, detail) {
  return { id, passed: Boolean(passed), detail };
}

function thermalQualificationSummary(status, { maxTemp, marginToSlowdownC, throttleActive, hasThresholdEvidence, error }) {
  if (status === "pass") return `pass: max GPU ${round(maxTemp, 1)} C with ${round(marginToSlowdownC, 1)} C slowdown margin`;
  if (throttleActive) return "fail: GPU slowdown/throttle is active";
  if (error) return `warn: ${error}`;
  if (!hasThresholdEvidence) return "warn: thermal thresholds unavailable";
  if (Number.isFinite(marginToSlowdownC)) return `${status}: ${round(marginToSlowdownC, 1)} C slowdown margin`;
  return `${status}: GPU thermal qualification incomplete`;
}

function emptyGpuThermalQualification(status, error = "") {
  return {
    status,
    source: "",
    benchmarkComparable: false,
    requiredForBenchmark: true,
    throttleActive: false,
    checks: [],
    deviceCount: 0,
    summary: error || "GPU thermal qualification unavailable",
    error
  };
}

function collectGpuFromBackend(backend, { includeProcesses = true } = {}) {
  if (backend === "gpustat") return collectGpuFromGpustat({ includeProcesses });
  return collectGpuFromNvidiaSmi({ includeProcesses });
}

async function collectGpuFromBackendAsync(backend, { includeProcesses = true } = {}) {
  if (backend === "gpustat") return collectGpuFromGpustatAsync({ includeProcesses });
  return collectGpuFromNvidiaSmiAsync({ includeProcesses });
}

function collectGpuFromNvidiaSmi({ includeProcesses = true } = {}) {
  const queryResult = commandResult("nvidia-smi", nvidiaSmiGpuQueryArgs());
  if (nvidiaSmiUnavailable(queryResult)) {
    return unavailableGpuSample({
      source: queryResult.errorCode === "ENOENT" ? "nvidia-smi-not-found" : "nvidia-smi-unavailable",
      error: compactWhitespace(queryResult.stderr || queryResult.stdout || queryResult.errorMessage || "nvidia-smi returned no GPU rows"),
      includeProcesses
    });
  }

  const processesText = includeProcesses ? collectNvidiaSmiProcessesText() : "";
  return parseNvidiaSmiGpuQuery(queryResult.stdout, { includeProcesses, processesText });
}

async function collectGpuFromNvidiaSmiAsync({ includeProcesses = true } = {}) {
  const queryResult = await commandResultAsync("nvidia-smi", nvidiaSmiGpuQueryArgs());
  if (
    nvidiaSmiUnavailable(queryResult)
  ) {
    return unavailableGpuSample({
      source: queryResult.errorCode === "ENOENT" ? "nvidia-smi-not-found" : "nvidia-smi-unavailable",
      error: compactWhitespace(queryResult.stderr || queryResult.stdout || queryResult.errorMessage || "nvidia-smi returned no GPU rows"),
      includeProcesses
    });
  }

  const processResult = includeProcesses
    ? await collectNvidiaSmiProcessesTextAsync()
    : "";

  return parseNvidiaSmiGpuQuery(queryResult.stdout, {
    includeProcesses,
    processesText: processResult || ""
  });
}

function collectGpuFromGpustat({ includeProcesses = true } = {}) {
  const result = commandResult(gpustatBin, ["--json"]);
  if (result.status !== 0 || !result.stdout.trim()) {
    return unavailableGpuSample({
      source: result.errorCode === "ENOENT" ? "gpustat-not-found" : "gpustat-unavailable",
      error: compactWhitespace(result.stderr || result.errorMessage || "gpustat --json returned no GPU rows"),
      includeProcesses
    });
  }
  return parseGpustatJson(result.stdout, { includeProcesses });
}

async function collectGpuFromGpustatAsync({ includeProcesses = true } = {}) {
  const result = await commandResultAsync(gpustatBin, ["--json"]);
  if (result.status !== 0 || !result.stdout.trim()) {
    return unavailableGpuSample({
      source: result.errorCode === "ENOENT" ? "gpustat-not-found" : "gpustat-unavailable",
      error: compactWhitespace(result.stderr || result.errorMessage || "gpustat --json returned no GPU rows"),
      includeProcesses
    });
  }
  return parseGpustatJson(result.stdout, { includeProcesses });
}

function parseGpustatJson(text, { includeProcesses }) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return unavailableGpuSample({
      source: "gpustat-unavailable",
      error: `gpustat --json parse failed: ${error.message}`,
      includeProcesses
    });
  }
  const gpus = Array.isArray(parsed.gpus) ? parsed.gpus.map((entry) => ({
    name: String(entry.name || ""),
    index: finite(entry.index),
    uuid: String(entry.uuid || ""),
    utilizationGpuPct: finite(entry["utilization.gpu"]),
    utilizationMemoryPct: finite(entry["utilization.memory"]),
    memoryUsedMiB: finite(entry["memory.used"]),
    memoryTotalMiB: finite(entry["memory.total"]),
    powerDrawWatts: finite(entry["power.draw"]),
    temperatureC: finite(entry["temperature.gpu"]),
    fanSpeedPct: finite(entry["fan.speed"]),
    gpuClockMHz: finite(entry["clocks.current.graphics"] ?? entry["clocks.current.sm"] ?? entry["gpu.clock"] ?? entry["graphics.clock"]),
    gpuSmClockMHz: finite(entry["clocks.current.sm"] ?? entry["sm.clock"]),
    gpuMemoryClockMHz: finite(entry["clocks.current.memory"] ?? entry["memory.clock"]),
    pcieGen: undefined,
    pcieWidth: undefined
  })).filter((entry) => entry.name) : [];

  const processes = includeProcesses
    ? (parsed.gpus || []).flatMap((gpuEntry) => (Array.isArray(gpuEntry.processes) ? gpuEntry.processes : [])
      .map((processEntry) => ({
        pid: Number(processEntry.pid),
        processName: processEntry.command || processEntry.process_name || processEntry.name || "",
        command: processEntry.command || processEntry.process_name || processEntry.name || "",
        usedMemoryMiB: finite(processEntry.gpu_memory_usage ?? processEntry["gpu_memory_usage"] ?? processEntry.used_memory),
        username: processEntry.username || "",
        gpuIndex: finite(gpuEntry.index),
        gpuUuid: String(gpuEntry.uuid || ""),
        gpuName: String(gpuEntry.name || "")
      }))
      .filter((entry) => Number.isFinite(entry.pid)))
    : [];

  return {
    present: gpus.length > 0,
    count: gpus.length,
    gpus,
    processes,
    processesObserved: includeProcesses,
    processesSkipped: !includeProcesses,
    collectedAtMs: Date.now(),
    sampleCached: false,
    sampleAgeMs: 0,
    source: "gpustat",
    error: ""
  };
}

function parseNvidiaSmiGpuQuery(query, { includeProcesses, processesText }) {
  const gpus = query.trim().split("\n").map((line) => {
    const [
      name,
      index,
      uuid,
      utilizationGpu,
      utilizationMemory,
      memoryUsedMiB,
      memoryTotalMiB,
      powerDrawWatts,
      temperatureC,
      pcieGen,
      pcieWidth,
      fanSpeedPct,
      gpuGraphicsClockMHz,
      gpuSmClockMHz,
      gpuMemoryClockMHz
    ] = line.split(",").map((item) => item.trim());

    return {
      name,
      index: Number(index),
      uuid,
      utilizationGpuPct: finite(utilizationGpu),
      utilizationMemoryPct: finite(utilizationMemory),
      memoryUsedMiB: finite(memoryUsedMiB),
      memoryTotalMiB: finite(memoryTotalMiB),
      powerDrawWatts: finite(powerDrawWatts),
      temperatureC: finite(temperatureC),
      fanSpeedPct: finite(fanSpeedPct),
      gpuClockMHz: firstFiniteNumber(gpuGraphicsClockMHz, gpuSmClockMHz),
      gpuSmClockMHz: finite(gpuSmClockMHz),
      gpuMemoryClockMHz: finite(gpuMemoryClockMHz),
      pcieGen: finite(pcieGen),
      pcieWidth: finite(pcieWidth)
    };
  }).filter((entry) => entry.name);

  const processes = includeProcesses
    ? processesText.trim().split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(",").map((item) => item.trim());
        const [gpuUuid, pid, processName, usedMemoryMiB] = parts.length >= 4
          ? parts
          : ["", ...parts];
        const gpu = gpus.find((entry) => entry.uuid === gpuUuid) || {};
        return {
          pid: Number(pid),
          processName,
          command: processName,
          usedMemoryMiB: finite(usedMemoryMiB),
          gpuUuid,
          gpuIndex: finite(gpu.index),
          gpuName: gpu.name || ""
        };
      })
      .filter((entry) => Number.isFinite(entry.pid))
    : [];

  return {
    present: gpus.length > 0,
    count: gpus.length,
    gpus,
    processes,
    processesObserved: includeProcesses,
    processesSkipped: !includeProcesses,
    collectedAtMs: Date.now(),
    sampleCached: false,
    sampleAgeMs: 0,
    source: "nvidia-smi",
    error: ""
  };
}

function nvidiaSmiGpuQueryArgs() {
  return [
    "--query-gpu=name,index,uuid,utilization.gpu,utilization.memory,memory.used,memory.total,power.draw,temperature.gpu,pcie.link.gen.current,pcie.link.width.current,fan.speed,clocks.current.graphics,clocks.current.sm,clocks.current.memory",
    "--format=csv,noheader,nounits"
  ];
}

function nvidiaSmiProcessQueryArgs() {
  return [
    "--query-compute-apps=gpu_uuid,pid,process_name,used_memory",
    "--format=csv,noheader,nounits"
  ];
}

function nvidiaSmiLegacyProcessQueryArgs() {
  return [
    "--query-compute-apps=pid,process_name,used_memory",
    "--format=csv,noheader,nounits"
  ];
}

function collectNvidiaSmiProcessesText() {
  const result = commandResult("nvidia-smi", nvidiaSmiProcessQueryArgs());
  if (result.status === 0) return result.stdout || "";
  return command("nvidia-smi", nvidiaSmiLegacyProcessQueryArgs());
}

async function collectNvidiaSmiProcessesTextAsync() {
  const result = await commandResultAsync("nvidia-smi", nvidiaSmiProcessQueryArgs());
  if (result.status === 0) return result.stdout || "";
  const fallback = await commandResultAsync("nvidia-smi", nvidiaSmiLegacyProcessQueryArgs());
  return fallback.stdout || "";
}

function nvidiaSmiUnavailable(result) {
  return result.status !== 0
    || /nvidia-smi has failed|couldn't communicate with the nvidia driver|failed to initialize/i.test(result.stdout)
    || !result.stdout.trim();
}

function unavailableGpuSample({ source, error, includeProcesses }) {
  return {
    present: false,
    count: 0,
    gpus: [],
    processes: [],
    processesObserved: false,
    processesSkipped: !includeProcesses,
    collectedAtMs: Date.now(),
    sampleCached: false,
    sampleAgeMs: 0,
    source,
    error
  };
}

function gpuBackendOrder() {
  if (gpuBackend === "gpustat") return ["gpustat"];
  if (gpuBackend === "nvidia-smi") return ["nvidia-smi"];
  return ["gpustat", "nvidia-smi"];
}

function collectDocker() {
  const psText = command("docker", ["ps", "--format", "{{.Names}}\t{{.Image}}\t{{.Status}}"]);
  const statsText = command("docker", ["stats", "--no-stream", "--format", "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"]);
  const stats = new Map(statsText.trim().split("\n").filter(Boolean).map((line) => {
    const [name, cpu, memory, netIo, blockIo] = line.split("\t");
    return [name, {
      cpuPct: percentText(cpu),
      memory: memory || "",
      netIo: netIo || "",
      blockIo: blockIo || ""
    }];
  }));

  return psText.trim().split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, image, status] = line.split("\t");
      return {
        name,
        image,
        status,
        stats: stats.get(name) || {}
      };
    });
}

function collectServices(hostUrl) {
  const grafanaRuntime = collectGrafanaRuntime(hostUrl);
  const netdata = httpJson("http://127.0.0.1:19999/api/v1/info");
  const ollama = httpJson("http://127.0.0.1:11434/api/tags");
  const ollamaPs = ollama.ok ? httpJson("http://127.0.0.1:11434/api/ps") : { ok: false, body: null };
  const ollamaTelemetry = ollama.ok ? collectOllamaTelemetry({ running: ollamaPs.body }) : null;
  const appMetricsText = command("curl", ["-sS", "--max-time", "2", "http://127.0.0.1:9500/metrics"]);
  const appMetricsUp = /gb100_app_collector_up\s+1\b/.test(appMetricsText) || appMetricsText.includes("gb100_metric_capability");
  const collectorMetricsText = command("curl", ["-sS", "--max-time", "2", "http://127.0.0.1:8801/metrics"]);
  const collectorGateway = parseCollectorGatewayMetrics(collectorMetricsText);
  const collectorReady = httpJson("http://127.0.0.1:8801/ready");
  const apiReady = httpJson("http://127.0.0.1:8080/ready");
  const profilingExporter = collectProfilingExporter();
  const nodeExporter = command("curl", ["-sS", "--max-time", "2", "http://127.0.0.1:9100/metrics"]);
  const hostAddress = primaryAddress();
  const kafkaReachable = tcpReachable("127.0.0.1", 30992)
    || (hostAddress !== "127.0.0.1" && tcpReachable(hostAddress, 30992));
  const kafkaEvidence = kafkaReachable ? collectKafkaSmokeEvidence() : {};

  return {
    hostUrl,
    grafana: grafanaRuntime.health,
    grafanaRuntime,
    netdata: netdata.ok ? netdata.body : null,
    ollama: ollama.ok ? ollama.body : null,
    ollamaRunning: ollamaPs.ok ? ollamaPs.body : null,
    ollamaTelemetry,
    appMetricsUp,
    collectorGatewayUp: collectorGateway.reachable,
    collectorGateway,
    collectorReady: collectorReady.ok ? collectorReady.body : null,
    apiReady: apiReady.ok ? apiReady.body : null,
    profilingExporter,
    kafka: kafkaReachable ? {
      bootstrapServers: "spark1-kafka.turbalance-demo.svc.cluster.local:9092",
      nodePortBootstrap: `${hostAddress}:30992`,
      ...kafkaEvidence
    } : null,
    nodeExporterUp: nodeExporter.includes("# HELP"),
    observedServices: [
      grafanaRuntime.reachable ? "grafana" : null,
      netdata.ok ? "netdata" : null,
      ollama.ok ? "ollama" : null,
      appMetricsUp ? "app-metrics" : null,
      collectorGateway.reachable ? "collector-gateway" : null,
      kafkaReachable ? "kafka" : null,
      nodeExporter.includes("# HELP") ? "node-exporter" : null
    ].filter(Boolean)
  };
}

function collectGrafanaRuntime(hostUrl) {
  const publicBaseUrl = process.env.TURBALANCE_GRAFANA_PUBLIC_URL
    || publicServiceUrl(hostUrl, process.env.TURBALANCE_GRAFANA_PUBLIC_PORT || "3001");
  const candidates = [
    process.env.TURBALANCE_GRAFANA_URL,
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3000"
  ].filter(Boolean);
  for (const baseUrl of candidates) {
    const health = httpJson(`${String(baseUrl).replace(/\/+$/, "")}/api/health`);
    if (!health.ok) continue;
    const dashboardUrl = `${publicBaseUrl}/d/turbalance-fleet-runtime/turbalance-fleet-runtime?orgId=1&from=now-1h&to=now&refresh=5s`;
    return {
      reachable: true,
      baseUrl: publicBaseUrl,
      internalBaseUrl: String(baseUrl).replace(/\/+$/, ""),
      health: health.body,
      dashboardUid: "turbalance-fleet-runtime",
      dashboardSlug: "turbalance-fleet-runtime",
      dashboardTitle: "turbalance Fleet Runtime",
      datasourceUid: "prometheus",
      datasourceName: "turbalance Prometheus",
      dashboardUrl,
      exploreUrl: `${publicBaseUrl}/explore?orgId=1`
    };
  }
  return {
    reachable: false,
    baseUrl: publicBaseUrl,
    internalBaseUrl: "",
    health: null,
    dashboardUid: "turbalance-fleet-runtime",
    dashboardSlug: "turbalance-fleet-runtime",
    dashboardTitle: "turbalance Fleet Runtime",
    datasourceUid: "prometheus",
    datasourceName: "turbalance Prometheus",
    dashboardUrl: `${publicBaseUrl}/d/turbalance-fleet-runtime/turbalance-fleet-runtime?orgId=1&from=now-1h&to=now&refresh=5s`,
    exploreUrl: `${publicBaseUrl}/explore?orgId=1`
  };
}

function publicServiceUrl(hostUrl, port) {
  try {
    const url = new URL(hostUrl || "http://127.0.0.1");
    url.port = String(port || "3001");
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch (_error) {
    return `http://127.0.0.1:${port || "3001"}`;
  }
}

function parseCollectorGatewayMetrics(text) {
  return {
    reachable: text.includes("turbalance_collector_accepted_batches_total")
      || text.includes("turbalance_collector_incoming_telemetry_reports_per_minute"),
    acceptedBatchesTotal: prometheusMetricValue(text, "turbalance_collector_accepted_batches_total"),
    writtenRowsTotal: prometheusMetricValue(text, "turbalance_collector_written_rows_total"),
    incomingReportsPerSecond: prometheusMetricValue(text, "turbalance_collector_incoming_telemetry_reports_per_second"),
    incomingReportsPerMinute: prometheusMetricValue(text, "turbalance_collector_incoming_telemetry_reports_per_minute"),
    incomingReportsWindowCount: prometheusMetricValue(text, "turbalance_collector_incoming_telemetry_reports_window_count"),
    incomingReportsWindowSeconds: prometheusMetricValue(text, "turbalance_collector_incoming_telemetry_reports_window_seconds")
  };
}

function prometheusMetricValue(text, metricName) {
  const escapedName = String(metricName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(text || "").match(new RegExp(`^${escapedName}(?:\\{[^}]*\\})?\\s+(-?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?)\\b`, "mi"));
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function collectHardwareHealth({ host, gpu, docker, services, benchmark }) {
  const hostRole = hardwareHostRole(host);
  const kernel = collectKernelFaultSignals();
  const failedUnits = collectFailedSystemdUnits();
  const thermal = collectThermalThrottleState();
  const faults = [];

  if (kernel.machineCheckCount > 0) {
    faults.push(hardwareFault({
      id: "machine-check",
      category: "cpu-memory",
      severity: kernel.machineCheckCount >= 3 ? "critical" : "high",
      source: kernel.source,
      count: kernel.machineCheckCount,
      detail: `${kernel.machineCheckCount} machine-check, MCE, EDAC, ECC, or hardware-error event${kernel.machineCheckCount === 1 ? "" : "s"} observed.`,
      suggestedAction: "open-repair-ticket"
    }));
  }
  if (kernel.gpuXidCount > 0) {
    faults.push(hardwareFault({
      id: "gpu-xid",
      category: "gpu",
      severity: kernel.gpuXidCount >= 3 ? "critical" : "high",
      source: kernel.source,
      count: kernel.gpuXidCount,
      detail: `${kernel.gpuXidCount} NVIDIA Xid or NVRM event${kernel.gpuXidCount === 1 ? "" : "s"} observed.`,
      suggestedAction: "restart-gpu-workload-or-open-ticket"
    }));
  }
  if (kernel.storageErrorCount > 0) {
    faults.push(hardwareFault({
      id: "storage-error",
      category: "storage",
      severity: kernel.storageErrorCount >= 3 ? "critical" : "high",
      source: kernel.source,
      count: kernel.storageErrorCount,
      detail: `${kernel.storageErrorCount} storage, NVMe, ATA, or I/O error event${kernel.storageErrorCount === 1 ? "" : "s"} observed.`,
      suggestedAction: "open-repair-ticket"
    }));
  }
  if (kernel.pcieAerCount > 0) {
    faults.push(hardwareFault({
      id: "pcie-aer",
      category: "pcie",
      severity: kernel.pcieAerCount >= 5 ? "high" : "medium",
      source: kernel.source,
      count: kernel.pcieAerCount,
      detail: `${kernel.pcieAerCount} PCIe AER/error event${kernel.pcieAerCount === 1 ? "" : "s"} observed.`,
      suggestedAction: "inspect-pcie-link"
    }));
  }
  if (kernel.oomKillCount > 0) {
    faults.push(hardwareFault({
      id: "oom-kill",
      category: "memory",
      severity: kernel.oomKillCount >= 2 ? "high" : "medium",
      source: kernel.source,
      count: kernel.oomKillCount,
      detail: `${kernel.oomKillCount} OOM kill or out-of-memory event${kernel.oomKillCount === 1 ? "" : "s"} observed.`,
      suggestedAction: "reduce-memory-pressure"
    }));
  }
  if (failedUnits.count > 0) {
    faults.push(hardwareFault({
      id: "failed-systemd-units",
      category: "service",
      severity: failedUnits.count >= 3 ? "high" : "medium",
      source: "systemctl",
      count: failedUnits.count,
      detail: `${failedUnits.count} failed systemd unit${failedUnits.count === 1 ? "" : "s"}: ${failedUnits.units.slice(0, 4).join(", ")}`,
      suggestedAction: "restart-failed-services"
    }));
  }
  if (thermal.active || finite(host.cpuTemperatureC, 0) >= 82) {
    faults.push(hardwareFault({
      id: "thermal-throttle",
      category: "thermal",
      severity: finite(host.cpuTemperatureC, 0) >= 90 ? "critical" : "high",
      source: thermal.source || "host-temperature",
      count: 1,
      detail: thermal.active ? `Thermal throttle state is ${thermal.raw}.` : `CPU temperature is ${round(host.cpuTemperatureC, 1)} C.`,
      suggestedAction: "inspect-cooling-power"
    }));
  }
  const primaryGpu = gpu.gpus?.[0] || {};
  if (finite(primaryGpu.temperatureC, 0) >= 86) {
    faults.push(hardwareFault({
      id: "gpu-thermal",
      category: "gpu",
      severity: finite(primaryGpu.temperatureC, 0) >= 92 ? "critical" : "high",
      source: gpu.source || "gpu",
      count: 1,
      detail: `GPU temperature is ${round(primaryGpu.temperatureC, 1)} C.`,
      suggestedAction: "inspect-cooling-power"
    }));
  }
  if (["fail", "warn"].includes(gpu.thermalQualification?.status)) {
    faults.push(hardwareFault({
      id: "gpu-thermal-qualification",
      category: "gpu",
      severity: gpu.thermalQualification.status === "fail" ? "critical" : "medium",
      source: gpu.thermalQualification.source || "gpu-thermal-qualification",
      count: 1,
      detail: gpu.thermalQualification.summary || "GPU thermal benchmark qualification needs operator review.",
      suggestedAction: "inspect-cooling-power"
    }));
  }
  if (hostRole !== "pi" && !gpu.present && /nvidia|gpu/i.test(`${gpu.source || ""} ${gpu.error || ""}`)) {
    faults.push(hardwareFault({
      id: "gpu-telemetry-unavailable",
      category: "gpu",
      severity: "medium",
      source: gpu.source || "gpu-telemetry",
      count: 1,
      detail: gpu.error || "GPU telemetry source did not return counters.",
      suggestedAction: "restart-gpu-telemetry"
    }));
  }
  if (finite(host.network.rxErrors, 0) + finite(host.network.txErrors, 0) > 0) {
    faults.push(hardwareFault({
      id: "network-errors",
      category: "network",
      severity: "medium",
      source: "procfs-netdev",
      count: finite(host.network.rxErrors, 0) + finite(host.network.txErrors, 0),
      detail: `${round(finite(host.network.rxErrors, 0), 0)} RX and ${round(finite(host.network.txErrors, 0), 0)} TX interface errors observed on ${host.network.iface || "primary interface"}.`,
      suggestedAction: "inspect-network-link"
    }));
  }
  if (finite(host.network.rxDrops, 0) + finite(host.network.txDrops, 0) > 0) {
    faults.push(hardwareFault({
      id: "network-drops",
      category: "network",
      severity: "low",
      source: "procfs-netdev",
      count: finite(host.network.rxDrops, 0) + finite(host.network.txDrops, 0),
      detail: `${round(finite(host.network.rxDrops, 0), 0)} RX and ${round(finite(host.network.txDrops, 0), 0)} TX drops observed on ${host.network.iface || "primary interface"}.`,
      suggestedAction: "inspect-network-link"
    }));
  }
  if (!host.clock.synchronized && host.clock.ptpInstalled) {
    faults.push(hardwareFault({
      id: "clock-sync-not-synchronized",
      category: "clock",
      severity: "medium",
      source: host.clock.source || "clock-sync",
      count: 1,
      detail: host.clock.detail || "PTP/clock stack is installed but the host is not synchronized.",
      suggestedAction: "restart-clock-sync"
    }));
  }

  const scoredFaults = faults.slice(0, 12);
  const faultScore = Math.min(100, scoredFaults.reduce((total, fault) => total + hardwareSeverityScore(fault.severity) * Math.max(1, Math.min(3, finite(fault.count, 1))), 0));
  const action = recommendedHardwareAction(scoredFaults, { docker, services, benchmark });
  const level = faultScore >= 80 ? "critical" : faultScore >= 45 ? "high" : faultScore >= 18 ? "watch" : "healthy";
  const dimensions = {
    hostRole,
    platform: host.platform,
    arch: host.arch,
    kernel: host.kernel,
    gpuSource: gpu.source || "",
    gpuName: primaryGpu.name || "",
    clockSource: host.clock.source || "",
    ptpActive: Boolean(host.clock.ptpActive),
    collectorGateway: Boolean(services.collectorGatewayUp),
    benchmarkStatus: benchmark.status || "disabled"
  };
  return {
    healthScore: Math.max(0, 100 - faultScore),
    faultScore,
    level,
    faultCount: scoredFaults.length,
    criticalFaultCount: scoredFaults.filter((fault) => fault.severity === "critical").length,
    warningFaultCount: scoredFaults.filter((fault) => ["high", "medium"].includes(fault.severity)).length,
    kernelEventCount: kernel.eventCount,
    machineCheckCount: kernel.machineCheckCount,
    gpuXidCount: kernel.gpuXidCount,
    storageErrorCount: kernel.storageErrorCount,
    pcieAerCount: kernel.pcieAerCount,
    oomKillCount: kernel.oomKillCount,
    failedUnitCount: failedUnits.count,
    thermalThrottleActive: thermal.active,
    thermalThrottleRaw: thermal.raw,
    repairAction: action.id,
    repairConfidence: action.confidence,
    repairRequiresApproval: action.requiresApproval,
    rcaFingerprint: hardwareRcaFingerprint(scoredFaults, dimensions),
    dimensions,
    faults: scoredFaults
  };
}

function collectKernelFaultSignals() {
  const journal = command("journalctl", ["-k", "--since", "-15 minutes", "--no-pager", "-o", "short-iso"]);
  const dmesg = journal ? "" : command("dmesg", ["--level=err,warn"]);
  const text = journal || dmesg || "";
  return {
    source: journal ? "journalctl-kernel" : dmesg ? "dmesg" : "unavailable",
    eventCount: countMatches(text, /hardware error|machine check|mce:|edac|ecc|ras|nvrm|xid|nvme|i\/o error|blk_update_request|buffer i\/o|pcie|aer:|oom-kill|out of memory/gi),
    machineCheckCount: countMatches(text, /hardware error|machine check|mce:|edac|ecc|ras/gi),
    gpuXidCount: countMatches(text, /\bXid\b|NVRM.*Xid/gi),
    storageErrorCount: countMatches(text, /nvme.*(?:error|reset|timeout|critical)|i\/o error|blk_update_request|buffer i\/o|medium error|ata\d.*error/gi),
    pcieAerCount: countMatches(text, /pcie.*(?:aer|error)|aer:/gi),
    oomKillCount: countMatches(text, /oom-kill|out of memory|killed process/gi)
  };
}

function collectFailedSystemdUnits() {
  const text = command("systemctl", ["--failed", "--no-legend", "--plain"]);
  const units = text.split("\n")
    .map((line) => line.trim().split(/\s+/)[0])
    .filter((unit) => unit && unit.endsWith(".service"));
  return { count: units.length, units };
}

function collectThermalThrottleState() {
  const raw = command("vcgencmd", ["get_throttled"]).trim();
  const match = raw.match(/0x([0-9a-f]+)/i);
  const value = match ? Number.parseInt(match[1], 16) : 0;
  return {
    source: raw ? "vcgencmd" : "",
    raw,
    active: Number.isFinite(value) && value > 0
  };
}

function hardwareHostRole(host = {}) {
  const hostname = String(host.hostname || "").toLowerCase();
  const identity = `${hostname} ${host.cpuModel || ""} ${host.osName || ""}`.toLowerCase();
  if (/^pi\d+$/.test(hostname) || identity.includes("raspberry pi") || /\bbcm\d+/.test(identity)) {
    return "pi";
  }
  if (/spark/i.test(host.hostname || "")) {
    return "spark";
  }
  return "nuc";
}

function hardwareFault({ id, category, severity, source, count, detail, suggestedAction }) {
  return {
    id,
    category,
    severity,
    source,
    count: round(finite(count, 1), 0),
    detail: compactWhitespace(detail),
    suggestedAction
  };
}

function hardwareSeverityScore(severity) {
  if (severity === "critical") return 35;
  if (severity === "high") return 22;
  if (severity === "medium") return 12;
  return 5;
}

function recommendedHardwareAction(faults) {
  const top = [...faults].sort((left, right) => hardwareSeverityScore(right.severity) - hardwareSeverityScore(left.severity))[0];
  if (!top) return { id: "observe", confidence: 0.5, requiresApproval: false };
  if (["machine-check", "storage-error", "gpu-xid", "gpu-thermal", "gpu-thermal-qualification", "thermal-throttle"].includes(top.id)) {
    return { id: top.suggestedAction, confidence: top.severity === "critical" ? 0.9 : 0.78, requiresApproval: true };
  }
  if (["failed-systemd-units", "gpu-telemetry-unavailable", "clock-sync-not-synchronized"].includes(top.id)) {
    return { id: top.suggestedAction, confidence: 0.72, requiresApproval: false };
  }
  return { id: top.suggestedAction || "inspect-host", confidence: 0.65, requiresApproval: false };
}

function hardwareRcaFingerprint(faults, dimensions) {
  const categories = [...new Set(faults.map((fault) => fault.category))].sort().join("-");
  return safeId([
    dimensions.hostRole,
    dimensions.arch,
    dimensions.kernel,
    dimensions.gpuSource,
    categories || "healthy"
  ].filter(Boolean).join("-"));
}

function countMatches(text, pattern) {
  return ((String(text || "").match(pattern) || []).length);
}

function deriveMetrics({ host, gpu, docker, services, windowMinutes }) {
  const primaryGpu = gpu.gpus[0] || {};
  const gpuUtil = finite(primaryGpu.utilizationGpuPct, 0);
  const gpuMemoryPct = primaryGpu.memoryTotalMiB > 0 ? (primaryGpu.memoryUsedMiB / primaryGpu.memoryTotalMiB) * 100 : 0;
  const hasActiveGpuProcess = gpu.processesObserved
    ? (gpu.processes || []).length > 0
    : gpu.present && gpuUtil > 1;
  const cpuBusyPct = finite(host.cpuUsagePct, 0);
  const loadPressurePct = clamp((host.load1 / Math.max(1, host.cpuCount)) * 100, 0, 100);
  const memoryUsedPct = host.memoryTotalBytes > 0
    ? ((host.memoryTotalBytes - host.memoryAvailableBytes) / host.memoryTotalBytes) * 100
    : 0;
  const diskUsedPct = host.disk.totalBytes > 0 ? (host.disk.usedBytes / host.disk.totalBytes) * 100 : 0;
  const dockerCpuPct = docker.reduce((total, container) => total + finite(container.stats?.cpuPct, 0), 0);
  const modelCount = Array.isArray(services.ollama?.models) ? services.ollama.models.length : 0;
  const largeModelCount = Array.isArray(services.ollama?.models)
    ? services.ollama.models.filter((model) => /70b|120b|116\.8B/i.test(`${model.name} ${model.details?.parameter_size || ""}`)).length
    : 0;
  const ollamaTokensPerSecond = finite(services.ollamaTelemetry?.tokensPerSecond, 0);
  const ollamaTimeToFirstTokenMs = finite(services.ollamaTelemetry?.timeToFirstTokenMs, 0);

  return {
    gpuUtil,
    usefulCompute: hasActiveGpuProcess ? clamp(gpuUtil * 0.75, 0, 92) : 0,
    smOccupancy: hasActiveGpuProcess ? clamp(gpuUtil * 0.8, 0, 95) : 0,
    tensorCoreUtil: hasActiveGpuProcess ? clamp(gpuUtil * 0.65, 0, 90) : 0,
    gpuMemoryPct,
    hbmBandwidthPct: hasActiveGpuProcess ? clamp(gpuUtil * 0.55, 0, 90) : 0,
    cpuBusyPct,
    loadPressurePct,
    memoryUsedPct,
    diskUsedPct,
    dockerCpuPct,
    modelCount,
    largeModelCount,
    ollamaTokensPerSecond,
    ollamaTimeToFirstTokenMs,
    allocatedGpuHours: gpu.present ? gpu.count * (windowMinutes / 60) : 0,
    durationHours: windowMinutes / 60,
    gpus: gpu.count,
    powerWatts: finite(primaryGpu.powerDrawWatts, 0),
    temperatureC: finite(primaryGpu.temperatureC, 0),
    networkUtilizationPct: optionalFinite(host.network.utilizationPct),
    networkRxBytesPerSecond: optionalFinite(host.network.rxBytesPerSecond),
    networkTxBytesPerSecond: optionalFinite(host.network.txBytesPerSecond),
    networkWait: clamp(loadPressurePct * 0.15 + (host.network.txDrops > 0 ? 4 : 0), 0, 25),
    storageWait: clamp(Math.max(0, diskUsedPct - 75) * 0.6, 0, 35),
    cpuPrep: clamp(Math.max(cpuBusyPct, dockerCpuPct) * 0.75, 0, 45),
    contentionPct: clamp(Math.max(loadPressurePct, dockerCpuPct), 0, 45),
    latencyTail: clamp(loadPressurePct * 0.6 + (host.network.txDrops > 0 ? 6 : 0), 0, 35),
    noGpuProcess: gpu.present && gpu.processesObserved && !hasActiveGpuProcess
  };
}

function buildBundle({ runId, host, gpu, docker, services, metrics, hostUrl, generatedAt, windowMinutes, ncclRuntime = {}, benchmark = {}, hardware = {} }) {
  const primaryGpu = gpu.gpus[0] || {};
  const gpuName = gpuLabel(primaryGpu, gpu);
  const gb10Present = gpu.gpus.some((entry) => isGb10GpuName(entry.name));
  const gb10MonitoringList = gb10Present ? buildGb10MonitoringList({ host, gpu, services }) : [];
  const modelKey = safeId(primaryGpu.name || gpuName);
  const clusterKey = safeId(host.hostname);
  const tenant = "local-lab";
  const account = safeId(host.hostname);
  const reservation = primaryGpu.name ? `${safeId(primaryGpu.name)}-workstation` : "cpu-only-workstation";
  const generatedIso = generatedAt.toISOString();
  const activeModelNames = Array.isArray(services.ollama?.models)
    ? services.ollama.models.slice(0, 6).map((model) => model.name)
    : [];
  const runningOllamaModels = ollamaRunningModelNames(services.ollamaRunning);
  const ollamaTelemetry = services.ollamaTelemetry || {};
  const sourceAdapters = machineSourceAdapters(gpu, services, ncclRuntime, benchmark, host.clock);
  const gpuProcessInspector = gpu.processInspector || buildGpuProcessInspector(gpu, { includeProcesses: !gpu.processesSkipped });
  const gpuTopology = gpu.topology || emptyGpuTopology("unavailable");
  const gpuThermalQualification = gpu.thermalQualification || emptyGpuThermalQualification("unavailable");

  return {
      metadata: {
      generatedAt: generatedIso,
      source: "collect-local-machine-bundle.js",
      observedHost: host.hostname,
      sourceAdapters,
      note: "Strict live machine observation. The bundle only claims data collected from gpustat/NVML or nvidia-smi when present, host OS counters, Docker when present, and reachable local services; Kubernetes, DCGM, eBPF, scheduler, and provider exports are not synthesized."
    },
    ingestion: {
      schemaVersion: "turba.ingestion.v1",
      entities: {
        models: {
          [modelKey]: {
            label: primaryGpu.name ? `${primaryGpu.name} local capacity` : `${gpuName} local host`,
            family: primaryGpu.name ? "local-gpu" : "local-cpu",
            parameterCountB: metrics.largeModelCount > 0 ? 120 : 0
          }
        },
        users: {
          "local-operator": { label: os.userInfo().username || "local operator" }
        },
        teams: {
          "local-ai-ops": { label: "Local AI Ops" }
        },
        tenants: {
          [tenant]: { label: "Local lab" }
        },
        accounts: {
          [account]: { label: host.hostname }
        },
        reservations: {
          [reservation]: { label: primaryGpu.name ? `${primaryGpu.name} workstation window` : "CPU workstation window" }
        },
        clusters: {
          [clusterKey]: {
            label: host.hostname,
            region: "local-lan",
            topology: "single-node"
          }
        }
      },
      runs: [
        {
          id: runId,
          name: `${host.hostname} current ${primaryGpu.name || "host"} window`,
          refs: {
            model: modelKey,
            user: "local-operator",
            team: "local-ai-ops",
            cluster: clusterKey,
            tenant,
            account,
            reservation
          },
          status: metrics.noGpuProcess ? "GPU idle, observability active" : "Live host observation",
          importedSources: sourceAdapters,
          allocation: {
            durationHours: round(metrics.durationHours, 3),
            gpus: metrics.gpus,
            allocatedGpuHours: round(metrics.allocatedGpuHours, 3),
            gpuModel: gpuName
          },
          utilization: {
            gpuUtil: round(metrics.gpuUtil, 2),
            usefulCompute: round(metrics.usefulCompute, 2),
            smOccupancy: round(metrics.smOccupancy, 2),
            tensorCoreUtil: round(metrics.tensorCoreUtil, 2)
          },
          communication: {
            ncclTime: 0,
            networkWait: round(metrics.networkWait, 2),
            networkUtilization: roundOptional(metrics.networkUtilizationPct, 2),
            allToAllTime: 0,
            crossRackTraffic: 0,
            crossPodTraffic: 0
          },
          inputPipeline: {
            dataloaderStall: 0,
            storageWait: round(metrics.storageWait, 2),
            cpuPrep: round(metrics.cpuPrep, 2)
          },
          memory: {
            hbmCapacity: round(metrics.gpuMemoryPct, 2),
            hbmBandwidth: round(metrics.hbmBandwidthPct, 2),
            memoryFragmentation: 0,
            kvCachePressure: round(metrics.gpuMemoryPct, 2)
          },
          scheduler: {
            placementQuality: 100,
            idleGpus: metrics.noGpuProcess ? metrics.gpus : 0,
            partialNodes: 0,
            queueWaitMinutes: 0,
            gpusPerNode: Math.max(1, metrics.gpus)
          },
          reliability: {
            noiseEvents: host.network.txDrops > 0 ? 1 : 0,
            contentionPct: round(metrics.contentionPct, 2),
            stepRegularity: metrics.noGpuProcess ? 100 : clamp(100 - metrics.latencyTail, 70, 100),
            latencyTail: round(metrics.latencyTail, 2)
          },
          configuration: {
            precisionLoss: 0,
            batchInefficiency: 0
          },
          work: {
            tokensM: 0,
            steps: 0,
            inferenceRequestsM: 0
          },
          baseline: {
            gpuEfficiency: 65,
            queueWaitMinutes: 0,
            ncclTime: 0
          },
          placement: {
            nodes: [host.hostname],
            partialNodes: []
          },
          sourceContext: {
            hostname: host.hostname,
            platform: host.platform,
            arch: host.arch,
            os: host.osName,
            kernel: host.kernel,
            cpuModel: host.cpuModel,
            cpuCount: host.cpuCount,
            uptimeSeconds: round(host.uptimeSeconds, 0),
            clockSource: host.clock.source,
            clockSynchronized: Boolean(host.clock.synchronized),
            clockTimeUnixMs: round(finite(host.clock.timeUnixMs, 0), 0),
            clockTimeUnixNs: host.clock.timeUnixNs || "",
            clockTimezone: host.clock.timezone || "",
            clockLocalRtc: Boolean(host.clock.localRtc),
            clockOffsetNs: roundOptional(host.clock.offsetNs, 0),
            clockRmsOffsetNs: roundOptional(host.clock.rmsOffsetNs, 0),
            clockPtpInstalled: Boolean(host.clock.ptpInstalled),
            clockPtpActive: Boolean(host.clock.ptpActive),
            clockPtpPortState: host.clock.ptpPortState || "",
            clockPtpGrandmaster: host.clock.ptpGrandmaster || "",
            clockChronyReference: host.clock.chronyReference || "",
            clockChronyStratum: roundOptional(host.clock.chronyStratum, 0),
            clockSyncServices: host.clock.services || [],
            clockSyncDetail: host.clock.detail || "",
            load1: round(host.load1, 3),
            load5: round(host.load5, 3),
            load15: round(host.load15, 3),
            cpuUsagePct: round(metrics.cpuBusyPct, 2),
            cpuTemperatureC: roundOptional(host.cpuTemperatureC, 2),
            memoryTotalBytes: host.memoryTotalBytes,
            memoryAvailableBytes: host.memoryAvailableBytes,
            memoryUsedPct: round(metrics.memoryUsedPct, 2),
            diskTotalBytes: host.disk.totalBytes,
            diskUsedBytes: host.disk.usedBytes,
            diskUsedPct: round(metrics.diskUsedPct, 2),
            lakehouseRoot: host.lakehouse.root,
            lakehouseExists: Boolean(host.lakehouse.exists),
            lakehouseMeasuredAt: host.lakehouse.measuredAt,
            lakehouseUsedBytes: round(host.lakehouse.usedBytes, 0),
            lakehouseDiskFilesystem: host.lakehouse.disk.filesystem,
            lakehouseDiskType: host.lakehouse.disk.type,
            lakehouseDiskTotalBytes: host.lakehouse.disk.totalBytes,
            lakehouseDiskUsedBytes: host.lakehouse.disk.usedBytes,
            lakehouseDiskAvailableBytes: host.lakehouse.disk.availableBytes,
            lakehouseDiskUsedPct: round(host.lakehouse.diskUsedPct, 2),
            networkInterface: host.network.iface,
            networkLocalAddress: host.network.localAddress,
            networkPeerAddress: host.network.peerAddress,
            networkLinkRole: host.network.linkRole,
            networkSelectionReason: host.network.selectionReason,
            networkLinkSpeedMbps: roundOptional(host.network.linkSpeedMbps, 0),
            networkRxBytes: round(host.network.rxBytes, 0),
            networkTxBytes: round(host.network.txBytes, 0),
            networkRxBytesPerSecond: roundOptional(metrics.networkRxBytesPerSecond, 2),
            networkTxBytesPerSecond: roundOptional(metrics.networkTxBytesPerSecond, 2),
            networkUtilizationPct: roundOptional(metrics.networkUtilizationPct, 2),
            networkRxDrops: round(host.network.rxDrops, 0),
            networkTxDrops: round(host.network.txDrops, 0),
            networkRxErrors: round(host.network.rxErrors, 0),
            networkTxErrors: round(host.network.txErrors, 0),
            dockerContainers: docker.map((container) => ({
              name: container.name,
              image: container.image,
              status: container.status,
              cpuPct: round(finite(container.stats?.cpuPct, 0), 2),
              memory: container.stats?.memory || "",
              netIo: container.stats?.netIo || "",
              blockIo: container.stats?.blockIo || ""
            })),
            observedServices: services.observedServices,
            grafanaBaseUrl: services.grafanaRuntime?.baseUrl || "",
            grafanaInstance: services.grafanaRuntime?.health?.version ? `Grafana ${services.grafanaRuntime.health.version}` : "",
            grafanaOrgId: "1",
            grafanaDashboardUid: services.grafanaRuntime?.dashboardUid || "",
            grafanaDashboardSlug: services.grafanaRuntime?.dashboardSlug || "",
            grafanaDashboardTitle: services.grafanaRuntime?.dashboardTitle || "",
            grafanaDatasourceUid: services.grafanaRuntime?.datasourceUid || "",
            grafanaDatasourceName: services.grafanaRuntime?.datasourceName || "",
            grafanaDashboardUrl: services.grafanaRuntime?.dashboardUrl || "",
            grafanaExploreUrl: services.grafanaRuntime?.exploreUrl || "",
            collectorGatewayReachable: Boolean(services.collectorGatewayUp),
            collectorAcceptedBatchesTotal: roundOptional(services.collectorGateway?.acceptedBatchesTotal, 0),
            collectorWrittenRowsTotal: roundOptional(services.collectorGateway?.writtenRowsTotal, 0),
            collectorIncomingReportsPerSecond: roundOptional(services.collectorGateway?.incomingReportsPerSecond, 3),
            collectorIncomingReportsPerMinute: roundOptional(services.collectorGateway?.incomingReportsPerMinute, 2),
            collectorIncomingReportsWindowCount: roundOptional(services.collectorGateway?.incomingReportsWindowCount, 0),
            collectorIncomingReportsWindowSeconds: roundOptional(services.collectorGateway?.incomingReportsWindowSeconds, 0),
            collectorAuthBearer: Boolean(services.collectorReady?.auth?.bearerToken),
            collectorAuthHmac: Boolean(services.collectorReady?.auth?.hmac),
            collectorAuthMtls: Boolean(services.collectorReady?.auth?.mtls),
            apiAuthRequired: Boolean(services.apiReady?.authRequired),
            hardwareHealthScore: roundOptional(hardware.healthScore, 2),
            hardwareFaultScore: roundOptional(hardware.faultScore, 2),
            hardwareFaultLevel: hardware.level || "unknown",
            hardwareFaultCount: round(finite(hardware.faultCount, 0), 0),
            hardwareCriticalFaultCount: round(finite(hardware.criticalFaultCount, 0), 0),
            hardwareWarningFaultCount: round(finite(hardware.warningFaultCount, 0), 0),
            hardwareKernelEventCount: round(finite(hardware.kernelEventCount, 0), 0),
            hardwareMachineCheckCount: round(finite(hardware.machineCheckCount, 0), 0),
            hardwareGpuXidCount: round(finite(hardware.gpuXidCount, 0), 0),
            hardwareStorageErrorCount: round(finite(hardware.storageErrorCount, 0), 0),
            hardwarePcieAerCount: round(finite(hardware.pcieAerCount, 0), 0),
            hardwareOomKillCount: round(finite(hardware.oomKillCount, 0), 0),
            hardwareFailedUnitCount: round(finite(hardware.failedUnitCount, 0), 0),
            hardwareThermalThrottleActive: Boolean(hardware.thermalThrottleActive),
            hardwareThermalThrottleRaw: hardware.thermalThrottleRaw || "",
            hardwareRepairAction: hardware.repairAction || "observe",
            hardwareRepairConfidence: roundOptional(hardware.repairConfidence, 2),
            hardwareRepairRequiresApproval: Boolean(hardware.repairRequiresApproval),
            hardwareRcaFingerprint: hardware.rcaFingerprint || "",
            hardwareFaults: hardware.faults || [],
            hardwareRcaDimensions: hardware.dimensions || {},
            kafkaBootstrapServers: services.kafka?.bootstrapServers || "",
            kafkaNodePortBootstrap: services.kafka?.nodePortBootstrap || "",
            kafkaSmokeStatus: services.kafka?.smokeStatus || "",
            kafkaSmokeTopic: services.kafka?.smokeTopic || "",
            kafkaSmokeMessageId: services.kafka?.smokeMessageId || "",
            kafkaSmokeTimestamp: services.kafka?.smokeTimestamp || "",
            kafkaSmokePayload: services.kafka?.smokePayload || "",
            kafkaSmokeProcessedMessages: services.kafka?.smokeProcessedMessages || 0,
            ollamaModels: activeModelNames,
            ollamaRunningModels: runningOllamaModels,
            ollamaTelemetryStatus: ollamaTelemetry.status || (services.ollama ? "reachable" : ""),
            ollamaProbeModel: ollamaTelemetry.probeModel || "",
            ollamaTokensPerSecond: round(metrics.ollamaTokensPerSecond, 2),
            ollamaTimeToFirstTokenMs: round(metrics.ollamaTimeToFirstTokenMs, 0),
            ollamaEvalCount: round(finite(ollamaTelemetry.evalCount, 0), 0),
            ollamaEvalDurationMs: round(finite(ollamaTelemetry.evalDurationMs, 0), 0),
            ollamaTotalDurationMs: round(finite(ollamaTelemetry.totalDurationMs, 0), 0),
            ollamaLoadDurationMs: round(finite(ollamaTelemetry.loadDurationMs, 0), 0),
            ollamaPromptEvalCount: round(finite(ollamaTelemetry.promptEvalCount, 0), 0),
            ollamaPromptEvalDurationMs: round(finite(ollamaTelemetry.promptEvalDurationMs, 0), 0),
            ollamaProbeCached: Boolean(ollamaTelemetry.sampleCached),
            ollamaProbeAgeMs: round(finite(ollamaTelemetry.sampleAgeMs, 0), 0),
            ollamaProbeError: ollamaTelemetry.error || "",
            gpuPresent: gpu.present,
            gpuName: primaryGpu.name || "",
            gpuSource: gpu.source,
            gpuBackendRequested: gpu.requestedSource || gpuBackend,
            gpuAttemptedSources: gpu.attemptedSources || [],
            gpuError: gpu.error || "",
            gpuUuid: primaryGpu.uuid,
            gpuUtilizationPct: round(metrics.gpuUtil, 2),
            gpuSmOccupancyPct: round(metrics.smOccupancy, 2),
            gpuTensorActivePct: round(metrics.tensorCoreUtil, 2),
            gpuDramActivePct: round(metrics.hbmBandwidthPct, 2),
            gpuPcieTxBytesPerSecond: 0,
            gpuPcieRxBytesPerSecond: 0,
            gpuNvlinkTxBytesPerSecond: 0,
            gpuNvlinkRxBytesPerSecond: 0,
            gpuMemoryUsedMiB: round(finite(primaryGpu.memoryUsedMiB, 0), 2),
            gpuMemoryTotalMiB: round(finite(primaryGpu.memoryTotalMiB, 0), 2),
            gpuMemoryUsedPct: round(metrics.gpuMemoryPct, 2),
            gpuMemoryUtilizationPct: roundOptional(primaryGpu.utilizationMemoryPct, 2),
            gpuPowerWatts: round(finite(primaryGpu.powerDrawWatts, 0), 2),
            gpuTemperatureC: round(finite(primaryGpu.temperatureC, 0), 2),
            gpuFanSpeedPct: roundOptional(primaryGpu.fanSpeedPct, 2),
            gpuClockMHz: roundOptional(primaryGpu.gpuClockMHz, 2),
            gpuSmClockMHz: roundOptional(primaryGpu.gpuSmClockMHz, 2),
            gpuMemoryClockMHz: roundOptional(primaryGpu.gpuMemoryClockMHz, 2),
            gpuComputeProcesses: gpu.processes || [],
            gpuProcessInspector,
            gpuProcessInspectorStatus: gpuProcessInspector.status,
            gpuProcessInspectorSummary: gpuProcessInspector.summary,
            gpuProcessCount: round(finite(gpuProcessInspector.processCount, 0), 0),
            gpuProcessMemoryMiB: round(finite(gpuProcessInspector.totalUsedMemoryMiB, 0), 2),
            gpuProcessOwners: gpuProcessInspector.ownerNames || [],
            gpuComputeProcessQuerySkipped: Boolean(gpu.processesSkipped),
            gpuSampleCached: Boolean(gpu.sampleCached),
            gpuSampleAgeMs: round(finite(gpu.sampleAgeMs, 0), 0),
            gpuPcie: primaryGpu.pcieGen ? `gen${primaryGpu.pcieGen} x${primaryGpu.pcieWidth || "?"}` : "",
            gpuDiagnosticsCollectedAtMs: round(finite(gpu.diagnosticsCollectedAtMs, 0), 0),
            gpuDiagnosticsSampleCached: Boolean(gpu.diagnosticsSampleCached),
            gpuDiagnosticsError: gpu.diagnosticsError || "",
            gpuThermalQualification,
            gpuThermalQualificationStatus: gpuThermalQualification.status,
            gpuThermalQualificationSummary: gpuThermalQualification.summary,
            gpuThermalQualificationComparable: Boolean(gpuThermalQualification.benchmarkComparable),
            gpuThermalThrottleActive: Boolean(gpuThermalQualification.throttleActive),
            gpuThermalMarginToSlowdownC: roundOptional(gpuThermalQualification.marginToSlowdownC, 2),
            gpuThermalMarginToMaxOperatingC: roundOptional(gpuThermalQualification.marginToMaxOperatingC, 2),
            gpuMemoryTemperatureC: roundOptional(gpuThermalQualification.maxMemoryTemperatureC, 2),
            gpuSlowdownTemperatureC: roundOptional(gpuThermalQualification.gpuSlowdownTemperatureC, 2),
            gpuPowerLimitWatts: roundOptional(gpuThermalQualification.powerLimitWatts, 2),
            gpuTopology,
            gpuTopologyStatus: gpuTopology.status,
            gpuTopologyFingerprint: gpuTopology.fingerprint || "",
            gpuTopologySummary: gpuTopology.summary || "",
            gpuTopologyDeviceCount: round(finite(gpuTopology.deviceCount, 0), 0),
            gpuTopologyPeerLinkCount: round(finite(gpuTopology.peerLinkCount, 0), 0),
            gpuTopologyNvlinkLinks: round(finite(gpuTopology.nvlinkLinks, 0), 0),
            gpuTopologyPcieLinks: round(finite(gpuTopology.pcieLinks, 0), 0),
            gpuTopologyMatrix: gpuTopology.matrix || [],
            gb10Present,
            gb10MonitoringList,
            gb10MonitoringSummary: gb10MonitoringList.map((item) => `${item.label}: ${item.status}`).join("; "),
            linuxUmaMemoryTotalBytes: gb10Present ? host.memoryTotalBytes : 0,
            linuxUmaMemoryAvailableBytes: gb10Present ? host.memoryAvailableBytes : 0,
            linuxUmaMemoryUsedPct: gb10Present ? round(metrics.memoryUsedPct, 2) : 0,
            appMetricsReachable: Boolean(services.appMetricsUp),
            nsightCuptiProfilingStatus: services.profilingExporter?.status || "missing",
            nsightCuptiProfilingScripts: services.profilingExporter?.scripts || [],
            ncclRuntimePresent: Boolean(ncclRuntime.present),
            ncclRuntimeStatus: ncclRuntime.status,
            ncclRuntimeSource: ncclRuntime.source,
            ncclRuntimeContainers: ncclRuntime.containers,
            ncclRuntimeImages: ncclRuntime.images,
            ncclRuntimeSocketIfname: ncclRuntime.socketIfname,
            ncclRuntimeHostIp: ncclRuntime.hostIp,
            ncclRuntimeDetail: ncclRuntime.detail,
            benchmarkSuiteName: benchmark.name || "",
            benchmarkSuiteStatus: benchmark.status || "disabled",
            benchmarkGeneratedAt: benchmark.generatedAt || "",
            benchmarkSampleCached: Boolean(benchmark.sampleCached),
            benchmarkSampleAgeMs: round(finite(benchmark.sampleAgeMs, 0), 0),
            benchmarkTtlMs: round(finite(benchmark.ttlMs, benchmarkTtlMs), 0),
            benchmarkDurationMs: round(finite(benchmark.durationMs, 0), 0),
            benchmarkCpuOpsPerSecond: roundOptional(benchmark.cpuOpsPerSecond, 0),
            benchmarkMemoryMiBps: roundOptional(benchmark.memoryMiBps, 2),
            benchmarkDiskWriteMiBps: roundOptional(benchmark.diskWriteMiBps, 2),
            benchmarkDiskReadMiBps: roundOptional(benchmark.diskReadMiBps, 2),
            benchmarkDiskBytes: round(finite(benchmark.diskBytes, 0), 0),
            benchmarkScore: roundOptional(benchmark.score, 2),
            benchmarkOcpCommonsDataset: benchmarkOcpCommons.dataset,
            benchmarkOcpCommonsUrl: benchmarkOcpCommons.url,
            benchmarkOcpCommonsPeerCount: roundOptional(benchmarkOcpCommons.peerCount, 0),
            benchmarkOcpCommonsPercentile: roundOptional(benchmarkOcpCommons.percentile, 2),
            benchmarkOcpCommonsScore: roundOptional(benchmarkOcpCommons.score, 2),
            benchmarkOcpCommonsHardwareClass: benchmarkOcpCommons.hardwareClass,
            benchmarkOcpCommonsConfigHash: benchmarkOcpCommons.configHash,
            benchmarkOcpCommonsBinning: benchmarkOcpCommons.binning,
            benchmarkOcpCommonsPolicy: benchmarkOcpCommons.policy,
            benchmarkError: benchmark.error || "",
            sourceAdapters,
            unavailableExports: ["kubernetes", "dcgm", "ebpf", "scheduler", "provider"],
            workloadCountersObserved: Boolean(services.appMetricsUp),
            generatedAt: generatedIso
          }
        }
      ],
      sourceAdapters
    },
    sources: {}
  };
}

function machineSourceAdapters(gpu, services, ncclRuntime = {}, benchmark = {}, clock = {}) {
  const hostCounters = fs.existsSync("/proc/stat") ? "procfs" : "os-counters";
  const gb10Present = gpu.gpus.some((entry) => isGb10GpuName(entry.name));

  return [...new Set([
    "local-machine",
    gb10Present ? "gb10" : null,
    gpu.present && gpu.source === "gpustat" ? "gpustat" : null,
    gpu.present && gpu.source === "nvidia-smi" ? "nvidia-smi" : null,
    gpu.processInspector?.status && gpu.processInspector.status !== "unavailable" ? "gpu-process-inspector" : null,
    gpu.thermalQualification?.status && !["disabled", "unavailable"].includes(gpu.thermalQualification.status) ? "gpu-thermal-qualification" : null,
    gpu.topology?.status === "observed" ? "gpu-topology" : null,
    !gpu.present && /nvidia-smi-unavailable|gpustat-unavailable|gpu-telemetry-unavailable/.test(gpu.source || "") ? "gpu-telemetry-unavailable" : null,
    hostCounters,
    gb10Present ? "linux-uma-memory" : null,
    command("docker", ["version", "--format", "{{.Server.Version}}"]).trim() ? "docker" : null,
    services.appMetricsUp ? "app-metrics" : null,
    services.collectorGatewayUp ? "collector-gateway" : null,
    gb10Present && services.profilingExporter?.hooksPresent ? "nsight-cupti-profiling" : null,
    ncclRuntime.present ? "nccl-runtime" : null,
    ["fresh", "cached", "stale"].includes(benchmark.status) ? "pi-benchmark" : null,
    clock.source ? "clock-sync" : null,
    clock.ptpActive ? "ptp" : null,
    ...services.observedServices
  ].filter(Boolean))];
}

function detectNcclRuntime({ docker, network }) {
  const containers = (docker || []).filter((container) => {
    const haystack = `${container.name || ""} ${container.image || ""}`.toLowerCase();
    return /vllm|triton|tensorrt|trt-llm|nim|nccl|ray/.test(haystack)
      && !/open-webui|registry|prometheus|grafana|netdata|node-exporter|blackbox|speedtest/.test(haystack);
  });
  const vllmContainers = containers.filter((container) => /vllm|ray/.test(`${container.name || ""} ${container.image || ""}`.toLowerCase()));
  const selected = vllmContainers.length ? vllmContainers : containers;
  const socketIfname = network?.iface || "";
  const hostIp = network?.localAddress || primaryAddress();
  const containerText = selected.map((container) => container.name).filter(Boolean).join(", ") || "NCCL-capable container";
  const present = selected.length > 0;
  return {
    present,
    status: present ? "runtime-observed" : "missing",
    source: present ? "docker-vllm-ray" : "",
    containers: selected.map((container) => container.name).filter(Boolean),
    images: [...new Set(selected.map((container) => container.image).filter(Boolean))],
    socketIfname,
    hostIp,
    detail: present
      ? `${containerText} observed; NCCL runtime expected on ${socketIfname || "configured network interface"}${network?.localAddress ? ` at ${network.localAddress}` : hostIp ? ` (host ${hostIp})` : ""}`
      : "No NCCL-capable runtime container observed"
  };
}

function isGb10GpuName(name) {
  return /(^|[^A-Za-z0-9])GB10([^A-Za-z0-9]|$)|DGX[ -]?Spark/i.test(String(name || ""));
}

function buildGb10MonitoringList({ host, gpu, services }) {
  const primaryGpu = gpu.gpus.find((entry) => isGb10GpuName(entry.name)) || gpu.gpus[0] || {};
  const appMetricsLive = Boolean(services.appMetricsUp);
  const profiling = services.profilingExporter || {};
  const profilingAvailable = profiling.status === "ready" || profiling.status === "hooks-present";
  return [
    {
      id: "gb10-nvml-nvidia-smi",
      label: "GB10 NVML/gpustat/nvidia-smi",
      status: gpu.present ? "live" : "missing",
      detail: gpu.present ? `${primaryGpu.name || "GB10"} via ${gpu.source}` : gpu.error || "No NVIDIA GPU counters"
    },
    {
      id: "linux-uma-memory",
      label: "Linux UMA memory",
      status: host.memoryTotalBytes > 0 ? "live" : "missing",
      detail: host.memoryTotalBytes > 0
        ? `${formatBytesLocal(Math.max(0, host.memoryTotalBytes - host.memoryAvailableBytes))} / ${formatBytesLocal(host.memoryTotalBytes)} host UMA`
        : "Linux meminfo unavailable"
    },
    {
      id: "app-metrics",
      label: "App metrics",
      status: appMetricsLive ? "live" : "missing",
      detail: appMetricsLive ? "gb100 app metrics exporter reachable on :9500" : "Start collectors/app_telemetry_exporter.py on :9500"
    },
    {
      id: "nsight-cupti-profiling",
      label: "Nsight/CUPTI optional profiling exporter",
      status: profilingAvailable ? profiling.status : "missing",
      detail: profilingAvailable
        ? `${(profiling.scripts || []).length} profiling hook${(profiling.scripts || []).length === 1 ? "" : "s"} present`
        : "Optional Nsight/CUPTI hooks not configured"
    }
  ];
}

function collectProfilingExporter() {
  const scripts = [
    "collectors/profiling/run-nsight-compute-sample.sh",
    "collectors/profiling/run-nsight-systems-sample.sh",
    "collectors/profiling/run-cupti-sample.sh"
  ].filter((relativePath) => fs.existsSync(path.join(__dirname, "..", relativePath)));
  const ncu = command("which", ["ncu"]).trim();
  const nsys = command("which", ["nsys"]).trim();
  const cuptiConfigured = Boolean(process.env.CUPTI_LIBRARY_PATH);
  const ready = Boolean(ncu || nsys || cuptiConfigured);
  return {
    status: ready ? "ready" : scripts.length ? "hooks-present" : "missing",
    hooksPresent: scripts.length > 0,
    scripts,
    ncuInstalled: Boolean(ncu),
    nsysInstalled: Boolean(nsys),
    cuptiConfigured
  };
}

function gpuLabel(primaryGpu, gpu) {
  if (primaryGpu.name) return primaryGpu.name;
  if (gpu.source === "nvidia-smi-unavailable") return "NVIDIA telemetry unavailable";
  return "No NVIDIA GPU telemetry";
}

function readMeminfo() {
  const text = readFile("/proc/meminfo");
  const parsed = {};
  text.split("\n").forEach((line) => {
    const match = line.match(/^([^:]+):\s+(\d+)\s+kB/);
    if (match) parsed[match[1]] = Number(match[2]) * 1024;
  });
  return parsed;
}

function diskInfo(targetPath) {
  const output = command("df", ["-B1", "-T", targetPath]).trim().split("\n")[1] || "";
  const parts = output.trim().split(/\s+/);
  return {
    filesystem: parts[0] || "",
    type: parts[1] || "",
    totalBytes: finite(parts[2], 0),
    usedBytes: finite(parts[3], 0),
    availableBytes: finite(parts[4], 0),
    mountedOn: parts[6] || targetPath
  };
}

function lakehouseInfo(targetPath) {
  const root = path.resolve(String(targetPath || path.join("build", "lakehouse")));
  const exists = fs.existsSync(root);
  const disk = diskInfo(existingFilesystemPath(root));
  const usedBytes = exists ? pathUsageBytes(root) : 0;
  const diskUsedPct = disk.totalBytes > 0 ? (disk.usedBytes / disk.totalBytes) * 100 : 0;
  return {
    root,
    exists,
    measuredAt: new Date().toISOString(),
    usedBytes,
    disk,
    diskUsedPct
  };
}

function existingFilesystemPath(targetPath) {
  let current = path.resolve(targetPath || ".");
  while (current && !fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return parent;
    current = parent;
  }
  return current || "/";
}

function pathUsageBytes(targetPath) {
  const exactBytes = parseDuBytes(command("du", ["-sb", targetPath]));
  if (Number.isFinite(exactBytes)) return exactBytes;

  const kib = parseDuBytes(command("du", ["-sk", targetPath]));
  if (Number.isFinite(kib)) return kib * 1024;

  return pathUsageBytesFallback(targetPath);
}

function parseDuBytes(output) {
  const trimmed = String(output || "").trim();
  if (!trimmed) return undefined;
  const value = trimmed.split(/\s+/)[0];
  if (!/\d/.test(value)) return undefined;
  const parsed = finite(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function pathUsageBytesFallback(targetPath) {
  const stack = [targetPath];
  let total = 0;
  while (stack.length) {
    const current = stack.pop();
    let stats;
    try {
      stats = fs.lstatSync(current);
    } catch {
      continue;
    }
    total += Number.isFinite(stats.size) ? stats.size : 0;
    if (!stats.isDirectory() || stats.isSymbolicLink()) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(current);
    } catch {
      continue;
    }
    entries.forEach((entry) => stack.push(path.join(current, entry)));
  }
  return total;
}

function primaryNetworkStats() {
  const selection = selectNetworkInterface();
  const iface = selection.name || "";
  const base = iface ? `/sys/class/net/${iface}/statistics` : "";
  const bsd = iface ? bsdNetworkStats(iface) : {};
  return {
    iface,
    localAddress: selection.address || "",
    peerAddress: selection.peerAddress || "",
    linkRole: selection.role || "Primary interface",
    selectionReason: selection.reason || "first non-internal IPv4 interface",
    collectedAtMs: Date.now(),
    linkSpeedMbps: iface ? Math.max(0, finite(readFile(`/sys/class/net/${iface}/speed`), 0)) : 0,
    rxBytes: networkCounter(readFile(path.join(base, "rx_bytes")), finite(bsd.rxBytes, 0)),
    txBytes: networkCounter(readFile(path.join(base, "tx_bytes")), finite(bsd.txBytes, 0)),
    rxDrops: networkCounter(readFile(path.join(base, "rx_dropped")), finite(bsd.rxDrops, 0)),
    txDrops: networkCounter(readFile(path.join(base, "tx_dropped")), finite(bsd.txDrops, 0)),
    rxErrors: networkCounter(readFile(path.join(base, "rx_errors")), finite(bsd.rxErrors, 0)),
    txErrors: networkCounter(readFile(path.join(base, "tx_errors")), finite(bsd.txErrors, 0))
  };
}

function selectNetworkInterface() {
  const entries = networkInterfaceEntries();
  const explicit = explicitNetworkInterface
    ? networkInterfaceEntryByName(explicitNetworkInterface, entries)
      || { name: explicitNetworkInterface, address: "" }
    : null;
  if (explicit) {
    return {
      ...explicit,
      role: "Configured network interface",
      reason: "explicit network interface override"
    };
  }

  const dgxSubnet = entries.find((entry) => String(entry.address || "").startsWith(dgxInterconnectSubnetPrefix));
  if (dgxSubnet) {
    return {
      ...dgxSubnet,
      peerAddress: dgxInterconnectPeerAddress(dgxSubnet.address),
      role: "DGX interconnect",
      reason: `${dgxInterconnectSubnetPrefix}0/24 DGX interconnect subnet`
    };
  }

  const dgxNamed = dgxInterconnectInterface
    ? networkInterfaceEntryByName(dgxInterconnectInterface, entries)
    : null;
  if (dgxNamed) {
    return {
      ...dgxNamed,
      role: "DGX interconnect",
      reason: `${dgxInterconnectInterface} DGX interconnect interface`
    };
  }

  const first = entries.find((entry) => entry.family === "IPv4" && !entry.internal);
  return first
    ? {
      ...first,
      role: "Primary interface",
      reason: "first non-internal IPv4 interface"
    }
    : { name: "", address: "", role: "Primary interface", reason: "no non-internal IPv4 interface found" };
}

function networkInterfaceEntryByName(name, entries) {
  return entries.find((entry) => entry.name === name)
    || (name && fs.existsSync(`/sys/class/net/${name}`) ? { name, address: "" } : null);
}

function networkInterfaceEntries() {
  return Object.entries(os.networkInterfaces())
    .flatMap(([name, entries]) => (entries || []).map((entry) => ({ name, ...entry })))
    .filter((entry) => entry.family === "IPv4" && !entry.internal);
}

function dgxInterconnectPeerAddress(address) {
  const value = String(address || "");
  if (value === `${dgxInterconnectSubnetPrefix}10`) return `${dgxInterconnectSubnetPrefix}11`;
  if (value === `${dgxInterconnectSubnetPrefix}11`) return `${dgxInterconnectSubnetPrefix}10`;
  return "";
}

function networkCounter(value, fallback = 0) {
  return String(value || "").trim() === "" ? fallback : finite(value, fallback);
}

function bsdNetworkStats(iface) {
  const line = command("netstat", ["-ibn"])
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${iface} `) && /\s<Link#\d+>\s/.test(entry));
  if (!line) return {};

  const parts = line.split(/\s+/);
  return {
    rxBytes: finite(parts[6], 0),
    txBytes: finite(parts[9], 0),
    rxDrops: 0,
    txDrops: 0,
    rxErrors: finite(parts[5], 0),
    txErrors: finite(parts[8], 0)
  };
}

function withNetworkRates(current, previous) {
  if (!current || !previous || current.iface !== previous.iface) {
    return current;
  }

  const elapsedSeconds = (finite(current.collectedAtMs, 0) - finite(previous.collectedAtMs, 0)) / 1000;
  const rxDelta = finite(current.rxBytes, 0) - finite(previous.rxBytes, 0);
  const txDelta = finite(current.txBytes, 0) - finite(previous.txBytes, 0);
  if (elapsedSeconds <= 0 || rxDelta < 0 || txDelta < 0) {
    return current;
  }

  const rxBytesPerSecond = rxDelta / elapsedSeconds;
  const txBytesPerSecond = txDelta / elapsedSeconds;
  const linkSpeedMbps = finite(current.linkSpeedMbps, finite(previous.linkSpeedMbps, 0));
  const linkBytesPerSecond = linkSpeedMbps > 0 ? (linkSpeedMbps * 1000 * 1000) / 8 : 0;

  return {
    ...current,
    linkSpeedMbps,
    rxBytesPerSecond,
    txBytesPerSecond,
    utilizationPct: linkBytesPerSecond > 0
      ? clamp((Math.max(rxBytesPerSecond, txBytesPerSecond) / linkBytesPerSecond) * 100, 0, 100)
      : undefined
  };
}

function readNetworkRateCache(current) {
  if (!current?.iface) return null;
  try {
    const cache = JSON.parse(fs.readFileSync(networkRateCachePath, "utf8"));
    return cache[networkRateCacheKey(current)] || null;
  } catch {
    return null;
  }
}

function writeNetworkRateCache(current) {
  if (!current?.iface) return;
  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(networkRateCachePath, "utf8"));
  } catch {
    cache = {};
  }
  cache[networkRateCacheKey(current)] = {
    iface: current.iface,
    localAddress: current.localAddress || "",
    peerAddress: current.peerAddress || "",
    linkRole: current.linkRole || "",
    collectedAtMs: current.collectedAtMs,
    linkSpeedMbps: current.linkSpeedMbps,
    rxBytes: current.rxBytes,
    txBytes: current.txBytes
  };
  fs.mkdirSync(path.dirname(networkRateCachePath), { recursive: true });
  writeFileAtomic(networkRateCachePath, JSON.stringify(cache, null, 2));
}

function networkRateCacheKey(current) {
  return [os.hostname(), current.iface || "", current.localAddress || ""].join("|");
}

function defaultNetworkRateCachePath() {
  const cacheDir = outPath ? path.dirname(outPath) : path.join(__dirname, "..", "build", "demo");
  return path.join(cacheDir, "live-network-rate-cache.json");
}

function defaultBenchmarkCachePath() {
  const cacheDir = outPath ? path.dirname(outPath) : path.join(__dirname, "..", "build", "demo");
  return path.join(cacheDir, "live-pi-benchmark-cache.json");
}

function collectBenchmarkSuite({ host }) {
  const nowMs = Date.now();
  const name = "pi-light-v1";
  if (!benchmarkEnabled) {
    return {
      name,
      status: "disabled",
      generatedAt: "",
      collectedAtMs: nowMs,
      sampleCached: false,
      sampleAgeMs: 0,
      ttlMs: benchmarkTtlMs,
      durationMs: 0,
      error: ""
    };
  }

  const cache = readBenchmarkCache();
  const cacheKey = benchmarkCacheKey(host);
  const cached = cache[cacheKey];
  const cachedAtMs = finite(cached?.collectedAtMs, 0);
  if (cached && nowMs - cachedAtMs >= 0 && nowMs - cachedAtMs < benchmarkTtlMs) {
    return {
      ...cached,
      name,
      status: "cached",
      sampleCached: true,
      sampleAgeMs: nowMs - cachedAtMs,
      ttlMs: benchmarkTtlMs
    };
  }

  try {
    const sample = runBenchmarkSuite({ host, name });
    cache[cacheKey] = sample;
    writeBenchmarkCache(cache);
    return sample;
  } catch (error) {
    if (cached) {
      return {
        ...cached,
        name,
        status: "stale",
        sampleCached: true,
        sampleAgeMs: nowMs - cachedAtMs,
        ttlMs: benchmarkTtlMs,
        error: compactWhitespace(error?.message || error)
      };
    }
    return {
      name,
      status: "failed",
      generatedAt: new Date(nowMs).toISOString(),
      collectedAtMs: nowMs,
      sampleCached: false,
      sampleAgeMs: 0,
      ttlMs: benchmarkTtlMs,
      durationMs: benchmarkDurationMs,
      error: compactWhitespace(error?.message || error || "benchmark failed")
    };
  }
}

function runBenchmarkSuite({ host, name }) {
  const startedAtMs = Date.now();
  const cpu = benchmarkCpuOps(benchmarkDurationMs);
  const memory = benchmarkMemoryFill(benchmarkDurationMs, benchmarkBufferBytes);
  const disk = benchmarkDiskIo(benchmarkDiskBytes);
  const score = benchmarkCompositeScore({
    cpuOpsPerSecond: cpu.opsPerSecond,
    memoryMiBps: memory.mibPerSecond,
    diskWriteMiBps: disk.writeMiBps,
    diskReadMiBps: disk.readMiBps
  });

  return {
    name,
    status: "fresh",
    host: host.hostname,
    generatedAt: new Date(startedAtMs).toISOString(),
    collectedAtMs: startedAtMs,
    sampleCached: false,
    sampleAgeMs: 0,
    ttlMs: benchmarkTtlMs,
    durationMs: benchmarkDurationMs,
    cpuOpsPerSecond: cpu.opsPerSecond,
    cpuChecksum: cpu.checksum,
    memoryMiBps: memory.mibPerSecond,
    memoryBytes: memory.bytes,
    memoryChecksum: memory.checksum,
    diskWriteMiBps: disk.writeMiBps,
    diskReadMiBps: disk.readMiBps,
    diskBytes: disk.bytes,
    score,
    error: ""
  };
}

function benchmarkCpuOps(durationMs) {
  const start = hrNowMs();
  const deadline = start + durationMs;
  const batch = 50000;
  let ops = 0;
  let checksum = 0x9e3779b9;
  do {
    for (let index = 0; index < batch; index += 1) {
      checksum = Math.imul(checksum ^ (checksum >>> 15), 2246822507) >>> 0;
      checksum = (checksum + 0x85ebca6b) >>> 0;
    }
    ops += batch;
  } while (hrNowMs() < deadline);

  const elapsedSeconds = Math.max(0.001, (hrNowMs() - start) / 1000);
  return {
    opsPerSecond: ops / elapsedSeconds,
    checksum
  };
}

function benchmarkMemoryFill(durationMs, bytes) {
  const size = Math.max(256 * 1024, Math.min(bytes, 64 * 1024 * 1024));
  const buffer = Buffer.allocUnsafe(size);
  const start = hrNowMs();
  const deadline = start + durationMs;
  let transferred = 0;
  let checksum = 0;
  let fillValue = 17;
  do {
    buffer.fill(fillValue & 0xff);
    checksum = (checksum + buffer[0] + buffer[buffer.length - 1]) >>> 0;
    transferred += buffer.length;
    fillValue = (fillValue + 31) & 0xff;
  } while (hrNowMs() < deadline);

  const elapsedSeconds = Math.max(0.001, (hrNowMs() - start) / 1000);
  return {
    mibPerSecond: (transferred / (1024 * 1024)) / elapsedSeconds,
    bytes: transferred,
    checksum
  };
}

function benchmarkDiskIo(bytes) {
  const totalBytes = Math.max(1024 * 1024, Math.min(bytes, 128 * 1024 * 1024));
  const dir = path.join(path.dirname(benchmarkCachePath), ".pi-benchmark-tmp");
  const filePath = path.join(dir, `bench-${process.pid}-${Date.now()}.bin`);
  const block = Buffer.alloc(1024 * 1024, 0xa5);
  fs.mkdirSync(dir, { recursive: true });

  let fd = null;
  try {
    fd = fs.openSync(filePath, "w");
    let written = 0;
    const writeStart = hrNowMs();
    while (written < totalBytes) {
      const chunkBytes = Math.min(block.length, totalBytes - written);
      fs.writeSync(fd, block, 0, chunkBytes);
      written += chunkBytes;
    }
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    const writeSeconds = Math.max(0.001, (hrNowMs() - writeStart) / 1000);

    fd = fs.openSync(filePath, "r");
    const readBuffer = Buffer.allocUnsafe(block.length);
    let read = 0;
    const readStart = hrNowMs();
    while (read < totalBytes) {
      const chunkBytes = Math.min(readBuffer.length, totalBytes - read);
      const bytesRead = fs.readSync(fd, readBuffer, 0, chunkBytes, null);
      if (bytesRead <= 0) break;
      read += bytesRead;
    }
    fs.closeSync(fd);
    fd = null;
    const readSeconds = Math.max(0.001, (hrNowMs() - readStart) / 1000);

    return {
      bytes: totalBytes,
      writeMiBps: (written / (1024 * 1024)) / writeSeconds,
      readMiBps: (read / (1024 * 1024)) / readSeconds
    };
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
}

function benchmarkCompositeScore(sample) {
  return clamp(
    (finite(sample.cpuOpsPerSecond, 0) / 500_000_000) * 35
    + (finite(sample.memoryMiBps, 0) / 8000) * 25
    + (finite(sample.diskWriteMiBps, 0) / 180) * 18
    + (finite(sample.diskReadMiBps, 0) / 1800) * 22,
    0,
    100
  );
}

function readBenchmarkCache() {
  try {
    const parsed = JSON.parse(fs.readFileSync(benchmarkCachePath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeBenchmarkCache(cache) {
  fs.mkdirSync(path.dirname(benchmarkCachePath), { recursive: true });
  writeFileAtomic(benchmarkCachePath, JSON.stringify(cache, null, 2));
}

function benchmarkCacheKey(host) {
  return [host.hostname || os.hostname(), host.platform || os.platform(), host.arch || os.arch()].join("|");
}

function hrNowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function cpuUsageSample(sampleMs = 250) {
  const first = readCpuStat();
  sleep(sampleMs);
  const second = readCpuStat();
  const idleDelta = second.idle - first.idle;
  const totalDelta = second.total - first.total;
  return totalDelta > 0 ? clamp(((totalDelta - idleDelta) / totalDelta) * 100, 0, 100) : 0;
}

function readCpuStat() {
  const line = readFile("/proc/stat").split("\n")[0] || "";
  const values = line.trim().split(/\s+/).slice(1).map(Number);
  const idle = (values[3] || 0) + (values[4] || 0);
  const total = values.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  return { idle, total };
}

function readOsRelease() {
  return Object.fromEntries(readFile("/etc/os-release").split("\n")
    .map((line) => line.match(/^([^=]+)=(.*)$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2].replace(/^"|"$/g, "")]));
}

function httpJson(url) {
  const body = command("curl", ["-sS", "--max-time", "2", url]);
  if (!body.trim()) return { ok: false, body: null };
  try {
    return { ok: true, body: JSON.parse(body) };
  } catch {
    return { ok: false, body: null };
  }
}

function collectOllamaTelemetry({ running }) {
  const runningModels = ollamaRunningModelNames(running);
  const nowMs = Date.now();

  if (!ollamaProbeEnabled) {
    return {
      status: "disabled",
      runningModels,
      probeModel: runningModels[0] || "",
      tokensPerSecond: 0,
      timeToFirstTokenMs: 0,
      collectedAtMs: nowMs,
      sampleCached: false,
      sampleAgeMs: 0,
      error: "Ollama probe disabled with --ollama-probe 0"
    };
  }

  const probeModel = runningModels[0] || "";
  if (!probeModel) {
    previousOllamaTelemetry = null;
    return {
      status: "no-running-model",
      runningModels,
      probeModel: "",
      tokensPerSecond: 0,
      timeToFirstTokenMs: 0,
      collectedAtMs: nowMs,
      sampleCached: false,
      sampleAgeMs: 0,
      error: "Ollama is reachable, but no model is currently loaded in /api/ps; generation probe skipped."
    };
  }

  if (
    previousOllamaTelemetry
    && previousOllamaTelemetry.probeModel === probeModel
    && nowMs - previousOllamaTelemetry.collectedAtMs < ollamaProbeMs
  ) {
    return cloneOllamaTelemetry({
      ...previousOllamaTelemetry,
      runningModels,
      sampleCached: true,
      sampleAgeMs: nowMs - previousOllamaTelemetry.collectedAtMs
    });
  }

  previousOllamaTelemetry = probeOllamaGenerate(probeModel, runningModels);
  return cloneOllamaTelemetry(previousOllamaTelemetry);
}

function probeOllamaGenerate(probeModel, runningModels) {
  const request = {
    model: probeModel,
    prompt: "Count from 1 to 24 separated by spaces. No prose.",
    stream: true,
    options: {
      temperature: 0,
      num_predict: 32
    }
  };
  const result = commandResult("curl", [
    "-sS",
    "--no-buffer",
    "--max-time",
    "10",
    "-X",
    "POST",
    "http://127.0.0.1:11434/api/generate",
    "-H",
    "Content-Type: application/json",
    "-d",
    JSON.stringify(request),
    "-w",
    "\n__CURL_TTFB__:%{time_starttransfer}\n"
  ], { timeout: 12000 });
  const collectedAtMs = Date.now();

  if (result.status !== 0) {
    return {
      status: "probe-failed",
      runningModels,
      probeModel,
      tokensPerSecond: 0,
      timeToFirstTokenMs: 0,
      collectedAtMs,
      sampleCached: false,
      sampleAgeMs: 0,
      error: compactWhitespace(result.stderr || result.errorMessage || `curl exited ${result.status}`)
    };
  }

  const lines = result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  const ttfbLine = lines.find((line) => line.startsWith("__CURL_TTFB__:"));
  const ttfbSeconds = ttfbLine ? Number(ttfbLine.split(":").slice(1).join(":")) : 0;
  const timeToFirstTokenMs = Number.isFinite(ttfbSeconds) ? ttfbSeconds * 1000 : 0;
  const chunks = lines
    .filter((line) => line.startsWith("{"))
    .map(parseJsonObject)
    .filter((chunk) => Object.keys(chunk).length > 0);
  const finalChunk = chunks.find((chunk) => chunk.done === true) || chunks.at(-1) || {};
  const evalCount = finite(finalChunk.eval_count, 0);
  const evalDurationMs = nanosecondsToMilliseconds(finalChunk.eval_duration);
  const tokensPerSecond = evalCount > 0 && evalDurationMs > 0
    ? evalCount / (evalDurationMs / 1000)
    : 0;

  return {
    status: evalCount > 0 || timeToFirstTokenMs > 0 ? "sampled" : "observed",
    runningModels,
    probeModel,
    tokensPerSecond,
    timeToFirstTokenMs,
    evalCount,
    evalDurationMs,
    totalDurationMs: nanosecondsToMilliseconds(finalChunk.total_duration),
    loadDurationMs: nanosecondsToMilliseconds(finalChunk.load_duration),
    promptEvalCount: finite(finalChunk.prompt_eval_count, 0),
    promptEvalDurationMs: nanosecondsToMilliseconds(finalChunk.prompt_eval_duration),
    collectedAtMs,
    sampleCached: false,
    sampleAgeMs: 0,
    error: ""
  };
}

function ollamaRunningModelNames(running) {
  return Array.isArray(running?.models)
    ? running.models
      .map((model) => String(model.model || model.name || "").trim())
      .filter(Boolean)
    : [];
}

function cloneOllamaTelemetry(telemetry) {
  return {
    ...telemetry,
    runningModels: [...(telemetry.runningModels || [])]
  };
}

function nanosecondsToMilliseconds(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed / 1_000_000 : 0;
}

function collectKafkaSmokeEvidence() {
  const logs = command("kubectl", ["-n", "turbalance-demo", "logs", "job/spark1-kafka-smoke", "--tail=80"]);
  if (!logs.trim()) return {};
  const payloadLine = logs.split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.includes("spark1-kafka-smoke"))
    .at(-1) || "";
  const payload = parseJsonObject(payloadLine);
  const topic = (logs.match(/^topic=(.+)$/m) || [])[1] || "";
  const processed = Number((logs.match(/Processed a total of (\d+) messages/) || [])[1] || 0);

  return {
    smokeStatus: /SPARK1 Kafka smoke test passed/.test(logs) ? "passed" : "observed",
    smokeTopic: topic,
    smokeMessageId: payload.messageId || "",
    smokeTimestamp: payload.timestamp || "",
    smokePayload: payloadLine,
    smokeProcessedMessages: Number.isFinite(processed) ? processed : 0
  };
}

function parseJsonObject(text) {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function tcpReachable(host, port) {
  const script = `
    const net = require("node:net");
    const [host, port] = process.argv.slice(1);
    const socket = net.createConnection({ host, port: Number(port), timeout: 500 }, () => {
      socket.destroy();
      process.exit(0);
    });
    socket.on("timeout", () => {
      socket.destroy();
      process.exit(1);
    });
    socket.on("error", () => process.exit(1));
  `;
  const result = spawnSync(process.execPath, ["-e", script, host, String(port)], {
    stdio: ["ignore", "ignore", "ignore"],
    timeout: 1200
  });
  return result.status === 0;
}

function nonInternalAddresses() {
  return networkInterfaceEntries()
    .map((entry) => ({ name: entry.name, address: entry.address }));
}

function primaryAddress() {
  return nonInternalAddresses()[0]?.address || "127.0.0.1";
}

function command(bin, args = []) {
  try {
    return execFileSync(bin, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
      maxBuffer: 10 * 1024 * 1024
    });
  } catch {
    return "";
  }
}

function commandResult(bin, args = [], { timeout = 5000 } = {}) {
  const result = spawnSync(bin, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout,
    maxBuffer: 10 * 1024 * 1024
  });

  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    errorCode: result.error?.code || "",
    errorMessage: result.error?.message || ""
  };
}

function commandResultAsync(bin, args = []) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      child.kill("SIGTERM");
      resolve({
        status: 124,
        stdout,
        stderr,
        errorCode: "ETIMEDOUT",
        errorMessage: `${bin} timed out`
      });
    }, 5000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        status: 1,
        stdout,
        stderr,
        errorCode: error.code || "",
        errorMessage: error.message || ""
      });
    });
    child.on("close", (status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        status,
        stdout,
        stderr,
        errorCode: "",
        errorMessage: ""
      });
    });
  });
}

function gpuSampleForWrite(gpu, nowMs, includeProcesses) {
  if (!gpu) {
    return {
      present: false,
      count: 0,
      gpus: [],
      processes: [],
      processesObserved: false,
      processesSkipped: !includeProcesses,
      collectedAtMs: nowMs,
      sampleCached: false,
      sampleAgeMs: 0,
      source: "nvidia-smi-unavailable",
      error: "No GPU sample collected yet"
    };
  }

  const sampleAgeMs = Math.max(0, nowMs - gpu.collectedAtMs);
  return cloneGpuSample({
    ...gpu,
    processesObserved: includeProcesses && gpu.processesObserved,
    processesSkipped: !includeProcesses || gpu.processesSkipped,
    sampleCached: sampleAgeMs > 250,
    sampleAgeMs
  });
}

function cloneGpuSample(gpu) {
  return {
    ...gpu,
    gpus: (gpu.gpus || []).map((entry) => ({ ...entry })),
    processes: (gpu.processes || []).map((entry) => ({ ...entry })),
    processInspector: gpu.processInspector ? {
      ...gpu.processInspector,
      ownerNames: [...(gpu.processInspector.ownerNames || [])],
      byGpu: (gpu.processInspector.byGpu || []).map((entry) => ({ ...entry })),
      topProcesses: (gpu.processInspector.topProcesses || []).map((entry) => ({ ...entry })),
      largestProcess: gpu.processInspector.largestProcess ? { ...gpu.processInspector.largestProcess } : null
    } : undefined,
    topology: gpu.topology ? {
      ...gpu.topology,
      linkCounts: { ...(gpu.topology.linkCounts || {}) },
      matrix: (gpu.topology.matrix || []).map((entry) => ({ ...entry, links: { ...(entry.links || {}) } }))
    } : undefined,
    thermalQualification: gpu.thermalQualification ? {
      ...gpu.thermalQualification,
      checks: (gpu.thermalQualification.checks || []).map((entry) => ({ ...entry }))
    } : undefined
  };
}

function writeFileAtomic(filePath, content) {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, content);
  fs.renameSync(tempPath, filePath);
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function compactWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function valueFromText(text, key) {
  const line = text.split("\n").find((entry) => entry.toLowerCase().startsWith(`${key.toLowerCase()}:`));
  return line ? line.split(":").slice(1).join(":").trim() : "";
}

function finite(value, fallback = undefined) {
  const parsed = Number(String(value === undefined || value === null ? "" : value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const parsed = finite(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function groupBy(values, keyFn) {
  const map = new Map();
  (values || []).forEach((value) => {
    const key = keyFn(value);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  });
  return map;
}

function stableLocalHash(value) {
  return crypto
    .createHash("sha256")
    .update(String(value || ""))
    .digest("hex")
    .slice(0, 24);
}

function optionalFinite(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function percentText(value) {
  return finite(String(value || "").replace("%", ""), 0);
}

function pctRatio(percentValue) {
  return clamp(finite(percentValue, 0) / 100, 0, 1);
}

function round(value, digits = 2) {
  const parsed = finite(value, 0);
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

function roundOptional(value, digits = 2) {
  const parsed = optionalFinite(value);
  if (!Number.isFinite(parsed)) return undefined;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

function clamp(value, min, max) {
  const parsed = finite(value, min);
  return Math.min(max, Math.max(min, parsed));
}

function formatBytesLocal(value) {
  const bytes = finite(value, 0);
  if (bytes <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const scaled = bytes / (1024 ** index);
  return `${Math.round(scaled * 10) / 10} ${units[index]}`;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timestampId(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "z").toLowerCase();
}

function safeId(value) {
  return String(value || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function numberArg(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    parsed[arg.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : "1";
  }
  return parsed;
}

function localFleetRemotes() {
  if (process.env.TURBALANCE_DISABLE_LOCAL_FLEET_DELEGATION === "1" || args["no-fleet"] === "1") return [];
  const configured = splitList(process.env.TURBALANCE_LIVE_MACHINE_FLEET_REMOTES || args["fleet-remote"] || "");
  if (configured.length > 0) return configured;
  return os.hostname().toLowerCase() === "spark1" ? ["user@192.168.10.21"] : [];
}

function splitList(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => String(item || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean));
}

function collectorNetworkArgs() {
  return [
    ["--network-interface", explicitNetworkInterface],
    ["--dgx-interconnect-interface", dgxInterconnectInterface],
    ["--dgx-interconnect-subnet-prefix", dgxInterconnectSubnetPrefix]
  ].flatMap(([flag, value]) => value ? [flag, value] : []);
}
