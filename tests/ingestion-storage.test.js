const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createFileStorage, createObjectDatabaseStorage, createStorageFromEnv } = require("../server/ingestion-storage.js");

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

const objectTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-object-storage-"));
const objectStorage = createObjectDatabaseStorage({
  dataDir: objectTempDir,
  bucketName: "pilot-bucket"
});
objectStorage.initialize();

const objectStored = objectStorage.writeUpload({
  tenantId: "tenant-b",
  uploadId: "upload-2",
  raw: Buffer.from("{\"ok\":true}\n"),
  metadata: {
    tenantId: "tenant-b",
    uploadId: "upload-2",
    storedAt: new Date().toISOString()
  }
});
assert.ok(objectStored.storageKey.startsWith("object://pilot-bucket/"));
assert.ok(fs.existsSync(objectStored.fullPath));
assert.equal(objectStorage.listTenantUploads("tenant-b")[0].storageKey, objectStored.storageKey);
assert.deepEqual(objectStorage.listTenantsWithUploads(), ["tenant-b"]);

objectStorage.appendAudit({
  ts: new Date().toISOString(),
  event: "object.audit",
  tenantId: "tenant-b"
});
assert.equal(objectStorage.readAuditRows({ tenantId: "tenant-b", limit: 10 })[0].event, "object.audit");

objectStorage.writeControlJson("tenants", [{ tenantId: "tenant-b" }]);
assert.equal(objectStorage.readControlJson("tenants", [])[0].tenantId, "tenant-b");
assert.ok(fs.existsSync(path.join(objectTempDir, "control", "ingestion-control.sqlite")));

const objectDeleted = objectStorage.deleteUpload(objectStorage.listTenantUploads("tenant-b")[0]);
assert.ok(objectDeleted.some((entry) => entry === objectStored.storageKey));
assert.equal(objectStorage.listTenantUploads("tenant-b").length, 0);

const envStorage = createStorageFromEnv({
  dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "turba-env-storage-")),
  storageMode: "object-sqlite",
  bucketName: "env-bucket"
});
envStorage.initialize();
assert.equal(envStorage.bucketName, "env-bucket");

console.log("ingestion storage tests passed");
