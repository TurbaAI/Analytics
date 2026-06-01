# Backend Ingestion Service

The browser app still works as a static prototype, but provider pilots can now run an optional controlled ingestion service for source-bundle uploads.

## Run Locally

```sh
TURBALANCE_TENANT_TOKENS="tenant-a:tenant-token,admin:admin-token:admin" \
TURBALANCE_UPLOAD_SECRET="replace-with-random-secret" \
TURBALANCE_DATA_DIR=".turbalance-data" \
node server/ingestion-server.js
```

The service listens on `127.0.0.1:8787` by default. Set `TURBALANCE_INGEST_HOST` and `TURBALANCE_INGEST_PORT` to change the bind address.

## Controls

- Auth: bearer tokens from `TURBALANCE_TENANT_TOKENS`
- Tenancy: each token maps to one tenant unless the token role is `admin`
- Signed upload path: authenticated clients request a short-lived signed `PUT` URL
- Direct ingest path: authenticated clients can post a source bundle directly
- Audit log: every auth failure, signing event, accepted ingest, rejected ingest, audit read, and retention run is appended to `audit/audit.jsonl`
- Retention: uploads older than `TURBALANCE_RETENTION_DAYS` or beyond `TURBALANCE_MAX_UPLOADS_PER_TENANT` are removed
- Size limit: `TURBALANCE_MAX_UPLOAD_BYTES`, default 25 MiB

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

### Retention

```sh
curl -sS -X POST http://127.0.0.1:8787/v1/retention/run \
  -H "Authorization: Bearer tenant-token"
```

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
