const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { validateSourceBundle } = require("../lib/source-bundle-validator.js");

const root = path.join(__dirname, "..");
const fixture = JSON.parse(fs.readFileSync(path.join(root, "fixtures/external-source-bundle.json"), "utf8"));
const report = validateSourceBundle(fixture, { requireSourceExport: true });

assert.equal(report.ok, true);
assert.equal(report.sourceCounts.prometheus, 1);
assert.equal(report.sourceCounts.scheduler, 1);
assert.equal(report.sourceCounts.grafana, 1);
assert.equal(report.sourceCounts.redfish, 1);
assert.equal(report.sourceCounts.ncclTraces, 1);
assert.ok(report.runIds.includes("run-7421"));

const invalid = validateSourceBundle({ sources: { provider: [{}] } }, { requireSourceExport: true });
assert.equal(invalid.ok, false);
assert.ok(invalid.errors.some((error) => error.includes("sources.provider[1] is missing runId")));

const invalidRedfish = validateSourceBundle({ sources: { redfish: [{}] } }, { requireSourceExport: true });
assert.equal(invalidRedfish.ok, false);
assert.ok(invalidRedfish.errors.some((error) => error.includes("sources.redfish[1] is missing runId")));

const cliResult = spawnSync(
  process.execPath,
  [
    "scripts/validate-source-bundle.js",
    "fixtures/external-source-bundle.json",
    "fixtures/neo-cloud-provider-bundle.json",
    "--require-source-export"
  ],
  { cwd: root, encoding: "utf8" }
);
assert.equal(cliResult.status, 0, cliResult.stderr);
assert.ok(cliResult.stdout.includes("ok: fixtures/external-source-bundle.json"));

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-invalid-"));
const invalidPath = path.join(tempDir, "invalid.json");
fs.writeFileSync(invalidPath, `${JSON.stringify({ sources: { scheduler: [{}] } })}\n`);
const invalidCli = spawnSync(
  process.execPath,
  ["scripts/validate-source-bundle.js", invalidPath, "--require-source-export"],
  { cwd: root, encoding: "utf8" }
);
assert.notEqual(invalidCli.status, 0);
assert.ok(invalidCli.stderr.includes("scheduler[1] is missing runId"));

console.log("source bundle validator tests passed");
