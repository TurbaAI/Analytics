# turbalance eBPF Agent

The Rust agent is the host-side telemetry daemon for the lakehouse path. It runs as a one-shot emitter by default and becomes a daemon when `TURBALANCE_AGENT_MAX_ITERATIONS=0`.

## Runtime Contract

- Emits `turba.telemetry_batch.v1` JSON to `TURBALANCE_COLLECTOR_URL`.
- Enrolls with discovery when `TURBALANCE_DISCOVERY_ENROLL_URL` is set.
- Persists discovery identity JSON at `TURBALANCE_AGENT_IDENTITY_PATH`.
- Persists a monotonic sequence number at `TURBALANCE_AGENT_SEQUENCE_PATH`.
- Signs collector requests with `TURBALANCE_COLLECTOR_HMAC_SECRET` and/or bearer `TURBALANCE_COLLECTOR_TOKEN`.
- Reports probe readiness for bpffs, tracingfs, cgroup v2, scheduler/network/block probe boundaries, and procfs host counters.
- Optionally runs `TURBALANCE_EBPF_PROBE_COMMAND` once per loop. The command should emit `metric.name=value` lines, which the agent folds into the signed telemetry batch with `source=external-ebpf`.
- Ships native libbpf/CO-RE source assets under `native/` for scheduler, TCP retransmit, network transmit, and block completion counters. Build those on target Linux kernels and enable the native loader only after strict host validation passes.

## Local Smoke

```sh
cargo run --manifest-path agents/ebpf-agent/Cargo.toml
```

For a local collector:

```sh
TURBALANCE_TENANT_ID=tenant-a \
TURBALANCE_COLLECTOR_URL=http://127.0.0.1:8801/v1/telemetry/batches \
TURBALANCE_AGENT_SEQUENCE_PATH=build/agent/sequence-no \
cargo run --manifest-path agents/ebpf-agent/Cargo.toml
```

## Kubernetes

Use `ops/kubernetes/lakehouse-agent-daemonset.yaml` after the core platform is running. It is intentionally separate from `ops/kubernetes/lakehouse-platform.yaml` because it is privileged, uses host PID/network context, and mounts host proc/sys/bpffs/tracingfs paths.
