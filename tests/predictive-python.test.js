// Runs the Python lakehouse mirror (platform_common.predictive) and confirms it
// produces the same discrete results as predictive-core.js (cross-language parity).
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const p = require("../predictive-core.js");

const root = path.join(__dirname, "..");
const pythonCmd = process.env.PYTHON || "python3";

const result = spawnSync(pythonCmd, ["tests/predictive_prescriptive_py.py"], {
  cwd: root,
  encoding: "utf8"
});
if (result.stderr) process.stderr.write(result.stderr);
assert.equal(result.status, 0, "Python predictive self-test should pass");

const line = (result.stdout || "")
  .split("\n")
  .find((l) => l.startsWith("PARITY "));
assert.ok(line, "Python test should emit a PARITY payload");
const py = JSON.parse(line.slice("PARITY ".length));

// Recompute the same scenarios in JS.
const rising = p.forecastMetric([60, 64, 69, 73, 78], { horizon: 3, higherIsBetter: true });
const regress = p.forecastMetric([10, 14, 19, 25, 31], { higherIsBetter: false, horizon: 2 });
const ttt = p.timeToThreshold([70, 74, 79, 84], 95, { direction: "above" });
const away = p.timeToThreshold([84, 79, 74, 70], 95, { direction: "above" });
const anom = p.detectAnomalies([50, 51, 49, 50, 52, 48, 95], { method: "mad" });
const predictive = p.analyzePredictive(
  { hbmCapacity: [70, 78, 85, 91, 95] },
  { horizon: 3, metrics: { hbmCapacity: { higherIsBetter: false, threshold: 99, direction: "above", label: "HBM capacity" } } }
);
const opportunities = [
  { id: "mem", title: "Relieve HBM pressure", category: "Memory efficiency fix", owner: "Platform", impactDollars: 5000, impactGpuHours: 120, confidence: 70, riskScore: 55, priorityScore: 40, recommendation: "Reduce HBM pressure.", evidence: "hbm" },
  { id: "fin", title: "Recover spend", category: "Useful Compute FinOps", owner: "FinOps", impactDollars: 9000, impactGpuHours: 200, confidence: 80, riskScore: 50, priorityScore: 65, recommendation: "Rank pools.", evidence: "fin" }
];
const prescription = p.prescribeActions(opportunities);
const full = p.analyzePrescriptive(opportunities, { predictive, effortBudget: 6, riskTolerance: "high" });
const mem = full.actions.find((a) => a.id === "mem");

const js = {
  forecast_model: rising.model,
  forecast_direction: rising.direction,
  forecast_trend: rising.trend,
  forecast_projection_count: rising.projections.length,
  forecast_skill_gt_60: rising.forecastSkill > 60,
  regress_trend: regress.trend,
  ttt_will_cross: ttt.willCross,
  ttt_urgency: ttt.urgency,
  away_will_cross: away.willCross,
  anomaly_latest: anom.latest.isAnomaly,
  anomaly_index_flagged: anom.anomalies.some((a) => a.index === 6),
  predictive_warns_hbm: predictive.warnings.some((w) => w.metric === "hbmCapacity"),
  prescription_count: prescription.count,
  mem_escalated: ["critical", "high"].includes(mem.urgency),
  urgent_directives: full.summary.urgentDirectives
};

Object.keys(js).forEach((key) => {
  assert.deepEqual(py[key], js[key], `parity mismatch on ${key}: py=${py[key]} js=${js[key]}`);
});

console.log("predictive python parity tests passed");
