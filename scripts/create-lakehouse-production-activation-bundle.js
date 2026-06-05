#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const defaultTargetHost = "user@192.168.10.20";

function parseArgs(argv) {
  const args = {
    envFile: process.env.TURBALANCE_LAKEHOUSE_ENV_FILE || "ops/lakehouse-production.env.example",
    valuesFile: process.env.TURBALANCE_LAKEHOUSE_VALUES_FILE || "ops/lakehouse-production.values.example.json",
    hostsFile: process.env.TURBALANCE_EBPF_HOSTS_FILE || "",
    targetHost: process.env.TURBALANCE_TARGET_HOST || defaultTargetHost,
    remoteRoot: process.env.TURBALANCE_REMOTE_ROOT || "/opt/turbalance/Analytics",
    nativeBuildMode: process.env.TURBALANCE_EBPF_NATIVE_BUILD_MODE || "prebuilt",
    outDir: process.env.TURBALANCE_ACTIVATION_BUNDLE_DIR || path.join("build", "lakehouse-production-activation"),
    previousOverlay: process.env.TURBALANCE_PREVIOUS_OVERLAY || "",
    strictSecrets: false,
    includeConsul: false,
    allowExample: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--strict-secrets") args.strictSecrets = true;
    else if (arg === "--include-consul") args.includeConsul = true;
    else if (arg === "--allow-example") args.allowExample = true;
    else if (arg === "--help") {
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
  console.log(`Usage: scripts/create-lakehouse-production-activation-bundle.js [--env-file <file>] [--target-host user@host] [--remote-root <path>] [--native-build-mode prebuilt|host|container] [--out-dir <dir>]

Creates a non-mutating production activation bundle: go-live dry-run, secret material audit, image signature plan, target-host eBPF evidence, and operator handoff Markdown.`);
}

function quote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 80 * 1024 * 1024,
    ...options
  });
  let json = null;
  try {
    json = result.stdout ? JSON.parse(result.stdout) : null;
  } catch {
    json = null;
  }
  return {
    command: [command, ...args].join(" "),
    ok: result.status === 0,
    status: result.status,
    stdout: json || result.stdout,
    stderr: result.stderr
  };
}

function stage(name, fn) {
  try {
    return { name, ok: true, ...fn() };
  } catch (error) {
    return { name, ok: false, error: error.message };
  }
}

function requireJson(result) {
  if (!result.ok) throw new Error(`${result.command} failed\nstdout:\n${JSON.stringify(result.stdout)}\nstderr:\n${result.stderr}`);
  return result.stdout;
}

function writeTargetHosts(outDir, targetHost, remoteRoot, nativeBuildMode) {
  const hosts = {
    hosts: [
      {
        host: targetHost,
        sshCommand: "ssh -o BatchMode=yes -o ConnectTimeout=8",
        validatorCommand: `cd ${quote(remoteRoot)} && node scripts/validate-ebpf-agent-host.js`,
        probeCommand: `${remoteRoot}/agents/ebpf-agent/probes/native-ebpf-readiness.sh`,
        nativeBuildMode,
        strict: true
      }
    ]
  };
  const file = path.join(outDir, "target-hosts.json");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(hosts, null, 2)}\n`, "utf8");
  return file;
}

function markdown(report) {
  const lines = [
    "# turbalance Lakehouse Production Activation Bundle",
    "",
    `- Status: ${report.ok ? "PASS" : "CHECK REQUIRED"}`,
    `- Target host: ${report.targetHost}`,
    `- Env file: ${report.envFile}`,
    `- Values file: ${report.valuesFile}`,
    `- Output directory: ${report.outDir}`,
    "",
    "## Stages",
    ""
  ];
  for (const item of report.stages) {
    lines.push(`- ${item.name}: ${item.ok ? "PASS" : "FAIL"}${item.status ? ` (${item.status})` : ""}`);
  }
  lines.push(
    "",
    "## Live Handoff",
    "",
    `- Review ${report.artifacts.goLiveReport}`,
    `- Review ${report.artifacts.secretMaterial}`,
    `- Review ${report.artifacts.targetHostPrep}`,
    `- Review ${report.artifacts.imageRelease}`,
    `- Review ${report.artifacts.productionGaps}`,
    `- Review ${report.artifacts.imageSignatures}`,
    `- Review ${report.artifacts.targetEbpf}`,
    `- During the approved window, rerun ${report.artifacts.goLiveReport} plan with the required live flags.`,
    ""
  );
  return `${lines.join("\n")}\n`;
}

function writeReport(outDir, report) {
  const reportPath = path.join(outDir, "activation-bundle.json");
  const markdownPath = path.join(outDir, "activation-bundle.md");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(markdownPath, markdown({ ...report, artifacts: { ...report.artifacts, report: reportPath, markdown: markdownPath } }), "utf8");
  return { reportPath, markdownPath };
}

function main() {
  const args = parseArgs(process.argv);
  const outDir = path.resolve(root, args.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const generatedHostsFile = args.hostsFile ? path.resolve(root, args.hostsFile) : writeTargetHosts(outDir, args.targetHost, args.remoteRoot, args.nativeBuildMode);
  const goLiveDir = path.join(outDir, "go-live");
  const stages = [];

  stages.push(stage("secret-material", () => ({
    status: args.strictSecrets ? "strict" : "planned",
    report: requireJson(run(process.execPath, [
      "scripts/validate-lakehouse-secret-material.js",
      "--env-file",
      args.envFile,
      "--values",
      args.valuesFile,
      "--out",
      path.join(outDir, "secret-material.json"),
      ...(args.strictSecrets ? ["--strict"] : []),
      ...(args.includeConsul ? ["--include-consul"] : [])
    ]))
  })));

  stages.push(stage("go-live-dry-run", () => ({
    status: "dry-run",
    report: requireJson(run(process.execPath, [
      "scripts/run-lakehouse-go-live.js",
      "--env-file",
      args.envFile,
      "--values-file",
      args.valuesFile,
      "--out-dir",
      goLiveDir,
      ...(args.previousOverlay ? ["--previous-overlay", args.previousOverlay] : []),
      ...(args.allowExample ? ["--allow-example"] : [])
    ]))
  })));

  stages.push(stage("target-host-prep", () => ({
    status: "dry-run",
    report: requireJson(run(process.execPath, [
      "scripts/prepare-lakehouse-target-host.js",
      "--target-host",
      args.targetHost,
      "--remote-root",
      args.remoteRoot,
      "--native-build-mode",
      args.nativeBuildMode,
      "--dry-run",
      "--out",
      path.join(outDir, "target-host-prep.json")
    ]))
  })));

  stages.push(stage("image-release", () => ({
    status: "dry-run",
    report: requireJson(run(process.execPath, [
      "scripts/run-lakehouse-image-release.js",
      "--env-file",
      args.envFile,
      "--dry-run",
      "--out-dir",
      path.join(outDir, "image-release")
    ]))
  })));

  stages.push(stage("production-gaps", () => ({
    status: "planned",
    report: requireJson(run(process.execPath, [
      "scripts/report-lakehouse-production-gaps.js",
      "--env-file",
      args.envFile,
      "--values-file",
      args.valuesFile,
      "--target-host",
      args.targetHost,
      "--remote-root",
      args.remoteRoot,
      "--native-build-mode",
      args.nativeBuildMode,
      "--out-dir",
      path.join(outDir, "production-gaps"),
      ...(args.includeConsul ? ["--include-consul"] : []),
      ...(args.allowExample ? ["--allow-example"] : [])
    ]))
  })));

  stages.push(stage("image-signatures", () => ({
    status: "dry-run",
    report: requireJson(run(process.execPath, [
      "scripts/sign-lakehouse-images.js",
      "--env-file",
      args.envFile,
      "--image-lock",
      path.join(goLiveDir, "image-lock.json"),
      "--dry-run",
      "--out",
      path.join(outDir, "image-signatures.json")
    ]))
  })));

  stages.push(stage("target-host-ebpf", () => ({
    status: "dry-run",
    report: requireJson(run(process.execPath, [
      "scripts/collect-lakehouse-ebpf-rollout-evidence.js",
      "--hosts-file",
      generatedHostsFile,
      "--dry-run",
      "--require-strict",
      "--out-dir",
      path.join(outDir, "target-ebpf")
    ]))
  })));

  stages.push(stage("screenshot-qa-prep", () => ({
    status: "planned",
    report: requireJson(run(process.execPath, [
      "scripts/prepare-screenshot-qa.js",
      "--out",
      path.join(outDir, "screenshot-qa-prep.json")
    ]))
  })));

  const report = {
    ok: stages.every((item) => item.ok),
    generatedAt: new Date().toISOString(),
    targetHost: args.targetHost,
    remoteRoot: args.remoteRoot,
    nativeBuildMode: args.nativeBuildMode,
    envFile: args.envFile,
    valuesFile: args.valuesFile,
    hostsFile: path.relative(root, generatedHostsFile).split(path.sep).join("/"),
    outDir,
    stages,
    artifacts: {
      goLiveReport: path.join(goLiveDir, "go-live-report.json"),
      secretMaterial: path.join(outDir, "secret-material.json"),
      targetHostPrep: path.join(outDir, "target-host-prep.json"),
      imageRelease: path.join(outDir, "image-release", "image-release.json"),
      productionGaps: path.join(outDir, "production-gaps", "production-gaps.json"),
      imageSignatures: path.join(outDir, "image-signatures.json"),
      targetEbpf: path.join(outDir, "target-ebpf", "ebpf-rollout-evidence.json"),
      screenshotQaPrep: path.join(outDir, "screenshot-qa-prep.json")
    }
  };
  const artifacts = writeReport(outDir, report);
  process.stdout.write(`${JSON.stringify({ ...report, artifacts: { ...report.artifacts, report: artifacts.reportPath, markdown: artifacts.markdownPath } }, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
