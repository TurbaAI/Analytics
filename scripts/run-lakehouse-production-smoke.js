#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result.stdout;
}

function assertIncludes(value, needle, label) {
  if (!value.includes(needle)) {
    throw new Error(`${label} should include ${needle}`);
  }
}

function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "turbalance-lakehouse-smoke-"));
  const overlayDir = path.join(temp, "overlay");
  const secretsPath = path.join(temp, "secrets.yaml");

  run("node", ["--check", "scripts/render-lakehouse-kustomize-overlay.js"]);
  run("node", ["--check", "scripts/render-lakehouse-secrets.js"]);
  run("node", ["--check", "scripts/package-lakehouse-release.js"]);
  run("node", ["--check", "scripts/render-lakehouse-single-host-overlay.js"]);
  run("node", ["--check", "scripts/validate-lakehouse-production-config.js"]);
  run("node", ["--check", "scripts/generate-lakehouse-production-env.js"]);
  run("node", ["--check", "scripts/create-lakehouse-production-env-from-values.js"]);
  run("node", ["--check", "scripts/validate-lakehouse-secret-material.js"]);
  run("node", ["--check", "scripts/sync-lakehouse-aws-secrets.js"]);
  run("node", ["--check", "scripts/validate-lakehouse-externalsecrets.js"]);
  run("node", ["--check", "scripts/validate-lakehouse-image-registry.js"]);
  run("node", ["--check", "scripts/generate-lakehouse-image-lock.js"]);
  run("node", ["--check", "scripts/sign-lakehouse-images.js"]);
  run("node", ["--check", "scripts/configure-lakehouse-registry-auth.js"]);
  run("node", ["--check", "scripts/validate-lakehouse-live-observability.js"]);
  run("node", ["--check", "scripts/validate-lakehouse-terraform.js"]);
  run("node", ["--check", "scripts/run-lakehouse-terraform-rollout.js"]);
  run("node", ["--check", "scripts/validate-lakehouse-kubernetes-release.js"]);
  run("node", ["--check", "scripts/prepare-lakehouse-kube-access.js"]);
  run("node", ["--check", "scripts/prepare-lakehouse-cluster-prereqs.js"]);
  run("node", ["--check", "scripts/validate-lakehouse-secret-iam-consistency.js"]);
  run("node", ["--check", "scripts/validate-lakehouse-ebpf-probe-package.js"]);
  run("node", ["--check", "scripts/validate-lakehouse-live-prerequisites.js"]);
  run("node", ["--check", "scripts/validate-lakehouse-release-supply-chain.js"]);
  run("node", ["--check", "scripts/package-lakehouse-native-ebpf.js"]);
  run("node", ["--check", "scripts/generate-lakehouse-change-window.js"]);
  run("node", ["--check", "scripts/create-lakehouse-production-activation-bundle.js"]);
  run("node", ["--check", "scripts/bootstrap-lakehouse-production-material.js"]);
  run("node", ["--check", "scripts/prepare-lakehouse-operator-workstation.js"]);
  run("node", ["--check", "scripts/prepare-lakehouse-target-host.js"]);
  run("node", ["--check", "scripts/prepare-lakehouse-local-registry.js"]);
  run("node", ["--check", "scripts/run-lakehouse-image-release.js"]);
  run("node", ["--check", "scripts/report-lakehouse-production-gaps.js"]);
  run("node", ["--check", "scripts/validate-lakehouse-slo-policy.js"]);
  run("node", ["--check", "scripts/prepare-screenshot-qa.js"]);
  run("node", ["--check", "scripts/collect-lakehouse-ebpf-rollout-evidence.js"]);
  run("node", ["--check", "scripts/audit-lakehouse-production-readiness.js"]);
  run("node", ["--check", "scripts/run-lakehouse-go-live.js"]);
  run("node", ["--check", "scripts/run-lakehouse-load-test.js"]);
  run("node", ["--check", "scripts/run-lakehouse-cluster-smoke.js"]);
  run("node", ["--check", "scripts/run-lakehouse-burn-in.js"]);
  run("node", ["--check", "scripts/run-ebpf-fleet-validation.js"]);
  run("node", ["--check", "scripts/validate-ebpf-agent-host.js"]);
  run("node", ["--check", "scripts/validate-lakehouse-security.js"]);
  run("node", ["--check", "scripts/validate-lakehouse-alerts-dashboards.js"]);
  const loadDryRun = JSON.parse(run("node", ["scripts/run-lakehouse-load-test.js", "--dry-run", "--requests", "8", "--concurrency", "2"]));
  if (loadDryRun.status !== "dry-run" || loadDryRun.requests !== 8 || loadDryRun.concurrency !== 2) {
    throw new Error("load-test dry-run did not preserve requested parameters");
  }

  const terraformStatic = JSON.parse(run("node", ["scripts/validate-lakehouse-terraform.js"]));
  if (terraformStatic.status !== "ok") {
    throw new Error("Terraform static validation did not pass");
  }
  const terraformRollout = JSON.parse(run("node", [
    "scripts/run-lakehouse-terraform-rollout.js",
    "--env-file",
    "ops/lakehouse-production.env.example",
    "--out-dir",
    path.join(temp, "terraform-rollout")
  ]));
  if (terraformRollout.status !== "dry-run" || !terraformRollout.commands.some((command) => command.includes("terraform") && command.includes("plan"))) {
    throw new Error("Terraform rollout dry-run did not include expected plan commands");
  }

  const secretIam = JSON.parse(run("node", [
    "scripts/validate-lakehouse-secret-iam-consistency.js",
    "--include-consul"
  ]));
  if (secretIam.status !== "ok" || !secretIam.checks.some((item) => item.name === "terraform.secret.lakehouse/consul" && item.passed)) {
    throw new Error("secret/IAM consistency validation did not include optional Consul binding");
  }

  const ebpfProbePackage = JSON.parse(run("node", ["scripts/validate-lakehouse-ebpf-probe-package.js"]));
  if (ebpfProbePackage.status !== "ok" || !ebpfProbePackage.checks.some((item) => item.name === "probe.native-ebpf-readiness.metrics" && item.passed)) {
    throw new Error("eBPF probe package validation did not pass");
  }
  if (!ebpfProbePackage.checks.some((item) => item.name === "probe.native-ebpf-core.tracepoints" && item.passed)) {
    throw new Error("eBPF native program package validation did not include tracepoint coverage");
  }

  const livePrerequisites = JSON.parse(run("node", [
    "scripts/validate-lakehouse-live-prerequisites.js",
    "--env-file",
    "ops/lakehouse-production.env.example"
  ]));
  if (livePrerequisites.status !== "planned" || !livePrerequisites.commands.some((command) => command.includes("aws sts get-caller-identity"))) {
    throw new Error("live prerequisites gate did not produce expected live command plan");
  }

  const sloPolicy = JSON.parse(run("node", ["scripts/validate-lakehouse-slo-policy.js"]));
  if (sloPolicy.status !== "ok" || !sloPolicy.checks.some((item) => item.name === "alert.TurbalanceVirtualSensorFreshness.present" && item.passed)) {
    throw new Error("SLO policy validation did not include virtual sensor freshness alert");
  }

  const screenshotQaPrep = JSON.parse(run("node", ["scripts/prepare-screenshot-qa.js"]));
  if (!["ready", "missing"].includes(screenshotQaPrep.status) || !screenshotQaPrep.commands.some((command) => command.includes("run-screenshot-qa.js"))) {
    throw new Error("screenshot QA preparation report did not include expected commands");
  }

  const clusterPrereqs = JSON.parse(run("node", ["scripts/prepare-lakehouse-cluster-prereqs.js"]));
  if (clusterPrereqs.status !== "planned" || !clusterPrereqs.commands.some((command) => command.includes("cert-manager")) || !clusterPrereqs.commands.some((command) => command.includes("external-secrets")) || !clusterPrereqs.commands.some((command) => command.includes("prometheus-operator"))) {
    throw new Error("cluster prerequisite planner did not include expected add-on commands");
  }

  const targetHostPrep = JSON.parse(run("node", [
    "scripts/prepare-lakehouse-target-host.js",
    "--target-host",
    "user@192.168.10.20",
    "--dry-run",
    "--out",
    path.join(temp, "target-host-prep.json")
  ]));
  if (targetHostPrep.status !== "dry-run" || targetHostPrep.targetHost !== "user@192.168.10.20" || !targetHostPrep.commands.syncRepository.includes("rsync")) {
    throw new Error("target-host preparation dry-run did not include expected SSH/rsync plan");
  }

  const workstationPrep = JSON.parse(run("node", [
    "scripts/prepare-lakehouse-operator-workstation.js",
    "--env-file",
    "ops/lakehouse-production.env.example",
    "--out",
    path.join(temp, "operator-workstation.json")
  ]));
  if (!["ready", "action-required"].includes(workstationPrep.status) || !workstationPrep.manualActions.some((action) => action.includes("Docker"))) {
    throw new Error("operator workstation prep did not include expected live rollout actions");
  }

  const imageRelease = JSON.parse(run("node", [
    "scripts/run-lakehouse-image-release.js",
    "--env-file",
    "ops/lakehouse-production.env.example",
    "--dry-run",
    "--out-dir",
    path.join(temp, "image-release")
  ]));
  if (!imageRelease.ok || !imageRelease.dryRun || !imageRelease.stages.some((stage) => stage.name === "build") || !imageRelease.stages.some((stage) => stage.name === "image-lock") || !imageRelease.stages.some((stage) => stage.name === "image-signatures")) {
    throw new Error("image release dry-run did not include build, lock, and signature stages");
  }

  const productionGaps = JSON.parse(run("node", [
    "scripts/report-lakehouse-production-gaps.js",
    "--env-file",
    "ops/lakehouse-production.env.example",
    "--values-file",
    "ops/lakehouse-production.values.example.json",
    "--target-host",
    "user@192.168.10.20",
    "--out-dir",
    path.join(temp, "production-gaps")
  ]));
  if (productionGaps.status !== "action-required" || productionGaps.targetHostMode !== "dry-run" || !productionGaps.requiredActions.some((action) => action.includes("target-host preparation")) || !productionGaps.requiredActions.some((action) => action.includes("image release"))) {
    throw new Error("production gap report did not include target-host and image-release actions");
  }

  const envAssembly = JSON.parse(run("node", [
    "scripts/generate-lakehouse-production-env.js",
    "--env-file",
    "ops/lakehouse-production.env.example",
    "--dry-run"
  ]));
  if (envAssembly.status !== "dry-run" || !envAssembly.envPreview.some((line) => line.startsWith("TURBALANCE_IMAGE_REGISTRY="))) {
    throw new Error("production env assembly dry-run did not include expected env values");
  }

  const valuesEnvAssembly = JSON.parse(run("node", [
    "scripts/create-lakehouse-production-env-from-values.js",
    "--values",
    "ops/lakehouse-production.values.example.json",
    "--dry-run"
  ]));
  if (valuesEnvAssembly.status !== "dry-run" || !valuesEnvAssembly.withheldSecretKeys.includes("TURBALANCE_COLLECTOR_TOKEN")) {
    throw new Error("production values env assembly did not redact and withhold secret values");
  }

  const secretMaterial = JSON.parse(run("node", [
    "scripts/validate-lakehouse-secret-material.js",
    "--env-file",
    "ops/lakehouse-production.env.example",
    "--values",
    "ops/lakehouse-production.values.example.json"
  ]));
  if (!["planned", "ready"].includes(secretMaterial.status) || !secretMaterial.groups.some((item) => item.name === "collector-auth")) {
    throw new Error("secret material validator did not include collector auth readiness");
  }

  const secretSyncDryRun = JSON.parse(run("node", [
    "scripts/sync-lakehouse-aws-secrets.js",
    "--env-file",
    "ops/lakehouse-production.env.example",
    "--dry-run"
  ]));
  if (secretSyncDryRun.status !== "dry-run" || !secretSyncDryRun.bindings.some((item) => item.remoteKey === "lakehouse/api-auth")) {
    throw new Error("AWS secret sync dry-run did not include expected lakehouse secrets");
  }

  const externalSecretDryRun = JSON.parse(run("node", [
    "scripts/validate-lakehouse-externalsecrets.js",
    "--namespace",
    "turbalance-lakehouse",
    "--dry-run"
  ]));
  if (externalSecretDryRun.status !== "dry-run" || !externalSecretDryRun.checks.some((item) => item.externalSecret === "turbalance-api-auth")) {
    throw new Error("ExternalSecret dry-run did not include expected bindings");
  }

  const imageRegistryDryRun = JSON.parse(run("node", [
    "scripts/validate-lakehouse-image-registry.js",
    "--env-file",
    "ops/lakehouse-production.env.example",
    "--dry-run"
  ]));
  if (imageRegistryDryRun.status !== "dry-run" || !imageRegistryDryRun.images.some((item) => item.image.includes("/api-server:"))) {
    throw new Error("image registry dry-run did not include expected platform images");
  }

  const imageLockDryRun = JSON.parse(run("node", [
    "scripts/generate-lakehouse-image-lock.js",
    "--env-file",
    "ops/lakehouse-production.env.example",
    "--dry-run"
  ]));
  if (imageLockDryRun.status !== "dry-run" || !imageLockDryRun.images.some((item) => item.command.includes("docker manifest inspect"))) {
    throw new Error("image lock dry-run did not include expected docker manifest checks");
  }

  const imageSignatureDryRun = JSON.parse(run("node", [
    "scripts/sign-lakehouse-images.js",
    "--env-file",
    "ops/lakehouse-production.env.example",
    "--dry-run"
  ]));
  if (imageSignatureDryRun.status !== "dry-run" || !imageSignatureDryRun.commands.some((command) => command.includes("cosign sign"))) {
    throw new Error("image signature dry-run did not include expected cosign commands");
  }

  const observabilityDryRun = JSON.parse(run("node", [
    "scripts/validate-lakehouse-live-observability.js",
    "--env-file",
    "ops/lakehouse-production.env.example",
    "--api-url",
    "http://api-server.turbalance-lakehouse.svc.cluster.local:8080",
    "--dry-run"
  ]));
  if (observabilityDryRun.status !== "dry-run" || !observabilityDryRun.checks.some((item) => item.name === "covariance_virtual_sensor")) {
    throw new Error("live observability dry-run did not include expected virtual sensor checks");
  }

  run("node", ["scripts/render-lakehouse-secrets.js", "--example", "--out", secretsPath]);
  const secrets = fs.readFileSync(secretsPath, "utf8");
  assertIncludes(secrets, "turbalance-metadata-db", "rendered secrets");
  assertIncludes(secrets, "turbalance-object-store", "rendered secrets");
  assertIncludes(secrets, "turbalance-collector-queue-auth", "rendered secrets");

  run("node", [
    "scripts/render-lakehouse-kustomize-overlay.js",
    "--out",
    overlayDir,
    "--registry",
    "ghcr.io/acme/turbalance",
    "--tag",
    "smoke",
    "--lake-root",
    "s3://acme/turbalance/lakehouse",
    "--jwt-issuer",
    "https://issuer.example",
    "--jwt-audience",
    "turbalance-api",
    "--queue-backend",
    "kafka",
    "--queue-broker-url",
    "kafka.kafka.svc.cluster.local:9092",
    "--queue-topic",
    "turbalance.collector.telemetry"
  ]);
  const kustomization = fs.readFileSync(path.join(overlayDir, "kustomization.yaml"), "utf8");
  const patch = fs.readFileSync(path.join(overlayDir, "production-config-patch.yaml"), "utf8");
  assertIncludes(kustomization, "lakehouse-platform-auth-secrets.yaml", "production overlay");
  assertIncludes(kustomization, "lakehouse-managed-storage.yaml", "production overlay");
  assertIncludes(kustomization, "lakehouse-otel-backend-secret.yaml", "production overlay");
  assertIncludes(kustomization, "delete-placeholder-secrets.yaml", "production overlay");
  assertIncludes(kustomization, "ghcr.io/acme/turbalance/api-server", "production overlay");
  assertIncludes(patch, "TURBALANCE_API_REQUIRE_AUTH", "production patch");
  assertIncludes(patch, "TURBALANCE_QUEUE_GATEWAY_BACKEND", "production patch");
  assertIncludes(patch, "s3://acme/turbalance/lakehouse", "production patch");

  const singleHostOverlayDir = path.join(temp, "single-host-overlay");
  const singleHost = JSON.parse(run("node", [
    "scripts/render-lakehouse-single-host-overlay.js",
    "--out",
    singleHostOverlayDir,
    "--registry",
    "localhost:5000/turbalance",
    "--tag",
    "smoke"
  ]));
  if (singleHost.status !== "rendered" || singleHost.queueBackend !== "file") {
    throw new Error("single-host overlay renderer did not produce the expected local profile");
  }
  const singleHostKustomization = fs.readFileSync(path.join(singleHostOverlayDir, "kustomization.yaml"), "utf8");
  const singleHostPatch = fs.readFileSync(path.join(singleHostOverlayDir, "single-host-config-patch.yaml"), "utf8");
  const singleHostRuntimePatch = fs.readFileSync(path.join(singleHostOverlayDir, "single-host-runtime-patch.yaml"), "utf8");
  assertIncludes(singleHostKustomization, "lakehouse/base", "single-host overlay");
  assertIncludes(singleHostKustomization, "localhost:5000/turbalance/api-server", "single-host overlay");
  assertIncludes(singleHostKustomization, "delete-placeholder-secrets.yaml", "single-host overlay");
  assertIncludes(singleHostPatch, "TURBALANCE_QUEUE_GATEWAY_BACKEND: \"file\"", "single-host patch");
  assertIncludes(singleHostPatch, "TURBALANCE_API_REQUIRE_AUTH: \"false\"", "single-host patch");
  assertIncludes(singleHostRuntimePatch, "TURBALANCE_DISCOVERY_DATABASE_URL", "single-host runtime patch");
  assertIncludes(singleHostRuntimePatch, "mkdir -p \\\"$DAGSTER_HOME\\\"", "single-host runtime patch");

  const releaseDir = path.join(temp, "release");
  const release = JSON.parse(run("node", [
    "scripts/package-lakehouse-release.js",
    "--out",
    releaseDir,
    "--no-archive",
    "--registry",
    "ghcr.io/acme/turbalance",
    "--tag",
    "smoke",
    "--lake-root",
    "s3://acme/turbalance/lakehouse",
    "--jwt-issuer",
    "https://issuer.acme.internal",
    "--queue-broker-url",
    "kafka.kafka.svc.cluster.local:9092",
    "--certificate-mode",
    "spire"
  ]));
  assertIncludes(fs.readFileSync(release.manifest, "utf8"), "\"status\": \"ready\"", "release manifest");

  const supplyChain = JSON.parse(run("node", [
    "scripts/validate-lakehouse-release-supply-chain.js",
    "--release-dir",
    releaseDir,
    "--registry",
    "ghcr.io/acme/turbalance",
    "--tag",
    "smoke"
  ]));
  if (supplyChain.status !== "ok" || !supplyChain.checks.some((item) => item.name.includes("Dockerfile.platform-service.nonroot") && item.passed)) {
    throw new Error("release supply-chain validation did not pass image hardening checks");
  }

  const nativeEbpfPackage = JSON.parse(run("node", [
    "scripts/package-lakehouse-native-ebpf.js",
    "--out-dir",
    path.join(temp, "native-ebpf"),
    "--archive"
  ]));
  if (nativeEbpfPackage.status !== "ready" || !fs.existsSync(nativeEbpfPackage.manifest) || !nativeEbpfPackage.archivePath.endsWith(".tar.gz")) {
    throw new Error("native eBPF package did not produce expected manifest and archive");
  }

  const changeWindow = JSON.parse(run("node", [
    "scripts/generate-lakehouse-change-window.js",
    "--env-file",
    "ops/lakehouse-production.env.example",
    "--release-dir",
    releaseDir,
    "--out-dir",
    path.join(temp, "change-window")
  ]));
  if (!["ready", "planned"].includes(changeWindow.status) || !changeWindow.commands.rollback.some((command) => command.includes("rollout undo"))) {
    throw new Error("change-window artifact did not include rollback commands");
  }

  const activationBundle = JSON.parse(run("node", [
    "scripts/create-lakehouse-production-activation-bundle.js",
    "--env-file",
    "ops/lakehouse-production.env.example",
    "--values-file",
    "ops/lakehouse-production.values.example.json",
    "--out-dir",
    path.join(temp, "activation"),
    "--target-host",
    "user@192.168.10.20"
  ]));
  if (!activationBundle.ok || activationBundle.targetHost !== "user@192.168.10.20" || !fs.existsSync(activationBundle.artifacts.markdown)) {
    throw new Error("activation bundle did not produce expected target-host handoff artifacts");
  }
  if (!activationBundle.stages.some((stage) => stage.name === "target-host-prep") || !activationBundle.stages.some((stage) => stage.name === "image-release") || !activationBundle.stages.some((stage) => stage.name === "production-gaps")) {
    throw new Error("activation bundle did not include final target-host, image-release, and gap-report stages");
  }

  const clusterDryRun = JSON.parse(run("node", [
    "scripts/run-lakehouse-cluster-smoke.js",
    "--dry-run",
    "--namespace",
    "turbalance-lakehouse",
    "--overlay",
    path.join(releaseDir, "kustomize")
  ]));
  if (
    clusterDryRun.status !== "dry-run" ||
    !clusterDryRun.serviceChecks.some((command) => command.includes("exec deploy/api-server")) ||
    !clusterDryRun.serviceChecks.some((command) => command.includes("http://api-server:8080/health"))
  ) {
    throw new Error("cluster smoke dry-run did not include expected service checks");
  }
  const kubernetesRelease = JSON.parse(run("node", [
    "scripts/validate-lakehouse-kubernetes-release.js",
    "--namespace",
    "turbalance-lakehouse",
    "--overlay",
    path.join(releaseDir, "kustomize")
  ]));
  if (kubernetesRelease.status !== "dry-run" || !kubernetesRelease.checks.some((item) => item.name === "placeholders" && item.passed)) {
    throw new Error("Kubernetes release preflight did not validate the rendered overlay");
  }
  const ebpfContract = JSON.parse(run("node", [
    "scripts/validate-ebpf-agent-host.js",
    "--contract-only",
    "--probe-command",
    "printf 'ebpf.test=1\\n'"
  ]));
  if (ebpfContract.status !== "ready") {
    throw new Error("eBPF probe command contract did not validate");
  }
  for (const script of ["scripts/validate-lakehouse-security.js", "scripts/validate-lakehouse-alerts-dashboards.js"]) {
    const validation = JSON.parse(run("node", [script]));
    if (validation.status !== "ok") {
      throw new Error(`${script} returned ${validation.status}`);
    }
  }
  const goLive = JSON.parse(run("node", [
    "scripts/run-lakehouse-go-live.js",
    "--env-file",
    "ops/lakehouse-production.env.example",
    "--out-dir",
    path.join(temp, "go-live")
  ]));
  if (!goLive.ok || !goLive.stages.some((stage) => stage.name === "release-package")) {
    throw new Error("lakehouse go-live dry-run did not produce a release package stage");
  }
  if (!goLive.stages.some((stage) => stage.name === "live-prerequisites") || !goLive.stages.some((stage) => stage.name === "cluster-prerequisites") || !goLive.stages.some((stage) => stage.name === "release-supply-chain") || !goLive.stages.some((stage) => stage.name === "slo-policy")) {
    throw new Error("lakehouse go-live dry-run did not include final production hardening gates");
  }
  if (!goLive.stages.some((stage) => stage.name === "aws-secret-sync") || !goLive.stages.some((stage) => stage.name === "externalsecrets")) {
    throw new Error("lakehouse go-live dry-run did not include secret-store gates");
  }
  if (!goLive.stages.some((stage) => stage.name === "image-registry") || !goLive.stages.some((stage) => stage.name === "live-observability")) {
    throw new Error("lakehouse go-live dry-run did not include image and observability gates");
  }
  if (!goLive.stages.some((stage) => stage.name === "production-values-env-assembly") || !goLive.stages.some((stage) => stage.name === "secret-material") || !goLive.stages.some((stage) => stage.name === "image-lock") || !goLive.stages.some((stage) => stage.name === "image-signatures") || !goLive.stages.some((stage) => stage.name === "native-ebpf-package") || !goLive.stages.some((stage) => stage.name === "change-window")) {
    throw new Error("lakehouse go-live dry-run did not include final activation artifacts");
  }

  const readiness = JSON.parse(run("node", [
    "scripts/audit-lakehouse-production-readiness.js",
    "--env-file",
    "ops/lakehouse-production.env.example",
    "--out-dir",
    path.join(temp, "readiness")
  ]));
  if (!readiness.ok || !readiness.stages.some((stage) => stage.name === "terraform-static")) {
    throw new Error("lakehouse production readiness audit did not pass");
  }
  if (!readiness.stages.some((stage) => stage.name === "live-prerequisites") || !readiness.stages.some((stage) => stage.name === "cluster-prerequisites") || !readiness.stages.some((stage) => stage.name === "release-supply-chain") || !readiness.stages.some((stage) => stage.name === "slo-policy")) {
    throw new Error("lakehouse production readiness audit did not include final production hardening gates");
  }
  if (!readiness.stages.some((stage) => stage.name === "production-env-assembly") || !readiness.stages.some((stage) => stage.name === "ebpf-rollout-evidence")) {
    throw new Error("lakehouse production readiness audit did not include final readiness gates");
  }
  if (!readiness.stages.some((stage) => stage.name === "production-values-env-assembly") || !readiness.stages.some((stage) => stage.name === "secret-material") || !readiness.stages.some((stage) => stage.name === "image-lock") || !readiness.stages.some((stage) => stage.name === "image-signatures") || !readiness.stages.some((stage) => stage.name === "native-ebpf-package") || !readiness.stages.some((stage) => stage.name === "change-window")) {
    throw new Error("lakehouse production readiness audit did not include activation artifact gates");
  }

  console.log(JSON.stringify({ status: "ok", overlayDir, secretsPath, releaseDir, goLiveDir: path.join(temp, "go-live"), readinessDir: path.join(temp, "readiness") }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
