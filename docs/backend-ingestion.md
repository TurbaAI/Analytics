# Backend Ingestion Service

The browser app still works as a static prototype, but provider pilots can now run an optional controlled ingestion service for source-bundle uploads.

## Run Locally

```sh
TURBALANCE_TENANT_TOKENS="tenant-a:tenant-token:operator,admin:admin-token:admin" \
TURBALANCE_UPLOAD_SECRET="replace-with-random-secret" \
TURBALANCE_DATA_DIR=".turbalance-data" \
node server/ingestion-server.js
```

The service listens on `127.0.0.1:8787` by default. Set `TURBALANCE_INGEST_HOST` and `TURBALANCE_INGEST_PORT` to change the bind address.

## Controls

- Auth: bearer tokens from `TURBALANCE_TENANT_TOKENS`, optional HS256 JWT validation with `TURBALANCE_JWT_SECRET`, and optional RS256/JWKS validation with `TURBALANCE_JWT_JWKS`, `TURBALANCE_JWT_JWKS_PATH`, or `TURBALANCE_JWT_JWKS_URL`
- Tenancy: each token maps to one tenant unless the token role is `admin`
- Roles: `admin`, `operator`, `ingest`, and `viewer`
- Tenant registry: admins can create or update tenant display names, status, retention days, and upload caps
- Signed upload path: authenticated clients request a short-lived signed `PUT` URL
- Upload-key rotation: admins can rotate the HMAC key used for signed upload URLs
- Token rotation: admins can issue tenant-scoped ingest, operator, viewer, or admin tokens
- Direct ingest path: authenticated clients can post a source bundle directly
- Audit log: every auth failure, signing event, accepted ingest, rejected ingest, audit read/export, tenant change, key rotation, and retention run is appended to `audit/audit.jsonl`
- Audit export: tenant-scoped JSON, JSONL, or CSV export
- Retention: uploads older than `TURBALANCE_RETENTION_DAYS` or beyond `TURBALANCE_MAX_UPLOADS_PER_TENANT` are removed; set `TURBALANCE_RETENTION_INTERVAL_SECONDS` to run this automatically
- Metrics: `/metrics` exposes Prometheus-style counters and gauges for auth failures, accepted/rejected ingests, retention runs, tenant/key changes, and configured control-plane size
- Size limit: `TURBALANCE_MAX_UPLOAD_BYTES`, default 25 MiB
- Storage: uploads, audit rows, and control-plane JSON use `server/ingestion-storage.js`; the current adapter is file-backed and intentionally small enough to replace with object storage and a database later

Token entries use `tenant:token:role:subject`. `role` and `subject` are optional. Example:

```sh
TURBALANCE_TENANT_TOKENS="tenant-a:tenant-token:operator:pilot-operator,tenant-a:viewer-token:viewer:security-review,admin:admin-token:admin:platform-admin"
```

For gateway-issued pilot JWTs, set:

```sh
TURBALANCE_JWT_SECRET="replace-with-shared-secret" \
TURBALANCE_JWT_ISSUER="https://sso.example.com" \
TURBALANCE_JWT_AUDIENCE="turbalance-ingestion"
```

JWT claims must include `tenantId` or `tenant`, plus optional `role`. This is a pilot-friendly gateway/JWT mode; JWKS support validates signatures and claims, while full OIDC discovery lifecycle and customer IAM provisioning remain production integration work.

For RS256/JWKS validation, set one JWKS source:

```sh
TURBALANCE_JWT_JWKS_PATH="./jwks.json"
# or TURBALANCE_JWT_JWKS='{"keys":[...]}'
# or TURBALANCE_JWT_JWKS_URL="https://issuer.example.com/.well-known/jwks.json"
```

Tenant and role claims can be mapped into turbalance tenant IDs and roles:

```sh
TURBALANCE_JWT_TENANT_CLAIM="customer_tenant" \
TURBALANCE_JWT_ROLE_CLAIM="groups" \
TURBALANCE_JWT_TENANT_MAP="external-customer-a:tenant-a" \
TURBALANCE_JWT_ROLE_MAP="security-reader:viewer,platform-operator:operator"
```

JWKS URL responses are cached for `TURBALANCE_JWT_JWKS_CACHE_MS`, default 300000 ms.

For OIDC discovery, set:

```sh
TURBALANCE_OIDC_DISCOVERY_URL="https://issuer.example.com/.well-known/openid-configuration"
```

The backend fetches `jwks_uri` from the discovery document and caches discovery responses for `TURBALANCE_OIDC_DISCOVERY_CACHE_MS`, default 300000 ms. Fetch and cache counters are exported through `/metrics`.

## API

### Health

```sh
curl http://127.0.0.1:8787/health
```

### Sign An Upload

```sh
SHA=$(shasum -a 256 source-bundle.json | awk '{print $1}')

curl -sS http://127.0.0.1:8787/v1/uploads/sign \
  -H "Authorization: Bearer tenant-token" \
  -H "Content-Type: application/json" \
  -d "{\"tenantId\":\"tenant-a\",\"sha256\":\"$SHA\",\"expiresInSeconds\":900}"
```

The response includes `uploadUrl`. Send the same source bundle to that URL:

```sh
curl -sS -X PUT "http://127.0.0.1:8787$UPLOAD_URL" \
  -H "Content-Type: application/json" \
  --data-binary @source-bundle.json
```

### Direct Ingest

```sh
curl -sS http://127.0.0.1:8787/v1/ingestion \
  -H "Authorization: Bearer tenant-token" \
  -H "Content-Type: application/json" \
  --data-binary @source-bundle.json
```

### Audit

```sh
curl -sS http://127.0.0.1:8787/v1/audit?limit=50 \
  -H "Authorization: Bearer tenant-token"
```

Export audit rows:

```sh
curl -sS "http://127.0.0.1:8787/v1/audit/export?format=csv&limit=1000" \
  -H "Authorization: Bearer tenant-token"
```

### Retention

```sh
curl -sS -X POST http://127.0.0.1:8787/v1/retention/run \
  -H "Authorization: Bearer tenant-token"
```

Run retention as a standalone managed job:

```sh
TURBALANCE_DATA_DIR=".turbalance-data" \
TURBALANCE_RETENTION_DAYS=30 \
node scripts/run-retention-job.js --json
```

This script is meant for cron, Kubernetes CronJob, or provider-managed scheduled task wiring.

Kubernetes templates for this job and Prometheus monitoring live under `ops/kubernetes/`; see `docs/operations.md`.

### Metrics

```sh
curl -sS http://127.0.0.1:8787/metrics \
  -H "Authorization: Bearer tenant-token"
```

### Tenant Provisioning

Admin tokens can create or update pilot tenants:

```sh
curl -sS http://127.0.0.1:8787/v1/tenants \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{"tenantId":"tenant-b","displayName":"Tenant B","retentionDays":14,"maxUploadsPerTenant":100}'
```

List tenants and redacted token summaries:

```sh
curl -sS http://127.0.0.1:8787/v1/tenants \
  -H "Authorization: Bearer admin-token"
```

### Token Rotation

Issue a tenant-scoped token:

```sh
curl -sS http://127.0.0.1:8787/v1/tokens/rotate \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{"tenantId":"tenant-b","role":"ingest","subject":"pilot-exporter"}'
```

The response returns the generated token once and stores only its hash in `<data-dir>/control/tokens.json`.

### Upload-Key Rotation

Rotate the signed-upload HMAC key:

```sh
curl -sS http://127.0.0.1:8787/v1/upload-keys/rotate \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{"keyId":"pilot-2026-06","activate":true}'
```

Generated upload-key secrets are stored under `<data-dir>/control/upload-keys.json` for local pilot continuity. Use a real secret manager before running this as a managed service.

## Validation

The service validates JSON with the same preflight library as the CLI:

```sh
node scripts/validate-source-bundle.js --require-source-export source-bundle.json
```

Accepted payloads are stored under:

```text
<data-dir>/tenants/<tenant-id>/uploads/<timestamp>-<upload-id>.json
```

Metadata is stored beside each payload as `.meta.json`; audit rows stay in `<data-dir>/audit/audit.jsonl`.

Control-plane state is stored under:

```text
<data-dir>/control/tenants.json
<data-dir>/control/tokens.json
<data-dir>/control/upload-keys.json
```
