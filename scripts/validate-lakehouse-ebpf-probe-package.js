#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

function parseArgs(argv) {
  const args = {
    manifest: "agents/ebpf-agent/probes/probe-manifest.json",
    out: "",
    skipProbeRun: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--skip-probe-run") {
      args.skipProbeRun = true;
    } else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (!(key in args)) throw new Error(`Unknown argument ${arg}`);
      args[key] = need(arg, next);
      index += 1;
    } else {
      throw new Error(`Unexpected argument ${arg}`);
    }
  }
  return args;
}

function need(flag, value) {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: scripts/validate-lakehouse-ebpf-probe-package.js [--manifest <json>] [--out <file>]

Validates the eBPF agent probe manifest and contract-runs metric-emitting probe commands unless --skip-probe-run is set.`);
}

function check(name, passed, detail, severity = "error") {
  return { name, passed: Boolean(passed), detail, severity };
}

function executable(file) {
  try {
    return Boolean(fs.statSync(file).mode & 0o111);
  } catch {
    return false;
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 5 * 1024 * 1024
  });
  return {
    command: [command, ...args].join(" "),
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error ? result.error.message : ""
  };
}

function parseMetricLines(stdout) {
  const metrics = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [name, value, extra] = trimmed.split("=");
    if (!name || value === undefined || extra !== undefined) continue;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;
    metrics.push({ name, value: numeric });
  }
  return metrics;
}

function validateProbeRuns(probes) {
  const results = [];
  const checks = [];
  for (const probe of probes.filter((item) => item.command)) {
    const commandPath = path.resolve(root, probe.command);
    const result = run(commandPath, []);
    const metrics = parseMetricLines(result.stdout || "");
    results.push({ probe: probe.name, ...result, metrics });
    checks.push(check(`probe.${probe.name}.runs`, result.ok, `${probe.command} exits 0`));
    checks.push(check(`probe.${probe.name}.metrics`, metrics.length > 0, `${probe.command} emits metric.name=value lines`));
    for (const metric of probe.metrics || []) {
      checks.push(
        check(
          `probe.${probe.name}.metric.${metric}`,
          metrics.some((item) => item.name === metric),
          `${probe.command} emits ${metric}`
        )
      );
    }
  }
  return { checks, results };
}

function write(out, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(root, out)), { recursive: true });
    fs.writeFileSync(path.resolve(root, out), body, "utf8");
  }
  process.stdout.write(body);
}

function main() {
  const options = parseArgs(process.argv);
  const manifestPath = path.resolve(root, options.manifest);
  const checks = [
    check("manifest.exists", fs.existsSync(manifestPath), `${options.manifest} exists`),
    check("agent.cargo", fs.existsSync(path.join(root, "agents/ebpf-agent/Cargo.toml")), "Rust agent Cargo.toml exists"),
    check("agent.source", fs.existsSync(path.join(root, "agents/ebpf-agent/src/main.rs")), "Rust agent source exists"),
    check("agent.dockerfile", fs.existsSync(path.join(root, "deploy/docker/Dockerfile.ebpf-agent")), "agent Dockerfile exists"),
    check("kubernetes.daemonset", fs.existsSync(path.join(root, "ops/kubernetes/lakehouse-agent-daemonset.yaml")), "agent DaemonSet exists")
  ];
  let manifest = null;
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    checks.push(check("manifest.schema", manifest.schemaVersion === "turba.ebpf.probe_manifest.v1", "manifest schema version is current"));
    checks.push(check("manifest.probes", Array.isArray(manifest.probes) && manifest.probes.length >= 5, "manifest includes probe entries"));
    const probes = Array.isArray(manifest.probes) ? manifest.probes : [];
    for (const probe of probes) {
      checks.push(check(`probe.${probe.name}.name`, Boolean(probe.name), "probe has a name"));
      checks.push(check(`probe.${probe.name}.type`, Boolean(probe.type), "probe has a type"));
      if (probe.command) {
        const commandPath = path.resolve(root, probe.command);
        checks.push(check(`probe.${probe.name}.command.exists`, fs.existsSync(commandPath), `${probe.command} exists`));
        checks.push(check(`probe.${probe.name}.command.executable`, executable(commandPath), `${probe.command} is executable`));
      }
      if (probe.type === "rollout-boundary") {
        checks.push(check(`probe.${probe.name}.boundary`, Boolean(probe.nativeProgramBoundary), "rollout boundary names native program handoff"));
        checks.push(check(`probe.${probe.name}.required_metrics`, Array.isArray(probe.requiredMetrics) && probe.requiredMetrics.length > 0, "rollout boundary has required metrics"));
      }
      if (probe.type === "native-program-package") {
        for (const key of ["source", "loader", "build"]) {
          const file = probe[key];
          checks.push(check(`probe.${probe.name}.${key}.exists`, Boolean(file) && fs.existsSync(path.resolve(root, file)), `${key} ${file || ""} exists`));
        }
        const source = probe.source ? fs.readFileSync(path.resolve(root, probe.source), "utf8") : "";
        const loader = probe.loader ? fs.readFileSync(path.resolve(root, probe.loader), "utf8") : "";
        checks.push(check(`probe.${probe.name}.tracepoints`, ["sched_switch", "tcp_retransmit_skb", "block_rq_complete"].every((item) => source.includes(item)), "native BPF source includes scheduler, network, and block tracepoints"));
        checks.push(check(`probe.${probe.name}.counters_map`, source.includes("BPF_MAP_TYPE_ARRAY") && source.includes("counters"), "native BPF source exposes counters map"));
        checks.push(check(`probe.${probe.name}.loader_contract`, loader.includes("metric_names") && loader.includes("printf(\"%s=%llu"), "native loader emits metric.name=value lines"));
      }
    }
    if (!options.skipProbeRun) {
      const probeRuns = validateProbeRuns(probes);
      checks.push(...probeRuns.checks);
      manifest.probeRunResults = probeRuns.results;
    }
  }

  const failed = checks.filter((item) => !item.passed && item.severity === "error");
  write(options.out, {
    status: failed.length ? "failed" : "ok",
    manifest: options.manifest,
    checks,
    probeRunResults: manifest?.probeRunResults || []
  });
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
