# Deployment

turbalance Analytics is a static prototype. It can be hosted from any static file server that serves these files from one directory:

- `index.html`
- `styles.css`
- `app.js`
- `analytics-core.js`
- `nccl-trace-parser.js`
- `nccl-trace-fixtures.js`
- `build/`
- `fixtures/`
- `docs/`
- `schemas/`
- `grafana/`
- `lib/`
- `ops/`
- `server/`

The optional backend ingestion service can run separately from the static dashboard:

```sh
TURBALANCE_TENANT_TOKENS="tenant-a:tenant-token:operator,admin:admin-token:admin" \
TURBALANCE_UPLOAD_SECRET="replace-with-random-secret" \
node server/ingestion-server.js
```

See `docs/backend-ingestion.md` for signed upload, role-aware auth, HS256/JWKS/OIDC discovery gateway mode, tenant provisioning, key rotation, audit export, metrics, storage modes, secret-file hooks, tenancy, and retention details. Use `scripts/run-retention-job.js` and `ops/kubernetes/` when retention should run as a cron, Kubernetes CronJob, or provider-managed scheduled task instead of an in-process interval.

The Kubernetes reference deployment uses:

- `ops/kubernetes/ingestion-configmap.yaml`
- `ops/kubernetes/ingestion-secret.example.yaml`
- `ops/kubernetes/ingestion-serviceaccount.yaml`
- `ops/kubernetes/ingestion-deployment.yaml`
- `ops/kubernetes/ingestion-retention-cronjob.yaml`
- `ops/kubernetes/provider-export-cronjob.yaml`
- `ops/kubernetes/ingestion-service-monitor.yaml`
- `ops/kubernetes/ingestion-prometheus-rules.yaml`

For a strict local or SSH sandbox gate, use `ops/pilot-provider.sandbox.json` with `ops/source-contracts.sandbox.json`. The sandbox config points at a disposable local registry on `127.0.0.1:5000` and a mock source gateway on `127.0.0.1:8891`, so readiness checks can pass without `--allow-example`:

```sh
node scripts/render-managed-kubernetes.js \
  --config ops/pilot-provider.sandbox.json \
  --out build/turbalance-managed-kubernetes.yaml
```

For a real provider pilot, copy `ops/pilot-provider.config.example.json` and replace the registry, secret store, IAM role, object bucket, managed database secret names, and source endpoints before running strict gates.

The rendered deployment uses managed Postgres, S3-compatible object storage, ExternalSecret bindings, a provider image, and no PVC-backed local ingestion state.

Build/publish the provider image with:

```sh
docker run -d --rm --name turbalance-sandbox-registry -p 127.0.0.1:5000:5000 registry:2
node scripts/build-publish-ingestion-image.js \
  --config ops/pilot-provider.sandbox.json \
  --push
```

The `.github/workflows/provider-image.yml` workflow exposes the same gate as a manual GitHub Action.

Use `scripts/run-provider-go-live-gates.js` when you want the image dry-run/push, managed manifest rendering, source-contract validation, and burn-in report in one output directory.

## GitHub Pages

The repository includes `.github/workflows/pages.yml`. On pushes to `main`, the workflow:

1. runs `node tests/run-all.js`
2. validates source bundles with `node scripts/validate-source-bundle.js --require-source-export`
3. runs screenshot QA when Playwright is available
4. assembles the static site into `site/`
5. uploads the site as a Pages artifact
6. deploys it with GitHub Pages

Enable Pages in repository settings with GitHub Actions as the source.

`.github/workflows/visual-qa.yml` is the dedicated Playwright visual QA workflow for screenshot regeneration and artifact upload.

If the Pages workflow fails at `Configure Pages`, the repository setting is not enabled yet. Enable Pages from GitHub repository settings, then rerun the latest `Deploy GitHub Pages` workflow.

## Local Static Server

For a local server:

```sh
python3 -m http.server 8000
```

Then open `http://127.0.0.1:8000/`.

Opening `index.html` directly also works for the dashboard. Fetching relative fixture URLs may be more reliable through a local static server because browsers apply different `file://` fetch restrictions.
