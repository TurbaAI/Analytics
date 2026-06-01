# Operations

This repo now includes lightweight operations templates for pilots that run the optional backend ingestion service in Kubernetes or a similar managed environment.

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
