const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-go-live-"));
const result = spawnSync(process.execPath, [
  "scripts/run-provider-go-live-gates.js",
  "--config",
  "ops/pilot-provider.config.example.json",
  "--allow-example",
  "--skip-contracts",
  "--input-dir",
  "fixtures/provider-pilot-export-inputs",
  "--iterations",
  "1",
  "--out-dir",
  tempDir
], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024
});

assert.equal(result.status, 0, result.stderr);
const report = JSON.parse(result.stdout);
assert.equal(report.ok, true);
assert.equal(report.contracts, null);
assert.equal(report.burnIn.runs.length, 1);
assert.equal(report.image.dryRun, true);
assert.ok(fs.existsSync(path.join(tempDir, "readiness.json")));
assert.ok(fs.existsSync(path.join(tempDir, "managed-kubernetes.yaml")));
assert.ok(fs.existsSync(path.join(tempDir, "go-live-report.json")));
assert.ok(fs.existsSync(path.join(tempDir, "go-live-report.md")));
assert.ok(fs.readFileSync(path.join(tempDir, "go-live-report.md"), "utf8").includes("Provider Go-Live Report"));

const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-go-live-sandbox-"));
const sandboxResult = spawnSync(process.execPath, [
  "scripts/run-provider-go-live-gates.js",
  "--config",
  "ops/pilot-provider.sandbox.json",
  "--contracts",
  "ops/source-contracts.sandbox.json",
  "--skip-contracts",
  "--skip-burn-in",
  "--out-dir",
  sandboxDir
], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024
});

assert.equal(sandboxResult.status, 0, sandboxResult.stderr);
const sandboxReport = JSON.parse(sandboxResult.stdout);
assert.equal(sandboxReport.ok, true);
assert.equal(sandboxReport.readiness.summary.warnings, 0);
assert.equal(sandboxReport.readiness.summary.failed, 0);
assert.equal(sandboxReport.image.image, "127.0.0.1:5000/turbalance-ingestion:2026.06");
assert.equal(sandboxReport.contracts, null);
assert.equal(sandboxReport.burnIn, null);

console.log("provider go-live gate tests passed");
