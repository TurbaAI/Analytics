# turbalance Analytics

![turbalance Analytics desktop screenshot](build/turbalance-analytics-desktop.png)

Screenshot artifacts live in `build/`, including `build/turbalance-analytics-desktop.png` and `build/turbalance-analytics-mobile.png`. Regenerate them after material layout changes and run the checklist in `docs/visual-qa.md` before sharing a demo build.

## Overview

turbalance Analytics is a static operator review surface for AI infrastructure. It answers a deceptively expensive question: where are accelerator performance and GPU-hour dollars being lost, and what should the operator do next?

The current product has a browser-first dashboard plus an optional controlled ingestion service. The dashboard loads a seeded workspace, accepts JSON exports from existing systems, normalizes them into a shared analysis model, and presents an operator workflow for diagnosing inefficient training or inference workloads. The backend service adds authenticated tenant-scoped ingest, signed upload URLs, audit logs, and retention controls for pilots that need a safer upload path. turbalance is especially shaped for neo-cloud GPU providers, AI platform teams, scheduler owners, capacity planners, support engineers, and customer-success teams that need to turn raw telemetry into explainable action.

Open `index.html` directly in a browser, or serve the repository with a local static server. All imported data is processed in the browser and persisted to `localStorage` under `turba.analytics.workspace.v2`.

## What It Does

turbalance connects infrastructure telemetry, scheduler evidence, provider commercial context, and operator recommendations into one review loop:

1. Select a job, model, user, team, cluster, tenant, account, or reservation.
2. Read useful compute, waste, cost, bottleneck, topology, and provider impact.
3. Compare scheduler/capacity scenarios before changing placement policy.
4. Open Grafana handoff links or source context when deeper telemetry validation is needed.
5. Rank opportunities by estimated impact, risk, and confidence.
6. Export a redacted evidence pack or workspace for support, QBR, renewal, and capacity-planning handoff.

The dashboard remains intentionally static. It does not require live cluster credentials, live billing credentials, or direct access to customer systems. Production telemetry is connected by exporting source-shaped JSON from existing observability, scheduler, billing, and support systems, then importing it directly in the browser or sending it through the optional backend ingestion service.

## Quick Start

Open the dashboard:

```sh
open index.html
```

For API fetches or relative fixture URLs, a local static server is often more reliable than `file://`:

```sh
python3 -m http.server 8000
```

Then open `http://127.0.0.1:8000/`.

Try the provider-focused sample:

1. Open the app.
2. Click `Import JSON`.
3. Select `fixtures/neo-cloud-provider-bundle.json`.
4. Switch between `Tenant`, `Account`, and `Reservation` scopes.
5. Review the Provider Lens, Scheduler Simulator, Grafana Handoff, Opportunity Engine, and evidence-pack export.

Run the full validation suite:

```sh
node tests/run-all.js
```

## Current Status

The original prototype backlog is implemented. The repo includes:

- A polished branded static GUI using the turbalance mark and wordmark from `assets/turbalance-mark.png` and `assets/turbalance-analytics-logo.png`
- Browser-local workspace persistence, reset, restore, normal export, redacted export, and evidence-pack export
- Normalized ingestion, source-bundle, and workspace schemas
- Importers for Prometheus, DCGM, Kubernetes, scheduler/admission systems, Grafana handoff links, Linux eBPF summaries, provider commercial overlays, upstream opportunities, and NCCL traces
- Neo-cloud provider workflows for tenant/account/reservation views, queue SLOs, sellable waste, commit burn, margin pressure, and portfolio risk
- Scheduler/capacity scenario simulation and an Opportunity Engine for ranked actions
- Tests, fixtures, exporter examples, GitHub Actions CI, Playwright visual QA workflow, and GitHub Pages packaging
- Optional backend ingestion service with bearer, HS256 JWT, and RS256/JWKS auth, tenant isolation, role-aware controls, signed uploads, token and upload-key rotation, audit export, Prometheus metrics, source-bundle validation, object/SQLite storage mode, secret-file support, provider export jobs, and retention cleanup

Real production use still requires operator-provided exports from the relevant systems. Automated screenshot QA runs when Playwright is available and skips cleanly otherwise; browser visual QA should still be completed locally before a customer-facing demo.

## Feature Map

### Diagnosis And Review

- Job, model, user, team, cluster, tenant, account, and reservation scopes
- Useful compute score based on useful accelerator time divided by allocated accelerator time
- Metric ribbon for allocated GPU-hours, useful GPU-hours, wasted GPU-hours, waste dollars, and cost per useful GPU-hour
- Truth table for useful work, communication wait, input pipeline stalls, placement fragmentation, and stranded resources
- Bottleneck attribution with primary and secondary causes
- Customer outcome report with copy action
- Same-pod placement what-if toggle
- Baseline and regression checks
- Workload fingerprinting
- Persisted trend snapshots for efficiency, waste, NCCL time, cost, sellable waste, opportunity impact, commit burn, queue SLO, and gross margin

### Topology And Trace Evidence

- Placement map with rack, pod, active node, partial-node, cross-rack, and cross-pod signals
- NCCL trace parser and fixtures
- Collective attribution by operation and topology tier
- Trace-derived communication, cross-rack, and cross-pod signals

### Scheduler And Capacity

- Scheduler event importer for queue, admission, locality, preemption, backfill, and placement-retry evidence
- Scheduler/capacity simulator for repack, locality-group, and queue-SLO what-if scenarios
- Scenario ranking by projected GPU-hour recovery, dollar upside, queue minutes saved, useful compute, placement quality, and confidence
- Scheduler evidence redaction in workspaces and evidence packs

### Neo-Cloud Provider Operations

- Provider Lens for tenant, account, reservation, billing model, SLO, customer tier, sellable waste, commit burn, queue SLO, and gross margin
- Provider portfolio risk tables for sellable waste, queue SLO misses, margin pressure, and noisy-neighbor candidates
- First-class tenant, account, and reservation scopes
- Provider source overlays through `sources.provider` for commercial and support metadata without requiring live billing credentials
- Evidence-pack workflow for support escalations, QBRs, renewals, and capacity-planning reviews

### Opportunity Engine

- Locally computed ranked actions across Useful Compute FinOps, fabric/topology, scheduler/capacity, provider SLO risk, inference economics, data pipeline, host-kernel/eBPF, fleet reliability, energy/carbon, and evidence-pack categories
- Optional `sources.opportunities` overlay for upstream recommendation systems
- Impact estimates in dollars and GPU-hours
- Risk, confidence, owner, evidence, and recommendation fields
- Markdown evidence-pack export for the selected scope with summary, scheduler what-if, Grafana handoff rows, ranked recommendations, impact, and redacted source context

### Grafana Support

- `sources.grafana` overlay for dashboard and Explore handoff links tied to selected runs, tenants, accounts, or reservations
- Grafana Handoff GUI panel with dashboard, datasource, variables, time range, and links
- Redaction for Grafana base URLs, instance names, org IDs, dashboard UIDs, dashboard slugs, dashboard titles, folders, datasource UIDs, datasource names, variables, and full dashboard/Explore URLs
- Ready-to-import dashboard template at `grafana/turbalance-provider-overview.json`

### Linux eBPF Support

- `sources.ebpf` host-summary importer for CPU scheduling, socket/network, storage, and noisy-neighbor evidence
- Mapping of eBPF summaries into existing lanes: network wait, storage wait, CPU preprocessing pressure, contention, latency tail, and noise events
- Exporter example in `scripts/build-ebpf-overlay.js`
- Sample input in `fixtures/ebpf-export-inputs/host-samples.json`

## Data Model And Contracts

The primary normalized feed is `turba.ingestion.v1`. Each run can include:

- `refs`: model, user, team, cluster, tenant, account, and reservation keys
- `allocation`: duration, GPU count, allocated GPU-hours, and GPU model
- `utilization`: GPU utilization, useful compute, SM occupancy, and tensor-core use
- `communication`: NCCL time, network wait, cross-rack traffic, cross-pod traffic, and all-to-all time
- `inputPipeline`: dataloader, storage, and CPU preprocessing stalls
- `memory`: HBM capacity, HBM bandwidth, fragmentation, and KV-cache pressure
- `scheduler`: placement quality, idle GPUs, partial nodes, queue wait, admission attempts, placement retries, and related capacity signals
- `reliability`: noise events, contention, step regularity, and latency tail
- `configuration`: precision loss and batch inefficiency
- `work`: tokens, steps, or inference requests
- `baseline`: comparison values for regression checks
- `placement`: allocated node list and partial node list
- `schedulerEvidence`: scheduler/admission source evidence
- `grafanaContext`: dashboard, datasource, variable, time-range, and link context
- `commercial`: provider billing and commitment metadata
- `slo`: queue, efficiency, priority, and support-ticket targets
- `opportunities`: optional upstream actions

Machine-readable schemas:

- `schemas/turba-ingestion.v1.schema.json`
- `schemas/turba-source-bundle.v1.schema.json`
- `schemas/turba-workspace.v2.schema.json`

The app accepts these import shapes:

- Full `turba.ingestion.v1` feeds
- `{ "ingestion": ... }` wrappers
- Source bundles with `sources.prometheus`, `sources.dcgm`, `sources.kubernetes`, `sources.scheduler`, `sources.grafana`, `sources.ebpf`, `sources.provider`, `sources.opportunities`, and `ncclTraces`
- A bare `runs` array with compatible entities
- Full `turba.workspace.v2` workspace exports

See `docs/data-contract.md` for field-level examples and validation behavior.

## Source Overlays

Source overlays let teams keep existing observability and business systems in place while emitting small JSON bundles keyed by `runId`.

| Source | Purpose | Example |
| --- | --- | --- |
| `sources.prometheus` | Ratios and counters for utilization, useful compute, NCCL time, network wait, input stalls, queue wait, tokens, steps, and requests | `fixtures/external-source-bundle.json` |
| `sources.dcgm` | NVIDIA/DCGM hardware counters for SM, tensor core, HBM, fragmentation, and KV-cache pressure | `docs/telemetry-integration.md` |
| `sources.kubernetes` | Pod/job state, namespace, selectors, allocation, scheduler state, and placement | `fixtures/provider-export-inputs/kubernetes-jobs.json` |
| `sources.scheduler` | Queue, admission, placement retry, locality miss, preemption, backfill, and requested GPU shape evidence | `fixtures/scheduler-export-inputs/scheduler-events.json` |
| `sources.grafana` | Dashboard and Explore links, datasource metadata, time range, and variables | `grafana/turbalance-provider-overview.json` |
| `sources.ebpf` | Host-side CPU scheduling, socket/network, storage, and noisy-neighbor summaries | `fixtures/ebpf-export-inputs/host-samples.json` |
| `sources.provider` | Tenant, account, reservation, billing, commitment, support, and SLO metadata | `fixtures/provider-overlay-template.json` |
| `sources.opportunities` | Imported recommendations from external tuners, simulators, support workflows, or capacity tools | `fixtures/external-source-bundle.json` |
| `ncclTraces` | Collective operation traces used for topology-tier attribution | `nccl-trace-fixtures.js` |

Exporter examples:

```sh
node scripts/build-provider-overlay.js fixtures/provider-export-inputs > provider-overlay.json
node scripts/build-scheduler-overlay.js fixtures/scheduler-export-inputs > scheduler-overlay.json
node scripts/build-ebpf-overlay.js fixtures/ebpf-export-inputs > ebpf-overlay.json
node scripts/build-provider-pilot-bundle.js fixtures/provider-pilot-export-inputs > provider-pilot-bundle.json
```

Validate source bundles before import or upload:

```sh
node scripts/validate-source-bundle.js --require-source-export provider-pilot-bundle.json
```

## Backend Ingestion

Provider pilots can run `server/ingestion-server.js` when uploads need controlled tenancy, signatures, role-aware access, audit logs, and retention policy.

```sh
TURBALANCE_TENANT_TOKENS="tenant-a:tenant-token:operator,admin:admin-token:admin" \
TURBALANCE_UPLOAD_SECRET="replace-with-random-secret" \
TURBALANCE_DATA_DIR=".turbalance-data" \
node server/ingestion-server.js
```

The service provides:

- `POST /v1/uploads/sign`: authenticated signed upload URL creation
- `PUT /v1/uploads/:uploadId`: short-lived signed upload path
- `POST /v1/ingestion`: authenticated direct ingest path
- `GET /v1/audit`: tenant-scoped audit rows
- `GET /v1/audit/export`: tenant-scoped audit export as JSON, JSONL, or CSV
- `GET /metrics`: Prometheus-style backend operational metrics
- `POST /v1/retention/run`: retention cleanup
- `GET /v1/tenants` and `POST /v1/tenants`: admin tenant registry controls
- `POST /v1/tokens/rotate`: admin tenant token rotation
- `POST /v1/upload-keys/rotate`: admin signed-upload key rotation

All accepted uploads are validated with `lib/source-bundle-validator.js`, JWT/JWKS verification lives in `server/ingestion-oidc.js`, secret-file loading lives in `server/ingestion-secrets.js`, uploads are stored through `server/ingestion-storage.js`, and audit rows are logged to the configured control plane. See `docs/backend-ingestion.md` for the full API.

## Privacy And Redaction

turbalance is designed for sensitive operator workflows. The browser prototype can export:

- A normal `turba.workspace.v2` workspace for internal restore and handoff
- A redacted workspace that preserves metrics while replacing identifiers with deterministic surrogates
- A Markdown evidence pack for human review

Redaction covers run IDs, model/user/team/cluster/tenant/account/reservation refs, commercial contract IDs, support tickets, Kubernetes namespaces and pod selectors, Slurm job IDs, scheduler queues and admission classes, provider export IDs, billing accounts, reservation windows, eBPF hosts/nodes/pods/containers/cgroups, Grafana dashboard/link identifiers, and imported opportunity free text.

Numeric evidence, trend snapshots, cost estimates, scheduler what-if rows, and high-level recommendations are preserved so support and capacity teams can reason about the issue without leaking raw customer identifiers.

## Repository Layout

- `index.html`: static dashboard shell
- `styles.css`: responsive visual system and panel layouts
- `app.js`: browser app, ingestion, rendering, persistence, redaction, and export logic
- `analytics-core.js`: shared scoring, bottleneck, provider economics, scheduler simulation, and opportunity calculations
- `nccl-trace-parser.js`: NCCL trace parser
- `nccl-trace-fixtures.js`: local trace fixtures
- `assets/`: turbalance logo assets
- `build/`: screenshot artifacts
- `docs/`: operator, telemetry, provider, deployment, visual QA, and demo documentation
- `fixtures/`: sample source bundles, workspace exports, provider overlays, scheduler events, eBPF inputs, and exporter inputs
- `grafana/`: Grafana dashboard templates, including `grafana/turbalance-provider-overview.json`
- `lib/`: shared validation helpers used by CLI tooling and the ingestion backend
- `ops/`: Kubernetes and Prometheus operation templates, including `ops/kubernetes/ingestion-deployment.yaml`, `ops/kubernetes/ingestion-retention-cronjob.yaml`, `ops/kubernetes/provider-export-cronjob.yaml`, `ops/kubernetes/ingestion-service-monitor.yaml`, and `ops/kubernetes/ingestion-prometheus-rules.yaml`
- `schemas/`: JSON Schemas for ingestion, source bundles, and workspaces
- `scripts/`: dependency-free exporter examples
- `server/`: optional controlled ingestion service and swappable file storage adapter
- `tests/`: syntax, fixture, schema, exporter, redaction, static wiring, and docs tests
- `.github/workflows/ci.yml`: CI verification
- `.github/workflows/pages.yml`: GitHub Pages static deployment

## Key Fixtures

- `fixtures/external-source-bundle.json`: canonical external source-bundle example
- `fixtures/neo-cloud-provider-bundle.json`: provider-focused demo bundle with tenants, reservations, SLOs, Prometheus metrics, scheduler evidence, Grafana links, eBPF evidence, and imported opportunities
- `fixtures/provider-overlay-template.json`: minimal provider overlay template
- `fixtures/provider-pilot-export-inputs/`: per-system pilot export inputs for the all-lanes bundle builder
- `fixtures/workspace-export.json`: canonical workspace export shape
- `fixtures/provider-export-inputs/kubernetes-jobs.json`: provider exporter Kubernetes sample input
- `fixtures/scheduler-export-inputs/scheduler-events.json`: scheduler exporter sample input
- `fixtures/ebpf-export-inputs/host-samples.json`: eBPF exporter sample input

## Operator Documentation

- [Data contract](docs/data-contract.md)
- [Backend ingestion](docs/backend-ingestion.md)
- [Operator walkthrough](docs/operator-walkthrough.md)
- [Neo-cloud provider fit](docs/neo-cloud-provider-fit.md)
- [Provider export template](docs/provider-export-template.md)
- [Neo-cloud pilot validation](docs/neo-cloud-pilot-validation.md)
- [Telemetry integration](docs/telemetry-integration.md)
- [Operations](docs/operations.md)
- [Visual QA checklist](docs/visual-qa.md)
- [Deployment](docs/deployment.md)
- [Demo script](docs/demo-script.md)
- [Demo release checklist](docs/demo-release-checklist.md)
- [Ingestion JSON Schema](schemas/turba-ingestion.v1.schema.json)
- [Source bundle JSON Schema](schemas/turba-source-bundle.v1.schema.json)
- [Workspace JSON Schema](schemas/turba-workspace.v2.schema.json)

## Testing

Run everything:

```sh
node tests/run-all.js
```

Focused test entry points:

- `tests/analytics-core.test.js`: core efficiency, bottleneck, what-if, fingerprint, regression, trend, provider economics, scheduler simulation, and opportunity calculations
- `tests/nccl-trace-parser.test.js`: NCCL operation and topology-tier attribution
- `tests/external-ingestion-fixture.test.js`: canonical external source-bundle fixture
- `tests/neo-cloud-provider-fixture.test.js`: provider overlays, SLO fields, provider economics, scheduler simulation, and opportunity generation
- `tests/provider-exporter.test.js`: provider exporter example
- `tests/scheduler-exporter.test.js`: scheduler exporter example
- `tests/ebpf-exporter.test.js`: eBPF host overlay exporter example
- `tests/provider-pilot-bundler.test.js`: all-lanes provider pilot bundle builder
- `tests/provider-pilot-export-job.test.js`: provider pilot export job wrapper for bundle generation and optional ingestion upload
- `tests/ingestion-oidc.test.js`: RS256/JWKS JWT validation, tenant mapping, and role mapping
- `tests/ingestion-secrets.test.js`: secret-file loading for tenant tokens, upload keys, and JWT secrets
- `tests/ingestion-storage.test.js`: file storage adapter uploads, audit rows, control JSON, and deletes
- `tests/ingestion-server.test.js`: signed upload, direct ingest, role-aware auth, JWKS auth, tenant provisioning, key rotation, metrics, audit export, and retention service behavior
- `tests/provision-tenant.test.js`: admin tenant bootstrap CLI and token issuance
- `tests/retention-job.test.js`: standalone retention job behavior
- `tests/source-bundle-validator.test.js`: source-bundle validation library and CLI
- `tests/workspace-export-fixture.test.js`: exported workspace shape
- `tests/evidence-pack-export.test.js`: Markdown evidence-pack redaction
- `tests/schemas.test.js`: schema files and fixture alignment
- `tests/source-bundle-validation.test.js`: source bundle preflight checks
- `tests/import-validation-copy.test.js`: import validation messages and helpers
- `tests/static-page-wiring.test.js`: static DOM IDs, script order, and dashboard control wiring
- `tests/docs-and-workflows.test.js`: docs, screenshots, schemas, scripts, Grafana template, and GitHub workflow entry points
- `scripts/provision-tenant.js`: admin helper for pilot tenant creation and ingest-token rotation
- `scripts/run-provider-pilot-export-job.js`: provider pilot export job for mounted source exports and optional ingestion upload
- `scripts/run-retention-job.js`: standalone retention job for cron or Kubernetes CronJob wiring
- `scripts/run-screenshot-qa.js`: desktop and mobile screenshot QA when Playwright is installed; skips by default when browser automation is unavailable

Use `git diff --check` before committing to catch whitespace issues.

## Deployment

The app can be hosted by any static file server that serves the root files plus `assets/`, `build/`, `fixtures/`, `docs/`, `schemas/`, `scripts/`, `grafana/`, `lib/`, and `server/`.

GitHub Actions:

- `.github/workflows/ci.yml` runs `node tests/run-all.js`, validates source bundles, and runs screenshot QA when browser automation is available.
- `.github/workflows/pages.yml` runs the full suite, validates source bundles, runs screenshot QA when available, assembles the static site, includes Grafana templates plus backend tooling, and deploys with GitHub Pages.

Enable GitHub Pages with GitHub Actions as the source before relying on the Pages deployment URL.

## Production Readiness Boundary

This repo is ready as a static pilot/demo surface, an integration contract for exported telemetry, and a controlled-ingestion reference implementation for early pilots. It is not yet a managed multi-tenant SaaS.

Current boundaries:

- Optional backend service with file mode and object/SQLite reference mode, not a horizontally scalable managed ingestion plane
- Bearer-token, HS256 JWT, RS256/JWKS, OIDC discovery, tenant mapping, tenant bootstrap CLI, and secret-file support, not a full customer IAM provisioning product
- Provider exporter jobs expect source exports mounted or staged by source-system owners; they do not yet run privileged live collectors against production systems
- Dedicated Visual QA workflow installs Playwright in CI; local screenshot QA still skips when Playwright is unavailable
- Directional estimates for waste, opportunity value, and scheduler recovery; validate against source systems before changing production policy or making customer commitments

Expected production next steps:

- Replace the local object/SQLite reference mode with the chosen cloud object store and managed database implementation
- Add customer IAM provisioning automation and production secret-manager bindings for the selected provider
- Replace placeholder Kubernetes image, PVC, Secret, and ConfigMap names with the pilot provider's managed deployment primitives
- Replace mounted/staged source-export jobs with approved source-specific collectors where each provider permits direct API access
