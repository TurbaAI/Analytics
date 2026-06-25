"""Self-asserting test + parity emitter for platform_common.predictive.

Runnable with plain `python3 tests/predictive_prescriptive_py.py` (stdlib only).
Prints a JSON blob of canonical results on the last line so the Node parity
test can confirm the Python lakehouse mirror matches predictive-core.js.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Import the module directly (stdlib-only) without triggering the platform_common
# package __init__, which pulls in heavier deps (pydantic) not present in the
# node-only CI lane.
sys.path.insert(0, os.path.join(ROOT, "services", "platform_common", "platform_common"))

import predictive as p  # noqa: E402

# --- forecastMetric --------------------------------------------------------
rising = p.forecast_metric([60, 64, 69, 73, 78], horizon=3, higher_is_better=True)
assert rising["ok"] is True
assert rising["model"] == "state-space"
assert rising["direction"] == "rising"
assert rising["trend"] == "improving"
assert len(rising["projections"]) == 3
assert rising["projections"][2]["value"] > rising["last_value"]
assert rising["band_method"] == "kalman-predictive-variance"
assert rising["forecast_skill"] > 60
assert rising["baseline"]["model"] == "linear"
assert rising["confidence"] > 50

regress = p.forecast_metric([10, 14, 19, 25, 31], higher_is_better=False, horizon=2)
assert regress["trend"] == "regressing"
linear = p.forecast_metric([60, 64, 69, 73, 78], horizon=3, model="linear")
assert linear["model"] == "linear"
assert linear["projected_value"] == rising["baseline"]["projected_value"]
assert p.forecast_metric([])["ok"] is False

# --- timeToThreshold -------------------------------------------------------
ttt = p.time_to_threshold([70, 74, 79, 84], 95, direction="above")
assert ttt["will_cross"] is True
assert 1 < ttt["periods_to_threshold"] < 5
assert ttt["urgency"] in ("critical", "high", "watch")
away = p.time_to_threshold([84, 79, 74, 70], 95, direction="above")
assert away["will_cross"] is False

# --- detectAnomalies -------------------------------------------------------
anom = p.detect_anomalies([50, 51, 49, 50, 52, 48, 95], method="mad")
assert anom["latest"]["is_anomaly"] is True
assert any(a["index"] == 6 for a in anom["anomalies"])
calm = p.detect_anomalies([50, 51, 49, 50, 52, 48, 50])
assert calm["latest"]["is_anomaly"] is False

# --- regressionRiskScore ---------------------------------------------------
risky = p.regression_risk_score([80, 70, 74, 60, 55, 45], higher_is_better=True)
stable = p.regression_risk_score([80, 81, 80, 79, 80, 80], higher_is_better=True)
assert risky["score"] > stable["score"]

# --- analyzePredictive -----------------------------------------------------
predictive = p.analyze_predictive(
    {"hbmCapacity": [70, 78, 85, 91, 95]},
    horizon=3,
    metrics={"hbmCapacity": {"higher_is_better": False, "threshold": 99, "direction": "above", "label": "HBM capacity"}},
)
assert any(w["metric"] == "hbmCapacity" for w in predictive["warnings"])

# --- prescriptive ----------------------------------------------------------
opportunities = [
    {"id": "mem", "title": "Relieve HBM pressure", "category": "Memory efficiency fix", "owner": "Platform",
     "impactDollars": 5000, "impactGpuHours": 120, "confidence": 70, "riskScore": 55, "priorityScore": 40,
     "recommendation": "Reduce HBM pressure.", "evidence": "hbm"},
    {"id": "fin", "title": "Recover spend", "category": "Useful Compute FinOps", "owner": "FinOps",
     "impactDollars": 9000, "impactGpuHours": 200, "confidence": 80, "riskScore": 50, "priorityScore": 65,
     "recommendation": "Rank pools.", "evidence": "fin"},
]
prescription = p.prescribe_actions(opportunities)
assert prescription["count"] == 2
for a in prescription["actions"]:
    assert 1 <= a["effort"] <= 5
    assert a["risk"] in ("low", "medium", "high")

plan = p.optimize_action_plan(prescription["actions"], effort_budget=3, risk_tolerance="high")
assert plan["used_effort"] <= 3
assert len(plan["selected"]) >= 1

driven = p.forecast_driven_actions(prescription, predictive)
mem = next(a for a in driven["actions"] if a["id"] == "mem")
assert mem["urgency"] in ("critical", "high")
assert "HBM" in (mem.get("driver") or "")

full = p.analyze_prescriptive(opportunities, predictive=predictive, effort_budget=6, risk_tolerance="high")
assert full["summary"]["recoverable_dollars"] > 0
assert full["summary"]["urgent_directives"] >= 1
remediation = full["remediation"]
assert remediation["step_count"] >= 1
assert "Verify:" in remediation["text"]

# --- canonical parity payload (discrete fields the Node test compares) -----
parity = {
    "forecast_model": rising["model"],
    "forecast_direction": rising["direction"],
    "forecast_trend": rising["trend"],
    "forecast_projection_count": len(rising["projections"]),
    "forecast_skill_gt_60": rising["forecast_skill"] > 60,
    "regress_trend": regress["trend"],
    "ttt_will_cross": ttt["will_cross"],
    "ttt_urgency": ttt["urgency"],
    "away_will_cross": away["will_cross"],
    "anomaly_latest": anom["latest"]["is_anomaly"],
    "anomaly_index_flagged": any(a["index"] == 6 for a in anom["anomalies"]),
    "predictive_warns_hbm": any(w["metric"] == "hbmCapacity" for w in predictive["warnings"]),
    "prescription_count": prescription["count"],
    "mem_escalated": mem["urgency"] in ("critical", "high"),
    "urgent_directives": full["summary"]["urgent_directives"],
}
print("predictive python tests passed", file=sys.stderr)
print("PARITY " + json.dumps(parity))
