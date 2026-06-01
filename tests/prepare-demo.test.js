const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-demo-prep-"));

const result = spawnSync(process.execPath, [
  "scripts/prepare-demo.js",
  "--out-dir",
  tempDir
], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024
});

assert.equal(result.status, 0, result.stderr);
const report = JSON.parse(result.stdout);
assert.equal(report.ok, true);
assert.equal(report.outDir, tempDir);
assert.ok(report.summary.passed >= 8);
assert.ok(report.summary.warnings >= 1);
assert.equal(report.summary.failed, 0);
assert.equal(report.demoPath.primaryDataset, "fixtures/neo-cloud-provider-bundle.json");
assert.ok(report.hardware.integration.includes("Linux NVIDIA GPU node"));
assert.ok(report.nvidiaSchedulerPosition.includes("Do not claim SM scheduler replacement"));

[
  "provider-overlay.json",
  "scheduler-overlay.json",
  "ebpf-overlay.json",
  "provider-pilot-bundle.json",
  "source-bundle-validation.json",
  "provider-readiness.json",
  "managed-kubernetes.yaml",
  "provider-image-dry-run.json",
  "demo-readiness.json",
  "demo-readiness.md"
].forEach((fileName) => {
  const fullPath = path.join(tempDir, fileName);
  assert.ok(fs.existsSync(fullPath), `${fileName} should exist`);
  assert.ok(fs.statSync(fullPath).size > 0, `${fileName} should not be empty`);
});

const validation = JSON.parse(fs.readFileSync(path.join(tempDir, "source-bundle-validation.json"), "utf8"));
assert.equal(validation.ok, true);
assert.equal(validation.reports.length, 3);

const readiness = JSON.parse(fs.readFileSync(path.join(tempDir, "provider-readiness.json"), "utf8"));
assert.equal(readiness.ok, true);
assert.equal(readiness.summary.failed, 0);
assert.equal(readiness.summary.warnings, 0);

const imageDryRun = JSON.parse(fs.readFileSync(path.join(tempDir, "provider-image-dry-run.json"), "utf8"));
assert.equal(imageDryRun.ok, true);
assert.equal(imageDryRun.dryRun, true);
assert.ok(imageDryRun.commands.some((command) => command.includes("docker buildx build")));

const markdown = fs.readFileSync(path.join(tempDir, "demo-readiness.md"), "utf8");
assert.ok(markdown.includes("Hardware Notes"));
assert.ok(markdown.includes("NVIDIA SM Scheduler Position"));
assert.ok(markdown.includes("fixtures/neo-cloud-provider-bundle.json"));

console.log("demo prep tests passed");
