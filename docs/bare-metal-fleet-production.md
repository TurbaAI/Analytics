# Bare-Metal Fleet Production Path

This path is for the current lab fleet:

- NUC14E collector/API/dashboard host at `192.168.10.30`
- SPARK1/SPARK2 at `user@192.168.10.20` and `user@192.168.10.21`
- Raspberry Pis at `pi@pi1` through `pi@pi12`

The production data plane is:

```text
node-local live agent -> collector-gateway /v1/source-bundles -> raw-writer -> Parquet lake -> API/SSE/dashboard
node_exporter/cAdvisor/DCGM/OpenTelemetry -> Prometheus/OpenTelemetry backend
```

SSH is still used for rollout and emergency diagnostics, but not as the primary telemetry path.

## NUC Services

Run the lakehouse services on the NUC:

```sh
docker compose -f deploy/docker/lakehouse-compose.yml up -d collector-gateway api-server duckdb-query-service transform-runner collector-spool-replay otel-collector
```

The collector accepts strict source bundles at:

```text
http://192.168.10.30:8801/v1/source-bundles
```

It also exposes incoming telemetry report rate gauges on `/metrics`:

```text
turbalance_collector_incoming_telemetry_reports_per_second
turbalance_collector_incoming_telemetry_reports_per_minute
turbalance_collector_incoming_telemetry_reports_window_count
```

Set these before production traffic:

```sh
export TURBALANCE_COLLECTOR_TOKEN=...
export TURBALANCE_COLLECTOR_HMAC_SECRET=...
```

## Fleet Rollout

Preview the SPARK/Pi rollout:

```sh
node scripts/rollout-production-fleet.js \
  --collector-url http://192.168.10.30:8801/v1/source-bundles \
  --host-url http://192.168.10.30:8000 \
  --benchmarks \
  --out build/fleet-rollout-plan.json
```

Apply it:

```sh
TURBALANCE_COLLECTOR_TOKEN=... \
TURBALANCE_COLLECTOR_HMAC_SECRET=... \
node scripts/rollout-production-fleet.js \
  --apply \
  --collector-url http://192.168.10.30:8801/v1/source-bundles \
  --host-url http://192.168.10.30:8000 \
  --benchmarks \
  --out build/fleet-rollout-apply.json
```

By default this syncs the repo to `/opt/turbalance/Analytics`, writes `/etc/turbalance/live-machine-agent.env`, installs:

- `turbalance-live-machine-agent.service`
- `turbalance-machine-benchmark.service`
- `turbalance-machine-benchmark.timer`

The live agent pushes every `TURBALANCE_AGENT_LOOP_MS` and fails over to local spool if the collector does not answer within `TURBALANCE_AGENT_POST_TIMEOUT_MS`. The benchmark timer runs every 15 minutes with a randomized delay so the Pis do not all benchmark at the same instant.

## Agent Durability

The live agent signs requests when `TURBALANCE_COLLECTOR_HMAC_SECRET` is set. It persists:

- sequence number: `/var/lib/turbalance/live-machine-agent/sequence-no`
- offline spool: `/var/spool/turbalance/live-machine-agent`

Replay queued telemetry manually:

```sh
node /opt/turbalance/Analytics/scripts/push-live-machine-telemetry.js --replay-only
```

## Fleet Reliability

The live machine collector includes a MachineChecker-style hardware-health pass. It records only observed local signals: kernel/journal hardware patterns, NVIDIA Xid/NVRM events, storage and PCIe errors, OOM kills, failed systemd units, thermal throttling, network drops/errors, clock/PTP sync state, and GPU telemetry availability.

These fields are emitted into source bundles and materialized as virtual sensors:

```text
/v1/virtual-sensors/hardware-health
/v1/virtual-sensors/repair-candidates
/v1/virtual-sensors/fleet-rca
```

The dashboard shows a `Hardware health` tile per live host. Repair candidates are also folded into `/v1/alerts` with `suggestedAction` and `requiresApproval` metadata.

Run remediation planning in dry-run mode first:

```sh
node scripts/run-fleet-remediation.js \
  --bundle build/demo/live-machine-bundle.json \
  --policy ops/fleet-remediation-policy.example.json \
  --max-actions 2
```

The remediation runner is rate-limited and dry-run by default. `--apply` only runs actions whose policy mode is `safe`; manual, ticket, firmware, reboot, and repair actions require explicit operator approval and are represented as recommendations until they are wired to an approved ticketing or change-management system.

## OTel And Exporters

For standard host/container/GPU metrics, start the exporter sidecar stack on a host:

```sh
docker compose -f deploy/docker/fleet-observability-compose.yml up -d
```

On SPARK hosts with NVIDIA GPU telemetry:

```sh
docker compose -f deploy/docker/fleet-observability-compose.yml --profile gpu up -d
```

The OTel configs are:

- `ops/otel/bare-metal-agent-local.yaml` for local Prometheus/debug export
- `ops/otel/bare-metal-agent.yaml` for file-backed OTLP export plus Prometheus export

Use the source-bundle agent for Turbalance lakehouse ingestion and OTel/Prometheus for standard metrics. This keeps the dashboard source contract strict while still aligning host/container/GPU telemetry with industry-standard collectors.

## GPU Monitoring Backends

The source-bundle agent uses `TURBALANCE_GPU_BACKEND=auto` by default. In auto mode it tries `gpustat --json` first when `gpustat` is installed, then falls back to the narrow `nvidia-smi --query-gpu ... --format=csv,noheader,nounits` query. Set `TURBALANCE_GPU_BACKEND=gpustat` to force the lightweight JSON path, or `TURBALANCE_GPU_BACKEND=nvidia-smi` to force the NVIDIA CLI query. If `gpustat` is installed in a user venv, set `TURBALANCE_GPUSTAT_BIN=/path/to/venv/bin/gpustat`.

Use `nvtop` and `nvitop` for operator SSH sessions, not as ingestion dependencies. They are useful live terminal dashboards, but they are interactive tools rather than stable collector inputs. Use DCGM/DCGM Exporter for the production GPU sidecar path on SPARK or datacenter GPU hosts.

## Verification

On each machine:

```sh
systemctl status turbalance-live-machine-agent.service
systemctl status turbalance-machine-benchmark.timer
journalctl -u turbalance-live-machine-agent.service -n 50 --no-pager
```

On the NUC:

```sh
curl http://127.0.0.1:8801/ready
curl -sS http://127.0.0.1:8801/metrics | grep turbalance_collector_incoming_telemetry_reports
curl http://127.0.0.1:8080/v1/hosts?tenantId=dgx-lab
curl http://127.0.0.1:8080/v1/virtual-sensors/hardware-health?tenantId=dgx-lab
curl http://127.0.0.1:8080/v1/virtual-sensors/repair-candidates?tenantId=dgx-lab
curl http://127.0.0.1:8080/v1/virtual-sensors/fleet-rca?tenantId=dgx-lab
curl http://127.0.0.1:8080/v1/stream/resources?tenantId=dgx-lab
```
