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
    imageLock: "",
    registry: process.env.TURBALANCE_IMAGE_REGISTRY || "",
    tag: process.env.TURBALANCE_IMAGE_TAG || "",
    out: "",
    dryRun: false,
    sign: false,
    verify: false,
    key: process.env.COSIGN_KEY || "",
    identity: process.env.COSIGN_CERTIFICATE_IDENTITY || "",
    oidcIssuer: process.env.COSIGN_CERTIFICATE_OIDC_ISSUER || "",
    allowTagRefs: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--sign") args.sign = true;
    else if (arg === "--verify") args.verify = true;
    else if (arg === "--allow-tag-refs") args.allowTagRefs = true;
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
  console.log(`Usage: scripts/sign-lakehouse-images.js [--env-file <file>] [--image-lock <json>] [--dry-run] [--sign] [--verify]

Plans or runs cosign signing and verification for all lakehouse images. Prefer --image-lock so verification targets immutable digest references.`);
}

function parseEnvFile(file) {
  if (!file) return {};
  const fullPath = path.resolve(root, file);
  if (!fs.existsSync(fullPath)) return {};
  const values = {};
  for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
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

function loadImageLock(file) {
  if (!file) return null;
  const fullPath = path.resolve(root, file);
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function commandAvailable(command) {
  return spawnSync("sh", ["-lc", `command -v ${quote(command)}`], { encoding: "utf8" }).status === 0;
}

function quote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function imageRefs(options, env) {
  const lock = loadImageLock(options.imageLock);
  if (lock && Array.isArray(lock.images)) {
    return lock.images.map((image) => ({
      name: image.name || image.image.split("/").pop().split(":")[0],
      image: image.resolvedImage || image.image,
      locked: Boolean(image.resolvedImage || image.digest || (image.platformDigests || []).length)
    }));
  }
  const registry = options.registry || env.TURBALANCE_IMAGE_REGISTRY || "";
  const tag = options.tag || env.TURBALANCE_IMAGE_TAG || "";
  return imageNames.map((name) => ({
    name,
    image: `${registry}/${name}:${tag}`,
    locked: false
  }));
}

function signArgs(options, image) {
  return ["sign", "--yes", ...(options.key ? ["--key", options.key] : []), image];
}

function verifyArgs(options, image) {
  return [
    "verify",
    ...(options.key ? ["--key", options.key] : []),
    ...(options.identity ? ["--certificate-identity", options.identity] : []),
    ...(options.oidcIssuer ? ["--certificate-oidc-issuer", options.oidcIssuer] : []),
    image
  ];
}

function plannedCommands(options, images) {
  return images.flatMap((image) => [
    `cosign ${signArgs(options, image.image).map(shellArg).join(" ")}`,
    `cosign ${verifyArgs(options, image.image).map(shellArg).join(" ")}`
  ]);
}

function shellArg(value) {
  return /[\s'"$]/.test(String(value)) ? quote(value) : String(value);
}

function runCosign(args) {
  const result = spawnSync("cosign", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  return {
    command: `cosign ${args.map(shellArg).join(" ")}`,
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function check(name, passed, detail, severity = "error") {
  return { name, passed: Boolean(passed), detail, severity };
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
  const options = parseArgs(process.argv);
  const env = { ...process.env, ...parseEnvFile(options.envFile) };
  const images = imageRefs(options, env);
  const checks = [
    check("images.present", images.length === imageNames.length, "all lakehouse images are present"),
    check("image_refs.locked", options.allowTagRefs || images.every((image) => image.locked || image.image.includes("@sha256:")), "image references are digest locked", "warning"),
    check("tool.cosign", commandAvailable("cosign") || options.dryRun || (!options.sign && !options.verify), "cosign is installed")
  ];
  if (options.dryRun || (!options.sign && !options.verify)) {
    write(options.out, {
      status: "dry-run",
      envFile: options.envFile,
      imageLock: options.imageLock,
      checks,
      images,
      commands: plannedCommands(options, images)
    });
    return;
  }
  if (!commandAvailable("cosign")) throw new Error("cosign is required outside --dry-run");
  const results = [];
  for (const image of images) {
    if (options.sign) results.push({ image: image.image, action: "sign", ...runCosign(signArgs(options, image.image)) });
    if (options.verify) results.push({ image: image.image, action: "verify", ...runCosign(verifyArgs(options, image.image)) });
  }
  for (const result of results) checks.push(check(`cosign.${result.action}.${result.image}`, result.ok, result.stderr || result.command));
  const failed = checks.filter((item) => !item.passed && item.severity === "error");
  write(options.out, {
    status: failed.length ? "failed" : "ok",
    envFile: options.envFile,
    imageLock: options.imageLock,
    checks,
    images,
    results
  });
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
