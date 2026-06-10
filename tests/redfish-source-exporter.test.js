const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { validateSourceBundle } = require("../lib/source-bundle-validator.js");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-redfish-exporter-"));

const direct = spawnSync(
  process.execPath,
  [
    "scripts/fetch-redfish-source-export.js",
    "--input",
    "fixtures/redfish-source-snapshot.json",
    "--run-id",
    "run-7421"
  ],
  { cwd: root, encoding: "utf8" }
);

assert.equal(direct.status, 0, direct.stderr);
const bundle = JSON.parse(direct.stdout);
const validation = validateSourceBundle(bundle, { requireSourceExport: true });
assert.equal(validation.ok, true, validation.errors.join("; "));
assert.equal(validation.sourceCounts.redfish, 1);
assert.equal(bundle.sources.redfish[0].runId, "run-7421");
assert.equal(bundle.sources.redfish[0].metrics.redfish_unhealthy_resources_total, 2);
assert.equal(bundle.sources.redfish[0].metrics.redfish_power_watts, 4850);
assert.equal(bundle.sources.redfish[0].health.rollup, "Warning");
assert.equal(bundle.sources.redfish[0].sourceContext.redfishBiosVersion, "2.7.4");

const outDirResult = spawnSync(
  process.execPath,
  [
    "scripts/fetch-redfish-source-export.js",
    "--input",
    "fixtures/redfish-source-snapshot.json",
    "--out-dir",
    tempDir
  ],
  { cwd: root, encoding: "utf8" }
);

assert.equal(outDirResult.status, 0, outDirResult.stderr);
const report = JSON.parse(outDirResult.stdout);
assert.equal(report.ok, true);
assert.equal(report.sourceCounts.redfish, 1);
const rows = JSON.parse(fs.readFileSync(path.join(tempDir, "redfish.json"), "utf8"));
assert.equal(rows.length, 1);
assert.equal(rows[0].sourceSystem, "redfish");

console.log("Redfish source exporter tests passed");
