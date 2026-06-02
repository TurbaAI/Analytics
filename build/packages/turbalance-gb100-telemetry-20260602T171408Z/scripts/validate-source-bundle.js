#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { validateSourceBundle } = require("../lib/source-bundle-validator.js");

const defaultFiles = [
  "fixtures/external-source-bundle.json",
  "fixtures/neo-cloud-provider-bundle.json",
  "fixtures/provider-overlay-template.json"
];

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const requireSourceExport = args.includes("--require-source-export");
const files = args.filter((arg) => !arg.startsWith("--"));
const targets = files.length > 0 ? files : defaultFiles;
const reports = [];
let failed = false;

targets.forEach((target) => {
  const fullPath = path.resolve(target);
  try {
    const payload = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    const report = validateSourceBundle(payload, { requireSourceExport });
    reports.push({ file: target, ...report });
    if (!report.ok) failed = true;
  } catch (error) {
    failed = true;
    reports.push({
      file: target,
      ok: false,
      errors: [error.message],
      warnings: [],
      sourceCounts: {},
      runIds: []
    });
  }
});

if (jsonMode) {
  process.stdout.write(`${JSON.stringify({ ok: !failed, reports }, null, 2)}\n`);
} else {
  reports.forEach((report) => {
    const status = report.ok ? "ok" : "failed";
    const counts = Object.entries(report.sourceCounts || {})
      .filter(([, count]) => count > 0)
      .map(([key, count]) => `${key}=${count}`)
      .join(", ") || "no source samples";
    process.stdout.write(`${status}: ${report.file} (${counts})\n`);
    report.warnings.forEach((warning) => process.stdout.write(`  warning: ${warning}\n`));
    report.errors.forEach((error) => process.stderr.write(`  error: ${error}\n`));
  });
}

if (failed) {
  process.exitCode = 1;
}
