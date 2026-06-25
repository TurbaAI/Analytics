"""Predictive + prescriptive analytics for the lakehouse lane.

This mirrors predictive-core.js so the durable pipeline (raw writer / transform
runner / API) can compute the same forecasts, saturation ETAs, anomaly flags,
regression-risk scores, and prescribed remediation plans the dashboard shows.

Stdlib only (math) to match the rest of platform_common.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Iterable, Sequence

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

EFFORT_BY_CATEGORY: dict[str, int] = {
    "Useful Compute FinOps": 2,
    "Fabric + Topology": 4,
    "Data Pipeline": 3,
    "Scheduler + Capacity": 3,
    "Provider SLO + Escalation": 2,
    "Inference Economics": 3,
    "Host Kernel + eBPF": 4,
    "Fleet Reliability": 4,
    "Energy + Carbon": 1,
    "Customer Evidence Pack": 1,
}

METRIC_TO_CATEGORY: dict[str, str] = {
    "hbmCapacity": "Memory",
    "hbmBandwidth": "Memory",
    "memoryFragmentation": "Memory",
    "kvCachePressure": "Inference Economics",
    "queueWaitMinutes": "Scheduler + Capacity",
    "idleGpus": "Scheduler + Capacity",
    "partialNodes": "Scheduler + Capacity",
    "ncclTime": "Fabric + Topology",
    "networkWait": "Fabric + Topology",
    "crossPodTraffic": "Fabric + Topology",
    "dataloaderStall": "Data Pipeline",
    "storageWait": "Data Pipeline",
    "wastedGpuHours": "Useful Compute FinOps",
    "costPerUsefulGpuHour": "Useful Compute FinOps",
    "latencyTail": "Inference Economics",
}


def _numeric(value: Any, fallback: float = 0.0) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback
    return n if math.isfinite(n) else fallback


def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return min(hi, max(lo, _numeric(value, lo)))


def _round(value: float, places: int = 0) -> float:
    factor = 10 ** places
    return round(_numeric(value) * factor) / factor


def _mean(values: Sequence[float]) -> float:
    clean = [v for v in values if math.isfinite(v)]
    return sum(clean) / len(clean) if clean else 0.0


def _stddev(values: Sequence[float], sample: bool = True) -> float:
    clean = [v for v in values if math.isfinite(v)]
    if len(clean) < 2:
        return 0.0
    avg = _mean(clean)
    denom = len(clean) - 1 if sample else len(clean)
    variance = sum((v - avg) ** 2 for v in clean) / denom
    return math.sqrt(max(0.0, variance))


def _median(values: Sequence[float]) -> float:
    clean = sorted(v for v in values if math.isfinite(v))
    if not clean:
        return 0.0
    mid = len(clean) // 2
    if len(clean) % 2 == 0:
        return (clean[mid - 1] + clean[mid]) / 2
    return clean[mid]


def _mad(values: Sequence[float], center: float | None = None) -> float:
    clean = [v for v in values if math.isfinite(v)]
    if not clean:
        return 0.0
    mid = center if center is not None else _median(clean)
    return _median([abs(v - mid) for v in clean])


def _to_epoch_ms(value: Any) -> float | None:
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return float(value)
    if isinstance(value, str):
        try:
            text = value.replace("Z", "+00:00")
            return datetime.fromisoformat(text).timestamp() * 1000.0
        except ValueError:
            return None
    return None


def normalize_series(points: Iterable[Any]) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    for index, point in enumerate(points or []):
        if isinstance(point, (int, float)):
            rows.append({"x": index, "y": _numeric(point, math.nan), "t": None})
            continue
        if isinstance(point, dict):
            y = _numeric(point.get("value", point.get("y")), math.nan)
            t_raw = (
                point.get("t")
                if point.get("t") is not None
                else point.get("timestamp")
                if point.get("timestamp") is not None
                else point.get("capturedAt")
                if point.get("capturedAt") is not None
                else point.get("at", point.get("time"))
            )
            t = None if t_raw is None else _to_epoch_ms(t_raw)
            rows.append({"x": index if t is None else t, "y": y, "t": t})
            continue
        rows.append({"x": index, "y": math.nan, "t": None})

    rows = [r for r in rows if math.isfinite(r["y"])]
    rows.sort(key=lambda r: r["x"])

    has_time = len(rows) > 1 and all(r["t"] is not None for r in rows)
    period_ms: float | None = None
    if has_time:
        gaps = [rows[i]["t"] - rows[i - 1]["t"] for i in range(1, len(rows))]
        period_ms = _median(gaps) or None
    return {"rows": rows, "has_time": has_time, "period_ms": period_ms}


def linear_fit(ys: Sequence[float]) -> dict[str, float]:
    n = len(ys)
    if n < 2:
        return {"slope": 0.0, "intercept": ys[0] if n == 1 else 0.0, "r2": 0.0, "residual_std": 0.0, "n": n}
    xs = list(range(n))
    x_bar = _mean(xs)
    y_bar = _mean(ys)
    sxx = sum((x - x_bar) ** 2 for x in xs)
    sxy = sum((xs[i] - x_bar) * (ys[i] - y_bar) for i in range(n))
    slope = 0.0 if sxx == 0 else sxy / sxx
    intercept = y_bar - slope * x_bar
    ss_res = sum((ys[i] - (intercept + slope * xs[i])) ** 2 for i in range(n))
    ss_tot = sum((ys[i] - y_bar) ** 2 for i in range(n))
    if ss_tot == 0:
        r2 = 1.0 if ss_res == 0 else 0.0
    else:
        r2 = _clamp(1 - ss_res / ss_tot, 0, 1)
    residual_std = math.sqrt(ss_res / (n - 2)) if n > 2 else 0.0
    return {"slope": slope, "intercept": intercept, "r2": r2, "residual_std": residual_std, "n": n}


# ---------------------------------------------------------------------------
# Predictive
# ---------------------------------------------------------------------------


def _linear_forecast_from_rows(rows: Sequence[dict[str, Any]], *, horizon: int = 3, higher_is_better: bool = True,
                               confidence_z: float = 1.2816, flat_threshold: float = 0.05) -> dict[str, Any]:
    ys = [r["y"] for r in rows]
    fit = linear_fit(ys)
    last_index = len(ys) - 1
    last_value = ys[last_index]
    has_time = len(rows) > 1 and all(r.get("t") is not None for r in rows)
    period_ms = None
    if has_time:
        gaps = [rows[i]["t"] - rows[i - 1]["t"] for i in range(1, len(rows))]
        period_ms = _median(gaps) or None

    projections = []
    for step in range(1, horizon + 1):
        idx = last_index + step
        value = fit["intercept"] + fit["slope"] * idx
        spread = confidence_z * fit["residual_std"] * math.sqrt(1 + step / max(1, len(ys)))
        eta_ms = None
        if has_time and period_ms:
            eta_ms = rows[last_index]["t"] + step * period_ms
        projections.append({
            "step": step,
            "value": _round(value, 2),
            "lower": _round(value - spread, 2),
            "upper": _round(value + spread, 2),
            "eta_ms": eta_ms,
        })

    meaningful = abs(fit["slope"]) >= flat_threshold
    rising = fit["slope"] > 0
    direction = "flat" if not meaningful else ("rising" if rising else "falling")
    improving = (rising if higher_is_better else not rising) if meaningful else None
    trend = "flat" if direction == "flat" else ("improving" if improving else "regressing")

    sample_factor = _clamp(len(rows) / 8, 0.3, 1)
    confidence = _round(_clamp(100 * fit["r2"] * sample_factor + 8, 0, 95))

    return {
        "ok": True,
        "model": "linear",
        "count": len(rows),
        "higher_is_better": higher_is_better,
        "last_value": _round(last_value, 2),
        "slope_per_period": _round(fit["slope"], 4),
        "r2": _round(fit["r2"], 3),
        "fit_quality": _round(fit["r2"], 3),
        "residual_std": _round(fit["residual_std"], 3),
        "direction": direction,
        "trend": trend,
        "improving": improving is True,
        "horizon": horizon,
        "projected_value": projections[-1]["value"],
        "projections": projections,
        "period_ms": period_ms,
        "confidence": confidence,
        "_fit": fit,
    }


def _linear_baseline_for(forecast: dict[str, Any] | None) -> dict[str, Any] | None:
    if not forecast or not forecast.get("ok"):
        return None
    return {
        "model": "linear",
        "projected_value": forecast.get("projected_value"),
        "slope_per_period": forecast.get("slope_per_period"),
        "r2": forecast.get("r2"),
        "residual_std": forecast.get("residual_std"),
        "confidence": forecast.get("confidence"),
    }


def state_space_forecast_from_rows(rows: Sequence[dict[str, Any]], *, horizon: int = 3,
                                   higher_is_better: bool = True, confidence_z: float = 1.2816,
                                   flat_threshold: float = 0.05, damping: float = 0.98,
                                   measurement_variance: float | None = None,
                                   level_process_variance: float | None = None,
                                   slope_process_variance: float | None = None,
                                   level_process_noise: float = 0.08,
                                   slope_process_noise: float = 0.025,
                                   linear: dict[str, Any] | None = None) -> dict[str, Any]:
    ys = [r["y"] for r in rows]
    if len(ys) < 3:
        return {"ok": False, "reason": "insufficient-state-space-data"}

    damping = _clamp(_numeric(damping, 0.98), 0.5, 1)
    fit = (linear or {}).get("_fit") or linear_fit(ys)
    diffs = [ys[i] - ys[i - 1] for i in range(1, len(ys))]
    avg_abs = abs(_mean(ys))
    value_std = _stddev(ys) or 0.0
    diff_std = _stddev(diffs) or 0.0
    residual_std = fit.get("residual_std") or diff_std or value_std * 0.1 or avg_abs * 0.02 or 1.0
    scale = max(residual_std, diff_std * 0.75, value_std * 0.05, avg_abs * 0.01, 1e-3)
    base_variance = scale ** 2
    measurement_var = max(1e-9, measurement_variance if measurement_variance is not None else base_variance)
    process_level_var = max(1e-10, level_process_variance if level_process_variance is not None else base_variance * level_process_noise)
    process_slope_var = max(1e-10, slope_process_variance if slope_process_variance is not None else base_variance * slope_process_noise)

    level = ys[0]
    slope = diffs[0] if diffs else fit.get("slope", 0.0)
    p00 = base_variance * 4
    p01 = 0.0
    p10 = 0.0
    p11 = base_variance
    innovations: list[float] = []
    naive_errors: list[float] = []

    for i in range(1, len(ys)):
        predicted_level = level + damping * slope
        predicted_slope = damping * slope
        pp00 = p00 + damping * p01 + damping * p10 + damping * damping * p11 + process_level_var
        pp01 = damping * p01 + damping * damping * p11
        pp10 = damping * p10 + damping * damping * p11
        pp11 = damping * damping * p11 + process_slope_var
        innovation = ys[i] - predicted_level
        innovation_var = pp00 + measurement_var
        k0 = 0.0 if innovation_var <= 0 else pp00 / innovation_var
        k1 = 0.0 if innovation_var <= 0 else pp10 / innovation_var
        innovations.append(innovation)
        naive_errors.append(ys[i] - ys[i - 1])
        level = predicted_level + k0 * innovation
        slope = predicted_slope + k1 * innovation
        p00 = max(1e-12, (1 - k0) * pp00)
        p01 = (1 - k0) * pp01
        p10 = pp10 - k1 * pp00
        p11 = max(1e-12, pp11 - k1 * pp01)
        off = (p01 + p10) / 2
        p01 = off
        p10 = off

    rmse = math.sqrt(_mean([v ** 2 for v in innovations]))
    naive_rmse = math.sqrt(_mean([v ** 2 for v in naive_errors]))
    if naive_rmse > 1e-9:
        forecast_skill = _clamp(1 - rmse / naive_rmse, 0, 1)
    else:
        forecast_skill = 1.0 if rmse <= scale else 0.0
    fit_quality = _clamp(1 - rmse / max(value_std, scale, 1e-9), 0, 1)

    last_index = len(ys) - 1
    last_value = ys[last_index]
    has_time = len(rows) > 1 and all(r.get("t") is not None for r in rows)
    period_ms = None
    if has_time:
        gaps = [rows[i]["t"] - rows[i - 1]["t"] for i in range(1, len(rows))]
        period_ms = _median(gaps) or None

    f_level = level
    f_slope = slope
    fp00, fp01, fp10, fp11 = p00, p01, p10, p11
    projections = []
    for step in range(1, horizon + 1):
        next_level = f_level + damping * f_slope
        next_slope = damping * f_slope
        n00 = fp00 + damping * fp01 + damping * fp10 + damping * damping * fp11 + process_level_var
        n01 = damping * fp01 + damping * damping * fp11
        n10 = damping * fp10 + damping * damping * fp11
        n11 = damping * damping * fp11 + process_slope_var
        f_level = next_level
        f_slope = next_slope
        fp00 = max(1e-12, n00)
        fp01 = n01
        fp10 = n10
        fp11 = max(1e-12, n11)
        predictive_std = math.sqrt(max(0.0, fp00 + measurement_var))
        eta_ms = rows[last_index]["t"] + step * period_ms if has_time and period_ms else None
        projections.append({
            "step": step,
            "value": _round(f_level, 2),
            "lower": _round(f_level - confidence_z * predictive_std, 2),
            "upper": _round(f_level + confidence_z * predictive_std, 2),
            "eta_ms": eta_ms,
        })

    slope_raw = damping * slope
    meaningful = abs(slope_raw) >= flat_threshold
    rising = slope_raw > 0
    direction = "flat" if not meaningful else ("rising" if rising else "falling")
    improving = (rising if higher_is_better else not rising) if meaningful else None
    trend = "flat" if direction == "flat" else ("improving" if improving else "regressing")
    sample_factor = _clamp(len(rows) / 8, 0.45, 1)
    uncertainty_ratio = math.sqrt(max(0.0, p00 + measurement_var)) / max(abs(last_value), scale, 1e-9)
    confidence = _round(_clamp(
        100 * (0.45 * forecast_skill + 0.25 * fit_quality + 0.3 * fit.get("r2", 0.0)) * sample_factor + 10 - uncertainty_ratio * 10,
        0,
        96,
    ))

    return {
        "ok": True,
        "model": "state-space",
        "count": len(rows),
        "higher_is_better": higher_is_better,
        "last_value": _round(last_value, 2),
        "slope_per_period": _round(slope_raw, 4),
        "r2": (linear or {}).get("r2", _round(fit.get("r2", 0.0), 3)),
        "fit_quality": _round(fit_quality, 3),
        "forecast_skill": _round(forecast_skill * 100),
        "residual_std": _round(rmse, 3),
        "direction": direction,
        "trend": trend,
        "improving": improving is True,
        "horizon": horizon,
        "projected_value": projections[-1]["value"],
        "projections": projections,
        "period_ms": period_ms,
        "confidence": confidence,
        "baseline": _linear_baseline_for(linear),
        "state": {
            "level": _round(level, 3),
            "slope": _round(slope, 4),
            "damping": damping,
            "measurement_std": _round(math.sqrt(measurement_var), 3),
            "process_level_std": _round(math.sqrt(process_level_var), 3),
            "process_slope_std": _round(math.sqrt(process_slope_var), 3),
        },
        "band_method": "kalman-predictive-variance",
    }


def forecast_metric(points: Iterable[Any], *, horizon: int = 3, higher_is_better: bool = True,
                    confidence_z: float = 1.2816, flat_threshold: float = 0.05,
                    model: str = "state-space", forecast_model: str | None = None,
                    min_state_space_samples: int = 3, damping: float = 0.98,
                    measurement_variance: float | None = None,
                    level_process_variance: float | None = None,
                    slope_process_variance: float | None = None,
                    level_process_noise: float = 0.08,
                    slope_process_noise: float = 0.025) -> dict[str, Any]:
    norm = normalize_series(points)
    rows = norm["rows"]
    horizon = max(1, int(horizon))
    selected_model = str(forecast_model or model or "state-space").lower()
    if len(rows) < 2:
        return {
            "ok": False,
            "reason": "no-data" if not rows else "insufficient-data",
            "count": len(rows),
            "model": selected_model,
            "slope_per_period": 0.0,
            "direction": "flat",
            "trend": "flat",
            "projections": [],
            "confidence": 0,
        }

    linear = _linear_forecast_from_rows(
        rows,
        horizon=horizon,
        higher_is_better=higher_is_better,
        confidence_z=confidence_z,
        flat_threshold=flat_threshold,
    )
    if selected_model == "linear" or len(rows) < max(3, int(min_state_space_samples)):
        out = dict(linear)
        out["baseline"] = _linear_baseline_for(linear)
        out.pop("_fit", None)
        return out

    state_space = state_space_forecast_from_rows(
        rows,
        horizon=horizon,
        higher_is_better=higher_is_better,
        confidence_z=confidence_z,
        flat_threshold=flat_threshold,
        damping=damping,
        measurement_variance=measurement_variance,
        level_process_variance=level_process_variance,
        slope_process_variance=slope_process_variance,
        level_process_noise=level_process_noise,
        slope_process_noise=slope_process_noise,
        linear=linear,
    )
    if not state_space.get("ok"):
        out = dict(linear)
        out["baseline"] = _linear_baseline_for(linear)
        out["fallback_reason"] = state_space.get("reason", "state-space-unavailable")
        out.pop("_fit", None)
        return out
    return state_space


def time_to_threshold(points: Iterable[Any], threshold: float, *, direction: str | None = None,
                      flat_threshold: float = 1e-6, model: str = "state-space",
                      forecast_model: str | None = None) -> dict[str, Any]:
    limit = _numeric(threshold, math.nan)
    norm = normalize_series(points)
    rows = norm["rows"]
    if not math.isfinite(limit) or len(rows) < 2:
        return {"ok": False, "reason": "insufficient-data", "will_cross": False, "confidence": 0}

    ys = [r["y"] for r in rows]
    forecast = forecast_metric(points, horizon=1, model=model, forecast_model=forecast_model, flat_threshold=flat_threshold)
    fit = linear_fit(ys)
    last_value = ys[-1]
    direction = direction or ("above" if last_value <= limit else "below")
    slope = _numeric(forecast.get("slope_per_period"), math.nan)
    if not math.isfinite(slope):
        slope = fit["slope"]

    if abs(slope) < flat_threshold:
        return {
            "ok": True,
            "will_cross": False,
            "reason": "flat-trend",
            "last_value": _round(last_value, 2),
            "threshold": limit,
            "direction": direction,
            "model": forecast.get("model", "linear"),
            "confidence": _round(_clamp(_numeric(forecast.get("confidence"), 60 * fit["r2"]), 0, 80)),
        }

    periods = (limit - last_value) / slope
    moving_toward = slope > 0 if direction == "above" else slope < 0
    will_cross = moving_toward and periods > 0
    periods_to_threshold = _round(periods, 2) if will_cross else None

    eta_ms = None
    eta_days = None
    if will_cross and norm["has_time"] and norm["period_ms"]:
        eta_ms = rows[-1]["t"] + periods * norm["period_ms"]
        eta_days = _round((periods * norm["period_ms"]) / 86_400_000, 2)

    sample_factor = _clamp(len(rows) / 8, 0.3, 1)
    confidence = _round(_clamp(100 * fit["r2"] * sample_factor, 0, 92))

    urgency = "none"
    if will_cross:
        horizon = periods_to_threshold if periods_to_threshold is not None else math.inf
        if horizon <= 2:
            urgency = "critical"
        elif horizon <= 5:
            urgency = "high"
        elif horizon <= 12:
            urgency = "watch"
        else:
            urgency = "low"

    return {
        "ok": True,
        "will_cross": will_cross,
        "direction": direction,
        "last_value": _round(last_value, 2),
        "threshold": limit,
        "model": forecast.get("model", "linear"),
        "slope_per_period": _round(slope, 4),
        "periods_to_threshold": periods_to_threshold,
        "eta_ms": eta_ms,
        "eta_days": eta_days,
        "urgency": urgency,
        "confidence": _round(_clamp(min(confidence, _numeric(forecast.get("confidence"), confidence)), 0, 92)),
    }


def detect_anomalies(points: Iterable[Any], *, method: str = "mad", sensitivity: float | None = None) -> dict[str, Any]:
    norm = normalize_series(points)
    rows = norm["rows"]
    ys = [r["y"] for r in rows]
    method = "zscore" if method == "zscore" else "mad"
    if len(ys) < 3:
        return {"ok": False, "reason": "insufficient-data", "method": method, "anomalies": [], "latest": None}

    if method == "zscore":
        center = _mean(ys)
        scale = _stddev(ys) or 1e-9
    else:
        center = _median(ys)
        scale = (_mad(ys, center) * 1.4826) or 1e-9

    def score_of(v: float) -> float:
        return (v - center) / scale

    sens = sensitivity if sensitivity is not None else (3.0 if method == "zscore" else 3.5)
    anomalies = []
    for index, row in enumerate(rows):
        score = score_of(row["y"])
        if abs(score) >= sens:
            anomalies.append({
                "index": index,
                "value": _round(row["y"], 3),
                "score": _round(score, 2),
                "direction": "high" if score > 0 else "low",
                "severity": "critical" if abs(score) >= sens * 1.6 else "warning",
                "t": row["t"],
            })

    last_score = score_of(ys[-1])
    latest = {
        "value": _round(ys[-1], 3),
        "score": _round(last_score, 2),
        "is_anomaly": abs(last_score) >= sens,
        "direction": "high" if last_score > 0 else "low",
        "severity": "critical" if abs(last_score) >= sens * 1.6 else ("warning" if abs(last_score) >= sens else "normal"),
    }
    return {
        "ok": True,
        "method": method,
        "center": _round(center, 3),
        "scale": _round(scale, 3),
        "sensitivity": sens,
        "anomalies": anomalies,
        "latest": latest,
    }


def regression_risk_score(points: Iterable[Any], *, higher_is_better: bool = True) -> dict[str, Any]:
    norm = normalize_series(points)
    ys = [r["y"] for r in norm["rows"]]
    if len(ys) < 3:
        return {"ok": False, "reason": "insufficient-data", "score": 0, "band": "unknown", "drivers": []}

    avg = _mean(ys)
    sd = _stddev(ys)
    fit = linear_fit(ys)
    last_value = ys[-1]

    cov = sd / abs(avg) if abs(avg) > 1e-9 else (1.0 if sd > 0 else 0.0)
    volatility_component = _clamp(cov * 140, 0, 45)

    worsening_slope = -fit["slope"] if higher_is_better else fit["slope"]
    slope_magnitude = worsening_slope / abs(avg) if abs(avg) > 1e-9 else worsening_slope
    trend_component = _clamp(slope_magnitude * 220, 0, 40)

    deviation = (avg - last_value) if higher_is_better else (last_value - avg)
    deviation_component = _clamp((deviation / sd if sd > 0 else 0) * 18, 0, 25)

    score = _round(_clamp(volatility_component + trend_component + deviation_component, 0, 100))
    band = "critical" if score >= 70 else "elevated" if score >= 45 else "watch" if score >= 22 else "stable"

    drivers = []
    if volatility_component >= 12:
        drivers.append({"name": "volatility", "weight": _round(volatility_component)})
    if trend_component >= 8:
        drivers.append({"name": "worsening-trend", "weight": _round(trend_component)})
    if deviation_component >= 6:
        drivers.append({"name": "recent-deviation", "weight": _round(deviation_component)})
    drivers.sort(key=lambda d: d["weight"], reverse=True)

    return {
        "ok": True,
        "score": score,
        "band": band,
        "higher_is_better": higher_is_better,
        "volatility": _round(cov, 3),
        "slope_per_period": _round(fit["slope"], 4),
        "last_value": _round(last_value, 2),
        "baseline": _round(avg, 2),
        "drivers": drivers,
    }


def analyze_predictive(series: dict[str, Iterable[Any]], *, horizon: int = 3,
                       metrics: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
    horizon = max(1, int(horizon))
    metric_opts = metrics or {}
    out: dict[str, Any] = {}
    warnings: list[dict[str, Any]] = []

    for key, points in series.items():
        cfg = metric_opts.get(key, {})
        higher_is_better = cfg.get("higher_is_better", cfg.get("higherIsBetter", True))
        forecast = forecast_metric(
            points,
            horizon=horizon,
            higher_is_better=higher_is_better,
            confidence_z=cfg.get("confidence_z", cfg.get("confidenceZ", 1.2816)),
            flat_threshold=cfg.get("flat_threshold", cfg.get("flatThreshold", 0.05)),
            model=cfg.get("model", "state-space"),
            forecast_model=cfg.get("forecast_model", cfg.get("forecastModel")),
            min_state_space_samples=cfg.get("min_state_space_samples", cfg.get("minStateSpaceSamples", 3)),
            damping=cfg.get("damping", cfg.get("trendDamping", 0.98)),
            measurement_variance=cfg.get("measurement_variance", cfg.get("measurementVariance")),
            level_process_variance=cfg.get("level_process_variance", cfg.get("levelProcessVariance")),
            slope_process_variance=cfg.get("slope_process_variance", cfg.get("slopeProcessVariance")),
            level_process_noise=cfg.get("level_process_noise", cfg.get("levelProcessNoise", 0.08)),
            slope_process_noise=cfg.get("slope_process_noise", cfg.get("slopeProcessNoise", 0.025)),
        )
        anomalies = detect_anomalies(points, **(cfg.get("anomaly") or {}))
        risk = regression_risk_score(points, higher_is_better=higher_is_better)
        saturation = None
        threshold = cfg.get("threshold")
        if threshold is not None and math.isfinite(_numeric(threshold, math.nan)):
            saturation = time_to_threshold(
                points,
                threshold,
                direction=cfg.get("direction"),
                model=cfg.get("model", "state-space"),
                forecast_model=cfg.get("forecast_model", cfg.get("forecastModel")),
            )
            if saturation["ok"] and saturation["will_cross"] and saturation["urgency"] in ("critical", "high"):
                warnings.append({
                    "metric": key,
                    "label": cfg.get("label", key),
                    "kind": "saturation",
                    "urgency": saturation["urgency"],
                    "periods_to_threshold": saturation["periods_to_threshold"],
                    "eta_days": saturation["eta_days"],
                    "threshold": saturation["threshold"],
                })
        if anomalies["ok"] and anomalies["latest"] and anomalies["latest"]["is_anomaly"]:
            warnings.append({
                "metric": key,
                "label": cfg.get("label", key),
                "kind": "anomaly",
                "urgency": "critical" if anomalies["latest"]["severity"] == "critical" else "high",
                "score": anomalies["latest"]["score"],
            })
        if risk["ok"] and risk["band"] == "critical":
            warnings.append({"metric": key, "label": cfg.get("label", key), "kind": "regression-risk", "urgency": "high", "score": risk["score"]})
        out[key] = {"label": cfg.get("label", key), "forecast": forecast, "anomalies": anomalies, "risk": risk, "saturation": saturation}

    urgency_rank = {"critical": 3, "high": 2, "watch": 1, "low": 0}
    warnings.sort(key=lambda w: urgency_rank.get(w["urgency"], 0), reverse=True)
    return {"horizon": horizon, "metrics": out, "warnings": warnings}


# ---------------------------------------------------------------------------
# Prescriptive
# ---------------------------------------------------------------------------


def _effort_for(opportunity: dict[str, Any]) -> int:
    base = EFFORT_BY_CATEGORY.get(opportunity.get("category"), 3)
    risk_bump = 1 if _clamp(_numeric(opportunity.get("riskScore")), 0, 100) >= 70 else 0
    return min(5, base + risk_bump)


def _risk_band_for(opportunity: dict[str, Any]) -> str:
    score = _clamp(_numeric(opportunity.get("riskScore")), 0, 100)
    return "high" if score >= 70 else "medium" if score >= 40 else "low"


def _verify_for(opportunity: dict[str, Any]) -> str:
    category = opportunity.get("category", "") or ""
    if "Topology" in category or "Fabric" in category:
        return "Compare NCCL trace time and cross-pod traffic for the same job shape before vs after the change."
    if "Data" in category:
        return "Compare GPU idle gaps against storage/eBPF latency windows before vs after moving the dataset."
    if "Scheduler" in category or "Capacity" in category:
        return "Re-run the bin-packing what-if and confirm idle GPUs and partial nodes dropped."
    if "Memory" in category:
        return "Confirm HBM capacity/bandwidth pressure fell without raising step time."
    if "Inference" in category:
        return "Track cost per million requests beside the latency tail for one full traffic cycle."
    if "SLO" in category or "Evidence" in category:
        return "Attach the redacted evidence pack and confirm queue/efficiency gaps closed against target."
    return "Capture a before/after snapshot of useful compute and wasted GPU-hours for the same scope."


def prescribe_actions(opportunities: Sequence[dict[str, Any]], *, min_impact_dollars: float = 0.0) -> dict[str, Any]:
    if isinstance(opportunities, dict):
        opportunities = opportunities.get("opportunities", [])
    actions = []
    for opportunity in opportunities or []:
        effort = _effort_for(opportunity)
        expected_dollars = max(0.0, _numeric(opportunity.get("impactDollars")))
        expected_gpu_hours = max(0.0, _numeric(opportunity.get("impactGpuHours")))
        confidence = _clamp(_numeric(opportunity.get("confidence")), 0, 100)
        roi = _round((expected_dollars * (confidence / 100)) / effort, 2)
        priority_score = _round(_clamp(
            roi / 12 + _numeric(opportunity.get("priorityScore")) * 0.5 + expected_gpu_hours / 20,
            0, 100,
        ))
        actions.append({
            "id": opportunity.get("id"),
            "title": opportunity.get("title"),
            "category": opportunity.get("category"),
            "owner": opportunity.get("owner", "platform"),
            "recommendation": opportunity.get("recommendation"),
            "evidence": opportunity.get("evidence"),
            "severity": opportunity.get("severity", "medium"),
            "expected_dollars": _round(expected_dollars),
            "expected_gpu_hours": _round(expected_gpu_hours, 1),
            "confidence": confidence,
            "effort": effort,
            "risk": _risk_band_for(opportunity),
            "roi": roi,
            "priority_score": priority_score,
            "verify": _verify_for(opportunity),
            "urgency": "standard",
        })

    actions = [a for a in actions if a["expected_dollars"] >= min_impact_dollars or a["expected_gpu_hours"] > 0]
    actions.sort(key=lambda a: (a["priority_score"], a["roi"]), reverse=True)
    return {
        "actions": actions,
        "total_expected_dollars": _round(sum(a["expected_dollars"] for a in actions)),
        "total_expected_gpu_hours": _round(sum(a["expected_gpu_hours"] for a in actions), 1),
        "count": len(actions),
    }


def optimize_action_plan(actions: Sequence[dict[str, Any]], *, effort_budget: float = 8.0,
                         max_actions: int | None = None, risk_tolerance: str = "medium") -> dict[str, Any]:
    if isinstance(actions, dict):
        actions = actions.get("actions", [])
    actions = list(actions or [])
    max_actions = int(max_actions) if max_actions else len(actions)
    risk_rank = {"low": 1, "medium": 2, "high": 3}
    allowed = risk_rank.get(risk_tolerance, 2)

    candidates = sorted(
        (a for a in actions if risk_rank.get(a["risk"], 2) <= allowed),
        key=lambda a: (a["roi"], a["expected_dollars"]),
        reverse=True,
    )

    selected: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    used_effort = 0.0
    for action in candidates:
        if len(selected) < max_actions and used_effort + action["effort"] <= effort_budget:
            selected.append(action)
            used_effort += action["effort"]
        else:
            skipped.append(action)
    for a in actions:
        if a not in selected and a not in skipped:
            skipped.append(a)

    total_dollars = _round(sum(a["expected_dollars"] for a in selected))
    total_gpu_hours = _round(sum(a["expected_gpu_hours"] for a in selected), 1)
    blended = _round(_mean([a["confidence"] for a in selected])) if selected else 0
    selected.sort(key=lambda a: a["priority_score"], reverse=True)

    return {
        "effort_budget": effort_budget,
        "used_effort": used_effort,
        "risk_tolerance": risk_tolerance,
        "selected": selected,
        "skipped": skipped,
        "total_expected_dollars": total_dollars,
        "total_expected_gpu_hours": total_gpu_hours,
        "blended_confidence": blended,
        "projected": {"recoverable_dollars": total_dollars, "recoverable_gpu_hours": total_gpu_hours, "confidence": blended},
    }


def _format_dollars(value: float) -> str:
    n = _numeric(value)
    if n >= 1000:
        return f"${_round(n / 1000, 1)}k"
    return f"${_round(n)}"


def build_action_plan(selected: Sequence[dict[str, Any]], *, title: str = "Prescribed remediation plan",
                      now: str | None = None) -> dict[str, Any]:
    if isinstance(selected, dict):
        selected = selected.get("selected", selected.get("actions", []))
    urgency_rank = {"critical": 3, "high": 2, "elevated": 2, "standard": 1, "watch": 1, "low": 0}
    ordered = sorted(
        list(selected or []),
        key=lambda a: (urgency_rank.get(a.get("urgency", "standard"), 1), a.get("priority_score", 0), a.get("roi", 0)),
        reverse=True,
    )

    steps = []
    for index, action in enumerate(ordered):
        steps.append({
            "step": index + 1,
            "actionId": action.get("id"),
            "metric": action.get("metric") or "wastedGpuHours",
            "action": action.get("title"),
            "category": action.get("category"),
            "owner": action.get("owner"),
            "urgency": action.get("urgency", "standard"),
            "do": action.get("recommendation"),
            "expected_impact": f"{_format_dollars(action.get('expected_dollars'))} / {action.get('expected_gpu_hours')} GPU-hours (confidence {action.get('confidence')}%)",
            "verify": action.get("verify"),
            "because": action.get("driver") or action.get("evidence"),
        })

    text = "\n".join(
        f"{s['step']}. [{str(s['urgency']).upper()}] {s['action']} ({s['owner']})\n"
        f"   Do: {s['do']}\n"
        f"   Expected: {s['expected_impact']}\n"
        f"   Verify: {s['verify']}"
        for s in steps
    )
    return {
        "title": title,
        "generated_at": now or datetime.now(timezone.utc).isoformat(),
        "step_count": len(steps),
        "total_expected_dollars": _round(sum(_numeric(a.get("expected_dollars")) for a in ordered)),
        "total_expected_gpu_hours": _round(sum(_numeric(a.get("expected_gpu_hours")) for a in ordered), 1),
        "steps": steps,
        "text": text,
    }


def forecast_driven_actions(prescription: Any, predictive: dict[str, Any]) -> dict[str, Any]:
    base = prescription.get("actions", []) if isinstance(prescription, dict) else list(prescription or [])
    actions = [dict(a) for a in base]
    warnings = (predictive or {}).get("warnings", [])
    directives: list[dict[str, Any]] = []
    urgency_rank = {"critical": 3, "high": 2, "watch": 1, "low": 0, "none": 0}

    for warning in warnings:
        category = METRIC_TO_CATEGORY.get(warning["metric"])
        match = next((a for a in actions if (a.get("category") or "").startswith(category or " ")), None)
        if warning.get("eta_days") is not None:
            horizon_text = f"~{warning['eta_days']} days"
        elif warning.get("periods_to_threshold") is not None:
            horizon_text = f"~{warning['periods_to_threshold']} periods"
        else:
            horizon_text = "soon"

        if warning["kind"] == "saturation":
            message = f"{warning['label']} is projected to cross {warning['threshold']} in {horizon_text}"
        elif warning["kind"] == "anomaly":
            message = f"{warning['label']} is anomalous now (score {warning['score']})"
        else:
            message = f"{warning['label']} shows high regression risk ({warning['score']})"

        if match is not None:
            if urgency_rank.get(warning["urgency"], 0) > urgency_rank.get(match["urgency"], 0):
                match["urgency"] = warning["urgency"]
            match["priority_score"] = _round(_clamp(match["priority_score"] + 20, 0, 100))
            match["driver"] = f"{message} → {match['recommendation']}"
            directives.append({"metric": warning["metric"], "urgency": warning["urgency"], "action": match["id"], "message": f"{message} → {match['title']} now."})
        else:
            directives.append({"metric": warning["metric"], "urgency": warning["urgency"], "action": None, "message": f"{message} → no standing action; investigate {warning['label']}."})

    actions.sort(key=lambda a: (urgency_rank.get(a.get("urgency"), 0), a.get("priority_score", 0)), reverse=True)
    directives.sort(key=lambda d: urgency_rank.get(d["urgency"], 0), reverse=True)
    urgent = sum(1 for d in directives if d["urgency"] in ("critical", "high"))
    return {"actions": actions, "directives": directives, "urgent_count": urgent}


def analyze_prescriptive(opportunities: Sequence[dict[str, Any]], *, predictive: dict[str, Any] | None = None,
                         effort_budget: float = 8.0, risk_tolerance: str = "medium",
                         max_actions: int | None = None, now: str | None = None) -> dict[str, Any]:
    prescription = prescribe_actions(opportunities)
    actions = prescription["actions"]
    directives: list[dict[str, Any]] = []
    if predictive:
        driven = forecast_driven_actions(prescription, predictive)
        actions = driven["actions"]
        directives = driven["directives"]
    plan = optimize_action_plan(actions, effort_budget=effort_budget, risk_tolerance=risk_tolerance, max_actions=max_actions)
    remediation = build_action_plan(plan["selected"], now=now)
    return {
        "summary": {
            "total_actions": len(actions),
            "selected_actions": len(plan["selected"]),
            "recoverable_dollars": plan["total_expected_dollars"],
            "recoverable_gpu_hours": plan["total_expected_gpu_hours"],
            "blended_confidence": plan["blended_confidence"],
            "urgent_directives": sum(1 for d in directives if d["urgency"] in ("critical", "high")),
        },
        "actions": actions,
        "plan": plan,
        "remediation": remediation,
        "directives": directives,
    }


LEDGER_STATUSES = ("proposed", "accepted", "applied", "verified", "rejected", "expired")
_LEDGER_TERMINAL_STATUSES = {"verified", "rejected", "expired"}
_LEDGER_EVENTS = {
    "accept": "accepted",
    "accepted": "accepted",
    "apply": "applied",
    "applied": "applied",
    "verify": "verified",
    "verified": "verified",
    "reject": "rejected",
    "rejected": "rejected",
    "expire": "expired",
    "expired": "expired",
}
_LEDGER_TRANSITIONS = {
    "proposed": {"accepted", "rejected", "expired"},
    "accepted": {"applied", "rejected", "expired"},
    "applied": {"verified", "rejected", "expired"},
    "verified": set(),
    "rejected": set(),
    "expired": set(),
}
_HIGHER_IS_BETTER_LEDGER_METRICS = {"usefulCompute", "usefulGpuHours", "gpuUtil", "grossMarginPct"}


def record_outcome(action: dict[str, Any] | None = None, baseline_snapshot: dict[str, Any] | None = None,
                   result_snapshot: dict[str, Any] | None = None, **opts: Any) -> dict[str, Any]:
    action = action or {}
    metric = str(opts.get("metric") or action.get("metric") or "wastedGpuHours")
    scope = _normalize_ledger_scope(opts.get("scope") or action.get("scope") or baseline_snapshot or result_snapshot or {})
    baseline_value = _snapshot_metric_value(baseline_snapshot, metric)
    result_value = _snapshot_metric_value(result_snapshot, metric)
    has_measured = bool(
        baseline_snapshot is not None
        and result_snapshot is not None
        and math.isfinite(baseline_value)
        and math.isfinite(result_value)
    )
    direction = opts.get("direction") or action.get("direction") or ("higherIsBetter" if metric in _HIGHER_IS_BETTER_LEDGER_METRICS else "lowerIsBetter")
    if has_measured:
        signed_delta = result_value - baseline_value if direction == "higherIsBetter" else baseline_value - result_value
    else:
        signed_delta = _numeric(opts.get("deltaGpuHours", action.get("expectedGpuHours", action.get("impactGpuHours", 0))))
    dollars_per_gpu_hour = _ledger_dollars_per_gpu_hour(action, baseline_snapshot, opts)
    delta_gpu_hours = _round(signed_delta, 3)
    explicit_delta_dollars = _numeric(opts.get("deltaDollars"), math.nan)
    delta_dollars = _round(explicit_delta_dollars if math.isfinite(explicit_delta_dollars) else delta_gpu_hours * dollars_per_gpu_hour, 2)
    predicted_gpu_hours = _round(_numeric(action.get("expectedGpuHours", action.get("impactGpuHours", opts.get("predictedGpuHours", abs(delta_gpu_hours))))), 3)
    predicted_dollars = _round(_numeric(action.get("expectedDollars", action.get("impactDollars", opts.get("predictedDollars", abs(delta_dollars))))), 2)
    status = _normalize_ledger_status(opts.get("status") or ("verified" if has_measured else "proposed"))
    category = str(action.get("category") or opts.get("category") or "Uncategorized")
    applied_at = _valid_ledger_iso(opts.get("appliedAt") or action.get("appliedAt"))
    verified_at = _valid_ledger_iso(opts.get("verifiedAt") or ((result_snapshot or {}).get("capturedAt") if status == "verified" else ""))
    evidence_ref = str(opts.get("evidenceRef") or action.get("evidenceRef") or _evidence_ref_for_snapshots(baseline_snapshot, result_snapshot))
    seed = "|".join([
        str(action.get("id") or action.get("actionId") or action.get("title") or "action"),
        scope["type"],
        scope["key"],
        metric,
        str((baseline_snapshot or {}).get("capturedAt") or "modeled"),
        str((result_snapshot or {}).get("capturedAt") or "pending"),
    ])

    return {
        "id": str(opts.get("id") or action.get("ledgerId") or f"ledger-{_hash_string(seed)}"),
        "actionId": str(action.get("id") or action.get("actionId") or opts.get("actionId") or "unknown-action"),
        "actionTitle": str(action.get("title") or action.get("name") or opts.get("actionTitle") or ""),
        "category": category,
        "scope": scope,
        "status": status,
        "metric": metric,
        "baseline": _ledger_snapshot_ref(baseline_snapshot, metric, baseline_value, opts.get("baseline") or {}),
        "result": _ledger_snapshot_ref(result_snapshot, metric, result_value, opts.get("result") or {}),
        "deltaGpuHours": delta_gpu_hours,
        "deltaDollars": delta_dollars,
        "predictedGpuHours": predicted_gpu_hours,
        "predictedDollars": predicted_dollars,
        "confidence": _round(_clamp(_numeric(action.get("confidence"), _numeric(opts.get("confidence"), 50)) * _clamp(_numeric(opts.get("fitQuality"), 1), 0, 1), 0, 100)),
        "attribution": "measured" if has_measured else "modeled",
        "appliedAt": applied_at or "",
        "verifiedAt": verified_at or "",
        "evidenceRef": evidence_ref,
    }


def advance_ledger_status(entry: dict[str, Any], event: str | dict[str, Any]) -> dict[str, Any]:
    current = _normalize_ledger_status((entry or {}).get("status", "proposed"))
    target = _ledger_target_status(event)
    if not target:
        raise ValueError(f"unknown ledger event: {event}")
    if target == current:
        next_entry = dict(entry)
        next_entry["status"] = current
        return next_entry
    if current in _LEDGER_TERMINAL_STATUSES or target not in _LEDGER_TRANSITIONS[current]:
        raise ValueError(f"illegal ledger transition: {current} -> {target}")
    at = ""
    if isinstance(event, dict):
        at = _valid_ledger_iso(event.get("at") or event.get("time") or event.get("timestamp"))
    next_entry = dict(entry)
    next_entry["status"] = target
    if target == "applied":
        next_entry["appliedAt"] = at or next_entry.get("appliedAt", "")
    if target == "verified":
        next_entry["verifiedAt"] = at or next_entry.get("verifiedAt", "")
    return next_entry


def rollup_ledger(entries: Sequence[dict[str, Any]], *, scope: dict[str, Any] | None = None,
                  window: str | None = None) -> dict[str, Any]:
    filtered = [
        entry for entry in list(entries or [])
        if _ledger_entry_in_scope(entry, scope)
        and _ledger_entry_in_window(entry, window)
    ]
    measured_verified = [entry for entry in filtered if entry.get("status") == "verified" and entry.get("attribution") == "measured"]
    verified_dollars = _round(sum(_numeric(entry.get("deltaDollars")) for entry in measured_verified), 2)
    verified_gpu_hours = _round(sum(_numeric(entry.get("deltaGpuHours")) for entry in measured_verified), 3)
    predicted_dollars = _round(sum(max(0, _numeric(entry.get("predictedDollars"))) for entry in filtered), 2)
    predicted_gpu_hours = _round(sum(max(0, _numeric(entry.get("predictedGpuHours"))) for entry in filtered), 3)
    return {
        "entryCount": len(filtered),
        "verifiedCount": len(measured_verified),
        "modeledCount": sum(1 for entry in filtered if entry.get("attribution") == "modeled"),
        "verifiedDollars": verified_dollars,
        "verifiedGpuHours": verified_gpu_hours,
        "predictedDollars": predicted_dollars,
        "predictedGpuHours": predicted_gpu_hours,
        "byScope": _ledger_group_rollup(measured_verified, lambda entry: f"{entry.get('scope', {}).get('type', 'unknown')}:{entry.get('scope', {}).get('key', 'unknown')}"),
        "byCategory": _ledger_group_rollup(measured_verified, lambda entry: entry.get("category") or "Uncategorized"),
        "realizationRate": _round((verified_dollars / predicted_dollars) * 100, 1) if predicted_dollars > 0 else 0,
    }


def _normalize_ledger_scope(value: dict[str, Any]) -> dict[str, str]:
    raw = value.get("scope") if isinstance(value.get("scope"), dict) else value
    return {
        "type": str(raw.get("type") or raw.get("scope") or "tenant"),
        "key": str(raw.get("key") or raw.get("id") or raw.get("tenantId") or raw.get("tenant") or raw.get("label") or "unknown"),
    }


def _snapshot_metric_value(snapshot: dict[str, Any] | None, metric: str) -> float:
    if not isinstance(snapshot, dict):
        return math.nan
    metrics = snapshot.get("metrics") if isinstance(snapshot.get("metrics"), dict) else {}
    return _numeric(metrics.get(metric, snapshot.get(metric, snapshot.get("value"))), math.nan)


def _ledger_dollars_per_gpu_hour(action: dict[str, Any], snapshot: dict[str, Any] | None, opts: dict[str, Any]) -> float:
    explicit = _numeric(opts.get("dollarsPerGpuHour", opts.get("rate", action.get("rate"))), math.nan)
    if math.isfinite(explicit) and explicit > 0:
        return explicit
    snapshot_rate = _numeric((snapshot or {}).get("rate"), math.nan)
    if math.isfinite(snapshot_rate) and snapshot_rate > 0:
        return snapshot_rate
    predicted_dollars = _numeric(action.get("expectedDollars", action.get("impactDollars")), math.nan)
    predicted_gpu_hours = _numeric(action.get("expectedGpuHours", action.get("impactGpuHours")), math.nan)
    if math.isfinite(predicted_dollars) and math.isfinite(predicted_gpu_hours) and predicted_gpu_hours != 0:
        return abs(predicted_dollars / predicted_gpu_hours)
    return 0.0


def _ledger_snapshot_ref(snapshot: dict[str, Any] | None, metric: str, value: float, fallback: dict[str, Any]) -> dict[str, Any]:
    source = snapshot if isinstance(snapshot, dict) else {}
    return {
        "value": _round(value, 3) if math.isfinite(value) else _numeric(fallback.get("value"), 0),
        "window": str(source.get("window") or fallback.get("window") or ""),
        "snapshotId": str(source.get("id") or source.get("snapshotId") or fallback.get("snapshotId") or ""),
    }


def _normalize_ledger_status(status: Any) -> str:
    value = str(status or "proposed")
    return value if value in LEDGER_STATUSES else "proposed"


def _ledger_target_status(event: str | dict[str, Any]) -> str:
    if isinstance(event, dict):
        value = event.get("type") or event.get("event") or event.get("status")
    else:
        value = event
    return _LEDGER_EVENTS.get(str(value or "").lower(), "")


def _ledger_entry_in_scope(entry: dict[str, Any], scope: dict[str, Any] | None) -> bool:
    if not scope:
        return True
    expected = _normalize_ledger_scope(scope)
    actual = entry.get("scope") or {}
    return str(actual.get("type") or "") == expected["type"] and str(actual.get("key") or "") == expected["key"]


def _ledger_entry_in_window(entry: dict[str, Any], window: str | None) -> bool:
    parsed = _parse_ledger_window(window)
    if parsed is None:
        return True
    at = _to_epoch_ms(entry.get("verifiedAt") or entry.get("appliedAt") or "")
    if at is None:
        return False
    return parsed[0] <= at <= parsed[1]


def _parse_ledger_window(window: str | None) -> tuple[float, float] | None:
    if not window:
        return None
    parts = str(window).split("/")
    if len(parts) != 2:
        return None
    start = _to_epoch_ms(parts[0])
    end = _to_epoch_ms(parts[1])
    if start is None or end is None:
        return None
    return start, end


def _ledger_group_rollup(entries: Sequence[dict[str, Any]], key_fn: Any) -> dict[str, dict[str, Any]]:
    groups: dict[str, dict[str, Any]] = {}
    for entry in entries:
        key = key_fn(entry)
        current = groups.get(key, {"verifiedDollars": 0, "verifiedGpuHours": 0, "count": 0})
        current["verifiedDollars"] = _round(current["verifiedDollars"] + _numeric(entry.get("deltaDollars")), 2)
        current["verifiedGpuHours"] = _round(current["verifiedGpuHours"] + _numeric(entry.get("deltaGpuHours")), 3)
        current["count"] += 1
        groups[key] = current
    return groups


def _valid_ledger_iso(value: Any) -> str:
    if not value:
        return ""
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        except ValueError:
            return ""
    return ""


def _evidence_ref_for_snapshots(baseline_snapshot: dict[str, Any] | None, result_snapshot: dict[str, Any] | None) -> str:
    refs = []
    for snapshot in (baseline_snapshot, result_snapshot):
        if isinstance(snapshot, dict):
            ref = snapshot.get("snapshotId") or snapshot.get("id")
            if ref:
                refs.append(str(ref))
    return "..".join(refs)


def _hash_string(value: str) -> str:
    hash_value = 2166136261
    for char in str(value):
        hash_value ^= ord(char)
        hash_value = (hash_value * 16777619) & 0xFFFFFFFF
    return format(hash_value, "08x")
