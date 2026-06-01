# Operations

This repo now includes lightweight operations templates for pilots that run the optional backend ingestion service in Kubernetes or a similar managed environment.

## Backend Deployment

Reference manifests:

```text
ops/kubernetes/ingestion-configmap.yaml
ops/kubernetes/ingestion-secret.example.yaml
ops/kubernetes/ingestion-serviceaccount.yaml
ops/kubernetes/ingestion-deployment.yaml
```

The deployment uses `TURBALANCE_STORAGE_MODE=managed-postgres-s3`, file-mounted secrets, S3-compatible object storage, and managed Postgres control/audit state. It does not mount local PVCs for ingestion state.

Render provider-specific names, image, object bucket, Postgres secret, and ExternalSecret bindings from:

```sh
node scripts/render-managed-kubernetes.js \
  --config ops/pilot-provider.config.example.json \
  --out build/turbalance-managed-kubernetes.yaml
```

## Retention Job

Use `scripts/run-retention-job.js` for cron, Kubernetes CronJob, or provider-managed scheduled task wiring:

```sh
TURBALANCE_DATA_DIR=".turbalance-data" \
TURBALANCE_RETENTION_DAYS=30 \
node scripts/run-retention-job.js --json
```

Kubernetes template:

```text
ops/kubernetes/ingestion-retention-cronjob.yaml
```

The template assumes a container image containing this repo and a persistent volume mounted at `/app/.turbalance-data`.

## Provider Export Job

Use `scripts/run-provider-pilot-export-job.js` when source-system owners provide approved exports on disk or through mounted files:

```sh
node scripts/run-provider-pilot-export-job.js \
  --input-dir fixtures/provider-pilot-export-inputs \
  --out provider-pilot-bundle.json
```

Kubernetes template:

```text
ops/kubernetes/provider-export-cronjob.yaml
```

The CronJob expects source exports to be mounted at `/var/run/turbalance-provider-exports` and posts the generated source bundle to the ingestion API.

When Prometheus access is approved, stage live Prometheus/DCGM exports before the provider bundle job:

```sh
TURBALANCE_PROMETHEUS_BEARER_TOKEN="$PROMETHEUS_TOKEN" \
node scripts/fetch-prometheus-source-export.js \
  --url https://prometheus.provider.example \
  --run-id provider-run-9001 \
  --queries-file fixtures/prometheus-collector-queries.json \
  --out-dir /var/run/turbalance-provider-exports
```

This writes `prometheus.json` and `dcgm.json` in the same shape expected by `scripts/build-provider-pilot-bundle.js`.

## Tenant Bootstrap

Use `scripts/provision-tenant.js` with an admin token to create a pilot tenant and issue the provider export token:

```sh
node scripts/provision-tenant.js \
  --url https://ingestion.example.com \
  --admin-token "$TURBALANCE_ADMIN_TOKEN" \
  --tenant provider-a \
  --display-name "Provider A" \
  --role ingest \
  --subject provider-exporter
```

Store the returned token in the provider's secret manager and mount it into `ops/kubernetes/provider-export-cronjob.yaml` through the `exporter-token` secret key. The CLI is intentionally small; production onboarding should bind it to the provider IAM, ticketing, approval, and audit workflow.

For customer onboarding plus secret-manager binding output:

```sh
node scripts/provision-customer-iam.js \
  --url https://ingestion.example.com \
  --admin-token "$TURBALANCE_ADMIN_TOKEN" \
  --tenant provider-a \
  --display-name "Provider A" \
  --provider aws \
  --secret-name turbalance/provider-a/exporter-token
```

Use `--apply-secrets` only from an approved provider automation context with the cloud CLI already authenticated.

## Metrics

The ingestion backend exposes Prometheus text metrics at `/metrics` for authenticated `viewer`, `operator`, or `admin` callers.

Kubernetes/Prometheus templates:

```text
ops/kubernetes/ingestion-service-monitor.yaml
ops/kubernetes/ingestion-prometheus-rules.yaml
```

The rules cover ingestion rejects, authentication failure spikes, JWKS fetch failures, and retention staleness.

## OIDC/JWKS

For OIDC discovery, set:

```sh
TURBALANCE_OIDC_DISCOVERY_URL="https://issuer.example.com/.well-known/openid-configuration"
TURBALANCE_JWT_AUDIENCE="turbalance-ingestion"
TURBALANCE_JWT_TENANT_CLAIM="customer_tenant"
TURBALANCE_JWT_ROLE_CLAIM="groups"
TURBALANCE_JWT_TENANT_MAP="external-customer-a:tenant-a"
TURBALANCE_JWT_ROLE_MAP="security-reader:viewer,platform-operator:operator"
```

The backend caches discovery and JWKS responses and exposes cache/fetch counters through `/metrics`.

## Source Collectors

Use `scripts/fetch-source-system-export.js` when source owners approve read-only HTTP exports:

```sh
node scripts/fetch-source-system-export.js \
  --system kubernetes \
  --url https://source-gateway.example/kubernetes/jobs \
  --out-dir /var/run/turbalance-provider-exports
```

Supported systems are `kubernetes`, `scheduler-admission`, `grafana`, `billing-slo`, `ebpf`, `nccl`, and `opportunities`. Prometheus/DCGM collection remains in `scripts/fetch-prometheus-source-export.js` because it uses Prometheus query semantics.

## Visual QA

`.github/workflows/visual-qa.yml` installs Playwright and Chromium, runs `scripts/run-screenshot-qa.js` with `TURBALANCE_SCREENSHOT_QA_REQUIRED=1`, and uploads desktop/mobile screenshots from `build/qa/`.
