# Provider Export Template

Use `fixtures/provider-overlay-template.json` as the starting shape for a neo-cloud provider overlay. Import it after a normalized `turba.ingestion.v1` feed, or wrap both in one source bundle.

For a runnable example, use `scripts/build-provider-overlay.js` with the sample inputs in `fixtures/provider-export-inputs/`:

```sh
node scripts/build-provider-overlay.js fixtures/provider-export-inputs > provider-overlay.json
```

The script joins Kubernetes labels, Slurm accounting, billing records, and support tickets by `runId`, then emits a `sources.provider` overlay that can be imported into the dashboard.

## Source Mapping

Map commercial, scheduler, and support systems into `sources.provider`:

- Billing system: `billingAccountId`, `commercial.billingModel`, `commercial.listGpuHourRate`, `commercial.billableGpuHours`
- Reservation or contract system: `reservation`, `reservationWindow`, `commercial.contractId`, `commercial.committedGpuHours`, `commercial.burstGpuHours`
- Cost model: `commercial.floorGpuHourCost`
- Support system: `slo.priority`, `slo.supportTicketId`
- SLO policy: `slo.targetStartMinutes`, `slo.targetEfficiency`
- Tenant/account catalog: `tenant`, `account`, `reservation`

## Kubernetes Join Keys

Recommended labels or annotations:

- `turba.ai/run-id`
- `turba.ai/tenant`
- `turba.ai/account`
- `turba.ai/reservation`
- `turba.ai/support-ticket`
- `turba.ai/priority`

The `runId` must match the normalized turbalance run ID. The app uses that ID to merge provider metadata with Prometheus, DCGM, Kubernetes, and NCCL trace data.

## Slurm Join Keys

Recommended fields or derived values:

- `job_id` as `runId`
- `account` as `account`
- `qos` or partition policy as `slo.priority`
- reservation name as `reservation`
- elapsed GPU allocation as `commercial.billableGpuHours`
- requested start target as `slo.targetStartMinutes`

## Redaction

Prefer surrogate IDs before import when sharing outside the provider operator group. The app also includes a redacted workspace export that rewrites run, model, user, team, cluster, tenant, account, reservation, contract, support-ticket, and provider source-context identifiers while preserving numeric metrics.

## Validation

Use `schemas/turba-source-bundle.v1.schema.json` to validate source bundles before import. The schema covers `sources.prometheus`, `sources.dcgm`, `sources.kubernetes`, `sources.provider`, and NCCL trace arrays while allowing source-specific fields that provider operators may need during a pilot.
