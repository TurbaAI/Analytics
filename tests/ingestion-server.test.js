const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { createIngestionServer } = require("../server/ingestion-server.js");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-ingest-"));
const tenantToken = "tenant-token";
const fixtureBody = fs.readFileSync(path.join(root, "fixtures/external-source-bundle.json"));
const fixtureSha = crypto.createHash("sha256").update(fixtureBody).digest("hex");
const server = createIngestionServer({
  dataDir: tempDir,
  uploadSecret: "test-secret",
  tenantTokens: `tenant-a:${tenantToken},admin:admin-token:admin`,
  retentionDays: 1,
  maxUploadsPerTenant: 10,
  maxUploadBytes: 2 * 1024 * 1024
});

function request(port, method, requestPath, { headers = {}, body = "" } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: requestPath,
      method,
      headers: {
        "content-length": Buffer.byteLength(body),
        ...headers
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: res.statusCode,
          body: text,
          json: text ? JSON.parse(text) : null
        });
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  const health = await request(port, "GET", "/health");
  assert.equal(health.status, 200);
  assert.equal(health.json.ok, true);

  const unauthorized = await request(port, "POST", "/v1/uploads/sign", {
    body: JSON.stringify({ tenantId: "tenant-a" })
  });
  assert.equal(unauthorized.status, 401);

  const invalidSignBody = await request(port, "POST", "/v1/uploads/sign", {
    headers: {
      authorization: `Bearer ${tenantToken}`,
      "content-type": "application/json"
    },
    body: "{not-json"
  });
  assert.equal(invalidSignBody.status, 400);
  assert.equal(invalidSignBody.json.error, "invalid_json");

  const signed = await request(port, "POST", "/v1/uploads/sign", {
    headers: {
      authorization: `Bearer ${tenantToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      tenantId: "tenant-a",
      sha256: fixtureSha,
      expiresInSeconds: 300
    })
  });
  assert.equal(signed.status, 200, signed.body);
  assert.equal(signed.json.tenantId, "tenant-a");
  assert.ok(signed.json.uploadUrl.includes("/v1/uploads/"));

  const uploaded = await request(port, "PUT", signed.json.uploadUrl, {
    headers: {
      "content-type": "application/json"
    },
    body: fixtureBody
  });
  assert.equal(uploaded.status, 202, uploaded.body);
  assert.equal(uploaded.json.sourceCounts.prometheus, 1);
  assert.equal(uploaded.json.sourceCounts.grafana, 1);
  assert.ok(fs.existsSync(path.join(tempDir, uploaded.json.storageKey)));

  const invalid = await request(port, "POST", "/v1/ingestion", {
    headers: {
      authorization: `Bearer ${tenantToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ sources: { provider: [{}] } })
  });
  assert.equal(invalid.status, 422);
  assert.ok(invalid.json.errors[0].includes("sources.provider[1] is missing runId"));

  const audit = await request(port, "GET", "/v1/audit?limit=20", {
    headers: {
      authorization: `Bearer ${tenantToken}`
    }
  });
  assert.equal(audit.status, 200);
  assert.ok(audit.json.rows.some((row) => row.event === "ingest.accepted"));

  const uploadDir = path.join(tempDir, "tenants", "tenant-a", "uploads");
  const oldPath = path.join(uploadDir, "old-upload.json");
  fs.writeFileSync(oldPath, "{}\n");
  fs.writeFileSync(oldPath.replace(/\.json$/, ".meta.json"), "{}\n");
  const oldDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  fs.utimesSync(oldPath, oldDate, oldDate);
  fs.utimesSync(oldPath.replace(/\.json$/, ".meta.json"), oldDate, oldDate);

  const retention = await request(port, "POST", "/v1/retention/run", {
    headers: {
      authorization: `Bearer ${tenantToken}`
    }
  });
  assert.equal(retention.status, 200);
  assert.ok(retention.json.deleted.some((entry) => entry.endsWith("old-upload.json")));

  await new Promise((resolve) => server.close(resolve));
  console.log("ingestion server tests passed");
})().catch((error) => {
  server.close(() => {
    console.error(error);
    process.exit(1);
  });
});
