#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  parseArgs,
  readProductConfig,
  renderEnv
} = require("../lib/product-config");

const root = path.join(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const config = readProductConfig(args.config || "ops/turbalance-product.example.json");
const outDir = path.resolve(root, args["out-dir"] || "build/product-secrets");
const rotate = Boolean(args.rotate);
const showSecrets = Boolean(args["show-secrets"]);
const tenantId = args["tenant-id"] || config.fleet.tenantId || "default";

main();

function main() {
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(outDir, 0o700);

  const secrets = {
    collectorToken: secretFile("collector-token", () => token("collector")),
    collectorHmacSecret: secretFile("collector-hmac-secret", () => token("collector-hmac", 48)),
    apiViewerToken: secretFile("api-viewer-token", () => token("api-viewer")),
    apiAdminToken: secretFile("api-admin-token", () => token("api-admin"))
  };
  const apiTokensPath = path.join(outDir, "api-tokens");
  const apiTokens = [
    `${tenantId}:${secrets.apiViewerToken}:viewer:${tenantId}-viewer`,
    `${tenantId}:${secrets.apiAdminToken}:admin:${tenantId}-admin`
  ].join("\n") + "\n";
  writeSecretFile(apiTokensPath, apiTokens);

  const controllerEnv = {
    TURBALANCE_API_REQUIRE_AUTH: "true",
    TURBALANCE_API_TOKENS_FILE: apiTokensPath,
    TURBALANCE_COLLECTOR_TOKEN: secrets.collectorToken,
    TURBALANCE_COLLECTOR_HMAC_SECRET: secrets.collectorHmacSecret
  };
  const agentEnv = {
    TURBALANCE_COLLECTOR_TOKEN: secrets.collectorToken,
    TURBALANCE_COLLECTOR_HMAC_SECRET: secrets.collectorHmacSecret
  };
  writeSecretFile(path.join(outDir, "controller-secure.env"), renderEnv(controllerEnv));
  writeSecretFile(path.join(outDir, "agent-auth.env"), renderEnv(agentEnv));
  writeText(path.join(outDir, "README.md"), readme(apiTokensPath));

  const report = {
    status: "written",
    generatedAt: new Date().toISOString(),
    outDir,
    tenantId,
    rotate,
    files: {
      collectorToken: path.join(outDir, "collector-token"),
      collectorHmacSecret: path.join(outDir, "collector-hmac-secret"),
      apiTokens: apiTokensPath,
      controllerEnv: path.join(outDir, "controller-secure.env"),
      agentEnv: path.join(outDir, "agent-auth.env")
    },
    controllerEnv: showSecrets ? controllerEnv : redact(controllerEnv),
    agentEnv: showSecrets ? agentEnv : redact(agentEnv)
  };
  writeText(path.join(outDir, "product-security-report.json"), `${JSON.stringify({ ...report, controllerEnv: redact(controllerEnv), agentEnv: redact(agentEnv) }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function secretFile(name, factory) {
  const filePath = path.join(outDir, name);
  if (!rotate && fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf8").trim();
  }
  const value = factory();
  writeSecretFile(filePath, value + "\n");
  return value;
}

function writeSecretFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, value, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function token(label, bytes = 32) {
  return `${label}_${crypto.randomBytes(bytes).toString("base64url")}`;
}

function redact(env) {
  return Object.fromEntries(Object.entries(env).map(([key, value]) => [
    key,
    /TOKEN|SECRET|PASSWORD|KEY/i.test(key) && value ? "[REDACTED]" : value
  ]));
}

function readme(apiTokensPath) {
  return [
    "# Turbalance Product Secrets",
    "",
    "This directory is generated material. Keep it off source control and support bundles unless explicitly approved.",
    "",
    "Controller hardening env:",
    "",
    "```sh",
    "set -a",
    ". build/product-secrets/controller-secure.env",
    "set +a",
    "```",
    "",
    "Agent rollout auth env:",
    "",
    "```sh",
    "set -a",
    ". build/product-secrets/agent-auth.env",
    "set +a",
    "build/product-runtime/rollout-command.sh",
    "```",
    "",
    "API token file:",
    "",
    `- ${apiTokensPath}`,
    "",
    "Use `--rotate` only during a planned rollover because every agent must receive the new collector credentials.",
    ""
  ].join("\n");
}
