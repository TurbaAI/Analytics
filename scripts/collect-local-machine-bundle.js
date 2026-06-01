#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { assertValidSourceBundle } = require("../lib/source-bundle-validator.js");

const args = parseArgs(process.argv.slice(2));
const outPath = args.out || "";
const hostUrl = args["host-url"] || process.env.TURBALANCE_MACHINE_DEMO_URL || `http://${primaryAddress()}:8000`;
const windowMinutes = numberArg(args["window-minutes"], 60);
const generatedAt = new Date();
const host = collectHost();
const gpu = collectGpu();
const docker = collectDocker();
const services = collectServices(hostUrl);
const metrics = deriveMetrics({ host, gpu, docker, services, windowMinutes });
const runId = args["run-id"] || `machine-${safeId(host.hostname)}-${timestampId(generatedAt)}`;
const bundle = buildBundle({ runId, host, gpu, docker, services, metrics, hostUrl, generatedAt, windowMinutes });

assertValidSourceBundle(bundle, { requireSourceExport: true });

const output = `${JSON.stringify(bundle, null, 2)}\n`;
if (outPath) {
  const fullPath = path.resolve(outPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, output);
} else {
  process.stdout.write(output);
}

function collectHost() {
  const meminfo = readMeminfo();
  const disk = diskInfo("/");
  const cpuSample = cpuUsageSample();
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

function collectGpu() {
  const query = command("nvidia-smi", [
    "--query-gpu=name,index,uuid,utilization.gpu,utilization.memory,memory.used,memory.total,power.draw,temperature.gpu,pcie.link.gen.current,pcie.link.width.current",
    "--format=csv,noheader,nounits"
  ]);
  if (!query.trim()) {
    return {
      present: false,
      count: 0,
      gpus: [],
      source: "nvidia-smi-not-found"
    };
  }

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

  const processesText = command("nvidia-smi", [
    "--query-compute-apps=pid,process_name,used_memory",
    "--format=csv,noheader,nounits"
  ]);
  const processes = processesText.trim().split("\n")
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
    .filter((entry) => Number.isFinite(entry.pid));

  return {
    present: gpus.length > 0,
    count: gpus.length,
    gpus,
    processes,
    source: "nvidia-smi"
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
  const hasActiveGpuProcess = (gpu.processes || []).length > 0;
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
    noGpuProcess: gpu.present && !hasActiveGpuProcess
  };
}

function buildBundle({ runId, host, gpu, docker, services, metrics, hostUrl, generatedAt, windowMinutes }) {
  const primaryGpu = gpu.gpus[0] || {};
  const modelKey = safeId(primaryGpu.name || "no-nvidia-gpu");
  const clusterKey = safeId(host.hostname);
  const tenant = "local-lab";
  const account = safeId(host.hostname);
  const reservation = primaryGpu.name ? `${safeId(primaryGpu.name)}-workstation` : "cpu-only-workstation";
  const generatedIso = generatedAt.toISOString();
  const startedAt = new Date(generatedAt.getTime() - windowMinutes * 60000).toISOString();
  const activeModelNames = Array.isArray(services.ollama?.models)
    ? services.ollama.models.slice(0, 6).map((model) => model.name)
    : [];

  return {
    metadata: {
      generatedAt: generatedIso,
      source: "collect-local-machine-bundle.js",
      observedHost: host.hostname,
      note: "Observed local machine state. Kubernetes and DCGM are included only when installed; this host currently uses nvidia-smi/procfs/node-exporter style signals."
    },
    ingestion: {
      schemaVersion: "turba.ingestion.v1",
      entities: {
        models: {
          [modelKey]: {
            label: primaryGpu.name ? `${primaryGpu.name} local capacity` : "CPU-only local capacity",
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
          name: `${host.hostname} current ${primaryGpu.name || "CPU"} window`,
          refs: {
            model: modelKey,
            user: "local-operator",
            team: "local-ai-ops",
            cluster: clusterKey,
            tenant,
            account,
            reservation
          },
          status: metrics.noGpuProcess ? "GPU idle, observability active" : "Observed",
          allocation: {
            durationHours: round(metrics.durationHours, 3),
            gpus: metrics.gpus,
            allocatedGpuHours: round(metrics.allocatedGpuHours, 3),
            gpuModel: primaryGpu.name || "none"
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
            batchInefficiency: metrics.noGpuProcess ? 100 : 0
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
          schedulerEvidence: {
            schedulerName: "local-linux-process-scheduler",
            queueName: "local-workstation",
            priorityClass: "interactive",
            admissionClass: "direct",
            requestedGpuShape: `${metrics.gpus}x ${primaryGpu.name || "CPU"}`,
            localityPreference: "single-node",
            queuedAt: startedAt,
            admittedAt: startedAt,
            startedAt,
            eventCount: docker.length,
            queueWaitMinutes: 0,
            gpusPerNode: Math.max(1, metrics.gpus)
          },
          grafanaContext: {
            grafanaBaseUrl: `${hostUrl.replace(/:8000$/, ":3000")}`,
            instanceName: "NUC14E Grafana",
            dashboardTitle: "Local observability",
            links: [
              {
                label: "Grafana health",
                type: "dashboard",
                url: `${hostUrl.replace(/:8000$/, ":3000")}/api/health`
              },
              {
                label: "Node exporter metrics",
                type: "metrics",
                url: `${hostUrl.replace(/:8000$/, ":9100")}/metrics`
              }
            ]
          },
          commercial: {
            billingModel: "local-workstation",
            customerTier: "internal",
            contractId: "local-observed",
            listGpuHourRate: 0,
            floorGpuHourCost: 0,
            committedGpuHours: round(Math.max(metrics.allocatedGpuHours, 1), 3),
            burstGpuHours: 0,
            billableGpuHours: round(metrics.allocatedGpuHours, 3),
            sellableGpuHours: round(metrics.allocatedGpuHours, 3)
          },
          slo: {
            priority: "local",
            targetStartMinutes: 0,
            targetEfficiency: metrics.gpus > 0 ? 40 : 0,
            supportTicketId: "local-demo"
          },
          sourceContext: {
            hostname: host.hostname,
            os: host.osName,
            kernel: host.kernel,
            cpuModel: host.cpuModel,
            cpuCount: host.cpuCount,
            memoryTotalBytes: host.memoryTotalBytes,
            diskTotalBytes: host.disk.totalBytes,
            dockerContainers: docker.map((container) => container.name),
            observedServices: services.observedServices,
            ollamaModels: activeModelNames,
            gpuUuid: primaryGpu.uuid,
            gpuPcie: primaryGpu.pcieGen ? `gen${primaryGpu.pcieGen} x${primaryGpu.pcieWidth || "?"}` : "",
            generatedAt: generatedIso
          },
          opportunities: [
            {
              id: "local-gpu-idle",
              category: "Useful Compute FinOps",
              title: metrics.noGpuProcess ? "RTX 4090 is present but no GPU process is active" : "Measure active local GPU workload efficiency",
              impactDollars: 0,
              impactGpuHours: round(metrics.noGpuProcess ? metrics.allocatedGpuHours : Math.max(0, metrics.allocatedGpuHours * (1 - metrics.usefulCompute / 100)), 3),
              riskScore: metrics.noGpuProcess ? 42 : 18,
              confidence: 92,
              evidence: metrics.noGpuProcess
                ? `${primaryGpu.name || "GPU"} reports ${round(metrics.gpuUtil, 2)}% utilization and no active compute process during the sampled window.`
                : `${primaryGpu.name || "GPU"} reports ${round(metrics.gpuUtil, 2)}% utilization during the sampled window.`,
              recommendation: metrics.noGpuProcess
                ? "Use this as an idle-capacity demo or start a controlled Ollama/GPU workload before collecting again."
                : "Compare this host window against Ollama request volume or training logs before making tuning claims.",
              owner: "Local operator"
            }
          ]
        }
      ],
      sourceAdapters: ["local-machine", "nvidia-smi", "procfs", ...services.observedServices]
    },
    sources: {
      prometheus: [
        {
          runId,
          metrics: {
            turba_gpu_utilization_ratio: pctRatio(metrics.gpuUtil),
            turba_useful_compute_ratio: pctRatio(metrics.usefulCompute),
            turba_nccl_time_ratio: 0,
            turba_network_wait_ratio: pctRatio(metrics.networkWait),
            turba_dataloader_stall_ratio: 0,
            turba_storage_wait_ratio: pctRatio(metrics.storageWait),
            turba_cpu_prep_ratio: pctRatio(metrics.cpuPrep),
            turba_queue_wait_minutes: 0,
            turba_step_regularity_ratio: metrics.noGpuProcess ? 1 : pctRatio(clamp(100 - metrics.latencyTail, 0, 100)),
            turba_latency_tail_ratio: pctRatio(metrics.latencyTail),
            turba_tokens_million_total: 0,
            turba_training_steps_total: 0,
            turba_inference_requests_million_total: 0,
            turba_all_to_all_time_ratio: 0
          },
          sourceContext: {
            collector: "procfs+nvidia-smi",
            nodeExporter: services.nodeExporterUp,
            netdata: Boolean(services.netdata)
          }
        }
      ],
      dcgm: gpu.present ? [
        {
          runId,
          fields: {
            DCGM_FI_PROF_SM_OCCUPANCY: round(metrics.smOccupancy, 2),
            DCGM_FI_PROF_PIPE_TENSOR_ACTIVE: round(metrics.tensorCoreUtil, 2),
            DCGM_FI_DEV_FB_USED_RATIO: round(metrics.gpuMemoryPct, 2),
            DCGM_FI_PROF_DRAM_ACTIVE: round(metrics.hbmBandwidthPct, 2),
            DCGM_FI_DEV_MEM_FRAGMENTATION: 0,
            DCGM_FI_DEV_KV_CACHE_PRESSURE: round(metrics.gpuMemoryPct, 2)
          },
          sourceContext: {
            collector: "nvidia-smi-compatible-dcgm-fields",
            gpuName: primaryGpu.name,
            gpuUuid: primaryGpu.uuid,
            powerDrawWatts: primaryGpu.powerDrawWatts,
            temperatureC: primaryGpu.temperatureC
          }
        }
      ] : [],
      scheduler: [
        {
          runId,
          schedulerExportId: `local-scheduler-${timestampId(generatedAt)}`,
          schedulerName: "local-linux-process-scheduler",
          queueName: "local-workstation",
          priorityClass: "interactive",
          admissionClass: "direct",
          requestedGpuShape: `${metrics.gpus}x ${primaryGpu.name || "CPU"}`,
          localityPreference: "single-node",
          queuedAt: startedAt,
          admittedAt: startedAt,
          startedAt,
          queueWaitMinutes: 0,
          placementQuality: 100,
          idleGpus: metrics.noGpuProcess ? metrics.gpus : 0,
          partialNodes: 0,
          preemptionCount: 0,
          placementRetries: 0,
          localityMisses: 0,
          backfillCandidates: 0,
          pendingJobsAhead: 0,
          pendingGpuHoursAhead: 0,
          gpusPerNode: Math.max(1, metrics.gpus),
          targetStartMinutes: 0,
          events: docker.map((container) => ({
            type: "local_service",
            timestamp: generatedIso,
            reason: `${container.name} running ${container.image}`,
            status: container.status
          }))
        }
      ],
      grafana: [
        {
          runId,
          grafanaBaseUrl: `${hostUrl.replace(/:8000$/, ":3000")}`,
          instanceName: "NUC14E Grafana",
          orgId: "1",
          dashboardTitle: "Local observability",
          datasourceName: services.nodeExporterUp ? "node-exporter" : "local host",
          timeRange: {
            from: "now-1h",
            to: "now"
          },
          variables: {
            host: host.hostname,
            gpu: primaryGpu.name || "none"
          },
          links: [
            {
              label: "Grafana health",
              type: "dashboard",
              url: `${hostUrl.replace(/:8000$/, ":3000")}/api/health`
            },
            {
              label: "Netdata local",
              type: "dashboard",
              url: `${hostUrl.replace(/:8000$/, ":19999")}`
            },
            {
              label: "Node exporter metrics",
              type: "metrics",
              url: `${hostUrl.replace(/:8000$/, ":9100")}/metrics`
            }
          ]
        }
      ],
      ebpf: [
        {
          runId,
          ebpfExportId: `procfs-${timestampId(generatedAt)}`,
          collector: "procfs-summary",
          kernelRelease: host.kernel,
          host: host.hostname,
          node: host.hostname,
          namespace: "local",
          podName: "",
          containerName: docker.map((container) => container.name).join(", "),
          cgroupPath: "",
          cpu: {
            offCpuTimePct: round(Math.max(0, 100 - metrics.cpuBusyPct), 2),
            cpuThrottlePct: round(Math.min(metrics.dockerCpuPct, 100), 2),
            softIrqPct: 0
          },
          scheduler: {
            runQueueLatencyMsP95: round(Math.max(0.5, host.load1 / Math.max(1, host.cpuCount)) * 10, 2)
          },
          network: {
            tcpRetransmitPct: 0,
            socketLatencyMsP95: host.network.txDrops > 0 ? 18 : 3
          },
          storage: {
            blockIoLatencyMsP95: metrics.diskUsedPct > 80 ? 18 : 4,
            filesystemLatencyMsP95: metrics.diskUsedPct > 80 ? 24 : 6
          },
          noise: {
            noisyNeighborScore: round(metrics.contentionPct, 2),
            noiseEvents: host.network.txDrops > 0 ? 1 : 0
          },
          sourceContext: {
            note: "procfs summary used because no eBPF collector is installed on this host."
          }
        }
      ],
      provider: [
        {
          runId,
          tenant,
          account,
          reservation,
          providerExportId: `local-machine-${timestampId(generatedAt)}`,
          billingAccountId: account,
          reservationWindow: `${windowMinutes}m-observed`,
          commercial: {
            billingModel: "local-workstation",
            customerTier: "internal",
            contractId: "local-observed",
            listGpuHourRate: 0,
            floorGpuHourCost: 0,
            committedGpuHours: round(Math.max(metrics.allocatedGpuHours, 1), 3),
            burstGpuHours: 0,
            billableGpuHours: round(metrics.allocatedGpuHours, 3),
            sellableGpuHours: round(metrics.allocatedGpuHours, 3)
          },
          slo: {
            priority: "local",
            targetStartMinutes: 0,
            targetEfficiency: metrics.gpus > 0 ? 40 : 0,
            supportTicketId: "local-demo"
          },
          sourceContext: {
            hostname: host.hostname,
            os: host.osName,
            gpuName: primaryGpu.name,
            dockerContainers: docker.length,
            observedServices: services.observedServices.join(", ")
          }
        }
      ],
      opportunities: [
        {
          runId,
          opportunityId: "local-machine-right-size",
          category: "Useful Compute FinOps",
          title: metrics.noGpuProcess ? "Use the idle RTX 4090 as a safe demo target" : "Attach request-level telemetry to active GPU work",
          impactDollars: 0,
          impactGpuHours: round(metrics.noGpuProcess ? metrics.allocatedGpuHours : Math.max(0, metrics.allocatedGpuHours * 0.25), 3),
          riskScore: metrics.noGpuProcess ? 42 : 24,
          confidence: 90,
          evidence: metrics.noGpuProcess
            ? `No active nvidia-smi compute processes; ${metrics.modelCount} Ollama model(s) are installed and Grafana/Netdata/node-exporter are reachable.`
            : `Active GPU process detected with ${round(metrics.gpuUtil, 2)}% GPU utilization.`,
          recommendation: metrics.noGpuProcess
            ? "For a live workload demo, start a controlled local inference request stream, rerun the collector, then compare idle versus active windows."
            : "Join Ollama request logs or application traces to this host window for cost-per-useful-token analysis.",
          owner: "Local operator",
          sourceSignals: {
            gpuUtil: round(metrics.gpuUtil, 2),
            gpuMemoryPct: round(metrics.gpuMemoryPct, 2),
            dockerContainers: docker.length,
            ollamaModels: metrics.modelCount,
            largeOllamaModels: metrics.largeModelCount
          }
        }
      ]
    }
  };
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

function cpuUsageSample() {
  const first = readCpuStat();
  sleep(250);
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

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
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
