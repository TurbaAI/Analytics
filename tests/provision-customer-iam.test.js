const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createIngestionServer } = require("../server/ingestion-server.js");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-customer-iam-"));
const server = createIngestionServer({
  dataDir: tempDir,
  uploadSecret: "test-secret",
  tenantTokens: "admin:admin-token:admin:platform-admin"
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const result = await runProvision([
    "scripts/provision-customer-iam.js",
    "--url",
    `http://127.0.0.1:${port}`,
    "--admin-token",
    "admin-token",
    "--tenant",
    "tenant-iam",
    "--display-name",
    "Tenant IAM",
    "--provider",
    "aws",
    "--secret-name",
    "turbalance/tenant-iam/exporter-token",
    "--secret-store",
    "aws-provider-secrets",
    "--namespace",
    "turbalance"
  ]);

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.tenant.tenantId, "tenant-iam");
  assert.equal(report.token.role, "ingest");
  assert.ok(report.token.tokenFingerprint);
  assert.equal(report.token.token, undefined);
  assert.equal(report.secretBinding.provider, "aws");
  assert.equal(report.secretBinding.secretName, "turbalance/tenant-iam/exporter-token");
  assert.ok(report.secretBinding.commands.some((entry) => entry.includes("aws secretsmanager create-secret")));
  assert.ok(report.secretBinding.commands.every((entry) => !entry.includes(report.token.tokenFingerprint)));
  assert.ok(report.secretBinding.externalSecret.includes("ClusterSecretStore"));
  assert.ok(report.secretBinding.externalSecret.includes("aws-provider-secrets"));
  assert.ok(fs.existsSync(path.join(tempDir, "control", "tenants.json")));
  assert.ok(fs.existsSync(path.join(tempDir, "control", "tokens.json")));

  await new Promise((resolve) => server.close(resolve));
  console.log("customer IAM provisioning tests passed");
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
