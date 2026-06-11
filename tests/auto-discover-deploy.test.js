const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-auto-discover-"));
const liveBundle = path.join(tempDir, "live-machine-bundle.json");
const reportPath = path.join(tempDir, "report.json");

fs.writeFileSync(liveBundle, `${JSON.stringify({
  ingestion: {
    runs: [
      {
        name: "DGX-lisa current window",
        sourceContext: {
          hostname: "DGX-lisa",
          networkLocalAddress: "192.168.10.38"
        }
      }
    ]
  },
  metadata: {
    observedHosts: ["DGX-lisa"]
  }
}, null, 2)}\n`);

for (const script of ["scripts/auto-discover-deploy.js", "scripts/auto-discover-deploy.py"]) {
  const executable = script.endsWith(".py") ? "python3" : process.execPath;
  const result = spawnSync(executable, [
  script,
  "--scan",
  "false",
  "--discovered-host",
  "192.168.10.38",
  "--discovered-host",
  "192.168.10.42",
  "--live-bundle",
  liveBundle,
  "--collector-url",
  "http://192.168.10.103:8801/v1/source-bundles",
  "--host-url",
  "http://192.168.10.103:8000",
  "--remote-root",
  "/home/user/turbalance-analytics",
  "--systemd-mode",
  "user",
  "--out",
  reportPath
], {
  cwd: root,
  encoding: "utf8"
});

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "dry-run");
  assert.equal(report.summary.candidateHosts, 2);
  assert.equal(report.summary.monitoredHosts, 1);
  assert.equal(report.summary.deploymentEligibleHosts, 0);
  assert.equal(report.rollout ?? report.deployment ?? null, null);
  assert.ok(report.commands.dryRun.includes(script));
  assert.ok(report.commands.apply.includes("--apply"));
  assert.ok(report.commands.apply.includes("--benchmarks"));

  const lisa = report.candidates.find((candidate) => candidate.host === "192.168.10.38");
  const jensen = report.candidates.find((candidate) => candidate.host === "192.168.10.42");
  assert.equal(lisa.alreadyMonitored, true);
  assert.equal(lisa.deploymentPlan, "skip-already-monitored");
  assert.equal(jensen.credentialStatus, "missing");
  assert.equal(jensen.deploymentPlan, "skip-no-credential");
  assert.ok(fs.existsSync(reportPath));
}

console.log("auto discovery deployment tests passed");
