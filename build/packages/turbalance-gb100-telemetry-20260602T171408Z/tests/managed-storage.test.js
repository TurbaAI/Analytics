const assert = require("node:assert/strict");
const { createManagedPostgresObjectStorage, createStorageFromEnv } = require("../server/ingestion-storage.js");

const commands = [];
const uploads = [];
const auditRows = [];
const controls = new Map();

function commandRunner(command, args, options = {}) {
  const sql = args[args.length - 1] || "";
  commands.push({
    command,
    args,
    inputLength: options.input ? options.input.length : 0
  });

  if (command === "aws") {
    return { status: 0, stdout: "", stderr: "" };
  }

  if (sql.includes("INSERT INTO turbalance_uploads")) {
    uploads.push({
      storage_key: "s3://pilot-bucket/pilot-prefix/tenants/tenant-a/uploads/upload-1.json",
      tenant_id: "tenant-a",
      upload_id: "upload-1",
      object_key: "pilot-prefix/tenants/tenant-a/uploads/upload-1.json",
      meta_json: { tenantId: "tenant-a", uploadId: "upload-1" },
      mtime_ms: 123
    });
  }

  if (sql.includes("INSERT INTO turbalance_audit_rows")) {
    auditRows.push({ event: "managed.audit", tenantId: "tenant-a" });
  }

  if (sql.includes("INSERT INTO turbalance_control_json")) {
    controls.set("tenants", [{ tenantId: "tenant-a" }]);
  }

  if (sql.includes("FROM turbalance_uploads") && sql.includes("DISTINCT tenant_id")) {
    return { status: 0, stdout: JSON.stringify([{ tenant_id: "tenant-a" }]), stderr: "" };
  }

  if (sql.includes("FROM turbalance_uploads")) {
    return { status: 0, stdout: JSON.stringify(uploads), stderr: "" };
  }

  if (sql.includes("FROM turbalance_audit_rows")) {
    return { status: 0, stdout: JSON.stringify(auditRows), stderr: "" };
  }

  if (sql.includes("FROM turbalance_control_json")) {
    return { status: 0, stdout: JSON.stringify(controls.get("tenants") || []), stderr: "" };
  }

  return { status: 0, stdout: "", stderr: "" };
}

const storage = createManagedPostgresObjectStorage({
  bucketName: "pilot-bucket",
  objectPrefix: "pilot-prefix",
  postgresUrl: "postgres://managed.example/turbalance",
  commandRunner
});

storage.initialize();
const stored = storage.writeUpload({
  tenantId: "tenant-a",
  uploadId: "upload-1",
  raw: Buffer.from("{\"ok\":true}\n"),
  metadata: {
    tenantId: "tenant-a",
    uploadId: "upload-1"
  }
});

assert.ok(stored.storageKey.startsWith("s3://pilot-bucket/pilot-prefix/tenants/tenant-a/uploads/"));
assert.ok(commands.some((entry) => entry.command === "aws" && entry.args[0] === "s3" && entry.args[1] === "cp" && entry.inputLength > 0));
assert.ok(commands.some((entry) => entry.command === "psql" && entry.args.includes("postgres://managed.example/turbalance")));

const listed = storage.listTenantUploads("tenant-a");
assert.equal(listed[0].storageKey, "s3://pilot-bucket/pilot-prefix/tenants/tenant-a/uploads/upload-1.json");
assert.deepEqual(storage.listTenantsWithUploads(), ["tenant-a"]);

storage.appendAudit({
  ts: new Date().toISOString(),
  event: "managed.audit",
  tenantId: "tenant-a"
});
assert.equal(storage.readAuditRows({ tenantId: "tenant-a", limit: 10 })[0].event, "managed.audit");

storage.writeControlJson("tenants", [{ tenantId: "tenant-a" }]);
assert.equal(storage.readControlJson("tenants", [])[0].tenantId, "tenant-a");

const deleted = storage.deleteUpload(listed[0]);
assert.deepEqual(deleted, ["s3://pilot-bucket/pilot-prefix/tenants/tenant-a/uploads/upload-1.json"]);
assert.ok(commands.some((entry) => entry.command === "aws" && entry.args[1] === "rm"));

const envStorage = createStorageFromEnv({
  storageMode: "managed-postgres-s3",
  bucketName: "env-bucket",
  postgresUrl: "postgres://managed.example/turbalance",
  commandRunner
});
assert.equal(envStorage.bucketName, "env-bucket");

console.log("managed storage tests passed");
