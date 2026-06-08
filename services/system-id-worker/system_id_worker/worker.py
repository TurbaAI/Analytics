from __future__ import annotations

import argparse
import hashlib
import json
import math
import multiprocessing as mp
import os
import platform
import socket
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
for relative in ("services/platform_common", "services/raw-writer"):
    path = ROOT / relative
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

RESOURCE_METRICS = ("cpu", "gpu", "gpuMemory", "ram", "network", "disk", "gpuPowerWatts", "gpuTemperatureC")
FEATURE_NAMES = (
    "gain",
    "response_delay_seconds",
    "rise_time_seconds",
    "settling_time_seconds",
    "peak_delta_pct",
    "steady_delta_pct",
    "area_delta_pct_seconds",
    "overshoot_pct",
    "cross_correlation",
)


@dataclass(frozen=True)
class Trial:
    target: str
    profile: str
    duration_seconds: float
    max_intensity_pct: float


class CpuLoad:
    def __init__(self, *, worker_count: int, max_percent: float) -> None:
        self.worker_count = max(1, int(worker_count))
        self.max_percent = max(1.0, float(max_percent))
        self.stop = mp.Event()
        self.duty = mp.Value("d", 0.0)
        self.processes: list[mp.Process] = []

    def __enter__(self) -> "CpuLoad":
        for _ in range(self.worker_count):
            process = mp.Process(target=_cpu_load_worker, args=(self.stop, self.duty), daemon=True)
            process.start()
            self.processes.append(process)
        return self

    def set_intensity(self, percent: float) -> None:
        with self.duty.get_lock():
            self.duty.value = max(0.0, min(1.0, float(percent) / self.max_percent))

    def __exit__(self, *_args: Any) -> None:
        self.set_intensity(0.0)
        self.stop.set()
        for process in self.processes:
            process.join(timeout=1.0)
            if process.is_alive():
                process.terminate()


class RamLoad:
    def __init__(self, *, max_mebibytes: float) -> None:
        self.max_bytes = max(1, int(float(max_mebibytes) * 1024 * 1024))
        self.block_size = 8 * 1024 * 1024
        self.blocks: list[bytearray] = []

    def __enter__(self) -> "RamLoad":
        return self

    def set_intensity(self, percent: float) -> None:
        target_bytes = int(self.max_bytes * max(0.0, min(100.0, float(percent))) / 100.0)
        target_blocks = math.ceil(target_bytes / self.block_size) if target_bytes > 0 else 0
        while len(self.blocks) < target_blocks:
            block = bytearray(self.block_size)
            for offset in range(0, len(block), 4096):
                block[offset] = 1
            self.blocks.append(block)
        if len(self.blocks) > target_blocks:
            del self.blocks[target_blocks:]

    def __exit__(self, *_args: Any) -> None:
        self.set_intensity(0.0)


def _cpu_load_worker(stop: Any, duty: Any) -> None:
    window = 0.1
    value = 0.999983
    while not stop.is_set():
        with duty.get_lock():
            active = max(0.0, min(1.0, float(duty.value)))
        busy_until = time.perf_counter() + window * active
        while time.perf_counter() < busy_until and not stop.is_set():
            value = math.sin(value + 0.000001) * math.cos(value + 0.000002) + 1.000001
        sleep_time = window * (1.0 - active)
        if sleep_time > 0:
            time.sleep(sleep_time)


def run_experiment(args: argparse.Namespace) -> dict[str, Any]:
    started = datetime.now(timezone.utc)
    experiment_id = args.experiment_id or f"system-id-{safe_id(hostname())}-{timestamp_id(started)}"
    targets = split_list(args.targets)
    profiles = split_list(args.profiles)
    trials = build_trials(targets, profiles, args)
    capabilities = detect_capabilities(args)
    observations: list[dict[str, Any]] = []
    phases: list[dict[str, Any]] = []
    simulator_state = {"cpu": 8.0, "gpu": 0.0, "gpuMemory": 8.0, "ram": 40.0, "network": 0.0, "disk": 48.0}

    for trial in trials:
        phase_id = f"{trial.target}-{trial.profile}-{len(phases) + 1}"
        phase_started = time.time()
        phase_samples = collect_stage(
            args,
            trial=trial,
            phase_id=phase_id,
            stage="baseline",
            duration_seconds=args.baseline_seconds,
            intensity_fn=lambda _elapsed: 0.0,
            simulator_state=simulator_state,
        )
        observations.extend(phase_samples)

        workload_samples = run_workload_stage(
            args,
            trial=trial,
            phase_id=phase_id,
            capabilities=capabilities,
            simulator_state=simulator_state,
        )
        observations.extend(workload_samples)

        recovery_samples = collect_stage(
            args,
            trial=trial,
            phase_id=phase_id,
            stage="recovery",
            duration_seconds=args.recovery_seconds,
            intensity_fn=lambda _elapsed: 0.0,
            simulator_state=simulator_state,
        )
        observations.extend(recovery_samples)
        phases.append(
            {
                "phaseId": phase_id,
                "target": trial.target,
                "profile": trial.profile,
                "durationSeconds": round(time.time() - phase_started, 3),
                "sampleCount": len(phase_samples) + len(workload_samples) + len(recovery_samples),
                "maxInputPct": trial.max_intensity_pct,
            }
        )

    features = characterize(observations)
    fingerprint = build_fingerprint(features)
    report = {
        "schemaVersion": "turba.system_identification.v1",
        "experimentId": experiment_id,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "host": {
            "hostId": args.host_id or hostname(),
            "hostname": hostname(),
            "platform": platform.platform(),
            "machine": platform.machine(),
            "processorCount": os.cpu_count() or 1,
        },
        "configuration": {
            "targets": targets,
            "profiles": profiles,
            "sampleIntervalSeconds": args.sample_interval_seconds,
            "baselineSeconds": args.baseline_seconds,
            "recoverySeconds": args.recovery_seconds,
            "maxCpuPercent": args.max_cpu_percent,
            "maxRamMiB": args.ram_max_mb,
            "maxNetworkMbps": args.network_max_mbps,
            "simulate": bool(args.simulate),
        },
        "capabilities": capabilities,
        "researchBasis": [
            "Spike, step, ramp, and sinusoidal excitation expose different response regimes.",
            "Small perturbations preserve local linearity; larger stress tests are reserved for controlled maintenance windows.",
            "Coupling coefficients, lag, rise time, settling time, and recovery area form the comparison fingerprint.",
        ],
        "phases": phases,
        "observations": observations,
        "features": features,
        "fingerprint": fingerprint,
    }

    if args.out:
        write_json(args.out, report)
    batch = build_batch(report, tenant_id=args.tenant_id, host_id=args.host_id or hostname(), agent_id=args.agent_id)
    if args.batch_out:
        write_json(args.batch_out, batch)
    if args.lake_root:
        report["lakehouseWrite"] = write_batch_to_lake(batch, args.lake_root)
        if args.out:
            write_json(args.out, report)
    return report


def build_trials(targets: list[str], profiles: list[str], args: argparse.Namespace) -> list[Trial]:
    durations = {
        "impulse": args.impulse_seconds,
        "step": args.step_seconds,
        "ramp": args.ramp_seconds,
        "sine": args.sine_seconds,
    }
    trials = []
    for target in targets:
        for profile_name in profiles:
            trials.append(
                Trial(
                    target=target,
                    profile=profile_name,
                    duration_seconds=max(args.sample_interval_seconds, float(durations.get(profile_name, args.step_seconds))),
                    max_intensity_pct=max(0.0, min(100.0, float(args.intensity_pct))),
                )
            )
    return trials


def run_workload_stage(
    args: argparse.Namespace,
    *,
    trial: Trial,
    phase_id: str,
    capabilities: dict[str, Any],
    simulator_state: dict[str, float],
) -> list[dict[str, Any]]:
    intensity = lambda elapsed: input_intensity(trial.profile, elapsed, trial.duration_seconds, trial.max_intensity_pct)
    if trial.target == "cpu" and not args.simulate and not args.dry_run:
        workers = max(1, min(os.cpu_count() or 1, math.ceil((os.cpu_count() or 1) * args.max_cpu_percent / 100.0)))
        with CpuLoad(worker_count=workers, max_percent=args.max_cpu_percent) as load:
            return collect_stage(
                args,
                trial=trial,
                phase_id=phase_id,
                stage="workload",
                duration_seconds=trial.duration_seconds,
                intensity_fn=lambda elapsed: _set_load_and_return(load, intensity(elapsed)),
                simulator_state=simulator_state,
            )
    if trial.target == "gpu" and capabilities["gpuLoad"]["available"] and args.enable_gpu_load and not args.simulate and not args.dry_run:
        return collect_with_external_command(
            args,
            trial=trial,
            phase_id=phase_id,
            command_template=args.gpu_command,
            intensity_fn=intensity,
            simulator_state=simulator_state,
        )
    if trial.target == "ram" and capabilities["ramLoad"]["available"] and args.enable_ram_load and not args.simulate and not args.dry_run:
        with RamLoad(max_mebibytes=args.ram_max_mb) as load:
            return collect_stage(
                args,
                trial=trial,
                phase_id=phase_id,
                stage="workload",
                duration_seconds=trial.duration_seconds,
                intensity_fn=lambda elapsed: _set_load_and_return(load, intensity(elapsed)),
                simulator_state=simulator_state,
            )
    if trial.target == "network" and capabilities["networkLoad"]["available"] and args.enable_network_load and not args.simulate and not args.dry_run:
        return collect_with_external_command(
            args,
            trial=trial,
            phase_id=phase_id,
            command_template=iperf_command_template(args),
            intensity_fn=intensity,
            simulator_state=simulator_state,
        )
    if trial.target == "disk" and capabilities["diskLoad"]["available"] and args.enable_disk_load and not args.simulate and not args.dry_run:
        return collect_with_external_command(
            args,
            trial=trial,
            phase_id=phase_id,
            command_template=args.disk_command,
            intensity_fn=intensity,
            simulator_state=simulator_state,
        )
    return collect_stage(
        args,
        trial=trial,
        phase_id=phase_id,
        stage="workload",
        duration_seconds=trial.duration_seconds,
        intensity_fn=intensity,
        simulator_state=simulator_state,
    )


def _set_load_and_return(load: Any, intensity: float) -> float:
    load.set_intensity(intensity)
    return intensity


def collect_with_external_command(
    args: argparse.Namespace,
    *,
    trial: Trial,
    phase_id: str,
    command_template: str,
    intensity_fn: Any,
    simulator_state: dict[str, float],
) -> list[dict[str, Any]]:
    command = render_command(command_template, seconds=trial.duration_seconds, intensity=trial.max_intensity_pct, args=args)
    process = subprocess.Popen(command, cwd=ROOT, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        return collect_stage(
            args,
            trial=trial,
            phase_id=phase_id,
            stage="workload",
            duration_seconds=trial.duration_seconds,
            intensity_fn=intensity_fn,
            simulator_state=simulator_state,
        )
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()


def collect_stage(
    args: argparse.Namespace,
    *,
    trial: Trial,
    phase_id: str,
    stage: str,
    duration_seconds: float,
    intensity_fn: Any,
    simulator_state: dict[str, float],
) -> list[dict[str, Any]]:
    samples = []
    stage_started = time.time()
    index = 0
    while True:
        elapsed = time.time() - stage_started
        if elapsed > duration_seconds and samples:
            break
        intensity = float(intensity_fn(max(0.0, min(duration_seconds, elapsed))))
        timestamp = datetime.now(timezone.utc)
        metrics = simulated_sample(simulator_state, target=trial.target, input_pct=intensity, interval=args.sample_interval_seconds) if args.simulate else collect_machine_sample(args)
        samples.append(
            {
                "sampleId": f"{phase_id}-{stage}-{index}",
                "eventTs": timestamp.isoformat(),
                "phaseId": phase_id,
                "target": trial.target,
                "profile": trial.profile,
                "stage": stage,
                "elapsedSeconds": round(elapsed, 3),
                "inputIntensityPct": round(intensity, 4),
                "metrics": metrics,
            }
        )
        index += 1
        remaining = duration_seconds - (time.time() - stage_started)
        if remaining <= 0:
            break
        time.sleep(min(args.sample_interval_seconds, remaining))
    return samples


def collect_machine_sample(args: argparse.Namespace) -> dict[str, float]:
    command = [
        "node",
        str(ROOT / "scripts" / "collect-local-machine-bundle.js"),
        "--host-url",
        args.host_url,
        "--no-fleet",
        "1",
        "--fast-refresh",
        "1",
        "--ollama-probe",
        "0",
        "--skip-validation",
        "1",
    ]
    if args.network_interface:
        command.extend(["--network-interface", args.network_interface])
    result = subprocess.run(command, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=max(5.0, args.sample_interval_seconds * 4))
    if result.returncode != 0:
        raise RuntimeError(f"collect-local-machine-bundle.js failed: {result.stderr.strip()}")
    bundle = json.loads(result.stdout)
    context = (bundle.get("ingestion", {}).get("runs") or [{}])[0].get("sourceContext") or {}
    cpu_pct = number(context.get("cpuUsagePct"), 0.0)
    if cpu_pct <= 0 and number(context.get("load1"), 0.0) > 0:
        cpu_pct = min(100.0, number(context.get("load1"), 0.0) / max(1.0, number(context.get("cpuCount"), os.cpu_count() or 1)) * 100.0)
    return {
        "cpu": cpu_pct,
        "gpu": number(context.get("gpuUtilizationPct"), 0.0),
        "gpuMemory": number(context.get("gpuMemoryUsedPct"), 0.0),
        "ram": number(context.get("memoryUsedPct"), number(context.get("linuxUmaMemoryUsedPct"), 0.0)),
        "network": number(context.get("networkUtilizationPct"), 0.0),
        "disk": number(context.get("diskUsedPct"), 0.0),
        "gpuPowerWatts": number(context.get("gpuPowerWatts"), 0.0),
        "gpuTemperatureC": number(context.get("gpuTemperatureC"), 0.0),
        "networkRxBytesPerSecond": number(context.get("networkRxBytesPerSecond"), 0.0),
        "networkTxBytesPerSecond": number(context.get("networkTxBytesPerSecond"), 0.0),
    }


def simulated_sample(state: dict[str, float], *, target: str, input_pct: float, interval: float) -> dict[str, float]:
    desired = {
        "cpu": 8.0,
        "gpu": 2.0,
        "gpuMemory": 8.0,
        "ram": 40.0,
        "network": 1.0,
        "disk": 48.0,
    }
    if target == "cpu":
        desired.update({"cpu": 8.0 + input_pct * 0.72, "ram": 40.0 + input_pct * 0.08, "gpu": 2.0 + input_pct * 0.02, "disk": 48.0 + input_pct * 0.01})
    elif target == "gpu":
        desired.update({"gpu": 2.0 + input_pct * 0.78, "gpuMemory": 8.0 + input_pct * 0.42, "cpu": 8.0 + input_pct * 0.12, "ram": 40.0 + input_pct * 0.05})
    elif target == "ram":
        desired.update({"ram": 40.0 + input_pct * 0.52, "cpu": 8.0 + input_pct * 0.06, "disk": 48.0 + input_pct * 0.03})
    elif target == "network":
        desired.update({"network": 1.0 + input_pct * 0.82, "cpu": 8.0 + input_pct * 0.10, "ram": 40.0 + input_pct * 0.03})
    elif target == "disk":
        desired.update({"disk": 48.0 + input_pct * 0.36, "cpu": 8.0 + input_pct * 0.08, "ram": 40.0 + input_pct * 0.04})
    alpha = max(0.05, min(0.8, interval / 2.5))
    for key, value in desired.items():
        state[key] = state.get(key, value) + (value - state.get(key, value)) * alpha
    return {
        "cpu": round(state["cpu"], 4),
        "gpu": round(state["gpu"], 4),
        "gpuMemory": round(state["gpuMemory"], 4),
        "ram": round(state["ram"], 4),
        "network": round(state["network"], 4),
        "disk": round(state["disk"], 4),
        "gpuPowerWatts": round(35.0 + state["gpu"] * 1.1, 4),
        "gpuTemperatureC": round(45.0 + state["gpu"] * 0.18, 4),
        "networkRxBytesPerSecond": round(state["network"] * 1_000_000.0, 4),
        "networkTxBytesPerSecond": round(state["network"] * 700_000.0, 4),
    }


def input_intensity(profile_name: str, elapsed: float, duration: float, max_pct: float) -> float:
    if duration <= 0:
        return 0.0
    if profile_name == "impulse":
        return max_pct
    if profile_name == "step":
        return max_pct
    if profile_name == "ramp":
        return max_pct * max(0.0, min(1.0, elapsed / duration))
    if profile_name == "sine":
        return max_pct * (0.5 + 0.5 * math.sin(2.0 * math.pi * elapsed / duration - math.pi / 2.0))
    return max_pct


def characterize(observations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_phase: dict[str, list[dict[str, Any]]] = {}
    for sample in observations:
        by_phase.setdefault(str(sample["phaseId"]), []).append(sample)
    features = []
    for phase_id, samples in by_phase.items():
        samples = sorted(samples, key=lambda item: item["eventTs"])
        if not samples:
            continue
        target = str(samples[0]["target"])
        profile_name = str(samples[0]["profile"])
        for metric in RESOURCE_METRICS:
            features.append(characterize_metric(phase_id, target, profile_name, metric, samples))
    return features


def characterize_metric(phase_id: str, target: str, profile_name: str, metric: str, samples: list[dict[str, Any]]) -> dict[str, Any]:
    baseline = [metric_value(sample, metric) for sample in samples if sample["stage"] == "baseline"]
    workload = [sample for sample in samples if sample["stage"] == "workload"]
    recovery = [sample for sample in samples if sample["stage"] == "recovery"]
    all_values = [metric_value(sample, metric) for sample in samples]
    inputs = [float(sample["inputIntensityPct"]) for sample in samples]
    baseline_mean = mean(baseline)
    workload_values = [metric_value(sample, metric) for sample in workload]
    steady_values = workload_values[max(0, int(len(workload_values) * 0.66)):] or workload_values
    peak_value = max(workload_values or all_values or [baseline_mean])
    peak_delta = peak_value - baseline_mean
    steady_delta = mean(steady_values) - baseline_mean
    input_mean = mean([float(sample["inputIntensityPct"]) for sample in workload])
    gain = steady_delta / input_mean if abs(input_mean) > 1e-9 else 0.0
    load_start = parse_ts(workload[0]["eventTs"]) if workload else parse_ts(samples[0]["eventTs"])
    load_end = parse_ts(workload[-1]["eventTs"]) if workload else load_start
    response_delay = response_delay_seconds(workload, metric, baseline_mean, peak_delta, load_start)
    rise_time = rise_time_seconds(workload, metric, baseline_mean, peak_delta)
    settling_time = settling_time_seconds(recovery, metric, baseline_mean, peak_delta, load_end)
    area = integrate_delta(samples, metric, baseline_mean)
    overshoot = max(0.0, peak_delta - steady_delta) / abs(steady_delta) * 100.0 if abs(steady_delta) > 1e-9 else 0.0
    return {
        "phaseId": phase_id,
        "target": target,
        "profile": profile_name,
        "outputMetric": metric,
        "sampleCount": len(samples),
        "baselineMeanPct": round(baseline_mean, 6),
        "gain": round(gain, 6),
        "responseDelaySeconds": round_or_none(response_delay),
        "riseTimeSeconds": round_or_none(rise_time),
        "settlingTimeSeconds": round_or_none(settling_time),
        "peakDeltaPct": round(peak_delta, 6),
        "steadyDeltaPct": round(steady_delta, 6),
        "areaDeltaPctSeconds": round(area, 6),
        "overshootPct": round(overshoot, 6),
        "crossCorrelation": round(correlation(inputs, all_values), 6),
    }


def response_delay_seconds(samples: list[dict[str, Any]], metric: str, baseline: float, peak_delta: float, load_start: datetime) -> float | None:
    threshold = max(1.0, abs(peak_delta) * 0.1)
    if threshold <= 0:
        return None
    direction = 1.0 if peak_delta >= 0 else -1.0
    for sample in samples:
        delta = (metric_value(sample, metric) - baseline) * direction
        if delta >= threshold:
            return (parse_ts(sample["eventTs"]) - load_start).total_seconds()
    return None


def rise_time_seconds(samples: list[dict[str, Any]], metric: str, baseline: float, peak_delta: float) -> float | None:
    if abs(peak_delta) < 1e-9:
        return None
    direction = 1.0 if peak_delta >= 0 else -1.0
    low = abs(peak_delta) * 0.1
    high = abs(peak_delta) * 0.9
    low_ts = None
    for sample in samples:
        delta = (metric_value(sample, metric) - baseline) * direction
        if low_ts is None and delta >= low:
            low_ts = parse_ts(sample["eventTs"])
        if low_ts is not None and delta >= high:
            return (parse_ts(sample["eventTs"]) - low_ts).total_seconds()
    return None


def settling_time_seconds(samples: list[dict[str, Any]], metric: str, baseline: float, peak_delta: float, load_end: datetime) -> float | None:
    if not samples:
        return None
    tolerance = max(1.0, abs(peak_delta) * 0.1)
    for index, sample in enumerate(samples):
        remaining = samples[index:]
        if all(abs(metric_value(item, metric) - baseline) <= tolerance for item in remaining):
            return (parse_ts(sample["eventTs"]) - load_end).total_seconds()
    return None


def integrate_delta(samples: list[dict[str, Any]], metric: str, baseline: float) -> float:
    total = 0.0
    for left, right in zip(samples, samples[1:]):
        dt = (parse_ts(right["eventTs"]) - parse_ts(left["eventTs"])).total_seconds()
        total += ((metric_value(left, metric) - baseline) + (metric_value(right, metric) - baseline)) * 0.5 * max(0.0, dt)
    return total


def build_fingerprint(features: list[dict[str, Any]]) -> dict[str, Any]:
    entries = []
    for feature in features:
        for name in ("gain", "responseDelaySeconds", "riseTimeSeconds", "settlingTimeSeconds", "peakDeltaPct", "areaDeltaPctSeconds", "crossCorrelation"):
            value = feature.get(name)
            if isinstance(value, (int, float)) and math.isfinite(value):
                entries.append(
                    {
                        "key": f"{feature['target']}:{feature['profile']}:{feature['outputMetric']}:{to_snake(name)}",
                        "value": round(float(value), 6),
                    }
                )
    signature = json.dumps(entries, sort_keys=True, separators=(",", ":"))
    return {
        "algorithm": "turba.system-id.v1",
        "entryCount": len(entries),
        "entries": entries,
        "hash": hashlib.sha256(signature.encode("utf-8")).hexdigest(),
    }


def build_batch(report: dict[str, Any], *, tenant_id: str, host_id: str, agent_id: str) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    samples = []
    experiment_id = report["experimentId"]
    for item in report["observations"]:
        metrics = [
            {"name": "system_id.input_intensity_pct", "value": float(item["inputIntensityPct"]), "unit": "percent", "kind": "percent"},
        ]
        for key, value in item["metrics"].items():
            if isinstance(value, (int, float)) and math.isfinite(value):
                metrics.append({"name": f"system_id.observed_{to_snake(key)}", "value": float(value), "unit": metric_unit(key), "kind": metric_kind(key)})
        samples.append(
            {
                "sensorType": "system_identification",
                "source": "system-id-worker",
                "eventTs": item["eventTs"],
                "runId": experiment_id,
                "node": host_id,
                "labels": {
                    "kind": "observation",
                    "experiment_id": experiment_id,
                    "phase_id": item["phaseId"],
                    "target": item["target"],
                    "profile": item["profile"],
                    "stage": item["stage"],
                },
                "metrics": metrics,
            }
        )
    for feature in report["features"]:
        metrics = []
        for key in FEATURE_NAMES:
            camel = snake_to_camel(key)
            value = feature.get(camel)
            if isinstance(value, (int, float)) and math.isfinite(value):
                metrics.append({"name": f"system_id.{key}", "value": float(value), "unit": metric_unit(key), "kind": metric_kind(key)})
        samples.append(
            {
                "sensorType": "system_identification",
                "source": "system-id-worker",
                "eventTs": now,
                "runId": experiment_id,
                "node": host_id,
                "labels": {
                    "kind": "feature",
                    "experiment_id": experiment_id,
                    "phase_id": feature["phaseId"],
                    "target": feature["target"],
                    "profile": feature["profile"],
                    "output_metric": feature["outputMetric"],
                },
                "metrics": metrics,
            }
        )
    samples.append(
        {
            "sensorType": "system_identification",
            "source": "system-id-worker",
            "eventTs": now,
            "runId": experiment_id,
            "node": host_id,
            "labels": {"kind": "summary", "experiment_id": experiment_id, "fingerprint_hash": report["fingerprint"]["hash"]},
            "metrics": [
                {"name": "system_id.fingerprint_entry_count", "value": float(report["fingerprint"]["entryCount"]), "kind": "gauge", "unit": "count"},
            ],
        }
    )
    return {
        "schemaVersion": "turba.telemetry_batch.v1",
        "tenantId": tenant_id,
        "hostId": host_id,
        "agentId": agent_id,
        "sequenceNo": 0,
        "traceId": str(uuid.uuid4()),
        "eventTs": now,
        "samples": samples,
    }


def write_batch_to_lake(batch: dict[str, Any], lake_root: str) -> dict[str, Any]:
    from raw_writer import TelemetryLakeWriter

    return TelemetryLakeWriter(lake_root).write_batch(batch)


def compare_reports(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    left_values = {entry["key"]: float(entry["value"]) for entry in left.get("fingerprint", {}).get("entries", [])}
    right_values = {entry["key"]: float(entry["value"]) for entry in right.get("fingerprint", {}).get("entries", [])}
    keys = sorted(set(left_values) | set(right_values))
    deltas = []
    squared = 0.0
    for key in keys:
        left_value = left_values.get(key, 0.0)
        right_value = right_values.get(key, 0.0)
        delta = right_value - left_value
        squared += delta * delta
        deltas.append({"key": key, "baseline": left_value, "candidate": right_value, "delta": round(delta, 6)})
    rmse = math.sqrt(squared / len(keys)) if keys else 0.0
    largest = sorted(deltas, key=lambda item: abs(item["delta"]), reverse=True)[:12]
    return {
        "schemaVersion": "turba.system_identification_comparison.v1",
        "baselineExperimentId": left.get("experimentId", ""),
        "candidateExperimentId": right.get("experimentId", ""),
        "featureCount": len(keys),
        "rmse": round(rmse, 6),
        "largestDeltas": largest,
        "baselineHash": left.get("fingerprint", {}).get("hash", ""),
        "candidateHash": right.get("fingerprint", {}).get("hash", ""),
    }


def detect_capabilities(args: argparse.Namespace) -> dict[str, Any]:
    return {
        "cpuLoad": {"available": True, "mode": "python-duty-cycle"},
        "gpuLoad": {
            "available": bool(args.gpu_command),
            "mode": "external-command" if args.gpu_command else "not-configured",
            "enabled": bool(args.enable_gpu_load),
        },
        "ramLoad": {
            "available": True,
            "mode": "python-bytearray",
            "enabled": bool(args.enable_ram_load),
            "maxMiB": args.ram_max_mb,
        },
        "networkLoad": {
            "available": bool(args.network_peer and command_exists("iperf3")),
            "mode": "iperf3" if args.network_peer else "not-configured",
            "enabled": bool(args.enable_network_load),
            "peer": args.network_peer,
        },
        "diskLoad": {
            "available": bool(args.disk_command),
            "mode": "external-command" if args.disk_command else "not-configured",
            "enabled": bool(args.enable_disk_load),
        },
        "telemetry": {
            "mode": "simulated" if args.simulate else "collect-local-machine-bundle",
            "hostUrl": args.host_url,
        },
    }


def iperf_command_template(args: argparse.Namespace) -> str:
    seconds = "{seconds}"
    mbps = max(1.0, args.network_max_mbps * args.intensity_pct / 100.0)
    direction = " --bidir" if args.network_bidir else ""
    return f"iperf3 -c {args.network_peer} -t {seconds} -b {mbps:.3f}M -J{direction}"


def render_command(template: str, *, seconds: float, intensity: float, args: argparse.Namespace) -> str:
    return template.format(
        seconds=max(1, int(math.ceil(seconds))),
        intensity=max(0, int(round(intensity))),
        network_mbps=max(1, int(round(args.network_max_mbps * intensity / 100.0))),
    )


def metric_value(sample: dict[str, Any], metric: str) -> float:
    return number((sample.get("metrics") or {}).get(metric), 0.0)


def mean(values: list[float]) -> float:
    clean = [float(value) for value in values if isinstance(value, (int, float)) and math.isfinite(value)]
    return sum(clean) / len(clean) if clean else 0.0


def correlation(left: list[float], right: list[float]) -> float:
    if len(left) != len(right) or len(left) < 2:
        return 0.0
    left_mean = mean(left)
    right_mean = mean(right)
    numerator = sum((a - left_mean) * (b - right_mean) for a, b in zip(left, right))
    left_var = sum((a - left_mean) ** 2 for a in left)
    right_var = sum((b - right_mean) ** 2 for b in right)
    denom = math.sqrt(left_var * right_var)
    return numerator / denom if denom > 1e-12 else 0.0


def number(value: Any, fallback: float = 0.0) -> float:
    try:
        parsed = float(value)
        return parsed if math.isfinite(parsed) else fallback
    except (TypeError, ValueError):
        return fallback


def round_or_none(value: float | None) -> float | None:
    return None if value is None else round(float(value), 6)


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def split_list(value: str) -> list[str]:
    return [item.strip() for item in str(value or "").split(",") if item.strip()]


def safe_id(value: str) -> str:
    return "".join(char.lower() if char.isalnum() else "-" for char in value).strip("-") or "host"


def timestamp_id(value: datetime) -> str:
    return value.strftime("%Y%m%dt%H%M%Sz")


def hostname() -> str:
    return socket.gethostname()


def write_json(path: str, payload: dict[str, Any]) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_suffix(f"{target.suffix}.{os.getpid()}.tmp")
    temp.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temp, target)


def read_json(path: str) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def command_exists(name: str) -> bool:
    paths = os.environ.get("PATH", "").split(os.pathsep)
    return any((Path(item) / name).exists() for item in paths if item)


def to_snake(value: str) -> str:
    chars = []
    for char in value:
        if char.isupper() and chars:
            chars.append("_")
        chars.append(char.lower())
    return "".join(chars)


def snake_to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


def metric_kind(name: str) -> str:
    lowered = to_snake(name).lower()
    if lowered in {"cpu", "gpu", "gpu_memory", "ram", "network", "disk"}:
        return "percent"
    if "pct" in lowered or "percent" in lowered or "intensity" in lowered or "correlation" in lowered:
        return "percent" if "correlation" not in lowered else "ratio"
    if "seconds" in lowered:
        return "duration"
    if "bytes" in lowered:
        return "gauge"
    return "gauge"


def metric_unit(name: str) -> str:
    lowered = to_snake(name).lower()
    if lowered in {"cpu", "gpu", "gpu_memory", "ram", "network", "disk"}:
        return "percent"
    if "pct" in lowered or "percent" in lowered or "intensity" in lowered:
        return "percent"
    if "seconds" in lowered:
        return "seconds"
    if "bytes" in lowered:
        return "bytes_per_second" if "per_second" in lowered else "bytes"
    if "watts" in lowered:
        return "watts"
    if "temperature" in lowered:
        return "celsius"
    if "correlation" in lowered or lowered == "gain":
        return "ratio"
    return ""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run or compare turbalance system identification experiments.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    run_parser = subparsers.add_parser("run", help="Run a system identification experiment.")
    run_parser.add_argument("--out", default="build/system-identification/report.json")
    run_parser.add_argument("--batch-out", default="build/system-identification/telemetry-batch.json")
    run_parser.add_argument("--lake-root", default="")
    run_parser.add_argument("--tenant-id", default="dgx-lab")
    run_parser.add_argument("--host-id", default="")
    run_parser.add_argument("--agent-id", default="system-id-worker")
    run_parser.add_argument("--experiment-id", default="")
    run_parser.add_argument("--targets", default="cpu,gpu,ram,network,disk")
    run_parser.add_argument("--profiles", default="impulse,step,ramp,sine")
    run_parser.add_argument("--host-url", default="http://192.168.10.30:8000")
    run_parser.add_argument("--network-interface", default="")
    run_parser.add_argument("--baseline-seconds", type=float, default=8.0)
    run_parser.add_argument("--recovery-seconds", type=float, default=8.0)
    run_parser.add_argument("--impulse-seconds", type=float, default=3.0)
    run_parser.add_argument("--step-seconds", type=float, default=12.0)
    run_parser.add_argument("--ramp-seconds", type=float, default=12.0)
    run_parser.add_argument("--sine-seconds", type=float, default=16.0)
    run_parser.add_argument("--sample-interval-seconds", type=float, default=1.0)
    run_parser.add_argument("--intensity-pct", type=float, default=65.0)
    run_parser.add_argument("--max-cpu-percent", type=float, default=65.0)
    run_parser.add_argument("--network-peer", default="")
    run_parser.add_argument("--network-max-mbps", type=float, default=1000.0)
    run_parser.add_argument("--network-bidir", action="store_true")
    run_parser.add_argument("--ram-max-mb", type=float, default=512.0)
    run_parser.add_argument("--enable-ram-load", action="store_true")
    run_parser.add_argument("--disk-command", default="")
    run_parser.add_argument("--enable-disk-load", action="store_true")
    run_parser.add_argument("--gpu-command", default="")
    run_parser.add_argument("--enable-gpu-load", action="store_true")
    run_parser.add_argument("--enable-network-load", action="store_true")
    run_parser.add_argument("--simulate", action="store_true")
    run_parser.add_argument("--dry-run", action="store_true")
    run_parser.add_argument("--quick", action="store_true")

    compare_parser = subparsers.add_parser("compare", help="Compare two system identification reports.")
    compare_parser.add_argument("--baseline", required=True)
    compare_parser.add_argument("--candidate", required=True)
    compare_parser.add_argument("--out", default="")

    args = parser.parse_args(argv)
    if args.command == "run":
        if args.quick:
            args.baseline_seconds = min(args.baseline_seconds, 1.0)
            args.recovery_seconds = min(args.recovery_seconds, 1.0)
            args.impulse_seconds = min(args.impulse_seconds, 1.0)
            args.step_seconds = min(args.step_seconds, 2.0)
            args.ramp_seconds = min(args.ramp_seconds, 2.0)
            args.sine_seconds = min(args.sine_seconds, 2.0)
            args.sample_interval_seconds = min(args.sample_interval_seconds, 0.5)
        report = run_experiment(args)
        print(json.dumps({"status": "ok", "experimentId": report["experimentId"], "fingerprint": report["fingerprint"], "out": args.out, "batchOut": args.batch_out}, indent=2, sort_keys=True))
        return 0

    comparison = compare_reports(read_json(args.baseline), read_json(args.candidate))
    if args.out:
        write_json(args.out, comparison)
    print(json.dumps(comparison, indent=2, sort_keys=True))
    return 0
