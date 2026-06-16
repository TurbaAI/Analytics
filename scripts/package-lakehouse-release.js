#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

const requiredSecretBindings = [
  { secret: "turbalance-api-auth", remoteKey: "lakehouse/api-auth", properties: ["api-tokens", "jwks"] },
  { secret: "turbalance-collector-auth", remoteKey: "lakehouse/collector-auth", properties: ["tenant-credentials", "bearer-token", "hmac-secret"] },
  { secret: "turbalance-discovery-auth", remoteKey: "lakehouse/discovery-auth", properties: ["enrollment-token"] },
  { secret: "turbalance-agent-client-ca", remoteKey: "lakehouse/mtls-agent-ca", properties: ["ca.crt"] },
  { secret: "turbalance-metadata-db", remoteKey: "lakehouse/metadata-db", properties: ["database-url"] },
  {
    secret: "turbalance-object-store",
    remoteKey: "lakehouse/object-store",
    properties: ["access-key-id", "secret-access-key", "region", "endpoint-url", "scheme"]
  },
  { secret: "turbalance-collector-queue-auth", remoteKey: "lakehouse/queue-gateway", properties: ["bearer-token"] },
  { secret: "turbalance-otel-backend", remoteKey: "lakehouse/otel-backend", properties: ["otlp-endpoint", "authorization"] },
  {
    secret: "turbalance-alert-routing",
    remoteKey: "lakehouse/alert-routing",
    properties: ["webhook-url", "slack-webhook-url", "pagerduty-routing-key"]
  }
];

function parseArgs(argv) {
  const options = {
    out: "",
    registry: process.env.TURBALANCE_IMAGE_REGISTRY || "",
    tag: process.env.TURBALANCE_IMAGE_TAG || "",
    namespace: process.env.TURBALANCE_NAMESPACE || "turbalance-lakehouse",
    lakeRoot: process.env.TURBALANCE_LAKE_ROOT || "",
    jwtIssuer: process.env.TURBALANCE_API_JWT_ISSUER || "",
    jwtAudience: process.env.TURBALANCE_API_JWT_AUDIENCE || "turbalance-api",
    certificateMode: process.env.TURBALANCE_DISCOVERY_CERTIFICATE_MODE || "spire",
    externalCaCommand: process.env.TURBALANCE_DISCOVERY_EXTERNAL_CA_COMMAND || "",
    trustedSpiffePrefix: process.env.TURBALANCE_TRUSTED_SPIFFE_PREFIX || "spiffe://turbalance.local/",
    queueBackend: process.env.TURBALANCE_QUEUE_GATEWAY_BACKEND || "kafka",
    queueBrokerUrl: process.env.TURBALANCE_QUEUE_GATEWAY_BROKER_URL || "",
    queueTopic: process.env.TURBALANCE_QUEUE_GATEWAY_TOPIC || "turbalance.collector.telemetry",
    queueProducerCommand: process.env.TURBALANCE_QUEUE_GATEWAY_PRODUCER_COMMAND || "",
    queueUrl:
      process.env.TURBALANCE_COLLECTOR_QUEUE_URL ||
      "http://queue-gateway.turbalance-lakehouse.svc.cluster.local:8804/v1/queue/collector",
    allowPlaceholders: false,
    archive: true
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--allow-placeholders") {
      options.allowPlaceholders = true;
    } else if (arg === "--no-archive") {
      options.archive = false;
    } else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (!(key in options)) {
        throw new Error(`Unknown argument ${arg}`);
      }
      options[key] = required(arg, next);
      index += 1;
    } else {
      throw new Error(`Unexpected argument ${arg}`);
    }
  }
  return options;
}

function required(flag, value) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function printHelp() {
  console.log(`Usage: scripts/package-lakehouse-release.js --out <dir> [options]

Required in strict mode:
  --registry <registry>              Image registry/prefix, for example ghcr.io/acme/turbalance
  --tag <tag>                        Immutable release tag
  --lake-root <s3://bucket/prefix>   Durable object-lake root
  --jwt-issuer <url>                 OIDC/JWT issuer expected by api-server
  --queue-broker-url <url>           Kafka/Redpanda bootstrap URL or NATS server

Options:
  --namespace <name>                 Kubernetes namespace
  --jwt-audience <audience>          JWT audience expected by api-server
  --certificate-mode <mode>          local-ca, spire, or external-ca
  --external-ca-command <command>    Required when certificate mode is external-ca
  --trusted-spiffe-prefix <prefix>   Trusted SPIFFE URI prefix for collector mTLS
  --queue-backend <backend>          kafka, redpanda, nats, or file
  --queue-topic <topic>              Broker topic or subject
  --queue-producer-command <cmd>     Optional queue producer command override
  --queue-url <url>                  Queue gateway URL used by collector-gateway
  --allow-placeholders              Allow example/placeholder values for dry-run packaging
  --no-archive                      Skip tar.gz release archive creation`);
}

function validateStrictOptions(options) {
  if (options.allowPlaceholders) return [];
  const checks = [
    ["registry", options.registry],
    ["tag", options.tag],
    ["lakeRoot", options.lakeRoot],
    ["jwtIssuer", options.jwtIssuer],
    ["queueBrokerUrl", options.queueBackend === "file" ? "file-backend" : options.queueBrokerUrl],
    ["queueTopic", options.queueTopic],
    ["trustedSpiffePrefix", options.trustedSpiffePrefix]
  ];
  const failures = [];
  for (const [name, value] of checks) {
    if (!value) {
      failures.push(`${name} is required`);
    } else if (isPlaceholder(value)) {
      failures.push(`${name} contains a placeholder/example value`);
    }
  }
  if (options.tag === "latest") {
    failures.push("tag must be immutable and cannot be latest");
  }
  if (options.lakeRoot && !options.lakeRoot.startsWith("s3://")) {
    failures.push("lakeRoot must use s3:// for production packaging");
  }
  if (options.jwtIssuer) {
    try {
      const issuer = new URL(options.jwtIssuer);
      if (!["https:"].includes(issuer.protocol)) {
        failures.push("jwtIssuer must use https");
      }
    } catch {
      failures.push("jwtIssuer must be a valid URL");
    }
  }
  if (!["local-ca", "spire", "external-ca"].includes(options.certificateMode)) {
    failures.push("certificateMode must be local-ca, spire, or external-ca");
  }
  if (options.certificateMode === "external-ca" && !options.externalCaCommand) {
    failures.push("externalCaCommand is required when certificateMode is external-ca");
  }
  if (!["kafka", "redpanda", "nats", "file"].includes(options.queueBackend)) {
    failures.push("queueBackend must be kafka, redpanda, nats, or file");
  }
  return failures;
}

function isPlaceholder(value) {
  return /replace-with|your-org|issuer\.example|provider\.example|registry\.example|s3:\/\/replace|example\.com|\.example(?:\/|:|$)/i.test(
    String(value)
  );
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result.stdout;
}

function renderOverlay(options, overlayDir) {
  const args = [
    "scripts/render-lakehouse-kustomize-overlay.js",
    "--out",
    overlayDir,
    "--registry",
    options.registry || "ghcr.io/your-org/turbalance",
    "--tag",
    options.tag || "replace-with-release-tag",
    "--namespace",
    options.namespace,
    "--lake-root",
    options.lakeRoot || "s3://replace-with-bucket/turbalance/lakehouse",
    "--jwt-issuer",
    options.jwtIssuer || "https://issuer.example",
    "--jwt-audience",
    options.jwtAudience,
    "--certificate-mode",
    options.certificateMode,
    "--trusted-spiffe-prefix",
    options.trustedSpiffePrefix,
    "--queue-url",
    options.queueUrl,
    "--queue-backend",
    options.queueBackend,
    "--queue-broker-url",
    options.queueBrokerUrl || "kafka.kafka.svc.cluster.local:9092",
    "--queue-topic",
    options.queueTopic
  ];
  if (options.externalCaCommand) {
    args.push("--external-ca-command", options.externalCaCommand);
  }
  if (options.queueProducerCommand) {
    args.push("--queue-producer-command", options.queueProducerCommand);
  }
  run("node", args);
}

function validateRenderedFiles(dir, allowPlaceholders) {
  const failures = [];
  const files = listFiles(dir);
  for (const file of files) {
    const body = fs.readFileSync(file, "utf8");
    if (!allowPlaceholders && isPlaceholder(body)) {
      failures.push(`${path.relative(root, file)} contains a placeholder/example value`);
    }
  }
  const kustomization = fs.readFileSync(path.join(dir, "kustomization.yaml"), "utf8");
  const requiredFragments = [
    "lakehouse-platform-auth-secrets.yaml",
    "lakehouse-managed-storage.yaml",
    "lakehouse-otel-backend-secret.yaml",
    "lakehouse-alert-routing.yaml",
    "delete-placeholder-secrets.yaml",
    "otel-backend-config-patch.yaml"
  ];
  for (const fragment of requiredFragments) {
    if (!kustomization.includes(fragment)) {
      failures.push(`kustomization.yaml missing ${fragment}`);
    }
  }
  return failures;
}

function listFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function archiveRelease(outDir) {
  const archivePath = `${outDir}.tar.gz`;
  run("tar", ["-czf", archivePath, "-C", path.dirname(outDir), path.basename(outDir)]);
  return archivePath;
}

function main() {
  const options = parseArgs(process.argv);
  if (!options.out) {
    throw new Error("--out is required");
  }
  const strictFailures = validateStrictOptions(options);
  if (strictFailures.length) {
    throw new Error(`release package is not production-ready:\n- ${strictFailures.join("\n- ")}`);
  }

  const outDir = path.resolve(process.cwd(), options.out);
  const overlayDir = path.join(outDir, "kustomize");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(overlayDir, { recursive: true });
  renderOverlay(options, overlayDir);

  const renderedFailures = validateRenderedFiles(overlayDir, options.allowPlaceholders);
  if (renderedFailures.length) {
    throw new Error(`rendered release package is not production-ready:\n- ${renderedFailures.join("\n- ")}`);
  }

  const manifest = {
    status: "ready",
    generatedAt: new Date().toISOString(),
    namespace: options.namespace,
    images: {
      registry: options.registry,
      tag: options.tag
    },
    lakeRoot: options.lakeRoot,
    jwt: {
      issuer: options.jwtIssuer,
      audience: options.jwtAudience
    },
    certificateMode: options.certificateMode,
    queue: {
      backend: options.queueBackend,
      brokerUrl: options.queueBrokerUrl,
      topic: options.queueTopic
    },
    checks: {
      placeholdersAllowed: options.allowPlaceholders,
      staticPlaceholderSecretsDeleted: true,
      requiredExternalSecrets: requiredSecretBindings.map((binding) => binding.secret)
    },
    apply: {
      secrets: "confirm ExternalSecrets are synced, or apply real Secrets rendered by scripts/render-lakehouse-secrets.js",
      kustomize: `kubectl apply -k ${path.relative(root, overlayDir).split(path.sep).join("/")}`,
      smoke: `node scripts/run-lakehouse-cluster-smoke.js --namespace ${options.namespace} --overlay ${path.relative(root, overlayDir).split(path.sep).join("/")}`
    }
  };
  writeJson(path.join(outDir, "release-manifest.json"), manifest);
  writeJson(path.join(outDir, "secret-requirements.json"), { requiredSecretBindings });
  const files = listFiles(outDir).map((file) => ({
    path: path.relative(outDir, file).split(path.sep).join("/"),
    sha256: sha256(file)
  }));
  writeJson(path.join(outDir, "checksums.json"), { files });
  const archivePath = options.archive ? archiveRelease(outDir) : "";

  console.log(
    JSON.stringify(
      {
        status: "ready",
        outDir,
        archivePath,
        manifest: path.join(outDir, "release-manifest.json"),
        checksums: path.join(outDir, "checksums.json")
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
