#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const args = parseArgs(process.argv.slice(2));
const root = path.join(__dirname, "..");
const pilotConfigPath = args.config || args["pilot-config"] || process.env.TURBALANCE_PILOT_CONFIG || path.join(root, "ops", "pilot-provider.config.example.json");
const sourceContractsPath = args.contracts || args["source-contracts"] || process.env.TURBALANCE_SOURCE_CONTRACTS || "";
const sourceApprovalsPath = args.approvals || args["source-approvals"] || process.env.TURBALANCE_SOURCE_APPROVALS || "";
const inputDir = args["input-dir"] || process.env.TURBALANCE_EXPORT_INPUT_DIR || path.join(root, "fixtures", "provider-pilot-export-inputs");
const outDir = path.resolve(args["out-dir"] || process.env.TURBALANCE_GO_LIVE_OUT_DIR || path.join(root, "build", "provider-go-live"));
const allowExample = Boolean(args["allow-example"] || process.env.TURBALANCE_ALLOW_EXAMPLE_CONFIG);
const skipContracts = Boolean(args["skip-contracts"] || process.env.TURBALANCE_SKIP_SOURCE_CONTRACTS || !sourceContractsPath);
const skipBurnIn = Boolean(args["skip-burn-in"] || process.env.TURBALANCE_SKIP_BURN_IN);
const pushImage = Boolean(args["push-image"] || process.env.TURBALANCE_IMAGE_PUSH);
const iterations = args.iterations || process.env.TURBALANCE_BURN_IN_ITERATIONS || "1";
const ingestUrl = args["ingest-url"] || process.env.TURBALANCE_INGEST_URL || "";
const token = args.token || process.env.TURBALANCE_INGEST_TOKEN || "";
const tenant = args.tenant || process.env.TURBALANCE_INGEST_TENANT || "";

fs.mkdirSync(outDir, { recursive: true });

try {
  const readiness = runJson([
    "scripts/validate-provider-readiness.js",
    "--config",
    pilotConfigPath,
    "--out",
    path.join(outDir, "readiness.json"),
    ...(sourceContractsPath ? ["--source-contracts", sourceContractsPath] : []),
    ...(sourceApprovalsPath ? ["--source-approvals", sourceApprovalsPath] : []),
    ...(allowExample ? ["--allow-example"] : [])
  ]);

  const image = runJson([
    "scripts/build-publish-ingestion-image.js",
    "--config",
    pilotConfigPath,
    ...(pushImage ? ["--push"] : ["--dry-run"])
  ]);

  runNode([
    "scripts/render-managed-kubernetes.js",
    "--config",
    pilotConfigPath,
    "--out",
    path.join(outDir, "managed-kubernetes.yaml")
  ]);

  let contracts = null;
  let approvals = null;
  if (!skipContracts) {
    approvals = runJson([
      "scripts/validate-source-approvals.js",
      "--contracts",
      sourceContractsPath,
      "--approvals",
      sourceApprovalsPath,
      "--out",
      path.join(outDir, "source-approvals.json")
    ]);
    contracts = runJson([
      "scripts/validate-source-contracts.js",
      "--config",
      sourceContractsPath,
      "--out-dir",
      path.join(outDir, "source-contracts")
    ]);
  }

  let burnIn = null;
  if (!skipBurnIn) {
    burnIn = runJson([
      "scripts/run-live-pilot-burn-in.js",
      ...(sourceContractsPath && !skipContracts ? ["--contracts", sourceContractsPath] : ["--input-dir", inputDir]),
      "--iterations",
      iterations,
      "--out-dir",
      path.join(outDir, "burn-in"),
      ...(ingestUrl ? ["--ingest-url", ingestUrl] : []),
      ...(token ? ["--token", token] : []),
      ...(tenant ? ["--tenant", tenant] : [])
    ]);
  }

  const report = {
    ok: readiness.ok && image.ok && (!approvals || approvals.ok) && (!contracts || contracts.ok) && (!burnIn || burnIn.ok),
    outDir,
    readiness,
    image,
    approvals,
    contracts,
    burnIn,
    artifacts: {
      readiness: path.join(outDir, "readiness.json"),
      manifests: path.join(outDir, "managed-kubernetes.yaml"),
      approvals: approvals ? path.join(outDir, "source-approvals.json") : "",
      report: path.join(outDir, "go-live-report.json"),
      markdown: path.join(outDir, "go-live-report.md")
    }
  };

  fs.writeFileSync(report.artifacts.report, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(report.artifacts.markdown, markdownReport(report));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exit(1);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

function runJson(commandArgs) {
  const result = runNode(commandArgs);
  return JSON.parse(result.stdout);
}

function runNode(commandArgs) {
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`${commandArgs.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function markdownReport(report) {
  const lines = [
    "# turbalance Provider Go-Live Report",
    "",
    `- Status: ${report.ok ? "PASS" : "FAIL"}`,
    `- Output directory: ${report.outDir}`,
    `- Readiness checks: ${report.readiness.summary.passed} passed, ${report.readiness.summary.warnings} warnings, ${report.readiness.summary.failed} failed`,
    `- Image: ${report.image.image}`,
    `- Image push: ${report.image.pushed ? "yes" : "no"}`,
    `- Source approvals: ${report.approvals ? "validated" : "skipped"}`,
    `- Source contracts: ${report.contracts ? "validated" : "skipped"}`,
    `- Burn-in: ${report.burnIn ? `${report.burnIn.runs.length} iteration(s)` : "skipped"}`,
    "",
    "## Artifacts",
    "",
    `- Managed manifests: ${report.artifacts.manifests}`,
    ...(report.artifacts.approvals ? [`- Source approvals: ${report.artifacts.approvals}`] : []),
    `- JSON report: ${report.artifacts.report}`,
    `- Readiness report: ${report.artifacts.readiness}`,
    ""
  ];

  if (report.burnIn) {
    lines.push("## Burn-In Runs", "");
    report.burnIn.runs.forEach((run) => {
      lines.push(`- Iteration ${run.iteration}: ${run.bundlePath} (${run.runIds.length} run IDs)`);
    });
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
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
