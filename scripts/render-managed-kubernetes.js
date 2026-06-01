#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || process.env.TURBALANCE_PILOT_CONFIG || path.join(__dirname, "..", "ops", "pilot-provider.config.example.json");
const outPath = args.out || "";
const config = JSON.parse(fs.readFileSync(path.resolve(configPath), "utf8"));
const rendered = render(config);

if (outPath) {
  const fullPath = path.resolve(outPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, rendered);
} else {
  process.stdout.write(rendered);
}

function render(config) {
  const namespace = config.namespace || "turbalance";
  const releaseName = config.releaseName || "turbalance";
  const configMapName = config.configMapName || `${releaseName}-ingestion-config`;
  const secretName = config.secretName || `${releaseName}-ingestion-secrets`;
  const serviceAccountName = config.serviceAccountName || `${releaseName}-ingestion`;
  const image = config.image || "registry.example.com/turbalance-ingestion:latest";
  const secretStoreName = config.secretStoreName || "provider-managed-secret-store";
  const objectBucket = required(config.objectBucket, "objectBucket");
  const objectPrefix = config.objectPrefix || "ingestion";
  const ingestTenant = config.ingestTenant || "tenant-a";

  return [
    namespaceYaml(namespace),
    serviceAccountYaml({ namespace, serviceAccountName }),
    configMapYaml({ namespace, configMapName, objectBucket, objectPrefix }),
    externalSecretYaml({
      namespace,
      secretName,
      secretStoreName,
      postgresSecretName: required(config.postgresSecretName, "postgresSecretName"),
      tenantTokensSecretName: required(config.tenantTokensSecretName, "tenantTokensSecretName"),
      uploadSecretName: required(config.uploadSecretName, "uploadSecretName"),
      jwtSecretName: config.jwtSecretName || "",
      exporterTokenSecretName: required(config.exporterTokenSecretName, "exporterTokenSecretName")
    }),
    deploymentYaml({ namespace, releaseName, image, serviceAccountName, configMapName, secretName }),
    serviceYaml({ namespace, releaseName }),
    providerExportCronJobYaml({ namespace, releaseName, image, serviceAccountName, secretName, ingestTenant })
  ].join("---\n");
}

function namespaceYaml(namespace) {
  return [
    "apiVersion: v1",
    "kind: Namespace",
    "metadata:",
    `  name: ${namespace}`,
    ""
  ].join("\n");
}

function serviceAccountYaml({ namespace, serviceAccountName }) {
  return [
    "apiVersion: v1",
    "kind: ServiceAccount",
    "metadata:",
    `  name: ${serviceAccountName}`,
    `  namespace: ${namespace}`,
    "  labels:",
    "    app.kubernetes.io/name: turbalance-ingestion",
    ""
  ].join("\n");
}

function configMapYaml({ namespace, configMapName, objectBucket, objectPrefix }) {
  return [
    "apiVersion: v1",
    "kind: ConfigMap",
    "metadata:",
    `  name: ${configMapName}`,
    `  namespace: ${namespace}`,
    "  labels:",
    "    app.kubernetes.io/name: turbalance-ingestion",
    "data:",
    "  TURBALANCE_STORAGE_MODE: managed-postgres-s3",
    `  TURBALANCE_OBJECT_BUCKET: ${objectBucket}`,
    `  TURBALANCE_OBJECT_PREFIX: ${objectPrefix}`,
    "  TURBALANCE_RETENTION_DAYS: \"30\"",
    "  TURBALANCE_MAX_UPLOADS_PER_TENANT: \"500\"",
    "  TURBALANCE_MAX_UPLOAD_BYTES: \"26214400\"",
    "  TURBALANCE_JWT_AUDIENCE: turbalance-ingestion",
    "  TURBALANCE_JWT_TENANT_CLAIM: customer_tenant",
    "  TURBALANCE_JWT_ROLE_CLAIM: groups",
    "  TURBALANCE_JWT_ROLE_MAP: security-reader:viewer,platform-operator:operator",
    "  TURBALANCE_CORS_ORIGIN: \"*\"",
    ""
  ].join("\n");
}

function externalSecretYaml({
  namespace,
  secretName,
  secretStoreName,
  postgresSecretName,
  tenantTokensSecretName,
  uploadSecretName,
  jwtSecretName,
  exporterTokenSecretName
}) {
  const mappings = [
    ["postgres-url", postgresSecretName],
    ["tenant-tokens", tenantTokensSecretName],
    ["upload-secret", uploadSecretName],
    ["exporter-token", exporterTokenSecretName],
    ...(jwtSecretName ? [["jwt-secret", jwtSecretName]] : [])
  ];
  return [
    "apiVersion: external-secrets.io/v1beta1",
    "kind: ExternalSecret",
    "metadata:",
    `  name: ${secretName}`,
    `  namespace: ${namespace}`,
    "spec:",
    "  refreshInterval: 1h",
    "  secretStoreRef:",
    `    name: ${secretStoreName}`,
    "    kind: ClusterSecretStore",
    "  target:",
    `    name: ${secretName}`,
    "    creationPolicy: Owner",
    "  data:",
    ...mappings.flatMap(([secretKey, remoteKey]) => [
      `    - secretKey: ${secretKey}`,
      "      remoteRef:",
      `        key: ${remoteKey}`
    ]),
    ""
  ].join("\n");
}

function deploymentYaml({ namespace, releaseName, image, serviceAccountName, configMapName, secretName }) {
  return [
    "apiVersion: apps/v1",
    "kind: Deployment",
    "metadata:",
    `  name: ${releaseName}-ingestion`,
    `  namespace: ${namespace}`,
    "  labels:",
    "    app.kubernetes.io/name: turbalance-ingestion",
    "    app.kubernetes.io/component: api",
    "spec:",
    "  replicas: 2",
    "  selector:",
    "    matchLabels:",
    "      app.kubernetes.io/name: turbalance-ingestion",
    "      app.kubernetes.io/component: api",
    "  template:",
    "    metadata:",
    "      labels:",
    "        app.kubernetes.io/name: turbalance-ingestion",
    "        app.kubernetes.io/component: api",
    "    spec:",
    `      serviceAccountName: ${serviceAccountName}`,
    "      containers:",
    "        - name: ingestion",
    `          image: ${image}`,
    "          imagePullPolicy: IfNotPresent",
    "          command: [\"node\", \"server/ingestion-server.js\"]",
    "          ports:",
    "            - name: http",
    "              containerPort: 8787",
    "          env:",
    "            - name: TURBALANCE_INGEST_HOST",
    "              value: 0.0.0.0",
    "            - name: TURBALANCE_POSTGRES_URL_FILE",
    "              value: /var/run/turbalance-secrets/postgres-url",
    "            - name: TURBALANCE_TENANT_TOKENS_FILE",
    "              value: /var/run/turbalance-secrets/tenant-tokens",
    "            - name: TURBALANCE_UPLOAD_SECRET_FILE",
    "              value: /var/run/turbalance-secrets/upload-secret",
    "            - name: TURBALANCE_JWT_SECRET_FILE",
    "              value: /var/run/turbalance-secrets/jwt-secret",
    "          envFrom:",
    "            - configMapRef:",
    `                name: ${configMapName}`,
    "          volumeMounts:",
    "            - name: secrets",
    "              mountPath: /var/run/turbalance-secrets",
    "              readOnly: true",
    "          readinessProbe:",
    "            httpGet:",
    "              path: /health",
    "              port: http",
    "            periodSeconds: 10",
    "          livenessProbe:",
    "            httpGet:",
    "              path: /health",
    "              port: http",
    "            periodSeconds: 30",
    "      volumes:",
    "        - name: secrets",
    "          secret:",
    `            secretName: ${secretName}`,
    ""
  ].join("\n");
}

function serviceYaml({ namespace, releaseName }) {
  return [
    "apiVersion: v1",
    "kind: Service",
    "metadata:",
    `  name: ${releaseName}-ingestion`,
    `  namespace: ${namespace}`,
    "  labels:",
    "    app.kubernetes.io/name: turbalance-ingestion",
    "spec:",
    "  selector:",
    "    app.kubernetes.io/name: turbalance-ingestion",
    "    app.kubernetes.io/component: api",
    "  ports:",
    "    - name: http",
    "      port: 8787",
    "      targetPort: http",
    ""
  ].join("\n");
}

function providerExportCronJobYaml({ namespace, releaseName, image, serviceAccountName, secretName, ingestTenant }) {
  return [
    "apiVersion: batch/v1",
    "kind: CronJob",
    "metadata:",
    `  name: ${releaseName}-provider-export`,
    `  namespace: ${namespace}`,
    "spec:",
    "  schedule: \"*/30 * * * *\"",
    "  concurrencyPolicy: Forbid",
    "  jobTemplate:",
    "    spec:",
    "      backoffLimit: 2",
    "      template:",
    "        spec:",
    `          serviceAccountName: ${serviceAccountName}`,
    "          restartPolicy: Never",
    "          containers:",
    "            - name: exporter",
    `              image: ${image}`,
    "              command: [\"node\", \"scripts/run-provider-pilot-export-job.js\"]",
    "              env:",
    "                - name: TURBALANCE_EXPORT_INPUT_DIR",
    "                  value: /var/run/turbalance-provider-exports",
    "                - name: TURBALANCE_INGEST_URL",
    `                  value: http://${releaseName}-ingestion:8787/v1/ingestion`,
    "                - name: TURBALANCE_INGEST_TENANT",
    `                  value: ${ingestTenant}`,
    "                - name: TURBALANCE_INGEST_TOKEN",
    "                  valueFrom:",
    "                    secretKeyRef:",
    `                      name: ${secretName}`,
    "                      key: exporter-token",
    "              volumeMounts:",
    "                - name: provider-exports",
    "                  mountPath: /var/run/turbalance-provider-exports",
    "                  readOnly: true",
    "          volumes:",
    "            - name: provider-exports",
    "              emptyDir: {}",
    ""
  ].join("\n");
}

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
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
