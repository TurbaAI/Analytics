#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function parseArgs(argv) {
  const args = {
    outDir: path.join(root, "build", "packages"),
    name: `turbalance-gb100-telemetry-${timestamp()}`,
    skipTar: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out-dir") args.outDir = path.resolve(argv[++index]);
    else if (arg === "--name") args.name = argv[++index];
    else if (arg === "--skip-tar") args.skipTar = true;
    else if (arg === "--help") {
      console.log("usage: package-gb100-telemetry.js [--out-dir DIR] [--name NAME] [--skip-tar]");
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!/^[A-Za-z0-9._-]+$/.test(args.name)) {
    throw new Error("--name may contain only letters, numbers, dot, underscore, and dash");
  }
  return args;
}

const excludedTopLevel = new Set([
  ".git",
  "build",
  "node_modules",
  ".DS_Store"
]);

const excludedNames = new Set([
  ".DS_Store"
]);

function shouldSkip(sourcePath, relativePath) {
  const parts = relativePath.split(path.sep).filter(Boolean);
  if (parts.length === 0) return false;
  if (excludedTopLevel.has(parts[0])) return true;
  if (excludedNames.has(path.basename(sourcePath))) return true;
  return false;
}

function copyRecursive(sourcePath, destinationPath, relativePath, manifest) {
  if (shouldSkip(sourcePath, relativePath)) return;
  const stat = fs.lstatSync(sourcePath);
  if (stat.isSymbolicLink()) {
    const target = fs.readlinkSync(sourcePath);
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
  if (stat.isFile()) {
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);
    fs.chmodSync(destinationPath, stat.mode);
    manifest.files.push(relativePath);
  }
}

function runTar(outDir, packageName) {
  const tarball = path.join(outDir, `${packageName}.tar.gz`);
  const result = spawnSync("tar", ["-czf", tarball, "-C", outDir, packageName], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error("tar packaging failed");
  }
  return tarball;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const stagingDir = path.join(args.outDir, args.name);
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  const manifest = {
    schemaVersion: "turbalance.gb100.package.v1",
    createdAt: new Date().toISOString(),
    packageName: args.name,
    sourceRoot: root,
    installCommand: "./install.sh --mode docker --prefix /opt/turbalance-analytics",
    validationCommand: "./bin/gb100-telemetry-report --out-dir build/gb100-support",
    files: []
  };

  for (const entry of fs.readdirSync(root)) {
    copyRecursive(path.join(root, entry), path.join(stagingDir, entry), entry, manifest);
  }

  manifest.files.sort();
  fs.writeFileSync(path.join(stagingDir, "PACKAGE-MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");

  let tarball = null;
  if (!args.skipTar) {
    tarball = runTar(args.outDir, args.name);
  }

  console.log(`Packaged ${manifest.files.length} files into ${stagingDir}`);
  if (tarball) console.log(`Wrote ${tarball}`);
}

main();
