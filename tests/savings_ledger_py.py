"""Savings-ledger parity emitter for platform_common.predictive."""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "services", "platform_common", "platform_common"))

import predictive as p  # noqa: E402

action = {
    "id": "act-repack-1",
    "title": "Repack stranded GPUs",
    "category": "Scheduler + Capacity",
    "impactDollars": 360,
    "impactGpuHours": 60,
    "confidence": 82,
}
baseline = {
    "id": "snap-before",
    "capturedAt": "2026-06-01T00:00:00.000Z",
    "scope": "tenant",
    "key": "tenant-a",
    "window": "2026-05-01T00:00:00.000Z/2026-06-01T00:00:00.000Z",
    "rate": 6,
    "metrics": {"wastedGpuHours": 120, "usefulCompute": 52},
}
result = {
    "id": "snap-after",
    "capturedAt": "2026-06-08T00:00:00.000Z",
    "scope": "tenant",
    "key": "tenant-a",
    "window": "2026-06-01T00:00:00.000Z/2026-06-08T00:00:00.000Z",
    "rate": 6,
    "metrics": {"wastedGpuHours": 70, "usefulCompute": 61},
}

entry = p.record_outcome(action, baseline, result)
assert entry["status"] == "verified"
assert entry["attribution"] == "measured"
assert entry["deltaGpuHours"] == 50
assert entry["deltaDollars"] == 300

modeled = p.record_outcome({**action, "id": "act-modeled", "impactDollars": 120, "impactGpuHours": 20}, baseline, None)
assert modeled["status"] == "proposed"
assert modeled["attribution"] == "modeled"

state = p.record_outcome(action, None, None, status="proposed")
state = p.advance_ledger_status(state, {"type": "accept", "at": "2026-06-02T00:00:00.000Z"})
state = p.advance_ledger_status(state, {"type": "apply", "at": "2026-06-03T00:00:00.000Z"})
state = p.advance_ledger_status(state, {"type": "verify", "at": "2026-06-08T00:00:00.000Z"})
assert state["status"] == "verified"
try:
    p.advance_ledger_status(state, "apply")
    raise AssertionError("terminal transition should fail")
except ValueError:
    pass

rollup = p.rollup_ledger([entry, modeled], scope={"type": "tenant", "key": "tenant-a"})
assert rollup["verifiedDollars"] == 300
assert rollup["verifiedGpuHours"] == 50
assert rollup["modeledCount"] == 1

print("savings ledger python tests passed", file=sys.stderr)
print("PARITY " + json.dumps({
    "entry_id": entry["id"],
    "entry_status": entry["status"],
    "delta_gpu_hours": entry["deltaGpuHours"],
    "delta_dollars": entry["deltaDollars"],
    "modeled_status": modeled["status"],
    "rollup_verified_dollars": rollup["verifiedDollars"],
    "rollup_verified_gpu_hours": rollup["verifiedGpuHours"],
    "rollup_realization_rate": rollup["realizationRate"],
    "transition_status": state["status"],
}, sort_keys=True))
