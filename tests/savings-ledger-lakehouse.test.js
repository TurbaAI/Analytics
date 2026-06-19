const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
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
      PYTHONPATH: [
        "services/api-server",
        "services/duckdb-query-service",
        "services/transform-runner",
        "services/raw-writer",
        "services/platform_common",
        "services/alert-engine"
      ].join(path.delimiter)
    }
  });
  if (result.status !== 0) {
    throw new Error(`${pythonCommand.join(" ")} ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result.stdout.trim();
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "turba-savings-ledger-lakehouse-"));
const lakeRoot = path.join(temp, "lake");

const result = JSON.parse(run([
  "-c",
  `
import json
from pathlib import Path
from fastapi.testclient import TestClient
from api_server import ApiSettings, create_app
from duckdb_query_service import LakeQuery
from transform_runner import TransformRunner

settings = ApiSettings(
    lake_root=Path(${JSON.stringify(lakeRoot)}),
    require_auth=True,
    api_tokens=(
        "tenant-a:viewer-token:viewer:tenant-viewer",
        "tenant-a:operator-token:operator:tenant-operator",
        "*:admin-token:admin:platform-admin",
    ),
)
client = TestClient(create_app(settings))
payload = {
    "id": "ledger-a-1",
    "actionId": "action-rightsize-1",
    "actionTitle": "Right-size idle GPU workers",
    "category": "scheduler",
    "scope": {"type": "team", "key": "vision"},
    "status": "verified",
    "metric": "wastedGpuHours",
    "baseline": {"value": 64, "window": "2026-06-01T00:00:00Z/2026-06-08T00:00:00Z", "snapshotId": "baseline-a"},
    "result": {"value": 28, "window": "2026-06-09T00:00:00Z/2026-06-16T00:00:00Z", "snapshotId": "result-a"},
    "deltaGpuHours": 36,
    "deltaDollars": 108,
    "predictedGpuHours": 40,
    "predictedDollars": 120,
    "confidence": 82,
    "attribution": "measured",
    "appliedAt": "2026-06-09T00:00:00Z",
    "verifiedAt": "2026-06-16T00:00:00Z",
    "evidenceRef": "evidence-pack://tenant-a/ledger-a-1",
}
viewer_headers = {"authorization": "Bearer viewer-token"}
operator_headers = {"authorization": "Bearer operator-token"}
admin_headers = {"authorization": "Bearer admin-token"}

viewer_write = client.post("/v1/savings-ledger?tenantId=tenant-a", json=payload, headers=viewer_headers)
write = client.post("/v1/savings-ledger?tenantId=tenant-a", json=payload, headers=operator_headers)
read = client.get("/v1/savings-ledger?tenantId=tenant-a", headers=viewer_headers)
other_tenant = client.get("/v1/savings-ledger?tenantId=tenant-b", headers=viewer_headers)
admin_other = client.get("/v1/savings-ledger?tenantId=tenant-b", headers=admin_headers)
materialized = TransformRunner(Path(${JSON.stringify(lakeRoot)})).materialize(tenant_id="tenant-a")
lake = LakeQuery(Path(${JSON.stringify(lakeRoot)}))
raw_rows = lake.savings_ledger(tenant_id="tenant-a")
derived_rows = lake.read_derived_table("vs_savings_ledger", tenant_id="tenant-a")
print(json.dumps({
    "viewerWrite": viewer_write.status_code,
    "write": write.status_code,
    "writeStatus": write.json().get("status"),
    "read": read.status_code,
    "readCount": read.json().get("count"),
    "entryId": read.json().get("entries", [{}])[0].get("id"),
    "entryScope": read.json().get("entries", [{}])[0].get("scope", {}).get("key"),
    "otherTenant": other_tenant.status_code,
    "adminOther": admin_other.status_code,
    "rawRows": len(raw_rows),
    "rawTenant": raw_rows[0].get("tenant_id") if raw_rows else "",
    "derivedTables": [table.get("table") for table in materialized.get("tables", [])],
    "derivedRows": len(derived_rows),
    "derivedLedger": derived_rows[0].get("ledger_id") if derived_rows else "",
}))
`
]));

assert.equal(result.viewerWrite, 403);
assert.equal(result.write, 200);
assert.equal(result.writeStatus, "written");
assert.equal(result.read, 200);
assert.equal(result.readCount, 1);
assert.equal(result.entryId, "ledger-a-1");
assert.equal(result.entryScope, "vision");
assert.equal(result.otherTenant, 403);
assert.equal(result.adminOther, 200);
assert.equal(result.rawRows, 1);
assert.equal(result.rawTenant, "tenant-a");
assert.ok(result.derivedTables.includes("vs_savings_ledger"));
assert.equal(result.derivedRows, 1);
assert.equal(result.derivedLedger, "ledger-a-1");

console.log("savings ledger API and lakehouse integration ok");
