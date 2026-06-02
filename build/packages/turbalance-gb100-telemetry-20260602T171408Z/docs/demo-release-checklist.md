# Demo Release Checklist

Use this checklist before sharing a turbalance Analytics demo build with neo-cloud provider operators.

## Build Readiness

1. Run `node scripts/prepare-demo.js --out-dir build/demo --host-url http://192.168.10.101:8000 --remote-machine user@192.168.10.20` on the demo machine.
2. Run `node tests/run-all.js`.
3. Run `node scripts/validate-source-bundle.js --require-source-export`.
4. Run `node scripts/run-screenshot-qa.js` in an environment with Playwright when screenshots must be verified.
5. Confirm `.github/workflows/ci.yml` is green for the latest commit.
6. Confirm GitHub Pages is enabled with GitHub Actions as the source.
7. Rerun `.github/workflows/pages.yml` and confirm the deployment URL is live.

## Data Readiness

1. Import `fixtures/neo-cloud-provider-bundle.json`.
2. Validate `Tenant`, `Account`, and `Reservation` scopes.
3. Review provider portfolio risk tables for sellable waste, queue SLO misses, margin pressure, and noisy-neighbor candidates.
4. Review the Scheduler Simulator and confirm repack, locality, and queue-SLO scenarios produce directional recovery estimates.
5. Review the Grafana Handoff panel and confirm imported `sources.grafana` rows appear with dashboard or Explore links.
6. Review the Opportunity Engine action center and confirm imported `sources.opportunities` rows appear with computed actions.
7. Export an evidence pack and confirm scheduler what-if, Grafana handoff, and source context redaction are present.
8. Export a normal workspace and a redacted workspace.
9. Generate a provider overlay with `node scripts/build-provider-overlay.js fixtures/provider-export-inputs`.
10. Generate a scheduler overlay with `node scripts/build-scheduler-overlay.js fixtures/scheduler-export-inputs`.
11. Generate an eBPF host overlay with `node scripts/build-ebpf-overlay.js fixtures/ebpf-export-inputs`.
12. Generate a full provider pilot bundle with `node scripts/build-provider-pilot-bundle.js fixtures/provider-pilot-export-inputs`.
13. Confirm `build/demo/provider-pilot-bundle.json`, `build/demo/live-machine-bundle.json`, `build/demo/source-bundle-validation.json`, `build/demo/provider-readiness.json`, and `build/demo/demo-readiness.md` exist from `scripts/prepare-demo.js`.
14. Validate source bundles against `schemas/turba-source-bundle.v1.schema.json` with `node scripts/validate-source-bundle.js --require-source-export`.
15. Validate `grafana/turbalance-provider-overview.json` imports into the target Grafana instance when the demo includes Grafana handoff.
16. If demoing controlled uploads, run `server/ingestion-server.js` and complete signed upload, JWKS/JWT auth, tenant provisioning, token/key rotation, metrics, audit export, and retention smoke tests.
17. If demoing managed retention, run `node scripts/run-retention-job.js --json` against the pilot data directory.

## Visual Readiness

1. Run the checks in `docs/visual-qa.md` on desktop and mobile widths.
2. Regenerate `build/turbalance-analytics-desktop.png` and `build/turbalance-analytics-mobile.png` after layout changes.
3. Confirm no text overlap in provider lens, provider portfolio tables, Grafana Handoff links, Scheduler Simulator cards, Opportunity Engine rows, trend metrics, and mobile controls.
4. Confirm eBPF-enriched imports do not create misleading GPU claims; host evidence should only affect network wait, input pipeline, contention, latency tail, and noise signals.
5. For `192.168.10.101`, confirm the dashboard auto-loads `build/demo/live-machine-bundle.json` with NUC14E and SPARK1 rows; use `?demo=sample` only when intentionally showing the canned provider fixture.
6. For `192.168.10.20`, confirm the dashboard auto-loads `build/demo/live-machine-bundle.json` with the standalone `SPARK1` row and reports NVIDIA telemetry availability exactly as observed.
7. For `100.96.89.98`, confirm the dashboard auto-loads `build/demo/live-machine-bundle.json` with the standalone `DGX-pat` row and reports NVIDIA telemetry availability exactly as observed.

## Talk Track Readiness

1. Follow `docs/demo-script.md`.
2. Use `docs/demo-logistics.md` for the hardware and NVIDIA SM scheduler answer.
3. Use `docs/neo-cloud-pilot-validation.md` for provider pilot acceptance criteria.
4. Do not claim live cluster connectivity, live billing-system connectivity, current screenshots, or a live Pages URL unless each item has been verified for the latest commit.
