"use strict";

const fs = require("node:fs");
const path = require("node:path");

function createStorageFromEnv(options = {}) {
  if (options.storage) return options.storage;

  const dataDir = path.resolve(options.dataDir || process.env.TURBALANCE_DATA_DIR || path.join(__dirname, "..", ".turbalance-data"));
  const mode = String(options.storageMode || process.env.TURBALANCE_STORAGE_MODE || "file").toLowerCase();

  if (mode === "object-sqlite" || mode === "object+sqlite") {
    return createObjectDatabaseStorage({
      dataDir,
      objectDir: options.objectDir || process.env.TURBALANCE_OBJECT_DIR,
      bucketName: options.bucketName || process.env.TURBALANCE_OBJECT_BUCKET,
      dbPath: options.dbPath || process.env.TURBALANCE_CONTROL_DB
    });
  }

  return createFileStorage({ dataDir });
}

function createFileStorage({ dataDir }) {
  const rootDir = path.resolve(dataDir);
  const auditDir = path.join(rootDir, "audit");
  const controlDir = path.join(rootDir, "control");

  return {
    dataDir: rootDir,

    initialize() {
      ensureDir(rootDir);
      ensureDir(auditDir);
      ensureDir(controlDir);
    },

    writeUpload({ tenantId, uploadId, raw, metadata }) {
      const tenantDir = path.join(rootDir, "tenants", sanitizeSegment(tenantId), "uploads");
      ensureDir(tenantDir);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const baseName = `${stamp}-${sanitizeSegment(uploadId)}`;
      const storageKey = `tenants/${sanitizeSegment(tenantId)}/uploads/${baseName}.json`;
      const fullPath = path.join(rootDir, storageKey);
      const metaPath = path.join(rootDir, `tenants/${sanitizeSegment(tenantId)}/uploads/${baseName}.meta.json`);

      fs.writeFileSync(`${fullPath}.tmp`, raw);
      fs.renameSync(`${fullPath}.tmp`, fullPath);
      fs.writeFileSync(metaPath, `${JSON.stringify(metadata, null, 2)}\n`);

      return { storageKey, fullPath, metaPath };
    },

    listTenantUploads(tenantId) {
      const uploadDir = path.join(rootDir, "tenants", sanitizeSegment(tenantId), "uploads");
      if (!fs.existsSync(uploadDir)) return [];

      return fs.readdirSync(uploadDir)
        .filter((file) => file.endsWith(".json") && !file.endsWith(".meta.json"))
        .map((file) => {
          const fullPath = path.join(uploadDir, file);
          return {
            file,
            fullPath,
            metaPath: fullPath.replace(/\.json$/, ".meta.json"),
            mtimeMs: fs.statSync(fullPath).mtimeMs
          };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
    },

    deleteUpload(entry) {
      const deleted = [];
      [entry.fullPath, entry.metaPath].forEach((target) => {
        if (fs.existsSync(target)) {
          fs.rmSync(target, { force: true });
          deleted.push(path.relative(rootDir, target));
        }
      });
      return deleted;
    },

    listTenantsWithUploads() {
      const tenantsDir = path.join(rootDir, "tenants");
      if (!fs.existsSync(tenantsDir)) return [];
      return fs.readdirSync(tenantsDir)
        .filter((tenantId) => fs.existsSync(path.join(tenantsDir, tenantId, "uploads")));
    },

    appendAudit(row) {
      const auditPath = path.join(auditDir, "audit.jsonl");
      ensureDir(path.dirname(auditPath));
      fs.appendFileSync(auditPath, `${JSON.stringify(row)}\n`);
    },

    readAuditRows({ tenantId, limit }) {
      const auditPath = path.join(auditDir, "audit.jsonl");
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
    },

    readControlJson(name, fallback) {
      const fullPath = path.join(controlDir, `${name}.json`);
      if (!fs.existsSync(fullPath)) return fallback;
      return JSON.parse(fs.readFileSync(fullPath, "utf8"));
    },

    writeControlJson(name, value) {
      const fullPath = path.join(controlDir, `${name}.json`);
      ensureDir(path.dirname(fullPath));
      fs.writeFileSync(`${fullPath}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
      fs.renameSync(`${fullPath}.tmp`, fullPath);
      return fullPath;
    }
  };
}

function createObjectDatabaseStorage({ dataDir, objectDir, bucketName = "turbalance-ingestion", dbPath }) {
  const rootDir = path.resolve(dataDir);
  const objectRoot = path.resolve(objectDir || path.join(rootDir, "objects"));
  const bucket = sanitizeSegment(bucketName) || "turbalance-ingestion";
  const databasePath = path.resolve(dbPath || path.join(rootDir, "control", "ingestion-control.sqlite"));
  let db;

  function database() {
    if (db) return db;
    const { DatabaseSync } = require("node:sqlite");
    ensureDir(path.dirname(databasePath));
    db = new DatabaseSync(databasePath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS control_json (
        name TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_rows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        tenant_id TEXT,
        event TEXT,
        row_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS uploads (
        storage_key TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        upload_id TEXT NOT NULL,
        object_key TEXT NOT NULL,
        full_path TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        mtime_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_rows_tenant_id ON audit_rows(tenant_id, id);
      CREATE INDEX IF NOT EXISTS idx_uploads_tenant_id ON uploads(tenant_id, mtime_ms);
    `);
    return db;
  }

  return {
    dataDir: rootDir,
    objectDir: objectRoot,
    bucketName: bucket,
    dbPath: databasePath,

    initialize() {
      ensureDir(rootDir);
      ensureDir(path.join(objectRoot, bucket));
      database();
    },

    writeUpload({ tenantId, uploadId, raw, metadata }) {
      const safeTenantId = sanitizeSegment(tenantId);
      const safeUploadId = sanitizeSegment(uploadId);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const objectKey = `tenants/${safeTenantId}/uploads/${stamp}-${safeUploadId}.json`;
      const storageKey = `object://${bucket}/${objectKey}`;
      const fullPath = path.join(objectRoot, bucket, objectKey);
      const meta = {
        ...metadata,
        storageMode: "object-sqlite",
        bucket,
        objectKey,
        controlDbPath: databasePath
      };

      ensureDir(path.dirname(fullPath));
      fs.writeFileSync(`${fullPath}.tmp`, raw);
      fs.renameSync(`${fullPath}.tmp`, fullPath);

      database().prepare(`
        INSERT OR REPLACE INTO uploads
          (storage_key, tenant_id, upload_id, object_key, full_path, meta_json, mtime_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(storageKey, safeTenantId, safeUploadId, objectKey, fullPath, JSON.stringify(meta), Date.now());

      return { storageKey, fullPath, metaPath: `${storageKey}.meta` };
    },

    listTenantUploads(tenantId) {
      return database().prepare(`
        SELECT storage_key, tenant_id, upload_id, object_key, full_path, meta_json, mtime_ms
        FROM uploads
        WHERE tenant_id = ?
        ORDER BY mtime_ms DESC
      `).all(sanitizeSegment(tenantId)).map((row) => ({
        file: path.basename(row.object_key),
        fullPath: row.full_path,
        metaPath: `${row.storage_key}.meta`,
        storageKey: row.storage_key,
        mtimeMs: row.mtime_ms,
        metadata: safeParseJson(row.meta_json, {})
      }));
    },

    deleteUpload(entry) {
      const deleted = [];
      if (entry.fullPath && fs.existsSync(entry.fullPath)) {
        fs.rmSync(entry.fullPath, { force: true });
        deleted.push(entry.storageKey || path.relative(rootDir, entry.fullPath));
      }
      if (entry.storageKey) {
        database().prepare("DELETE FROM uploads WHERE storage_key = ?").run(entry.storageKey);
      }
      return deleted;
    },

    listTenantsWithUploads() {
      return database().prepare("SELECT DISTINCT tenant_id FROM uploads ORDER BY tenant_id")
        .all()
        .map((row) => row.tenant_id);
    },

    appendAudit(row) {
      database().prepare(`
        INSERT INTO audit_rows (ts, tenant_id, event, row_json)
        VALUES (?, ?, ?, ?)
      `).run(row.ts || new Date().toISOString(), row.tenantId || null, row.event || null, JSON.stringify(row));
    },

    readAuditRows({ tenantId, limit }) {
      const rows = tenantId
        ? database().prepare("SELECT row_json FROM audit_rows WHERE tenant_id = ? ORDER BY id DESC LIMIT ?").all(sanitizeSegment(tenantId), limit)
        : database().prepare("SELECT row_json FROM audit_rows ORDER BY id DESC LIMIT ?").all(limit);

      return rows
        .map((row) => safeParseJson(row.row_json, null))
        .filter(Boolean);
    },

    readControlJson(name, fallback) {
      const row = database().prepare("SELECT value_json FROM control_json WHERE name = ?").get(sanitizeSegment(name));
      return row ? safeParseJson(row.value_json, fallback) : fallback;
    },

    writeControlJson(name, value) {
      database().prepare(`
        INSERT OR REPLACE INTO control_json (name, value_json, updated_at)
        VALUES (?, ?, ?)
      `).run(sanitizeSegment(name), JSON.stringify(value), new Date().toISOString());
      return databasePath;
    }
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sanitizeSegment(value) {
  const segment = String(value || "").trim();
  return /^[A-Za-z0-9_.-]+$/.test(segment) ? segment : "";
}

function safeParseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

module.exports = {
  createFileStorage,
  createObjectDatabaseStorage,
  createStorageFromEnv
};
