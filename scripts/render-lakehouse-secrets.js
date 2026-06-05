#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const options = {
    namespace: "turbalance-lakehouse",
    out: "",
    example: false,
    collectorToken: process.env.TURBALANCE_COLLECTOR_TOKEN || "",
    collectorHmacSecret: process.env.TURBALANCE_COLLECTOR_HMAC_SECRET || "",
    discoveryEnrollmentToken: process.env.TURBALANCE_DISCOVERY_ENROLLMENT_TOKEN || "",
    apiTokens: process.env.TURBALANCE_API_TOKENS || "",
    apiJwksFile: process.env.TURBALANCE_API_JWKS_FILE || "",
    apiJwks: process.env.TURBALANCE_API_JWKS || "",
    metadataDatabaseUrl: process.env.TURBALANCE_DISCOVERY_DATABASE_URL || process.env.TURBALANCE_POSTGRES_URL || "",
    collectorQueueToken: process.env.TURBALANCE_COLLECTOR_QUEUE_TOKEN || "",
    agentClientCaFile: process.env.TURBALANCE_AGENT_CLIENT_CA_FILE || "",
    agentClientCaPem: process.env.TURBALANCE_AGENT_CLIENT_CA_PEM || "",
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    awsSessionToken: process.env.AWS_SESSION_TOKEN || "",
    awsRegion: process.env.AWS_REGION || "",
    awsEndpointUrl: process.env.AWS_ENDPOINT_URL || process.env.TURBALANCE_S3_ENDPOINT || "",
    turbalanceS3Scheme: process.env.TURBALANCE_S3_SCHEME || "",
    turbalanceS3Anonymous: process.env.TURBALANCE_S3_ANONYMOUS || ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--example") {
      options.example = true;
      continue;
    }
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (!(key in options)) throw new Error(`Unknown option ${arg}`);
    options[key] = argv[index + 1];
    index += 1;
  }
  if (options.agentClientCaFile) {
    options.agentClientCaPem = fs.readFileSync(path.resolve(options.agentClientCaFile), "utf8");
  }
  if (options.apiJwksFile) {
    options.apiJwks = fs.readFileSync(path.resolve(options.apiJwksFile), "utf8");
  }
  if (options.example) {
    options.collectorToken ||= "replace-with-collector-token";
    options.collectorHmacSecret ||= "replace-with-hmac-secret";
    options.discoveryEnrollmentToken ||= "replace-with-enrollment-token";
    options.apiTokens ||= "tenant-a:replace-with-viewer-token:viewer:tenant-a-viewer,tenant-a:replace-with-operator-token:operator:tenant-a-operator,*:replace-with-admin-token:admin:platform-admin";
    options.apiJwks ||= '{"keys":[]}';
    options.metadataDatabaseUrl ||= "postgresql://user:password@postgres.example:5432/turbalance";
    options.collectorQueueToken ||= "replace-with-queue-gateway-token";
    options.awsAccessKeyId ||= "replace-with-access-key";
    options.awsSecretAccessKey ||= "replace-with-secret-key";
    options.awsRegion ||= "us-west-2";
    options.awsEndpointUrl ||= "https://s3.example.internal";
    options.agentClientCaPem ||= [
      "-----BEGIN CERTIFICATE-----",
      "replace-with-agent-client-ca-pem",
      "-----END CERTIFICATE-----"
    ].join("\n");
  }
  return options;
}

function render(options) {
  const docs = [
    secret("turbalance-collector-auth", options.namespace, {
      "bearer-token": required(options.collectorToken, "collector token"),
      "hmac-secret": required(options.collectorHmacSecret, "collector HMAC secret")
    }),
    secret("turbalance-discovery-auth", options.namespace, {
      "enrollment-token": required(options.discoveryEnrollmentToken, "discovery enrollment token")
    }),
    secret("turbalance-api-auth", options.namespace, {
      "api-tokens": required(options.apiTokens, "API token map"),
      jwks: options.apiJwks || '{"keys":[]}'
    })
  ];
  if (options.metadataDatabaseUrl) {
    docs.push(secret("turbalance-metadata-db", options.namespace, { "database-url": options.metadataDatabaseUrl }));
  }
  if (options.collectorQueueToken) {
    docs.push(secret("turbalance-collector-queue-auth", options.namespace, { "bearer-token": options.collectorQueueToken }));
  }
  if (options.agentClientCaPem) {
    docs.push(secret("turbalance-agent-client-ca", options.namespace, { "ca.crt": options.agentClientCaPem }));
  }
  const objectStoreValues = compactValues({
    AWS_ACCESS_KEY_ID: options.awsAccessKeyId,
    AWS_SECRET_ACCESS_KEY: options.awsSecretAccessKey,
    AWS_SESSION_TOKEN: options.awsSessionToken,
    AWS_REGION: options.awsRegion,
    AWS_ENDPOINT_URL: options.awsEndpointUrl,
    TURBALANCE_S3_ENDPOINT: options.awsEndpointUrl,
    TURBALANCE_S3_SCHEME: options.turbalanceS3Scheme,
    TURBALANCE_S3_ANONYMOUS: options.turbalanceS3Anonymous
  });
  if (Object.keys(objectStoreValues).length) {
    docs.push(secret("turbalance-object-store", options.namespace, objectStoreValues));
  }
  return docs.join("---\n");
}

function secret(name, namespace, values) {
  const lines = [
    "apiVersion: v1",
    "kind: Secret",
    "metadata:",
    `  name: ${name}`,
    `  namespace: ${namespace}`,
    "type: Opaque",
    "stringData:"
  ];
  for (const [key, value] of Object.entries(values)) {
    lines.push(...stringDataLines(key, value));
  }
  return `${lines.join("\n")}\n`;
}

function stringDataLines(key, value) {
  if (String(value).includes("\n")) {
    return [`  ${key}: |`, ...String(value).split("\n").map((line) => `    ${line}`)];
  }
  return [`  ${key}: ${yamlScalar(value)}`];
}

function yamlScalar(value) {
  return JSON.stringify(String(value));
}

function required(value, label) {
  if (!value) throw new Error(`Missing ${label}; set the corresponding env var or pass --example`);
  return value;
}

function compactValues(values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const yaml = render(options);
  if (options.out) {
    fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
    fs.writeFileSync(options.out, yaml);
  } else {
    process.stdout.write(yaml);
  }
}

main();
