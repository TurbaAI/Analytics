# turbalance Native eBPF Probe Package

This package contains the native Linux eBPF program boundary for the host agent. It is intentionally separate from the Rust transport daemon so kernel-specific build and rollout issues do not block signed telemetry delivery.

## Components

- `turbalance_native.bpf.c`: CO-RE eBPF program with scheduler, network, and block tracepoint counters.
- `turbalance_native_loader.c`: libbpf loader that attaches the program, reads counters, and prints `metric.name=value` lines for `TURBALANCE_EBPF_PROBE_COMMAND`.
- `Makefile`: Linux build entrypoint for BPF object and loader.

## Build On A Linux Host

```sh
cd agents/ebpf-agent/native
make
```

The host needs clang/LLVM, libbpf headers, bpftool, and a kernel BTF source such as `/sys/kernel/btf/vmlinux`. The build generates `build/vmlinux.h` when bpftool is available.

## Agent Handoff

```sh
TURBALANCE_EBPF_PROBE_COMMAND="/opt/turbalance/native/turbalance-native-loader --once" \
turbalance-ebpf-agent
```

The loader prints cumulative counters in the same contract as `agents/ebpf-agent/probes/procfs-summary.sh`, so fleet validation can exercise the transport before native probes are enabled broadly.
