const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

assert.ok(fs.existsSync(path.join(root, "Dockerfile")));
assert.ok(fs.readFileSync(path.join(root, "Dockerfile"), "utf8").includes("postgresql-client"));
assert.ok(fs.readFileSync(path.join(root, "Dockerfile"), "utf8").includes("awscli"));

const result = spawnSync(process.execPath, [
  "scripts/build-publish-ingestion-image.js",
  "--config",
  "ops/pilot-provider.config.example.json",
  "--dry-run"
], {
  cwd: root,
  encoding: "utf8"
});

assert.equal(result.status, 0, result.stderr);
const report = JSON.parse(result.stdout);
assert.equal(report.ok, true);
assert.equal(report.dryRun, true);
assert.equal(report.image, "registry.provider.example/ai-ops/turbalance-ingestion:2026.06");
assert.ok(report.commands.some((command) => command.includes("docker buildx build")));
assert.ok(report.commands.some((command) => command.includes("--tag registry.provider.example/ai-ops/turbalance-ingestion:2026.06")));

console.log("provider image tests passed");
