const TOPOLOGY = [
  {
    id: "pod-a",
    label: "Pod A",
    tier: "pod-spine",
    racks: [
      { id: "A1", label: "Rack A1", tier: "rack-leaf", nodes: ["A1-01", "A1-02", "A1-03", "A1-04"] },
      { id: "A2", label: "Rack A2", tier: "rack-leaf", nodes: ["A2-01", "A2-02", "A2-03", "A2-04"] }
    ]
  },
  {
    id: "pod-b",
    label: "Pod B",
    tier: "pod-spine",
    racks: [
      { id: "B1", label: "Rack B1", tier: "rack-leaf", nodes: ["B1-01", "B1-02", "B1-03", "B1-04"] },
      { id: "B2", label: "Rack B2", tier: "rack-leaf", nodes: ["B2-01", "B2-02", "B2-03", "B2-04"] }
    ]
  },
  {
    id: "pod-c",
    label: "Pod C",
    tier: "pod-spine",
    racks: [
      { id: "C1", label: "Rack C1", tier: "rack-leaf", nodes: ["C1-01", "C1-02", "C1-03", "C1-04"] },
      { id: "C2", label: "Rack C2", tier: "rack-leaf", nodes: ["C2-01", "C2-02", "C2-03", "C2-04"] }
    ]
  }
];

const NODE_INDEX = buildNodeIndex();

const INGESTION_SCHEMA = {
  version: "turba.ingestion.v1",
  runSections: [
    "refs",
    "allocation",
    "utilization",
    "communication",
    "inputPipeline",
    "memory",
    "scheduler",
    "reliability",
    "configuration",
    "work",
    "baseline",
    "placement"
  ]
};

const STORAGE_SCHEMA = {
  version: "turba.workspace.v2",
  key: "turba.analytics.workspace.v2"
};

const SAMPLE_INGESTION = {
  schemaVersion: INGESTION_SCHEMA.version,
  entities: {
    models: {
      "llama-70b": { label: "Llama 70B" },
      "mistral-7b": { label: "Mistral 7B" },
      "mixtral-8x7b": { label: "Mixtral 8x7B" },
      "vit-g": { label: "ViT-G" },
      "llama-13b": { label: "Llama 13B" }
    },
    users: {
      maya: { label: "maya" },
      liam: { label: "liam" },
      nora: { label: "nora" },
      sana: { label: "sana" },
      omar: { label: "omar" }
    },
    teams: {
      frontier: { label: "Frontier" },
      "applied-ai": { label: "Applied AI" },
      inference: { label: "Inference" },
      research: { label: "Research" },
      evaluation: { label: "Evaluation" }
    },
    clusters: {
      "h100-prod-west": { label: "h100-prod-west", gpuModel: "H100 SXM" },
      "h100-prod-east": { label: "h100-prod-east", gpuModel: "H100 PCIe" },
      "a100-research": { label: "a100-research", gpuModel: "A100 80GB" }
    }
  },
  runs: [
    {
      id: "run-7421",
      name: "llama-70b-pretrain-7421",
      refs: {
        model: "llama-70b",
        user: "maya",
        team: "frontier",
        cluster: "h100-prod-west"
      },
      status: "Running",
      allocation: {
        durationHours: 11.6,
        gpus: 192,
        allocatedGpuHours: 2227
      },
      utilization: {
        gpuUtil: 62,
        usefulCompute: 41,
        smOccupancy: 55,
        tensorCoreUtil: 47
      },
      communication: {
        ncclTime: 29,
        networkWait: 12,
        crossRackTraffic: 68,
        crossPodTraffic: 41,
        allToAllTime: 2
      },
      inputPipeline: {
        dataloaderStall: 5,
        storageWait: 3,
        cpuPrep: 4
      },
      memory: {
        hbmCapacity: 71,
        hbmBandwidth: 64,
        memoryFragmentation: 14,
        kvCachePressure: 0
      },
      scheduler: {
        placementQuality: 53,
        idleGpus: 0,
        partialNodes: 3,
        queueWaitMinutes: 24
      },
      reliability: {
        noiseEvents: 1,
        contentionPct: 14,
        stepRegularity: 91,
        latencyTail: 0
      },
      configuration: {
        precisionLoss: 7,
        batchInefficiency: 10
      },
      work: {
        tokensM: 690,
        steps: 12800,
        inferenceRequestsM: 0
      },
      baseline: {
        stepTime: 1.82,
        currentStepTime: 2.11,
        ncclTime: 22,
        gpuEfficiency: 56,
        queueWaitMinutes: 18,
        costPerMillionTokens: 19.2
      },
      placement: {
        nodes: [
          "A1-01", "A1-02", "A1-03", "A1-04",
          "A2-01", "A2-02", "A2-03", "A2-04",
          "B1-01", "B1-02", "B1-03", "B1-04",
          "B2-01", "B2-02", "B2-03", "B2-04",
          "C1-01", "C1-02", "C1-03", "C1-04",
          "C2-01", "C2-02", "C2-03", "C2-04"
        ],
        partialNodes: ["C2-03", "C2-04"]
      }
    },
    {
      id: "run-7318",
      name: "customer-rag-finetune-7318",
      refs: {
        model: "mistral-7b",
        user: "liam",
        team: "applied-ai",
        cluster: "h100-prod-west"
      },
      status: "Completed",
      allocation: {
        durationHours: 7.3,
        gpus: 32,
        allocatedGpuHours: 234
      },
      utilization: {
        gpuUtil: 49,
        usefulCompute: 35,
        smOccupancy: 42,
        tensorCoreUtil: 39
      },
      communication: {
        ncclTime: 7,
        networkWait: 4,
        crossRackTraffic: 19,
        crossPodTraffic: 0,
        allToAllTime: 0
      },
      inputPipeline: {
        dataloaderStall: 18,
        storageWait: 15,
        cpuPrep: 12
      },
      memory: {
        hbmCapacity: 46,
        hbmBandwidth: 38,
        memoryFragmentation: 18,
        kvCachePressure: 0
      },
      scheduler: {
        placementQuality: 78,
        idleGpus: 4,
        partialNodes: 1,
        queueWaitMinutes: 11
      },
      reliability: {
        noiseEvents: 0,
        contentionPct: 5,
        stepRegularity: 72,
        latencyTail: 0
      },
      configuration: {
        precisionLoss: 4,
        batchInefficiency: 28
      },
      work: {
        tokensM: 118,
        steps: 4200,
        inferenceRequestsM: 0
      },
      baseline: {
        stepTime: 0.92,
        currentStepTime: 1.08,
        ncclTime: 6,
        gpuEfficiency: 42,
        queueWaitMinutes: 9,
        costPerMillionTokens: 14.8
      },
      placement: {
        nodes: ["A1-01", "A1-02", "A1-03", "A1-04"],
        partialNodes: ["A1-04"]
      }
    },
    {
      id: "svc-1190",
      name: "genai-batch-serving-1190",
      refs: {
        model: "mixtral-8x7b",
        user: "nora",
        team: "inference",
        cluster: "h100-prod-east"
      },
      status: "Running",
      allocation: {
        durationHours: 16.2,
        gpus: 48,
        allocatedGpuHours: 778
      },
      utilization: {
        gpuUtil: 57,
        usefulCompute: 44,
        smOccupancy: 48,
        tensorCoreUtil: 43
      },
      communication: {
        ncclTime: 4,
        networkWait: 7,
        crossRackTraffic: 24,
        crossPodTraffic: 0,
        allToAllTime: 13
      },
      inputPipeline: {
        dataloaderStall: 3,
        storageWait: 4,
        cpuPrep: 9
      },
      memory: {
        hbmCapacity: 89,
        hbmBandwidth: 82,
        memoryFragmentation: 36,
        kvCachePressure: 87
      },
      scheduler: {
        placementQuality: 81,
        idleGpus: 6,
        partialNodes: 2,
        queueWaitMinutes: 7
      },
      reliability: {
        noiseEvents: 1,
        contentionPct: 11,
        stepRegularity: 52,
        latencyTail: 74
      },
      configuration: {
        precisionLoss: 6,
        batchInefficiency: 18
      },
      work: {
        tokensM: 0,
        steps: 0,
        inferenceRequestsM: 42
      },
      baseline: {
        stepTime: 0,
        currentStepTime: 0,
        ncclTime: 5,
        gpuEfficiency: 48,
        queueWaitMinutes: 6,
        costPerMillionTokens: 0
      },
      placement: {
        nodes: ["B1-01", "B1-02", "B1-03", "B1-04", "B2-01", "B2-02"],
        partialNodes: ["B2-02"]
      }
    },
    {
      id: "run-7440",
      name: "vision-transformer-scale-7440",
      refs: {
        model: "vit-g",
        user: "sana",
        team: "research",
        cluster: "a100-research"
      },
      status: "Completed",
      allocation: {
        durationHours: 9.4,
        gpus: 64,
        allocatedGpuHours: 602
      },
      utilization: {
        gpuUtil: 84,
        usefulCompute: 73,
        smOccupancy: 79,
        tensorCoreUtil: 81
      },
      communication: {
        ncclTime: 9,
        networkWait: 5,
        crossRackTraffic: 18,
        crossPodTraffic: 0,
        allToAllTime: 0
      },
      inputPipeline: {
        dataloaderStall: 4,
        storageWait: 2,
        cpuPrep: 3
      },
      memory: {
        hbmCapacity: 67,
        hbmBandwidth: 74,
        memoryFragmentation: 10,
        kvCachePressure: 0
      },
      scheduler: {
        placementQuality: 88,
        idleGpus: 0,
        partialNodes: 0,
        queueWaitMinutes: 15
      },
      reliability: {
        noiseEvents: 0,
        contentionPct: 3,
        stepRegularity: 94,
        latencyTail: 0
      },
      configuration: {
        precisionLoss: 2,
        batchInefficiency: 5
      },
      work: {
        tokensM: 0,
        steps: 22600,
        inferenceRequestsM: 0
      },
      baseline: {
        stepTime: 0.38,
        currentStepTime: 0.39,
        ncclTime: 8,
        gpuEfficiency: 72,
        queueWaitMinutes: 16,
        costPerMillionTokens: 0
      },
      placement: {
        nodes: ["C1-01", "C1-02", "C1-03", "C1-04", "C2-01", "C2-02", "C2-03", "C2-04"],
        partialNodes: []
      }
    },
    {
      id: "eval-2084",
      name: "safety-eval-sweep-2084",
      refs: {
        model: "llama-13b",
        user: "omar",
        team: "evaluation",
        cluster: "h100-prod-west"
      },
      status: "Completed",
      allocation: {
        durationHours: 4.8,
        gpus: 16,
        allocatedGpuHours: 77
      },
      utilization: {
        gpuUtil: 31,
        usefulCompute: 21,
        smOccupancy: 27,
        tensorCoreUtil: 22
      },
      communication: {
        ncclTime: 2,
        networkWait: 3,
        crossRackTraffic: 8,
        crossPodTraffic: 0,
        allToAllTime: 0
      },
      inputPipeline: {
        dataloaderStall: 9,
        storageWait: 5,
        cpuPrep: 7
      },
      memory: {
        hbmCapacity: 34,
        hbmBandwidth: 28,
        memoryFragmentation: 24,
        kvCachePressure: 0
      },
      scheduler: {
        placementQuality: 66,
        idleGpus: 8,
        partialNodes: 2,
        queueWaitMinutes: 32
      },
      reliability: {
        noiseEvents: 0,
        contentionPct: 4,
        stepRegularity: 41,
        latencyTail: 0
      },
      configuration: {
        precisionLoss: 14,
        batchInefficiency: 42
      },
      work: {
        tokensM: 36,
        steps: 900,
        inferenceRequestsM: 0
      },
      baseline: {
        stepTime: 1.2,
        currentStepTime: 1.3,
        ncclTime: 2,
        gpuEfficiency: 26,
        queueWaitMinutes: 28,
        costPerMillionTokens: 12.4
      },
      placement: {
        nodes: ["A2-01", "A2-02"],
        partialNodes: ["A2-02"]
      }
    }
  ]
};

const SAMPLE_SOURCE_EXPORTS = {
  prometheus: [
    {
      runId: "run-7421",
      metrics: {
        turba_gpu_utilization_ratio: 0.62,
        turba_useful_compute_ratio: 0.41,
        turba_nccl_time_ratio: 0.29,
        turba_network_wait_ratio: 0.12,
        turba_dataloader_stall_ratio: 0.05,
        turba_storage_wait_ratio: 0.03,
        turba_cpu_prep_ratio: 0.04,
        turba_queue_wait_minutes: 24,
        turba_step_regularity_ratio: 0.91,
        turba_latency_tail_ratio: 0,
        turba_tokens_million_total: 690,
        turba_training_steps_total: 12800,
        turba_inference_requests_million_total: 0,
        turba_all_to_all_time_ratio: 0.02
      }
    },
    {
      runId: "run-7318",
      metrics: {
        turba_gpu_utilization_ratio: 0.49,
        turba_useful_compute_ratio: 0.35,
        turba_nccl_time_ratio: 0.07,
        turba_network_wait_ratio: 0.04,
        turba_dataloader_stall_ratio: 0.18,
        turba_storage_wait_ratio: 0.15,
        turba_cpu_prep_ratio: 0.12,
        turba_queue_wait_minutes: 11,
        turba_step_regularity_ratio: 0.72,
        turba_latency_tail_ratio: 0,
        turba_tokens_million_total: 118,
        turba_training_steps_total: 4200,
        turba_inference_requests_million_total: 0,
        turba_all_to_all_time_ratio: 0
      }
    },
    {
      runId: "svc-1190",
      metrics: {
        turba_gpu_utilization_ratio: 0.57,
        turba_useful_compute_ratio: 0.44,
        turba_nccl_time_ratio: 0.04,
        turba_network_wait_ratio: 0.07,
        turba_dataloader_stall_ratio: 0.03,
        turba_storage_wait_ratio: 0.04,
        turba_cpu_prep_ratio: 0.09,
        turba_queue_wait_minutes: 7,
        turba_step_regularity_ratio: 0.52,
        turba_latency_tail_ratio: 0.74,
        turba_tokens_million_total: 0,
        turba_training_steps_total: 0,
        turba_inference_requests_million_total: 42,
        turba_all_to_all_time_ratio: 0.13
      }
    },
    {
      runId: "run-7440",
      metrics: {
        turba_gpu_utilization_ratio: 0.84,
        turba_useful_compute_ratio: 0.73,
        turba_nccl_time_ratio: 0.09,
        turba_network_wait_ratio: 0.05,
        turba_dataloader_stall_ratio: 0.04,
        turba_storage_wait_ratio: 0.02,
        turba_cpu_prep_ratio: 0.03,
        turba_queue_wait_minutes: 15,
        turba_step_regularity_ratio: 0.94,
        turba_latency_tail_ratio: 0,
        turba_tokens_million_total: 0,
        turba_training_steps_total: 22600,
        turba_inference_requests_million_total: 0,
        turba_all_to_all_time_ratio: 0
      }
    },
    {
      runId: "eval-2084",
      metrics: {
        turba_gpu_utilization_ratio: 0.31,
        turba_useful_compute_ratio: 0.21,
        turba_nccl_time_ratio: 0.02,
        turba_network_wait_ratio: 0.03,
        turba_dataloader_stall_ratio: 0.09,
        turba_storage_wait_ratio: 0.05,
        turba_cpu_prep_ratio: 0.07,
        turba_queue_wait_minutes: 32,
        turba_step_regularity_ratio: 0.41,
        turba_latency_tail_ratio: 0,
        turba_tokens_million_total: 36,
        turba_training_steps_total: 900,
        turba_inference_requests_million_total: 0,
        turba_all_to_all_time_ratio: 0
      }
    }
  ],
  dcgm: [
    {
      runId: "run-7421",
      fields: {
        DCGM_FI_PROF_SM_OCCUPANCY: 55,
        DCGM_FI_PROF_PIPE_TENSOR_ACTIVE: 47,
        DCGM_FI_DEV_FB_USED_RATIO: 71,
        DCGM_FI_PROF_DRAM_ACTIVE: 64,
        DCGM_FI_DEV_MEM_FRAGMENTATION: 14,
        DCGM_FI_DEV_KV_CACHE_PRESSURE: 0
      }
    },
    {
      runId: "run-7318",
      fields: {
        DCGM_FI_PROF_SM_OCCUPANCY: 42,
        DCGM_FI_PROF_PIPE_TENSOR_ACTIVE: 39,
        DCGM_FI_DEV_FB_USED_RATIO: 46,
        DCGM_FI_PROF_DRAM_ACTIVE: 38,
        DCGM_FI_DEV_MEM_FRAGMENTATION: 18,
        DCGM_FI_DEV_KV_CACHE_PRESSURE: 0
      }
    },
    {
      runId: "svc-1190",
      fields: {
        DCGM_FI_PROF_SM_OCCUPANCY: 48,
        DCGM_FI_PROF_PIPE_TENSOR_ACTIVE: 43,
        DCGM_FI_DEV_FB_USED_RATIO: 89,
        DCGM_FI_PROF_DRAM_ACTIVE: 82,
        DCGM_FI_DEV_MEM_FRAGMENTATION: 36,
        DCGM_FI_DEV_KV_CACHE_PRESSURE: 87
      }
    },
    {
      runId: "run-7440",
      fields: {
        DCGM_FI_PROF_SM_OCCUPANCY: 79,
        DCGM_FI_PROF_PIPE_TENSOR_ACTIVE: 81,
        DCGM_FI_DEV_FB_USED_RATIO: 67,
        DCGM_FI_PROF_DRAM_ACTIVE: 74,
        DCGM_FI_DEV_MEM_FRAGMENTATION: 10,
        DCGM_FI_DEV_KV_CACHE_PRESSURE: 0
      }
    },
    {
      runId: "eval-2084",
      fields: {
        DCGM_FI_PROF_SM_OCCUPANCY: 27,
        DCGM_FI_PROF_PIPE_TENSOR_ACTIVE: 22,
        DCGM_FI_DEV_FB_USED_RATIO: 34,
        DCGM_FI_PROF_DRAM_ACTIVE: 28,
        DCGM_FI_DEV_MEM_FRAGMENTATION: 24,
        DCGM_FI_DEV_KV_CACHE_PRESSURE: 0
      }
    }
  ],
  kubernetes: [
    {
      runId: "run-7421",
      namespace: "frontier",
      podSelector: "job-name=llama-70b-pretrain-7421",
      status: "Running",
      allocation: {
        durationHours: 11.6,
        gpus: 192,
        allocatedGpuHours: 2227
      },
      scheduler: {
        placementQuality: 53,
        idleGpus: 0,
        partialNodes: 3,
        queueWaitMinutes: 24
      },
      topology: {
        nodes: [
          "A1-01", "A1-02", "A1-03", "A1-04",
          "A2-01", "A2-02", "A2-03", "A2-04",
          "B1-01", "B1-02", "B1-03", "B1-04",
          "B2-01", "B2-02", "B2-03", "B2-04",
          "C1-01", "C1-02", "C1-03", "C1-04",
          "C2-01", "C2-02", "C2-03", "C2-04"
        ],
        partialNodes: ["C2-03", "C2-04"],
        crossRackTraffic: 68,
        crossPodTraffic: 41
      },
      annotations: {
        noiseEvents: 1,
        contentionPct: 14,
        precisionLoss: 7,
        batchInefficiency: 10
      }
    },
    {
      runId: "run-7318",
      namespace: "applied-ai",
      podSelector: "job-name=customer-rag-finetune-7318",
      status: "Completed",
      allocation: {
        durationHours: 7.3,
        gpus: 32,
        allocatedGpuHours: 234
      },
      scheduler: {
        placementQuality: 78,
        idleGpus: 4,
        partialNodes: 1,
        queueWaitMinutes: 11
      },
      topology: {
        nodes: ["A1-01", "A1-02", "A1-03", "A1-04"],
        partialNodes: ["A1-04"],
        crossRackTraffic: 19,
        crossPodTraffic: 0
      },
      annotations: {
        noiseEvents: 0,
        contentionPct: 5,
        precisionLoss: 4,
        batchInefficiency: 28
      }
    },
    {
      runId: "svc-1190",
      namespace: "inference",
      podSelector: "app=genai-batch-serving",
      status: "Running",
      allocation: {
        durationHours: 16.2,
        gpus: 48,
        allocatedGpuHours: 778
      },
      scheduler: {
        placementQuality: 81,
        idleGpus: 6,
        partialNodes: 2,
        queueWaitMinutes: 7
      },
      topology: {
        nodes: ["B1-01", "B1-02", "B1-03", "B1-04", "B2-01", "B2-02"],
        partialNodes: ["B2-02"],
        crossRackTraffic: 24,
        crossPodTraffic: 0
      },
      annotations: {
        noiseEvents: 1,
        contentionPct: 11,
        precisionLoss: 6,
        batchInefficiency: 18
      }
    },
    {
      runId: "run-7440",
      namespace: "research",
      podSelector: "job-name=vision-transformer-scale-7440",
      status: "Completed",
      allocation: {
        durationHours: 9.4,
        gpus: 64,
        allocatedGpuHours: 602
      },
      scheduler: {
        placementQuality: 88,
        idleGpus: 0,
        partialNodes: 0,
        queueWaitMinutes: 15
      },
      topology: {
        nodes: ["C1-01", "C1-02", "C1-03", "C1-04", "C2-01", "C2-02", "C2-03", "C2-04"],
        partialNodes: [],
        crossRackTraffic: 18,
        crossPodTraffic: 0
      },
      annotations: {
        noiseEvents: 0,
        contentionPct: 3,
        precisionLoss: 2,
        batchInefficiency: 5
      }
    },
    {
      runId: "eval-2084",
      namespace: "evaluation",
      podSelector: "job-name=safety-eval-sweep-2084",
      status: "Completed",
      allocation: {
        durationHours: 4.8,
        gpus: 16,
        allocatedGpuHours: 77
      },
      scheduler: {
        placementQuality: 66,
        idleGpus: 8,
        partialNodes: 2,
        queueWaitMinutes: 32
      },
      topology: {
        nodes: ["A2-01", "A2-02"],
        partialNodes: ["A2-02"],
        crossRackTraffic: 8,
        crossPodTraffic: 0
      },
      annotations: {
        noiseEvents: 0,
        contentionPct: 4,
        precisionLoss: 14,
        batchInefficiency: 42
      }
    }
  ]
};

const analytics = window.TurbaAnalytics;
const ncclParser = window.TurbaNcclTraceParser;
const ncclTraceFixtures = window.TurbaNcclTraceFixtures || [];
const SNAPSHOT_SCOPES = ["job", "model", "user", "team", "cluster"];
const SNAPSHOT_LIMIT = 360;

const DEFAULT_INGESTION = applySourceImports(SAMPLE_INGESTION, SAMPLE_SOURCE_EXPORTS, ncclTraceFixtures);
let workspaceStore = loadWorkspaceStore(DEFAULT_INGESTION);
let activeIngestion = applyPersistedBaselines(workspaceStore.ingestion, workspaceStore.baselines);
let jobs = normalizeIngestion(activeIngestion);
let snapshotHistory = normalizeSnapshotStore(workspaceStore.snapshots);

const state = {
  scope: "job",
  selectedKey: "run-7421",
  window: "Last 24 hours",
  rate: 6.2,
  samePod: false,
  trendMetric: "usefulCompute",
  lastAnalysis: safeDate(workspaceStore.lastAnalysisAt, new Date("2026-05-30T22:01:00-07:00")),
  analyzing: false,
  storageLabel: workspaceStore.storageLabel,
  storageTone: workspaceStore.storageTone,
  ingestLabel: "Sample feed",
  ingestTone: "good"
};

if (snapshotHistory.length === 0) {
  captureAnalysisSnapshot("Seeded sample", state.lastAnalysis);
  persistWorkspaceStore();
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1
});

const number = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0
});

const TREND_METRIC_DEFS = {
  usefulCompute: {
    label: "Useful compute",
    unit: "points",
    higherIsBetter: true,
    format: (value) => pct(value),
    formatDelta: (value) => `${signedNumber(value)} pts`
  },
  wastedGpuHours: {
    label: "Wasted GPU-hours",
    unit: "GPU-hours",
    higherIsBetter: false,
    format: (value) => number.format(value),
    formatDelta: (value) => signedNumber(value)
  },
  ncclTime: {
    label: "NCCL time",
    unit: "points",
    higherIsBetter: false,
    format: (value) => pct(value),
    formatDelta: (value) => `${signedNumber(value)} pts`
  },
  costPerUsefulGpuHour: {
    label: "Cost / useful GPU-hour",
    unit: "USD",
    higherIsBetter: false,
    format: (value) => currency.format(value),
    formatDelta: (value) => signedCurrency(value)
  }
};

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  render();
});

function loadWorkspaceStore(defaultIngestion) {
  const persisted = readWorkspaceStore();

  if (isValidWorkspaceStore(persisted)) {
    return {
      ...persisted,
      snapshots: normalizeSnapshotStore(persisted.snapshots),
      storageLabel: "Loaded locally",
      storageTone: "good"
    };
  }

  const seeded = createWorkspaceStore(defaultIngestion, {
    savedAt: new Date(),
    lastAnalysisAt: null
  });
  const saved = writeWorkspaceStore(seeded);

  return {
    ...seeded,
    storageLabel: saved ? "Seeded locally" : "Session only",
    storageTone: saved ? "good" : "watch"
  };
}

function persistWorkspaceStore() {
  const nextStore = createWorkspaceStore(activeIngestion, {
    savedAt: new Date(),
    lastAnalysisAt: state.lastAnalysis,
    snapshots: snapshotHistory
  });
  const saved = writeWorkspaceStore(nextStore);

  workspaceStore = {
    ...nextStore,
    storageLabel: saved ? "Saved locally" : "Session only",
    storageTone: saved ? "good" : "watch"
  };
  state.storageLabel = workspaceStore.storageLabel;
  state.storageTone = workspaceStore.storageTone;
}

function replaceActiveIngestion(nextIngestion, label) {
  activeIngestion = applyPersistedBaselines(nextIngestion, buildBaselineStore(nextIngestion.runs));
  jobs = normalizeIngestion(activeIngestion);
  state.selectedKey = jobs[0]?.id || "";
  state.scope = "job";
  state.ingestLabel = label;
  state.ingestTone = "good";
  state.lastAnalysis = new Date();
  captureAnalysisSnapshot(label, state.lastAnalysis);
  persistWorkspaceStore();
  render();
}

function restoreWorkspaceStore(store, label) {
  activeIngestion = applyPersistedBaselines(store.ingestion, store.baselines);
  jobs = normalizeIngestion(activeIngestion);
  snapshotHistory = normalizeSnapshotStore(store.snapshots);
  state.selectedKey = jobs[0]?.id || "";
  state.scope = "job";
  state.ingestLabel = label;
  state.ingestTone = "good";
  state.lastAnalysis = safeDate(store.lastAnalysisAt, new Date());

  if (snapshotHistory.length === 0) {
    captureAnalysisSnapshot(label, state.lastAnalysis);
  }

  persistWorkspaceStore();
  render();
}

function createWorkspaceStore(ingestion, { savedAt, lastAnalysisAt, snapshots = [] }) {
  return {
    storageSchemaVersion: STORAGE_SCHEMA.version,
    ingestionSchemaVersion: ingestion.schemaVersion,
    savedAt: dateIso(savedAt),
    lastAnalysisAt: dateIso(lastAnalysisAt),
    ingestion,
    baselines: buildBaselineStore(ingestion.runs),
    snapshots: normalizeSnapshotStore(snapshots)
  };
}

function readWorkspaceStore() {
  try {
    const raw = window.localStorage.getItem(STORAGE_SCHEMA.key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeWorkspaceStore(store) {
  try {
    window.localStorage.setItem(STORAGE_SCHEMA.key, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

function isValidWorkspaceStore(store) {
  return Boolean(
    store
      && store.storageSchemaVersion === STORAGE_SCHEMA.version
      && store.ingestionSchemaVersion === INGESTION_SCHEMA.version
      && store.ingestion?.schemaVersion === INGESTION_SCHEMA.version
      && Array.isArray(store.ingestion.runs)
      && isPlainObject(store.baselines)
  );
}

function captureAnalysisSnapshot(sourceLabel, capturedAt = new Date()) {
  const capturedAtIso = dateIso(capturedAt);
  const records = [];

  SNAPSHOT_SCOPES.forEach((scope) => {
    buildEntries(scope).forEach((entry) => {
      const summary = summarizeEntry(entry);
      const classifier = classifyBottlenecks(summary);
      records.push(snapshotFromSummary(summary, classifier, sourceLabel, capturedAtIso));
    });
  });

  snapshotHistory = normalizeSnapshotStore([...snapshotHistory, ...records]).slice(-SNAPSHOT_LIMIT);
}

function snapshotFromSummary(summary, classifier, sourceLabel, capturedAt) {
  return {
    capturedAt,
    source: sourceLabel || "Analysis",
    scope: summary.scope,
    key: summary.key,
    label: summary.label,
    window: state.window,
    rate: state.rate,
    primaryBottleneck: classifier.primary.short,
    metrics: {
      usefulCompute: summary.usefulCompute,
      gpuUtil: summary.gpuUtil,
      allocatedGpuHours: summary.allocatedGpuHours,
      usefulGpuHours: summary.usefulGpuHours,
      wastedGpuHours: summary.wastedGpuHours,
      wasteDollars: summary.wasteDollars,
      costPerUsefulGpuHour: summary.costPerUsefulGpuHour,
      ncclTime: summary.ncclTime,
      networkWait: summary.networkWait,
      placementQuality: summary.placementQuality,
      crossPodTraffic: summary.crossPodTraffic,
      queueWaitMinutes: summary.queueWaitMinutes
    }
  };
}

function normalizeSnapshotStore(records = []) {
  if (!Array.isArray(records)) return [];

  return records
    .map(normalizeSnapshotRecord)
    .filter(Boolean)
    .sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt))
    .slice(-SNAPSHOT_LIMIT);
}

function normalizeSnapshotRecord(record) {
  const capturedAt = validDateIso(record?.capturedAt);
  const scope = String(record?.scope || "");
  const key = String(record?.key || "");

  if (!capturedAt || !SNAPSHOT_SCOPES.includes(scope) || !key) {
    return null;
  }

  return {
    capturedAt,
    source: String(record.source || "Analysis"),
    scope,
    key,
    label: String(record.label || key),
    window: String(record.window || "Last 24 hours"),
    rate: numeric(record.rate),
    primaryBottleneck: String(record.primaryBottleneck || "Unknown"),
    metrics: normalizeSnapshotMetrics(record.metrics)
  };
}

function normalizeSnapshotMetrics(metrics = {}) {
  return Object.fromEntries(
    Object.entries(metrics)
      .map(([key, value]) => [key, numeric(value, Number.NaN)])
      .filter(([, value]) => Number.isFinite(value))
  );
}

function validDateIso(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
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
        }
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
        }
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

function deepMerge(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return Array.isArray(patch) ? [...patch] : patch;
  }

  return Object.entries(patch).reduce((merged, [key, value]) => {
    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = deepMerge(merged[key], value);
    } else if (Array.isArray(value)) {
      merged[key] = [...value];
    } else {
      merged[key] = value;
    }

    return merged;
  }, { ...base });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function ratioPercent(value) {
  return numeric(value) * 100;
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
    gpuModel: allocation.gpuModel || cluster.gpuModel || "Unknown GPU",
    status: run.status,
    durationHours: numeric(allocation.durationHours),
    gpus: numeric(allocation.gpus),
    allocatedGpuHours,
    ...normalizeMetrics(run),
    baseline: normalizeBaseline(run.baseline),
    placement: normalizePlacement(run.placement),
    traceAttribution: normalizeTraceAttribution(run.traceAttribution),
    source: {
      schemaVersion: INGESTION_SCHEMA.version,
      runId: run.id,
      refs,
      adapters: run.importedSources || [],
      context: run.sourceContext || {}
    }
  };
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

function normalizeMetrics(run) {
  return {
    gpuUtil: metric(run.utilization, "gpuUtil"),
    usefulCompute: metric(run.utilization, "usefulCompute"),
    smOccupancy: metric(run.utilization, "smOccupancy"),
    tensorCoreUtil: metric(run.utilization, "tensorCoreUtil"),
    ncclTime: metric(run.communication, "ncclTime"),
    networkWait: metric(run.communication, "networkWait"),
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

function normalizePlacement(placement) {
  if (Array.isArray(placement)) {
    return placement;
  }

  return makePlacement(placement?.nodes || [], placement?.partialNodes || []);
}

function entityLabel(collection, key) {
  return collection?.[key]?.label || key || "Unknown";
}

function metric(section, key) {
  return numeric(section?.[key]);
}

function numeric(value, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function safeDate(value, fallback) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function dateIso(value) {
  if (!value) return null;
  return safeDate(value, new Date()).toISOString();
}

async function ingestJsonPayload(payload, sourceLabel) {
  validateImportPayloadRoot(payload);

  if (isValidWorkspaceStore(payload)) {
    restoreWorkspaceStore(payload, restoredSourceLabel(sourceLabel));
    return;
  }

  const nextIngestion = buildIngestionFromExternalPayload(payload);
  replaceActiveIngestion(nextIngestion, sourceLabel);
}

function buildIngestionFromExternalPayload(payload) {
  validateSourceArrays(payload);
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

function extractIngestionFeed(payload, allowCurrentFeed = false) {
  if (isIngestionFeed(payload)) return payload;
  if (isIngestionFeed(payload?.ingestion)) return payload.ingestion;
  if (Array.isArray(payload?.runs)) {
    return {
      schemaVersion: INGESTION_SCHEMA.version,
      entities: payload.entities || activeIngestion.entities,
      runs: payload.runs
    };
  }

  return allowCurrentFeed ? activeIngestion : null;
}

function validateImportPayloadRoot(payload) {
  if (!isPlainObject(payload)) {
    throw new Error("Import must be a JSON object.");
  }

  if (payload.storageSchemaVersion && payload.storageSchemaVersion !== STORAGE_SCHEMA.version) {
    throw new Error(`Unsupported workspace schema: ${payload.storageSchemaVersion}. Expected ${STORAGE_SCHEMA.version}.`);
  }

  if (payload.storageSchemaVersion && !isValidWorkspaceStore(payload)) {
    throw new Error("Workspace export is missing ingestion, baselines, or schema metadata.");
  }

  if (payload.schemaVersion && payload.schemaVersion !== INGESTION_SCHEMA.version) {
    throw new Error(`Unsupported ingestion schema: ${payload.schemaVersion}. Expected ${INGESTION_SCHEMA.version}.`);
  }

  if (payload.ingestion?.schemaVersion && payload.ingestion.schemaVersion !== INGESTION_SCHEMA.version) {
    throw new Error(`Unsupported ingestion schema: ${payload.ingestion.schemaVersion}. Expected ${INGESTION_SCHEMA.version}.`);
  }

  if ("runs" in payload && !Array.isArray(payload.runs)) {
    throw new Error("The runs field must be an array.");
  }
}

function validateIngestionFeed(feed) {
  if (!Array.isArray(feed.runs) || feed.runs.length === 0) {
    throw new Error("Ingestion feed has no runs.");
  }

  feed.runs.forEach((run, index) => {
    if (!isPlainObject(run)) {
      throw new Error(`Run ${index + 1} must be an object.`);
    }
    if (!run.id) {
      throw new Error(`Run ${index + 1} is missing id.`);
    }
  });
}

function validateSourceArrays(payload) {
  const roots = [
    { label: "sources", value: payload.sources },
    { label: "sourceExports", value: payload.sourceExports },
    { label: "root", value: payload }
  ].filter((root) => isPlainObject(root.value));

  roots.forEach((root) => {
    ["prometheus", "dcgm", "kubernetes"].forEach((key) => {
      if (key in root.value && !Array.isArray(root.value[key])) {
        const prefix = root.label === "root" ? key : `${root.label}.${key}`;
        throw new Error(`${prefix} must be an array.`);
      }
    });

    ["ncclTraces", "traces", "nccl"].forEach((key) => {
      if (key in root.value && !Array.isArray(root.value[key])) {
        const prefix = root.label === "root" ? key : `${root.label}.${key}`;
        throw new Error(`${prefix} must be an array.`);
      }
    });
  });
}

function extractSourceExports(payload) {
  const sourceRoot = payload?.sources || payload?.sourceExports || payload || {};

  return {
    prometheus: Array.isArray(sourceRoot.prometheus) ? sourceRoot.prometheus : [],
    dcgm: Array.isArray(sourceRoot.dcgm) ? sourceRoot.dcgm : [],
    kubernetes: Array.isArray(sourceRoot.kubernetes) ? sourceRoot.kubernetes : []
  };
}

function extractNcclTraces(payload) {
  const sourceRoot = payload?.sources || payload?.sourceExports || {};

  return firstArray(
    payload?.ncclTraces,
    payload?.traces,
    payload?.nccl,
    sourceRoot.ncclTraces,
    sourceRoot.traces,
    sourceRoot.nccl
  );
}

function isIngestionFeed(value) {
  return Boolean(value?.schemaVersion === INGESTION_SCHEMA.version && Array.isArray(value.runs));
}

function hasSourceExports(sources) {
  return sources.prometheus.length > 0 || sources.dcgm.length > 0 || sources.kubernetes.length > 0;
}

function firstArray(...values) {
  return values.find((value) => Array.isArray(value)) || [];
}

function restoredSourceLabel(sourceLabel) {
  return sourceLabel
    .replace(/^Imported /, "Restored ")
    .replace(/^Fetched /, "Restored ");
}

function setIngestStatus(label, tone = "good") {
  state.ingestLabel = label;
  state.ingestTone = tone;
  renderIngestState();
}

async function handleFileIngest(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    setIngestStatus("Reading file", "watch");
    const payload = parseImportJson(await file.text(), "File is not valid JSON.");
    await ingestJsonPayload(payload, `Imported ${file.name}`);
  } catch (error) {
    setIngestStatus(importErrorMessage(error, "Import failed"), "poor");
  } finally {
    event.target.value = "";
  }
}

async function handleApiIngest() {
  const input = document.querySelector("#apiInput");
  const url = input.value.trim();
  if (!url) {
    setIngestStatus("API URL required", "watch");
    return;
  }

  try {
    setIngestStatus("Fetching API", "watch");
    const requestUrl = parseImportUrl(url);
    const response = await window.fetch(requestUrl);
    if (!response.ok) {
      throw new Error(`API ${response.status}`);
    }

    await ingestJsonPayload(parseImportJson(await response.text(), "API did not return valid JSON."), "Fetched API feed");
  } catch (error) {
    setIngestStatus(importErrorMessage(error, "Fetch failed"), "poor");
  }
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

function exportWorkspace() {
  const exportedAt = new Date();
  const store = createWorkspaceStore(activeIngestion, {
    savedAt: exportedAt,
    lastAnalysisAt: state.lastAnalysis,
    snapshots: snapshotHistory
  });
  const blob = new Blob([`${JSON.stringify(store, null, 2)}\n`], { type: "application/json" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `turba-workspace-${fileDateStamp(exportedAt)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
  setIngestStatus("Workspace exported", "good");
}

function resetWorkspace() {
  const confirmed = window.confirm("Reset the local Turba workspace to the sample feed?");
  if (!confirmed) return;

  activeIngestion = applyPersistedBaselines(DEFAULT_INGESTION, buildBaselineStore(DEFAULT_INGESTION.runs));
  jobs = normalizeIngestion(activeIngestion);
  snapshotHistory = [];
  state.scope = "job";
  state.selectedKey = jobs.find((job) => job.id === "run-7421")?.id || jobs[0]?.id || "";
  state.samePod = false;
  state.ingestLabel = "Sample feed";
  state.ingestTone = "good";
  state.lastAnalysis = new Date();
  captureAnalysisSnapshot("Reset sample", state.lastAnalysis);
  persistWorkspaceStore();
  render();
}

function bindEvents() {
  document.querySelectorAll("#scopeControls button").forEach((button) => {
    button.addEventListener("click", () => {
      state.scope = button.dataset.scope;
      state.selectedKey = buildEntries(state.scope)[0].key;
      render();
    });
  });

  document.querySelector("#windowSelect").addEventListener("change", (event) => {
    state.window = event.target.value;
    render();
  });

  document.querySelector("#rateInput").addEventListener("input", (event) => {
    state.rate = Number(event.target.value) || 0;
    render();
  });

  document.querySelector("#samePodToggle").addEventListener("change", (event) => {
    state.samePod = event.target.checked;
    render();
  });

  document.querySelectorAll("#trendMetricControls button").forEach((button) => {
    button.addEventListener("click", () => {
      state.trendMetric = button.dataset.trendMetric;
      render();
    });
  });

  document.querySelector("#analyzeButton").addEventListener("click", () => {
    state.analyzing = true;
    renderAnalysisStamp();
    window.setTimeout(() => {
      state.analyzing = false;
      state.lastAnalysis = new Date();
      captureAnalysisSnapshot("Manual analysis", state.lastAnalysis);
      persistWorkspaceStore();
      render();
    }, 520);
  });

  document.querySelector("#copyReport").addEventListener("click", copyReport);
  document.querySelector("#ingestFile").addEventListener("change", handleFileIngest);
  document.querySelector("#fetchApiButton").addEventListener("click", handleApiIngest);
  document.querySelector("#exportWorkspaceButton").addEventListener("click", exportWorkspace);
  document.querySelector("#resetWorkspaceButton").addEventListener("click", resetWorkspace);
}

function render() {
  renderScopeControls();
  renderAnalysisStamp();
  renderIngestState();

  const entries = buildEntries(state.scope);
  if (!entries.some((entry) => entry.key === state.selectedKey)) {
    state.selectedKey = entries[0].key;
  }

  const activeEntry = entries.find((entry) => entry.key === state.selectedKey);
  const summary = displaySummary(activeEntry);
  const classifier = classifyBottlenecks(summary);
  const components = scoreComponents(summary);
  const fingerprint = fingerprintWorkload(summary);

  renderInventory(entries);
  renderDiagnosis(summary, classifier);
  renderMetricRibbon(summary);
  renderTrend(summary);
  renderTruthTable(summary);
  renderBottleneck(summary, classifier);
  renderComponents(components);
  renderTopology(summary);
  renderFingerprint(fingerprint);
  renderRegression(summary);
  renderReport(summary, classifier);
}

function renderIngestState() {
  const ingestEl = document.querySelector("#ingestState");
  if (!ingestEl) return;

  ingestEl.textContent = state.ingestLabel;
  ingestEl.dataset.status = state.ingestTone;
}

function buildEntries(scope) {
  const groups = new Map();

  jobs.forEach((job) => {
    const key = scope === "job" ? job.id : job[scope];
    const label = scope === "job" ? job.name : key;

    if (!groups.has(key)) {
      groups.set(key, { key, label, scope, items: [] });
    }

    groups.get(key).items.push(job);
  });

  return Array.from(groups.values()).sort((a, b) => {
    const aWaste = summarizeEntry(a).wastedGpuHours;
    const bWaste = summarizeEntry(b).wastedGpuHours;
    return bWaste - aWaste;
  });
}

function displaySummary(entry) {
  return finalizeSummary(applyPlacementWhatIf(summarizeEntry(entry)));
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
    count: items.length,
    jobs: items,
    teams: unique(items.map((job) => job.team)),
    users: unique(items.map((job) => job.user)),
    models: unique(items.map((job) => job.model)),
    clusters: unique(items.map((job) => job.cluster)),
    gpuModels: unique(items.map((job) => job.gpuModel)),
    gpus: sum(items, "gpus"),
    allocatedGpuHours,
    gpuUtil: weighted("gpuUtil"),
    usefulCompute: weighted("usefulCompute"),
    smOccupancy: weighted("smOccupancy"),
    tensorCoreUtil: weighted("tensorCoreUtil"),
    ncclTime: weighted("ncclTime"),
    networkWait: weighted("networkWait"),
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
    placement: mergePlacement(items),
    traceAttribution: mergeTraceAttribution(items),
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

function renderScopeControls() {
  document.querySelectorAll("#scopeControls button").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.scope === state.scope));
  });
}

function renderAnalysisStamp() {
  const stateEl = document.querySelector("#analysisState");
  const storageEl = document.querySelector("#storageState");
  const timeEl = document.querySelector("#analysisTime");

  stateEl.textContent = state.analyzing ? "Analyzing" : "Ready";
  storageEl.textContent = state.storageLabel;
  storageEl.dataset.status = state.storageTone;
  timeEl.textContent = formatAnalysisTime(state.lastAnalysis);
  timeEl.setAttribute("datetime", state.lastAnalysis.toISOString());
}

function renderInventory(entries) {
  const list = document.querySelector("#entityList");
  const title = document.querySelector("#inventoryTitle");
  const count = document.querySelector("#inventoryCount");

  title.textContent = pluralTitle(state.scope);
  count.textContent = entries.length;
  list.replaceChildren();

  entries.forEach((entry) => {
    const summary = summarizeEntry(entry);
    const classifier = classifyBottlenecks(summary);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "entity-row";
    button.setAttribute("aria-selected", String(entry.key === state.selectedKey));
    button.addEventListener("click", () => {
      state.selectedKey = entry.key;
      render();
    });

    const titleEl = document.createElement("strong");
    titleEl.textContent = entry.label;

    const meta = document.createElement("span");
    meta.className = "entity-meta";
    meta.textContent = inventoryMeta(summary);

    const foot = document.createElement("span");
    foot.className = "entity-foot";

    const score = document.createElement("span");
    score.textContent = `${round(summary.usefulCompute)}% useful`;

    const bottleneck = document.createElement("span");
    bottleneck.textContent = classifier.primary.name.replace("-bound", "");

    foot.append(score, bottleneck);
    button.append(titleEl, meta, foot);
    list.append(button);
  });
}

function renderDiagnosis(summary, classifier) {
  const primary = classifier.primary;
  const secondary = classifier.secondary;
  const meta = [
    scopeLabel(summary.scope),
    summary.clusters.join(", "),
    summary.gpuModels.join(", "),
    `${summary.count} ${summary.count === 1 ? "job" : "jobs"}`
  ].join(" | ");

  const useful = round(summary.usefulCompute);
  const gpuUtil = round(summary.gpuUtil);
  const primaryLoss = primary.name.replace("-bound", "").toLowerCase();
  const headline = summary.whatIfActive
    ? `Same-pod what-if lifts useful compute to ${useful}% and cuts cross-pod traffic to ${round(summary.crossPodTraffic)}%.`
    : `${gpuUtil}% GPU utilization, ${useful}% useful compute. ${titleCase(primaryLoss)} is the dominant loss.`;

  const narrative = summary.whatIfActive
    ? `Current evidence points to ${primaryLoss} first and ${secondary.name.replace("-bound", "").toLowerCase()} second. Constraining this work to one pod is estimated to improve runtime by ${classifier.improvementRange}.`
    : `${primary.reason} ${recommendationFor(summary, classifier)}`;

  document.querySelector("#selectedMeta").textContent = meta;
  document.querySelector("#diagnosisHeadline").textContent = headline;
  document.querySelector("#diagnosisNarrative").textContent = narrative;
  renderScoreDial(summary.usefulCompute);
}

function renderScoreDial(score) {
  const value = clamp(score);
  const circle = document.querySelector(".dial-value");
  const circumference = 2 * Math.PI * 48;
  circle.style.strokeDasharray = `${circumference}`;
  circle.style.strokeDashoffset = `${circumference - (value / 100) * circumference}`;
  circle.style.stroke = gradeColor(value, true);
  document.querySelector("#scoreValue").textContent = pct(value);
}

function renderMetricRibbon(summary) {
  document.querySelector("#allocatedGpuHours").textContent = number.format(summary.allocatedGpuHours);
  document.querySelector("#usefulGpuHours").textContent = number.format(summary.usefulGpuHours);
  document.querySelector("#wastedGpuHours").textContent = number.format(summary.wastedGpuHours);
  document.querySelector("#wasteDollars").textContent = currency.format(summary.wasteDollars);
  document.querySelector("#costPerUseful").textContent = currency.format(summary.costPerUsefulGpuHour);
}

function renderTrend(summary) {
  const metricKey = TREND_METRIC_DEFS[state.trendMetric] ? state.trendMetric : "usefulCompute";
  const metric = TREND_METRIC_DEFS[metricKey];
  const points = trendPointsFor(summary, metricKey);
  const trend = analytics.summarizeTrend(points, metric);

  renderTrendControls(metricKey);
  renderTrendStats(trend, metric);
  renderTrendChart(points, metric);
  renderTrendList(points, metric);

  const badge = document.querySelector("#trendBadge");
  if (badge) {
    badge.textContent = `${trend.count} ${trend.count === 1 ? "point" : "points"}`;
  }
}

function renderTrendControls(metricKey) {
  document.querySelectorAll("#trendMetricControls button").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.trendMetric === metricKey));
  });
}

function trendPointsFor(summary, metricKey) {
  return snapshotHistory
    .filter((record) => (
      record.scope === summary.scope
      && record.key === summary.key
      && Number.isFinite(record.metrics?.[metricKey])
    ))
    .map((record) => ({
      ...record,
      value: record.metrics[metricKey]
    }))
    .slice(-12);
}

function renderTrendStats(trend, metric) {
  const latest = document.querySelector("#trendLatest");
  const delta = document.querySelector("#trendDelta");
  const best = document.querySelector("#trendBest");

  if (!latest || !delta || !best) return;

  if (trend.count === 0) {
    latest.textContent = "-";
    delta.textContent = "-";
    best.textContent = "-";
    delta.dataset.direction = "flat";
    return;
  }

  latest.textContent = metric.format(trend.latest.value);
  delta.textContent = metric.formatDelta(trend.delta);
  delta.dataset.direction = trend.direction;
  best.textContent = metric.format(trend.best.value);
}

function renderTrendChart(points, metric) {
  const svg = document.querySelector("#trendChart");
  if (!svg) return;

  const width = 760;
  const height = 260;
  const margin = { top: 22, right: 24, bottom: 42, left: 62 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  svg.replaceChildren();
  const title = svgNode("title", { id: "trendTitle" });
  title.textContent = `${metric.label} trend`;
  const desc = svgNode("desc", { id: "trendDesc" });
  desc.textContent = "Recent persisted analysis snapshots for the selected scope.";
  svg.append(title, desc);

  const values = points.map((point) => point.value);
  const extent = trendExtent(values, metric);
  drawTrendGrid(svg, extent, metric, margin, chartWidth, chartHeight);

  if (points.length === 0) {
    const empty = svgNode("text", {
      x: width / 2,
      y: height / 2,
      class: "trend-empty"
    });
    empty.textContent = "No snapshots";
    svg.append(empty);
    return;
  }

  const coordinates = points.map((point, index) => ({
    point,
    x: margin.left + (points.length === 1 ? chartWidth / 2 : (index / (points.length - 1)) * chartWidth),
    y: margin.top + ((extent.max - point.value) / (extent.max - extent.min)) * chartHeight
  }));

  if (coordinates.length > 1) {
    svg.append(svgNode("path", {
      d: trendAreaPath(coordinates, margin.top + chartHeight),
      class: "trend-area"
    }));
    svg.append(svgNode("path", {
      d: trendLinePath(coordinates),
      class: "trend-line"
    }));
  }

  coordinates.forEach((coordinate) => {
    const dot = svgNode("circle", {
      cx: coordinate.x,
      cy: coordinate.y,
      r: 5,
      class: "trend-dot"
    });
    const dotTitle = svgNode("title");
    dotTitle.textContent = `${formatSnapshotTime(coordinate.point.capturedAt)} ${metric.format(coordinate.point.value)}`;
    dot.append(dotTitle);
    svg.append(dot);
  });

  drawTrendDateLabels(svg, coordinates, margin.top + chartHeight + 28);
}

function drawTrendGrid(svg, extent, metric, margin, chartWidth, chartHeight) {
  const ticks = 4;

  for (let index = 0; index <= ticks; index += 1) {
    const ratio = index / ticks;
    const y = margin.top + ratio * chartHeight;
    const value = extent.max - ratio * (extent.max - extent.min);
    svg.append(svgNode("line", {
      x1: margin.left,
      y1: y,
      x2: margin.left + chartWidth,
      y2: y,
      class: "trend-grid-line"
    }));

    const label = svgNode("text", {
      x: margin.left - 10,
      y: y + 4,
      class: "trend-axis-label",
      "text-anchor": "end"
    });
    label.textContent = metric.format(value);
    svg.append(label);
  }
}

function drawTrendDateLabels(svg, coordinates, y) {
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];

  [first, last].filter(Boolean).forEach((coordinate, index) => {
    if (index === 1 && first === last) return;

    const label = svgNode("text", {
      x: coordinate.x,
      y,
      class: "trend-axis-label",
      "text-anchor": index === 0 ? "start" : "end"
    });
    label.textContent = formatSnapshotTime(coordinate.point.capturedAt);
    svg.append(label);
  });
}

function renderTrendList(points, metric) {
  const list = document.querySelector("#trendList");
  if (!list) return;

  list.replaceChildren();
  points.slice(-5).reverse().forEach((point) => {
    const item = document.createElement("div");
    item.className = "trend-row";

    const value = document.createElement("strong");
    value.textContent = metric.format(point.value);

    const source = document.createElement("span");
    source.textContent = `${formatSnapshotTime(point.capturedAt)} | ${point.source}`;

    const bottleneck = document.createElement("span");
    bottleneck.textContent = point.primaryBottleneck;

    item.append(value, source, bottleneck);
    list.append(item);
  });
}

function trendExtent(values, metric) {
  if (values.length === 0) {
    return metric.unit === "points" ? { min: 0, max: 100 } : { min: 0, max: 1 };
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue;
  const padding = range > 0 ? range * 0.18 : Math.max(5, Math.abs(maxValue) * 0.12);
  const min = metric.unit === "points" ? Math.max(0, minValue - padding) : Math.max(0, minValue - padding);
  const max = metric.unit === "points" ? Math.min(100, maxValue + padding) : maxValue + padding;

  if (max <= min) {
    return { min: Math.max(0, min - 5), max: min + 5 };
  }

  return { min, max };
}

function trendLinePath(coordinates) {
  return coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

function trendAreaPath(coordinates, baselineY) {
  const line = trendLinePath(coordinates);
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  return `${line} L ${last.x.toFixed(1)} ${baselineY.toFixed(1)} L ${first.x.toFixed(1)} ${baselineY.toFixed(1)} Z`;
}

function renderTruthTable(summary) {
  const rows = [
    {
      question: "Are GPUs doing useful work?",
      metric: `${pct(summary.gpuUtil)} GPU utilization, ${pct(summary.usefulCompute)} useful compute, ${pct(summary.tensorCoreUtil)} tensor-core use`,
      status: grade(summary.usefulCompute, 55, 72)
    },
    {
      question: "Are GPUs idle because of communication?",
      metric: `${pct(summary.ncclTime)} collectives time, ${pct(summary.networkWait)} network wait, ${pct(summary.crossPodTraffic)} cross-pod traffic`,
      status: inverseGrade(summary.ncclTime + summary.networkWait, 18, 32)
    },
    {
      question: "Are GPUs idle because of input pipeline?",
      metric: `${pct(summary.dataloaderStall)} dataloader stalls, ${pct(summary.storageWait)} storage wait, ${pct(summary.cpuPrep)} CPU preprocessing`,
      status: inverseGrade(summary.dataloaderStall + summary.storageWait + summary.cpuPrep, 20, 34)
    },
    {
      question: "Are jobs fragmented across the cluster?",
      metric: `${pct(summary.placementQuality)} placement quality, ${pct(summary.crossRackTraffic)} cross-rack traffic, ${summary.partialNodes} partial nodes`,
      status: grade(summary.placementQuality, 65, 82)
    },
    {
      question: "Are expensive resources stranded?",
      metric: `${summary.idleGpus} idle GPUs, ${summary.partialNodes} partially used nodes, ${pct(summary.memoryFragmentation)} memory fragmentation`,
      status: inverseGrade(summary.idleGpus * 3 + summary.partialNodes * 8 + summary.memoryFragmentation, 32, 52)
    }
  ];

  const table = document.querySelector("#truthTable");
  table.replaceChildren();

  rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "truth-row";

    const question = document.createElement("strong");
    question.textContent = row.question;

    const metric = document.createElement("span");
    metric.textContent = row.metric;

    const status = document.createElement("small");
    status.className = `status-pill status-${row.status.key}`;
    status.textContent = row.status.label;

    item.append(question, metric, status);
    table.append(item);
  });

  const worst = rows.find((row) => row.status.key === "poor") || rows.find((row) => row.status.key === "watch");
  const badge = document.querySelector("#truthBadge");
  badge.textContent = worst ? worst.status.label : "Healthy";
}

function renderBottleneck(summary, classifier) {
  document.querySelector("#primaryBottleneck").textContent = classifier.primary.name;
  document.querySelector("#secondaryBottleneck").textContent = classifier.secondary.name;
  document.querySelector("#improvementEstimate").textContent = classifier.improvementRange;
  document.querySelector("#bottleneckBadge").textContent = classifier.primary.short;

  const list = document.querySelector("#bottleneckBars");
  list.replaceChildren();

  classifier.bars.forEach((bar) => {
    list.append(progressRow({
      className: "bar-row",
      fillClass: "bar-fill",
      label: bar.name,
      value: bar.score,
      suffix: "loss",
      note: bar.reason
    }));
  });
}

function renderComponents(components) {
  const list = document.querySelector("#componentScores");
  list.replaceChildren();

  components.forEach((component) => {
    const row = progressRow({
      className: "component-row",
      fillClass: "component-fill",
      label: component.name,
      value: component.score,
      suffix: "score",
      note: component.note
    });
    row.dataset.grade = grade(component.score, 55, 72).key;
    list.append(row);
  });
}

function renderTopology(summary) {
  const svg = document.querySelector("#topologyMap");
  const ns = "http://www.w3.org/2000/svg";
  const activeNodes = new Map(summary.placement.map((node) => [node.node, node]));
  const positions = new Map();
  const podCenters = new Map();
  const width = 760;
  const podGap = 18;
  const podWidth = (width - podGap * 4) / 3;
  const podHeight = 300;
  const rackGap = 10;
  const rackWidth = (podWidth - 34) / 2;
  const rackHeight = 206;

  svg.replaceChildren();

  const title = svgNode("title", { id: "topologyTitle" });
  title.textContent = "Cluster topology placement map";
  const desc = svgNode("desc", { id: "topologyDesc" });
  desc.textContent = "Racks and pods used by the selected workload with highlighted cross-pod traffic.";
  svg.append(title, desc);

  TOPOLOGY.forEach((pod, podIndex) => {
    const podX = podGap + podIndex * (podWidth + podGap);
    const podY = 18;
    const center = { x: podX + podWidth / 2, y: podY + podHeight / 2 };
    podCenters.set(pod.id, center);

    svg.append(svgNode("rect", {
      x: podX,
      y: podY,
      width: podWidth,
      height: podHeight,
      rx: 8,
      class: "topology-pod"
    }));

    svg.append(textNode(pod.label, podX + 14, podY + 26, "topology-label"));

    pod.racks.forEach((rack, rackIndex) => {
      const rackX = podX + 12 + rackIndex * (rackWidth + rackGap);
      const rackY = podY + 54;
      svg.append(svgNode("rect", {
        x: rackX,
        y: rackY,
        width: rackWidth,
        height: rackHeight,
        rx: 6,
        class: "topology-rack"
      }));
      svg.append(textNode(rack.label, rackX + 10, rackY + 22, "topology-small"));

      rack.nodes.forEach((node, nodeIndex) => {
        const col = nodeIndex % 2;
        const row = Math.floor(nodeIndex / 2);
        const nodeWidth = (rackWidth - 26) / 2;
        const nodeHeight = 42;
        const nodeX = rackX + 8 + col * (nodeWidth + 10);
        const nodeY = rackY + 44 + row * (nodeHeight + 12);
        const active = activeNodes.get(node);
        const nodeClass = active ? (active.partial ? "topology-node partial" : "topology-node active") : "topology-node";

        positions.set(node, {
          x: nodeX + nodeWidth / 2,
          y: nodeY + nodeHeight / 2,
          pod: NODE_INDEX[node].pod
        });

        svg.append(svgNode("rect", {
          x: nodeX,
          y: nodeY,
          width: nodeWidth,
          height: nodeHeight,
          rx: 5,
          class: nodeClass
        }));
        svg.append(textNode(node, nodeX + 7, nodeY + 25, active ? "topology-small active-label" : "topology-small"));
      });
    });
  });

  drawTopologyLinks(svg, positions, podCenters, activeNodes, summary);
  drawLegend(svg, ns);
  renderTraceAttribution(summary.traceAttribution);

  document.querySelector("#topologyScore").textContent = `${pct(summary.placementQuality)} fit`;
}

function renderTraceAttribution(traceAttribution) {
  const list = document.querySelector("#traceAttribution");
  const tiers = traceAttribution?.byTier || [];
  const hottestTier = traceAttribution?.hottestTier;
  list.replaceChildren();

  const summary = document.createElement("div");
  summary.className = "trace-summary";
  summary.append(
    traceStat("NCCL events", number.format(traceAttribution?.eventCount || 0)),
    traceStat("Trace duration", `${number.format(traceAttribution?.totalDurationMs || 0)} ms`),
    traceStat("Hot tier", hottestTier?.label || "Unknown")
  );
  list.append(summary);

  tiers.forEach((tier) => {
    list.append(progressRow({
      className: "trace-row",
      fillClass: "trace-fill",
      label: tier.label,
      value: tier.durationPct,
      suffix: "trace time",
      note: `${number.format(tier.durationMs)} ms, ${compactNumber.format(tier.bytes)} bytes, ${tier.eventCount} events`
    }));
  });
}

function traceStat(label, value) {
  const item = document.createElement("div");
  const labelEl = document.createElement("span");
  const valueEl = document.createElement("strong");

  labelEl.textContent = label;
  valueEl.textContent = value;
  item.append(labelEl, valueEl);

  return item;
}

function drawTopologyLinks(svg, positions, podCenters, activeNodes, summary) {
  const activePods = unique(Array.from(activeNodes.keys()).map((node) => NODE_INDEX[node]?.pod).filter(Boolean));
  const activeRacks = unique(Array.from(activeNodes.keys()).map((node) => NODE_INDEX[node]?.rack).filter(Boolean));

  if (activePods.length > 1) {
    for (let i = 0; i < activePods.length - 1; i += 1) {
      const from = podCenters.get(activePods[i]);
      const to = podCenters.get(activePods[i + 1]);
      const thickness = 2 + Math.min(5, summary.crossPodTraffic / 16);
      const path = svgNode("path", {
        d: curvePath(from, to, -32 - i * 14),
        class: "topology-link",
        "stroke-width": thickness
      });
      svg.prepend(path);
    }
  } else if (activeRacks.length > 1) {
    const activePositions = Array.from(activeNodes.keys())
      .map((node) => positions.get(node))
      .filter(Boolean);
    const from = activePositions[0];
    const to = activePositions[activePositions.length - 1];
    svg.prepend(svgNode("path", {
      d: curvePath(from, to, -20),
      class: "topology-link local"
    }));
  }
}

function drawLegend(svg) {
  const x = 20;
  const y = 335;
  svg.append(svgNode("rect", {
    x,
    y,
    width: 214,
    height: 38,
    rx: 7,
    class: "topology-legend"
  }));
  svg.append(svgNode("rect", { x: x + 12, y: y + 12, width: 14, height: 14, rx: 3, class: "topology-node active" }));
  svg.append(textNode("allocated", x + 34, y + 24, "topology-small"));
  svg.append(svgNode("rect", { x: x + 98, y: y + 12, width: 14, height: 14, rx: 3, class: "topology-node partial" }));
  svg.append(textNode("partial", x + 120, y + 24, "topology-small"));
}

function renderFingerprint(fingerprint) {
  document.querySelector("#fingerprintName").textContent = fingerprint.name;
  const list = document.querySelector("#fingerprintSignals");
  list.replaceChildren();

  fingerprint.signals.forEach((signal) => {
    list.append(progressRow({
      className: "signal-row",
      fillClass: "signal-fill",
      label: signal.name,
      value: signal.value,
      suffix: signal.label
    }));
  });
}

function renderRegression(summary) {
  const rows = regressionRows(summary);
  const list = document.querySelector("#regressionList");
  list.replaceChildren();

  rows.forEach((row) => {
    const item = progressRow({
      className: "regression-row",
      fillClass: "regression-fill",
      label: row.name,
      value: Math.min(100, Math.abs(row.delta)),
      suffix: row.text,
      note: row.note
    });
    item.dataset.grade = row.grade.key;
    list.append(item);
  });

  const worst = rows.find((row) => row.grade.key === "poor") || rows.find((row) => row.grade.key === "watch");
  const badge = document.querySelector("#regressionBadge");
  badge.textContent = worst ? worst.grade.label : "Stable";
  badge.className = "";
}

function renderReport(summary, classifier) {
  const primary = classifier.primary.name.replace("-bound", "").toLowerCase();
  const secondary = classifier.secondary.name.replace("-bound", "").toLowerCase();
  const workMetric = summary.tokensM > 0
    ? `${currency.format(summary.costPerMillionTokens)} per million training tokens`
    : summary.inferenceRequestsM > 0
      ? `${currency.format(summary.costPerMillionRequests)} per million inference requests`
      : `${currency.format(summary.costPerStep)} per training step`;
  const report = `${summary.label} achieved ${pct(summary.usefulCompute)} accelerator efficiency in ${state.window.toLowerCase()}, consuming ${number.format(summary.allocatedGpuHours)} GPU-hours with ${number.format(summary.usefulGpuHours)} useful GPU-hours. Estimated waste is ${number.format(summary.wastedGpuHours)} GPU-hours (${currency.format(summary.wasteDollars)}), mostly from ${primary} with ${secondary} as the secondary bottleneck. Current useful-work cost is ${workMetric}. ${recommendationFor(summary, classifier)}`;

  document.querySelector("#customerReport").textContent = report;
}

function progressRow({ className, fillClass, label, value, suffix, note }) {
  const row = document.createElement("div");
  row.className = className;

  const labelRow = document.createElement("div");
  labelRow.className = className.replace("-row", "-label");

  const strong = document.createElement("strong");
  strong.textContent = label;

  const span = document.createElement("span");
  span.textContent = suffix ? `${pct(value)} ${suffix}` : pct(value);

  labelRow.append(strong, span);

  const track = document.createElement("div");
  track.className = className.replace("-row", "-track");

  const fill = document.createElement("div");
  fill.className = fillClass;
  fill.style.width = `${clamp(value)}%`;

  track.append(fill);
  row.append(labelRow, track);

  if (note) {
    const small = document.createElement("small");
    small.textContent = note;
    row.append(small);
  }

  return row;
}

function classifyBottlenecks(summary) {
  return analytics.classifyBottlenecks(summary);
}

function scoreComponents(summary) {
  return analytics.scoreComponents(summary, state.rate, (value) => currency.format(value));
}

function fingerprintWorkload(summary) {
  return analytics.fingerprintWorkload(summary);
}

function regressionRows(summary) {
  return analytics.regressionRows(summary, (value) => currency.format(value));
}

function recommendationFor(summary, classifier) {
  return analytics.recommendationFor(summary, classifier);
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

function makePlacement(nodes, partialNodes = []) {
  return nodes.map((node) => ({
    node,
    gpus: 8,
    partial: partialNodes.includes(node)
  }));
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

function weightedAverage(items, keyOrGetter, weightKey) {
  const totalWeight = sum(items, weightKey);
  if (totalWeight === 0) return 0;

  const getter = typeof keyOrGetter === "function" ? keyOrGetter : (item) => item[keyOrGetter];
  return items.reduce((total, item) => total + (Number(getter(item)) || 0) * (Number(item[weightKey]) || 0), 0) / totalWeight;
}

function sum(items, key) {
  return items.reduce((total, item) => total + (Number(item[key]) || 0), 0);
}

function unique(values) {
  return Array.from(new Set(values));
}

function clamp(value, min = 0, max = 100) {
  return analytics.clamp(value, min, max);
}

function round(value) {
  return analytics.round(value);
}

function pct(value) {
  return analytics.pct(value);
}

function titleCase(value) {
  return analytics.titleCase(value);
}

function grade(value, watchAt, goodAt) {
  return analytics.grade(value, watchAt, goodAt);
}

function inverseGrade(value, watchAt, poorAt) {
  return analytics.inverseGrade(value, watchAt, poorAt);
}

function gradeColor(value, higherIsBetter) {
  return analytics.gradeColor(value, higherIsBetter);
}

function pluralTitle(scope) {
  const titles = {
    job: "Jobs",
    model: "Models",
    user: "Users",
    team: "Teams",
    cluster: "Clusters"
  };
  return titles[scope] || "Inventory";
}

function scopeLabel(scope) {
  const labels = {
    job: "Job",
    model: "Model",
    user: "User",
    team: "Team",
    cluster: "Cluster"
  };
  return labels[scope] || "Scope";
}

function inventoryMeta(summary) {
  if (summary.scope === "job") {
    const job = summary.jobs[0];
    return `${job.team} | ${job.gpus} GPUs | ${job.status}`;
  }

  return `${summary.count} jobs | ${number.format(summary.allocatedGpuHours)} GPU-hours | ${summary.clusters.join(", ")}`;
}

function formatAnalysisTime(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

function formatSnapshotTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function signedNumber(value) {
  const rounded = Math.round(numeric(value));
  const prefix = rounded > 0 ? "+" : "";
  return `${prefix}${number.format(rounded)}`;
}

function signedCurrency(value) {
  const amount = numeric(value);
  if (Math.abs(amount) < 0.5) return "$0";
  return amount > 0 ? `+${currency.format(amount)}` : `-${currency.format(Math.abs(amount))}`;
}

function fileDateStamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function deltaText(delta) {
  return analytics.deltaText(delta);
}

function svgNode(name, attributes = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => {
    node.setAttribute(key, value);
  });
  return node;
}

function textNode(value, x, y, className) {
  const text = svgNode("text", { x, y, class: className });
  text.textContent = value;
  return text;
}

function curvePath(from, to, lift) {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2 + lift;
  return `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`;
}

async function copyReport() {
  const report = document.querySelector("#customerReport").textContent;
  const button = document.querySelector("#copyReport");

  try {
    await navigator.clipboard.writeText(report);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = report;
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  button.classList.add("copy-flash");
  window.setTimeout(() => button.classList.remove("copy-flash"), 900);
}
