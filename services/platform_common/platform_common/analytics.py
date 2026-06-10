from __future__ import annotations

import math
import json
from collections import defaultdict
from typing import Any

RESOURCE_KEYS = ("cpu", "gpu", "ram", "network")


def resource_samples_from_metric_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        key = (str(row.get("host_id") or ""), str(row.get("event_ts") or ""))
        sample = grouped.setdefault(
            key,
            {
                "host_id": row.get("host_id") or "",
                "event_ts": str(row.get("event_ts") or ""),
                "cpu": None,
                "gpu": None,
                "ram": None,
                "network": None,
            },
        )
        metric_name = str(row.get("metric_name") or "")
        value = _number(row.get("metric_value"))
        if value is None:
            continue
        mapped = _map_metric(metric_name, value)
        if mapped:
            target, mapped_value = mapped
            current = sample.get(target)
            sample[target] = mapped_value if current is None else max(float(current), mapped_value)
    return sorted(grouped.values(), key=lambda sample: sample["event_ts"])


def covariance_snapshot(samples: list[dict[str, Any]]) -> dict[str, Any]:
    matrix = []
    for left in RESOURCE_KEYS:
        row = []
        for right in RESOURCE_KEYS:
            pairs = [
                (float(sample[left]), float(sample[right]))
                for sample in samples
                if _is_number(sample.get(left)) and _is_number(sample.get(right))
            ]
            cell = _covariance_cell(pairs, left == right)
            cell["leftMetric"] = left
            cell["rightMetric"] = right
            row.append(cell)
        matrix.append({"metric": left, "cells": row})
    return {"metrics": list(RESOURCE_KEYS), "rows": matrix, "sampleCount": len(samples)}


def principal_resource_mode(samples: list[dict[str, Any]]) -> dict[str, Any]:
    active_keys = []
    for key in RESOURCE_KEYS:
        values = [float(sample[key]) for sample in samples if _is_number(sample.get(key))]
        if len(values) >= 4 and _variance(values) > 0.0001:
            active_keys.append(key)
    if len(active_keys) < 2:
        return {
            "status": "learning",
            "title": "Learning resource mode",
            "explainedPct": None,
            "loadings": [{"metric": key, "value": None} for key in RESOURCE_KEYS],
            "eigenvalues": [],
        }
    matrix = []
    for left in active_keys:
        row = []
        for right in active_keys:
            row.append(1.0 if left == right else _correlation(samples, left, right))
        matrix.append(row)
    values, vectors = _jacobi(matrix)
    pairs = sorted(
        [{"value": max(0.0, value), "vector": vectors[index]} for index, value in enumerate(values)],
        key=lambda entry: entry["value"],
        reverse=True,
    )
    total = sum(pair["value"] for pair in pairs) or float(len(active_keys))
    principal = pairs[0]
    dominant_index = max(range(len(principal["vector"])), key=lambda index: abs(principal["vector"][index]))
    direction = -1 if principal["vector"][dominant_index] < 0 else 1
    directed = [value * direction for value in principal["vector"]]
    loading_by_key = {key: directed[index] for index, key in enumerate(active_keys)}
    dominant = sorted(
        [{"metric": key, "value": abs(value)} for key, value in loading_by_key.items()],
        key=lambda entry: entry["value"],
        reverse=True,
    )[:2]
    return {
        "status": "ready",
        "title": " + ".join(entry["metric"].upper() for entry in dominant),
        "explainedPct": principal["value"] / total * 100,
        "loadings": [{"metric": key, "value": loading_by_key.get(key)} for key in RESOURCE_KEYS],
        "eigenvalues": [
            {"value": pair["value"], "sharePct": pair["value"] / total * 100}
            for pair in pairs
        ],
    }


def gpu_starvation_rows(samples: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for sample in samples:
        gpu = _number(sample.get("gpu"))
        if gpu is None:
            continue
        pressures = _pressure_values(sample)
        bottleneck, pressure = _dominant_pressure(pressures)
        score = max(0.0, min(100.0, (50.0 - gpu) * 1.2 + max(0.0, pressure - 60.0) * 0.8))
        if score <= 0:
            continue
        rows.append(
            {
                "host_id": sample.get("host_id") or "",
                "event_ts": sample.get("event_ts") or "",
                "gpu": gpu,
                "bottleneck": bottleneck,
                "bottleneck_pressure": pressure,
                "starvation_score": score,
                "confidence": _confidence(score, pressure),
                "evidence": f"GPU utilization is {gpu:.1f}% while {bottleneck} pressure is {pressure:.1f}%.",
            }
        )
    return rows


def network_gpu_coupling_rows(samples: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for host_id, host_samples in _samples_by_host(samples).items():
        pairs = [
            (float(sample["network"]), float(sample["gpu"]))
            for sample in host_samples
            if _is_number(sample.get("network")) and _is_number(sample.get("gpu"))
        ]
        if len(pairs) < 2:
            rows.append(
                {
                    "host_id": host_id,
                    "sample_count": len(pairs),
                    "same_bucket_correlation": None,
                    "network_leads_gpu_correlation": None,
                    "gpu_leads_network_correlation": None,
                    "coupling_strength": 0.0,
                    "status": "learning",
                }
            )
            continue
        network = [pair[0] for pair in pairs]
        gpu = [pair[1] for pair in pairs]
        same = _corr_values(network, gpu)
        network_leads = _corr_values(network[:-1], gpu[1:]) if len(pairs) >= 3 else None
        gpu_leads = _corr_values(gpu[:-1], network[1:]) if len(pairs) >= 3 else None
        strength = max(abs(value) for value in (same, network_leads, gpu_leads) if value is not None) if any(
            value is not None for value in (same, network_leads, gpu_leads)
        ) else 0.0
        rows.append(
            {
                "host_id": host_id,
                "sample_count": len(pairs),
                "same_bucket_correlation": same,
                "network_leads_gpu_correlation": network_leads,
                "gpu_leads_network_correlation": gpu_leads,
                "coupling_strength": strength,
                "status": "ready" if len(pairs) >= 4 else "learning",
            }
        )
    return rows


def system_identification_signature_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    signature_rows = []
    for row in rows:
        if str(row.get("sensor_type") or "") != "system_identification":
            continue
        labels = _labels(row.get("labels_json"))
        if labels.get("kind") != "feature":
            continue
        metric_name = str(row.get("metric_name") or "")
        if not metric_name.startswith("system_id."):
            continue
        value = _number(row.get("metric_value"))
        if value is None:
            continue
        signature_rows.append(
            {
                "host_id": row.get("host_id") or "",
                "event_ts": str(row.get("event_ts") or ""),
                "run_id": row.get("run_id") or labels.get("experiment_id", ""),
                "experiment_id": labels.get("experiment_id", ""),
                "phase_id": labels.get("phase_id", ""),
                "target": labels.get("target", ""),
                "profile": labels.get("profile", ""),
                "output_metric": labels.get("output_metric", ""),
                "feature": metric_name.removeprefix("system_id."),
                "value": value,
            }
        )
    return sorted(
        signature_rows,
        key=lambda item: (
            item["host_id"],
            item["experiment_id"],
            item["target"],
            item["profile"],
            item["output_metric"],
            item["feature"],
        ),
    )


def noisy_neighbor_rows(samples: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for sample in samples:
        pressures = _pressure_values(sample)
        if not pressures:
            continue
        pressure_count = sum(1 for value in pressures.values() if value >= 75)
        if pressure_count < 2:
            continue
        dominant, value = _dominant_pressure(pressures)
        rows.append(
            {
                "host_id": sample.get("host_id") or "",
                "event_ts": sample.get("event_ts") or "",
                "dominant_pressure": dominant,
                "pressure_count": pressure_count,
                "contention_score": min(100.0, value + pressure_count * 8),
                "confidence": min(0.95, 0.45 + pressure_count * 0.15),
                "evidence": f"{pressure_count} resources are above contention threshold; dominant pressure is {dominant}.",
            }
        )
    return rows


def input_pipeline_stall_rows(samples: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for sample in samples:
        gpu = _number(sample.get("gpu"))
        cpu = _number(sample.get("cpu")) or 0.0
        ram = _number(sample.get("ram")) or 0.0
        network = _number(sample.get("network")) or 0.0
        if gpu is None or gpu >= 70:
            continue
        pipeline_pressure = max(cpu, ram, network)
        if pipeline_pressure < 60:
            continue
        stall_source = max({"cpu": cpu, "ram": ram, "network": network}.items(), key=lambda item: item[1])[0]
        rows.append(
            {
                "host_id": sample.get("host_id") or "",
                "event_ts": sample.get("event_ts") or "",
                "stall_source": stall_source,
                "gpu": gpu,
                "cpu": cpu,
                "ram": ram,
                "network": network,
                "stall_score": min(100.0, (70.0 - gpu) + (pipeline_pressure - 50.0)),
                "confidence": _confidence(70.0 - gpu, pipeline_pressure),
                "evidence": f"GPU is {gpu:.1f}% while {stall_source} pipeline pressure is {pipeline_pressure:.1f}%.",
            }
        )
    return rows


def alert_candidate_rows(samples: list[dict[str, Any]]) -> list[dict[str, Any]]:
    candidates = []
    for row in gpu_starvation_rows(samples):
        candidates.append(
            {
                "incident_key": f"{row['host_id']}:gpu-starvation:{row['bottleneck']}",
                "host_id": row["host_id"],
                "severity": "critical" if row["starvation_score"] >= 80 else "warning",
                "title": "GPU starvation",
                "confidence": row["confidence"],
                "owner": "platform-runtime",
                "evidence": row["evidence"],
                "source_table": "vs_gpu_starvation",
            }
        )
    for row in noisy_neighbor_rows(samples):
        candidates.append(
            {
                "incident_key": f"{row['host_id']}:noisy-neighbor:{row['dominant_pressure']}",
                "host_id": row["host_id"],
                "severity": "critical" if row["contention_score"] >= 90 else "warning",
                "title": "Noisy-neighbor contention",
                "confidence": row["confidence"],
                "owner": "cluster-operations",
                "evidence": row["evidence"],
                "source_table": "vs_noisy_neighbor",
            }
        )
    for row in input_pipeline_stall_rows(samples):
        candidates.append(
            {
                "incident_key": f"{row['host_id']}:input-pipeline-stall:{row['stall_source']}",
                "host_id": row["host_id"],
                "severity": "critical" if row["stall_score"] >= 85 else "warning",
                "title": "Input pipeline stall",
                "confidence": row["confidence"],
                "owner": "ml-platform",
                "evidence": row["evidence"],
                "source_table": "vs_input_pipeline_stall",
            }
        )
    return candidates


def hardware_health_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    samples = _hardware_samples_from_metric_rows(rows)
    return sorted(samples.values(), key=lambda sample: (str(sample.get("host_id") or ""), str(sample.get("event_ts") or "")))


def repair_candidate_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    latest = _latest_hardware_by_host(rows)
    candidates = []
    for host_id, sample in sorted(latest.items()):
        fault_score = _number(sample.get("hardware_fault_score")) or 0.0
        critical = _number(sample.get("hardware_critical_fault_count")) or 0.0
        if fault_score < 18 and critical <= 0:
            continue
        family, action = _hardware_repair_action(sample)
        severity = "critical" if critical > 0 or fault_score >= 80 else "warning" if fault_score >= 45 else "info"
        confidence = max(0.5, min(0.95, (_number(sample.get("hardware_repair_confidence")) or 0.55) + min(0.2, fault_score / 500.0)))
        candidates.append(
            {
                "incident_key": f"{host_id}:hardware:{family}",
                "host_id": host_id,
                "event_ts": sample.get("event_ts") or "",
                "severity": severity,
                "title": f"Hardware health degraded: {family.replace('-', ' ')}",
                "confidence": round(confidence, 3),
                "owner": "fleet-reliability",
                "evidence": _hardware_evidence(sample, family),
                "source_table": "vs_host_hardware_health",
                "suggested_action": action,
                "requires_approval": bool((_number(sample.get("hardware_repair_requires_approval")) or 0) >= 1),
                "fault_score": fault_score,
            }
        )
    return candidates


def fleet_rca_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    latest = _latest_hardware_by_host(rows)
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for sample in latest.values():
        fault_score = _number(sample.get("hardware_fault_score")) or 0.0
        if fault_score < 18:
            continue
        family, _action = _hardware_repair_action(sample)
        groups[family].append(sample)

    fleet_size = max(1, len(latest))
    result = []
    for family, samples in sorted(groups.items(), key=lambda item: (-len(item[1]), item[0])):
        hosts = sorted(str(sample.get("host_id") or "") for sample in samples if sample.get("host_id"))
        mean_score = sum((_number(sample.get("hardware_fault_score")) or 0.0) for sample in samples) / len(samples)
        support = len(samples)
        result.append(
            {
                "root_cause_key": f"hardware:{family}",
                "title": f"{family.replace('-', ' ').title()} pattern across fleet",
                "support_count": support,
                "fleet_size": fleet_size,
                "affected_hosts_json": json.dumps(hosts, sort_keys=True),
                "confidence": round(min(0.95, 0.45 + support / fleet_size * 0.35 + mean_score / 500.0), 3),
                "mean_fault_score": round(mean_score, 3),
                "evidence": f"{support}/{fleet_size} observed host{'' if fleet_size == 1 else 's'} show {family.replace('-', ' ')} symptoms.",
                "suggested_action": _hardware_family_action(family),
            }
        )
    return result


def _hardware_samples_from_metric_rows(rows: list[dict[str, Any]]) -> dict[tuple[str, str], dict[str, Any]]:
    grouped: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        metric_name = str(row.get("metric_name") or "")
        if not metric_name.startswith("hardware_"):
            continue
        host_id = str(row.get("host_id") or "")
        event_ts = str(row.get("event_ts") or "")
        key = (host_id, event_ts)
        sample = grouped.setdefault(key, {"host_id": host_id, "event_ts": event_ts})
        value = _number(row.get("metric_value"))
        if value is not None:
            sample[metric_name] = value
    return grouped


def _latest_hardware_by_host(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for sample in hardware_health_rows(rows):
        host_id = str(sample.get("host_id") or "")
        if not host_id:
            continue
        if host_id not in latest or str(sample.get("event_ts") or "") >= str(latest[host_id].get("event_ts") or ""):
            latest[host_id] = sample
    return latest


def _hardware_repair_action(sample: dict[str, Any]) -> tuple[str, str]:
    if (_number(sample.get("hardware_machine_check_count")) or 0) > 0:
        return "machine-check", "open-repair-ticket"
    if (_number(sample.get("hardware_storage_error_count")) or 0) > 0:
        return "storage-error", "open-repair-ticket"
    if (_number(sample.get("hardware_gpu_xid_count")) or 0) > 0:
        return "gpu-xid", "restart-gpu-workload-or-open-ticket"
    if (_number(sample.get("hardware_thermal_throttle_active")) or 0) >= 1:
        return "thermal-throttle", "inspect-cooling-power"
    if (_number(sample.get("hardware_failed_unit_count")) or 0) > 0:
        return "failed-systemd-units", "restart-failed-services"
    if (_number(sample.get("hardware_oom_kill_count")) or 0) > 0:
        return "oom-kill", "reduce-memory-pressure"
    if (_number(sample.get("hardware_pcie_aer_count")) or 0) > 0:
        return "pcie-aer", "inspect-pcie-link"
    return "hardware-health", "inspect-host"


def _hardware_family_action(family: str) -> str:
    return {
        "machine-check": "open-repair-ticket",
        "storage-error": "open-repair-ticket",
        "gpu-xid": "restart-gpu-workload-or-open-ticket",
        "thermal-throttle": "inspect-cooling-power",
        "failed-systemd-units": "restart-failed-services",
        "oom-kill": "reduce-memory-pressure",
        "pcie-aer": "inspect-pcie-link",
    }.get(family, "inspect-host")


def _hardware_evidence(sample: dict[str, Any], family: str) -> str:
    score = _number(sample.get("hardware_fault_score")) or 0.0
    bits = [f"fault score {score:.1f}"]
    for key, label in (
        ("hardware_machine_check_count", "machine-check"),
        ("hardware_storage_error_count", "storage"),
        ("hardware_gpu_xid_count", "GPU Xid"),
        ("hardware_failed_unit_count", "failed unit"),
        ("hardware_oom_kill_count", "OOM"),
        ("hardware_pcie_aer_count", "PCIe AER"),
    ):
        value = _number(sample.get(key)) or 0.0
        if value > 0:
            bits.append(f"{value:.0f} {label}")
    if (_number(sample.get("hardware_thermal_throttle_active")) or 0) >= 1:
        bits.append("thermal throttle active")
    return f"{family.replace('-', ' ')} candidate from " + ", ".join(bits) + "."


def _map_metric(name: str, value: float) -> tuple[str, float] | None:
    lowered = name.lower()
    if "gpu_utilization" in lowered or lowered.endswith("gpu.utilization"):
        return ("gpu", _ratio_or_percent(value))
    if "network_utilization" in lowered or "network.utilizationpct" in lowered:
        return ("network", _ratio_or_percent(value))
    if "cpu_usage" in lowered or "cpu_prep" in lowered or "cputhrottlepct" in lowered or "offcputimepct" in lowered:
        return ("cpu", _ratio_or_percent(value))
    if "memory_used" in lowered or "linux_uma_memory_used" in lowered or "ram_usage" in lowered:
        return ("ram", _ratio_or_percent(value))
    return None


def _ratio_or_percent(value: float) -> float:
    return value * 100 if -1 <= value <= 1 else value


def _covariance_cell(pairs: list[tuple[float, float]], diagonal: bool) -> dict[str, Any]:
    if len(pairs) < 4:
        return {"sampleCount": len(pairs), "covariance": None, "correlation": None}
    left_values = [pair[0] for pair in pairs]
    right_values = [pair[1] for pair in pairs]
    covariance = _covariance(left_values, right_values)
    correlation = 1.0 if diagonal else _corr_values(left_values, right_values)
    return {"sampleCount": len(pairs), "covariance": covariance, "correlation": correlation}


def _correlation(samples: list[dict[str, Any]], left: str, right: str) -> float:
    pairs = [
        (float(sample[left]), float(sample[right]))
        for sample in samples
        if _is_number(sample.get(left)) and _is_number(sample.get(right))
    ]
    if len(pairs) < 4:
        return 0.0
    return _corr_values([pair[0] for pair in pairs], [pair[1] for pair in pairs]) or 0.0


def _covariance(left: list[float], right: list[float]) -> float:
    if len(left) < 2 or len(left) != len(right):
        return 0.0
    left_avg = sum(left) / len(left)
    right_avg = sum(right) / len(right)
    return sum((l - left_avg) * (r - right_avg) for l, r in zip(left, right)) / max(1, len(left) - 1)


def _variance(values: list[float]) -> float:
    return _covariance(values, values)


def _corr_values(left: list[float], right: list[float]) -> float | None:
    left_var = _variance(left)
    right_var = _variance(right)
    if left_var <= 0 or right_var <= 0:
        return None
    return _covariance(left, right) / math.sqrt(left_var * right_var)


def _jacobi(matrix: list[list[float]]) -> tuple[list[float], list[list[float]]]:
    n = len(matrix)
    values = [row[:] for row in matrix]
    vectors = [[1.0 if row == column else 0.0 for column in range(n)] for row in range(n)]
    for _ in range(80):
        p, q, largest = 0, 1, 0.0
        for row in range(n):
            for column in range(row + 1, n):
                magnitude = abs(values[row][column])
                if magnitude > largest:
                    p, q, largest = row, column, magnitude
        if largest < 1e-10:
            break
        app, aqq, apq = values[p][p], values[q][q], values[p][q]
        tau = (aqq - app) / (2 * apq)
        sign = 1 if tau >= 0 else -1
        t = sign / (abs(tau) + math.sqrt(1 + tau * tau))
        c = 1 / math.sqrt(1 + t * t)
        s = t * c
        for index in range(n):
            if index not in (p, q):
                aip, aiq = values[index][p], values[index][q]
                values[index][p] = c * aip - s * aiq
                values[p][index] = values[index][p]
                values[index][q] = s * aip + c * aiq
                values[q][index] = values[index][q]
        values[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq
        values[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq
        values[p][q] = values[q][p] = 0.0
        for row in range(n):
            vip, viq = vectors[row][p], vectors[row][q]
            vectors[row][p] = c * vip - s * viq
            vectors[row][q] = s * vip + c * viq
    return [values[index][index] for index in range(n)], [
        [vectors[row][index] for row in range(n)] for index in range(n)
    ]


def _number(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _is_number(value: Any) -> bool:
    return _number(value) is not None


def _pressure_values(sample: dict[str, Any]) -> dict[str, float]:
    values = {}
    for key in ("cpu", "ram", "network"):
        value = _number(sample.get(key))
        if value is not None:
            values[key] = value
    return values


def _dominant_pressure(values: dict[str, float]) -> tuple[str, float]:
    if not values:
        return ("unknown", 0.0)
    return max(values.items(), key=lambda item: item[1])


def _confidence(score: float, pressure: float) -> float:
    return max(0.25, min(0.95, 0.35 + score / 180.0 + pressure / 300.0))


def _samples_by_host(samples: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for sample in samples:
        grouped[str(sample.get("host_id") or "")].append(sample)
    return grouped


def _labels(value: Any) -> dict[str, str]:
    if not value:
        return {}
    if isinstance(value, dict):
        return {str(key): str(item) for key, item in value.items()}
    try:
        parsed = json.loads(str(value))
    except json.JSONDecodeError:
        return {}
    if not isinstance(parsed, dict):
        return {}
    return {str(key): str(item) for key, item in parsed.items()}
