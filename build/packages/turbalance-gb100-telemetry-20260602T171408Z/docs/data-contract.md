# turbalance Data Contract

turbalance Analytics accepts JSON imports through the dashboard import control, API fetch control, workspace restore flow, or optional backend ingestion service. Browser imports are handled locally and persisted to `localStorage` under `turba.analytics.workspace.v2`; backend uploads are stored tenant-by-tenant after validation.

Machine-readable schema references live in `schemas/turba-ingestion.v1.schema.json`, `schemas/turba-source-bundle.v1.schema.json`, and `schemas/turba-workspace.v2.schema.json`.

Preflight source-bundle validation is available in CI and locally:

```sh
node scripts/validate-source-bundle.js --require-source-export source-bundle.json
```

## Supported Payloads

### Full Ingestion Feed

Use this shape when the upstream system can emit normalized turbalance runs directly.

```json
{
  "schemaVersion": "turba.ingestion.v1",
  "entities": {
    "models": { "llama-70b": { "label": "Llama 70B" } },
    "users": { "maya": { "label": "maya" } },
    "teams": { "frontier": { "label": "Frontier" } },
    "tenants": { "apex-ai": { "label": "Apex AI" } },
    "accounts": { "acct-apex-frontier": { "label": "Apex frontier platform" } },
    "reservations": { "rsv-h100-frontier-q2": { "label": "H100 Frontier Q2" } },
    "clusters": {
      "h100-prod-west": { "label": "h100-prod-west", "gpuModel": "H100 SXM" }
    }
  },
  "runs": []
}
```

The app also accepts `{ "ingestion": { ... } }` wrappers and `{ "runs": [...] }` payloads. A bare `runs` wrapper reuses the current workspace entities unless `entities` is included.

### Source Metric Bundle

Use this shape when the upstream system exports source-shaped metrics and the dashboard should merge them onto the current workspace or an included ingestion feed.

```json
{
  "ingestion": {
    "schemaVersion": "turba.ingestion.v1",
    "entities": {},
    "runs": []
  },
  "sources": {
    "prometheus": [],
    "dcgm": [],
    "kubernetes": [],
    "scheduler": [],
    "grafana": [],
    "ebpf": [],
    "provider": [],
    "opportunities": []
  },
  "ncclTraces": []
}
```

`fixtures/external-source-bundle.json` is the canonical source-bundle fixture. `fixtures/provider-overlay-template.json` is the minimal provider overlay template. `grafana/turbalance-provider-overview.json` is a ready-to-import Grafana dashboard template for provider pilots. `scripts/build-scheduler-overlay.js` is a dependency-free scheduler event exporter example. `scripts/build-ebpf-overlay.js` is a dependency-free eBPF summary exporter example. `schemas/turba-source-bundle.v1.schema.json` is the machine-readable schema for preflight validation of source-shaped imports.

For all-lanes provider pilots, `scripts/build-provider-pilot-bundle.js fixtures/provider-pilot-export-inputs` emits one bundle that includes Prometheus, DCGM, Kubernetes, scheduler, Grafana, eBPF, provider billing/SLO, opportunity, and NCCL trace exports.

### Workspace Export

Use this shape for browser-to-browser handoff or backup/restore.

```json
{
  "storageSchemaVersion": "turba.workspace.v2",
  "ingestionSchemaVersion": "turba.ingestion.v1",
  "savedAt": "2026-05-31T12:00:00.000Z",
  "lastAnalysisAt": "2026-05-31T12:00:00.000Z",
  "ingestion": {},
  "baselines": {},
  "snapshots": []
}
```

`fixtures/workspace-export.json` is the canonical workspace-export fixture.

The dashboard can also export a redacted workspace. Redacted exports preserve numeric metrics and trend snapshots while replacing run, model, user, team, cluster, tenant, account, reservation, contract, support-ticket, namespace, pod selector, scheduler queue/admission context, Grafana dashboard/link context, eBPF host/container context, billing account, provider export identifiers, and imported opportunity free text with deterministic surrogate IDs or redacted placeholders.

The Opportunity Engine panel can export a Markdown evidence pack for the selected scope. Evidence packs are not a restore format; they are human-readable handoffs that include summary metrics, scheduler/capacity what-if estimates, Grafana handoff links, ranked opportunities, impact estimates, evidence, recommendations, and a redacted source-context table.

## Run Sections

Each run should include:

- `id`: stable run identifier
- `name`: operator-facing run name
- `refs`: model, user, team, cluster, tenant, account, and reservation keys
- `status`: run state shown in inventory
- `allocation`: duration, GPU count, and allocated GPU-hours
- `utilization`: GPU utilization and useful compute signals
- `communication`: NCCL, network wait, cross-rack, and cross-pod signals
- `inputPipeline`: dataloader, storage, and CPU preprocessing signals
- `memory`: HBM, fragmentation, and KV-cache pressure signals
- `scheduler`: placement, idle GPU, partial-node, and queue-wait signals
- `reliability`: contention, regularity, noise, and tail-latency signals
- `configuration`: precision and batch inefficiency signals
- `work`: tokens, steps, or inference requests
- `baseline`: comparison values used by regression checks
- `placement`: allocated node list and partial node list
- `schedulerEvidence`: optional queue, admission, placement retry, locality, preemption, and backfill evidence
- `grafanaContext`: optional dashboard, datasource, Explore, variable, and time-range handoff context
- `commercial`: provider-side billing and commitment context
- `slo`: queue, efficiency, priority, and support-ticket targets
- `opportunities`: optional upstream ranked actions, if a source system already emits recommendations

Percent-like values are expressed as `0` to `100` in normalized ingestion feeds. Source adapters accept source-native ratios where documented, such as Prometheus `0.52` for `52%`.

## Opportunity Overlay

The dashboard computes Opportunity Engine rows from normalized run metrics even when no upstream recommendation feed exists. Source systems can optionally add their own ranked actions through `sources.opportunities` or `run.opportunities`.

```json
{
  "sources": {
    "opportunities": [
      {
        "runId": "run-7421",
        "opportunityId": "opp-apex-locality-q2",
        "category": "Scheduler + Capacity",
        "title": "Protect reserved runs with locality-aware admission",
        "impactDollars": 2800,
        "impactGpuHours": 410,
        "riskScore": 72,
        "confidence": 84,
        "evidence": "Queue pressure and cross-pod placement align with support timing.",
        "recommendation": "Pin the next reserved burst to a contiguous pod and compare NCCL trace share.",
        "owner": "Scheduler team"
      }
    ]
  }
}
```

The Opportunity Engine ranks computed and imported actions across Useful Compute FinOps, fabric/topology, scheduler/capacity, provider SLO risk, inference economics, data pipeline, host-kernel/eBPF, fleet reliability, energy/carbon, and customer evidence-pack categories. Values are directional and may overlap; use them to prioritize action, not as additive accounting totals.

## Scheduler Event Overlay

Scheduler systems should use `sources.scheduler` when they can export queue, admission, placement, locality, preemption, backfill, or reservation evidence by `runId`. This source is intentionally separate from Kubernetes pod state and provider commercial overlays.

```json
{
  "sources": {
    "scheduler": [
      {
        "runId": "run-7421",
        "schedulerExportId": "sched-2026-05-week-4",
        "schedulerName": "slurm-topology-aware",
        "queueName": "frontier-reserved",
        "priorityClass": "p1-reserved",
        "admissionClass": "reserved-burst",
        "requestedGpuShape": "24x8-h100",
        "localityPreference": "same-pod",
        "queuedAt": "2026-05-30T10:02:00-07:00",
        "startedAt": "2026-05-30T10:33:00-07:00",
        "placementQuality": 51,
        "placementRetries": 6,
        "localityMisses": 3,
        "backfillCandidates": 5,
        "pendingJobsAhead": 7,
        "pendingGpuHoursAhead": 910,
        "gpusPerNode": 8
      }
    ]
  }
}
```

The importer maps this into normalized scheduler metrics, preserves aggregate `schedulerEvidence`, and redacts scheduler source identifiers during evidence-pack and workspace export.

## Scheduler Simulator

The Scheduler Simulator is computed locally from normalized allocation, scheduler, communication, provider, SLO, and optional scheduler-event fields. The dashboard compares repacking partial nodes, reserving locality groups, and protecting priority queue admission by projected GPU-hour recovery, dollar upside, queue minutes saved, useful compute, and placement fit.

Simulator estimates are directional. Use source overlays and trace evidence to validate the selected action before changing scheduler policy.

## Grafana Handoff Overlay

Grafana links should use `sources.grafana` when an observability system can provide dashboard or Explore URLs by `runId`. The app does not call Grafana APIs directly; it preserves operator-provided links, dashboard metadata, datasource metadata, variables, and time range in a local `grafanaContext`.

```json
{
  "sources": {
    "grafana": [
      {
        "runId": "run-7421",
        "grafanaBaseUrl": "https://grafana.provider.example",
        "instanceName": "provider-observability-prod",
        "orgId": "1",
        "dashboardUid": "turbalance-provider-overview",
        "dashboardTitle": "turbalance Provider Overview",
        "datasourceUid": "prometheus-h100-prod",
        "datasourceName": "Prometheus h100-prod-west",
        "timeRange": {
          "from": "now-6h",
          "to": "now"
        },
        "variables": {
          "run": "run-7421",
          "tenant": "apex-ai",
          "reservation": "rsv-h100-frontier-q2"
        },
        "dashboardUrl": "https://grafana.provider.example/d/turbalance-provider-overview/turbalance-provider-overview?orgId=1&var-run=run-7421",
        "exploreUrl": "https://grafana.provider.example/explore?orgId=1"
      }
    ]
  }
}
```

Evidence packs and redacted workspaces replace Grafana base URLs, dashboard IDs, datasource IDs, variable values, and full dashboard/Explore URLs with deterministic surrogate IDs.

## eBPF Host Overlay

Linux eBPF summaries should use `sources.ebpf`. This source is optional and should be treated as host-side evidence, not as a replacement for DCGM, CUDA, NCCL, or provider billing data. It is useful for explaining input stalls, socket/network latency, CPU throttling, runqueue pressure, and noisy-neighbor symptoms.

```json
{
  "sources": {
    "ebpf": [
      {
        "runId": "run-7421",
        "ebpfExportId": "ebpf-2026-05-week-4",
        "collector": "bpftrace-summary",
        "kernelRelease": "6.8.0-provider",
        "host": "h100-a1-01.internal",
        "node": "A1-01",
        "namespace": "frontier",
        "podName": "llama-70b-pretrain-7421-worker-0",
        "containerName": "trainer",
        "cgroupPath": "/kubepods.slice/frontier/llama-70b-pretrain-7421",
        "cpu": {
          "offCpuTimePct": 7,
          "cpuThrottlePct": 4,
          "softIrqPct": 3
        },
        "scheduler": {
          "runQueueLatencyMsP95": 8
        },
        "network": {
          "tcpRetransmitPct": 2.4,
          "socketLatencyMsP95": 34
        },
        "storage": {
          "blockIoLatencyMsP95": 6,
          "filesystemLatencyMsP95": 9
        },
        "noise": {
          "noisyNeighborScore": 18,
          "noiseEvents": 0
        }
      }
    ]
  }
}
```

The app maps eBPF summaries into existing normalized sections:

- `communication.networkWait` from TCP retransmits and socket latency
- `inputPipeline.storageWait` from block I/O and filesystem latency
- `inputPipeline.cpuPrep` from off-CPU time, CPU throttling, and runqueue pressure
- `reliability.contentionPct`, `latencyTail`, and `noiseEvents` from host contention and noisy-neighbor signals
- `sourceContext` for eBPF export ID, collector, kernel release, host, node, pod, container, and cgroup provenance

Prefer summary values by `runId`, pod, container, or cgroup. Do not import raw event streams into the browser prototype unless they have been aggregated and redacted upstream.

## Neo-Cloud Provider Overlay

Neo-cloud operators can import tenant and commercial metadata directly on each run or through `sources.provider`.

```json
{
  "sources": {
    "provider": [
      {
        "runId": "run-7421",
        "tenant": "apex-ai",
        "account": "acct-apex-frontier",
        "reservation": "rsv-h100-frontier-q2",
        "providerExportId": "billing-2026-05-week-4",
        "billingAccountId": "ba-apex-frontier",
        "reservationWindow": "2026-Q2",
        "commercial": {
          "billingModel": "reserved-cluster",
          "customerTier": "strategic",
          "contractId": "ctr-apex-2026-q2",
          "listGpuHourRate": 6.8,
          "floorGpuHourCost": 3.9,
          "committedGpuHours": 6500,
          "burstGpuHours": 240,
          "billableGpuHours": 2227,
          "sellableGpuHours": 2227
        },
        "slo": {
          "priority": "p1",
          "targetStartMinutes": 20,
          "targetEfficiency": 55,
          "supportTicketId": "CS-1842"
        }
      }
    ]
  }
}
```

Provider fields are optional. If `commercial.floorGpuHourCost` is omitted, the app still reports sellable waste value and hides gross-margin math. If `refs.reservation` is present, committed reservation totals are deduplicated across grouped views.

`scripts/build-provider-overlay.js` is a dependency-free exporter example that joins `fixtures/provider-export-inputs/` by `runId` and emits a valid `sources.provider` overlay.

## Validation Behavior

Imports are rejected when:

- the payload is not a JSON object
- `schemaVersion` is present but not `turba.ingestion.v1`
- `storageSchemaVersion` is present but not `turba.workspace.v2`
- `runs` exists but is not an array
- a feed has no runs
- a run is missing a stable `id`
- `sources.prometheus`, `sources.dcgm`, `sources.kubernetes`, `sources.scheduler`, `sources.grafana`, `sources.ebpf`, `sources.provider`, `sources.opportunities`, or `ncclTraces` exists but is not an array

Rejected imports leave the current workspace unchanged and show the reason in the ingestion status chip.
