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

const secretSyncKeys = [
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

function parseArgs(argv) {
  const args = {
    envFile: process.env.TURBALANCE_LAKEHOUSE_ENV_FILE || "ops/lakehouse-production.env.example",
    terraformOutput: "",
    terraformDir: process.env.TURBALANCE_TERRAFORM_DIR || "",
    out: "",
    report: "",
    dryRun: false,
    allowMissing: false,
    allowPlaceholders: false,
    includeSecrets: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--allow-missing") {
      args.allowMissing = true;
    } else if (arg === "--allow-placeholders") {
      args.allowPlaceholders = true;
    } else if (arg === "--include-secrets") {
      args.includeSecrets = true;
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
  console.log(`Usage: scripts/generate-lakehouse-production-env.js [--env-file <file>] [--terraform-output <json>] [--out <env>] [--dry-run]

Builds a normalized lakehouse production env file from checked-in defaults, operator overrides, and optional terraform output -json.

Secret values are excluded from generated env files unless --include-secrets is passed. Reports always redact secret-like values.`);
}

function parseEnvFile(file) {
  if (!file) return {};
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

function loadTerraformOutput(options) {
  if (options.terraformOutput) {
    return normalizeTerraformOutput(JSON.parse(fs.readFileSync(path.resolve(root, options.terraformOutput), "utf8")));
  }
  if (!options.terraformDir) return {};
  const terraform = commandAvailable("terraform");
  if (!terraform) return {};
  const result = spawnSync("terraform", [`-chdir=${options.terraformDir}`, "output", "-json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.status !== 0 || !result.stdout.trim()) return {};
  return normalizeTerraformOutput(JSON.parse(result.stdout));
}

function commandAvailable(command) {
  return spawnSync("sh", ["-lc", `command -v ${quote(command)}`], { encoding: "utf8" }).status === 0;
}

function quote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function normalizeTerraformOutput(output) {
  const valueOf = (key) => {
    const raw = output[key];
    if (raw && typeof raw === "object" && "value" in raw) return raw.value;
    return raw;
  };
  const values = {};
  if (valueOf("lake_root")) values.TURBALANCE_LAKE_ROOT = String(valueOf("lake_root"));
  if (valueOf("msk_bootstrap_brokers")) values.TURBALANCE_QUEUE_GATEWAY_BROKER_URL = String(valueOf("msk_bootstrap_brokers"));
  return values;
}

function isPlaceholder(value) {
  return /replace-with|your-org|issuer\.example|provider\.example|registry\.example|s3:\/\/replace|example\.com|\.example(?:\/|:|$)/i.test(
    String(value)
  );
}

function isSecretKey(key) {
  return /TOKEN|SECRET|PASSWORD|AUTHORIZATION|JWKS|CA_PEM|CA_FILE|DATABASE_URL|POSTGRES_URL|ACCESS_KEY|PAGERDUTY|SLACK/i.test(key);
}

function buildEnv(config, options) {
  const orderedKeys = [...requiredRuntimeKeys, ...optionalRuntimeKeys, ...(options.includeSecrets ? secretSyncKeys : [])];
  const seen = new Set();
  return orderedKeys
    .filter((key) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return config[key] !== undefined && config[key] !== "";
    })
    .map((key) => `${key}=${quoteEnv(config[key])}`)
    .join("\n");
}

function quoteEnv(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@-]+$/.test(text)) return text;
  return JSON.stringify(text);
}

function publicValues(config) {
  const keys = [...requiredRuntimeKeys, ...optionalRuntimeKeys, ...secretSyncKeys];
  return Object.fromEntries(
    keys
      .filter((key) => config[key] !== undefined && config[key] !== "")
      .map((key) => [key, isSecretKey(key) ? redacted : config[key]])
  );
}

function validate(config, options) {
  const checks = [];
  for (const key of requiredRuntimeKeys) {
    checks.push(check(`required.${key}`, Boolean(config[key]), `${key} is set`));
    if (config[key]) {
      checks.push(check(`placeholder.${key}`, options.allowPlaceholders || !isPlaceholder(config[key]), `${key} is not a placeholder`));
    }
  }
  checks.push(check("image_tag_immutable", config.TURBALANCE_IMAGE_TAG && config.TURBALANCE_IMAGE_TAG !== "latest", "image tag is immutable"));
  checks.push(check("lake_root_s3", String(config.TURBALANCE_LAKE_ROOT || "").startsWith("s3://"), "lake root uses s3://"));
  checks.push(check("secrets.api_auth", Boolean(config.TURBALANCE_API_TOKENS || config.TURBALANCE_API_JWKS || config.TURBALANCE_API_JWKS_FILE), "API auth material is present", "warning"));
  checks.push(check("secrets.collector_auth", Boolean(config.TURBALANCE_COLLECTOR_TOKEN && config.TURBALANCE_COLLECTOR_HMAC_SECRET), "collector auth material is present", "warning"));
  checks.push(check("secrets.discovery", Boolean(config.TURBALANCE_DISCOVERY_ENROLLMENT_TOKEN), "discovery enrollment token is present", "warning"));
  checks.push(check("secrets.agent_ca", Boolean(config.TURBALANCE_AGENT_CLIENT_CA_PEM || config.TURBALANCE_AGENT_CLIENT_CA_FILE), "agent client CA is present", "warning"));
  checks.push(check("secrets.metadata_db", Boolean(config.TURBALANCE_DISCOVERY_DATABASE_URL || config.TURBALANCE_POSTGRES_URL), "metadata DB URL is present", "warning"));
  checks.push(check("secrets.queue", Boolean(config.TURBALANCE_COLLECTOR_QUEUE_TOKEN), "collector queue token is present", "warning"));
  const failed = checks.filter((item) => !item.passed && item.severity === "error");
  const warnings = checks.filter((item) => !item.passed && item.severity === "warning");
  return {
    ok: failed.length === 0 || options.allowMissing,
    summary: {
      passed: checks.filter((item) => item.passed).length,
      failed: failed.length,
      warnings: warnings.length
    },
    checks
  };
}

function check(name, passed, detail, severity = "error") {
  return { name, passed: Boolean(passed), detail, severity };
}

function writeFile(file, body) {
  fs.mkdirSync(path.dirname(path.resolve(root, file)), { recursive: true });
  fs.writeFileSync(path.resolve(root, file), body);
}

function main() {
  const options = parseArgs(process.argv);
  const envValues = parseEnvFile(options.envFile);
  const terraformValues = loadTerraformOutput(options);
  const config = { ...process.env, ...envValues, ...terraformValues };
  const validation = validate(config, options);
  const envBody = `${buildEnv(config, options)}\n`;
  const report = {
    status: options.dryRun ? "dry-run" : validation.ok ? "ready" : "failed",
    envFile: options.envFile,
    terraformOutput: options.terraformOutput,
    terraformDir: options.terraformDir,
    outputEnv: options.out,
    secretsIncludedInOutput: options.includeSecrets,
    validation,
    values: publicValues(config),
    envPreview: envBody
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const key = line.split("=")[0];
        return isSecretKey(key) ? `${key}=${redacted}` : line;
      })
  };

  if (!options.dryRun && options.out) {
    if (!validation.ok && !options.allowMissing) {
      report.status = "failed";
    } else {
      writeFile(options.out, envBody);
    }
  }
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
