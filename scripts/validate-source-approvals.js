#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { validateSourceApprovals } = require("../lib/source-approval-validator.js");

const args = parseArgs(process.argv.slice(2));
const root = path.join(__dirname, "..");
const contractsPath = args.contracts || args["source-contracts"] || process.env.TURBALANCE_SOURCE_CONTRACTS || path.join(root, "ops", "source-contracts.example.json");
const approvalsPath = args.approvals || args["source-approvals"] || process.env.TURBALANCE_SOURCE_APPROVALS || path.join(root, "ops", "source-approvals.example.json");
const outPath = args.out || "";

try {
  const contractsConfig = readJson(contractsPath);
  const approvalsConfig = readJson(approvalsPath);
  const validation = validateSourceApprovals({ contractsConfig, approvalsConfig });
  const report = {
    ok: validation.ok,
    contractsPath: path.resolve(contractsPath),
    approvalsPath: path.resolve(approvalsPath),
    approved: validation.approved,
    requiredSystems: validation.requiredSystems,
    errors: validation.errors
  };

  if (outPath) {
    const fullPath = path.resolve(outPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exit(1);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
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
