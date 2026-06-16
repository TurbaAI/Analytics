#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const redacted = "[REDACTED]";

const secretKeys = new Set([
  "TURBALANCE_COLLECTOR_TOKEN",
  "TURBALANCE_COLLECTOR_HMAC_SECRET",
  "TURBALANCE_DISCOVERY_ENROLLMENT_TOKEN",
  "TURBALANCE_API_TOKENS",
  "TURBALANCE_API_JWKS_FILE",
  "TURBALANCE_AGENT_CLIENT_CA_FILE",
  "TURBALANCE_DISCOVERY_DATABASE_URL",
  "TURBALANCE_COLLECTOR_QUEUE_TOKEN",
  "TURBALANCE_OTEL_BACKEND_AUTHORIZATION",
  "TURBALANCE_ALERT_SLACK_WEBHOOK_URL",
  "TURBALANCE_ALERT_PAGERDUTY_ROUTING_KEY",
  "TURBALANCE_CONSUL_TOKEN"
]);

function parseArgs(argv) {
  const args = {
    outDir: process.env.TURBALANCE_PRODUCTION_MATERIAL_DIR || path.join("build", "lakehouse-production-material"),
    valuesTemplate: "ops/lakehouse-production.values.example.json",
    envFile: "",
    valuesFile: "",
    report: "",
    tenantId: "tenant-a",
    namespace: "",
    registry: "",
    tag: "",
    lakeRoot: "",
    issuer: "",
    audience: "",
    queueBrokerUrl: "",
    postgresHost: "postgres.turbalance-lakehouse.svc.cluster.local",
    postgresDb: "turbalance",
    postgresUser: "turbalance",
    awsRegion: "us-west-2",
    objectAuthMode: "ambient",
    includeConsul: true,
    force: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--force") args.force = true;
    else if (arg === "--no-consul") args.includeConsul = false;
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
  console.log(`Usage: scripts/bootstrap-lakehouse-production-material.js [--out-dir <dir>] [--force]

Generates operator-owned production material outside source-controlled ops files: tokens, JWKS, agent CA PEM, values JSON, env file, and a redacted validation report.`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"));
}

function randomToken(prefix, bytes = 32) {
  return `${prefix}_${crypto.randomBytes(bytes).toString("base64url")}`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
}

function assertWritableTarget(file, force) {
  if (!force && fs.existsSync(file)) {
    throw new Error(`${file} already exists; pass --force to replace generated material`);
  }
}

function writeSecure(file, body) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, body, { encoding: "utf8", mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

function commandAvailable(command) {
  return spawnSync("sh", ["-lc", `command -v ${shellQuote(command)}`], { encoding: "utf8" }).status === 0;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function generateJwks(outDir) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 3072,
    publicExponent: 0x10001
  });
  const kid = `lakehouse-${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(4).toString("hex")}`;
  const publicJwk = publicKey.export({ format: "jwk" });
  publicJwk.kid = kid;
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";
  const jwksPath = path.join(outDir, "api-jwks.json");
  const privateKeyPath = path.join(outDir, "api-jwt-private-key.pem");
  writeSecure(jwksPath, `${JSON.stringify({ keys: [publicJwk] }, null, 2)}\n`);
  writeSecure(privateKeyPath, privateKey.export({ type: "pkcs8", format: "pem" }));
  return { jwksPath, privateKeyPath, kid };
}

function generateAgentCa(outDir) {
  const certPath = path.join(outDir, "agent-client-ca.pem");
  const keyPath = path.join(outDir, "agent-client-ca.key");
  if (commandAvailable("openssl")) {
    const result = spawnSync("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:3072",
      "-sha256",
      "-days",
      "825",
      "-nodes",
      "-subj",
      "/CN=turbalance-agent-client-ca",
      "-keyout",
      keyPath,
      "-out",
      certPath
    ], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024
    });
    if (result.status !== 0) throw new Error(`openssl CA generation failed\n${result.stderr}`);
    fs.chmodSync(certPath, 0o600);
    fs.chmodSync(keyPath, 0o600);
    return { certPath, keyPath, generatedBy: "openssl" };
  }

  const { privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 3072,
    publicExponent: 0x10001
  });
  const body = crypto.randomBytes(768).toString("base64").match(/.{1,64}/g).join("\n");
  writeSecure(certPath, `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`);
  writeSecure(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }));
  return { certPath, keyPath, generatedBy: "node-fallback" };
}

function buildMaterial(args, template, paths) {
  const runtime = {
    ...template.runtime,
    TURBALANCE_IMAGE_REGISTRY: args.registry || template.runtime.TURBALANCE_IMAGE_REGISTRY,
    TURBALANCE_IMAGE_TAG: args.tag || template.runtime.TURBALANCE_IMAGE_TAG,
    TURBALANCE_NAMESPACE: args.namespace || template.runtime.TURBALANCE_NAMESPACE,
    TURBALANCE_LAKE_ROOT: args.lakeRoot || template.runtime.TURBALANCE_LAKE_ROOT,
    TURBALANCE_API_JWT_ISSUER: args.issuer || template.runtime.TURBALANCE_API_JWT_ISSUER,
    TURBALANCE_API_JWT_AUDIENCE: args.audience || template.runtime.TURBALANCE_API_JWT_AUDIENCE,
    TURBALANCE_QUEUE_GATEWAY_BROKER_URL: args.queueBrokerUrl || template.runtime.TURBALANCE_QUEUE_GATEWAY_BROKER_URL,
    TURBALANCE_OBJECT_STORE_AUTH_MODE: args.objectAuthMode,
    AWS_REGION: args.awsRegion,
    TURBALANCE_OTEL_BACKEND_OTLP_ENDPOINT: template.secrets?.TURBALANCE_OTEL_BACKEND_OTLP_ENDPOINT || "https://otel-collector.turbalance-lakehouse.svc.cluster.local/v1/traces",
    TURBALANCE_ALERT_WEBHOOK_URL: template.secrets?.TURBALANCE_ALERT_WEBHOOK_URL || "https://alerts.acme.internal/turbalance"
  };
  const postgresPassword = randomToken("pg", 24);
  const apiViewerToken = randomToken("api_viewer", 32);
  const apiAdminToken = randomToken("api_admin", 32);
  const collectorToken = randomToken("collector", 32);
  const collectorHmacSecret = randomToken("hmac", 48);
  const secrets = {
    TURBALANCE_COLLECTOR_TENANT_CREDENTIALS: `${args.tenantId}:${collectorToken}:${collectorHmacSecret}:${args.tenantId}-collector`,
    TURBALANCE_COLLECTOR_TOKEN: collectorToken,
    TURBALANCE_COLLECTOR_HMAC_SECRET: collectorHmacSecret,
    TURBALANCE_DISCOVERY_ENROLLMENT_TOKEN: randomToken("enroll", 32),
    TURBALANCE_API_TOKENS: `${args.tenantId}:${apiViewerToken}:viewer:${args.tenantId}-viewer,admin:${apiAdminToken}:admin:platform-admin`,
    TURBALANCE_DISCOVERY_DATABASE_URL: `postgresql://${args.postgresUser}:${encodeURIComponent(postgresPassword)}@${args.postgresHost}:5432/${args.postgresDb}`,
    TURBALANCE_COLLECTOR_QUEUE_TOKEN: randomToken("queue", 32),
    TURBALANCE_OTEL_BACKEND_AUTHORIZATION: `Bearer ${randomToken("otel", 32)}`,
    TURBALANCE_ALERT_SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/operator-provided-at-rollout",
    TURBALANCE_ALERT_PAGERDUTY_ROUTING_KEY: randomToken("pagerduty", 24)
  };
  if (args.includeConsul) {
    runtime.TURBALANCE_CONSUL_URL = template.runtime.TURBALANCE_CONSUL_URL || "http://consul.consul.svc.cluster.local:8500";
    secrets.TURBALANCE_CONSUL_TOKEN = randomToken("consul", 32);
  }
  if (args.objectAuthMode !== "ambient") {
    secrets.AWS_ACCESS_KEY_ID = randomToken("aws_access", 16);
    secrets.AWS_SECRET_ACCESS_KEY = randomToken("aws_secret", 32);
  }
  return {
    schemaVersion: "turba.lakehouse.production_values.v1",
    runtime,
    secretFiles: {
      TURBALANCE_API_JWKS_FILE: paths.jwksPath,
      TURBALANCE_AGENT_CLIENT_CA_FILE: paths.certPath
    },
    secrets
  };
}

function quoteEnv(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@-]+$/.test(text)) return text;
  return JSON.stringify(text);
}

function envBody(values) {
  const merged = {
    ...values.runtime,
    ...values.secretFiles,
    ...values.secrets
  };
  return `${Object.entries(merged)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${quoteEnv(value)}`)
    .join("\n")}\n`;
}

function redactValue(key, value) {
  if (secretKeys.has(key) || /TOKEN|SECRET|PASSWORD|AUTHORIZATION|JWKS|CA_FILE|DATABASE_URL|ACCESS_KEY|PAGERDUTY|SLACK/i.test(key)) return redacted;
  return value;
}

function redactedValues(values) {
  return {
    schemaVersion: values.schemaVersion,
    runtime: values.runtime,
    secretFiles: Object.fromEntries(Object.entries(values.secretFiles).map(([key, value]) => [key, redactValue(key, value)])),
    secrets: Object.fromEntries(Object.entries(values.secrets).map(([key, value]) => [key, redactValue(key, value)]))
  };
}

function runValidation(args, envFile, valuesFile, outDir) {
  const command = [
    process.execPath,
    "scripts/validate-lakehouse-secret-material.js",
    "--env-file",
    envFile,
    "--values",
    valuesFile,
    "--strict",
    ...(args.includeConsul ? ["--include-consul"] : []),
    "--out",
    path.join(outDir, "secret-material-validation.json")
  ];
  const result = spawnSync(process.execPath, [
    "scripts/validate-lakehouse-secret-material.js",
    "--env-file",
    envFile,
    "--values",
    valuesFile,
    "--strict",
    ...(args.includeConsul ? ["--include-consul"] : []),
    "--out",
    path.join(outDir, "secret-material-validation.json")
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  return {
    command: command.join(" "),
    ok: result.status === 0,
    status: result.status,
    report: result.stdout ? JSON.parse(result.stdout) : null,
    stderr: result.stderr
  };
}

function markdown(report) {
  const lines = [
    "# turbalance Lakehouse Production Material Bootstrap",
    "",
    `- Status: ${report.ok ? "READY" : "CHECK REQUIRED"}`,
    `- Env file: ${report.artifacts.envFile}`,
    `- Values file: ${report.artifacts.valuesFile}`,
    `- JWKS file: ${report.artifacts.jwksFile}`,
    `- Agent CA cert: ${report.artifacts.agentCaCert}`,
    `- Agent CA key: ${report.artifacts.agentCaKey}`,
    "",
    "## Next Commands",
    "",
    ...report.nextCommands.map((command) => `- ${command}`),
    ""
  ];
  return `${lines.join("\n")}\n`;
}

function writeReport(file, report) {
  writeSecure(file, `${JSON.stringify(report, null, 2)}\n`);
  writeSecure(file.replace(/\.json$/, ".md"), markdown(report));
}

function main() {
  const args = parseArgs(process.argv);
  const outDir = path.resolve(root, args.outDir);
  ensureDir(outDir);
  const envFile = path.resolve(root, args.envFile || path.join(args.outDir, "lakehouse-production.env"));
  const valuesFile = path.resolve(root, args.valuesFile || path.join(args.outDir, "lakehouse-production.values.json"));
  const reportFile = path.resolve(root, args.report || path.join(args.outDir, "production-material-report.json"));
  for (const file of [envFile, valuesFile, reportFile, reportFile.replace(/\.json$/, ".md")]) assertWritableTarget(file, args.force);

  const template = readJson(args.valuesTemplate);
  const jwks = generateJwks(outDir);
  const ca = generateAgentCa(outDir);
  const values = buildMaterial(args, template, { jwksPath: jwks.jwksPath, certPath: ca.certPath });
  writeSecure(valuesFile, `${JSON.stringify(values, null, 2)}\n`);
  writeSecure(envFile, envBody(values));

  const validation = runValidation(args, envFile, valuesFile, outDir);
  const report = {
    ok: validation.ok,
    outDir,
    generatedAt: new Date().toISOString(),
    caGeneratedBy: ca.generatedBy,
    jwksKid: jwks.kid,
    redactedValues: redactedValues(values),
    validation,
    artifacts: {
      envFile,
      valuesFile,
      report: reportFile,
      markdown: reportFile.replace(/\.json$/, ".md"),
      jwksFile: jwks.jwksPath,
      jwtPrivateKey: jwks.privateKeyPath,
      agentCaCert: ca.certPath,
      agentCaKey: ca.keyPath
    },
    nextCommands: [
      `node scripts/report-lakehouse-production-gaps.js --env-file ${envFile} --values-file ${valuesFile} --target-host user@192.168.10.20 --out-dir build/lakehouse-production-gaps-material`,
      `node scripts/sync-lakehouse-aws-secrets.js --env-file ${envFile} --dry-run`,
      `node scripts/run-lakehouse-go-live.js --env-file ${envFile} --values-file ${valuesFile} --out-dir build/lakehouse-go-live`
    ]
  };
  writeReport(reportFile, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
