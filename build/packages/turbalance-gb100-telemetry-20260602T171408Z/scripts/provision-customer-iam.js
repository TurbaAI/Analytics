#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");

const args = parseArgs(process.argv.slice(2));
const baseUrl = args.url || process.env.TURBALANCE_INGEST_ADMIN_URL || "http://127.0.0.1:8787";
const adminToken = args["admin-token"] || process.env.TURBALANCE_ADMIN_TOKEN || "";
const tenantId = args.tenant || process.env.TURBALANCE_PROVISION_TENANT || "";
const displayName = args["display-name"] || process.env.TURBALANCE_PROVISION_DISPLAY_NAME || tenantId;
const role = args.role || process.env.TURBALANCE_PROVISION_ROLE || "ingest";
const subject = args.subject || process.env.TURBALANCE_PROVISION_SUBJECT || "provider-exporter";
const provider = (args.provider || process.env.TURBALANCE_SECRET_PROVIDER || "generic").toLowerCase();
const secretName = args["secret-name"] || process.env.TURBALANCE_EXPORTER_SECRET_NAME || `turbalance/${tenantId}/exporter-token`;
const namespace = args.namespace || process.env.TURBALANCE_K8S_NAMESPACE || "turbalance";
const secretStore = args["secret-store"] || process.env.TURBALANCE_EXTERNAL_SECRET_STORE || "turbalance-provider-secrets";
const keyVault = args["key-vault"] || process.env.TURBALANCE_AZURE_KEY_VAULT || "";
const applySecrets = Boolean(args["apply-secrets"] || process.env.TURBALANCE_APPLY_SECRET_BINDINGS);
const showToken = Boolean(args["show-token"] || process.env.TURBALANCE_SHOW_PROVISIONED_TOKEN);

if (!adminToken || !tenantId) {
  process.stderr.write("usage: provision-customer-iam.js --url http://127.0.0.1:8787 --admin-token TOKEN --tenant TENANT_ID [--provider aws|gcp|azure|generic] [--secret-name NAME] [--apply-secrets]\n");
  process.exit(1);
}

(async () => {
  const tenant = await requestJson("/v1/tenants", {
    tenantId,
    displayName
  });
  const token = await requestJson("/v1/tokens/rotate", {
    tenantId,
    role,
    subject
  });
  const binding = secretBinding({
    provider,
    secretName,
    secretValue: token.token,
    namespace,
    secretStore,
    keyVault
  });

  if (applySecrets) {
    applySecretBinding(binding, token.token);
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    tenant: tenant.tenant,
    token: {
      tenantId: token.tenantId,
      role: token.role,
      subject: token.subject,
      tokenFingerprint: token.tokenFingerprint,
      ...(showToken ? { token: token.token } : {})
    },
    secretBinding: {
      provider,
      secretName,
      applied: applySecrets,
      commands: binding.commands.map((command) => command.redacted),
      externalSecret: binding.externalSecret
    }
  }, null, 2)}\n`);
})().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

async function requestJson(pathname, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const url = new URL(pathname, baseUrl);

  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${pathname} failed with ${response.status}: ${text}`);
    }
    return JSON.parse(text);
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`${pathname} timed out after 15000 ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function secretBinding({ provider, secretName, secretValue, namespace, secretStore, keyVault }) {
  if (provider === "aws") {
    return {
      commands: [
        command("aws", ["secretsmanager", "create-secret", "--name", secretName, "--secret-string", secretValue]),
        command("aws", ["secretsmanager", "put-secret-value", "--secret-id", secretName, "--secret-string", secretValue])
      ],
      externalSecret: externalSecretYaml({ namespace, secretStore, secretName })
    };
  }

  if (provider === "gcp") {
    return {
      commands: [
        command("gcloud", ["secrets", "versions", "add", secretName, "--data-file=-"], { input: secretValue })
      ],
      externalSecret: externalSecretYaml({ namespace, secretStore, secretName })
    };
  }

  if (provider === "azure") {
    if (!keyVault) {
      throw new Error("--key-vault or TURBALANCE_AZURE_KEY_VAULT is required for azure secret bindings");
    }
    return {
      commands: [
        command("az", ["keyvault", "secret", "set", "--vault-name", keyVault, "--name", secretName, "--value", secretValue])
      ],
      externalSecret: externalSecretYaml({ namespace, secretStore, secretName })
    };
  }

  return {
    commands: [],
    externalSecret: externalSecretYaml({ namespace, secretStore, secretName })
  };
}

function command(bin, args, options = {}) {
  return {
    bin,
    args,
    input: options.input,
    redacted: [bin, ...args.map((arg, index) => (
      args[index - 1] === "--secret-string" || args[index - 1] === "--value" ? "<redacted>" : arg
    ))].join(" ")
  };
}

function applySecretBinding(binding, token) {
  binding.commands.forEach((entry, index) => {
    if (entry.bin === "aws" && index === 1) return;
    const result = spawnSync(entry.bin, entry.args, {
      input: entry.input || undefined,
      encoding: entry.input ? "utf8" : undefined,
      maxBuffer: 10 * 1024 * 1024
    });
    if (result.status !== 0 && entry.bin === "aws" && entry.args[1] === "create-secret") {
      const fallback = binding.commands[1];
      const fallbackResult = spawnSync(fallback.bin, fallback.args, { maxBuffer: 10 * 1024 * 1024 });
      if (fallbackResult.status !== 0) {
        throw new Error(`${fallback.redacted} failed`);
      }
      return;
    }
    if (result.status !== 0) {
      throw new Error(`${entry.redacted} failed`);
    }
  });

  if (!binding.commands.length && token) {
    return;
  }
}

function externalSecretYaml({ namespace, secretStore, secretName }) {
  return [
    "apiVersion: external-secrets.io/v1beta1",
    "kind: ExternalSecret",
    "metadata:",
    `  name: turbalance-${safeName(secretName)}-exporter-token`,
    `  namespace: ${namespace}`,
    "spec:",
    "  refreshInterval: 1h",
    "  secretStoreRef:",
    `    name: ${secretStore}`,
    "    kind: ClusterSecretStore",
    "  target:",
    "    name: turbalance-ingestion-secrets",
    "    creationPolicy: Merge",
    "  data:",
    "    - secretKey: exporter-token",
    "      remoteRef:",
    `        key: ${secretName}`,
    ""
  ].join("\n");
}

function safeName(value) {
  return String(value || "secret").toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "secret";
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
