# Turba Data Contract

Turba Analytics accepts JSON imports through the dashboard import control, API fetch control, or workspace restore flow. The app is static, so every import is handled in the browser and persisted to `localStorage` under `turba.analytics.workspace.v2`.

Machine-readable schema references live in `schemas/turba-ingestion.v1.schema.json` and `schemas/turba-workspace.v2.schema.json`.

## Supported Payloads

### Full Ingestion Feed

Use this shape when the upstream system can emit normalized Turba runs directly.

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
    "provider": []
  },
  "ncclTraces": []
}
```

`fixtures/external-source-bundle.json` is the canonical source-bundle fixture. `fixtures/provider-overlay-template.json` is the minimal provider overlay template.

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

The dashboard can also export a redacted workspace. Redacted exports preserve numeric metrics and trend snapshots while replacing run, model, user, team, cluster, tenant, account, reservation, contract, support-ticket, namespace, pod selector, billing account, and provider export identifiers with deterministic surrogate IDs.

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
- `commercial`: provider-side billing and commitment context
- `slo`: queue, efficiency, priority, and support-ticket targets

Percent-like values are expressed as `0` to `100` in normalized ingestion feeds. Source adapters accept source-native ratios where documented, such as Prometheus `0.52` for `52%`.

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

## Validation Behavior

Imports are rejected when:

- the payload is not a JSON object
- `schemaVersion` is present but not `turba.ingestion.v1`
- `storageSchemaVersion` is present but not `turba.workspace.v2`
- `runs` exists but is not an array
- a feed has no runs
- a run is missing a stable `id`
- `sources.prometheus`, `sources.dcgm`, `sources.kubernetes`, `sources.provider`, or `ncclTraces` exists but is not an array

Rejected imports leave the current workspace unchanged and show the reason in the ingestion status chip.
