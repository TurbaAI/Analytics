#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const images = [
  "collector-gateway",
  "duckdb-query-service",
  "api-server",
  "discovery-api",
  "queue-gateway",
  "ebpf-agent",
  "dagster",
  "transform-runner",
  "raw-writer"
];

function parseArgs(argv) {
  const args = {
    registry: process.env.TURBALANCE_IMAGE_REGISTRY || "ghcr.io/your-org/turbalance",
    tag: process.env.TURBALANCE_IMAGE_TAG || "replace-with-release-tag",
    out: "",
    base: process.env.TURBALANCE_KUSTOMIZE_BASE || "",
    platformAuthSecrets: process.env.TURBALANCE_KUSTOMIZE_PLATFORM_AUTH_SECRETS || "",
    mtls: process.env.TURBALANCE_KUSTOMIZE_MTLS || "",
    managedStorage: process.env.TURBALANCE_KUSTOMIZE_MANAGED_STORAGE || "",
    alertRouting: process.env.TURBALANCE_KUSTOMIZE_ALERT_ROUTING || "",
    otelBackendSecret: process.env.TURBALANCE_KUSTOMIZE_OTEL_BACKEND_SECRET || "",
    namespace: process.env.TURBALANCE_NAMESPACE || "turbalance-lakehouse",
    lakeRoot: process.env.TURBALANCE_LAKE_ROOT || "s3://replace-with-bucket/turbalance/lakehouse",
    jwtIssuer: process.env.TURBALANCE_API_JWT_ISSUER || "https://issuer.example",
    jwtAudience: process.env.TURBALANCE_API_JWT_AUDIENCE || "turbalance-api",
    certificateMode: process.env.TURBALANCE_DISCOVERY_CERTIFICATE_MODE || "local-ca",
    externalCaCommand: process.env.TURBALANCE_DISCOVERY_EXTERNAL_CA_COMMAND || "",
    trustedSpiffePrefix: process.env.TURBALANCE_TRUSTED_SPIFFE_PREFIX || "spiffe://turbalance.local/",
    queueBackend: process.env.TURBALANCE_QUEUE_GATEWAY_BACKEND || "kafka",
    queueBrokerUrl: process.env.TURBALANCE_QUEUE_GATEWAY_BROKER_URL || "kafka.kafka.svc.cluster.local:9092",
    queueTopic: process.env.TURBALANCE_QUEUE_GATEWAY_TOPIC || "turbalance.collector.telemetry",
    queueProducerCommand: process.env.TURBALANCE_QUEUE_GATEWAY_PRODUCER_COMMAND || "",
    queueUrl:
      process.env.TURBALANCE_COLLECTOR_QUEUE_URL ||
      "http://queue-gateway.turbalance-lakehouse.svc.cluster.local:8804/v1/queue/collector"
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--registry") {
      args.registry = required(arg, next);
      index += 1;
    } else if (arg === "--tag") {
      args.tag = required(arg, next);
      index += 1;
    } else if (arg === "--out") {
      args.out = required(arg, next);
      index += 1;
    } else if (arg === "--base") {
      args.base = required(arg, next);
      index += 1;
    } else if (arg === "--platform-auth-secrets") {
      args.platformAuthSecrets = required(arg, next);
      index += 1;
    } else if (arg === "--mtls") {
      args.mtls = required(arg, next);
      index += 1;
    } else if (arg === "--managed-storage") {
      args.managedStorage = required(arg, next);
      index += 1;
    } else if (arg === "--alert-routing") {
      args.alertRouting = required(arg, next);
      index += 1;
    } else if (arg === "--otel-backend-secret") {
      args.otelBackendSecret = required(arg, next);
      index += 1;
    } else if (arg === "--namespace") {
      args.namespace = required(arg, next);
      index += 1;
    } else if (arg === "--lake-root") {
      args.lakeRoot = required(arg, next);
      index += 1;
    } else if (arg === "--jwt-issuer") {
      args.jwtIssuer = required(arg, next);
      index += 1;
    } else if (arg === "--jwt-audience") {
      args.jwtAudience = required(arg, next);
      index += 1;
    } else if (arg === "--certificate-mode") {
      args.certificateMode = required(arg, next);
      index += 1;
    } else if (arg === "--external-ca-command") {
      args.externalCaCommand = required(arg, next);
      index += 1;
    } else if (arg === "--trusted-spiffe-prefix") {
      args.trustedSpiffePrefix = required(arg, next);
      index += 1;
    } else if (arg === "--queue-url") {
      args.queueUrl = required(arg, next);
      index += 1;
    } else if (arg === "--queue-topic") {
      args.queueTopic = required(arg, next);
      index += 1;
    } else if (arg === "--queue-backend") {
      args.queueBackend = required(arg, next);
      index += 1;
    } else if (arg === "--queue-broker-url") {
      args.queueBrokerUrl = required(arg, next);
      index += 1;
    } else if (arg === "--queue-producer-command") {
      args.queueProducerCommand = required(arg, next);
      index += 1;
    } else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  return args;
}

function required(flag, value) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function renderKustomization(args) {
  const imageYaml = images
    .map(
      (image) =>
        `  - name: turbalance/${image}\n    newName: ${args.registry}/${image}\n    newTag: ${args.tag}`
    )
    .join("\n");
  return [
    "apiVersion: kustomize.config.k8s.io/v1beta1",
    "kind: Kustomization",
    `namespace: ${args.namespace}`,
    "resources:",
    `  - ${args.base}`,
    `  - ${args.platformAuthSecrets}`,
    `  - ${args.managedStorage}`,
    `  - ${args.otelBackendSecret}`,
    `  - ${args.alertRouting}`,
    `  - ${args.mtls}`,
    "patches:",
    "  - path: production-config-patch.yaml",
    "  - path: delete-placeholder-secrets.yaml",
    "  - path: otel-backend-config-patch.yaml",
    "  - target:",
    "      kind: Deployment",
    "      name: otel-collector",
    "    patch: |-",
    "      - op: add",
    "        path: /spec/template/spec/containers/0/envFrom",
    "        value:",
    "          - secretRef:",
    "              name: turbalance-otel-backend",
    "images:",
    imageYaml,
    ""
  ].join("\n");
}

function renderPatch(args) {
  return [
    "apiVersion: v1",
    "kind: ConfigMap",
    "metadata:",
    "  name: turbalance-platform-config",
    `  namespace: ${args.namespace}`,
    "data:",
    `  TURBALANCE_LAKE_ROOT: ${yamlScalar(args.lakeRoot)}`,
    '  TURBALANCE_API_REQUIRE_AUTH: "true"',
    `  TURBALANCE_API_JWT_ISSUER: ${yamlScalar(args.jwtIssuer)}`,
    `  TURBALANCE_API_JWT_AUDIENCE: ${yamlScalar(args.jwtAudience)}`,
    `  TURBALANCE_DISCOVERY_CERTIFICATE_MODE: ${yamlScalar(args.certificateMode)}`,
    `  TURBALANCE_DISCOVERY_EXTERNAL_CA_COMMAND: ${yamlScalar(args.externalCaCommand)}`,
    '  TURBALANCE_COLLECTOR_REQUIRE_MTLS: "true"',
    `  TURBALANCE_TRUSTED_SPIFFE_PREFIX: ${yamlScalar(args.trustedSpiffePrefix)}`,
    "  TURBALANCE_COLLECTOR_QUEUE_BACKEND: http",
    `  TURBALANCE_COLLECTOR_QUEUE_URL: ${yamlScalar(args.queueUrl)}`,
    `  TURBALANCE_QUEUE_GATEWAY_BACKEND: ${yamlScalar(args.queueBackend)}`,
    `  TURBALANCE_QUEUE_GATEWAY_BROKER_URL: ${yamlScalar(args.queueBrokerUrl)}`,
    `  TURBALANCE_QUEUE_GATEWAY_TOPIC: ${yamlScalar(args.queueTopic)}`,
    `  TURBALANCE_QUEUE_GATEWAY_PRODUCER_COMMAND: ${yamlScalar(args.queueProducerCommand)}`,
    ""
  ].join("\n");
}

function printHelp() {
  console.log(`Usage: scripts/render-lakehouse-kustomize-overlay.js --out <dir> [options]

Options:
  --registry <registry>              Image registry/prefix, default TURBALANCE_IMAGE_REGISTRY
  --tag <tag>                        Image tag, default TURBALANCE_IMAGE_TAG
  --base <path>                      Base kustomization path, default relative to repo base
  --platform-auth-secrets <path>     Platform auth ExternalSecret manifest
  --mtls <path>                      mTLS manifest path, default relative to repo manifest
  --managed-storage <path>           Managed storage ExternalSecret path
  --alert-routing <path>             Alert routing ExternalSecret path
  --otel-backend-secret <path>       OTel backend ExternalSecret path
  --namespace <name>                 Kubernetes namespace
  --lake-root <s3://bucket/prefix>   Production lake root
  --jwt-issuer <url>                 JWT issuer expected by api-server
  --jwt-audience <audience>          JWT audience expected by api-server
  --certificate-mode <mode>          Discovery cert mode: local-ca, spire, external-ca
  --external-ca-command <cmd>        External signer command for external-ca mode
  --trusted-spiffe-prefix <prefix>   Trusted SPIFFE URI prefix for collector mTLS
  --queue-url <url>                  Queue gateway URL for collector overflow
  --queue-backend <backend>          Queue backend: kafka, redpanda, nats, or file
  --queue-broker-url <url>           Broker bootstrap URL or NATS server
  --queue-topic <topic>              Broker topic/subject used by queue-gateway
  --queue-producer-command <cmd>     Optional producer command override`);
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.out) {
    throw new Error("--out is required");
  }
  const outDir = path.resolve(process.cwd(), args.out);
  const repoRoot = path.join(__dirname, "..");
  args.base = args.base || relativeResource(outDir, path.join(repoRoot, "ops/kubernetes/lakehouse/base"));
  args.platformAuthSecrets =
    args.platformAuthSecrets ||
    relativeResource(outDir, path.join(repoRoot, "ops/kubernetes/lakehouse-platform-auth-secrets.yaml"));
  args.mtls = args.mtls || relativeResource(outDir, path.join(repoRoot, "ops/kubernetes/lakehouse-mtls.yaml"));
  args.managedStorage =
    args.managedStorage || relativeResource(outDir, path.join(repoRoot, "ops/kubernetes/lakehouse-managed-storage.yaml"));
  args.alertRouting =
    args.alertRouting || relativeResource(outDir, path.join(repoRoot, "ops/kubernetes/lakehouse-alert-routing.yaml"));
  args.otelBackendSecret =
    args.otelBackendSecret ||
    relativeResource(outDir, path.join(repoRoot, "ops/kubernetes/lakehouse-otel-backend-secret.yaml"));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "kustomization.yaml"), renderKustomization(args), "utf8");
  fs.writeFileSync(path.join(outDir, "production-config-patch.yaml"), renderPatch(args), "utf8");
  fs.writeFileSync(path.join(outDir, "delete-placeholder-secrets.yaml"), renderDeletePlaceholderSecretsPatch(args), "utf8");
  fs.writeFileSync(path.join(outDir, "otel-backend-config-patch.yaml"), renderOtelBackendConfigPatch(), "utf8");
}

function relativeResource(fromDir, toPath) {
  const relativePath = path.relative(fromDir, toPath).split(path.sep).join("/");
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

function yamlScalar(value) {
  return JSON.stringify(String(value));
}

function renderDeletePlaceholderSecretsPatch(args) {
  const secrets = [
    "turbalance-api-auth",
    "turbalance-collector-auth",
    "turbalance-discovery-auth",
    "turbalance-agent-client-ca"
  ];
  return `${secrets
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

function renderOtelBackendConfigPatch() {
  return `apiVersion: v1
kind: ConfigMap
metadata:
  name: otel-collector-config
  namespace: turbalance-lakehouse
data:
  config.yaml: |-
    receivers:
      otlp:
        protocols:
          grpc:
            endpoint: 0.0.0.0:4317
          http:
            endpoint: 0.0.0.0:4318
      prometheus:
        config:
          scrape_configs:
            - job_name: turbalance-collector-gateway
              scrape_interval: 30s
              metrics_path: /metrics
              static_configs:
                - targets: ["collector-gateway.turbalance-lakehouse.svc.cluster.local:8801"]
            - job_name: turbalance-api-server
              scrape_interval: 30s
              metrics_path: /metrics
              static_configs:
                - targets: ["api-server.turbalance-lakehouse.svc.cluster.local:8080"]
            - job_name: turbalance-duckdb-query-service
              scrape_interval: 30s
              metrics_path: /metrics
              static_configs:
                - targets: ["duckdb-query-service.turbalance-lakehouse.svc.cluster.local:8802"]
            - job_name: turbalance-discovery-api
              scrape_interval: 30s
              metrics_path: /metrics
              static_configs:
                - targets: ["discovery-api.turbalance-lakehouse.svc.cluster.local:8803"]
            - job_name: turbalance-queue-gateway
              scrape_interval: 30s
              metrics_path: /metrics
              static_configs:
                - targets: ["queue-gateway.turbalance-lakehouse.svc.cluster.local:8804"]

    processors:
      memory_limiter:
        check_interval: 1s
        limit_mib: 512
      batch:
        timeout: 5s

    exporters:
      otlphttp/backend:
        endpoint: \${env:TURBALANCE_OTEL_BACKEND_OTLP_ENDPOINT}
        headers:
          Authorization: \${env:TURBALANCE_OTEL_BACKEND_AUTHORIZATION}
      prometheus:
        endpoint: 0.0.0.0:9464

    service:
      telemetry:
        metrics:
          address: 0.0.0.0:8888
      pipelines:
        traces:
          receivers: [otlp]
          processors: [memory_limiter, batch]
          exporters: [otlphttp/backend]
        metrics:
          receivers: [otlp, prometheus]
          processors: [memory_limiter, batch]
          exporters: [prometheus, otlphttp/backend]
`;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
