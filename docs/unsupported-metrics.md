# Unsupported And Non-Native Metrics

This stack prefers a truthful gap over a neat-looking lie. If a metric is not available from DCGM, NVML, application instrumentation, profiler output, or an external facility system, it is not synthesized.

## Per-Format FP4/FP8/NVFP4 Tensor Core Utilization

DCGM can expose generic Tensor pipe activity through `DCGM_FI_PROF_PIPE_TENSOR_ACTIVE`. That does not prove how much work was FP4, FP8, NVFP4, BF16, or another format.

Use Nsight Compute, CUPTI, framework logs, or app instrumentation for per-format attribution. The Grafana dashboards and collector expose these rows as `profiler_required`.

## Transformer Engine Micro-Tensor Scaling Internals

Transformer Engine precision mode, scaling mode, and recipe choices are semantic runtime/framework details. DCGM does not report them as always-on GPU counters.

Use app instrumentation from PyTorch, TensorRT-LLM, Transformer Engine, Triton, or vLLM to emit:

- `precision_mode`
- `transformer_engine_enabled`
- `tokens_per_second`
- `batch_size`
- `sequence_length`
- `model_name`

## Decompression Engine Utilization

The stack supports application/nvCOMP metrics for compressed bytes/sec, decompressed bytes/sec, codec, and decompression errors. It does not claim native decompression-engine utilization unless a verified DCGM/NVML field or vendor API is present.

## Raw RAS-Engine Internals

The package collects visible health signals:

- ECC SBE/DBE totals.
- Page retirement.
- Remapped rows and remap failure.
- XID codes.
- NVLink errors.
- Fabric Manager status and fabric health mask.

Raw internal RAS-engine counters are marked `unsupported_currently` without a verified API.

## CDU And Coolant Telemetry From GPU API Alone

`DCGM_FI_DEV_GPU_TEMP` is GPU core temperature. `DCGM_FI_DEV_MEMORY_TEMP` is memory temperature where supported. Neither is rack coolant temperature.

Coolant metrics require external facility integration:

- Redfish
- CDU API
- BMC API
- Facility Prometheus target
- HTTP POST or JSON file into the app collector

## Confidential-Computing Performance Guarantee

NVML or attestation SDKs may expose whether confidential-computing features are supported or enabled. They do not prove that a workload has no performance drop-off.

The support report marks performance guarantee claims as `benchmark_required`.
