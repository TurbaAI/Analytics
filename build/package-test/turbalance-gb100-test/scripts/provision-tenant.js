#!/usr/bin/env node
"use strict";

const args = parseArgs(process.argv.slice(2));
const baseUrl = args.url || process.env.TURBALANCE_INGEST_ADMIN_URL || "http://127.0.0.1:8787";
const adminToken = args["admin-token"] || process.env.TURBALANCE_ADMIN_TOKEN || "";
const tenantId = args.tenant || process.env.TURBALANCE_PROVISION_TENANT || "";
const displayName = args["display-name"] || process.env.TURBALANCE_PROVISION_DISPLAY_NAME || tenantId;
const role = args.role || process.env.TURBALANCE_PROVISION_ROLE || "ingest";
const subject = args.subject || process.env.TURBALANCE_PROVISION_SUBJECT || "provider-exporter";

if (!adminToken || !tenantId) {
  process.stderr.write("usage: provision-tenant.js --url http://127.0.0.1:8787 --admin-token TOKEN --tenant TENANT_ID [--display-name NAME] [--role ingest] [--subject provider-exporter]\n");
  process.exit(1);
}

(async () => {
  const tenant = await requestJson("/v1/tenants", {
    tenantId,
    displayName
  });
  const token = await requestJson("/v1/tokens/rotate", {
    tenantId,
    role,
    subject
  });

  process.stdout.write(`${JSON.stringify({
    ok: true,
    tenant: tenant.tenant,
    token: {
      tenantId: token.tenantId,
      role: token.role,
      subject: token.subject,
      token: token.token,
      tokenFingerprint: token.tokenFingerprint
    }
  }, null, 2)}\n`);
})().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

async function requestJson(pathname, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const url = new URL(pathname, baseUrl);

  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${pathname} failed with ${response.status}: ${text}`);
    }
    return JSON.parse(text);
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`${pathname} timed out after 15000 ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    parsed[arg.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : "1";
  }
  return parsed;
}
