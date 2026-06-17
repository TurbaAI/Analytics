/**
 * turbalance Analytics — predictive + prescriptive core.
 *
 * Pure, dependency-free analytics that extend the descriptive/diagnostic engine
 * in analytics-core.js with:
 *
 *   Predictive
 *     - forecastMetric        linear (least-squares) projection + confidence band
 *     - timeToThreshold       periods/ETA until a metric crosses a limit
 *     - detectAnomalies       robust (median/MAD) or z-score early warning
 *     - regressionRiskScore   0-100 risk that the next run regresses
 *     - analyzePredictive     umbrella over a set of named metric series
 *
 *   Prescriptive
 *     - prescribeActions      quantified, ranked actions (impact, effort, ROI)
 *     - optimizeActionPlan    pick the best action set under an effort budget
 *     - buildActionPlan       ordered, verifiable remediation plan
 *     - forecastDrivenActions tie prescriptions to predictions (urgency)
 *     - analyzePrescriptive   umbrella tying the prescriptive layer together
 *
 * The module attaches to globalThis.TurbaPredictive in the browser and exports
 * the same object under CommonMate (Node) for tests and the lakehouse bridge.
 */
(function attachPredictiveCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.TurbaPredictive = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createPredictiveCore() {
  "use strict";

  // ---------------------------------------------------------------------------
  // Numeric helpers (self-contained so the module has no dependencies)
  // ---------------------------------------------------------------------------

  function numeric(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp(value, min = 0, max = 100) {
    const n = numeric(value, min);
    return Math.min(max, Math.max(min, n));
  }

  function round(value, places = 0) {
    const factor = 10 ** places;
    return Math.round(numeric(value) * factor) / factor;
  }

  function mean(values) {
    const clean = values.filter((v) => Number.isFinite(v));
    if (clean.length === 0) return 0;
    return clean.reduce((total, v) => total + v, 0) / clean.length;
  }

  function stddev(values, sample = true) {
    const clean = values.filter((v) => Number.isFinite(v));
    if (clean.length < 2) return 0;
    const avg = mean(clean);
    const variance = clean.reduce((total, v) => total + (v - avg) ** 2, 0) /
      (sample ? clean.length - 1 : clean.length);
    return Math.sqrt(Math.max(0, variance));
  }

  function median(values) {
    const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    if (clean.length === 0) return 0;
    const mid = Math.floor(clean.length / 2);
    return clean.length % 2 === 0 ? (clean[mid - 1] + clean[mid]) / 2 : clean[mid];
  }

  function medianAbsoluteDeviation(values, center) {
    const clean = values.filter((v) => Number.isFinite(v));
    if (clean.length === 0) return 0;
    const mid = Number.isFinite(center) ? center : median(clean);
    return median(clean.map((v) => Math.abs(v - mid)));
  }

  // Normalize a series of points into {x, y} pairs ordered by x.
  // Accepts: numbers, {value}, {value,t|timestamp|capturedAt|at|time}.
  function normalizeSeries(points = []) {
    const rows = (Array.isArray(points) ? points : [])
      .map((point, index) => {
        if (typeof point === "number") {
          return { x: index, y: numeric(point, Number.NaN), raw: point };
        }
        if (point && typeof point === "object") {
          const y = numeric(
            point.value !== undefined ? point.value : point.y,
            Number.NaN
          );
          const tRaw = point.t ?? point.timestamp ?? point.capturedAt ?? point.at ?? point.time;
          const t = tRaw === undefined ? null : toEpoch(tRaw);
          return { x: t === null ? index : t, y, t, raw: point };
        }
        return { x: index, y: Number.NaN, raw: point };
      })
      .filter((row) => Number.isFinite(row.y))
      .sort((a, b) => a.x - b.x);

    // Re-index x to 0..n-1 step space while preserving real timestamp spacing
    // when timestamps are present (used to translate "periods" into time).
    const hasTime = rows.length > 1 && rows.every((row) => Number.isFinite(row.t));
    let periodMs = null;
    if (hasTime) {
      const gaps = [];
      for (let i = 1; i < rows.length; i += 1) gaps.push(rows[i].t - rows[i - 1].t);
      periodMs = median(gaps) || null;
    }
    return { rows, hasTime, periodMs };
  }

  function toEpoch(value) {
    if (typeof value === "number") return value;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  // ---------------------------------------------------------------------------
  // PREDICTIVE
  // ---------------------------------------------------------------------------

  // Least-squares linear fit on evenly-spaced indices.
  function linearFit(ys) {
    const n = ys.length;
    if (n < 2) {
      return { slope: 0, intercept: n === 1 ? ys[0] : 0, r2: 0, residualStd: 0, n };
    }
    const xs = ys.map((_, i) => i);
    const xBar = mean(xs);
    const yBar = mean(ys);
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < n; i += 1) {
      sxx += (xs[i] - xBar) ** 2;
      sxy += (xs[i] - xBar) * (ys[i] - yBar);
    }
    const slope = sxx === 0 ? 0 : sxy / sxx;
    const intercept = yBar - slope * xBar;
    let ssRes = 0;
    let ssTot = 0;
    for (let i = 0; i < n; i += 1) {
      const fitted = intercept + slope * xs[i];
      ssRes += (ys[i] - fitted) ** 2;
      ssTot += (ys[i] - yBar) ** 2;
    }
    const r2 = ssTot === 0 ? (ssRes === 0 ? 1 : 0) : clamp(1 - ssRes / ssTot, 0, 1);
    const residualStd = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;
    return { slope, intercept, r2, residualStd, n };
  }

  /**
   * Project a metric forward `horizon` periods with a confidence band.
   * Returns slope, fit quality, projected points (with lower/upper), and a
   * 0-100 confidence derived from fit quality and sample size.
   */
  function forecastMetric(points, options = {}) {
    const { rows, hasTime, periodMs } = normalizeSeries(points);
    const horizon = Math.max(1, Math.trunc(numeric(options.horizon, 3)));
    const higherIsBetter = options.higherIsBetter !== false;
    const z = numeric(options.confidenceZ, 1.2816); // ~80% band by default

    if (rows.length < 2) {
      return {
        ok: false,
        reason: rows.length === 0 ? "no-data" : "insufficient-data",
        count: rows.length,
        slopePerPeriod: 0,
        direction: "flat",
        trend: "flat",
        projections: [],
        confidence: 0
      };
    }

    const ys = rows.map((row) => row.y);
    const fit = linearFit(ys);
    const lastIndex = ys.length - 1;
    const lastValue = ys[lastIndex];

    const projections = [];
    for (let step = 1; step <= horizon; step += 1) {
      const idx = lastIndex + step;
      const value = fit.intercept + fit.slope * idx;
      const spread = z * fit.residualStd * Math.sqrt(1 + step / Math.max(1, ys.length));
      projections.push({
        step,
        value: round(value, 2),
        lower: round(value - spread, 2),
        upper: round(value + spread, 2),
        etaMs: hasTime && periodMs ? rows[lastIndex].t + step * periodMs : null
      });
    }

    const slopePerPeriod = round(fit.slope, 4);
    const meaningful = Math.abs(fit.slope) >= numeric(options.flatThreshold, 0.05);
    const rising = fit.slope > 0;
    const direction = !meaningful ? "flat" : rising ? "rising" : "falling";
    const improving = !meaningful ? "flat" : (higherIsBetter ? rising : !rising);
    const trend = direction === "flat" ? "flat" : improving ? "improving" : "regressing";

    // Confidence blends fit quality (r2) and sample size; thin series cap lower.
    const sampleFactor = clamp(rows.length / 8, 0.3, 1);
    const confidence = round(clamp(100 * fit.r2 * sampleFactor + 8, 0, 95));

    return {
      ok: true,
      count: rows.length,
      higherIsBetter,
      lastValue: round(lastValue, 2),
      slopePerPeriod,
      r2: round(fit.r2, 3),
      residualStd: round(fit.residualStd, 3),
      direction,
      trend,
      improving: improving === true,
      horizon,
      projectedValue: projections[projections.length - 1].value,
      projections,
      periodMs,
      confidence
    };
  }

  /**
   * Estimate when a metric crosses `threshold`, using the fitted slope.
   * `direction` = "above" (crossing is bad when value rises above threshold) or
   * "below" (crossing is bad when value falls below threshold). Defaults to the
   * direction implied by the current value vs threshold.
   */
  function timeToThreshold(points, threshold, options = {}) {
    const limit = numeric(threshold, Number.NaN);
    const { rows, hasTime, periodMs } = normalizeSeries(points);
    if (!Number.isFinite(limit) || rows.length < 2) {
      return { ok: false, reason: "insufficient-data", willCross: false, confidence: 0 };
    }
    const ys = rows.map((row) => row.y);
    const fit = linearFit(ys);
    const lastValue = ys[ys.length - 1];
    const direction = options.direction || (lastValue <= limit ? "above" : "below");

    if (Math.abs(fit.slope) < numeric(options.flatThreshold, 1e-6)) {
      return {
        ok: true,
        willCross: false,
        reason: "flat-trend",
        lastValue: round(lastValue, 2),
        threshold: limit,
        direction,
        confidence: round(clamp(60 * fit.r2, 0, 80))
      };
    }

    const periods = (limit - lastValue) / fit.slope;
    const movingTowardLimit = direction === "above" ? fit.slope > 0 : fit.slope < 0;
    const willCross = movingTowardLimit && periods > 0;
    const periodsToThreshold = willCross ? round(periods, 2) : null;

    let etaMs = null;
    let etaDays = null;
    if (willCross && hasTime && periodMs) {
      etaMs = rows[rows.length - 1].t + periods * periodMs;
      etaDays = round((periods * periodMs) / 86_400_000, 2);
    }

    const sampleFactor = clamp(rows.length / 8, 0.3, 1);
    const confidence = round(clamp(100 * fit.r2 * sampleFactor, 0, 92));

    let urgency = "none";
    if (willCross) {
      const horizon = numeric(periodsToThreshold, Infinity);
      if (horizon <= 2) urgency = "critical";
      else if (horizon <= 5) urgency = "high";
      else if (horizon <= 12) urgency = "watch";
      else urgency = "low";
    }

    return {
      ok: true,
      willCross,
      direction,
      lastValue: round(lastValue, 2),
      threshold: limit,
      slopePerPeriod: round(fit.slope, 4),
      periodsToThreshold,
      etaMs,
      etaDays,
      urgency,
      confidence
    };
  }

  /**
   * Flag points that deviate from the series baseline.
   * method: "mad" (robust median/MAD, default) or "zscore".
   * sensitivity: threshold on the robust/standard score (default 3.5 / 3).
   */
  function detectAnomalies(points, options = {}) {
    const { rows } = normalizeSeries(points);
    const ys = rows.map((row) => row.y);
    const method = options.method === "zscore" ? "zscore" : "mad";
    if (ys.length < 3) {
      return { ok: false, reason: "insufficient-data", method, anomalies: [], latest: null };
    }

    let center;
    let scale;
    let scoreOf;
    if (method === "zscore") {
      center = mean(ys);
      scale = stddev(ys) || 1e-9;
      scoreOf = (v) => (v - center) / scale;
    } else {
      center = median(ys);
      const mad = medianAbsoluteDeviation(ys, center);
      scale = (mad * 1.4826) || 1e-9; // consistent with stddev for normal data
      scoreOf = (v) => (v - center) / scale;
    }

    const sensitivity = numeric(options.sensitivity, method === "zscore" ? 3 : 3.5);
    const anomalies = [];
    rows.forEach((row, index) => {
      const score = scoreOf(row.y);
      if (Math.abs(score) >= sensitivity) {
        anomalies.push({
          index,
          value: round(row.y, 3),
          score: round(score, 2),
          direction: score > 0 ? "high" : "low",
          severity: Math.abs(score) >= sensitivity * 1.6 ? "critical" : "warning",
          t: row.t ?? null
        });
      }
    });

    const lastIndex = ys.length - 1;
    const lastScore = scoreOf(ys[lastIndex]);
    const latest = {
      value: round(ys[lastIndex], 3),
      score: round(lastScore, 2),
      isAnomaly: Math.abs(lastScore) >= sensitivity,
      direction: lastScore > 0 ? "high" : "low",
      severity: Math.abs(lastScore) >= sensitivity * 1.6
        ? "critical"
        : Math.abs(lastScore) >= sensitivity
          ? "warning"
          : "normal"
    };

    return {
      ok: true,
      method,
      center: round(center, 3),
      scale: round(scale, 3),
      sensitivity,
      anomalies,
      latest
    };
  }

  /**
   * 0-100 likelihood that the next observation regresses, from recent
   * volatility, trend direction, and how far the latest point sits from
   * baseline. Returns a score, band, and the drivers behind it.
   */
  function regressionRiskScore(points, options = {}) {
    const { rows } = normalizeSeries(points);
    const ys = rows.map((row) => row.y);
    const higherIsBetter = options.higherIsBetter !== false;
    if (ys.length < 3) {
      return { ok: false, reason: "insufficient-data", score: 0, band: "unknown", drivers: [] };
    }

    const avg = mean(ys);
    const sd = stddev(ys);
    const fit = linearFit(ys);
    const lastValue = ys[ys.length - 1];

    // Volatility: coefficient of variation, capped.
    const cov = Math.abs(avg) > 1e-9 ? sd / Math.abs(avg) : (sd > 0 ? 1 : 0);
    const volatilityComponent = clamp(cov * 140, 0, 45);

    // Trend: a worsening slope (per higherIsBetter) adds risk.
    const worseningSlope = higherIsBetter ? -fit.slope : fit.slope;
    const slopeMagnitude = Math.abs(avg) > 1e-9 ? worseningSlope / Math.abs(avg) : worseningSlope;
    const trendComponent = clamp(slopeMagnitude * 220, 0, 40);

    // Recent deviation: latest point worse than baseline.
    const deviation = higherIsBetter ? avg - lastValue : lastValue - avg;
    const deviationComponent = clamp((sd > 0 ? deviation / sd : 0) * 18, 0, 25);

    const score = round(clamp(volatilityComponent + trendComponent + deviationComponent, 0, 100));
    const band = score >= 70 ? "critical" : score >= 45 ? "elevated" : score >= 22 ? "watch" : "stable";

    const drivers = [];
    if (volatilityComponent >= 12) drivers.push({ name: "volatility", weight: round(volatilityComponent) });
    if (trendComponent >= 8) drivers.push({ name: "worsening-trend", weight: round(trendComponent) });
    if (deviationComponent >= 6) drivers.push({ name: "recent-deviation", weight: round(deviationComponent) });

    return {
      ok: true,
      score,
      band,
      higherIsBetter,
      volatility: round(cov, 3),
      slopePerPeriod: round(fit.slope, 4),
      lastValue: round(lastValue, 2),
      baseline: round(avg, 2),
      drivers: drivers.sort((a, b) => b.weight - a.weight)
    };
  }

  /**
   * Run the full predictive layer over a map of named metric series.
   * `series`  = { metricKey: points[] }
   * `options.metrics` = { metricKey: { higherIsBetter, threshold, direction, label } }
   */
  function analyzePredictive(series = {}, options = {}) {
    const horizon = Math.max(1, Math.trunc(numeric(options.horizon, 3)));
    const metricOpts = options.metrics || {};
    const metrics = {};
    const warnings = [];

    Object.keys(series).forEach((key) => {
      const cfg = metricOpts[key] || {};
      const higherIsBetter = cfg.higherIsBetter !== false;
      const forecast = forecastMetric(series[key], { horizon, higherIsBetter, ...cfg });
      const anomalies = detectAnomalies(series[key], cfg.anomaly || {});
      const risk = regressionRiskScore(series[key], { higherIsBetter });
      let saturation = null;
      if (Number.isFinite(Number(cfg.threshold))) {
        saturation = timeToThreshold(series[key], cfg.threshold, { direction: cfg.direction });
        if (saturation.ok && saturation.willCross && (saturation.urgency === "critical" || saturation.urgency === "high")) {
          warnings.push({
            metric: key,
            label: cfg.label || key,
            kind: "saturation",
            urgency: saturation.urgency,
            periodsToThreshold: saturation.periodsToThreshold,
            etaDays: saturation.etaDays,
            threshold: saturation.threshold
          });
        }
      }
      if (anomalies.ok && anomalies.latest && anomalies.latest.isAnomaly) {
        warnings.push({
          metric: key,
          label: cfg.label || key,
          kind: "anomaly",
          urgency: anomalies.latest.severity === "critical" ? "critical" : "high",
          score: anomalies.latest.score
        });
      }
      if (risk.ok && risk.band === "critical") {
        warnings.push({ metric: key, label: cfg.label || key, kind: "regression-risk", urgency: "high", score: risk.score });
      }
      metrics[key] = { label: cfg.label || key, forecast, anomalies, risk, saturation };
    });

    const urgencyRank = { critical: 3, high: 2, watch: 1, low: 0 };
    warnings.sort((a, b) => (urgencyRank[b.urgency] || 0) - (urgencyRank[a.urgency] || 0));

    return { horizon, metrics, warnings };
  }

  // ---------------------------------------------------------------------------
  // PRESCRIPTIVE
  // ---------------------------------------------------------------------------

  // Rough effort weighting per opportunity category (1 = quick, 5 = program).
  const EFFORT_BY_CATEGORY = {
    "Useful Compute FinOps": 2,
    "Fabric + Topology": 4,
    "Data Pipeline": 3,
    "Scheduler + Capacity": 3,
    "Provider SLO + Escalation": 2,
    "Inference Economics": 3,
    "Host Kernel + eBPF": 4,
    "Fleet Reliability": 4,
    "Energy + Carbon": 1,
    "Customer Evidence Pack": 1
  };

  // Maps a predictive metric key to the action category it should escalate.
  const METRIC_TO_CATEGORY = {
    hbmCapacity: "Memory",
    hbmBandwidth: "Memory",
    memoryFragmentation: "Memory",
    kvCachePressure: "Inference Economics",
    queueWaitMinutes: "Scheduler + Capacity",
    idleGpus: "Scheduler + Capacity",
    partialNodes: "Scheduler + Capacity",
    ncclTime: "Fabric + Topology",
    networkWait: "Fabric + Topology",
    crossPodTraffic: "Fabric + Topology",
    dataloaderStall: "Data Pipeline",
    storageWait: "Data Pipeline",
    wastedGpuHours: "Useful Compute FinOps",
    costPerUsefulGpuHour: "Useful Compute FinOps",
    latencyTail: "Inference Economics"
  };

  function effortFor(opportunity) {
    const base = EFFORT_BY_CATEGORY[opportunity.category] ?? 3;
    // Higher risk to apply nudges effort up slightly.
    const riskBump = clamp(numeric(opportunity.riskScore), 0, 100) >= 70 ? 1 : 0;
    return Math.min(5, base + riskBump);
  }

  function riskBandFor(opportunity) {
    const score = clamp(numeric(opportunity.riskScore), 0, 100);
    if (score >= 70) return "high";
    if (score >= 40) return "medium";
    return "low";
  }

  function verifyFor(opportunity) {
    const category = opportunity.category || "";
    if (category.includes("Topology") || category.includes("Fabric")) {
      return "Compare NCCL trace time and cross-pod traffic for the same job shape before vs after the change.";
    }
    if (category.includes("Data")) {
      return "Compare GPU idle gaps against storage/eBPF latency windows before vs after moving the dataset.";
    }
    if (category.includes("Scheduler") || category.includes("Capacity")) {
      return "Re-run the bin-packing what-if and confirm idle GPUs and partial nodes dropped.";
    }
    if (category.includes("Memory")) {
      return "Confirm HBM capacity/bandwidth pressure fell without raising step time.";
    }
    if (category.includes("Inference")) {
      return "Track cost per million requests beside the latency tail for one full traffic cycle.";
    }
    if (category.includes("SLO") || category.includes("Evidence")) {
      return "Attach the redacted evidence pack and confirm queue/efficiency gaps closed against target.";
    }
    return "Capture a before/after snapshot of useful compute and wasted GPU-hours for the same scope.";
  }

  /**
   * Turn opportunities (from analytics-core.generateOpportunities) into ranked,
   * quantified actions: expected impact, effort, risk, ROI, and how to verify.
   * Accepts either `{ opportunities: [...] }`, a generateOpportunities result,
   * or a bare array of opportunities.
   */
  function prescribeActions(input, options = {}) {
    const opportunities = Array.isArray(input)
      ? input
      : Array.isArray(input?.opportunities)
        ? input.opportunities
        : [];
    const minImpactDollars = numeric(options.minImpactDollars, 0);
    const minImpactGpuHours = numeric(options.minImpactGpuHours, 0);

    const actions = opportunities
      .map((opportunity) => {
        const effort = effortFor(opportunity);
        const expectedDollars = Math.max(0, numeric(opportunity.impactDollars));
        const expectedGpuHours = Math.max(0, numeric(opportunity.impactGpuHours));
        const confidence = clamp(numeric(opportunity.confidence), 0, 100);
        // Confidence-weighted dollars per unit of effort.
        const roi = round((expectedDollars * (confidence / 100)) / effort, 2);
        const priorityScore = round(clamp(
          roi / 12 +
          numeric(opportunity.priorityScore) * 0.5 +
          expectedGpuHours / 20,
          0,
          100
        ));
        return {
          id: opportunity.id,
          title: opportunity.title,
          category: opportunity.category,
          owner: opportunity.owner || "platform",
          recommendation: opportunity.recommendation,
          evidence: opportunity.evidence,
          severity: opportunity.severity || "medium",
          expectedDollars: round(expectedDollars),
          expectedGpuHours: round(expectedGpuHours, 1),
          confidence,
          effort,
          risk: riskBandFor(opportunity),
          roi,
          priorityScore,
          verify: verifyFor(opportunity),
          urgency: "standard"
        };
      })
      .filter((action) => action.expectedDollars >= minImpactDollars || action.expectedGpuHours >= minImpactGpuHours)
      .sort((a, b) => b.priorityScore - a.priorityScore || b.roi - a.roi);

    return {
      actions,
      totalExpectedDollars: round(actions.reduce((t, a) => t + a.expectedDollars, 0)),
      totalExpectedGpuHours: round(actions.reduce((t, a) => t + a.expectedGpuHours, 0), 1),
      count: actions.length
    };
  }

  /**
   * Pick the action set that maximizes confidence-weighted impact under an
   * effort budget (greedy by ROI, which is a strong heuristic for this knapsack
   * and keeps the result explainable). Honors a risk tolerance and max count.
   */
  function optimizeActionPlan(actions = [], options = {}) {
    const list = Array.isArray(actions) ? actions : (actions.actions || []);
    const effortBudget = numeric(options.effortBudget, 8);
    const maxActions = Math.trunc(numeric(options.maxActions, list.length || 0)) || list.length;
    const riskTolerance = options.riskTolerance || "medium"; // low|medium|high
    const riskRank = { low: 1, medium: 2, high: 3 };
    const allowedRisk = riskRank[riskTolerance] || 2;

    const candidates = list
      .filter((a) => (riskRank[a.risk] || 2) <= allowedRisk)
      .slice()
      .sort((a, b) => b.roi - a.roi || b.expectedDollars - a.expectedDollars);

    const selected = [];
    const skipped = [];
    let usedEffort = 0;
    candidates.forEach((action) => {
      if (selected.length < maxActions && usedEffort + action.effort <= effortBudget) {
        selected.push(action);
        usedEffort += action.effort;
      } else {
        skipped.push(action);
      }
    });
    // Actions filtered out by risk tolerance are also "skipped".
    list.forEach((a) => {
      if (!selected.includes(a) && !skipped.includes(a)) skipped.push(a);
    });

    const totalExpectedDollars = round(selected.reduce((t, a) => t + a.expectedDollars, 0));
    const totalExpectedGpuHours = round(selected.reduce((t, a) => t + a.expectedGpuHours, 0), 1);
    const blendedConfidence = selected.length
      ? round(mean(selected.map((a) => a.confidence)))
      : 0;

    return {
      effortBudget,
      usedEffort,
      riskTolerance,
      selected: selected.sort((a, b) => b.priorityScore - a.priorityScore),
      skipped,
      totalExpectedDollars,
      totalExpectedGpuHours,
      blendedConfidence,
      projected: {
        recoverableDollars: totalExpectedDollars,
        recoverableGpuHours: totalExpectedGpuHours,
        confidence: blendedConfidence
      }
    };
  }

  /**
   * Build an ordered, verifiable remediation plan from selected actions.
   * Sequences by urgency then ROI, and emits an evidence-pack-ready object plus
   * a plain-text rendering.
   */
  function buildActionPlan(input, options = {}) {
    const selected = Array.isArray(input) ? input : (input?.selected || input?.actions || []);
    const urgencyRank = { critical: 3, high: 2, elevated: 2, standard: 1, watch: 1, low: 0 };
    const ordered = selected
      .slice()
      .sort((a, b) =>
        (urgencyRank[b.urgency] || 1) - (urgencyRank[a.urgency] || 1) ||
        b.priorityScore - a.priorityScore ||
        b.roi - a.roi
      );

    const steps = ordered.map((action, index) => ({
      step: index + 1,
      action: action.title,
      category: action.category,
      owner: action.owner,
      urgency: action.urgency || "standard",
      do: action.recommendation,
      expectedImpact: `${formatDollars(action.expectedDollars)} / ${action.expectedGpuHours} GPU-hours (confidence ${action.confidence}%)`,
      verify: action.verify,
      because: action.driver || action.evidence
    }));

    const text = steps
      .map((s) =>
        `${s.step}. [${s.urgency.toUpperCase()}] ${s.action} (${s.owner})\n` +
        `   Do: ${s.do}\n` +
        `   Expected: ${s.expectedImpact}\n` +
        `   Verify: ${s.verify}`
      )
      .join("\n");

    return {
      title: options.title || "Prescribed remediation plan",
      generatedAt: options.now || new Date().toISOString(),
      stepCount: steps.length,
      totalExpectedDollars: round(ordered.reduce((t, a) => t + numeric(a.expectedDollars), 0)),
      totalExpectedGpuHours: round(ordered.reduce((t, a) => t + numeric(a.expectedGpuHours), 0), 1),
      steps,
      text
    };
  }

  /**
   * Tie prescriptions to predictions: where a forecast/saturation/anomaly is
   * urgent, boost the matching action's priority and mark it urgent, and emit
   * directives like "HBM capacity saturates in ~9 periods → do X now".
   */
  function forecastDrivenActions(prescription, predictive, options = {}) {
    const base = Array.isArray(prescription)
      ? prescription
      : (prescription?.actions || []);
    const actions = base.map((a) => ({ ...a }));
    const warnings = (predictive && predictive.warnings) || [];
    const directives = [];
    const urgencyRank = { critical: 3, high: 2, watch: 1, low: 0, none: 0 };

    warnings.forEach((warning) => {
      const category = METRIC_TO_CATEGORY[warning.metric];
      const match = actions.find((a) => (a.category || "").startsWith(category || " "));
      const horizonText = Number.isFinite(warning.etaDays)
        ? `~${warning.etaDays} days`
        : Number.isFinite(warning.periodsToThreshold)
          ? `~${warning.periodsToThreshold} periods`
          : "soon";

      let message;
      if (warning.kind === "saturation") {
        message = `${warning.label} is projected to cross ${warning.threshold} in ${horizonText}`;
      } else if (warning.kind === "anomaly") {
        message = `${warning.label} is anomalous now (score ${warning.score})`;
      } else {
        message = `${warning.label} shows high regression risk (${warning.score})`;
      }

      if (match) {
        if ((urgencyRank[warning.urgency] || 0) > (urgencyRank[match.urgency] || 0)) {
          match.urgency = warning.urgency;
        }
        match.priorityScore = round(clamp(match.priorityScore + 20, 0, 100));
        match.driver = `${message} → ${match.recommendation}`;
        directives.push({ metric: warning.metric, urgency: warning.urgency, action: match.id, message: `${message} → ${match.title} now.` });
      } else {
        // No standing action covers this signal — surface it as its own directive.
        directives.push({ metric: warning.metric, urgency: warning.urgency, action: null, message: `${message} → no standing action; investigate ${warning.label}.` });
      }
    });

    actions.sort((a, b) =>
      (urgencyRank[b.urgency] || 0) - (urgencyRank[a.urgency] || 0) ||
      b.priorityScore - a.priorityScore
    );

    const urgencyRankSort = { critical: 3, high: 2, watch: 1, low: 0, none: 0 };
    directives.sort((a, b) => (urgencyRankSort[b.urgency] || 0) - (urgencyRankSort[a.urgency] || 0));

    return { actions, directives, urgentCount: directives.filter((d) => d.urgency === "critical" || d.urgency === "high").length };
  }

  /**
   * Umbrella: opportunities (+ optional predictive analysis) → ranked actions,
   * optimized plan under budget, ordered remediation plan, and forecast-driven
   * urgency directives. One call for the dashboard / API / lakehouse.
   */
  function analyzePrescriptive(input, options = {}) {
    const prescription = prescribeActions(input, options);
    let actions = prescription.actions;
    let directives = [];
    if (options.predictive) {
      const driven = forecastDrivenActions(prescription, options.predictive, options);
      actions = driven.actions;
      directives = driven.directives;
    }
    const plan = optimizeActionPlan(actions, options);
    const remediation = buildActionPlan(plan.selected, options);

    return {
      summary: {
        totalActions: actions.length,
        selectedActions: plan.selected.length,
        recoverableDollars: plan.totalExpectedDollars,
        recoverableGpuHours: plan.totalExpectedGpuHours,
        blendedConfidence: plan.blendedConfidence,
        urgentDirectives: directives.filter((d) => d.urgency === "critical" || d.urgency === "high").length
      },
      actions,
      plan,
      remediation,
      directives
    };
  }

  function formatDollars(value) {
    const n = numeric(value);
    if (n >= 1000) return `$${round(n / 1000, 1)}k`;
    return `$${round(n)}`;
  }

  return {
    // helpers (exported for reuse/tests)
    numeric,
    clamp,
    round,
    mean,
    stddev,
    median,
    normalizeSeries,
    linearFit,
    // predictive
    forecastMetric,
    timeToThreshold,
    detectAnomalies,
    regressionRiskScore,
    analyzePredictive,
    // prescriptive
    prescribeActions,
    optimizeActionPlan,
    buildActionPlan,
    forecastDrivenActions,
    analyzePrescriptive,
    // metadata
    EFFORT_BY_CATEGORY,
    METRIC_TO_CATEGORY
  };
});
