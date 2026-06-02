# GB100/GB200 Telemetry Runbook

Use `./bin/gb100-telemetry-report --out-dir build/gb100-support` before making hardware decisions. The report captures GPU inventory, scrape health, available/unavailable DCGM fields, unsupported metric reasons, and current health signals.

## XID Error

1. Open the Health RAS dashboard and identify `gpu_uuid`, node, XID code, and first-seen time.
2. Drain or cordon the node if the XID repeats or correlates with job failures.
3. Run DCGM diagnostics and collect driver logs.
4. Attach `support-report.json`, `nvidia-smi -q`, dmesg snippets, and affected workload IDs to the service case.

## ECC DBE

1. Treat double-bit ECC as critical.
2. Stop new scheduling on the affected GPU.
3. Preserve workload and node logs.
4. Run DCGM diagnostics and follow the hardware replacement or RMA policy.

## Retired Pages Increasing

1. Compare `gpu_retired_pages_total` growth against fleet baseline for the same GPU model.
2. Watch remapped row and ECC trends.
3. Schedule maintenance if growth repeats or coincides with XID or DBE events.

## Thermal Throttling

1. Check `gpu_temperature_celsius`, `gpu_memory_temperature_celsius`, slowdown/max operating thresholds, and thermal violation counters.
2. Inspect node airflow, fan speed or liquid cooling, rack inlet conditions, and adjacent nodes.
3. If facility metrics are configured, compare GPU temperature with coolant inlet/outlet temperatures.
4. Reduce power cap or drain the node if the temperature approaches shutdown limits.

## Power Throttling

1. Check `gpu_power_watts`, `gpu_power_instant_watts`, power management limit, enforced limit, and power violation counters.
2. Confirm rack power budget and node BIOS or platform power settings.
3. Compare against workload phase changes; training checkpoints and batch spikes can cause transient power behavior.

## NVLink Errors

1. Open the Interconnect dashboard and identify the affected GPU/link labels.
2. Check NVLink link state, NVLink error counters, Fabric Manager status, and fabric health mask.
3. Drain multi-GPU jobs if errors continue.
4. Run NVIDIA link diagnostics and inspect Fabric Manager logs.

## C2C Link Down

1. Treat `DCGM_FI_DEV_C2C_LINK_STATUS == 0` as critical on dual-die parts.
2. Drain the affected GPU.
3. Run diagnostics before returning the node to service.
4. Do not infer full cache-coherency event tracing from C2C byte counters.

## Fabric Manager Unhealthy

1. Verify Fabric Manager process health and logs.
2. Check NVSwitch topology and fabric health mask.
3. Restart Fabric Manager only inside the approved maintenance path for the cluster.
4. Keep multi-node jobs off affected nodes until fabric health is clean.

## Missing DCGM Fields

1. Run `make validate-gpu`.
2. Check `support-report.json` for `unavailableDcgmFields`.
3. Confirm driver, CUDA, DCGM, DCGM Exporter, GPU SKU, MIG mode, and profiling permissions.
4. Do not backfill unavailable fields with zeros. Update the capability matrix if a field is unsupported on the target platform.

## Profiler And DCGM Conflicts

1. Keep DCGM Exporter as the always-on low-overhead path.
2. Run profiler hooks only during controlled forensic windows.
3. Expect Nsight/CUPTI profiling to require permissions, replay, sampling, or workload slowdown.
4. Do not compare profiler-derived per-kernel metrics directly to always-on DCGM ratios without documenting the collection window.
