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

For a complete provider pilot bundle across observability, scheduler, host, billing/SLO, and recommendation systems:

```sh
node scripts/build-provider-pilot-bundle.js fixtures/provider-pilot-export-inputs > provider-pilot-bundle.json
node scripts/validate-source-bundle.js --require-source-export provider-pilot-bundle.json
```

The script joins Kubernetes labels, Slurm accounting, billing records, and support tickets by `runId`, then emits a `sources.provider` overlay that can be imported into the dashboard. Scheduler systems can add `sources.scheduler` for queue/admission evidence, Grafana exports can add `sources.grafana` for dashboard handoff links, Redfish/BMC systems can add `sources.redfish` for hardware health/power/thermal/firmware evidence, and recommendation systems can add `sources.opportunities` beside the provider overlay when they already have ranked actions to validate.

For approved live Prometheus access, `scripts/fetch-prometheus-source-export.js` can generate the `prometheus.json` and `dcgm.json` files consumed by the bundle builder:

```sh
node scripts/fetch-prometheus-source-export.js \
  --url https://prometheus.provider.example \
  --run-id provider-run-9001 \
  --queries-file fixtures/prometheus-collector-queries.json \
  --out-dir fixtures/provider-pilot-export-inputs
```

For other approved source systems, use `scripts/fetch-source-system-export.js`:

```sh
node scripts/fetch-source-system-export.js \
  --system scheduler-admission \
  --url https://source-gateway.example/scheduler/export \
  --out-dir fixtures/provider-pilot-export-inputs
```

Supported systems are `kubernetes`, `scheduler-admission`, `grafana`, `billing-slo`, `ebpf`, `redfish`, `nccl`, and `opportunities`.

Before scheduling collectors, validate the source-owner contract file:

```sh
node scripts/validate-source-contracts.js \
  --config ops/source-contracts.example.json \
  --out-dir build/provider-source-contracts
```

## Source Mapping

Map commercial, scheduler, and support systems into `sources.provider`:

- Billing system: `billingAccountId`, `commercial.billingModel`, `commercial.listGpuHourRate`, `commercial.billableGpuHours`
- Reservation or contract system: `reservation`, `reservationWindow`, `commercial.contractId`, `commercial.committedGpuHours`, `commercial.burstGpuHours`
- Cost model: `commercial.floorGpuHourCost`
- Support system: `slo.priority`, `slo.supportTicketId`
- SLO policy: `slo.targetStartMinutes`, `slo.targetEfficiency`
- Tenant/account catalog: `tenant`, `account`, `reservation`
- Scheduler/admission system: `sources.scheduler[].queueName`, `priorityClass`, `requestedGpuShape`, `queueWaitMinutes`, `placementRetries`, `localityMisses`, `preemptionCount`, and `events`
- Grafana: `sources.grafana[].dashboardUrl`, `exploreUrl`, `dashboardUid`, `datasourceUid`, `variables`, and `timeRange`
- Redfish/BMC: `sources.redfish[].health.rollup`, `metrics.redfish_unhealthy_resources_total`, `metrics.redfish_power_watts`, `systems[].biosVersion`, `chassis[].inletTempCelsius`, and `managers[].firmwareVersion`
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

Prefer surrogate IDs before import when sharing outside the provider operator group. The app also includes a redacted workspace export that rewrites run, model, user, team, cluster, tenant, account, reservation, contract, support-ticket, scheduler queue/admission identifiers, Grafana dashboard/link identifiers, provider source-context identifiers, and imported opportunity free text while preserving numeric metrics.

## Validation

Use `schemas/turba-source-bundle.v1.schema.json` to validate source bundles before import. The schema covers `sources.prometheus`, `sources.dcgm`, `sources.kubernetes`, `sources.scheduler`, `sources.grafana`, `sources.ebpf`, `sources.redfish`, `sources.provider`, `sources.opportunities`, and NCCL trace arrays while allowing source-specific fields that provider operators may need during a pilot.

Use `grafana/turbalance-provider-overview.json` as a starter dashboard when the operator wants a consistent Grafana target for `sources.grafana` handoff links.

For Linux host-side evidence, use `sources.ebpf` separately from the provider commercial overlay. `scripts/build-ebpf-overlay.js` emits a summary overlay for CPU scheduling, socket/network, storage, and noisy-neighbor evidence by `runId`; keep raw eBPF event streams outside the browser prototype.
