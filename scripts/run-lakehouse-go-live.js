#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const imageNames = [
  "collector-gateway",
  "duckdb-query-service",
  "api-server",
  "discovery-api",
  "queue-gateway",
  "raw-writer",
  "transform-runner",
  "ebpf-agent",
  "dagster",
  "sqlmesh"
];

function parseArgs(argv) {
  const args = {
    envFile: process.env.TURBALANCE_LAKEHOUSE_ENV_FILE || "ops/lakehouse-production.env.example",
    valuesFile: process.env.TURBALANCE_LAKEHOUSE_VALUES_FILE || "ops/lakehouse-production.values.example.json",
    outDir: process.env.TURBALANCE_GO_LIVE_OUT_DIR || path.join("build", "lakehouse-go-live"),
    previousOverlay: process.env.TURBALANCE_PREVIOUS_OVERLAY || "",
    allowExample: false,
    applyInfra: false,
    buildImages: false,
    pushImages: false,
    buildNativeEbpf: false,
    strictSecrets: false,
    signImages: false,
    verifyImageSignatures: false,
    deploy: false,
    burnIn: false,
    validateEbpf: false,
    syncAwsSecrets: false,
    validateExternalSecrets: false,
    includeConsulSecret: false,
    validateImages: false,
    validateObservability: false,
    collectEbpfEvidence: false,
    installClusterPrereqs: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--allow-example") args.allowExample = true;
    else if (arg === "--apply-infra") args.applyInfra = true;
    else if (arg === "--build-images") args.buildImages = true;
    else if (arg === "--push-images") {
      args.pushImages = true;
      args.buildImages = true;
    } else if (arg === "--deploy") args.deploy = true;
    else if (arg === "--build-native-ebpf") args.buildNativeEbpf = true;
    else if (arg === "--strict-secrets") args.strictSecrets = true;
    else if (arg === "--sign-images") args.signImages = true;
    else if (arg === "--verify-image-signatures") args.verifyImageSignatures = true;
    else if (arg === "--burn-in") args.burnIn = true;
    else if (arg === "--validate-ebpf") args.validateEbpf = true;
    else if (arg === "--sync-aws-secrets") args.syncAwsSecrets = true;
    else if (arg === "--validate-externalsecrets") args.validateExternalSecrets = true;
    else if (arg === "--include-consul-secret") args.includeConsulSecret = true;
    else if (arg === "--validate-images") args.validateImages = true;
    else if (arg === "--validate-observability") args.validateObservability = true;
    else if (arg === "--collect-ebpf-evidence") args.collectEbpfEvidence = true;
    else if (arg === "--install-cluster-prereqs") args.installClusterPrereqs = true;
    else if (arg === "--env-file") {
      args.envFile = need(arg, next);
      index += 1;
    } else if (arg === "--values-file") {
      args.valuesFile = need(arg, next);
      index += 1;
    } else if (arg === "--previous-overlay") {
      args.previousOverlay = need(arg, next);
      index += 1;
    } else if (arg === "--out-dir") {
      args.outDir = need(arg, next);
      index += 1;
    } else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  return args;
}

function need(flag, value) {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: scripts/run-lakehouse-go-live.js --env-file <file> [options]

Default mode validates config, dry-runs image build commands, packages a release, and dry-runs cluster/burn-in/eBPF plans.

Live action flags:
  --apply-infra      Run terraform init/apply when TURBALANCE_TERRAFORM_DIR is configured
  --build-images     Build lakehouse images
  --push-images      Build and push lakehouse images
  --build-native-ebpf
                     Compile the native eBPF package on a Linux host
  --strict-secrets   Fail if required production secret material is missing
  --sign-images      Run cosign sign for all lakehouse images
  --verify-image-signatures
                     Run cosign verify for all lakehouse images
  --deploy           kubectl apply the packaged release and run live cluster smoke
  --sync-aws-secrets Sync env-derived values into AWS Secrets Manager before deploy
  --validate-images  Check pushed image manifests in the target registry
  --validate-externalsecrets
                     Check ExternalSecret readiness and target Secret keys in-cluster
  --validate-observability
                     Check live API, Grafana, OTel, and Prometheus endpoints
  --install-cluster-prereqs
                     Apply pinned cert-manager, External Secrets, and Prometheus Operator manifests before deploy
  --collect-ebpf-evidence
                     Persist eBPF rollout evidence after fleet validation
  --include-consul-secret
                     Include optional lakehouse/consul secret binding in secret checks
  --burn-in          Run live API/collector burn-in
  --validate-ebpf    Run live eBPF fleet validation
  --allow-example    Permit example values for local dry-run validation`);
}

function parseEnvFile(file) {
  const fullPath = path.resolve(root, file);
  const values = {};
  for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = unquote(match[2].trim());
  }
  return values;
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    ...options
  });
  return {
    command: [command, ...args].join(" "),
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function runRequired(command, args, options = {}) {
  const result = run(command, args, options);
  if (!result.ok) throw new Error(`${result.command} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

function runJson(command, args, options = {}) {
  const result = runRequired(command, args, options);
  return { ...result, json: JSON.parse(result.stdout) };
}

function stage(name, fn) {
  try {
    return { name, ok: true, ...fn() };
  } catch (error) {
    return { name, ok: false, error: error.message };
  }
}

function terraformStage(config, env, outDir, args) {
  const terraformDir = config.TURBALANCE_TERRAFORM_DIR || "";
  if (!terraformDir) return { status: "skipped", reason: "TURBALANCE_TERRAFORM_DIR is not set" };
  return runJson(process.execPath, [
    "scripts/run-lakehouse-terraform-rollout.js",
    "--env-file",
    args.envFile,
    "--dir",
    terraformDir,
    "--out-dir",
    path.join(outDir, "terraform-rollout"),
    ...(args.applyInfra ? ["--apply"] : [])
  ], { env }).json;
}

function terraformValidationStage(config, env, outDir, applyInfra) {
  return runJson(process.execPath, [
    "scripts/validate-lakehouse-terraform.js",
    "--dir",
    config.TURBALANCE_TERRAFORM_DIR || "ops/terraform/lakehouse/aws",
    "--out",
    path.join(outDir, "terraform-static.json"),
    ...(applyInfra ? ["--run-terraform"] : [])
  ], { env }).json;
}

function awsSecretSyncStage(config, env, outDir, args) {
  const includeConsul = args.includeConsulSecret || Boolean(config.TURBALANCE_CONSUL_URL || config.TURBALANCE_CONSUL_TOKEN);
  return runJson(process.execPath, [
    "scripts/sync-lakehouse-aws-secrets.js",
    "--env-file",
    args.envFile,
    "--out",
    path.join(outDir, "aws-secret-sync.json"),
    ...(args.syncAwsSecrets ? [] : ["--dry-run"]),
    ...(includeConsul ? ["--include-consul"] : [])
  ], { env }).json;
}

function productionEnvStage(env, outDir, args) {
  return runJson(process.execPath, [
    "scripts/generate-lakehouse-production-env.js",
    "--env-file",
    args.envFile,
    "--dry-run",
    "--report",
    path.join(outDir, "production-env-assembly.json")
  ], { env }).json;
}

function productionValuesEnvStage(env, outDir, args) {
  return runJson(process.execPath, [
    "scripts/create-lakehouse-production-env-from-values.js",
    "--values",
    args.valuesFile,
    "--dry-run",
    "--report",
    path.join(outDir, "production-values-env-assembly.json")
  ], { env }).json;
}

function secretMaterialStage(config, env, outDir, args) {
  const includeConsul = args.includeConsulSecret || Boolean(config.TURBALANCE_CONSUL_URL || config.TURBALANCE_CONSUL_TOKEN);
  return runJson(process.execPath, [
    "scripts/validate-lakehouse-secret-material.js",
    "--env-file",
    args.envFile,
    "--values",
    args.valuesFile,
    "--out",
    path.join(outDir, "secret-material.json"),
    ...(args.strictSecrets ? ["--strict"] : []),
    ...(includeConsul ? ["--include-consul"] : []),
    ...(args.allowExample ? ["--allow-placeholders"] : [])
  ], { env }).json;
}

function livePrerequisitesStage(config, env, outDir, args) {
  const live = args.applyInfra || args.buildImages || args.pushImages || args.deploy || args.syncAwsSecrets || args.validateImages || args.validateExternalSecrets || args.validateObservability || args.installClusterPrereqs || args.burnIn || args.validateEbpf || args.collectEbpfEvidence;
  return runJson(process.execPath, [
    "scripts/validate-lakehouse-live-prerequisites.js",
    "--env-file",
    args.envFile,
    "--out",
    path.join(outDir, "live-prerequisites.json"),
    ...(live ? ["--run-live-checks"] : []),
    ...(args.buildImages || args.pushImages || args.validateImages ? ["--require-docker"] : []),
    ...(args.deploy || args.validateExternalSecrets || args.installClusterPrereqs ? ["--require-kubectl"] : []),
    ...(args.syncAwsSecrets || args.applyInfra ? ["--require-aws"] : []),
    ...(args.applyInfra ? ["--require-terraform"] : []),
    ...(args.allowExample ? ["--allow-example"] : [])
  ], { env }).json;
}

function imageStage(config, env, pushImages, buildImages) {
  const build = runRequired(process.execPath, [
    "scripts/build-lakehouse-platform-images.js",
    ...(buildImages ? [] : ["--dry-run"])
  ], { env });
  const pushes = [];
  if (pushImages) {
    for (const image of imageNames) {
      pushes.push(runRequired("docker", ["push", `${config.TURBALANCE_IMAGE_REGISTRY}/${image}:${config.TURBALANCE_IMAGE_TAG}`], { env }));
    }
  }
  return { status: buildImages ? "built" : "dry-run", build, pushes };
}

function imageRegistryStage(config, env, outDir, args) {
  const live = args.validateImages || args.pushImages;
  return runJson(process.execPath, [
    "scripts/validate-lakehouse-image-registry.js",
    "--env-file",
    args.envFile,
    "--out",
    path.join(outDir, "image-registry.json"),
    ...(live ? [] : ["--dry-run"])
  ], { env }).json;
}

function imageLockStage(config, env, outDir, args) {
  const live = args.validateImages || args.pushImages;
  return runJson(process.execPath, [
    "scripts/generate-lakehouse-image-lock.js",
    "--env-file",
    args.envFile,
    "--out",
    path.join(outDir, "image-lock.json"),
    ...(live ? [] : ["--dry-run"])
  ], { env }).json;
}

function imageSignatureStage(config, env, outDir, args) {
  return runJson(process.execPath, [
    "scripts/sign-lakehouse-images.js",
    "--env-file",
    args.envFile,
    "--image-lock",
    path.join(outDir, "image-lock.json"),
    "--out",
    path.join(outDir, "image-signatures.json"),
    ...(args.signImages ? ["--sign"] : []),
    ...(args.verifyImageSignatures ? ["--verify"] : []),
    ...(!args.signImages && !args.verifyImageSignatures ? ["--dry-run"] : [])
  ], { env }).json;
}

function packageStage(config, env, outDir, allowExample) {
  const releaseDir = path.join(outDir, "release");
  const result = runJson(process.execPath, [
    "scripts/package-lakehouse-release.js",
    "--out",
    releaseDir,
    "--no-archive",
    "--registry",
    config.TURBALANCE_IMAGE_REGISTRY,
    "--tag",
    config.TURBALANCE_IMAGE_TAG,
    "--namespace",
    config.TURBALANCE_NAMESPACE,
    "--lake-root",
    config.TURBALANCE_LAKE_ROOT,
    "--jwt-issuer",
    config.TURBALANCE_API_JWT_ISSUER,
    "--jwt-audience",
    config.TURBALANCE_API_JWT_AUDIENCE,
    "--certificate-mode",
    config.TURBALANCE_DISCOVERY_CERTIFICATE_MODE,
    "--trusted-spiffe-prefix",
    config.TURBALANCE_TRUSTED_SPIFFE_PREFIX,
    "--queue-backend",
    config.TURBALANCE_QUEUE_GATEWAY_BACKEND,
    "--queue-broker-url",
    config.TURBALANCE_QUEUE_GATEWAY_BROKER_URL,
    "--queue-topic",
    config.TURBALANCE_QUEUE_GATEWAY_TOPIC,
    ...(config.TURBALANCE_DISCOVERY_EXTERNAL_CA_COMMAND ? ["--external-ca-command", config.TURBALANCE_DISCOVERY_EXTERNAL_CA_COMMAND] : []),
    ...(config.TURBALANCE_QUEUE_GATEWAY_PRODUCER_COMMAND ? ["--queue-producer-command", config.TURBALANCE_QUEUE_GATEWAY_PRODUCER_COMMAND] : []),
    ...(allowExample ? ["--allow-placeholders"] : [])
  ], { env });
  return { status: "packaged", releaseDir, result: result.json };
}

function clusterStage(config, env, releaseDir, deploy) {
  return runJson(process.execPath, [
    "scripts/run-lakehouse-cluster-smoke.js",
    ...(deploy ? ["--apply"] : ["--dry-run"]),
    "--namespace",
    config.TURBALANCE_NAMESPACE,
    "--overlay",
    path.join(releaseDir, "kustomize")
  ], { env }).json;
}

function externalSecretStage(config, env, outDir, args) {
  const includeConsul = args.includeConsulSecret || Boolean(config.TURBALANCE_CONSUL_URL || config.TURBALANCE_CONSUL_TOKEN);
  return runJson(process.execPath, [
    "scripts/validate-lakehouse-externalsecrets.js",
    "--namespace",
    config.TURBALANCE_NAMESPACE,
    "--out",
    path.join(outDir, "externalsecrets.json"),
    ...(args.validateExternalSecrets ? [] : ["--dry-run"]),
    ...(includeConsul ? ["--include-consul"] : [])
  ], { env }).json;
}

function secretIamStage(config, env, outDir, args, releaseDir) {
  const includeConsul = args.includeConsulSecret || Boolean(config.TURBALANCE_CONSUL_URL || config.TURBALANCE_CONSUL_TOKEN);
  return runJson(process.execPath, [
    "scripts/validate-lakehouse-secret-iam-consistency.js",
    "--terraform-dir",
    config.TURBALANCE_TERRAFORM_DIR || "ops/terraform/lakehouse/aws",
    "--secret-requirements",
    path.join(releaseDir, "secret-requirements.json"),
    "--out",
    path.join(outDir, "secret-iam-consistency.json"),
    ...(includeConsul ? ["--include-consul"] : [])
  ], { env }).json;
}

function kubernetesReleaseStage(config, env, outDir, args, releaseDir) {
  return runJson(process.execPath, [
    "scripts/validate-lakehouse-kubernetes-release.js",
    "--namespace",
    config.TURBALANCE_NAMESPACE,
    "--overlay",
    path.join(releaseDir, "kustomize"),
    "--out",
    path.join(outDir, "kubernetes-release.json"),
    ...(args.deploy ? ["--server-dry-run"] : []),
    ...(args.allowExample ? ["--allow-placeholders"] : [])
  ], { env }).json;
}

function clusterPrereqStage(config, env, outDir, args) {
  const live = args.deploy || args.validateExternalSecrets || args.installClusterPrereqs;
  return runJson(process.execPath, [
    "scripts/prepare-lakehouse-cluster-prereqs.js",
    "--namespace",
    config.TURBALANCE_NAMESPACE,
    "--out",
    path.join(outDir, "cluster-prerequisites.json"),
    ...(live ? ["--run-live-checks"] : []),
    ...(args.installClusterPrereqs ? ["--install", "--wait"] : [])
  ], { env }).json;
}

function supplyChainStage(config, env, outDir, releaseDir) {
  return runJson(process.execPath, [
    "scripts/validate-lakehouse-release-supply-chain.js",
    "--release-dir",
    releaseDir,
    "--registry",
    config.TURBALANCE_IMAGE_REGISTRY,
    "--tag",
    config.TURBALANCE_IMAGE_TAG,
    "--out",
    path.join(outDir, "release-supply-chain.json")
  ], { env }).json;
}

function nativeEbpfPackageStage(env, outDir, args) {
  return runJson(process.execPath, [
    "scripts/package-lakehouse-native-ebpf.js",
    "--out-dir",
    path.join(outDir, "native-ebpf"),
    "--archive",
    ...(args.buildNativeEbpf ? ["--build"] : [])
  ], { env }).json;
}

function changeWindowStage(config, env, outDir, args, releaseDir) {
  return runJson(process.execPath, [
    "scripts/generate-lakehouse-change-window.js",
    "--env-file",
    args.envFile,
    "--release-dir",
    releaseDir,
    "--out-dir",
    path.join(outDir, "change-window"),
    "--namespace",
    config.TURBALANCE_NAMESPACE,
    ...(args.previousOverlay ? ["--previous-overlay", args.previousOverlay] : [])
  ], { env }).json;
}

function sloPolicyStage(env, outDir) {
  return runJson(process.execPath, [
    "scripts/validate-lakehouse-slo-policy.js",
    "--out",
    path.join(outDir, "slo-policy.json")
  ], { env }).json;
}

function burnInStage(config, env, outDir, live) {
  return runJson(process.execPath, [
    "scripts/run-lakehouse-burn-in.js",
    ...(live ? [] : ["--dry-run"]),
    "--api-url",
    config.TURBALANCE_API_URL || `http://api-server.${config.TURBALANCE_NAMESPACE}.svc.cluster.local:8080`,
    ...(config.TURBALANCE_COLLECTOR_URL ? ["--collector-url", config.TURBALANCE_COLLECTOR_URL] : []),
    "--requests",
    String(config.TURBALANCE_BURN_IN_REQUESTS || 25),
    "--concurrency",
    String(config.TURBALANCE_BURN_IN_CONCURRENCY || 4),
    "--out",
    path.join(outDir, "burn-in.json")
  ], { env }).json;
}

function liveObservabilityStage(config, env, outDir, args) {
  const live = args.validateObservability || args.burnIn;
  return runJson(process.execPath, [
    "scripts/validate-lakehouse-live-observability.js",
    "--env-file",
    args.envFile,
    ...(live ? [] : ["--dry-run"]),
    "--api-url",
    config.TURBALANCE_API_URL || `http://api-server.${config.TURBALANCE_NAMESPACE}.svc.cluster.local:8080`,
    "--out",
    path.join(outDir, "live-observability.json")
  ], { env }).json;
}

function ebpfStage(config, env, outDir, live) {
  return runJson(process.execPath, [
    "scripts/run-ebpf-fleet-validation.js",
    ...(live ? [] : ["--dry-run"]),
    "--hosts-file",
    config.TURBALANCE_EBPF_HOSTS_FILE || "ops/lakehouse-ebpf-hosts.example.json",
    "--out",
    path.join(outDir, "ebpf-fleet.json")
  ], { env }).json;
}

function ebpfEvidenceStage(config, env, outDir, args) {
  const live = args.collectEbpfEvidence || args.validateEbpf;
  return runJson(process.execPath, [
    "scripts/collect-lakehouse-ebpf-rollout-evidence.js",
    ...(live ? [] : ["--dry-run"]),
    "--hosts-file",
    config.TURBALANCE_EBPF_HOSTS_FILE || "ops/lakehouse-ebpf-hosts.example.json",
    "--out-dir",
    path.join(outDir, "ebpf-rollout")
  ], { env }).json;
}

function ebpfProbePackageStage(env, outDir) {
  return runJson(process.execPath, [
    "scripts/validate-lakehouse-ebpf-probe-package.js",
    "--out",
    path.join(outDir, "ebpf-probe-package.json")
  ], { env }).json;
}

function markdown(report) {
  const lines = [
    "# turbalance Lakehouse Go-Live Report",
    "",
    `- Status: ${report.ok ? "PASS" : "FAIL"}`,
    `- Output directory: ${report.outDir}`,
    `- Env file: ${report.envFile}`,
    "",
    "## Stages",
    ""
  ];
  for (const item of report.stages) {
    lines.push(`- ${item.name}: ${item.ok ? "PASS" : "FAIL"}${item.status ? ` (${item.status})` : ""}`);
  }
  lines.push("", "## Artifacts", "", `- JSON report: ${report.artifacts.report}`, `- Markdown report: ${report.artifacts.markdown}`);
  if (report.artifacts.releaseManifest) lines.push(`- Release manifest: ${report.artifacts.releaseManifest}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv);
  const outDir = path.resolve(root, args.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const config = parseEnvFile(args.envFile);
  const env = { ...process.env, ...config };

  const stages = [];
  stages.push(stage("production-config", () => {
    const result = runJson(process.execPath, [
      "scripts/validate-lakehouse-production-config.js",
      "--env-file",
      args.envFile,
      "--out",
      path.join(outDir, "production-config.json"),
      ...(args.allowExample ? ["--allow-example"] : [])
    ], { env });
    if (!result.json.ok) throw new Error(result.stdout);
    return { status: "validated", report: result.json };
  }));
  stages.push(stage("production-env-assembly", () => productionEnvStage(env, outDir, args)));
  stages.push(stage("production-values-env-assembly", () => productionValuesEnvStage(env, outDir, args)));
  stages.push(stage("secret-material", () => secretMaterialStage(config, env, outDir, args)));
  stages.push(stage("live-prerequisites", () => livePrerequisitesStage(config, env, outDir, args)));
  stages.push(stage("terraform-static", () => terraformValidationStage(config, env, outDir, args.applyInfra)));
  stages.push(stage("infrastructure", () => terraformStage(config, env, outDir, args)));
  stages.push(stage("aws-secret-sync", () => awsSecretSyncStage(config, env, outDir, args)));
  stages.push(stage("images", () => imageStage(config, env, args.pushImages, args.buildImages)));
  stages.push(stage("image-registry", () => imageRegistryStage(config, env, outDir, args)));
  stages.push(stage("image-lock", () => imageLockStage(config, env, outDir, args)));
  stages.push(stage("image-signatures", () => imageSignatureStage(config, env, outDir, args)));
  const releaseStage = stage("release-package", () => packageStage(config, env, outDir, args.allowExample));
  stages.push(releaseStage);
  const releaseDir = releaseStage.releaseDir || path.join(outDir, "release");
  stages.push(stage("release-supply-chain", () => supplyChainStage(config, env, outDir, releaseDir)));
  stages.push(stage("native-ebpf-package", () => nativeEbpfPackageStage(env, outDir, args)));
  stages.push(stage("change-window", () => changeWindowStage(config, env, outDir, args, releaseDir)));
  stages.push(stage("secret-iam-consistency", () => secretIamStage(config, env, outDir, args, releaseDir)));
  stages.push(stage("cluster-prerequisites", () => clusterPrereqStage(config, env, outDir, args)));
  stages.push(stage("kubernetes-release", () => kubernetesReleaseStage(config, env, outDir, args, releaseDir)));
  stages.push(stage("cluster-smoke", () => clusterStage(config, env, releaseDir, args.deploy)));
  stages.push(stage("externalsecrets", () => externalSecretStage(config, env, outDir, args)));
  stages.push(stage("burn-in", () => burnInStage(config, env, outDir, args.burnIn)));
  stages.push(stage("live-observability", () => liveObservabilityStage(config, env, outDir, args)));
  stages.push(stage("slo-policy", () => sloPolicyStage(env, outDir)));
  stages.push(stage("ebpf-probe-package", () => ebpfProbePackageStage(env, outDir)));
  stages.push(stage("ebpf-fleet", () => ebpfStage(config, env, outDir, args.validateEbpf)));
  stages.push(stage("ebpf-rollout-evidence", () => ebpfEvidenceStage(config, env, outDir, args)));

  const report = {
    ok: stages.every((item) => item.ok),
    envFile: args.envFile,
    outDir,
    liveActions: {
      applyInfra: args.applyInfra,
      buildImages: args.buildImages,
      pushImages: args.pushImages,
      buildNativeEbpf: args.buildNativeEbpf,
      strictSecrets: args.strictSecrets,
      signImages: args.signImages,
      verifyImageSignatures: args.verifyImageSignatures,
      deploy: args.deploy,
      syncAwsSecrets: args.syncAwsSecrets,
      validateImages: args.validateImages,
      validateExternalSecrets: args.validateExternalSecrets,
      validateObservability: args.validateObservability,
      installClusterPrereqs: args.installClusterPrereqs,
      burnIn: args.burnIn,
      validateEbpf: args.validateEbpf,
      collectEbpfEvidence: args.collectEbpfEvidence
    },
    stages,
    artifacts: {
      report: path.join(outDir, "go-live-report.json"),
      markdown: path.join(outDir, "go-live-report.md"),
      releaseManifest: path.join(releaseDir, "release-manifest.json"),
      imageLock: path.join(outDir, "image-lock.json"),
      imageSignatures: path.join(outDir, "image-signatures.json"),
      nativeEbpfPackage: path.join(outDir, "native-ebpf", "native-ebpf-package-manifest.json"),
      changeWindow: path.join(outDir, "change-window", "change-window.json")
    }
  };
  fs.writeFileSync(report.artifacts.report, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(report.artifacts.markdown, markdown(report));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
