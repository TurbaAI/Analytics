#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");
const { validateSourceBundle } = require("../lib/source-bundle-validator.js");

const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function createIngestionServer(options = {}) {
  const config = normalizeConfig(options);

  ensureDir(config.dataDir);
  ensureDir(path.join(config.dataDir, "audit"));
  applyRetention(config);

  return http.createServer(async (req, res) => {
    const requestId = crypto.randomUUID();
    const requestUrl = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);

    try {
      if (req.method === "OPTIONS") {
        return writeResponse(res, 204, null, config);
      }

      if (req.method === "GET" && requestUrl.pathname === "/health") {
        return writeJson(res, 200, {
          ok: true,
          service: "turbalance-ingestion",
          retentionDays: config.retentionDays,
          maxUploadBytes: config.maxUploadBytes
        }, config);
      }

      if (req.method === "POST" && requestUrl.pathname === "/v1/uploads/sign") {
        return await handleSignUpload(req, res, requestId, config);
      }

      if (req.method === "PUT" && requestUrl.pathname.startsWith("/v1/uploads/")) {
        return await handleSignedUpload(req, res, requestUrl, requestId, config);
      }

      if (req.method === "POST" && requestUrl.pathname === "/v1/ingestion") {
        return await handleDirectIngest(req, res, requestId, config);
      }

      if (req.method === "GET" && requestUrl.pathname === "/v1/audit") {
        return await handleAuditRead(req, res, requestUrl, requestId, config);
      }

      if (req.method === "POST" && requestUrl.pathname === "/v1/retention/run") {
        return await handleRetentionRun(req, res, requestId, config);
      }

      writeJson(res, 404, { ok: false, error: "not_found", requestId }, config);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const publicError = error.publicError || "internal_error";
      await audit(config, {
        requestId,
        event: "request.error",
        status: "error",
        statusCode,
        message: error.message
      });
      writeJson(res, statusCode, { ok: false, error: publicError, requestId }, config);
    }
  });
}

async function handleSignUpload(req, res, requestId, config) {
  const auth = await requireAuth(req, res, requestId, config);
  if (!auth) return;

  const body = await readJsonBody(req, config.maxUploadBytes);
  const tenantId = tenantForRequest(auth, body.tenantId);
  if (!tenantId) {
    await audit(config, { requestId, event: "upload.sign.denied", status: "denied", actor: auth.actor, tenantId: body.tenantId });
    return writeJson(res, 403, { ok: false, error: "tenant_forbidden", requestId }, config);
  }

  const uploadId = crypto.randomUUID();
  const expiresInSeconds = clampNumber(body.expiresInSeconds, 60, 3600, 900);
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const sha256 = stringValue(body.sha256);
  const signature = signUpload(config, { tenantId, uploadId, expires, sha256 });
  const query = new URLSearchParams({
    tenant: tenantId,
    expires: String(expires),
    signature
  });
  if (sha256) query.set("sha256", sha256);

  await audit(config, {
    requestId,
    event: "upload.sign",
    status: "ok",
    actor: auth.actor,
    tenantId,
    uploadId,
    expiresAt: new Date(expires * 1000).toISOString()
  });

  writeJson(res, 200, {
    ok: true,
    requestId,
    tenantId,
    uploadId,
    method: "PUT",
    expiresAt: new Date(expires * 1000).toISOString(),
    uploadUrl: `/v1/uploads/${uploadId}?${query.toString()}`
  }, config);
}

async function handleSignedUpload(req, res, requestUrl, requestId, config) {
  const uploadId = sanitizeSegment(requestUrl.pathname.split("/").pop());
  const tenantId = sanitizeSegment(requestUrl.searchParams.get("tenant"));
  const expires = Number(requestUrl.searchParams.get("expires"));
  const signature = stringValue(requestUrl.searchParams.get("signature"));
  const sha256 = stringValue(requestUrl.searchParams.get("sha256"));

  if (!uploadId || !tenantId || !Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) {
    await audit(config, { requestId, event: "upload.signed.denied", status: "expired_or_invalid", tenantId, uploadId });
    return writeJson(res, 401, { ok: false, error: "signed_upload_expired_or_invalid", requestId }, config);
  }

  const expected = signUpload(config, { tenantId, uploadId, expires, sha256 });
  if (!safeEqual(signature, expected)) {
    await audit(config, { requestId, event: "upload.signed.denied", status: "bad_signature", tenantId, uploadId });
    return writeJson(res, 401, { ok: false, error: "bad_signature", requestId }, config);
  }

  const raw = await readBody(req, config.maxUploadBytes);
  const actualSha = sha256Hex(raw);
  if (sha256 && actualSha !== sha256) {
    await audit(config, { requestId, event: "upload.signed.rejected", status: "sha256_mismatch", tenantId, uploadId });
    return writeJson(res, 400, { ok: false, error: "sha256_mismatch", requestId }, config);
  }

  return validateAndStore({
    res,
    config,
    requestId,
    tenantId,
    actor: "signed-upload",
    uploadId,
    raw,
    source: "signed-upload"
  });
}

async function handleDirectIngest(req, res, requestId, config) {
  const auth = await requireAuth(req, res, requestId, config);
  if (!auth) return;

  const tenantId = tenantForRequest(auth, req.headers["x-turbalance-tenant"]);
  if (!tenantId) {
    await audit(config, { requestId, event: "ingest.direct.denied", status: "denied", actor: auth.actor, tenantId: req.headers["x-turbalance-tenant"] });
    return writeJson(res, 403, { ok: false, error: "tenant_forbidden", requestId }, config);
  }

  return validateAndStore({
    res,
    config,
    requestId,
    tenantId,
    actor: auth.actor,
    uploadId: crypto.randomUUID(),
    raw: await readBody(req, config.maxUploadBytes),
    source: "direct-ingest"
  });
}

async function handleAuditRead(req, res, requestUrl, requestId, config) {
  const auth = await requireAuth(req, res, requestId, config);
  if (!auth) return;

  const requestedTenant = sanitizeSegment(requestUrl.searchParams.get("tenant"));
  const tenantId = auth.role === "admin" ? requestedTenant : auth.tenantId;
  const limit = clampNumber(requestUrl.searchParams.get("limit"), 1, 500, 100);
  const rows = readAuditRows(config, { tenantId, limit });

  await audit(config, { requestId, event: "audit.read", status: "ok", actor: auth.actor, tenantId: tenantId || "all", limit });
  writeJson(res, 200, { ok: true, requestId, tenantId: tenantId || "all", rows }, config);
}

async function handleRetentionRun(req, res, requestId, config) {
  const auth = await requireAuth(req, res, requestId, config);
  if (!auth) return;

  const result = applyRetention(config, { tenantId: auth.role === "admin" ? undefined : auth.tenantId });
  await audit(config, { requestId, event: "retention.run", status: "ok", actor: auth.actor, tenantId: auth.role === "admin" ? "all" : auth.tenantId, deleted: result.deleted.length });
  writeJson(res, 200, { ok: true, requestId, ...result }, config);
}

async function validateAndStore({ res, config, requestId, tenantId, actor, uploadId, raw, source }) {
  let payload;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    await audit(config, { requestId, event: "ingest.rejected", status: "invalid_json", actor, tenantId, uploadId, source });
    return writeJson(res, 400, { ok: false, error: "invalid_json", requestId }, config);
  }

  const validation = validateSourceBundle(payload, { requireSourceExport: false });
  if (!validation.ok) {
    await audit(config, { requestId, event: "ingest.rejected", status: "schema_invalid", actor, tenantId, uploadId, source, errors: validation.errors });
    return writeJson(res, 422, { ok: false, error: "schema_invalid", requestId, errors: validation.errors }, config);
  }

  const stored = storePayload(config, { tenantId, uploadId, payload, raw, source });
  await audit(config, {
    requestId,
    event: "ingest.accepted",
    status: "ok",
    actor,
    tenantId,
    uploadId,
    source,
    storageKey: stored.storageKey,
    sourceCounts: validation.sourceCounts,
    runCount: validation.runIds.length
  });

  writeJson(res, 202, {
    ok: true,
    requestId,
    tenantId,
    uploadId,
    storageKey: stored.storageKey,
    sourceCounts: validation.sourceCounts,
    runIds: validation.runIds
  }, config);
}

function storePayload(config, { tenantId, uploadId, payload, raw, source }) {
  const tenantDir = tenantUploadDir(config, tenantId);
  ensureDir(tenantDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = `${stamp}-${uploadId}`;
  const storageKey = `tenants/${tenantId}/uploads/${baseName}.json`;
  const fullPath = path.join(config.dataDir, storageKey);
  const metaPath = path.join(config.dataDir, `tenants/${tenantId}/uploads/${baseName}.meta.json`);

  fs.writeFileSync(`${fullPath}.tmp`, raw);
  fs.renameSync(`${fullPath}.tmp`, fullPath);
  fs.writeFileSync(metaPath, `${JSON.stringify({
    tenantId,
    uploadId,
    source,
    storedAt: new Date().toISOString(),
    sha256: sha256Hex(raw),
    bytes: raw.length,
    schemaVersion: payload.schemaVersion || payload.ingestion?.schemaVersion || "source-bundle"
  }, null, 2)}\n`);

  return { storageKey, fullPath };
}

async function requireAuth(req, res, requestId, config) {
  const header = stringValue(req.headers.authorization);
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  const account = config.tokens.get(token);

  if (!account) {
    await audit(config, { requestId, event: "auth.failure", status: "denied", actor: "anonymous" });
    writeJson(res, 401, { ok: false, error: "unauthorized", requestId }, config);
    return null;
  }

  return {
    ...account,
    actor: `${account.tenantId}:${tokenFingerprint(token)}`
  };
}

function tenantForRequest(auth, requestedTenant) {
  const tenantId = sanitizeSegment(requestedTenant || auth.tenantId);
  if (!tenantId) return "";
  if (auth.role === "admin") return tenantId;
  return tenantId === auth.tenantId ? tenantId : "";
}

function applyRetention(config, options = {}) {
  const deleted = [];
  const cutoff = Date.now() - config.retentionDays * 24 * 60 * 60 * 1000;
  const tenantsDir = path.join(config.dataDir, "tenants");
  if (!fs.existsSync(tenantsDir)) return { deleted };

  const tenants = fs.readdirSync(tenantsDir)
    .filter((tenantId) => !options.tenantId || tenantId === options.tenantId);

  tenants.forEach((tenantId) => {
    const uploadDir = path.join(tenantsDir, tenantId, "uploads");
    if (!fs.existsSync(uploadDir)) return;

    const files = fs.readdirSync(uploadDir)
      .filter((file) => file.endsWith(".json") && !file.endsWith(".meta.json"))
      .map((file) => ({
        file,
        fullPath: path.join(uploadDir, file),
        mtimeMs: fs.statSync(path.join(uploadDir, file)).mtimeMs
      }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    files.forEach((entry, index) => {
      if (entry.mtimeMs >= cutoff && index < config.maxUploadsPerTenant) return;
      [entry.fullPath, entry.fullPath.replace(/\.json$/, ".meta.json")].forEach((target) => {
        if (fs.existsSync(target)) {
          fs.rmSync(target, { force: true });
          deleted.push(path.relative(config.dataDir, target));
        }
      });
    });
  });

  return { deleted };
}

function readAuditRows(config, { tenantId, limit }) {
  const auditPath = path.join(config.dataDir, "audit", "audit.jsonl");
  if (!fs.existsSync(auditPath)) return [];

  return fs.readFileSync(auditPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((row) => !tenantId || row.tenantId === tenantId)
    .slice(-limit)
    .reverse();
}

async function audit(config, event) {
  const auditPath = path.join(config.dataDir, "audit", "audit.jsonl");
  ensureDir(path.dirname(auditPath));
  const row = {
    ts: new Date().toISOString(),
    ...event
  };
  fs.appendFileSync(auditPath, `${JSON.stringify(row)}\n`);
}

function normalizeConfig(options = {}) {
  const dataDir = path.resolve(options.dataDir || process.env.TURBALANCE_DATA_DIR || path.join(__dirname, "..", ".turbalance-data"));
  const uploadSecret = options.uploadSecret || process.env.TURBALANCE_UPLOAD_SECRET || "dev-upload-secret-change-me";
  const tokens = parseTenantTokens(options.tenantTokens || process.env.TURBALANCE_TENANT_TOKENS || "demo:dev-token");

  return {
    dataDir,
    uploadSecret,
    tokens,
    retentionDays: Number(options.retentionDays || process.env.TURBALANCE_RETENTION_DAYS || 30),
    maxUploadsPerTenant: Number(options.maxUploadsPerTenant || process.env.TURBALANCE_MAX_UPLOADS_PER_TENANT || 200),
    maxUploadBytes: Number(options.maxUploadBytes || process.env.TURBALANCE_MAX_UPLOAD_BYTES || DEFAULT_MAX_UPLOAD_BYTES),
    corsOrigin: options.corsOrigin || process.env.TURBALANCE_CORS_ORIGIN || "*"
  };
}

function parseTenantTokens(value) {
  const tokens = new Map();
  String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const [tenantId, token, role = "ingest"] = entry.split(":");
      if (!sanitizeSegment(tenantId) || !token) return;
      tokens.set(token, { tenantId: sanitizeSegment(tenantId), role });
    });
  return tokens;
}

function signUpload(config, { tenantId, uploadId, expires, sha256 }) {
  return crypto
    .createHmac("sha256", config.uploadSecret)
    .update(`${tenantId}:${uploadId}:${expires}:${sha256 || ""}`)
    .digest("hex");
}

function readJsonBody(req, limit) {
  return readBody(req, limit).then((body) => {
    try {
      return JSON.parse(body.toString("utf8") || "{}");
    } catch (error) {
      error.statusCode = 400;
      error.publicError = "invalid_json";
      throw error;
    }
  });
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        const error = new Error("request body too large");
        error.statusCode = 413;
        error.publicError = "payload_too_large";
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function writeJson(res, statusCode, body, config) {
  writeResponse(res, statusCode, body ? `${JSON.stringify(body, null, 2)}\n` : "", config, "application/json; charset=utf-8");
}

function writeResponse(res, statusCode, body, config, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "access-control-allow-origin": config.corsOrigin,
    "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,x-turbalance-tenant",
    "content-type": contentType
  });
  res.end(body || "");
}

function tenantUploadDir(config, tenantId) {
  return path.join(config.dataDir, "tenants", sanitizeSegment(tenantId), "uploads");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function tokenFingerprint(token) {
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 12);
}

function sanitizeSegment(value) {
  const segment = stringValue(value);
  return /^[A-Za-z0-9_.-]+$/.test(segment) ? segment : "";
}

function stringValue(value) {
  return String(value || "").trim();
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

if (require.main === module) {
  const port = Number(process.env.PORT || process.env.TURBALANCE_INGEST_PORT || 8787);
  const host = process.env.TURBALANCE_INGEST_HOST || "127.0.0.1";
  const server = createIngestionServer();
  server.listen(port, host, () => {
    process.stdout.write(`turbalance ingestion server listening on http://${host}:${port}\n`);
  });
}

module.exports = {
  applyRetention,
  createIngestionServer,
  parseTenantTokens,
  signUpload
};
