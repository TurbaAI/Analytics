# turbalance Analytics

![turbalance Analytics desktop screenshot](build/turbalance-analytics-desktop.png)

Screenshot artifact from `build/`; regenerate locally after material layout changes.

Focused MVP for answering where AI infrastructure performance and money are being lost, and why.

Open `index.html` in a browser. The current build is a static prototype with synthetic job data and no backend dependency.

## What is implemented

- Job, model, user, team, and cluster inventory scopes
- Job efficiency score based on useful accelerator time divided by allocated accelerator time
- Cluster utilization truth table
- Bottleneck attribution with primary and secondary causes
- Topology placement map with cross-pod and cross-rack signals
- Cost per useful GPU-hour and waste estimate
- Workload fingerprinting
- Baseline and regression checks
- Customer outcome report copy action
- Same-pod placement what-if toggle
- Normalized `turba.ingestion.v1` sample ingestion envelope with entity references and grouped metric domains
- Prometheus, DCGM, and Kubernetes sample importers that map source-shaped exports into the shared ingestion sections
- Linux eBPF host-summary importer for CPU scheduling, socket/network, storage, and noisy-neighbor evidence
- Browser-local persistence for imported job runs, per-run baselines, and the last analysis timestamp
- Shared `analytics-core.js` calculation module with focused Node tests
- NCCL trace fixtures and parser that attribute collective time by operation and topology tier
- Topology tier metadata surfaced in the placement panel
- File and API JSON ingestion for external `turba.ingestion.v1` feeds, source metric bundles, and NCCL traces
- Persisted analysis snapshots with trend views for efficiency, waste, NCCL time, and cost
- Workspace export, restore, and sample reset controls for browser-local state
- Neo-cloud provider lens for tenant, account, reservation, billing model, SLO, sellable waste, commit burn, and gross-margin context
- Provider portfolio risk tables for sellable waste, queue SLO misses, margin pressure, and noisy-neighbor candidates
- Provider source overlays through `sources.provider` for commercial and support metadata without requiring live billing credentials
- First-class tenant, account, and reservation scopes for provider operations
- Redacted workspace export for tenant-safe support, QBR, and capacity-planning handoff

## Data contract

`app.js` keeps sample runs in `SAMPLE_INGESTION`, a versioned ingestion payload with shared model, user, team, and cluster entities. Prometheus, DCGM, Kubernetes, Linux eBPF, and NCCL trace sample exports are merged through source-specific importers before the dashboard normalizes each run into analysis records. The merged ingestion payload, per-run baselines, and persisted analysis snapshots are stored in `localStorage` under `turba.analytics.workspace.v2`, then reloaded on the next visit. The workspace can be exported as a `turba.workspace.v2` JSON file and restored through the same JSON import path. Each run groups metrics by source domain: allocation, utilization, communication, input pipeline, memory, scheduler, reliability, configuration, work, baseline, placement, and trace attribution.

External imports can be full `turba.ingestion.v1` feeds, `{ "ingestion": ... }` wrappers, source bundles with `sources.prometheus`, `sources.dcgm`, `sources.kubernetes`, `sources.ebpf`, `sources.provider`, and `ncclTraces`, or a `runs` array with compatible entities. `fixtures/external-source-bundle.json` is a local fetch/import example; `fixtures/neo-cloud-provider-bundle.json` is a provider-focused tenant and reservation overlay example; `fixtures/provider-overlay-template.json` is a provider export template. `scripts/build-provider-overlay.js` builds a provider overlay from example Kubernetes, Slurm, billing, and support inputs in `fixtures/provider-export-inputs/`. `scripts/build-ebpf-overlay.js` builds an eBPF host overlay from summarized host samples in `fixtures/ebpf-export-inputs/`.

## Operator docs

- [Data contract](docs/data-contract.md)
- [Operator walkthrough](docs/operator-walkthrough.md)
- [Neo-cloud provider fit](docs/neo-cloud-provider-fit.md)
- [Provider export template](docs/provider-export-template.md)
- [Neo-cloud pilot validation](docs/neo-cloud-pilot-validation.md)
- [Telemetry integration](docs/telemetry-integration.md)
- [Visual QA checklist](docs/visual-qa.md)
- [Deployment](docs/deployment.md)
- [Demo script](docs/demo-script.md)
- [Demo release checklist](docs/demo-release-checklist.md)
- [Ingestion JSON Schema](schemas/turba-ingestion.v1.schema.json)
- [Source bundle JSON Schema](schemas/turba-source-bundle.v1.schema.json)
- [Workspace JSON Schema](schemas/turba-workspace.v2.schema.json)

## Deployment

CI runs on pushes and pull requests through `.github/workflows/ci.yml`. GitHub Pages deployment is available through `.github/workflows/pages.yml`; enable Pages with GitHub Actions as the source.

## Tests

Run `node tests/run-all.js` to execute the full syntax and fixture test suite.

Run `node tests/analytics-core.test.js` to validate core efficiency, bottleneck, what-if, fingerprint, regression, and trend calculations.
Run `node tests/nccl-trace-parser.test.js` to validate NCCL operation and topology-tier attribution.
Run `node tests/external-ingestion-fixture.test.js` to validate the external source bundle fixture.
Run `node tests/neo-cloud-provider-fixture.test.js` to validate provider overlays, SLO fields, and provider economics.
Run `node tests/provider-exporter.test.js` to validate the provider exporter example.
Run `node tests/ebpf-exporter.test.js` to validate the eBPF host overlay exporter example.
Run `node tests/workspace-export-fixture.test.js` to validate exported workspace shape.
Run `node tests/schemas.test.js` to validate schema files and fixture alignment.
Run `node tests/source-bundle-validation.test.js` to validate source bundle preflight checks.
Run `node tests/import-validation-copy.test.js` to validate import validation messages and helpers.
Run `node tests/static-page-wiring.test.js` to validate static DOM IDs, script order, and dashboard control wiring.
Run `node tests/docs-and-workflows.test.js` to validate docs, screenshots, and GitHub workflow entry points.

## Current status

The original prototype backlog is implemented. Real production telemetry requires an operator-provided export from Prometheus, DCGM, Kubernetes, Linux eBPF summaries, and NCCL traces. Browser visual QA should be completed locally with the checklist in `docs/visual-qa.md`.
