# Telemetry Integration

The dashboard does not need a backend for local review. Real telemetry is connected by exporting JSON from existing systems and importing that JSON into the browser or sending it through the optional backend ingestion service.

Provider pilots can also send validated source bundles through the optional backend ingestion service in `server/ingestion-server.js`. Use `node scripts/validate-source-bundle.js --require-source-export` before sharing a bundle, or let the backend reject invalid uploads.

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

## Grafana Handoff Overlay

Grafana support is a handoff layer. Export `sources.grafana` records with the exact dashboard and Explore URLs that correspond to a normalized run, tenant, account, or reservation. The browser does not need Grafana credentials; it only renders operator-provided links and includes redacted link references in evidence packs.

`grafana/turbalance-provider-overview.json` is a ready-to-import dashboard template that expects Prometheus-style `turba_*` metrics with `tenant`, `reservation`, and `run_id` labels.

Expected fields:

- `runId`
- `grafanaBaseUrl`
- `instanceName`
- `orgId`
- `dashboardUid`
- `dashboardSlug`
- `dashboardTitle`
- `folder`
- `datasourceUid`
- `datasourceName`
- `timeRange.from` and `timeRange.to`
- `variables`
- `dashboardUrl`
- `exploreUrl`
- `links`

```json
{
  "sources": {
    "grafana": [
      {
        "runId": "run-7421",
        "dashboardUid": "turbalance-provider-overview",
        "dashboardTitle": "turbalance Provider Overview",
        "datasourceUid": "prometheus-h100-prod",
        "variables": {
          "tenant": "apex-ai",
          "reservation": "rsv-h100-frontier-q2",
          "run": "run-7421"
        },
        "dashboardUrl": "https://grafana.provider.example/d/turbalance-provider-overview/turbalance-provider-overview?orgId=1&var-run=run-7421",
        "exploreUrl": "https://grafana.provider.example/explore?orgId=1"
      }
    ]
  }
}
```

## DCGM

DCGM exports should use `sources.dcgm`.

Expected metric classes:

- SM occupancy
- tensor core utilization
- HBM capacity utilization
- HBM bandwidth utilization
- memory fragmentation
- KV-cache pressure when serving inference workloads

## Live Prometheus/DCGM Collector

When a provider approves read-only Prometheus access, use `scripts/fetch-prometheus-source-export.js` to convert instant-query results into `sources.prometheus` and `sources.dcgm` samples:

```sh
node scripts/fetch-prometheus-source-export.js \
  --url https://prometheus.provider.example \
  --run-id provider-run-9001 \
  --queries-file fixtures/prometheus-collector-queries.json \
  --out provider-prometheus-source-bundle.json
```

To feed the all-lanes provider bundle builder, stage the collector output as `prometheus.json` and `dcgm.json`:

```sh
node scripts/fetch-prometheus-source-export.js \
  --url https://prometheus.provider.example \
  --run-id provider-run-9001 \
  --queries-file fixtures/prometheus-collector-queries.json \
  --out-dir /var/run/turbalance-provider-exports
```

Set `TURBALANCE_PROMETHEUS_BEARER_TOKEN` or pass `--bearer-token` when the Prometheus gateway requires auth. Keep query files provider-specific: the included fixture is a starter map for DCGM-style metric names, not a promise that every provider exports identical names.

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

## Linux eBPF Host Overlay

Linux eBPF summaries should use `sources.ebpf`. Keep this adapter as host/kernel evidence: it should explain CPU scheduling, socket/network, storage, and noisy-neighbor symptoms that are hard to see from GPU counters alone. It should not replace DCGM for GPU hardware metrics or NCCL traces for collective attribution.

Use `scripts/build-ebpf-overlay.js` as a concrete exporter example:

```sh
node scripts/build-ebpf-overlay.js fixtures/ebpf-export-inputs > ebpf-overlay.json
```

Expected fields:

- `runId`
- `ebpfExportId`
- `collector`
- `kernelRelease`
- `host` and `node`
- `namespace`, `podName`, `containerName`, and `cgroupPath`
- `cpu.offCpuTimePct`
- `cpu.cpuThrottlePct`
- `cpu.softIrqPct`
- `scheduler.runQueueLatencyMsP95`
- `network.tcpRetransmitPct`
- `network.socketLatencyMsP95`
- `storage.blockIoLatencyMsP95`
- `storage.filesystemLatencyMsP95`
- `noise.noisyNeighborScore`
- `noise.noiseEvents`

```json
{
  "sources": {
    "ebpf": [
      {
        "runId": "run-7421",
        "ebpfExportId": "ebpf-2026-05-week-4",
        "collector": "bpftrace-summary",
        "host": "h100-a1-01.internal",
        "node": "A1-01",
        "namespace": "frontier",
        "podName": "llama-70b-pretrain-7421-worker-0",
        "containerName": "trainer",
        "cpu": {
          "offCpuTimePct": 7,
          "cpuThrottlePct": 4
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

The browser adapter converts those summaries into the existing dashboard lanes: network wait, storage wait, CPU preprocessing pressure, contention, latency tail, and noise events.

## Opportunity Overlay

The dashboard computes ranked opportunities locally, but upstream systems can contribute recommendation rows with `sources.opportunities`. Use this when an external scheduler simulator, inference tuner, support workflow, or capacity-planning tool already knows the action it wants an operator to validate.

The local Scheduler Simulator also uses normalized telemetry directly, so provider pilots can compare repack, locality, and queue-SLO what-if scenarios even when no external recommendation source is attached.

Expected fields:

- `runId`
- `opportunityId` or `id`
- `category`
- `title`
- `impactDollars`
- `impactGpuHours`
- `riskScore`
- `confidence`
- `evidence`
- `recommendation`
- `owner`
- `sourceSignals`

```json
{
  "sources": {
    "opportunities": [
      {
        "runId": "run-7421",
        "category": "Scheduler + Capacity",
        "title": "Protect reserved runs with locality-aware admission",
        "impactDollars": 2800,
        "impactGpuHours": 410,
        "riskScore": 72,
        "confidence": 84,
        "evidence": "Queue pressure and cross-pod placement align with support timing.",
        "recommendation": "Pin the next reserved burst to a contiguous pod.",
        "owner": "Scheduler team"
      }
    ]
  }
}
```

## Scheduler Event Overlay

Use `sources.scheduler` for Slurm, Kubernetes scheduler, Kueue, Volcano, Run:ai, or internal admission-controller exports. The adapter expects records keyed by `runId` and accepts direct metrics, timestamps, and event summaries:

- `schedulerExportId`
- `schedulerName`
- `queueName`
- `priorityClass`
- `admissionClass`
- `requestedGpuShape`
- `localityPreference`
- `queuedAt`, `admittedAt`, `startedAt`
- `queueWaitMinutes`
- `placementQuality`
- `idleGpus`, `partialNodes`
- `preemptionCount`
- `placementRetries`
- `localityMisses`
- `backfillCandidates`
- `pendingJobsAhead`
- `pendingGpuHoursAhead`
- `gpusPerNode`
- `events`

`scripts/build-scheduler-overlay.js` is a concrete exporter example:

```sh
node scripts/build-scheduler-overlay.js fixtures/scheduler-export-inputs > scheduler-overlay.json
```

The importer uses this evidence to strengthen Scheduler Simulator confidence and to explain whether repack, locality reservation, or queue-SLO protection is the better next action.

## Provider Commercial Overlay

Neo-cloud provider billing, reservation, and support context should use `sources.provider`. This source is intentionally separate from Prometheus, DCGM, Kubernetes, and NCCL traces so operators can import redacted tenant metadata without exposing live billing systems to the browser prototype.

Use `fixtures/provider-overlay-template.json` as the minimal export template.

Use `scripts/build-provider-overlay.js` as a concrete exporter example:

```sh
node scripts/build-provider-overlay.js fixtures/provider-export-inputs > provider-overlay.json
```

Validate the result against `schemas/turba-source-bundle.v1.schema.json` before sharing it with a pilot team.

For a full pilot handoff, use the all-lanes bundler:

```sh
node scripts/build-provider-pilot-bundle.js fixtures/provider-pilot-export-inputs > provider-pilot-bundle.json
node scripts/validate-source-bundle.js --require-source-export provider-pilot-bundle.json
```

That bundle can include Prometheus, DCGM, Kubernetes, scheduler/admission, Grafana, Linux eBPF, NCCL traces, billing/SLO, and optional opportunity exports keyed by `runId`.

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
2. Export source metric bundles for Prometheus, DCGM, Kubernetes, Grafana handoff links, Linux eBPF summaries, opportunity overlays, and NCCL traces.
3. Export a provider overlay for tenant, reservation, commercial, and support/SLO metadata when the operator is a GPU cloud or neo-cloud provider.
4. Import the feed first.
5. Import source bundles to overlay source-measured metrics, Grafana handoff links, and provider metadata.
6. Click Analyze after each import to capture trend snapshots.
7. Export the resulting workspace for review, sharing, or archive.

No live cluster credentials, tokens, or sensitive customer metadata are required by the prototype. Redact or hash user, team, namespace, pod, container, cgroup, host, tenant, account, reservation, contract, support-ticket, and run labels before sharing workspace exports outside the operator group.
