const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");

function runNode(args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    ...options
  });
  assert.equal(result.status, 0, `node ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

const commercial = runNode(["scripts/validate-commercial-readiness.js"]);
assert.equal(commercial.status, "ok");
assert.ok(commercial.checks.some((check) => check.name === "metering.catalog" && check.passed));
assert.ok(commercial.checks.some((check) => check.name === "design_partner.plan" && check.passed));

const engineeringProcess = runNode(["scripts/validate-engineering-process.js"]);
assert.equal(engineeringProcess.status, "ok");
assert.ok(engineeringProcess.checks.some((check) => check.name === "branch_protection.desired_state" && check.passed));
assert.ok(engineeringProcess.checks.some((check) => check.name === "conventional_commits.workflow" && check.passed));

const performance = runNode(["scripts/validate-performance-budgets.js"]);
assert.equal(performance.status, "ok");
assert.ok(performance.checks.some((check) => check.name === "ingestion.load_budget" && check.passed));
assert.ok(performance.checks.some((check) => check.name === "regression.suite" && check.passed));

const conventional = runNode(["scripts/validate-conventional-commit.js", "feat(gtm): add commercial readiness gates"]);
assert.equal(conventional.status, "ok");
assert.equal(conventional.type, "feat");

const invalid = spawnSync(process.execPath, ["scripts/validate-conventional-commit.js", "update stuff"], {
  cwd: root,
  encoding: "utf8"
});
assert.notEqual(invalid.status, 0);
assert.ok(invalid.stderr.includes("subject must match"));

console.log("commercial and engineering process tests passed");
