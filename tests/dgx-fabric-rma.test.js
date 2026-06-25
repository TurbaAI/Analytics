const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

const dryRun = spawnSync(process.execPath, ["scripts/configure-dgx-fabric.js"], {
  cwd: require("node:path").join(__dirname, ".."),
  encoding: "utf8"
});

assert.equal(dryRun.status, 0);
const report = JSON.parse(dryRun.stdout);
assert.deepEqual(report.hosts.map((host) => host.name), ["jensen", "lisa"]);
assert.deepEqual(report.excludedHosts.map((host) => host.name), ["pat"]);
assert.equal(report.excludedHosts[0].reason, "offline-rma");

const activeText = JSON.stringify(report.hosts);
assert.ok(!activeText.includes("pat"));
assert.ok(!activeText.includes("10.77.0.27"));
assert.ok(!activeText.includes("192.168.10.27"));

const help = spawnSync(process.execPath, ["scripts/configure-dgx-fabric.js", "--help"], {
  cwd: require("node:path").join(__dirname, ".."),
  encoding: "utf8"
});

assert.equal(help.status, 0);
assert.ok(help.stdout.includes("active two-node DGX 400G fabric"));
assert.ok(!help.stdout.includes("three-node DGX full-mesh"));
