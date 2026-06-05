#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

const baseBindings = [
  { externalSecret: "turbalance-api-auth", targetSecret: "turbalance-api-auth", keys: ["api-tokens", "jwks"] },
  { externalSecret: "turbalance-collector-auth", targetSecret: "turbalance-collector-auth", keys: ["bearer-token", "hmac-secret"] },
  { externalSecret: "turbalance-discovery-auth", targetSecret: "turbalance-discovery-auth", keys: ["enrollment-token"] },
  { externalSecret: "turbalance-agent-client-ca", targetSecret: "turbalance-agent-client-ca", keys: ["ca.crt"] },
  { externalSecret: "turbalance-metadata-db", targetSecret: "turbalance-metadata-db", keys: ["database-url"] },
  {
    externalSecret: "turbalance-object-store",
    targetSecret: "turbalance-object-store",
    keys: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "AWS_ENDPOINT_URL", "TURBALANCE_S3_SCHEME"]
  },
  { externalSecret: "turbalance-collector-queue-auth", targetSecret: "turbalance-collector-queue-auth", keys: ["bearer-token"] },
  {
    externalSecret: "turbalance-otel-backend",
    targetSecret: "turbalance-otel-backend",
    keys: ["TURBALANCE_OTEL_BACKEND_OTLP_ENDPOINT", "TURBALANCE_OTEL_BACKEND_AUTHORIZATION"]
  },
  {
    externalSecret: "turbalance-alert-routing",
    targetSecret: "turbalance-alert-routing",
    keys: ["TURBALANCE_ALERT_WEBHOOK_URL", "TURBALANCE_ALERT_SLACK_WEBHOOK_URL", "TURBALANCE_ALERT_PAGERDUTY_ROUTING_KEY"]
  }
];

const consulBinding = { externalSecret: "turbalance-consul-auth", targetSecret: "turbalance-consul-auth", keys: ["token"] };

function parseArgs(argv) {
  const args = {
    namespace: process.env.TURBALANCE_NAMESPACE || "turbalance-lakehouse",
    out: "",
    dryRun: false,
    includeConsul: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--include-consul") {
      args.includeConsul = true;
    } else if (arg === "--help") {
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
  console.log(`Usage: scripts/validate-lakehouse-externalsecrets.js [--namespace <ns>] [--dry-run] [--out <file>]

Checks that ExternalSecret resources are Ready and that their target Kubernetes Secrets contain the keys the lakehouse workloads mount.`);
}

function bindings(options) {
  return options.includeConsul ? [...baseBindings, consulBinding] : baseBindings;
}

function commandAvailable(command) {
  return spawnSync("sh", ["-lc", `command -v ${quote(command)}`], { encoding: "utf8" }).status === 0;
}

function quote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function runKubectl(args) {
  const result = spawnSync("kubectl", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  return {
    command: ["kubectl", ...args].join(" "),
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function parseJsonResult(result) {
  if (!result.ok) return { ok: false, error: result.stderr || result.stdout || "kubectl command failed" };
  try {
    return { ok: true, value: JSON.parse(result.stdout) };
  } catch (error) {
    return { ok: false, error: `failed to parse kubectl JSON: ${error.message}` };
  }
}

function readyCondition(resource) {
  const condition = (resource.status?.conditions || []).find((item) => item.type === "Ready");
  return {
    ready: condition?.status === "True",
    status: condition?.status || "",
    reason: condition?.reason || "",
    message: condition?.message || ""
  };
}

function inspectBinding(namespace, item) {
  const externalRaw = runKubectl(["-n", namespace, "get", "externalsecret", item.externalSecret, "-o", "json"]);
  const external = parseJsonResult(externalRaw);
  if (!external.ok) {
    return {
      externalSecret: item.externalSecret,
      targetSecret: item.targetSecret,
      ok: false,
      error: external.error,
      commands: [externalRaw.command]
    };
  }
  const targetSecret = external.value.spec?.target?.name || item.targetSecret;
  const condition = readyCondition(external.value);
  const secretRaw = runKubectl(["-n", namespace, "get", "secret", targetSecret, "-o", "json"]);
  const secret = parseJsonResult(secretRaw);
  const data = secret.ok ? secret.value.data || {} : {};
  const missingKeys = item.keys.filter((key) => !(key in data));
  return {
    externalSecret: item.externalSecret,
    targetSecret,
    ok: condition.ready && secret.ok && missingKeys.length === 0,
    ready: condition,
    expectedKeys: item.keys,
    missingKeys,
    commands: [externalRaw.command, secretRaw.command],
    secretFound: secret.ok,
    error: secret.ok ? "" : secret.error
  };
}

function dryRunPlan(namespace, options) {
  return {
    status: "dry-run",
    namespace,
    checks: bindings(options).map((item) => ({
      externalSecret: item.externalSecret,
      targetSecret: item.targetSecret,
      expectedKeys: item.keys,
      commands: [
        `kubectl -n ${namespace} get externalsecret ${item.externalSecret} -o json`,
        `kubectl -n ${namespace} get secret ${item.targetSecret} -o json`
      ]
    }))
  };
}

function write(out, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, body);
  }
  process.stdout.write(body);
}

function main() {
  const options = parseArgs(process.argv);
  if (options.dryRun) {
    write(options.out, dryRunPlan(options.namespace, options));
    return;
  }
  if (!commandAvailable("kubectl")) {
    throw new Error("kubectl is required outside --dry-run");
  }
  const checks = bindings(options).map((item) => inspectBinding(options.namespace, item));
  const failed = checks.filter((item) => !item.ok);
  write(options.out, {
    status: failed.length ? "failed" : "ready",
    namespace: options.namespace,
    checks
  });
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
