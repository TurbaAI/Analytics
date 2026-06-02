const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-burn-in-test-"));
let received = null;
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    received = {
      authorization: req.headers.authorization,
      tenant: req.headers["x-turbalance-tenant"],
      body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
    };
    res.writeHead(202, { "content-type": "application/json" });
    res.end("{\"ok\":true}\n");
  });
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const result = await runNode([
    "scripts/run-live-pilot-burn-in.js",
    "--input-dir",
    "fixtures/provider-pilot-export-inputs",
    "--iterations",
    "1",
    "--ingest-url",
    `http://127.0.0.1:${port}/v1/ingestion`,
    "--token",
    "burn-in-token",
    "--tenant",
    "tenant-a",
    "--out-dir",
    tempDir
  ]);
  await new Promise((resolve) => server.close(resolve));

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.runs.length, 1);
  assert.equal(report.runs[0].ingestStatus, 202);
  assert.ok(fs.existsSync(report.runs[0].bundlePath));
  assert.equal(received.authorization, "Bearer burn-in-token");
  assert.equal(received.tenant, "tenant-a");
  assert.equal(received.body.sources.provider[0].runId, "provider-run-9001");

  console.log("live pilot burn-in tests passed");
})().catch((error) => {
  server.close(() => {
    console.error(error);
    process.exit(1);
  });
});

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}
