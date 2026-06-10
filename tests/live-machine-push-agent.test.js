const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-live-push-"));

(async () => {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      received.push({ headers: req.headers, body });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "written", rowCount: 3 }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const sequencePath = path.join(tempDir, "sequence-no");

  const push = await runNodeScript([
    "scripts/push-live-machine-telemetry.js",
    "--collector-url",
    `http://127.0.0.1:${port}/v1/source-bundles`,
    "--tenant-id",
    "tenant-test",
    "--agent-id",
    "test-live-machine-push",
    "--sequence-path",
    sequencePath,
    "--spool-dir",
    path.join(tempDir, "spool"),
    "--run-id",
    "live-machine-push-test",
    "--fast-refresh",
    "1",
    "--ollama-probe",
    "0",
    "--hmac-secret",
    "push-hmac-secret",
    "--token",
    "push-token"
  ]);
  await new Promise((resolve) => server.close(resolve));

  assert.equal(push.status, 0, push.stderr);
  assert.equal(received.length, 1);
  const payload = JSON.parse(received[0].body);
  assert.equal(payload.tenantId, "tenant-test");
  assert.equal(payload.agentId, "test-live-machine-push");
  assert.equal(payload.sequenceNo, 1);
  assert.equal(fs.readFileSync(sequencePath, "utf8").trim(), "1");
  assert.equal(received[0].headers.authorization, "Bearer push-token");
  assert.equal(received[0].headers["x-turbalance-agent-id"], "test-live-machine-push");
  assert.ok(received[0].headers["x-turbalance-signature"].startsWith("v1="));
  assert.ok(received[0].headers["x-turbalance-timestamp"]);
  assert.ok(received[0].headers["x-turbalance-nonce"]);
  assert.equal(verifyHmac(received[0], "push-hmac-secret"), true);

  const failSpoolDir = path.join(tempDir, "fail-spool");
  const failed = await runNodeScript([
    "scripts/push-live-machine-telemetry.js",
    "--collector-url",
    "http://127.0.0.1:9/v1/source-bundles",
    "--tenant-id",
    "tenant-test",
    "--sequence-path",
    path.join(tempDir, "failed-sequence-no"),
    "--spool-dir",
    failSpoolDir,
    "--run-id",
    "live-machine-spool-test",
    "--fast-refresh",
    "1",
    "--ollama-probe",
    "0"
  ]);
  assert.equal(failed.status, 0, failed.stderr);
  assert.ok(JSON.parse(failed.stdout.trim()).spoolPath);
  assert.equal(findJsonFiles(failSpoolDir).length, 1);

  const replayed = [];
  const replayServer = http.createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      replayed.push(JSON.parse(body));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "written", rowCount: 1 }));
    });
  });
  await new Promise((resolve) => replayServer.listen(0, "127.0.0.1", resolve));
  const replayPort = replayServer.address().port;
  for (const filePath of findJsonFiles(failSpoolDir)) {
    const entry = JSON.parse(fs.readFileSync(filePath, "utf8"));
    entry.collectorUrl = `http://127.0.0.1:${replayPort}/v1/source-bundles`;
    fs.writeFileSync(filePath, `${JSON.stringify(entry, null, 2)}\n`);
  }
  const replay = await runNodeScript([
    "scripts/push-live-machine-telemetry.js",
    "--replay-only",
    "--spool-dir",
    failSpoolDir
  ]);
  await new Promise((resolve) => replayServer.close(resolve));
  assert.equal(replay.status, 0, replay.stderr);
  assert.equal(replayed.length, 1);
  assert.equal(findJsonFiles(failSpoolDir).length, 0);

  const rollout = await runNodeScript([
    "scripts/rollout-production-fleet.js",
    "--remote",
    "user@192.168.10.20,pi@pi1",
    "--collector-url",
    "http://192.168.10.30:8801/v1/source-bundles",
    "--benchmarks",
    "--otel",
    "--token",
    "rollout-token",
    "--hmac-secret",
    "rollout-secret"
  ]);
  assert.equal(rollout.status, 0, rollout.stderr);
  const rolloutPlan = JSON.parse(rollout.stdout);
  assert.equal(rolloutPlan.status, "dry-run");
  assert.equal(rolloutPlan.targets.length, 2);
  assert.ok(rolloutPlan.targets.some((target) => target.role === "spark"));
  assert.ok(rolloutPlan.targets.some((target) => target.role === "pi"));
  assert.ok(JSON.stringify(rolloutPlan).includes("turbalance-live-machine-agent.service"));
  assert.ok(JSON.stringify(rolloutPlan).includes("fleet-observability-compose.yml"));
  assert.ok(JSON.stringify(rolloutPlan).includes("[REDACTED]"));
  assert.ok(!JSON.stringify(rolloutPlan).includes("rollout-token"));
  assert.ok(!JSON.stringify(rolloutPlan).includes("rollout-secret"));

  console.log("live machine push agent tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

function verifyHmac(request, secret) {
  const timestamp = request.headers["x-turbalance-timestamp"];
  const nonce = request.headers["x-turbalance-nonce"];
  const supplied = request.headers["x-turbalance-signature"].replace(/^v1=/, "");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(Buffer.from(`${timestamp}.${nonce}.`, "utf8"))
    .update(Buffer.from(request.body))
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function findJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  walk(dir, files);
  return files.filter((filePath) => filePath.endsWith(".json")).sort();
}

function runNodeScript(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: root });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      resolve({ status: 1, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on("close", (status, signal) => {
      resolve({ status, signal, stdout, stderr });
    });
  });
}

function walk(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    else if (entry.isFile()) files.push(fullPath);
  }
}
