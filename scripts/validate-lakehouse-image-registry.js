#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const imageNames = [
  "collector-gateway",
  "duckdb-query-service",
  "api-server",
  "discovery-api",
  "queue-gateway",
  "raw-writer",
  "transform-runner",
  "ebpf-agent",
  "dagster",
  "sqlmesh"
];

function parseArgs(argv) {
  const args = {
    envFile: process.env.TURBALANCE_LAKEHOUSE_ENV_FILE || "ops/lakehouse-production.env.example",
    registry: process.env.TURBALANCE_IMAGE_REGISTRY || "",
    tag: process.env.TURBALANCE_IMAGE_TAG || "",
    out: "",
    dryRun: false,
    local: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--local") {
      args.local = true;
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
  console.log(`Usage: scripts/validate-lakehouse-image-registry.js [--env-file <file>] [--dry-run] [--local]

Checks that all lakehouse platform images exist either in the remote registry via docker manifest inspect or locally via docker image inspect.`);
}

function parseEnvFile(file) {
  if (!file) return {};
  const values = {};
  for (const line of fs.readFileSync(path.resolve(root, file), "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = unquote(match[2].trim());
  }
  return values;
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

function commandAvailable(command) {
  return spawnSync("sh", ["-lc", `command -v ${quote(command)}`], { encoding: "utf8" }).status === 0;
}

function quote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function isPlaceholder(value) {
  return /replace-with|your-org|registry\.example|example\.com|\.example(?:\/|:|$)/i.test(String(value));
}

function imageRef(registry, image, tag) {
  return `${registry}/${image}:${tag}`;
}

function inspectImage(ref, local) {
  const args = local ? ["image", "inspect", ref] : ["manifest", "inspect", ref];
  const result = spawnSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  return {
    image: ref,
    command: ["docker", ...args].join(" "),
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout.slice(0, 2000),
    stderr: result.stderr.slice(0, 2000)
  };
}

function dryRunPlan(registry, tag, local) {
  return imageNames.map((name) => {
    const ref = imageRef(registry, name, tag);
    return {
      image: ref,
      command: local ? `docker image inspect ${ref}` : `docker manifest inspect ${ref}`
    };
  });
}

function write(out, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(root, out)), { recursive: true });
    fs.writeFileSync(path.resolve(root, out), body);
  }
  process.stdout.write(body);
}

function main() {
  const args = parseArgs(process.argv);
  const config = { ...process.env, ...parseEnvFile(args.envFile) };
  const registry = args.registry || config.TURBALANCE_IMAGE_REGISTRY || "";
  const tag = args.tag || config.TURBALANCE_IMAGE_TAG || "";
  const staticChecks = [
    { name: "registry.set", passed: Boolean(registry), detail: "image registry is set" },
    { name: "registry.not_placeholder", passed: registry && !isPlaceholder(registry), detail: "image registry is not a placeholder" },
    { name: "tag.set", passed: Boolean(tag), detail: "image tag is set" },
    { name: "tag.immutable", passed: Boolean(tag && tag !== "latest"), detail: "image tag is immutable" }
  ];
  if (args.dryRun) {
    write(args.out, {
      status: "dry-run",
      registry,
      tag,
      mode: args.local ? "local" : "remote",
      checks: staticChecks,
      images: dryRunPlan(registry || "REGISTRY", tag || "TAG", args.local)
    });
    return;
  }
  if (!commandAvailable("docker")) throw new Error("docker is required outside --dry-run");
  const staticFailed = staticChecks.filter((item) => !item.passed);
  const results = staticFailed.length ? [] : imageNames.map((name) => inspectImage(imageRef(registry, name, tag), args.local));
  const failed = [...staticFailed, ...results.filter((item) => !item.ok)];
  write(args.out, {
    status: failed.length ? "failed" : "ready",
    registry,
    tag,
    mode: args.local ? "local" : "remote",
    checks: staticChecks,
    images: results
  });
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
