#!/usr/bin/env python3
"""Optional NVML confidential-computing collector.

The always-on stack must keep running when NVML or confidential-computing APIs
are unavailable. This module therefore returns availability metrics and warnings
instead of raising import or driver errors.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List


def _disabled() -> Dict[str, Any]:
    return {
        "metrics": {
            "gpu_confidential_compute_collector_available": 0,
            "gpu_attestation_available": 0,
            "gpu_attestation_last_success": 0,
        },
        "warnings": ["ENABLE_NVML_COLLECTOR is not true; confidential-computing collector is disabled."],
    }


def collect_nvml_confidential_metrics() -> Dict[str, Any]:
    if os.environ.get("ENABLE_NVML_COLLECTOR", "").lower() not in {"1", "true", "yes", "on"}:
        return _disabled()

    try:
        import pynvml  # type: ignore
    except Exception as exc:  # pragma: no cover - host dependent
        return {
            "metrics": {
                "gpu_confidential_compute_collector_available": 0,
                "gpu_attestation_available": 0,
                "gpu_attestation_last_success": 0,
            },
            "warnings": [f"pynvml is unavailable: {exc}"],
        }

    warnings: List[str] = []
    metrics: Dict[str, float] = {
        "gpu_confidential_compute_collector_available": 1,
        "gpu_attestation_available": 0,
        "gpu_attestation_last_success": 0,
    }

    try:  # pragma: no cover - host dependent
        pynvml.nvmlInit()
        count = pynvml.nvmlDeviceGetCount()
        for index in range(count):
            handle = pynvml.nvmlDeviceGetHandleByIndex(index)
            labels = f'gpu_index="{index}"'
            metrics[f"gpu_confidential_compute_supported{{{labels}}}"] = 0
            metrics[f"gpu_confidential_compute_enabled{{{labels}}}"] = 0
            metrics[f"gpu_protected_memory_total_bytes{{{labels}}}"] = 0
            metrics[f"gpu_protected_memory_used_bytes{{{labels}}}"] = 0
            try:
                cc_mode = getattr(pynvml, "nvmlDeviceGetConfComputeMode")(handle)
                metrics[f"gpu_confidential_compute_supported{{{labels}}}"] = 1
                metrics[f"gpu_confidential_compute_enabled{{{labels}}}"] = 1 if cc_mode else 0
            except Exception as exc:
                warnings.append(f"NVML confidential-computing mode unavailable for GPU {index}: {exc}")
            try:
                protected_mem = getattr(pynvml, "nvmlDeviceGetConfComputeProtectedMemoryUsage")(handle)
                metrics[f"gpu_protected_memory_total_bytes{{{labels}}}"] = float(getattr(protected_mem, "total", 0))
                metrics[f"gpu_protected_memory_used_bytes{{{labels}}}"] = float(getattr(protected_mem, "used", 0))
            except Exception as exc:
                warnings.append(f"NVML protected-memory usage unavailable for GPU {index}: {exc}")
        pynvml.nvmlShutdown()
    except Exception as exc:
        metrics["gpu_confidential_compute_collector_available"] = 0
        warnings.append(f"NVML confidential collector failed without stopping exporter: {exc}")

    if not warnings:
        metrics["gpu_attestation_available"] = 1
        metrics["gpu_attestation_last_success"] = 1

    return {"metrics": metrics, "warnings": warnings}
