#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const redacted = "[REDACTED]";

function parseArgs(argv) {
  const args = {
    envFile: process.env.TURBALANCE_LAKEHOUSE_ENV_FILE || "",
    out: "",
    dryRun: false,
    allowMissing: false,
    includeConsul: false,
    region: process.env.AWS_REGION || "",
    profile: process.env.AWS_PROFILE || ""
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--allow-missing") {
      args.allowMissing = true;
    } else if (arg === "--include-consul") {
      args.includeConsul = true;
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
  console.log(`Usage: scripts/sync-lakehouse-aws-secrets.js [--env-file <file>] [--dry-run] [--out <file>]

Syncs the lakehouse production env contract into AWS Secrets Manager keys consumed by the ExternalSecret manifests.

Live mode updates existing Secrets Manager secrets with aws secretsmanager put-secret-value. Use --dry-run to emit a redacted plan without touching AWS.`);
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
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function readFileValue(config, envKey, envDir) {
  const file = config[envKey];
  if (!file) return "";
  const candidates = [path.resolve(envDir, file), path.resolve(root, file)];
  const fullPath = candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
  return fs.readFileSync(fullPath, "utf8");
}

function first(config, keys, fallback = "") {
  for (const key of keys) {
    if (config[key]) return config[key];
  }
  return fallback;
}

function buildBindings(config, envDir, includeConsul) {
  const apiJwks = readFileValue(config, "TURBALANCE_API_JWKS_FILE", envDir) || config.TURBALANCE_API_JWKS || '{"keys":[]}';
  const agentCa = readFileValue(config, "TURBALANCE_AGENT_CLIENT_CA_FILE", envDir) || config.TURBALANCE_AGENT_CLIENT_CA_PEM || "";
  const region = first(config, ["AWS_REGION", "TURBALANCE_AWS_REGION"], "us-west-2");
  const endpoint = first(
    config,
    ["AWS_ENDPOINT_URL", "TURBALANCE_S3_ENDPOINT", "TURBALANCE_AWS_S3_ENDPOINT"],
    region ? `https://s3.${region}.amazonaws.com` : ""
  );
  const bindings = [
    binding("turbalance-api-auth", "lakehouse/api-auth", {
      "api-tokens": config.TURBALANCE_API_TOKENS || "",
      jwks: apiJwks
    }, ["api-tokens", "jwks"]),
    binding("turbalance-collector-auth", "lakehouse/collector-auth", {
      "bearer-token": config.TURBALANCE_COLLECTOR_TOKEN || "",
      "hmac-secret": config.TURBALANCE_COLLECTOR_HMAC_SECRET || ""
    }, ["bearer-token", "hmac-secret"]),
    binding("turbalance-discovery-auth", "lakehouse/discovery-auth", {
      "enrollment-token": config.TURBALANCE_DISCOVERY_ENROLLMENT_TOKEN || ""
    }, ["enrollment-token"]),
    binding("turbalance-agent-client-ca", "lakehouse/mtls-agent-ca", {
      "ca.crt": agentCa
    }, ["ca.crt"]),
    binding("turbalance-metadata-db", "lakehouse/metadata-db", {
      "database-url": first(config, ["TURBALANCE_DISCOVERY_DATABASE_URL", "TURBALANCE_POSTGRES_URL"])
    }, ["database-url"]),
    binding("turbalance-object-store", "lakehouse/object-store", {
      "access-key-id": config.AWS_ACCESS_KEY_ID || "",
      "secret-access-key": config.AWS_SECRET_ACCESS_KEY || "",
      region,
      "endpoint-url": endpoint,
      scheme: config.TURBALANCE_S3_SCHEME || "s3"
    }, ["region", "endpoint-url", "scheme"]),
    binding("turbalance-collector-queue-auth", "lakehouse/queue-gateway", {
      "bearer-token": first(config, ["TURBALANCE_COLLECTOR_QUEUE_TOKEN", "TURBALANCE_QUEUE_GATEWAY_TOKEN"])
    }, ["bearer-token"]),
    binding("turbalance-otel-backend", "lakehouse/otel-backend", {
      "otlp-endpoint": config.TURBALANCE_OTEL_BACKEND_OTLP_ENDPOINT || "",
      authorization: config.TURBALANCE_OTEL_BACKEND_AUTHORIZATION || ""
    }, []),
    binding("turbalance-alert-routing", "lakehouse/alert-routing", {
      "webhook-url": config.TURBALANCE_ALERT_WEBHOOK_URL || "",
      "slack-webhook-url": config.TURBALANCE_ALERT_SLACK_WEBHOOK_URL || "",
      "pagerduty-routing-key": config.TURBALANCE_ALERT_PAGERDUTY_ROUTING_KEY || ""
    }, [])
  ];
  if (includeConsul || config.TURBALANCE_CONSUL_TOKEN) {
    bindings.push(binding("turbalance-consul-auth", "lakehouse/consul", {
      token: config.TURBALANCE_CONSUL_TOKEN || ""
    }, ["token"]));
  }
  return bindings;
}

function binding(secret, remoteKey, values, requiredProperties) {
  return { secret, remoteKey, values, requiredProperties };
}

function awsCommand(options, remoteKey, secretString) {
  return [
    "secretsmanager",
    "put-secret-value",
    "--secret-id",
    remoteKey,
    "--secret-string",
    secretString,
    ...(options.region ? ["--region", options.region] : []),
    ...(options.profile ? ["--profile", options.profile] : [])
  ];
}

function redactedCommand(options, remoteKey) {
  return ["aws", ...awsCommand(options, remoteKey, redactedJson())].join(" ");
}

function redactedJson() {
  return JSON.stringify({ secretString: redacted });
}

function redactPayload(values) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value ? redacted : ""])
  );
}

function commandAvailable(command) {
  return spawnSync("sh", ["-lc", `command -v ${quote(command)}`], { encoding: "utf8" }).status === 0;
}

function quote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function putSecret(options, item) {
  const payload = JSON.stringify(item.values);
  const result = spawnSync("aws", awsCommand(options, item.remoteKey, payload), {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024
  });
  return {
    ok: result.status === 0,
    status: result.status,
    command: redactedCommand(options, item.remoteKey),
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function summarizeBinding(options, item) {
  const missingRequired = item.requiredProperties.filter((property) => !item.values[property]);
  return {
    secret: item.secret,
    remoteKey: item.remoteKey,
    properties: Object.keys(item.values),
    requiredProperties: item.requiredProperties,
    missingRequired,
    command: redactedCommand(options, item.remoteKey),
    payloadPreview: redactPayload(item.values)
  };
}

function write(out, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, body);
  }
  process.stdout.write(body);
}

function main() {
  const options = parseArgs(process.argv);
  const env = parseEnvFile(options.envFile);
  const config = { ...process.env, ...env.values };
  options.region ||= config.AWS_REGION || config.TURBALANCE_AWS_REGION || "";
  options.profile ||= config.AWS_PROFILE || "";
  const bindings = buildBindings(config, env.dir, options.includeConsul);
  const planned = bindings.map((item) => summarizeBinding(options, item));
  const missing = planned.flatMap((item) => item.missingRequired.map((property) => `${item.remoteKey}.${property}`));
  const warnings = missing.map((item) => `missing required value: ${item}`);

  if (options.dryRun) {
    write(options.out, {
      status: "dry-run",
      envFile: options.envFile,
      aws: { region: options.region, profile: options.profile ? redacted : "" },
      warnings,
      bindings: planned
    });
    return;
  }

  if (missing.length && !options.allowMissing) {
    write(options.out, {
      status: "failed",
      envFile: options.envFile,
      error: "required secret values are missing",
      warnings,
      bindings: planned
    });
    process.exitCode = 1;
    return;
  }
  if (!commandAvailable("aws")) {
    throw new Error("aws CLI is required outside --dry-run");
  }

  const results = bindings.map((item) => putSecret(options, item));
  const failed = results.filter((result) => !result.ok);
  write(options.out, {
    status: failed.length ? "failed" : "synced",
    envFile: options.envFile,
    aws: { region: options.region, profile: options.profile ? redacted : "" },
    warnings,
    bindings: planned,
    results
  });
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
