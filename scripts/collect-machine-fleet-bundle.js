#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { assertValidSourceBundle } = require("../lib/source-bundle-validator.js");

const PI_FLEET_REMOTES = Array.from({ length: 12 }, (_unused, index) => `pi@pi${index + 1}`);

const args = parseArgs(process.argv.slice(2));
const root = path.join(__dirname, "..");
const outPath = args.out || "";
const hostUrl = args["host-url"] || process.env.TURBALANCE_MACHINE_DEMO_URL || "http://192.168.10.30:8000";
const remoteRoot = args["remote-root"] || process.env.TURBALANCE_REMOTE_MACHINE_ROOT || "";
const includePiFleet = args["pi-fleet"] === true || process.env.TURBALANCE_PI_FLEET === "1";
const includePiBenchmarks = args["pi-benchmarks"] === true || process.env.TURBALANCE_PI_BENCHMARKS === "1";
const configuredRemotes = arrayArg(args.remote || process.env.TURBALANCE_REMOTE_MACHINES || "");
const remotes = unique([
  ...configuredRemotes,
  ...(includePiFleet ? PI_FLEET_REMOTES : [])
]);
const strictRemotes = args["strict-remotes"] === true || process.env.TURBALANCE_STRICT_REMOTE_MACHINES === "1";
const includeLocal = args["no-local"] !== true;
const networkInterface = args["network-interface"] || process.env.TURBALANCE_LIVE_NETWORK_INTERFACE || "";
const dgxInterconnectInterface = args["dgx-interconnect-interface"] || process.env.TURBALANCE_DGX_INTERCONNECT_INTERFACE || "";
const dgxInterconnectSubnetPrefix = args["dgx-interconnect-subnet-prefix"] || process.env.TURBALANCE_DGX_INTERCONNECT_SUBNET_PREFIX || "";
const gpuBackend = args["gpu-backend"] || process.env.TURBALANCE_GPU_BACKEND || "";
const gpustatBin = args["gpustat-bin"] || process.env.TURBALANCE_GPUSTAT_BIN || "";

const bundles = [];
if (includeLocal) bundles.push(collectLocalBundle());
remotes.forEach((remote) => bundles.push(collectRemoteBundle(remote)));

const bundle = combineBundles(bundles);
assertValidSourceBundle(bundle);

const output = `${JSON.stringify(bundle, null, 2)}\n`;
if (outPath) {
  const fullPath = path.resolve(outPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, output);
} else {
  process.stdout.write(output);
}

function collectLocalBundle() {
  return runJson(process.execPath, [
    path.join(root, "scripts", "collect-local-machine-bundle.js"),
    "--host-url",
    hostUrl,
    ...gpuArgs(),
    ...networkArgs()
  ], {
    TURBALANCE_DISABLE_LOCAL_FLEET_DELEGATION: "1"
  });
}

function collectRemoteBundle(remote) {
  const command = remoteCollectorCommand(remote);
  try {
    return runJson("ssh", [
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=8",
      "-o",
      "StrictHostKeyChecking=accept-new",
      remote,
      command
    ]);
  } catch (error) {
    if (strictRemotes) throw error;
    return buildRemoteUnavailableBundle(remote, error);
  }
}

function runJson(bin, commandArgs, env = {}) {
  const output = execFileSync(bin, commandArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...env
    },
    timeout: 30000,
    maxBuffer: 50 * 1024 * 1024
  });

  return JSON.parse(output);
}

function combineBundles(bundles) {
  const generatedAt = new Date().toISOString();
  const ingestion = {
    schemaVersion: "turba.ingestion.v1",
    entities: {},
    runs: [],
    sourceAdapters: []
  };

  bundles.forEach((bundle) => {
    mergeEntities(ingestion.entities, bundle.ingestion?.entities || {});
    ingestion.runs.push(...(bundle.ingestion?.runs || []));
    ingestion.sourceAdapters = unique([
      ...ingestion.sourceAdapters,
      ...(bundle.ingestion?.sourceAdapters || []),
      ...(bundle.metadata?.sourceAdapters || [])
    ]);
  });

  const observedHosts = unique(ingestion.runs
    .map((run) => run.sourceContext?.hostname)
    .filter(Boolean));
  const remoteCollectionFailures = bundles
    .map((bundle) => bundle.metadata?.remoteCollection)
    .filter((remote) => remote?.status === "unreachable");

  return {
    metadata: {
      generatedAt,
      source: "collect-machine-fleet-bundle.js",
      observedHosts,
      remoteCollectionFailures,
      note: "Strict live machine fleet observation. Each run is collected from that host and no Kubernetes, DCGM, eBPF, scheduler, provider, billing, SLO, or opportunity overlays are synthesized."
    },
    ingestion,
    sources: {}
  };
}

function mergeEntities(target, source) {
  Object.entries(source).forEach(([group, values]) => {
    target[group] = target[group] || {};
    Object.entries(values || {}).forEach(([key, value]) => {
      target[group][key] = target[group][key] || value;
    });
  });
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else if (parsed[key] === undefined) {
      parsed[key] = next;
      index += 1;
    } else if (Array.isArray(parsed[key])) {
      parsed[key].push(next);
      index += 1;
    } else {
      parsed[key] = [parsed[key], next];
      index += 1;
    }
  }

  return parsed;
}

function remoteCollectorCommand(remote) {
  const roots = remoteRoot
    ? [shellRoot(remoteRoot)]
    : [
      "\"$HOME/turbalance-analytics\"",
      "\"$HOME/Analytics\"",
      "\"/home/pi/Analytics\"",
      "\"/home/user/Analytics\"",
      "\"/home/ssh/Analytics\""
    ];
  const collectorEnv = [
    networkInterface ? `TURBALANCE_LIVE_NETWORK_INTERFACE=${shellQuote(networkInterface)}` : "",
    dgxInterconnectInterface ? `TURBALANCE_DGX_INTERCONNECT_INTERFACE=${shellQuote(dgxInterconnectInterface)}` : "",
    dgxInterconnectSubnetPrefix ? `TURBALANCE_DGX_INTERCONNECT_SUBNET_PREFIX=${shellQuote(dgxInterconnectSubnetPrefix)}` : "",
    gpuBackend ? `TURBALANCE_GPU_BACKEND=${shellQuote(gpuBackend)}` : "",
    gpustatBin ? `TURBALANCE_GPUSTAT_BIN=${shellQuote(gpustatBin)}` : "",
    includePiBenchmarks && isPiRemote(remote) ? "TURBALANCE_PI_BENCHMARKS=1" : ""
  ].filter(Boolean).join(" ");
  return [
    "set -e;",
    `for root in ${roots.join(" ")}; do`,
    "if [ -f \"$root/scripts/collect-local-machine-bundle.js\" ]; then",
    "cd \"$root\";",
    `${collectorEnv ? `${collectorEnv} ` : ""}TURBALANCE_DISABLE_LOCAL_FLEET_DELEGATION=1 exec node scripts/collect-local-machine-bundle.js --host-url ${shellQuote(hostUrl)};`,
    "fi;",
    "done;",
    "printf '%s\\n' 'collect-local-machine-bundle.js not found in expected roots' >&2;",
    "exit 78"
  ].join(" ");
}

function isPiRemote(remote) {
  const host = remoteHost(remote);
  return /^pi(?:[1-9]|1[0-2])$/i.test(host);
}

function networkArgs() {
  const values = [];
  if (networkInterface) values.push("--network-interface", networkInterface);
  if (dgxInterconnectInterface) values.push("--dgx-interconnect-interface", dgxInterconnectInterface);
  if (dgxInterconnectSubnetPrefix) values.push("--dgx-interconnect-subnet-prefix", dgxInterconnectSubnetPrefix);
  return values;
}

function gpuArgs() {
  const values = [];
  if (gpuBackend) values.push("--gpu-backend", gpuBackend);
  if (gpustatBin) values.push("--gpustat-bin", gpustatBin);
  return values;
}

function buildRemoteUnavailableBundle(remote, error) {
  const generatedAt = new Date();
  const generatedIso = generatedAt.toISOString();
  const host = remoteHost(remote);
  const hostKey = safeId(host);
  const runId = `machine-${hostKey}-ssh-unreachable-${timestampId(generatedAt)}`;
  const sourceAdapters = ["ssh-unreachable"];
  const sshError = compactWhitespace(error.stderr || error.message || "ssh collection failed");
  return {
    metadata: {
      generatedAt: generatedIso,
      source: "collect-machine-fleet-bundle.js",
      observedHost: host,
      sourceAdapters,
      remoteCollection: {
        remote,
        host,
        status: "unreachable",
        error: sshError
      },
      note: "Strict live machine fleet observation. This remote host could not be reached over SSH, so only its monitoring reachability state is reported."
    },
    ingestion: {
      schemaVersion: "turba.ingestion.v1",
      entities: {
        models: {
          [`${hostKey}-unreachable`]: {
            label: `${host} SSH reachability`,
            family: "monitoring-reachability",
            parameterCountB: 0
          }
        },
        users: {
          "local-operator": { label: "local operator" }
        },
        teams: {
          "local-ai-ops": { label: "Local AI Ops" }
        },
        tenants: {
          "local-lab": { label: "Local lab" }
        },
        accounts: {
          [hostKey]: { label: host }
        },
        reservations: {
          [`${hostKey}-monitoring`]: { label: `${host} monitoring window` }
        },
        clusters: {
          [hostKey]: {
            label: host,
            region: "local-lan",
            topology: "single-node"
          }
        }
      },
      runs: [
        {
          id: runId,
          name: `${host} SSH monitoring check`,
          refs: {
            model: `${hostKey}-unreachable`,
            user: "local-operator",
            team: "local-ai-ops",
            cluster: hostKey,
            tenant: "local-lab",
            account: hostKey,
            reservation: `${hostKey}-monitoring`
          },
          status: "SSH unreachable",
          importedSources: sourceAdapters,
          allocation: {
            durationHours: 0,
            gpus: 0,
            allocatedGpuHours: 0,
            gpuModel: "SSH unreachable"
          },
          utilization: {
            gpuUtil: 0,
            usefulCompute: 0,
            smOccupancy: 0,
            tensorCoreUtil: 0
          },
          communication: {
            ncclTime: 0,
            networkWait: 0,
            networkUtilization: 0,
            allToAllTime: 0,
            crossRackTraffic: 0,
            crossPodTraffic: 0
          },
          inputPipeline: {
            dataloaderStall: 0,
            storageWait: 0,
            cpuPrep: 0
          },
          memory: {
            hbmCapacity: 0,
            hbmBandwidth: 0,
            memoryFragmentation: 0,
            kvCachePressure: 0
          },
          scheduler: {
            placementQuality: 0,
            idleGpus: 0,
            partialNodes: 0,
            queueWaitMinutes: 0,
            gpusPerNode: 0
          },
          reliability: {
            noiseEvents: 1,
            contentionPct: 0,
            stepRegularity: 0,
            latencyTail: 0
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
            gpuEfficiency: 0,
            queueWaitMinutes: 0,
            ncclTime: 0
          },
          placement: {
            nodes: [host],
            partialNodes: []
          },
          sourceContext: {
            hostname: host,
            remote,
            reachable: false,
            sshStatus: "unreachable",
            sshError,
            os: "",
            kernel: "",
            cpuModel: "",
            cpuCount: 0,
            load1: 0,
            load5: 0,
            load15: 0,
            cpuUsagePct: 0,
            memoryTotalBytes: 0,
            memoryAvailableBytes: 0,
            memoryUsedPct: 0,
            diskTotalBytes: 0,
            diskUsedBytes: 0,
            diskUsedPct: 0,
            lakehouseRoot: "",
            lakehouseExists: false,
            lakehouseMeasuredAt: generatedIso,
            lakehouseUsedBytes: 0,
            lakehouseDiskFilesystem: "",
            lakehouseDiskType: "",
            lakehouseDiskTotalBytes: 0,
            lakehouseDiskUsedBytes: 0,
            lakehouseDiskAvailableBytes: 0,
            lakehouseDiskUsedPct: 0,
            networkInterface: "",
            networkLocalAddress: "",
            networkPeerAddress: "",
            networkLinkRole: "SSH reachability",
            networkSelectionReason: "remote host unreachable",
            networkLinkSpeedMbps: 0,
            networkRxBytes: 0,
            networkTxBytes: 0,
            networkRxBytesPerSecond: 0,
            networkTxBytesPerSecond: 0,
            networkUtilizationPct: 0,
            networkRxDrops: 0,
            networkTxDrops: 0,
            networkRxErrors: 0,
            networkTxErrors: 0,
            dockerContainers: [],
            observedServices: [],
            gpuPresent: false,
            gpuName: "",
            gpuSource: "ssh-unreachable",
            gpuError: sshError,
            gpuUtilizationPct: 0,
            gpuMemoryUsedMiB: 0,
            gpuMemoryTotalMiB: 0,
            gpuMemoryUsedPct: 0,
            gpuPowerWatts: 0,
            gpuTemperatureC: 0,
            gpuComputeProcesses: [],
            gpuComputeProcessQuerySkipped: true,
            gpuSampleCached: false,
            gpuSampleAgeMs: 0,
            gb10Present: false,
            gb10MonitoringList: [],
            gb10MonitoringSummary: "",
            appMetricsReachable: false,
            nsightCuptiProfilingStatus: "unknown",
            nsightCuptiProfilingScripts: [],
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

function arrayArg(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function shellRoot(value) {
  const text = String(value);
  if (text.startsWith("$HOME/")) return `"${text}"`;
  return shellQuote(text);
}

function remoteHost(remote) {
  return String(remote || "").replace(/^.*@/, "") || "unknown-remote";
}

function safeId(value) {
  return String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function timestampId(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

function compactWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
