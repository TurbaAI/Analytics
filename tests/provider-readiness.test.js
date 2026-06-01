const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-readiness-"));
const outPath = path.join(tempDir, "readiness.json");
const result = spawnSync(process.execPath, [
  "scripts/validate-provider-readiness.js",
  "--config",
  "ops/pilot-provider.config.example.json",
  "--source-contracts",
  "ops/source-contracts.example.json",
  "--allow-example",
  "--out",
  outPath
], {
  cwd: root,
  encoding: "utf8"
});

assert.equal(result.status, 0, result.stderr);
const report = JSON.parse(result.stdout);
assert.equal(report.ok, true);
assert.ok(report.summary.passed > 10);
assert.ok(report.summary.warnings > 0);
assert.ok(report.checks.some((check) => check.id === "contracts.prometheus"));
assert.ok(fs.existsSync(outPath));

const strictResult = spawnSync(process.execPath, [
  "scripts/validate-provider-readiness.js",
  "--config",
  "ops/pilot-provider.config.example.json",
  "--source-contracts",
  "ops/source-contracts.example.json"
], {
  cwd: root,
  encoding: "utf8"
});

assert.notEqual(strictResult.status, 0);
assert.ok(strictResult.stdout.includes("provider_registry"));

console.log("provider readiness tests passed");
