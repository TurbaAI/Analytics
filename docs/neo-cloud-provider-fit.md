# Neo-Cloud Provider Fit

Turba Analytics now treats GPU neo-cloud operators as a first-class user group. The goal is to help teams that sell scarce accelerator capacity protect customer trust, recover useful GPU-hours, and explain why a tenant's expensive run was slow or wasteful.

## Why This Matters

Provider documentation for GPU clouds shows the same operational pattern Turba targets:

- GPU capacity is sold through on-demand usage, reserved clusters, or committed capacity measured in GPU-hours.
- Large AI clusters often combine Kubernetes or Slurm job identity with hardware, network, and infrastructure telemetry.
- Operators need a clean bridge between fleet telemetry, customer support tickets, and commercial context.

Useful reference patterns:

- CoreWeave documents cost and usage views in Grafana and billing workflows: https://docs.coreweave.com/billing/index
- CoreWeave Observe describes overlaying hardware, Kubernetes, and Slurm telemetry for workload debugging: https://docs.coreweave.com/observability
- Lambda documents on-demand billing, reserved 1-Click Clusters, and per-GPU-hour reservation pricing: https://docs.lambda.ai/public-cloud/billing/
- Lambda 1-Click Clusters describe H100/B200 clusters, management nodes, high-speed fabric, and reservation flows: https://docs.lambda.ai/public-cloud/1-click-clusters/

## Provider Users

- Fleet operations: needs placement, fabric, partial-node, and hardware evidence before changing scheduler policy.
- Customer success and support: needs tenant-safe evidence for a slow-run escalation or renewal conversation.
- Capacity planning: needs sellable GPU-hour waste, reservation burn, and queue pressure by cluster or tenant.
- Revenue operations: needs billing-model and contract overlays without importing secrets into the browser prototype.

## Provider Signals

The provider lens adds optional fields on each run:

- `refs.tenant`, `refs.account`, and `refs.reservation`
- `commercial.billingModel`, `customerTier`, `contractId`
- `commercial.listGpuHourRate`, `floorGpuHourCost`
- `commercial.committedGpuHours`, `burstGpuHours`, `billableGpuHours`, `sellableGpuHours`
- `slo.priority`, `targetStartMinutes`, `targetEfficiency`, `supportTicketId`

The app converts those fields into:

- Sellable waste value: wasted GPU-hours multiplied by the tenant's list GPU-hour rate.
- Commit burn: allocated GPU-hours against committed reservation hours.
- Queue SLO pressure: queue wait compared with the tenant's target start time.
- Gross margin view: billable GPU-hours minus optional floor GPU-hour cost.
- Renewal and support actions: concise operator actions tied to the tenant, reservation, bottleneck, and ticket context.

## Workflows

### Tenant Escalation

1. Filter to `Job`, `Team`, or `Cluster`.
2. Open the provider lens and identify the tenant, account, reservation, support ticket, and queue SLO status.
3. Use the truth table, bottleneck classifier, and topology view to separate customer-code issues from provider placement, fabric, or noisy-neighbor symptoms.
4. Copy the outcome report into the support case. It now includes sellable waste value and reservation context.

### Capacity Planning

1. Switch to `Cluster` scope.
2. Sort by wasted GPU-hours and inspect sellable waste value.
3. Compare high-waste tenants against committed GPU-hour burn.
4. Use placement and NCCL topology attribution to decide whether to reserve locality groups, repack partial nodes, or move a workload pool.

### QBR And Renewal

1. Import a billing/provider overlay for the current billing cycle.
2. Use trend snapshots for efficiency, waste, and useful cost.
3. Export the workspace with redacted tenant/account IDs.
4. Show recovered GPU-hours, avoided waste value, queue SLO adherence, and remaining bottlenecks.

### Scheduler Tuning

1. Focus on jobs where the provider lens flags high sellable waste and the classifier flags communication or placement.
2. Compare cross-rack and cross-pod trace attribution.
3. Toggle `Same-pod what-if` to estimate locality benefit.
4. Treat repeated high-value reservations as candidates for scheduler hints or dedicated placement groups.

## Privacy Boundary

Provider overlays should use hashed or surrogate tenant, account, reservation, contract, namespace, and support-ticket IDs unless the workspace stays inside the operator group. The browser prototype does not need cloud credentials, live billing credentials, or raw customer secrets.

## Example Fixture

`fixtures/neo-cloud-provider-bundle.json` is a provider-focused import sample with two tenants, reservations, commercial overlays, SLO targets, and source telemetry.

`fixtures/provider-overlay-template.json` is the minimal provider overlay template for integrating billing, reservation, support, and SLO metadata with an existing Turba feed.

For a pilot walkthrough, use `docs/neo-cloud-pilot-validation.md`.
