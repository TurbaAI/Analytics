# Neo-Cloud Pilot Validation

Use `fixtures/neo-cloud-provider-bundle.json` as the first pilot dataset. It has two provider tenants, reservation overlays, SLO targets, Prometheus metrics, opportunity overlays, and enough placement pressure to exercise the support and capacity-planning workflow.

## Pilot Checks

1. Import `fixtures/neo-cloud-provider-bundle.json`.
2. Confirm `Tenant`, `Account`, and `Reservation` scopes are available.
3. Select `Tenant` scope and compare sellable waste, queue SLO, commit burn, and gross margin.
4. Select `Reservation` scope and inspect topology, NCCL attribution, and provider actions.
5. Use the provider portfolio risk tables to identify top sellable waste, queue SLO misses, margin pressure, and noisy-neighbor candidates.
6. Use the Opportunity Engine action center to compare computed and imported recommendations by impact, risk, and confidence.
7. Switch trend metrics between efficiency, waste, opportunity impact, sellable waste, commit burn, queue SLO, and gross margin.
8. Export a normal workspace.
9. Export a redacted workspace and confirm surrogate IDs replace tenant, account, reservation, contract, ticket, run identifiers, and imported opportunity free text.
10. Generate a provider overlay with `node scripts/build-provider-overlay.js fixtures/provider-export-inputs`.
11. Generate an eBPF host overlay with `node scripts/build-ebpf-overlay.js fixtures/ebpf-export-inputs`.
12. Validate source bundle shape with `schemas/turba-source-bundle.v1.schema.json` and the source bundle preflight checks.

## Acceptance Criteria

- Support can explain whether a tenant escalation is caused by workload configuration, input path, scheduler placement, noisy-neighbor interference, or fabric locality.
- Capacity planning can identify reservations consuming sellable GPU-hours without useful work.
- Revenue or QBR review can quantify sellable waste value and whether queue SLOs are inside target.
- Provider operations can jump from a portfolio risk queue to the affected tenant, account, or reservation.
- Provider and operator teams can rank FinOps, scheduler, inference, fabric, host-kernel, fleet, energy, and evidence-pack opportunities in one queue.
- Host-side eBPF summaries can distinguish Linux scheduling, socket, storage, or noisy-neighbor symptoms from GPU/NCCL bottlenecks.
- Shared exports can preserve performance evidence without leaking customer identifiers.

## Current Blockers

- GitHub Pages still needs Pages enabled in repository settings with GitHub Actions as the source.
- Screenshot artifacts have been regenerated for the current branded layout; repeat visual QA after future layout changes.
