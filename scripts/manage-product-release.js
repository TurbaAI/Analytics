#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { parseArgs } = require("../lib/product-config");

const root = path.join(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const action = String(args.action || "status").toLowerCase();
const apply = Boolean(args.apply);
const installRoot = path.resolve(root, args["install-root"] || "build/product-install");
const releasesDir = path.join(installRoot, "releases");
const backupsDir = path.join(installRoot, "backups");
const currentLink = path.join(installRoot, "current");
const statePath = path.join(installRoot, "release-state.json");

main();

function main() {
  if (!["install", "update", "rollback", "status"].includes(action)) {
    throw new Error(`unsupported action ${action}; use install, update, rollback, or status`);
  }

  let report;
  if (action === "status") {
    report = statusReport();
  } else if (action === "rollback") {
    report = rollback();
  } else {
    report = installOrUpdate();
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function installOrUpdate() {
  const source = args.source ? path.resolve(root, args.source) : "";
  if (!source) throw new Error("--source is required for install/update");
  if (!fs.existsSync(source)) throw new Error(`release source does not exist: ${source}`);

  const prepared = prepareSource(source);
  const manifest = readManifest(prepared.releaseRoot);
  const packageName = sanitizeName(manifest.packageName || path.basename(prepared.releaseRoot));
  const targetReleaseDir = path.join(releasesDir, packageName);
  const previous = currentRelease();
  const backup = previous ? backupPlan(previous.packageName, packageName) : null;

  const report = {
    status: apply ? "applied" : "dry-run",
    action,
    installRoot,
    source,
    packageName,
    previousPackage: previous?.packageName || "",
    currentPackage: apply ? packageName : previous?.packageName || "",
    targetReleaseDir,
    backup,
    checksum: manifestChecksum(prepared.releaseRoot),
    statePath
  };

  if (apply) {
    ensureInstallRoot();
    if (fs.existsSync(targetReleaseDir) && !args.force) {
      throw new Error(`release already installed: ${targetReleaseDir}; pass --force to replace it`);
    }
    if (previous?.path) createBackup(previous.packageName, previous.path, backup.archive);
    copyRelease(prepared.releaseRoot, targetReleaseDir);
    switchCurrent(packageName);
    writeState({
      currentPackage: packageName,
      updatedAt: new Date().toISOString(),
      installRoot,
      history: [
        ...readState().history,
        {
          action,
          appliedAt: new Date().toISOString(),
          packageName,
          previousPackage: previous?.packageName || "",
          source,
          backupArchive: backup?.archive || ""
        }
      ].slice(-100)
    });
  }

  prepared.cleanup();
  return report;
}

function rollback() {
  const state = readState();
  const current = currentRelease();
  const targetPackage = args.to || lastRollbackTarget(state);
  if (!targetPackage) {
    throw new Error("no rollback target found; pass --to <packageName>");
  }
  const targetReleaseDir = path.join(releasesDir, sanitizeName(targetPackage));
  if (!fs.existsSync(targetReleaseDir)) {
    throw new Error(`rollback target is not installed: ${targetReleaseDir}`);
  }
  const backup = current ? backupPlan(current.packageName, targetPackage) : null;
  const report = {
    status: apply ? "applied" : "dry-run",
    action,
    installRoot,
    previousPackage: current?.packageName || "",
    currentPackage: apply ? targetPackage : current?.packageName || "",
    targetPackage,
    targetReleaseDir,
    backup,
    statePath
  };

  if (apply) {
    ensureInstallRoot();
    if (current?.path) createBackup(current.packageName, current.path, backup.archive);
    switchCurrent(targetPackage);
    writeState({
      ...state,
      currentPackage: targetPackage,
      updatedAt: new Date().toISOString(),
      history: [
        ...state.history,
        {
          action: "rollback",
          appliedAt: new Date().toISOString(),
          packageName: targetPackage,
          previousPackage: current?.packageName || "",
          backupArchive: backup?.archive || ""
        }
      ].slice(-100)
    });
  }
  return report;
}

function statusReport() {
  const state = readState();
  return {
    status: "ok",
    installRoot,
    current: currentRelease(),
    releases: listDirs(releasesDir),
    backups: listFiles(backupsDir).filter((file) => file.endsWith(".tar.gz")),
    state
  };
}

function prepareSource(source) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    return {
      releaseRoot: findReleaseRoot(source),
      cleanup: () => {}
    };
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-release-"));
  const result = spawnSync("tar", ["-xzf", source, "-C", tempDir], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024
  });
  if (result.status !== 0) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw new Error(`failed to extract ${source}: ${result.stderr || result.stdout}`);
  }
  return {
    releaseRoot: findReleaseRoot(tempDir),
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true })
  };
}

function findReleaseRoot(source) {
  const directManifest = path.join(source, "RELEASE-MANIFEST.json");
  if (fs.existsSync(directManifest)) return source;
  const candidates = fs.readdirSync(source)
    .map((entry) => path.join(source, entry))
    .filter((entryPath) => fs.existsSync(path.join(entryPath, "RELEASE-MANIFEST.json")));
  if (candidates.length === 1) return candidates[0];
  throw new Error(`could not find exactly one RELEASE-MANIFEST.json under ${source}`);
}

function readManifest(releaseRoot) {
  return JSON.parse(fs.readFileSync(path.join(releaseRoot, "RELEASE-MANIFEST.json"), "utf8"));
}

function ensureInstallRoot() {
  fs.mkdirSync(releasesDir, { recursive: true });
  fs.mkdirSync(backupsDir, { recursive: true });
}

function copyRelease(source, destination) {
  const tempDestination = `${destination}.tmp-${process.pid}`;
  fs.rmSync(tempDestination, { recursive: true, force: true });
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, tempDestination, { recursive: true, dereference: false, preserveTimestamps: true });
  fs.renameSync(tempDestination, destination);
}

function switchCurrent(packageName) {
  const target = path.join("releases", sanitizeName(packageName));
  const nextLink = path.join(installRoot, `current.next-${process.pid}`);
  fs.rmSync(nextLink, { force: true });
  fs.symlinkSync(target, nextLink, "dir");
  fs.renameSync(nextLink, currentLink);
}

function createBackup(packageName, releasePath, archivePath) {
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  const result = spawnSync("tar", ["-czf", archivePath, "-C", path.dirname(releasePath), path.basename(releasePath)], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`backup failed for ${packageName}: ${result.stderr || result.stdout}`);
  }
}

function backupPlan(fromPackage, toPackage) {
  const safeFrom = sanitizeName(fromPackage);
  const safeTo = sanitizeName(toPackage);
  return {
    fromPackage: safeFrom,
    toPackage: safeTo,
    archive: path.join(backupsDir, `${timestamp()}-${safeFrom}-before-${safeTo}.tar.gz`)
  };
}

function currentRelease() {
  try {
    const linkTarget = fs.readlinkSync(currentLink);
    const releasePath = path.resolve(installRoot, linkTarget);
    return {
      packageName: path.basename(releasePath),
      path: releasePath,
      exists: fs.existsSync(releasePath)
    };
  } catch {
    return null;
  }
}

function lastRollbackTarget(state) {
  for (let index = state.history.length - 1; index >= 0; index -= 1) {
    const entry = state.history[index];
    if (entry.previousPackage) return entry.previousPackage;
  }
  return "";
}

function readState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    return {
      currentPackage: parsed.currentPackage || "",
      updatedAt: parsed.updatedAt || "",
      installRoot: parsed.installRoot || installRoot,
      history: Array.isArray(parsed.history) ? parsed.history : []
    };
  } catch {
    return {
      currentPackage: "",
      updatedAt: "",
      installRoot,
      history: []
    };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function manifestChecksum(releaseRoot) {
  const manifestPath = path.join(releaseRoot, "RELEASE-MANIFEST.json");
  return sha256File(manifestPath);
}

function listDirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function listFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .map((entry) => path.join(dir, entry))
      .sort();
  } catch {
    return [];
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function sanitizeName(value) {
  const name = String(value || "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!name) throw new Error("release package name is empty after sanitization");
  return name;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}
