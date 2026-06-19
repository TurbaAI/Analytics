const { spawnSync } = require("node:child_process");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "..");

const result = spawnSync("python3", ["tests/turbatop_py.py"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 2 * 1024 * 1024
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

assert.equal(result.status, 0, "turbatop tests should pass");
