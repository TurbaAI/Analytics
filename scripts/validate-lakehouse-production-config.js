#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

const required = [
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

function parseArgs(argv) {
  const args = {
    envFile: process.env.TURBALANCE_LAKEHOUSE_ENV_FILE || "",
    out: "",
    requireTools: false,
    allowExample: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--env-file") {
      args.envFile = need(arg, next);
      index += 1;
    } else if (arg === "--out") {
      args.out = need(arg, next);
      index += 1;
    } else if (arg === "--require-tools") {
      args.requireTools = true;
    } else if (arg === "--allow-example") {
      args.allowExample = true;
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
  console.log(`Usage: scripts/validate-lakehouse-production-config.js [--env-file <file>] [--out <file>] [--require-tools]

Validates the production lakehouse env contract used by the release/go-live runner.`);
}

function parseEnvFile(file) {
  if (!file) return {};
  const fullPath = path.resolve(root, file);
  const body = fs.readFileSync(fullPath, "utf8");
  const values = {};
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = unquote(match[2].trim());
  }
  return values;
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function mergedConfig(envFile) {
  return { ...process.env, ...parseEnvFile(envFile) };
}

function isPlaceholder(value) {
  return /replace-with|your-org|issuer\.example|provider\.example|registry\.example|s3:\/\/replace|example\.com|\.example(?:\/|:|$)/i.test(
    String(value)
  );
}

function commandAvailable(command) {
  const paths = String(process.env.PATH || "").split(path.delimiter);
  return paths.some((dir) => fs.existsSync(path.join(dir, command)));
}

function check(name, passed, detail, severity = "error") {
  return { name, passed: Boolean(passed), detail, severity };
}

function validate(config, options) {
  const checks = [];
  for (const key of required) {
    checks.push(check(`required.${key}`, Boolean(config[key]), `${key} is set`));
    if (config[key] && !options.allowExample) {
      checks.push(check(`placeholder.${key}`, !isPlaceholder(config[key]), `${key} does not contain an example/placeholder value`));
    }
  }
  checks.push(check("image_tag_immutable", config.TURBALANCE_IMAGE_TAG && config.TURBALANCE_IMAGE_TAG !== "latest", "image tag is immutable"));
  checks.push(check("lake_root_s3", String(config.TURBALANCE_LAKE_ROOT || "").startsWith("s3://"), "lake root uses s3://"));
  checks.push(check("jwt_issuer_https", isHttpsUrl(config.TURBALANCE_API_JWT_ISSUER), "JWT issuer is an HTTPS URL"));
  checks.push(
    check(
      "certificate_mode_supported",
      ["local-ca", "spire", "external-ca"].includes(String(config.TURBALANCE_DISCOVERY_CERTIFICATE_MODE || "")),
      "certificate mode is local-ca, spire, or external-ca"
    )
  );
  checks.push(
    check(
      "queue_backend_supported",
      ["kafka", "redpanda", "nats", "file"].includes(String(config.TURBALANCE_QUEUE_GATEWAY_BACKEND || "")),
      "queue backend is kafka, redpanda, nats, or file"
    )
  );
  if (config.TURBALANCE_DISCOVERY_CERTIFICATE_MODE === "external-ca") {
    checks.push(check("external_ca_command", Boolean(config.TURBALANCE_DISCOVERY_EXTERNAL_CA_COMMAND), "external CA command is set"));
  }
  if (options.requireTools) {
    for (const command of ["docker", "kubectl"]) {
      checks.push(check(`tool.${command}`, commandAvailable(command), `${command} is installed`));
    }
    if (config.TURBALANCE_TERRAFORM_DIR) {
      checks.push(check("tool.terraform", commandAvailable("terraform"), "terraform is installed"));
    }
  }
  const failed = checks.filter((item) => !item.passed && item.severity === "error");
  return {
    ok: failed.length === 0,
    summary: {
      passed: checks.filter((item) => item.passed).length,
      failed: failed.length,
      warnings: checks.filter((item) => !item.passed && item.severity === "warning").length
    },
    values: publicConfig(config),
    checks
  };
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function publicConfig(config) {
  const keys = [
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
    "TURBALANCE_QUEUE_GATEWAY_TOPIC",
    "TURBALANCE_TERRAFORM_DIR",
    "TURBALANCE_EBPF_HOSTS_FILE"
  ];
  return Object.fromEntries(keys.map((key) => [key, config[key] || ""]));
}

function main() {
  const options = parseArgs(process.argv);
  const report = validate(mergedConfig(options.envFile), options);
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (options.out) {
    fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
    fs.writeFileSync(options.out, output);
  }
  process.stdout.write(output);
  if (!report.ok) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
