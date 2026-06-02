const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-provider-config-"));
const outPath = path.join(tempDir, "pilot-provider.generated.json");

const args = [
  "scripts/generate-provider-pilot-config.js",
  "--out",
  outPath,
  "--namespace",
  "turbalance-provider-a",
  "--release-name",
  "turbalance-provider-a",
  "--image",
  "registry.turbalance.internal/ai-ops/turbalance-ingestion:2026.06",
  "--secret-provider",
  "aws",
  "--secret-store-name",
  "turbalance-provider-a-secrets",
  "--service-account-role-arn",
  "arn:aws:iam::210987654321:role/turbalance-provider-a-ingestion",
  "--object-bucket",
  "turbalance-provider-a-ingestion",
  "--object-prefix",
  "pilot/provider-a",
  "--postgres-secret-name",
  "turbalance/provider-a/postgres-url",
  "--tenant-tokens-secret-name",
  "turbalance/provider-a/tenant-tokens",
  "--upload-secret-name",
  "turbalance/provider-a/upload-secret",
  "--jwt-secret-name",
  "turbalance/provider-a/jwt-secret",
  "--exporter-token-secret-name",
  "turbalance/provider-a/exporter-token",
  "--ingest-tenant",
  "provider-a",
  "--aws-region",
  "us-east-2"
];

const result = spawnSync(process.execPath, args, {
  cwd: root,
  encoding: "utf8"
});

assert.equal(result.status, 0, result.stderr);
const report = JSON.parse(result.stdout);
assert.equal(report.ok, true);
assert.equal(report.outPath, outPath);
assert.ok(report.nextCommands.readiness.includes(outPath));

const generatedText = fs.readFileSync(outPath, "utf8");
assert.ok(!/provider\.example|123456789012|replace-me|your-org/.test(generatedText));
const generatedConfig = JSON.parse(generatedText);
assert.equal(generatedConfig.image, "registry.turbalance.internal/ai-ops/turbalance-ingestion:2026.06");
assert.equal(generatedConfig.secretProvider, "aws");
assert.equal(generatedConfig.aws.region, "us-east-2");
assert.equal(generatedConfig.serviceAccountAnnotations["eks.amazonaws.com/role-arn"], "arn:aws:iam::210987654321:role/turbalance-provider-a-ingestion");

const readinessResult = spawnSync(process.execPath, [
  "scripts/validate-provider-readiness.js",
  "--config",
  outPath,
  "--source-contracts",
  "ops/source-contracts.sandbox.json",
  "--source-approvals",
  "ops/source-approvals.sandbox.json"
], {
  cwd: root,
  encoding: "utf8"
});

assert.equal(readinessResult.status, 0, readinessResult.stderr);
const readiness = JSON.parse(readinessResult.stdout);
assert.equal(readiness.ok, true);
assert.equal(readiness.summary.failed, 0);
assert.equal(readiness.summary.warnings, 0);

const renderResult = spawnSync(process.execPath, [
  "scripts/render-managed-kubernetes.js",
  "--config",
  outPath
], {
  cwd: root,
  encoding: "utf8"
});

assert.equal(renderResult.status, 0, renderResult.stderr);
assert.ok(renderResult.stdout.includes("registry.turbalance.internal/ai-ops/turbalance-ingestion:2026.06"));
assert.ok(renderResult.stdout.includes("turbalance-provider-a-ingestion"));
assert.ok(renderResult.stdout.includes("turbalance-provider-a-secrets"));

const missingResult = spawnSync(process.execPath, args.filter((entry, index) => entry !== "--object-bucket" && args[index - 1] !== "--object-bucket"), {
  cwd: root,
  encoding: "utf8"
});

assert.notEqual(missingResult.status, 0);
assert.ok(missingResult.stderr.includes("--object-bucket"));

const placeholderOutPath = path.join(tempDir, "pilot-provider.placeholder.json");
const placeholderArgs = args.map((entry, index) => (
  args[index - 1] === "--out" ? placeholderOutPath : entry
)).map((entry, index) => (
  args[index - 1] === "--image" ? "registry.provider.example/ai-ops/turbalance-ingestion:2026.06" : entry
));
const placeholderResult = spawnSync(process.execPath, placeholderArgs, {
  cwd: root,
  encoding: "utf8"
});

assert.notEqual(placeholderResult.status, 0);
assert.ok(placeholderResult.stderr.includes("config.image"));
assert.ok(!fs.existsSync(placeholderOutPath));

console.log("provider config generator tests passed");
