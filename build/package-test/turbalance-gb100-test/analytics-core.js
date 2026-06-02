(function attachAnalyticsCore(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.TurbaAnalytics = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createAnalyticsCore() {
  function finalizeSummary(summary, rate = 0) {
    const hourlyRate = numeric(rate);
    const usefulGpuHours = summary.allocatedGpuHours * (summary.usefulCompute / 100);
    const activeGpuHours = summary.allocatedGpuHours * (summary.gpuUtil / 100);
    const wastedGpuHours = Math.max(0, summary.allocatedGpuHours - usefulGpuHours);
    const wasteDollars = wastedGpuHours * hourlyRate;
    const totalCost = summary.allocatedGpuHours * hourlyRate;
    const costPerUsefulGpuHour = usefulGpuHours > 0 ? totalCost / usefulGpuHours : 0;
    const costPerMillionTokens = summary.tokensM > 0 ? totalCost / summary.tokensM : 0;
    const costPerMillionRequests = summary.inferenceRequestsM > 0 ? totalCost / summary.inferenceRequestsM : 0;
    const costPerStep = summary.steps > 0 ? totalCost / summary.steps : 0;

    return {
      ...summary,
      usefulGpuHours,
      activeGpuHours,
      wastedGpuHours,
      wasteDollars,
      totalCost,
      costPerUsefulGpuHour,
      costPerMillionTokens,
      costPerMillionRequests,
      costPerStep
    };
  }

  function summarizeProviderEconomics(summary, options = {}) {
    const provider = summary.provider || {};
    const slo = summary.slo || {};
    const allocatedGpuHours = numeric(summary.allocatedGpuHours);
    const usefulGpuHours = numeric(summary.usefulGpuHours, allocatedGpuHours * numeric(summary.usefulCompute) / 100);
    const wastedGpuHours = numeric(summary.wastedGpuHours, Math.max(0, allocatedGpuHours - usefulGpuHours));
    const listGpuHourRate = firstPositive(provider.listGpuHourRate, options.listGpuHourRate, options.rate);
    const floorGpuHourCost = firstFinite(provider.floorGpuHourCost, options.floorGpuHourCost);
    const hasFloorCost = Number.isFinite(floorGpuHourCost);
    const billableGpuHours = firstPositive(provider.billableGpuHours, allocatedGpuHours);
    const sellableGpuHours = firstPositive(provider.sellableGpuHours, allocatedGpuHours);
    const committedGpuHours = numeric(provider.committedGpuHours);
    const burstGpuHours = numeric(provider.burstGpuHours);
    const queueWaitMinutes = numeric(summary.queueWaitMinutes);
    const targetStartMinutes = numeric(slo.targetStartMinutes);
    const targetEfficiency = numeric(slo.targetEfficiency);
    const revenue = billableGpuHours * listGpuHourRate;
    const sellableWasteValue = wastedGpuHours * listGpuHourRate;
    const directCost = hasFloorCost ? allocatedGpuHours * floorGpuHourCost : 0;
    const grossMargin = hasFloorCost ? revenue - directCost : 0;

    return {
      listGpuHourRate,
      floorGpuHourCost: hasFloorCost ? floorGpuHourCost : 0,
      hasFloorCost,
      billableGpuHours,
      sellableGpuHours,
      committedGpuHours,
      burstGpuHours,
      revenue,
      sellableWasteValue,
      directCost,
      grossMargin,
      grossMarginPct: revenue > 0 && hasFloorCost ? (grossMargin / revenue) * 100 : 0,
      reservationBurnPct: committedGpuHours > 0 ? (allocatedGpuHours / committedGpuHours) * 100 : 0,
      sellableWastePct: sellableGpuHours > 0 ? (wastedGpuHours / sellableGpuHours) * 100 : 0,
      queueSloPct: targetStartMinutes > 0 ? (queueWaitMinutes / targetStartMinutes) * 100 : 0,
      queueSloGapMinutes: targetStartMinutes > 0 ? queueWaitMinutes - targetStartMinutes : 0,
      efficiencyGap: targetEfficiency > 0 ? Math.max(0, targetEfficiency - numeric(summary.usefulCompute)) : 0
    };
  }

  function applyPlacementWhatIf(summary, samePod) {
    if (!samePod || summary.crossPodTraffic < 8) {
      return { ...summary, whatIfActive: false };
    }

    const placementGap = 100 - summary.placementQuality;
    const communicationPressure = summary.ncclTime + summary.networkWait;
    const improvement = clamp(8 + placementGap * 0.32 + summary.crossPodTraffic * 0.18, 8, 27);
    const reducedComm = Math.min(communicationPressure * 0.34, improvement * 0.9);

    return {
      ...summary,
      whatIfActive: true,
      whatIfImprovement: improvement,
      usefulCompute: clamp(summary.usefulCompute + improvement * 0.62),
      gpuUtil: clamp(summary.gpuUtil + improvement * 0.26),
      ncclTime: clamp(summary.ncclTime - reducedComm * 0.68),
      networkWait: clamp(summary.networkWait - reducedComm * 0.32),
      placementQuality: clamp(summary.placementQuality + improvement * 1.25),
      crossPodTraffic: clamp(summary.crossPodTraffic * 0.22),
      crossRackTraffic: clamp(summary.crossRackTraffic * 0.72)
    };
  }

  function simulateSchedulerScenarios(summary, options = {}) {
    const rate = firstPositive(options.rate, options.listGpuHourRate, summary.provider?.listGpuHourRate);
    const schedulerEvidence = summary.schedulerEvidence || {};
    const gpusPerNode = firstPositive(options.gpusPerNode, schedulerEvidence.gpusPerNode, 8);
    const durationHours = numeric(summary.gpus) > 0 ? numeric(summary.allocatedGpuHours) / numeric(summary.gpus) : 0;
    const partialNodeGpuHours = numeric(summary.partialNodes) * durationHours * gpusPerNode * 0.5;
    const idleGpuHours = numeric(summary.idleGpus) * durationHours;
    const strandedGpuHours = Math.max(0, partialNodeGpuHours + idleGpuHours);
    const queueSloMinutes = numeric(summary.slo?.targetStartMinutes);
    const schedulerEventCount = numeric(schedulerEvidence.eventCount);
    const preemptionCount = numeric(schedulerEvidence.preemptionCount);
    const placementRetries = numeric(schedulerEvidence.placementRetries);
    const localityMisses = numeric(schedulerEvidence.localityMisses);
    const backfillCandidates = numeric(schedulerEvidence.backfillCandidates);
    const pendingJobsAhead = numeric(schedulerEvidence.pendingJobsAhead);
    const pendingGpuHoursAhead = numeric(schedulerEvidence.pendingGpuHoursAhead);
    const current = {
      usefulCompute: numeric(summary.usefulCompute),
      queueWaitMinutes: numeric(summary.queueWaitMinutes),
      placementQuality: numeric(summary.placementQuality),
      crossPodTraffic: numeric(summary.crossPodTraffic),
      crossRackTraffic: numeric(summary.crossRackTraffic),
      strandedGpuHours,
      wastedGpuHours: numeric(summary.wastedGpuHours)
    };
    const scenarioInputs = [
      {
        id: "repack",
        label: "Repack partial nodes",
        owner: "Capacity planning",
        queueReduction: clamp(4 + current.queueWaitMinutes * 0.18 + numeric(summary.partialNodes) * 1.8 + backfillCandidates * 0.35, 3, 22),
        placementLift: clamp(5 + numeric(summary.partialNodes) * 5 + numeric(summary.idleGpus) * 0.6 + placementRetries * 0.45, 5, 30),
        crossPodReductionPct: 18,
        crossRackReductionPct: 12,
        strandedRecoveryPct: 58,
        usefulLift: clamp(2 + numeric(summary.partialNodes) * 1.4 + current.queueWaitMinutes * 0.04 + backfillCandidates * 0.12, 2, 14),
        confidence: confidenceFromSignals([summary.partialNodes, summary.idleGpus, summary.queueWaitMinutes, summary.placementQuality, placementRetries, backfillCandidates, schedulerEventCount]),
        action: "Defragment partial nodes and backfill smaller work only after contiguous GPU blocks are protected."
      },
      {
        id: "locality",
        label: "Reserve locality group",
        owner: "Scheduler + network",
        queueReduction: clamp(2 + current.queueWaitMinutes * 0.1 + localityMisses * 0.2, 2, 14),
        placementLift: clamp(8 + current.crossPodTraffic * 0.36 + Math.max(0, 72 - current.placementQuality) * 0.14 + localityMisses * 0.5, 8, 36),
        crossPodReductionPct: clamp(58 + current.crossPodTraffic * 0.3 + localityMisses * 0.35, 58, 90),
        crossRackReductionPct: clamp(26 + current.crossRackTraffic * 0.16, 26, 62),
        strandedRecoveryPct: 28,
        usefulLift: clamp(3 + current.crossPodTraffic * 0.12 + numeric(summary.ncclTime) * 0.08 + localityMisses * 0.12, 3, 20),
        confidence: confidenceFromSignals([summary.crossPodTraffic, summary.crossRackTraffic, summary.ncclTime, summary.networkWait, summary.traceAttribution?.eventCount, localityMisses, schedulerEventCount]),
        action: "Admit repeated high-value jobs into a same-pod or same-rack locality group before burst tenants consume the shape."
      },
      {
        id: "priority",
        label: "Protect SLO queue",
        owner: "Provider operations",
        queueReduction: clamp(current.queueWaitMinutes - Math.max(0, queueSloMinutes || current.queueWaitMinutes * 0.55) + preemptionCount * 0.7 + pendingJobsAhead * 0.15, 4, 34),
        placementLift: clamp(4 + numeric(summary.provider?.committedGpuHours) / 2000 + pendingGpuHoursAhead / 5000, 4, 18),
        crossPodReductionPct: 22,
        crossRackReductionPct: 16,
        strandedRecoveryPct: 34,
        usefulLift: clamp(2 + Math.max(0, current.queueWaitMinutes - queueSloMinutes) * 0.15 + preemptionCount * 0.12, 2, 16),
        confidence: confidenceFromSignals([summary.queueWaitMinutes, summary.slo?.targetStartMinutes, summary.provider?.committedGpuHours, summary.provider?.billableGpuHours, preemptionCount, pendingJobsAhead, schedulerEventCount]),
        action: "Reserve admission windows for priority reservations and delay lower-value burst work when queue SLO burn is rising."
      }
    ];

    const scenarios = scenarioInputs
      .map((scenario) => finalizeSchedulerScenario(summary, current, scenario, rate))
      .sort((a, b) => b.priorityScore - a.priorityScore);

    return {
      current,
      recommended: scenarios[0] || null,
      scenarios
    };
  }

  function finalizeSchedulerScenario(summary, current, scenario, rate) {
    const schedulerEvidence = summary.schedulerEvidence || {};
    const queueWaitMinutes = Math.max(0, current.queueWaitMinutes - scenario.queueReduction);
    const placementQuality = clamp(current.placementQuality + scenario.placementLift);
    const crossPodTraffic = clamp(current.crossPodTraffic * (1 - scenario.crossPodReductionPct / 100));
    const crossRackTraffic = clamp(current.crossRackTraffic * (1 - scenario.crossRackReductionPct / 100));
    const usefulCompute = clamp(current.usefulCompute + scenario.usefulLift);
    const recoveredStrandedGpuHours = current.strandedGpuHours * scenario.strandedRecoveryPct / 100;
    const recoveredWasteGpuHours = current.wastedGpuHours * clamp(scenario.usefulLift / 100, 0, 0.32);
    const recoveredGpuHours = Math.max(0, recoveredStrandedGpuHours + recoveredWasteGpuHours);
    const dollarUpside = recoveredGpuHours * rate;
    const queueMinutesSaved = Math.max(0, current.queueWaitMinutes - queueWaitMinutes);
    const priorityScore = clamp(dollarUpside / 150 + recoveredGpuHours / 15 + queueMinutesSaved * 1.8 + scenario.confidence * 0.24);

    return {
      ...scenario,
      projected: {
        usefulCompute,
        queueWaitMinutes,
        placementQuality,
        crossPodTraffic,
        crossRackTraffic
      },
      deltas: {
        usefulCompute: usefulCompute - current.usefulCompute,
        queueWaitMinutes: current.queueWaitMinutes - queueWaitMinutes,
        placementQuality: placementQuality - current.placementQuality,
        crossPodTraffic: current.crossPodTraffic - crossPodTraffic,
        crossRackTraffic: current.crossRackTraffic - crossRackTraffic
      },
      recoveredGpuHours,
      recoveredStrandedGpuHours,
      recoveredWasteGpuHours,
      dollarUpside,
      priorityScore,
      sourceEvidence: {
        schedulerEvents: numeric(schedulerEvidence.eventCount),
        placementRetries: numeric(schedulerEvidence.placementRetries),
        localityMisses: numeric(schedulerEvidence.localityMisses),
        preemptions: numeric(schedulerEvidence.preemptionCount),
        pendingJobsAhead: numeric(schedulerEvidence.pendingJobsAhead)
      },
      evidence: `${round(recoveredGpuHours)} GPU-hours recoverable, ${round(queueMinutesSaved)} queue minutes saved, ${pct(placementQuality)} placement fit projected.${schedulerEvidenceNote(schedulerEvidence)}`
    };
  }

  function schedulerEvidenceNote(evidence = {}) {
    const eventCount = numeric(evidence.eventCount);
    if (eventCount <= 0) return "";

    const parts = [
      `${round(eventCount)} scheduler events`
    ];

    if (numeric(evidence.placementRetries) > 0) parts.push(`${round(evidence.placementRetries)} placement retries`);
    if (numeric(evidence.localityMisses) > 0) parts.push(`${round(evidence.localityMisses)} locality misses`);
    if (numeric(evidence.preemptionCount) > 0) parts.push(`${round(evidence.preemptionCount)} preemptions`);

    return ` Scheduler evidence: ${parts.join(", ")}.`;
  }

  function summarizeTrend(points = [], options = {}) {
    const clean = points
      .map((point) => ({ ...point, value: numeric(point.value, Number.NaN) }))
      .filter((point) => Number.isFinite(point.value));

    if (clean.length === 0) {
      return {
        count: 0,
        first: null,
        latest: null,
        best: null,
        delta: 0,
        direction: "flat"
      };
    }

    const higherIsBetter = options.higherIsBetter !== false;
    const first = clean[0];
    const latest = clean[clean.length - 1];
    const best = clean.reduce((candidate, point) => {
      if (higherIsBetter) return point.value > candidate.value ? point : candidate;
      return point.value < candidate.value ? point : candidate;
    }, first);
    const delta = latest.value - first.value;
    const meaningfulDelta = Math.abs(delta) >= numeric(options.flatThreshold, 0.01);
    const improved = higherIsBetter ? delta > 0 : delta < 0;

    return {
      count: clean.length,
      first,
      latest,
      best,
      delta,
      direction: meaningfulDelta ? (improved ? "improved" : "regressed") : "flat"
    };
  }

  function classifyBottlenecks(summary) {
    const communicationScore = clamp(summary.ncclTime * 1.55 + summary.networkWait * 1.25 + summary.crossRackTraffic * 0.1 + summary.crossPodTraffic * 0.26);
    const inputScore = clamp(summary.dataloaderStall * 2.1 + summary.storageWait * 2 + summary.cpuPrep * 1.35);
    const memoryScore = clamp(Math.max(0, summary.hbmCapacity - 65) * 1.1 + Math.max(0, summary.hbmBandwidth - 65) * 1.2 + summary.memoryFragmentation * 0.48 + summary.kvCachePressure * 0.38);
    const placementScore = clamp((100 - summary.placementQuality) * 0.86 + summary.crossPodTraffic * 0.35 + summary.crossRackTraffic * 0.1 + summary.partialNodes * 4.5);
    const schedulerScore = clamp(summary.queueWaitMinutes * 0.55 + summary.idleGpus * 2.4 + summary.partialNodes * 5);
    const noisyScore = clamp(summary.noiseEvents * 12 + summary.contentionPct * 0.8);
    const underconfiguredScore = clamp(summary.precisionLoss * 1.1 + summary.batchInefficiency * 1.16 + Math.max(0, 55 - summary.gpuUtil) * 0.45);
    const computeSaturation = clamp((summary.smOccupancy + summary.tensorCoreUtil + summary.usefulCompute) / 3);

    const bars = [
      {
        name: "Communication-bound",
        short: "Communication",
        score: communicationScore,
        reason: `${pct(summary.ncclTime)} collectives time and ${pct(summary.networkWait)} network wait`
      },
      {
        name: "Input-bound",
        short: "Input",
        score: inputScore,
        reason: `${pct(summary.dataloaderStall + summary.storageWait)} data path stalls`
      },
      {
        name: "Memory-bound",
        short: "Memory",
        score: memoryScore,
        reason: `${pct(summary.hbmCapacity)} HBM capacity, ${pct(summary.hbmBandwidth)} bandwidth pressure`
      },
      {
        name: "Placement-bound",
        short: "Placement",
        score: placementScore,
        reason: `${pct(summary.placementQuality)} placement fit with ${pct(summary.crossRackTraffic)} cross-rack traffic`
      },
      {
        name: "Scheduler-bound",
        short: "Scheduler",
        score: schedulerScore,
        reason: `${round(summary.queueWaitMinutes)} minute queue wait and ${summary.partialNodes} partial nodes`
      },
      {
        name: "Noisy-neighbor affected",
        short: "Noisy neighbor",
        score: noisyScore,
        reason: `${summary.noiseEvents} contention events, ${pct(summary.contentionPct)} interference signal`
      },
      {
        name: "Underconfigured",
        short: "Config",
        score: underconfiguredScore,
        reason: `${pct(summary.batchInefficiency)} batch or parallelism inefficiency signal`
      }
    ].sort((a, b) => b.score - a.score);

    let primary = bars[0];
    let secondary = bars[1];

    if (summary.usefulCompute >= 68 && computeSaturation >= 70 && bars[0].score < 36) {
      secondary = bars[0];
      primary = {
        name: "Compute-bound",
        short: "Compute",
        score: computeSaturation,
        reason: `GPU kernels are saturated: ${pct(summary.smOccupancy)} SM occupancy and ${pct(summary.tensorCoreUtil)} tensor-core utilization.`
      };
    } else {
      primary = {
        ...primary,
        reason: reasonFor(primary.short, summary)
      };
    }

    const improvementRange = estimateImprovement(primary, secondary, summary);

    return { primary, secondary, bars, improvementRange };
  }

  function scoreComponents(summary, rate = 0, formatCurrency = defaultCurrency) {
    const compute = clamp((summary.smOccupancy * 0.36) + (summary.tensorCoreUtil * 0.34) + (summary.usefulCompute * 0.3));
    const communication = clamp(100 - (summary.ncclTime * 1.35 + summary.networkWait * 1.1 + summary.crossPodTraffic * 0.18));
    const memory = clamp(100 - (Math.max(0, summary.hbmCapacity - 74) * 1.2 + Math.max(0, summary.hbmBandwidth - 74) * 1.1 + summary.memoryFragmentation * 0.35 + summary.kvCachePressure * 0.2));
    const input = clamp(100 - (summary.dataloaderStall * 1.8 + summary.storageWait * 1.7 + summary.cpuPrep * 1.25));
    const placement = clamp(summary.placementQuality);
    const cost = clamp(summary.usefulCompute - Math.max(0, summary.costPerUsefulGpuHour - numeric(rate)) * 2.5 + 12);

    return [
      {
        name: "Compute efficiency",
        score: compute,
        note: `${pct(summary.smOccupancy)} SM occupancy, ${pct(summary.tensorCoreUtil)} tensor-core utilization`
      },
      {
        name: "Communication efficiency",
        score: communication,
        note: `${pct(summary.ncclTime + summary.networkWait)} allocated time lost to collectives and network wait`
      },
      {
        name: "Memory efficiency",
        score: memory,
        note: `${pct(summary.hbmCapacity)} HBM capacity and ${pct(summary.hbmBandwidth)} bandwidth pressure`
      },
      {
        name: "Input efficiency",
        score: input,
        note: `${pct(summary.dataloaderStall)} dataloader stalls, ${pct(summary.storageWait)} storage wait`
      },
      {
        name: "Placement efficiency",
        score: placement,
        note: `${pct(summary.crossRackTraffic)} cross-rack and ${pct(summary.crossPodTraffic)} cross-pod traffic`
      },
      {
        name: "Cost efficiency",
        score: cost,
        note: `${formatCurrency(summary.costPerUsefulGpuHour)} per useful GPU-hour`
      }
    ];
  }

  function fingerprintWorkload(summary) {
    if (summary.inferenceRequestsM > 0 || summary.latencyTail > 35 || summary.kvCachePressure > 45) {
      return {
        name: "Inference batch serving",
        signals: [
          { name: "Latency tail", value: summary.latencyTail, label: "tail" },
          { name: "KV cache pressure", value: summary.kvCachePressure, label: "pressure" },
          { name: "Queue sensitivity", value: clamp(summary.batchInefficiency + 35), label: "signal" }
        ]
      };
    }

    if (summary.allToAllTime > 10) {
      return {
        name: "MoE training",
        signals: [
          { name: "All-to-all intensity", value: clamp(summary.allToAllTime * 5), label: "signal" },
          { name: "Routing imbalance", value: clamp(summary.batchInefficiency + summary.memoryFragmentation), label: "signal" },
          { name: "HBM pressure", value: summary.hbmCapacity, label: "pressure" }
        ]
      };
    }

    if (summary.gpus <= 40 && summary.dataloaderStall + summary.storageWait > summary.ncclTime + summary.networkWait) {
      return {
        name: "Fine-tuning",
        signals: [
          { name: "Smaller allocation", value: clamp(100 - summary.gpus), label: "signal" },
          { name: "Input sensitivity", value: clamp((summary.dataloaderStall + summary.storageWait) * 3), label: "signal" },
          { name: "Placement sensitivity", value: clamp(100 - summary.placementQuality + summary.partialNodes * 8), label: "signal" }
        ]
      };
    }

    if (summary.gpuUtil < 38 && summary.stepRegularity < 55) {
      return {
        name: "Evaluation workload",
        signals: [
          { name: "Bursty execution", value: clamp(100 - summary.stepRegularity), label: "signal" },
          { name: "Underutilization", value: clamp(100 - summary.gpuUtil), label: "signal" },
          { name: "Idle allocation", value: clamp(summary.idleGpus * 8), label: "signal" }
        ]
      };
    }

    return {
      name: "Dense LLM training",
      signals: [
        { name: "Collective intensity", value: clamp((summary.ncclTime + summary.networkWait) * 2), label: "signal" },
        { name: "Regular steps", value: summary.stepRegularity, label: "regularity" },
        { name: "HBM use", value: summary.hbmCapacity, label: "use" }
      ]
    };
  }

  function regressionRows(summary, formatCurrency = defaultCurrency) {
    const stepDelta = summary.baseline.stepTime > 0
      ? ((summary.baseline.currentStepTime - summary.baseline.stepTime) / summary.baseline.stepTime) * 100
      : 0;
    const ncclDelta = summary.baseline.ncclTime > 0
      ? ((summary.ncclTime - summary.baseline.ncclTime) / summary.baseline.ncclTime) * 100
      : 0;
    const efficiencyDelta = summary.baseline.gpuEfficiency - summary.usefulCompute;
    const queueDelta = summary.baseline.queueWaitMinutes > 0
      ? ((summary.queueWaitMinutes - summary.baseline.queueWaitMinutes) / summary.baseline.queueWaitMinutes) * 100
      : 0;
    const costDelta = summary.baseline.costPerMillionTokens > 0 && summary.costPerMillionTokens > 0
      ? ((summary.costPerMillionTokens - summary.baseline.costPerMillionTokens) / summary.baseline.costPerMillionTokens) * 100
      : 0;

    return [
      {
        name: "Step time",
        delta: stepDelta,
        text: deltaText(stepDelta),
        note: summary.baseline.stepTime > 0 ? `${summary.baseline.currentStepTime.toFixed(2)}s now vs ${summary.baseline.stepTime.toFixed(2)}s baseline` : "No step baseline",
        grade: inverseGrade(stepDelta, 6, 12)
      },
      {
        name: "Communication overhead",
        delta: ncclDelta,
        text: deltaText(ncclDelta),
        note: `${pct(summary.ncclTime)} NCCL time now vs ${pct(summary.baseline.ncclTime)} baseline`,
        grade: inverseGrade(ncclDelta, 8, 18)
      },
      {
        name: "GPU efficiency",
        delta: efficiencyDelta,
        text: efficiencyDelta > 0 ? `${pct(efficiencyDelta)} drop` : `${pct(Math.abs(efficiencyDelta))} gain`,
        note: `${pct(summary.usefulCompute)} useful compute now vs ${pct(summary.baseline.gpuEfficiency)} baseline`,
        grade: inverseGrade(efficiencyDelta, 5, 10)
      },
      {
        name: "Queue time",
        delta: queueDelta,
        text: deltaText(queueDelta),
        note: `${round(summary.queueWaitMinutes)} minutes now vs ${round(summary.baseline.queueWaitMinutes)} baseline`,
        grade: inverseGrade(queueDelta, 12, 28)
      },
      {
        name: "Cost per token",
        delta: costDelta,
        text: costDelta === 0 ? "n/a" : deltaText(costDelta),
        note: summary.costPerMillionTokens > 0 ? `${formatCurrency(summary.costPerMillionTokens)} per million tokens` : "No token denominator",
        grade: costDelta === 0 ? grade(100, 55, 72) : inverseGrade(costDelta, 8, 18)
      }
    ];
  }

  function generateOpportunities(summary, options = {}) {
    const classifier = options.classifier || classifyBottlenecks(summary);
    const provider = options.provider || summarizeProviderEconomics(summary, options);
    const rate = firstPositive(provider.listGpuHourRate, options.rate);
    const durationHours = numeric(summary.gpus) > 0 ? numeric(summary.allocatedGpuHours) / numeric(summary.gpus) : 0;
    const candidates = [
      usefulComputeOpportunity(summary, provider, classifier, rate),
      topologyOpportunity(summary, classifier, provider, rate),
      inputPipelineOpportunity(summary, provider, rate),
      schedulerOpportunity(summary, provider, rate, durationHours),
      providerSloOpportunity(summary, provider, rate),
      inferenceOpportunity(summary, provider, rate),
      hostKernelOpportunity(summary, provider, rate),
      fleetHealthOpportunity(summary, provider, rate),
      energyOpportunity(summary, provider, rate, options),
      evidencePackOpportunity(summary, provider)
    ];

    const imported = Array.isArray(summary.importedOpportunities)
      ? summary.importedOpportunities.map((opportunity, index) => normalizeImportedOpportunity(opportunity, summary, index))
      : [];
    const opportunities = [...candidates, ...imported]
      .filter(Boolean)
      .map((opportunity) => finalizeOpportunity(opportunity, summary))
      .sort((a, b) => b.priorityScore - a.priorityScore || b.impactDollars - a.impactDollars)
      .slice(0, numeric(options.limit, 8));

    return {
      scope: summary.scope,
      key: summary.key,
      label: summary.label,
      totalImpactDollars: opportunities.reduce((total, opportunity) => total + opportunity.impactDollars, 0),
      totalImpactGpuHours: opportunities.reduce((total, opportunity) => total + opportunity.impactGpuHours, 0),
      highestSeverity: opportunities[0]?.severity || "low",
      opportunities
    };
  }

  function usefulComputeOpportunity(summary, provider, classifier, rate) {
    if (numeric(summary.wastedGpuHours) < 8 && numeric(summary.usefulCompute) >= 62) return null;

    const recoverableGpuHours = numeric(summary.wastedGpuHours) * recoveryRatioFor(classifier.primary.short);
    return {
      id: "useful-compute-finops",
      category: "Useful Compute FinOps",
      title: "Recover non-useful accelerator spend",
      impactDollars: recoverableGpuHours * rate,
      impactGpuHours: recoverableGpuHours,
      riskScore: clamp(100 - numeric(summary.usefulCompute)),
      confidence: confidenceFromSignals([summary.usefulCompute, summary.gpuUtil, summary.wastedGpuHours, provider.sellableWasteValue]),
      evidence: `${pct(summary.usefulCompute)} useful compute, ${round(summary.wastedGpuHours)} wasted GPU-hours, ${classifier.primary.short} is primary.`,
      recommendation: "Rank the largest non-useful GPU-hour pools first, then attach each pool to a placement, input, memory, or configuration fix before buying more capacity.",
      owner: "FinOps + platform"
    };
  }

  function topologyOpportunity(summary, classifier, provider, rate) {
    const topologyPressure = numeric(summary.ncclTime) + numeric(summary.networkWait) + numeric(summary.crossPodTraffic) * 0.25 + Math.max(0, 100 - numeric(summary.placementQuality)) * 0.18;
    if (topologyPressure < 26 && classifier.primary.short !== "Communication" && classifier.primary.short !== "Placement") return null;

    const recoverableGpuHours = numeric(summary.wastedGpuHours) * clamp(topologyPressure / 220, 0.1, 0.42);
    return {
      id: "fabric-topology",
      category: "Fabric + Topology",
      title: "Repack topology-sensitive workloads",
      impactDollars: recoverableGpuHours * rate,
      impactGpuHours: recoverableGpuHours,
      riskScore: clamp(topologyPressure),
      confidence: confidenceFromSignals([summary.ncclTime, summary.networkWait, summary.crossPodTraffic, summary.placementQuality, summary.traceAttribution?.eventCount]),
      evidence: `${pct(summary.ncclTime + summary.networkWait)} time in collectives/network wait with ${pct(summary.crossPodTraffic)} cross-pod traffic.`,
      recommendation: "Reserve contiguous locality groups for repeat high-value jobs and compare NCCL trace time before and after the scheduler change.",
      owner: "Scheduler + network"
    };
  }

  function inputPipelineOpportunity(summary, provider, rate) {
    const inputPressure = numeric(summary.dataloaderStall) + numeric(summary.storageWait) + numeric(summary.cpuPrep);
    if (inputPressure < 18) return null;

    const recoverableGpuHours = numeric(summary.wastedGpuHours) * clamp(inputPressure / 180, 0.08, 0.36);
    return {
      id: "data-pipeline",
      category: "Data Pipeline",
      title: "Remove storage and preprocessing stalls",
      impactDollars: recoverableGpuHours * rate,
      impactGpuHours: recoverableGpuHours,
      riskScore: clamp(inputPressure * 1.7),
      confidence: confidenceFromSignals([summary.dataloaderStall, summary.storageWait, summary.cpuPrep]),
      evidence: `${pct(inputPressure)} combined dataloader, storage, and CPU-prep pressure.`,
      recommendation: "Move hot datasets closer to the allocation, prefetch earlier, and compare storage/eBPF latency windows against GPU idle gaps.",
      owner: "Data platform"
    };
  }

  function schedulerOpportunity(summary, provider, rate, durationHours) {
    const strandedGpuHours = Math.max(0, numeric(summary.idleGpus) * durationHours + numeric(summary.partialNodes) * durationHours * 4);
    const queuePressure = numeric(summary.queueWaitMinutes) + numeric(summary.partialNodes) * 4 + numeric(summary.idleGpus) * 2;
    if (queuePressure < 18 && strandedGpuHours < 8) return null;

    const impactGpuHours = Math.max(strandedGpuHours, numeric(summary.wastedGpuHours) * clamp(queuePressure / 240, 0.05, 0.3));
    return {
      id: "scheduler-capacity",
      category: "Scheduler + Capacity",
      title: "Reclaim fragmented and queue-blocked capacity",
      impactDollars: impactGpuHours * rate,
      impactGpuHours,
      riskScore: clamp(queuePressure * 1.25),
      confidence: confidenceFromSignals([summary.queueWaitMinutes, summary.partialNodes, summary.idleGpus, summary.placementQuality]),
      evidence: `${round(summary.queueWaitMinutes)} minute queue wait, ${round(summary.partialNodes)} partial nodes, ${round(summary.idleGpus)} idle GPUs.`,
      recommendation: "Run a bin-packing what-if for partial nodes, then reserve contiguous capacity for repeated strategic tenants before admitting burst work.",
      owner: "Capacity planning"
    };
  }

  function providerSloOpportunity(summary, provider, rate) {
    if (provider.queueSloGapMinutes <= 0 && provider.efficiencyGap <= 0) return null;

    const startRiskGpuHours = Math.max(0, provider.queueSloGapMinutes / 60) * numeric(summary.gpus);
    const efficiencyRiskGpuHours = numeric(summary.allocatedGpuHours) * clamp(provider.efficiencyGap / 120, 0, 0.35);
    const impactGpuHours = startRiskGpuHours + efficiencyRiskGpuHours;
    return {
      id: "provider-slo-risk",
      category: "Provider SLO + Escalation",
      title: "Defuse tenant SLO and renewal risk",
      impactDollars: Math.max(impactGpuHours * rate, provider.sellableWasteValue * 0.2),
      impactGpuHours,
      riskScore: clamp(provider.queueSloPct * 0.58 + provider.efficiencyGap * 3),
      confidence: confidenceFromSignals([provider.queueSloPct, provider.efficiencyGap, summary.slo?.targetStartMinutes, summary.slo?.targetEfficiency]),
      evidence: provider.queueSloGapMinutes > 0
        ? `${round(provider.queueSloGapMinutes)} minutes over start target and ${round(provider.efficiencyGap)} efficiency points below target.`
        : `${round(provider.efficiencyGap)} efficiency points below target.`,
      recommendation: "Create a tenant-safe evidence pack with queue, efficiency, and bottleneck attribution before the next support or QBR conversation.",
      owner: "Customer success + platform"
    };
  }

  function inferenceOpportunity(summary, provider, rate) {
    if (numeric(summary.inferenceRequestsM) <= 0) return null;

    const tailPressure = numeric(summary.latencyTail) + numeric(summary.kvCachePressure) * 0.7 + numeric(summary.batchInefficiency) * 0.45;
    const recoverableGpuHours = numeric(summary.wastedGpuHours) * clamp(tailPressure / 230, 0.08, 0.38);
    return {
      id: "inference-unit-economics",
      category: "Inference Economics",
      title: "Lower cost per served request",
      impactDollars: recoverableGpuHours * rate,
      impactGpuHours: recoverableGpuHours,
      riskScore: clamp(tailPressure),
      confidence: confidenceFromSignals([summary.inferenceRequestsM, summary.latencyTail, summary.kvCachePressure, summary.costPerMillionRequests]),
      evidence: `${round(summary.inferenceRequestsM)}M requests at ${defaultCurrency(summary.costPerMillionRequests)} per million requests with ${pct(summary.latencyTail)} tail pressure.`,
      recommendation: "Tune batching, KV-cache placement, and admission control together, then track cost per million requests beside latency tail.",
      owner: "Inference platform"
    };
  }

  function hostKernelOpportunity(summary, provider, rate) {
    const hostPressure = numeric(summary.contentionPct) + numeric(summary.cpuPrep) * 0.7 + numeric(summary.storageWait) * 0.45 + numeric(summary.networkWait) * 0.45 + numeric(summary.noiseEvents) * 8;
    if (hostPressure < 22) return null;

    const recoverableGpuHours = numeric(summary.wastedGpuHours) * clamp(hostPressure / 240, 0.06, 0.34);
    return {
      id: "host-kernel-ebpf",
      category: "Host Kernel + eBPF",
      title: "Correlate kernel pressure with GPU idle time",
      impactDollars: recoverableGpuHours * rate,
      impactGpuHours: recoverableGpuHours,
      riskScore: clamp(hostPressure),
      confidence: confidenceFromSignals([summary.contentionPct, summary.cpuPrep, summary.storageWait, summary.networkWait, summary.noiseEvents]),
      evidence: `${pct(summary.contentionPct)} contention, ${pct(summary.cpuPrep)} CPU-prep pressure, ${round(summary.noiseEvents)} noise events.`,
      recommendation: "Use eBPF summaries to separate noisy-neighbor, CPU scheduling, socket, and block I/O causes before moving the workload.",
      owner: "Kernel + SRE"
    };
  }

  function fleetHealthOpportunity(summary, provider, rate) {
    const irregularity = Math.max(0, 100 - numeric(summary.stepRegularity));
    const fleetRisk = irregularity + numeric(summary.noiseEvents) * 10 + numeric(summary.latencyTail) * 0.35;
    if (fleetRisk < 24) return null;

    const impactGpuHours = numeric(summary.wastedGpuHours) * clamp(fleetRisk / 260, 0.05, 0.28);
    return {
      id: "fleet-health",
      category: "Fleet Reliability",
      title: "Prioritize unstable fleet segments",
      impactDollars: impactGpuHours * rate,
      impactGpuHours,
      riskScore: clamp(fleetRisk),
      confidence: confidenceFromSignals([summary.stepRegularity, summary.noiseEvents, summary.latencyTail]),
      evidence: `${pct(summary.stepRegularity)} step regularity with ${round(summary.noiseEvents)} contention/noise events.`,
      recommendation: "Score nodes and reservations by repeated irregularity, then drain or quarantine segments that repeatedly create tenant-visible loss.",
      owner: "Fleet SRE"
    };
  }

  function energyOpportunity(summary, provider, rate, options) {
    if (numeric(summary.wastedGpuHours) < 20) return null;

    const kwPerGpu = firstPositive(options.kwPerGpu, 0.7);
    const kgCo2ePerKwh = firstPositive(options.kgCo2ePerKwh, 0.38);
    const wastedKwh = numeric(summary.wastedGpuHours) * kwPerGpu;
    const carbonKg = wastedKwh * kgCo2ePerKwh;
    return {
      id: "energy-carbon",
      category: "Energy + Carbon",
      title: "Turn wasted GPU-hours into energy accountability",
      impactDollars: numeric(summary.wasteDollars) * 0.04,
      impactGpuHours: numeric(summary.wastedGpuHours),
      riskScore: clamp(numeric(summary.wastedGpuHours) / 40),
      confidence: confidenceFromSignals([summary.wastedGpuHours, kwPerGpu, kgCo2ePerKwh]),
      evidence: `${round(wastedKwh)} kWh and ${round(carbonKg)} kgCO2e estimated from non-useful GPU-hours.`,
      recommendation: "Report avoided GPU-hours alongside energy and carbon estimates so sustainability decisions use the same loss ledger as FinOps.",
      owner: "Sustainability + FinOps",
      sourceSignals: {
        wastedKwh,
        carbonKg
      }
    };
  }

  function evidencePackOpportunity(summary, provider) {
    if (provider.sellableWasteValue < 1000 && provider.queueSloGapMinutes <= 0 && numeric(summary.noiseEvents) === 0) return null;

    return {
      id: "redacted-evidence-pack",
      category: "Customer Evidence Pack",
      title: "Package tenant-safe proof for support and QBRs",
      impactDollars: Math.max(provider.sellableWasteValue * 0.08, 0),
      impactGpuHours: numeric(summary.wastedGpuHours) * 0.08,
      riskScore: clamp(provider.queueSloPct * 0.35 + provider.sellableWastePct),
      confidence: confidenceFromSignals([provider.sellableWasteValue, provider.queueSloPct, summary.noiseEvents, summary.sourceItems?.length]),
      evidence: `${defaultCurrency(provider.sellableWasteValue)} sellable waste value with ${round(summary.sourceItems?.length || summary.count || 1)} supporting run records.`,
      recommendation: "Export a redacted workspace that preserves metrics, sources, and trend evidence while removing tenant and infrastructure identifiers.",
      owner: "Customer success"
    };
  }

  function normalizeImportedOpportunity(opportunity, summary, index) {
    if (!opportunity || typeof opportunity !== "object") return null;

    return {
      id: opportunity.id || `imported-opportunity-${index + 1}`,
      category: opportunity.category || "Imported Opportunity",
      title: opportunity.title || opportunity.name || "Imported recommendation",
      impactDollars: numeric(opportunity.impactDollars),
      impactGpuHours: numeric(opportunity.impactGpuHours),
      riskScore: numeric(opportunity.riskScore, numeric(opportunity.score)),
      confidence: clamp(numeric(opportunity.confidence, 62)),
      evidence: opportunity.evidence || `${summary.label} includes an upstream opportunity recommendation.`,
      recommendation: opportunity.recommendation || opportunity.action || "Review the upstream recommendation and attach it to a measurable fix.",
      owner: opportunity.owner || "Imported source",
      sourceSignals: opportunity.sourceSignals || {}
    };
  }

  function finalizeOpportunity(opportunity, summary) {
    const impactDollars = Math.max(0, numeric(opportunity.impactDollars));
    const impactGpuHours = Math.max(0, numeric(opportunity.impactGpuHours));
    const riskScore = clamp(opportunity.riskScore);
    const priorityScore = clamp((impactDollars / 180) + (impactGpuHours / 18) + riskScore * 0.72 + numeric(opportunity.confidence) * 0.18, 0, 100);

    return {
      ...opportunity,
      id: `${summary.scope || "scope"}:${summary.key || "unknown"}:${opportunity.id}`,
      scope: summary.scope,
      key: summary.key,
      impactDollars,
      impactGpuHours,
      riskScore,
      priorityScore,
      severity: severityFor(priorityScore),
      confidence: clamp(opportunity.confidence, 0, 100),
      sourceSignals: {
        primaryBottleneck: opportunity.sourceSignals?.primaryBottleneck || "",
        ...opportunity.sourceSignals
      }
    };
  }

  function recoveryRatioFor(primary) {
    if (primary === "Communication" || primary === "Placement") return 0.34;
    if (primary === "Input" || primary === "Scheduler") return 0.28;
    if (primary === "Memory" || primary === "Noisy neighbor") return 0.22;
    if (primary === "Config") return 0.3;
    return 0.14;
  }

  function confidenceFromSignals(values) {
    const signalCount = values.filter((value) => Number.isFinite(Number(value))).length;
    return clamp(48 + signalCount * 9, 45, 91);
  }

  function severityFor(score) {
    if (score >= 74) return "critical";
    if (score >= 58) return "high";
    if (score >= 38) return "medium";
    return "low";
  }

  function reasonFor(shortName, summary) {
    switch (shortName) {
      case "Communication":
        return `Collectives and network wait consume ${pct(summary.ncclTime + summary.networkWait)} of allocated time, with ${pct(summary.crossPodTraffic)} cross-pod traffic amplifying all-reduce cost.`;
      case "Input":
        return `Input pipeline stalls account for ${pct(summary.dataloaderStall + summary.storageWait + summary.cpuPrep)} of observed loss across dataloader, storage, and CPU preprocessing.`;
      case "Memory":
        return `HBM pressure is high: ${pct(summary.hbmCapacity)} capacity, ${pct(summary.hbmBandwidth)} bandwidth, and ${pct(summary.memoryFragmentation)} fragmentation.`;
      case "Placement":
        return `Placement quality is ${pct(summary.placementQuality)}, with ${pct(summary.crossRackTraffic)} cross-rack traffic and ${summary.partialNodes} partially used nodes.`;
      case "Scheduler":
        return `Scheduler effects show up as ${round(summary.queueWaitMinutes)} minutes of queue wait, ${summary.idleGpus} idle GPUs, and ${summary.partialNodes} partial nodes.`;
      case "Noisy neighbor":
        return `Co-tenant interference is visible through ${summary.noiseEvents} contention events and a ${pct(summary.contentionPct)} contention signal.`;
      case "Config":
        return `Batch, precision, or parallelism choices are leaving work on the table: ${pct(summary.batchInefficiency)} configuration inefficiency signal.`;
      default:
        return `GPU kernels are the main limiter, with ${pct(summary.smOccupancy)} SM occupancy and ${pct(summary.tensorCoreUtil)} tensor-core utilization.`;
    }
  }

  function recommendationFor(summary, classifier) {
    const primary = classifier.primary.short;

    if (primary === "Communication") {
      return "Recommendation: keep runs above 128 GPUs inside one pod where possible, then inspect NCCL all-reduce timing by aggregation tier.";
    }
    if (primary === "Placement") {
      return "Recommendation: constrain placement to locality groups and avoid allocations that cross aggregation tiers unless the scheduler predicts spare fabric capacity.";
    }
    if (primary === "Input") {
      return "Recommendation: move the input pipeline closer to the job, prefetch aggressively, and compare GPU gaps against storage latency windows.";
    }
    if (primary === "Memory") {
      return "Recommendation: inspect activation checkpointing, KV cache pressure, and HBM bandwidth before adding more GPUs.";
    }
    if (primary === "Scheduler") {
      return "Recommendation: repack partial nodes and reserve contiguous placement for repeated high-value workloads.";
    }
    if (primary === "Config") {
      return "Recommendation: retune batch size, precision, and parallelism before treating the cluster as saturated.";
    }
    if (primary === "Noisy neighbor") {
      return "Recommendation: isolate the workload during congestion windows and compare port-level contention against step-time spikes.";
    }
    return "Recommendation: this job is compute-bound; optimize kernels and model code before changing placement or network policy.";
  }

  function estimateImprovement(primary, secondary, summary) {
    let low = 4;
    let high = 9;

    if (primary.short === "Communication" || primary.short === "Placement") {
      low = clamp(7 + summary.crossPodTraffic * 0.17 + (100 - summary.placementQuality) * 0.08, 8, 18);
      high = clamp(low + 7 + summary.crossRackTraffic * 0.04, 14, 31);
    } else if (primary.short === "Input") {
      low = clamp(5 + (summary.dataloaderStall + summary.storageWait) * 0.14, 5, 14);
      high = clamp(low + 6, 10, 24);
    } else if (primary.short === "Memory") {
      low = clamp(4 + Math.max(0, summary.hbmCapacity - 75) * 0.18, 4, 13);
      high = clamp(low + 6, 9, 22);
    } else if (primary.short === "Scheduler") {
      low = clamp(3 + summary.partialNodes * 1.5, 3, 14);
      high = clamp(low + 5, 8, 23);
    } else if (primary.short === "Compute") {
      low = 2;
      high = 7;
    }

    if (secondary.short === "Placement" || secondary.short === "Communication") {
      high = Math.min(34, high + 3);
    }

    return `${round(low)} to ${round(high)}%`;
  }

  function clamp(value, min = 0, max = 100) {
    return Math.min(max, Math.max(min, numeric(value)));
  }

  function numeric(value, fallback = 0) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : fallback;
  }

  function firstPositive(...values) {
    const value = values.map(Number).find((numberValue) => Number.isFinite(numberValue) && numberValue > 0);
    return value || 0;
  }

  function firstFinite(...values) {
    const value = values.map(Number).find((numberValue) => Number.isFinite(numberValue));
    return value === undefined ? Number.NaN : value;
  }

  function round(value) {
    return Math.round(numeric(value));
  }

  function pct(value) {
    return `${round(value)}%`;
  }

  function titleCase(value) {
    return String(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function grade(value, watchAt, goodAt) {
    if (value >= goodAt) return { key: "good", label: "Healthy" };
    if (value >= watchAt) return { key: "watch", label: "Watch" };
    return { key: "poor", label: "Lossy" };
  }

  function inverseGrade(value, watchAt, poorAt) {
    if (value >= poorAt) return { key: "poor", label: "Lossy" };
    if (value >= watchAt) return { key: "watch", label: "Watch" };
    return { key: "good", label: "Healthy" };
  }

  function gradeColor(value, higherIsBetter) {
    const level = higherIsBetter ? grade(value, 55, 72).key : inverseGrade(value, 55, 72).key;
    if (level === "good") return "var(--green)";
    if (level === "watch") return "var(--amber)";
    return "var(--red)";
  }

  function deltaText(delta) {
    if (Math.abs(delta) < 0.5) return "flat";
    return delta > 0 ? `${pct(delta)} slower` : `${pct(Math.abs(delta))} better`;
  }

  function defaultCurrency(value) {
    return `$${round(value)}`;
  }

  return {
    applyPlacementWhatIf,
    clamp,
    classifyBottlenecks,
    deltaText,
    finalizeSummary,
    fingerprintWorkload,
    grade,
    gradeColor,
    generateOpportunities,
    inverseGrade,
    pct,
    recommendationFor,
    regressionRows,
    round,
    scoreComponents,
    simulateSchedulerScenarios,
    summarizeProviderEconomics,
    summarizeTrend,
    titleCase
  };
});
