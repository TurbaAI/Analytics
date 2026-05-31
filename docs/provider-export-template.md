# Provider Export Template

Use `fixtures/provider-overlay-template.json` as the starting shape for a neo-cloud provider overlay. Import it after a normalized `turba.ingestion.v1` feed, or wrap both in one source bundle.

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

The `runId` must match the normalized Turba run ID. The app uses that ID to merge provider metadata with Prometheus, DCGM, Kubernetes, and NCCL trace data.

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
