const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");

const result = spawnSync(process.execPath, ["scripts/audit-productization-phases.js"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024
});

assert.equal(result.status, 0, `phase audit should pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

const report = JSON.parse(result.stdout);
assert.equal(report.status, "ok");
assert.deepEqual(report.phases.map((phase) => phase.id), ["phase-0", "phase-1", "phase-2", "phase-3", "phase-4", "phase-5"]);
assert.ok(report.phases.every((phase) => phase.status === "ok"));

const checks = new Set(report.phases.flatMap((phase) => phase.checks.map((check) => check.name)));
[
  "no_tracked_build_artifacts",
  "scrubbed_token_history",
  "scrubbed_live_secrets_file_history",
  "scrubbed_live_secret_values_history",
  "demo_data_boundary_ui",
  "collector_tenant_credentials",
  "object_store_required",
  "managed_metadata_db",
  "managed_queue",
  "slo_policy",
  "compliance_posture",
  "data_governance",
  "packaging_pricing",
  "design_partner_roi",
  "turbatop_operator_tui",
  "billing_usage_integration",
  "branch_protection",
  "conventional_commits_enforced",
  "performance_budgets"
].forEach((name) => {
  assert.ok(checks.has(name), `phase audit should include ${name}`);
});

assert.ok(report.requiredOperationalActions.some((action) => action.includes("Rotate any live collector credentials")));
assert.ok(report.requiredOperationalActions.some((action) => action.includes("design-partner pilots")));
assert.ok(report.requiredOperationalActions.some((action) => action.includes("branch protection")));

console.log("productization phase audit tests passed");
