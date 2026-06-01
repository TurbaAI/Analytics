# Provider Export Template

Use `fixtures/provider-overlay-template.json` as the starting shape for a neo-cloud provider overlay. Import it after a normalized `turba.ingestion.v1` feed, or wrap both in one source bundle.

For a runnable example, use `scripts/build-provider-overlay.js` with the sample inputs in `fixtures/provider-export-inputs/`:

```sh
node scripts/build-provider-overlay.js fixtures/provider-export-inputs > provider-overlay.json
```

For scheduler-event evidence, use `scripts/build-scheduler-overlay.js` with the sample inputs in `fixtures/scheduler-export-inputs/`:

```sh
node scripts/build-scheduler-overlay.js fixtures/scheduler-export-inputs > scheduler-overlay.json
```

The script joins Kubernetes labels, Slurm accounting, billing records, and support tickets by `runId`, then emits a `sources.provider` overlay that can be imported into the dashboard. Scheduler systems can add `sources.scheduler` for queue/admission evidence, and recommendation systems can add `sources.opportunities` beside the provider overlay when they already have ranked actions to validate.

## Source Mapping

Map commercial, scheduler, and support systems into `sources.provider`:

- Billing system: `billingAccountId`, `commercial.billingModel`, `commercial.listGpuHourRate`, `commercial.billableGpuHours`
- Reservation or contract system: `reservation`, `reservationWindow`, `commercial.contractId`, `commercial.committedGpuHours`, `commercial.burstGpuHours`
- Cost model: `commercial.floorGpuHourCost`
- Support system: `slo.priority`, `slo.supportTicketId`
- SLO policy: `slo.targetStartMinutes`, `slo.targetEfficiency`
- Tenant/account catalog: `tenant`, `account`, `reservation`
- Scheduler/admission system: `sources.scheduler[].queueName`, `priorityClass`, `requestedGpuShape`, `queueWaitMinutes`, `placementRetries`, `localityMisses`, `preemptionCount`, and `events`
- Opportunity system: `sources.opportunities[].category`, `impactDollars`, `impactGpuHours`, `riskScore`, `confidence`, `evidence`, and `recommendation`

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

Prefer surrogate IDs before import when sharing outside the provider operator group. The app also includes a redacted workspace export that rewrites run, model, user, team, cluster, tenant, account, reservation, contract, support-ticket, scheduler queue/admission identifiers, provider source-context identifiers, and imported opportunity free text while preserving numeric metrics.

## Validation

Use `schemas/turba-source-bundle.v1.schema.json` to validate source bundles before import. The schema covers `sources.prometheus`, `sources.dcgm`, `sources.kubernetes`, `sources.scheduler`, `sources.provider`, `sources.opportunities`, and NCCL trace arrays while allowing source-specific fields that provider operators may need during a pilot.

For Linux host-side evidence, use `sources.ebpf` separately from the provider commercial overlay. `scripts/build-ebpf-overlay.js` emits a summary overlay for CPU scheduling, socket/network, storage, and noisy-neighbor evidence by `runId`; keep raw eBPF event streams outside the browser prototype.
