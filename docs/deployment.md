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

For a strict local or SSH sandbox gate, use `ops/pilot-provider.sandbox.json` with `ops/source-contracts.sandbox.json` and `ops/source-approvals.sandbox.json`. The sandbox config points at a disposable local registry on `127.0.0.1:5000` and a mock source gateway on `127.0.0.1:8891`, so readiness checks can pass without `--allow-example`:

```sh
node scripts/render-managed-kubernetes.js \
  --config ops/pilot-provider.sandbox.json \
  --out build/turbalance-managed-kubernetes.yaml
```

For a real provider pilot, generate a non-placeholder config from provider-approved values before running strict gates:

```sh
node scripts/generate-provider-pilot-config.js \
  --out build/provider-a/pilot-provider.json \
  --namespace turbalance-provider-a \
  --release-name turbalance-provider-a \
  --image registry.provider.internal/ai-ops/turbalance-ingestion:2026.06 \
  --secret-provider aws \
  --secret-store-name turbalance-provider-a-secrets \
  --service-account-role-arn arn:aws:iam::210987654321:role/turbalance-provider-a-ingestion \
  --object-bucket turbalance-provider-a-ingestion \
  --object-prefix pilot/provider-a \
  --postgres-secret-name turbalance/provider-a/postgres-url \
  --tenant-tokens-secret-name turbalance/provider-a/tenant-tokens \
  --upload-secret-name turbalance/provider-a/upload-secret \
  --jwt-secret-name turbalance/provider-a/jwt-secret \
  --exporter-token-secret-name turbalance/provider-a/exporter-token \
  --ingest-tenant provider-a
```

Use the generated config with `scripts/render-managed-kubernetes.js`, `scripts/build-publish-ingestion-image.js`, and `scripts/run-provider-go-live-gates.js`. Replace `ops/source-contracts.example.json` and `ops/source-approvals.example.json` with source-owner approved endpoint, query, ticket, scope, and expiry values before enabling scheduled collectors.

The rendered deployment uses managed Postgres, S3-compatible object storage, ExternalSecret bindings, a provider image, and no PVC-backed local ingestion state.

Build/publish the provider image with:

```sh
docker run -d --rm --name turbalance-sandbox-registry -p 127.0.0.1:5000:5000 registry:2
node scripts/build-publish-ingestion-image.js \
  --config ops/pilot-provider.sandbox.json \
  --push
```

The `.github/workflows/provider-image.yml` workflow exposes the same gate as a manual GitHub Action.

To run the full strict sandbox gate in one command:

```sh
node scripts/run-sandbox-go-live.js \
  --out-dir build/provider-go-live-sandbox
```

The runner starts and cleans up a disposable local registry, mock source gateway, and ingestion container. It then pushes the sandbox image, validates source contracts, performs live ingestion burn-in, and writes `sandbox-go-live-report.json` beside the go-live report.

The `.github/workflows/sandbox-go-live.yml` workflow runs the same Docker-backed gate on demand and uploads the generated readiness, manifest, burn-in, and sandbox reports.

Use `scripts/run-provider-go-live-gates.js` when you want the image dry-run/push, managed manifest rendering, source-owner approval validation, source-contract validation, and burn-in report in one output directory.

## GitHub Pages

The repository includes `.github/workflows/pages.yml`. On pushes to `main`, the workflow:

1. runs the desktop/static wiring checks and prepares `build/demo`
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

## DGX Spark Inference

The repo includes a repeatable two-node inference staging path in `deploy/dgx-spark-inference/`:

- `user@192.168.10.20`: Ray head, OpenAI-compatible API endpoint, primary NIM/TRT-LLM or vLLM server, Open WebUI.
- `user@192.168.10.21`: Ray worker and distributed inference worker.

Use the orchestration helper when SSH keys are configured:

```sh
node scripts/prepare-dgx-spark-inference.js --all
```

The helper syncs the deployment scripts to `/home/user/dgx-spark-inference`, installs Ray in a host-local Python venv, starts the head/worker cluster, exposes existing Ollama models through `http://192.168.10.20:8355/v1`, starts Open WebUI on `http://192.168.10.20:3001`, and writes `build/dgx-spark-inference-prepare.json`.

Model serving is deliberately backend-gated by host-local env values. Fill `NIM_IMAGE` and `NGC_API_KEY` for NVIDIA NIM/TRT-LLM, or `VLLM_IMAGE`, `MODEL_ID`, and `HF_TOKEN` for vLLM. The OpenAI-compatible base URL is `http://192.168.10.20:8355/v1`.

The experimental 405B path uses NVIDIA's DGX Spark vLLM guidance: `nvcr.io/nvidia/vllm:25.11-py3`, a dedicated CX7 subnet, and `hugging-quants/Meta-Llama-3.1-405B-Instruct-AWQ-INT4` with `tensor-parallel-size=2`, `max-model-len=64`, `max-num-seqs=1`, and `max-num-batched-tokens=64`. Configure it with `deploy/dgx-spark-inference/configure-cx7-link.sh`, then start the vLLM head/worker and `start-vllm-405b-openai.sh`. NCCL validation is `deploy/dgx-spark-inference/validate-vllm-nccl.sh`, or `node scripts/prepare-dgx-spark-inference.js --validate-nccl` after the deployment directory has been synced to both DGX Spark hosts.
