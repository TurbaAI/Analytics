#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const args = parseArgs(process.argv.slice(2));
const root = path.join(__dirname, "..");
const pilotConfigPath = args.config || args["pilot-config"] || process.env.TURBALANCE_PILOT_CONFIG || path.join(root, "ops", "pilot-provider.config.example.json");
const sourceContractsPath = args.contracts || args["source-contracts"] || process.env.TURBALANCE_SOURCE_CONTRACTS || "";
const outPath = args.out || "";
const allowExample = Boolean(args["allow-example"] || process.env.TURBALANCE_ALLOW_EXAMPLE_CONFIG);
const pilotConfig = readJson(pilotConfigPath);
const sourceContracts = sourceContractsPath ? readJson(sourceContractsPath) : null;
const checks = [];

check(Boolean(pilotConfig.image), "image.configured", "Provider image is configured");
check(!String(pilotConfig.image || "").endsWith(":latest"), "image.pinned_tag", "Provider image uses a pinned tag instead of latest");
checkNotExample(pilotConfig.image, "image.provider_registry", "Provider image points at a non-placeholder registry");
check(fs.existsSync(path.join(root, "Dockerfile")), "image.dockerfile", "Dockerfile exists for ingestion image build");

check(pilotConfig.secretProvider && pilotConfig.secretProvider !== "generic", "iam.secret_provider", "Cloud secret provider is configured");
check(Boolean(pilotConfig.secretStoreName), "iam.secret_store", "ExternalSecret ClusterSecretStore name is configured");
check(Object.keys(pilotConfig.serviceAccountAnnotations || {}).length > 0, "iam.service_account_annotations", "Service account IAM annotations are configured");
check(Boolean(pilotConfig.postgresSecretName), "secrets.postgres_url", "Postgres URL remote secret is configured");
check(Boolean(pilotConfig.tenantTokensSecretName), "secrets.tenant_tokens", "Tenant-token remote secret is configured");
check(Boolean(pilotConfig.uploadSecretName), "secrets.upload_secret", "Upload-signing remote secret is configured");
check(Boolean(pilotConfig.exporterTokenSecretName), "secrets.exporter_token", "Exporter-token remote secret is configured");

check(Boolean(pilotConfig.objectBucket), "storage.object_bucket", "Object bucket is configured");
checkNotExample(pilotConfig.objectBucket, "storage.object_bucket_real", "Object bucket does not use an example value");
check(Boolean(pilotConfig.objectPrefix), "storage.object_prefix", "Object prefix is configured");

if (sourceContracts) {
  const requiredSystems = ["prometheus", "kubernetes", "scheduler-admission", "grafana", "billing-slo", "ebpf", "nccl", "opportunities"];
  const enabledContracts = Array.isArray(sourceContracts.contracts) ? sourceContracts.contracts.filter((contract) => contract.enabled !== false) : [];
  const systems = new Set(enabledContracts.map((contract) => String(contract.system || "").toLowerCase()));
  check(enabledContracts.length > 0, "contracts.enabled", "At least one source contract is enabled");
  requiredSystems.forEach((system) => {
    check(systems.has(system), `contracts.${system}`, `${system} source contract is configured`);
  });
  enabledContracts.forEach((contract) => {
    check(Boolean(contract.url), `contracts.${contract.system}.url`, `${contract.system} URL is configured`);
    checkNotExample(contract.url, `contracts.${contract.system}.url_real`, `${contract.system} URL does not use an example host`);
    if (contract.system === "prometheus") {
      check(Boolean(contract.queriesFile), "contracts.prometheus.queries", "Prometheus query file is configured");
      check(fs.existsSync(path.resolve(root, contract.queriesFile || "")), "contracts.prometheus.queries_file", "Prometheus query file exists");
    }
  });
} else {
  checks.push({
    id: "contracts.present",
    ok: false,
    severity: "warning",
    message: "No source contract file was supplied; scheduled collectors should stay disabled"
  });
}

const ok = checks.every((entry) => entry.ok || entry.severity === "warning");
const report = {
  ok,
  allowExample,
  pilotConfigPath: path.resolve(pilotConfigPath),
  sourceContractsPath: sourceContractsPath ? path.resolve(sourceContractsPath) : "",
  checks,
  summary: {
    passed: checks.filter((entry) => entry.ok).length,
    warnings: checks.filter((entry) => !entry.ok && entry.severity === "warning").length,
    failed: checks.filter((entry) => !entry.ok && entry.severity !== "warning").length
  }
};

if (outPath) {
  const fullPath = path.resolve(outPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(report, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!ok) process.exit(1);

function check(condition, id, message) {
  checks.push({
    id,
    ok: Boolean(condition),
    severity: "error",
    message
  });
}

function checkNotExample(value, id, message) {
  const text = String(value || "");
  const isExample = /(^|[./])example([./:]|$)|provider\.example|123456789012|replace-me|your-org/.test(text);
  checks.push({
    id,
    ok: Boolean(text) && !isExample,
    severity: allowExample && isExample ? "warning" : "error",
    message
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    parsed[arg.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : "1";
  }
  return parsed;
}
