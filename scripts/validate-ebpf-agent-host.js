#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

function parseArgs(argv) {
  const args = {
    probeCommand: process.env.TURBALANCE_EBPF_PROBE_COMMAND || "",
    nativeBuildMode: process.env.TURBALANCE_EBPF_NATIVE_BUILD_MODE || "prebuilt",
    strict: false,
    contractOnly: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--probe-command") {
      if (!next || next.startsWith("--")) throw new Error("--probe-command requires a value");
      args.probeCommand = next;
      index += 1;
    } else if (arg === "--native-build-mode") {
      if (!next || next.startsWith("--")) throw new Error("--native-build-mode requires a value");
      args.nativeBuildMode = next;
      index += 1;
    } else if (arg === "--strict") {
      args.strict = true;
    } else if (arg === "--contract-only") {
      args.contractOnly = true;
    } else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: scripts/validate-ebpf-agent-host.js [--probe-command <cmd>] [--strict] [--native-build-mode prebuilt|host|container]

Checks Linux/eBPF host prerequisites and validates that TURBALANCE_EBPF_PROBE_COMMAND emits metric.name=value lines.

Use --contract-only in CI to validate the command output format without requiring a Linux eBPF host.`);
}

function exists(file) {
  return fs.existsSync(file);
}

function commandAvailable(command) {
  return spawnSync("sh", ["-lc", `command -v ${quote(command)}`], { encoding: "utf8" }).status === 0;
}

function quote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function checkHost(args) {
  if (!["prebuilt", "host", "container"].includes(args.nativeBuildMode)) throw new Error("--native-build-mode must be prebuilt, host, or container");
  const platform = os.platform();
  const linux = platform === "linux";
  if (args.contractOnly) {
    const probe = args.probeCommand ? validateProbeCommand(args.probeCommand) : { configured: false, metrics: [], error: "probe command is required" };
    return {
      status: probe.metrics.length > 0 && !probe.error ? "ready" : "not-ready",
      strict: false,
      contractOnly: true,
      host: {
        platform,
        release: os.release(),
        arch: os.arch()
      },
      checks: [
        {
          name: "probe_command_contract",
          passed: probe.metrics.length > 0 && !probe.error,
          detail: probe.error || `${probe.metrics.length} metric lines parsed`
        }
      ],
      probe
    };
  }
  const checks = [
    {
      name: "linux_kernel",
      passed: linux,
      detail: linux ? os.release() : `${platform} cannot load Linux eBPF programs`
    },
    {
      name: "bpffs_mounted",
      passed: linux && exists("/sys/fs/bpf"),
      detail: "/sys/fs/bpf"
    },
    {
      name: "tracingfs_mounted",
      passed: linux && (exists("/sys/kernel/tracing") || exists("/sys/kernel/debug/tracing")),
      detail: "/sys/kernel/tracing or /sys/kernel/debug/tracing"
    },
    {
      name: "cgroup_v2",
      passed: linux && exists("/sys/fs/cgroup/cgroup.controllers"),
      detail: "/sys/fs/cgroup/cgroup.controllers"
    },
    {
      name: "bpftool_available",
      passed: commandAvailable("bpftool"),
      detail: "bpftool is useful for pinned map/program inspection"
    },
    {
      name: "clang_available",
      passed: commandAvailable("clang"),
      detail: args.nativeBuildMode === "host" ? "clang is required when building CO-RE/libbpf probes on host" : "clang is optional when probes are built as prebuilt/containerized artifacts"
    }
  ];
  const probe = args.probeCommand ? validateProbeCommand(args.probeCommand) : { configured: false, metrics: [], error: "" };
  if (args.probeCommand) {
    checks.push({
      name: "probe_command_contract",
      passed: probe.metrics.length > 0 && !probe.error,
      detail: probe.error || `${probe.metrics.length} metric lines parsed`
    });
  }
  const requiredWhenStrict = new Set(["linux_kernel", "bpffs_mounted", "tracingfs_mounted", "cgroup_v2", "bpftool_available", "probe_command_contract"]);
  if (args.nativeBuildMode === "host") requiredWhenStrict.add("clang_available");
  const requiredChecks = args.strict
    ? checks.filter((check) => requiredWhenStrict.has(check.name))
    : checks.filter((check) => ["linux_kernel", "bpffs_mounted", "tracingfs_mounted", "probe_command_contract"].includes(check.name));
  const failedRequired = requiredChecks.filter((check) => !check.passed);
  return {
    status: failedRequired.length ? "not-ready" : "ready",
    strict: args.strict,
    nativeBuildMode: args.nativeBuildMode,
    host: {
      platform,
      release: os.release(),
      arch: os.arch()
    },
    checks,
    probe
  };
}

function validateProbeCommand(command) {
  const result = spawnSync("sh", ["-lc", command], {
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 1024 * 1024
  });
  if (result.error) {
    return { configured: true, metrics: [], error: result.error.message };
  }
  if (result.status !== 0) {
    return { configured: true, metrics: [], error: result.stderr.trim() || `exit ${result.status}` };
  }
  const metrics = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const [name, value, extra] = line.split("=");
    if (!name || value === undefined || extra !== undefined) continue;
    const parsed = Number(value.trim());
    if (!Number.isFinite(parsed)) continue;
    metrics.push({ name: name.trim(), value: parsed });
  }
  return { configured: true, metrics, error: metrics.length ? "" : "no metric.name=value lines were parsed" };
}

try {
  const result = checkHost(parseArgs(process.argv));
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ready") {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
