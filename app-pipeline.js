/**
 * turbalance Analytics — ingestion, import, normalization, and summary builders
 *
 * Extracted from app.js (PR5 modularization). Loaded as a classic <script>
 * BEFORE app.js; these are top-level function declarations (global, hoisted,
 * lazily executed), so load order among the app-*.js modules does not matter
 * and they may freely reference app.js's top-level state at call time.
 */

function applyThemeMode(theme, { persist = false } = {}) {
  const normalized = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalized;
  document.documentElement.style.colorScheme = normalized;

  const toggle = document.querySelector("#themeToggle");
  const label = document.querySelector("#themeToggleText");
  const switcher = document.querySelector(".theme-switch");
  if (toggle) {
    toggle.checked = normalized === "dark";
    toggle.setAttribute("aria-checked", String(toggle.checked));
  }
  if (label) label.textContent = normalized === "dark" ? "Dark" : "Light";
  if (switcher) {
    switcher.dataset.theme = normalized;
    switcher.title = normalized === "dark" ? "Switch to light mode" : "Switch to dark mode";
  }

  if (persist) writeThemeMode(normalized);
}

function normalizedSelectionToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildBaselineStore(runs = []) {
  return runs.reduce((baselines, run) => {
    if (run.id && isPlainObject(run.baseline)) {
      baselines[run.id] = { ...run.baseline };
    }

    return baselines;
  }, {});
}

function applyPersistedBaselines(feed, baselines = {}) {
  return {
    ...feed,
    runs: feed.runs.map((run) => ({
      ...run,
      baseline: baselines[run.id] ? { ...run.baseline, ...baselines[run.id] } : run.baseline
    }))
  };
}

function applySourceImports(feed, sources = {}, ncclTraces = []) {
  const importedByRun = new Map();
  const adapters = [];

  if (sources.prometheus?.length) {
    mergeImportedSections(importedByRun, importPrometheusSamples(sources.prometheus), "prometheus");
    adapters.push("prometheus");
  }
  if (sources.dcgm?.length) {
    mergeImportedSections(importedByRun, importDcgmSamples(sources.dcgm), "dcgm");
    adapters.push("dcgm");
  }
  if (sources.kubernetes?.length) {
    mergeImportedSections(importedByRun, importKubernetesSamples(sources.kubernetes), "kubernetes");
    adapters.push("kubernetes");
  }
  if (sources.scheduler?.length) {
    mergeImportedSections(importedByRun, importSchedulerSamples(sources.scheduler), "scheduler");
    adapters.push("scheduler");
  }
  if (sources.grafana?.length) {
    mergeImportedSections(importedByRun, importGrafanaSamples(sources.grafana), "grafana");
    adapters.push("grafana");
  }
  if (sources.ebpf?.length) {
    mergeImportedSections(importedByRun, importEbpfSamples(sources.ebpf), "ebpf");
    adapters.push("ebpf");
  }
  if (sources.redfish?.length) {
    mergeImportedSections(importedByRun, importRedfishSamples(sources.redfish), "redfish");
    adapters.push("redfish");
  }
  if (sources.provider?.length) {
    mergeImportedSections(importedByRun, importProviderSamples(sources.provider), "provider");
    adapters.push("provider");
  }
  if (sources.opportunities?.length) {
    mergeImportedSections(importedByRun, importOpportunitySamples(sources.opportunities), "opportunities");
    adapters.push("opportunities");
  }
  if (ncclTraces.length) {
    mergeImportedSections(importedByRun, importNcclTraceSamples(ncclTraces, NODE_INDEX), "nccl-trace");
    adapters.push("nccl-trace");
  }

  return {
    ...feed,
    sourceAdapters: unique([...(feed.sourceAdapters || []), ...adapters]),
    runs: feed.runs.map((run) => {
      const imported = importedByRun.get(run.id);
      if (!imported) return run;

      return {
        ...deepMerge(run, imported.sections),
        importedSources: imported.sources
      };
    })
  };
}

function importPrometheusSamples(samples = []) {
  return samples.map((sample) => {
    const metrics = sample.metrics || {};

    return {
      runId: sample.runId,
      sections: {
        utilization: {
          gpuUtil: ratioPercent(metrics.turba_gpu_utilization_ratio),
          usefulCompute: ratioPercent(metrics.turba_useful_compute_ratio)
        },
        communication: {
          ncclTime: ratioPercent(metrics.turba_nccl_time_ratio),
          networkWait: ratioPercent(metrics.turba_network_wait_ratio),
          networkUtilization: optionalPercent(metrics.turba_network_utilization_ratio),
          allToAllTime: ratioPercent(metrics.turba_all_to_all_time_ratio)
        },
        inputPipeline: {
          dataloaderStall: ratioPercent(metrics.turba_dataloader_stall_ratio),
          storageWait: ratioPercent(metrics.turba_storage_wait_ratio),
          cpuPrep: ratioPercent(metrics.turba_cpu_prep_ratio)
        },
        scheduler: {
          queueWaitMinutes: numeric(metrics.turba_queue_wait_minutes)
        },
        reliability: {
          stepRegularity: ratioPercent(metrics.turba_step_regularity_ratio),
          latencyTail: ratioPercent(metrics.turba_latency_tail_ratio)
        },
        work: {
          tokensM: numeric(metrics.turba_tokens_million_total),
          steps: numeric(metrics.turba_training_steps_total),
          inferenceRequestsM: numeric(metrics.turba_inference_requests_million_total)
        },
        sourceContext: prometheusGpuSourceContext(metrics)
      }
    };
  });
}

function importDcgmSamples(samples = []) {
  return samples.map((sample) => {
    const fields = sample.fields || {};

    return {
      runId: sample.runId,
      sections: {
        utilization: {
          smOccupancy: metric(fields, "DCGM_FI_PROF_SM_OCCUPANCY"),
          tensorCoreUtil: metric(fields, "DCGM_FI_PROF_PIPE_TENSOR_ACTIVE")
        },
        memory: {
          hbmCapacity: metric(fields, "DCGM_FI_DEV_FB_USED_RATIO"),
          hbmBandwidth: metric(fields, "DCGM_FI_PROF_DRAM_ACTIVE"),
          memoryFragmentation: metric(fields, "DCGM_FI_DEV_MEM_FRAGMENTATION"),
          kvCachePressure: metric(fields, "DCGM_FI_DEV_KV_CACHE_PRESSURE")
        },
        sourceContext: dcgmGpuSourceContext(fields)
      }
    };
  });
}

function importKubernetesSamples(samples = []) {
  return samples.map((sample) => ({
    runId: sample.runId,
    sections: {
      status: sample.status,
      allocation: { ...(sample.allocation || {}) },
      scheduler: { ...(sample.scheduler || {}) },
      communication: {
        crossRackTraffic: metric(sample.topology, "crossRackTraffic"),
        crossPodTraffic: metric(sample.topology, "crossPodTraffic")
      },
      reliability: {
        noiseEvents: metric(sample.annotations, "noiseEvents"),
        contentionPct: metric(sample.annotations, "contentionPct")
      },
      configuration: {
        precisionLoss: metric(sample.annotations, "precisionLoss"),
        batchInefficiency: metric(sample.annotations, "batchInefficiency")
      },
      placement: {
        nodes: sample.topology?.nodes || [],
        partialNodes: sample.topology?.partialNodes || []
      },
      sourceContext: {
        namespace: sample.namespace,
        podSelector: sample.podSelector
      }
    }
  }));
}

function importSchedulerSamples(samples = []) {
  return samples.map((sample) => {
    const metrics = sample.metrics || {};
    const scheduler = sample.scheduler || {};
    const policy = sample.policy || {};
    const signals = sample.signals || {};
    const events = Array.isArray(sample.events) ? sample.events : [];
    const counts = schedulerEventCounts(events);
    const queuedAt = sample.queuedAt || scheduler.queuedAt || policy.queuedAt;
    const admittedAt = sample.admittedAt || scheduler.admittedAt || policy.admittedAt;
    const startedAt = sample.startedAt || scheduler.startedAt || policy.startedAt || admittedAt;
    const eventCount = firstFinite(
      metrics.turba_scheduler_events,
      metrics.scheduler_event_count,
      scheduler.eventCount,
      sample.eventCount,
      events.length
    );
    const queueWaitMinutes = firstFinite(
      metrics.turba_queue_wait_minutes,
      metrics.scheduler_queue_wait_minutes,
      scheduler.queueWaitMinutes,
      sample.queueWaitMinutes,
      minutesBetween(queuedAt, startedAt)
    );
    const placementQuality = firstFinite(
      metrics.turba_placement_quality,
      metrics.scheduler_placement_quality,
      signals.placementQuality,
      scheduler.placementQuality,
      sample.placementQuality
    );
    const idleGpus = firstFinite(
      metrics.turba_idle_gpus,
      metrics.scheduler_idle_gpus,
      signals.idleGpus,
      scheduler.idleGpus,
      sample.idleGpus
    );
    const partialNodes = firstFinite(
      metrics.turba_partial_nodes,
      metrics.scheduler_partial_nodes,
      signals.partialNodes,
      scheduler.partialNodes,
      sample.partialNodes
    );
    const admissionAttempts = firstFinite(
      metrics.turba_admission_attempts,
      scheduler.admissionAttempts,
      sample.admissionAttempts,
      counts.admissionAttempts
    );
    const preemptionCount = firstFinite(
      metrics.turba_preemptions,
      metrics.scheduler_preemptions,
      scheduler.preemptionCount,
      sample.preemptionCount,
      counts.preemptionCount
    );
    const placementRetries = firstFinite(
      metrics.turba_placement_retries,
      metrics.scheduler_placement_retries,
      scheduler.placementRetries,
      sample.placementRetries,
      counts.placementRetries
    );
    const localityMisses = firstFinite(
      metrics.turba_locality_misses,
      metrics.scheduler_locality_misses,
      scheduler.localityMisses,
      sample.localityMisses,
      counts.localityMisses
    );
    const backfillCandidates = firstFinite(
      metrics.turba_backfill_candidates,
      scheduler.backfillCandidates,
      sample.backfillCandidates,
      counts.backfillCandidates
    );
    const pendingJobsAhead = firstFinite(
      metrics.turba_pending_jobs_ahead,
      scheduler.pendingJobsAhead,
      sample.pendingJobsAhead
    );
    const pendingGpuHoursAhead = firstFinite(
      metrics.turba_pending_gpu_hours_ahead,
      scheduler.pendingGpuHoursAhead,
      sample.pendingGpuHoursAhead
    );
    const gpusPerNode = firstFinite(
      policy.gpusPerNode,
      scheduler.gpusPerNode,
      sample.gpusPerNode
    );
    const targetStartMinutes = firstFinite(
      policy.targetStartMinutes,
      scheduler.targetStartMinutes,
      sample.targetStartMinutes
    );

    const schedulerName = sample.schedulerName || policy.schedulerName || scheduler.schedulerName;
    const queueName = sample.queueName || policy.queueName || scheduler.queueName;
    const priorityClass = sample.priorityClass || policy.priorityClass || scheduler.priorityClass;
    const admissionClass = sample.admissionClass || policy.admissionClass || scheduler.admissionClass;
    const requestedGpuShape = sample.requestedGpuShape || policy.requestedGpuShape || scheduler.requestedGpuShape;
    const localityPreference = sample.localityPreference || policy.localityPreference || scheduler.localityPreference;
    const reservationPolicy = sample.reservationPolicy || policy.reservationPolicy || scheduler.reservationPolicy;

    return {
      runId: sample.runId,
      sections: compactSections({
        scheduler: compactMetrics({
          queueWaitMinutes,
          placementQuality,
          idleGpus,
          partialNodes,
          admissionAttempts,
          preemptionCount,
          placementRetries,
          localityMisses,
          backfillCandidates,
          pendingJobsAhead,
          pendingGpuHoursAhead,
          gpusPerNode
        }),
        slo: compactMetrics({
          targetStartMinutes
        }),
        schedulerEvidence: compactObject({
          schedulerName,
          queueName,
          priorityClass,
          admissionClass,
          requestedGpuShape,
          localityPreference,
          reservationPolicy,
          queuedAt,
          admittedAt,
          startedAt,
          ...compactMetrics({
            eventCount,
            queueWaitMinutes,
            admissionAttempts,
            preemptionCount,
            placementRetries,
            localityMisses,
            backfillCandidates,
            pendingJobsAhead,
            pendingGpuHoursAhead,
            gpusPerNode
          })
        }),
        sourceContext: compactObject({
          ...(sample.sourceContext || {}),
          schedulerExportId: sample.schedulerExportId,
          schedulerName,
          queueName,
          priorityClass,
          admissionClass,
          requestedGpuShape,
          localityPreference
        })
      })
    };
  });
}

function importGrafanaSamples(samples = []) {
  return samples.map((sample) => {
    const links = grafanaLinksFromSample(sample);
    const dashboardUrl = sample.dashboardUrl || grafanaDashboardUrlFromSample(sample);
    const exploreUrl = sample.exploreUrl || grafanaExploreUrlFromSample(sample);
    const timeRange = isPlainObject(sample.timeRange) ? compactObject({
      from: sample.timeRange.from,
      to: sample.timeRange.to
    }) : {};
    const variables = isPlainObject(sample.variables) ? { ...sample.variables } : {};

    return {
      runId: sample.runId,
      sections: compactSections({
        grafanaContext: compactObject({
          grafanaBaseUrl: sample.grafanaBaseUrl || sample.baseUrl,
          instanceName: sample.instanceName || sample.grafanaInstance,
          orgId: sample.orgId,
          dashboardUid: sample.dashboardUid,
          dashboardSlug: sample.dashboardSlug,
          dashboardTitle: sample.dashboardTitle,
          folder: sample.folder,
          datasourceUid: sample.datasourceUid,
          datasourceName: sample.datasourceName,
          timeRange: Object.keys(timeRange).length > 0 ? timeRange : undefined,
          variables: Object.keys(variables).length > 0 ? variables : undefined,
          dashboardUrl,
          exploreUrl,
          links: links.length > 0 ? links : undefined
        }),
        sourceContext: compactObject({
          ...(sample.sourceContext || {}),
          grafanaBaseUrl: sample.grafanaBaseUrl || sample.baseUrl,
          grafanaInstance: sample.instanceName || sample.grafanaInstance,
          grafanaOrgId: sample.orgId,
          grafanaDashboardUid: sample.dashboardUid,
          grafanaDashboardSlug: sample.dashboardSlug,
          grafanaDashboardTitle: sample.dashboardTitle,
          grafanaFolder: sample.folder,
          grafanaDatasourceUid: sample.datasourceUid,
          grafanaDatasourceName: sample.datasourceName,
          grafanaDashboardUrl: dashboardUrl,
          grafanaExploreUrl: exploreUrl
        })
      })
    };
  });
}

function importEbpfSamples(samples = []) {
  return samples.map((sample) => {
    const metrics = sample.metrics || {};
    const cpu = sample.cpu || {};
    const scheduler = sample.scheduler || {};
    const network = sample.network || {};
    const storage = sample.storage || {};
    const noise = sample.noise || {};
    const signals = sample.signals || {};

    const runQueueLatency = firstFinite(
      metrics.turba_run_queue_latency_ms_p95,
      scheduler.runQueueLatencyMsP95,
      sample.runQueueLatencyMsP95
    );
    const offCpuPct = optionalPercent(firstFinite(
      metrics.turba_off_cpu_time_ratio,
      metrics.turba_off_cpu_time_pct,
      cpu.offCpuTimePct,
      sample.offCpuTimePct
    ));
    const cpuThrottlePct = optionalPercent(firstFinite(
      metrics.turba_cpu_throttle_ratio,
      metrics.turba_cpu_throttle_pct,
      cpu.cpuThrottlePct,
      sample.cpuThrottlePct
    ));
    const tcpRetransmitPct = optionalPercent(firstFinite(
      metrics.turba_tcp_retransmit_ratio,
      metrics.turba_tcp_retransmit_pct,
      network.tcpRetransmitPct
    ));
    const networkUtilization = optionalPercent(firstFinite(
      metrics.turba_network_utilization_ratio,
      metrics.turba_network_utilization_pct,
      signals.networkUtilization,
      network.utilizationPct
    ));
    const socketLatency = firstFinite(
      metrics.turba_socket_latency_ms_p95,
      network.socketLatencyMsP95
    );
    const blockLatency = firstFinite(
      metrics.turba_block_io_latency_ms_p95,
      storage.blockIoLatencyMsP95
    );
    const filesystemLatency = firstFinite(
      metrics.turba_filesystem_latency_ms_p95,
      storage.filesystemLatencyMsP95
    );
    const softIrqPct = optionalPercent(firstFinite(
      metrics.turba_softirq_ratio,
      metrics.turba_softirq_pct,
      cpu.softIrqPct,
      noise.softIrqPct
    ));
    const noisyNeighborScore = optionalPercent(firstFinite(
      metrics.turba_noisy_neighbor_score,
      noise.noisyNeighborScore,
      sample.noisyNeighborScore
    ));

    const networkWait = maxFinite(
      optionalPercent(signals.networkWait),
      pressure(tcpRetransmitPct, 1, 8),
      pressure(socketLatency, 10, 80)
    );
    const storageWait = maxFinite(
      optionalPercent(signals.storageWait),
      pressure(blockLatency, 2, 40),
      pressure(filesystemLatency, 2, 50)
    );
    const cpuPrep = maxFinite(
      optionalPercent(signals.cpuPrep),
      offCpuPct,
      cpuThrottlePct,
      pressure(runQueueLatency, 1, 30)
    );
    const contentionPct = maxFinite(
      optionalPercent(signals.contentionPct),
      cpuThrottlePct,
      offCpuPct,
      softIrqPct,
      noisyNeighborScore
    );
    const latencyTail = maxFinite(
      optionalPercent(signals.latencyTail),
      pressure(runQueueLatency, 2, 40),
      pressure(socketLatency, 20, 120)
    );
    const noiseEvents = firstFinite(
      noise.noiseEvents,
      metrics.turba_noise_events,
      noisyNeighborScore >= 65 ? 1 : undefined
    );

    return {
      runId: sample.runId,
      sections: compactSections({
        communication: compactMetrics({
          networkWait,
          networkUtilization
        }),
        inputPipeline: compactMetrics({
          storageWait,
          cpuPrep
        }),
        reliability: compactMetrics({
          contentionPct,
          latencyTail,
          noiseEvents
        }),
        sourceContext: compactObject({
          ...(sample.sourceContext || {}),
          ebpfExportId: sample.ebpfExportId,
          collector: sample.collector,
          kernelRelease: sample.kernelRelease,
          host: sample.host,
          node: sample.node,
          namespace: sample.namespace,
          podName: sample.podName,
          containerName: sample.containerName,
          cgroupPath: sample.cgroupPath
        })
      })
    };
  });
}

function importRedfishSamples(samples = []) {
  return samples.map((sample) => {
    const metrics = sample.metrics || {};
    const health = sample.health || {};
    const systems = Array.isArray(sample.systems) ? sample.systems : [];
    const chassis = Array.isArray(sample.chassis) ? sample.chassis : [];
    const managers = Array.isArray(sample.managers) ? sample.managers : [];
    const firmwareInventory = Array.isArray(sample.firmwareInventory) ? sample.firmwareInventory : [];
    const unhealthyResources = Array.isArray(health.unhealthyResources) ? health.unhealthyResources : [];
    const warnings = Array.isArray(health.warnings) ? health.warnings : [];
    const powerWatts = firstFinite(
      metrics.redfish_power_watts,
      maxFinite(...chassis.map((item) => item.powerWatts))
    );
    const powerLimitWatts = firstFinite(
      metrics.redfish_power_limit_watts,
      maxFinite(...chassis.map((item) => item.powerLimitWatts))
    );
    const inletTempCelsius = firstFinite(
      metrics.redfish_inlet_temp_celsius,
      maxFinite(...chassis.map((item) => item.inletTempCelsius))
    );
    const exhaustTempCelsius = firstFinite(
      metrics.redfish_exhaust_temp_celsius,
      maxFinite(...chassis.map((item) => item.exhaustTempCelsius))
    );
    const maxTempCelsius = firstFinite(
      metrics.redfish_max_temp_celsius,
      maxFinite(...chassis.map((item) => item.maxTempCelsius))
    );
    const criticalLogEntries = firstFinite(
      metrics.redfish_critical_log_entries_total,
      systems.reduce((total, system) => total + numeric(system.criticalLogEntries), 0)
    );
    const unhealthyCount = firstFinite(
      metrics.redfish_unhealthy_resources_total,
      unhealthyResources.length
    );
    const healthPressure = redfishHealthPressure([
      health.rollup,
      sample.sourceContext?.redfishHealthRollup,
      ...systems.map((item) => item.health),
      ...chassis.map((item) => item.health),
      ...managers.map((item) => item.health),
      ...firmwareInventory.map((item) => item.health)
    ]);
    const thermalPressure = maxFinite(
      pressure(maxTempCelsius, 75, 95),
      pressure(inletTempCelsius, 28, 40),
      pressure(exhaustTempCelsius, 45, 70)
    );
    const powerPressure = powerWatts && powerLimitWatts
      ? pressure((powerWatts / powerLimitWatts) * 100, 70, 95)
      : undefined;
    const redfishPressure = maxFinite(
      healthPressure,
      pressure(unhealthyCount, 0, 4),
      pressure(criticalLogEntries, 0, 5),
      thermalPressure,
      powerPressure
    );
    const sourceContext = compactObject({
      ...(sample.sourceContext || {}),
      redfishBaseUrl: sample.redfishBaseUrl || sample.sourceContext?.redfishBaseUrl,
      redfishServiceUuid: sample.serviceRoot?.uuid || sample.serviceRoot?.UUID || sample.sourceContext?.redfishServiceUuid,
      redfishVersion: sample.serviceRoot?.redfishVersion || sample.serviceRoot?.RedfishVersion || sample.sourceContext?.redfishVersion,
      redfishHealthRollup: health.rollup || sample.sourceContext?.redfishHealthRollup,
      redfishSystemCount: firstFinite(metrics.redfish_systems_total, systems.length),
      redfishChassisCount: firstFinite(metrics.redfish_chassis_total, chassis.length),
      redfishManagerCount: firstFinite(metrics.redfish_managers_total, managers.length),
      redfishUnhealthyResources: unhealthyCount,
      redfishCriticalLogEntries: criticalLogEntries,
      redfishPowerWatts: powerWatts,
      redfishPowerLimitWatts: powerLimitWatts,
      redfishInletTempCelsius: inletTempCelsius,
      redfishExhaustTempCelsius: exhaustTempCelsius,
      redfishMaxTempCelsius: maxTempCelsius,
      redfishPowerState: sample.sourceContext?.redfishPowerState || firstString(systems.map((system) => system.powerState)),
      redfishBiosVersion: sample.sourceContext?.redfishBiosVersion || firstString(systems.map((system) => system.biosVersion)),
      redfishManagerFirmwareVersion: sample.sourceContext?.redfishManagerFirmwareVersion || firstString(managers.map((manager) => manager.firmwareVersion)),
      redfishSystems: redfishResourceLabels(systems),
      redfishChassis: redfishResourceLabels(chassis),
      redfishManagers: redfishResourceLabels(managers),
      redfishFirmwareInventory: redfishResourceLabels(firmwareInventory),
      redfishWarnings: warnings.length > 0 ? warnings.slice(0, 8) : undefined
    });

    return {
      runId: sample.runId,
      sections: compactSections({
        reliability: redfishPressure > 0 ? compactMetrics({
          noiseEvents: maxFinite(unhealthyCount, criticalLogEntries),
          contentionPct: redfishPressure,
          latencyTail: maxFinite(thermalPressure, powerPressure)
        }) : {},
        sourceContext
      })
    };
  });
}

function importProviderSamples(samples = []) {
  return samples.map((sample) => ({
    runId: sample.runId,
    sections: {
      refs: compactObject({
        ...(sample.refs || {}),
        tenant: sample.tenant || sample.refs?.tenant,
        account: sample.account || sample.refs?.account,
        reservation: sample.reservation || sample.refs?.reservation
      }),
      commercial: { ...(sample.commercial || {}) },
      slo: { ...(sample.slo || {}) },
      sourceContext: compactObject({
        ...(sample.sourceContext || {}),
        providerExportId: sample.providerExportId,
        billingAccountId: sample.billingAccountId,
        reservationWindow: sample.reservationWindow
      })
    }
  }));
}

function importOpportunitySamples(samples = []) {
  const grouped = new Map();

  samples.forEach((sample) => {
    if (!sample.runId) return;

    const existing = grouped.get(sample.runId) || [];
    const opportunities = Array.isArray(sample.opportunities) ? sample.opportunities : [sample];
    opportunities.forEach((opportunity, index) => {
      existing.push(compactObject({
        id: opportunity.id || sample.opportunityId || `source-opportunity-${existing.length + index + 1}`,
        category: opportunity.category || sample.category,
        title: opportunity.title || sample.title || sample.name,
        impactDollars: firstFinite(opportunity.impactDollars, sample.impactDollars),
        impactGpuHours: firstFinite(opportunity.impactGpuHours, sample.impactGpuHours),
        riskScore: firstFinite(opportunity.riskScore, opportunity.score, sample.riskScore, sample.score),
        confidence: firstFinite(opportunity.confidence, sample.confidence),
        evidence: opportunity.evidence || sample.evidence,
        recommendation: opportunity.recommendation || opportunity.action || sample.recommendation || sample.action,
        owner: opportunity.owner || sample.owner,
        sourceSignals: isPlainObject(opportunity.sourceSignals) ? opportunity.sourceSignals : sample.sourceSignals
      }));
    });
    grouped.set(sample.runId, existing);
  });

  return Array.from(grouped.entries()).map(([runId, opportunities]) => ({
    runId,
    sections: { opportunities }
  }));
}

function importNcclTraceSamples(samples = [], topologyIndex = {}) {
  if (!ncclParser) return [];

  return ncclParser.parseNcclTraces(samples, topologyIndex).map((trace) => ({
    runId: trace.runId,
    sections: {
      communication: {
        ncclTime: trace.ncclTime,
        allToAllTime: trace.allToAllTime,
        crossRackTraffic: trace.crossRackTraffic,
        crossPodTraffic: trace.crossPodTraffic
      },
      traceAttribution: {
        rankCount: trace.rankCount,
        eventCount: trace.eventCount,
        totalDurationMs: trace.totalDurationMs,
        totalBytes: trace.totalBytes,
        byTier: trace.byTier,
        byOperation: trace.byOperation,
        hottestTier: trace.hottestTier
      }
    }
  }));
}

function mergeImportedSections(importedByRun, imports, sourceName) {
  imports.forEach((item) => {
    if (!item.runId) return;

    const existing = importedByRun.get(item.runId) || { sections: {}, sources: [] };
    existing.sections = deepMerge(existing.sections, item.sections);
    existing.sources = unique([...existing.sources, sourceName]);
    importedByRun.set(item.runId, existing);
  });
}

function normalizeIngestion(feed) {
  if (feed.schemaVersion !== INGESTION_SCHEMA.version) {
    throw new Error(`Unsupported ingestion schema: ${feed.schemaVersion}`);
  }

  return feed.runs.map((run) => normalizeRun(run, feed.entities || {}));
}

function normalizeRun(run, entities) {
  const refs = run.refs || {};
  const clusters = entities.clusters || {};
  const cluster = clusters[refs.cluster] || {};
  const allocation = run.allocation || {};
  const allocatedGpuHours = numeric(allocation.allocatedGpuHours, allocation.durationHours * allocation.gpus);

  return {
    id: run.id,
    name: run.name,
    model: entityLabel(entities.models, refs.model),
    user: entityLabel(entities.users, refs.user),
    team: entityLabel(entities.teams, refs.team),
    cluster: entityLabel(entities.clusters, refs.cluster),
    tenant: entityLabel(entities.tenants, refs.tenant),
    account: entityLabel(entities.accounts, refs.account),
    reservation: entityLabel(entities.reservations, refs.reservation),
    gpuModel: allocation.gpuModel || cluster.gpuModel || "Unknown GPU",
    modelSpec: normalizeModelSpec(run, allocation, cluster),
    status: run.status,
    durationHours: numeric(allocation.durationHours),
    gpus: numeric(allocation.gpus),
    allocatedGpuHours,
    ...normalizeMetrics(run),
    commercial: normalizeCommercial(run.commercial, allocatedGpuHours),
    slo: normalizeSlo(run.slo),
    baseline: normalizeBaseline(run.baseline),
    placement: normalizePlacement(run.placement),
    traceAttribution: normalizeTraceAttribution(run.traceAttribution),
    schedulerEvidence: normalizeSchedulerEvidence(run.schedulerEvidence),
    grafanaContext: normalizeGrafanaContext(run.grafanaContext),
    importedOpportunities: normalizeImportedOpportunities(run.opportunities),
    source: {
      schemaVersion: INGESTION_SCHEMA.version,
      runId: run.id,
      refs,
      adapters: run.importedSources || [],
      context: run.sourceContext || {}
    }
  };
}

function normalizeSchedulerEvidence(evidence = {}) {
  if (!isPlainObject(evidence)) return {};

  return compactObject({
    schedulerName: String(evidence.schedulerName || ""),
    queueName: String(evidence.queueName || ""),
    priorityClass: String(evidence.priorityClass || ""),
    admissionClass: String(evidence.admissionClass || ""),
    requestedGpuShape: String(evidence.requestedGpuShape || ""),
    localityPreference: String(evidence.localityPreference || ""),
    reservationPolicy: String(evidence.reservationPolicy || ""),
    queuedAt: String(evidence.queuedAt || ""),
    admittedAt: String(evidence.admittedAt || ""),
    startedAt: String(evidence.startedAt || ""),
    ...compactMetrics({
      eventCount: optionalMetric(evidence, "eventCount"),
      queueWaitMinutes: optionalMetric(evidence, "queueWaitMinutes"),
      admissionAttempts: optionalMetric(evidence, "admissionAttempts"),
      preemptionCount: optionalMetric(evidence, "preemptionCount"),
      placementRetries: optionalMetric(evidence, "placementRetries"),
      localityMisses: optionalMetric(evidence, "localityMisses"),
      backfillCandidates: optionalMetric(evidence, "backfillCandidates"),
      pendingJobsAhead: optionalMetric(evidence, "pendingJobsAhead"),
      pendingGpuHoursAhead: optionalMetric(evidence, "pendingGpuHoursAhead"),
      gpusPerNode: optionalMetric(evidence, "gpusPerNode")
    })
  });
}

function normalizeModelSpec(run = {}, allocation = {}, cluster = {}) {
  const explicit = isPlainObject(run.modelSpec)
    ? run.modelSpec
    : isPlainObject(run.work?.modelSpec) ? run.work.modelSpec : {};
  const context = isPlainObject(run.sourceContext) ? run.sourceContext : {};

  return compactObject({
    gpuModel: String(explicit.gpuModel || allocation.gpuModel || cluster.gpuModel || context.gpuName || ""),
    precision: String(explicit.precision || explicit.dtype || run.configuration?.precision || context.precision || ""),
    paramsB: modelSpecNumber(explicit, run.work, context, "paramsB", "parametersB", "modelParamsB"),
    sequenceLength: modelSpecNumber(explicit, run.work, context, "sequenceLength", "seqLen", "contextLength"),
    batchSize: modelSpecNumber(explicit, run.work, context, "batchSize", "globalBatchSize"),
    peakTflops: modelSpecNumber(explicit, run.work, context, "peakTflops", "devicePeakTflops"),
    trainingFlopMultiplier: modelSpecNumber(explicit, run.work, context, "trainingFlopMultiplier", "flopsPerTokenMultiplier"),
    hardwareFlopMultiplier: modelSpecNumber(explicit, run.work, context, "hardwareFlopMultiplier", "recomputeMultiplier")
  });
}

function modelSpecNumber(...groupsAndKeys) {
  const keys = groupsAndKeys.filter((value) => typeof value === "string");
  const groups = groupsAndKeys.filter((value) => isPlainObject(value));
  for (const group of groups) {
    for (const key of keys) {
      const value = optionalMetric(group, key);
      if (Number.isFinite(value)) return value;
    }
  }
  return undefined;
}

function normalizeGrafanaContext(context = {}) {
  if (!isPlainObject(context)) return {};

  const links = Array.isArray(context.links)
    ? context.links
      .filter(isPlainObject)
      .map((link) => compactObject({
        label: String(link.label || link.title || link.type || "Grafana link"),
        type: String(link.type || "dashboard"),
        url: String(link.url || "")
      }))
      .filter((link) => link.url)
    : [];
  const timeRange = isPlainObject(context.timeRange) ? compactObject({
    from: String(context.timeRange.from || ""),
    to: String(context.timeRange.to || "")
  }) : {};
  const variables = isPlainObject(context.variables) ? { ...context.variables } : {};

  return compactObject({
    grafanaBaseUrl: String(context.grafanaBaseUrl || context.baseUrl || ""),
    instanceName: String(context.instanceName || context.grafanaInstance || ""),
    orgId: String(context.orgId || ""),
    dashboardUid: String(context.dashboardUid || ""),
    dashboardSlug: String(context.dashboardSlug || ""),
    dashboardTitle: String(context.dashboardTitle || ""),
    folder: String(context.folder || ""),
    datasourceUid: String(context.datasourceUid || ""),
    datasourceName: String(context.datasourceName || ""),
    timeRange: Object.keys(timeRange).length > 0 ? timeRange : undefined,
    variables: Object.keys(variables).length > 0 ? variables : undefined,
    dashboardUrl: String(context.dashboardUrl || ""),
    exploreUrl: String(context.exploreUrl || ""),
    links: links.length > 0 ? links : undefined
  });
}

function normalizeTraceAttribution(traceAttribution) {
  return {
    rankCount: metric(traceAttribution, "rankCount"),
    eventCount: metric(traceAttribution, "eventCount"),
    totalDurationMs: metric(traceAttribution, "totalDurationMs"),
    totalBytes: metric(traceAttribution, "totalBytes"),
    byTier: Array.isArray(traceAttribution?.byTier) ? traceAttribution.byTier : [],
    byOperation: Array.isArray(traceAttribution?.byOperation) ? traceAttribution.byOperation : [],
    hottestTier: traceAttribution?.hottestTier || null
  };
}

function normalizeImportedOpportunities(opportunities) {
  if (!Array.isArray(opportunities)) return [];

  return opportunities
    .filter(isPlainObject)
    .map((opportunity, index) => compactObject({
      id: String(opportunity.id || `opportunity-${index + 1}`),
      category: String(opportunity.category || "Imported Opportunity"),
      title: String(opportunity.title || opportunity.name || "Imported recommendation"),
      impactDollars: optionalMetric(opportunity, "impactDollars"),
      impactGpuHours: optionalMetric(opportunity, "impactGpuHours"),
      riskScore: optionalMetric(opportunity, "riskScore"),
      confidence: optionalMetric(opportunity, "confidence"),
      evidence: String(opportunity.evidence || ""),
      recommendation: String(opportunity.recommendation || opportunity.action || ""),
      owner: String(opportunity.owner || ""),
      sourceSignals: isPlainObject(opportunity.sourceSignals) ? opportunity.sourceSignals : {}
    }));
}

function normalizeMetrics(run) {
  return {
    gpuUtil: metric(run.utilization, "gpuUtil"),
    usefulCompute: metric(run.utilization, "usefulCompute"),
    smOccupancy: metric(run.utilization, "smOccupancy"),
    tensorCoreUtil: metric(run.utilization, "tensorCoreUtil"),
    ncclTime: metric(run.communication, "ncclTime"),
    networkWait: metric(run.communication, "networkWait"),
    networkUtilization: metric(run.communication, "networkUtilization"),
    dataloaderStall: metric(run.inputPipeline, "dataloaderStall"),
    storageWait: metric(run.inputPipeline, "storageWait"),
    cpuPrep: metric(run.inputPipeline, "cpuPrep"),
    hbmCapacity: metric(run.memory, "hbmCapacity"),
    hbmBandwidth: metric(run.memory, "hbmBandwidth"),
    memoryFragmentation: metric(run.memory, "memoryFragmentation"),
    placementQuality: metric(run.scheduler, "placementQuality"),
    crossRackTraffic: metric(run.communication, "crossRackTraffic"),
    crossPodTraffic: metric(run.communication, "crossPodTraffic"),
    idleGpus: metric(run.scheduler, "idleGpus"),
    partialNodes: metric(run.scheduler, "partialNodes"),
    queueWaitMinutes: metric(run.scheduler, "queueWaitMinutes"),
    noiseEvents: metric(run.reliability, "noiseEvents"),
    contentionPct: metric(run.reliability, "contentionPct"),
    precisionLoss: metric(run.configuration, "precisionLoss"),
    batchInefficiency: metric(run.configuration, "batchInefficiency"),
    allToAllTime: metric(run.communication, "allToAllTime"),
    stepRegularity: metric(run.reliability, "stepRegularity"),
    kvCachePressure: metric(run.memory, "kvCachePressure"),
    latencyTail: metric(run.reliability, "latencyTail"),
    tokensM: metric(run.work, "tokensM"),
    steps: metric(run.work, "steps"),
    inferenceRequestsM: metric(run.work, "inferenceRequestsM")
  };
}

function normalizeBaseline(baseline) {
  return {
    stepTime: metric(baseline, "stepTime"),
    currentStepTime: metric(baseline, "currentStepTime"),
    ncclTime: metric(baseline, "ncclTime"),
    gpuEfficiency: metric(baseline, "gpuEfficiency"),
    queueWaitMinutes: metric(baseline, "queueWaitMinutes"),
    costPerMillionTokens: metric(baseline, "costPerMillionTokens")
  };
}

function normalizeCommercial(commercial = {}, allocatedGpuHours = 0) {
  return {
    billingModel: String(commercial.billingModel || "unclassified"),
    customerTier: String(commercial.customerTier || "standard"),
    contractId: String(commercial.contractId || ""),
    listGpuHourRate: optionalMetric(commercial, "listGpuHourRate"),
    floorGpuHourCost: optionalMetric(commercial, "floorGpuHourCost"),
    committedGpuHours: metric(commercial, "committedGpuHours"),
    burstGpuHours: metric(commercial, "burstGpuHours"),
    billableGpuHours: metric(commercial, "billableGpuHours") || numeric(allocatedGpuHours),
    sellableGpuHours: metric(commercial, "sellableGpuHours") || numeric(allocatedGpuHours)
  };
}

function normalizeSlo(slo = {}) {
  return {
    priority: String(slo.priority || "p3"),
    targetStartMinutes: metric(slo, "targetStartMinutes"),
    targetEfficiency: metric(slo, "targetEfficiency"),
    supportTicketId: String(slo.supportTicketId || "")
  };
}

function normalizePlacement(placement) {
  if (Array.isArray(placement)) {
    return placement;
  }

  return makePlacement(placement?.nodes || [], placement?.partialNodes || []);
}

async function ingestJsonPayload(payload, sourceLabel, options = {}) {
  validateImportPayloadRoot(payload);

  if (isValidWorkspaceStore(payload)) {
    restoreWorkspaceStore(payload, restoredSourceLabel(sourceLabel));
    return;
  }

  const nextIngestion = buildIngestionFromExternalPayload(payload);
  replaceActiveIngestion(nextIngestion, sourceLabel, dataBoundaryForSourceLabel(sourceLabel, payload), options);
}

function buildIngestionFromExternalPayload(payload) {
  validateSourceArrays(payload);
  validateSourceSamples(payload);
  const sources = extractSourceExports(payload);
  const ncclTraces = extractNcclTraces(payload);
  const feed = extractIngestionFeed(payload, hasSourceExports(sources) || ncclTraces.length > 0);

  if (!isIngestionFeed(feed)) {
    throw new Error("Expected a turba.ingestion.v1 feed or source bundle.");
  }

  validateIngestionFeed(feed);

  if (!hasSourceExports(sources) && ncclTraces.length === 0) {
    return feed;
  }

  return applySourceImports(feed, sources, ncclTraces);
}

function parseImportJson(text, message) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(message);
  }
}

function parseImportUrl(value) {
  try {
    return new URL(value, window.location.href).href;
  } catch {
    throw new Error("API URL is not valid.");
  }
}

function importErrorMessage(error, fallback) {
  return error?.message || fallback;
}

function buildEvidencePackMarkdown({ summary, classifier, provider, opportunityEngine, schedulerSimulator, plan, exportedAt }) {
  const redactedKey = redactedSummaryKey(summary, plan);
  const redactedLabelValue = redactedSummaryLabel(summary, plan);
  const providerContext = redactedProviderContext(summary, plan);
  const opportunityRows = (opportunityEngine.opportunities || []).slice(0, 6);
  const simulatorRows = (schedulerSimulator?.scenarios || []).slice(0, 3);
  const recommendedScenario = schedulerSimulator?.recommended || simulatorRows[0];
  const schedulerEvidence = schedulerEvidenceSummaryLine(summary);
  const grafanaRows = redactedGrafanaRows(summary, plan).slice(0, 6);
  const sourceRows = redactedSourceRows(summary, plan).slice(0, 10);
  const savingsLedgerEvidence = buildSavingsLedgerEvidence(summary, plan);
  const cockpit = buildOperatorCockpitContext(summary, classifier, opportunityEngine, schedulerSimulator);
  const cockpitHeartbeats = cockpit.heartbeats || [];
  const cockpitTimeline = cockpit.timeline || [];
  const lines = [
    "# turbalance Evidence Pack",
    "",
    `Generated: ${formatAnalysisTime(exportedAt)}`,
    `Scope: ${scopeLabel(summary.scope)}`,
    `Selection: ${redactedLabelValue}`,
    `Selection key: ${redactedKey}`,
    `Window: ${state.window}`,
    `List rate: ${currency.format(state.rate)} / GPU-hour`,
    "",
    "## Executive Summary",
    "",
    `- Efficiency: ${pct(summary.usefulCompute)} useful compute from ${number.format(summary.allocatedGpuHours)} allocated GPU-hours.`,
    `- Waste: ${number.format(summary.wastedGpuHours)} GPU-hours, ${currency.format(summary.wasteDollars)} at the current list rate.`,
    `- Primary bottleneck: ${classifier.primary.name}; secondary: ${classifier.secondary.name}.`,
    `- Provider context: tenant ${providerContext.tenant}, account ${providerContext.account}, reservation ${providerContext.reservation}.`,
    `- Provider impact: ${currency.format(provider.sellableWasteValue)} sellable waste value; ${queueSloNote(provider)}.`,
    `- Opportunity upside: ${currency.format(opportunityEngine.totalImpactDollars)} and ${number.format(opportunityEngine.totalImpactGpuHours)} GPU-hours across ${opportunityRows.length} ranked actions.`,
    `- Savings ledger: ${currency.format(savingsLedgerEvidence.rollup.verifiedDollars)} and ${number.format(savingsLedgerEvidence.rollup.verifiedGpuHours)} GPU-hours verified recovered; realization ${savingsLedgerEvidence.rollup.realizationRate}%.`,
    recommendedScenario ? `- Scheduler what-if: ${recommendedScenario.label} projects ${currency.format(recommendedScenario.dollarUpside)} upside and ${number.format(recommendedScenario.recoveredGpuHours)} recovered GPU-hours.` : "",
    "",
    "## Top Opportunities",
    "",
    "| Rank | Category | Action | Impact | Confidence | Owner |",
    "| --- | --- | --- | --- | --- | --- |",
    ...opportunityRows.map((opportunity, index) => [
      index + 1,
      markdownCell(opportunity.category),
      markdownCell(opportunity.title),
      markdownCell(opportunityImpactLabel(opportunity)),
      markdownCell(pct(opportunity.confidence)),
      markdownCell(opportunity.owner || "Unassigned")
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |")),
    "",
    "## Evidence Details",
    "",
    ...opportunityRows.flatMap((opportunity, index) => [
      `### ${index + 1}. ${markdownText(opportunity.title)}`,
      "",
      `- Category: ${markdownText(opportunity.category)}`,
      `- Severity: ${titleCase(opportunity.severity)}`,
      `- Impact: ${opportunityImpactLabel(opportunity)}`,
      `- Confidence: ${pct(opportunity.confidence)}`,
      `- Evidence: ${markdownText(opportunity.evidence)}`,
      `- Recommendation: ${markdownText(opportunity.recommendation)}`,
      `- Owner: ${markdownText(opportunity.owner || "Unassigned")}`,
      ""
    ]),
    "## Scheduler / Capacity What-If",
    "",
    schedulerEvidence,
    "",
    "| Scenario | Dollar Upside | GPU-Hour Recovery | Queue Saved | Useful Compute | Action |",
    "| --- | --- | --- | --- | --- | --- |",
    ...simulatorRows.map((scenario) => [
      markdownCell(scenario.label),
      markdownCell(currency.format(scenario.dollarUpside)),
      markdownCell(number.format(scenario.recoveredGpuHours)),
      markdownCell(`${round(scenario.deltas.queueWaitMinutes)} min`),
      markdownCell(`${pct(scenario.projected.usefulCompute)} (${signedNumber(scenario.deltas.usefulCompute)} pts)`),
      markdownCell(scenario.action)
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |")),
    "",
    "## Verified Savings Ledger",
    "",
    savingsLedgerEvidence.rows.length > 0 ? `Rollup: ${currency.format(savingsLedgerEvidence.rollup.verifiedDollars)} / ${number.format(savingsLedgerEvidence.rollup.verifiedGpuHours)} GPU-hours verified recovered from ${savingsLedgerEvidence.rollup.verifiedCount} measured entries.` : "No savings-ledger entries attached for this selection.",
    "",
    ...(savingsLedgerEvidence.rows.length > 0 ? [
      "| Status | Attribution | Action | Category | Before | After | Delta | Evidence |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      ...savingsLedgerEvidence.rows.map((row) => [
        markdownCell(row.status),
        markdownCell(row.attribution),
        markdownCell(row.action),
        markdownCell(row.category),
        markdownCell(row.before),
        markdownCell(row.after),
        markdownCell(row.delta),
        markdownCell(row.evidence)
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"))
    ] : []),
    "",
    "## Grafana Handoff",
    "",
    ...(grafanaRows.length > 0 ? [
      "| Run | Dashboard | Datasource | Link | Time Range |",
      "| --- | --- | --- | --- | --- |",
      ...grafanaRows.map((row) => [
        markdownCell(row.run),
        markdownCell(row.dashboard),
        markdownCell(row.datasource),
        markdownCell(row.link),
        markdownCell(row.timeRange)
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"))
    ] : [
      "No Grafana handoff links attached for this selection."
    ]),
    "",
    "## Live Operator Cockpit",
    "",
    `- Data confidence: ${pct(cockpit.confidence?.score || 0)} (${cockpit.confidence?.label || "n/a"}).`,
    `- Kafka proof: ${cockpit.kafka?.messageId ? `message ${markdownText(cockpit.kafka.messageId)} on ${markdownText(cockpit.kafka.topic || "unknown topic")}` : markdownText(cockpit.kafka?.status || "not observed")}.`,
    `- Replay samples available: ${liveTelemetryHistory.length}.`,
    "",
    "| Source | Status | Note |",
    "| --- | --- | --- |",
    ...cockpitHeartbeats.map((source) => [
      markdownCell(source.label),
      markdownCell(source.status),
      markdownCell(source.note)
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |")),
    "",
    "| Time | Source | Event | Evidence |",
    "| --- | --- | --- | --- |",
    ...cockpitTimeline.map((event) => [
      markdownCell(event.time ? event.time.toISOString() : "n/a"),
      markdownCell(event.source),
      markdownCell(event.label),
      markdownCell(event.note)
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |")),
    "",
    "## Redacted Source Context",
    "",
    "| Run | Adapters | Tenant | Account | Reservation | Context |",
    "| --- | --- | --- | --- | --- | --- |",
    ...sourceRows.map((row) => [
      markdownCell(row.run),
      markdownCell(row.adapters),
      markdownCell(row.tenant),
      markdownCell(row.account),
      markdownCell(row.reservation),
      markdownCell(row.context)
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |")),
    "",
    "## Handling Notes",
    "",
    "- This pack preserves numeric evidence and recommendations while redacting run, tenant, account, reservation, provider, scheduler, Kubernetes, Grafana, and eBPF source identifiers.",
    "- Opportunity dollar values are prioritization estimates; categories can overlap and should not be summed as audited accounting.",
    "- Validate the top action against the underlying source system before making a customer or capacity commitment.",
    ""
  ];

  return `${lines.join("\n")}`;
}

function buildSavingsLedgerEvidence(summary, plan) {
  const emptyRollup = { verifiedDollars: 0, verifiedGpuHours: 0, verifiedCount: 0, modeledCount: 0, realizationRate: 0 };
  const ledger = Array.isArray(savingsLedger) ? savingsLedger : [];
  const scope = { type: summary.scope, key: summary.key };
  const rollup = typeof TurbaPredictive !== "undefined"
    ? TurbaPredictive.rollupLedger(ledger, { scope })
    : emptyRollup;
  const rows = ledger
    .filter((entry) => entry.scope?.type === scope.type && entry.scope?.key === scope.key)
    .slice()
    .sort((left, right) => new Date(right.verifiedAt || right.appliedAt || 0) - new Date(left.verifiedAt || left.appliedAt || 0))
    .slice(0, 8)
    .map((entry) => ({
      status: titleCase(entry.status),
      attribution: titleCase(entry.attribution),
      action: entry.actionTitle || entry.actionId,
      category: entry.category,
      before: `${entry.metric}: ${number.format(entry.baseline?.value || 0)}`,
      after: `${entry.metric}: ${number.format(entry.result?.value || 0)}`,
      delta: `${currency.format(entry.deltaDollars)} / ${number.format(entry.deltaGpuHours)} GPU-hours`,
      evidence: entry.evidenceRef ? "attached" : "n/a"
    }));
  return { rollup, rows };
}

function buildRedactionPlan(store) {
  const ingestion = store.ingestion || {};
  const runs = Array.isArray(ingestion.runs) ? ingestion.runs : [];
  const machineInventoryRuns = Array.isArray(store.machineInventory)
    ? store.machineInventory.map((record) => record?.run).filter(isPlainObject)
    : [];
  const sourceRuns = [...runs, ...machineInventoryRuns];
  const entities = ingestion.entities || {};
  const taskRecords = Array.isArray(store.taskHistory) ? store.taskHistory : [];
  const plan = {
    entities: {},
    runs: buildValueMap(sourceRuns.map((run) => run.id), "run"),
    taskKeys: buildValueMap(taskRecords.map((record) => record.taskKey), "task"),
    contracts: buildValueMap(sourceRuns.map((run) => run.commercial?.contractId), "contract"),
    tickets: buildValueMap(sourceRuns.map((run) => run.slo?.supportTicketId), "ticket"),
    namespaces: buildValueMap(sourceRuns.map((run) => run.sourceContext?.namespace), "namespace"),
    podSelectors: buildValueMap(sourceRuns.map((run) => run.sourceContext?.podSelector), "pod-selector"),
    slurmJobIds: buildValueMap(sourceRuns.map((run) => run.sourceContext?.slurmJobId), "slurm-job"),
    ebpfExports: buildValueMap(sourceRuns.map((run) => run.sourceContext?.ebpfExportId), "ebpf-export"),
    hosts: buildValueMap(sourceRuns.map((run) => run.sourceContext?.host), "host"),
    hostnames: buildValueMap(sourceRuns.map((run) => run.sourceContext?.hostname), "host"),
    nodes: buildValueMap(sourceRuns.map((run) => run.sourceContext?.node), "node"),
    networkAddresses: buildValueMap(flattenRunValues(sourceRuns, (run) => [
      run.sourceContext?.networkLocalAddress,
      run.sourceContext?.hostAddress,
      run.sourceContext?.primaryAddress,
      run.sourceContext?.ncclRuntimeHostIp,
      run.sourceContext?.ipAddress
    ]), "net-addr"),
    machineInventoryKeys: buildValueMap([
      ...(Array.isArray(store.machineInventory) ? store.machineInventory.map((record) => record?.key) : []),
      ...sourceRuns.map((run) => run.sourceContext?.machineInventoryKey)
    ], "machine"),
    podNames: buildValueMap(sourceRuns.map((run) => run.sourceContext?.podName), "pod"),
    containerNames: buildValueMap(sourceRuns.map((run) => run.sourceContext?.containerName), "container"),
    cgroupPaths: buildValueMap(sourceRuns.map((run) => run.sourceContext?.cgroupPath), "cgroup"),
    gpuProcessUsers: buildValueMap(flattenRunValues(sourceRuns, (run) => [
      ...(run.sourceContext?.gpuProcessOwners || []),
      ...((run.sourceContext?.gpuComputeProcesses || []).map((processEntry) => processEntry?.username)),
      ...((run.sourceContext?.gpuProcessInspector?.topProcesses || []).map((processEntry) => processEntry?.username)),
      run.sourceContext?.gpuProcessInspector?.largestProcess?.username
    ]), "gpu-user"),
    gpuProcessCommands: buildValueMap(flattenRunValues(sourceRuns, (run) => [
      ...((run.sourceContext?.gpuComputeProcesses || []).flatMap((processEntry) => [processEntry?.processName, processEntry?.command])),
      ...((run.sourceContext?.gpuProcessInspector?.topProcesses || []).flatMap((processEntry) => [processEntry?.processName, processEntry?.command])),
      run.sourceContext?.gpuProcessInspector?.largestProcess?.processName
    ]), "gpu-process"),
    providerExports: buildValueMap(sourceRuns.map((run) => run.sourceContext?.providerExportId), "provider-export"),
    billingAccounts: buildValueMap(sourceRuns.map((run) => run.sourceContext?.billingAccountId), "billing-account"),
    reservationWindows: buildValueMap(sourceRuns.map((run) => run.sourceContext?.reservationWindow), "reservation-window"),
    schedulerExports: buildValueMap(sourceRuns.map((run) => run.sourceContext?.schedulerExportId), "scheduler-export"),
    grafanaBaseUrls: buildValueMap(flattenRunValues(sourceRuns, (run) => [run.sourceContext?.grafanaBaseUrl, run.grafanaContext?.grafanaBaseUrl]), "grafana-base"),
    grafanaInstances: buildValueMap(flattenRunValues(sourceRuns, (run) => [run.sourceContext?.grafanaInstance, run.grafanaContext?.instanceName]), "grafana-instance"),
    grafanaOrgIds: buildValueMap(flattenRunValues(sourceRuns, (run) => [run.sourceContext?.grafanaOrgId, run.grafanaContext?.orgId]), "grafana-org"),
    grafanaDashboardUids: buildValueMap(flattenRunValues(sourceRuns, (run) => [run.sourceContext?.grafanaDashboardUid, run.grafanaContext?.dashboardUid]), "grafana-dashboard"),
    grafanaDashboardSlugs: buildValueMap(flattenRunValues(sourceRuns, (run) => [run.sourceContext?.grafanaDashboardSlug, run.grafanaContext?.dashboardSlug]), "grafana-slug"),
    grafanaDashboardTitles: buildValueMap(flattenRunValues(sourceRuns, (run) => [run.sourceContext?.grafanaDashboardTitle, run.grafanaContext?.dashboardTitle]), "grafana-title"),
    grafanaFolders: buildValueMap(flattenRunValues(sourceRuns, (run) => [run.sourceContext?.grafanaFolder, run.grafanaContext?.folder]), "grafana-folder"),
    grafanaDatasourceUids: buildValueMap(flattenRunValues(sourceRuns, (run) => [run.sourceContext?.grafanaDatasourceUid, run.grafanaContext?.datasourceUid]), "grafana-datasource"),
    grafanaDatasourceNames: buildValueMap(flattenRunValues(sourceRuns, (run) => [run.sourceContext?.grafanaDatasourceName, run.grafanaContext?.datasourceName]), "grafana-datasource-name"),
    grafanaUrls: buildValueMap(flattenRunValues(sourceRuns, (run) => [
      run.sourceContext?.grafanaDashboardUrl,
      run.sourceContext?.grafanaExploreUrl,
      run.grafanaContext?.dashboardUrl,
      run.grafanaContext?.exploreUrl,
      ...((run.grafanaContext?.links || []).map((link) => link?.url))
    ]), "grafana-url"),
    grafanaVariableValues: buildValueMap(flattenRunValues(sourceRuns, (run) => Object.values(run.grafanaContext?.variables || {})), "grafana-var"),
    redfishBaseUrls: buildValueMap(sourceRuns.map((run) => run.sourceContext?.redfishBaseUrl), "redfish-base"),
    redfishServiceUuids: buildValueMap(sourceRuns.map((run) => run.sourceContext?.redfishServiceUuid), "redfish-service"),
    redfishBiosVersions: buildValueMap(sourceRuns.map((run) => run.sourceContext?.redfishBiosVersion), "redfish-bios"),
    redfishManagerFirmwareVersions: buildValueMap(sourceRuns.map((run) => run.sourceContext?.redfishManagerFirmwareVersion), "redfish-manager-fw"),
    redfishSystems: buildValueMap(flattenRunValues(sourceRuns, (run) => run.sourceContext?.redfishSystems || []), "redfish-system"),
    redfishChassis: buildValueMap(flattenRunValues(sourceRuns, (run) => run.sourceContext?.redfishChassis || []), "redfish-chassis"),
    redfishManagers: buildValueMap(flattenRunValues(sourceRuns, (run) => run.sourceContext?.redfishManagers || []), "redfish-manager"),
    redfishFirmwareInventory: buildValueMap(flattenRunValues(sourceRuns, (run) => run.sourceContext?.redfishFirmwareInventory || []), "redfish-firmware"),
    schedulerNames: buildValueMap(flattenRunValues(sourceRuns, (run) => [run.sourceContext?.schedulerName, run.schedulerEvidence?.schedulerName, ...(run.schedulerEvidence?.schedulerNames || [])]), "scheduler"),
    schedulerQueues: buildValueMap(flattenRunValues(sourceRuns, (run) => [run.sourceContext?.queueName, run.schedulerEvidence?.queueName, ...(run.schedulerEvidence?.queueNames || [])]), "queue"),
    priorityClasses: buildValueMap(flattenRunValues(sourceRuns, (run) => [run.sourceContext?.priorityClass, run.schedulerEvidence?.priorityClass, ...(run.schedulerEvidence?.priorityClasses || [])]), "priority"),
    admissionClasses: buildValueMap(flattenRunValues(sourceRuns, (run) => [run.sourceContext?.admissionClass, run.schedulerEvidence?.admissionClass, ...(run.schedulerEvidence?.admissionClasses || [])]), "admission"),
    requestedGpuShapes: buildValueMap(flattenRunValues(sourceRuns, (run) => [run.sourceContext?.requestedGpuShape, run.schedulerEvidence?.requestedGpuShape, ...(run.schedulerEvidence?.requestedGpuShapes || [])]), "shape"),
    localityPreferences: buildValueMap(flattenRunValues(sourceRuns, (run) => [run.sourceContext?.localityPreference, run.schedulerEvidence?.localityPreference, ...(run.schedulerEvidence?.localityPreferences || [])]), "locality"),
    taskGpuModels: buildValueMap(flattenRunValues(taskRecords, (record) => record.resources?.gpuModels || []), "gpu-model"),
    taskClusters: buildValueMap(flattenRunValues(taskRecords, (record) => record.resources?.clusters || []), "cluster"),
    taskNodes: buildValueMap(flattenRunValues(taskRecords, (record) => record.resources?.nodes || []), "node"),
    taskTenants: buildValueMap(flattenRunValues(taskRecords, (record) => record.resources?.tenants || []), "tenant"),
    taskAccounts: buildValueMap(flattenRunValues(taskRecords, (record) => record.resources?.accounts || []), "account"),
    taskReservations: buildValueMap(flattenRunValues(taskRecords, (record) => record.resources?.reservations || []), "reservation"),
    taskHosts: buildValueMap(flattenRunValues(taskRecords, (record) => record.resources?.hosts || []), "host")
  };

  Object.entries(ENTITY_REDACTION_PREFIXES).forEach(([collection, prefix]) => {
    plan.entities[collection] = buildEntityValueMap(
      entities[collection] || {},
      sourceRuns.map((run) => run.refs?.[singularCollection(collection)]),
      prefix
    );
  });

  return plan;
}

function buildValueMap(values, prefix) {
  const map = new Map();
  values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .forEach((value) => {
      if (!map.has(value)) {
        map.set(value, `${prefix}-${map.size + 1}`);
      }
    });
  return map;
}

function buildEntityValueMap(entityMap, refValues, prefix) {
  const map = new Map();
  let index = 0;
  const addAlias = (value, redactedValue) => {
    const stringValue = String(value || "").trim();
    if (stringValue && !map.has(stringValue)) {
      map.set(stringValue, redactedValue);
    }
  };

  Object.entries(entityMap).forEach(([key, value]) => {
    index += 1;
    const redactedValue = `${prefix}-${index}`;
    addAlias(key, redactedValue);
    addAlias(value?.label, redactedValue);
  });

  refValues
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .forEach((value) => {
      if (!map.has(value)) {
        index += 1;
        map.set(value, `${prefix}-${index}`);
      }
    });

  return map;
}

function applyDashboardBlockVisibility() {
  const liveResourcePanel = document.querySelector("#liveResourcePanel");
  if (liveResourcePanel && !dashboardBlockEnabled("liveResources")) {
    liveResourcePanel.hidden = true;
  }

  toggleDashboardElement("#sourceHeartbeatStrip", "sourceHeartbeat");
  toggleDashboardElement("#liveTelemetryAlerts", "liveAlerts");
  toggleDashboardElement("#liveObservationLog", "liveObservationLog");
  toggleDashboardElement("#liveTelemetryGraphs", "liveTelemetryGraphs");

  document.querySelectorAll("[data-dashboard-block]").forEach((element) => {
    const blockId = element.dataset.dashboardBlock;
    element.hidden = !dashboardBlockEnabled(blockId);
  });
}

function buildEntries(scope) {
  const groups = new Map();

  jobs.forEach((job) => {
    const key = scope === "job" ? job.id : (job[scope] || "Unknown");
    const label = scope === "job" ? job.name : key;

    if (!groups.has(key)) {
      groups.set(key, { key, label, scope, items: [] });
    }

    groups.get(key).items.push(job);
  });

  const entries = Array.from(groups.values()).sort((a, b) => {
    if (scope === "job") {
      const missingDelta = Number(entryMachineInventoryMissing(a)) - Number(entryMachineInventoryMissing(b));
      if (missingDelta !== 0) return missingDelta;
    }
    const aWaste = summarizeEntry(a).wastedGpuHours;
    const bWaste = summarizeEntry(b).wastedGpuHours;
    return bWaste - aWaste;
  });

  if (scope === "job") {
    const fleetItems = fleetAggregateSourceItems(jobs);
    if (fleetItems.length >= 2) {
      entries.unshift({
        key: FLEET_AGGREGATE_KEY,
        label: FLEET_AGGREGATE_LABEL,
        scope,
        items: fleetItems,
        isFleetAggregate: true
      });
    }
  }

  return entries;
}

function summarizeEntry(entry) {
  const items = entry.items;
  const allocatedGpuHours = sum(items, "allocatedGpuHours");
  const weighted = (key) => weightedAverage(items, key, "allocatedGpuHours");
  const weightedBaseline = (key) => weightedAverage(items, (job) => job.baseline[key], "allocatedGpuHours");

  const summary = {
    key: entry.key,
    label: entry.label,
    scope: entry.scope,
    isFleetAggregate: Boolean(entry.isFleetAggregate),
    count: items.length,
    jobs: items,
    teams: unique(items.map((job) => job.team)),
    users: unique(items.map((job) => job.user)),
    models: unique(items.map((job) => job.model)),
    clusters: unique(items.map((job) => job.cluster)),
    tenants: knownLabels(items.map((job) => job.tenant), "Unassigned tenant"),
    accounts: knownLabels(items.map((job) => job.account), "Unassigned account"),
    reservations: knownLabels(items.map((job) => job.reservation), "No reservation"),
    gpuModels: unique(items.map((job) => job.gpuModel)),
    modelSpec: summarizeModelSpecFields(items),
    gpus: sum(items, "gpus"),
    allocatedGpuHours,
    gpuUtil: weighted("gpuUtil"),
    usefulCompute: weighted("usefulCompute"),
    smOccupancy: weighted("smOccupancy"),
    tensorCoreUtil: weighted("tensorCoreUtil"),
    ncclTime: weighted("ncclTime"),
    networkWait: weighted("networkWait"),
    networkUtilization: weighted("networkUtilization"),
    dataloaderStall: weighted("dataloaderStall"),
    storageWait: weighted("storageWait"),
    cpuPrep: weighted("cpuPrep"),
    hbmCapacity: weighted("hbmCapacity"),
    hbmBandwidth: weighted("hbmBandwidth"),
    memoryFragmentation: weighted("memoryFragmentation"),
    placementQuality: weighted("placementQuality"),
    crossRackTraffic: weighted("crossRackTraffic"),
    crossPodTraffic: weighted("crossPodTraffic"),
    idleGpus: sum(items, "idleGpus"),
    partialNodes: sum(items, "partialNodes"),
    queueWaitMinutes: weighted("queueWaitMinutes"),
    noiseEvents: sum(items, "noiseEvents"),
    contentionPct: weighted("contentionPct"),
    precisionLoss: weighted("precisionLoss"),
    batchInefficiency: weighted("batchInefficiency"),
    allToAllTime: weighted("allToAllTime"),
    stepRegularity: weighted("stepRegularity"),
    kvCachePressure: weighted("kvCachePressure"),
    latencyTail: weighted("latencyTail"),
    tokensM: sum(items, "tokensM"),
    steps: sum(items, "steps"),
    inferenceRequestsM: sum(items, "inferenceRequestsM"),
    baseline: {
      stepTime: weightedBaseline("stepTime"),
      currentStepTime: weightedBaseline("currentStepTime"),
      ncclTime: weightedBaseline("ncclTime"),
      gpuEfficiency: weightedBaseline("gpuEfficiency"),
      queueWaitMinutes: weightedBaseline("queueWaitMinutes"),
      costPerMillionTokens: weightedBaseline("costPerMillionTokens")
    },
    provider: summarizeProviderFields(items),
    slo: summarizeSloFields(items),
    schedulerEvidence: summarizeSchedulerEvidence(items),
    grafana: summarizeGrafanaContext(items),
    lakehouseTelemetry: entry.isFleetAggregate ? activeIngestion.lakehouseTelemetry || null : null,
    placement: mergePlacement(items),
    traceAttribution: mergeTraceAttribution(items),
    importedOpportunities: mergeImportedOpportunities(items),
    sourceItems: items
  };

  return finalizeSummary(summary);
}

function finalizeSummary(summary) {
  return analytics.finalizeSummary(summary, state.rate);
}

function applyPlacementWhatIf(summary) {
  return analytics.applyPlacementWhatIf(summary, state.samePod);
}

function buildOperatorCockpitContext(summary, classifier, opportunityEngine, schedulerSimulator) {
  const sourceItems = summary.sourceItems || [];
  const machineContext = machineDemoContext(summary);
  const contexts = sourceItems.map((item) => item.source?.context || {}).filter(isPlainObject);
  const adapters = unique(sourceItems.flatMap((item) => item.source?.adapters || []));
  const observedServices = unique([
    ...contexts.flatMap((context) => machineDemoServices(context.observedServices)),
    ...(machineContext ? machineDemoServices(machineContext.context.observedServices) : [])
  ]);
  const generatedAt = latestDate([
    ...contexts.map((context) => context.generatedAt),
    ...contexts.map((context) => context.kafkaSmokeTimestamp)
  ]);
  const ageMilliseconds = generatedAt ? Math.max(0, Date.now() - generatedAt.getTime()) : null;
  const ageSeconds = ageMilliseconds === null ? null : Math.round(ageMilliseconds / 1000);
  const visible = sourceItems.length > 0 || Boolean(machineContext);
  const kafka = buildOperatorKafkaState(contexts, observedServices, adapters);
  const heartbeats = buildOperatorHeartbeats({ summary, machineContext, adapters, observedServices, ageSeconds, ageMilliseconds, kafka });
  const confidence = buildOperatorConfidence(heartbeats, summary, machineContext);
  const timeline = buildOperatorTimeline({ summary, classifier, opportunityEngine, schedulerSimulator, machineContext, adapters, observedServices, generatedAt, ageMilliseconds, kafka, confidence });
  const grafana = buildOperatorGrafanaState(summary);
  const fleet = buildOperatorFleetTiles(summary, machineContext);
  const unitEconomics = buildUnitEconomicsState(summary, machineContext);
  const sparkComparison = buildSparkPairComparison(summary, machineContext);
  const fleetComparison = buildFleetComparison(summary, machineContext, platformVirtualSensorCache.systemIdentification);
  const benchmarkLadder = buildBenchmarkComparisonLadder(summary, machineContext, fleetComparison);
  const productReadiness = buildProductReadinessState({ summary, machineContext, ageMilliseconds, grafana, fleet, confidence });
  const autoDiscovery = buildAutoDiscoveryDeploymentState(summary, { fleet, machineContext, confidence });
  const executionIdle = buildExecutionIdleEnergyState(summary, machineContext);
  const gpuExporterCoverage = buildGpuExporterCoverageState(summary, machineContext);
  const backgroundTasks = buildBackgroundTasksState({
    summary,
    machineContext,
    generatedAt,
    ageMilliseconds,
    kafka,
    confidence,
    autoDiscovery,
    executionIdle,
    gpuExporterCoverage,
    fleetComparison,
    benchmarkLadder,
    productReadiness
  });
  const clusters = Array.isArray(summary.clusters) ? summary.clusters : [];
  const hostLabel = machineContext?.host || clusters[0] || summary.label || "current selection";

  return {
    visible,
    summary,
    machineContext,
    hostLabel,
    contexts,
    adapters,
    observedServices,
    generatedAt,
    ageSeconds,
    ageMilliseconds,
    kafka,
    heartbeats,
    confidence,
    timeline,
    grafana,
    autoDiscovery,
    executionIdle,
    gpuExporterCoverage,
    backgroundTasks,
    productReadiness,
    fleet,
    unitEconomics,
    sparkComparison,
    fleetComparison,
    benchmarkLadder,
    commands: buildOperatorCommands({ summary, machineContext, grafana, kafka })
  };
}

function buildOperatorHeartbeats({ summary, machineContext, adapters, observedServices, ageSeconds, ageMilliseconds, kafka }) {
  const contextItems = summary.sourceItems || [];
  const hasContextField = (field) => contextItems.some((item) => Boolean(item.source?.context?.[field]));
  const generatedFresh = ageMilliseconds === null || ageMilliseconds <= MACHINE_DEMO_FRESH_MS;
  const gb10Monitors = machineContext?.gb10Present ? machineContext.gb10MonitoringList : [];
  const sourceFlags = {
    host: Boolean(machineContext) || adapters.includes("local-machine") || adapters.includes("procfs") || adapters.includes("os-counters"),
    kubernetes: adapters.includes("kubernetes") || hasContextField("namespace") || hasContextField("podSelector"),
    prometheus: adapters.includes("prometheus"),
    dcgm: adapters.includes("dcgm"),
    "amd-dme": adapters.some((adapter) => /amd-dme|device-metrics|rocm/i.test(adapter))
      || contextItems.some((item) => gpuExporterContextHasAny(item.source?.context || {}, GPU_EXPORTER_METRIC_GROUPS.flatMap((group) => group.amd))),
    kafka: kafka.reachable,
    grafana: adapters.includes("grafana") || observedServices.includes("grafana") || numeric(summary.grafana?.sourceCount) > 0,
    docker: adapters.includes("docker") || observedServices.includes("docker"),
    ollama: observedServices.includes("ollama"),
    "node-exporter": observedServices.includes("node-exporter"),
    ebpf: adapters.includes("ebpf"),
    provider: adapters.includes("provider"),
    "nccl-trace": adapters.includes("nccl-trace") || adapters.includes("nccl-runtime") || Boolean(machineContext?.ncclRuntimePresent)
  };

  const sourceOrder = machineContext?.gb10Present
    ? [...OPERATOR_SOURCE_ORDER, ...GB10_OPERATOR_SOURCE_ORDER]
    : OPERATOR_SOURCE_ORDER;

  return sourceOrder.map((id) => {
    const gb10Monitor = gb10Monitors.find((item) => item.id === id);
    if (gb10Monitor) {
      const present = gb10MonitoringAvailable(gb10Monitor);
      const monitorStatus = gb10Monitor.status === "ready" ? "live" : gb10Monitor.status === "hooks-present" ? "attached" : gb10Monitor.status;
      const status = !present ? "missing" : monitorStatus === "live" ? "live" : monitorStatus === "attached" ? "attached" : "watch";
      return {
        id,
        label: operatorSourceLabel(id),
        status,
        present,
        fresh: present,
        ageSeconds,
        ageMilliseconds,
        note: gb10Monitor.detail || gb10Monitor.label,
        tone: status === "live" || status === "attached" ? "good" : status === "watch" ? "watch" : "poor"
      };
    }

    const present = Boolean(sourceFlags[id]);
    const ncclRuntimePresent = id === "nccl-trace" && Boolean(machineContext?.ncclRuntimePresent);
    const liveTimed = ["host", "kafka", "docker", "ollama", "node-exporter"].includes(id) || ncclRuntimePresent;
    const fresh = present && (!liveTimed || generatedFresh);
    const attached = present && !liveTimed;
    const status = !present ? "missing" : fresh ? "live" : attached ? "attached" : "stale";
    const note = operatorSourceNote({ id, present, status, ageMilliseconds, summary, machineContext, kafka, observedServices });

    return {
      id,
      label: operatorSourceLabel(id),
      status,
      present,
      fresh,
      ageSeconds,
      ageMilliseconds,
      note,
      tone: status === "live" || status === "attached" ? "good" : status === "stale" ? "watch" : "poor"
    };
  });
}

function buildOperatorConfidence(heartbeats, summary, machineContext) {
  const essential = heartbeats.filter((source) => ["host", "kubernetes", "prometheus", "dcgm", "kafka", "grafana"].includes(source.id));
  const sourceScore = essential.reduce((total, source) => {
    if (source.status === "live" || source.status === "attached") return total + 100;
    if (source.status === "stale") return total + 55;
    return total + 20;
  }, 0) / Math.max(1, essential.length);
  const workloadScore = clamp(
    40
    + (summary.gpus > 0 ? 15 : 0)
    + (summary.schedulerEvidence?.sourceCount > 0 ? 15 : 0)
    + (numeric(summary.grafana?.sourceCount) > 0 ? 10 : 0)
    + (machineContext?.workloadCountersObserved ? 10 : 0)
    + (summary.sourceItems?.length ? 10 : 0)
  );
  const score = clamp(sourceScore * 0.72 + workloadScore * 0.28);
  const missing = essential.filter((source) => source.status === "missing").map((source) => source.label);
  const stale = essential.filter((source) => source.status === "stale").map((source) => source.label);

  return {
    score,
    label: score >= 80 ? "High trust" : score >= 55 ? "Partial trust" : "Needs sources",
    missing,
    stale,
    sourceCount: heartbeats.filter((source) => source.present).length,
    totalSources: heartbeats.length,
    workloadScore,
    sourceScore
  };
}

function buildProductReadinessState({ summary, machineContext, ageMilliseconds, grafana, fleet, confidence }) {
  const baselineFleetHosts = 15;
  const observedHosts = unique([
    ...fleet.map((host) => host.host).filter(Boolean),
    ...(summary.sourceItems || []).map((item) => item.source?.context?.hostname).filter(Boolean)
  ]).length;
  const expectedFleetHosts = Math.max(baselineFleetHosts, observedHosts);
  const hostCoveragePct = clamp((observedHosts / expectedFleetHosts) * 100);
  const collectorRate = Number.isFinite(machineContext?.collectorIncomingReportsPerMinute)
    ? machineContext.collectorIncomingReportsPerMinute
    : null;
  const freshnessGood = ageMilliseconds === null || ageMilliseconds <= 120000;
  const freshnessWatch = ageMilliseconds === null || ageMilliseconds <= 300000;
  const grafanaReady = Boolean(grafana.links.length || machineContext?.context?.grafanaDashboardUrl);
  const apiAuthReady = Boolean(machineContext?.apiAuthRequired);
  const collectorAuthReady = Boolean(machineContext?.collectorAuthBearer || machineContext?.collectorAuthHmac || machineContext?.collectorAuthMtls);
  const mtlsReady = Boolean(machineContext?.collectorAuthMtls);
  const securityValue = apiAuthReady && collectorAuthReady
    ? mtlsReady ? "mTLS enabled" : "auth enabled"
    : apiAuthReady || collectorAuthReady ? "partial auth" : "lab defaults";
  const securityNote = apiAuthReady && collectorAuthReady
    ? mtlsReady
      ? "API auth and collector mTLS/HMAC controls are live"
      : "API and collector auth are live; add HTTPS/mTLS before broader customer access"
    : "Enable API auth, collector auth, and HTTPS/mTLS before customer access";
  const securityTone = apiAuthReady && collectorAuthReady && mtlsReady
    ? "good"
    : apiAuthReady || collectorAuthReady ? "watch" : "watch";
  const operationalRows = [
    {
      label: "Fleet visibility",
      value: `${observedHosts}/${expectedFleetHosts} hosts`,
      note: observedHosts >= expectedFleetHosts ? "Controller, SPARK, and Pi hosts are represented" : "Some expected hosts are missing from the live bundle",
      tone: observedHosts >= expectedFleetHosts ? "good" : observedHosts >= Math.ceil(expectedFleetHosts * 0.7) ? "watch" : "poor"
    },
    {
      label: "Telemetry freshness",
      value: ageMilliseconds === null ? "attached" : formatHostSampleAgeMilliseconds(ageMilliseconds),
      note: freshnessGood ? "Live sample is within the full-fleet collection window" : "Live sample is delayed; run doctor or check the fleet loop",
      tone: freshnessGood ? "good" : freshnessWatch ? "watch" : "poor"
    },
    {
      label: "Collector ingest",
      value: collectorRate === null ? "learning" : `${formatDecimal(collectorRate, collectorRate >= 100 ? 0 : 1)}/min`,
      note: machineContext?.collectorGatewayReachable ? "Collector gateway is reachable from the controller sample" : "Collector gateway reachability is not proven in the latest sample",
      tone: collectorRate !== null && collectorRate > 0 ? "good" : machineContext?.collectorGatewayReachable ? "watch" : "poor"
    },
    {
      label: "Observability handoff",
      value: grafanaReady ? "linked" : "missing",
      note: grafanaReady ? "Grafana/Prometheus handoff is discoverable from the dashboard" : "Provision Grafana runtime or attach dashboard URLs",
      tone: grafanaReady ? "good" : "watch"
    }
  ];
  const hardeningRows = [
    {
      label: "Support workflow",
      value: "available",
      note: "Use render-product-runtime, turbalance-doctor, and turbalance-support-bundle for pilot operations",
      tone: "good"
    },
    {
      label: "Security gate",
      value: securityValue,
      note: securityNote,
      tone: securityTone
    },
    {
      label: "Upgrade path",
      value: "rendered",
      note: "Use the product config plus rollout command for repeatable agent updates",
      tone: "good"
    }
  ];
  const rows = [...operationalRows, ...hardeningRows];
  const score = Math.round(rows.reduce((total, row) => total + (row.tone === "good" ? 100 : row.tone === "watch" ? 55 : 15), 0) / rows.length);
  const hardBlockers = rows.filter((row) => row.tone === "poor").length;
  const badge = hardBlockers ? "Needs repair" : score >= 82 ? "Pilot-ready" : "Hardening";
  return {
    score,
    badge,
    tone: hardBlockers ? "poor" : score >= 82 ? "good" : "watch",
    hostCoveragePct,
    rows
  };
}

function buildAutoDiscoveryDeploymentState(summary, { fleet, machineContext, confidence }) {
  const contexts = buildFleetMachineContexts(summary, machineContext);
  const observedHosts = uniqueBy(
    contexts.map((context) => {
      const raw = context.context || {};
      return {
        host: context.host || raw.hostname || raw.node || "host",
        address: raw.networkLocalAddress || raw.hostAddress || raw.primaryAddress || "",
        gpu: context.gpuModel || raw.gpuName || "unknown GPU",
        status: context.driverUnavailable ? "GPU telemetry blocked" : context.noGpu ? "host only" : context.idle ? "idle" : "live",
        tone: context.driverUnavailable ? "watch" : context.noGpu ? "watch" : "good"
      };
    }),
    (host) => normalizeFleetHostId(host.address || host.host)
  );
  const fallbackFleet = (fleet || []).map((host) => ({
    host: host.host,
    address: "",
    gpu: host.gpu,
    status: host.status,
    tone: host.tone
  }));
  const hosts = observedHosts.length ? observedHosts : fallbackFleet;
  const subnet = autoDiscoverySubnet(hosts);
  const controller = autoDiscoveryControllerAddress();
  const collectorUrl = `http://${controller}:8801/v1/source-bundles`;
  const hostUrl = `http://${controller}:8000`;
  const credentialsFile = "build/auto-discovery/credentials.local.json";
  const remoteRoot = "/home/user/turbalance-analytics";
  const baseCommand = [
    "python3",
    "scripts/auto-discover-deploy.py",
    "--subnet", subnet,
    "--user", "user",
    "--credentials-file", credentialsFile,
    "--collector-url", collectorUrl,
    "--host-url", hostUrl,
    "--remote-root", remoteRoot,
    "--systemd-mode", "user",
    "--benchmarks",
    "--out", "build/auto-discovery/latest-report.json"
  ];
  const dryRunCommand = baseCommand.map(shellCommandPart).join(" ");
  const applyCommand = [...baseCommand, "--apply"].map(shellCommandPart).join(" ");
  const confidenceScore = numeric(confidence?.score, 0);
  const tone = hosts.length && confidenceScore >= 55 ? "good" : hosts.length ? "watch" : "poor";
  const rows = [
    {
      label: "Subnet",
      value: subnet,
      note: `${hosts.length} live ${hosts.length === 1 ? "host" : "hosts"} currently in the bundle`,
      tone: hosts.length ? "good" : "watch"
    },
    {
      label: "Credential gate",
      value: credentialsFile,
      note: "SSH BatchMode must pass before deployment is eligible",
      tone: "watch"
    },
    {
      label: "Deployment",
      value: "dry-run first",
      note: "Apply command only targets credentialed, unmonitored hosts",
      tone: "good"
    },
    {
      label: "Collector",
      value: collectorUrl.replace(/^https?:\/\//, ""),
      note: "Live-machine agent posts source bundles to the controller",
      tone: "good"
    }
  ];

  return {
    badge: hosts.length ? `${hosts.length} observed` : "Waiting",
    tone,
    subnet,
    controller,
    collectorUrl,
    hostUrl,
    credentialsFile,
    remoteRoot,
    dryRunCommand,
    applyCommand,
    rows,
    hosts
  };
}

function buildExecutionIdleEnergyState(summary, machineContext) {
  const contexts = buildFleetMachineContexts(summary, machineContext).slice(0, FLEET_COMPARISON_HOST_LIMIT);
  const rows = contexts.map((context) => executionIdleHostRow(context)).filter(Boolean);
  const gpuRows = rows.filter((row) => row.gpuPresent);

  if (!gpuRows.length) {
    return {
      available: false,
      badge: "No GPU rows",
      tone: "watch",
      candidateCount: 0,
      estimatedWasteWatts: 0,
      estimatedWasteWattsLabel: "0 W",
      emptyText: contexts.length
        ? "Current fleet rows do not include usable GPU exporter power counters."
        : "Waiting for live machine rows before estimating execution-idle exposure.",
      summaries: [],
      rows: [],
      policyRows: []
    };
  }

  const candidateRows = gpuRows.filter((row) => row.isCandidate);
  const confirmedRows = candidateRows.filter((row) => row.confirmed);
  const possibleRows = candidateRows.filter((row) => row.state === "possible");
  const estimatedWasteWatts = candidateRows.reduce((total, row) => total + row.weightedWasteWatts, 0);
  const maxStreakSeconds = candidateRows
    .map((row) => row.streakSeconds)
    .filter(Number.isFinite)
    .reduce((best, value) => Math.max(best, value), 0);
  const topCause = executionIdleTopCause(candidateRows);
  const tone = confirmedRows.length || estimatedWasteWatts >= 120
    ? "poor"
    : candidateRows.length || estimatedWasteWatts >= 40 ? "watch" : "good";
  const badge = confirmedRows.length
    ? `${confirmedRows.length} confirmed`
    : candidateRows.length ? `${candidateRows.length} candidates` : `${gpuRows.length} watched`;

  const summaries = [
    {
      label: "Exposure",
      value: executionIdleWattsLabel(estimatedWasteWatts),
      note: `${executionIdleEnergyLabel((estimatedWasteWatts / 1000) * 24)} projected/day if sustained`,
      tone
    },
    {
      label: "Candidates",
      value: `${candidateRows.length}/${gpuRows.length}`,
      note: possibleRows.length ? `${possibleRows.length} process-state uncertain` : `${EXECUTION_IDLE_LOW_ACTIVITY_PCT}% activity gate`,
      tone: candidateRows.length ? tone : "good"
    },
    {
      label: "Duration gate",
      value: maxStreakSeconds ? `${round(maxStreakSeconds)}s` : `${EXECUTION_IDLE_SUSTAINED_SECONDS}s`,
      note: maxStreakSeconds >= EXECUTION_IDLE_SUSTAINED_SECONDS ? "sustained interval observed" : "waiting for sustained proof",
      tone: maxStreakSeconds >= EXECUTION_IDLE_SUSTAINED_SECONDS ? "poor" : candidateRows.length ? "watch" : "good"
    },
    {
      label: "Likely precursor",
      value: topCause.label,
      note: topCause.note,
      tone: topCause.tone
    }
  ];

  return {
    available: true,
    badge,
    tone,
    candidateCount: candidateRows.length,
    confirmedCount: confirmedRows.length,
    estimatedWasteWatts,
    estimatedWasteWattsLabel: executionIdleWattsLabel(estimatedWasteWatts),
    summaries,
    rows: gpuRows.sort(executionIdleRowSort).slice(0, 8),
    policyRows: executionIdlePolicyRows({ rows: gpuRows, candidateRows, estimatedWasteWatts, topCause })
  };
}

function buildGpuExporterCoverageState(summary, machineContext) {
  const contexts = buildFleetMachineContexts(summary, machineContext).slice(0, FLEET_COMPARISON_HOST_LIMIT);
  const hostCount = contexts.length;
  const adapters = unique([
    ...(summary.sourceAdapters || []),
    ...(summary.sourceItems || []).flatMap((item) => item.source?.adapters || []),
    ...contexts.flatMap((context) => String(context.adapters || "").split(",").map((entry) => entry.trim()).filter(Boolean))
  ]);

  if (!hostCount) {
    return {
      available: false,
      badge: "Waiting",
      tone: "watch",
      hostCount: 0,
      totalFamilies: GPU_EXPORTER_METRIC_GROUPS.length,
      coveredFamilies: 0,
      emptyText: "Waiting for source rows with GPU exporter metrics.",
      summaries: [],
      rows: [],
      policyRows: []
    };
  }

  const rows = GPU_EXPORTER_METRIC_GROUPS.map((group) => gpuExporterCoverageRow(group, contexts));
  const coveredFamilies = rows.filter((row) => row.coveredHosts > 0).length;
  const fullFamilies = rows.filter((row) => row.coveredHosts >= hostCount).length;
  const nvidiaFamilies = rows.filter((row) => row.nvidiaHosts > 0).length;
  const amdFamilies = rows.filter((row) => row.amdHosts > 0).length;
  const proofFamilies = rows.filter((row) => GPU_EXPORTER_EXECUTION_IDLE_GROUPS.includes(row.key) && row.coveredHosts > 0).length;
  const proofReady = proofFamilies >= 3;
  const hasPrometheus = adapters.some((adapter) => /prometheus|dcgm|grafana|amd|dme|device-metrics/i.test(adapter));
  const tone = proofReady && coveredFamilies >= 6
    ? "good"
    : proofReady || coveredFamilies >= 4 ? "watch" : "poor";
  const badge = amdFamilies && nvidiaFamilies
    ? "Cross-vendor"
    : amdFamilies ? "AMD map" : nvidiaFamilies ? "NVIDIA map" : `${coveredFamilies}/${GPU_EXPORTER_METRIC_GROUPS.length}`;

  const summaries = [
    {
      label: "Families",
      value: `${coveredFamilies}/${GPU_EXPORTER_METRIC_GROUPS.length}`,
      note: `${fullFamilies} complete across ${hostCount} ${hostCount === 1 ? "host" : "hosts"}`,
      tone: coveredFamilies >= 6 ? "good" : coveredFamilies >= 4 ? "watch" : "poor"
    },
    {
      label: "Vendor map",
      value: amdFamilies && nvidiaFamilies ? "NVIDIA + AMD" : amdFamilies ? "AMD DME" : nvidiaFamilies ? "NVIDIA" : "normalized",
      note: `${nvidiaFamilies} NVIDIA/DCGM | ${amdFamilies} AMD DME families visible`,
      tone: amdFamilies && nvidiaFamilies ? "good" : amdFamilies || nvidiaFamilies ? "watch" : "poor"
    },
    {
      label: "Idle proof",
      value: proofReady ? "ready" : `${proofFamilies}/4`,
      note: "power, activity, memory, and interconnect evidence for the paper detector",
      tone: proofReady ? "good" : proofFamilies >= 2 ? "watch" : "poor"
    },
    {
      label: "Handoff",
      value: hasPrometheus ? "attached" : "local only",
      note: hasPrometheus ? "Prometheus/Grafana exporter path observed" : "Use source export queries to attach raw exporter families",
      tone: hasPrometheus ? "good" : "watch"
    }
  ];

  const policyRows = [
    {
      label: "Normalize first",
      value: "one ontology",
      note: "Map DCGM, nvidia-smi exporter, and AMD DME into shared GPU fields before ranking hosts.",
      tone: "good"
    },
    {
      label: "Compare fairly",
      value: "family gates",
      note: "Only compare hosts at a benchmark level when the same metric families are present.",
      tone: coveredFamilies >= 6 ? "good" : "watch"
    },
    {
      label: "Energy research",
      value: proofReady ? "usable" : "partial",
      note: "Execution-idle analysis needs power plus low-activity proof and residency context.",
      tone: proofReady ? "good" : "watch"
    },
    {
      label: "Fleet rollout",
      value: "Prometheus",
      note: "AMD DME exposes :5000/metrics; NVIDIA DCGM defaults to :9400/metrics.",
      tone: hasPrometheus ? "good" : "watch"
    }
  ];

  return {
    available: true,
    badge,
    tone,
    hostCount,
    totalFamilies: GPU_EXPORTER_METRIC_GROUPS.length,
    coveredFamilies,
    nvidiaFamilies,
    amdFamilies,
    summaries,
    rows,
    policyRows
  };
}

function buildBackgroundTasksState({ summary, machineContext, generatedAt, ageMilliseconds, kafka, confidence, autoDiscovery, executionIdle, gpuExporterCoverage, fleetComparison, benchmarkLadder, productReadiness }) {
  const benchmarkMetrics = machineContext
    ? [
      machineContext.benchmarkCpuOpsPerSecond,
      machineContext.benchmarkGpuScore,
      machineContext.benchmarkMemoryMiBps,
      machineContext.benchmarkNetworkMbps,
      machineContext.benchmarkDiskReadMiBps,
      machineContext.benchmarkDiskWriteMiBps
    ].filter(Number.isFinite).length
    : 0;
  const liveFresh = ageMilliseconds === null || ageMilliseconds <= MACHINE_DEMO_FRESH_MS;
  const benchmarkAge = Number.isFinite(machineContext?.benchmarkSampleAgeMs)
    ? machineContext.benchmarkSampleAgeMs
    : machineContext?.benchmarkGeneratedAt ? Math.max(0, Date.now() - safeDate(machineContext.benchmarkGeneratedAt, new Date()).getTime()) : null;
  const benchmarkTtl = Number.isFinite(machineContext?.benchmarkTtlMs) ? machineContext.benchmarkTtlMs : null;
  const benchmarkFresh = benchmarkAge === null || benchmarkTtl === null || benchmarkAge <= benchmarkTtl;
  const systemIdStatus = platformVirtualSensorCache.inFlight
    ? "running"
    : platformVirtualSensorCache.systemIdentification?.status === "ready" ? "ready" : "waiting";
  const systemIdAge = platformVirtualSensorCache.fetchedAt ? Math.max(0, Date.now() - platformVirtualSensorCache.fetchedAt) : null;
  const collectorRate = Number.isFinite(machineContext?.collectorIncomingReportsPerMinute)
    ? machineContext.collectorIncomingReportsPerMinute
    : null;
  const collectorWindow = Number.isFinite(machineContext?.collectorIncomingReportsWindowSeconds)
    ? `${number.format(machineContext.collectorIncomingReportsWindowSeconds)}s window`
    : "metrics window learning";

  const tasks = [
    {
      id: "browser-live-refresh",
      label: "Browser live refresh",
      value: machineDemoLoadInFlight ? "fetching" : machineDemoRefreshTimer ? "running" : "manual",
      detail: machineContext
        ? liveFresh
          ? `${machineContext.host} sample ${ageMilliseconds === null ? "attached" : `${formatHostSampleAgeMilliseconds(ageMilliseconds)} old`}`
          : `${machineContext.host} sample is stale`
        : "Waiting for a live machine bundle",
      cadence: machineDemoRefreshTimer ? `${MACHINE_DEMO_REFRESH_MS / 1000}s poll` : "on demand",
      tone: machineContext ? liveFresh ? "good" : "watch" : "poor"
    },
    {
      id: "agent-ingest",
      label: "Agent ingest",
      value: collectorRate === null
        ? machineContext?.collectorGatewayReachable ? "reachable" : "waiting"
        : `${formatDecimal(collectorRate, collectorRate >= 100 ? 0 : 1)}/min`,
      detail: machineContext?.collectorGatewayReachable
        ? `${number.format(numeric(machineContext.collectorAcceptedBatchesTotal, 0))} accepted batches | ${collectorWindow}`
        : "Collector gateway has not been proven from the current bundle",
      cadence: "continuous push",
      tone: collectorRate !== null && collectorRate > 0 ? "good" : machineContext?.collectorGatewayReachable ? "watch" : "poor"
    },
    {
      id: "benchmark-suite",
      label: "Benchmark suite",
      value: machineContext?.benchmarkError
        ? "error"
        : benchmarkMetrics ? `${benchmarkMetrics} metrics` : machineContext?.benchmarkSuiteStatus || "waiting",
      detail: machineContext?.benchmarkError
        || (benchmarkAge === null ? "No benchmark sample attached yet" : `${sparkPairAgeLabel(benchmarkAge)} old | ${benchmarkLadder.available ? benchmarkLadder.badge : "ladder learning"}`),
      cadence: benchmarkTtl ? `${Math.max(1, Math.round(benchmarkTtl / 60000))}m TTL` : "timer/agent",
      tone: machineContext?.benchmarkError ? "poor" : benchmarkMetrics && benchmarkFresh ? "good" : benchmarkMetrics ? "watch" : "poor"
    },
    {
      id: "auto-discovery",
      label: "Auto discovery",
      value: autoDiscovery.badge,
      detail: `${autoDiscovery.subnet} | ${autoDiscovery.credentialsFile}`,
      cadence: "credential gated",
      tone: autoDiscovery.tone
    },
    {
      id: "execution-idle-watchdog",
      label: "Execution-idle watchdog",
      value: executionIdle.available ? executionIdle.badge : "learning",
      detail: executionIdle.available
        ? `${executionIdle.candidateCount} candidates | ${executionIdle.estimatedWasteWattsLabel} exposed`
        : executionIdle.emptyText,
      cadence: `${EXECUTION_IDLE_SUSTAINED_SECONDS}s sustained rule`,
      tone: executionIdle.available ? executionIdle.tone : "watch"
    },
    {
      id: "gpu-exporter-normalizer",
      label: "GPU exporter normalizer",
      value: gpuExporterCoverage.available ? gpuExporterCoverage.badge : "learning",
      detail: gpuExporterCoverage.available
        ? `${gpuExporterCoverage.coveredFamilies}/${gpuExporterCoverage.totalFamilies} metric families | ${gpuExporterCoverage.hostCount} hosts`
        : gpuExporterCoverage.emptyText,
      cadence: "on source import",
      tone: gpuExporterCoverage.available ? gpuExporterCoverage.tone : "watch"
    },
    {
      id: "clock-sync",
      label: "Clock discipline",
      value: machineContext?.clockPtpActive
        ? machineContext.clockPtpPortState || "PTP active"
        : machineContext?.clockSynchronized ? machineContext.clockSource || "synced" : "unsynced",
      detail: machineContext?.clockSyncDetail || machineContext?.clockPtpGrandmaster || "Clock status not observed",
      cadence: "continuous",
      tone: machineContext?.clockPtpActive || machineContext?.clockSynchronized ? "good" : machineContext?.clockPtpInstalled ? "watch" : "poor"
    },
    {
      id: "queue-smoke",
      label: "Queue smoke",
      value: kafka.messageId ? "round trip" : kafka.reachable ? "broker" : "waiting",
      detail: kafka.messageId || kafka.topic || kafka.nodePortBootstrap || kafka.status,
      cadence: "on demand",
      tone: kafka.messageId || kafka.reachable ? "good" : "watch"
    },
    {
      id: "system-id",
      label: "System-ID worker",
      value: systemIdStatus,
      detail: systemIdAge === null
        ? "Waiting for impulse/step/ramp/sine characterization"
        : `${sparkPairAgeLabel(systemIdAge)} since virtual sensor fetch`,
      cadence: "virtual sensor",
      tone: systemIdStatus === "ready" ? "good" : systemIdStatus === "running" ? "watch" : "watch"
    },
    {
      id: "comparison-engine",
      label: "Comparison engine",
      value: fleetComparison.available ? fleetComparison.badge : "learning",
      detail: productReadiness.badge === "Needs repair"
        ? "Product readiness is blocking confident comparison"
        : `${summary.sourceItems?.length || 0} source items | confidence ${pct(confidence.score)}`,
      cadence: "on render",
      tone: fleetComparison.available && confidence.score >= 55 ? "good" : confidence.score >= 55 ? "watch" : "poor"
    },
    {
      id: "replay-buffer",
      label: "Replay buffer",
      value: state.operatorReplay ? "playing" : `${liveTelemetryHistory.length} samples`,
      detail: liveTelemetryHistory.length
        ? `Keeps up to ${LIVE_TELEMETRY_LIMIT} in-browser telemetry samples`
        : "Waiting for live samples before replay is useful",
      cadence: "session local",
      tone: liveTelemetryHistory.length >= 2 ? "good" : "watch"
    }
  ];

  const counts = {
    running: tasks.filter((task) => task.tone === "good").length,
    watch: tasks.filter((task) => task.tone === "watch").length,
    blocked: tasks.filter((task) => task.tone === "poor").length
  };
  const tone = counts.blocked ? "poor" : counts.watch ? "watch" : "good";
  const badge = counts.blocked
    ? `${counts.blocked} blocked`
    : counts.watch ? `${counts.running} running` : "All running";
  const generatedLabel = generatedAt ? `${sparkPairAgeLabel(Math.max(0, Date.now() - generatedAt.getTime()))} data age` : "no live timestamp";

  return {
    badge,
    tone,
    generatedLabel,
    counts,
    tasks
  };
}

function buildOperatorTimeline({ summary, classifier, opportunityEngine, schedulerSimulator, machineContext, adapters, observedServices, generatedAt, ageMilliseconds, kafka, confidence }) {
  const events = [];
  const add = (event) => events.push({
    time: event.time instanceof Date ? event.time : (event.time ? safeDate(event.time, generatedAt || new Date()) : null),
    label: event.label,
    source: event.source,
    note: event.note,
    tone: event.tone || "watch"
  });
  const evidence = summary.schedulerEvidence || {};

  if (evidence.queuedAt) add({ time: evidence.queuedAt, source: "scheduler", label: "Workload queued", note: `${round(summary.queueWaitMinutes)} min queue estimate`, tone: "watch" });
  if (evidence.admittedAt) add({ time: evidence.admittedAt, source: "scheduler", label: "Admission accepted", note: listLabel(evidence.admissionClasses || [], 2), tone: "good" });
  if (evidence.startedAt) add({ time: evidence.startedAt, source: "kubernetes", label: "Pod started", note: listLabel(summary.placement?.nodes || [], 2), tone: "good" });
  if (adapters.includes("kubernetes")) add({ time: generatedAt, source: "kubernetes", label: "Kubernetes job observed", note: `${summary.gpus || 0} GPUs requested`, tone: "good" });
  if (kafka.reachable) add({ time: kafka.timestamp || generatedAt, source: "kafka", label: kafka.messageId ? "Kafka message round trip" : "Kafka broker reachable", note: kafka.messageId || kafka.nodePortBootstrap || "Broker port open", tone: "good" });
  if (adapters.includes("prometheus")) add({ time: generatedAt, source: "prometheus", label: "Prometheus sample imported", note: `${pct(summary.gpuUtil)} GPU utilization`, tone: "good" });
  if (adapters.includes("dcgm")) add({ time: generatedAt, source: "dcgm", label: "DCGM GPU counters imported", note: `${pct(summary.smOccupancy)} SM occupancy`, tone: "good" });
  if (summary.grafana?.links?.length) add({ time: generatedAt, source: "grafana", label: "Grafana handoff attached", note: summary.grafana.links[0].label || "Dashboard link", tone: "good" });
  if (machineContext) add({ time: generatedAt, source: "host", label: "Host sample refreshed", note: ageMilliseconds === null ? machineContext.adapters : `${formatHostSampleAgeMilliseconds(ageMilliseconds)} old | ${machineContext.adapters}`, tone: ageMilliseconds !== null && ageMilliseconds > 12000 ? "watch" : "good" });
  if (machineContext?.gb10Present) {
    const available = machineContext.gb10MonitoringList.filter(gb10MonitoringAvailable).length;
    const total = machineContext.gb10MonitoringList.length;
    add({ time: generatedAt, source: "gb10", label: "GB10 monitoring list refreshed", note: `${available}/${Math.max(1, total)} monitors available`, tone: available === total ? "good" : "watch" });
  }
  if (machineContext?.ollamaTelemetryAvailable) add({ time: generatedAt, source: "ollama", label: "Ollama generation probe", note: `${formatDecimal(machineContext.ollamaTokensPerSecond, 1)} tok/s | ${round(machineContext.ollamaTimeToFirstTokenMs)}ms TTFT`, tone: "good" });
  if (observedServices.length) add({ time: generatedAt, source: "services", label: "Local services checked", note: observedServices.join(", "), tone: "good" });
  if (classifier?.primary?.name) add({ time: generatedAt, source: "analyzer", label: "Analyzer classified bottleneck", note: classifier.primary.name, tone: summary.usefulCompute >= 60 ? "good" : "watch" });
  if (opportunityEngine?.opportunities?.[0]) add({ time: generatedAt, source: "opportunity", label: "Top action ranked", note: opportunityEngine.opportunities[0].title, tone: "watch" });
  if (schedulerSimulator?.recommended) add({ time: generatedAt, source: "simulator", label: "Capacity scenario ready", note: schedulerSimulator.recommended.label, tone: "good" });
  add({ time: generatedAt, source: "confidence", label: "Data confidence scored", note: `${pct(confidence.score)} | ${confidence.label}`, tone: confidence.score >= 80 ? "good" : confidence.score >= 55 ? "watch" : "poor" });
  if (state.operatorReplay) add({ time: new Date(), source: "replay", label: "Replay mode active", note: `${liveTelemetryHistory.length} samples available`, tone: "good" });

  return events
    .filter((event) => event.label)
    .sort((left, right) => numeric(left.time?.getTime(), 0) - numeric(right.time?.getTime(), 0))
    .slice(-12);
}

function buildOperatorKafkaState(contexts, observedServices, adapters) {
  const kafkaContext = contexts.find((context) => context.kafkaSmokeStatus || context.kafkaNodePortBootstrap || context.kafkaBootstrapServers) || {};
  const payload = parseMaybeJson(kafkaContext.kafkaSmokePayload);
  const messageId = kafkaContext.kafkaSmokeMessageId || payload.messageId || "";
  const timestamp = kafkaContext.kafkaSmokeTimestamp || payload.timestamp || "";

  return {
    reachable: observedServices.includes("kafka") || Boolean(kafkaContext.kafkaNodePortBootstrap) || adapters.includes("kafka"),
    bootstrapServers: kafkaContext.kafkaBootstrapServers || "spark1-kafka.turbalance-demo.svc.cluster.local:9092",
    nodePortBootstrap: kafkaContext.kafkaNodePortBootstrap || "192.168.10.20:30992",
    status: kafkaContext.kafkaSmokeStatus || (observedServices.includes("kafka") ? "broker reachable" : "not observed"),
    topic: kafkaContext.kafkaSmokeTopic || "",
    messageId,
    timestamp,
    processedMessages: numeric(kafkaContext.kafkaSmokeProcessedMessages),
    payload
  };
}

function buildOperatorGrafanaState(summary) {
  const links = summary.grafana?.links || [];
  return {
    links,
    dashboards: summary.grafana?.dashboards || [],
    datasources: summary.grafana?.datasources || [],
    instances: summary.grafana?.instances || [],
    timeRange: summary.grafana?.timeRange || {}
  };
}

function buildOperatorFleetTiles(summary, machineContext) {
  const selectedIdentity = state.scope === "job" ? jobSelectionIdentity(jobs.find((job) => job.id === state.selectedKey)) : "";
  const items = operatorFleetSourceItems(summary);
  if (!items.length && machineContext) {
    return [{
      key: state.scope === "job" ? state.selectedKey : "",
      host: machineContext.host,
      gpu: machineContext.gpuModel,
      services: machineDemoServices(machineContext.context.observedServices),
      status: machineContext.driverUnavailable ? "GPU telemetry blocked" : machineContext.noGpu ? "Host only" : machineContext.idle ? "GPU idle" : "Active",
      age: machineContext.context.generatedAt ? Math.max(0, Math.round((Date.now() - safeDate(machineContext.context.generatedAt, new Date()).getTime()) / 1000)) : null,
      tone: machineContext.driverUnavailable || machineContext.noGpu ? "watch" : "good",
      selected: true
    }];
  }

  return items.slice(0, FLEET_COMPARISON_HOST_LIMIT).map((item) => {
    const context = item.source?.context || {};
    const age = context.generatedAt ? Math.max(0, Math.round((Date.now() - safeDate(context.generatedAt, new Date()).getTime()) / 1000)) : null;
    const services = machineDemoServices(context.observedServices);
    const identity = jobSelectionIdentity(item);
    return {
      key: item.id || "",
      host: context.hostname || context.node || item.cluster || item.name,
      gpu: context.gpuName || item.gpuModel || "unknown GPU",
      services,
      status: item.status || "Observed",
      age,
      tone: age !== null && age > 12 ? "watch" : "good",
      selected: state.scope === "job" && (
        item.id === state.selectedKey
        || (identity && identity === selectedIdentity)
      )
    };
  });
}

function buildFleetComparison(summary, machineContext, characterization) {
  const contexts = buildFleetMachineContexts(summary, machineContext).slice(0, FLEET_COMPARISON_HOST_LIMIT);
  if (contexts.length < 2) {
    return {
      available: false,
      badge: contexts.length ? "Need peers" : "Waiting",
      tone: "watch",
      emptyText: contexts.length
        ? `Observed ${contexts[0].host}. Waiting for peer hosts in the live machine bundle.`
        : "Waiting for a live machine fleet bundle."
    };
  }

  const characterizations = fleetCharacterizationMap(characterization);
  const rows = contexts.map((context) => fleetHostSnapshot(context, characterizations.get(fleetHostKey(context))));
  assignFleetSignatureDistances(rows);
  const metricConfigs = fleetMetricConfigs();
  const spreadRows = metricConfigs
    .map((config) => fleetMetricSpread(config, rows))
    .filter(Boolean);
  assignFleetScores(rows, metricConfigs);
  rows.sort((left, right) => right.score - left.score || fleetNaturalLabel(left.host).localeCompare(fleetNaturalLabel(right.host), undefined, { numeric: true }));
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });
  const benchmarkHistograms = buildPiBenchmarkHistograms(rows);

  const outlierCount = rows.filter((row) => row.outlierCount > 0 || row.tone === "poor").length;
  const staleCount = rows.filter((row) => Number.isFinite(row.sampleAgeMs) && row.sampleAgeMs > MACHINE_DEMO_FRESH_MS).length;
  const fingerprintCount = rows.filter((row) => row.signatureMetricCount > 0).length;
  const benchmarkCount = rows.filter(fleetBenchmarkAvailable).length;
  const tone = staleCount > Math.max(1, rows.length * 0.25) || outlierCount > Math.max(2, rows.length * 0.35)
    ? "poor"
    : outlierCount || staleCount ? "watch" : "good";

  return {
    available: true,
    badge: outlierCount ? `${outlierCount} outliers` : `${rows.length} hosts`,
    tone,
    rows,
    spreadRows,
    benchmarkHistograms,
    summaries: fleetComparisonSummaries(rows, spreadRows, { outlierCount, staleCount, fingerprintCount, benchmarkCount })
  };
}

function buildUnitEconomicsState(summary, machineContext) {
  const contexts = buildFleetMachineContexts(summary, machineContext).slice(0, FLEET_COMPARISON_HOST_LIMIT);
  if (!contexts.length) {
    const fallbackContext = unitEconomicsFallbackContext(summary);
    if (fallbackContext) contexts.push(fallbackContext);
  }
  const rows = contexts
    .map((context, index) => unitEconomicsHostRow(context, index))
    .filter(Boolean);

  if (!rows.length) {
    return {
      available: false,
      badge: "Waiting",
      tone: "watch",
      rows: [],
      summaries: [],
      emptyText: "Waiting for live machine rows before calculating per-device economics."
    };
  }

  const totals = rows.reduce((accumulator, row) => {
    accumulator.profitPerHour += row.profitPerHour;
    accumulator.revenuePerHour += row.revenuePerHour;
    accumulator.opexPerHour += row.opexPerHour;
    accumulator.depreciationPerHour += row.depreciationPerHour;
    accumulator.costPerHour += row.costPerHour;
    accumulator.capexUsd += row.capexUsd;
    accumulator.bookValueUsd += row.bookValueUsd;
    return accumulator;
  }, {
    profitPerHour: 0,
    revenuePerHour: 0,
    opexPerHour: 0,
    depreciationPerHour: 0,
    costPerHour: 0,
    capexUsd: 0,
    bookValueUsd: 0
  });
  const estimatedRows = rows.filter((row) => row.estimated).length;
  const tone = totals.profitPerHour >= 0
    ? "good"
    : totals.profitPerHour > -Math.max(1, totals.costPerHour * 0.25) ? "watch" : "poor";

  return {
    available: true,
    badge: unitEconomicsSignedMoneyPerHour(totals.profitPerHour),
    tone,
    rows,
    totals,
    summaries: [
      {
        label: "Net P/L",
        value: unitEconomicsSignedMoneyPerHour(totals.profitPerHour),
        note: `${rows.length} ${rows.length === 1 ? "unit" : "units"} observed`,
        tone
      },
      {
        label: "Revenue",
        value: unitEconomicsMoneyPerHour(totals.revenuePerHour),
        note: `Rate input ${unitEconomicsMoneyPerHour(numeric(state.rate, 0)).replace("/hr", "/GPU-hr")}`,
        tone: totals.revenuePerHour >= totals.costPerHour ? "good" : "watch"
      },
      {
        label: "Loaded Cost",
        value: unitEconomicsMoneyPerHour(totals.costPerHour),
        note: `${unitEconomicsMoneyPerHour(totals.depreciationPerHour)} depreciation + ${unitEconomicsMoneyPerHour(totals.opexPerHour)} OPEX`,
        tone: "watch"
      },
      {
        label: "Input Quality",
        value: estimatedRows ? `${estimatedRows} estimated` : "reported",
        note: estimatedRows ? "CAPEX or OPEX defaults are visible per unit" : "Using reported finance fields",
        tone: estimatedRows ? "watch" : "good"
      }
    ]
  };
}

function buildBenchmarkComparisonLadder(summary, machineContext, fleetComparison) {
  const rows = benchmarkComparisonRows(summary, machineContext, fleetComparison);
  if (!rows.length) {
    return {
      available: false,
      badge: "Waiting",
      tone: "watch",
      emptyText: "Waiting for live machine benchmark samples."
    };
  }

  const target = benchmarkTargetRow(rows, machineContext);
  const metrics = benchmarkMetricConfigs().map((config) => benchmarkMetricState(target, rows, config));
  const availableMetricCount = metrics.filter((metric) => metric.available).length;
  const measuredMetricCount = metrics.filter((metric) => metric.status === "measured").length;
  const ocpCommons = benchmarkOcpCommonsProfile(target, metrics);
  const levels = [
    benchmarkSelfLevel(target, rows, metrics),
    benchmarkPeerLevel(target, rows, metrics),
    benchmarkGroupLevel("rack", "Rack", target, rows.filter((row) => row.rackKey && row.rackKey === target.rackKey), metrics, target.rackConfidence),
    benchmarkGroupLevel("cluster", "Cluster", target, rows.filter((row) => row.clusterKey && row.clusterKey === target.clusterKey), metrics, target.clusterConfidence),
    benchmarkGroupLevel("fleet", "Fleet", target, rows, metrics, "observed"),
    benchmarkGlobalLevel(target, metrics)
  ];
  const blockedLevels = levels.filter((level) => level.status !== "ready").length;
  const comparisonScore = benchmarkLevelScore(levels);
  const tone = availableMetricCount < 2 || blockedLevels >= 3
    ? "poor"
    : comparisonScore >= 92 ? "good" : comparisonScore >= 72 ? "watch" : "poor";

  return {
    available: true,
    badge: `${availableMetricCount}/5 metrics`,
    tone,
    target,
    rows,
    metrics,
    levels,
    measuredMetricCount,
    availableMetricCount,
    comparisonScore,
    ocpCommons,
    sourceLinks: benchmarkGlobalReferenceLinks()
  };
}

function buildMachineL1L6State(summary) {
  const machineContext = machineDemoContext(summary);
  const fleetComparison = buildFleetComparison(summary, machineContext, platformVirtualSensorCache.systemIdentification);
  const ladder = buildBenchmarkComparisonLadder(summary, machineContext, fleetComparison);
  const rows = ladder.rows || benchmarkComparisonRows(summary, machineContext, fleetComparison);
  const target = ladder.target || benchmarkTargetRow(rows, machineContext);

  if (!target) {
    return {
      available: false,
      badge: "Waiting",
      focusBadge: "No host",
      focusTitle: "Waiting for machine telemetry",
      tone: "watch",
      emptyText: "Waiting for live machine telemetry before building the L1-L6 comparison."
    };
  }

  const levels = ladder.levels || [
    benchmarkSelfLevel(target, rows, benchmarkMetricConfigs().map((config) => benchmarkMetricState(target, rows, config))),
    benchmarkWaitingLevel("peer", "2", "1:1", "Need another machine"),
    benchmarkWaitingLevel("rack", "3", "Rack", "Need peers in scope"),
    benchmarkWaitingLevel("cluster", "4", "Cluster", "Need peers in scope"),
    benchmarkWaitingLevel("fleet", "5", "Fleet", "Need peers in scope"),
    benchmarkGlobalLevel(target, benchmarkMetricConfigs().map((config) => benchmarkMetricState(target, rows, config)))
  ];
  const readyLevels = levels.filter((level) => level.status === "ready").length;
  const pressurePct = Math.max(
    numeric(target.cpuUsagePct, 0),
    numeric(target.memoryUsedPct, 0),
    numeric(target.diskUsedPct, 0),
    target.gpuPresent ? numeric(target.gpuUtilizationPct, 0) : 0
  );
  const gpuLabel = target.gpuPresent
    ? pct(target.gpuUtilizationPct)
    : "host only";
  const gpuDetail = target.gpuPresent
    ? firstString([target.machineContext?.gpuModel, target.machineContext?.context?.gpuName, "GPU telemetry"])
    : firstString([target.machineContext?.gpuModel, target.machineContext?.context?.gpuName, "No GPU counters"]);
  const focusTitle = `${target.host} L1-L6 comparison`;
  const tone = ladder.tone || target.tone || (readyLevels >= 4 ? "good" : readyLevels >= 2 ? "watch" : "poor");

  return {
    available: true,
    badge: `${readyLevels}/6 ready`,
    focusBadge: target.rank ? `Rank #${target.rank}` : "Single host",
    focusTitle,
    tone,
    target,
    rows,
    levels,
    readyLevels,
    ladder,
    fleetComparison,
    summaryCards: [
      {
        label: "Comparison",
        value: `${readyLevels}/6`,
        note: `${ladder.availableMetricCount || 0}/5 machine metrics available`,
        tone
      },
      {
        label: "Composite",
        value: `${round(target.score)}`,
        note: target.rank ? `rank #${target.rank} of ${rows.length}` : "single host baseline",
        tone: target.tone || tone
      },
      {
        label: "Pressure",
        value: pct(pressurePct),
        note: `${pct(target.cpuUsagePct)} CPU | ${pct(target.memoryUsedPct)} RAM | ${pct(target.diskUsedPct)} disk`,
        tone: inverseGrade(pressurePct, 72, 88).key
      },
      {
        label: "Accelerator",
        value: gpuLabel,
        note: gpuDetail,
        tone: target.gpuPresent ? grade(target.gpuUtilizationPct, 30, 70).key : "watch"
      },
      {
        label: "Network",
        value: fleetMbpsLabel(target.networkLinkSpeedMbps),
        note: `${formatBytesPerSecond(target.networkThroughputBps)} | ${number.format(target.networkIssueCount)} issues`,
        tone: target.networkIssueCount ? "watch" : "good"
      },
      {
        label: "Signature",
        value: fleetSignatureLabel(target.signatureDelta),
        note: target.signatureMetricCount ? `${target.signatureMetricCount} system-ID features` : "learning",
        tone: Number.isFinite(target.signatureDelta) ? inverseGrade(target.signatureDelta, 1.3, 2.5).key : "watch"
      }
    ]
  };
}

function buildLlmCustomerReportState(summary, classifier, opportunityEngine, schedulerSimulator) {
  const provider = providerEconomics(summary);
  const machine = buildMachineL1L6State(summary);
  const contextPacket = buildLlmReportContextPacket(summary, classifier, provider, opportunityEngine, schedulerSimulator, machine);
  const prompt = buildLlmCustomerReportPrompt(contextPacket);
  const promptFingerprint = llmReportContextFingerprint(contextPacket);
  const generation = state.llmReportGeneration || {};
  const generatedCurrent = generation.status === "complete"
    && generation.promptFingerprint === promptFingerprint
    && generation.text;
  const sections = generatedCurrent
    ? llmGeneratedReportSections(generation.text)
    : buildLlmCustomerReportSections(summary, classifier, provider, opportunityEngine, schedulerSimulator, machine);
  const evidence = buildLlmReportEvidence(summary, provider, opportunityEngine, machine, contextPacket);
  const confidence = llmReportConfidence(summary, machine, evidence);
  const generationMatches = generation.promptFingerprint === promptFingerprint;
  const tone = generation.status === "error" && generationMatches
    ? "poor"
    : generatedCurrent || confidence >= 78 ? "good" : confidence >= 55 ? "watch" : "poor";
  const badge = generation.status === "working" && generationMatches
    ? "Generating"
    : generation.status === "error" && generationMatches
      ? "LLM error"
      : generatedCurrent ? "LLM ready" : tone === "good" ? "Ready" : tone === "watch" ? "Review" : "Needs data";

  return {
    title: generatedCurrent && generation.model ? `${summary.label} customer report (${generation.model})` : `${summary.label} customer report`,
    badge,
    tone,
    confidence,
    sections,
    evidence,
    prompt,
    promptFingerprint,
    tokenEstimate: Math.ceil(prompt.length / 4),
    contextPacket,
    generation: {
      ...generation,
      current: Boolean(generationMatches)
    }
  };
}

function buildLlmReportContextPacket(summary, classifier, provider, opportunityEngine, schedulerSimulator, machine) {
  const normalizedRuns = jobs.map((job) => ({
    id: job.id,
    name: job.name,
    status: job.status,
    model: job.model,
    team: job.team,
    tenant: job.tenant,
    account: job.account,
    reservation: job.reservation,
    cluster: job.cluster,
    gpuModel: job.gpuModel,
    gpus: job.gpus,
    allocatedGpuHours: round(job.allocatedGpuHours),
    usefulCompute: round(job.usefulCompute),
    gpuUtil: round(job.gpuUtil),
    primaryContext: compactObject({
      hostname: job.source?.context?.hostname,
      node: job.source?.context?.node,
      generatedAt: job.source?.context?.generatedAt,
      gpuPresent: job.source?.context?.gpuPresent,
      gpuName: job.source?.context?.gpuName,
      cpuUsagePct: job.source?.context?.cpuUsagePct,
      memoryUsedPct: job.source?.context?.memoryUsedPct,
      networkUtilizationPct: job.source?.context?.networkUtilizationPct
    })
  }));
  const machinePayload = machine.available
    ? {
        focusHost: machine.target.host,
        readyLevels: machine.readyLevels,
        levels: machine.levels.map((level) => ({
          level: `L${level.level}`,
          label: level.label,
          scope: level.scope,
          value: level.value,
          status: level.status,
          signal: level.detail
        })),
        fleetRows: machine.rows.map((row) => ({
          host: row.host,
          rank: row.rank,
          score: round(row.score),
          tone: row.tone,
          outliers: row.outlierLabels,
          cpuUsagePct: round(row.cpuUsagePct),
          memoryUsedPct: round(row.memoryUsedPct),
          diskUsedPct: round(row.diskUsedPct),
          gpuPresent: row.gpuPresent,
          gpuUtilizationPct: round(row.gpuUtilizationPct),
          networkLinkSpeedMbps: round(row.networkLinkSpeedMbps),
          signatureDelta: Number.isFinite(row.signatureDelta) ? Number(formatDecimal(row.signatureDelta, 2)) : null
        }))
      }
    : { status: "waiting", detail: machine.emptyText };

  return {
    generatedAt: dateIso(state.lastAnalysis || new Date()),
    pageScope: {
      scope: summary.scope,
      key: summary.key,
      label: summary.label,
      window: state.window,
      dataBoundary: normalizeDataBoundary(state.dataBoundary, activeIngestion)
    },
    summary: {
      count: summary.count,
      teams: summary.teams,
      tenants: summary.tenants,
      accounts: summary.accounts,
      reservations: summary.reservations,
      clusters: summary.clusters,
      gpuModels: summary.gpuModels,
      gpus: round(summary.gpus),
      allocatedGpuHours: round(summary.allocatedGpuHours),
      usefulGpuHours: round(summary.usefulGpuHours),
      wastedGpuHours: round(summary.wastedGpuHours),
      wasteDollars: round(summary.wasteDollars),
      usefulCompute: round(summary.usefulCompute),
      gpuUtil: round(summary.gpuUtil),
      mfuPct: round(summary.mfuPct),
      hfuPct: round(summary.hfuPct),
      costPerUsefulGpuHour: round(summary.costPerUsefulGpuHour),
      queueWaitMinutes: round(summary.queueWaitMinutes),
      placementQuality: round(summary.placementQuality),
      networkUtilization: round(summary.networkUtilization),
      ncclTime: round(summary.ncclTime),
      hbmCapacity: round(summary.hbmCapacity)
    },
    bottlenecks: {
      primary: classifier.primary,
      secondary: classifier.secondary,
      scores: classifier.scores
    },
    provider: {
      sellableWasteValue: round(provider.sellableWasteValue),
      queueSloPct: round(provider.queueSloPct),
      queueSloGapMinutes: round(provider.queueSloGapMinutes),
      grossMarginPct: round(provider.grossMarginPct),
      grossMargin: round(provider.grossMargin),
      reservationBurnPct: round(provider.reservationBurnPct),
      billingModels: provider.billingModels
    },
    opportunities: {
      totalImpactDollars: round(opportunityEngine.totalImpactDollars),
      totalImpactGpuHours: round(opportunityEngine.totalImpactGpuHours),
      openCount: opportunityEngine.opportunities.length,
      top: opportunityEngine.opportunities.slice(0, 5).map((opportunity) => ({
        title: opportunity.title,
        category: opportunity.category,
        impactDollars: round(opportunity.impactDollars),
        impactGpuHours: round(opportunity.impactGpuHours),
        confidence: round(opportunity.confidence),
        recommendation: opportunity.recommendation
      }))
    },
    scheduler: {
      recommendedScenario: schedulerSimulator.recommended?.label || "",
      scenarios: (schedulerSimulator.scenarios || []).slice(0, 4).map((scenario) => ({
        label: scenario.label,
        confidence: round(scenario.confidence),
        dollarUpside: round(scenario.dollarUpside),
        evidence: scenario.evidence
      }))
    },
    machine: machinePayload,
    history: {
      snapshots: snapshotHistory.slice(-12),
      taskRecords: taskHistory.slice(-12),
      savingsLedger: savingsLedger.slice(-12),
      actionExecutions: actionExecutionHistory.slice(-12)
    },
    normalizedRuns
  };
}

function buildLlmCustomerReportPrompt(packet) {
  const contextJson = JSON.stringify(packet, null, 2);
  const boundedContext = contextJson.length <= LLM_REPORT_MAX_CONTEXT_CHARS
    ? contextJson
    : `${contextJson.slice(0, LLM_REPORT_MAX_CONTEXT_CHARS)}\n...TRUNCATED_FOR_CONTEXT_WINDOW...`;
  return [
    "You are the turbalance customer report analyst.",
    "Use only the facts in CONTEXT_JSON. Do not invent hardware, customer names, savings, or remediation status.",
    "Write a concise customer-facing report with: executive summary, observed evidence, business impact, machine comparison, and next actions.",
    "Separate demo/sample data caveats from live/imported evidence.",
    "CONTEXT_JSON:",
    boundedContext
  ].join("\n");
}

function llmPromptFingerprint(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function llmReportContextFingerprint(packet) {
  return llmPromptFingerprint(JSON.stringify(stableLlmReportFingerprintValue(packet)));
}

function stableLlmReportFingerprintValue(value, key = "") {
  if (isVolatileLlmReportFingerprintKey(key)) return undefined;
  if (Array.isArray(value)) {
    return value
      .map((item) => stableLlmReportFingerprintValue(item))
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((stable, childKey) => {
        const childValue = stableLlmReportFingerprintValue(value[childKey], childKey);
        if (childValue !== undefined) stable[childKey] = childValue;
        return stable;
      }, {});
  }
  return value;
}

function isVolatileLlmReportFingerprintKey(key) {
  return [
    "age",
    "ageSeconds",
    "capturedAt",
    "generatedAt",
    "lastAnalysisAt",
    "lastSeenAt",
    "savedAt",
    "timestamp",
    "timestampMs",
    "updatedAt"
  ].includes(key);
}

function llmGeneratedReportSections(text) {
  const lines = String(text || "").split(/\r?\n/);
  const sections = [];
  let current = { title: "LLM Report", body: [] };

  lines.forEach((line) => {
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      if (current.body.join("\n").trim()) sections.push(current);
      current = { title: heading[1].replace(/\*+/g, "").trim() || "LLM Report", body: [] };
      return;
    }
    current.body.push(line);
  });
  if (current.body.join("\n").trim()) sections.push(current);

  return (sections.length ? sections : [{ title: "LLM Report", body: [String(text || "").trim()] }])
    .map((section) => ({
      title: section.title,
      body: section.body.join("\n").trim().replace(/\n{3,}/g, "\n\n"),
      tone: "good"
    }));
}

function buildLlmCustomerReportSections(summary, classifier, provider, opportunityEngine, schedulerSimulator, machine) {
  const primary = classifier.primary.name.replace("-bound", "").toLowerCase();
  const secondary = classifier.secondary.name.replace("-bound", "").toLowerCase();
  const topOpportunity = opportunityEngine.opportunities[0];
  const machineSentence = machine.available
    ? `${machine.target.host} is the focus host for L1-L6 comparison with ${machine.readyLevels}/6 levels ready and a composite score of ${round(machine.target.score)}.`
    : "Machine-level comparison is waiting for live machine telemetry or a fleet bundle.";
  const providerSentence = hasProviderContext(summary)
    ? `The provider view estimates ${currency.format(provider.sellableWasteValue)} of sellable waste value, ${pct(provider.queueSloPct)} queue SLO attainment, and ${pct(provider.grossMarginPct)} gross margin.`
    : "Provider commercial context is not fully attached, so financial framing uses the current list-rate input.";

  return [
    {
      title: "Executive Summary",
      tone: grade(summary.usefulCompute, 55, 72).key,
      body: `${summary.label} is operating at ${pct(summary.usefulCompute)} useful accelerator efficiency over ${state.window.toLowerCase()}, using ${number.format(summary.allocatedGpuHours)} allocated GPU-hours and ${number.format(summary.usefulGpuHours)} useful GPU-hours. The dominant constraint is ${primary}, with ${secondary} as the next limiting factor.`
    },
    {
      title: "Customer Impact",
      tone: provider.sellableWasteValue > 0 || summary.wasteDollars > 0 ? "watch" : "good",
      body: `${number.format(summary.wastedGpuHours)} GPU-hours are currently classified as waste, worth about ${currency.format(summary.wasteDollars)} at the active rate. ${providerSentence}`
    },
    {
      title: "Machine L1-L6",
      tone: machine.tone,
      body: machineSentence
    },
    {
      title: "Recommended Action",
      tone: topOpportunity ? (topOpportunity.confidence >= 75 ? "good" : "watch") : "watch",
      body: topOpportunity
        ? `${topOpportunity.title}: ${topOpportunity.recommendation} Expected modeled impact is ${currency.format(topOpportunity.impactDollars)} and ${number.format(topOpportunity.impactGpuHours)} GPU-hours.`
        : recommendationFor(summary, classifier)
    },
    {
      title: "Operating Plan",
      tone: schedulerSimulator.recommended ? "good" : "watch",
      body: schedulerSimulator.recommended
        ? `${schedulerSimulator.recommended.label} is the current scheduler scenario, with ${pct(schedulerSimulator.recommended.confidence)} confidence and ${currency.format(schedulerSimulator.recommended.dollarUpside)} modeled upside.`
        : "Scheduler what-if data is still learning for this scope."
    }
  ];
}

function buildLlmReportEvidence(summary, provider, opportunityEngine, machine, packet) {
  return [
    {
      label: "Scope",
      value: scopeLabel(summary.scope),
      note: `${summary.label} | ${summary.count} ${summary.count === 1 ? "record" : "records"}`,
      tone: "good"
    },
    {
      label: "Efficiency",
      value: pct(summary.usefulCompute),
      note: `${pct(summary.gpuUtil)} GPU util | ${pct(summary.mfuPct)} MFU`,
      tone: grade(summary.usefulCompute, 55, 72).key
    },
    {
      label: "Waste",
      value: currency.format(summary.wasteDollars),
      note: `${number.format(summary.wastedGpuHours)} GPU-hours`,
      tone: summary.wastedGpuHours > 0 ? "watch" : "good"
    },
    {
      label: "Provider",
      value: currency.format(provider.sellableWasteValue),
      note: `${pct(provider.queueSloPct)} queue SLO | ${pct(provider.reservationBurnPct)} reservation burn`,
      tone: hasProviderContext(summary) ? "good" : "watch"
    },
    {
      label: "Machine",
      value: machine.available ? `${machine.readyLevels}/6` : "waiting",
      note: machine.available ? `${machine.target.host} | ${machine.rows.length} hosts` : "no live fleet bundle",
      tone: machine.tone
    },
    {
      label: "Actions",
      value: `${opportunityEngine.opportunities.length}`,
      note: `${currency.format(opportunityEngine.totalImpactDollars)} modeled impact`,
      tone: opportunityEngine.opportunities.length ? "watch" : "good"
    },
    {
      label: "History",
      value: `${packet.history.snapshots.length}`,
      note: `${packet.history.taskRecords.length} task records | ${packet.history.savingsLedger.length} ledger entries`,
      tone: packet.history.snapshots.length >= 2 ? "good" : "watch"
    },
    {
      label: "Sources",
      value: `${packet.normalizedRuns.length}`,
      note: listLabel(unique(packet.normalizedRuns.flatMap((run) => Object.keys(run.primaryContext || {}))), 2),
      tone: packet.normalizedRuns.length ? "good" : "watch"
    }
  ];
}

function llmReportConfidence(summary, machine, evidence) {
  const sourceScore = Math.min(100, Math.max(20, (summary.sourceItems?.length || 0) * 16));
  const historyScore = Math.min(100, snapshotHistory.length * 18 + taskHistory.length * 8);
  const machineScore = machine.available ? Math.min(100, 35 + machine.readyLevels * 11) : 35;
  const providerScore = hasProviderContext(summary) ? 84 : 48;
  const evidenceScore = Math.min(100, evidence.filter((item) => item.tone !== "poor").length * 12);

  return clamp(
    sourceScore * 0.24
    + historyScore * 0.18
    + machineScore * 0.22
    + providerScore * 0.18
    + evidenceScore * 0.18
  );
}

function buildFleetMachineContexts(summary, machineContext) {
  const items = operatorFleetSourceItems(summary);
  const contexts = items
    .map((item) => machineContextFromSourceItem(summary, item))
    .filter(Boolean);

  if (!contexts.length && machineContext) contexts.push(machineContext);

  return uniqueBy(contexts, fleetHostKey)
    .sort(fleetHostContextSort);
}

function normalizeFleetHostId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^pi@/, "")
    .replace(/[^a-z0-9]+/g, "");
}

function buildPiBenchmarkHistograms(rows) {
  const piRows = rows
    .filter(isPiFleetRow)
    .sort((left, right) => fleetNaturalLabel(left.host).localeCompare(fleetNaturalLabel(right.host), undefined, { numeric: true }));
  if (piRows.length < 2) return [];

  return fleetBenchmarkMetricConfigs()
    .map((config) => fleetBenchmarkHistogram(config, piRows));
}

function buildSparkPairComparison(summary, machineContext) {
  const contexts = buildSparkPairMachineContexts(summary, machineContext);
  const pair = selectSparkPairContexts(contexts);

  if (pair.length < 2) {
    const observed = contexts.map((context) => context.host).filter(Boolean);
    return {
      available: false,
      badge: observed.length ? "Need peer" : "Waiting",
      tone: "watch",
      hosts: contexts,
      rows: [],
      summaries: [],
      emptyText: observed.length
        ? `Observed ${observed.join(", ")}. Waiting for the other SPARK host in the live machine bundle.`
        : "Waiting for SPARK1 and SPARK2 live machine samples."
    };
  }

  const [left, right] = pair;
  const leftLabel = sparkPairHostLabel(left, "SPARK1");
  const rightLabel = sparkPairHostLabel(right, "SPARK2");
  const rows = buildSparkPairMetricRows(left, right);
  const clockHistory = recordSparkPairClockSample(left, right);
  const poorCount = rows.filter((row) => row.tone === "poor").length;
  const watchCount = rows.filter((row) => row.tone === "watch").length;
  const tone = poorCount > 0 ? "poor" : watchCount > 0 ? "watch" : "good";
  const badge = tone === "good" ? "Balanced" : tone === "poor" ? "Skewed" : "Watch skew";

  return {
    available: true,
    badge,
    tone,
    hosts: pair,
    leftLabel,
    rightLabel,
    rows,
    clockHistory,
    summaries: buildSparkPairSummaries(left, right, rows)
  };
}

function buildSparkPairMachineContexts(summary, machineContext) {
  return buildFleetMachineContexts(summary, machineContext)
    .sort((left, right) => sparkPairContextRank(left) - sparkPairContextRank(right));
}

function buildSparkPairMetricRows(left, right) {
  const rows = [];
  const leftAge = sparkPairSampleAgeMilliseconds(left);
  const rightAge = sparkPairSampleAgeMilliseconds(right);
  const leftContainerCpu = sparkPairDockerCpuPct(left);
  const rightContainerCpu = sparkPairDockerCpuPct(right);

  rows.push(sparkPairNumericMetric({
    id: "sample-age",
    label: "Sample age",
    leftValue: leftAge,
    rightValue: rightAge,
    formatter: sparkPairAgeLabel,
    deltaFormatter: (_delta, absDelta) => sparkPairAgeLabel(absDelta),
    note: "Live bundle freshness",
    watchDelta: 5000,
    poorDelta: 15000,
    maxValue: MACHINE_DEMO_FRESH_MS,
    toneFn: (leftValue, rightValue, absDelta) => {
      if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return "watch";
      if (leftValue > MACHINE_DEMO_FRESH_MS || rightValue > MACHINE_DEMO_FRESH_MS) return "poor";
      return sparkPairDeltaTone(absDelta, 5000, 15000);
    }
  }));
  rows.push(sparkPairClockSyncMetric(left, right));
  rows.push(sparkPairSampleSkewMetric(left, right));
  rows.push(sparkPairClockOffsetMetric(left, right));
  rows.push(sparkPairPercentMetric("cpu", "CPU", left.cpuUsagePct, right.cpuUsagePct, "Host CPU pressure", 10, 25));
  rows.push(sparkPairPercentMetric("ram", "RAM", left.memoryUsedPct, right.memoryUsedPct, "Host memory pressure", 8, 18));
  rows.push(sparkPairPercentMetric("uma-memory", "UMA memory", left.linuxUmaMemoryUsedPct, right.linuxUmaMemoryUsedPct, "Linux UMA memory", 8, 18, left.gb10Present || right.gb10Present));
  rows.push(sparkPairPercentMetric("gpu", "GPU util", left.gpuUtilizationPct, right.gpuUtilizationPct, "Accelerator utilization", 12, 28));
  rows.push(sparkPairPercentMetric("gpu-memory", "GPU memory", left.gpuMemoryUsedPct, right.gpuMemoryUsedPct, "HBM allocation", 6, 15));
  rows.push(sparkPairNumericMetric({
    id: "gpu-power",
    label: "GPU power",
    leftValue: left.gpuPowerWatts,
    rightValue: right.gpuPowerWatts,
    formatter: (value) => Number.isFinite(value) && value > 0 ? `${round(value)} W` : "--",
    deltaFormatter: (delta) => sparkPairSignedDelta(delta, " W"),
    note: "Board power draw",
    watchDelta: 35,
    poorDelta: 80,
    maxValue: Math.max(450, left.gpuPowerWatts, right.gpuPowerWatts)
  }));
  rows.push(sparkPairNumericMetric({
    id: "gpu-temp",
    label: "GPU temp",
    leftValue: left.gpuTemperatureC,
    rightValue: right.gpuTemperatureC,
    formatter: (value) => Number.isFinite(value) && value > 0 ? `${round(value)} C` : "--",
    deltaFormatter: (delta) => sparkPairSignedDelta(delta, " C"),
    note: "Thermal spread",
    watchDelta: 5,
    poorDelta: 12,
    maxValue: 100
  }));
  rows.push(sparkPairPercentMetric(
    "network-util",
    "Network util",
    left.networkUtilizationPct,
    right.networkUtilizationPct,
    sparkPairNetworkNote(left, right),
    10,
    25,
    Number.isFinite(left.networkUtilizationPct) || Number.isFinite(right.networkUtilizationPct)
  ));
  rows.push(sparkPairThroughputMetric("network-rx", "Network RX", left.networkRxBytesPerSecond, right.networkRxBytesPerSecond, sparkPairNetworkNote(left, right)));
  rows.push(sparkPairThroughputMetric("network-tx", "Network TX", left.networkTxBytesPerSecond, right.networkTxBytesPerSecond, sparkPairNetworkNote(left, right)));
  rows.push(sparkPairNumericMetric({
    id: "container-cpu",
    label: "Docker CPU",
    leftValue: leftContainerCpu,
    rightValue: rightContainerCpu,
    formatter: pct,
    deltaFormatter: (delta) => sparkPairSignedDelta(delta, "pp"),
    note: "Aggregate container CPU",
    watchDelta: 10,
    poorDelta: 25,
    maxValue: 100,
    includeWhen: left.dockerContainers.length || right.dockerContainers.length
  }));
  rows.push(sparkPairNumericMetric({
    id: "ollama-tokens",
    label: "Ollama tok/s",
    leftValue: left.ollamaTokensPerSecond,
    rightValue: right.ollamaTokensPerSecond,
    formatter: (value) => Number.isFinite(value) && value > 0 ? `${formatDecimal(value, 1)} tok/s` : "--",
    deltaFormatter: (delta) => sparkPairSignedDelta(delta, " tok/s", 1),
    note: "Generation probe throughput",
    watchDelta: 4,
    poorDelta: 12,
    maxValue: Math.max(1, left.ollamaTokensPerSecond, right.ollamaTokensPerSecond),
    toneFn: sparkPairRelativeSkewTone,
    includeWhen: left.ollamaTelemetryAvailable || right.ollamaTelemetryAvailable
  }));
  rows.push(sparkPairNumericMetric({
    id: "ollama-ttft",
    label: "Ollama TTFT",
    leftValue: left.ollamaTimeToFirstTokenMs,
    rightValue: right.ollamaTimeToFirstTokenMs,
    formatter: (value) => Number.isFinite(value) && value > 0 ? `${round(value)}ms` : "--",
    deltaFormatter: (delta) => sparkPairSignedDelta(delta, "ms"),
    note: "Generation probe latency",
    watchDelta: 300,
    poorDelta: 900,
    maxValue: Math.max(1000, left.ollamaTimeToFirstTokenMs, right.ollamaTimeToFirstTokenMs),
    toneFn: sparkPairRelativeSkewTone,
    includeWhen: left.ollamaTelemetryAvailable || right.ollamaTelemetryAvailable
  }));
  rows.push(sparkPairCategoryMetric({
    id: "model-count",
    label: "Local models",
    leftValue: `${left.modelCount}`,
    rightValue: `${right.modelCount}`,
    leftDetail: sparkPairOllamaModelLabel(left),
    rightDetail: sparkPairOllamaModelLabel(right),
    note: "Ollama model inventory",
    tone: left.modelCount === right.modelCount ? "good" : "watch",
    includeWhen: left.modelCount > 0 || right.modelCount > 0
  }));
  rows.push(sparkPairCategoryMetric({
    id: "nccl-runtime",
    label: "NCCL runtime",
    leftValue: left.ncclRuntimePresent ? "present" : "missing",
    rightValue: right.ncclRuntimePresent ? "present" : "missing",
    leftDetail: left.ncclRuntimeSocketIfname || left.ncclRuntimeSource || "no runtime",
    rightDetail: right.ncclRuntimeSocketIfname || right.ncclRuntimeSource || "no runtime",
    note: "vLLM/Ray capable container signal",
    tone: left.ncclRuntimePresent && right.ncclRuntimePresent ? "good" : left.ncclRuntimePresent || right.ncclRuntimePresent ? "watch" : "poor",
    includeWhen: true
  }));

  return rows.filter(Boolean);
}

function buildSparkPairSummaries(left, right, rows) {
  const rowTone = (id) => rows.find((row) => row.id === id)?.tone || "watch";
  const leftAge = sparkPairSampleAgeMilliseconds(left);
  const rightAge = sparkPairSampleAgeMilliseconds(right);
  const gpuDelta = sparkPairAbsDelta(left.gpuUtilizationPct, right.gpuUtilizationPct);
  const ramDelta = sparkPairAbsDelta(left.memoryUsedPct, right.memoryUsedPct);
  const networkDelta = sparkPairAbsDelta(left.networkUtilizationPct, right.networkUtilizationPct);
  const rxDelta = sparkPairAbsDelta(left.networkRxBytesPerSecond, right.networkRxBytesPerSecond);
  const tokenDelta = sparkPairAbsDelta(left.ollamaTokensPerSecond, right.ollamaTokensPerSecond);
  const poorCount = rows.filter((row) => row.tone === "poor").length;
  const watchCount = rows.filter((row) => row.tone === "watch").length;
  const clockRow = rows.find((row) => row.id === "clock-sync");
  const sampleSkewRow = rows.find((row) => row.id === "clock-sample-skew");

  return [
    {
      label: "Pair status",
      value: poorCount ? "Skewed" : watchCount ? "Watch" : "Balanced",
      note: `${poorCount} critical, ${watchCount} watch rows`,
      tone: poorCount ? "poor" : watchCount ? "watch" : "good"
    },
    {
      label: "Freshness",
      value: `${sparkPairAgeLabel(Math.max(numeric(leftAge), numeric(rightAge)))} max`,
      note: `${sparkPairHostLabel(left, "SPARK1")} ${sparkPairAgeLabel(leftAge)} | ${sparkPairHostLabel(right, "SPARK2")} ${sparkPairAgeLabel(rightAge)}`,
      tone: rowTone("sample-age")
    },
    {
      label: "Clock sync",
      value: clockRow?.deltaLabel || "waiting",
      note: sampleSkewRow ? `sample skew ${sampleSkewRow.deltaLabel}` : sparkPairClockPairNote(left, right),
      tone: rowTone("clock-sync")
    },
    {
      label: "Resource skew",
      value: `${formatDecimal(Math.max(numeric(gpuDelta), numeric(ramDelta)), 1)}pp`,
      note: `GPU ${sparkPairDeltaLabel(gpuDelta, "pp")} | RAM ${sparkPairDeltaLabel(ramDelta, "pp")}`,
      tone: ["gpu", "ram", "gpu-memory"].some((id) => rowTone(id) === "poor") ? "poor" : ["gpu", "ram", "gpu-memory"].some((id) => rowTone(id) === "watch") ? "watch" : "good"
    },
    {
      label: "Network skew",
      value: Number.isFinite(networkDelta) ? `${formatDecimal(networkDelta, 1)}pp` : sparkPairThroughputDeltaLabel(rxDelta),
      note: sparkPairNetworkNote(left, right),
      tone: ["network-util", "network-rx", "network-tx"].some((id) => rowTone(id) === "poor") ? "poor" : ["network-util", "network-rx", "network-tx"].some((id) => rowTone(id) === "watch") ? "watch" : "good"
    },
    {
      label: "Inference skew",
      value: Number.isFinite(tokenDelta) ? `${formatDecimal(tokenDelta, 1)} tok/s` : "probe wait",
      note: `${left.ncclRuntimePresent && right.ncclRuntimePresent ? "NCCL runtime on both" : "NCCL runtime parity incomplete"}`,
      tone: ["ollama-tokens", "ollama-ttft", "nccl-runtime"].some((id) => rowTone(id) === "poor") ? "poor" : ["ollama-tokens", "ollama-ttft", "nccl-runtime"].some((id) => rowTone(id) === "watch") ? "watch" : "good"
    }
  ];
}

function applySparkPairClockFeed(feed) {
  const samples = Array.isArray(feed?.samples) ? feed.samples : [];
  const contexts = samples
    .filter((sample) => sample && sample.status !== "unreachable")
    .map(sparkPairClockContextFromFeedSample);
  const pair = selectSparkPairContexts(contexts);
  if (pair.length < 2) return;

  const [left, right] = pair;
  recordSparkPairClockSample(left, right);
  if (latestSparkPairComparison) {
    latestSparkPairComparison.clockHistory = sparkPairClockHistory;
  }
  refreshSparkPairClockPanel();
  refreshSparkPairClockMetricRows(left, right);
}

function buildUnitEconomicsGraph(row) {
  const width = 420;
  const height = 128;
  const padX = 16;
  const padY = 14;
  const innerWidth = width - padX * 2;
  const innerHeight = height - padY * 2;
  const svg = svgNode("svg", {
    class: "unit-economics-chart",
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `${row.host} unit economics graph`
  });
  const history = row.history || [];
  const values = history.flatMap((point) => [point.revenuePerHour, point.costPerHour, point.profitPerHour]).filter(Number.isFinite);

  [0.25, 0.5, 0.75].forEach((ratio) => {
    const y = padY + innerHeight * ratio;
    svg.append(svgNode("line", {
      x1: padX,
      x2: width - padX,
      y1: y,
      y2: y,
      class: "unit-economics-grid-line"
    }));
  });

  if (history.length < 2 || values.length < 2) {
    const empty = textNode("waiting for economics samples", width / 2, height / 2 + 4, "unit-economics-empty");
    empty.setAttribute("text-anchor", "middle");
    svg.append(empty);
    return svg;
  }

  let min = Math.min(...values, 0);
  let max = Math.max(...values, 0);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const range = max - min;
  const yFor = (value) => padY + innerHeight - ((value - min) / range) * innerHeight;
  svg.append(svgNode("line", {
    x1: padX,
    x2: width - padX,
    y1: yFor(0),
    y2: yFor(0),
    class: "unit-economics-zero-line"
  }));

  [
    ["revenue", "revenuePerHour"],
    ["cost", "costPerHour"],
    ["profit", "profitPerHour"]
  ].forEach(([series, key]) => {
    const points = history
      .map((point, index) => {
        const value = numeric(point[key], Number.NaN);
        if (!Number.isFinite(value)) return null;
        const x = padX + (history.length <= 1 ? innerWidth : (index / (history.length - 1)) * innerWidth);
        return `${formatDecimal(x, 1)},${formatDecimal(yFor(value), 1)}`;
      })
      .filter(Boolean);
    if (points.length < 2) return;
    svg.append(svgNode("polyline", {
      points: points.join(" "),
      class: `unit-economics-line unit-economics-line-${series}`
    }));
  });

  return svg;
}

function buildSparkPairClockGraph(history, series, values, options = {}) {
  const width = 420;
  const height = 116;
  const padX = 14;
  const padY = 12;
  const innerWidth = width - padX * 2;
  const innerHeight = height - padY * 2;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "spark-pair-clock-graph");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Rolling SPARK clock offset graph");

  [0.25, 0.5, 0.75].forEach((ratio) => {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    const y = padY + innerHeight * ratio;
    line.setAttribute("x1", padX);
    line.setAttribute("x2", width - padX);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);
    line.setAttribute("class", "spark-pair-clock-grid-line");
    svg.append(line);
  });

  const finiteValues = values.filter(Number.isFinite);
  if (history.length < 2 || finiteValues.length < 2) {
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", width / 2);
    text.setAttribute("y", height / 2 + 4);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("class", "spark-pair-clock-empty");
    text.textContent = options.empty || "waiting";
    svg.append(text);
    return svg;
  }

  let min = Math.min(...finiteValues, 0);
  let max = Math.max(...finiteValues, 0);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const range = max - min;
  const zeroY = padY + innerHeight - ((0 - min) / range) * innerHeight;
  const zero = document.createElementNS("http://www.w3.org/2000/svg", "line");
  zero.setAttribute("x1", padX);
  zero.setAttribute("x2", width - padX);
  zero.setAttribute("y1", zeroY);
  zero.setAttribute("y2", zeroY);
  zero.setAttribute("class", "spark-pair-clock-zero-line");
  svg.append(zero);

  series.forEach((entry) => {
    const points = history
      .map((sample, index) => {
        const value = numeric(sample[entry.key], Number.NaN);
        if (!Number.isFinite(value)) return null;
        const x = padX + (history.length <= 1 ? innerWidth : (index / (history.length - 1)) * innerWidth);
        const y = padY + innerHeight - ((value - min) / range) * innerHeight;
        return `${formatDecimal(x, 1)},${formatDecimal(y, 1)}`;
      })
      .filter(Boolean);
    if (points.length < 2) return;
    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.setAttribute("points", points.join(" "));
    polyline.setAttribute("class", `spark-pair-clock-line spark-pair-clock-line-${entry.key}`);
    svg.append(polyline);
  });

  return svg;
}

function buildOperatorCommands({ summary, machineContext, grafana, kafka }) {
  const hostUrl = operatorAnalyzerBaseUrl(machineContext);
  const grafanaUrl = grafana.links.find((link) => /dashboard/i.test(link.type || link.label || ""))?.url
    || machineContext?.context?.grafanaDashboardUrl
    || "http://192.168.10.20:3000/d/spark1-dcgm/spark1-dcgm-gpu-demo";
  const hasKubernetesSource = (summary.sourceItems || []).some((item) => (item.source?.adapters || []).includes("kubernetes"));
  const runId = hasKubernetesSource ? (summary.sourceItems?.[0]?.id || "spark1-k8s-demo-001") : "spark1-k8s-demo-001";
  const commands = [
    {
      label: "Run GPU Load",
      detail: "Copy the SPARK1 CUDA load command",
      command: "kubectl -n turbalance-demo delete job -l turba.ai/run-id=spark1-k8s-demo-001 --ignore-not-found && kubectl apply -f ops/kubernetes/spark1-cuda-load-job.yaml"
    },
    {
      label: "Run Kafka Smoke",
      detail: kafka.reachable ? "Re-run produce/consume proof" : "Enable broker and verify round trip",
      command: "node scripts/check-spark1-kafka.js"
    },
    {
      label: "Refresh K8s Bundle",
      detail: "Collect Kubernetes, Prometheus, DCGM, Grafana evidence",
      command: `node scripts/collect-spark1-kubernetes-demo.js --run-id ${runId} --namespace turbalance-demo --prometheus-url http://127.0.0.1:9090 --grafana-url ${grafanaUrl} --out build/demo/spark1-k8s-bundle.json`
    },
    {
      label: "Open Grafana",
      detail: "Open live DCGM dashboard",
      url: grafanaUrl
    },
    {
      label: "Open Analyzer",
      detail: "Open current machine demo",
      url: `${hostUrl}/?demo=machine`
    },
    {
      label: "Export Evidence",
      detail: "Download current evidence pack",
      action: exportEvidencePack
    }
  ];

  return commands;
}

function operatorAnalyzerBaseUrl(machineContext) {
  const configured = firstString([
    machineContext?.context?.hostUrl,
    machineContext?.context?.publicBaseUrl,
    machineContext?.context?.staticUrl
  ]);
  if (configured) return configured.replace(/\/+$/, "");

  if (typeof window !== "undefined" && window.location) {
    const origin = window.location.origin;
    if (origin && origin !== "null") return origin.replace(/\/+$/, "");

    const protocol = window.location.protocol || "http:";
    const host = window.location.host || window.location.hostname;
    if (host) return `${protocol}//${host}`.replace(/\/+$/, "");
  }

  return "http://192.168.10.20:8000";
}

function parseMaybeJson(value) {
  if (isPlainObject(value)) return value;
  if (!value || typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function buildCovarianceSparkline(points, isDiagonal) {
  return buildTrendSparkline(points, {
    className: "live-covariance-trend",
    emptyClassName: "live-covariance-trend-empty",
    lineClassName: "live-covariance-trend-line",
    signed: !isDiagonal,
    zeroClassName: "live-covariance-trend-zero"
  });
}

function buildEigenSparkline(points, signed = false) {
  return buildTrendSparkline(points, {
    className: "live-eigen-trend",
    emptyClassName: "live-eigen-trend-empty",
    height: 26,
    lineClassName: "live-eigen-trend-line",
    signed,
    zeroClassName: "live-eigen-trend-zero"
  });
}

function buildTrendSparkline(points, options = {}) {
  const width = 96;
  const height = options.height || 30;
  const pad = 4;
  const innerWidth = width - pad * 2;
  const innerHeight = height - pad * 2;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", options.className || "live-trend-sparkline");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const values = points.map((point) => numeric(point.value, Number.NaN)).filter(Number.isFinite);
  if (values.length < 2) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", pad);
    line.setAttribute("x2", width - pad);
    line.setAttribute("y1", height / 2);
    line.setAttribute("y2", height / 2);
    line.setAttribute("class", options.emptyClassName || "live-trend-empty");
    svg.append(line);
    return svg;
  }

  let min = Math.min(...values);
  let max = Math.max(...values);
  if (options.signed) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const range = max - min;

  if (min < 0 && max > 0) {
    const zero = document.createElementNS("http://www.w3.org/2000/svg", "line");
    const y = pad + innerHeight - ((0 - min) / range) * innerHeight;
    zero.setAttribute("x1", pad);
    zero.setAttribute("x2", width - pad);
    zero.setAttribute("y1", y);
    zero.setAttribute("y2", y);
    zero.setAttribute("class", options.zeroClassName || "live-trend-zero");
    svg.append(zero);
  }

  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", values.map((value, index) => {
    const x = pad + (index / (values.length - 1)) * innerWidth;
    const y = pad + innerHeight - ((value - min) / range) * innerHeight;
    return `${formatDecimal(x, 1)},${formatDecimal(y, 1)}`;
  }).join(" "));
  polyline.setAttribute("class", options.lineClassName || "live-trend-line");
  svg.append(polyline);
  return svg;
}

function buildLiveCovarianceMatrix(history) {
  const rows = LIVE_COVARIANCE_METRICS.map((rowMetric) => ({
    metric: rowMetric,
    cells: LIVE_COVARIANCE_METRICS.map((columnMetric) => ({
      rowKey: rowMetric.key,
      columnKey: columnMetric.key,
      rowLabel: rowMetric.label,
      columnLabel: columnMetric.label,
      stats: telemetryCovarianceStats(history, rowMetric.key, columnMetric.key),
      trend: telemetryCovarianceTrend(history, rowMetric.key, columnMetric.key)
    }))
  }));

  return {
    metrics: LIVE_COVARIANCE_METRICS,
    rows,
    principalMode: buildPrincipalResourceMode(history)
  };
}

function buildPrincipalResourceMode(history) {
  const mode = calculatePrincipalResourceMode(history);
  const trend = telemetryPrincipalModeTrend(history);
  const loadingTrendByKey = new Map(LIVE_COVARIANCE_METRICS.map((metric) => ([
    metric.key,
    trend
      .map((point) => {
        const loading = point.loadings.find((entry) => entry.key === metric.key);
        if (!Number.isFinite(loading?.value)) return null;
        return {
          timestampMs: point.timestampMs,
          label: point.label,
          value: loading.value
        };
      })
      .filter(Boolean)
  ])));
  const eigenvalueTrends = mode.eigenvalues.map((_, index) => (
    trend
      .map((point) => {
        const entry = point.eigenvalues[index];
        if (!Number.isFinite(entry?.value)) return null;
        return {
          timestampMs: point.timestampMs,
          label: point.label,
          sharePct: entry.sharePct,
          value: entry.value
        };
      })
      .filter(Boolean)
  ));

  return {
    ...mode,
    explainedTrend: trend
      .map((point) => Number.isFinite(point.explainedPct)
        ? {
            timestampMs: point.timestampMs,
            label: point.label,
            value: point.explainedPct
          }
        : null)
      .filter(Boolean),
    loadings: mode.loadings.map((loading) => ({
      ...loading,
      trend: loadingTrendByKey.get(loading.key) || []
    })),
    eigenvalues: mode.eigenvalues.map((entry, index) => ({
      ...entry,
      trend: eigenvalueTrends[index] || []
    }))
  };
}

function buildTelemetrySparkline(history, valueKey, max) {
  const width = 260;
  const height = 78;
  const pad = 8;
  const innerWidth = width - pad * 2;
  const innerHeight = height - pad * 2;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${valueKey} telemetry graph`);

  [0.25, 0.5, 0.75].forEach((ratio) => {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    const y = pad + innerHeight * ratio;
    line.setAttribute("x1", pad);
    line.setAttribute("x2", width - pad);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);
    line.setAttribute("class", "telemetry-grid-line");
    svg.append(line);
  });

  const validPoints = history
    .map((sample, index) => {
      const value = telemetryValue(sample, valueKey);
      if (!Number.isFinite(value)) return null;
      const x = pad + (history.length <= 1 ? innerWidth : (index / (history.length - 1)) * innerWidth);
      const y = pad + innerHeight - (clamp(value, 0, max) / Math.max(max, 1)) * innerHeight;
      return { x, y };
    })
    .filter(Boolean);

  if (validPoints.length >= 2) {
    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.setAttribute("points", validPoints.map((point) => `${round(point.x)},${round(point.y)}`).join(" "));
    polyline.setAttribute("class", "telemetry-line");
    svg.append(polyline);
  } else if (validPoints.length === 1) {
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", validPoints[0].x);
    dot.setAttribute("cy", validPoints[0].y);
    dot.setAttribute("r", 3);
    dot.setAttribute("class", "telemetry-dot");
    svg.append(dot);
  } else {
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", width / 2);
    text.setAttribute("y", height / 2 + 4);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("class", "telemetry-empty");
    text.textContent = "no live counter";
    svg.append(text);
  }

  return svg;
}

function buildTaskMemory(summary, classifier) {
  if (summary.scope !== "job") {
    return { visible: false };
  }

  const current = taskSnapshotFromSummary(summary, classifier, "Current analysis", state.lastAnalysis);
  const comparison = analytics.compareTaskUtilizationPattern(current, taskHistory, {
    excludeCapturedAt: state.lastAnalysis
  });

  return {
    visible: true,
    ...comparison
  };
}

function buildNodeIndex() {
  const index = {};
  TOPOLOGY.forEach((pod) => {
    pod.racks.forEach((rack) => {
      rack.nodes.forEach((node) => {
        index[node] = {
          pod: pod.id,
          podLabel: pod.label,
          podTier: pod.tier,
          rack: rack.id,
          rackLabel: rack.label,
          rackTier: rack.tier,
          nodeTier: "gpu-node"
        };
      });
    });
  });
  return index;
}

function summarizeProviderFields(items) {
  return {
    tenants: knownLabels(items.map((job) => job.tenant), "Unassigned tenant"),
    accounts: knownLabels(items.map((job) => job.account), "Unassigned account"),
    reservations: knownLabels(items.map((job) => job.reservation), "No reservation"),
    billingModels: knownLabels(items.map((job) => job.commercial?.billingModel), "Unclassified"),
    customerTiers: knownLabels(items.map((job) => job.commercial?.customerTier), "Standard"),
    contracts: knownLabels(items.map((job) => job.commercial?.contractId), "No contract"),
    listGpuHourRate: weightedOptionalAverage(items, (job) => job.commercial?.listGpuHourRate, "allocatedGpuHours"),
    floorGpuHourCost: weightedOptionalAverage(items, (job) => job.commercial?.floorGpuHourCost, "allocatedGpuHours"),
    committedGpuHours: sumUniqueCommercialHours(items, "committedGpuHours"),
    burstGpuHours: sumCommercialHours(items, "burstGpuHours"),
    billableGpuHours: sumCommercialHours(items, "billableGpuHours"),
    sellableGpuHours: sumCommercialHours(items, "sellableGpuHours")
  };
}

function summarizeModelSpecFields(items) {
  const specs = items.map((job) => job.modelSpec).filter(isPlainObject);
  if (specs.length === 0) return {};

  const weightedSpec = (key) => weightedOptionalAverage(
    items,
    (job) => job.modelSpec?.[key],
    "allocatedGpuHours"
  );

  return compactObject({
    gpuModel: firstString(specs.map((spec) => spec.gpuModel)),
    precision: firstString(specs.map((spec) => spec.precision)) || "bf16",
    paramsB: finiteModelSpecValue(weightedSpec("paramsB")),
    sequenceLength: finiteModelSpecValue(weightedSpec("sequenceLength")),
    batchSize: finiteModelSpecValue(weightedSpec("batchSize")),
    peakTflops: finiteModelSpecValue(weightedSpec("peakTflops")),
    trainingFlopMultiplier: finiteModelSpecValue(weightedSpec("trainingFlopMultiplier")),
    hardwareFlopMultiplier: finiteModelSpecValue(weightedSpec("hardwareFlopMultiplier"))
  });
}

function finiteModelSpecValue(value) {
  return Number.isFinite(value) ? value : undefined;
}

function summarizeSloFields(items) {
  return {
    priorities: knownLabels(items.map((job) => job.slo?.priority), "p3"),
    supportTickets: knownLabels(items.map((job) => job.slo?.supportTicketId), "No ticket"),
    targetStartMinutes: weightedOptionalAverage(items, (job) => job.slo?.targetStartMinutes, "allocatedGpuHours"),
    targetEfficiency: weightedOptionalAverage(items, (job) => job.slo?.targetEfficiency, "allocatedGpuHours")
  };
}

function summarizeSchedulerEvidence(items) {
  const evidenceItems = items
    .map((job) => job.schedulerEvidence)
    .filter((evidence) => isPlainObject(evidence) && Object.keys(evidence).length > 0);

  if (evidenceItems.length === 0) {
    return { sourceCount: 0 };
  }

  return {
    sourceCount: evidenceItems.length,
    schedulerNames: knownLabels(evidenceItems.map((evidence) => evidence.schedulerName), "Unknown scheduler"),
    queueNames: knownLabels(evidenceItems.map((evidence) => evidence.queueName), "Unknown queue"),
    priorityClasses: knownLabels(evidenceItems.map((evidence) => evidence.priorityClass), "Unknown priority"),
    admissionClasses: knownLabels(evidenceItems.map((evidence) => evidence.admissionClass), "Unknown admission"),
    requestedGpuShapes: knownLabels(evidenceItems.map((evidence) => evidence.requestedGpuShape), "Unknown shape"),
    localityPreferences: knownLabels(evidenceItems.map((evidence) => evidence.localityPreference), "No locality preference"),
    eventCount: sum(evidenceItems, "eventCount"),
    admissionAttempts: sum(evidenceItems, "admissionAttempts"),
    preemptionCount: sum(evidenceItems, "preemptionCount"),
    placementRetries: sum(evidenceItems, "placementRetries"),
    localityMisses: sum(evidenceItems, "localityMisses"),
    backfillCandidates: sum(evidenceItems, "backfillCandidates"),
    pendingJobsAhead: sum(evidenceItems, "pendingJobsAhead"),
    pendingGpuHoursAhead: sum(evidenceItems, "pendingGpuHoursAhead"),
    gpusPerNode: weightedOptionalAverage(items, (job) => job.schedulerEvidence?.gpusPerNode, "allocatedGpuHours")
  };
}

function summarizeGrafanaContext(items) {
  const contexts = items
    .map((job) => job.grafanaContext)
    .filter((context) => isPlainObject(context) && Object.keys(context).length > 0);

  if (contexts.length === 0) {
    return { sourceCount: 0, links: [] };
  }

  const links = uniqueBy(contexts.flatMap((context) => context.links || []), (link) => link.url);
  const variableKeys = unique(contexts.flatMap((context) => Object.keys(context.variables || {}))).sort();
  const timeRange = contexts.find((context) => context.timeRange)?.timeRange || {};

  return {
    sourceCount: contexts.length,
    dashboards: knownLabels(contexts.map((context) => context.dashboardTitle || context.dashboardUid), "Unlabeled dashboard"),
    datasources: knownLabels(contexts.map((context) => context.datasourceName || context.datasourceUid), "Unlabeled datasource"),
    instances: knownLabels(contexts.map((context) => context.instanceName || context.grafanaBaseUrl), "Unlabeled Grafana"),
    folders: knownLabels(contexts.map((context) => context.folder), "No folder"),
    variableKeys,
    timeRange,
    links
  };
}

function mergePlacement(items) {
  const placements = new Map();

  items.forEach((job) => {
    job.placement.forEach((placement) => {
      const existing = placements.get(placement.node);
      if (!existing) {
        placements.set(placement.node, { ...placement });
      } else {
        existing.gpus += placement.gpus;
        existing.partial = existing.partial || placement.partial;
      }
    });
  });

  return Array.from(placements.values());
}

function mergeTraceAttribution(items) {
  const traces = items.map((item) => item.traceAttribution).filter(Boolean);
  const totalDurationMs = sum(traces, "totalDurationMs");
  const totalBytes = sum(traces, "totalBytes");

  return {
    rankCount: sum(traces, "rankCount"),
    eventCount: sum(traces, "eventCount"),
    totalDurationMs,
    totalBytes,
    byTier: mergeTraceRows(traces, "byTier", "tier", totalDurationMs, totalBytes),
    byOperation: mergeTraceRows(traces, "byOperation", "op", totalDurationMs, totalBytes),
    hottestTier: mergeTraceRows(traces, "byTier", "tier", totalDurationMs, totalBytes)[0] || null
  };
}

function mergeImportedOpportunities(items) {
  return items.flatMap((item) => (
    Array.isArray(item.importedOpportunities)
      ? item.importedOpportunities.map((opportunity) => ({
        ...opportunity,
        sourceRunId: item.id
      }))
      : []
  ));
}

function mergeTraceRows(traces, listKey, idKey, totalDurationMs, totalBytes) {
  const rows = new Map();

  traces.forEach((trace) => {
    (trace[listKey] || []).forEach((row) => {
      const key = row[idKey];
      const existing = rows.get(key) || {
        [idKey]: key,
        label: row.label,
        durationMs: 0,
        bytes: 0,
        eventCount: 0
      };
      existing.durationMs += Number(row.durationMs) || 0;
      existing.bytes += Number(row.bytes) || 0;
      existing.eventCount += Number(row.eventCount) || 0;
      rows.set(key, existing);
    });
  });

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      durationPct: totalDurationMs > 0 ? (row.durationMs / totalDurationMs) * 100 : 0,
      bytesPct: totalBytes > 0 ? (row.bytes / totalBytes) * 100 : 0
    }))
    .sort((a, b) => b.durationMs - a.durationMs);
}
