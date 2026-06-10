# GB100/GB200 Telemetry Support Report

Generated: 2026-06-10T07:37:18.564Z

## Node

- Hostname: Mac.localdomain
- Platform: darwin
- Architecture: x64

## Versions

- Driver: unavailable
- CUDA: unavailable
- DCGM: unavailable
- DCGM Exporter: unavailable

## GPU Inventory

- No GPU inventory was available from nvidia-smi.

## Scrape Health

- DCGM Exporter: skipped
- App Collector: skipped

## Metric Coverage

- Requested DCGM fields: 90
- Available from live scrape: 0
- Unavailable from live scrape: 90

### Unavailable DCGM Fields

- DCGM_FI_DEV_NAME
- DCGM_FI_DEV_UUID
- DCGM_FI_DEV_BRAND
- DCGM_FI_DEV_PCI_BUSID
- DCGM_FI_DRIVER_VERSION
- DCGM_FI_CUDA_DRIVER_VERSION
- DCGM_FI_DEV_GPU_UTIL
- DCGM_FI_DEV_MEM_COPY_UTIL
- DCGM_FI_PROF_GR_ENGINE_ACTIVE
- DCGM_FI_PROF_SM_ACTIVE
- DCGM_FI_PROF_SM_OCCUPANCY
- DCGM_FI_PROF_PIPE_TENSOR_ACTIVE
- DCGM_FI_PROF_DRAM_ACTIVE
- DCGM_FI_PROF_PIPE_FP64_ACTIVE
- DCGM_FI_PROF_PIPE_FP32_ACTIVE
- DCGM_FI_PROF_PIPE_FP16_ACTIVE
- DCGM_FI_PROF_PIPE_TENSOR_IMMA_ACTIVE
- DCGM_FI_PROF_PIPE_TENSOR_HMMA_ACTIVE
- DCGM_FI_PROF_PIPE_TENSOR_DFMA_ACTIVE
- DCGM_FI_PROF_PIPE_INT_ACTIVE
- DCGM_FI_DEV_POWER_USAGE
- DCGM_FI_DEV_POWER_USAGE_INSTANT
- DCGM_FI_DEV_TOTAL_ENERGY_CONSUMPTION
- DCGM_FI_DEV_POWER_MGMT_LIMIT
- DCGM_FI_DEV_ENFORCED_POWER_LIMIT
- DCGM_FI_DEV_CLOCK_THROTTLE_REASONS
- DCGM_FI_DEV_CLOCKS_EVENT_REASONS
- DCGM_FI_DEV_POWER_VIOLATION
- DCGM_FI_DEV_THERMAL_VIOLATION
- DCGM_FI_DEV_RELIABILITY_VIOLATION
- DCGM_FI_DEV_SYNC_BOOST_VIOLATION
- DCGM_FI_DEV_BOARD_LIMIT_VIOLATION
- DCGM_FI_DEV_GPU_TEMP
- DCGM_FI_DEV_MEMORY_TEMP
- DCGM_FI_DEV_GPU_TEMP_LIMIT
- DCGM_FI_DEV_GPU_MAX_OP_TEMP
- DCGM_FI_DEV_MEM_MAX_OP_TEMP
- DCGM_FI_DEV_SLOWDOWN_TEMP
- DCGM_FI_DEV_SHUTDOWN_TEMP
- DCGM_FI_DEV_FB_TOTAL
- DCGM_FI_DEV_FB_FREE
- DCGM_FI_DEV_FB_USED
- DCGM_FI_DEV_FB_RESERVED
- DCGM_FI_DEV_FB_USED_PERCENT
- DCGM_FI_DEV_BAR1_TOTAL
- DCGM_FI_DEV_BAR1_USED
- DCGM_FI_DEV_BAR1_FREE
- DCGM_FI_DEV_ECC_CURRENT
- DCGM_FI_DEV_ECC_PENDING
- DCGM_FI_DEV_ECC_SBE_VOL_TOTAL
- DCGM_FI_DEV_ECC_DBE_VOL_TOTAL
- DCGM_FI_DEV_ECC_SBE_AGG_TOTAL
- DCGM_FI_DEV_ECC_DBE_AGG_TOTAL
- DCGM_FI_DEV_RETIRED_SBE
- DCGM_FI_DEV_RETIRED_DBE
- DCGM_FI_DEV_RETIRED_PENDING
- DCGM_FI_DEV_ROW_REMAP_FAILURE
- DCGM_FI_DEV_UNCORRECTABLE_REMAPPED_ROWS
- DCGM_FI_DEV_CORRECTABLE_REMAPPED_ROWS
- DCGM_FI_DEV_XID_ERRORS
- DCGM_FI_DEV_NVML_INDEX
- DCGM_FI_DEV_MINOR_NUMBER
- DCGM_FI_DEV_PCIE_REPLAY_COUNTER
- DCGM_FI_DEV_PCIE_MAX_LINK_GEN
- DCGM_FI_DEV_PCIE_MAX_LINK_WIDTH
- DCGM_FI_DEV_PCIE_LINK_GEN
- DCGM_FI_DEV_PCIE_LINK_WIDTH
- DCGM_FI_PROF_PCIE_TX_BYTES
- DCGM_FI_PROF_PCIE_RX_BYTES
- DCGM_FI_PROF_NVLINK_TX_BYTES
- DCGM_FI_PROF_NVLINK_RX_BYTES
- DCGM_FI_DEV_NVLINK_COUNT_TX_BYTES
- DCGM_FI_DEV_NVLINK_COUNT_RX_BYTES
- DCGM_FI_DEV_NVLINK_COUNT_RX_ERRORS
- DCGM_FI_DEV_NVLINK_COUNT_RX_REMOTE_ERRORS
- DCGM_FI_DEV_NVLINK_COUNT_RX_MALFORMED_PACKET_ERRORS
- DCGM_FI_DEV_NVLINK_COUNT_RX_BUFFER_OVERRUN_ERRORS
- DCGM_FI_DEV_NVLINK_GET_STATE
- DCGM_FI_DEV_FABRIC_MANAGER_STATUS
- DCGM_FI_DEV_FABRIC_MANAGER_ERROR_CODE
- DCGM_FI_DEV_FABRIC_CLUSTER_UUID
- DCGM_FI_DEV_FABRIC_CLIQUE_ID
- DCGM_FI_DEV_FABRIC_HEALTH_MASK
- DCGM_FI_DEV_C2C_LINK_COUNT
- DCGM_FI_DEV_C2C_LINK_STATUS
- DCGM_FI_DEV_C2C_MAX_BANDWIDTH
- DCGM_FI_PROF_C2C_TX_ALL_BYTES
- DCGM_FI_PROF_C2C_TX_DATA_BYTES
- DCGM_FI_PROF_C2C_RX_ALL_BYTES
- DCGM_FI_PROF_C2C_RX_DATA_BYTES

## Unsupported Or Non-Native Metrics

| Metric | Status | Reason |
| --- | --- | --- |
| fp4_tensor_core_utilization | profiler_required | Always-on DCGM exposes generic Tensor pipe activity but not verified live FP4 attribution. |
| fp8_tensor_core_utilization | profiler_required | Always-on DCGM exposes generic Tensor pipe activity but not verified live FP8 attribution. |
| nvfp4_tensor_core_utilization | profiler_required | Always-on DCGM exposes generic Tensor pipe activity but not verified live NVFP4 attribution. |
| transformer_engine_activity | app_instrumentation_required | Frameworks can report precision mode and transformer-engine usage but DCGM does not expose semantic Transformer Engine activity. |
| decompression_engine_utilization | app_instrumentation_required | nvCOMP or application metrics can report compressed and decompressed bytes but native DCGM decompression engine utilization is not verified. |
| hbm_gb_per_second_per_workload | profiler_required | DCGM can expose DRAM active ratio but exact per-workload HBM GB/s requires CUPTI Nsight or app-level attribution. |
| ras_engine_internals | unsupported_currently | Visible RAS signals are exposed through ECC remap XID fabric and NVLink errors. Raw RAS-engine internals need a vendor API. |
| coolant_temperature | external_system_required | GPU APIs expose GPU and memory temperature. Coolant temperature must come from CDU rack BMC Redfish or facility telemetry. |
| confidential_compute_attestation | native_nvml | Confidential-computing status may be available through NVML or an attestation SDK depending on host and driver support. |
| confidential_compute_performance_guarantee | benchmark_required | No live counter proves no performance drop-off. This must be measured with controlled workload benchmarks. |
| gb10_nvml_nvidia_smi | native_nvml | On GB10 hosts, nvidia-smi/NVML is the primary strict low-overhead GPU inventory, utilization, power, temperature, PCIe, and process counter path. |
| gb10_linux_uma_memory | native_os | GB10 exposes unified CPU/GPU memory pressure through Linux host memory counters; this stack labels it as UMA memory instead of pretending HBM framebuffer fields exist. |
| gb10_app_metrics | app_instrumentation_required | Tokens/sec, request rate, batch, precision mode, KV cache, and framework signals must come from the app metrics exporter. |
| gb10_nsight_cupti_optional_profiling_exporter | profiler_required | Per-kernel or per-format GB10 attribution should use optional Nsight/CUPTI profiling hooks, not always-on synthetic counters. |

## Current Health Signals

- XID: unknown
- Fabric status: unknown
- Fabric health mask: unknown

## Recommendations

- Start DCGM Exporter with metrics/gb100-dcgm-fields.csv and rerun without --skip-live to measure actual field availability.
- Treat unavailable DCGM fields as hardware or driver capability gaps until validated on the target node.
- Use profiler hooks only for forensic precision-specific attribution; keep DCGM as the low-overhead always-on path.
