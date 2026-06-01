const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { validateSourceApprovals } = require("../lib/source-approval-validator.js");

const root = path.join(__dirname, "..");

const validResult = spawnSync(process.execPath, [
  "scripts/validate-source-approvals.js",
  "--contracts",
  "ops/source-contracts.sandbox.json",
  "--approvals",
  "ops/source-approvals.sandbox.json"
], {
  cwd: root,
  encoding: "utf8"
});

assert.equal(validResult.status, 0, validResult.stderr);
const validReport = JSON.parse(validResult.stdout);
assert.equal(validReport.ok, true);
assert.equal(validReport.approved.length, 8);
assert.ok(validReport.requiredSystems.includes("grafana"));

const approvals = JSON.parse(fs.readFileSync(path.join(root, "ops", "source-approvals.sandbox.json"), "utf8"));
approvals.approvals = approvals.approvals.filter((approval) => approval.system !== "grafana");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-source-approvals-"));
const missingPath = path.join(tempDir, "missing-grafana.json");
fs.writeFileSync(missingPath, `${JSON.stringify(approvals, null, 2)}\n`);

const missingResult = spawnSync(process.execPath, [
  "scripts/validate-source-approvals.js",
  "--contracts",
  "ops/source-contracts.sandbox.json",
  "--approvals",
  missingPath
], {
  cwd: root,
  encoding: "utf8"
});

assert.notEqual(missingResult.status, 0);
assert.ok(missingResult.stdout.includes("grafana: missing source-owner approval"));

const contracts = JSON.parse(fs.readFileSync(path.join(root, "ops", "source-contracts.sandbox.json"), "utf8"));
const expired = JSON.parse(fs.readFileSync(path.join(root, "ops", "source-approvals.sandbox.json"), "utf8"));
expired.approvals[0].expiresAt = "2000-01-01";
const expiredValidation = validateSourceApprovals({
  contractsConfig: contracts,
  approvalsConfig: expired,
  now: new Date("2026-06-01T12:00:00Z")
});
assert.equal(expiredValidation.ok, false);
assert.ok(expiredValidation.errors.some((error) => error.includes("prometheus: approval expired")));

console.log("source approval tests passed");
