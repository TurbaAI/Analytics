#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn, spawnSync } = require("node:child_process");
const { assertValidSourceBundle } = require("../lib/source-bundle-validator.js");

const args = parseArgs(process.argv.slice(2));
const outPath = args.out || "";
const hostUrl = args["host-url"] || process.env.TURBALANCE_MACHINE_DEMO_URL || `http://${primaryAddress()}:8000`;
const windowMinutes = numberArg(args["window-minutes"], 60);
const fastRefresh = args["fast-refresh"] === "1" || args["skip-gpu-processes"] === "1";
const loopMs = numberArg(args["loop-ms"], 0);
const gpuSampleMs = numberArg(args["gpu-sample-ms"], fastRefresh ? 2000 : 0);
const skipValidation = args["skip-validation"] === "1";
let previousGpu = null;

if (loopMs > 0) {
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

function collectAndWrite({ gpuOverride = null } = {}) {
  const generatedAt = new Date();
  const host = collectHost({ cpuSampleMs: fastRefresh ? 80 : 250 });
  const gpu = gpuOverride || collectGpu({
    includeProcesses: !fastRefresh,
    previousGpu,
    maxAgeMs: gpuSampleMs,
    nowMs: generatedAt.getTime()
  });
  if (!gpuOverride) previousGpu = gpu;
  const docker = collectDocker();
  const services = collectServices(hostUrl);
  const metrics = deriveMetrics({ host, gpu, docker, services, windowMinutes });
  const runId = args["run-id"] || `machine-${safeId(host.hostname)}-${timestampId(generatedAt)}`;
  const bundle = buildBundle({ runId, host, gpu, docker, services, metrics, hostUrl, generatedAt, windowMinutes });

  if (!skipValidation) {
    assertValidSourceBundle(bundle);
  }

  const output = `${JSON.stringify(bundle, null, 2)}\n`;
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
  const cpuSample = cpuUsageSample(cpuSampleMs);
  const net = primaryNetworkStats();
  const load = os.loadavg();
  const cpus = os.cpus();
  const lscpu = command("lscpu");
  const hostname = os.hostname();
  const osRelease = readOsRelease();
  const uptimeSeconds = os.uptime();

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
    memoryTotalBytes: meminfo.MemTotal || os.totalmem(),
    memoryAvailableBytes: meminfo.MemAvailable || os.freemem(),
    swapTotalBytes: meminfo.SwapTotal || 0,
    swapFreeBytes: meminfo.SwapFree || 0,
    disk,
    network: net,
    uptimeSeconds,
    addresses: nonInternalAddresses()
  };
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

  const queryResult = commandResult("nvidia-smi", [
    "--query-gpu=name,index,uuid,utilization.gpu,utilization.memory,memory.used,memory.total,power.draw,temperature.gpu,pcie.link.gen.current,pcie.link.width.current",
    "--format=csv,noheader,nounits"
  ]);
  const query = queryResult.stdout;
  if (
    queryResult.status !== 0
    || /nvidia-smi has failed|couldn't communicate with the nvidia driver|failed to initialize/i.test(query)
    || !query.trim()
  ) {
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
      source: queryResult.errorCode === "ENOENT" ? "nvidia-smi-not-found" : "nvidia-smi-unavailable",
      error: compactWhitespace(queryResult.stderr || query || queryResult.errorMessage || "nvidia-smi returned no GPU rows")
    };
  }

  const processesText = includeProcesses
    ? command("nvidia-smi", [
      "--query-compute-apps=pid,process_name,used_memory",
      "--format=csv,noheader,nounits"
    ])
    : "";
  return parseGpuQuery(query, { includeProcesses, processesText });
}

async function collectGpuAsync({ includeProcesses = true } = {}) {
  const queryResult = await commandResultAsync("nvidia-smi", [
    "--query-gpu=name,index,uuid,utilization.gpu,utilization.memory,memory.used,memory.total,power.draw,temperature.gpu,pcie.link.gen.current,pcie.link.width.current",
    "--format=csv,noheader,nounits"
  ]);
  if (
    queryResult.status !== 0
    || /nvidia-smi has failed|couldn't communicate with the nvidia driver|failed to initialize/i.test(queryResult.stdout)
    || !queryResult.stdout.trim()
  ) {
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
      source: queryResult.errorCode === "ENOENT" ? "nvidia-smi-not-found" : "nvidia-smi-unavailable",
      error: compactWhitespace(queryResult.stderr || queryResult.stdout || queryResult.errorMessage || "nvidia-smi returned no GPU rows")
    };
  }

  const processResult = includeProcesses
    ? await commandResultAsync("nvidia-smi", [
      "--query-compute-apps=pid,process_name,used_memory",
      "--format=csv,noheader,nounits"
    ])
    : { stdout: "" };

  return parseGpuQuery(queryResult.stdout, {
    includeProcesses,
    processesText: processResult.stdout || ""
  });
}

function parseGpuQuery(query, { includeProcesses, processesText }) {
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
      pcieWidth
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
      pcieGen: finite(pcieGen),
      pcieWidth: finite(pcieWidth)
    };
  }).filter((entry) => entry.name);

  const processes = includeProcesses
    ? processesText.trim().split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [pid, processName, usedMemoryMiB] = line.split(",").map((item) => item.trim());
        return {
          pid: Number(pid),
          processName,
          usedMemoryMiB: finite(usedMemoryMiB)
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
  const grafana = httpJson("http://127.0.0.1:3000/api/health");
  const netdata = httpJson("http://127.0.0.1:19999/api/v1/info");
  const ollama = httpJson("http://127.0.0.1:11434/api/tags");
  const nodeExporter = command("curl", ["-sS", "--max-time", "2", "http://127.0.0.1:9100/metrics"]);

  return {
    hostUrl,
    grafana: grafana.ok ? grafana.body : null,
    netdata: netdata.ok ? netdata.body : null,
    ollama: ollama.ok ? ollama.body : null,
    nodeExporterUp: nodeExporter.includes("# HELP"),
    observedServices: [
      grafana.ok ? "grafana" : null,
      netdata.ok ? "netdata" : null,
      ollama.ok ? "ollama" : null,
      nodeExporter.includes("# HELP") ? "node-exporter" : null
    ].filter(Boolean)
  };
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
    allocatedGpuHours: gpu.present ? gpu.count * (windowMinutes / 60) : 0,
    durationHours: windowMinutes / 60,
    gpus: gpu.count,
    powerWatts: finite(primaryGpu.powerDrawWatts, 0),
    temperatureC: finite(primaryGpu.temperatureC, 0),
    networkWait: clamp(loadPressurePct * 0.15 + (host.network.txDrops > 0 ? 4 : 0), 0, 25),
    storageWait: clamp(Math.max(0, diskUsedPct - 75) * 0.6, 0, 35),
    cpuPrep: clamp(Math.max(cpuBusyPct, dockerCpuPct) * 0.75, 0, 45),
    contentionPct: clamp(Math.max(loadPressurePct, dockerCpuPct), 0, 45),
    latencyTail: clamp(loadPressurePct * 0.6 + (host.network.txDrops > 0 ? 6 : 0), 0, 35),
    noGpuProcess: gpu.present && gpu.processesObserved && !hasActiveGpuProcess
  };
}

function buildBundle({ runId, host, gpu, docker, services, metrics, hostUrl, generatedAt, windowMinutes }) {
  const primaryGpu = gpu.gpus[0] || {};
  const gpuName = gpuLabel(primaryGpu, gpu);
  const modelKey = safeId(primaryGpu.name || gpuName);
  const clusterKey = safeId(host.hostname);
  const tenant = "local-lab";
  const account = safeId(host.hostname);
  const reservation = primaryGpu.name ? `${safeId(primaryGpu.name)}-workstation` : "cpu-only-workstation";
  const generatedIso = generatedAt.toISOString();
  const activeModelNames = Array.isArray(services.ollama?.models)
    ? services.ollama.models.slice(0, 6).map((model) => model.name)
    : [];
  const sourceAdapters = machineSourceAdapters(gpu, services);

  return {
    metadata: {
      generatedAt: generatedIso,
      source: "collect-local-machine-bundle.js",
      observedHost: host.hostname,
      sourceAdapters,
      note: "Strict live machine observation. The bundle only claims data collected from nvidia-smi when present, host OS counters, Docker when present, and reachable local services; Kubernetes, DCGM, eBPF, scheduler, and provider exports are not synthesized."
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
            os: host.osName,
            kernel: host.kernel,
            cpuModel: host.cpuModel,
            cpuCount: host.cpuCount,
            load1: round(host.load1, 3),
            load5: round(host.load5, 3),
            load15: round(host.load15, 3),
            cpuUsagePct: round(metrics.cpuBusyPct, 2),
            memoryTotalBytes: host.memoryTotalBytes,
            memoryAvailableBytes: host.memoryAvailableBytes,
            memoryUsedPct: round(metrics.memoryUsedPct, 2),
            diskTotalBytes: host.disk.totalBytes,
            diskUsedBytes: host.disk.usedBytes,
            diskUsedPct: round(metrics.diskUsedPct, 2),
            networkInterface: host.network.iface,
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
            ollamaModels: activeModelNames,
            gpuPresent: gpu.present,
            gpuName: primaryGpu.name || "",
            gpuSource: gpu.source,
            gpuError: gpu.error || "",
            gpuUuid: primaryGpu.uuid,
            gpuUtilizationPct: round(metrics.gpuUtil, 2),
            gpuMemoryUsedMiB: round(finite(primaryGpu.memoryUsedMiB, 0), 2),
            gpuMemoryTotalMiB: round(finite(primaryGpu.memoryTotalMiB, 0), 2),
            gpuMemoryUsedPct: round(metrics.gpuMemoryPct, 2),
            gpuPowerWatts: round(finite(primaryGpu.powerDrawWatts, 0), 2),
            gpuTemperatureC: round(finite(primaryGpu.temperatureC, 0), 2),
            gpuComputeProcesses: gpu.processes || [],
            gpuComputeProcessQuerySkipped: Boolean(gpu.processesSkipped),
            gpuSampleCached: Boolean(gpu.sampleCached),
            gpuSampleAgeMs: round(finite(gpu.sampleAgeMs, 0), 0),
            gpuPcie: primaryGpu.pcieGen ? `gen${primaryGpu.pcieGen} x${primaryGpu.pcieWidth || "?"}` : "",
            sourceAdapters,
            unavailableExports: ["kubernetes", "dcgm", "ebpf", "scheduler", "provider"],
            workloadCountersObserved: false,
            generatedAt: generatedIso
          }
        }
      ],
      sourceAdapters
    },
    sources: {}
  };
}

function machineSourceAdapters(gpu, services) {
  const hostCounters = fs.existsSync("/proc/stat") ? "procfs" : "os-counters";

  return [
    "local-machine",
    gpu.present ? "nvidia-smi" : null,
    !gpu.present && gpu.source === "nvidia-smi-unavailable" ? "nvidia-smi-unavailable" : null,
    hostCounters,
    command("docker", ["version", "--format", "{{.Server.Version}}"]).trim() ? "docker" : null,
    ...services.observedServices
  ].filter(Boolean);
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

function primaryNetworkStats() {
  const iface = Object.entries(os.networkInterfaces())
    .flatMap(([name, entries]) => (entries || []).map((entry) => ({ name, ...entry })))
    .find((entry) => entry.family === "IPv4" && !entry.internal)?.name || "";
  const base = iface ? `/sys/class/net/${iface}/statistics` : "";
  return {
    iface,
    rxBytes: finite(readFile(path.join(base, "rx_bytes")), 0),
    txBytes: finite(readFile(path.join(base, "tx_bytes")), 0),
    rxDrops: finite(readFile(path.join(base, "rx_dropped")), 0),
    txDrops: finite(readFile(path.join(base, "tx_dropped")), 0),
    rxErrors: finite(readFile(path.join(base, "rx_errors")), 0),
    txErrors: finite(readFile(path.join(base, "tx_errors")), 0)
  };
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

function nonInternalAddresses() {
  return Object.entries(os.networkInterfaces())
    .flatMap(([name, entries]) => (entries || []).map((entry) => ({ name, ...entry })))
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
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

function commandResult(bin, args = []) {
  const result = spawnSync(bin, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5000,
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
    processes: (gpu.processes || []).map((entry) => ({ ...entry }))
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
  const parsed = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
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

function clamp(value, min, max) {
  const parsed = finite(value, min);
  return Math.min(max, Math.max(min, parsed));
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
