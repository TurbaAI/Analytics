#!/usr/bin/env node
"use strict";

const { applyRetention, createIngestionConfig } = require("../server/ingestion-server.js");

const jsonMode = process.argv.includes("--json");
const config = createIngestionConfig();
const result = applyRetention(config);
const report = {
  ok: true,
  deleted: result.deleted,
  deletedCount: result.deleted.length,
  retentionDays: config.retentionDays,
  maxUploadsPerTenant: config.maxUploadsPerTenant,
  dataDir: config.dataDir
};

if (jsonMode) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`retention job complete: deleted=${report.deletedCount} dataDir=${report.dataDir}\n`);
  report.deleted.forEach((entry) => process.stdout.write(`  deleted: ${entry}\n`));
}
