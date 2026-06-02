const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createIngestionServer } = require("../server/ingestion-server.js");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-provision-"));
const server = createIngestionServer({
  dataDir: tempDir,
  uploadSecret: "test-secret",
  tenantTokens: "admin:admin-token:admin:platform-admin"
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const result = await runProvision([
    "scripts/provision-tenant.js",
    "--url",
    `http://127.0.0.1:${port}`,
    "--admin-token",
    "admin-token",
    "--tenant",
    "tenant-provisioned",
    "--display-name",
    "Tenant Provisioned",
    "--role",
    "ingest",
    "--subject",
    "provider-exporter"
  ]);

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.tenant.tenantId, "tenant-provisioned");
  assert.equal(report.token.role, "ingest");
  assert.ok(report.token.token);
  assert.ok(fs.existsSync(path.join(tempDir, "control", "tenants.json")));
  assert.ok(fs.existsSync(path.join(tempDir, "control", "tokens.json")));

  await new Promise((resolve) => server.close(resolve));
  console.log("provision tenant tests passed");
})().catch((error) => {
  server.close(() => {
    console.error(error);
    process.exit(1);
  });
});

function runProvision(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}
