# Turba Analytics

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
- Browser-local persistence for imported job runs, per-run baselines, and the last analysis timestamp
- Shared `analytics-core.js` calculation module with focused Node tests
- NCCL trace fixtures and parser that attribute collective time by operation and topology tier
- Topology tier metadata surfaced in the placement panel
- File and API JSON ingestion for external `turba.ingestion.v1` feeds, source metric bundles, and NCCL traces
- Persisted analysis snapshots with trend views for efficiency, waste, NCCL time, and cost

## Data contract

`app.js` keeps sample runs in `SAMPLE_INGESTION`, a versioned ingestion payload with shared model, user, team, and cluster entities. Prometheus, DCGM, Kubernetes, and NCCL trace sample exports are merged through source-specific importers before the dashboard normalizes each run into analysis records. The merged ingestion payload, per-run baselines, and persisted analysis snapshots are stored in `localStorage` under `turba.analytics.workspace.v2`, then reloaded on the next visit. Each run groups metrics by source domain: allocation, utilization, communication, input pipeline, memory, scheduler, reliability, configuration, work, baseline, placement, and trace attribution.

External imports can be full `turba.ingestion.v1` feeds, `{ "ingestion": ... }` wrappers, source bundles with `sources.prometheus`, `sources.dcgm`, `sources.kubernetes`, and `ncclTraces`, or a `runs` array with compatible entities. `fixtures/external-source-bundle.json` is a local fetch/import example.

## Tests

Run `node tests/analytics-core.test.js` to validate core efficiency, bottleneck, what-if, fingerprint, regression, and trend calculations.
Run `node tests/nccl-trace-parser.test.js` to validate NCCL operation and topology-tier attribution.
Run `node tests/external-ingestion-fixture.test.js` to validate the external source bundle fixture.

## Current status

The original prototype backlog is implemented. Further work should be driven by live operator workflows and production telemetry shape.
