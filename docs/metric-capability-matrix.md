# GB100/GB200 Metric Capability Matrix

This matrix is intentionally conservative. Unsupported or non-native metrics are never filled with fake zeros. They are exposed by the app collector as `gb100_metric_capability{metric=...,status=...,reason=...} 1`.

Status values:

- `native_dcgm`: available from DCGM/DCGM Exporter where the target GPU and driver support the field.
- `native_nvml`: available from NVML or an attestation SDK where the host supports it.
- `native_os`: available from Linux host OS counters.
- `profiler_required`: requires Nsight, CUPTI, or another profiler path.
- `app_instrumentation_required`: requires framework, runtime, or application metrics.
- `external_system_required`: requires rack, CDU, BMC, Redfish, or facility telemetry.
- `unsupported_currently`: no verified low-overhead API is available in this stack.
- `benchmark_required`: must be proven with a controlled benchmark, not a live status counter.

| Metric Or Question | Implemented Signal | Status | Reason |
| --- | --- | --- | --- |
| GPU inventory | `DCGM_FI_DEV_NAME`, `DCGM_FI_DEV_UUID`, `DCGM_FI_DEV_BRAND`, `DCGM_FI_DEV_PCI_BUSID`, driver fields | `native_dcgm` | DCGM exposes node and GPU identity fields where supported. |
| GPU utilization | `DCGM_FI_DEV_GPU_UTIL` | `native_dcgm` | Standard DCGM utilization counter. |
| Memory copy utilization | `DCGM_FI_DEV_MEM_COPY_UTIL` | `native_dcgm` | Standard DCGM memory-copy utilization counter. |
| SM active | `gpu_sm_active_ratio` from `DCGM_FI_PROF_SM_ACTIVE` | `native_dcgm` | DCGM profiling counter. |
| SM occupancy | `gpu_sm_occupancy_ratio` from `DCGM_FI_PROF_SM_OCCUPANCY` | `native_dcgm` | DCGM profiling counter. |
| Generic Tensor Core utilization | `gpu_tensor_pipe_active_ratio` from `DCGM_FI_PROF_PIPE_TENSOR_ACTIVE` | `native_dcgm` | DCGM exposes generic Tensor pipe activity. |
| FP4 Tensor Core utilization | `gb100_metric_capability` row only | `profiler_required` | Per-format live FP4 attribution is not claimed unless verified through profiler or app instrumentation. |
| FP8 Tensor Core utilization | `gb100_metric_capability` row only | `profiler_required` | Per-format live FP8 attribution is not claimed unless verified through profiler or app instrumentation. |
| NVFP4 Tensor Core utilization | `gb100_metric_capability` row only | `profiler_required` | Per-format live NVFP4 attribution is not claimed unless verified through profiler or app instrumentation. |
| FP64/FP32/FP16/INT pipe activity | `DCGM_FI_PROF_PIPE_FP64_ACTIVE`, `DCGM_FI_PROF_PIPE_FP32_ACTIVE`, `DCGM_FI_PROF_PIPE_FP16_ACTIVE`, `DCGM_FI_PROF_PIPE_INT_ACTIVE` | `native_dcgm` | DCGM exposes generic pipe active counters where supported. |
| Transformer Engine activity | app fields `precision_mode`, `transformer_engine_enabled`, `tokens_per_second`, `batch_size`, `model_name` | `app_instrumentation_required` | DCGM does not expose semantic Transformer Engine or scaling-mode activity. |
| Decompression offload | app fields `nvcomp_codec`, compressed/decompressed bytes/sec, error count | `app_instrumentation_required` | Native DCGM decompression-engine utilization is not verified. |
| DRAM active | `gpu_dram_active_ratio` from `DCGM_FI_PROF_DRAM_ACTIVE` | `native_dcgm` | DCGM profiling counter. |
| Exact HBM GB/s per workload | profiler output or app counters | `profiler_required` | DCGM can expose DRAM activity but not exact per-workload HBM GB/s attribution. |
| Framebuffer usage | `gpu_memory_used_bytes`, `gpu_memory_used_ratio`, `DCGM_FI_DEV_FB_*` | `native_dcgm` | DCGM exposes framebuffer total/free/used/reserved/percent. |
| BAR1 usage | `DCGM_FI_DEV_BAR1_*` | `native_dcgm` | DCGM exposes BAR1 memory fields where supported. |
| Power | `gpu_power_watts`, `gpu_power_instant_watts`, limits, energy | `native_dcgm` | DCGM exposes board power, power limits, and total energy. |
| Throttling and event reasons | `DCGM_FI_DEV_CLOCK_THROTTLE_REASONS`, `DCGM_FI_DEV_CLOCKS_EVENT_REASONS` | `native_dcgm` | DCGM exposes reason bitmasks. |
| Power/thermal/reliability violations | `DCGM_FI_DEV_POWER_VIOLATION`, `DCGM_FI_DEV_THERMAL_VIOLATION`, `DCGM_FI_DEV_RELIABILITY_VIOLATION` | `native_dcgm` | DCGM exposes violation counters. |
| GPU core temperature | `gpu_temperature_celsius` from `DCGM_FI_DEV_GPU_TEMP` | `native_dcgm` | GPU API reports core temperature. |
| Memory temperature | `gpu_memory_temperature_celsius` from `DCGM_FI_DEV_MEMORY_TEMP` | `native_dcgm` | GPU API reports HBM or memory temperature where supported. |
| Coolant/CDU temperature | `rack_inlet_coolant_temp_celsius`, `rack_outlet_coolant_temp_celsius` | `external_system_required` | GPU temperature is not coolant temperature; use CDU/BMC/Redfish/facility telemetry. |
| ECC errors | `gpu_ecc_sbe_total`, `gpu_ecc_dbe_total`, `DCGM_FI_DEV_ECC_*` | `native_dcgm` | DCGM exposes volatile and aggregate ECC totals. |
| Retired pages | `gpu_retired_pages_total`, `DCGM_FI_DEV_RETIRED_*` | `native_dcgm` | DCGM exposes page retirement counters. |
| Remapped rows | `DCGM_FI_DEV_*REMAPPED_ROWS`, `DCGM_FI_DEV_ROW_REMAP_FAILURE` | `native_dcgm` | DCGM exposes visible remap health. |
| Raw RAS-engine internals | `gb100_metric_capability` row only | `unsupported_currently` | Visible RAS signals are exposed, but raw RAS-engine internals need a verified vendor API. |
| XID error | `gpu_xid_error_code` from `DCGM_FI_DEV_XID_ERRORS` | `native_dcgm` | DCGM exposes last observed XID code. |
| PCIe throughput | `gpu_pcie_tx_bytes_per_second`, `gpu_pcie_rx_bytes_per_second` | `native_dcgm` | Derived from DCGM PCIe byte counters. |
| PCIe link and replay | `DCGM_FI_DEV_PCIE_*` | `native_dcgm` | DCGM exposes link state and replay counters. |
| NVLink throughput | `gpu_nvlink_tx_bytes_per_second`, `gpu_nvlink_rx_bytes_per_second` | `native_dcgm` | Derived from DCGM NVLink byte counters. |
| NVLink link and errors | `DCGM_FI_DEV_NVLINK_GET_STATE`, NVLink error counters | `native_dcgm` | DCGM exposes visible link state and error counters. |
| NVSwitch/fabric health | Fabric Manager status, error code, cluster UUID, clique ID, health mask | `native_dcgm` | DCGM exposes fabric health where NVSwitch/Fabric Manager support exists. |
| C2C traffic | C2C link count, status, max bandwidth, TX/RX bytes | `native_dcgm` | This is C2C traffic, not full semantic cache-coherency tracing. |
| Confidential-computing status | optional NVML collector metrics | `native_nvml` | Availability depends on host, driver, and NVML or attestation SDK support. |
| Confidential-computing no-performance-drop guarantee | support report recommendation only | `benchmark_required` | No live status metric proves this; run controlled benchmarks. |
| GB10 NVML/nvidia-smi | `gb10-nvml-nvidia-smi`, GPU source context, `nvidia-smi` counters | `native_nvml` | On GB10 hosts, NVML/nvidia-smi is the low-overhead GPU inventory, utilization, power, temperature, PCIe, and process path. |
| Linux UMA memory | `linux-uma-memory`, `linuxUmaMemory*` from `/proc/meminfo` | `native_os` | GB10 unified memory pressure is represented through Linux host memory counters rather than unsupported HBM framebuffer claims. |
| App metrics | `app-metrics`, `gb100_app_*`, `appMetricsReachable` | `app_instrumentation_required` | Tokens/sec, request rate, batch, precision mode, KV cache, and framework signals must come from the app exporter. |
| Nsight/CUPTI optional profiling exporter | `nsight-cupti-profiling`, `collectors/profiling/*` | `profiler_required` | Per-kernel or per-format GB10 attribution should use optional Nsight/CUPTI hooks, not synthetic always-on counters. |

## Label Policy

Allowed labels are intentionally bounded: `cluster`, `hostname`, `node`, `gpu_index`, `gpu_uuid`, `pci_bus_id`, `mig_instance`, `namespace`, `pod`, `container`, `workload_id`, `tenant_id`, `model_name`, `framework`, and `precision_mode`.

Blocked labels include `request_id`, `user_id`, `session_id`, and `trace_id` unless a downstream deployment deliberately enables a separate high-cardinality path outside this package.
