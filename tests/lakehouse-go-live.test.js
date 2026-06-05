const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-lakehouse-go-live-"));

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

const validConfig = runNode([
  "scripts/validate-lakehouse-production-config.js",
  "--env-file",
  "ops/lakehouse-production.env.example"
]);
assert.equal(validConfig.ok, true);
assert.equal(validConfig.summary.failed, 0);

const badEnv = path.join(tempDir, "bad.env");
fs.writeFileSync(
  badEnv,
  [
    "TURBALANCE_IMAGE_REGISTRY=ghcr.io/your-org/turbalance",
    "TURBALANCE_IMAGE_TAG=latest",
    "TURBALANCE_NAMESPACE=turbalance-lakehouse",
    "TURBALANCE_LAKE_ROOT=s3://replace-with-bucket/turbalance/lakehouse",
    "TURBALANCE_API_JWT_ISSUER=https://issuer.example",
    "TURBALANCE_API_JWT_AUDIENCE=turbalance-api",
    "TURBALANCE_DISCOVERY_CERTIFICATE_MODE=spire",
    "TURBALANCE_TRUSTED_SPIFFE_PREFIX=spiffe://turbalance.local/",
    "TURBALANCE_QUEUE_GATEWAY_BACKEND=kafka",
    "TURBALANCE_QUEUE_GATEWAY_BROKER_URL=kafka.example:9092",
    "TURBALANCE_QUEUE_GATEWAY_TOPIC=turbalance.collector.telemetry",
    ""
  ].join("\n"),
  "utf8"
);
const badResult = spawnSync(process.execPath, [
  "scripts/validate-lakehouse-production-config.js",
  "--env-file",
  badEnv
], {
  cwd: root,
  encoding: "utf8"
});
assert.notEqual(badResult.status, 0);
assert.equal(JSON.parse(badResult.stdout).ok, false);

const goLiveDir = path.join(tempDir, "go-live");
const goLive = runNode([
  "scripts/run-lakehouse-go-live.js",
  "--env-file",
  "ops/lakehouse-production.env.example",
  "--out-dir",
  goLiveDir
]);
assert.equal(goLive.ok, true);
assert.ok(goLive.stages.some((stage) => stage.name === "production-config" && stage.status === "validated"));
assert.ok(goLive.stages.some((stage) => stage.name === "production-env-assembly" && stage.status === "dry-run"));
assert.ok(goLive.stages.some((stage) => stage.name === "production-values-env-assembly" && stage.status === "dry-run"));
assert.ok(goLive.stages.some((stage) => stage.name === "secret-material" && ["planned", "ready"].includes(stage.status)));
assert.ok(goLive.stages.some((stage) => stage.name === "live-prerequisites" && stage.status === "planned"));
assert.ok(goLive.stages.some((stage) => stage.name === "terraform-static" && stage.status === "ok"));
assert.ok(goLive.stages.some((stage) => stage.name === "infrastructure" && stage.status === "dry-run"));
assert.ok(goLive.stages.some((stage) => stage.name === "aws-secret-sync" && stage.status === "dry-run"));
assert.ok(goLive.stages.some((stage) => stage.name === "image-lock" && stage.status === "dry-run"));
assert.ok(goLive.stages.some((stage) => stage.name === "image-signatures" && stage.status === "dry-run"));
assert.ok(goLive.stages.some((stage) => stage.name === "release-package" && stage.status === "packaged"));
assert.ok(goLive.stages.some((stage) => stage.name === "release-supply-chain" && stage.status === "ok"));
assert.ok(goLive.stages.some((stage) => stage.name === "native-ebpf-package" && stage.status === "ready"));
assert.ok(goLive.stages.some((stage) => stage.name === "change-window" && stage.status === "ready"));
assert.ok(goLive.stages.some((stage) => stage.name === "secret-iam-consistency" && stage.status === "ok"));
assert.ok(goLive.stages.some((stage) => stage.name === "kubernetes-release" && stage.status === "dry-run"));
assert.ok(goLive.stages.some((stage) => stage.name === "image-registry" && stage.status === "dry-run"));
assert.ok(goLive.stages.some((stage) => stage.name === "cluster-smoke" && stage.status === "dry-run"));
assert.ok(goLive.stages.some((stage) => stage.name === "externalsecrets" && stage.status === "dry-run"));
assert.ok(goLive.stages.some((stage) => stage.name === "burn-in" && stage.status === "dry-run"));
assert.ok(goLive.stages.some((stage) => stage.name === "live-observability" && stage.status === "dry-run"));
assert.ok(goLive.stages.some((stage) => stage.name === "slo-policy" && stage.status === "ok"));
assert.ok(goLive.stages.some((stage) => stage.name === "ebpf-probe-package" && stage.status === "ok"));
assert.ok(goLive.stages.some((stage) => stage.name === "ebpf-fleet" && stage.status === "dry-run"));
assert.ok(goLive.stages.some((stage) => stage.name === "ebpf-rollout-evidence"));
assert.ok(fs.existsSync(path.join(goLiveDir, "go-live-report.json")));
assert.ok(fs.existsSync(path.join(goLiveDir, "go-live-report.md")));
assert.ok(fs.existsSync(path.join(goLiveDir, "release", "release-manifest.json")));
assert.ok(fs.existsSync(path.join(goLiveDir, "secret-material.json")));
assert.ok(fs.existsSync(path.join(goLiveDir, "image-lock.json")));
assert.ok(fs.existsSync(path.join(goLiveDir, "image-signatures.json")));
assert.ok(fs.existsSync(path.join(goLiveDir, "native-ebpf", "native-ebpf-package-manifest.json")));
assert.ok(fs.existsSync(path.join(goLiveDir, "change-window", "change-window.json")));
const imageStage = goLive.stages.find((stage) => stage.name === "images");
assert.ok(imageStage.build.stdout.includes("raw-writer"));
assert.ok(imageStage.build.stdout.includes("transform-runner"));

const burnIn = runNode([
  "scripts/run-lakehouse-burn-in.js",
  "--dry-run",
  "--api-url",
  "http://api-server.turbalance-lakehouse.svc.cluster.local:8080",
  "--collector-url",
  "http://collector-gateway.turbalance-lakehouse.svc.cluster.local:8801",
  "--requests",
  "5",
  "--concurrency",
  "2"
]);
assert.equal(burnIn.status, "dry-run");
assert.equal(burnIn.plan.requests, 5);
assert.ok(burnIn.plan.routes.includes("/v1/virtual-sensors/covariance"));

const fleet = runNode([
  "scripts/run-ebpf-fleet-validation.js",
  "--hosts-file",
  "ops/lakehouse-ebpf-hosts.example.json",
  "--dry-run"
]);
assert.equal(fleet.status, "dry-run");
assert.equal(fleet.hosts[0].host, "user@192.168.10.20");
assert.equal(fleet.hosts[0].mode, "ssh");
assert.ok(fleet.hosts[0].command.includes("validate-ebpf-agent-host.js"));
assert.ok(fleet.hosts[0].command.includes("--native-build-mode"));
assert.ok(fleet.hosts[0].command.includes("prebuilt"));

const targetHostPrep = runNode([
  "scripts/prepare-lakehouse-target-host.js",
  "--target-host",
  "user@192.168.10.20",
  "--dry-run",
  "--out",
  path.join(tempDir, "target-host-prep.json")
]);
assert.equal(targetHostPrep.status, "dry-run");
assert.equal(targetHostPrep.targetHost, "user@192.168.10.20");
assert.ok(targetHostPrep.commands.sshProbe.includes("ssh"));
assert.ok(targetHostPrep.commands.syncRepository.includes("rsync"));
assert.ok(targetHostPrep.commands.installNativeDeps.includes("apt-get"));
assert.ok(targetHostPrep.commands.validateHost.includes("--native-build-mode"));

const workstationPrep = runNode([
  "scripts/prepare-lakehouse-operator-workstation.js",
  "--env-file",
  "ops/lakehouse-production.env.example",
  "--out",
  path.join(tempDir, "operator-workstation.json")
]);
assert.ok(["ready", "action-required"].includes(workstationPrep.status));
assert.ok(workstationPrep.manualActions.some((action) => action.includes("registry")));
const kubeCheck = workstationPrep.checks.find((item) => item.name === "kubectl.cluster");
if (kubeCheck?.passed) {
  assert.ok(!workstationPrep.manualActions.some((action) => action.includes("kubeconfig")));
} else {
  assert.ok(workstationPrep.manualActions.some((action) => action.includes("kubeconfig")));
}

const valuesEnv = runNode([
  "scripts/create-lakehouse-production-env-from-values.js",
  "--values",
  "ops/lakehouse-production.values.example.json",
  "--dry-run"
]);
assert.equal(valuesEnv.status, "dry-run");
assert.ok(valuesEnv.withheldSecretKeys.includes("TURBALANCE_COLLECTOR_TOKEN"));

const imageLock = runNode([
  "scripts/generate-lakehouse-image-lock.js",
  "--env-file",
  "ops/lakehouse-production.env.example",
  "--dry-run"
]);
assert.equal(imageLock.status, "dry-run");
assert.ok(imageLock.images.some((item) => item.image.includes("/api-server:")));

const imageSignatures = runNode([
  "scripts/sign-lakehouse-images.js",
  "--env-file",
  "ops/lakehouse-production.env.example",
  "--dry-run"
]);
assert.equal(imageSignatures.status, "dry-run");
assert.ok(imageSignatures.commands.some((command) => command.includes("cosign verify")));

const imageRelease = runNode([
  "scripts/run-lakehouse-image-release.js",
  "--env-file",
  "ops/lakehouse-production.env.example",
  "--dry-run",
  "--out-dir",
  path.join(tempDir, "image-release")
]);
assert.equal(imageRelease.ok, true);
assert.equal(imageRelease.dryRun, true);
assert.ok(imageRelease.stages.some((stage) => stage.name === "build"));
assert.ok(imageRelease.stages.some((stage) => stage.name === "image-lock"));
assert.ok(imageRelease.stages.some((stage) => stage.name === "image-signatures"));

const localRegistry = runNode([
  "scripts/prepare-lakehouse-local-registry.js",
  "--env-file",
  "ops/lakehouse-production.env.example",
  "--docker-context",
  "spark1",
  "--destination-registry",
  "localhost:5000/turbalance",
  "--start",
  "--push",
  "--validate",
  "--dry-run",
  "--out",
  path.join(tempDir, "local-registry.json")
]);
assert.equal(localRegistry.status, "dry-run");
assert.equal(localRegistry.dockerContext, "spark1");
assert.equal(localRegistry.destinationRegistry, "localhost:5000/turbalance");
assert.equal(localRegistry.kubernetes.imageRegistry, "localhost:5000/turbalance");
assert.ok(localRegistry.registry.create.includes("docker --context spark1 run"));
assert.ok(localRegistry.images.some((image) => image.source.includes("ghcr.io/acme/turbalance/api-server:")));
assert.ok(localRegistry.images.some((image) => image.destination.includes("localhost:5000/turbalance/api-server:")));

const singleHostOverlayDir = path.join(tempDir, "single-host-overlay");
const singleHostOverlay = runNode([
  "scripts/render-lakehouse-single-host-overlay.js",
  "--out",
  singleHostOverlayDir,
  "--registry",
  "localhost:5000/turbalance",
  "--tag",
  "2026.06.04.2"
]);
assert.equal(singleHostOverlay.status, "rendered");
assert.equal(singleHostOverlay.registry, "localhost:5000/turbalance");
assert.equal(singleHostOverlay.queueBackend, "file");
const singleHostKustomization = fs.readFileSync(path.join(singleHostOverlayDir, "kustomization.yaml"), "utf8");
const singleHostPatch = fs.readFileSync(path.join(singleHostOverlayDir, "single-host-config-patch.yaml"), "utf8");
const singleHostRuntimePatch = fs.readFileSync(path.join(singleHostOverlayDir, "single-host-runtime-patch.yaml"), "utf8");
assert.ok(singleHostKustomization.includes("localhost:5000/turbalance/api-server"));
assert.ok(singleHostKustomization.includes("delete-placeholder-secrets.yaml"));
assert.ok(singleHostPatch.includes('TURBALANCE_QUEUE_GATEWAY_BACKEND: "file"'));
assert.ok(singleHostRuntimePatch.includes("TURBALANCE_DISCOVERY_DATABASE_URL"));
assert.ok(singleHostRuntimePatch.includes("mkdir -p"));
assert.ok(singleHostRuntimePatch.includes("DAGSTER_HOME"));
assert.ok(singleHostRuntimePatch.includes("export HOME"));
assert.ok(singleHostRuntimePatch.includes("enabled: false"));
assert.ok(singleHostRuntimePatch.includes("type: Recreate"));

const nativePackage = runNode([
  "scripts/package-lakehouse-native-ebpf.js",
  "--out-dir",
  path.join(tempDir, "native-ebpf"),
  "--archive"
]);
assert.equal(nativePackage.status, "ready");
assert.ok(fs.existsSync(nativePackage.manifest));
assert.ok(fs.existsSync(nativePackage.checksums));
const nativePackageManifest = JSON.parse(fs.readFileSync(nativePackage.manifest, "utf8"));
assert.ok(nativePackageManifest.install.hostValidation.includes("--native-build-mode prebuilt"));

const changeWindow = runNode([
  "scripts/generate-lakehouse-change-window.js",
  "--env-file",
  "ops/lakehouse-production.env.example",
  "--release-dir",
  path.join(goLiveDir, "release"),
  "--out-dir",
  path.join(tempDir, "change-window")
]);
assert.equal(changeWindow.status, "ready");
assert.ok(changeWindow.commands.rollback.some((command) => command.includes("rollout undo")));

const productionGaps = runNode([
  "scripts/report-lakehouse-production-gaps.js",
  "--env-file",
  "ops/lakehouse-production.env.example",
  "--values-file",
  "ops/lakehouse-production.values.example.json",
  "--target-host",
  "user@192.168.10.20",
  "--out-dir",
  path.join(tempDir, "production-gaps")
]);
assert.equal(productionGaps.status, "action-required");
assert.equal(productionGaps.targetHostMode, "dry-run");
assert.ok(productionGaps.requiredActions.some((action) => action.includes("target-host preparation")));
assert.ok(productionGaps.requiredActions.some((action) => action.includes("image release")));

const activationBundle = runNode([
  "scripts/create-lakehouse-production-activation-bundle.js",
  "--env-file",
  "ops/lakehouse-production.env.example",
  "--values-file",
  "ops/lakehouse-production.values.example.json",
  "--out-dir",
  path.join(tempDir, "activation"),
  "--target-host",
  "user@192.168.10.20",
  "--remote-root",
  "/home/user/Analytics"
]);
assert.equal(activationBundle.ok, true);
assert.equal(activationBundle.targetHost, "user@192.168.10.20");
assert.equal(activationBundle.remoteRoot, "/home/user/Analytics");
assert.ok(fs.existsSync(activationBundle.artifacts.markdown));
assert.ok(activationBundle.stages.some((stage) => stage.name === "target-host-prep"));
assert.ok(activationBundle.stages.some((stage) => stage.name === "image-release"));
assert.ok(activationBundle.stages.some((stage) => stage.name === "production-gaps"));
assert.ok(fs.existsSync(activationBundle.artifacts.productionGaps));

console.log("lakehouse go-live tests passed");
