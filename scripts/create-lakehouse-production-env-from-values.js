#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const redacted = "[REDACTED]";

const requiredRuntimeKeys = [
  "TURBALANCE_IMAGE_REGISTRY",
  "TURBALANCE_IMAGE_TAG",
  "TURBALANCE_NAMESPACE",
  "TURBALANCE_LAKE_ROOT",
  "TURBALANCE_API_JWT_ISSUER",
  "TURBALANCE_API_JWT_AUDIENCE",
  "TURBALANCE_DISCOVERY_CERTIFICATE_MODE",
  "TURBALANCE_TRUSTED_SPIFFE_PREFIX",
  "TURBALANCE_QUEUE_GATEWAY_BACKEND",
  "TURBALANCE_QUEUE_GATEWAY_BROKER_URL",
  "TURBALANCE_QUEUE_GATEWAY_TOPIC"
];

const optionalRuntimeKeys = [
  "TURBALANCE_TERRAFORM_DIR",
  "TURBALANCE_EBPF_HOSTS_FILE",
  "TURBALANCE_BURN_IN_REQUESTS",
  "TURBALANCE_BURN_IN_CONCURRENCY",
  "TURBALANCE_API_URL",
  "TURBALANCE_COLLECTOR_URL",
  "TURBALANCE_GRAFANA_URL",
  "TURBALANCE_OTEL_COLLECTOR_METRICS_URL",
  "TURBALANCE_PROMETHEUS_URL",
  "TURBALANCE_CONSUL_URL",
  "TURBALANCE_DISCOVERY_EXTERNAL_CA_COMMAND",
  "TURBALANCE_QUEUE_GATEWAY_PRODUCER_COMMAND",
  "TURBALANCE_OTEL_BACKEND_OTLP_ENDPOINT",
  "TURBALANCE_ALERT_WEBHOOK_URL"
];

const secretKeys = [
  "TURBALANCE_COLLECTOR_TENANT_CREDENTIALS",
  "TURBALANCE_COLLECTOR_TENANT_CREDENTIALS_FILE",
  "TURBALANCE_COLLECTOR_TOKEN",
  "TURBALANCE_COLLECTOR_HMAC_SECRET",
  "TURBALANCE_DISCOVERY_ENROLLMENT_TOKEN",
  "TURBALANCE_API_TOKENS",
  "TURBALANCE_API_JWKS",
  "TURBALANCE_API_JWKS_FILE",
  "TURBALANCE_AGENT_CLIENT_CA_PEM",
  "TURBALANCE_AGENT_CLIENT_CA_FILE",
  "TURBALANCE_DISCOVERY_DATABASE_URL",
  "TURBALANCE_POSTGRES_URL",
  "TURBALANCE_COLLECTOR_QUEUE_TOKEN",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_REGION",
  "AWS_ENDPOINT_URL",
  "TURBALANCE_S3_SCHEME",
  "TURBALANCE_OTEL_BACKEND_AUTHORIZATION",
  "TURBALANCE_ALERT_SLACK_WEBHOOK_URL",
  "TURBALANCE_ALERT_PAGERDUTY_ROUTING_KEY",
  "TURBALANCE_CONSUL_TOKEN"
];

function parseArgs(argv) {
  const args = {
    values: process.env.TURBALANCE_LAKEHOUSE_VALUES_FILE || "ops/lakehouse-production.values.example.json",
    terraformOutput: "",
    terraformDir: process.env.TURBALANCE_TERRAFORM_DIR || "",
    out: "",
    report: "",
    dryRun: false,
    includeSecrets: false,
    allowPlaceholders: false,
    allowMissing: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--include-secrets") args.includeSecrets = true;
    else if (arg === "--allow-placeholders") args.allowPlaceholders = true;
    else if (arg === "--allow-missing") args.allowMissing = true;
    else if (arg === "--help") {
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
  console.log(`Usage: scripts/create-lakehouse-production-env-from-values.js [--values <json>] [--out <env>] [--report <json>] [--dry-run]

Compiles a structured production values JSON file into the normalized lakehouse .env format.
Secret values are excluded unless --include-secrets is passed; reports always redact secret-like keys.`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"));
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function loadValues(file) {
  const doc = readJson(file);
  assertPlainObject(doc, "values file");
  assertPlainObject(doc.runtime || {}, "runtime");
  assertPlainObject(doc.secretFiles || {}, "secretFiles");
  assertPlainObject(doc.secrets || {}, "secrets");
  return {
    schemaVersion: doc.schemaVersion || "unknown",
    runtime: doc.runtime || {},
    secretFiles: doc.secretFiles || {},
    secrets: doc.secrets || {}
  };
}

function loadTerraformOutput(options) {
  if (options.terraformOutput) {
    return normalizeTerraformOutput(readJson(options.terraformOutput));
  }
  if (!options.terraformDir || !commandAvailable("terraform")) return {};
  const result = spawnSync("terraform", [`-chdir=${options.terraformDir}`, "output", "-json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.status !== 0 || !result.stdout.trim()) return {};
  return normalizeTerraformOutput(JSON.parse(result.stdout));
}

function normalizeTerraformOutput(output) {
  const valueOf = (key) => {
    const raw = output[key];
    if (raw && typeof raw === "object" && "value" in raw) return raw.value;
    return raw;
  };
  const values = {};
  const lakeRoot = valueOf("lake_root") || valueOf("lakehouse_lake_root") || valueOf("object_lake_root");
  const broker = valueOf("msk_bootstrap_brokers") || valueOf("kafka_bootstrap_brokers") || valueOf("queue_bootstrap_brokers");
  if (lakeRoot) values.TURBALANCE_LAKE_ROOT = String(lakeRoot);
  if (broker) values.TURBALANCE_QUEUE_GATEWAY_BROKER_URL = String(broker);
  return values;
}

function commandAvailable(command) {
  return spawnSync("sh", ["-lc", `command -v ${shellQuote(command)}`], { encoding: "utf8" }).status === 0;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function compileConfig(values, options, terraformValues) {
  return {
    ...values.runtime,
    ...terraformValues,
    ...values.secretFiles,
    ...(options.includeSecrets ? values.secrets : {})
  };
}

function isPlaceholder(value) {
  return /replace-with|replace-outside-source-control|your-org|issuer\.example|provider\.example|registry\.example|s3:\/\/replace|example\.com|\.example(?:\/|:|$)/i.test(
    String(value)
  );
}

function isSecretKey(key) {
  return /TOKEN|SECRET|PASSWORD|AUTHORIZATION|JWKS|CA_PEM|CA_FILE|DATABASE_URL|POSTGRES_URL|ACCESS_KEY|PAGERDUTY|SLACK/i.test(key);
}

function check(name, passed, detail, severity = "error") {
  return { name, passed: Boolean(passed), detail, severity };
}

function validate(values, config, options) {
  const checks = [];
  for (const key of requiredRuntimeKeys) {
    checks.push(check(`runtime.${key}.set`, Boolean(config[key]), `${key} is set`));
    if (config[key]) checks.push(check(`runtime.${key}.not_placeholder`, options.allowPlaceholders || !isPlaceholder(config[key]), `${key} is not a placeholder`));
  }
  checks.push(check("schema.version", values.schemaVersion === "turba.lakehouse.production_values.v1", "values schema version is current", "warning"));
  checks.push(check("image.tag.immutable", config.TURBALANCE_IMAGE_TAG && config.TURBALANCE_IMAGE_TAG !== "latest", "image tag is immutable"));
  checks.push(check("lake_root.s3", String(config.TURBALANCE_LAKE_ROOT || "").startsWith("s3://"), "lake root uses s3://"));
  checks.push(check("secrets.output_policy", options.includeSecrets || Object.keys(values.secrets).length > 0, "secrets are either included explicitly or withheld from output", "warning"));
  for (const [key, value] of Object.entries(values.secretFiles)) {
    checks.push(check(`secret_file.${key}.set`, Boolean(value), `${key} points to externally managed material`, "warning"));
  }
  if (options.includeSecrets) {
    for (const [key, value] of Object.entries(values.secrets)) {
      checks.push(check(`secret.${key}.set`, Boolean(value), `${key} is set`, "warning"));
      checks.push(check(`secret.${key}.not_placeholder`, options.allowPlaceholders || !isPlaceholder(value), `${key} is not a placeholder`));
    }
  }
  const errors = checks.filter((item) => !item.passed && item.severity === "error");
  const warnings = checks.filter((item) => !item.passed && item.severity === "warning");
  return {
    ok: errors.length === 0 || options.allowMissing,
    summary: {
      passed: checks.filter((item) => item.passed).length,
      failed: errors.length,
      warnings: warnings.length
    },
    checks
  };
}

function orderedKeys(options) {
  const keys = [...requiredRuntimeKeys, ...optionalRuntimeKeys, ...secretKeys];
  const seen = new Set();
  return keys.filter((key) => {
    if (seen.has(key)) return false;
    seen.add(key);
    if (secretKeys.includes(key) && !options.includeSecrets && !key.endsWith("_FILE")) return false;
    return true;
  });
}

function buildEnv(config, options) {
  return orderedKeys(options)
    .filter((key) => config[key] !== undefined && config[key] !== "")
    .map((key) => `${key}=${quoteEnv(config[key])}`)
    .join("\n");
}

function quoteEnv(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@-]+$/.test(text)) return text;
  return JSON.stringify(text);
}

function redactedValues(config) {
  return Object.fromEntries(
    Object.entries(config)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, isSecretKey(key) ? redacted : value])
  );
}

function preview(envBody) {
  return envBody
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const key = line.split("=")[0];
      return isSecretKey(key) ? `${key}=${redacted}` : line;
    });
}

function writeFile(file, body) {
  fs.mkdirSync(path.dirname(path.resolve(root, file)), { recursive: true });
  fs.writeFileSync(path.resolve(root, file), body, "utf8");
}

function main() {
  const options = parseArgs(process.argv);
  const values = loadValues(options.values);
  const terraformValues = loadTerraformOutput(options);
  const config = compileConfig(values, options, terraformValues);
  const validation = validate(values, config, options);
  const envBody = `${buildEnv(config, options)}\n`;
  const report = {
    status: options.dryRun ? "dry-run" : validation.ok ? "ready" : "failed",
    valuesFile: options.values,
    schemaVersion: values.schemaVersion,
    terraformOutput: options.terraformOutput,
    terraformDir: options.terraformDir,
    outputEnv: options.out,
    secretsIncludedInOutput: options.includeSecrets,
    withheldSecretKeys: options.includeSecrets ? [] : Object.keys(values.secrets).sort(),
    terraformOverrides: terraformValues,
    validation,
    values: redactedValues(config),
    envPreview: preview(envBody)
  };

  if (!options.dryRun && options.out && (validation.ok || options.allowMissing)) writeFile(options.out, envBody);
  if (options.report) writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!validation.ok && !options.allowMissing) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
