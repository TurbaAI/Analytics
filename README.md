# turbalance Analytics

![turbalance Analytics desktop screenshot](build/turbalance-analytics-desktop.png)

turbalance Analytics is an operator cockpit for AI infrastructure. It combines live machine telemetry, durable lakehouse telemetry, scheduler/source overlays, GPU observability, Redfish/BMC evidence, system identification, product packaging, and production runbooks into one workflow for finding wasted accelerator time, explaining why it is happening, and proving a change before a customer sees it.

The repo now supports two connected delivery lanes:

- A single-controller bare-metal product appliance for the NUC14E, SPARK1/SPARK2, and 12 Raspberry Pi hosts.
- A fuller lakehouse/Kubernetes production lane with managed storage, image release, mTLS, ExternalSecret, OpenTelemetry, alerting, and go-live gates.

The fastest orientation path is:

- Product appliance and customer pilot workflow: `docs/customer-productization.md`
- Durable data platform and Kubernetes lane: `docs/e2e-data-platform.md`
- Lakehouse operations and production runbooks: `docs/lakehouse-operations.md`
- Bare-metal fleet production notes: `docs/bare-metal-fleet-production.md`
- Redfish/BMC hardware-management bridge: `docs/redfish-integration.md`
- Visual QA checklist: `docs/visual-qa.md`

## What This Is Now

This repository has moved from a static analytics prototype into a friendly-pilot product appliance plus a production lakehouse lane:

- **Pilot appliance**: a single NUC14E controller for SPARK1, SPARK2, and `pi@pi1` through `pi@pi12`, with HTTPS, mTLS collector edge, API auth, Grafana, Prometheus, live agents, periodic benchmarks, support bundles, releases, rollback, and doctor checks.
- **Analytics cockpit**: static dashboard with live resource tiles, SPARK pair comparison, Pi fleet histograms, PTP/NTP/chrony clock offset tracking, system characterization, opportunity analysis, provider lens, evidence packs, dark mode, and block settings.
- **Source-bundle bridge**: import and backend ingest for Prometheus, DCGM, Kubernetes, scheduler/admission, Grafana, eBPF, Redfish, provider billing/SLO, opportunity exports, and NCCL traces.
- **Lakehouse platform**: collector gateway, queue/spool handling, raw writer, Parquet lake, DuckDB query service, transforms, alert engine, API, OpenTelemetry, Kubernetes overlays, managed storage, security manifests, and release/go-live gates.

It is pilot-ready for controlled customer evaluation. It is not yet a turnkey multi-tenant SaaS; see `## Deployment Boundary` for the remaining enterprise rollout work.

## Current Live Pilot

The active lab/pilot deployment is centered on NUC14E:

| Surface | URL or target | Notes |
| --- | --- | --- |
| HTTPS product edge | `https://192.168.10.30:8443/` | Nginx edge using generated local CA material in `build/product-tls/` |
| Internal dashboard | `http://192.168.10.30:8000/` | Static dashboard served by systemd |
| Product API | `http://192.168.10.30:8080` and `/api` through the HTTPS edge | API auth enabled |
| Collector gateway | `http://192.168.10.30:8801/v1/source-bundles` | Internal collector with bearer plus HMAC auth |
| mTLS collector edge | `https://192.168.10.30:9443/v1/source-bundles` | Requires generated client certificate |
| Prometheus | `http://192.168.10.30:9091` | Authenticated API metrics scrape is configured |
| Grafana | `http://192.168.10.30:3001` | Runtime dashboard stack |
| Release bundle | `/home/user/turbalance-analytics/build/releases/turbalance-product-0.1.0-redfish-20260610.tar.gz` | Checksummed customer release package including the Redfish bridge |
| Latest support bundle | `/home/user/turbalance-analytics/build/support/turbalance-support-2026-06-10T08-05-58-129Z.tar.gz` | Redacted diagnostic archive with remote checks |

Controller services are managed by user systemd with lingering enabled:

- `turbalance-product-dashboard.service`
- `turbalance-product-collector.service`
- `turbalance-product-api.service`
- `turbalance-product-live-fleet.service`

Runtime containers:

- `turbalance-prometheus-runtime`
- `turbalance-grafana-runtime`
- `turbalance-product-edge`

The live doctor currently checks internal HTTP services, Prometheus readiness, Prometheus target health, Grafana, the live-machine bundle, runtime containers, HTTPS dashboard/API, the mTLS collector path, rejection of collector requests without a client certificate, and remote agent/benchmark state across SPARK and Pi machines.

```sh
ssh user@192.168.10.30 'cd /home/user/turbalance-analytics && node scripts/turbalance-doctor.js --config ops/turbalance-product.example.json --timeout 15000'
```

## Architecture

### Bare-Metal Product Appliance

```mermaid
flowchart TD
  Pi["pi@pi1..pi12"]
  Spark["SPARK1 / SPARK2"]
  Nuc["NUC14E controller"]
  Agent["live-machine push agent"]
  Redfish["Redfish/BMC snapshots"]
  Sources["Prometheus / DCGM / K8s / scheduler / Grafana / eBPF / provider"]
  Collector["collector gateway :8801"]
  Edge["HTTPS + mTLS edge :8443/:9443"]
  Lake["Parquet/DuckDB lakehouse"]
  API["FastAPI product API :8080"]
  UI["Static dashboard :8000"]
  Prom["Prometheus :9091"]
  Grafana["Grafana :3001"]

  Pi --> Agent
  Spark --> Agent
  Agent --> Collector
  Redfish --> Collector
  Sources --> Collector
  Edge --> Collector
  Collector --> Lake
  API --> Lake
  UI --> API
  UI --> Collector
  Prom --> API
  Prom --> Collector
  Grafana --> Prom
```

The appliance path keeps one structured config in `ops/turbalance-product.example.json`, renders runtime material under `build/product-runtime/`, rolls agents to the SPARK and Pi fleet, runs services under systemd, checks health with one doctor command, and packages releases with rollback state.

### Lakehouse Platform Lane

```mermaid
flowchart TD
  Host["Monitored host"]
  EBPF["eBPF / live telemetry agent"]
  Collector["Collector gateway"]
  Queue["Queue gateway / spool"]
  Raw["Raw writer"]
  Lake["Partitioned Parquet lake"]
  DuckDB["DuckDB query service"]
  Transform["Transform runner / SQLMesh / dbt"]
  Dagster["Dagster assets + checks"]
  Alerts["Alert engine"]
  API["Product API"]
  React["React / static dashboard / Grafana"]

  Host --> EBPF
  EBPF --> Collector
  Collector --> Queue
  Queue --> Raw
  Raw --> Lake
  Lake --> DuckDB
  DuckDB --> Transform
  Transform --> Lake
  Dagster --> Transform
  Alerts --> API
  API --> React
```

The lakehouse lane supports Kubernetes overlays, managed object storage, metadata database, ExternalSecret bindings, SPIRE/external-CA discovery modes, OpenTelemetry, alert routing, image build/release/signing gates, and SPARK1 single-host activation. See `docs/e2e-data-platform.md` and `docs/lakehouse-operations.md`.

## Quick Start

Run the static dashboard locally:

```sh
python3 -m http.server 8000
```

Open `http://127.0.0.1:8000/`.

Try the provider fixture:

1. Open the app.
2. Click `Import JSON`.
3. Select `fixtures/neo-cloud-provider-bundle.json`.
4. Switch between `Tenant`, `Account`, and `Reservation`.
5. Review Provider Lens, Scheduler Simulator, Grafana Handoff, Opportunity Engine, and evidence-pack export.

Run the full validation suite:

```sh
node tests/run-all.js
```

## Product Appliance Workflow

### 1. Render Runtime Material

```sh
node scripts/render-product-runtime.js \
  --config ops/turbalance-product.example.json \
  --out-dir build/product-runtime
```

Important outputs:

- `build/product-runtime/controller.env`
- `build/product-runtime/agents/*.env`
- `build/product-runtime/fleet-remotes.txt`
- `build/product-runtime/rollout-command.sh`
- `build/product-runtime/controller-services-command.sh`
- `build/product-runtime/observability-command.sh`
- `build/product-runtime/product-edge-command.sh`
- `build/product-runtime/doctor-command.sh`
- `build/product-runtime/support-bundle-command.sh`

### 2. Generate And Apply Secrets

```sh
node scripts/generate-product-secrets.js \
  --config ops/turbalance-product.example.json \
  --out-dir build/product-secrets

node scripts/apply-product-security.js \
  --config ops/turbalance-product.example.json \
  --secrets-dir build/product-secrets \
  --apply \
  --out build/product-runtime/security-apply-report.json
```

The config uses secret file paths, not command-line secret values. API auth remains enabled, collector bearer and HMAC auth remain enabled, and Prometheus gets a viewer token for API `/metrics`.

### 3. Install Controller Services

```sh
node scripts/manage-product-controller-services.js \
  --config ops/turbalance-product.example.json \
  --action install \
  --mode user \
  --apply
```

The manager installs dashboard, collector, API, and live-fleet services under systemd, removes old detached controller processes, restarts managed services, and attempts to enable user lingering for boot persistence. Use `--action status` to verify active/enabled state and endpoint readiness.

### 4. Start Observability

```sh
node scripts/manage-product-observability.js \
  --config ops/turbalance-product.example.json \
  --action up \
  --secure auto \
  --apply
```

When API auth is enabled, this uses `deploy/docker/grafana-runtime-compose.secure.yml` and `deploy/docker/grafana-runtime/prometheus.secure.yml`. It prepares a Docker-readable runtime copy of the API viewer token under `build/product-runtime/prometheus-secrets/` so Prometheus can scrape protected API metrics without disabling auth.

### 5. Start The HTTPS/mTLS Product Edge

```sh
node scripts/manage-product-edge.js \
  --config ops/turbalance-product.example.json \
  --action up \
  --apply
```

The edge manager generates local TLS material with `scripts/generate-product-edge-tls.js`, starts `turbalance-product-edge` from `deploy/docker/product-edge-compose.yml`, and validates:

- HTTPS dashboard on `:8443`
- HTTPS API proxy on `/api`
- mTLS collector readiness on `:9443`
- rejection of collector requests without a client certificate

Generated TLS material lives in `build/product-tls/` and is intentionally excluded from release tarballs.

### 6. Roll Out Fleet Agents

```sh
build/product-runtime/rollout-command.sh
```

The rollout path syncs the repo to `SPARK1`, `SPARK2`, and `pi@pi1` through `pi@pi12`, writes live-agent env files, installs systemd units, restarts agents, enables periodic benchmarks, and can distribute collector CA/client cert/key material when switching agents to the mTLS collector URL.

The push agent is `scripts/push-live-machine-telemetry.js`. It collects strict local telemetry, signs posts with HMAC when configured, persists sequence numbers, spools failed posts, replays the spool, supports HTTPS CA/client cert options, and writes source bundles to `/v1/source-bundles`.

### 7. Check Health

```sh
node scripts/turbalance-doctor.js \
  --config ops/turbalance-product.example.json \
  --remote-checks \
  --timeout 15000
```

Doctor status meanings:

- `pass`: all required checks passed.
- `warn`: usable but needs attention, usually freshness or remote agent state.
- `fail`: required service, scrape target, or edge endpoint failed.

### 8. Build Support And Release Artifacts

```sh
node scripts/turbalance-support-bundle.js \
  --config ops/turbalance-product.example.json \
  --remote-checks \
  --out-dir build/support

node scripts/package-product-release.js \
  --config ops/turbalance-product.example.json \
  --out-dir build/releases
```

Install, update, and rollback packaged releases with:

```sh
node scripts/manage-product-release.js \
  --action install \
  --source build/releases/turbalance-product-0.1.0-redfish-20260610.tar.gz \
  --install-root /opt/turbalance/product \
  --apply
```

The release manager keeps `releases/`, `backups/`, `current`, and `release-state.json`, and supports dry-run, install, update, rollback, and status.

## Dashboard Capabilities

The dashboard is a static browser app backed by live-machine bundles and optional API calls. It keeps workspace state in `localStorage` and supports normal export, redacted workspace export, and Markdown evidence-pack export.

Current operator surfaces include:

- Job, model, user, team, cluster, tenant, account, and reservation scopes
- Useful compute, wasted GPU-hours, waste dollars, cost per useful GPU-hour, and bottleneck attribution
- Provider Lens for tenant/account/reservation, queue SLO, sellable waste, commit burn, gross margin, and customer risk
- Scheduler/capacity simulator and Opportunity Engine
- Grafana Handoff links through `sources.grafana`
- Redfish/BMC hardware evidence through `sources.redfish`
- Live System Resources with CPU, RAM, disk, network, Docker, Ollama, GPU, power, temperature, and signal freshness
- Fleet Comparison for SPARK/NUC/Pi groups
- Raspberry Pi benchmark histograms across `pi@pi1` through `pi@pi12`
- SPARK1/SPARK2 pair comparison with PTP/NTP/chrony/linuxptp state, rolling clock-offset graph, and sample skew
- System Identification cards, profile bars, signature-distance comparisons, and rolling feature sparklines
- Settings panel for enabling/disabling dashboard blocks, with bare minimum enabled by default
- Light and dark modes
- Observation Log that records interpreted events rather than raw one-second noise

Known live hosts include `192.168.10.30` / `NUC14E`, `192.168.10.20` / `SPARK1`, `192.168.10.21` / `SPARK2`, `pi1` through `pi12`, and optional lab targets such as `100.96.89.98` / `dgx-pat` when reachable.

## Live Telemetry And Benchmarks

The live-machine collector samples Linux/macOS/BSD host counters, optional `gpustat --json`, selective `nvidia-smi`, Docker, Grafana, Kafka, Netdata, Ollama, node-exporter, procfs, disk, memory, network counters, link speed, drops/errors, and utilization percent when link speed is known.

For NVIDIA telemetry, the preferred lightweight path is `gpustat` when present, with selective `nvidia-smi` fallback. DCGM remains the serious datacenter path for GB100/GB200 telemetry, health, power, clocks, ECC, MIG, and diagnostics.

Periodic benchmarks are conservative and cache-aware. The Pi fleet gets CPU/RAM/network/disk benchmark histograms for comparison. SPARK/NUC hosts can opt into broader active characterization while still avoiding unsafe default GPU/RAM/network/disk stress.

## Redfish Bridge And Positioning

Redfish support is implemented as a hardware-management source lane, not as a replacement for this product.

- Redfish gives turbalance BMC-side facts: inventory, health rollup, power state, power draw, inlet/exhaust temperature, fan/sensor summaries, firmware inventory, event-service state, and telemetry-service state.
- turbalance correlates that management-plane evidence with workload telemetry, GPU counters, scheduler events, provider economics, Grafana links, eBPF host evidence, NCCL traces, system characterization, Pi/SPARK fleet comparison, and customer-ready evidence packs.
- `scripts/fetch-redfish-source-export.js` collects directly from Redfish endpoints or normalizes saved snapshots.
- `scripts/fetch-source-system-export.js --system redfish` supports customer source-gateway workflows.
- `sources.redfish` is validated by `schemas/turba-source-bundle.v1.schema.json`, counted by `lib/source-bundle-validator.js`, included in provider pilot bundles, covered by source contracts/approvals/readiness, and redacted in workspace/evidence exports.

In short: Redfish is the BMC bridge. turbalance is the cross-layer analytics, comparison, evidence, and product delivery layer around it.

## System Identification

`services/system-id-worker/system_id_worker` treats a machine as a dynamic system. It can run impulse/spike, step, ramp, and sine probes for CPU, GPU, RAM, network, and disk, then extracts gain, delay, rise time, settling time, recovery area, overshoot, peak delta, and cross-correlation across host outputs.

Simulation mode:

```sh
PYTHONPATH=services/system-id-worker:services/platform_common:services/raw-writer \
python3 -m system_id_worker run \
  --simulate \
  --targets cpu,gpu,ram,network,disk \
  --profiles impulse,step,ramp,sine \
  --out build/system-identification/sim-report.json \
  --batch-out build/system-identification/sim-batch.json \
  --lake-root build/system-identification/lake \
  --tenant-id dgx-lab \
  --host-id sim-host
```

Conservative automation for SPARK and Pi fleets:

```sh
node scripts/run-system-characterization.js --nuc local

node scripts/run-system-characterization.js \
  --nuc local \
  --pi-fleet \
  --targets cpu,ram,network,disk \
  --profiles impulse,step,ramp \
  --loop-minutes 30
```

Lakehouse writes land in `raw_system_identification`; transforms materialize `vs_system_identification_signature`; the API exposes `/v1/virtual-sensors/system-identification`.

## DGX Spark And Inference

The SPARK pair is also staged for distributed inference:

- SPARK1: `user@192.168.10.20`, Ray head, OpenAI-compatible API endpoint, primary model server, Open WebUI.
- SPARK2: `user@192.168.10.21`, Ray worker.
- Dedicated CX7 subnet: `192.168.100.10/24` and `192.168.100.11/24`.

Use `deploy/dgx-spark-inference/` and:

```sh
node scripts/prepare-dgx-spark-inference.js --all
```

The Ollama path is for locally listed/loaded Ollama models. Llama 3.1 405B is handled by the experimental vLLM/Ray path, not by expecting `ollama list` to show `llama3.1:405B`. The 405B playbook uses `hugging-quants/Meta-Llama-3.1-405B-Instruct-AWQ-INT4`, `NCCL_SOCKET_IFNAME=enp1s0f1np1`, and the scripts under `deploy/dgx-spark-inference/`. It is memory-constrained and intended for testing, not production traffic.

PTP over the SPARK interconnect is supported with `deploy/dgx-spark-inference/configure-ptp.sh`. The dashboard reports the current clock discipline honestly: PTP when linuxptp is running, otherwise NTP/timesync/chrony state and sample skew.

## GB100/GB200 Telemetry

The GB100/GB200 package layers DCGM Exporter, optional app/workload instrumentation, optional NVML confidential-computing status, optional facility/coolant data, Prometheus rules, Grafana dashboards, alerts, validation, and a support-report CLI.

Common commands:

```sh
make run-local
make deploy-k8s
make validate-gpu
make package-gb100
```

Key files:

- `install.sh`
- `docs/install.md`
- `metrics/gb100-dcgm-fields.csv`
- `prometheus/gb100-recording-rules.yml`
- `alerts/gb100-alerts.yml`
- `grafana/gb100-*.json`
- `collectors/app_telemetry_exporter.py`
- `bin/gb100-telemetry-report`

The stack does not invent unsupported metrics. Unsupported or source-specific fields are marked profiler-required, app-instrumentation-required, external-system-required, unsupported, or benchmark-required. See `docs/metric-capability-matrix.md`, `docs/architecture.md`, `docs/unsupported-metrics.md`, and `docs/runbook.md`.

## Data Contracts

The primary normalized feed is `turba.ingestion.v1`. Source bundles can include:

- `sources.prometheus`
- `sources.dcgm`
- `sources.kubernetes`
- `sources.scheduler`
- `sources.grafana`
- `sources.ebpf`
- `sources.redfish`
- `sources.provider`
- `sources.opportunities`
- `ncclTraces`

Machine-readable schemas:

- `schemas/turba-ingestion.v1.schema.json`
- `schemas/turba-source-bundle.v1.schema.json`
- `schemas/turba-workspace.v2.schema.json`

Validate source bundles before import or upload:

```sh
node scripts/validate-source-bundle.js --require-source-export provider-pilot-bundle.json
```

Redfish/BMC hardware-management evidence is supported through `sources.redfish`. Use `scripts/fetch-redfish-source-export.js` for direct Redfish collection or `scripts/fetch-source-system-export.js --system redfish` when a customer source gateway exposes normalized snapshots. See `docs/redfish-integration.md`.

## Backend Ingestion

Provider pilots can run `server/ingestion-server.js` when uploads need controlled tenancy, signed upload URLs, role-aware access, audit logs, metrics, and retention policy.

```sh
TURBALANCE_TENANT_TOKENS="tenant-a:tenant-token:operator,admin:admin-token:admin" \
TURBALANCE_UPLOAD_SECRET="replace-with-random-secret" \
TURBALANCE_DATA_DIR=".turbalance-data" \
node server/ingestion-server.js
```

The backend supports direct ingest, signed uploads, audit export, tenant provisioning, token rotation, upload-key rotation, Prometheus metrics, local file/object-SQLite storage, and managed Postgres plus S3-compatible object storage. See `docs/backend-ingestion.md`.

## Security Model

Current product appliance defaults:

- API auth is required and backed by `build/product-secrets/api-tokens`.
- Collector bearer token and HMAC auth are loaded from secret files.
- Prometheus scrapes protected API metrics with a mounted viewer token.
- HTTPS dashboard/API edge runs on `:8443`.
- Collector mTLS edge runs on `:9443`.
- Generated TLS material lives in `build/product-tls/`.
- Generated secrets and TLS material are excluded from release tarballs and support bundles.

For customer exposure, replace the generated self-signed/local CA material with customer-managed certificates and wire identity provider/JWKS settings as needed. Larger customers should use the lakehouse production lane with managed storage, IAM, ExternalSecret, image signing, and Kubernetes mTLS overlays.

## Repository Layout

- `index.html`, `styles.css`, `app.js`: static dashboard shell, visual system, and browser app
- `analytics-core.js`: scoring, bottlenecks, provider economics, scheduler simulation, opportunities
- `nccl-trace-parser.js`, `nccl-trace-fixtures.js`: NCCL parser and fixtures
- `assets/`: turbalance logo and UI assets
- `docs/`: operator, productization, deployment, provider, telemetry, demo, and QA docs
- `fixtures/`: sample source bundles and provider/scheduler/eBPF/Redfish inputs
- `grafana/`: dashboard templates
- `lib/`: shared config and validation helpers
- `ops/`: product config, Kubernetes manifests, Terraform, source contracts, approvals
- `schemas/`: JSON Schemas
- `scripts/`: rollout, productization, exporters, validation, release, support, demo tooling
- `server/`: optional ingestion service
- `services/`: collector, API, query, raw writer, transform runner, alert engine, discovery API, system ID worker
- `tests/`: unit, workflow, productization, docs, platform, screenshot QA tests
- `.github/workflows/`: CI, Pages, visual QA, sandbox go-live, lakehouse platform

## Validation Inventory

The README intentionally references these files and tests because they are part of the documented surface:

- `build/turbalance-analytics-desktop.png`
- `docs/data-contract.md`
- `docs/backend-ingestion.md`
- `docs/operator-walkthrough.md`
- `docs/neo-cloud-provider-fit.md`
- `docs/provider-export-template.md`
- `docs/neo-cloud-pilot-validation.md`
- `docs/redfish-integration.md`
- `docs/telemetry-integration.md`
- `docs/operations.md`
- `docs/visual-qa.md`
- `docs/deployment.md`
- `docs/demo-logistics.md`
- `docs/demo-script.md`
- `docs/demo-release-checklist.md`
- `docs/e2e-data-platform.md`
- `docs/customer-productization.md`
- `schemas/turba-ingestion.v1.schema.json`
- `schemas/turba-source-bundle.v1.schema.json`
- `schemas/turba-workspace.v2.schema.json`
- `scripts/build-provider-overlay.js`
- `scripts/build-provider-pilot-bundle.js`
- `scripts/build-scheduler-overlay.js`
- `scripts/build-ebpf-overlay.js`
- `scripts/build-publish-ingestion-image.js`
- `scripts/generate-provider-pilot-config.js`
- `scripts/collect-local-machine-bundle.js`
- `scripts/collect-machine-fleet-bundle.js`
- `scripts/push-live-machine-telemetry.js`
- `scripts/rollout-production-fleet.js`
- `scripts/run-live-lakehouse-fleet.js`
- `scripts/render-product-runtime.js`
- `scripts/turbalance-doctor.js`
- `scripts/turbalance-support-bundle.js`
- `scripts/package-product-release.js`
- `scripts/manage-product-release.js`
- `scripts/manage-product-controller-services.js`
- `scripts/manage-product-observability.js`
- `scripts/generate-product-edge-tls.js`
- `scripts/manage-product-edge.js`
- `scripts/generate-product-secrets.js`
- `scripts/apply-product-security.js`
- `scripts/prepare-demo.js`
- `scripts/validate-provider-readiness.js`
- `scripts/run-provider-go-live-gates.js`
- `scripts/run-sandbox-go-live.js`
- `scripts/run-sandbox-source-gateway.js`
- `scripts/fetch-source-system-export.js`
- `scripts/fetch-redfish-source-export.js`
- `scripts/fetch-prometheus-source-export.js`
- `scripts/render-managed-kubernetes.js`
- `scripts/validate-source-contracts.js`
- `scripts/validate-source-approvals.js`
- `scripts/run-live-pilot-burn-in.js`
- `scripts/validate-source-bundle.js`
- `scripts/run-screenshot-qa.js`
- `scripts/run-retention-job.js`
- `scripts/provision-tenant.js`
- `scripts/provision-customer-iam.js`
- `scripts/run-provider-pilot-export-job.js`
- `scripts/build-lakehouse-platform-images.js`
- `scripts/render-lakehouse-secrets.js`
- `scripts/render-lakehouse-kustomize-overlay.js`
- `scripts/render-lakehouse-single-host-overlay.js`
- `scripts/package-lakehouse-release.js`
- `scripts/validate-lakehouse-production-config.js`
- `scripts/generate-lakehouse-production-env.js`
- `scripts/create-lakehouse-production-env-from-values.js`
- `scripts/validate-lakehouse-secret-material.js`
- `scripts/sync-lakehouse-aws-secrets.js`
- `scripts/validate-lakehouse-externalsecrets.js`
- `scripts/validate-lakehouse-image-registry.js`
- `scripts/generate-lakehouse-image-lock.js`
- `scripts/sign-lakehouse-images.js`
- `scripts/validate-lakehouse-live-observability.js`
- `scripts/validate-lakehouse-terraform.js`
- `scripts/run-lakehouse-terraform-rollout.js`
- `scripts/validate-lakehouse-kubernetes-release.js`
- `scripts/validate-lakehouse-secret-iam-consistency.js`
- `scripts/validate-lakehouse-ebpf-probe-package.js`
- `scripts/validate-lakehouse-live-prerequisites.js`
- `scripts/validate-lakehouse-release-supply-chain.js`
- `scripts/package-lakehouse-native-ebpf.js`
- `scripts/generate-lakehouse-change-window.js`
- `scripts/create-lakehouse-production-activation-bundle.js`
- `scripts/prepare-lakehouse-target-host.js`
- `scripts/prepare-lakehouse-local-registry.js`
- `scripts/bootstrap-lakehouse-production-material.js`
- `scripts/prepare-lakehouse-operator-workstation.js`
- `scripts/run-lakehouse-image-release.js`
- `scripts/report-lakehouse-production-gaps.js`
- `scripts/validate-lakehouse-slo-policy.js`
- `scripts/prepare-screenshot-qa.js`
- `scripts/collect-lakehouse-ebpf-rollout-evidence.js`
- `scripts/audit-lakehouse-production-readiness.js`
- `scripts/run-lakehouse-go-live.js`
- `scripts/run-lakehouse-production-smoke.js`
- `scripts/run-lakehouse-load-test.js`
- `scripts/run-lakehouse-cluster-smoke.js`
- `scripts/run-lakehouse-burn-in.js`
- `scripts/run-ebpf-fleet-validation.js`
- `scripts/validate-ebpf-agent-host.js`
- `scripts/validate-lakehouse-security.js`
- `scripts/validate-lakehouse-alerts-dashboards.js`
- `scripts/generate-telemetry-protos.sh`
- `services/platform_common/platform_common/observability.py`
- `services/raw-writer/raw_writer/writer.py`
- `services/raw-writer/raw_writer/storage.py`
- `services/raw-writer/raw_writer/operations.py`
- `services/collector-gateway/collector_gateway/app.py`
- `services/collector-gateway/collector_gateway/security.py`
- `services/collector-gateway/collector_gateway/identity.py`
- `services/collector-gateway/collector_gateway/queue.py`
- `services/collector-gateway/collector_gateway/backpressure.py`
- `services/collector-gateway/collector_gateway/replay.py`
- `services/collector-gateway/collector_gateway/grpc_server.py`
- `services/queue-gateway/queue_gateway/app.py`
- `services/duckdb-query-service/duckdb_query_service/query.py`
- `services/transform-runner/transform_runner/runner.py`
- `services/transform-runner/transform_runner/validation.py`
- `services/alert-engine/alert_engine/engine.py`
- `services/alert-engine/alert_engine/router.py`
- `services/alert-engine/alert_engine/store.py`
- `services/api-server/api_server/app.py`
- `services/api-server/api_server/auth.py`
- `lakehouse/sqlmesh/models/vs_principal_resource_mode.sql`
- `lakehouse/sqlmesh/models/vs_gpu_starvation.sql`
- `lakehouse/sqlmesh/models/vs_alert_candidates.sql`
- `lakehouse/dbt/models/vs_alert_candidates.sql`
- `deploy/docker/lakehouse-compose.yml`
- `deploy/docker/Dockerfile.ebpf-agent`
- `deploy/docker/Dockerfile.dagster`
- `deploy/docker/Dockerfile.sqlmesh`
- `deploy/docker/otel-collector-config.yaml`
- `deploy/docker/otel-collector-config.production.yaml`
- `deploy/docker/grafana/provisioning/datasources/turbalance-api.yml`
- `deploy/docker/grafana/provisioning/dashboards/lakehouse.yml`
- `deploy/docker/product-edge-compose.yml`
- `deploy/docker/product-edge/nginx.conf`
- `deploy/docker/grafana-runtime-compose.secure.yml`
- `deploy/docker/grafana-runtime/prometheus.secure.yml`
- `ops/kubernetes/lakehouse-platform.yaml`
- `ops/kubernetes/lakehouse-agent-daemonset.yaml`
- `ops/kubernetes/lakehouse-queue-gateway.yaml`
- `ops/kubernetes/lakehouse-alert-routing.yaml`
- `ops/kubernetes/lakehouse-managed-storage.yaml`
- `ops/kubernetes/lakehouse-otel-backend-secret.yaml`
- `ops/kubernetes/lakehouse-otel-collector.yaml`
- `ops/kubernetes/lakehouse-mtls.yaml`
- `ops/kubernetes/mtls/kustomization.yaml`
- `ops/kubernetes/lakehouse/base/kustomization.yaml`
- `ops/kubernetes/lakehouse/managed-storage/kustomization.yaml`
- `ops/kubernetes/lakehouse/otel-backend/kustomization.yaml`
- `ops/kubernetes/lakehouse/spire/kustomization.yaml`
- `ops/kubernetes/lakehouse/production/kustomization.yaml`
- `ops/kubernetes/lakehouse-prometheus-rules.yaml`
- `ops/kubernetes/ingestion-deployment.yaml`
- `ops/kubernetes/ingestion-retention-cronjob.yaml`
- `ops/kubernetes/provider-export-cronjob.yaml`
- `ops/pilot-provider.sandbox.json`
- `ops/source-contracts.sandbox.json`
- `ops/source-approvals.sandbox.json`
- `grafana/turbalance-lakehouse-virtual-sensors.json`
- `grafana/turbalance-provider-overview.json`
- `server/ingestion-oidc.js`
- `server/ingestion-server.js`
- `server/ingestion-secrets.js`
- `server/ingestion-storage.js`
- `tests/provider-image.test.js`
- `tests/provider-config-generator.test.js`
- `tests/prepare-demo.test.js`
- `tests/local-machine-bundle.test.js`
- `tests/productization.test.js`
- `tests/provider-readiness.test.js`
- `tests/provider-go-live-gates.test.js`
- `tests/sandbox-go-live.test.js`
- `tests/neo-cloud-provider-fixture.test.js`
- `tests/provider-exporter.test.js`
- `tests/scheduler-exporter.test.js`
- `tests/ebpf-exporter.test.js`
- `tests/prometheus-source-exporter.test.js`
- `tests/redfish-source-exporter.test.js`
- `tests/spark1-kafka.test.js`
- `tests/source-system-collectors.test.js`
- `tests/source-contracts.test.js`
- `tests/source-approvals.test.js`
- `tests/provider-pilot-bundler.test.js`
- `tests/provider-pilot-export-job.test.js`
- `tests/ingestion-oidc.test.js`
- `tests/ingestion-secrets.test.js`
- `tests/ingestion-storage.test.js`
- `tests/managed-storage.test.js`
- `tests/ingestion-server.test.js`
- `tests/provision-tenant.test.js`
- `tests/provision-customer-iam.test.js`
- `tests/render-managed-kubernetes.test.js`
- `tests/live-pilot-burn-in.test.js`
- `tests/retention-job.test.js`
- `tests/source-bundle-validator.test.js`
- `tests/evidence-pack-export.test.js`
- `tests/source-bundle-validation.test.js`
- `tests/platform-lakehouse.test.js`
- `tests/lakehouse-go-live.test.js`
- `tests/lakehouse-production-readiness.test.js`

Run `node tests/run-all.js` before sharing a customer build. The last full local run passed after the Redfish bridge, product edge, and mTLS work, including screenshot QA for desktop and mobile.

## Deployment Boundary

This repo is now productized enough for friendly pilot delivery on a single controller: managed services, auth defaults, HTTPS/mTLS edge, Prometheus/Grafana, fleet rollout, Redfish source integration, source-owner approvals, doctor checks, support bundles, checksummed release packages, install/update/rollback, and customer-facing docs are implemented.

It is not yet a fully managed multi-tenant SaaS. Before broader customer rollout, replace lab-generated certificates with customer-managed certs, wire the customer identity provider, pick managed storage/metadata backends, decide HA topology, and run the lakehouse production go-live lane for environments that need Kubernetes-scale operations.
