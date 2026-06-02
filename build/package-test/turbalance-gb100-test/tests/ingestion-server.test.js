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
const jwksKeyPair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = jwksKeyPair.publicKey.export({ format: "jwk" });
jwk.kid = "test-rs256-key";
jwk.alg = "RS256";
jwk.use = "sig";
const server = createIngestionServer({
  dataDir: tempDir,
  uploadSecret: "test-secret",
  tenantTokens: `tenant-a:${tenantToken}:operator:tenant-operator,admin:admin-token:admin:platform-admin`,
  jwtSecret: "jwt-secret",
  jwtJwks: { keys: [jwk] },
  jwtIssuer: "test-issuer",
  jwtAudience: "turbalance-ingestion",
  jwtTenantClaim: "customer_tenant",
  jwtRoleClaim: "groups",
  jwtTenantMap: "external-tenant-a:tenant-a",
  jwtRoleMap: "security-reader:viewer,platform-operator:operator",
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
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }
        resolve({
          status: res.statusCode,
          body: text,
          json
        });
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

function signJwt(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

function signJwtRs256(payload, privateKey, kid) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(`${header}.${body}`), privateKey)
    .toString("base64url");
  return `${header}.${body}.${signature}`;
}

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  const health = await request(port, "GET", "/health");
  assert.equal(health.status, 200);
  assert.equal(health.json.ok, true);
  assert.equal(health.json.retentionIntervalSeconds, 0);

  const unauthorized = await request(port, "POST", "/v1/uploads/sign", {
    body: JSON.stringify({ tenantId: "tenant-a" })
  });
  assert.equal(unauthorized.status, 401);

  const tenantUpsert = await request(port, "POST", "/v1/tenants", {
    headers: {
      authorization: "Bearer admin-token",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      tenantId: "tenant-b",
      displayName: "Tenant B",
      retentionDays: 7,
      maxUploadsPerTenant: 3
    })
  });
  assert.equal(tenantUpsert.status, 200, tenantUpsert.body);
  assert.equal(tenantUpsert.json.tenant.tenantId, "tenant-b");

  const rotatedToken = await request(port, "POST", "/v1/tokens/rotate", {
    headers: {
      authorization: "Bearer admin-token",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      tenantId: "tenant-b",
      role: "ingest",
      subject: "pilot-exporter"
    })
  });
  assert.equal(rotatedToken.status, 200, rotatedToken.body);
  assert.ok(rotatedToken.json.token);
  assert.ok(rotatedToken.json.tokenFingerprint);

  const rotatedUploadKey = await request(port, "POST", "/v1/upload-keys/rotate", {
    headers: {
      authorization: "Bearer admin-token",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      keyId: "next-key",
      secret: "next-secret"
    })
  });
  assert.equal(rotatedUploadKey.status, 200, rotatedUploadKey.body);
  assert.equal(rotatedUploadKey.json.activeUploadKeyId, "next-key");

  const tenants = await request(port, "GET", "/v1/tenants", {
    headers: {
      authorization: "Bearer admin-token"
    }
  });
  assert.equal(tenants.status, 200);
  assert.ok(tenants.json.tenants.some((tenant) => tenant.tenantId === "tenant-b" && tenant.tokenCount >= 1));

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
  assert.equal(signed.json.keyId, "next-key");
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

  const tenantBIngest = await request(port, "POST", "/v1/ingestion", {
    headers: {
      authorization: `Bearer ${rotatedToken.json.token}`,
      "content-type": "application/json"
    },
    body: fixtureBody
  });
  assert.equal(tenantBIngest.status, 202, tenantBIngest.body);
  assert.equal(tenantBIngest.json.tenantId, "tenant-b");

  const tenantBForbidden = await request(port, "POST", "/v1/uploads/sign", {
    headers: {
      authorization: `Bearer ${rotatedToken.json.token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ tenantId: "tenant-a" })
  });
  assert.equal(tenantBForbidden.status, 403);

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

  const auditExport = await request(port, "GET", "/v1/audit/export?format=csv&limit=20", {
    headers: {
      authorization: `Bearer ${tenantToken}`
    }
  });
  assert.equal(auditExport.status, 200);
  assert.ok(auditExport.body.startsWith("ts,event,status"));
  assert.ok(auditExport.body.includes("ingest.accepted"));

  const ssoViewer = signJwt({
    sub: "viewer@example.com",
    tenantId: "tenant-a",
    role: "viewer",
    iss: "test-issuer",
    aud: "turbalance-ingestion",
    exp: Math.floor(Date.now() / 1000) + 300
  }, "jwt-secret");
  const ssoAudit = await request(port, "GET", "/v1/audit?limit=5", {
    headers: {
      authorization: `Bearer ${ssoViewer}`
    }
  });
  assert.equal(ssoAudit.status, 200, ssoAudit.body);

  const ssoIngestDenied = await request(port, "POST", "/v1/ingestion", {
    headers: {
      authorization: `Bearer ${ssoViewer}`,
      "content-type": "application/json"
    },
    body: fixtureBody
  });
  assert.equal(ssoIngestDenied.status, 403);

  const jwksViewer = signJwtRs256({
    sub: "jwks-viewer@example.com",
    customer_tenant: "external-tenant-a",
    groups: ["security-reader"],
    iss: "test-issuer",
    aud: "turbalance-ingestion",
    exp: Math.floor(Date.now() / 1000) + 300
  }, jwksKeyPair.privateKey, "test-rs256-key");
  const jwksAudit = await request(port, "GET", "/v1/audit?limit=5", {
    headers: {
      authorization: `Bearer ${jwksViewer}`
    }
  });
  assert.equal(jwksAudit.status, 200, jwksAudit.body);

  const wrongAudienceJwt = signJwtRs256({
    sub: "jwks-viewer@example.com",
    customer_tenant: "external-tenant-a",
    groups: ["security-reader"],
    iss: "test-issuer",
    aud: "wrong-audience",
    exp: Math.floor(Date.now() / 1000) + 300
  }, jwksKeyPair.privateKey, "test-rs256-key");
  const wrongAudience = await request(port, "GET", "/v1/audit?limit=5", {
    headers: {
      authorization: `Bearer ${wrongAudienceJwt}`
    }
  });
  assert.equal(wrongAudience.status, 401);

  const metrics = await request(port, "GET", "/metrics", {
    headers: {
      authorization: `Bearer ${tenantToken}`
    }
  });
  assert.equal(metrics.status, 200);
  assert.ok(metrics.body.includes("turbalance_ingest_accepted_total"));
  assert.ok(metrics.body.includes("turbalance_jwks_fetches_total"));
  assert.ok(metrics.body.includes("turbalance_configured_tenants"));

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
  assert.ok(fs.existsSync(path.join(tempDir, "control", "tenants.json")));
  assert.ok(fs.existsSync(path.join(tempDir, "control", "tokens.json")));
  assert.ok(fs.existsSync(path.join(tempDir, "control", "upload-keys.json")));

  await new Promise((resolve) => server.close(resolve));
  console.log("ingestion server tests passed");
})().catch((error) => {
  server.close(() => {
    console.error(error);
    process.exit(1);
  });
});
