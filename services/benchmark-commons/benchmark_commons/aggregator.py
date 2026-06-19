from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

IDENTIFIER_FIELDS = {
    "tenant",
    "tenantId",
    "host",
    "hostId",
    "run",
    "runId",
    "job",
    "jobId",
    "user",
    "userId",
    "team",
    "teamId",
    "account",
    "accountId",
    "reservation",
    "reservationId",
    "namespace",
    "pod",
    "podName",
    "container",
    "ip",
    "email",
}

WORKLOAD_CLASSES = {
    "dense llm training": "llm-training",
    "llm training": "llm-training",
    "llm-training": "llm-training",
    "training": "llm-training",
    "fine tuning": "fine-tuning",
    "fine-tuning": "fine-tuning",
    "inference": "inference-serving",
    "inference serving": "inference-serving",
    "inference-serving": "inference-serving",
    "evaluation": "evaluation",
    "moe": "moe-training",
    "moe training": "moe-training",
    "moe-training": "moe-training",
}

REGION_CLASSES = {"us", "eu", "apac", "global", "other"}


def normalize_contribution(payload: dict[str, Any], *, opt_in: bool | None = None) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    opted_in = bool(payload.get("benchmarkOptIn")) if opt_in is None else bool(opt_in)
    if not opted_in:
        return None

    features = payload.get("features") if isinstance(payload.get("features"), dict) else payload
    metrics = payload.get("metrics") if isinstance(payload.get("metrics"), dict) else payload
    mfu_pct = _clamp(_number(metrics.get("mfuPct") if isinstance(metrics, dict) else None))
    gpu_model = _coarse_gpu_model(features.get("gpuModel") or payload.get("gpuModel"))
    workload_class = _workload_class(features.get("workloadClass") or payload.get("workloadClass") or payload.get("taskFamily"))
    region_class = _region_class(features.get("regionClass") or payload.get("regionClass") or payload.get("region"))
    if not gpu_model or mfu_pct is None:
        return None

    hfu_pct = _clamp(_number(metrics.get("hfuPct") if isinstance(metrics, dict) else None))
    contribution = {
        "schemaVersion": "turba.benchmark_contribution.v1",
        "benchmarkOptIn": True,
        "features": {
            "gpuModel": gpu_model,
            "workloadClass": workload_class,
            "regionClass": region_class,
            "mfuBucket": _bucket(mfu_pct, width=5),
        },
        "metrics": {
            "mfuPct": mfu_pct,
        },
    }
    if hfu_pct is not None:
        contribution["metrics"]["hfuPct"] = hfu_pct
    cost_bucket = _cost_bucket(_number(metrics.get("costPerUsefulGpuHour") if isinstance(metrics, dict) else None))
    if cost_bucket:
        contribution["metrics"]["costPerUsefulGpuHourBucket"] = cost_bucket
    return contribution


def contribution_percentile(
    contribution: dict[str, Any],
    corpus: list[dict[str, Any]],
    *,
    k: int = 5,
) -> dict[str, Any]:
    normalized = normalize_contribution(contribution, opt_in=True)
    normalized_corpus = [item for item in (normalize_contribution(row, opt_in=True) for row in corpus) if item]
    if not normalized:
        return {"status": "invalid", "suppressed": True, "count": 0}
    group = [
        row for row in normalized_corpus
        if _group_key(row) == _group_key(normalized)
    ]
    if len(group) < k:
        return {
            "status": "suppressed",
            "suppressed": True,
            "count": len(group),
            "minimumK": k,
            "features": normalized["features"],
        }
    values = sorted(float(row["metrics"]["mfuPct"]) for row in group)
    percentile = percentile_rank(float(normalized["metrics"]["mfuPct"]), values)
    return {
        "status": "ready",
        "suppressed": False,
        "count": len(group),
        "minimumK": k,
        "percentile": percentile,
        "features": normalized["features"],
        "medianMfuPct": _percentile_value(values, 50),
        "topQuartileMfuPct": _percentile_value(values, 75),
    }


def percentile_rank(value: float, values: list[float]) -> float:
    if not values:
        return 0.0
    below = sum(1 for item in values if item < value)
    equal = sum(1 for item in values if item == value)
    return round(((below + 0.5 * equal) / len(values)) * 100, 1)


@dataclass
class BenchmarkCommons:
    k: int = 5
    contributions: list[dict[str, Any]] = field(default_factory=list)

    def ingest(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        contribution = normalize_contribution(payload)
        if contribution:
            self.contributions.append(contribution)
        return contribution

    def percentile(self, payload: dict[str, Any]) -> dict[str, Any]:
        return contribution_percentile(payload, self.contributions, k=self.k)


def _group_key(contribution: dict[str, Any]) -> tuple[str, str]:
    features = contribution.get("features") or {}
    return str(features.get("gpuModel") or ""), str(features.get("workloadClass") or "")


def _coarse_gpu_model(value: Any) -> str:
    text = str(value or "").upper().replace("NVIDIA", "").replace("AMD", "").strip()
    if not text:
        return ""
    for token in ("H100", "H200", "B200", "A100", "MI300X", "GAUDI3", "TPU"):
        if token in text:
            return token
    return text.split()[0][:24]


def _workload_class(value: Any) -> str:
    text = str(value or "").strip().lower().replace("_", " ")
    return WORKLOAD_CLASSES.get(text, "other")


def _region_class(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text.startswith("us-") or text in {"usa", "na", "north-america"}:
        return "us"
    if text.startswith("eu-") or text in {"europe"}:
        return "eu"
    if text.startswith("ap-") or text.startswith("asia") or text in {"apac"}:
        return "apac"
    return text if text in REGION_CLASSES else "other"


def _bucket(value: float, *, width: int) -> str:
    low = int(value // width) * width
    high = min(100, low + width)
    return f"{low}-{high}"


def _cost_bucket(value: float | None) -> str:
    if value is None:
        return ""
    if value < 2:
        return "lt-2"
    if value < 5:
        return "2-5"
    if value < 10:
        return "5-10"
    return "gte-10"


def _percentile_value(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    index = min(len(values) - 1, max(0, round((percentile / 100) * (len(values) - 1))))
    return round(values[index], 2)


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _clamp(value: float | None) -> float | None:
    if value is None:
        return None
    return min(100.0, max(0.0, value))
