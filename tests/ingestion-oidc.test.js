const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const {
  authenticateJwtWithJwks,
  decodeJwt,
  parseMapping
} = require("../server/ingestion-oidc.js");

function signJwtRs256(payload, privateKey, kid) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(`${header}.${body}`), privateKey)
    .toString("base64url");
  return `${header}.${body}.${signature}`;
}

(async () => {
  const keyPair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = keyPair.publicKey.export({ format: "jwk" });
  jwk.kid = "kid-1";
  jwk.alg = "RS256";
  jwk.use = "sig";

  const token = signJwtRs256({
    sub: "operator@example.com",
    externalTenant: "customer-a",
    groups: ["platform-operator"],
    iss: "https://issuer.example.com",
    aud: "turbalance-ingestion",
    exp: Math.floor(Date.now() / 1000) + 300
  }, keyPair.privateKey, "kid-1");

  const decoded = decodeJwt(token);
  assert.equal(decoded.header.alg, "RS256");
  assert.equal(decoded.payload.sub, "operator@example.com");
  assert.deepEqual(parseMapping("customer-a:tenant-a,platform-operator:operator"), {
    "customer-a": "tenant-a",
    "platform-operator": "operator"
  });

  const account = await authenticateJwtWithJwks(token, {
    jwtJwks: { keys: [jwk] },
    jwtIssuer: "https://issuer.example.com",
    jwtAudience: "turbalance-ingestion",
    jwtTenantClaim: "externalTenant",
    jwtRoleClaim: "groups",
    jwtTenantMap: { "customer-a": "tenant-a" },
    jwtRoleMap: { "platform-operator": "operator" }
  });

  assert.equal(account.tenantId, "tenant-a");
  assert.equal(account.role, "operator");
  assert.equal(account.subject, "operator@example.com");

  const wrongAudience = await authenticateJwtWithJwks(token, {
    jwtJwks: { keys: [jwk] },
    jwtAudience: "other-audience",
    jwtTenantClaim: "externalTenant"
  });
  assert.equal(wrongAudience, null);

  const oidcServer = http.createServer((req, res) => {
    if (req.url === "/.well-known/openid-configuration") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        issuer: "https://issuer.example.com",
        jwks_uri: `http://127.0.0.1:${oidcServer.address().port}/jwks.json`
      }));
      return;
    }

    if (req.url === "/jwks.json") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });
  await new Promise((resolve) => oidcServer.listen(0, "127.0.0.1", resolve));

  try {
    const metrics = {
      jwksFetchesTotal: 0,
      jwksFetchFailuresTotal: 0,
      jwksCacheHitsTotal: 0,
      oidcDiscoveryFetchesTotal: 0,
      oidcDiscoveryFetchFailuresTotal: 0,
      oidcDiscoveryCacheHitsTotal: 0
    };
    const discoveredConfig = {
      jwtOidcDiscoveryUrl: `http://127.0.0.1:${oidcServer.address().port}/.well-known/openid-configuration`,
      jwtOidcDiscoveryCacheMs: 60_000,
      jwtJwksCacheMs: 60_000,
      jwtAudience: "turbalance-ingestion",
      jwtTenantClaim: "externalTenant",
      jwtRoleClaim: "groups",
      jwtTenantMap: { "customer-a": "tenant-a" },
      jwtRoleMap: { "platform-operator": "operator" },
      metrics
    };

    const discovered = await authenticateJwtWithJwks(token, discoveredConfig);
    assert.equal(discovered.tenantId, "tenant-a");
    assert.equal(discovered.role, "operator");
    assert.equal(metrics.oidcDiscoveryFetchesTotal, 1);
    assert.equal(metrics.jwksFetchesTotal, 1);

    const cached = await authenticateJwtWithJwks(token, discoveredConfig);
    assert.equal(cached.tenantId, "tenant-a");
    assert.equal(metrics.jwksCacheHitsTotal, 1);
  } finally {
    await new Promise((resolve) => oidcServer.close(resolve));
  }

  console.log("ingestion OIDC tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
