# GPU Exporter Coverage Analysis

This note turns the NVIDIA Grafana dashboard, AMD Device Metrics Exporter, NVIDIA DCGM exporter, and the execution-idle paper into implementation guidance for Turbalance Analytics.

## What The Sources Add

The execution-idle paper gives us the operating-state model: a GPU can be allocated with a program resident, visible activity near zero, and power still far above deep idle. The actionable detector needs power, activity, memory or process residency, communication counters, and a sustained-time gate.

The Grafana NVIDIA dashboard 14574 is useful because it proves a lightweight nvidia-smi exporter can support practical GPU dashboards. It is not enough by itself for the execution-idle paper, because nvidia-smi coverage is often power/utilization/memory/temperature heavy and weaker on fine-grained SM, tensor, DRAM, PCIe, and NVLink precursors.

NVIDIA DCGM Exporter is the better NVIDIA data-center path when available. It exposes Prometheus metrics from DCGM, supports configurable counters, and can add HPC job mapping. For Turbalance, DCGM should be treated as the preferred NVIDIA source for SM active, SM occupancy, tensor pipe active, DRAM active, PCIe, NVLink, power, thermal, ECC, and XID fields.

AMD Device Metrics Exporter is the cross-vendor unlock. It exposes Prometheus-format AMD GPU and NIC telemetry, including temperature, utilization, memory, power, PCIe bandwidth, performance, and Slurm/Kubernetes integration. Its metric list includes the AMD fields we need to map into the same families as DCGM: `GPU_POWER_USAGE`, `GPU_PACKAGE_POWER`, `GPU_AVERAGE_PACKAGE_POWER`, `GPU_GFX_ACTIVITY`, `GPU_UMC_ACTIVITY`, `GPU_USED_VRAM`, `GPU_TOTAL_VRAM`, `PCIE_BANDWIDTH`, `PCIE_BIDIRECTIONAL_BANDWIDTH`, ECC counters, `GPU_CLOCK`, and MI3xx violation residency metrics.

## What Was Implemented

- A new cockpit panel, `GPU Exporter Coverage`, scores live source rows across power, activity, memory, thermal, interconnect, RAS, clock/throttle, and scheduler-label families.
- Prometheus/DCGM imports now preserve raw metric snapshots under `sourceContext`, so the UI can explain which exporter families are actually present.
- The execution-idle detector now accepts AMD DME fields alongside NVIDIA/DCGM/NVML fields. AMD PCIe bandwidth is converted from Mbps to bytes/s, and AMD bidirectional PCIe GB/s is converted to bytes/s.
- `fixtures/prometheus-collector-queries.json` and the Prometheus exporter defaults now include normalized cross-vendor query recipes for GPU power, activity, memory, temperature, interconnect throughput, ECC errors, and clocks.
- `metrics/gpu-exporter-cross-vendor-map.json` defines the shared ontology and comparison gates so future collectors, dashboards, benchmark ladders, and support bundles use the same field families.

## Product Ideas To Build Next

- Per-family fairness gates for benchmark comparison: do not compare two hosts at rack, cluster, fleet, or global level unless required metric families are present on both sides.
- Vendor-specific install hints inside Auto Discovery and Deployment: deploy DCGM Exporter on NVIDIA nodes and AMD Device Metrics Exporter on MI2xx/MI3xx nodes.
- A Prometheus target health tile that checks `dcgm-exporter:9400/metrics` and AMD DME `:5000/metrics`.
- Source-bundle validation warnings when an imported GPU benchmark has performance metrics but lacks power, thermal, or RAS context.
- Global database schema keyed by normalized family, raw source metric, vendor, GPU model, driver/ROCm/CUDA version, rack, cluster, and benchmark suite.

## Sources

- Grafana NVIDIA dashboard: https://grafana.com/grafana/dashboards/14574-nvidia-gpu-metrics/
- nvidia_gpu_exporter: https://github.com/utkuozdemir/nvidia_gpu_exporter
- NVIDIA DCGM Exporter: https://github.com/NVIDIA/dcgm-exporter
- AMD Device Metrics Exporter: https://instinct.docs.amd.com/projects/device-metrics-exporter/en/latest/
- AMD metrics list: https://instinct.docs.amd.com/projects/device-metrics-exporter/en/latest/configuration/metricslist.html
- AMD Prometheus and Grafana integration: https://instinct.docs.amd.com/projects/device-metrics-exporter/en/latest/integrations/prometheus-grafana.html
- Execution-idle paper: https://arxiv.org/abs/2604.04745
