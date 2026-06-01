const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { validateSourceBundle } = require("../lib/source-bundle-validator.js");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-machine-bundle-"));
const outPath = path.join(tempDir, "live-machine-bundle.json");
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
assert.ok(bundle.metadata.note.includes("Kubernetes, DCGM"));
assert.ok(bundle.metadata.note.includes("not synthesized"));

console.log("local machine bundle tests passed");
