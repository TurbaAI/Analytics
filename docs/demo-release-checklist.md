# Demo Release Checklist

Use this checklist before sharing a turbalance Analytics demo build with neo-cloud provider operators.

## Build Readiness

1. Run `node tests/run-all.js`.
2. Confirm `.github/workflows/ci.yml` is green for the latest commit.
3. Confirm GitHub Pages is enabled with GitHub Actions as the source.
4. Rerun `.github/workflows/pages.yml` and confirm the deployment URL is live.

## Data Readiness

1. Import `fixtures/neo-cloud-provider-bundle.json`.
2. Validate `Tenant`, `Account`, and `Reservation` scopes.
3. Review provider portfolio risk tables for sellable waste, queue SLO misses, margin pressure, and noisy-neighbor candidates.
4. Export a normal workspace and a redacted workspace.
5. Generate a provider overlay with `node scripts/build-provider-overlay.js fixtures/provider-export-inputs`.
6. Validate source bundles against `schemas/turba-source-bundle.v1.schema.json`.

## Visual Readiness

1. Run the checks in `docs/visual-qa.md` on desktop and mobile widths.
2. Regenerate `build/turbalance-analytics-desktop.png` and `build/turbalance-analytics-mobile.png` after layout changes.
3. Confirm no text overlap in provider lens, provider portfolio tables, trend metrics, and mobile controls.

## Talk Track Readiness

1. Follow `docs/demo-script.md`.
2. Use `docs/neo-cloud-pilot-validation.md` for provider pilot acceptance criteria.
3. Do not claim live cluster connectivity, live billing-system connectivity, current screenshots, or a live Pages URL unless each item has been verified for the latest commit.
