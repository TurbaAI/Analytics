#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

function parseArgs(argv) {
  const args = {
    envFile: process.env.TURBALANCE_LAKEHOUSE_ENV_FILE || "ops/lakehouse-production.env.example",
    registry: process.env.TURBALANCE_IMAGE_REGISTRY || "",
    username: process.env.TURBALANCE_REGISTRY_USERNAME || process.env.DOCKER_USERNAME || process.env.GITHUB_ACTOR || "",
    tokenEnv: process.env.TURBALANCE_REGISTRY_TOKEN ? "TURBALANCE_REGISTRY_TOKEN" : process.env.GHCR_TOKEN ? "GHCR_TOKEN" : process.env.CR_PAT ? "CR_PAT" : process.env.GITHUB_TOKEN ? "GITHUB_TOKEN" : process.env.DOCKER_TOKEN ? "DOCKER_TOKEN" : "",
    out: "",
    dryRun: false,
    validateOnly: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--validate-only") args.validateOnly = true;
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

function printHelp() {
  console.log(`Usage: scripts/configure-lakehouse-registry-auth.js [--env-file <file>] [--registry <host/org>] [--username <user>] [--token-env <ENV_KEY>] [--dry-run] [--validate-only] [--out <json>]

Logs Docker into the lakehouse image registry with --password-stdin and writes a redacted validation report.`);
}

function need(flag, value) {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseEnvFile(file) {
  const fullPath = path.resolve(root, file);
  if (!fs.existsSync(fullPath)) return {};
  const values = {};
  for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    values[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return values;
}

function registryHost(registry) {
  return String(registry || "").split("/").filter(Boolean)[0] || "";
}

function dockerConfigSummary() {
  const configPath = path.join(os.homedir(), ".docker", "config.json");
  const summary = {
    configPath,
    exists: fs.existsSync(configPath),
    authRegistries: [],
    credHelpers: [],
    credsStore: ""
  };
  if (!summary.exists) return summary;
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  summary.authRegistries = Object.keys(config.auths || {});
  summary.credHelpers = Object.keys(config.credHelpers || {});
  summary.credsStore = config.credsStore || "";
  return summary;
}

function hasRegistryAuth(summary, host) {
  return summary.authRegistries.includes(host) || summary.authRegistries.includes(`https://${host}/v1/`) || summary.credHelpers.includes(host) || Boolean(summary.credsStore);
}

function runLogin(host, username, token) {
  const result = spawnSync("docker", ["login", host, "--username", username, "--password-stdin"], {
    cwd: root,
    input: token,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  return {
    command: `docker login ${host} --username ${username} --password-stdin`,
    ok: result.status === 0,
    status: result.status,
    stdout: redact(result.stdout),
    stderr: redact(result.stderr)
  };
}

function redact(value) {
  return String(value || "").replace(/(password|token|authorization)[^\n]*/gi, "$1=[REDACTED]");
}

function write(out, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(root, out)), { recursive: true });
    fs.writeFileSync(path.resolve(root, out), body, "utf8");
  }
  process.stdout.write(body);
}

function main() {
  const args = parseArgs(process.argv);
  const env = parseEnvFile(args.envFile);
  const registry = args.registry || env.TURBALANCE_IMAGE_REGISTRY || "";
  const host = registryHost(registry);
  if (!host) throw new Error("registry host is required; set TURBALANCE_IMAGE_REGISTRY or pass --registry");
  const username = args.username;
  const token = args.tokenEnv ? process.env[args.tokenEnv] || "" : "";
  const before = dockerConfigSummary();
  const loginReady = Boolean(username && token);
  let login = null;
  if (!args.dryRun && !args.validateOnly && loginReady) {
    login = runLogin(host, username, token);
  }
  const after = dockerConfigSummary();
  const authenticated = hasRegistryAuth(after, host);
  const requiredActions = [];
  if (!loginReady && !authenticated) requiredActions.push(`Set TURBALANCE_REGISTRY_USERNAME and TURBALANCE_REGISTRY_TOKEN, then run docker login for ${host}`);
  if (login && !login.ok) requiredActions.push(`Fix registry credentials for ${host}`);
  const report = {
    status: requiredActions.length ? "action-required" : "ready",
    dryRun: args.dryRun,
    validateOnly: args.validateOnly,
    envFile: args.envFile,
    registry,
    registryHost: host,
    usernamePresent: Boolean(username),
    tokenEnv: args.tokenEnv || "",
    tokenPresent: Boolean(token),
    authenticated,
    configBefore: before,
    configAfter: after,
    login,
    requiredActions,
    commands: [
      `printf '%s' "$${args.tokenEnv || "TURBALANCE_REGISTRY_TOKEN"}" | docker login ${host} --username "$${args.username ? "TURBALANCE_REGISTRY_USERNAME" : "TURBALANCE_REGISTRY_USERNAME"}" --password-stdin`
    ]
  };
  write(args.out, report);
  if (report.status !== "ready" && !args.dryRun) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
