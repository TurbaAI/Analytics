const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const pythonCommand = process.platform === "darwin" ? ["/usr/bin/arch", "-arm64", "python3"] : ["python3"];

function run(args) {
  const result = spawnSync(pythonCommand[0], [...pythonCommand.slice(1), ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PYTHONPATH: ["services/benchmark-commons"].join(path.delimiter)
    }
  });
  if (result.status !== 0) {
    throw new Error(`${pythonCommand.join(" ")} ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result.stdout.trim();
}

const result = JSON.parse(run([
  "-c",
  `
import json
from benchmark_commons import BenchmarkCommons, IDENTIFIER_FIELDS, normalize_contribution

raw = {
    "benchmarkOptIn": True,
    "tenantId": "tenant-secret",
    "hostId": "host-secret",
    "runId": "run-secret",
    "user": "user-secret",
    "features": {
        "gpuModel": "NVIDIA H100 SXM",
        "workloadClass": "llm training",
        "regionClass": "us-west-2",
    },
    "metrics": {"mfuPct": 31.4, "hfuPct": 38.2, "costPerUsefulGpuHour": 6.7},
}
normalized = normalize_contribution(raw)
without_opt_in = normalize_contribution({**raw, "benchmarkOptIn": False})
service = BenchmarkCommons(k=3)
for value in (22.0, 31.4):
    service.ingest({**raw, "metrics": {"mfuPct": value}})
suppressed = service.percentile(raw)
service.ingest({**raw, "metrics": {"mfuPct": 48.0}})
ready = service.percentile(raw)
serialized = json.dumps(normalized, sort_keys=True)
print(json.dumps({
    "normalized": normalized,
    "withoutOptIn": without_opt_in,
    "leakedIdentifiers": [field for field in IDENTIFIER_FIELDS if field in serialized],
    "suppressedStatus": suppressed["status"],
    "suppressed": suppressed["suppressed"],
    "suppressedCount": suppressed["count"],
    "readyStatus": ready["status"],
    "readySuppressed": ready["suppressed"],
    "readyCount": ready["count"],
    "readyPercentile": ready["percentile"],
    "features": ready["features"],
}))
`
]));

assert.equal(result.withoutOptIn, null);
assert.equal(result.normalized.schemaVersion, "turba.benchmark_contribution.v1");
assert.equal(result.normalized.features.gpuModel, "H100");
assert.equal(result.normalized.features.workloadClass, "llm-training");
assert.equal(result.normalized.features.regionClass, "us");
assert.deepEqual(result.leakedIdentifiers, []);
assert.equal(result.suppressedStatus, "suppressed");
assert.equal(result.suppressed, true);
assert.equal(result.suppressedCount, 2);
assert.equal(result.readyStatus, "ready");
assert.equal(result.readySuppressed, false);
assert.equal(result.readyCount, 3);
assert.ok(result.readyPercentile > 0);
assert.equal(result.features.gpuModel, "H100");

console.log("benchmark commons tests passed");
