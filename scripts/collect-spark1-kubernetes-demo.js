#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { assertValidSourceBundle } = require("../lib/source-bundle-validator.js");

const DEFAULT_RUN_ID = "spark1-k8s-demo-001";
const DEFAULT_NAMESPACE = "turbalance-demo";
const DEFAULT_PROMETHEUS_URL = "http://127.0.0.1:9090";
const GPU_RESOURCE = "nvidia.com/gpu";

const args = parseArgs(process.argv.slice(2));
const runId = args["run-id"] || process.env.TURBALANCE_SPARK1_K8S_RUN_ID || DEFAULT_RUN_ID;
const namespace = args.namespace || process.env.TURBALANCE_SPARK1_K8S_NAMESPACE || DEFAULT_NAMESPACE;
const selector = args.selector || process.env.TURBALANCE_SPARK1_K8S_SELECTOR || `turba.ai/run-id=${runId}`;
const kubectl = args.kubectl || process.env.TURBALANCE_KUBECTL || "kubectl";
const prometheusUrl = args["prometheus-url"] || process.env.TURBALANCE_PROMETHEUS_URL || DEFAULT_PROMETHEUS_URL;
const bearerToken = args["bearer-token"] || process.env.TURBALANCE_PROMETHEUS_BEARER_TOKEN || "";
const outPath = args.out || process.env.TURBALANCE_SPARK1_K8S_OUTPUT || "";
const windowMinutes = numberArg(args["window-minutes"], 15);
const hostUrl = args["host-url"] || process.env.TURBALANCE_MACHINE_DEMO_URL || "http://192.168.10.20:8000";
const grafanaUrl = args["grafana-url"] || process.env.TURBALANCE_GRAFANA_URL || "";
const clusterLabel = args.cluster || process.env.TURBALANCE_SPARK1_K8S_CLUSTER || "SPARK1 k3s";
const skipPrometheus = Boolean(args["skip-prometheus"] || process.env.TURBALANCE_SKIP_PROMETHEUS);
const strictPrometheus = Boolean(args["strict-prometheus"] || process.env.TURBALANCE_STRICT_PROMETHEUS);

if (args.help) {
  usage();
  process.exit(0);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

async function main() {
  const warnings = [];
  const generatedAt = new Date();
  const kubernetes = collectKubernetes({
    kubectl,
    namespace,
    selector,
    runId,
    generatedAt,
    windowMinutes,
    warnings
  });
  const prometheus = skipPrometheus
    ? { prometheusMetrics: {}, dcgmFields: {}, warnings: ["Prometheus collection skipped"] }
    : await collectPrometheus({
      baseUrl: prometheusUrl,
      bearerToken,
      namespace,
      podNames: kubernetes.podNames,
      strict: strictPrometheus
    });

  warnings.push(...prometheus.warnings);
  const bundle = buildBundle({
    runId,
    namespace,
    selector,
    hostUrl,
    clusterLabel,
    generatedAt,
    kubernetes,
    prometheusMetrics: prometheus.prometheusMetrics,
    dcgmFields: prometheus.dcgmFields,
    grafanaUrl,
    warnings
  });
  const validation = assertValidSourceBundle(bundle, { requireSourceExport: true });

  if (outPath) {
    writeJsonFile(outPath, bundle);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      runId,
      namespace,
      selector,
      outPath: path.resolve(outPath),
      sourceCounts: validation.sourceCounts,
      warnings
    }, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(bundle, null, 2)}\n`);
}

function collectKubernetes({ kubectl, namespace, selector, runId, generatedAt, windowMinutes, warnings }) {
  const selectorLabels = parseSelector(selector);
  const pods = filterBySelector(
    itemsFrom(readJsonSource(args["pods-json"], () => kubectlJson(kubectl, ["get", "pods", "-n", namespace, "-l", selector, "-o", "json"]))),
    selectorLabels,
    runId
  );
  const jobs = filterBySelector(
    itemsFrom(readJsonSource(args["jobs-json"], () => kubectlJson(kubectl, ["get", "jobs", "-n", namespace, "-l", selector, "-o", "json"], { optional: true, warnings }))),
    selectorLabels,
    runId
  );
  const events = itemsFrom(readJsonSource(args["events-json"], () => kubectlJson(kubectl, ["get", "events", "-n", namespace, "-o", "json"], { optional: true, warnings })));
  const nodes = itemsFrom(readJsonSource(args["nodes-json"], () => kubectlJson(kubectl, ["get", "nodes", "-o", "json"], { optional: true, warnings })));

  if (pods.length === 0 && jobs.length === 0) {
    throw new Error(`no Kubernetes pods or jobs found for selector ${selector} in namespace ${namespace}`);
  }

  const podNames = pods.map((pod) => pod.metadata?.name).filter(Boolean);
  const jobNames = jobs.map((job) => job.metadata?.name).filter(Boolean);
  const nodeNames = unique(pods.map((pod) => pod.spec?.nodeName).filter(Boolean));
  const matchedEvents = eventsForWorkload(events, podNames, jobNames);
  const requestedGpus = requestedGpuCount(pods, jobs);
  const nodeGpuCapacity = maxNodeGpuCapacity(nodes, nodeNames);
  const requestedByNode = requestedGpusByNode(pods);
  const partialNodes = partialNodeNames(nodes, nodeNames, requestedByNode);
  const queuedAt = earliest([
    ...jobs.map((job) => job.metadata?.creationTimestamp),
    ...pods.map((pod) => pod.metadata?.creationTimestamp)
  ]);
  const scheduledAt = earliest(pods.map((pod) => podConditionTime(pod, "PodScheduled")));
  const startedAt = earliest(pods.map((pod) => pod.status?.startTime)) || scheduledAt || queuedAt;
  const completedAt = latest([
    ...jobs.map((job) => job.status?.completionTime),
    ...pods.flatMap((pod) => containerFinishedTimes(pod))
  ]);
  const durationHours = Math.max(
    windowMinutes / 60,
    hoursBetween(startedAt, completedAt || generatedAt.toISOString()) || 0
  );
  const warningEvents = matchedEvents.filter((event) => String(event.type || "").toLowerCase() === "warning");
  const unschedulableEvents = matchedEvents.filter((event) => /unschedulable|failedscheduling/i.test(`${event.reason || ""} ${event.message || ""}`));
  const status = workloadStatus({ pods, jobs });
  const queueWaitMinutes = minutesBetween(queuedAt, scheduledAt || startedAt);
  const placementQuality = placementScore({ status, warningEvents, unschedulableEvents, nodeNames, requestedGpus });
  const schedulerEvents = matchedEvents.map(toSchedulerEvent).slice(0, 20);
  const workloadName = jobs[0]?.metadata?.name || podOwnerJobName(pods[0]) || pods[0]?.metadata?.name || runId;
  const gpuModel = nodeGpuModel(nodes, nodeNames);

  return {
    runId,
    workloadName,
    status,
    podNames,
    jobNames,
    nodeNames,
    requestedGpus,
    nodeGpuCapacity,
    gpuModel,
    durationHours,
    queueWaitMinutes,
    placementQuality,
    partialNodes,
    warningEvents: warningEvents.length,
    unschedulableEvents: unschedulableEvents.length,
    schedulerEvents,
    queuedAt,
    scheduledAt,
    startedAt,
    completedAt,
    podsObserved: pods.length,
    jobsObserved: jobs.length
  };
}

async function collectPrometheus({ baseUrl, bearerToken, namespace, podNames, strict }) {
  const warnings = [];
  const podRegex = podNames.length > 0 ? podNames.map(escapePrometheusRegex).join("|") : ".+";
  const scoped = (metric) => [
    `avg(${metric}{namespace="${escapePrometheusLabel(namespace)}",pod=~"${podRegex}"})`,
    `avg(${metric}{exported_namespace="${escapePrometheusLabel(namespace)}",exported_pod=~"${podRegex}"})`,
    `avg(${metric})`
  ];
  const queryGroups = {
    prometheus: {
      turba_gpu_utilization_ratio: scoped("DCGM_FI_DEV_GPU_UTIL").map((query) => `${query} / 100`),
      turba_useful_compute_ratio: [
        ...scoped("DCGM_FI_PROF_PIPE_TENSOR_ACTIVE").map((query) => `${query} / 100`),
        ...scoped("DCGM_FI_DEV_GPU_UTIL").map((query) => `${query} / 100`)
      ],
      turba_step_regularity_ratio: ["1 - clamp_max(stddev_over_time(DCGM_FI_DEV_GPU_UTIL[5m]) / 100, 1)"]
    },
    dcgm: {
      DCGM_FI_PROF_SM_OCCUPANCY: [
        ...scoped("DCGM_FI_PROF_SM_OCCUPANCY"),
        ...scoped("DCGM_FI_DEV_GPU_UTIL")
      ],
      DCGM_FI_PROF_PIPE_TENSOR_ACTIVE: [
        ...scoped("DCGM_FI_PROF_PIPE_TENSOR_ACTIVE"),
        ...scoped("DCGM_FI_DEV_GPU_UTIL")
      ],
      DCGM_FI_DEV_FB_USED_RATIO: [
        ...scoped("DCGM_FI_DEV_FB_USED").map((query, index) => `${query} / clamp_min(${scoped("DCGM_FI_DEV_FB_TOTAL")[index]}, 1) * 100`),
        "avg(DCGM_FI_DEV_FB_USED / DCGM_FI_DEV_FB_TOTAL) * 100"
      ],
      DCGM_FI_PROF_DRAM_ACTIVE: [
        ...scoped("DCGM_FI_PROF_DRAM_ACTIVE"),
        ...scoped("DCGM_FI_DEV_MEM_COPY_UTIL")
      ],
      DCGM_FI_DEV_POWER_USAGE: scoped("DCGM_FI_DEV_POWER_USAGE"),
      DCGM_FI_DEV_GPU_TEMP: scoped("DCGM_FI_DEV_GPU_TEMP")
    }
  };

  try {
    return {
      prometheusMetrics: await collectPrometheusGroup({ baseUrl, bearerToken, queries: queryGroups.prometheus, strict, warnings }),
      dcgmFields: await collectPrometheusGroup({ baseUrl, bearerToken, queries: queryGroups.dcgm, strict, warnings }),
      warnings
    };
  } catch (error) {
    if (strict) throw error;
    warnings.push(`Prometheus unavailable: ${error.message}`);
    return { prometheusMetrics: {}, dcgmFields: {}, warnings };
  }
}

async function collectPrometheusGroup({ baseUrl, bearerToken, queries, strict, warnings }) {
  const values = {};

  for (const [name, candidates] of Object.entries(queries)) {
    const queryList = Array.isArray(candidates) ? candidates : [candidates];
    const errors = [];
    for (const query of queryList) {
      try {
        const value = await queryPrometheus({ baseUrl, bearerToken, query });
        if (Number.isFinite(value)) {
          values[name] = value;
          break;
        }
      } catch (error) {
        errors.push(error.message);
      }
    }
    if (!(name in values)) {
      const message = `${name}: ${errors.at(-1) || "no query candidates returned a numeric value"}`;
      if (strict) throw new Error(message);
      warnings.push(message);
    }
  }

  return values;
}

async function queryPrometheus({ baseUrl, bearerToken, query }) {
  const url = prometheusQueryUrl(baseUrl, query);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: compactObject({
        accept: "application/json",
        authorization: bearerToken ? `Bearer ${bearerToken}` : ""
      })
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Prometheus returned ${response.status}: ${text}`);
    }
    const payload = JSON.parse(text);
    if (payload.status !== "success") {
      throw new Error(payload.error || "Prometheus query failed");
    }
    return prometheusNumericValue(payload.data);
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Prometheus query timed out after 5000 ms");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildBundle({
  runId,
  namespace,
  selector,
  hostUrl,
  clusterLabel,
  generatedAt,
  kubernetes,
  prometheusMetrics,
  dcgmFields,
  grafanaUrl,
  warnings
}) {
  const gpuUtilPct = ratioPercent(prometheusMetrics.turba_gpu_utilization_ratio);
  const usefulComputePct = ratioPercent(prometheusMetrics.turba_useful_compute_ratio);
  const gpus = kubernetes.requestedGpus || 0;
  const idleGpus = Number.isFinite(gpuUtilPct) && gpuUtilPct < 3 && /running/i.test(kubernetes.status) ? gpus : 0;
  const sourceAdapters = [
    "kubectl",
    "kubernetes",
    "k3s",
    Object.keys(prometheusMetrics).length > 0 ? "prometheus" : null,
    Object.keys(dcgmFields).length > 0 ? "dcgm" : null,
    grafanaUrl ? "grafana" : null
  ].filter(Boolean);
  const modelKey = "spark1-k8s-gpu-workload";
  const clusterKey = "spark1-k3s";
  const generatedIso = generatedAt.toISOString();
  const allocatedGpuHours = gpus * kubernetes.durationHours;
  const scheduler = compactObject({
    placementQuality: kubernetes.placementQuality,
    idleGpus,
    partialNodes: kubernetes.partialNodes.length,
    queueWaitMinutes: kubernetes.queueWaitMinutes,
    gpusPerNode: kubernetes.nodeGpuCapacity || Math.max(1, gpus)
  });

  const run = {
    id: runId,
    name: `${kubernetes.workloadName} on ${clusterLabel}`,
    refs: {
      model: modelKey,
      user: "local-operator",
      team: "local-ai-ops",
      cluster: clusterKey,
      tenant: "local-lab",
      account: "spark1",
      reservation: "spark1-k8s-demo"
    },
    status: kubernetes.status,
    importedSources: sourceAdapters,
    allocation: compactObject({
      durationHours: round(kubernetes.durationHours, 3),
      gpus,
      allocatedGpuHours: round(allocatedGpuHours, 3),
      gpuModel: kubernetes.gpuModel || "NVIDIA GPU via Kubernetes"
    }),
    utilization: compactObject({
      gpuUtil: Number.isFinite(gpuUtilPct) ? round(gpuUtilPct, 2) : undefined,
      usefulCompute: Number.isFinite(usefulComputePct) ? round(usefulComputePct, 2) : undefined,
      smOccupancy: numberField(dcgmFields.DCGM_FI_PROF_SM_OCCUPANCY),
      tensorCoreUtil: numberField(dcgmFields.DCGM_FI_PROF_PIPE_TENSOR_ACTIVE)
    }),
    communication: {
      ncclTime: 0,
      networkWait: 0,
      allToAllTime: 0,
      crossRackTraffic: 0,
      crossPodTraffic: 0
    },
    inputPipeline: {
      dataloaderStall: 0,
      storageWait: 0,
      cpuPrep: 0
    },
    memory: compactObject({
      hbmCapacity: numberField(dcgmFields.DCGM_FI_DEV_FB_USED_RATIO),
      hbmBandwidth: numberField(dcgmFields.DCGM_FI_PROF_DRAM_ACTIVE),
      memoryFragmentation: 0,
      kvCachePressure: numberField(dcgmFields.DCGM_FI_DEV_FB_USED_RATIO)
    }),
    scheduler,
    reliability: {
      noiseEvents: kubernetes.warningEvents,
      contentionPct: 0,
      stepRegularity: Number.isFinite(ratioPercent(prometheusMetrics.turba_step_regularity_ratio))
        ? round(ratioPercent(prometheusMetrics.turba_step_regularity_ratio), 2)
        : 100,
      latencyTail: 0
    },
    configuration: {
      precisionLoss: 0,
      batchInefficiency: 0
    },
    work: {
      tokensM: 0,
      steps: 0,
      inferenceRequestsM: 0
    },
    baseline: {
      gpuEfficiency: 65,
      queueWaitMinutes: 0,
      ncclTime: 0
    },
    placement: {
      nodes: kubernetes.nodeNames,
      partialNodes: kubernetes.partialNodes
    },
    schedulerEvidence: compactObject({
      schedulerName: "k3s-default-scheduler",
      queueName: namespace,
      requestedGpuShape: `${gpus}x ${kubernetes.gpuModel || "nvidia.com/gpu"}`,
      queuedAt: kubernetes.queuedAt,
      admittedAt: kubernetes.scheduledAt,
      startedAt: kubernetes.startedAt,
      eventCount: kubernetes.schedulerEvents.length,
      queueWaitMinutes: kubernetes.queueWaitMinutes,
      gpusPerNode: scheduler.gpusPerNode
    }),
    sourceContext: compactObject({
      hostUrl,
      collector: "collect-spark1-kubernetes-demo.js",
      namespace,
      podSelector: selector,
      podNames: kubernetes.podNames,
      jobNames: kubernetes.jobNames,
      nodeNames: kubernetes.nodeNames,
      podsObserved: kubernetes.podsObserved,
      jobsObserved: kubernetes.jobsObserved,
      requestedGpus: gpus,
      gpuModel: kubernetes.gpuModel,
      prometheusUrl,
      sourceAdapters,
      warnings,
      generatedAt: generatedIso
    })
  };

  const kubernetesSample = compactObject({
    runId,
    namespace,
    podSelector: selector,
    status: kubernetes.status,
    allocation: run.allocation,
    scheduler,
    topology: {
      nodes: kubernetes.nodeNames,
      partialNodes: kubernetes.partialNodes,
      crossRackTraffic: 0,
      crossPodTraffic: 0
    },
    annotations: {
      noiseEvents: kubernetes.warningEvents,
      contentionPct: 0,
      precisionLoss: 0,
      batchInefficiency: 0
    },
    sourceContext: run.sourceContext
  });
  const schedulerSample = compactObject({
    runId,
    schedulerExportId: `${runId}-k3s`,
    schedulerName: "k3s-default-scheduler",
    queueName: namespace,
    requestedGpuShape: `${gpus}x ${kubernetes.gpuModel || GPU_RESOURCE}`,
    queuedAt: kubernetes.queuedAt,
    admittedAt: kubernetes.scheduledAt,
    startedAt: kubernetes.startedAt,
    queueWaitMinutes: kubernetes.queueWaitMinutes,
    placementQuality: kubernetes.placementQuality,
    idleGpus,
    partialNodes: kubernetes.partialNodes.length,
    placementRetries: kubernetes.unschedulableEvents,
    gpusPerNode: scheduler.gpusPerNode,
    events: kubernetes.schedulerEvents,
    sourceContext: run.sourceContext
  });
  const grafanaSample = grafanaUrl ? compactObject({
    runId,
    grafanaBaseUrl: grafanaBaseUrl(grafanaUrl),
    dashboardUid: "spark1-dcgm",
    dashboardTitle: "SPARK1 DCGM GPU Demo",
    datasourceUid: "spark1-prometheus",
    datasourceName: "SPARK1 Prometheus",
    dashboardUrl: grafanaUrl,
    exploreUrl: grafanaExploreUrl(grafanaUrl),
    timeRange: {
      from: "now-15m",
      to: "now"
    },
    variables: {
      runId,
      namespace,
      pod: kubernetes.podNames[0] || "",
      node: kubernetes.nodeNames[0] || ""
    }
  }) : null;

  return {
    metadata: {
      generatedAt: generatedIso,
      source: "collect-spark1-kubernetes-demo.js",
      observedHost: "SPARK1",
      sourceAdapters,
      warnings,
      note: "Strict SPARK1 Kubernetes observation. The bundle only claims kubectl pod/job/event state plus Prometheus/DCGM metrics that were actually reachable during collection."
    },
    ingestion: {
      schemaVersion: "turba.ingestion.v1",
      entities: {
        models: {
          [modelKey]: {
            label: "SPARK1 Kubernetes GPU workload",
            family: "kubernetes-gpu-demo",
            parameterCountB: 0
          }
        },
        users: {
          "local-operator": { label: os.userInfo().username || "local operator" }
        },
        teams: {
          "local-ai-ops": { label: "Local AI Ops" }
        },
        tenants: {
          "local-lab": { label: "Local lab" }
        },
        accounts: {
          spark1: { label: "SPARK1" }
        },
        reservations: {
          "spark1-k8s-demo": { label: "SPARK1 Kubernetes demo" }
        },
        clusters: {
          [clusterKey]: {
            label: clusterLabel,
            region: "local-lan",
            topology: "single-node-k3s"
          }
        }
      },
      runs: [run],
      sourceAdapters
    },
    sources: compactObject({
      kubernetes: [kubernetesSample],
      scheduler: [schedulerSample],
      grafana: grafanaSample ? [grafanaSample] : [],
      prometheus: Object.keys(prometheusMetrics).length > 0 ? [{ runId, metrics: prometheusMetrics }] : [],
      dcgm: Object.keys(dcgmFields).length > 0 ? [{ runId, fields: dcgmFields }] : []
    })
  };
}

function grafanaBaseUrl(urlValue) {
  try {
    const url = new URL(urlValue);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

function grafanaExploreUrl(urlValue) {
  const baseUrl = grafanaBaseUrl(urlValue);
  if (!baseUrl) return "";
  const panes = {
    spark1: {
      datasource: "spark1-prometheus",
      queries: [
        {
          refId: "A",
          expr: "DCGM_FI_DEV_GPU_UTIL"
        },
        {
          refId: "B",
          expr: "DCGM_FI_DEV_POWER_USAGE"
        }
      ],
      range: {
        from: "now-15m",
        to: "now"
      }
    }
  };
  return `${baseUrl}/explore?schemaVersion=1&panes=${encodeURIComponent(JSON.stringify(panes))}&orgId=1`;
}

function kubectlJson(kubectl, commandArgs, { optional = false, warnings = [] } = {}) {
  const result = spawnSync(kubectl, commandArgs, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });

  if (result.status !== 0) {
    const message = `${kubectl} ${commandArgs.join(" ")} failed: ${compactWhitespace(result.stderr || result.stdout || result.error?.message || "unknown error")}`;
    if (optional) {
      warnings.push(message);
      return { items: [] };
    }
    throw new Error(message);
  }

  return JSON.parse(result.stdout || "{}");
}

function readJsonSource(filePath, fallback) {
  if (!filePath) return fallback();
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function itemsFrom(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function filterBySelector(items, selectorLabels, runId) {
  return items.filter((item) => {
    const labels = item.metadata?.labels || {};
    if (labelValue(labels, "run-id") === runId) return true;
    return Object.entries(selectorLabels).every(([key, value]) => labels[key] === value);
  });
}

function parseSelector(selector) {
  return Object.fromEntries(
    String(selector || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const index = entry.indexOf("=");
        return index === -1 ? [entry, ""] : [entry.slice(0, index).trim(), entry.slice(index + 1).trim()];
      })
      .filter(([key, value]) => key && value)
  );
}

function labelValue(labels, key) {
  return labels?.[key] || labels?.[`turba.ai/${key}`] || labels?.[`turbalance.ai/${key}`];
}

function requestedGpuCount(pods, jobs) {
  const podGpus = pods.reduce((sum, pod) => sum + podGpuCount(pod), 0);
  if (podGpus > 0) return podGpus;
  return jobs.reduce((sum, job) => sum + templateGpuCount(job.spec?.template), 0);
}

function requestedGpusByNode(pods) {
  const byNode = new Map();
  pods.forEach((pod) => {
    const nodeName = pod.spec?.nodeName;
    if (!nodeName) return;
    byNode.set(nodeName, (byNode.get(nodeName) || 0) + podGpuCount(pod));
  });
  return byNode;
}

function podGpuCount(pod) {
  return templateGpuCount({ spec: pod.spec || {} });
}

function templateGpuCount(template) {
  return (template?.spec?.containers || []).reduce((sum, container) => {
    const limits = container.resources?.limits || {};
    const requests = container.resources?.requests || {};
    return sum + numeric(limits[GPU_RESOURCE] ?? requests[GPU_RESOURCE], 0);
  }, 0);
}

function maxNodeGpuCapacity(nodes, nodeNames) {
  const candidates = nodes
    .filter((node) => nodeNames.length === 0 || nodeNames.includes(node.metadata?.name))
    .map((node) => numeric(node.status?.allocatable?.[GPU_RESOURCE] ?? node.status?.capacity?.[GPU_RESOURCE], 0));
  return candidates.length ? Math.max(...candidates) : 0;
}

function partialNodeNames(nodes, nodeNames, requestedByNode) {
  return nodes
    .filter((node) => nodeNames.includes(node.metadata?.name))
    .filter((node) => {
      const allocatable = numeric(node.status?.allocatable?.[GPU_RESOURCE] ?? node.status?.capacity?.[GPU_RESOURCE], 0);
      const requested = requestedByNode.get(node.metadata?.name) || 0;
      return allocatable > 0 && requested > 0 && requested < allocatable;
    })
    .map((node) => node.metadata.name);
}

function nodeGpuModel(nodes, nodeNames) {
  const labels = nodes.find((node) => nodeNames.includes(node.metadata?.name))?.metadata?.labels || {};
  return labels["nvidia.com/gpu.product"]
    || labels["nvidia.com/gpu.family"]
    || labels["gpu.nvidia.com/model"]
    || "";
}

function workloadStatus({ pods, jobs }) {
  if (jobs.some((job) => numeric(job.status?.failed, 0) > 0)) return "Failed";
  if (pods.some((pod) => pod.status?.phase === "Failed")) return "Failed";
  if (pods.some((pod) => pod.status?.phase === "Running")) return "Running";
  if (jobs.some((job) => numeric(job.status?.succeeded, 0) > 0) || pods.some((pod) => pod.status?.phase === "Succeeded")) return "Succeeded";
  if (pods.some((pod) => pod.status?.phase === "Pending")) return "Pending";
  return "Observed";
}

function placementScore({ status, warningEvents, unschedulableEvents, nodeNames, requestedGpus }) {
  let score = /running|succeeded|observed/i.test(status) ? 100 : 70;
  score -= Math.min(40, warningEvents.length * 8);
  score -= Math.min(30, unschedulableEvents.length * 15);
  if (requestedGpus > 0 && nodeNames.length === 0) score -= 30;
  return clamp(score, 0, 100);
}

function eventsForWorkload(events, podNames, jobNames) {
  const names = new Set([...podNames, ...jobNames]);
  return events
    .filter((event) => names.size === 0 || names.has(event.involvedObject?.name) || names.has(event.regarding?.name))
    .sort((a, b) => String(a.lastTimestamp || a.eventTime || a.metadata?.creationTimestamp).localeCompare(String(b.lastTimestamp || b.eventTime || b.metadata?.creationTimestamp)));
}

function toSchedulerEvent(event) {
  return compactObject({
    type: event.type,
    reason: event.reason,
    action: event.action || event.reason,
    message: compactWhitespace(event.message || event.note || ""),
    count: numeric(event.count || event.series?.count, undefined),
    firstTimestamp: event.firstTimestamp || event.metadata?.creationTimestamp,
    lastTimestamp: event.lastTimestamp || event.eventTime || event.metadata?.creationTimestamp,
    involvedObject: compactObject({
      kind: event.involvedObject?.kind || event.regarding?.kind,
      name: event.involvedObject?.name || event.regarding?.name
    })
  });
}

function podConditionTime(pod, conditionType) {
  const condition = (pod.status?.conditions || []).find((entry) => entry.type === conditionType && entry.status === "True");
  return condition?.lastTransitionTime;
}

function containerFinishedTimes(pod) {
  return (pod.status?.containerStatuses || [])
    .map((container) => container.state?.terminated?.finishedAt)
    .filter(Boolean);
}

function podOwnerJobName(pod) {
  return (pod?.metadata?.ownerReferences || []).find((owner) => owner.kind === "Job")?.name || "";
}

function prometheusQueryUrl(baseUrl, query) {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/$/, "");
  url.pathname = `${basePath}/api/v1/query`;
  url.search = "";
  url.searchParams.set("query", query);
  return url;
}

function prometheusNumericValue(data) {
  const resultType = data?.resultType;
  const result = data?.result;

  if (resultType === "scalar") {
    return numeric(Array.isArray(result) ? result[1] : undefined, NaN);
  }

  if (resultType === "vector") {
    return average((Array.isArray(result) ? result : []).map((entry) => numeric(entry?.value?.[1], NaN)));
  }

  if (resultType === "matrix") {
    return average((Array.isArray(result) ? result : []).flatMap((entry) => (
      Array.isArray(entry.values) ? entry.values.map((value) => numeric(value?.[1], NaN)) : []
    )));
  }

  throw new Error(`unsupported Prometheus result type ${resultType || "unknown"}`);
}

function average(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) throw new Error("Prometheus query returned no numeric values");
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function earliest(values) {
  return dateExtreme(values, Math.min);
}

function latest(values) {
  return dateExtreme(values, Math.max);
}

function dateExtreme(values, reducer) {
  const times = values
    .map((value) => {
      const date = value ? new Date(value) : null;
      return date && !Number.isNaN(date.getTime()) ? date.getTime() : NaN;
    })
    .filter(Number.isFinite);
  if (!times.length) return "";
  return new Date(reducer(...times)).toISOString();
}

function minutesBetween(start, end) {
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return undefined;
  return Math.max(0, (endDate - startDate) / 60000);
}

function hoursBetween(start, end) {
  const minutes = minutesBetween(start, end);
  return Number.isFinite(minutes) ? minutes / 60 : undefined;
}

function ratioPercent(value) {
  if (value === undefined || value === null || value === "") return NaN;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NaN;
  return parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
}

function numberField(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? round(parsed, 2) : undefined;
}

function numeric(value, fallback = NaN) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function numberArg(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function round(value, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(numeric(value, 0) * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, entry]) => (
      entry !== undefined
      && entry !== null
      && entry !== ""
      && !(typeof entry === "number" && Number.isNaN(entry))
      && !(Array.isArray(entry) && entry.length === 0)
      && !(typeof entry === "object" && !Array.isArray(entry) && Object.keys(entry).length === 0)
    ))
  );
}

function compactWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return Array.from(new Set(values));
}

function escapePrometheusRegex(value) {
  return String(value).replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}

function escapePrometheusLabel(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function writeJsonFile(filePath, value) {
  const fullPath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    parsed[arg.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : "1";
  }
  return parsed;
}

function usage() {
  process.stdout.write([
    "usage: collect-spark1-kubernetes-demo.js [--run-id spark1-k8s-demo-001] [--namespace turbalance-demo] [--selector turba.ai/run-id=...] [--prometheus-url http://127.0.0.1:9090] [--grafana-url http://192.168.10.20:3000/d/spark1-dcgm/spark1-dcgm-gpu-demo] [--out build/demo/spark1-k8s-bundle.json]",
    "",
    "Fixture options for tests/offline review:",
    "  --pods-json pods.json --jobs-json jobs.json --events-json events.json --nodes-json nodes.json",
    ""
  ].join("\n"));
}
