# Telemetry Integration

This prototype has no backend. Real telemetry is connected by exporting JSON from existing systems and importing that JSON into the browser.

## Prometheus

Prometheus exports should use `sources.prometheus`.

```json
{
  "sources": {
    "prometheus": [
      {
        "runId": "run-7421",
        "metrics": {
          "turba_gpu_utilization_ratio": 0.69,
          "turba_useful_compute_ratio": 0.52,
          "turba_nccl_time_ratio": 0.18,
          "turba_network_wait_ratio": 0.08,
          "turba_dataloader_stall_ratio": 0.04,
          "turba_storage_wait_ratio": 0.03,
          "turba_cpu_prep_ratio": 0.04,
          "turba_queue_wait_minutes": 18
        }
      }
    ]
  }
}
```

Expected query classes:

- GPU utilization ratio by run
- useful compute ratio by run
- NCCL time ratio by run
- network wait ratio by run
- dataloader, storage, and CPU preprocessing stall ratios
- queue wait minutes
- training tokens, steps, or inference request counts

## DCGM

DCGM exports should use `sources.dcgm`.

Expected metric classes:

- SM occupancy
- tensor core utilization
- HBM capacity utilization
- HBM bandwidth utilization
- memory fragmentation
- KV-cache pressure when serving inference workloads

## Kubernetes

Kubernetes exports should use `sources.kubernetes`.

Expected fields:

- namespace
- pod selector or job label
- status
- allocated duration and GPU count
- placement quality
- idle GPUs
- partial nodes
- queue wait
- allocated nodes and partial nodes
- cross-rack and cross-pod traffic estimates when available

## Provider Commercial Overlay

Neo-cloud provider billing, reservation, and support context should use `sources.provider`. This source is intentionally separate from Prometheus, DCGM, Kubernetes, and NCCL traces so operators can import redacted tenant metadata without exposing live billing systems to the browser prototype.

Expected fields:

- `runId`
- `tenant`, `account`, and `reservation`, or equivalent values under `refs`
- `providerExportId`
- `billingAccountId`
- `reservationWindow`
- `commercial.billingModel`
- `commercial.customerTier`
- `commercial.contractId`
- `commercial.listGpuHourRate`
- `commercial.floorGpuHourCost`
- `commercial.committedGpuHours`
- `commercial.burstGpuHours`
- `commercial.billableGpuHours`
- `commercial.sellableGpuHours`
- `slo.priority`
- `slo.targetStartMinutes`
- `slo.targetEfficiency`
- `slo.supportTicketId`

```json
{
  "sources": {
    "provider": [
      {
        "runId": "run-7421",
        "tenant": "apex-ai",
        "account": "acct-apex-frontier",
        "reservation": "rsv-h100-frontier-q2",
        "commercial": {
          "billingModel": "reserved-cluster",
          "listGpuHourRate": 6.8,
          "floorGpuHourCost": 3.9,
          "committedGpuHours": 6500,
          "billableGpuHours": 2227
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

## NCCL Traces

NCCL trace exports should use `ncclTraces`.

Each trace event should include:

- operation name
- duration in milliseconds
- byte count
- source rank and destination rank
- source node and destination node when available

The parser attributes collective time by operation and topology tier: same node, same rack, cross rack, and cross pod.

## Production Intake Flow

1. Export a normalized `turba.ingestion.v1` feed for run identity, allocation, baselines, work counters, and placement.
2. Export source metric bundles for Prometheus, DCGM, Kubernetes, and NCCL traces.
3. Export a provider overlay for tenant, reservation, commercial, and support/SLO metadata when the operator is a GPU cloud or neo-cloud provider.
4. Import the feed first.
5. Import source bundles to overlay source-measured metrics and provider metadata.
6. Click Analyze after each import to capture trend snapshots.
7. Export the resulting workspace for review, sharing, or archive.

No live cluster credentials, tokens, or sensitive customer metadata are required by the prototype. Redact or hash user, team, namespace, tenant, account, reservation, contract, support-ticket, and run labels before sharing workspace exports outside the operator group.
