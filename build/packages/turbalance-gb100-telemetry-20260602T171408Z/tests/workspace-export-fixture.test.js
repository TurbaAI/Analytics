const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const fixturePath = path.join(__dirname, "../fixtures/workspace-export.json");
const workspace = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const run = workspace.ingestion.runs[0];
const snapshot = workspace.snapshots[0];

assert.equal(workspace.storageSchemaVersion, "turba.workspace.v2");
assert.equal(workspace.ingestionSchemaVersion, "turba.ingestion.v1");
assert.equal(workspace.ingestion.schemaVersion, "turba.ingestion.v1");
assert.ok(!Number.isNaN(new Date(workspace.savedAt).getTime()));
assert.ok(!Number.isNaN(new Date(workspace.lastAnalysisAt).getTime()));

assert.equal(run.id, "run-export-fixture");
assert.deepEqual(Object.keys(workspace.baselines), [run.id]);
assert.equal(workspace.baselines[run.id].gpuEfficiency, run.baseline.gpuEfficiency);

assert.equal(snapshot.scope, "job");
assert.equal(snapshot.key, run.id);
assert.equal(snapshot.label, run.name);
assert.ok(Number.isFinite(snapshot.metrics.usefulCompute));
assert.ok(Number.isFinite(snapshot.metrics.costPerUsefulGpuHour));
assert.ok(!Number.isNaN(new Date(snapshot.capturedAt).getTime()));

console.log("workspace-export fixture tests passed");
