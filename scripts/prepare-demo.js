#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args["out-dir"] || process.env.TURBALANCE_DEMO_OUT_DIR || path.join(root, "build", "demo"));
const requireScreenshots = Boolean(args["require-screenshots"] || process.env.TURBALANCE_SCREENSHOT_QA_REQUIRED === "1");
const runScreenshots = Boolean(args.screenshots || requireScreenshots || process.env.TURBALANCE_DEMO_SCREENSHOTS);

fs.mkdirSync(outDir, { recursive: true });

const artifacts = {};
const checks = [];

try {
  artifacts.providerOverlay = writeCommandOutput({
    id: "artifacts.provider_overlay",
    label: "Provider commercial overlay generated",
    commandArgs: ["scripts/build-provider-overlay.js", "fixtures/provider-export-inputs"],
    outputPath: path.join(outDir, "provider-overlay.json")
  });

  artifacts.schedulerOverlay = writeCommandOutput({
    id: "artifacts.scheduler_overlay",
    label: "Scheduler evidence overlay generated",
    commandArgs: ["scripts/build-scheduler-overlay.js", "fixtures/scheduler-export-inputs"],
    outputPath: path.join(outDir, "scheduler-overlay.json")
  });

  artifacts.ebpfOverlay = writeCommandOutput({
    id: "artifacts.ebpf_overlay",
    label: "Linux eBPF host overlay generated",
    commandArgs: ["scripts/build-ebpf-overlay.js", "fixtures/ebpf-export-inputs"],
    outputPath: path.join(outDir, "ebpf-overlay.json")
  });

  artifacts.providerPilotBundle = writeCommandOutput({
    id: "artifacts.provider_pilot_bundle",
    label: "All-lanes provider pilot source bundle generated",
    commandArgs: ["scripts/build-provider-pilot-bundle.js", "fixtures/provider-pilot-export-inputs"],
    outputPath: path.join(outDir, "provider-pilot-bundle.json")
  });

  artifacts.liveMachineBundle = path.join(outDir, "live-machine-bundle.json");
  runCommand({
    id: "artifacts.live_machine_bundle",
    label: "Local machine source bundle generated",
    commandArgs: [
      "scripts/collect-local-machine-bundle.js",
      "--out",
      artifacts.liveMachineBundle,
      "--host-url",
      args["host-url"] || process.env.TURBALANCE_MACHINE_DEMO_URL || "http://192.168.10.101:8000"
    ]
  });
  checks.push({
    id: "artifacts.live_machine_bundle.written",
    ok: fs.existsSync(artifacts.liveMachineBundle) && fs.statSync(artifacts.liveMachineBundle).size > 0,
    severity: "error",
    message: "Local machine source bundle artifact written"
  });

  const sourceExportValidation = runJson({
    id: "validation.source_export_bundles",
    label: "Demo source-export bundles validate against schemas",
    commandArgs: [
      "scripts/validate-source-bundle.js",
      "--json",
      "--require-source-export",
      "fixtures/external-source-bundle.json",
      "fixtures/neo-cloud-provider-bundle.json",
      artifacts.providerPilotBundle
    ]
  });
  const liveMachineValidation = runJson({
    id: "validation.live_machine_bundle",
    label: "Strict live-machine ingestion bundle validates without synthetic source exports",
    commandArgs: [
      "scripts/validate-source-bundle.js",
      "--json",
      artifacts.liveMachineBundle
    ]
  });
  const validation = {
    ok: sourceExportValidation.ok && liveMachineValidation.ok,
    reports: [
      ...sourceExportValidation.reports,
      ...liveMachineValidation.reports
    ]
  };
  artifacts.sourceBundleValidation = path.join(outDir, "source-bundle-validation.json");
  fs.writeFileSync(artifacts.sourceBundleValidation, `${JSON.stringify(validation, null, 2)}\n`);

  const readiness = runJson({
    id: "validation.sandbox_readiness",
    label: "Strict sandbox provider readiness passes",
    commandArgs: [
      "scripts/validate-provider-readiness.js",
      "--config",
      "ops/pilot-provider.sandbox.json",
      "--source-contracts",
      "ops/source-contracts.sandbox.json",
      "--source-approvals",
      "ops/source-approvals.sandbox.json",
      "--out",
      path.join(outDir, "provider-readiness.json")
    ]
  });
  artifacts.providerReadiness = readinessPath(readiness, path.join(outDir, "provider-readiness.json"));

  artifacts.managedKubernetes = writeCommandOutput({
    id: "artifacts.managed_kubernetes",
    label: "Managed Kubernetes manifests render from sandbox config",
    commandArgs: [
      "scripts/render-managed-kubernetes.js",
      "--config",
      "ops/pilot-provider.sandbox.json"
    ],
    outputPath: path.join(outDir, "managed-kubernetes.yaml")
  });

  const imageDryRun = runJson({
    id: "validation.image_dry_run",
    label: "Provider ingestion image build command resolves",
    commandArgs: [
      "scripts/build-publish-ingestion-image.js",
      "--config",
      "ops/pilot-provider.sandbox.json",
      "--dry-run"
    ]
  });
  artifacts.imageDryRun = path.join(outDir, "provider-image-dry-run.json");
  fs.writeFileSync(artifacts.imageDryRun, `${JSON.stringify(imageDryRun, null, 2)}\n`);

  if (runScreenshots) {
    const screenshot = runCommand({
      id: "validation.screenshot_qa",
      label: requireScreenshots ? "Screenshot QA passes with browser automation" : "Screenshot QA completed or skipped cleanly",
      commandArgs: ["scripts/run-screenshot-qa.js"],
      env: {
        ...(requireScreenshots ? { TURBALANCE_SCREENSHOT_QA_REQUIRED: "1" } : {})
      }
    });
    artifacts.screenshotQa = path.join(outDir, "screenshot-qa.txt");
    fs.writeFileSync(artifacts.screenshotQa, `${screenshot.stdout}${screenshot.stderr}`);
  } else {
    checks.push({
      id: "validation.screenshot_qa",
      ok: true,
      severity: "warning",
      message: "Screenshot QA was not requested; run with --screenshots or --require-screenshots before sharing a visual demo."
    });
  }

  const report = buildReport();
  artifacts.reportJson = path.join(outDir, "demo-readiness.json");
  artifacts.reportMarkdown = path.join(outDir, "demo-readiness.md");
  fs.writeFileSync(artifacts.reportJson, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(artifacts.reportMarkdown, markdownReport(report));

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exit(1);
} catch (error) {
  const report = buildReport(error);
  fs.writeFileSync(path.join(outDir, "demo-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, "demo-readiness.md"), markdownReport(report));
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

function writeCommandOutput({ id, label, commandArgs, outputPath }) {
  const result = runCommand({ id, label, commandArgs });
  fs.writeFileSync(outputPath, result.stdout);
  checks.push({
    id: `${id}.written`,
    ok: fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0,
    severity: "error",
    message: `${label} artifact written`
  });
  return outputPath;
}

function runJson({ id, label, commandArgs }) {
  const result = runCommand({ id, label, commandArgs });
  return JSON.parse(result.stdout);
}

function runCommand({ id, label, commandArgs, env = {} }) {
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env
    },
    maxBuffer: 50 * 1024 * 1024
  });

  const ok = result.status === 0;
  checks.push({
    id,
    ok,
    severity: "error",
    message: label,
    command: `node ${commandArgs.join(" ")}`
  });
  if (!ok) {
    throw new Error(`${commandArgs.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function buildReport(error = null) {
  const failed = checks.filter((check) => !check.ok && check.severity !== "warning");
  const warnings = checks.filter((check) => !check.ok || check.severity === "warning").filter((check) => check.severity === "warning");
  return {
    ok: failed.length === 0 && !error,
    generatedAt: new Date().toISOString(),
    outDir,
    summary: {
      passed: checks.filter((check) => check.ok && check.severity !== "warning").length,
      warnings: warnings.length,
      failed: failed.length + (error ? 1 : 0)
    },
    checks,
    artifacts,
    demoPath: {
      localStaticServer: "python3 -m http.server 8000",
      localUrl: "http://127.0.0.1:8000/",
      primaryDataset: "fixtures/neo-cloud-provider-bundle.json",
      generatedProviderBundle: artifacts.providerPilotBundle || "",
      liveMachineBundle: artifacts.liveMachineBundle || ""
    },
    hardware: {
      demo: "Laptop or small VM is enough for the offline dashboard and generated telemetry bundles.",
      integration: "One Linux NVIDIA GPU node is enough for smoke testing DCGM/Prometheus/Kubernetes exports.",
      realisticPilot: "Two to four or more GPU nodes are recommended for scheduler placement, topology, queue, and multi-tenant behavior.",
      mig: "A100/H100-class MIG-capable hardware is useful only if the demo includes MIG partitioning or isolation policy."
    },
    nvidiaSchedulerPosition: "Do not claim SM scheduler replacement. The practical control surface is kernel/workload design plus cluster-level placement, batching, streams, MPS, MIG, admission, and topology-aware scheduling.",
    caveats: [
      "The demo is offline-first unless a provider grants staging source-system access.",
      "Do not claim live cluster or billing connectivity unless source contracts and approvals point at real provider staging systems.",
      "Run screenshot QA with Playwright before sharing screenshots after any layout change."
    ],
    error: error ? error.message : ""
  };
}

function markdownReport(report) {
  const lines = [
    "# turbalance Analytics Demo Readiness",
    "",
    `- Status: ${report.ok ? "PASS" : "FAIL"}`,
    `- Generated: ${report.generatedAt}`,
    `- Output directory: ${report.outDir}`,
    `- Checks: ${report.summary.passed} passed, ${report.summary.warnings} warnings, ${report.summary.failed} failed`,
    "",
    "## Demo Path",
    "",
    `- Local server: \`${report.demoPath.localStaticServer}\``,
    `- Local URL: ${report.demoPath.localUrl}`,
    `- Primary dataset: \`${report.demoPath.primaryDataset}\``,
    `- Generated provider bundle: \`${report.demoPath.generatedProviderBundle}\``,
    `- Live machine bundle: \`${report.demoPath.liveMachineBundle}\``,
    "",
    "## Artifacts",
    "",
    ...Object.entries(report.artifacts).map(([name, artifactPath]) => `- ${name}: \`${artifactPath}\``),
    "",
    "## Hardware Notes",
    "",
    `- Demo: ${report.hardware.demo}`,
    `- Integration: ${report.hardware.integration}`,
    `- Realistic pilot: ${report.hardware.realisticPilot}`,
    `- MIG: ${report.hardware.mig}`,
    "",
    "## NVIDIA SM Scheduler Position",
    "",
    report.nvidiaSchedulerPosition,
    "",
    "## Caveats",
    "",
    ...report.caveats.map((caveat) => `- ${caveat}`),
    ""
  ];

  if (report.error) {
    lines.push("## Error", "", report.error, "");
  }

  return `${lines.join("\n")}\n`;
}

function readinessPath(readiness, fallbackPath) {
  return readiness?.pilotConfigPath ? fallbackPath : fallbackPath;
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
