const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");

const result = spawnSync(
  process.execPath,
  ["scripts/build-provider-overlay.js", "fixtures/provider-export-inputs"],
  {
    cwd: root,
    encoding: "utf8"
  }
);

assert.equal(result.status, 0, result.stderr);

const overlay = JSON.parse(result.stdout);
assert.ok(Array.isArray(overlay.sources.provider));
assert.equal(overlay.sources.provider.length, 2);

const apex = overlay.sources.provider.find((sample) => sample.runId === "provider-run-9001");
assert.equal(apex.tenant, "apex-ai");
assert.equal(apex.account, "acct-apex-frontier");
assert.equal(apex.reservation, "rsv-h100-frontier-q2");
assert.equal(apex.providerExportId, "billing-2026-05-week-4");
assert.equal(apex.sourceContext.namespace, "frontier-training");
assert.equal(apex.sourceContext.podSelector, "job-name=apex-70b-pretrain-9001");
assert.equal(apex.sourceContext.slurmJobId, "provider-run-9001");
assert.equal(apex.commercial.billingModel, "reserved-cluster");
assert.equal(apex.commercial.floorGpuHourCost, 3.9);
assert.equal(apex.commercial.billableGpuHours, 1184);
assert.equal(apex.slo.priority, "p1");
assert.equal(apex.slo.targetStartMinutes, 20);
assert.equal(apex.slo.supportTicketId, "CS-2044");

const helix = overlay.sources.provider.find((sample) => sample.runId === "provider-run-9002");
assert.equal(helix.commercial.billingModel, "committed-burst");
assert.equal(helix.slo.priority, "p2");

console.log("provider exporter tests passed");
