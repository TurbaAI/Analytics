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
    inverseGrade,
    pct,
    recommendationFor,
    regressionRows,
    round,
    scoreComponents,
    titleCase
  };
});
