const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { validateSourceBundle } = require("../lib/source-bundle-validator.js");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-machine-bundle-"));
const outPath = path.join(tempDir, "live-machine-bundle.json");
const fleetOutPath = path.join(tempDir, "live-machine-fleet-bundle.json");
const result = spawnSync(process.execPath, [
  "scripts/collect-local-machine-bundle.js",
  "--out",
  outPath,
  "--host-url",
  "http://192.168.10.101:8000",
  "--run-id",
  "machine-demo-test"
], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024
});

assert.equal(result.status, 0, result.stderr);
assert.ok(fs.existsSync(outPath));

const bundle = JSON.parse(fs.readFileSync(outPath, "utf8"));
const validation = validateSourceBundle(bundle);
assert.equal(validation.ok, true, validation.errors.join("; "));
assert.equal(bundle.ingestion.schemaVersion, "turba.ingestion.v1");
assert.equal(bundle.ingestion.runs.length, 1);
assert.equal(bundle.ingestion.runs[0].id, "machine-demo-test");
assert.ok(bundle.ingestion.runs[0].sourceContext.hostname);
assert.deepEqual(bundle.sources, {});
assert.ok(bundle.ingestion.sourceAdapters.includes("local-machine"));
assert.ok(bundle.ingestion.runs[0].importedSources.includes("local-machine"));
assert.ok(!bundle.ingestion.runs[0].importedSources.includes("dcgm"));
assert.ok(!bundle.ingestion.runs[0].importedSources.includes("ebpf"));
assert.ok(!bundle.ingestion.runs[0].importedSources.includes("scheduler"));
assert.ok(!bundle.ingestion.runs[0].importedSources.includes("provider"));
assert.ok(Array.isArray(bundle.ingestion.runs[0].sourceContext.dockerContainers));
assert.ok(Array.isArray(bundle.ingestion.runs[0].sourceContext.observedServices));
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gpuComputeProcessQuerySkipped, "boolean");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gpuSampleCached, "boolean");
assert.equal(typeof bundle.ingestion.runs[0].sourceContext.gpuSampleAgeMs, "number");
assert.ok(bundle.metadata.note.includes("Kubernetes, DCGM"));
assert.ok(bundle.metadata.note.includes("not synthesized"));

const fastOutPath = path.join(tempDir, "live-machine-bundle-fast.json");
const fastResult = spawnSync(process.execPath, [
  "scripts/collect-local-machine-bundle.js",
  "--out",
  fastOutPath,
  "--host-url",
  "http://192.168.10.101:8000",
  "--run-id",
  "machine-demo-fast-test",
  "--fast-refresh"
], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024
});

assert.equal(fastResult.status, 0, fastResult.stderr);
const fastBundle = JSON.parse(fs.readFileSync(fastOutPath, "utf8"));
assert.equal(fastBundle.ingestion.runs[0].id, "machine-demo-fast-test");
assert.equal(fastBundle.ingestion.runs[0].sourceContext.gpuComputeProcessQuerySkipped, true);
assert.equal(fastBundle.ingestion.runs[0].sourceContext.gpuSampleCached, false);

const fleetResult = spawnSync(process.execPath, [
  "scripts/collect-machine-fleet-bundle.js",
  "--out",
  fleetOutPath,
  "--host-url",
  "http://192.168.10.101:8000"
], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024
});

assert.equal(fleetResult.status, 0, fleetResult.stderr);
const fleetBundle = JSON.parse(fs.readFileSync(fleetOutPath, "utf8"));
const fleetValidation = validateSourceBundle(fleetBundle);
assert.equal(fleetValidation.ok, true, fleetValidation.errors.join("; "));
assert.equal(fleetBundle.metadata.source, "collect-machine-fleet-bundle.js");
assert.ok(fleetBundle.metadata.note.includes("fleet observation"));
assert.deepEqual(fleetBundle.sources, {});
assert.ok(fleetBundle.ingestion.runs.length >= 1);

console.log("local machine bundle tests passed");
