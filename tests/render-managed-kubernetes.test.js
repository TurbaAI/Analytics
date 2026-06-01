const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-render-k8s-"));
const outPath = path.join(tempDir, "managed.yaml");
const result = spawnSync(process.execPath, [
  "scripts/render-managed-kubernetes.js",
  "--config",
  "ops/pilot-provider.config.example.json",
  "--out",
  outPath
], {
  cwd: root,
  encoding: "utf8"
});

assert.equal(result.status, 0, result.stderr);
const rendered = fs.readFileSync(outPath, "utf8");
assert.ok(rendered.includes("TURBALANCE_STORAGE_MODE: managed-postgres-s3"));
assert.ok(rendered.includes("TURBALANCE_POSTGRES_URL_FILE"));
assert.ok(rendered.includes("provider-ai-ops-turbalance-ingestion"));
assert.ok(rendered.includes("registry.provider.example/ai-ops/turbalance-ingestion:2026.06"));
assert.ok(rendered.includes("kind: ExternalSecret"));
assert.ok(rendered.includes("kind: ClusterSecretStore"));
assert.ok(rendered.includes("eks.amazonaws.com/role-arn"));
assert.ok(rendered.includes("arn:aws:iam::123456789012:role/turbalance-ingestion-secrets"));
assert.ok(rendered.includes("service: SecretsManager"));
assert.ok(rendered.includes("region: us-west-2"));
assert.ok(rendered.includes("serviceAccountName: turbalance-ingestion"));
assert.ok(!rendered.includes("persistentVolumeClaim"));
assert.ok(!rendered.includes("ghcr.io/your-org"));

console.log("managed Kubernetes render tests passed");
