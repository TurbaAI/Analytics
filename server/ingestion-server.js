#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");
const { validateSourceBundle } = require("../lib/source-bundle-validator.js");
const { authenticateJwtWithJwks, loadJwks, parseMapping } = require("./ingestion-oidc.js");
const { createFileStorage } = require("./ingestion-storage.js");

const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ROLE_PERMISSIONS = {
  admin: ["*"],
  operator: ["upload:sign", "ingest:write", "audit:read", "audit:export", "retention:run", "metrics:read"],
  ingest: ["upload:sign", "ingest:write"],
  viewer: ["audit:read", "audit:export", "metrics:read"]
};
const DEFAULT_ROLE = "ingest";

function createIngestionServer(options = {}) {
  const config = normalizeConfig(options);

  config.storage.initialize();
  applyRetention(config);
  const retentionTimer = startRetentionScheduler(config);

  const server = http.createServer(async (req, res) => {
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
          retentionIntervalSeconds: config.retentionIntervalSeconds,
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

      if (req.method === "GET" && requestUrl.pathname === "/v1/audit/export") {
        return await handleAuditExport(req, res, requestUrl, requestId, config);
      }

      if (req.method === "GET" && requestUrl.pathname === "/metrics") {
        return await handleMetricsRead(req, res, requestId, config);
      }

      if (req.method === "POST" && requestUrl.pathname === "/v1/retention/run") {
        return await handleRetentionRun(req, res, requestId, config);
      }

      if (req.method === "GET" && requestUrl.pathname === "/v1/tenants") {
        return await handleTenantList(req, res, requestId, config);
      }

      if (req.method === "POST" && requestUrl.pathname === "/v1/tenants") {
        return await handleTenantUpsert(req, res, requestId, config);
      }

      if (req.method === "POST" && requestUrl.pathname === "/v1/tokens/rotate") {
        return await handleTokenRotate(req, res, requestId, config);
      }

      if (req.method === "POST" && requestUrl.pathname === "/v1/upload-keys/rotate") {
        return await handleUploadKeyRotate(req, res, requestId, config);
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

  if (retentionTimer) {
    server.on("close", () => clearInterval(retentionTimer));
  }

  return server;
}

async function handleSignUpload(req, res, requestId, config) {
  const auth = await requireAuth(req, res, requestId, config, "upload:sign");
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
  const keyId = config.activeUploadKeyId;
  const signature = signUpload(config, { tenantId, uploadId, expires, sha256, keyId });
  const query = new URLSearchParams({
    tenant: tenantId,
    expires: String(expires),
    kid: keyId,
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
    keyId,
    expiresAt: new Date(expires * 1000).toISOString()
  });

  writeJson(res, 200, {
    ok: true,
    requestId,
    tenantId,
    uploadId,
    keyId,
    method: "PUT",
    expiresAt: new Date(expires * 1000).toISOString(),
    uploadUrl: `/v1/uploads/${uploadId}?${query.toString()}`
  }, config);
}

async function handleSignedUpload(req, res, requestUrl, requestId, config) {
  const uploadId = sanitizeSegment(requestUrl.pathname.split("/").pop());
  const tenantId = sanitizeSegment(requestUrl.searchParams.get("tenant"));
  const expires = Number(requestUrl.searchParams.get("expires"));
  const keyId = sanitizeSegment(requestUrl.searchParams.get("kid")) || config.activeUploadKeyId;
  const signature = stringValue(requestUrl.searchParams.get("signature"));
  const sha256 = stringValue(requestUrl.searchParams.get("sha256"));

  if (!uploadId || !tenantId || !keyId || !Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) {
    await audit(config, { requestId, event: "upload.signed.denied", status: "expired_or_invalid", tenantId, uploadId, keyId });
    return writeJson(res, 401, { ok: false, error: "signed_upload_expired_or_invalid", requestId }, config);
  }

  const expected = signUpload(config, { tenantId, uploadId, expires, sha256, keyId });
  if (!safeEqual(signature, expected)) {
    await audit(config, { requestId, event: "upload.signed.denied", status: "bad_signature", tenantId, uploadId, keyId });
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
  const auth = await requireAuth(req, res, requestId, config, "ingest:write");
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
  const auth = await requireAuth(req, res, requestId, config, "audit:read");
  if (!auth) return;

  const requestedTenant = sanitizeSegment(requestUrl.searchParams.get("tenant"));
  const tenantId = auth.role === "admin" ? requestedTenant : auth.tenantId;
  const limit = clampNumber(requestUrl.searchParams.get("limit"), 1, 500, 100);
  const rows = readAuditRows(config, { tenantId, limit });

  await audit(config, { requestId, event: "audit.read", status: "ok", actor: auth.actor, tenantId: tenantId || "all", limit });
  writeJson(res, 200, { ok: true, requestId, tenantId: tenantId || "all", rows }, config);
}

async function handleAuditExport(req, res, requestUrl, requestId, config) {
  const auth = await requireAuth(req, res, requestId, config, "audit:export");
  if (!auth) return;

  const requestedTenant = sanitizeSegment(requestUrl.searchParams.get("tenant"));
  const tenantId = auth.role === "admin" ? requestedTenant : auth.tenantId;
  const limit = clampNumber(requestUrl.searchParams.get("limit"), 1, 10000, 1000);
  const format = stringValue(requestUrl.searchParams.get("format") || "jsonl").toLowerCase();
  const rows = readAuditRows(config, { tenantId, limit }).slice().reverse();

  await audit(config, { requestId, event: "audit.export", status: "ok", actor: auth.actor, tenantId: tenantId || "all", format, limit });

  if (format === "json") {
    return writeJson(res, 200, { ok: true, requestId, tenantId: tenantId || "all", rows }, config);
  }

  if (format === "csv") {
    return writeResponse(res, 200, auditRowsToCsv(rows), config, "text/csv; charset=utf-8");
  }

  writeResponse(res, 200, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, config, "application/x-ndjson; charset=utf-8");
}

async function handleMetricsRead(req, res, requestId, config) {
  const auth = await requireAuth(req, res, requestId, config, "metrics:read");
  if (!auth) return;

  await audit(config, { requestId, event: "metrics.read", status: "ok", actor: auth.actor, tenantId: auth.role === "admin" ? "all" : auth.tenantId });
  writeResponse(res, 200, metricsText(config), config, "text/plain; version=0.0.4; charset=utf-8");
}

async function handleRetentionRun(req, res, requestId, config) {
  const auth = await requireAuth(req, res, requestId, config, "retention:run");
  if (!auth) return;

  const result = applyRetention(config, { tenantId: auth.role === "admin" ? undefined : auth.tenantId });
  await audit(config, { requestId, event: "retention.run", status: "ok", actor: auth.actor, tenantId: auth.role === "admin" ? "all" : auth.tenantId, deleted: result.deleted.length });
  writeJson(res, 200, { ok: true, requestId, ...result }, config);
}

async function handleTenantList(req, res, requestId, config) {
  const auth = await requireAuth(req, res, requestId, config, "tenant:manage");
  if (!auth) return;

  const tenants = tenantList(config).map((tenant) => ({
    ...tenant,
    tokenCount: tokenSummaries(config, tenant.tenantId).length,
    tokens: tokenSummaries(config, tenant.tenantId)
  }));

  await audit(config, { requestId, event: "tenant.list", status: "ok", actor: auth.actor, tenantId: "all", count: tenants.length });
  writeJson(res, 200, { ok: true, requestId, tenants }, config);
}

async function handleTenantUpsert(req, res, requestId, config) {
  const auth = await requireAuth(req, res, requestId, config, "tenant:manage");
  if (!auth) return;

  const body = await readJsonBody(req, config.maxUploadBytes);
  const tenant = upsertTenant(config, {
    tenantId: body.tenantId,
    displayName: body.displayName,
    status: body.status,
    retentionDays: body.retentionDays,
    maxUploadsPerTenant: body.maxUploadsPerTenant
  }, auth.actor);

  await audit(config, { requestId, event: "tenant.upsert", status: "ok", actor: auth.actor, tenantId: tenant.tenantId });
  writeJson(res, 200, { ok: true, requestId, tenant }, config);
}

async function handleTokenRotate(req, res, requestId, config) {
  const auth = await requireAuth(req, res, requestId, config, "key:rotate");
  if (!auth) return;

  const body = await readJsonBody(req, config.maxUploadBytes);
  const tenantId = sanitizeSegment(body.tenantId);
  if (!tenantId) {
    return writeJson(res, 400, { ok: false, error: "tenant_id_required", requestId }, config);
  }

  ensureTenant(config, tenantId, auth.actor);
  const token = stringValue(body.token) || crypto.randomBytes(24).toString("base64url");
  const role = normalizeRole(body.role || DEFAULT_ROLE);
  const subject = stringValue(body.subject || `${role}-token`);
  const account = registerToken(config, {
    token,
    tenantId,
    role,
    subject,
    source: "control"
  });
  persistControlTokens(config);

  await audit(config, {
    requestId,
    event: "token.rotate",
    status: "ok",
    actor: auth.actor,
    tenantId,
    role,
    subject,
    tokenFingerprint: account.tokenFingerprint
  });

  writeJson(res, 200, {
    ok: true,
    requestId,
    tenantId,
    role,
    subject,
    token,
    tokenFingerprint: account.tokenFingerprint
  }, config);
}

async function handleUploadKeyRotate(req, res, requestId, config) {
  const auth = await requireAuth(req, res, requestId, config, "key:rotate");
  if (!auth) return;

  const body = await readJsonBody(req, config.maxUploadBytes);
  const keyId = sanitizeSegment(body.keyId) || `key-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex")}`;
  const secret = stringValue(body.secret) || crypto.randomBytes(32).toString("base64url");
  const activate = body.activate !== false;

  config.uploadKeys.set(keyId, {
    keyId,
    secret,
    createdAt: new Date().toISOString(),
    source: "control"
  });
  if (activate) {
    config.activeUploadKeyId = keyId;
  }
  persistUploadKeys(config);

  await audit(config, { requestId, event: "upload_key.rotate", status: "ok", actor: auth.actor, tenantId: "all", keyId, active: activate });
  writeJson(res, 200, {
    ok: true,
    requestId,
    keyId,
    activeUploadKeyId: config.activeUploadKeyId,
    secret
  }, config);
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
  return config.storage.writeUpload({
    tenantId,
    uploadId,
    raw,
    metadata: {
      tenantId,
      uploadId,
      source,
      storedAt: new Date().toISOString(),
      sha256: sha256Hex(raw),
      bytes: raw.length,
      schemaVersion: payload.schemaVersion || payload.ingestion?.schemaVersion || "source-bundle"
    }
  });
}

async function requireAuth(req, res, requestId, config, permission) {
  const header = stringValue(req.headers.authorization);
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  const account = await authenticateToken(token, config);

  if (!account) {
    await audit(config, { requestId, event: "auth.failure", status: "denied", actor: "anonymous" });
    writeJson(res, 401, { ok: false, error: "unauthorized", requestId }, config);
    return null;
  }

  if (!tenantIsActive(config, account.tenantId) && account.role !== "admin") {
    await audit(config, { requestId, event: "auth.tenant_disabled", status: "denied", actor: account.actor, tenantId: account.tenantId });
    writeJson(res, 403, { ok: false, error: "tenant_disabled", requestId }, config);
    return null;
  }

  if (permission && !hasPermission(account.role, permission)) {
    await audit(config, { requestId, event: "auth.forbidden", status: "denied", actor: account.actor, tenantId: account.tenantId, role: account.role, permission });
    writeJson(res, 403, { ok: false, error: "forbidden", requestId }, config);
    return null;
  }

  return account;
}

function tenantForRequest(auth, requestedTenant) {
  const tenantId = sanitizeSegment(requestedTenant || auth.tenantId);
  if (!tenantId) return "";
  if (auth.role === "admin") return tenantId;
  return tenantId === auth.tenantId ? tenantId : "";
}

function applyRetention(config, options = {}) {
  const deleted = [];
  const tenants = Array.from(new Set([...config.storage.listTenantsWithUploads(), ...config.tenants.keys()]))
    .filter((tenantId) => !options.tenantId || tenantId === options.tenantId);

  tenants.forEach((tenantId) => {
    const policy = retentionPolicyForTenant(config, tenantId);
    const cutoff = Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000;
    const files = config.storage.listTenantUploads(tenantId);

    files.forEach((entry, index) => {
      if (entry.mtimeMs >= cutoff && index < policy.maxUploadsPerTenant) return;
      deleted.push(...config.storage.deleteUpload(entry));
    });
  });

  return { deleted };
}

function readAuditRows(config, { tenantId, limit }) {
  return config.storage.readAuditRows({ tenantId, limit });
}

async function audit(config, event) {
  observeEvent(config, event);
  config.storage.appendAudit({
    ts: new Date().toISOString(),
    ...event
  });
}

function normalizeConfig(options = {}) {
  const dataDir = path.resolve(options.dataDir || process.env.TURBALANCE_DATA_DIR || path.join(__dirname, "..", ".turbalance-data"));
  const storage = options.storage || createFileStorage({ dataDir });
  storage.initialize();
  const persistedUploadKeys = readControlArray(storage, "upload-keys");
  const uploadKeys = parseUploadKeys({
    uploadKeys: options.uploadKeys,
    uploadSecret: options.uploadSecret,
    persistedUploadKeys
  });
  const activeUploadKeyId = activeUploadKeyIdFor(options, uploadKeys, persistedUploadKeys);
  const tokens = new Map();
  mergeTokenMap(tokens, parseTenantTokens(options.tenantTokens || process.env.TURBALANCE_TENANT_TOKENS || "demo:dev-token"));
  mergeTokenMap(tokens, tokensFromControlRecords(readControlArray(storage, "tokens")));
  const tenants = loadTenantRegistry(storage, tokens, options.tenants);
  const metrics = createMetrics();

  return {
    dataDir,
    storage,
    uploadKeys,
    activeUploadKeyId,
    tokens,
    tenants,
    jwtSecret: options.jwtSecret || process.env.TURBALANCE_JWT_SECRET || "",
    jwtIssuer: options.jwtIssuer || process.env.TURBALANCE_JWT_ISSUER || "",
    jwtAudience: options.jwtAudience || process.env.TURBALANCE_JWT_AUDIENCE || "",
    jwtJwks: loadJwks({ jwks: options.jwtJwks, jwksPath: options.jwtJwksPath }),
    jwtJwksUrl: options.jwtJwksUrl || process.env.TURBALANCE_JWT_JWKS_URL || "",
    jwtJwksCacheMs: Number(options.jwtJwksCacheMs || process.env.TURBALANCE_JWT_JWKS_CACHE_MS || 5 * 60 * 1000),
    jwtTenantClaim: options.jwtTenantClaim || process.env.TURBALANCE_JWT_TENANT_CLAIM || "",
    jwtRoleClaim: options.jwtRoleClaim || process.env.TURBALANCE_JWT_ROLE_CLAIM || "",
    jwtSubjectClaim: options.jwtSubjectClaim || process.env.TURBALANCE_JWT_SUBJECT_CLAIM || "",
    jwtTenantMap: parseMapping(options.jwtTenantMap || process.env.TURBALANCE_JWT_TENANT_MAP),
    jwtRoleMap: parseMapping(options.jwtRoleMap || process.env.TURBALANCE_JWT_ROLE_MAP),
    jwtJwksCache: null,
    metrics,
    retentionDays: Number(options.retentionDays || process.env.TURBALANCE_RETENTION_DAYS || 30),
    retentionIntervalSeconds: Number(options.retentionIntervalSeconds || process.env.TURBALANCE_RETENTION_INTERVAL_SECONDS || 0),
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
      const [tenantId, token, role = DEFAULT_ROLE, subject = `${normalizeRole(role)}-token`] = entry.split(":");
      if (!sanitizeSegment(tenantId) || !token) return;
      const account = tokenAccount({
        token,
        tenantId,
        role,
        subject,
        source: "env"
      });
      tokens.set(account.tokenHash, account);
    });
  return tokens;
}

function parseUploadKeys({ uploadKeys, uploadSecret, persistedUploadKeys }) {
  const keys = new Map();
  const envKeys = process.env.TURBALANCE_UPLOAD_SECRETS;

  addUploadKey(keys, "default", uploadSecret || process.env.TURBALANCE_UPLOAD_SECRET || "dev-upload-secret-change-me", "fallback");

  if (uploadKeys instanceof Map) {
    uploadKeys.forEach((value, keyId) => addUploadKey(keys, keyId, typeof value === "string" ? value : value?.secret, "option"));
  } else if (Array.isArray(uploadKeys)) {
    uploadKeys.forEach((entry) => addUploadKey(keys, entry.keyId, entry.secret, "option"));
  } else if (uploadKeys && typeof uploadKeys === "object") {
    Object.entries(uploadKeys).forEach(([keyId, secret]) => addUploadKey(keys, keyId, secret, "option"));
  }

  String(envKeys || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const [keyId, secret] = entry.split(":");
      addUploadKey(keys, keyId, secret, "env");
    });

  persistedUploadKeys.forEach((entry) => addUploadKey(keys, entry.keyId, entry.secret, "control", entry.createdAt));

  return keys;
}

function addUploadKey(keys, keyId, secret, source, createdAt = new Date().toISOString()) {
  const safeKeyId = sanitizeSegment(keyId);
  const value = stringValue(secret);
  if (!safeKeyId || !value) return;
  keys.set(safeKeyId, {
    keyId: safeKeyId,
    secret: value,
    createdAt,
    source
  });
}

function activeUploadKeyIdFor(options, uploadKeys, persistedUploadKeys) {
  const requested = sanitizeSegment(options.activeUploadKeyId || process.env.TURBALANCE_ACTIVE_UPLOAD_KEY_ID);
  if (requested && uploadKeys.has(requested)) return requested;
  const persistedActive = persistedUploadKeys.find((entry) => entry.active && uploadKeys.has(entry.keyId));
  if (persistedActive) return persistedActive.keyId;
  return Array.from(uploadKeys.keys()).at(-1) || "default";
}

function signUpload(config, { tenantId, uploadId, expires, sha256, keyId }) {
  const selectedKeyId = sanitizeSegment(keyId) || config.activeUploadKeyId;
  const key = config.uploadKeys.get(selectedKeyId);
  if (!key) return "";
  return crypto
    .createHmac("sha256", key.secret)
    .update(`${selectedKeyId}:${tenantId}:${uploadId}:${expires}:${sha256 || ""}`)
    .digest("hex");
}

async function authenticateToken(token, config) {
  if (!token) return null;
  const tokenHashValue = hashToken(token);
  const account = config.tokens.get(tokenHashValue);
  if (account) return accountWithActor(account);
  return await authenticateJwt(token, config);
}

async function authenticateJwt(token, config) {
  let jwksAccount = null;
  try {
    jwksAccount = await authenticateJwtWithJwks(token, config);
  } catch {
    jwksAccount = null;
  }
  if (jwksAccount) return accountWithActor(jwksAccount);
  if (!config.jwtSecret || token.split(".").length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = token.split(".");

  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (header.alg !== "HS256") return null;

  const expected = crypto
    .createHmac("sha256", config.jwtSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");
  if (!safeEqual(signature, expected)) return null;
  if (payload.exp && Number(payload.exp) < Math.floor(Date.now() / 1000)) return null;
  if (config.jwtIssuer && payload.iss !== config.jwtIssuer) return null;
  if (config.jwtAudience && !jwtAudienceMatches(payload.aud, config.jwtAudience)) return null;

  const tenantId = sanitizeSegment(payload.tenantId || payload.tenant || payload["https://turbalance.ai/tenant"]);
  if (!tenantId) return null;
  const role = normalizeRole(payload.role || payload["https://turbalance.ai/role"] || "viewer");
  const subject = stringValue(payload.sub || payload.email || "jwt-subject");

  return accountWithActor({
    tenantId,
    role,
    subject,
    source: "jwt",
    tokenHash: hashToken(token),
    tokenFingerprint: tokenFingerprint(token),
    createdAt: new Date(0).toISOString()
  });
}

function jwtAudienceMatches(actual, expected) {
  if (Array.isArray(actual)) return actual.includes(expected);
  return stringValue(actual) === expected;
}

function tokenAccount({ token, tenantId, role, subject, source, createdAt = new Date().toISOString() }) {
  const safeTenantId = sanitizeSegment(tenantId);
  const tokenHashValue = hashToken(token);
  return {
    tenantId: safeTenantId,
    role: normalizeRole(role),
    subject: stringValue(subject || `${normalizeRole(role)}-token`),
    source,
    tokenHash: tokenHashValue,
    tokenFingerprint: tokenHashValue.slice(0, 12),
    createdAt
  };
}

function accountWithActor(account) {
  return {
    ...account,
    actor: `${account.tenantId}:${account.subject || account.role}:${account.tokenFingerprint || String(account.tokenHash || "").slice(0, 12)}`
  };
}

function registerToken(config, token) {
  const account = tokenAccount(token);
  config.tokens.set(account.tokenHash, account);
  return account;
}

function tokensFromControlRecords(records) {
  const tokens = new Map();
  records.forEach((record) => {
    const tenantId = sanitizeSegment(record.tenantId);
    const tokenHashValue = stringValue(record.tokenHash);
    if (!tenantId || !tokenHashValue || record.revokedAt) return;
    tokens.set(tokenHashValue, {
      tenantId,
      role: normalizeRole(record.role),
      subject: stringValue(record.subject || `${normalizeRole(record.role)}-token`),
      source: "control",
      tokenHash: tokenHashValue,
      tokenFingerprint: stringValue(record.tokenFingerprint) || tokenHashValue.slice(0, 12),
      createdAt: stringValue(record.createdAt) || new Date().toISOString()
    });
  });
  return tokens;
}

function mergeTokenMap(target, source) {
  source.forEach((value, key) => target.set(key, value));
}

function persistControlTokens(config) {
  const records = Array.from(config.tokens.values())
    .filter((account) => account.source === "control")
    .map((account) => ({
      tenantId: account.tenantId,
      role: account.role,
      subject: account.subject,
      tokenHash: account.tokenHash,
      tokenFingerprint: account.tokenFingerprint,
      createdAt: account.createdAt
    }))
    .sort((a, b) => `${a.tenantId}:${a.subject}`.localeCompare(`${b.tenantId}:${b.subject}`));
  config.storage.writeControlJson("tokens", records);
}

function persistUploadKeys(config) {
  const records = Array.from(config.uploadKeys.values())
    .filter((key) => key.source === "control")
    .map((key) => ({
      keyId: key.keyId,
      secret: key.secret,
      createdAt: key.createdAt,
      active: key.keyId === config.activeUploadKeyId
    }))
    .sort((a, b) => a.keyId.localeCompare(b.keyId));
  config.storage.writeControlJson("upload-keys", records);
}

function loadTenantRegistry(storage, tokens, optionTenants) {
  const tenants = new Map();
  [
    ...readControlArray(storage, "tenants"),
    ...tenantOptionRecords(optionTenants)
  ].forEach((record) => {
    const tenantId = sanitizeSegment(record.tenantId);
    if (!tenantId) return;
    tenants.set(tenantId, normalizeTenantRecord({ ...record, tenantId }));
  });

  tokens.forEach((account) => {
    if (!tenants.has(account.tenantId)) {
      tenants.set(account.tenantId, normalizeTenantRecord({ tenantId: account.tenantId }));
    }
  });

  return tenants;
}

function tenantOptionRecords(optionTenants) {
  if (!optionTenants) return [];
  if (Array.isArray(optionTenants)) return optionTenants;
  return Object.entries(optionTenants).map(([tenantId, value]) => ({ tenantId, ...(value || {}) }));
}

function normalizeTenantRecord(record) {
  const now = new Date().toISOString();
  return {
    tenantId: sanitizeSegment(record.tenantId),
    displayName: stringValue(record.displayName || record.tenantId),
    status: record.status === "disabled" ? "disabled" : "active",
    retentionDays: optionalNumber(record.retentionDays),
    maxUploadsPerTenant: optionalNumber(record.maxUploadsPerTenant),
    createdAt: stringValue(record.createdAt) || now,
    updatedAt: stringValue(record.updatedAt) || now,
    updatedBy: stringValue(record.updatedBy)
  };
}

function upsertTenant(config, input, actor) {
  const tenantId = sanitizeSegment(input.tenantId);
  if (!tenantId) throw clientError("tenant_id_required", 400);
  const existing = config.tenants.get(tenantId) || normalizeTenantRecord({ tenantId });
  const updated = normalizeTenantRecord({
    ...existing,
    ...input,
    tenantId,
    retentionDays: input.retentionDays === undefined ? existing.retentionDays : input.retentionDays,
    maxUploadsPerTenant: input.maxUploadsPerTenant === undefined ? existing.maxUploadsPerTenant : input.maxUploadsPerTenant,
    updatedAt: new Date().toISOString(),
    updatedBy: actor
  });
  config.tenants.set(tenantId, updated);
  persistTenantRegistry(config);
  return updated;
}

function ensureTenant(config, tenantId, actor) {
  if (config.tenants.has(tenantId)) return config.tenants.get(tenantId);
  const tenant = normalizeTenantRecord({ tenantId, updatedBy: actor });
  config.tenants.set(tenantId, tenant);
  persistTenantRegistry(config);
  return tenant;
}

function persistTenantRegistry(config) {
  const records = tenantList(config);
  config.storage.writeControlJson("tenants", records);
}

function tenantList(config) {
  return Array.from(config.tenants.values())
    .sort((a, b) => a.tenantId.localeCompare(b.tenantId));
}

function tenantIsActive(config, tenantId) {
  const tenant = config.tenants.get(tenantId);
  return !tenant || tenant.status !== "disabled";
}

function retentionPolicyForTenant(config, tenantId) {
  const tenant = config.tenants.get(tenantId) || {};
  return {
    retentionDays: Number.isFinite(Number(tenant.retentionDays)) ? Number(tenant.retentionDays) : config.retentionDays,
    maxUploadsPerTenant: Number.isFinite(Number(tenant.maxUploadsPerTenant)) ? Number(tenant.maxUploadsPerTenant) : config.maxUploadsPerTenant
  };
}

function tokenSummaries(config, tenantId) {
  return Array.from(config.tokens.values())
    .filter((account) => account.tenantId === tenantId)
    .map((account) => ({
      role: account.role,
      subject: account.subject,
      source: account.source,
      tokenFingerprint: account.tokenFingerprint,
      createdAt: account.createdAt
    }))
    .sort((a, b) => `${a.role}:${a.subject}`.localeCompare(`${b.role}:${b.subject}`));
}

function hasPermission(role, permission) {
  const permissions = ROLE_PERMISSIONS[normalizeRole(role)] || [];
  return permissions.includes("*") || permissions.includes(permission);
}

function normalizeRole(role) {
  const value = stringValue(role || DEFAULT_ROLE).toLowerCase();
  return ROLE_PERMISSIONS[value] ? value : DEFAULT_ROLE;
}

function readControlArray(storage, name) {
  const value = storage.readControlJson(name, []);
  return Array.isArray(value) ? value : [];
}

function startRetentionScheduler(config) {
  if (!Number.isFinite(config.retentionIntervalSeconds) || config.retentionIntervalSeconds <= 0) return null;
  const timer = setInterval(() => {
    const result = applyRetention(config);
    audit(config, {
      event: "retention.scheduled",
      status: "ok",
      actor: "system:retention-scheduler",
      tenantId: "all",
      deleted: result.deleted.length
    });
  }, config.retentionIntervalSeconds * 1000);
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}

function createMetrics() {
  return {
    authFailuresTotal: 0,
    authForbiddenTotal: 0,
    ingestAcceptedTotal: 0,
    ingestRejectedTotal: 0,
    signedUploadDeniedTotal: 0,
    auditExportsTotal: 0,
    retentionRunsTotal: 0,
    retentionScheduledRunsTotal: 0,
    retentionDeletedFilesTotal: 0,
    tenantChangesTotal: 0,
    tokenRotationsTotal: 0,
    uploadKeyRotationsTotal: 0,
    lastRetentionRunUnixSeconds: 0
  };
}

function observeEvent(config, event) {
  if (!config.metrics) return;

  if (event.event === "auth.failure") config.metrics.authFailuresTotal += 1;
  if (event.event === "auth.forbidden" || event.event === "auth.tenant_disabled") config.metrics.authForbiddenTotal += 1;
  if (event.event === "ingest.accepted") config.metrics.ingestAcceptedTotal += 1;
  if (event.event === "ingest.rejected") config.metrics.ingestRejectedTotal += 1;
  if (event.event === "upload.signed.denied") config.metrics.signedUploadDeniedTotal += 1;
  if (event.event === "audit.export") config.metrics.auditExportsTotal += 1;
  if (event.event === "tenant.upsert") config.metrics.tenantChangesTotal += 1;
  if (event.event === "token.rotate") config.metrics.tokenRotationsTotal += 1;
  if (event.event === "upload_key.rotate") config.metrics.uploadKeyRotationsTotal += 1;
  if (event.event === "retention.run" || event.event === "retention.scheduled") {
    config.metrics.retentionRunsTotal += 1;
    config.metrics.retentionDeletedFilesTotal += Number(event.deleted || 0);
    config.metrics.lastRetentionRunUnixSeconds = Math.floor(Date.now() / 1000);
  }
  if (event.event === "retention.scheduled") config.metrics.retentionScheduledRunsTotal += 1;
}

function metricsText(config) {
  const metricRows = [
    ["turbalance_auth_failures_total", "counter", "Authentication failures.", config.metrics.authFailuresTotal],
    ["turbalance_auth_forbidden_total", "counter", "Authenticated requests denied by tenant or role policy.", config.metrics.authForbiddenTotal],
    ["turbalance_ingest_accepted_total", "counter", "Accepted ingestion payloads.", config.metrics.ingestAcceptedTotal],
    ["turbalance_ingest_rejected_total", "counter", "Rejected ingestion payloads.", config.metrics.ingestRejectedTotal],
    ["turbalance_signed_upload_denied_total", "counter", "Denied signed upload attempts.", config.metrics.signedUploadDeniedTotal],
    ["turbalance_audit_exports_total", "counter", "Audit export requests.", config.metrics.auditExportsTotal],
    ["turbalance_retention_runs_total", "counter", "Manual and scheduled retention runs.", config.metrics.retentionRunsTotal],
    ["turbalance_retention_scheduled_runs_total", "counter", "Scheduled retention runs.", config.metrics.retentionScheduledRunsTotal],
    ["turbalance_retention_deleted_files_total", "counter", "Files deleted by retention.", config.metrics.retentionDeletedFilesTotal],
    ["turbalance_tenant_changes_total", "counter", "Tenant registry changes.", config.metrics.tenantChangesTotal],
    ["turbalance_token_rotations_total", "counter", "Tenant token rotation events.", config.metrics.tokenRotationsTotal],
    ["turbalance_upload_key_rotations_total", "counter", "Signed upload key rotation events.", config.metrics.uploadKeyRotationsTotal],
    ["turbalance_last_retention_run_unix_seconds", "gauge", "Unix timestamp of the last retention run.", config.metrics.lastRetentionRunUnixSeconds],
    ["turbalance_configured_tenants", "gauge", "Configured tenants in the local control plane.", config.tenants.size],
    ["turbalance_configured_tokens", "gauge", "Configured bearer tokens in the local control plane.", config.tokens.size],
    ["turbalance_upload_signing_keys", "gauge", "Configured signed upload HMAC keys.", config.uploadKeys.size]
  ];

  return metricRows.map(([name, type, help, value]) => [
    `# HELP ${name} ${help}`,
    `# TYPE ${name} ${type}`,
    `${name} ${Number(value || 0)}`
  ].join("\n")).join("\n") + "\n";
}

function auditRowsToCsv(rows) {
  const columns = ["ts", "event", "status", "tenantId", "actor", "requestId", "role", "permission", "uploadId", "source", "storageKey", "deleted", "message"];
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))
  ].join("\n") + "\n";
}

function csvEscape(value) {
  if (value === undefined || value === null) return "";
  const text = Array.isArray(value) ? value.join("|") : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function clientError(error, statusCode) {
  const result = new Error(error);
  result.statusCode = statusCode;
  result.publicError = error;
  return result;
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

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function tokenFingerprint(token) {
  return hashToken(token).slice(0, 12);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
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

function optionalNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
  createIngestionConfig: normalizeConfig,
  createIngestionServer,
  parseTenantTokens,
  signUpload
};
