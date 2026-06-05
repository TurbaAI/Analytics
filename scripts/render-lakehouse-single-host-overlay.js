#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const images = [
  "collector-gateway",
  "duckdb-query-service",
  "api-server",
  "discovery-api",
  "queue-gateway",
  "ebpf-agent",
  "dagster",
  "transform-runner",
  "raw-writer",
  "sqlmesh"
];

function parseArgs(argv) {
  const args = {
    out: "",
    registry: process.env.TURBALANCE_IMAGE_REGISTRY || process.env.TURBALANCE_LOCAL_IMAGE_REGISTRY || "localhost:5000/turbalance",
    tag: process.env.TURBALANCE_IMAGE_TAG || "dev",
    namespace: process.env.TURBALANCE_NAMESPACE || "turbalance-lakehouse",
    base: process.env.TURBALANCE_KUSTOMIZE_BASE || "",
    lakeRoot: process.env.TURBALANCE_LAKE_ROOT || "/var/lib/turbalance/lakehouse",
    requireAuth: false,
    requireMtls: false,
    queueBackend: "file",
    queueUrl: "",
    queueBrokerUrl: "",
    queueTopic: process.env.TURBALANCE_QUEUE_GATEWAY_TOPIC || "turbalance.collector.telemetry",
    certificateMode: "local-ca",
    trustedSpiffePrefix: process.env.TURBALANCE_TRUSTED_SPIFFE_PREFIX || "spiffe://turbalance.local/"
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--require-auth") args.requireAuth = true;
    else if (arg === "--require-mtls") args.requireMtls = true;
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
  console.log(`Usage: scripts/render-lakehouse-single-host-overlay.js --out <dir> [options]

Renders a credential-light single-host Kustomize overlay for SPARK1-style activation. It uses the normal lakehouse base, deletes placeholder Secret resources from the rendered output so pre-applied real Secrets are preserved, and patches the platform to local file-backed storage/queueing.

Options:
  --registry <registry>              Image registry/prefix, default localhost:5000/turbalance
  --tag <tag>                        Image tag, default TURBALANCE_IMAGE_TAG or dev
  --namespace <name>                 Kubernetes namespace
  --base <path>                      Base kustomization path, default repo lakehouse/base
  --lake-root <path>                 Mounted lake root, default /var/lib/turbalance/lakehouse
  --require-auth                     Keep API bearer/JWT auth enabled for this overlay
  --require-mtls                     Keep collector mTLS enforcement enabled for this overlay
  --queue-backend <backend>          Queue gateway backend, default file
  --queue-url <url>                  Collector queue URL; default disables collector queue forwarding
  --queue-broker-url <url>           Broker URL when queue backend is kafka/redpanda/nats
  --queue-topic <topic>              Queue topic/subject
  --certificate-mode <mode>          Discovery certificate mode, default local-ca
  --trusted-spiffe-prefix <prefix>   Trusted SPIFFE URI prefix`);
}

function relativeResource(fromDir, toPath) {
  const relativePath = path.relative(fromDir, toPath).split(path.sep).join("/");
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

function yamlScalar(value) {
  return JSON.stringify(String(value));
}

function renderKustomization(args) {
  const imageYaml = images
    .map((image) => `  - name: turbalance/${image}\n    newName: ${args.registry}/${image}\n    newTag: ${args.tag}`)
    .join("\n");
  return [
    "apiVersion: kustomize.config.k8s.io/v1beta1",
    "kind: Kustomization",
    `namespace: ${args.namespace}`,
    "resources:",
    `  - ${args.base}`,
    "patches:",
    "  - path: single-host-config-patch.yaml",
    "  - path: single-host-runtime-patch.yaml",
    "  - path: delete-placeholder-secrets.yaml",
    "images:",
    imageYaml,
    ""
  ].join("\n");
}

function renderConfigPatch(args) {
  return [
    "apiVersion: v1",
    "kind: ConfigMap",
    "metadata:",
    "  name: turbalance-platform-config",
    `  namespace: ${args.namespace}`,
    "data:",
    `  TURBALANCE_LAKE_ROOT: ${yamlScalar(args.lakeRoot)}`,
    `  TURBALANCE_API_REQUIRE_AUTH: ${yamlScalar(args.requireAuth ? "true" : "false")}`,
    `  TURBALANCE_API_JWT_ISSUER: ${yamlScalar("")}`,
    `  TURBALANCE_API_JWT_AUDIENCE: ${yamlScalar("turbalance-api")}`,
    `  TURBALANCE_DISCOVERY_CERTIFICATE_MODE: ${yamlScalar(args.certificateMode)}`,
    `  TURBALANCE_COLLECTOR_REQUIRE_MTLS: ${yamlScalar(args.requireMtls ? "true" : "false")}`,
    `  TURBALANCE_TRUSTED_SPIFFE_PREFIX: ${yamlScalar(args.trustedSpiffePrefix)}`,
    `  TURBALANCE_COLLECTOR_QUEUE_BACKEND: ${yamlScalar(args.queueUrl ? "http" : "")}`,
    `  TURBALANCE_COLLECTOR_QUEUE_URL: ${yamlScalar(args.queueUrl)}`,
    `  TURBALANCE_QUEUE_GATEWAY_BACKEND: ${yamlScalar(args.queueBackend)}`,
    `  TURBALANCE_QUEUE_GATEWAY_BROKER_URL: ${yamlScalar(args.queueBrokerUrl)}`,
    `  TURBALANCE_QUEUE_GATEWAY_TOPIC: ${yamlScalar(args.queueTopic)}`,
    `  TURBALANCE_QUEUE_GATEWAY_DRY_RUN: ${yamlScalar(args.queueBackend === "file" ? "false" : "true")}`,
    ""
  ].join("\n");
}

function renderDeletePlaceholderSecretsPatch(args) {
  return `${["turbalance-api-auth", "turbalance-collector-auth", "turbalance-discovery-auth"]
    .map(
      (name) => `apiVersion: v1
kind: Secret
metadata:
  name: ${name}
  namespace: ${args.namespace}
$patch: delete
`
    )
    .join("---\n")}`;
}

function renderRuntimePatch(args) {
  const dagsterCommand =
    "mkdir -p \"$DAGSTER_HOME\" && printf 'telemetry:\\n  enabled: false\\n' > \"$DAGSTER_HOME/dagster.yaml\" && export HOME=\"$DAGSTER_HOME\" && dagster dev -h 0.0.0.0 -p 3002 -w orchestration/dagster/workspace.yaml";
  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: discovery-api
  namespace: ${args.namespace}
spec:
  template:
    spec:
      containers:
        - name: discovery-api
          env:
            - name: TURBALANCE_DISCOVERY_DATABASE_URL
              $patch: delete
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dagster
  namespace: ${args.namespace}
spec:
  strategy:
    $patch: replace
    type: Recreate
  template:
    spec:
      containers:
        - name: dagster
          args:
            - ${yamlScalar(dagsterCommand)}
`;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.out) throw new Error("--out is required");
  const outDir = path.resolve(root, args.out);
  args.base = args.base || relativeResource(outDir, path.join(root, "ops/kubernetes/lakehouse/base"));
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "kustomization.yaml"), renderKustomization(args), "utf8");
  fs.writeFileSync(path.join(outDir, "single-host-config-patch.yaml"), renderConfigPatch(args), "utf8");
  fs.writeFileSync(path.join(outDir, "single-host-runtime-patch.yaml"), renderRuntimePatch(args), "utf8");
  fs.writeFileSync(path.join(outDir, "delete-placeholder-secrets.yaml"), renderDeletePlaceholderSecretsPatch(args), "utf8");
  process.stdout.write(
    `${JSON.stringify(
      {
        status: "rendered",
        outDir,
        namespace: args.namespace,
        registry: args.registry,
        tag: args.tag,
        lakeRoot: args.lakeRoot,
        queueBackend: args.queueBackend,
        requireAuth: args.requireAuth,
        requireMtls: args.requireMtls
      },
      null,
      2
    )}\n`
  );
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
