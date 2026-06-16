#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

const secretGroups = [
  {
    name: "api-auth",
    remoteKey: "lakehouse/api-auth",
    required: true,
    alternatives: [
      { keys: ["TURBALANCE_API_TOKENS", "TURBALANCE_API_JWKS_FILE"], detail: "tenant tokens plus JWKS file" },
      { keys: ["TURBALANCE_API_TOKENS", "TURBALANCE_API_JWKS"], detail: "tenant tokens plus JWKS JSON" }
    ]
  },
  {
    name: "collector-auth",
    remoteKey: "lakehouse/collector-auth",
    required: true,
    alternatives: [
      { keys: ["TURBALANCE_COLLECTOR_TENANT_CREDENTIALS"], detail: "tenant-scoped collector credential map" },
      { keys: ["TURBALANCE_COLLECTOR_TENANT_CREDENTIALS_FILE"], detail: "tenant-scoped collector credential file" },
      { keys: ["TURBALANCE_COLLECTOR_TOKEN", "TURBALANCE_COLLECTOR_HMAC_SECRET"], detail: "legacy collector bearer token plus HMAC secret" }
    ]
  },
  {
    name: "discovery-auth",
    remoteKey: "lakehouse/discovery-auth",
    required: true,
    alternatives: [{ keys: ["TURBALANCE_DISCOVERY_ENROLLMENT_TOKEN"], detail: "discovery enrollment token" }]
  },
  {
    name: "agent-client-ca",
    remoteKey: "lakehouse/mtls-agent-ca",
    required: true,
    alternatives: [
      { keys: ["TURBALANCE_AGENT_CLIENT_CA_FILE"], detail: "agent client CA file" },
      { keys: ["TURBALANCE_AGENT_CLIENT_CA_PEM"], detail: "agent client CA PEM" }
    ]
  },
  {
    name: "metadata-db",
    remoteKey: "lakehouse/metadata-db",
    required: true,
    alternatives: [
      { keys: ["TURBALANCE_DISCOVERY_DATABASE_URL"], detail: "discovery Postgres URL" },
      { keys: ["TURBALANCE_POSTGRES_URL"], detail: "shared Postgres URL" }
    ]
  },
  {
    name: "object-store",
    remoteKey: "lakehouse/object-store",
    required: true,
    alternatives: [
      { keys: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"], detail: "S3 access key pair plus region" },
      { keys: ["AWS_REGION", "TURBALANCE_OBJECT_STORE_AUTH_MODE"], detail: "IAM/ambient credentials plus region" }
    ]
  },
  {
    name: "queue-gateway",
    remoteKey: "lakehouse/queue-gateway",
    required: true,
    alternatives: [
      { keys: ["TURBALANCE_COLLECTOR_QUEUE_TOKEN"], detail: "collector queue gateway token" },
      { keys: ["TURBALANCE_QUEUE_GATEWAY_TOKEN"], detail: "queue gateway token" }
    ]
  },
  {
    name: "otel-backend",
    remoteKey: "lakehouse/otel-backend",
    required: false,
    alternatives: [
      { keys: ["TURBALANCE_OTEL_BACKEND_OTLP_ENDPOINT", "TURBALANCE_OTEL_BACKEND_AUTHORIZATION"], detail: "OTLP endpoint plus authorization" },
      { keys: ["TURBALANCE_OTEL_BACKEND_OTLP_ENDPOINT"], detail: "OTLP endpoint without auth" }
    ]
  },
  {
    name: "alert-routing",
    remoteKey: "lakehouse/alert-routing",
    required: false,
    alternatives: [
      { keys: ["TURBALANCE_ALERT_WEBHOOK_URL"], detail: "webhook URL" },
      { keys: ["TURBALANCE_ALERT_SLACK_WEBHOOK_URL"], detail: "Slack webhook" },
      { keys: ["TURBALANCE_ALERT_PAGERDUTY_ROUTING_KEY"], detail: "PagerDuty routing key" }
    ]
  },
  {
    name: "consul",
    remoteKey: "lakehouse/consul",
    required: false,
    includeOnlyWhenConsul: true,
    alternatives: [{ keys: ["TURBALANCE_CONSUL_TOKEN"], detail: "Consul ACL token" }]
  }
];

function parseArgs(argv) {
  const args = {
    envFile: process.env.TURBALANCE_LAKEHOUSE_ENV_FILE || "ops/lakehouse-production.env.example",
    values: process.env.TURBALANCE_LAKEHOUSE_VALUES_FILE || "",
    out: "",
    strict: false,
    includeConsul: false,
    allowPlaceholders: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--strict") args.strict = true;
    else if (arg === "--include-consul") args.includeConsul = true;
    else if (arg === "--allow-placeholders") args.allowPlaceholders = true;
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
  console.log(`Usage: scripts/validate-lakehouse-secret-material.js [--env-file <file>] [--values <json>] [--strict] [--out <json>]

Validates the presence, file references, and placeholder-free shape of production secret material without printing secret values.`);
}

function parseEnvFile(file) {
  if (!file) return { values: {}, dir: root };
  const fullPath = path.resolve(root, file);
  const values = {};
  for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = unquote(match[2].trim());
  }
  return { values, dir: path.dirname(fullPath) };
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

function parseValuesFile(file) {
  if (!file) return {};
  const fullPath = path.resolve(root, file);
  if (!fs.existsSync(fullPath)) return {};
  const doc = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  return { ...(doc.runtime || {}), ...(doc.secretFiles || {}), ...(doc.secrets || {}) };
}

function isPlaceholder(value) {
  return /replace-with|replace-outside-source-control|your-org|issuer\.example|provider\.example|registry\.example|example\.com|\.example(?:\/|:|$)|changeme|password/i.test(
    String(value)
  );
}

function sourceOf(config, key) {
  if (config[key] === undefined || config[key] === "") return "missing";
  if (key.endsWith("_FILE")) return "file";
  if (/URL|ENDPOINT|REGION|SCHEME|AUTH_MODE/.test(key)) return "config";
  return "secret";
}

function fileCandidate(value, envDir) {
  const candidates = [path.resolve(envDir, value), path.resolve(root, value)];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function inspectKey(config, envDir, key, options) {
  const value = config[key] || "";
  const present = value !== "";
  const detail = { key, present, source: sourceOf(config, key) };
  const checks = [check(`key.${key}.present`, present, `${key} is set`, "warning")];
  if (!present) return { detail, checks };
  checks.push(check(`key.${key}.not_placeholder`, options.allowPlaceholders || !isPlaceholder(value), `${key} is not a placeholder`));
  if (key.endsWith("_FILE")) {
    const file = fileCandidate(value, envDir);
    const exists = fs.existsSync(file);
    detail.fileExists = exists;
    detail.file = path.relative(root, file).split(path.sep).join("/");
    checks.push(check(`file.${key}.exists`, exists, `${key} points to an existing file`));
    if (exists && key.includes("JWKS")) {
      const jwks = readJson(file);
      checks.push(check(`file.${key}.jwks`, Boolean(jwks && Array.isArray(jwks.keys)), `${key} contains JWKS JSON with keys array`));
    }
    if (exists && key.includes("CA")) {
      const body = fs.readFileSync(file, "utf8");
      checks.push(check(`file.${key}.pem`, body.includes("BEGIN CERTIFICATE"), `${key} contains certificate PEM material`));
    }
  }
  if (key === "TURBALANCE_API_JWKS") {
    const jwks = readInlineJson(value);
    checks.push(check(`inline.${key}.jwks`, Boolean(jwks && Array.isArray(jwks.keys)), `${key} contains JWKS JSON with keys array`));
  }
  if (key.includes("DATABASE_URL")) {
    checks.push(check(`url.${key}.postgres`, /^postgres(?:ql)?:\/\//i.test(value), `${key} uses a Postgres URL`));
  }
  return { detail, checks };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function readInlineJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function check(name, passed, detail, severity = "error") {
  return { name, passed: Boolean(passed), detail, severity };
}

function validateGroup(group, config, envDir, options) {
  const alternatives = group.alternatives.map((alternative) => {
    const inspections = alternative.keys.map((key) => inspectKey(config, envDir, key, options));
    const keyChecks = inspections.flatMap((inspection) => inspection.checks);
    const blocking = keyChecks.filter((item) => !item.passed && item.severity === "error");
    const present = inspections.every((inspection) => inspection.detail.present);
    return {
      detail: alternative.detail,
      keys: inspections.map((inspection) => inspection.detail),
      satisfied: present && blocking.length === 0,
      checks: keyChecks
    };
  });
  const satisfied = alternatives.some((alternative) => alternative.satisfied);
  const severity = group.required || options.strict ? "error" : "warning";
  const checks = [
    check(`secret.${group.name}.satisfied`, satisfied, `${group.remoteKey} has ${group.alternatives.map((item) => item.detail).join(" or ")}`, severity),
    ...alternatives.flatMap((alternative) => alternative.checks)
  ];
  return {
    name: group.name,
    remoteKey: group.remoteKey,
    required: group.required,
    satisfied,
    alternatives: alternatives.map((alternative) => ({
      detail: alternative.detail,
      satisfied: alternative.satisfied,
      keys: alternative.keys
    })),
    checks
  };
}

function write(out, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(root, out)), { recursive: true });
    fs.writeFileSync(path.resolve(root, out), body, "utf8");
  }
  process.stdout.write(body);
}

function main() {
  const options = parseArgs(process.argv);
  const env = parseEnvFile(options.envFile);
  const values = parseValuesFile(options.values);
  const config = { ...process.env, ...values, ...env.values };
  const includeConsul = options.includeConsul || Boolean(config.TURBALANCE_CONSUL_TOKEN || config.TURBALANCE_CONSUL_URL);
  const groups = secretGroups
    .filter((group) => !group.includeOnlyWhenConsul || includeConsul)
    .map((group) => validateGroup(group, config, env.dir, options));
  const checks = groups.flatMap((group) => group.checks);
  const failed = checks.filter((item) => !item.passed && item.severity === "error");
  const warnings = checks.filter((item) => !item.passed && item.severity === "warning");
  const requiredMissing = groups.filter((group) => group.required && !group.satisfied);
  const status = failed.length ? (options.strict ? "failed" : "planned") : requiredMissing.length ? "planned" : "ready";
  write(options.out, {
    status,
    envFile: options.envFile,
    valuesFile: options.values,
    strict: options.strict,
    includeConsul,
    summary: {
      groups: groups.length,
      satisfied: groups.filter((group) => group.satisfied).length,
      requiredMissing: requiredMissing.length,
      failed: failed.length,
      warnings: warnings.length
    },
    groups: groups.map((group) => ({
      name: group.name,
      remoteKey: group.remoteKey,
      required: group.required,
      satisfied: group.satisfied,
      alternatives: group.alternatives
    })),
    checks
  });
  if (options.strict && failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
