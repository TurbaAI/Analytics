"use strict";

const fs = require("node:fs");
const path = require("node:path");

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

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sanitizeSegment(value) {
  const segment = String(value || "").trim();
  return /^[A-Za-z0-9_.-]+$/.test(segment) ? segment : "";
}

module.exports = {
  createFileStorage
};
