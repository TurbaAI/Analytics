#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

const DEFAULT_HOSTS = [
  { ssh: "user@192.168.10.20", hostId: "SPARK1", networkPeer: "192.168.100.11" },
  { ssh: "user@192.168.10.21", hostId: "SPARK2", networkPeer: "192.168.100.10" }
];
const DEFAULT_PI_HOSTS = Array.from({ length: 12 }, (_unused, index) => ({
  ssh: `pi@pi${index + 1}`,
  hostId: `PI${index + 1}`,
  networkPeer: "",
  remoteRoot: "/home/pi/Analytics"
}));

const defaults = {
  collectorUrl: "http://192.168.10.30:8801/v1/telemetry/batches",
  hostUrl: "http://192.168.10.30:8000",
  nuc: "user@192.168.10.30",
  nucRoot: "/home/user/turbalance-analytics",
  lakeRoot: "/home/user/turbalance-lakehouse",
  remoteRoot: "/home/user/Analytics",
  tenantId: "dgx-lab",
  agentId: "system-id-automation",
  targets: "cpu,gpu,ram,network,disk",
  profiles: "impulse,step,ramp",
  intensityPct: "35",
  maxCpuPercent: "35",
  ramMaxMb: "512",
  networkMaxMbps: "1000",
  networkInterface: "",
  gpuCommand: "",
  diskCommand: "",
  loopMinutes: 0,
  out: path.join(root, "build", "system-identification", "automation-run.json")
};

function usage() {
  console.log(`Usage: node scripts/run-system-characterization.js [options]

Runs conservative system characterization on SPARK hosts, posts telemetry batches
to the NUC collector, then materializes the lakehouse virtual sensor tables.

Options:
  --remote <ssh:host-id[:network-peer]>  Host to characterize; repeatable
  --pi-fleet                             Characterize pi@pi1 through pi@pi12
  --include-spark-hosts                  Add SPARK1/SPARK2 when using custom hosts
  --spark1 <ssh-target>                  Override SPARK1 SSH target
  --spark2 <ssh-target>                  Override SPARK2 SSH target
  --collector-url <url>                  Telemetry batch collector URL
  --host-url <url>                       Dashboard host URL used in samples
  --nuc <ssh-target|local>               NUC transform host; use local on NUC
  --nuc-root <path>                      NUC analytics checkout path
  --lake-root <path>                     NUC lakehouse path
  --remote-root <path>                   SPARK analytics checkout path
  --tenant-id <id>                       Tenant id
  --agent-id <id>                        System-ID agent id
  --targets <csv>                        cpu,gpu,ram,network,disk by default
  --profiles <csv>                       impulse,step,ramp by default
  --full                                 Use normal worker durations instead of --quick
  --intensity-pct <pct>                  Workload intensity
  --max-cpu-percent <pct>                CPU worker cap
  --enable-ram-load                      Enable bounded Python RAM allocation load
  --ram-max-mb <mib>                     RAM cap passed to worker
  --enable-network-load                  Enable iperf3 network load
  --network-interface <name>             Interface to sample on SPARK hosts
  --network-max-mbps <mbps>              Network cap passed to worker
  --network-bidir                        Run bidirectional iperf3
  --enable-gpu-load                      Enable GPU load command
  --gpu-command <command>                GPU command using {seconds}/{intensity}
  --enable-disk-load                     Enable external disk load command
  --disk-command <command>               Disk command using {seconds}/{intensity}
  --skip-transform                       Do not materialize NUC transforms
  --loop-minutes <minutes>               Repeat forever at this interval
  --dry-run                              Print and report commands only
  --out <path>                           JSON report path
  --help                                 Show this help
`);
}

function parseArgs(argv) {
  const options = {
    ...defaults,
    hosts: DEFAULT_HOSTS.map((host) => ({ ...host })),
    quick: true,
    enableNetworkLoad: false,
    enableGpuLoad: false,
    enableRamLoad: false,
    enableDiskLoad: false,
    networkBidir: false,
    skipTransform: false,
    dryRun: false
  };
  let customHosts = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value`);
      return argv[index];
    };

    if (arg === "--help") {
      options.help = true;
    } else if (arg === "--remote") {
      if (!customHosts) {
        options.hosts = [];
        customHosts = true;
      }
      options.hosts.push(parseRemote(next()));
    } else if (arg === "--pi-fleet") {
      if (!customHosts) {
        options.hosts = [];
        customHosts = true;
      }
      options.hosts.push(...DEFAULT_PI_HOSTS.map((host) => ({ ...host })));
    } else if (arg === "--include-spark-hosts") {
      if (!customHosts) {
        options.hosts = [];
        customHosts = true;
      }
      options.hosts.push(...DEFAULT_HOSTS.map((host) => ({ ...host })));
    } else if (arg === "--spark1") {
      options.hosts[0].ssh = next();
    } else if (arg === "--spark2") {
      options.hosts[1].ssh = next();
    } else if (arg === "--collector-url") {
      options.collectorUrl = next();
    } else if (arg === "--host-url") {
      options.hostUrl = next();
    } else if (arg === "--nuc") {
      options.nuc = next();
    } else if (arg === "--nuc-root") {
      options.nucRoot = next();
    } else if (arg === "--lake-root") {
      options.lakeRoot = next();
    } else if (arg === "--remote-root") {
      options.remoteRoot = next();
    } else if (arg === "--tenant-id") {
      options.tenantId = next();
    } else if (arg === "--agent-id") {
      options.agentId = next();
    } else if (arg === "--targets") {
      options.targets = next();
    } else if (arg === "--profiles") {
      options.profiles = next();
    } else if (arg === "--full") {
      options.quick = false;
    } else if (arg === "--intensity-pct") {
      options.intensityPct = next();
    } else if (arg === "--max-cpu-percent") {
      options.maxCpuPercent = next();
    } else if (arg === "--enable-ram-load") {
      options.enableRamLoad = true;
    } else if (arg === "--ram-max-mb") {
      options.ramMaxMb = next();
    } else if (arg === "--enable-network-load") {
      options.enableNetworkLoad = true;
    } else if (arg === "--network-interface") {
      options.networkInterface = next();
    } else if (arg === "--network-max-mbps") {
      options.networkMaxMbps = next();
    } else if (arg === "--network-bidir") {
      options.networkBidir = true;
    } else if (arg === "--enable-gpu-load") {
      options.enableGpuLoad = true;
    } else if (arg === "--gpu-command") {
      options.gpuCommand = next();
    } else if (arg === "--enable-disk-load") {
      options.enableDiskLoad = true;
    } else if (arg === "--disk-command") {
      options.diskCommand = next();
    } else if (arg === "--skip-transform") {
      options.skipTransform = true;
    } else if (arg === "--loop-minutes") {
      options.loopMinutes = Number(next()) || 0;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--out") {
      options.out = next();
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.hosts = uniqueHosts(options.hosts);
  if (options.hosts.length === 0) throw new Error("At least one --remote host is required");
  return options;
}

function parseRemote(value) {
  const parts = String(value || "").split(":");
  if (parts.length < 2) {
    throw new Error("--remote must be formatted as ssh-target:host-id[:network-peer]");
  }
  return {
    ssh: parts[0],
    hostId: parts[1],
    networkPeer: parts.slice(2).join(":")
  };
}

function runOnce(options) {
  const runId = timestampId(new Date());
  const report = {
    schemaVersion: "turba.system_characterization_automation.v1",
    generatedAt: new Date().toISOString(),
    runId,
    mode: options.quick ? "quick" : "full",
    dryRun: options.dryRun,
    collectorUrl: options.collectorUrl,
    tenantId: options.tenantId,
    targets: splitList(options.targets),
    profiles: splitList(options.profiles),
    hosts: options.hosts.map((host) => ({ ...host })),
    steps: []
  };

  for (const host of options.hosts) {
    const result = characterizeHost(options, host, runId);
    record(report, "characterize-and-post", host.hostId, host.ssh, result);
  }

  if (!options.skipTransform) {
    const transform = materializeTransforms(options);
    record(report, "materialize-transforms", "NUC14E", options.nuc, transform);
  }

  report.status = report.steps.every((step) => step.ok) ? "ok" : "failed";
  writeReport(options.out, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== "ok") {
    process.exitCode = 2;
  }
  return report;
}

function characterizeHost(options, host, runId) {
  const safeHost = safeId(host.hostId);
  const remoteRoot = host.remoteRoot || options.remoteRoot;
  const reportPath = `build/system-identification/${safeHost}-${runId}-report.json`;
  const batchPath = `build/system-identification/${safeHost}-${runId}-batch.json`;
  const workerArgs = [
    "run",
    ...(options.quick ? ["--quick"] : []),
    "--targets", options.targets,
    "--profiles", options.profiles,
    "--intensity-pct", options.intensityPct,
    "--max-cpu-percent", options.maxCpuPercent,
    "--ram-max-mb", options.ramMaxMb,
    "--tenant-id", options.tenantId,
    "--host-id", host.hostId,
    "--agent-id", options.agentId,
    "--host-url", options.hostUrl,
    "--out", reportPath,
    "--batch-out", batchPath
  ];
  if (options.networkInterface) workerArgs.push("--network-interface", options.networkInterface);
  if (options.enableNetworkLoad) {
    workerArgs.push("--enable-network-load", "--network-max-mbps", options.networkMaxMbps);
    if (host.networkPeer) workerArgs.push("--network-peer", host.networkPeer);
    if (options.networkBidir) workerArgs.push("--network-bidir");
  }
  if (options.enableGpuLoad) {
    workerArgs.push("--enable-gpu-load");
    if (options.gpuCommand) workerArgs.push("--gpu-command", options.gpuCommand);
  }
  if (options.enableRamLoad) {
    workerArgs.push("--enable-ram-load");
  }
  if (options.enableDiskLoad) {
    workerArgs.push("--enable-disk-load");
    if (options.diskCommand) workerArgs.push("--disk-command", options.diskCommand);
  }

  const remoteCommand = [
    "set -euo pipefail",
    `cd ${shellQuote(remoteRoot)}`,
    "mkdir -p build/system-identification",
    `PYTHONPATH=services/system-id-worker:services/platform_common:services/raw-writer python3 -m system_id_worker ${workerArgs.map(shellQuote).join(" ")}`,
    `curl -sS -X POST ${shellQuote(options.collectorUrl)} -H ${shellQuote("Content-Type: application/json")} --data-binary @${shellQuote(batchPath)}`
  ].join(" && ");
  return ssh(options, host.ssh, remoteCommand);
}

function materializeTransforms(options) {
  const command = [
    "set -euo pipefail",
    `cd ${shellQuote(options.nucRoot)}`,
    `PYTHONPATH=services/transform-runner:services/platform_common:services/raw-writer:services/duckdb-query-service .venv-lakehouse/bin/python -m transform_runner --lake-root ${shellQuote(options.lakeRoot)} --tenant-id ${shellQuote(options.tenantId)}`
  ].join(" && ");
  if (options.nuc === "local") {
    return shell(options, command, options.nucRoot);
  }
  return ssh(options, options.nuc, command);
}

function ssh(options, host, command) {
  const args = ["-o", "StrictHostKeyChecking=accept-new", host, `bash -lc ${shellQuote(command)}`];
  return runCommand(options, "ssh", args, { command, target: host });
}

function shell(options, command, cwd) {
  return runCommand(options, "bash", ["-lc", command], { command, target: "local", cwd });
}

function runCommand(options, bin, args, metadata = {}) {
  const printable = `${bin} ${args.join(" ")}`;
  console.log(`${options.dryRun ? "[dry-run] " : ""}${printable}`);
  if (options.dryRun) {
    return { status: 0, stdout: "", stderr: "", dryRun: true, command: metadata.command || printable };
  }
  const result = spawnSync(bin, args, {
    cwd: metadata.cwd || root,
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024
  });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : undefined,
    command: metadata.command || printable
  };
}

function record(report, step, hostId, target, result) {
  report.steps.push({
    step,
    hostId,
    target,
    ok: result.status === 0,
    status: result.status,
    dryRun: Boolean(result.dryRun),
    command: result.command,
    stdout: String(result.stdout || "").slice(-5000),
    stderr: String(result.stderr || "").slice(-5000),
    error: result.error
  });
}

function writeReport(out, report) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
}

function loop(options) {
  while (true) {
    const started = Date.now();
    runOnce(options);
    const waitMs = Math.max(0, options.loopMinutes * 60 * 1000 - (Date.now() - started));
    if (waitMs <= 0) continue;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
  }
}

function splitList(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function uniqueHosts(hosts) {
  const seen = new Set();
  return hosts.filter((host) => {
    const key = `${host.hostId}:${host.ssh}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safeId(value) {
  return String(value || "host").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "host";
}

function timestampId(value) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "z").toLowerCase();
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (options.loopMinutes > 0) {
    loop(options);
  } else {
    runOnce(options);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
