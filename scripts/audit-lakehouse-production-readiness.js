#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

function parseArgs(argv) {
  const args = {
    envFile: process.env.TURBALANCE_LAKEHOUSE_ENV_FILE || "ops/lakehouse-production.env.example",
    valuesFile: process.env.TURBALANCE_LAKEHOUSE_VALUES_FILE || "ops/lakehouse-production.values.example.json",
    outDir: process.env.TURBALANCE_READINESS_OUT_DIR || path.join("build", "lakehouse-production-readiness"),
    out: "",
    namespace: process.env.TURBALANCE_NAMESPACE || "",
    previousOverlay: process.env.TURBALANCE_PREVIOUS_OVERLAY || "",
    includeConsul: false,
    runTerraform: false,
    liveExternalSecrets: false,
    liveClusterPrereqs: false,
    installClusterPrereqs: false,
    allowExample: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--include-consul") {
      args.includeConsul = true;
    } else if (arg === "--run-terraform") {
      args.runTerraform = true;
    } else if (arg === "--live-externalsecrets") {
      args.liveExternalSecrets = true;
    } else if (arg === "--live-cluster-prereqs") {
      args.liveClusterPrereqs = true;
    } else if (arg === "--install-cluster-prereqs") {
      args.installClusterPrereqs = true;
      args.liveClusterPrereqs = true;
    } else if (arg === "--allow-example") {
      args.allowExample = true;
    } else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (!(key in args)) throw new Error(`Unknown argument ${arg}`);
      args[key] = need(arg, next);
      index += 1;
    } else {
      throw new Error(`Unexpected argument ${arg}`);
    }
  }
  return args;
}

function need(flag, value) {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: scripts/audit-lakehouse-production-readiness.js [--env-file <file>] [--out-dir <dir>]

Runs the production readiness gates that do not need live mutation by default: env validation, Terraform static checks, release packaging, AWS secret sync dry-run, ExternalSecret readiness dry-run, security/dashboard validators, burn-in dry-run, and eBPF fleet dry-run.`);
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

function runJson(command, args, options = {}) {
  const result = run(command, args, options);
  let json = null;
  try {
    json = result.stdout ? JSON.parse(result.stdout) : null;
  } catch (error) {
    return { ...result, ok: false, parseError: error.message };
  }
  return { ...result, json };
}

function stage(name, fn) {
  try {
    return { name, ok: true, ...fn() };
  } catch (error) {
    return { name, ok: false, error: error.message };
  }
}

function requireJson(result) {
  if (!result.ok) {
    throw new Error(`${result.command} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}${result.parseError ? `\nparse: ${result.parseError}` : ""}`);
  }
  return result.json;
}

function packageArgs(config, outDir, allowExample) {
  return [
    "scripts/package-lakehouse-release.js",
    "--out",
    path.join(outDir, "release"),
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
  ];
}

function markdown(report) {
  const lines = [
    "# turbalance Lakehouse Production Readiness Audit",
    "",
    `- Status: ${report.ok ? "PASS" : "FAIL"}`,
    `- Env file: ${report.envFile}`,
    `- Output directory: ${report.outDir}`,
    "",
    "## Gates",
    ""
  ];
  for (const item of report.stages) {
    lines.push(`- ${item.name}: ${item.ok ? "PASS" : "FAIL"}${item.status ? ` (${item.status})` : ""}`);
  }
  const failed = report.stages.filter((item) => !item.ok);
  if (failed.length) {
    lines.push("", "## Blockers", "");
    for (const item of failed) lines.push(`- ${item.name}: ${item.error || "gate failed"}`);
  }
  lines.push("", "## Artifacts", "", `- JSON report: ${report.artifacts.report}`, `- Markdown report: ${report.artifacts.markdown}`, "");
  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv);
  const outDir = path.resolve(root, args.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const config = { ...process.env, ...parseEnvFile(args.envFile) };
  const env = { ...process.env, ...config };
  const namespace = args.namespace || config.TURBALANCE_NAMESPACE || "turbalance-lakehouse";
  const includeConsul = args.includeConsul || Boolean(config.TURBALANCE_CONSUL_TOKEN || config.TURBALANCE_CONSUL_URL);
  const releaseDir = path.join(outDir, "release");

  const stages = [];
  stages.push(stage("production-env-assembly", () => ({
    status: "dry-run",
    report: requireJson(runJson(process.execPath, [
      "scripts/generate-lakehouse-production-env.js",
      "--env-file",
      args.envFile,
      "--dry-run",
      "--report",
      path.join(outDir, "production-env-assembly.json")
    ], { env }))
  })));
  stages.push(stage("production-values-env-assembly", () => ({
    status: "dry-run",
    report: requireJson(runJson(process.execPath, [
      "scripts/create-lakehouse-production-env-from-values.js",
      "--values",
      args.valuesFile,
      "--dry-run",
      "--report",
      path.join(outDir, "production-values-env-assembly.json")
    ], { env }))
  })));
  stages.push(stage("secret-material", () => ({
    status: "planned",
    report: requireJson(runJson(process.execPath, [
      "scripts/validate-lakehouse-secret-material.js",
      "--env-file",
      args.envFile,
      "--values",
      args.valuesFile,
      "--out",
      path.join(outDir, "secret-material.json"),
      ...(includeConsul ? ["--include-consul"] : []),
      ...(args.allowExample ? ["--allow-placeholders"] : [])
    ], { env }))
  })));
  stages.push(stage("live-prerequisites", () => ({
    status: "planned",
    report: requireJson(runJson(process.execPath, [
      "scripts/validate-lakehouse-live-prerequisites.js",
      "--env-file",
      args.envFile,
      "--out",
      path.join(outDir, "live-prerequisites.json"),
      ...(args.allowExample ? ["--allow-example"] : [])
    ], { env }))
  })));
  stages.push(stage("production-config", () => ({
    status: "validated",
    report: requireJson(runJson(process.execPath, [
      "scripts/validate-lakehouse-production-config.js",
      "--env-file",
      args.envFile,
      "--out",
      path.join(outDir, "production-config.json"),
      ...(args.allowExample ? ["--allow-example"] : [])
    ], { env }))
  })));
  stages.push(stage("terraform-static", () => ({
    status: "validated",
    report: requireJson(runJson(process.execPath, [
      "scripts/validate-lakehouse-terraform.js",
      "--dir",
      config.TURBALANCE_TERRAFORM_DIR || "ops/terraform/lakehouse/aws",
      "--out",
      path.join(outDir, "terraform.json"),
      ...(args.runTerraform ? ["--run-terraform"] : [])
    ], { env }))
  })));
  stages.push(stage("terraform-rollout", () => ({
    status: "dry-run",
    report: requireJson(runJson(process.execPath, [
      "scripts/run-lakehouse-terraform-rollout.js",
      "--env-file",
      args.envFile,
      "--dir",
      config.TURBALANCE_TERRAFORM_DIR || "ops/terraform/lakehouse/aws",
      "--out-dir",
      path.join(outDir, "terraform-rollout")
    ], { env }))
  })));
  stages.push(stage("security-static", () => ({
    status: "validated",
    report: requireJson(runJson(process.execPath, ["scripts/validate-lakehouse-security.js"], { env }))
  })));
  stages.push(stage("dashboards-alerts", () => ({
    status: "validated",
    report: requireJson(runJson(process.execPath, ["scripts/validate-lakehouse-alerts-dashboards.js"], { env }))
  })));
  stages.push(stage("aws-secret-sync", () => ({
    status: "dry-run",
    report: requireJson(runJson(process.execPath, [
      "scripts/sync-lakehouse-aws-secrets.js",
      "--env-file",
      args.envFile,
      "--dry-run",
      "--out",
      path.join(outDir, "aws-secret-sync.json"),
      ...(includeConsul ? ["--include-consul"] : [])
    ], { env }))
  })));
  stages.push(stage("image-registry", () => ({
    status: "dry-run",
    report: requireJson(runJson(process.execPath, [
      "scripts/validate-lakehouse-image-registry.js",
      "--env-file",
      args.envFile,
      "--dry-run",
      "--out",
      path.join(outDir, "image-registry.json")
    ], { env }))
  })));
  stages.push(stage("image-lock", () => ({
    status: "dry-run",
    report: requireJson(runJson(process.execPath, [
      "scripts/generate-lakehouse-image-lock.js",
      "--env-file",
      args.envFile,
      "--dry-run",
      "--out",
      path.join(outDir, "image-lock.json")
    ], { env }))
  })));
  stages.push(stage("image-signatures", () => ({
    status: "dry-run",
    report: requireJson(runJson(process.execPath, [
      "scripts/sign-lakehouse-images.js",
      "--env-file",
      args.envFile,
      "--image-lock",
      path.join(outDir, "image-lock.json"),
      "--dry-run",
      "--out",
      path.join(outDir, "image-signatures.json")
    ], { env }))
  })));
  stages.push(stage("release-package", () => ({
    status: "packaged",
    releaseDir,
    report: requireJson(runJson(process.execPath, packageArgs(config, outDir, args.allowExample), { env }))
  })));
  stages.push(stage("release-supply-chain", () => ({
    status: "validated",
    report: requireJson(runJson(process.execPath, [
      "scripts/validate-lakehouse-release-supply-chain.js",
      "--release-dir",
      releaseDir,
      "--registry",
      config.TURBALANCE_IMAGE_REGISTRY,
      "--tag",
      config.TURBALANCE_IMAGE_TAG,
      "--out",
      path.join(outDir, "release-supply-chain.json")
    ], { env }))
  })));
  stages.push(stage("native-ebpf-package", () => ({
    status: "ready",
    report: requireJson(runJson(process.execPath, [
      "scripts/package-lakehouse-native-ebpf.js",
      "--out-dir",
      path.join(outDir, "native-ebpf"),
      "--archive"
    ], { env }))
  })));
  stages.push(stage("secret-iam-consistency", () => ({
    status: "validated",
    report: requireJson(runJson(process.execPath, [
      "scripts/validate-lakehouse-secret-iam-consistency.js",
      "--terraform-dir",
      config.TURBALANCE_TERRAFORM_DIR || "ops/terraform/lakehouse/aws",
      "--secret-requirements",
      path.join(releaseDir, "secret-requirements.json"),
      "--out",
      path.join(outDir, "secret-iam-consistency.json"),
      ...(includeConsul ? ["--include-consul"] : [])
    ], { env }))
  })));
  stages.push(stage("cluster-prerequisites", () => ({
    status: args.liveClusterPrereqs ? "validated" : "planned",
    report: requireJson(runJson(process.execPath, [
      "scripts/prepare-lakehouse-cluster-prereqs.js",
      "--namespace",
      namespace,
      "--out",
      path.join(outDir, "cluster-prerequisites.json"),
      ...(args.liveClusterPrereqs ? ["--run-live-checks"] : []),
      ...(args.installClusterPrereqs ? ["--install", "--wait"] : [])
    ], { env }))
  })));
  stages.push(stage("kubernetes-release", () => ({
    status: "dry-run",
    report: requireJson(runJson(process.execPath, [
      "scripts/validate-lakehouse-kubernetes-release.js",
      "--namespace",
      namespace,
      "--overlay",
      path.join(releaseDir, "kustomize"),
      "--out",
      path.join(outDir, "kubernetes-release.json"),
      ...(args.allowExample ? ["--allow-placeholders"] : [])
    ], { env }))
  })));
  stages.push(stage("change-window", () => ({
    status: "ready",
    report: requireJson(runJson(process.execPath, [
      "scripts/generate-lakehouse-change-window.js",
      "--env-file",
      args.envFile,
      "--release-dir",
      releaseDir,
      "--out-dir",
      path.join(outDir, "change-window"),
      "--namespace",
      namespace,
      ...(args.previousOverlay ? ["--previous-overlay", args.previousOverlay] : [])
    ], { env }))
  })));
  stages.push(stage("externalsecrets", () => ({
    status: args.liveExternalSecrets ? "validated" : "dry-run",
    report: requireJson(runJson(process.execPath, [
      "scripts/validate-lakehouse-externalsecrets.js",
      "--namespace",
      namespace,
      "--out",
      path.join(outDir, "externalsecrets.json"),
      ...(args.liveExternalSecrets ? [] : ["--dry-run"]),
      ...(includeConsul ? ["--include-consul"] : [])
    ], { env }))
  })));
  stages.push(stage("cluster-smoke", () => ({
    status: "dry-run",
    report: requireJson(runJson(process.execPath, [
      "scripts/run-lakehouse-cluster-smoke.js",
      "--dry-run",
      "--namespace",
      namespace,
      "--overlay",
      path.join(releaseDir, "kustomize")
    ], { env }))
  })));
  stages.push(stage("burn-in", () => ({
    status: "dry-run",
    report: requireJson(runJson(process.execPath, [
      "scripts/run-lakehouse-burn-in.js",
      "--dry-run",
      "--api-url",
      config.TURBALANCE_API_URL || `http://api-server.${namespace}.svc.cluster.local:8080`,
      ...(config.TURBALANCE_COLLECTOR_URL ? ["--collector-url", config.TURBALANCE_COLLECTOR_URL] : []),
      "--out",
      path.join(outDir, "burn-in.json")
    ], { env }))
  })));
  stages.push(stage("live-observability", () => ({
    status: "dry-run",
    report: requireJson(runJson(process.execPath, [
      "scripts/validate-lakehouse-live-observability.js",
      "--env-file",
      args.envFile,
      "--dry-run",
      "--api-url",
      config.TURBALANCE_API_URL || `http://api-server.${namespace}.svc.cluster.local:8080`,
      "--out",
      path.join(outDir, "live-observability.json")
    ], { env }))
  })));
  stages.push(stage("slo-policy", () => ({
    status: "validated",
    report: requireJson(runJson(process.execPath, [
      "scripts/validate-lakehouse-slo-policy.js",
      "--out",
      path.join(outDir, "slo-policy.json")
    ], { env }))
  })));
  stages.push(stage("ebpf-probe-package", () => ({
    status: "validated",
    report: requireJson(runJson(process.execPath, [
      "scripts/validate-lakehouse-ebpf-probe-package.js",
      "--out",
      path.join(outDir, "ebpf-probe-package.json")
    ], { env }))
  })));
  stages.push(stage("ebpf-fleet", () => ({
    status: "dry-run",
    report: requireJson(runJson(process.execPath, [
      "scripts/run-ebpf-fleet-validation.js",
      "--dry-run",
      "--hosts-file",
      config.TURBALANCE_EBPF_HOSTS_FILE || "ops/lakehouse-ebpf-hosts.example.json",
      "--out",
      path.join(outDir, "ebpf-fleet.json")
    ], { env }))
  })));
  stages.push(stage("ebpf-rollout-evidence", () => ({
    status: "dry-run",
    report: requireJson(runJson(process.execPath, [
      "scripts/collect-lakehouse-ebpf-rollout-evidence.js",
      "--dry-run",
      "--hosts-file",
      config.TURBALANCE_EBPF_HOSTS_FILE || "ops/lakehouse-ebpf-hosts.example.json",
      "--out-dir",
      path.join(outDir, "ebpf-rollout")
    ], { env }))
  })));

  const reportPath = args.out ? path.resolve(root, args.out) : path.join(outDir, "readiness-report.json");
  const markdownPath = reportPath.replace(/\.json$/i, ".md");
  const report = {
    ok: stages.every((item) => item.ok),
    envFile: args.envFile,
    outDir,
    namespace,
    liveChecks: {
      runTerraform: args.runTerraform,
      liveExternalSecrets: args.liveExternalSecrets,
      liveClusterPrereqs: args.liveClusterPrereqs,
      installClusterPrereqs: args.installClusterPrereqs
    },
    stages,
    artifacts: {
      report: reportPath,
      markdown: markdownPath,
      releaseManifest: path.join(releaseDir, "release-manifest.json"),
      imageLock: path.join(outDir, "image-lock.json"),
      imageSignatures: path.join(outDir, "image-signatures.json"),
      secretMaterial: path.join(outDir, "secret-material.json"),
      nativeEbpfPackage: path.join(outDir, "native-ebpf", "native-ebpf-package-manifest.json"),
      changeWindow: path.join(outDir, "change-window", "change-window.json")
    }
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownPath, markdown(report));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
