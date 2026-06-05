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
    targetHost: process.env.TURBALANCE_TARGET_HOST || defaultTargetHost,
    remoteRoot: process.env.TURBALANCE_REMOTE_ROOT || "/opt/turbalance/Analytics",
    nativeBuildMode: process.env.TURBALANCE_EBPF_NATIVE_BUILD_MODE || "prebuilt",
    namespace: process.env.TURBALANCE_NAMESPACE || "turbalance-lakehouse",
    outDir: process.env.TURBALANCE_GAP_REPORT_DIR || path.join("build", "lakehouse-production-gaps"),
    includeConsul: false,
    allowExample: false,
    liveTargetHost: false,
    liveClusterPrereqs: false,
    installClusterPrereqs: false,
    strictTargetHost: true
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--include-consul") args.includeConsul = true;
    else if (arg === "--allow-example") args.allowExample = true;
    else if (arg === "--live-target-host") args.liveTargetHost = true;
    else if (arg === "--live-cluster-prereqs") args.liveClusterPrereqs = true;
    else if (arg === "--install-cluster-prereqs") {
      args.installClusterPrereqs = true;
      args.liveClusterPrereqs = true;
    }
    else if (arg === "--non-strict-target-host") args.strictTargetHost = false;
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
  console.log(`Usage: scripts/report-lakehouse-production-gaps.js [--env-file <file>] [--values-file <json>] [--target-host user@host] [--remote-root <path>] [--native-build-mode prebuilt|host|container] [--namespace <ns>] [--out-dir <dir>] [--live-target-host] [--live-cluster-prereqs] [--non-strict-target-host]

Creates a concise missing-material report for the real production activation checklist.`);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 60 * 1024 * 1024
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

function requireJson(result) {
  if (!result.ok && !result.stdout) throw new Error(`${result.command} failed\n${result.stderr}`);
  return result.stdout;
}

function summarizeChecks(prefix, report, checks = []) {
  for (const check of report?.checks || []) {
    if (!check.passed && check.severity === "error") checks.push({ source: prefix, name: check.name, detail: check.detail, severity: "error" });
    if (!check.passed && check.severity === "warning") checks.push({ source: prefix, name: check.name, detail: check.detail, severity: "warning" });
  }
  return checks;
}

function targetHostActions(hostPrep) {
  const actions = [];
  if (hostPrep?.status === "dry-run") {
    actions.push(`Run target-host preparation with --sync --validate for ${hostPrep.targetHost || defaultTargetHost} at ${hostPrep.remoteRoot || "/opt/turbalance/Analytics"}`);
    return actions;
  }
  const output = hostPrep?.results?.find((item) => item.step === "ssh-probe")?.parsed || {};
  if (output.repo === "missing") actions.push(`Sync repository to ${hostPrep.remoteRoot || "/opt/turbalance/Analytics"} on target host`);
  if (output.clang === "missing" && hostPrep?.nativeBuildMode === "host") actions.push("Install clang/LLVM because native eBPF build mode is host");
  return actions;
}

function materialActions(secretMaterial) {
  return (secretMaterial?.groups || [])
    .filter((group) => group.required && !group.satisfied)
    .map((group) => `Provide ${group.remoteKey}: ${group.alternatives.map((item) => item.detail).join(" or ")}`);
}

function imageActions(imageRelease) {
  const actions = [];
  if (imageRelease?.dryRun) actions.push("Run image release with --build --push against the approved registry");
  const signatureStage = imageRelease?.stages?.find((stage) => stage.name === "image-signatures");
  if (signatureStage?.status === "dry-run") actions.push("Run cosign signing and verification with --sign --verify after digest lock is available");
  return actions;
}

function workstationActions(workstation) {
  const actions = [];
  const missingTools = (workstation?.checks || [])
    .filter((check) => check.name?.startsWith("tool.") && !check.passed && check.severity === "error")
    .map((check) => check.name.replace("tool.", ""));
  if (missingTools.length) actions.push(`Install operator workstation tools: ${missingTools.join(", ")}`);
  if ((workstation?.checks || []).some((check) => check.name === "docker.daemon" && !check.passed)) actions.push("Start Docker daemon before image build/push");
  if ((workstation?.checks || []).some((check) => check.name === "docker.buildx" && !check.passed)) actions.push("Install or enable Docker Buildx before image build/push");
  if (workstation?.manualActions?.length) {
    for (const action of workstation.manualActions) {
      if (action.includes("Docker daemon") && actions.some((item) => item.includes("Docker daemon"))) continue;
      actions.push(action);
    }
  }
  return actions;
}

function screenshotActions(prep) {
  if (prep?.status === "missing") return ["Install Playwright with node scripts/prepare-screenshot-qa.js --install --browsers before enforcing screenshot QA"];
  return [];
}

function clusterPrereqActions(report) {
  if (report?.status === "planned") return [];
  const missing = (report?.checks || [])
    .filter((check) => !check.passed && (check.name?.startsWith("crd.") || check.name?.startsWith("controller.")))
    .map((check) => check.detail);
  if (!missing.length) return [];
  return [`Install Kubernetes add-on prerequisites with scripts/prepare-lakehouse-cluster-prereqs.js --install --wait (${missing.join("; ")})`];
}

function markdown(report) {
  const lines = [
    "# turbalance Lakehouse Production Gap Report",
    "",
    `- Status: ${report.status}`,
    `- Target host: ${report.targetHost}`,
    `- Env file: ${report.envFile}`,
    `- Values file: ${report.valuesFile}`,
    "",
    "## Required Actions",
    ""
  ];
  if (!report.requiredActions.length) lines.push("- None from non-mutating checks");
  for (const item of report.requiredActions) lines.push(`- ${item}`);
  if (report.warnings.length) {
    lines.push("", "## Warnings", "");
    for (const warning of report.warnings) lines.push(`- ${warning.source}.${warning.name}: ${warning.detail}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function write(outDir, report) {
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, "production-gaps.json");
  const markdownPath = path.join(outDir, "production-gaps.md");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(markdownPath, markdown(report), "utf8");
  process.stdout.write(`${JSON.stringify({ ...report, artifacts: { report: reportPath, markdown: markdownPath } }, null, 2)}\n`);
}

function main() {
  const args = parseArgs(process.argv);
  const outDir = path.resolve(root, args.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const secretMaterial = requireJson(run(process.execPath, [
    "scripts/validate-lakehouse-secret-material.js",
    "--env-file",
    args.envFile,
    "--values",
    args.valuesFile,
    "--out",
    path.join(outDir, "secret-material.json"),
    ...(args.includeConsul ? ["--include-consul"] : []),
    ...(args.allowExample ? ["--allow-placeholders"] : [])
  ]));
  const hostPrep = requireJson(run(process.execPath, [
    "scripts/prepare-lakehouse-target-host.js",
    "--target-host",
    args.targetHost,
    "--remote-root",
    args.remoteRoot,
    "--native-build-mode",
    args.nativeBuildMode,
    ...(args.liveTargetHost ? ["--validate"] : ["--dry-run"]),
    ...(args.strictTargetHost ? [] : ["--non-strict"]),
    "--out",
    path.join(outDir, "target-host.json")
  ]));
  const imageRelease = requireJson(run(process.execPath, [
    "scripts/run-lakehouse-image-release.js",
    "--env-file",
    args.envFile,
    "--dry-run",
    "--out-dir",
    path.join(outDir, "image-release")
  ]));
  const workstationPrep = requireJson(run(process.execPath, [
    "scripts/prepare-lakehouse-operator-workstation.js",
    "--env-file",
    args.envFile,
    "--out",
    path.join(outDir, "operator-workstation.json")
  ]));
  const screenshotPrep = requireJson(run(process.execPath, [
    "scripts/prepare-screenshot-qa.js",
    "--out",
    path.join(outDir, "screenshot-qa-prep.json")
  ]));
  const clusterPrereqs = requireJson(run(process.execPath, [
    "scripts/prepare-lakehouse-cluster-prereqs.js",
    "--namespace",
    args.namespace,
    "--out",
    path.join(outDir, "cluster-prerequisites.json"),
    ...(args.liveClusterPrereqs ? ["--run-live-checks"] : []),
    ...(args.installClusterPrereqs ? ["--install", "--wait"] : [])
  ]));
  const issues = [];
  summarizeChecks("secret-material", secretMaterial, issues);
  const warnings = issues.filter((item) => item.severity === "warning");
  const requiredActions = [
    ...materialActions(secretMaterial),
    ...targetHostActions(hostPrep),
    ...workstationActions(workstationPrep),
    ...imageActions(imageRelease),
    ...screenshotActions(screenshotPrep),
    ...clusterPrereqActions(clusterPrereqs)
  ];
  const uniqueActions = [...new Set(requiredActions)];
  const report = {
    status: uniqueActions.length ? "action-required" : "ready",
    targetHost: args.targetHost,
    remoteRoot: args.remoteRoot,
    nativeBuildMode: args.nativeBuildMode,
    targetHostMode: args.liveTargetHost ? "live" : "dry-run",
    targetHostStrict: args.strictTargetHost,
    namespace: args.namespace,
    envFile: args.envFile,
    valuesFile: args.valuesFile,
    requiredActions: uniqueActions,
    warnings,
    reports: {
      secretMaterial,
      targetHost: hostPrep,
      workstationPrep,
      imageRelease,
      screenshotPrep,
      clusterPrereqs
    }
  };
  write(outDir, report);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
