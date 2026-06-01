const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-retention-job-"));
const uploadDir = path.join(tempDir, "tenants", "tenant-a", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const oldPath = path.join(uploadDir, "old-upload.json");
fs.writeFileSync(oldPath, "{}\n");
fs.writeFileSync(oldPath.replace(/\.json$/, ".meta.json"), "{}\n");
const oldDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
fs.utimesSync(oldPath, oldDate, oldDate);
fs.utimesSync(oldPath.replace(/\.json$/, ".meta.json"), oldDate, oldDate);

const result = spawnSync(
  process.execPath,
  ["scripts/run-retention-job.js", "--json"],
  {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      TURBALANCE_DATA_DIR: tempDir,
      TURBALANCE_RETENTION_DAYS: "1",
      TURBALANCE_TENANT_TOKENS: "tenant-a:tenant-token"
    }
  }
);

assert.equal(result.status, 0, result.stderr);
const report = JSON.parse(result.stdout);
assert.equal(report.ok, true);
assert.equal(report.deletedCount, 2);
assert.ok(report.deleted.some((entry) => entry.endsWith("old-upload.json")));
assert.equal(fs.existsSync(oldPath), false);

console.log("retention job tests passed");
