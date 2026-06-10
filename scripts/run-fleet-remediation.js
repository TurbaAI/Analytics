#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const args = parseArgs(process.argv.slice(2));
const root = path.join(__dirname, "..");
const bundlePath = args.bundle || process.env.TURBALANCE_LIVE_MACHINE_BUNDLE || "build/demo/live-machine-bundle.json";
const policyPath = args.policy || process.env.TURBALANCE_REMEDIATION_POLICY || "ops/fleet-remediation-policy.example.json";
const outPath = args.out || "";
const apply = args.apply === true;
const approve = args.approve === true;
const maxActions = numberArg(args["max-actions"] || process.env.TURBALANCE_REMEDIATION_MAX_ACTIONS, 2);

const bundle = readJson(path.resolve(root, bundlePath));
const policy = readJson(path.resolve(root, policyPath));
const plan = buildPlan(bundle, policy).slice(0, maxActions);
const results = plan.map((action) => executeAction(action, { apply, approve, policy }));
const report = {
  status: apply ? "applied" : "dry-run",
  apply,
  approve,
  maxActions,
  planned: plan.length,
  actions: results,
  generatedAt: new Date().toISOString()
};

const output = `${JSON.stringify(report, null, 2)}\n`;
if (outPath) {
  const fullPath = path.resolve(root, outPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, output);
} else {
  process.stdout.write(output);
}

function buildPlan(sourceBundle, remediationPolicy) {
  const runs = sourceBundle.ingestion?.runs || [];
  return runs
    .map((run) => remediationActionForRun(run, remediationPolicy))
    .filter(Boolean)
    .sort((left, right) => severityRank(right.severity) - severityRank(left.severity) || right.faultScore - left.faultScore);
}

function remediationActionForRun(run, remediationPolicy) {
  const context = run.sourceContext || {};
  const actionId = String(context.hardwareRepairAction || "observe");
  const faultScore = number(context.hardwareFaultScore, 0);
  const faultCount = number(context.hardwareFaultCount, 0);
  if (actionId === "observe" || faultScore < number(remediationPolicy.minFaultScore, 18) || faultCount <= 0) return null;
  const actionPolicy = remediationPolicy.actions?.[actionId] || {};
  const host = String(context.hostname || run.id || "unknown-host");
  const remote = remediationPolicy.remotes?.[host] || context.remote || "";
  const severity = faultScore >= 80 || number(context.hardwareCriticalFaultCount, 0) > 0
    ? "critical"
    : faultScore >= 45 ? "high" : "medium";
  return {
    host,
    remote,
    actionId,
    severity,
    faultScore,
    confidence: number(context.hardwareRepairConfidence, 0.5),
    requiresApproval: Boolean(context.hardwareRepairRequiresApproval || actionPolicy.requiresApproval),
    command: actionPolicy.command || "",
    mode: actionPolicy.mode || "manual",
    reason: topFaultDetail(context) || `${host} hardware fault score is ${faultScore}.`
  };
}

function executeAction(action, { apply, approve, policy }) {
  const allowedModes = new Set(policy.allowedApplyModes || ["safe"]);
  const base = {
    ...action,
    executed: false,
    skipped: false,
    stdout: "",
    stderr: ""
  };
  if (!apply) return { ...base, skipped: true, reason: "dry-run" };
  if (action.requiresApproval && !approve) {
    return { ...base, skipped: true, reason: "requires --approve" };
  }
  if (!action.command || !allowedModes.has(action.mode)) {
    return { ...base, skipped: true, reason: `action mode ${action.mode} is not auto-applied` };
  }
  try {
    const result = runCommand(action);
    return { ...base, executed: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      ...base,
      skipped: false,
      executed: false,
      reason: error.message,
      stdout: error.stdout || "",
      stderr: error.stderr || ""
    };
  }
}

function runCommand(action) {
  const timeout = 15000;
  if (action.remote) {
    const stdout = execFileSync("ssh", [
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=8",
      "-o", "StrictHostKeyChecking=accept-new",
      action.remote,
      action.command
    ], { encoding: "utf8", timeout, maxBuffer: 1024 * 1024 });
    return { stdout, stderr: "" };
  }
  const stdout = execFileSync("bash", ["-lc", action.command], { encoding: "utf8", timeout, maxBuffer: 1024 * 1024 });
  return { stdout, stderr: "" };
}

function topFaultDetail(context) {
  const faults = Array.isArray(context.hardwareFaults) ? context.hardwareFaults : [];
  return faults[0]?.detail || "";
}

function severityRank(severity) {
  return { critical: 4, high: 3, medium: 2, low: 1 }[severity] || 0;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function numberArg(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}
