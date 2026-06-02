#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const basePath = args.base || process.env.TURBALANCE_PILOT_CONFIG_BASE || path.join(root, "ops", "pilot-provider.config.example.json");
const outPath = args.out || process.env.TURBALANCE_PROVIDER_CONFIG_OUT || "";
const placeholderPattern = /(^|[./])example([./:]|$)|provider\.example|123456789012|replace-me|your-org/;

if (!outPath) {
  fail("usage: generate-provider-pilot-config.js --out build/provider/pilot-provider.json --namespace NAMESPACE --release-name RELEASE --image REGISTRY/IMAGE:TAG --secret-provider aws|gcp|azure --secret-store-name STORE --object-bucket BUCKET --object-prefix PREFIX --postgres-secret-name NAME --tenant-tokens-secret-name NAME --upload-secret-name NAME --exporter-token-secret-name NAME --ingest-tenant TENANT [provider-specific IAM flags]");
}

const baseConfig = readJson(basePath);
const provider = value("secret-provider", "TURBALANCE_SECRET_PROVIDER", baseConfig.secretProvider).toLowerCase();
const config = {
  ...baseConfig,
  namespace: required("namespace", "TURBALANCE_PILOT_NAMESPACE"),
  releaseName: required("release-name", "TURBALANCE_PILOT_RELEASE_NAME"),
  image: required("image", "TURBALANCE_PROVIDER_IMAGE"),
  serviceAccountName: value("service-account-name", "TURBALANCE_SERVICE_ACCOUNT_NAME", baseConfig.serviceAccountName || "turbalance-ingestion"),
  configMapName: value("config-map-name", "TURBALANCE_CONFIG_MAP_NAME", baseConfig.configMapName || "turbalance-ingestion-config"),
  secretName: value("secret-name", "TURBALANCE_K8S_SECRET_NAME", baseConfig.secretName || "turbalance-ingestion-secrets"),
  secretStoreName: required("secret-store-name", "TURBALANCE_SECRET_STORE_NAME"),
  secretProvider: provider,
  objectBucket: required("object-bucket", "TURBALANCE_OBJECT_BUCKET"),
  objectPrefix: required("object-prefix", "TURBALANCE_OBJECT_PREFIX"),
  postgresSecretName: required("postgres-secret-name", "TURBALANCE_POSTGRES_SECRET_NAME"),
  tenantTokensSecretName: required("tenant-tokens-secret-name", "TURBALANCE_TENANT_TOKENS_SECRET_NAME"),
  uploadSecretName: required("upload-secret-name", "TURBALANCE_UPLOAD_SECRET_NAME"),
  jwtSecretName: value("jwt-secret-name", "TURBALANCE_JWT_SECRET_NAME", baseConfig.jwtSecretName || ""),
  exporterTokenSecretName: required("exporter-token-secret-name", "TURBALANCE_EXPORTER_TOKEN_SECRET_NAME"),
  ingestTenant: required("ingest-tenant", "TURBALANCE_INGEST_TENANT")
};

delete config.aws;
delete config.gcp;
delete config.azure;
config.serviceAccountAnnotations = {};

if (provider === "aws") {
  config.serviceAccountAnnotations["eks.amazonaws.com/role-arn"] = required("service-account-role-arn", "TURBALANCE_SERVICE_ACCOUNT_ROLE_ARN");
  config.aws = {
    region: value("aws-region", "TURBALANCE_AWS_REGION", baseConfig.aws?.region || "us-west-2"),
    service: value("aws-service", "TURBALANCE_AWS_SERVICE", baseConfig.aws?.service || "SecretsManager")
  };
} else if (provider === "gcp") {
  config.serviceAccountAnnotations["iam.gke.io/gcp-service-account"] = required("gcp-service-account", "TURBALANCE_GCP_SERVICE_ACCOUNT");
  config.gcp = {
    projectId: required("gcp-project-id", "TURBALANCE_GCP_PROJECT_ID"),
    clusterLocation: required("gcp-cluster-location", "TURBALANCE_GCP_CLUSTER_LOCATION"),
    clusterName: required("gcp-cluster-name", "TURBALANCE_GCP_CLUSTER_NAME")
  };
} else if (provider === "azure") {
  config.serviceAccountAnnotations["azure.workload.identity/client-id"] = required("azure-client-id", "TURBALANCE_AZURE_CLIENT_ID");
  config.azure = {
    vaultUrl: required("azure-vault-url", "TURBALANCE_AZURE_VAULT_URL"),
    tenantId: required("azure-tenant-id", "TURBALANCE_AZURE_TENANT_ID")
  };
} else {
  fail("--secret-provider must be one of aws, gcp, or azure for provider pilot configs");
}

const errors = validate(config);
if (errors.length > 0) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exit(1);
}

const fullOutPath = path.resolve(outPath);
fs.mkdirSync(path.dirname(fullOutPath), { recursive: true });
fs.writeFileSync(fullOutPath, `${JSON.stringify(config, null, 2)}\n`);

process.stdout.write(`${JSON.stringify({
  ok: true,
  basePath: path.resolve(basePath),
  outPath: fullOutPath,
  image: config.image,
  namespace: config.namespace,
  releaseName: config.releaseName,
  secretProvider: config.secretProvider,
  secretStoreName: config.secretStoreName,
  objectBucket: config.objectBucket,
  nextCommands: {
    readiness: `node scripts/validate-provider-readiness.js --config ${fullOutPath} --source-contracts ops/source-contracts.example.json --source-approvals ops/source-approvals.example.json`,
    manifests: `node scripts/render-managed-kubernetes.js --config ${fullOutPath} --out build/provider-managed-kubernetes.yaml`,
    image: `node scripts/build-publish-ingestion-image.js --config ${fullOutPath} --push`,
    goLive: `node scripts/run-provider-go-live-gates.js --config ${fullOutPath} --source-contracts ops/source-contracts.example.json --source-approvals ops/source-approvals.example.json --iterations 3 --out-dir build/provider-go-live`
  }
}, null, 2)}\n`);

function validate(config) {
  const errors = [];
  const requiredFields = [
    "namespace",
    "releaseName",
    "image",
    "serviceAccountName",
    "configMapName",
    "secretName",
    "secretStoreName",
    "secretProvider",
    "objectBucket",
    "objectPrefix",
    "postgresSecretName",
    "tenantTokensSecretName",
    "uploadSecretName",
    "exporterTokenSecretName",
    "ingestTenant"
  ];

  requiredFields.forEach((field) => {
    if (!String(config[field] || "").trim()) {
      errors.push(`${field} is required`);
    }
  });

  if (String(config.image || "").endsWith(":latest")) {
    errors.push("image must use a pinned tag instead of latest");
  }

  const placeholderValues = findPlaceholderValues(config);
  placeholderValues.forEach((entry) => {
    errors.push(`${entry.path} still contains a placeholder value: ${entry.value}`);
  });

  return errors;
}

function findPlaceholderValues(valueToCheck, currentPath = "config") {
  if (Array.isArray(valueToCheck)) {
    return valueToCheck.flatMap((entry, index) => findPlaceholderValues(entry, `${currentPath}[${index}]`));
  }
  if (valueToCheck && typeof valueToCheck === "object") {
    return Object.entries(valueToCheck).flatMap(([key, entry]) => findPlaceholderValues(entry, `${currentPath}.${key}`));
  }
  const text = String(valueToCheck || "");
  return placeholderPattern.test(text) ? [{ path: currentPath, value: text }] : [];
}

function required(flag, envName) {
  const resolved = value(flag, envName, "");
  if (!String(resolved || "").trim()) {
    fail(`--${flag} or ${envName} is required`);
  }
  return resolved;
}

function value(flag, envName, fallback) {
  return args[flag] || process.env[envName] || fallback || "";
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
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
