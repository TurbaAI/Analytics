const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createFileStorage } = require("../server/ingestion-storage.js");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-storage-"));
const storage = createFileStorage({ dataDir: tempDir });

storage.initialize();

const stored = storage.writeUpload({
  tenantId: "tenant-a",
  uploadId: "upload-1",
  raw: Buffer.from("{\"ok\":true}\n"),
  metadata: {
    tenantId: "tenant-a",
    uploadId: "upload-1",
    storedAt: new Date().toISOString()
  }
});

assert.ok(fs.existsSync(stored.fullPath));
assert.ok(fs.existsSync(stored.metaPath));
assert.equal(storage.listTenantUploads("tenant-a").length, 1);
assert.deepEqual(storage.listTenantsWithUploads(), ["tenant-a"]);

storage.appendAudit({
  ts: new Date().toISOString(),
  event: "test.audit",
  tenantId: "tenant-a"
});
assert.equal(storage.readAuditRows({ tenantId: "tenant-a", limit: 10 })[0].event, "test.audit");

storage.writeControlJson("tenants", [{ tenantId: "tenant-a" }]);
assert.equal(storage.readControlJson("tenants", [])[0].tenantId, "tenant-a");

const deleted = storage.deleteUpload(storage.listTenantUploads("tenant-a")[0]);
assert.ok(deleted.some((entry) => entry.endsWith("upload-1.json")));
assert.equal(storage.listTenantUploads("tenant-a").length, 0);

console.log("ingestion storage tests passed");
