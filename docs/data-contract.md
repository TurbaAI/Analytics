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
    "kubernetes": []
  },
  "ncclTraces": []
}
```

`fixtures/external-source-bundle.json` is the canonical source-bundle fixture.

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

## Run Sections

Each run should include:

- `id`: stable run identifier
- `name`: operator-facing run name
- `refs`: model, user, team, and cluster keys
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

Percent-like values are expressed as `0` to `100` in normalized ingestion feeds. Source adapters accept source-native ratios where documented, such as Prometheus `0.52` for `52%`.

## Validation Behavior

Imports are rejected when:

- the payload is not a JSON object
- `schemaVersion` is present but not `turba.ingestion.v1`
- `storageSchemaVersion` is present but not `turba.workspace.v2`
- `runs` exists but is not an array
- a feed has no runs
- a run is missing a stable `id`
- `sources.prometheus`, `sources.dcgm`, `sources.kubernetes`, or `ncclTraces` exists but is not an array

Rejected imports leave the current workspace unchanged and show the reason in the ingestion status chip.
