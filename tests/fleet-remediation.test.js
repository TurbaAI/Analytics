const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-remediation-"));
const bundlePath = path.join(tempDir, "bundle.json");

fs.writeFileSync(bundlePath, JSON.stringify({
  ingestion: {
    runs: [{
      id: "machine-spark1-test",
      sourceContext: {
        hostname: "SPARK1",
        hardwareFaultScore: 82,
        hardwareFaultCount: 1,
        hardwareCriticalFaultCount: 1,
        hardwareRepairAction: "open-repair-ticket",
        hardwareRepairConfidence: 0.91,
        hardwareRepairRequiresApproval: true,
        hardwareFaults: [{
          id: "machine-check",
          detail: "1 machine-check event observed."
        }]
      }
    }]
  }
}, null, 2));

const result = spawnSync(process.execPath, [
  "scripts/run-fleet-remediation.js",
  "--bundle",
  bundlePath,
  "--policy",
  "ops/fleet-remediation-policy.example.json",
  "--max-actions",
  "1"
], {
  cwd: root,
  encoding: "utf8"
});

assert.equal(result.status, 0, result.stderr);
const report = JSON.parse(result.stdout);
assert.equal(report.status, "dry-run");
assert.equal(report.planned, 1);
assert.equal(report.actions[0].host, "SPARK1");
assert.equal(report.actions[0].actionId, "open-repair-ticket");
assert.equal(report.actions[0].requiresApproval, true);
assert.equal(report.actions[0].skipped, true);
assert.equal(report.actions[0].reason, "dry-run");

console.log("fleet remediation tests passed");
