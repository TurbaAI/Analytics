const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const pythonCommand = process.platform === "darwin" ? ["/usr/bin/arch", "-arm64", "python3"] : ["python3"];
const pythonPath = [
  "services/system-id-worker",
  "services/platform_common",
  "services/raw-writer",
  "services/duckdb-query-service",
  "services/transform-runner",
  "services/api-server"
].join(path.delimiter);

function run(args, options = {}) {
  const result = spawnSync(pythonCommand[0], [...pythonCommand.slice(1), ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PYTHONPATH: pythonPath
    },
    maxBuffer: 50 * 1024 * 1024,
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`${pythonCommand.join(" ")} ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result.stdout.trim();
}

run([
  "-m",
  "py_compile",
  "services/system-id-worker/system_id_worker/__init__.py",
  "services/system-id-worker/system_id_worker/__main__.py",
  "services/system-id-worker/system_id_worker/worker.py"
]);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "turba-system-id-"));
const reportPath = path.join(temp, "report.json");
const batchPath = path.join(temp, "batch.json");
const comparePath = path.join(temp, "compare.json");
const lakeRoot = path.join(temp, "lake");

const runResult = JSON.parse(run([
  "-m",
  "system_id_worker",
  "run",
  "--simulate",
  "--targets",
  "cpu,gpu,ram,network,disk",
  "--profiles",
  "impulse,step,ramp",
  "--baseline-seconds",
  "0.1",
  "--impulse-seconds",
  "0.1",
  "--step-seconds",
  "0.1",
  "--ramp-seconds",
  "0.1",
  "--recovery-seconds",
  "0.1",
  "--sample-interval-seconds",
  "0.1",
  "--out",
  reportPath,
  "--batch-out",
  batchPath,
  "--lake-root",
  lakeRoot,
  "--tenant-id",
  "tenant-system-id",
  "--host-id",
  "system-id-host",
  "--agent-id",
  "system-id-test"
]));

assert.equal(runResult.status, "ok");
assert.ok(fs.existsSync(reportPath));
assert.ok(fs.existsSync(batchPath));

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const batch = JSON.parse(fs.readFileSync(batchPath, "utf8"));
assert.equal(report.schemaVersion, "turba.system_identification.v1");
assert.equal(report.capabilities.cpuLoad.available, true);
assert.equal(report.capabilities.ramLoad.available, true);
assert.ok(report.observations.length >= 9);
assert.ok(report.features.some((feature) => feature.target === "cpu" && feature.profile === "step"));
assert.ok(report.features.some((feature) => feature.target === "ram" && feature.outputMetric === "ram"));
assert.ok(report.features.some((feature) => feature.target === "disk" && feature.outputMetric === "disk"));
assert.ok(report.features.some((feature) => feature.target === "gpu" && feature.outputMetric === "gpuMemory"));
assert.ok(report.fingerprint.entryCount > 0);
assert.equal(report.lakehouseWrite.status, "written");
assert.equal(batch.schemaVersion, "turba.telemetry_batch.v1");
assert.ok(batch.samples.every((sample) => sample.sensorType === "system_identification"));

const transformResult = JSON.parse(run([
  "-m",
  "transform_runner",
  "--lake-root",
  lakeRoot,
  "--tenant-id",
  "tenant-system-id"
]));

assert.equal(transformResult.status, "materialized");
assert.ok(transformResult.tables.some((table) => table.table === "vs_system_identification_signature"));

const queryResult = JSON.parse(run([
  "-c",
  `
import json
from pathlib import Path
from fastapi.testclient import TestClient
from duckdb_query_service import LakeQuery
from api_server import ApiSettings, create_app
lake = LakeQuery(Path(${JSON.stringify(lakeRoot)}))
client = TestClient(create_app(ApiSettings(lake_root=Path(${JSON.stringify(lakeRoot)}))))
api = client.get("/v1/virtual-sensors/system-identification?tenantId=tenant-system-id")
print(json.dumps({
    "tables": lake.list_tables(),
    "signatureRows": len(lake.system_identification(tenant_id="tenant-system-id")),
    "apiStatus": api.status_code,
    "apiRows": api.json().get("count"),
}))
`
]));

assert.ok(queryResult.tables.includes("raw_system_identification"));
assert.ok(queryResult.signatureRows > 0);
assert.equal(queryResult.apiStatus, 200);
assert.equal(queryResult.apiRows, queryResult.signatureRows);

const compareResult = JSON.parse(run([
  "-m",
  "system_id_worker",
  "compare",
  "--baseline",
  reportPath,
  "--candidate",
  reportPath,
  "--out",
  comparePath
]));

assert.equal(compareResult.schemaVersion, "turba.system_identification_comparison.v1");
assert.equal(compareResult.rmse, 0);
assert.ok(fs.existsSync(comparePath));

console.log("system identification worker tests passed");
