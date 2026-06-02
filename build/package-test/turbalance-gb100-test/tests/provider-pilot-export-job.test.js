const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { validateSourceBundle } = require("../lib/source-bundle-validator.js");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-export-job-"));
const outputPath = path.join(tempDir, "bundle.json");

(async () => {
  const result = await runJob([
    "scripts/run-provider-pilot-export-job.js",
    "--input-dir",
    "fixtures/provider-pilot-export-inputs",
    "--out",
    outputPath
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(outputPath));
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.outputPath, outputPath);
  const bundle = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  const validation = validateSourceBundle(bundle, { requireSourceExport: true });
  assert.equal(validation.ok, true, validation.errors.join("; "));
  assert.equal(bundle.sources.provider[0].runId, "provider-run-9001");

  let received = null;
  const ingestServer = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      received = {
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization,
        tenant: req.headers["x-turbalance-tenant"],
        body: Buffer.concat(chunks).toString("utf8")
      };
      res.writeHead(202, { "content-type": "application/json" });
      res.end("{\"ok\":true}\n");
    });
  });

  await new Promise((resolve) => ingestServer.listen(0, "127.0.0.1", resolve));
  const { port } = ingestServer.address();
  const uploadResult = await runJob([
    "scripts/run-provider-pilot-export-job.js",
    "--input-dir",
    "fixtures/provider-pilot-export-inputs",
    "--ingest-url",
    `http://127.0.0.1:${port}/v1/ingestion`,
    "--token",
    "pilot-token",
    "--tenant",
    "tenant-a"
  ]);
  await new Promise((resolve) => ingestServer.close(resolve));

  assert.equal(uploadResult.status, 0, uploadResult.stderr);
  const uploadReport = JSON.parse(uploadResult.stdout);
  assert.equal(uploadReport.ingestStatus, 202);
  assert.equal(received.method, "POST");
  assert.equal(received.url, "/v1/ingestion");
  assert.equal(received.authorization, "Bearer pilot-token");
  assert.equal(received.tenant, "tenant-a");
  assert.equal(JSON.parse(received.body).sources.provider[0].runId, "provider-run-9001");

  console.log("provider pilot export job tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

function runJob(args) {
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
