const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const p = require("../predictive-core.js");

const root = path.join(__dirname, "..");
const pythonCmd = process.env.PYTHON || "python3";

const result = spawnSync(pythonCmd, ["tests/savings_ledger_py.py"], {
  cwd: root,
  encoding: "utf8"
});
if (result.stderr) process.stderr.write(result.stderr);
assert.equal(result.status, 0, "Python savings-ledger self-test should pass");

const line = (result.stdout || "").split("\n").find((l) => l.startsWith("PARITY "));
assert.ok(line, "Python savings-ledger test should emit a PARITY payload");
const py = JSON.parse(line.slice("PARITY ".length));

const action = {
  id: "act-repack-1",
  title: "Repack stranded GPUs",
  category: "Scheduler + Capacity",
  impactDollars: 360,
  impactGpuHours: 60,
  confidence: 82
};
const baseline = {
  id: "snap-before",
  capturedAt: "2026-06-01T00:00:00.000Z",
  scope: "tenant",
  key: "tenant-a",
  window: "2026-05-01T00:00:00.000Z/2026-06-01T00:00:00.000Z",
  rate: 6,
  metrics: { wastedGpuHours: 120, usefulCompute: 52 }
};
const after = {
  id: "snap-after",
  capturedAt: "2026-06-08T00:00:00.000Z",
  scope: "tenant",
  key: "tenant-a",
  window: "2026-06-01T00:00:00.000Z/2026-06-08T00:00:00.000Z",
  rate: 6,
  metrics: { wastedGpuHours: 70, usefulCompute: 61 }
};

const entry = p.recordOutcome(action, baseline, after);
const modeled = p.recordOutcome({ ...action, id: "act-modeled", impactDollars: 120, impactGpuHours: 20 }, baseline, null);
let transition = p.recordOutcome(action, null, null, { status: "proposed" });
transition = p.advanceLedgerStatus(transition, { type: "accept", at: "2026-06-02T00:00:00.000Z" });
transition = p.advanceLedgerStatus(transition, { type: "apply", at: "2026-06-03T00:00:00.000Z" });
transition = p.advanceLedgerStatus(transition, { type: "verify", at: "2026-06-08T00:00:00.000Z" });
const rollup = p.rollupLedger([entry, modeled], { scope: { type: "tenant", key: "tenant-a" } });

const js = {
  entry_id: entry.id,
  entry_status: entry.status,
  delta_gpu_hours: entry.deltaGpuHours,
  delta_dollars: entry.deltaDollars,
  modeled_status: modeled.status,
  rollup_verified_dollars: rollup.verifiedDollars,
  rollup_verified_gpu_hours: rollup.verifiedGpuHours,
  rollup_realization_rate: rollup.realizationRate,
  transition_status: transition.status
};

Object.keys(js).forEach((key) => {
  assert.deepEqual(py[key], js[key], `savings-ledger parity mismatch on ${key}: py=${py[key]} js=${js[key]}`);
});

console.log("savings ledger python parity tests passed");
