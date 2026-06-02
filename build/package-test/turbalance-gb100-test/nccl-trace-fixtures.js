(function attachNcclTraceFixtures(root, factory) {
  const fixtures = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = fixtures;
  }

  root.TurbaNcclTraceFixtures = fixtures;
})(typeof globalThis !== "undefined" ? globalThis : window, function createNcclTraceFixtures() {
  return [
    {
      runId: "run-7421",
      rankCount: 192,
      events: [
        { op: "all_reduce", startMs: 0, durationMs: 820, bytes: 8589934592, nodes: ["A1-01", "A1-02", "A2-01", "A2-02"], tier: "cross-rack" },
        { op: "all_reduce", startMs: 940, durationMs: 1140, bytes: 17179869184, nodes: ["A1-03", "B1-01", "B2-02", "C1-01"], tier: "cross-pod" },
        { op: "broadcast", startMs: 2210, durationMs: 180, bytes: 1073741824, nodes: ["A1-01", "A1-02"], tier: "intra-rack" },
        { op: "all_gather", startMs: 2510, durationMs: 760, bytes: 6442450944, nodes: ["B1-02", "B2-01", "C2-03"], tier: "cross-pod" },
        { op: "reduce_scatter", startMs: 3420, durationMs: 520, bytes: 4294967296, nodes: ["C1-01", "C2-02"], tier: "cross-rack" }
      ]
    },
    {
      runId: "run-7318",
      rankCount: 32,
      events: [
        { op: "all_reduce", startMs: 0, durationMs: 220, bytes: 2147483648, nodes: ["A1-01", "A1-02"], tier: "intra-rack" },
        { op: "all_reduce", startMs: 310, durationMs: 260, bytes: 3221225472, nodes: ["A1-02", "A1-04"], tier: "intra-rack" },
        { op: "broadcast", startMs: 660, durationMs: 90, bytes: 536870912, nodes: ["A1-01", "A1-03"], tier: "intra-rack" }
      ]
    },
    {
      runId: "svc-1190",
      rankCount: 48,
      events: [
        { op: "all_to_all", startMs: 0, durationMs: 680, bytes: 5368709120, nodes: ["B1-01", "B1-02", "B2-01"], tier: "cross-rack" },
        { op: "all_to_all", startMs: 790, durationMs: 730, bytes: 6442450944, nodes: ["B1-03", "B2-02"], tier: "cross-rack" },
        { op: "all_reduce", startMs: 1620, durationMs: 160, bytes: 1073741824, nodes: ["B1-01", "B1-04"], tier: "intra-rack" }
      ]
    },
    {
      runId: "run-7440",
      rankCount: 64,
      events: [
        { op: "all_reduce", startMs: 0, durationMs: 250, bytes: 4294967296, nodes: ["C1-01", "C1-02", "C1-03"], tier: "intra-rack" },
        { op: "all_reduce", startMs: 380, durationMs: 330, bytes: 5368709120, nodes: ["C1-01", "C2-01"], tier: "cross-rack" },
        { op: "broadcast", startMs: 820, durationMs: 110, bytes: 536870912, nodes: ["C2-02", "C2-03"], tier: "intra-rack" }
      ]
    },
    {
      runId: "eval-2084",
      rankCount: 16,
      events: [
        { op: "all_reduce", startMs: 0, durationMs: 80, bytes: 536870912, nodes: ["A2-01", "A2-02"], tier: "intra-rack" },
        { op: "broadcast", startMs: 120, durationMs: 40, bytes: 268435456, nodes: ["A2-01", "A2-02"], tier: "intra-rack" }
      ]
    }
  ];
});
