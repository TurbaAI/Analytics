const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");

const result = spawnSync(
  process.execPath,
  ["scripts/build-scheduler-overlay.js", "fixtures/scheduler-export-inputs"],
  {
    cwd: root,
    encoding: "utf8"
  }
);

assert.equal(result.status, 0, result.stderr);

const overlay = JSON.parse(result.stdout);
assert.ok(Array.isArray(overlay.sources.scheduler));
assert.equal(overlay.sources.scheduler.length, 2);

const apex = overlay.sources.scheduler.find((sample) => sample.runId === "provider-run-9001");
assert.equal(apex.schedulerExportId, "sched-2026-05-week-4");
assert.equal(apex.schedulerName, "slurm-topology-aware");
assert.equal(apex.queueName, "frontier-reserved");
assert.equal(apex.priorityClass, "p1-reserved");
assert.equal(apex.requestedGpuShape, "32x8-h100");
assert.equal(apex.placementRetries, 8);
assert.equal(apex.localityMisses, 4);
assert.equal(apex.events.length, 5);

const vectorcart = overlay.sources.scheduler.find((sample) => sample.runId === "provider-svc-4102");
assert.equal(vectorcart.schedulerName, "kueue-prod");
assert.equal(vectorcart.preemptionCount, 2);
assert.equal(vectorcart.backfillCandidates, 4);

console.log("scheduler exporter tests passed");
