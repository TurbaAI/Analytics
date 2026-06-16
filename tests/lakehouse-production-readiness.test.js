const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-lakehouse-readiness-"));
const caPath = path.join(tempDir, "agent-ca.pem");
const jwksPath = path.join(tempDir, "jwks.json");
const envPath = path.join(tempDir, "production.env");
const collectorToken = `collector_test_${crypto.randomBytes(18).toString("base64url")}`;
const collectorHmacSecret = `collector_hmac_test_${crypto.randomBytes(24).toString("base64url")}`;

function runNode(args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

fs.writeFileSync(
  caPath,
  [
    "-----BEGIN CERTIFICATE-----",
    "MIIBszCCAVmgAwIBAgIUB5qprodtestonlylakehousecert",
    "-----END CERTIFICATE-----",
    ""
  ].join("\n"),
  "utf8"
);
fs.writeFileSync(jwksPath, '{"keys":[]}\n', "utf8");
fs.writeFileSync(
  envPath,
  [
    "TURBALANCE_IMAGE_REGISTRY=ghcr.io/acme/turbalance",
    "TURBALANCE_IMAGE_TAG=2026.06.04.2",
    "TURBALANCE_NAMESPACE=turbalance-lakehouse",
    "TURBALANCE_LAKE_ROOT=s3://acme-turbalance-prod/turbalance/lakehouse",
    "TURBALANCE_API_JWT_ISSUER=https://issuer.acme.internal",
    "TURBALANCE_API_JWT_AUDIENCE=turbalance-api",
    "TURBALANCE_DISCOVERY_CERTIFICATE_MODE=spire",
    "TURBALANCE_TRUSTED_SPIFFE_PREFIX=spiffe://turbalance.local/",
    "TURBALANCE_QUEUE_GATEWAY_BACKEND=kafka",
    "TURBALANCE_QUEUE_GATEWAY_BROKER_URL=kafka.prod.svc.cluster.local:9092",
    "TURBALANCE_QUEUE_GATEWAY_TOPIC=turbalance.collector.telemetry",
    "TURBALANCE_TERRAFORM_DIR=ops/terraform/lakehouse/aws",
    "TURBALANCE_EBPF_HOSTS_FILE=ops/lakehouse-ebpf-hosts.example.json",
    `TURBALANCE_COLLECTOR_TENANT_CREDENTIALS=tenant-a:${collectorToken}:${collectorHmacSecret}:tenant-a-collector`,
    `TURBALANCE_COLLECTOR_TOKEN=${collectorToken}`,
    `TURBALANCE_COLLECTOR_HMAC_SECRET=${collectorHmacSecret}`,
    "TURBALANCE_DISCOVERY_ENROLLMENT_TOKEN=discovery-enrollment-live",
    "TURBALANCE_API_TOKENS=tenant-a:viewer-live:viewer:tenant-a-viewer",
    `TURBALANCE_API_JWKS_FILE=${jwksPath}`,
    `TURBALANCE_AGENT_CLIENT_CA_FILE=${caPath}`,
    "TURBALANCE_DISCOVERY_DATABASE_URL=postgresql://turbalance:secret@postgres.acme.internal:5432/turbalance",
    "TURBALANCE_COLLECTOR_QUEUE_TOKEN=queue-token-live",
    "AWS_ACCESS_KEY_ID=lake-access-key",
    "AWS_SECRET_ACCESS_KEY=lake-secret-key",
    "AWS_REGION=us-west-2",
    "AWS_ENDPOINT_URL=https://s3.us-west-2.amazonaws.com",
    "TURBALANCE_S3_SCHEME=s3",
    "TURBALANCE_OTEL_BACKEND_OTLP_ENDPOINT=https://otel.acme.internal/v1/traces",
    "TURBALANCE_OTEL_BACKEND_AUTHORIZATION=Bearer otel-token-live",
    "TURBALANCE_ALERT_WEBHOOK_URL=https://alerts.acme.internal/turbalance",
    "TURBALANCE_ALERT_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/test",
    "TURBALANCE_ALERT_PAGERDUTY_ROUTING_KEY=pagerduty-live",
    "TURBALANCE_CONSUL_URL=http://consul.consul.svc.cluster.local:8500",
    "TURBALANCE_CONSUL_TOKEN=consul-token-live",
    ""
  ].join("\n"),
  "utf8"
);

const secretSync = runNode([
  "scripts/sync-lakehouse-aws-secrets.js",
  "--env-file",
  envPath,
  "--dry-run",
  "--include-consul"
]);
assert.equal(secretSync.status, "dry-run");
assert.ok(secretSync.bindings.some((item) => item.remoteKey === "lakehouse/api-auth"));
assert.ok(secretSync.bindings.some((item) => item.remoteKey === "lakehouse/consul"));
assert.equal(secretSync.bindings.flatMap((item) => item.missingRequired).length, 0);
assert.ok(JSON.stringify(secretSync).includes("[REDACTED]"));
assert.ok(!JSON.stringify(secretSync).includes(collectorToken));

const externalSecrets = runNode([
  "scripts/validate-lakehouse-externalsecrets.js",
  "--namespace",
  "turbalance-lakehouse",
  "--dry-run",
  "--include-consul"
]);
assert.equal(externalSecrets.status, "dry-run");
assert.ok(externalSecrets.checks.some((item) => item.externalSecret === "turbalance-api-auth"));
assert.ok(externalSecrets.checks.some((item) => item.externalSecret === "turbalance-consul-auth"));
assert.ok(externalSecrets.checks.every((item) => item.commands.some((command) => command.includes("kubectl -n turbalance-lakehouse get externalsecret"))));

const terraform = runNode(["scripts/validate-lakehouse-terraform.js"]);
assert.equal(terraform.status, "ok");
assert.ok(terraform.checks.some((item) => item.name === "s3.bucket" && item.passed));
assert.ok(terraform.checks.some((item) => item.name === "secret.lakehouse/api-auth" && item.passed));
assert.ok(terraform.checks.some((item) => item.name === "secret.lakehouse/consul" && item.passed));

const terraformRollout = runNode([
  "scripts/run-lakehouse-terraform-rollout.js",
  "--env-file",
  envPath,
  "--out-dir",
  path.join(tempDir, "terraform-rollout")
]);
assert.equal(terraformRollout.status, "dry-run");
assert.ok(terraformRollout.commands.some((command) => command.includes("terraform") && command.includes("plan")));

const secretIam = runNode([
  "scripts/validate-lakehouse-secret-iam-consistency.js",
  "--include-consul"
]);
assert.equal(secretIam.status, "ok");
assert.ok(secretIam.checks.some((item) => item.name === "terraform.secret.lakehouse/consul" && item.passed));

const ebpfProbePackage = runNode(["scripts/validate-lakehouse-ebpf-probe-package.js"]);
assert.equal(ebpfProbePackage.status, "ok");
assert.ok(ebpfProbePackage.checks.some((item) => item.name === "probe.native-ebpf-readiness.metrics" && item.passed));
assert.ok(ebpfProbePackage.checks.some((item) => item.name === "probe.native-ebpf-core.tracepoints" && item.passed));

const livePrerequisites = runNode([
  "scripts/validate-lakehouse-live-prerequisites.js",
  "--env-file",
  envPath
]);
assert.equal(livePrerequisites.status, "planned");
assert.ok(livePrerequisites.commands.some((command) => command.includes("kubectl config current-context")));

const sloPolicy = runNode(["scripts/validate-lakehouse-slo-policy.js"]);
assert.equal(sloPolicy.status, "ok");
assert.ok(sloPolicy.checks.some((item) => item.name === "alert.TurbalanceEbpfReadinessLow.present" && item.passed));

const envAssembly = runNode([
  "scripts/generate-lakehouse-production-env.js",
  "--env-file",
  envPath,
  "--dry-run",
  "--include-secrets"
]);
assert.equal(envAssembly.status, "dry-run");
assert.ok(envAssembly.envPreview.some((line) => line === "TURBALANCE_COLLECTOR_TOKEN=[REDACTED]"));
assert.ok(!JSON.stringify(envAssembly).includes(collectorToken));

const valuesEnvAssembly = runNode([
  "scripts/create-lakehouse-production-env-from-values.js",
  "--values",
  "ops/lakehouse-production.values.example.json",
  "--dry-run"
]);
assert.equal(valuesEnvAssembly.status, "dry-run");
assert.ok(valuesEnvAssembly.withheldSecretKeys.includes("TURBALANCE_COLLECTOR_TOKEN"));
assert.ok(!JSON.stringify(valuesEnvAssembly).includes("replace-outside-source-control"));

const secretMaterial = runNode([
  "scripts/validate-lakehouse-secret-material.js",
  "--env-file",
  envPath,
  "--values",
  "ops/lakehouse-production.values.example.json",
  "--include-consul"
]);
assert.equal(secretMaterial.status, "ready");
assert.equal(secretMaterial.summary.requiredMissing, 0);
assert.ok(secretMaterial.groups.some((item) => item.name === "consul" && item.satisfied));
assert.ok(!JSON.stringify(secretMaterial).includes(collectorToken));

const productionMaterial = runNode([
  "scripts/bootstrap-lakehouse-production-material.js",
  "--out-dir",
  path.join(tempDir, "production-material"),
  "--force"
]);
assert.equal(productionMaterial.ok, true);
assert.equal(productionMaterial.validation.report.status, "ready");
assert.ok(fs.existsSync(productionMaterial.artifacts.envFile));
assert.ok(fs.existsSync(productionMaterial.artifacts.jwksFile));
assert.ok(!JSON.stringify(productionMaterial.redactedValues).includes("api_viewer_"));

const workstationPrep = runNode([
  "scripts/prepare-lakehouse-operator-workstation.js",
  "--env-file",
  envPath,
  "--out",
  path.join(tempDir, "operator-workstation.json")
]);
assert.ok(["ready", "action-required"].includes(workstationPrep.status));
assert.ok(workstationPrep.manualActions.some((action) => action.includes("Docker")));

const imageRegistry = runNode([
  "scripts/validate-lakehouse-image-registry.js",
  "--env-file",
  envPath,
  "--dry-run"
]);
assert.equal(imageRegistry.status, "dry-run");
assert.ok(imageRegistry.images.some((item) => item.image === "ghcr.io/acme/turbalance/api-server:2026.06.04.2"));

const imageLock = runNode([
  "scripts/generate-lakehouse-image-lock.js",
  "--env-file",
  envPath,
  "--dry-run"
]);
assert.equal(imageLock.status, "dry-run");
assert.ok(imageLock.images.some((item) => item.command.includes("docker manifest inspect")));

const imageSignatures = runNode([
  "scripts/sign-lakehouse-images.js",
  "--env-file",
  envPath,
  "--dry-run"
]);
assert.equal(imageSignatures.status, "dry-run");
assert.ok(imageSignatures.commands.some((command) => command.includes("cosign sign")));

const imageRelease = runNode([
  "scripts/run-lakehouse-image-release.js",
  "--env-file",
  envPath,
  "--dry-run",
  "--out-dir",
  path.join(tempDir, "image-release")
]);
assert.equal(imageRelease.ok, true);
assert.equal(imageRelease.dryRun, true);
assert.ok(imageRelease.stages.some((stage) => stage.name === "image-registry"));
assert.ok(imageRelease.stages.some((stage) => stage.name === "image-signatures"));

const productionGaps = runNode([
  "scripts/report-lakehouse-production-gaps.js",
  "--env-file",
  envPath,
  "--values-file",
  "ops/lakehouse-production.values.example.json",
  "--target-host",
  "user@192.168.10.20",
  "--out-dir",
  path.join(tempDir, "production-gaps"),
  "--include-consul"
]);
assert.equal(productionGaps.status, "action-required");
assert.equal(productionGaps.targetHostMode, "dry-run");
assert.ok(productionGaps.requiredActions.some((action) => action.includes("target-host preparation")));

const observability = runNode([
  "scripts/validate-lakehouse-live-observability.js",
  "--env-file",
  envPath,
  "--api-url",
  "https://turbalance-api.acme.internal",
  "--grafana-url",
  "https://grafana.acme.internal",
  "--otel-url",
  "https://otel.acme.internal/metrics",
  "--prometheus-url",
  "https://prometheus.acme.internal",
  "--dry-run"
]);
assert.equal(observability.status, "dry-run");
assert.ok(observability.checks.some((item) => item.name === "grafana_health"));
assert.ok(observability.checks.some((item) => item.name === "covariance_virtual_sensor"));

const ebpfEvidence = runNode([
  "scripts/collect-lakehouse-ebpf-rollout-evidence.js",
  "--hosts-file",
  "ops/lakehouse-ebpf-hosts.example.json",
  "--dry-run",
  "--out-dir",
  path.join(tempDir, "ebpf-rollout")
]);
assert.equal(ebpfEvidence.dryRun, true);
assert.ok(ebpfEvidence.artifacts.json.endsWith("ebpf-rollout-evidence.json"));

const nativeEbpfPackage = runNode([
  "scripts/package-lakehouse-native-ebpf.js",
  "--out-dir",
  path.join(tempDir, "native-ebpf"),
  "--archive"
]);
assert.equal(nativeEbpfPackage.status, "ready");
assert.ok(fs.existsSync(nativeEbpfPackage.manifest));
assert.ok(fs.existsSync(nativeEbpfPackage.checksums));
const nativeEbpfPackageManifest = JSON.parse(fs.readFileSync(nativeEbpfPackage.manifest, "utf8"));
assert.ok(nativeEbpfPackageManifest.install.hostValidation.includes("--native-build-mode prebuilt"));

const auditDir = path.join(tempDir, "readiness");
const audit = runNode([
  "scripts/audit-lakehouse-production-readiness.js",
  "--env-file",
  envPath,
  "--out-dir",
  auditDir
]);
assert.equal(audit.ok, true);
assert.ok(audit.stages.some((stage) => stage.name === "production-env-assembly" && stage.status === "dry-run"));
assert.ok(audit.stages.some((stage) => stage.name === "production-values-env-assembly" && stage.status === "dry-run"));
assert.ok(audit.stages.some((stage) => stage.name === "secret-material" && ["planned", "ready"].includes(stage.status)));
assert.ok(audit.stages.some((stage) => stage.name === "live-prerequisites" && stage.status === "planned"));
assert.ok(audit.stages.some((stage) => stage.name === "aws-secret-sync" && stage.status === "dry-run"));
assert.ok(audit.stages.some((stage) => stage.name === "image-registry" && stage.status === "dry-run"));
assert.ok(audit.stages.some((stage) => stage.name === "image-lock" && stage.status === "dry-run"));
assert.ok(audit.stages.some((stage) => stage.name === "image-signatures" && stage.status === "dry-run"));
assert.ok(audit.stages.some((stage) => stage.name === "live-observability" && stage.status === "dry-run"));
assert.ok(audit.stages.some((stage) => stage.name === "terraform-rollout" && stage.status === "dry-run"));
assert.ok(audit.stages.some((stage) => stage.name === "release-supply-chain" && stage.status === "validated"));
assert.ok(audit.stages.some((stage) => stage.name === "native-ebpf-package" && stage.status === "ready"));
assert.ok(audit.stages.some((stage) => stage.name === "secret-iam-consistency" && stage.status === "validated"));
assert.ok(audit.stages.some((stage) => stage.name === "kubernetes-release" && stage.status === "dry-run"));
assert.ok(audit.stages.some((stage) => stage.name === "change-window" && stage.status === "ready"));
assert.ok(audit.stages.some((stage) => stage.name === "slo-policy" && stage.status === "validated"));
assert.ok(audit.stages.some((stage) => stage.name === "ebpf-probe-package" && stage.status === "validated"));
assert.ok(audit.stages.some((stage) => stage.name === "ebpf-rollout-evidence" && stage.status === "dry-run"));
assert.ok(audit.stages.some((stage) => stage.name === "externalsecrets" && stage.status === "dry-run"));
assert.ok(fs.existsSync(path.join(auditDir, "readiness-report.json")));
assert.ok(fs.existsSync(path.join(auditDir, "readiness-report.md")));
assert.ok(fs.existsSync(path.join(auditDir, "terraform.json")));
assert.ok(fs.existsSync(path.join(auditDir, "secret-material.json")));
assert.ok(fs.existsSync(path.join(auditDir, "image-lock.json")));
assert.ok(fs.existsSync(path.join(auditDir, "image-signatures.json")));
assert.ok(fs.existsSync(path.join(auditDir, "native-ebpf", "native-ebpf-package-manifest.json")));
assert.ok(fs.existsSync(path.join(auditDir, "change-window", "change-window.json")));

console.log("lakehouse production readiness tests passed");
