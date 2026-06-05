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
    outDir: process.env.TURBALANCE_IMAGE_RELEASE_OUT_DIR || path.join("build", "lakehouse-image-release"),
    registry: "",
    tag: "",
    dryRun: false,
    build: false,
    push: false,
    sign: false,
    verify: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--build") args.build = true;
    else if (arg === "--push") {
      args.push = true;
      args.build = true;
    } else if (arg === "--sign") args.sign = true;
    else if (arg === "--verify") args.verify = true;
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
  console.log(`Usage: scripts/run-lakehouse-image-release.js [--env-file <file>] [--registry <registry>] [--tag <tag>] [--out-dir <dir>] [--dry-run] [--build] [--push] [--sign] [--verify]

Runs the image release lane: build plan/build, optional push, registry validation, digest lock, and cosign sign/verify planning or execution.`);
}

function parseEnvFile(file) {
  const fullPath = path.resolve(root, file);
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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 60 * 1024 * 1024,
    ...options
  });
  let json = null;
  try {
    json = result.stdout ? JSON.parse(result.stdout) : null;
  } catch {
    json = null;
  }
  return {
    command: [command, ...args].join(" "),
    ok: result.status === 0,
    status: result.status,
    stdout: json || result.stdout,
    stderr: result.stderr
  };
}

function stage(name, fn) {
  try {
    return { name, ok: true, ...fn() };
  } catch (error) {
    return { name, ok: false, error: error.message };
  }
}

function requireOk(result) {
  if (!result.ok) throw new Error(`${result.command} failed\nstdout:\n${JSON.stringify(result.stdout)}\nstderr:\n${result.stderr}`);
  return result;
}

function pushImages(config, env, dryRun) {
  const results = [];
  for (const image of imageNames) {
    const ref = `${config.TURBALANCE_IMAGE_REGISTRY}/${image}:${config.TURBALANCE_IMAGE_TAG}`;
    if (dryRun) {
      results.push({ image: ref, command: `docker push ${ref}`, ok: true, dryRun: true });
    } else {
      results.push(requireOk(run("docker", ["push", ref], { env })));
    }
  }
  return { status: dryRun ? "dry-run" : "pushed", results };
}

function markdown(report) {
  const lines = [
    "# turbalance Lakehouse Image Release",
    "",
    `- Status: ${report.ok ? "PASS" : "FAIL"}`,
    `- Env file: ${report.envFile}`,
    `- Registry: ${report.registry}`,
    `- Tag: ${report.tag}`,
    "",
    "## Stages",
    ""
  ];
  for (const item of report.stages) lines.push(`- ${item.name}: ${item.ok ? "PASS" : "FAIL"}${item.status ? ` (${item.status})` : ""}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function writeReport(outDir, report) {
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, "image-release.json");
  const markdownPath = path.join(outDir, "image-release.md");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(markdownPath, markdown(report), "utf8");
  process.stdout.write(`${JSON.stringify({ ...report, artifacts: { report: reportPath, markdown: markdownPath } }, null, 2)}\n`);
}

function main() {
  const args = parseArgs(process.argv);
  const outDir = path.resolve(root, args.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const config = { ...process.env, ...parseEnvFile(args.envFile) };
  if (args.registry) config.TURBALANCE_IMAGE_REGISTRY = args.registry;
  if (args.tag) config.TURBALANCE_IMAGE_TAG = args.tag;
  const env = { ...process.env, ...config };
  const dryRun = args.dryRun || (!args.build && !args.push && !args.sign && !args.verify);
  const stages = [];

  stages.push(stage("build", () => ({
    status: args.build && !dryRun ? "built" : "dry-run",
    report: requireOk(run(process.execPath, [
      "scripts/build-lakehouse-platform-images.js",
      ...(args.build && !dryRun ? [] : ["--dry-run"])
    ], { env })).stdout
  })));

  stages.push(stage("push", () => pushImages(config, env, dryRun || !args.push)));

  stages.push(stage("image-registry", () => ({
    status: args.push && !dryRun ? "validated" : "dry-run",
    report: requireOk(run(process.execPath, [
      "scripts/validate-lakehouse-image-registry.js",
      "--env-file",
      args.envFile,
      ...(args.registry ? ["--registry", args.registry] : []),
      ...(args.tag ? ["--tag", args.tag] : []),
      "--out",
      path.join(outDir, "image-registry.json"),
      ...(args.push && !dryRun ? [] : ["--dry-run"])
    ], { env })).stdout
  })));

  stages.push(stage("image-lock", () => ({
    status: args.push && !dryRun ? "locked" : "dry-run",
    report: requireOk(run(process.execPath, [
      "scripts/generate-lakehouse-image-lock.js",
      "--env-file",
      args.envFile,
      ...(args.registry ? ["--registry", args.registry] : []),
      ...(args.tag ? ["--tag", args.tag] : []),
      "--out",
      path.join(outDir, "image-lock.json"),
      ...(args.push && !dryRun ? [] : ["--dry-run"])
    ], { env })).stdout
  })));

  stages.push(stage("image-signatures", () => ({
    status: args.sign || args.verify ? (dryRun ? "dry-run" : "validated") : "dry-run",
    report: requireOk(run(process.execPath, [
      "scripts/sign-lakehouse-images.js",
      "--env-file",
      args.envFile,
      "--image-lock",
      path.join(outDir, "image-lock.json"),
      "--out",
      path.join(outDir, "image-signatures.json"),
      ...(args.sign && !dryRun ? ["--sign"] : []),
      ...(args.verify && !dryRun ? ["--verify"] : []),
      ...(!args.sign && !args.verify || dryRun ? ["--dry-run"] : [])
    ], { env })).stdout
  })));

  const report = {
    ok: stages.every((item) => item.ok),
    envFile: args.envFile,
    outDir,
    registry: config.TURBALANCE_IMAGE_REGISTRY,
    tag: config.TURBALANCE_IMAGE_TAG,
    dryRun,
    actions: {
      build: args.build,
      push: args.push,
      sign: args.sign,
      verify: args.verify
    },
    stages
  };
  writeReport(outDir, report);
  if (!report.ok) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
