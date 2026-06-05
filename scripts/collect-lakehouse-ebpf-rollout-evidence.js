#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

function parseArgs(argv) {
  const args = {
    hostsFile: process.env.TURBALANCE_EBPF_HOSTS_FILE || "ops/lakehouse-ebpf-hosts.example.json",
    outDir: process.env.TURBALANCE_EBPF_EVIDENCE_DIR || path.join("build", "lakehouse-ebpf-rollout"),
    dryRun: false,
    requireStrict: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--require-strict") {
      args.requireStrict = true;
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
  console.log(`Usage: scripts/collect-lakehouse-ebpf-rollout-evidence.js [--hosts-file <json>] [--dry-run] [--out-dir <dir>]

Runs or plans eBPF fleet validation and writes rollout evidence JSON/Markdown for production signoff.`);
}

function loadHosts(file) {
  const fullPath = path.resolve(root, file);
  const payload = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  if (!Array.isArray(payload.hosts)) throw new Error(`${file} must contain a hosts array`);
  return payload.hosts;
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  let json = null;
  try {
    json = result.stdout ? JSON.parse(result.stdout) : null;
  } catch {
    json = null;
  }
  return {
    command: [process.execPath, ...args].join(" "),
    ok: result.status === 0,
    status: result.status,
    stdout: json || result.stdout,
    stderr: result.stderr
  };
}

function hostChecks(hosts, requireStrict) {
  const checks = [];
  hosts.forEach((host, index) => {
    const label = host.host || `host-${index + 1}`;
    checks.push(check(`host.${label}.probe_command`, Boolean(host.probeCommand), "probe command is configured", requireStrict ? "error" : "warning"));
    checks.push(check(`host.${label}.strict`, Boolean(host.strict), "strict validation is enabled", requireStrict ? "error" : "warning"));
    checks.push(check(`host.${label}.native_build_mode`, ["prebuilt", "container", "host"].includes(host.nativeBuildMode || "prebuilt"), "native build mode is prebuilt, container, or host", "error"));
  });
  return checks;
}

function check(name, passed, detail, severity = "error") {
  return { name, passed: Boolean(passed), detail, severity };
}

function markdown(report) {
  const lines = [
    "# turbalance eBPF Rollout Evidence",
    "",
    `- Status: ${report.ok ? "PASS" : "FAIL"}`,
    `- Hosts file: ${report.hostsFile}`,
    `- Host count: ${report.hosts.length}`,
    `- Mode: ${report.dryRun ? "dry-run" : "live"}`,
    "",
    "## Hosts",
    ""
  ];
  for (const host of report.hosts) {
    lines.push(`- ${host.host || "localhost"}: probe=${host.probeCommand || "missing"}, strict=${host.strict ? "yes" : "no"}, nativeBuildMode=${host.nativeBuildMode || "prebuilt"}`);
  }
  if (report.warnings.length) {
    lines.push("", "## Warnings", "");
    for (const warning of report.warnings) lines.push(`- ${warning.name}: ${warning.detail}`);
  }
  if (report.failures.length) {
    lines.push("", "## Failures", "");
    for (const failure of report.failures) lines.push(`- ${failure.name || "fleet-validation"}: ${failure.detail || failure.error || "failed"}`);
  }
  lines.push("", "## Fleet Validation", "", `- Command: ${report.fleet.command}`, `- Status: ${report.fleet.ok ? "PASS" : "FAIL"}`, "");
  return `${lines.join("\n")}\n`;
}

function write(outDir, payload) {
  const fullDir = path.resolve(root, outDir);
  fs.mkdirSync(fullDir, { recursive: true });
  const jsonPath = path.join(fullDir, "ebpf-rollout-evidence.json");
  const markdownPath = path.join(fullDir, "ebpf-rollout-evidence.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.writeFileSync(markdownPath, markdown(payload));
  process.stdout.write(`${JSON.stringify({ ...payload, artifacts: { json: jsonPath, markdown: markdownPath } }, null, 2)}\n`);
}

function main() {
  const args = parseArgs(process.argv);
  const hosts = loadHosts(args.hostsFile);
  const checks = hostChecks(hosts, args.requireStrict);
  const validationArgs = [
    "scripts/run-ebpf-fleet-validation.js",
    "--hosts-file",
    args.hostsFile,
    "--out",
    path.join(args.outDir, "fleet-validation.json"),
    ...(args.dryRun ? ["--dry-run"] : [])
  ];
  const fleet = runNode(validationArgs);
  const failures = checks.filter((item) => !item.passed && item.severity === "error");
  if (!fleet.ok) failures.push({ name: "fleet.validation", detail: "fleet validation command failed", error: fleet.stderr });
  const warnings = checks.filter((item) => !item.passed && item.severity === "warning");
  const report = {
    ok: failures.length === 0,
    dryRun: args.dryRun,
    hostsFile: args.hostsFile,
    hosts,
    checks,
    warnings,
    failures,
    fleet
  };
  write(args.outDir, report);
  if (!report.ok) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
