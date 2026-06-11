# Execution-Idle Energy Analytics

Source paper: Yiran Lei et al., "The Energy Cost of Execution-Idle in GPU Clusters", arXiv:2604.04745v1.

## What To Bring Into Turbalance

The paper identifies execution-idle as a distinct GPU operating state: a program remains resident on an allocated GPU, visible activity is near zero, and board power stays well above deep idle. That maps directly to Turbalance because we already collect host, GPU, network, process, benchmark, and fleet-comparison data.

The first implementation should be observability-first:

- Detect loaded-but-low-activity GPU samples using the paper's conservative thresholds: compute and memory activity below 5%, device communication below 1 GB/s, and a sustained-duration gate of at least 5 seconds.
- Separate execution-idle from deep idle by requiring process residency, model/runtime evidence, GPU memory residency, or an explicit "process lookup skipped" uncertainty state.
- Estimate exposed watts as current board power minus a model-based deep-idle floor.
- Rank fleet hosts by current exposed watts, confidence, and likely precursor class.
- Keep control actions in dry-run mode until SLO and latency slack are available.

## Signals Worth Collecting

Minimum viable live signals:

- NVML board power, GPU utilization, memory use, temperature, process list, and sample age.
- DCGM profiling fields for SM, tensor pipe, DRAM activity, PCIe bytes/s, and NVLink bytes/s.
- Host network throughput and drops/errors for NIC-heavy precursor detection.
- Serving/runtime state from Docker, Ollama, vLLM, Triton, Ray, NCCL, or scheduler metadata.
- Request/serving metrics where available: queue depth, TTFT, decode/TPOT, end-to-end latency, and SLO slack.

## Product Features

- Execution-Idle Energy cockpit card: current host/fleet candidates, estimated exposed watts, sustained-duration proof, likely precursor, and dry-run policy hints.
- Execution-idle watchdog task: background task status so operators know the detector is running.
- Fleet comparison extension: surface hosts whose low activity and high power deviate from peers.
- SLO-aware downscale planner: simulate SM-only and SM+memory downscale outcomes before issuing any clock command.
- Serving consolidation what-if: compare "spread requests across all GPUs" with "pack work and keep some GPUs deep idle" for bursty serving.
- Precursor classifier: classify PCIe-heavy, NIC-heavy, NVLink-heavy, and compute-to-idle onsets.

## Guardrails

Do not automatically change clocks from the dashboard until the tool has:

- Sustained proof over multiple samples.
- Process residency confidence.
- Latency/SLO slack or operator approval.
- A rollback path to restore clocks immediately when activity resumes.
- Per-GPU compatibility checks for clock controls.

## References

- Paper: https://arxiv.org/abs/2604.04745
- Paper HTML: https://arxiv.org/html/2604.04745v1
- NVIDIA DCGM field IDs: https://docs.nvidia.com/datacenter/dcgm/latest/dcgm-api/dcgm-api-field-ids.html
- NVIDIA NVML device queries: https://docs.nvidia.com/deploy/nvml-api/group__nvmlDeviceQueries.html
- vLLM metrics design: https://docs.vllm.ai/en/latest/design/metrics/
- DynamoLLM: https://arxiv.org/abs/2408.00741
- AGFT: https://arxiv.org/abs/2508.01744
