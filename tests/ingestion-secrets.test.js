const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readSecretValue } = require("../server/ingestion-secrets.js");
const { createIngestionConfig } = require("../server/ingestion-server.js");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-secrets-"));
const tokenPath = path.join(tempDir, "tenant-tokens");
const uploadSecretPath = path.join(tempDir, "upload-secret");
const jwtSecretPath = path.join(tempDir, "jwt-secret");

fs.writeFileSync(tokenPath, "tenant-file:file-token:operator:file-subject\n");
fs.writeFileSync(uploadSecretPath, "file-upload-secret\n");
fs.writeFileSync(jwtSecretPath, "file-jwt-secret\n");

assert.equal(readSecretValue({ value: "direct", env: "NOPE", fileEnv: "NOPE_FILE" }), "direct");

const previous = {
  TURBALANCE_TENANT_TOKENS_FILE: process.env.TURBALANCE_TENANT_TOKENS_FILE,
  TURBALANCE_UPLOAD_SECRET_FILE: process.env.TURBALANCE_UPLOAD_SECRET_FILE,
  TURBALANCE_JWT_SECRET_FILE: process.env.TURBALANCE_JWT_SECRET_FILE
};

process.env.TURBALANCE_TENANT_TOKENS_FILE = tokenPath;
process.env.TURBALANCE_UPLOAD_SECRET_FILE = uploadSecretPath;
process.env.TURBALANCE_JWT_SECRET_FILE = jwtSecretPath;

try {
  const config = createIngestionConfig({
    dataDir: path.join(tempDir, "data")
  });
  assert.equal(config.tokens.size, 1);
  assert.equal(config.tokens.values().next().value.tenantId, "tenant-file");
  assert.equal(config.uploadKeys.get("default").secret, "file-upload-secret");
  assert.equal(config.jwtSecret, "file-jwt-secret");
} finally {
  Object.entries(previous).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
}

console.log("ingestion secrets tests passed");
