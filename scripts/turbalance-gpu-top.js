#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const args = parseArgs(process.argv.slice(2));
const bundlePath = args.bundle || args.input || "";
const watchMs = numberArg(args.watch || args["watch-ms"], 0);

if (watchMs > 0) {
  runWatch();
} else {
  renderOnce();
}

function runWatch() {
  renderOnce();
  setInterval(() => {
    process.stdout.write("\x1Bc");
    renderOnce();
  }, Math.max(1000, watchMs));
}

function renderOnce() {
  const bundle = bundlePath ? readJson(bundlePath) : collectLocalBundle();
  const context = firstRunContext(bundle);
  if (!context) {
    console.error("No ingestion run sourceContext found.");
    process.exitCode = 1;
    return;
  }

  const rows = [
    ["Host", context.hostname || context.node || "unknown"],
    ["GPU", context.gpuName || (context.gpuPresent ? "present" : "not detected")],
    ["Telemetry", [context.gpuSource, context.gpuBackendRequested].filter(Boolean).join(" / ") || "unknown"],
    ["Utilization", percentOrUnknown(context.gpuUtilizationPct)],
    ["Power", wattsOrUnknown(context.gpuPowerWatts)],
    ["Temperature", celsiusOrUnknown(context.gpuTemperatureC)],
    ["Memory", memoryLabel(context)],
    ["GPU Process Inspector", processInspectorLabel(context)],
    ["Thermal Qualification", thermalQualificationLabel(context)],
    ["Topology Fingerprint", topologyLabel(context)]
  ];

  console.log("turbalance GPU top");
  console.log(`Generated: ${context.generatedAt || bundle.metadata?.generatedAt || new Date().toISOString()}`);
  console.log("");
  printTable(rows);

  const processes = Array.isArray(context.gpuComputeProcesses) ? context.gpuComputeProcesses : [];
  if (processes.length > 0) {
    console.log("");
    console.log("Processes");
    printTable([
      ["PID", "GPU", "Memory", "User", "Command"],
      ...processes.slice(0, 12).map((processEntry) => [
        String(processEntry.pid || ""),
        processEntry.gpuUuid || String(processEntry.gpuIndex ?? ""),
        mibOrUnknown(processEntry.usedMemoryMiB),
        processEntry.username || "",
        processEntry.command || processEntry.processName || ""
      ])
    ]);
  }
}

function collectLocalBundle() {
  const result = spawnSync(process.execPath, [
    path.join(__dirname, "collect-local-machine-bundle.js"),
    "--ollama-probe",
    "0",
    "--gpu-diagnostics",
    "1",
    "--skip-validation",
    "1"
  ], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `collect-local-machine-bundle.js exited ${result.status}`);
  }
  return JSON.parse(result.stdout);
}

function firstRunContext(bundle) {
  const run = bundle?.ingestion?.runs?.[0] || bundle?.runs?.[0] || null;
  return run?.sourceContext || null;
}

function printTable(rows) {
  const widths = rows.reduce((acc, row) => row.map((cell, index) => Math.max(acc[index] || 0, String(cell ?? "").length)), []);
  rows.forEach((row) => {
    console.log(row.map((cell, index) => String(cell ?? "").padEnd(widths[index])).join("  "));
  });
}

function processInspectorLabel(context) {
  if (context.gpuComputeProcessQuerySkipped) return "skipped";
  const count = Number(context.gpuProcessCount ?? (context.gpuComputeProcesses || []).length);
  const memory = Number(context.gpuProcessMemoryMiB ?? 0);
  const summary = context.gpuProcessInspectorSummary || "";
  if (summary) return summary;
  return `${Number.isFinite(count) ? count : 0} process(es), ${mibOrUnknown(memory)}`;
}

function thermalQualificationLabel(context) {
  const status = context.gpuThermalQualificationStatus || context.gpuThermalQualification?.status || "unknown";
  const summary = context.gpuThermalQualificationSummary || context.gpuThermalQualification?.summary || "";
  return summary ? `${status}: ${summary}` : status;
}

function topologyLabel(context) {
  const fingerprint = context.gpuTopologyFingerprint || context.gpuTopology?.fingerprint || "";
  const summary = context.gpuTopologySummary || context.gpuTopology?.summary || "";
  return [fingerprint || "none", summary].filter(Boolean).join(" | ");
}

function memoryLabel(context) {
  const used = Number(context.gpuMemoryUsedMiB);
  const total = Number(context.gpuMemoryTotalMiB);
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return "unknown";
  return `${mibOrUnknown(used)} / ${mibOrUnknown(total)}`;
}

function percentOrUnknown(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${round(parsed, 1)}%` : "unknown";
}

function wattsOrUnknown(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? `${round(parsed, 1)} W` : "unknown";
}

function celsiusOrUnknown(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? `${round(parsed, 1)} C` : "unknown";
}

function mibOrUnknown(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${round(parsed, 1)} MiB` : "unknown";
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function numberArg(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
