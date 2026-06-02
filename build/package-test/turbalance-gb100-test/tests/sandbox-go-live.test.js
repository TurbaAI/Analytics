const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-sandbox-go-live-"));
const readyFile = path.join(tempDir, "gateway-ready.json");

const gateway = spawn(process.execPath, [
  "scripts/run-sandbox-source-gateway.js",
  "--port",
  "0",
  "--ready-file",
  readyFile
], {
  cwd: root,
  stdio: ["ignore", "ignore", "pipe"]
});

(async () => {
  try {
    const ready = await waitForReadyFile(readyFile);
    const health = await fetchJson(`${ready.url}/health`);
    assert.equal(health.ok, true);

    const prometheus = await fetchJson(`${ready.url}/api/v1/query?query=up`);
    assert.equal(prometheus.status, "success");
    assert.equal(prometheus.data.resultType, "vector");

    const kubernetes = await fetchJson(`${ready.url}/kubernetes/jobs`);
    assert.ok(Array.isArray(kubernetes));
    assert.ok(kubernetes.length > 0);
    assert.ok(kubernetes[0].runId);
  } finally {
    gateway.kill("SIGTERM");
  }

  const result = spawnSync(process.execPath, [
    "scripts/run-sandbox-go-live.js",
    "--dry-run",
    "--out-dir",
    tempDir
  ], {
    cwd: root,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.dryRun, true);
  assert.equal(report.image, "127.0.0.1:5000/turbalance-ingestion:2026.06");
  assert.ok(report.commands.some((command) => command.includes("run-provider-go-live-gates.js")));
  assert.ok(report.commands.some((command) => command.includes("--approvals ops/source-approvals.sandbox.json")));
  assert.ok(report.commands.some((command) => command.includes("--push-image")));

  console.log("sandbox go-live tests passed");
})().catch((error) => {
  gateway.kill("SIGTERM");
  console.error(error);
  process.exit(1);
});

async function waitForReadyFile(filePath) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("gateway did not write ready file");
}

async function fetchJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  assert.equal(response.ok, true, text);
  return JSON.parse(text);
}
