# eBPF Probe Command Contract

`TURBALANCE_EBPF_PROBE_COMMAND` lets a host-specific eBPF loader feed summarized metrics into the Rust agent without coupling the product transport to one kernel build pipeline.

The command must:

- finish within the agent loop interval
- write one metric per line as `metric.name=value`
- use numeric values
- return exit code 0 when samples are valid

`procfs-summary.sh` is a contract smoke sample. It is not a replacement for production eBPF programs, but it lets operators validate the agent handoff path before attaching aya-rs, libbpf, or cilium-ebpf loaders.

`native-ebpf-readiness.sh` emits CI-safe readiness metrics for bpffs, tracingfs, cgroup v2, BTF, bpftool, clang, and effective host capability signals. `probe-manifest.json` records the probe package and native-loader rollout boundaries used by `scripts/validate-lakehouse-ebpf-probe-package.js`.
