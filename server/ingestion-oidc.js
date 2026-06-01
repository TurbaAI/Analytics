"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");

function loadJwks(options = {}) {
  const inline = options.jwks || process.env.TURBALANCE_JWT_JWKS;
  const jwksPath = options.jwksPath || process.env.TURBALANCE_JWT_JWKS_PATH;

  if (inline) {
    return normalizeJwks(typeof inline === "string" ? JSON.parse(inline) : inline);
  }

  if (jwksPath) {
    return normalizeJwks(JSON.parse(fs.readFileSync(jwksPath, "utf8")));
  }

  return null;
}

function loadOidcDiscovery(options = {}) {
  const inline = options.discovery || process.env.TURBALANCE_OIDC_DISCOVERY || process.env.TURBALANCE_JWT_OIDC_DISCOVERY;
  const discoveryPath = options.discoveryPath || process.env.TURBALANCE_OIDC_DISCOVERY_PATH || process.env.TURBALANCE_JWT_OIDC_DISCOVERY_PATH;

  if (inline) {
    return normalizeDiscovery(typeof inline === "string" ? JSON.parse(inline) : inline);
  }

  if (discoveryPath) {
    return normalizeDiscovery(JSON.parse(fs.readFileSync(discoveryPath, "utf8")));
  }

  return null;
}

function parseMapping(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;

  return Object.fromEntries(
    String(value)
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [from, to] = entry.split(":");
        return [String(from || "").trim(), String(to || "").trim()];
      })
      .filter(([from, to]) => from && to)
  );
}

async function authenticateJwtWithJwks(token, config) {
  const decoded = decodeJwt(token);
  if (!decoded || decoded.header.alg !== "RS256") return null;

  const jwks = await jwksForConfig(config);
  if (!jwks || !Array.isArray(jwks.keys) || jwks.keys.length === 0) return null;

  const jwk = selectJwk(jwks, decoded.header);
  if (!jwk) return null;

  let publicKey;
  try {
    publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
  } catch {
    return null;
  }

  const verified = crypto.verify(
    "RSA-SHA256",
    Buffer.from(decoded.signedContent),
    publicKey,
    Buffer.from(decoded.signature, "base64url")
  );
  if (!verified) return null;
  if (!validateJwtClaims(decoded.payload, config)) return null;

  const tenantId = mappedClaimValue(decoded.payload, config.jwtTenantClaim, config.jwtTenantMap, [
    "tenantId",
    "tenant",
    "https://turbalance.ai/tenant"
  ]);
  if (!tenantId) return null;

  const role = mappedClaimValue(decoded.payload, config.jwtRoleClaim, config.jwtRoleMap, [
    "role",
    "roles",
    "https://turbalance.ai/role"
  ]) || "viewer";
  const subject = firstClaimValue(decoded.payload, config.jwtSubjectClaim, ["sub", "email", "preferred_username"]) || "jwt-subject";

  return {
    tenantId,
    role,
    subject,
    source: "jwt-jwks",
    tokenHash: sha256Hex(token),
    tokenFingerprint: sha256Hex(token).slice(0, 12),
    createdAt: new Date(0).toISOString()
  };
}

function decodeJwt(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = parts;

  try {
    return {
      header: JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")),
      payload: JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")),
      signature,
      signedContent: `${encodedHeader}.${encodedPayload}`
    };
  } catch {
    return null;
  }
}

function validateJwtClaims(payload, config) {
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && Number(payload.exp) < now) return false;
  if (payload.nbf && Number(payload.nbf) > now) return false;
  const issuer = expectedIssuer(config);
  if (issuer && payload.iss !== issuer) return false;
  if (config.jwtAudience && !audienceMatches(payload.aud, config.jwtAudience)) return false;
  return true;
}

async function jwksForConfig(config) {
  if (config.jwtJwks) return config.jwtJwks;
  const now = Date.now();
  if (config.jwtJwksCache?.jwks && config.jwtJwksCache.expiresAt > now) {
    incrementMetric(config, "jwksCacheHitsTotal");
    return config.jwtJwksCache.jwks;
  }

  const jwksUrl = config.jwtJwksUrl || (await oidcDiscoveryForConfig(config))?.jwks_uri;
  if (!jwksUrl) return null;

  let jwks;
  try {
    incrementMetric(config, "jwksFetchesTotal");
    jwks = normalizeJwks(await fetchJson(jwksUrl, "JWKS"));
  } catch (error) {
    incrementMetric(config, "jwksFetchFailuresTotal");
    throw error;
  }

  config.jwtJwksCache = {
    jwks,
    expiresAt: now + config.jwtJwksCacheMs
  };
  return jwks;
}

async function oidcDiscoveryForConfig(config) {
  if (config.jwtOidcDiscovery) return config.jwtOidcDiscovery;
  if (!config.jwtOidcDiscoveryUrl) return null;

  const now = Date.now();
  if (config.jwtOidcDiscoveryCache?.discovery && config.jwtOidcDiscoveryCache.expiresAt > now) {
    incrementMetric(config, "oidcDiscoveryCacheHitsTotal");
    return config.jwtOidcDiscoveryCache.discovery;
  }

  let discovery;
  try {
    incrementMetric(config, "oidcDiscoveryFetchesTotal");
    discovery = normalizeDiscovery(await fetchJson(config.jwtOidcDiscoveryUrl, "OIDC discovery"));
  } catch (error) {
    incrementMetric(config, "oidcDiscoveryFetchFailuresTotal");
    throw error;
  }

  config.jwtOidcDiscoveryCache = {
    discovery,
    expiresAt: now + config.jwtOidcDiscoveryCacheMs
  };
  return discovery;
}

function expectedIssuer(config) {
  return config.jwtIssuer
    || config.jwtOidcDiscovery?.issuer
    || config.jwtOidcDiscoveryCache?.discovery?.issuer
    || "";
}

function selectJwk(jwks, header) {
  return jwks.keys.find((key) => (
    key.kty === "RSA"
    && (!header.kid || key.kid === header.kid)
    && (!key.alg || key.alg === "RS256")
    && (!key.use || key.use === "sig")
  ));
}

function firstClaimValue(payload, preferredClaim, fallbackClaims) {
  const claims = [preferredClaim, ...fallbackClaims].filter(Boolean);
  for (const claim of claims) {
    const value = payload[claim];
    if (Array.isArray(value)) return String(value[0] || "").trim();
    if (value !== undefined && value !== null) return String(value).trim();
  }
  return "";
}

function mappedClaimValue(payload, preferredClaim, mapping, fallbackClaims) {
  const value = firstClaimValue(payload, preferredClaim, fallbackClaims);
  return mapping[value] || value;
}

function audienceMatches(actual, expected) {
  if (Array.isArray(actual)) return actual.includes(expected);
  return String(actual || "") === expected;
}

function normalizeJwks(value) {
  if (!value) return null;
  if (Array.isArray(value.keys)) return value;
  if (Array.isArray(value)) return { keys: value };
  return null;
}

function normalizeDiscovery(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!value.jwks_uri) return null;
  return value;
}

function incrementMetric(config, key) {
  if (!config.metrics || typeof config.metrics[key] !== "number") return;
  config.metrics[key] += 1;
}

function fetchJson(url, label) {
  return new Promise((resolve, reject) => {
    const client = String(url).startsWith("https:") ? https : http;
    const req = client.get(url, { timeout: 5000 }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`${label || "JSON"} fetch failed with ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error(`${label || "JSON"} fetch timed out`)));
    req.on("error", reject);
  });
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

module.exports = {
  authenticateJwtWithJwks,
  decodeJwt,
  loadJwks,
  loadOidcDiscovery,
  parseMapping,
  validateJwtClaims
};
