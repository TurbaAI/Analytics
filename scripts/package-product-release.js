#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  parseArgs,
  readProductConfig,
  redactConfig
} = require("../lib/product-config");

const root = path.join(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const configPath = args.config || "ops/turbalance-product.example.json";
const config = readProductConfig(configPath);
const outDir = path.resolve(root, args["out-dir"] || "build/releases");
const packageName = sanitizeName(args.name || `turbalance-product-${config.product.version}-${timestamp()}`);
const skipTar = Boolean(args["skip-tar"]);

const excludedTopLevel = new Set([
  ".git",
  ".github",
  "build",
  "node_modules",
  "outputs",
  "target",
  ".terraform",
  ".turbalance-control",
  ".turbalance-data",
  ".turbalance-objects"
]);

const excludedNames = new Set([
  ".DS_Store",
  "__pycache__"
]);

main();

function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const stagingDir = path.join(outDir, packageName);
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  const manifest = {
    schemaVersion: "turba.product.release.v1",
    packageName,
    createdAt: new Date().toISOString(),
    product: config.product,
    configPath,
    source: sourceMetadata(),
    controller: {
      host: config.controller.host,
      staticUrl: config.controller.staticUrl,
      apiUrl: config.controller.apiUrl,
      collectorUrl: config.controller.collectorUrl,
      grafanaUrl: config.observability.grafanaUrl,
      grafanaPublicUrl: config.observability.grafanaPublicUrl || config.observability.grafanaUrl,
      prometheusUrl: config.observability.prometheusUrl
    },
    fleet: {
      enabledMachines: config.fleet.machines.filter((machine) => machine.enabled).length,
      remotes: config.fleet.machines.filter((machine) => machine.enabled && machine.remote).map((machine) => machine.remote)
    },
    commands: {
      renderRuntime: `node scripts/render-product-runtime.js --config ${configPath}`,
      doctor: `node scripts/turbalance-doctor.js --config ${configPath} --remote-checks`,
      supportBundle: `node scripts/turbalance-support-bundle.js --config ${configPath} --remote-checks`,
      observability: `node scripts/manage-product-observability.js --config ${configPath} --action up --secure auto --apply`,
      productEdge: `node scripts/manage-product-edge.js --config ${configPath} --action up --apply`,
      controllerServices: `node scripts/manage-product-controller-services.js --config ${configPath} --action install --mode user --apply`,
      turbatop: "make turbatop",
      install: `node scripts/manage-product-release.js --action install --source ${packageName}.tar.gz --install-root /opt/turbalance/product --apply`,
      update: `node scripts/manage-product-release.js --action update --source ${packageName}.tar.gz --install-root /opt/turbalance/product --apply`,
      rollback: "node scripts/manage-product-release.js --action rollback --install-root /opt/turbalance/product --apply",
      rollout: "build/product-runtime/rollout-command.sh"
    },
    files: []
  };

  for (const entry of fs.readdirSync(root)) {
    copyRecursive(path.join(root, entry), path.join(stagingDir, entry), entry, manifest);
  }

  writeJson(path.join(stagingDir, "product-config.redacted.json"), redactConfig(config));
  writeText(path.join(stagingDir, "ROLLBACK.md"), rollbackGuide(config));
  manifest.files.push("product-config.redacted.json", "ROLLBACK.md", "checksums.json", "checksums.sha256", "RELEASE-MANIFEST.json");

  manifest.files.sort();
  const checksums = checksumFiles(stagingDir);
  writeJson(path.join(stagingDir, "checksums.json"), checksums);
  writeText(path.join(stagingDir, "checksums.sha256"), checksums.files.map((file) => `${file.sha256}  ${file.path}`).join("\n") + "\n");
  writeJson(path.join(stagingDir, "RELEASE-MANIFEST.json"), manifest);

  let tarball = null;
  if (!skipTar) {
    tarball = runTar(outDir, packageName);
  }

  const report = {
    status: "packaged",
    packageName,
    stagingDir,
    tarball,
    fileCount: manifest.files.length,
    checksumCount: checksums.files.length
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function copyRecursive(sourcePath, destinationPath, relativePath, manifest) {
  if (shouldSkip(sourcePath, relativePath)) return;
  const stat = fs.lstatSync(sourcePath);
  if (stat.isSymbolicLink()) {
    const target = fs.readlinkSync(sourcePath);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.symlinkSync(target, destinationPath);
    manifest.files.push(relativePath);
    return;
  }
  if (stat.isDirectory()) {
    fs.mkdirSync(destinationPath, { recursive: true });
    for (const entry of fs.readdirSync(sourcePath)) {
      copyRecursive(
        path.join(sourcePath, entry),
        path.join(destinationPath, entry),
        path.join(relativePath, entry),
        manifest
      );
    }
    return;
  }
  if (!stat.isFile()) return;
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
  fs.chmodSync(destinationPath, stat.mode);
  manifest.files.push(relativePath);
}

function shouldSkip(sourcePath, relativePath) {
  const parts = relativePath.split(path.sep).filter(Boolean);
  if (!parts.length) return false;
  if (excludedTopLevel.has(parts[0])) return true;
  if (parts.some((part) => part === "node_modules" || part === "__pycache__" || part === ".terraform")) return true;
  if (parts.some((part) => part.startsWith(".venv"))) return true;
  if (excludedNames.has(path.basename(sourcePath))) return true;
  if (/\.pyc$/.test(sourcePath)) return true;
  if (/\.log$/.test(sourcePath)) return true;
  return false;
}

function checksumFiles(stagingDir) {
  const files = [];
  walk(stagingDir, (filePath) => {
    const relativePath = path.relative(stagingDir, filePath);
    if (["checksums.json", "checksums.sha256", "RELEASE-MANIFEST.json"].includes(relativePath)) return;
    files.push({
      path: relativePath.split(path.sep).join("/"),
      sha256: sha256File(filePath)
    });
  });
  files.sort((left, right) => left.path.localeCompare(right.path));
  return {
    schemaVersion: "turba.product.checksums.v1",
    generatedAt: new Date().toISOString(),
    files
  };
}

function walk(dir, onFile) {
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = fs.lstatSync(fullPath);
    if (stat.isDirectory()) walk(fullPath, onFile);
    else if (stat.isFile()) onFile(fullPath);
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function runTar(outDir, packageName) {
  const tarball = path.join(outDir, `${packageName}.tar.gz`);
  const result = spawnSync("tar", ["-czf", tarball, "-C", outDir, packageName], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`tar failed: ${result.stderr || result.stdout}`);
  }
  return tarball;
}

function sourceMetadata() {
  return {
    gitHead: runText("git", ["rev-parse", "HEAD"]).trim(),
    gitStatusShort: runText("git", ["status", "--short"]).trim().split("\n").filter(Boolean)
  };
}

function rollbackGuide(config) {
  return [
    "# Turbalance Product Rollback",
    "",
    "Use this when a bare-metal update needs to be backed out during a pilot change window.",
    "",
    "1. Stop changed controller services if needed:",
    "",
    "```sh",
    "pkill -f 'uvicorn api_server.app:app' || true",
    "pkill -f 'uvicorn collector_gateway.app:app' || true",
    "```",
    "",
    "2. Restore the pre-change backup tarball captured under `build/productization-backups/`:",
    "",
    "```sh",
    "cd /home/user/turbalance-analytics",
    "tar -xzf build/productization-backups/pre-productization-YYYYMMDD-HHMMSS.tgz",
    "```",
    "",
    "3. Restart the controller services using the saved runtime env or the previous runbook.",
    "",
    "4. Verify the rollback:",
    "",
    "```sh",
    `node scripts/turbalance-doctor.js --config ${configPath} --remote-checks`,
    "```",
    "",
    "Current release endpoints:",
    "",
    `- Dashboard: ${config.controller.staticUrl}`,
    `- API: ${config.controller.apiUrl}`,
    `- Collector: ${config.controller.collectorUrl}`,
    `- Grafana: ${config.observability.grafanaPublicUrl || config.observability.grafanaUrl}`,
    `- Grafana internal health URL: ${config.observability.grafanaUrl}`,
    ""
  ].join("\n");
}

function runText(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
  return result.status === 0 ? result.stdout : "";
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function sanitizeName(value) {
  const name = String(value || "turbalance-product").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!name) throw new Error("package name is empty after sanitization");
  return name;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}
