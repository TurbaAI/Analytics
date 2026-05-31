# Neo-Cloud Pilot Validation

Use `fixtures/neo-cloud-provider-bundle.json` as the first pilot dataset. It has two provider tenants, reservation overlays, SLO targets, Prometheus metrics, and enough placement pressure to exercise the support and capacity-planning workflow.

## Pilot Checks

1. Import `fixtures/neo-cloud-provider-bundle.json`.
2. Confirm `Tenant`, `Account`, and `Reservation` scopes are available.
3. Select `Tenant` scope and compare sellable waste, queue SLO, commit burn, and gross margin.
4. Select `Reservation` scope and inspect topology, NCCL attribution, and provider actions.
5. Use the provider portfolio risk tables to identify top sellable waste, queue SLO misses, margin pressure, and noisy-neighbor candidates.
6. Switch trend metrics between efficiency, waste, sellable waste, commit burn, queue SLO, and gross margin.
7. Export a normal workspace.
8. Export a redacted workspace and confirm surrogate IDs replace tenant, account, reservation, contract, ticket, and run identifiers.
9. Generate a provider overlay with `node scripts/build-provider-overlay.js fixtures/provider-export-inputs`.
10. Validate source bundle shape with `schemas/turba-source-bundle.v1.schema.json` and the source bundle preflight checks.

## Acceptance Criteria

- Support can explain whether a tenant escalation is caused by workload configuration, input path, scheduler placement, noisy-neighbor interference, or fabric locality.
- Capacity planning can identify reservations consuming sellable GPU-hours without useful work.
- Revenue or QBR review can quantify sellable waste value and whether queue SLOs are inside target.
- Provider operations can jump from a portfolio risk queue to the affected tenant, account, or reservation.
- Shared exports can preserve performance evidence without leaking customer identifiers.

## Current Blockers

- GitHub Pages still needs Pages enabled in repository settings with GitHub Actions as the source.
- Browser visual QA for local URLs is blocked in the current Codex environment, so screenshots must be regenerated in a local browser.
