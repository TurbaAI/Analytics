#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const qaDir = path.join(root, "build", "playwright");

function parseArgs(argv) {
  const args = { install: false, browsers: false, out: "" };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--install") args.install = true;
    else if (arg === "--browsers") args.browsers = true;
    else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else if (arg === "--out") {
      args.out = need(arg, next);
      index += 1;
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  return args;
}

function need(flag, value) {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: scripts/prepare-screenshot-qa.js [--install] [--browsers] [--out <file>]

Prepares the optional Playwright dependency used by scripts/run-screenshot-qa.js. Default mode only reports whether the dependency is ready. --install installs Playwright under build/playwright; --browsers also installs Chromium.`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    ...options
  });
  return {
    command: [command, ...args].join(" "),
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function localPlaywrightPath() {
  return path.join(qaDir, "node_modules", "playwright");
}

function rootPlaywrightReady() {
  try {
    require.resolve("playwright", { paths: [root] });
    return true;
  } catch {
    return false;
  }
}

function localPlaywrightReady() {
  return fs.existsSync(localPlaywrightPath());
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
  const steps = [];
  if (args.install && !localPlaywrightReady() && !rootPlaywrightReady()) {
    fs.mkdirSync(qaDir, { recursive: true });
    if (!fs.existsSync(path.join(qaDir, "package.json"))) {
      fs.writeFileSync(path.join(qaDir, "package.json"), '{"private":true,"dependencies":{}}\n', "utf8");
    }
    steps.push(run("npm", ["install", "--prefix", qaDir, "playwright@^1.45.0"]));
  }
  if (args.browsers) {
    steps.push(run("npx", ["--prefix", qaDir, "playwright", "install", "chromium"]));
  }
  const report = {
    status: rootPlaywrightReady() || localPlaywrightReady() ? "ready" : "missing",
    rootPlaywright: rootPlaywrightReady(),
    localPlaywright: localPlaywrightReady(),
    localPath: localPlaywrightPath(),
    commands: [
      "node scripts/prepare-screenshot-qa.js --install --browsers",
      "TURBALANCE_SCREENSHOT_QA_REQUIRED=1 node scripts/run-screenshot-qa.js"
    ],
    steps
  };
  write(args.out, report);
  if (args.install && steps.some((step) => !step.ok)) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
