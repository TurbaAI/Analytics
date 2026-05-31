(function attachNcclTraceParser(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.TurbaNcclTraceParser = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createNcclTraceParser() {
  const TIER_LABELS = {
    "intra-rack": "Intra-rack",
    "cross-rack": "Cross-rack",
    "cross-pod": "Cross-pod",
    unknown: "Unknown"
  };

  const DEFAULT_TIERS = ["intra-rack", "cross-rack", "cross-pod"];

  function parseNcclTrace(trace, topologyIndex = {}) {
    const events = Array.isArray(trace?.events) ? trace.events : [];
    const normalizedEvents = events.map((event) => normalizeEvent(event, topologyIndex));
    const totalDurationMs = sum(normalizedEvents, "durationMs");
    const totalBytes = sum(normalizedEvents, "bytes");
    const rankCount = Number(trace?.rankCount) || 0;
    const byTier = summarizeByTier(normalizedEvents, totalDurationMs, totalBytes);
    const byOperation = summarizeByOperation(normalizedEvents, totalDurationMs, totalBytes);
    const crossRackMs = durationForTiers(byTier, ["cross-rack", "cross-pod"]);
    const crossPodMs = durationForTiers(byTier, ["cross-pod"]);
    const allReduceMs = durationForOperations(byOperation, ["all_reduce", "reduce_scatter", "all_gather"]);
    const allToAllMs = durationForOperations(byOperation, ["all_to_all"]);
    const hottestTier = byTier[0] || {
      tier: "unknown",
      label: TIER_LABELS.unknown,
      durationMs: 0,
      bytes: 0,
      durationPct: 0,
      bytesPct: 0,
      eventCount: 0
    };

    return {
      runId: trace?.runId || "unknown",
      rankCount,
      eventCount: normalizedEvents.length,
      totalDurationMs,
      totalBytes,
      ncclTime: pctOf(allReduceMs, totalDurationMs),
      allToAllTime: pctOf(allToAllMs, totalDurationMs),
      crossRackTraffic: pctOf(crossRackMs, totalDurationMs),
      crossPodTraffic: pctOf(crossPodMs, totalDurationMs),
      byTier,
      byOperation,
      hottestTier,
      events: normalizedEvents
    };
  }

  function parseNcclTraces(traces = [], topologyIndex = {}) {
    return traces.map((trace) => parseNcclTrace(trace, topologyIndex));
  }

  function normalizeEvent(event, topologyIndex) {
    const nodes = Array.isArray(event.nodes) ? event.nodes : [];
    const tier = normalizeTier(event.tier || inferTier(nodes, topologyIndex));

    return {
      op: normalizeOperation(event.op),
      startMs: numeric(event.startMs),
      durationMs: numeric(event.durationMs),
      bytes: numeric(event.bytes),
      nodes,
      tier,
      tierLabel: TIER_LABELS[tier] || TIER_LABELS.unknown
    };
  }

  function inferTier(nodes, topologyIndex) {
    const locations = nodes.map((node) => topologyIndex[node]).filter(Boolean);
    const pods = unique(locations.map((location) => location.pod));
    const racks = unique(locations.map((location) => location.rack));

    if (pods.length > 1) return "cross-pod";
    if (racks.length > 1) return "cross-rack";
    if (locations.length > 0) return "intra-rack";
    return "unknown";
  }

  function summarizeByTier(events, totalDurationMs, totalBytes) {
    const tierTotals = new Map(DEFAULT_TIERS.map((tier) => [tier, {
      tier,
      label: TIER_LABELS[tier],
      durationMs: 0,
      bytes: 0,
      eventCount: 0
    }]));

    events.forEach((event) => {
      const tier = tierTotals.get(event.tier) || {
        tier: event.tier,
        label: TIER_LABELS[event.tier] || TIER_LABELS.unknown,
        durationMs: 0,
        bytes: 0,
        eventCount: 0
      };
      tier.durationMs += event.durationMs;
      tier.bytes += event.bytes;
      tier.eventCount += 1;
      tierTotals.set(event.tier, tier);
    });

    return Array.from(tierTotals.values())
      .map((tier) => ({
        ...tier,
        durationPct: pctOf(tier.durationMs, totalDurationMs),
        bytesPct: pctOf(tier.bytes, totalBytes)
      }))
      .sort((a, b) => b.durationMs - a.durationMs);
  }

  function summarizeByOperation(events, totalDurationMs, totalBytes) {
    const operationTotals = new Map();

    events.forEach((event) => {
      const operation = operationTotals.get(event.op) || {
        op: event.op,
        durationMs: 0,
        bytes: 0,
        eventCount: 0
      };
      operation.durationMs += event.durationMs;
      operation.bytes += event.bytes;
      operation.eventCount += 1;
      operationTotals.set(event.op, operation);
    });

    return Array.from(operationTotals.values())
      .map((operation) => ({
        ...operation,
        durationPct: pctOf(operation.durationMs, totalDurationMs),
        bytesPct: pctOf(operation.bytes, totalBytes)
      }))
      .sort((a, b) => b.durationMs - a.durationMs);
  }

  function durationForTiers(tiers, names) {
    return tiers
      .filter((tier) => names.includes(tier.tier))
      .reduce((total, tier) => total + tier.durationMs, 0);
  }

  function durationForOperations(operations, names) {
    return operations
      .filter((operation) => names.includes(operation.op))
      .reduce((total, operation) => total + operation.durationMs, 0);
  }

  function normalizeOperation(value) {
    return String(value || "unknown").toLowerCase().replaceAll("-", "_");
  }

  function normalizeTier(value) {
    const normalized = String(value || "unknown").toLowerCase().replaceAll("_", "-");
    return TIER_LABELS[normalized] ? normalized : "unknown";
  }

  function pctOf(value, total) {
    return total > 0 ? (value / total) * 100 : 0;
  }

  function numeric(value) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }

  function sum(items, key) {
    return items.reduce((total, item) => total + numeric(item[key]), 0);
  }

  function unique(values) {
    return Array.from(new Set(values));
  }

  return {
    inferTier,
    parseNcclTrace,
    parseNcclTraces
  };
});
