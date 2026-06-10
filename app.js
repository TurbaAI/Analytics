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
    "placement",
    "schedulerEvidence",
    "grafanaContext",
    "commercial",
    "slo",
    "opportunities"
  ]
};

const STORAGE_SCHEMA = {
  version: "turba.workspace.v2",
  key: "turba.analytics.workspace.v2"
};

const THEME_STORAGE_KEY = "turba.analytics.theme";
const PLATFORM_API_TOKEN_STORAGE_KEY = "turba.analytics.platformApiToken.v1";

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
    tenants: {
      "apex-ai": { label: "Apex AI" },
      "northstar-labs": { label: "Northstar Labs" },
      "vectorcart": { label: "VectorCart" },
      "meridian-research": { label: "Meridian Research" }
    },
    accounts: {
      "acct-apex-frontier": { label: "Apex frontier platform" },
      "acct-northstar-tuning": { label: "Northstar tuning" },
      "acct-vectorcart-prod": { label: "VectorCart production" },
      "acct-meridian-research": { label: "Meridian research" }
    },
    reservations: {
      "rsv-h100-frontier-q2": { label: "H100 Frontier Q2" },
      "rsv-applied-flex-q2": { label: "Applied Flex Q2" },
      "rsv-inference-prod-q2": { label: "Inference Prod Q2" },
      "rsv-a100-research-q2": { label: "A100 Research Q2" }
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
        cluster: "h100-prod-west",
        tenant: "apex-ai",
        account: "acct-apex-frontier",
        reservation: "rsv-h100-frontier-q2"
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
        networkUtilization: 64,
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
      commercial: {
        billingModel: "reserved-cluster",
        customerTier: "strategic",
        contractId: "ctr-apex-2026-q2",
        listGpuHourRate: 6.8,
        floorGpuHourCost: 3.9,
        committedGpuHours: 6500,
        burstGpuHours: 240,
        billableGpuHours: 2227,
        sellableGpuHours: 2227
      },
      slo: {
        priority: "p1",
        targetStartMinutes: 20,
        targetEfficiency: 55,
        supportTicketId: "CS-1842"
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
        cluster: "h100-prod-west",
        tenant: "northstar-labs",
        account: "acct-northstar-tuning",
        reservation: "rsv-applied-flex-q2"
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
        networkUtilization: 36,
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
      commercial: {
        billingModel: "committed-capacity",
        customerTier: "growth",
        contractId: "ctr-northstar-2026-q2",
        listGpuHourRate: 6.5,
        floorGpuHourCost: 3.7,
        committedGpuHours: 1000,
        burstGpuHours: 0,
        billableGpuHours: 234,
        sellableGpuHours: 234
      },
      slo: {
        priority: "p2",
        targetStartMinutes: 15,
        targetEfficiency: 50,
        supportTicketId: "CS-1775"
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
        cluster: "h100-prod-east",
        tenant: "vectorcart",
        account: "acct-vectorcart-prod",
        reservation: "rsv-inference-prod-q2"
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
        networkUtilization: 52,
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
      commercial: {
        billingModel: "committed-plus-burst",
        customerTier: "enterprise",
        contractId: "ctr-vectorcart-2026-q2",
        listGpuHourRate: 5.9,
        floorGpuHourCost: 3.4,
        committedGpuHours: 1800,
        burstGpuHours: 260,
        billableGpuHours: 778,
        sellableGpuHours: 778
      },
      slo: {
        priority: "p1",
        targetStartMinutes: 8,
        targetEfficiency: 52,
        supportTicketId: "CS-1901"
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
        cluster: "a100-research",
        tenant: "meridian-research",
        account: "acct-meridian-research",
        reservation: "rsv-a100-research-q2"
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
        networkUtilization: 41,
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
      commercial: {
        billingModel: "reserved-cluster",
        customerTier: "research",
        contractId: "ctr-meridian-2026-q2",
        listGpuHourRate: 2.8,
        floorGpuHourCost: 1.7,
        committedGpuHours: 1200,
        burstGpuHours: 0,
        billableGpuHours: 602,
        sellableGpuHours: 602
      },
      slo: {
        priority: "p3",
        targetStartMinutes: 20,
        targetEfficiency: 70,
        supportTicketId: ""
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
        cluster: "h100-prod-west",
        tenant: "apex-ai",
        account: "acct-apex-frontier",
        reservation: "rsv-h100-frontier-q2"
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
        networkUtilization: 22,
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
      commercial: {
        billingModel: "reserved-cluster",
        customerTier: "strategic",
        contractId: "ctr-apex-2026-q2",
        listGpuHourRate: 6.8,
        floorGpuHourCost: 3.9,
        committedGpuHours: 6500,
        burstGpuHours: 80,
        billableGpuHours: 77,
        sellableGpuHours: 77
      },
      slo: {
        priority: "p2",
        targetStartMinutes: 20,
        targetEfficiency: 38,
        supportTicketId: "CS-1843"
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
  scheduler: [
    {
      runId: "run-7421",
      schedulerExportId: "sched-sample-2026-05",
      schedulerName: "slurm-topology-aware",
      queueName: "frontier-reserved",
      priorityClass: "p1-reserved",
      admissionClass: "reserved-burst",
      requestedGpuShape: "24x8-h100",
      localityPreference: "same-pod",
      queuedAt: "2026-05-30T10:02:00-07:00",
      startedAt: "2026-05-30T10:26:00-07:00",
      placementQuality: 53,
      partialNodes: 3,
      idleGpus: 0,
      placementRetries: 5,
      localityMisses: 2,
      backfillCandidates: 4,
      pendingJobsAhead: 6,
      pendingGpuHoursAhead: 740,
      gpusPerNode: 8,
      events: [
        { type: "queued", timestamp: "2026-05-30T10:02:00-07:00" },
        { type: "placement_retry", timestamp: "2026-05-30T10:08:00-07:00" },
        { type: "locality_miss", timestamp: "2026-05-30T10:18:00-07:00" },
        { type: "admitted", timestamp: "2026-05-30T10:26:00-07:00" }
      ]
    },
    {
      runId: "svc-1190",
      schedulerExportId: "sched-sample-2026-05",
      schedulerName: "kueue-prod",
      queueName: "inference-prod",
      priorityClass: "p1-serving",
      admissionClass: "committed-plus-burst",
      requestedGpuShape: "6x8-h100",
      localityPreference: "same-rack",
      queuedAt: "2026-05-30T11:04:00-07:00",
      startedAt: "2026-05-30T11:11:00-07:00",
      placementQuality: 81,
      partialNodes: 2,
      idleGpus: 6,
      preemptionCount: 1,
      placementRetries: 2,
      backfillCandidates: 3,
      pendingJobsAhead: 3,
      pendingGpuHoursAhead: 180,
      gpusPerNode: 8,
      events: [
        { type: "queued", timestamp: "2026-05-30T11:04:00-07:00" },
        { type: "preempted_lower_priority", timestamp: "2026-05-30T11:08:00-07:00" },
        { type: "admitted", timestamp: "2026-05-30T11:11:00-07:00" }
      ]
    }
  ],
  grafana: [
    {
      runId: "run-7421",
      grafanaBaseUrl: "https://grafana.provider.example",
      instanceName: "provider-observability-prod",
      orgId: "1",
      dashboardUid: "turbalance-provider-overview",
      dashboardSlug: "turbalance-provider-overview",
      dashboardTitle: "turbalance Provider Overview",
      folder: "AI Infrastructure",
      datasourceUid: "prometheus-h100-prod",
      datasourceName: "Prometheus h100-prod-west",
      timeRange: {
        from: "now-6h",
        to: "now"
      },
      variables: {
        run: "run-7421",
        tenant: "apex-ai",
        cluster: "h100-prod-west",
        reservation: "rsv-h100-frontier-q2"
      },
      dashboardUrl: "https://grafana.provider.example/d/turbalance-provider-overview/turbalance-provider-overview?orgId=1&var-run=run-7421&var-tenant=apex-ai&var-cluster=h100-prod-west&from=now-6h&to=now",
      exploreUrl: "https://grafana.provider.example/explore?orgId=1&left=%7B%22datasource%22:%22prometheus-h100-prod%22,%22queries%22:%5B%7B%22expr%22:%22turba_useful_compute_ratio%7Brun_id%3D%5C%22run-7421%5C%22%7D%22%7D%5D%7D",
      links: [
        {
          label: "Provider overview",
          type: "dashboard",
          url: "https://grafana.provider.example/d/turbalance-provider-overview/turbalance-provider-overview?orgId=1&var-run=run-7421&var-tenant=apex-ai&var-cluster=h100-prod-west&from=now-6h&to=now"
        },
        {
          label: "Explore useful compute",
          type: "explore",
          url: "https://grafana.provider.example/explore?orgId=1&left=%7B%22datasource%22:%22prometheus-h100-prod%22,%22queries%22:%5B%7B%22expr%22:%22turba_useful_compute_ratio%7Brun_id%3D%5C%22run-7421%5C%22%7D%22%7D%5D%7D"
        }
      ]
    }
  ],
  prometheus: [
    {
      runId: "run-7421",
      metrics: {
        turba_gpu_utilization_ratio: 0.62,
        turba_useful_compute_ratio: 0.41,
        turba_nccl_time_ratio: 0.29,
        turba_network_wait_ratio: 0.12,
        turba_network_utilization_ratio: 0.64,
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
        turba_network_utilization_ratio: 0.36,
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
        turba_network_utilization_ratio: 0.52,
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
        turba_network_utilization_ratio: 0.41,
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
        turba_network_utilization_ratio: 0.22,
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
const SNAPSHOT_SCOPES = ["job", "model", "user", "team", "cluster", "tenant", "account", "reservation"];
const SNAPSHOT_LIMIT = 360;
const TASK_HISTORY_LIMIT = 360;
const MACHINE_DEMO_REFRESH_MS = 1000;
const MACHINE_DEMO_FRESH_SECONDS = 30;
const MACHINE_DEMO_FRESH_MS = MACHINE_DEMO_FRESH_SECONDS * 1000;
const PI_FLEET_HOSTNAMES = Array.from({ length: 12 }, (_unused, index) => `pi${index + 1}`);
const SPARK_PAIR_CLOCK_HISTORY_LIMIT = 180;
const SPARK_PAIR_CLOCK_REFRESH_MS = 1000;
const LIVE_TELEMETRY_LIMIT = 300;
const LIVE_TELEMETRY_ALERT_LIMIT = 5;
const LIVE_TELEMETRY_RELATIONSHIP_WINDOW = 90;
const LIVE_COVARIANCE_METRICS = [
  { key: "cpu", label: "CPU load", shortLabel: "CPU" },
  { key: "gpu", label: "GPU utilization", shortLabel: "GPU" },
  { key: "ram", label: "RAM usage", shortLabel: "RAM" },
  { key: "networkUtilization", label: "Network utilization", shortLabel: "Net" }
];
const SYSTEM_ID_PROFILE_ORDER = ["impulse", "step", "ramp", "sine"];
const SYSTEM_ID_PROFILE_LABELS = {
  impulse: "Impulse",
  step: "Step",
  ramp: "Ramp",
  sine: "Sine"
};
const SYSTEM_ID_SUBSYSTEMS = [
  { key: "cpu", target: "cpu", outputMetric: "cpu", label: "CPU", shortLabel: "CPU" },
  { key: "gpu", target: "gpu", outputMetric: "gpu", label: "GPU", shortLabel: "GPU" },
  { key: "ram", target: "ram", outputMetric: "ram", label: "RAM", shortLabel: "RAM" },
  { key: "network", target: "network", outputMetric: "network", label: "Network", shortLabel: "Net" },
  { key: "disk", target: "disk", outputMetric: "disk", label: "Disk", shortLabel: "Disk" },
  { key: "gpuMemory", target: "gpu", outputMetric: "gpuMemory", label: "GPU memory", shortLabel: "HBM" }
];
const FLEET_COMPARISON_HOST_LIMIT = 16;
const SYSTEM_CHARACTERIZATION_HOST_LIMIT = 16;
const LIVE_EIGEN_MIN_VARIANCE = 0.0001;
const LIVE_OBSERVATION_LIMIT = 8;
const OPERATOR_SOURCE_ORDER = ["host", "kubernetes", "prometheus", "dcgm", "kafka", "grafana", "docker", "ollama", "node-exporter", "ebpf", "redfish", "provider", "nccl-trace"];
const GB10_OPERATOR_SOURCE_ORDER = ["gb10-nvml-nvidia-smi", "linux-uma-memory", "app-metrics", "nsight-cupti-profiling"];
const DASHBOARD_BLOCK_STORAGE_KEY = "turba.dashboard.blocks.v1";
const DASHBOARD_BLOCKS = [
  { id: "liveResources", label: "Live resource tiles", note: "Host CPU, RAM, GPU, Docker, disk, and service tiles", defaultOn: true },
  { id: "sourceHeartbeat", label: "Source heartbeat", note: "Compact source freshness strip", defaultOn: true },
  { id: "fleetTiles", label: "Fleet tiles", note: "One-card-per-host fleet status", defaultOn: true },
  { id: "productReadiness", label: "Product readiness", note: "Customer hardening and supportability gates", defaultOn: true },
  { id: "liveAlerts", label: "Resource alerts", note: "Live relationship and pressure alerts", defaultOn: false },
  { id: "liveObservationLog", label: "Observation log", note: "Recent notable telemetry events", defaultOn: false },
  { id: "liveTelemetryGraphs", label: "Rolling resource graphs", note: "CPU, RAM, GPU, and network history", defaultOn: false },
  { id: "eventTimeline", label: "Event timeline", note: "Operator event stream", defaultOn: false },
  { id: "demoLaunchpad", label: "Demo launchpad", note: "SPARK demo command shortcuts", defaultOn: false },
  { id: "kafkaStream", label: "Kafka stream", note: "Broker smoke and stream panel", defaultOn: false },
  { id: "dataConfidence", label: "Data confidence", note: "Source quality scoring details", defaultOn: false },
  { id: "replayMode", label: "Replay mode", note: "Telemetry replay controls", defaultOn: false },
  { id: "grafanaMini", label: "Grafana handoff", note: "Mini observability links", defaultOn: false },
  { id: "sparkPair", label: "SPARK pair compare", note: "SPARK1/SPARK2 metrics and clock graph", defaultOn: false },
  { id: "fleetComparison", label: "Pi fleet comparison", note: "Rank table and Pi benchmark histograms", defaultOn: false },
  { id: "systemCharacterization", label: "System characterization", note: "System-ID fingerprints and profiles", defaultOn: false }
];
const DASHBOARD_BLOCK_DEFAULTS = Object.fromEntries(DASHBOARD_BLOCKS.map((block) => [block.id, Boolean(block.defaultOn)]));

const DEFAULT_INGESTION = applySourceImports(SAMPLE_INGESTION, SAMPLE_SOURCE_EXPORTS, ncclTraceFixtures);
let workspaceStore = loadWorkspaceStore(DEFAULT_INGESTION);
let dashboardBlockPreferences = loadDashboardBlockPreferences();
let activeIngestion = applyPersistedBaselines(workspaceStore.ingestion, workspaceStore.baselines);
let jobs = normalizeIngestion(activeIngestion);
let snapshotHistory = normalizeSnapshotStore(workspaceStore.snapshots);
let taskHistory = normalizeTaskHistoryStore(workspaceStore.taskHistory);
let liveTelemetryHistory = [];
let sparkPairClockHistory = [];
let liveObservationClearState = { contextKey: "", clearedAtMs: 0 };
let platformVirtualSensorCache = {
  baseUrl: "",
  fetchedAt: 0,
  inFlight: false,
  matrix: null,
  systemIdentification: null
};
let machineDemoRefreshTimer = null;
let machineDemoLoadInFlight = false;
let sparkPairClockRefreshTimer = null;
let sparkPairClockLoadInFlight = false;
let latestSparkPairComparison = null;
let operatorLaunchpadSignature = "";

const state = {
  scope: "job",
  selectedKey: "run-7421",
  window: "Last 24 hours",
  rate: 6.2,
  samePod: false,
  trendMetric: "usefulCompute",
  schedulerScenario: "recommended",
  operatorReplay: false,
  operatorReplayStartedAt: null,
  dashboardBlocks: dashboardBlockPreferences,
  lastAnalysis: safeDate(workspaceStore.lastAnalysisAt, new Date("2026-05-30T22:01:00-07:00")),
  storageLabel: workspaceStore.storageLabel,
  storageTone: workspaceStore.storageTone,
  ingestLabel: "Sample feed",
  ingestTone: "good"
};

if (snapshotHistory.length === 0) {
  captureAnalysisSnapshot("Seeded sample", state.lastAnalysis);
  persistWorkspaceStore();
} else if (taskHistory.length === 0) {
  captureTaskMemorySnapshot("Task memory seed", state.lastAnalysis);
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
  networkUtilization: {
    label: "Network utilization",
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
  },
  sellableWasteValue: {
    label: "Sellable waste value",
    unit: "USD",
    higherIsBetter: false,
    format: (value) => currency.format(value),
    formatDelta: (value) => signedCurrency(value)
  },
  opportunityImpactDollars: {
    label: "Opportunity impact",
    unit: "USD",
    higherIsBetter: false,
    format: (value) => currency.format(value),
    formatDelta: (value) => signedCurrency(value)
  },
  reservationBurnPct: {
    label: "Commit burn",
    unit: "percent",
    higherIsBetter: false,
    format: (value) => pct(value),
    formatDelta: (value) => `${signedNumber(value)} pts`
  },
  queueSloPct: {
    label: "Queue SLO",
    unit: "percent",
    higherIsBetter: false,
    format: (value) => pct(value),
    formatDelta: (value) => `${signedNumber(value)} pts`
  },
  grossMarginPct: {
    label: "Gross margin",
    unit: "percent",
    higherIsBetter: true,
    format: (value) => pct(value),
    formatDelta: (value) => `${signedNumber(value)} pts`
  }
};

document.addEventListener("DOMContentLoaded", () => {
  initThemeMode();
  bindEvents();
  prefillMachineDemoUrl();
  render();
  maybeAutoLoadMachineDemoBundle();
  maybeStartSparkPairClockFeed();
});

function initThemeMode() {
  applyThemeMode(resolveThemeMode());
  const toggle = document.querySelector("#themeToggle");
  if (!toggle) return;

  toggle.addEventListener("change", (event) => {
    applyThemeMode(event.target.checked ? "dark" : "light", { persist: true });
  });

  try {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const onSystemThemeChange = (event) => {
      if (readThemeMode()) return;
      applyThemeMode(event.matches ? "dark" : "light");
    };
    if (media.addEventListener) {
      media.addEventListener("change", onSystemThemeChange);
    } else if (media.addListener) {
      media.addListener(onSystemThemeChange);
    }
  } catch {
    // Theme switching remains available even if system preference listeners are blocked.
  }
}

function resolveThemeMode() {
  const stored = readThemeMode();
  if (stored) return stored;

  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function readThemeMode() {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" || stored === "light" ? stored : "";
  } catch {
    return "";
  }
}

function writeThemeMode(theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Non-persistent browser contexts still get the in-session theme.
  }
}

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

function loadWorkspaceStore(defaultIngestion) {
  const persisted = readWorkspaceStore();

  if (isValidWorkspaceStore(persisted)) {
    return {
      ...persisted,
      snapshots: normalizeSnapshotStore(persisted.snapshots),
      taskHistory: normalizeTaskHistoryStore(persisted.taskHistory),
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
    snapshots: snapshotHistory,
    taskHistory
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
  const previousKey = state.selectedKey;
  const previousIdentity = state.scope === "job" ? jobSelectionIdentity(jobs.find((job) => job.id === previousKey)) : "";
  activeIngestion = applyPersistedBaselines(nextIngestion, buildBaselineStore(nextIngestion.runs));
  jobs = normalizeIngestion(activeIngestion);
  state.scope = "job";
  state.selectedKey = resolveJobSelectionKey(previousKey, previousIdentity) || jobs[0]?.id || "";
  state.ingestLabel = label;
  state.ingestTone = "good";
  state.lastAnalysis = new Date();
  captureAnalysisSnapshot(label, state.lastAnalysis);
  persistWorkspaceStore();
  render();
}

function resolveJobSelectionKey(previousKey, previousIdentity) {
  if (previousKey && jobs.some((job) => job.id === previousKey)) return previousKey;
  if (previousIdentity) {
    const matched = jobs.find((job) => jobSelectionIdentity(job) === previousIdentity);
    if (matched) return matched.id;
  }
  return "";
}

function jobSelectionIdentity(job) {
  if (!job) return "";
  if (isMachineDemoItem(job)) {
    const context = job.source?.context || {};
    const address = context.networkLocalAddress || context.hostAddress || context.primaryAddress || "";
    if (address) return `machine-address:${normalizedSelectionToken(address)}`;
    const host = context.hostname || context.node || job.cluster || "";
    if (host) return `machine-host:${normalizedSelectionToken(host)}`;
  }
  return job.id ? `job:${job.id}` : "";
}

function normalizedSelectionToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function restoreWorkspaceStore(store, label) {
  activeIngestion = applyPersistedBaselines(store.ingestion, store.baselines);
  jobs = normalizeIngestion(activeIngestion);
  snapshotHistory = normalizeSnapshotStore(store.snapshots);
  taskHistory = normalizeTaskHistoryStore(store.taskHistory);
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

function createWorkspaceStore(ingestion, { savedAt, lastAnalysisAt, snapshots = [], taskHistory = [] }) {
  return {
    storageSchemaVersion: STORAGE_SCHEMA.version,
    ingestionSchemaVersion: ingestion.schemaVersion,
    savedAt: dateIso(savedAt),
    lastAnalysisAt: dateIso(lastAnalysisAt),
    ingestion,
    baselines: buildBaselineStore(ingestion.runs),
    snapshots: normalizeSnapshotStore(snapshots),
    taskHistory: normalizeTaskHistoryStore(taskHistory)
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

function loadDashboardBlockPreferences() {
  try {
    const raw = window.localStorage.getItem(DASHBOARD_BLOCK_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return normalizeDashboardBlockPreferences(parsed);
  } catch {
    return normalizeDashboardBlockPreferences(null);
  }
}

function saveDashboardBlockPreferences() {
  try {
    window.localStorage.setItem(DASHBOARD_BLOCK_STORAGE_KEY, JSON.stringify(state.dashboardBlocks));
    return true;
  } catch {
    return false;
  }
}

function normalizeDashboardBlockPreferences(preferences) {
  const normalized = { ...DASHBOARD_BLOCK_DEFAULTS };
  if (!isPlainObject(preferences)) return normalized;
  DASHBOARD_BLOCKS.forEach((block) => {
    if (typeof preferences[block.id] === "boolean") normalized[block.id] = preferences[block.id];
  });
  return normalized;
}

function dashboardBlockEnabled(id) {
  return state.dashboardBlocks?.[id] !== false;
}

function resetDashboardBlocksToDefault() {
  state.dashboardBlocks = { ...DASHBOARD_BLOCK_DEFAULTS };
  saveDashboardBlockPreferences();
  render();
}

function enableAllDashboardBlocks() {
  state.dashboardBlocks = Object.fromEntries(DASHBOARD_BLOCKS.map((block) => [block.id, true]));
  saveDashboardBlockPreferences();
  render();
}

function setDashboardBlockEnabled(id, enabled) {
  state.dashboardBlocks = normalizeDashboardBlockPreferences({
    ...state.dashboardBlocks,
    [id]: Boolean(enabled)
  });
  saveDashboardBlockPreferences();
  render();
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
  const taskRecords = [];

  SNAPSHOT_SCOPES.forEach((scope) => {
    buildEntries(scope).forEach((entry) => {
      const summary = summarizeEntry(entry);
      const classifier = classifyBottlenecks(summary);
      records.push(snapshotFromSummary(summary, classifier, sourceLabel, capturedAtIso));

      if (scope === "job") {
        taskRecords.push(taskSnapshotFromSummary(summary, classifier, sourceLabel, capturedAtIso));
      }
    });
  });

  snapshotHistory = normalizeSnapshotStore([...snapshotHistory, ...records]).slice(-SNAPSHOT_LIMIT);
  taskHistory = normalizeTaskHistoryStore([...taskHistory, ...taskRecords]).slice(-TASK_HISTORY_LIMIT);
}

function captureTaskMemorySnapshot(sourceLabel, capturedAt = new Date()) {
  const capturedAtIso = dateIso(capturedAt);
  const taskRecords = buildEntries("job").map((entry) => {
    const summary = summarizeEntry(entry);
    const classifier = classifyBottlenecks(summary);
    return taskSnapshotFromSummary(summary, classifier, sourceLabel, capturedAtIso);
  });

  taskHistory = normalizeTaskHistoryStore([...taskHistory, ...taskRecords]).slice(-TASK_HISTORY_LIMIT);
}

function snapshotFromSummary(summary, classifier, sourceLabel, capturedAt) {
  const provider = providerEconomics(summary);
  const opportunityEngine = generateOpportunities(summary, classifier, provider);

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
      sellableWasteValue: provider.sellableWasteValue,
      opportunityImpactDollars: opportunityEngine.totalImpactDollars,
      opportunityGpuHours: opportunityEngine.totalImpactGpuHours,
      opportunityCount: opportunityEngine.opportunities.length,
      reservationBurnPct: provider.reservationBurnPct,
      queueSloPct: provider.queueSloPct,
      grossMarginPct: provider.grossMarginPct,
      ncclTime: summary.ncclTime,
      networkWait: summary.networkWait,
      networkUtilization: summary.networkUtilization,
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

function taskSnapshotFromSummary(summary, classifier, sourceLabel, capturedAt) {
  return analytics.taskUtilizationSnapshot(summary, {
    classifier,
    sourceLabel,
    capturedAt
  });
}

function normalizeTaskHistoryStore(records = []) {
  if (!Array.isArray(records)) return [];

  return records
    .map((record) => analytics.normalizeTaskUtilizationRecord(record))
    .filter(Boolean)
    .sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt))
    .slice(-TASK_HISTORY_LIMIT);
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
          dashboardUrl: sample.dashboardUrl,
          exploreUrl: sample.exploreUrl,
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
          grafanaDashboardUrl: sample.dashboardUrl,
          grafanaExploreUrl: sample.exploreUrl
        })
      })
    };
  });
}

function grafanaLinksFromSample(sample) {
  const directLinks = [
    sample.dashboardUrl ? { label: sample.dashboardTitle || "Dashboard", type: "dashboard", url: sample.dashboardUrl } : null,
    sample.exploreUrl ? { label: "Explore", type: "explore", url: sample.exploreUrl } : null
  ].filter(Boolean);
  const suppliedLinks = Array.isArray(sample.links) ? sample.links : [];

  return uniqueBy(
    [...directLinks, ...suppliedLinks]
      .filter(isPlainObject)
      .map((link) => compactObject({
        label: String(link.label || link.title || link.type || "Grafana link"),
        type: String(link.type || "dashboard"),
        url: String(link.url || "")
      }))
      .filter((link) => link.url),
    (link) => link.url
  );
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

function redfishHealthPressure(values = []) {
  const labels = values.map((value) => String(value || "").toLowerCase()).filter(Boolean);
  if (labels.some((label) => label.includes("critical"))) return 100;
  if (labels.some((label) => label.includes("warning"))) return 55;
  return undefined;
}

function redfishResourceLabels(resources = []) {
  const labels = resources
    .map((resource) => resource.name || resource.id || resource.model || resource.version)
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return labels.length > 0 ? labels.slice(0, 12) : undefined;
}

function firstString(values = []) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || undefined;
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

function compactObject(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function compactMetrics(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => Number.isFinite(value))
  );
}

function compactSections(sections) {
  return Object.fromEntries(
    Object.entries(sections).filter(([, value]) => (
      isPlainObject(value) ? Object.keys(value).length > 0 : value !== undefined
    ))
  );
}

function ratioPercent(value) {
  return numeric(value) * 100;
}

function optionalPercent(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
}

function pressure(value, low, high) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  if (high <= low) return undefined;
  return clamp(((parsed - low) / (high - low)) * 100, 0, 100);
}

function minutesBetween(start, end) {
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return undefined;
  }

  return Math.max(0, (endDate - startDate) / 60000);
}

function schedulerEventCounts(events = []) {
  return events.reduce((counts, event) => {
    const type = String(event.type || event.reason || event.action || "").toLowerCase();
    if (type.includes("admit") || type.includes("schedule")) counts.admissionAttempts += 1;
    if (type.includes("preempt")) counts.preemptionCount += 1;
    if (type.includes("retry") || type.includes("unschedulable")) counts.placementRetries += 1;
    if (type.includes("locality") || type.includes("cross-pod") || type.includes("cross-rack")) counts.localityMisses += 1;
    if (type.includes("backfill")) counts.backfillCandidates += 1;
    return counts;
  }, {
    admissionAttempts: 0,
    preemptionCount: 0,
    placementRetries: 0,
    localityMisses: 0,
    backfillCandidates: 0
  });
}

function maxFinite(...values) {
  const finite = values
    .map((value) => Number(value))
    .filter(Number.isFinite);
  return finite.length ? Math.max(...finite) : undefined;
}

function firstFinite(...values) {
  for (const entry of values) {
    if (entry === undefined || entry === null || entry === "") continue;
    const parsed = Number(entry);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
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

function entityLabel(collection, key) {
  return collection?.[key]?.label || key || "Unknown";
}

function metric(section, key) {
  return numeric(section?.[key]);
}

function optionalMetric(section, key) {
  if (!section || !(key in section)) return Number.NaN;
  return numeric(section[key], Number.NaN);
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
    ["prometheus", "dcgm", "kubernetes", "scheduler", "grafana", "ebpf", "redfish", "provider", "opportunities"].forEach((key) => {
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

function validateSourceSamples(payload) {
  const roots = [
    { label: "sources", value: payload.sources },
    { label: "sourceExports", value: payload.sourceExports },
    { label: "root", value: payload }
  ].filter((root) => isPlainObject(root.value));

  roots.forEach((root) => {
    ["prometheus", "dcgm", "kubernetes", "scheduler", "grafana", "ebpf", "redfish", "provider", "opportunities"].forEach((key) => {
      validateRunIdSamples(root, key);
    });

    ["ncclTraces", "traces", "nccl"].forEach((key) => {
      validateRunIdSamples(root, key);
    });
  });
}

function validateRunIdSamples(root, key) {
  const samples = root.value[key];
  if (!Array.isArray(samples)) return;

  const prefix = root.label === "root" ? key : `${root.label}.${key}`;
  samples.forEach((sample, index) => {
    if (!isPlainObject(sample)) {
      throw new Error(`${prefix}[${index + 1}] must be an object.`);
    }
    if (!sample.runId) {
      throw new Error(`${prefix}[${index + 1}] is missing runId.`);
    }
  });
}

function extractSourceExports(payload) {
  const sourceRoot = payload?.sources || payload?.sourceExports || payload || {};

  return {
    prometheus: Array.isArray(sourceRoot.prometheus) ? sourceRoot.prometheus : [],
    dcgm: Array.isArray(sourceRoot.dcgm) ? sourceRoot.dcgm : [],
    kubernetes: Array.isArray(sourceRoot.kubernetes) ? sourceRoot.kubernetes : [],
    scheduler: Array.isArray(sourceRoot.scheduler) ? sourceRoot.scheduler : [],
    grafana: Array.isArray(sourceRoot.grafana) ? sourceRoot.grafana : [],
    ebpf: Array.isArray(sourceRoot.ebpf) ? sourceRoot.ebpf : [],
    redfish: Array.isArray(sourceRoot.redfish) ? sourceRoot.redfish : [],
    provider: Array.isArray(sourceRoot.provider) ? sourceRoot.provider : [],
    opportunities: Array.isArray(sourceRoot.opportunities) ? sourceRoot.opportunities : []
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
  return sources.prometheus.length > 0
    || sources.dcgm.length > 0
    || sources.kubernetes.length > 0
    || sources.scheduler.length > 0
    || sources.grafana.length > 0
    || sources.ebpf.length > 0
    || sources.redfish.length > 0
    || sources.provider.length > 0
    || sources.opportunities.length > 0;
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

function prefillMachineDemoUrl() {
  if (!shouldOfferMachineDemoBundle()) return;
  const input = document.querySelector("#apiInput");
  if (input && !input.value) {
    input.value = machineDemoBundleUrl();
  }
}

async function maybeAutoLoadMachineDemoBundle() {
  if (!shouldAutoLoadMachineDemoBundle()) return;

  await loadMachineDemoBundle();
  startMachineDemoRefresh();
}

function maybeStartSparkPairClockFeed() {
  if (!shouldAutoLoadSparkPairClockFeed()) return;
  loadSparkPairClockFeed();
  startSparkPairClockRefresh();
}

async function loadMachineDemoBundle({ quiet = false } = {}) {
  if (machineDemoLoadInFlight) return;
  machineDemoLoadInFlight = true;
  const requestUrl = machineDemoBundleUrl();
  try {
    if (!quiet) setIngestStatus("Fetching machine demo", "watch");
    const response = await window.fetch(cacheBustUrl(requestUrl));
    if (!response.ok) {
      throw new Error(`Machine demo ${response.status}`);
    }
    const loadedAt = new Date();
    await ingestJsonPayload(
      parseImportJson(await response.text(), "Machine demo did not return valid JSON."),
      `Live machine telemetry ${loadedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
    );
  } catch (error) {
    setIngestStatus(importErrorMessage(error, "Machine demo fetch failed"), "poor");
  } finally {
    machineDemoLoadInFlight = false;
  }
}

function startMachineDemoRefresh() {
  if (machineDemoRefreshTimer || !shouldAutoLoadMachineDemoBundle()) return;
  machineDemoRefreshTimer = window.setInterval(() => {
    if (document.hidden) return;
    loadMachineDemoBundle({ quiet: true });
  }, MACHINE_DEMO_REFRESH_MS);
}

function startSparkPairClockRefresh() {
  if (sparkPairClockRefreshTimer || !shouldAutoLoadSparkPairClockFeed()) return;
  sparkPairClockRefreshTimer = window.setInterval(() => {
    if (document.hidden) return;
    loadSparkPairClockFeed();
  }, SPARK_PAIR_CLOCK_REFRESH_MS);
}

async function loadSparkPairClockFeed() {
  if (sparkPairClockLoadInFlight) return;
  sparkPairClockLoadInFlight = true;
  try {
    const response = await window.fetch(cacheBustUrl(sparkPairClockFeedUrl()));
    if (!response.ok) return;
    applySparkPairClockFeed(parseImportJson(await response.text(), "SPARK clock feed did not return valid JSON."));
  } catch {
    // The fast clock feed is optional; the full live-machine bundle remains the fallback.
  } finally {
    sparkPairClockLoadInFlight = false;
  }
}

function shouldOfferMachineDemoBundle() {
  const params = new URLSearchParams(window.location.search);
  return params.get("demo") === "machine" || isKnownMachineDemoHost();
}

function shouldAutoLoadMachineDemoBundle() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") === "sample") return false;
  if (params.get("demo") === "machine" || params.get("source") === "machine") return true;
  return isKnownMachineDemoHost();
}

function shouldAutoLoadSparkPairClockFeed() {
  const params = new URLSearchParams(window.location.search);
  if (["0", "false", "off"].includes(String(params.get("clockFeed") || "").toLowerCase())) return false;
  return shouldAutoLoadMachineDemoBundle() && (isLakehouseDashboardHost() || params.has("clockFeed"));
}

function isKnownMachineDemoHost() {
  return [
    "192.168.10.30",
    "nuc14e",
    "192.168.10.20",
    "spark1",
    "192.168.10.21",
    ...PI_FLEET_HOSTNAMES,
    "100.96.89.98",
    "dgx-pat"
  ].includes(window.location.hostname.toLowerCase());
}

function machineDemoBundleUrl() {
  const params = new URLSearchParams(window.location.search);
  return parseImportUrl(params.get("bundle") || "build/demo/live-machine-bundle.json");
}

function sparkPairClockFeedUrl() {
  const params = new URLSearchParams(window.location.search);
  return parseImportUrl(params.get("clockFeed") || "build/demo/spark-clock-offset.json");
}

function platformApiBaseUrl() {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("platformApi");
  if (!value && isLakehouseDashboardHost()) {
    if (window.location.protocol === "https:") return `${window.location.origin}/api`;
    return `${window.location.protocol}//${window.location.hostname}:8080`;
  }
  if (!value) return "";
  try {
    const url = new URL(value, window.location.href);
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function isLakehouseDashboardHost() {
  return ["192.168.10.30", "nuc14e"].includes(window.location.hostname.toLowerCase());
}

function platformApiUrl(path) {
  const base = platformApiBaseUrl();
  return base ? `${base}${path}` : "";
}

function platformApiAuthToken() {
  const params = new URLSearchParams(window.location.search);
  const queryToken = String(params.get("apiToken") || "").trim();
  if (queryToken) return queryToken;
  try {
    return String(window.localStorage.getItem(PLATFORM_API_TOKEN_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

function writePlatformApiAuthToken(token) {
  try {
    if (token) {
      window.localStorage.setItem(PLATFORM_API_TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(PLATFORM_API_TOKEN_STORAGE_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

function platformApiFetch(path) {
  const url = platformApiUrl(path);
  const token = platformApiAuthToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return window.fetch(url, { headers });
}

function cacheBustUrl(url) {
  const nextUrl = new URL(url, window.location.href);
  nextUrl.searchParams.set("_", Date.now().toString());
  return nextUrl.href;
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

function exportWorkspace({ redacted = false } = {}) {
  const exportedAt = new Date();
  const rawStore = createWorkspaceStore(activeIngestion, {
    savedAt: exportedAt,
    lastAnalysisAt: state.lastAnalysis,
    snapshots: snapshotHistory,
    taskHistory
  });
  const store = redacted ? redactWorkspaceStore(rawStore) : rawStore;
  const blob = new Blob([`${JSON.stringify(store, null, 2)}\n`], { type: "application/json" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `turba-workspace${redacted ? "-redacted" : ""}-${fileDateStamp(exportedAt)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
  setIngestStatus(redacted ? "Redacted workspace exported" : "Workspace exported", "good");
}

function exportEvidencePack() {
  const exportedAt = new Date();
  const analysis = currentAnalysis();
  if (!analysis) {
    setIngestStatus("No evidence target", "watch");
    return;
  }

  const store = createWorkspaceStore(activeIngestion, {
    savedAt: exportedAt,
    lastAnalysisAt: state.lastAnalysis,
    snapshots: snapshotHistory,
    taskHistory
  });
  const plan = buildRedactionPlan(store);
  const markdown = buildEvidencePackMarkdown({
    ...analysis,
    plan,
    exportedAt
  });
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `turbalance-evidence-pack-${safeFileSlug(analysis.summary.scope)}-${safeFileSlug(redactedSummaryKey(analysis.summary, plan))}-${fileDateStamp(exportedAt)}.md`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
  setIngestStatus("Evidence pack exported", "good");
}

function currentAnalysis() {
  const entries = buildEntries(state.scope);
  const activeEntry = entries.find((entry) => entry.key === state.selectedKey) || entries[0];
  if (!activeEntry) return null;

  const summary = displaySummary(activeEntry);
  const classifier = classifyBottlenecks(summary);
  const provider = providerEconomics(summary);
  const opportunityEngine = generateOpportunities(summary, classifier, provider);
  const schedulerSimulator = simulateScheduler(summary);

  return {
    summary,
    classifier,
    provider,
    opportunityEngine,
    schedulerSimulator
  };
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

function redactedSummaryKey(summary, plan) {
  return redactSnapshotKey(summary.scope, summary.key, plan);
}

function redactedSummaryLabel(summary, plan) {
  const key = redactedSummaryKey(summary, plan);
  return key === summary.key ? summary.label : redactedLabel(key);
}

function redactedProviderContext(summary, plan) {
  return {
    tenant: redactedRefList(summary, plan, "tenant"),
    account: redactedRefList(summary, plan, "account"),
    reservation: redactedRefList(summary, plan, "reservation")
  };
}

function redactedRefList(summary, plan, refKey) {
  const collection = REF_COLLECTIONS[refKey];
  if (!collection) return "n/a";

  const values = unique((summary.sourceItems || [])
    .map((job) => job.source?.refs?.[refKey] || job[refKey])
    .filter(Boolean)
    .map((value) => mappedValue(plan.entities[collection], value, refKey)));

  return listLabel(values, 3);
}

function redactedSourceRows(summary, plan) {
  return (summary.sourceItems || []).map((job) => {
    const refs = redactRefs(job.source?.refs || {}, plan);
    const context = redactSourceContext(job.source?.context || {}, plan);
    const contextPairs = Object.entries(context)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => `${key}=${value}`);

    return {
      run: mappedValue(plan.runs, job.id, "run"),
      adapters: (job.source?.adapters || []).join(", ") || "seed",
      tenant: refs.tenant || "n/a",
      account: refs.account || "n/a",
      reservation: refs.reservation || "n/a",
      context: contextPairs.length > 0 ? contextPairs.join("; ") : "no source context"
    };
  });
}

function redactedGrafanaRows(summary, plan) {
  return (summary.sourceItems || []).flatMap((job) => {
    const context = redactGrafanaContext(job.grafanaContext || {}, plan);
    if (!context || Object.keys(context).length === 0) return [];

    const links = context.links?.length ? context.links : [
      context.dashboardUrl ? { label: context.dashboardTitle || "Dashboard", type: "dashboard", url: context.dashboardUrl } : null,
      context.exploreUrl ? { label: "Explore", type: "explore", url: context.exploreUrl } : null
    ].filter(Boolean);

    return links.map((link) => ({
      run: mappedValue(plan.runs, job.id, "run"),
      dashboard: context.dashboardTitle || context.dashboardUid || "n/a",
      datasource: context.datasourceName || context.datasourceUid || "n/a",
      link: `${link.label || titleCase(link.type || "link")}: ${link.url}`,
      timeRange: grafanaTimeRangeLabel(context.timeRange)
    }));
  });
}

function opportunityImpactLabel(opportunity) {
  const dollars = opportunity.impactDollars > 0 ? currency.format(opportunity.impactDollars) : "";
  const gpuHours = opportunity.impactGpuHours > 0 ? `${number.format(opportunity.impactGpuHours)} GPU-hours` : "";
  return [dollars, gpuHours].filter(Boolean).join(" / ") || "n/a";
}

function markdownCell(value) {
  return markdownText(value).replace(/\|/g, "\\|");
}

function markdownText(value) {
  return String(value || "n/a").replace(/\s+/g, " ").trim();
}

function schedulerEvidenceSummaryLine(summary) {
  const evidence = summary.schedulerEvidence || {};
  if (numeric(evidence.sourceCount) <= 0) {
    return "Evidence: no scheduler event overlay attached; estimates use normalized queue, placement, and topology metrics.";
  }

  const parts = [
    `${number.format(evidence.sourceCount)} scheduler source ${evidence.sourceCount === 1 ? "record" : "records"}`,
    `${number.format(evidence.eventCount)} events`
  ];

  if (numeric(evidence.placementRetries) > 0) parts.push(`${number.format(evidence.placementRetries)} placement retries`);
  if (numeric(evidence.localityMisses) > 0) parts.push(`${number.format(evidence.localityMisses)} locality misses`);
  if (numeric(evidence.preemptionCount) > 0) parts.push(`${number.format(evidence.preemptionCount)} preemptions`);

  return `Evidence: ${parts.join(", ")}.`;
}

function safeFileSlug(value) {
  return String(value || "selection")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "selection";
}

const ENTITY_REDACTION_PREFIXES = {
  models: "model",
  users: "user",
  teams: "team",
  clusters: "cluster",
  tenants: "tenant",
  accounts: "account",
  reservations: "reservation"
};

const REF_COLLECTIONS = {
  model: "models",
  user: "users",
  team: "teams",
  cluster: "clusters",
  tenant: "tenants",
  account: "accounts",
  reservation: "reservations"
};

function redactWorkspaceStore(store) {
  const plan = buildRedactionPlan(store);
  const redacted = cloneJson(store);

  redacted.ingestion = redactIngestion(redacted.ingestion, plan);
  redacted.baselines = redactBaselineStore(redacted.baselines, plan);
  redacted.snapshots = redactSnapshots(redacted.snapshots, plan);
  redacted.taskHistory = redactTaskHistory(redacted.taskHistory, plan);
  redacted.redaction = {
    redactedAt: dateIso(new Date()),
    strategy: "deterministic surrogate IDs",
    fields: [
      "run ids",
      "model/user/team/cluster/tenant/account/reservation refs",
    "commercial contract ids",
    "support ticket ids",
    "provider and eBPF source context",
    "scheduler source context",
    "Grafana dashboard and Explore links",
    "Redfish management-plane context",
    "imported opportunity free text"
    ]
  };

  return redacted;
}

function buildRedactionPlan(store) {
  const ingestion = store.ingestion || {};
  const runs = Array.isArray(ingestion.runs) ? ingestion.runs : [];
  const entities = ingestion.entities || {};
  const taskRecords = Array.isArray(store.taskHistory) ? store.taskHistory : [];
  const plan = {
    entities: {},
    runs: buildValueMap(runs.map((run) => run.id), "run"),
    taskKeys: buildValueMap(taskRecords.map((record) => record.taskKey), "task"),
    contracts: buildValueMap(runs.map((run) => run.commercial?.contractId), "contract"),
    tickets: buildValueMap(runs.map((run) => run.slo?.supportTicketId), "ticket"),
    namespaces: buildValueMap(runs.map((run) => run.sourceContext?.namespace), "namespace"),
    podSelectors: buildValueMap(runs.map((run) => run.sourceContext?.podSelector), "pod-selector"),
    slurmJobIds: buildValueMap(runs.map((run) => run.sourceContext?.slurmJobId), "slurm-job"),
    ebpfExports: buildValueMap(runs.map((run) => run.sourceContext?.ebpfExportId), "ebpf-export"),
    hosts: buildValueMap(runs.map((run) => run.sourceContext?.host), "host"),
    nodes: buildValueMap(runs.map((run) => run.sourceContext?.node), "node"),
    podNames: buildValueMap(runs.map((run) => run.sourceContext?.podName), "pod"),
    containerNames: buildValueMap(runs.map((run) => run.sourceContext?.containerName), "container"),
    cgroupPaths: buildValueMap(runs.map((run) => run.sourceContext?.cgroupPath), "cgroup"),
    providerExports: buildValueMap(runs.map((run) => run.sourceContext?.providerExportId), "provider-export"),
    billingAccounts: buildValueMap(runs.map((run) => run.sourceContext?.billingAccountId), "billing-account"),
    reservationWindows: buildValueMap(runs.map((run) => run.sourceContext?.reservationWindow), "reservation-window"),
    schedulerExports: buildValueMap(runs.map((run) => run.sourceContext?.schedulerExportId), "scheduler-export"),
    grafanaBaseUrls: buildValueMap(flattenRunValues(runs, (run) => [run.sourceContext?.grafanaBaseUrl, run.grafanaContext?.grafanaBaseUrl]), "grafana-base"),
    grafanaInstances: buildValueMap(flattenRunValues(runs, (run) => [run.sourceContext?.grafanaInstance, run.grafanaContext?.instanceName]), "grafana-instance"),
    grafanaOrgIds: buildValueMap(flattenRunValues(runs, (run) => [run.sourceContext?.grafanaOrgId, run.grafanaContext?.orgId]), "grafana-org"),
    grafanaDashboardUids: buildValueMap(flattenRunValues(runs, (run) => [run.sourceContext?.grafanaDashboardUid, run.grafanaContext?.dashboardUid]), "grafana-dashboard"),
    grafanaDashboardSlugs: buildValueMap(flattenRunValues(runs, (run) => [run.sourceContext?.grafanaDashboardSlug, run.grafanaContext?.dashboardSlug]), "grafana-slug"),
    grafanaDashboardTitles: buildValueMap(flattenRunValues(runs, (run) => [run.sourceContext?.grafanaDashboardTitle, run.grafanaContext?.dashboardTitle]), "grafana-title"),
    grafanaFolders: buildValueMap(flattenRunValues(runs, (run) => [run.sourceContext?.grafanaFolder, run.grafanaContext?.folder]), "grafana-folder"),
    grafanaDatasourceUids: buildValueMap(flattenRunValues(runs, (run) => [run.sourceContext?.grafanaDatasourceUid, run.grafanaContext?.datasourceUid]), "grafana-datasource"),
    grafanaDatasourceNames: buildValueMap(flattenRunValues(runs, (run) => [run.sourceContext?.grafanaDatasourceName, run.grafanaContext?.datasourceName]), "grafana-datasource-name"),
    grafanaUrls: buildValueMap(flattenRunValues(runs, (run) => [
      run.sourceContext?.grafanaDashboardUrl,
      run.sourceContext?.grafanaExploreUrl,
      run.grafanaContext?.dashboardUrl,
      run.grafanaContext?.exploreUrl,
      ...((run.grafanaContext?.links || []).map((link) => link?.url))
    ]), "grafana-url"),
    grafanaVariableValues: buildValueMap(flattenRunValues(runs, (run) => Object.values(run.grafanaContext?.variables || {})), "grafana-var"),
    redfishBaseUrls: buildValueMap(runs.map((run) => run.sourceContext?.redfishBaseUrl), "redfish-base"),
    redfishServiceUuids: buildValueMap(runs.map((run) => run.sourceContext?.redfishServiceUuid), "redfish-service"),
    redfishBiosVersions: buildValueMap(runs.map((run) => run.sourceContext?.redfishBiosVersion), "redfish-bios"),
    redfishManagerFirmwareVersions: buildValueMap(runs.map((run) => run.sourceContext?.redfishManagerFirmwareVersion), "redfish-manager-fw"),
    redfishSystems: buildValueMap(flattenRunValues(runs, (run) => run.sourceContext?.redfishSystems || []), "redfish-system"),
    redfishChassis: buildValueMap(flattenRunValues(runs, (run) => run.sourceContext?.redfishChassis || []), "redfish-chassis"),
    redfishManagers: buildValueMap(flattenRunValues(runs, (run) => run.sourceContext?.redfishManagers || []), "redfish-manager"),
    redfishFirmwareInventory: buildValueMap(flattenRunValues(runs, (run) => run.sourceContext?.redfishFirmwareInventory || []), "redfish-firmware"),
    schedulerNames: buildValueMap(flattenRunValues(runs, (run) => [run.sourceContext?.schedulerName, run.schedulerEvidence?.schedulerName, ...(run.schedulerEvidence?.schedulerNames || [])]), "scheduler"),
    schedulerQueues: buildValueMap(flattenRunValues(runs, (run) => [run.sourceContext?.queueName, run.schedulerEvidence?.queueName, ...(run.schedulerEvidence?.queueNames || [])]), "queue"),
    priorityClasses: buildValueMap(flattenRunValues(runs, (run) => [run.sourceContext?.priorityClass, run.schedulerEvidence?.priorityClass, ...(run.schedulerEvidence?.priorityClasses || [])]), "priority"),
    admissionClasses: buildValueMap(flattenRunValues(runs, (run) => [run.sourceContext?.admissionClass, run.schedulerEvidence?.admissionClass, ...(run.schedulerEvidence?.admissionClasses || [])]), "admission"),
    requestedGpuShapes: buildValueMap(flattenRunValues(runs, (run) => [run.sourceContext?.requestedGpuShape, run.schedulerEvidence?.requestedGpuShape, ...(run.schedulerEvidence?.requestedGpuShapes || [])]), "shape"),
    localityPreferences: buildValueMap(flattenRunValues(runs, (run) => [run.sourceContext?.localityPreference, run.schedulerEvidence?.localityPreference, ...(run.schedulerEvidence?.localityPreferences || [])]), "locality"),
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
      runs.map((run) => run.refs?.[singularCollection(collection)]),
      prefix
    );
  });

  return plan;
}

function redactIngestion(ingestion, plan) {
  return {
    ...ingestion,
    entities: redactEntities(ingestion.entities || {}, plan),
    runs: (ingestion.runs || []).map((run) => redactRun(run, plan))
  };
}

function redactEntities(entities, plan) {
  const nextEntities = { ...entities };

  Object.entries(ENTITY_REDACTION_PREFIXES).forEach(([collection, prefix]) => {
    if (!entities[collection]) return;

    nextEntities[collection] = Object.fromEntries(
      Object.entries(entities[collection]).map(([key, value]) => {
        const redactedKey = mappedValue(plan.entities[collection], key, prefix);
        return [
          redactedKey,
          {
            ...value,
            label: redactedLabel(redactedKey)
          }
        ];
      })
    );
  });

  return nextEntities;
}

function redactRun(run, plan) {
  const redactedRunId = mappedValue(plan.runs, run.id, "run");

  return {
    ...run,
    id: redactedRunId,
    name: redactedLabel(redactedRunId),
    refs: redactRefs(run.refs || {}, plan),
    commercial: redactCommercial(run.commercial || {}, plan),
    slo: redactSlo(run.slo || {}, plan),
    schedulerEvidence: redactSchedulerEvidence(run.schedulerEvidence || {}, plan),
    grafanaContext: redactGrafanaContext(run.grafanaContext || {}, plan),
    opportunities: redactOpportunities(run.opportunities || []),
    sourceContext: redactSourceContext(run.sourceContext || {}, plan)
  };
}

function redactRefs(refs, plan) {
  return Object.fromEntries(
    Object.entries(refs).map(([key, value]) => {
      const collection = REF_COLLECTIONS[key];
      return [key, collection ? mappedValue(plan.entities[collection], value, key) : value];
    })
  );
}

function redactCommercial(commercial, plan) {
  return {
    ...commercial,
    contractId: mappedValue(plan.contracts, commercial.contractId, "contract")
  };
}

function redactSlo(slo, plan) {
  return {
    ...slo,
    supportTicketId: mappedValue(plan.tickets, slo.supportTicketId, "ticket")
  };
}

function redactOpportunities(opportunities = []) {
  if (!Array.isArray(opportunities)) return [];

  return opportunities.map((opportunity, index) => compactObject({
    id: opportunity.id ? `opportunity-${index + 1}` : undefined,
    category: opportunity.category ? "Redacted Opportunity" : undefined,
    title: opportunity.title ? "Redacted imported opportunity" : undefined,
    impactDollars: opportunity.impactDollars,
    impactGpuHours: opportunity.impactGpuHours,
    riskScore: opportunity.riskScore,
    confidence: opportunity.confidence,
    evidence: opportunity.evidence ? "Redacted imported opportunity evidence." : undefined,
    recommendation: opportunity.recommendation ? "Review the redacted opportunity in the original workspace." : undefined,
    owner: opportunity.owner ? "redacted-owner" : undefined,
    sourceSignals: opportunity.sourceSignals || {}
  }));
}

function redactSchedulerEvidence(evidence = {}, plan) {
  if (!isPlainObject(evidence)) return {};

  return compactObject({
    ...evidence,
    schedulerName: mappedValue(plan.schedulerNames, evidence.schedulerName, "scheduler"),
    queueName: mappedValue(plan.schedulerQueues, evidence.queueName, "queue"),
    priorityClass: mappedValue(plan.priorityClasses, evidence.priorityClass, "priority"),
    admissionClass: mappedValue(plan.admissionClasses, evidence.admissionClass, "admission"),
    requestedGpuShape: mappedValue(plan.requestedGpuShapes, evidence.requestedGpuShape, "shape"),
    localityPreference: mappedValue(plan.localityPreferences, evidence.localityPreference, "locality"),
    schedulerNames: redactValueList(plan.schedulerNames, evidence.schedulerNames, "scheduler"),
    queueNames: redactValueList(plan.schedulerQueues, evidence.queueNames, "queue"),
    priorityClasses: redactValueList(plan.priorityClasses, evidence.priorityClasses, "priority"),
    admissionClasses: redactValueList(plan.admissionClasses, evidence.admissionClasses, "admission"),
    requestedGpuShapes: redactValueList(plan.requestedGpuShapes, evidence.requestedGpuShapes, "shape"),
    localityPreferences: redactValueList(plan.localityPreferences, evidence.localityPreferences, "locality")
  });
}

function redactGrafanaContext(context = {}, plan) {
  if (!isPlainObject(context)) return {};

  const variables = isPlainObject(context.variables)
    ? Object.fromEntries(Object.entries(context.variables).map(([key, value]) => [
      key,
      mappedValue(plan.grafanaVariableValues, value, "grafana-var")
    ]))
    : undefined;
  const links = Array.isArray(context.links)
    ? context.links.map((link) => compactObject({
      ...link,
      label: link.label ? `${titleCase(link.type || "grafana")} link` : undefined,
      url: mappedValue(plan.grafanaUrls, link.url, "grafana-url")
    }))
    : undefined;

  return compactObject({
    ...context,
    grafanaBaseUrl: mappedValue(plan.grafanaBaseUrls, context.grafanaBaseUrl, "grafana-base"),
    instanceName: mappedValue(plan.grafanaInstances, context.instanceName, "grafana-instance"),
    orgId: mappedValue(plan.grafanaOrgIds, context.orgId, "grafana-org"),
    dashboardUid: mappedValue(plan.grafanaDashboardUids, context.dashboardUid, "grafana-dashboard"),
    dashboardSlug: mappedValue(plan.grafanaDashboardSlugs, context.dashboardSlug, "grafana-slug"),
    dashboardTitle: mappedValue(plan.grafanaDashboardTitles, context.dashboardTitle, "grafana-title"),
    folder: mappedValue(plan.grafanaFolders, context.folder, "grafana-folder"),
    datasourceUid: mappedValue(plan.grafanaDatasourceUids, context.datasourceUid, "grafana-datasource"),
    datasourceName: mappedValue(plan.grafanaDatasourceNames, context.datasourceName, "grafana-datasource-name"),
    dashboardUrl: mappedValue(plan.grafanaUrls, context.dashboardUrl, "grafana-url"),
    exploreUrl: mappedValue(plan.grafanaUrls, context.exploreUrl, "grafana-url"),
    variables,
    links
  });
}

function redactSourceContext(context, plan) {
  return compactObject({
    ...context,
    namespace: mappedValue(plan.namespaces, context.namespace, "namespace"),
    podSelector: mappedValue(plan.podSelectors, context.podSelector, "pod-selector"),
    slurmJobId: mappedValue(plan.slurmJobIds, context.slurmJobId, "slurm-job"),
    ebpfExportId: mappedValue(plan.ebpfExports, context.ebpfExportId, "ebpf-export"),
    host: mappedValue(plan.hosts, context.host, "host"),
    node: mappedValue(plan.nodes, context.node, "node"),
    podName: mappedValue(plan.podNames, context.podName, "pod"),
    containerName: mappedValue(plan.containerNames, context.containerName, "container"),
    cgroupPath: mappedValue(plan.cgroupPaths, context.cgroupPath, "cgroup"),
    providerExportId: mappedValue(plan.providerExports, context.providerExportId, "provider-export"),
    billingAccountId: mappedValue(plan.billingAccounts, context.billingAccountId, "billing-account"),
    reservationWindow: mappedValue(plan.reservationWindows, context.reservationWindow, "reservation-window"),
    schedulerExportId: mappedValue(plan.schedulerExports, context.schedulerExportId, "scheduler-export"),
    schedulerName: mappedValue(plan.schedulerNames, context.schedulerName, "scheduler"),
    queueName: mappedValue(plan.schedulerQueues, context.queueName, "queue"),
    priorityClass: mappedValue(plan.priorityClasses, context.priorityClass, "priority"),
    admissionClass: mappedValue(plan.admissionClasses, context.admissionClass, "admission"),
    requestedGpuShape: mappedValue(plan.requestedGpuShapes, context.requestedGpuShape, "shape"),
    localityPreference: mappedValue(plan.localityPreferences, context.localityPreference, "locality"),
    grafanaBaseUrl: mappedValue(plan.grafanaBaseUrls, context.grafanaBaseUrl, "grafana-base"),
    grafanaInstance: mappedValue(plan.grafanaInstances, context.grafanaInstance, "grafana-instance"),
    grafanaOrgId: mappedValue(plan.grafanaOrgIds, context.grafanaOrgId, "grafana-org"),
    grafanaDashboardUid: mappedValue(plan.grafanaDashboardUids, context.grafanaDashboardUid, "grafana-dashboard"),
    grafanaDashboardSlug: mappedValue(plan.grafanaDashboardSlugs, context.grafanaDashboardSlug, "grafana-slug"),
    grafanaDashboardTitle: mappedValue(plan.grafanaDashboardTitles, context.grafanaDashboardTitle, "grafana-title"),
    grafanaFolder: mappedValue(plan.grafanaFolders, context.grafanaFolder, "grafana-folder"),
    grafanaDatasourceUid: mappedValue(plan.grafanaDatasourceUids, context.grafanaDatasourceUid, "grafana-datasource"),
    grafanaDatasourceName: mappedValue(plan.grafanaDatasourceNames, context.grafanaDatasourceName, "grafana-datasource-name"),
    grafanaDashboardUrl: mappedValue(plan.grafanaUrls, context.grafanaDashboardUrl, "grafana-url"),
    grafanaExploreUrl: mappedValue(plan.grafanaUrls, context.grafanaExploreUrl, "grafana-url"),
    redfishBaseUrl: mappedValue(plan.redfishBaseUrls, context.redfishBaseUrl, "redfish-base"),
    redfishServiceUuid: mappedValue(plan.redfishServiceUuids, context.redfishServiceUuid, "redfish-service"),
    redfishBiosVersion: mappedValue(plan.redfishBiosVersions, context.redfishBiosVersion, "redfish-bios"),
    redfishManagerFirmwareVersion: mappedValue(plan.redfishManagerFirmwareVersions, context.redfishManagerFirmwareVersion, "redfish-manager-fw"),
    redfishSystems: redactValueList(plan.redfishSystems, context.redfishSystems, "redfish-system"),
    redfishChassis: redactValueList(plan.redfishChassis, context.redfishChassis, "redfish-chassis"),
    redfishManagers: redactValueList(plan.redfishManagers, context.redfishManagers, "redfish-manager"),
    redfishFirmwareInventory: redactValueList(plan.redfishFirmwareInventory, context.redfishFirmwareInventory, "redfish-firmware"),
    redfishWarnings: Array.isArray(context.redfishWarnings) ? context.redfishWarnings.map((_warning, index) => `redfish-warning-${index + 1}`) : undefined
  });
}

function redactBaselineStore(baselines = {}, plan) {
  return Object.fromEntries(
    Object.entries(baselines).map(([runId, baseline]) => [
      mappedValue(plan.runs, runId, "run"),
      baseline
    ])
  );
}

function redactSnapshots(snapshots = [], plan) {
  return snapshots.map((snapshot) => {
    const key = redactSnapshotKey(snapshot.scope, snapshot.key, plan);
    return {
      ...snapshot,
      key,
      label: key === snapshot.key ? snapshot.label : redactedLabel(key)
    };
  });
}

function redactTaskHistory(records = [], plan) {
  if (!Array.isArray(records)) return [];

  return records.map((record) => {
    const taskKey = mappedValue(plan.taskKeys, record.taskKey, "task");
    const key = record.scope === "job" ? mappedValue(plan.runs, record.key, "run") : record.key;

    return {
      ...record,
      key,
      label: redactedLabel(taskKey),
      taskKey,
      taskLabel: redactedLabel(taskKey),
      taskFamily: taskKey,
      runIds: redactValueList(plan.runs, record.runIds, "run"),
      resources: redactTaskResources(record.resources || {}, plan)
    };
  });
}

function redactTaskResources(resources = {}, plan) {
  return {
    ...resources,
    gpuModels: redactValueList(plan.taskGpuModels, resources.gpuModels, "gpu-model"),
    clusters: redactValueList(plan.taskClusters, resources.clusters, "cluster"),
    nodes: redactValueList(plan.taskNodes, resources.nodes, "node"),
    partialNodes: redactValueList(plan.taskNodes, resources.partialNodes, "node"),
    tenants: redactValueList(plan.taskTenants, resources.tenants, "tenant"),
    accounts: redactValueList(plan.taskAccounts, resources.accounts, "account"),
    reservations: redactValueList(plan.taskReservations, resources.reservations, "reservation"),
    schedulerNames: redactValueList(plan.schedulerNames, resources.schedulerNames, "scheduler"),
    queueNames: redactValueList(plan.schedulerQueues, resources.queueNames, "queue"),
    priorityClasses: redactValueList(plan.priorityClasses, resources.priorityClasses, "priority"),
    admissionClasses: redactValueList(plan.admissionClasses, resources.admissionClasses, "admission"),
    requestedGpuShapes: redactValueList(plan.requestedGpuShapes, resources.requestedGpuShapes, "shape"),
    localityPreferences: redactValueList(plan.localityPreferences, resources.localityPreferences, "locality"),
    hosts: redactValueList(plan.taskHosts, resources.hosts, "host")
  };
}

function redactSnapshotKey(scope, key, plan) {
  if (scope === "job") return mappedValue(plan.runs, key, "run");

  const collection = REF_COLLECTIONS[scope];
  if (!collection) return key;

  return mappedValue(plan.entities[collection], key, scope);
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

function flattenRunValues(runs, getter) {
  return runs.flatMap((run) => {
    const value = getter(run);
    return Array.isArray(value) ? value : [value];
  });
}

function redactValueList(map, values, prefix) {
  if (!Array.isArray(values)) return undefined;
  return values.map((value) => mappedValue(map, value, prefix)).filter(Boolean);
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

function mappedValue(map, value, prefix) {
  const stringValue = String(value || "").trim();
  if (!stringValue) return "";
  return map.get(stringValue) || `${prefix}-unmapped`;
}

function redactedLabel(key) {
  const [prefix, suffix] = String(key).split("-");
  return `${titleCase(prefix)} ${suffix || ""}`.trim();
}

function singularCollection(collection) {
  return collection.endsWith("ies")
    ? `${collection.slice(0, -3)}y`
    : collection.replace(/s$/, "");
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function resetWorkspace() {
  const confirmed = window.confirm("Reset the local turbalance workspace to the sample feed?");
  if (!confirmed) return;

  activeIngestion = applyPersistedBaselines(DEFAULT_INGESTION, buildBaselineStore(DEFAULT_INGESTION.runs));
  jobs = normalizeIngestion(activeIngestion);
  snapshotHistory = [];
  state.scope = "job";
  state.selectedKey = jobs.find((job) => job.id === "run-7421")?.id || jobs[0]?.id || "";
  state.samePod = false;
  state.schedulerScenario = "recommended";
  state.ingestLabel = "Sample feed";
  state.ingestTone = "good";
  state.lastAnalysis = new Date();
  captureAnalysisSnapshot("Reset sample", state.lastAnalysis);
  persistWorkspaceStore();
  render();
}

function captureManualAnalysisSnapshot() {
  state.lastAnalysis = new Date();
  captureAnalysisSnapshot("Manual snapshot", state.lastAnalysis);
  persistWorkspaceStore();
  setIngestStatus("Trend snapshot captured", "good");
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

  document.querySelectorAll("#simulatorControls button").forEach((button) => {
    button.addEventListener("click", () => {
      state.schedulerScenario = button.dataset.schedulerScenario;
      render();
    });
  });

  document.querySelector("#captureSnapshotButton").addEventListener("click", captureManualAnalysisSnapshot);
  document.querySelector("#copyReport").addEventListener("click", copyReport);
  document.querySelector("#ingestFile").addEventListener("change", handleFileIngest);
  document.querySelector("#fetchApiButton").addEventListener("click", handleApiIngest);
  document.querySelector("#exportWorkspaceButton").addEventListener("click", exportWorkspace);
  document.querySelector("#exportRedactedWorkspaceButton").addEventListener("click", () => exportWorkspace({ redacted: true }));
  document.querySelector("#exportEvidencePackButton").addEventListener("click", exportEvidencePack);
  document.querySelector("#resetWorkspaceButton").addEventListener("click", resetWorkspace);
}

function render() {
  renderScopeControls();
  renderAnalysisStamp();
  renderIngestState();
  renderDashboardSettingsPanel();

  const entries = buildEntries(state.scope);
  if (!entries.some((entry) => entry.key === state.selectedKey)) {
    state.selectedKey = entries[0].key;
  }

  const activeEntry = entries.find((entry) => entry.key === state.selectedKey);
  const summary = displaySummary(activeEntry);
  const classifier = classifyBottlenecks(summary);
  const components = scoreComponents(summary);
  const fingerprint = fingerprintWorkload(summary);
  const provider = providerEconomics(summary);
  const opportunityEngine = generateOpportunities(summary, classifier, provider);
  const schedulerSimulator = simulateScheduler(summary);

  renderInventory(entries);
  renderDiagnosis(summary, classifier);
  renderLiveResources(summary);
  renderOperatorCockpit(summary, classifier, opportunityEngine, schedulerSimulator);
  renderMetricRibbon(summary);
  renderSchedulerSimulator(schedulerSimulator, summary);
  renderGrafanaHandoff(summary);
  renderTaskMemory(buildTaskMemory(summary, classifier));
  renderTrend(summary);
  renderTruthTable(summary);
  renderBottleneck(summary, classifier);
  renderProviderLens(summary, provider, classifier);
  renderProviderSummaryTables();
  renderOpportunityCenter(opportunityEngine);
  renderComponents(components);
  renderTopology(summary);
  renderFingerprint(fingerprint);
  renderRegression(summary);
  renderReport(summary, classifier);
  applyDashboardBlockVisibility();
}

function renderIngestState() {
  const ingestEl = document.querySelector("#ingestState");
  if (!ingestEl) return;

  ingestEl.textContent = state.ingestLabel;
  ingestEl.dataset.status = state.ingestTone;
}

function renderDashboardSettingsPanel() {
  const panel = document.querySelector("#dashboardSettingsPanel");
  const controls = document.querySelector("#dashboardSettingsControls");
  const badge = document.querySelector("#dashboardSettingsBadge");
  if (!panel || !controls) return;

  const enabledCount = DASHBOARD_BLOCKS.filter((block) => dashboardBlockEnabled(block.id)).length;
  const defaultCount = DASHBOARD_BLOCKS.filter((block) => block.defaultOn).length;
  const atDefault = DASHBOARD_BLOCKS.every((block) => dashboardBlockEnabled(block.id) === Boolean(block.defaultOn));

  if (badge) {
    badge.textContent = atDefault ? "Bare minimum" : `${enabledCount}/${DASHBOARD_BLOCKS.length} on`;
    badge.dataset.tone = atDefault ? "good" : enabledCount <= defaultCount ? "good" : "watch";
  }

  const actions = document.createElement("div");
  actions.className = "dashboard-settings-actions";
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "Bare minimum";
  reset.addEventListener("click", resetDashboardBlocksToDefault);
  const all = document.createElement("button");
  all.type = "button";
  all.textContent = "Show all";
  all.addEventListener("click", enableAllDashboardBlocks);
  actions.append(reset, all);

  const grid = document.createElement("div");
  grid.className = "dashboard-settings-grid";
  DASHBOARD_BLOCKS.forEach((block) => {
    grid.append(dashboardBlockToggle(block));
  });

  controls.replaceChildren(actions, dashboardApiTokenControl(), grid);
  panel.hidden = false;
}

function dashboardApiTokenControl() {
  const wrap = document.createElement("div");
  wrap.className = "dashboard-api-token-control";

  const label = document.createElement("label");
  label.setAttribute("for", "platformApiTokenInput");
  label.textContent = "Platform API token";

  const input = document.createElement("input");
  input.id = "platformApiTokenInput";
  input.type = "password";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = platformApiAuthToken() ? "Token saved locally" : "Paste bearer token";
  input.value = platformApiAuthToken();

  const status = document.createElement("span");
  status.textContent = platformApiAuthToken() ? "Saved locally" : "No token";
  status.dataset.tone = platformApiAuthToken() ? "good" : "watch";

  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "Save";
  save.addEventListener("click", () => {
    const ok = writePlatformApiAuthToken(input.value.trim());
    status.textContent = ok ? (input.value.trim() ? "Saved locally" : "No token") : "Not saved";
    status.dataset.tone = ok ? (input.value.trim() ? "good" : "watch") : "poor";
  });

  const clear = document.createElement("button");
  clear.type = "button";
  clear.textContent = "Clear";
  clear.addEventListener("click", () => {
    input.value = "";
    const ok = writePlatformApiAuthToken("");
    status.textContent = ok ? "No token" : "Not cleared";
    status.dataset.tone = ok ? "watch" : "poor";
  });

  const actions = document.createElement("div");
  actions.append(save, clear);

  wrap.append(label, input, actions, status);
  return wrap;
}

function dashboardBlockToggle(block) {
  const label = document.createElement("label");
  label.className = "dashboard-block-toggle";
  label.dataset.enabled = String(dashboardBlockEnabled(block.id));

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = dashboardBlockEnabled(block.id);
  input.addEventListener("change", () => setDashboardBlockEnabled(block.id, input.checked));

  const copy = document.createElement("span");
  const title = document.createElement("strong");
  title.textContent = block.label;
  const note = document.createElement("small");
  note.textContent = block.note;
  copy.append(title, note);

  label.append(input, copy);
  return label;
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

function toggleDashboardElement(selector, blockId) {
  const element = document.querySelector(selector);
  if (element) element.hidden = !dashboardBlockEnabled(blockId);
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
    tenants: knownLabels(items.map((job) => job.tenant), "Unassigned tenant"),
    accounts: knownLabels(items.map((job) => job.account), "Unassigned account"),
    reservations: knownLabels(items.map((job) => job.reservation), "No reservation"),
    gpuModels: unique(items.map((job) => job.gpuModel)),
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

function renderScopeControls() {
  document.querySelectorAll("#scopeControls button").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.scope === state.scope));
  });
}

function renderAnalysisStamp() {
  const stateEl = document.querySelector("#analysisState");
  const storageEl = document.querySelector("#storageState");
  const timeEl = document.querySelector("#analysisTime");

  stateEl.textContent = "Ready";
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
    const machineContext = machineDemoContext(summary);

    const score = document.createElement("span");
    score.textContent = machineContext?.driverUnavailable || machineContext?.noGpu
      ? "host only"
      : machineContext?.idle ? "idle now" : `${round(summary.usefulCompute)}% useful`;

    const bottleneck = document.createElement("span");
    bottleneck.textContent = machineContext?.driverUnavailable
      ? "GPU unavailable"
      : machineContext?.noGpu ? "No GPU telemetry" : machineContext?.idle ? "Idle capacity" : classifier.primary.name.replace("-bound", "");

    foot.append(score, bottleneck);
    button.append(titleEl, meta, foot);
    list.append(button);
  });
}

function renderDiagnosis(summary, classifier) {
  const primary = classifier.primary;
  const secondary = classifier.secondary;
  const useful = round(summary.usefulCompute);
  const gpuUtil = round(summary.gpuUtil);
  const primaryLoss = primary.name.replace("-bound", "").toLowerCase();
  const machineContext = machineDemoContext(summary);
  const meta = machineContext
    ? [
      "Machine",
      machineContext.host,
      machineContext.gpuModel,
      machineContext.adapters
    ].join(" | ")
    : [
      scopeLabel(summary.scope),
      summary.clusters.join(", "),
      summary.gpuModels.join(", "),
      `${summary.count} ${summary.count === 1 ? "job" : "jobs"}`
    ].join(" | ");
  const headline = machineContext
    ? machineDemoHeadline(machineContext, gpuUtil, useful)
    : summary.whatIfActive
    ? `Same-pod what-if lifts useful compute to ${useful}% and cuts cross-pod traffic to ${round(summary.crossPodTraffic)}%.`
    : `${gpuUtil}% GPU utilization, ${useful}% useful compute. ${titleCase(primaryLoss)} is the dominant loss.`;

  const narrative = machineContext
    ? machineDemoNarrative(machineContext)
    : summary.whatIfActive
    ? `Current evidence points to ${primaryLoss} first and ${secondary.name.replace("-bound", "").toLowerCase()} second. Constraining this work to one pod is estimated to improve runtime by ${classifier.improvementRange}.`
    : `${primary.reason} ${recommendationFor(summary, classifier)}`;

  document.querySelector("#selectedMeta").textContent = meta;
  document.querySelector("#diagnosisHeadline").textContent = headline;
  document.querySelector("#diagnosisNarrative").textContent = narrative;
  renderScoreDial(summary.usefulCompute);
}

function machineDemoContext(summary) {
  const sourceItems = summary.sourceItems || [];
  const machineItem = sourceItems.find(isMachineDemoItem);
  if (!machineItem) return null;

  const context = machineItem.source?.context || {};
  const services = machineDemoServices(context.observedServices);
  const ollamaModels = Array.isArray(context.ollamaModels) ? context.ollamaModels : [];
  const ollamaRunningModels = Array.isArray(context.ollamaRunningModels) ? context.ollamaRunningModels : [];
  const ollamaTokensPerSecond = numeric(context.ollamaTokensPerSecond, 0);
  const ollamaTimeToFirstTokenMs = numeric(context.ollamaTimeToFirstTokenMs, 0);
  const idleStatus = sourceItems.some((item) => /gpu idle|idle capacity/i.test(String(item.status || "")));
  const adapters = unique(["local-machine", ...(machineItem.source?.adapters || [])]);
  const gpuModel = machineDemoGpuModel(context, summary, machineItem);
  const gpuPresent = context.gpuPresent === true || (
    summary.gpus > 0
    && !/no nvidia|unavailable|none/i.test(gpuModel)
  );
  const driverUnavailable = !gpuPresent && context.gpuSource === "nvidia-smi-unavailable";
  const gb10MonitoringList = Array.isArray(context.gb10MonitoringList) ? context.gb10MonitoringList : [];
  const gb10Present = Boolean(context.gb10Present) || isGb10GpuModel(gpuModel);

  return {
    host: context.hostname || summary.clusters[0] || "this host",
    gpuModel,
    adapters: adapters.join(", "),
    services: services.length ? services.join(", ") : "local observability services",
    modelCount: ollamaModels.length,
    ollamaRunningModels,
    ollamaTelemetryStatus: String(context.ollamaTelemetryStatus || ""),
    ollamaProbeModel: String(context.ollamaProbeModel || ""),
    ollamaTokensPerSecond,
    ollamaTimeToFirstTokenMs,
    ollamaTelemetryAvailable: ollamaTokensPerSecond > 0 || ollamaTimeToFirstTokenMs > 0,
    ollamaProbeCached: Boolean(context.ollamaProbeCached),
    ollamaProbeAgeMs: numeric(context.ollamaProbeAgeMs),
    ollamaProbeError: String(context.ollamaProbeError || ""),
    gb10Present,
    gb10MonitoringList,
    linuxUmaMemoryTotalBytes: numeric(context.linuxUmaMemoryTotalBytes, context.memoryTotalBytes),
    linuxUmaMemoryAvailableBytes: numeric(context.linuxUmaMemoryAvailableBytes, context.memoryAvailableBytes),
    linuxUmaMemoryUsedPct: numeric(context.linuxUmaMemoryUsedPct, context.memoryUsedPct),
    appMetricsReachable: Boolean(context.appMetricsReachable),
    collectorGatewayReachable: Boolean(context.collectorGatewayReachable),
    collectorAcceptedBatchesTotal: optionalMetric(context, "collectorAcceptedBatchesTotal"),
    collectorWrittenRowsTotal: optionalMetric(context, "collectorWrittenRowsTotal"),
    collectorIncomingReportsPerSecond: optionalMetric(context, "collectorIncomingReportsPerSecond"),
    collectorIncomingReportsPerMinute: optionalMetric(context, "collectorIncomingReportsPerMinute"),
    collectorIncomingReportsWindowCount: optionalMetric(context, "collectorIncomingReportsWindowCount"),
    collectorIncomingReportsWindowSeconds: optionalMetric(context, "collectorIncomingReportsWindowSeconds"),
    collectorAuthBearer: Boolean(context.collectorAuthBearer),
    collectorAuthHmac: Boolean(context.collectorAuthHmac),
    collectorAuthMtls: Boolean(context.collectorAuthMtls),
    apiAuthRequired: Boolean(context.apiAuthRequired),
    hardwareHealthScore: optionalMetric(context, "hardwareHealthScore"),
    hardwareFaultScore: optionalMetric(context, "hardwareFaultScore"),
    hardwareFaultLevel: String(context.hardwareFaultLevel || ""),
    hardwareFaultCount: optionalMetric(context, "hardwareFaultCount"),
    hardwareCriticalFaultCount: optionalMetric(context, "hardwareCriticalFaultCount"),
    hardwareWarningFaultCount: optionalMetric(context, "hardwareWarningFaultCount"),
    hardwareKernelEventCount: optionalMetric(context, "hardwareKernelEventCount"),
    hardwareMachineCheckCount: optionalMetric(context, "hardwareMachineCheckCount"),
    hardwareGpuXidCount: optionalMetric(context, "hardwareGpuXidCount"),
    hardwareStorageErrorCount: optionalMetric(context, "hardwareStorageErrorCount"),
    hardwarePcieAerCount: optionalMetric(context, "hardwarePcieAerCount"),
    hardwareOomKillCount: optionalMetric(context, "hardwareOomKillCount"),
    hardwareFailedUnitCount: optionalMetric(context, "hardwareFailedUnitCount"),
    hardwareThermalThrottleActive: Boolean(context.hardwareThermalThrottleActive),
    hardwareRepairAction: String(context.hardwareRepairAction || ""),
    hardwareRepairConfidence: optionalMetric(context, "hardwareRepairConfidence"),
    hardwareRepairRequiresApproval: Boolean(context.hardwareRepairRequiresApproval),
    hardwareRcaFingerprint: String(context.hardwareRcaFingerprint || ""),
    hardwareFaults: Array.isArray(context.hardwareFaults) ? context.hardwareFaults : [],
    nsightCuptiProfilingStatus: String(context.nsightCuptiProfilingStatus || ""),
    ncclRuntimePresent: Boolean(context.ncclRuntimePresent),
    ncclRuntimeStatus: String(context.ncclRuntimeStatus || ""),
    ncclRuntimeSource: String(context.ncclRuntimeSource || ""),
    ncclRuntimeContainers: Array.isArray(context.ncclRuntimeContainers) ? context.ncclRuntimeContainers : [],
    ncclRuntimeImages: Array.isArray(context.ncclRuntimeImages) ? context.ncclRuntimeImages : [],
    ncclRuntimeSocketIfname: String(context.ncclRuntimeSocketIfname || ""),
    ncclRuntimeHostIp: String(context.ncclRuntimeHostIp || ""),
    ncclRuntimeDetail: String(context.ncclRuntimeDetail || ""),
    benchmarkSuiteName: String(context.benchmarkSuiteName || ""),
    benchmarkSuiteStatus: String(context.benchmarkSuiteStatus || ""),
    benchmarkGeneratedAt: String(context.benchmarkGeneratedAt || ""),
    benchmarkSampleCached: Boolean(context.benchmarkSampleCached),
    benchmarkSampleAgeMs: optionalMetric(context, "benchmarkSampleAgeMs"),
    benchmarkTtlMs: optionalMetric(context, "benchmarkTtlMs"),
    benchmarkDurationMs: optionalMetric(context, "benchmarkDurationMs"),
    benchmarkCpuOpsPerSecond: optionalMetric(context, "benchmarkCpuOpsPerSecond"),
    benchmarkMemoryMiBps: optionalMetric(context, "benchmarkMemoryMiBps"),
    benchmarkDiskWriteMiBps: optionalMetric(context, "benchmarkDiskWriteMiBps"),
    benchmarkDiskReadMiBps: optionalMetric(context, "benchmarkDiskReadMiBps"),
    benchmarkScore: optionalMetric(context, "benchmarkScore"),
    benchmarkError: String(context.benchmarkError || ""),
    clockSource: String(context.clockSource || ""),
    clockSynchronized: Boolean(context.clockSynchronized),
    clockTimeUnixMs: optionalMetric(context, "clockTimeUnixMs"),
    clockTimeUnixNs: String(context.clockTimeUnixNs || ""),
    clockTimezone: String(context.clockTimezone || ""),
    clockLocalRtc: Boolean(context.clockLocalRtc),
    clockOffsetNs: optionalMetric(context, "clockOffsetNs"),
    clockRmsOffsetNs: optionalMetric(context, "clockRmsOffsetNs"),
    clockPtpInstalled: Boolean(context.clockPtpInstalled),
    clockPtpActive: Boolean(context.clockPtpActive),
    clockPtpPortState: String(context.clockPtpPortState || ""),
    clockPtpGrandmaster: String(context.clockPtpGrandmaster || ""),
    clockChronyReference: String(context.clockChronyReference || ""),
    clockChronyStratum: optionalMetric(context, "clockChronyStratum"),
    clockSyncServices: Array.isArray(context.clockSyncServices) ? context.clockSyncServices : [],
    clockSyncDetail: String(context.clockSyncDetail || ""),
    context,
    platform: String(context.platform || ""),
    arch: String(context.arch || ""),
    uptimeSeconds: optionalMetric(context, "uptimeSeconds"),
    gpuUtilizationPct: numeric(context.gpuUtilizationPct, summary.gpuUtil),
    gpuMemoryUsedPct: numeric(context.gpuMemoryUsedPct, summary.hbmCapacity),
    gpuMemoryUsedMiB: numeric(context.gpuMemoryUsedMiB),
    gpuMemoryTotalMiB: numeric(context.gpuMemoryTotalMiB),
    gpuTemperatureC: numeric(context.gpuTemperatureC),
    gpuPowerWatts: numeric(context.gpuPowerWatts),
    gpuProcesses: Array.isArray(context.gpuComputeProcesses) ? context.gpuComputeProcesses : [],
    gpuProcessQuerySkipped: Boolean(context.gpuComputeProcessQuerySkipped),
    gpuSampleCached: Boolean(context.gpuSampleCached),
    gpuSampleAgeMs: numeric(context.gpuSampleAgeMs),
    cpuUsagePct: numeric(context.cpuUsagePct),
    cpuTemperatureC: optionalMetric(context, "cpuTemperatureC"),
    memoryUsedPct: numeric(context.memoryUsedPct),
    diskUsedPct: numeric(context.diskUsedPct),
    networkInterface: String(context.networkInterface || ""),
    networkLocalAddress: String(context.networkLocalAddress || ""),
    networkPeerAddress: String(context.networkPeerAddress || ""),
    networkLinkRole: String(context.networkLinkRole || ""),
    networkSelectionReason: String(context.networkSelectionReason || ""),
    networkLinkSpeedMbps: optionalMetric(context, "networkLinkSpeedMbps"),
    networkRxBytes: optionalMetric(context, "networkRxBytes"),
    networkTxBytes: optionalMetric(context, "networkTxBytes"),
    networkRxBytesPerSecond: optionalMetric(context, "networkRxBytesPerSecond"),
    networkTxBytesPerSecond: optionalMetric(context, "networkTxBytesPerSecond"),
    networkUtilizationPct: optionalMetric(context, "networkUtilizationPct"),
    networkThroughputBps: maxFinite(context.networkRxBytesPerSecond, context.networkTxBytesPerSecond),
    networkRxDrops: optionalMetric(context, "networkRxDrops"),
    networkTxDrops: optionalMetric(context, "networkTxDrops"),
    networkRxErrors: optionalMetric(context, "networkRxErrors"),
    networkTxErrors: optionalMetric(context, "networkTxErrors"),
    dockerContainers: Array.isArray(context.dockerContainers) ? context.dockerContainers : [],
    workloadCountersObserved: Boolean(context.workloadCountersObserved),
    unavailableExports: Array.isArray(context.unavailableExports) ? context.unavailableExports : [],
    gpuPresent,
    gpuSource: String(context.gpuSource || ""),
    gpuError: String(context.gpuError || ""),
    driverUnavailable,
    noGpu: !gpuPresent && !driverUnavailable,
    idle: gpuPresent && (idleStatus || (
      summary.gpus > 0
      && summary.gpuUtil <= 1
      && summary.usefulCompute <= 1
      && summary.steps === 0
      && summary.inferenceRequestsM === 0
    ))
  };
}

function machineDemoHeadline(machineContext, gpuUtil, useful) {
  if (machineContext.driverUnavailable) {
    return `NVIDIA telemetry is unavailable on ${machineContext.host}.`;
  }
  if (machineContext.noGpu) {
    return `${machineContext.host} is reporting host telemetry without NVIDIA GPU counters.`;
  }
  if (machineContext.idle) {
    return `${machineContext.gpuModel} is present but idle on ${machineContext.host}.`;
  }

  return `Live ${machineContext.host} telemetry: ${gpuUtil}% GPU utilization, ${useful}% useful compute.`;
}

function machineDemoNarrative(machineContext) {
  const modelText = `${machineContext.modelCount} local Ollama model${machineContext.modelCount === 1 ? "" : "s"}`;
  const serviceText = machineDemoServicePhrase(machineContext);
  if (machineContext.driverUnavailable) {
    const error = machineContext.gpuError ? ` ${machineContext.gpuError}` : "";
    return `Observed from ${machineContext.adapters}. nvidia-smi is installed, but it cannot communicate with the NVIDIA driver.${error} ${serviceText}, and ${modelText} are installed.`;
  }
  if (machineContext.noGpu) {
    return `Observed from ${machineContext.adapters}. No usable NVIDIA GPU counter source was detected; ${serviceText}, and ${modelText} are installed.`;
  }
  if (machineContext.idle && machineContext.gpuProcessQuerySkipped) {
    return `Observed from ${machineContext.adapters}. NVIDIA process lookup is skipped in high-rate refresh mode; ${serviceText}, and ${modelText} are installed. This is a live utilization view, not a workload bottleneck claim.`;
  }
  if (machineContext.idle) {
    return `Observed from ${machineContext.adapters}. No active NVIDIA compute process was detected; ${serviceText}, and ${modelText} are installed. This is an idle-capacity observation, not a workload bottleneck claim.`;
  }

  return `Observed from ${machineContext.adapters}. ${machineContext.services} are available on the host, so refreshes reflect the current machine bundle rather than a provider fixture.`;
}

function machineDemoServicePhrase(machineContext) {
  const services = machineDemoServices(machineContext.context.observedServices);
  if (!services.length) return "no local observability service was detected";
  return `${services.join(", ")} ${services.length === 1 ? "is" : "are"} running`;
}

function machineDemoGpuModel(context, summary, machineItem) {
  const summaryModel = (summary.gpuModels || []).find((model) => model && model !== "none");
  if (summaryModel) return summaryModel;
  if (context.gpuName) return context.gpuName;
  if (context.gpuSource === "nvidia-smi-unavailable") return "NVIDIA telemetry unavailable";
  return machineItem.gpuModel || "No NVIDIA GPU telemetry";
}

function isGb10GpuModel(label) {
  return /(^|[^A-Za-z0-9])GB10([^A-Za-z0-9]|$)|DGX[ -]?Spark/i.test(String(label || ""));
}

function machineDemoServices(observedServices) {
  if (Array.isArray(observedServices)) return observedServices.filter(Boolean);
  if (typeof observedServices === "string") {
    return observedServices.split(",").map((service) => service.trim()).filter(Boolean);
  }

  return [];
}

function isMachineDemoItem(item) {
  const adapters = item.source?.adapters || [];
  const context = item.source?.context || {};

  return adapters.includes("local-machine")
    || Boolean(
      context.hostname
      && (
        context.gpuUuid
        || context.generatedAt
        || Array.isArray(context.observedServices)
        || Array.isArray(context.ollamaModels)
      )
    );
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

function renderLiveResources(summary) {
  const panel = document.querySelector("#liveResourcePanel");
  const title = document.querySelector("#liveResourceTitle");
  const badge = document.querySelector("#liveResourceBadge");
  const grid = document.querySelector("#liveResourceGrid");
  const alerts = document.querySelector("#liveTelemetryAlerts");
  const observationLog = document.querySelector("#liveObservationLog");
  const graphs = document.querySelector("#liveTelemetryGraphs");
  if (!panel || !title || !badge || !grid || !alerts || !observationLog || !graphs) return;

  const machineContext = machineDemoContext(summary);
  if (!machineContext) {
    renderAnalysisResourceFallback(summary, { panel, title, badge, grid, alerts, observationLog, graphs });
    return;
  }

  const context = machineContext.context || {};
  const generatedAt = context.generatedAt ? safeDate(context.generatedAt, new Date(0)) : null;
  const telemetry = recordLiveTelemetrySample(machineContext, generatedAt);
  const ageSeconds = generatedAt ? Math.max(0, Math.round((Date.now() - generatedAt.getTime()) / 1000)) : null;
  const memoryTotal = numeric(context.memoryTotalBytes);
  const memoryAvailable = numeric(context.memoryAvailableBytes);
  const memoryUsed = Math.max(0, memoryTotal - memoryAvailable);
  const dockerCpu = machineContext.dockerContainers.reduce((total, container) => total + numeric(container.cpuPct), 0);
  const gpuMemoryNote = machineContext.gpuPresent
    ? `${number.format(machineContext.gpuMemoryUsedMiB)} / ${number.format(machineContext.gpuMemoryTotalMiB)} MiB`
    : machineContext.driverUnavailable ? "nvidia-smi cannot reach driver" : "No GPU counter source";
  const gpuPowerAvailable = machineContext.gpuPresent && machineContext.gpuPowerWatts > 0;
  const gpuTemperatureAvailable = machineContext.gpuPresent && machineContext.gpuTemperatureC > 0;
  const pcie = context.gpuPcie ? ` | ${context.gpuPcie}` : "";
  const gpuSampleNote = machineContext.gpuSampleCached
    ? `nvidia-smi cached ${Math.max(1, Math.round(machineContext.gpuSampleAgeMs / 1000))}s`
    : "nvidia-smi live sample";
  const observedServiceList = machineDemoServices(context.observedServices);
  const ollamaReachable = observedServiceList.includes("ollama");
  const ollamaModelLabel = machineContext.ollamaProbeModel || machineContext.ollamaRunningModels[0] || (Array.isArray(context.ollamaModels) ? context.ollamaModels[0] : "") || "";
  const ollamaNote = machineContext.ollamaTelemetryAvailable
    ? `${round(machineContext.ollamaTimeToFirstTokenMs)}ms TTFT${ollamaModelLabel ? ` | ${ollamaModelLabel}` : ""}`
    : machineContext.ollamaTelemetryStatus === "no-running-model"
      ? `${machineContext.modelCount} local model${machineContext.modelCount === 1 ? "" : "s"} | no loaded model`
      : machineContext.ollamaProbeError || `${machineContext.modelCount} local model${machineContext.modelCount === 1 ? "" : "s"}`;
  const gb10MonitorTotal = machineContext.gb10MonitoringList.length;
  const gb10MonitorAvailable = machineContext.gb10MonitoringList.filter(gb10MonitoringAvailable).length;
  const umaMemoryTotal = machineContext.linuxUmaMemoryTotalBytes || memoryTotal;
  const umaMemoryAvailable = machineContext.linuxUmaMemoryAvailableBytes || memoryAvailable;
  const umaMemoryUsed = Math.max(0, umaMemoryTotal - umaMemoryAvailable);
  const umaMemoryUsedPct = machineContext.linuxUmaMemoryUsedPct || machineContext.memoryUsedPct;
  const networkDisplay = liveNetworkDisplay(machineContext);
  const collectorRateAvailable = machineContext.collectorGatewayReachable
    && Number.isFinite(machineContext.collectorIncomingReportsPerMinute);
  const collectorWindowSeconds = Number.isFinite(machineContext.collectorIncomingReportsWindowSeconds)
    ? Math.max(1, round(machineContext.collectorIncomingReportsWindowSeconds))
    : 60;
  const collectorWindowCount = Number.isFinite(machineContext.collectorIncomingReportsWindowCount)
    ? number.format(round(machineContext.collectorIncomingReportsWindowCount))
    : "0";
  const collectorAccepted = Number.isFinite(machineContext.collectorAcceptedBatchesTotal)
    ? number.format(round(machineContext.collectorAcceptedBatchesTotal))
    : "n/a";
  const hardwareScoreAvailable = Number.isFinite(machineContext.hardwareHealthScore);
  const hardwareFaultCount = Number.isFinite(machineContext.hardwareFaultCount) ? round(machineContext.hardwareFaultCount) : 0;
  const hardwareTopFault = machineContext.hardwareFaults[0];
  const hardwareNote = hardwareFaultCount > 0
    ? `${hardwareFaultCount} fault${hardwareFaultCount === 1 ? "" : "s"} | ${machineContext.hardwareRepairAction || "inspect-host"}`
    : "No observed hardware fault pattern";

  panel.hidden = false;
  title.textContent = `${machineContext.host} live resources`;
  renderLiveResourceHeartbeatBadge(badge, ageSeconds);

  grid.replaceChildren(
    liveResourceCard({
      label: "CPU",
      value: pct(machineContext.cpuUsagePct),
      note: `${context.cpuCount || "n/a"} logical CPUs | load ${round(numeric(context.load1))}`,
      percent: machineContext.cpuUsagePct,
      tone: inverseGrade(machineContext.cpuUsagePct, 70, 90).key
    }),
    liveResourceCard({
      label: "RAM",
      value: pct(machineContext.memoryUsedPct),
      note: memoryTotal ? `${formatBytes(memoryUsed)} / ${formatBytes(memoryTotal)}` : "Host memory pressure",
      percent: machineContext.memoryUsedPct,
      tone: inverseGrade(machineContext.memoryUsedPct, 75, 90).key
    }),
    liveResourceCard({
      label: "Network utilization",
      value: networkDisplay.value,
      note: networkDisplay.note,
      percent: networkDisplay.percent,
      tone: networkDisplay.tone
    }),
    ...(machineContext.gb10Present ? [
      liveResourceCard({
        label: "UMA memory",
        value: pct(umaMemoryUsedPct),
        note: umaMemoryTotal ? `${formatBytes(umaMemoryUsed)} / ${formatBytes(umaMemoryTotal)} Linux UMA` : "Linux UMA meminfo",
        percent: umaMemoryUsedPct,
        tone: inverseGrade(umaMemoryUsedPct, 75, 90).key
      })
    ] : []),
    liveResourceCard({
      label: "GPU",
      value: machineContext.driverUnavailable ? "unavailable" : machineContext.noGpu ? "not detected" : pct(machineContext.gpuUtilizationPct),
      note: machineContext.driverUnavailable
        ? "Driver telemetry blocked"
        : machineContext.noGpu
          ? "No NVIDIA counter source"
          : machineContext.gpuProcessQuerySkipped
            ? gpuSampleNote
            : `${machineContext.gpuProcesses.length} compute process${machineContext.gpuProcesses.length === 1 ? "" : "es"}`,
      percent: machineContext.gpuPresent ? machineContext.gpuUtilizationPct : null,
      tone: machineContext.driverUnavailable || machineContext.noGpu ? "poor" : machineContext.gpuUtilizationPct > 0 ? grade(machineContext.gpuUtilizationPct, 30, 70).key : "watch"
    }),
    liveResourceCard({
      label: "GPU power",
      value: gpuPowerAvailable ? `${round(machineContext.gpuPowerWatts)} W` : "not reported",
      note: gpuTemperatureAvailable ? `${round(machineContext.gpuTemperatureC)} C${pcie}` : gpuMemoryNote,
      percent: gpuPowerAvailable ? clamp((machineContext.gpuPowerWatts / 450) * 100) : null,
      tone: gpuPowerAvailable ? inverseGrade(machineContext.gpuPowerWatts, 330, 430).key : "watch"
    }),
    liveResourceCard({
      label: "GPU memory",
      value: machineContext.gpuPresent ? pct(machineContext.gpuMemoryUsedPct) : "unavailable",
      note: gpuMemoryNote,
      percent: machineContext.gpuPresent ? machineContext.gpuMemoryUsedPct : null,
      tone: machineContext.gpuPresent ? inverseGrade(machineContext.gpuMemoryUsedPct, 82, 94).key : "poor"
    }),
    liveResourceCard({
      label: "Docker",
      value: `${machineContext.dockerContainers.length}`,
      note: `${pct(dockerCpu)} aggregate container CPU`,
      percent: clamp(dockerCpu),
      tone: machineContext.dockerContainers.length ? "good" : "watch"
    }),
    liveResourceCard({
      label: "Disk",
      value: pct(machineContext.diskUsedPct),
      note: context.diskTotalBytes ? `${formatBytes(context.diskUsedBytes)} / ${formatBytes(context.diskTotalBytes)}` : "Root filesystem",
      percent: machineContext.diskUsedPct,
      tone: inverseGrade(machineContext.diskUsedPct, 75, 90).key
    }),
    liveResourceCard({
      label: "Ollama",
      value: ollamaReachable
        ? machineContext.ollamaTelemetryAvailable
          ? `${formatDecimal(machineContext.ollamaTokensPerSecond, 1)} tok/s`
          : "reachable"
        : "offline",
      note: ollamaReachable ? ollamaNote : "Local model API not observed",
      percent: null,
      tone: ollamaReachable ? (machineContext.ollamaTelemetryAvailable ? "good" : "watch") : "poor"
    }),
    liveResourceCard({
      label: "Hardware health",
      value: hardwareScoreAvailable ? `${round(machineContext.hardwareHealthScore)}/100` : "learning",
      note: hardwareTopFault?.detail || hardwareNote,
      percent: hardwareScoreAvailable ? machineContext.hardwareHealthScore : null,
      tone: Number.isFinite(machineContext.hardwareFaultScore)
        ? inverseGrade(machineContext.hardwareFaultScore, 35, 70).key
        : "watch"
    }),
    ...(machineContext.collectorGatewayReachable ? [
      liveResourceCard({
        label: "Telemetry ingest",
        value: collectorRateAvailable ? `${formatDecimal(machineContext.collectorIncomingReportsPerMinute, machineContext.collectorIncomingReportsPerMinute >= 100 ? 0 : 1)}/min` : "reachable",
        note: `last ${collectorWindowSeconds}s: ${collectorWindowCount} reports | ${collectorAccepted} total`,
        percent: collectorRateAvailable ? clamp((machineContext.collectorIncomingReportsPerMinute / 120) * 100) : null,
        tone: collectorRateAvailable && machineContext.collectorIncomingReportsPerMinute > 0 ? "good" : "watch"
      })
    ] : []),
    ...(machineContext.gb10Present ? [
      liveResourceCard({
        label: "GB10 monitor",
        value: `${gb10MonitorAvailable}/${Math.max(1, gb10MonitorTotal)}`,
        note: "NVML/nvidia-smi, UMA, app metrics, Nsight/CUPTI",
        percent: null,
        tone: gb10MonitorAvailable === gb10MonitorTotal ? "good" : gb10MonitorAvailable >= 2 ? "watch" : "poor"
      })
    ] : []),
    liveResourceCard({
      label: "Signals",
      value: `${observedServiceList.length}`,
      note: machineContext.adapters,
      percent: null,
      tone: "good"
    })
  );

  const analysis = analyzeLiveTelemetryRelationships(telemetry, machineContext);
  renderLiveTelemetryAlerts(alerts, analysis);
  renderLiveObservationLog(observationLog, analysis, machineContext, telemetry);
  renderLiveTelemetryGraphs(graphs, machineContext, telemetry);
}

function renderAnalysisResourceFallback(summary, nodes) {
  const { panel, title, badge, grid, alerts, observationLog, graphs } = nodes;
  const analysis = analyzeAnalysisResourceRelationships(summary);
  liveTelemetryHistory = [];

  panel.hidden = false;
  title.textContent = `${summary.label} resource signals`;
  renderAnalysisResourceBadge(badge);

  grid.replaceChildren(
    liveResourceCard({
      label: "Network utilization",
      value: pct(summary.networkUtilization),
      note: `${pct(summary.networkWait)} network wait | ${pct(summary.ncclTime)} NCCL`,
      percent: summary.networkUtilization,
      tone: inverseGrade(summary.networkUtilization, 70, 88).key
    }),
    liveResourceCard({
      label: "GPU utilization",
      value: pct(summary.gpuUtil),
      note: `${pct(summary.usefulCompute)} useful compute | ${number.format(summary.gpus)} GPUs`,
      percent: summary.gpuUtil,
      tone: grade(summary.gpuUtil, 45, 70).key
    }),
    liveResourceCard({
      label: "CPU prep",
      value: pct(summary.cpuPrep),
      note: "Host-side CPU/preprocessing proxy",
      percent: summary.cpuPrep,
      tone: inverseGrade(summary.cpuPrep, 20, 35).key
    }),
    liveResourceCard({
      label: "Network wait",
      value: pct(summary.networkWait),
      note: "Latency/loss/stall pressure, separate from utilization",
      percent: summary.networkWait,
      tone: inverseGrade(summary.networkWait, 10, 20).key
    }),
    liveResourceCard({
      label: "NCCL time",
      value: pct(summary.ncclTime),
      note: "Collective communication time",
      percent: summary.ncclTime,
      tone: inverseGrade(summary.ncclTime, 15, 30).key
    }),
    liveResourceCard({
      label: "Placement fit",
      value: pct(summary.placementQuality),
      note: `${pct(summary.crossPodTraffic)} cross-pod | ${pct(summary.crossRackTraffic)} cross-rack`,
      percent: summary.placementQuality,
      tone: grade(summary.placementQuality, 65, 82).key
    })
  );

  renderLiveTelemetryAlerts(alerts, analysis);
  renderLiveObservationLog(observationLog, analysis, null, analysis.history);
  renderAnalysisResourceGraphs(graphs, summary, analysis.history);
}

function renderAnalysisResourceBadge(badge) {
  const label = document.createElement("span");
  label.className = "live-resource-badge-text";
  label.textContent = "Analysis snapshot";
  badge.replaceChildren(label);
  badge.dataset.tone = "watch";
  badge.dataset.fresh = "false";
  badge.title = "Showing interpreted run metrics until live host counters are available";
  badge.setAttribute("aria-label", `${label.textContent}. ${badge.title}.`);
}

function renderLiveResourceHeartbeatBadge(badge, ageSeconds) {
  const fresh = ageSeconds === null || ageSeconds <= MACHINE_DEMO_FRESH_SECONDS;
  const text = ageSeconds === null ? "Live" : `Updated ${ageSeconds}s ago`;
  let heart = badge.querySelector(".live-resource-heart");
  let label = badge.querySelector(".live-resource-badge-text");

  if (!heart) {
    heart = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    heart.setAttribute("class", "live-resource-heart");
    heart.setAttribute("viewBox", "0 0 24 24");
    heart.setAttribute("aria-hidden", "true");
    heart.setAttribute("focusable", "false");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M12 20.2 5.1 13.4C1.8 10.1 3.4 4.8 7.9 4.4c1.8-.2 3.4.7 4.1 2.1.7-1.4 2.3-2.3 4.1-2.1 4.5.4 6.1 5.7 2.8 9.1L12 20.2Z");
    heart.append(path);
  }

  if (!label) {
    label = document.createElement("span");
    label.className = "live-resource-badge-text";
  }

  label.textContent = text;
  badge.replaceChildren(heart, label);
  badge.dataset.tone = fresh ? "good" : "watch";
  badge.dataset.fresh = fresh ? "true" : "false";
  badge.title = fresh ? "Live data is coming in" : "Waiting for a fresh live sample";
  badge.setAttribute("aria-label", `${text}. ${badge.title}.`);
}

function liveNetworkDisplay(machineContext) {
  const hasPercent = Number.isFinite(machineContext.networkUtilizationPct);
  const throughput = Number.isFinite(machineContext.networkThroughputBps) ? machineContext.networkThroughputBps : 0;
  const interfaceLabel = machineContext.networkInterface || "primary interface";
  const roleLabel = machineContext.networkLinkRole || (interfaceLabel === "enp1s0f1np1" ? "DGX interconnect" : "Network link");
  const peerText = machineContext.networkLocalAddress && machineContext.networkPeerAddress
    ? ` ${machineContext.networkLocalAddress}->${machineContext.networkPeerAddress}`
    : "";
  const scopeText = `${roleLabel}: ${interfaceLabel}${peerText}`;
  const linkText = Number.isFinite(machineContext.networkLinkSpeedMbps) && machineContext.networkLinkSpeedMbps > 0
    ? `${compactNumber.format(machineContext.networkLinkSpeedMbps)} Mbps link`
    : "link speed unavailable";
  const issueCount = numeric(machineContext.networkRxDrops)
    + numeric(machineContext.networkTxDrops)
    + numeric(machineContext.networkRxErrors)
    + numeric(machineContext.networkTxErrors);

  return {
    value: hasPercent ? pct(machineContext.networkUtilizationPct) : throughput > 0 ? formatBytesPerSecond(throughput) : "learning",
    note: hasPercent
      ? `${scopeText} | ${formatBytesPerSecond(throughput)} | ${linkText}`
      : `${scopeText} | ${linkText}`,
    percent: hasPercent ? machineContext.networkUtilizationPct : null,
    tone: issueCount > 0 ? "watch" : hasPercent ? inverseGrade(machineContext.networkUtilizationPct, 70, 88).key : "watch"
  };
}

function renderOperatorCockpit(summary, classifier, opportunityEngine, schedulerSimulator) {
  const panel = document.querySelector("#operatorCockpitPanel");
  const title = document.querySelector("#operatorCockpitTitle");
  const confidenceBadge = document.querySelector("#operatorConfidenceBadge");
  const heartbeatStrip = document.querySelector("#sourceHeartbeatStrip");
  const timeline = document.querySelector("#eventTimeline");
  const timelineBadge = document.querySelector("#eventTimelineBadge");
  const launchpad = document.querySelector("#demoLaunchpad");
  const kafkaPanel = document.querySelector("#kafkaStreamPanel");
  const kafkaBadge = document.querySelector("#kafkaStreamBadge");
  const confidencePanel = document.querySelector("#confidencePanel");
  const confidenceDetailBadge = document.querySelector("#confidenceDetailBadge");
  const replayPanel = document.querySelector("#replayModePanel");
  const replayBadge = document.querySelector("#replayModeBadge");
  const grafanaPanel = document.querySelector("#grafanaMiniPanel");
  const grafanaBadge = document.querySelector("#grafanaMiniBadge");
  const productReadinessPanel = document.querySelector("#productReadinessPanel");
  const productReadinessBadge = document.querySelector("#productReadinessBadge");
  const fleetTiles = document.querySelector("#fleetTiles");
  const fleetBadge = document.querySelector("#fleetTilesBadge");
  const sparkPairComparePanel = document.querySelector("#sparkPairComparePanel");
  const sparkPairCompareBadge = document.querySelector("#sparkPairCompareBadge");
  const fleetComparisonPanel = document.querySelector("#fleetComparisonPanel");
  const fleetComparisonBadge = document.querySelector("#fleetComparisonBadge");
  const characterizationPanel = document.querySelector("#systemCharacterizationPanel");
  const characterizationBadge = document.querySelector("#systemCharacterizationBadge");
  if (!panel || !title || !confidenceBadge || !heartbeatStrip || !timeline || !launchpad || !kafkaPanel || !confidencePanel || !replayPanel || !grafanaPanel || !productReadinessPanel || !fleetTiles || !sparkPairComparePanel || !fleetComparisonPanel || !characterizationPanel) return;

  const cockpit = buildOperatorCockpitContext(summary, classifier, opportunityEngine, schedulerSimulator);
  if (!cockpit.visible) {
    panel.hidden = true;
    heartbeatStrip.replaceChildren();
    timeline.replaceChildren();
    launchpad.replaceChildren();
    operatorLaunchpadSignature = "";
    kafkaPanel.replaceChildren();
    confidencePanel.replaceChildren();
    replayPanel.replaceChildren();
    grafanaPanel.replaceChildren();
    productReadinessPanel.replaceChildren();
    fleetTiles.replaceChildren();
    sparkPairComparePanel.replaceChildren();
    fleetComparisonPanel.replaceChildren();
    characterizationPanel.replaceChildren();
    return;
  }

  panel.hidden = false;
  title.textContent = `${cockpit.hostLabel} source health and control`;
  confidenceBadge.textContent = `Confidence ${pct(cockpit.confidence.score)}`;
  confidenceBadge.dataset.tone = cockpit.confidence.score >= 80 ? "good" : cockpit.confidence.score >= 55 ? "watch" : "poor";
  if (timelineBadge) timelineBadge.textContent = `${cockpit.timeline.length} events`;
  if (kafkaBadge) kafkaBadge.textContent = cockpit.kafka.reachable ? "Reachable" : "Missing";
  if (confidenceDetailBadge) confidenceDetailBadge.textContent = cockpit.confidence.label;
  if (replayBadge) replayBadge.textContent = state.operatorReplay ? "Playing" : `${liveTelemetryHistory.length} samples`;
  if (grafanaBadge) grafanaBadge.textContent = cockpit.grafana.links.length ? `${cockpit.grafana.links.length} links` : "No link";
  if (productReadinessBadge) {
    productReadinessBadge.textContent = cockpit.productReadiness.badge;
    productReadinessBadge.dataset.tone = cockpit.productReadiness.tone;
  }
  if (fleetBadge) fleetBadge.textContent = `${cockpit.fleet.length} ${cockpit.fleet.length === 1 ? "host" : "hosts"}`;
  if (sparkPairCompareBadge) {
    sparkPairCompareBadge.textContent = cockpit.sparkComparison.badge;
    sparkPairCompareBadge.dataset.tone = cockpit.sparkComparison.tone;
  }
  if (fleetComparisonBadge) {
    fleetComparisonBadge.textContent = cockpit.fleetComparison.badge;
    fleetComparisonBadge.dataset.tone = cockpit.fleetComparison.tone;
  }
  updateSystemCharacterizationBadge(characterizationBadge, platformVirtualSensorCache.systemIdentification);

  heartbeatStrip.replaceChildren(...cockpit.heartbeats.map(operatorHeartbeatCard));
  timeline.replaceChildren(...cockpit.timeline.map(operatorTimelineItem));
  renderOperatorLaunchpad(launchpad, cockpit.commands);
  kafkaPanel.replaceChildren(...operatorKafkaNodes(cockpit.kafka));
  confidencePanel.replaceChildren(...operatorConfidenceNodes(cockpit.confidence));
  replayPanel.replaceChildren(...operatorReplayNodes(cockpit));
  grafanaPanel.replaceChildren(...operatorGrafanaNodes(cockpit.grafana));
  productReadinessPanel.replaceChildren(...operatorProductReadinessNodes(cockpit.productReadiness));
  fleetTiles.replaceChildren(...cockpit.fleet.map(operatorFleetTile));
  latestSparkPairComparison = cockpit.sparkComparison.available ? cockpit.sparkComparison : null;
  renderSparkPairComparisonPanel(sparkPairComparePanel, cockpit.sparkComparison);
  renderFleetComparisonPanel(fleetComparisonPanel, cockpit.fleetComparison);
  renderSystemCharacterizationPanel(characterizationPanel, platformVirtualSensorCache.systemIdentification);
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
  const sparkComparison = buildSparkPairComparison(summary, machineContext);
  const fleetComparison = buildFleetComparison(summary, machineContext, platformVirtualSensorCache.systemIdentification);
  const productReadiness = buildProductReadinessState({ summary, machineContext, ageMilliseconds, grafana, fleet, confidence });
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
    productReadiness,
    fleet,
    sparkComparison,
    fleetComparison,
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

function operatorSourceLabel(id) {
  return {
    host: "Host",
    kubernetes: "Kubernetes",
    prometheus: "Prometheus",
    dcgm: "DCGM",
    kafka: "Kafka",
    grafana: "Grafana",
    docker: "Docker",
    ollama: "Ollama",
    "node-exporter": "Node Exporter",
    ebpf: "eBPF",
    provider: "Provider",
    "nccl-trace": "NCCL",
    "gb10-nvml-nvidia-smi": "GB10 NVML",
    "linux-uma-memory": "Linux UMA",
    "app-metrics": "App Metrics",
    "nsight-cupti-profiling": "Nsight/CUPTI"
  }[id] || titleCase(id);
}

function gb10MonitoringAvailable(item) {
  return Boolean(item && item.status && item.status !== "missing");
}

function formatHostSampleAgeMilliseconds(ageMilliseconds) {
  const parsed = Number(ageMilliseconds);
  const rounded = Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  return `${number.format(rounded)}ms`;
}

function operatorSourceNote({ id, present, status, ageMilliseconds, summary, machineContext, kafka, observedServices }) {
  if (!present) return "No signal attached";
  if (id === "host") return ageMilliseconds === null ? "Host sample attached" : `${formatHostSampleAgeMilliseconds(ageMilliseconds)} since host sample`;
  if (id === "kafka") return kafka.messageId ? `Smoke message ${kafka.messageId}` : kafka.nodePortBootstrap || "Broker reachable";
  if (id === "grafana") return summary.grafana?.links?.[0]?.label || summary.grafana?.dashboards?.[0] || (observedServices.includes("grafana") ? "Service reachable" : "Dashboard handoff");
  if (id === "kubernetes") return summary.schedulerEvidence?.schedulerNames?.[0] || machineContext?.context?.namespace || "Pod/job evidence";
  if (id === "prometheus") return "Prometheus source metrics";
  if (id === "dcgm") return "GPU counter source";
  if (id === "docker") return `${machineContext?.dockerContainers?.length || 0} containers observed`;
  if (id === "nccl-trace") {
    if (machineContext?.ncclRuntimePresent) {
      return machineContext.ncclRuntimeDetail
        || `${machineContext.ncclRuntimeContainers.join(", ") || machineContext.ncclRuntimeSource || "NCCL runtime"} observed`;
    }
    return "NCCL trace export attached";
  }
  if (id === "ollama") {
    if (machineContext?.ollamaTelemetryAvailable) {
      return `${formatDecimal(machineContext.ollamaTokensPerSecond, 1)} tok/s | ${round(machineContext.ollamaTimeToFirstTokenMs)}ms TTFT`;
    }
    if (machineContext?.ollamaTelemetryStatus === "no-running-model") {
      return `${machineContext.modelCount || 0} local models | no loaded model`;
    }
    return `${machineContext?.modelCount || 0} local models`;
  }
  if (status === "attached") return "Source export attached";
  return "Live service reachable";
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

function operatorProductReadinessNodes(readiness) {
  const summary = document.createElement("div");
  summary.className = "product-readiness-summary";
  summary.dataset.tone = readiness.tone;

  const score = document.createElement("strong");
  score.textContent = `${readiness.score}/100`;
  const copy = document.createElement("span");
  copy.textContent = readiness.badge === "Pilot-ready"
    ? "Operationally ready for a friendly pilot; customer security gates still need explicit sign-off."
    : readiness.badge === "Needs repair"
      ? "Repair failing runtime checks before putting this in front of a customer."
      : "Core runtime is taking shape; finish customer hardening gates before external access.";
  summary.append(score, copy);

  const grid = document.createElement("div");
  grid.className = "product-readiness-grid";
  readiness.rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "product-readiness-item";
    item.dataset.tone = row.tone;
    const label = document.createElement("span");
    label.textContent = row.label;
    const value = document.createElement("strong");
    value.textContent = row.value;
    const note = document.createElement("small");
    note.textContent = row.note;
    item.append(label, value, note);
    grid.append(item);
  });

  return [summary, grid];
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

function operatorFleetSourceItems(summary) {
  const summaryItems = (summary.sourceItems || [])
    .filter((item) => isMachineDemoItem(item) || item.source?.context?.hostname || item.source?.context?.node);
  const machineJobs = jobs
    .filter((item) => isMachineDemoItem(item) || item.source?.context?.hostname || item.source?.context?.node);
  return machineJobs.length > 1 ? machineJobs : summaryItems;
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

function buildFleetMachineContexts(summary, machineContext) {
  const items = operatorFleetSourceItems(summary);
  const contexts = items
    .map((item) => machineContextFromSourceItem(summary, item))
    .filter(Boolean);

  if (!contexts.length && machineContext) contexts.push(machineContext);

  return uniqueBy(contexts, fleetHostKey)
    .sort(fleetHostContextSort);
}

function fleetHostContextSort(left, right) {
  const leftRank = fleetHostSortRank(left);
  const rightRank = fleetHostSortRank(right);
  return leftRank - rightRank || fleetNaturalLabel(left.host).localeCompare(fleetNaturalLabel(right.host), undefined, { numeric: true });
}

function fleetHostSortRank(machineContext) {
  const role = sparkPairHostRole(machineContext);
  if (role === "SPARK1") return 10;
  if (role === "SPARK2") return 11;
  const label = fleetNaturalLabel(machineContext.host);
  const piMatch = label.match(/^pi(\d+)$/i) || label.match(/^PI(\d+)$/);
  if (piMatch) return 100 + numeric(piMatch[1], 0);
  if (/nuc/i.test(label)) return 50;
  return 200;
}

function fleetHostKey(machineContext) {
  const context = machineContext?.context || {};
  return normalizeFleetHostId(
    sparkPairHostRole(machineContext)
    || machineContext?.host
    || context.hostname
    || context.node
    || context.networkLocalAddress
  );
}

function normalizeFleetHostId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^pi@/, "")
    .replace(/[^a-z0-9]+/g, "");
}

function fleetNaturalLabel(value) {
  return String(value || "").trim() || "host";
}

function fleetCharacterizationMap(characterization) {
  const map = new Map();
  if (!characterization || characterization.status !== "ready") return map;
  (characterization.hosts || []).forEach((host) => {
    map.set(normalizeFleetHostId(host.hostId), host);
  });
  return map;
}

function fleetHostSnapshot(machineContext, characterizationHost) {
  const context = machineContext.context || {};
  const sampleAgeMs = sparkPairSampleAgeMilliseconds(machineContext);
  const networkIssueCount = numeric(machineContext.networkRxDrops)
    + numeric(machineContext.networkTxDrops)
    + numeric(machineContext.networkRxErrors)
    + numeric(machineContext.networkTxErrors);
  const networkThroughputBps = Math.max(
    numeric(machineContext.networkRxBytesPerSecond, 0),
    numeric(machineContext.networkTxBytesPerSecond, 0)
  );
  const loadPressurePct = clamp((numeric(context.load1) / Math.max(1, numeric(context.cpuCount, machineContext.context?.cpuCount || 1))) * 100);
  const memoryTotalBytes = numeric(context.memoryTotalBytes, 0);
  const diskTotalBytes = numeric(context.diskTotalBytes, 0);
  const signature = fleetSystemSignature(characterizationHost);
  const host = machineContext.host || context.hostname || "host";
  const services = machineDemoServices(context.observedServices);

  return {
    host,
    key: fleetHostKey(machineContext),
    machineContext,
    characterizationHost,
    services,
    platform: [machineContext.platform, machineContext.arch].filter(Boolean).join("/") || context.os || "",
    cpuModel: String(context.cpuModel || ""),
    cpuCount: numeric(context.cpuCount, 0),
    sampleAgeMs,
    cpuUsagePct: machineContext.cpuUsagePct,
    cpuTemperatureC: machineContext.cpuTemperatureC,
    loadPressurePct,
    memoryUsedPct: machineContext.memoryUsedPct,
    memoryTotalBytes,
    diskUsedPct: machineContext.diskUsedPct,
    diskTotalBytes,
    networkUtilizationPct: machineContext.networkUtilizationPct,
    networkLinkSpeedMbps: machineContext.networkLinkSpeedMbps,
    networkThroughputBps,
    networkIssueCount,
    dockerCpuPct: sparkPairDockerCpuPct(machineContext),
    ollamaTokensPerSecond: machineContext.ollamaTokensPerSecond,
    modelCount: machineContext.modelCount,
    benchmarkSuiteName: machineContext.benchmarkSuiteName,
    benchmarkSuiteStatus: machineContext.benchmarkSuiteStatus,
    benchmarkGeneratedAt: machineContext.benchmarkGeneratedAt,
    benchmarkSampleCached: machineContext.benchmarkSampleCached,
    benchmarkSampleAgeMs: machineContext.benchmarkSampleAgeMs,
    benchmarkTtlMs: machineContext.benchmarkTtlMs,
    benchmarkDurationMs: machineContext.benchmarkDurationMs,
    benchmarkCpuOpsPerSecond: machineContext.benchmarkCpuOpsPerSecond,
    benchmarkMemoryMiBps: machineContext.benchmarkMemoryMiBps,
    benchmarkDiskWriteMiBps: machineContext.benchmarkDiskWriteMiBps,
    benchmarkDiskReadMiBps: machineContext.benchmarkDiskReadMiBps,
    benchmarkScore: fleetBenchmarkCompositeScore(machineContext),
    benchmarkError: machineContext.benchmarkError,
    gpuPresent: machineContext.gpuPresent,
    gpuUtilizationPct: machineContext.gpuUtilizationPct,
    gpuMemoryUsedPct: machineContext.gpuMemoryUsedPct,
    signature,
    signatureDelta: Number.NaN,
    signatureMetricCount: Object.keys(signature).length,
    outlierCount: 0,
    outlierLabels: [],
    score: 0,
    tone: "watch"
  };
}

function fleetSystemSignature(host) {
  if (!host) return {};
  const signature = {};
  (host.subsystems || []).forEach((subsystem) => {
    [
      ["stepPeak", subsystem.stepPeak],
      ["stepGain", subsystem.stepGain],
      ["impulsePeak", subsystem.impulsePeak],
      ["impulseGain", subsystem.impulseGain],
      ["rampPeak", subsystem.rampPeak]
    ].forEach(([feature, value]) => {
      if (Number.isFinite(value)) signature[`${subsystem.key}:${feature}`] = value;
    });
    Object.entries(subsystem.profilePeaks || {}).forEach(([profile, value]) => {
      if (Number.isFinite(value)) signature[`${subsystem.key}:${profile}:peak`] = value;
    });
  });
  return signature;
}

function assignFleetSignatureDistances(rows) {
  const keys = unique(rows.flatMap((row) => Object.keys(row.signature)));
  if (!keys.length) return;
  const medians = new Map();
  const scales = new Map();
  keys.forEach((key) => {
    const values = rows.map((row) => row.signature[key]).filter(Number.isFinite);
    if (values.length < 2) return;
    const median = fleetMedian(values);
    const mad = fleetMedian(values.map((value) => Math.abs(value - median)));
    medians.set(key, median);
    scales.set(key, Math.max(mad * 1.4826, Math.abs(median) * 0.08, 0.5));
  });

  rows.forEach((row) => {
    const distances = Object.entries(row.signature)
      .filter(([key, value]) => medians.has(key) && Number.isFinite(value))
      .map(([key, value]) => Math.abs(value - medians.get(key)) / scales.get(key));
    row.signatureDelta = distances.length
      ? distances.reduce((total, value) => total + value, 0) / distances.length
      : Number.NaN;
  });
}

function fleetMetricConfigs() {
  return [
    { key: "sampleAgeMs", label: "Freshness", formatter: sparkPairAgeLabel, lowerBetter: true, weight: 1.1, domain: [0, MACHINE_DEMO_FRESH_MS * 2], outlierLabel: "stale" },
    { key: "cpuUsagePct", label: "CPU", formatter: pct, lowerBetter: true, weight: 1.1, domain: [0, 95], outlierLabel: "cpu" },
    { key: "loadPressurePct", label: "Load/core", formatter: pct, lowerBetter: true, weight: 0.8, domain: [0, 120], outlierLabel: "load" },
    { key: "cpuTemperatureC", label: "CPU temp", formatter: fleetTemperatureLabel, lowerBetter: true, weight: 0.8, domain: [35, 85], outlierLabel: "thermal" },
    { key: "memoryUsedPct", label: "RAM used", formatter: pct, lowerBetter: true, weight: 1, domain: [0, 95], outlierLabel: "ram" },
    { key: "diskUsedPct", label: "Disk used", formatter: pct, lowerBetter: true, weight: 0.8, domain: [0, 95], outlierLabel: "disk" },
    { key: "networkIssueCount", label: "Net issues", formatter: (value) => number.format(value), lowerBetter: true, weight: 0.9, domain: [0, 10], outlierLabel: "net" },
    { key: "cpuCount", label: "CPU cores", formatter: (value) => number.format(value), higherBetter: true, weight: 0.7, relative: true },
    { key: "memoryTotalBytes", label: "RAM total", formatter: formatBytes, higherBetter: true, weight: 0.75, relative: true },
    { key: "diskTotalBytes", label: "Disk total", formatter: formatBytes, higherBetter: true, weight: 0.55, relative: true },
    { key: "networkLinkSpeedMbps", label: "Link speed", formatter: fleetMbpsLabel, higherBetter: true, weight: 0.6, relative: true },
    { key: "networkThroughputBps", label: "Net activity", formatter: formatBytesPerSecond, higherBetter: true, weight: 0.25, relative: true },
    { key: "benchmarkScore", label: "Bench score", formatter: fleetBenchmarkScoreLabel, higherBetter: true, weight: 0.9, relative: true, outlierLabel: "bench" },
    { key: "benchmarkCpuOpsPerSecond", label: "CPU bench", formatter: fleetOpsLabel, higherBetter: true, weight: 0.7, relative: true, outlierLabel: "cpu-bench" },
    { key: "benchmarkMemoryMiBps", label: "Memory bench", formatter: fleetMibPerSecondLabel, higherBetter: true, weight: 0.65, relative: true, outlierLabel: "mem-bench" },
    { key: "benchmarkDiskWriteMiBps", label: "Disk write", formatter: fleetMibPerSecondLabel, higherBetter: true, weight: 0.45, relative: true, outlierLabel: "disk-bench" },
    { key: "benchmarkDiskReadMiBps", label: "Disk read", formatter: fleetMibPerSecondLabel, higherBetter: true, weight: 0.45, relative: true, outlierLabel: "disk-bench" },
    { key: "signatureDelta", label: "ID signature", formatter: fleetSignatureLabel, lowerBetter: true, weight: 0.8, domain: [0, 4], outlierLabel: "signature" }
  ];
}

function fleetMetricSpread(config, rows) {
  const samples = rows
    .map((row) => ({ row, value: numeric(row[config.key], Number.NaN) }))
    .filter((item) => Number.isFinite(item.value));
  if (!samples.length) return null;

  const values = samples.map((item) => item.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const median = fleetMedian(values);
  const mad = fleetMedian(values.map((value) => Math.abs(value - median)));
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const stdev = Math.sqrt(values.reduce((total, value) => total + ((value - mean) ** 2), 0) / values.length);
  const cv = Math.abs(mean) > 0.0001 ? stdev / Math.abs(mean) : 0;
  const outlierFloor = Math.max(mad * 3.5, Math.abs(median) * 0.25, fleetMetricDomainWidth(config) * 0.12);
  const outliers = samples.filter((item) => Math.abs(item.value - median) > outlierFloor);
  outliers.forEach((item) => {
    item.row.outlierCount += 1;
    if (config.outlierLabel) item.row.outlierLabels.push(config.outlierLabel);
  });
  const best = samples.slice().sort((left, right) => fleetMetricPreferenceSort(config, left.value, right.value))[0];
  const worst = samples.slice().sort((left, right) => fleetMetricPreferenceSort(config, right.value, left.value))[0];

  return {
    key: config.key,
    label: config.label,
    min,
    median,
    max,
    cv,
    outlierCount: outliers.length,
    formatter: config.formatter,
    bestHost: best?.row?.host || "",
    worstHost: worst?.row?.host || "",
    tone: outliers.length > Math.max(1, rows.length * 0.25) || cv > 0.65 ? "poor" : outliers.length || cv > 0.28 ? "watch" : "good"
  };
}

function assignFleetScores(rows, metricConfigs) {
  const relativeRanges = new Map();
  metricConfigs.filter((config) => config.relative).forEach((config) => {
    const values = rows.map((row) => numeric(row[config.key], Number.NaN)).filter(Number.isFinite);
    relativeRanges.set(config.key, {
      min: values.length ? Math.min(...values) : Number.NaN,
      max: values.length ? Math.max(...values) : Number.NaN
    });
  });

  rows.forEach((row) => {
    const scores = [];
    metricConfigs.forEach((config) => {
      const value = numeric(row[config.key], Number.NaN);
      if (!Number.isFinite(value)) return;
      let score = null;
      if (config.relative) {
        const range = relativeRanges.get(config.key) || {};
        score = fleetRelativeScore(value, range.min, range.max, config.higherBetter);
      } else if (config.lowerBetter) {
        const [best, worst] = config.domain || [0, 100];
        score = clamp(100 - ((value - best) / Math.max(1, worst - best)) * 100);
      } else if (config.higherBetter) {
        const [worst, best] = config.domain || [0, 100];
        score = clamp(((value - worst) / Math.max(1, best - worst)) * 100);
      }
      if (Number.isFinite(score)) scores.push({ score, weight: config.weight || 1 });
    });
    const totalWeight = scores.reduce((total, item) => total + item.weight, 0);
    row.score = totalWeight ? scores.reduce((total, item) => total + item.score * item.weight, 0) / totalWeight : 0;
    row.outlierLabels = unique(row.outlierLabels).slice(0, 4);
    row.tone = row.score >= 74 && row.outlierCount === 0 ? "good" : row.score >= 50 && row.outlierCount <= 2 ? "watch" : "poor";
  });
}

function fleetComparisonSummaries(rows, spreadRows, counts) {
  const fresh = rows.filter((row) => Number.isFinite(row.sampleAgeMs) && row.sampleAgeMs <= MACHINE_DEMO_FRESH_MS).length;
  const top = rows[0];
  const widest = spreadRows.slice().sort((left, right) => right.cv - left.cv)[0];
  const piCount = rows.filter((row) => /^pi\d+$/i.test(row.host)).length;
  const benchmarkRows = rows.filter(fleetBenchmarkAvailable);
  const freshBenchmarks = benchmarkRows.filter((row) => {
    if (!Number.isFinite(row.benchmarkSampleAgeMs)) return true;
    const ttl = Number.isFinite(row.benchmarkTtlMs) && row.benchmarkTtlMs > 0 ? row.benchmarkTtlMs : 15 * 60 * 1000;
    return row.benchmarkSampleAgeMs <= ttl;
  }).length;
  return [
    {
      label: "Hosts",
      value: `${rows.length}`,
      note: piCount ? `${piCount} Raspberry Pi hosts` : `${fresh} fresh samples`,
      tone: fresh === rows.length ? "good" : fresh >= rows.length * 0.75 ? "watch" : "poor"
    },
    {
      label: "Fresh",
      value: `${fresh}/${rows.length}`,
      note: counts.staleCount ? `${counts.staleCount} stale` : "live bundle current",
      tone: counts.staleCount ? counts.staleCount > rows.length * 0.25 ? "poor" : "watch" : "good"
    },
    {
      label: "Top rank",
      value: top ? top.host : "--",
      note: top ? `${round(top.score)} composite` : "no rank",
      tone: top?.tone || "watch"
    },
    {
      label: "Outliers",
      value: `${counts.outlierCount}`,
      note: widest ? `${widest.label} CV ${formatDecimal(widest.cv, 2)}` : "spread learning",
      tone: counts.outlierCount ? counts.outlierCount > rows.length * 0.25 ? "poor" : "watch" : "good"
    },
    {
      label: "Benchmarks",
      value: `${counts.benchmarkCount}/${piCount || rows.length}`,
      note: benchmarkRows.length ? `${freshBenchmarks} fresh periodic suites` : "waiting for Pi benchmark suites",
      tone: benchmarkRows.length >= Math.max(1, piCount) ? "good" : benchmarkRows.length ? "watch" : "poor"
    },
    {
      label: "Fingerprints",
      value: `${counts.fingerprintCount}/${rows.length}`,
      note: "system-ID signature rows",
      tone: counts.fingerprintCount >= rows.length ? "good" : counts.fingerprintCount ? "watch" : "poor"
    }
  ];
}

function buildPiBenchmarkHistograms(rows) {
  const piRows = rows
    .filter(isPiFleetRow)
    .sort((left, right) => fleetNaturalLabel(left.host).localeCompare(fleetNaturalLabel(right.host), undefined, { numeric: true }));
  if (piRows.length < 2) return [];

  return fleetBenchmarkMetricConfigs()
    .map((config) => fleetBenchmarkHistogram(config, piRows));
}

function fleetBenchmarkMetricConfigs() {
  return [
    { key: "benchmarkCpuOpsPerSecond", label: "CPU scalar", formatter: fleetOpsLabel },
    { key: "benchmarkMemoryMiBps", label: "Memory fill", formatter: fleetMibPerSecondLabel },
    { key: "benchmarkDiskWriteMiBps", label: "Disk write", formatter: fleetMibPerSecondLabel },
    { key: "benchmarkDiskReadMiBps", label: "Disk read", formatter: fleetMibPerSecondLabel },
    { key: "benchmarkScore", label: "Composite", formatter: fleetBenchmarkScoreLabel }
  ];
}

function fleetBenchmarkHistogram(config, rows) {
  const samples = rows
    .map((row) => ({ row, value: numeric(row[config.key], Number.NaN) }))
    .filter((sample) => Number.isFinite(sample.value) && sample.value >= 0);

  const values = samples.map((sample) => sample.value);
  const min = values.length ? Math.min(...values) : Number.NaN;
  const max = values.length ? Math.max(...values) : Number.NaN;
  const median = values.length ? fleetMedian(values) : Number.NaN;
  const sortedByValue = samples.slice().sort((left, right) => right.value - left.value || fleetNaturalLabel(left.row.host).localeCompare(fleetNaturalLabel(right.row.host), undefined, { numeric: true }));
  const best = sortedByValue[0];
  const denominator = Math.max(Number.isFinite(max) ? max : 0, 1);

  return {
    key: config.key,
    label: config.label,
    min,
    max,
    median,
    bestHost: best?.row?.host || "",
    sampleCount: samples.length,
    pendingCount: Math.max(0, rows.length - samples.length),
    formatter: config.formatter,
    bars: rows.map((row) => {
      const value = numeric(row[config.key], Number.NaN);
      const hasValue = Number.isFinite(value) && value >= 0;
      return {
        host: row.host,
        value,
        label: hasValue ? config.formatter(value) : "--",
        percent: hasValue ? clamp((value / denominator) * 100, 4, 100) : 0,
        status: row.benchmarkSuiteStatus || "waiting",
        age: fleetBenchmarkAgeLabel(row),
        available: hasValue
      };
    })
  };
}

function fleetBenchmarkAvailable(row) {
  return ["fresh", "cached", "stale"].includes(String(row.benchmarkSuiteStatus || ""))
    && [
      row.benchmarkCpuOpsPerSecond,
      row.benchmarkMemoryMiBps,
      row.benchmarkDiskWriteMiBps,
      row.benchmarkDiskReadMiBps,
      row.benchmarkScore
    ].some((value) => Number.isFinite(value));
}

function fleetBenchmarkCompositeScore(machineContext) {
  const cpu = numeric(machineContext.benchmarkCpuOpsPerSecond, 0);
  const memory = numeric(machineContext.benchmarkMemoryMiBps, 0);
  const write = numeric(machineContext.benchmarkDiskWriteMiBps, 0);
  const read = numeric(machineContext.benchmarkDiskReadMiBps, 0);
  if (![cpu, memory, write, read].some((value) => value > 0)) {
    return numeric(machineContext.benchmarkScore, Number.NaN);
  }
  return clamp(
    (cpu / 500_000_000) * 35
    + (memory / 8000) * 25
    + (write / 180) * 18
    + (read / 1800) * 22,
    0,
    100
  );
}

function fleetBenchmarkAgeLabel(row) {
  if (Number.isFinite(row.benchmarkSampleAgeMs)) return sparkPairAgeLabel(row.benchmarkSampleAgeMs);
  const generatedAt = row.benchmarkGeneratedAt ? safeDate(row.benchmarkGeneratedAt, null) : null;
  return generatedAt ? sparkPairAgeLabel(Math.max(0, Date.now() - generatedAt.getTime())) : "waiting";
}

function fleetMetricPreferenceSort(config, leftValue, rightValue) {
  return config.lowerBetter ? leftValue - rightValue : rightValue - leftValue;
}

function fleetMetricDomainWidth(config) {
  if (!config.domain) return 1;
  return Math.max(1, Math.abs(config.domain[1] - config.domain[0]));
}

function fleetRelativeScore(value, min, max, higherBetter) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (max === min) return 82;
  const ratio = (value - min) / (max - min);
  return clamp((higherBetter ? ratio : 1 - ratio) * 100);
}

function fleetMedian(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return Number.NaN;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function fleetTemperatureLabel(value) {
  return Number.isFinite(value) && value > 0 ? `${formatDecimal(value, 1)} C` : "--";
}

function fleetMbpsLabel(value) {
  return Number.isFinite(value) && value > 0 ? `${compactNumber.format(value)} Mbps` : "--";
}

function fleetOpsLabel(value) {
  return Number.isFinite(value) && value > 0 ? `${compactNumber.format(value)} ops/s` : "--";
}

function fleetMibPerSecondLabel(value) {
  return Number.isFinite(value) && value > 0 ? `${formatDecimal(value, value >= 100 ? 0 : 1)} MiB/s` : "--";
}

function fleetBenchmarkScoreLabel(value) {
  return Number.isFinite(value) ? `${formatDecimal(value, 1)}` : "--";
}

function fleetSignatureLabel(value) {
  return Number.isFinite(value) ? formatDecimal(value, 2) : "--";
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

function machineContextFromSourceItem(summary, item) {
  const rawContext = item.source?.context || {};
  if (!isPlainObject(rawContext)) return null;

  const host = rawContext.hostname || rawContext.node || item.cluster || item.name || item.id || "this host";
  const gpuModel = rawContext.gpuName || item.gpuModel || "";
  const hasGpu = rawContext.gpuPresent === true || Boolean(rawContext.gpuName) || numeric(item.gpus, 0) > 0;
  const source = item.source || {};
  const context = {
    ...rawContext,
    hostname: host
  };
  const singleItem = {
    ...item,
    source: {
      ...source,
      adapters: unique(["local-machine", ...(source.adapters || [])]),
      context
    }
  };
  const singleSummary = {
    ...summary,
    sourceItems: [singleItem],
    clusters: [host],
    gpuModels: gpuModel ? [gpuModel] : [],
    gpus: hasGpu ? Math.max(1, numeric(item.gpus, 1)) : 0,
    gpuUtil: numeric(rawContext.gpuUtilizationPct, numeric(item.gpuUtil, summary.gpuUtil)),
    usefulCompute: numeric(rawContext.gpuUtilizationPct, numeric(item.usefulCompute, summary.usefulCompute)),
    hbmCapacity: numeric(rawContext.gpuMemoryUsedPct, summary.hbmCapacity),
    steps: numeric(item.steps, summary.steps),
    inferenceRequestsM: numeric(item.inferenceRequestsM, summary.inferenceRequestsM)
  };

  return machineDemoContext(singleSummary);
}

function selectSparkPairContexts(contexts) {
  const spark1 = contexts.find((context) => sparkPairHostRole(context) === "SPARK1");
  const spark2 = contexts.find((context) => sparkPairHostRole(context) === "SPARK2");
  if (spark1 && spark2) return [spark1, spark2];
  if (spark1) return [spark1, contexts.find((context) => context !== spark1)].filter(Boolean);
  if (spark2) return [contexts.find((context) => context !== spark2), spark2].filter(Boolean);
  return contexts.slice(0, 2);
}

function sparkPairContextRank(context) {
  const role = sparkPairHostRole(context);
  if (role === "SPARK1") return 1;
  if (role === "SPARK2") return 2;
  return 10;
}

function sparkPairHostRole(machineContext) {
  const context = machineContext?.context || {};
  const text = [
    machineContext?.host,
    context.hostname,
    context.node,
    context.hostUrl,
    context.networkLocalAddress,
    context.ncclRuntimeHostIp
  ].filter(Boolean).join(" ").toLowerCase();

  if (/(^|[^a-z0-9])spark[ -]?1([^a-z0-9]|$)|192\.168\.10\.20|192\.168\.100\.10/.test(text)) return "SPARK1";
  if (/(^|[^a-z0-9])spark[ -]?2([^a-z0-9]|$)|192\.168\.10\.21|192\.168\.100\.11/.test(text)) return "SPARK2";
  return "";
}

function sparkPairHostLabel(machineContext, fallback) {
  return sparkPairHostRole(machineContext) || machineContext?.host || fallback;
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

function sparkPairClockSyncMetric(left, right) {
  const leftText = sparkPairClockStateLabel(left);
  const rightText = sparkPairClockStateLabel(right);
  const bothPtp = left.clockPtpActive && right.clockPtpActive;
  const bothSynced = left.clockSynchronized && right.clockSynchronized;
  const oneSynced = left.clockSynchronized || right.clockSynchronized;
  const tone = bothPtp && bothSynced ? "good" : bothSynced ? "watch" : oneSynced ? "poor" : "poor";
  return {
    id: "clock-sync",
    label: "Clock sync",
    leftText,
    rightText,
    leftDetail: sparkPairClockDetail(left),
    rightDetail: sparkPairClockDetail(right),
    deltaLabel: bothPtp && bothSynced ? "PTP" : bothSynced ? "synced" : oneSynced ? "partial" : "unsynced",
    deltaTitle: "Clock discipline source",
    note: "PTP/chrony/timesync discipline",
    tone,
    leftPercent: left.clockSynchronized ? 100 : 0,
    rightPercent: right.clockSynchronized ? 100 : 0
  };
}

function recordSparkPairClockSample(left, right) {
  const leftTime = sparkPairGeneratedAtMs(left);
  const rightTime = sparkPairGeneratedAtMs(right);
  const leftOffsetNs = numeric(left.clockOffsetNs, Number.NaN);
  const rightOffsetNs = numeric(right.clockOffsetNs, Number.NaN);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return sparkPairClockHistory;
  const timestampMs = Math.max(leftTime, rightTime);
  const last = sparkPairClockHistory[sparkPairClockHistory.length - 1];
  if (last && last.timestampMs === timestampMs && last.leftGeneratedAtMs === leftTime && last.rightGeneratedAtMs === rightTime) {
    return sparkPairClockHistory;
  }

  sparkPairClockHistory.push({
    timestampMs,
    leftGeneratedAtMs: leftTime,
    rightGeneratedAtMs: rightTime,
    label: new Date(timestampMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    leftOffsetNs,
    rightOffsetNs,
    offsetDeltaNs: Number.isFinite(leftOffsetNs) && Number.isFinite(rightOffsetNs)
      ? leftOffsetNs - rightOffsetNs
      : Number.NaN,
    sampleSkewMs: Math.abs(leftTime - rightTime),
    leftSource: left.clockSource || "",
    rightSource: right.clockSource || "",
    leftPtp: Boolean(left.clockPtpActive),
    rightPtp: Boolean(right.clockPtpActive)
  });

  if (sparkPairClockHistory.length > SPARK_PAIR_CLOCK_HISTORY_LIMIT) {
    sparkPairClockHistory = sparkPairClockHistory.slice(-SPARK_PAIR_CLOCK_HISTORY_LIMIT);
  }
  return sparkPairClockHistory;
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

function sparkPairClockContextFromFeedSample(sample) {
  const context = {
    generatedAt: sample.generatedAt || "",
    hostname: sample.hostname || sample.role || "",
    clockSource: sample.clockSource || "",
    clockSynchronized: Boolean(sample.clockSynchronized),
    clockOffsetNs: sample.clockOffsetNs,
    clockPtpActive: Boolean(sample.clockPtpActive),
    clockPtpPortState: sample.clockPtpPortState || "",
    clockPtpGrandmaster: sample.clockPtpGrandmaster || "",
    clockChronyReference: sample.clockChronyReference || "",
    clockTimezone: sample.clockTimezone || "",
    clockSyncDetail: sample.clockSyncDetail || ""
  };
  return {
    host: sample.role || sample.hostname || "",
    context,
    clockSource: String(sample.clockSource || ""),
    clockSynchronized: Boolean(sample.clockSynchronized),
    clockTimeUnixMs: numeric(sample.clockTimeUnixMs, Number.NaN),
    clockTimeUnixNs: String(sample.clockTimeUnixNs || ""),
    clockTimezone: String(sample.clockTimezone || ""),
    clockOffsetNs: numeric(sample.clockOffsetNs, Number.NaN),
    clockPtpInstalled: Boolean(sample.clockPtpInstalled),
    clockPtpActive: Boolean(sample.clockPtpActive),
    clockPtpPortState: String(sample.clockPtpPortState || ""),
    clockPtpGrandmaster: String(sample.clockPtpGrandmaster || ""),
    clockChronyReference: String(sample.clockChronyReference || ""),
    clockSyncDetail: String(sample.clockSyncDetail || "")
  };
}

function refreshSparkPairClockPanel() {
  const current = document.querySelector("#sparkPairComparePanel .spark-pair-clock-panel");
  if (!current) return;
  current.replaceWith(sparkPairClockGraphPanel(sparkPairClockHistory));
}

function refreshSparkPairClockMetricRows(left, right) {
  const panel = document.querySelector("#sparkPairComparePanel");
  if (!panel) return;
  [
    sparkPairClockSyncMetric(left, right),
    sparkPairSampleSkewMetric(left, right),
    sparkPairClockOffsetMetric(left, right)
  ].filter(Boolean).forEach((rowData) => {
    const current = panel.querySelector(`.spark-pair-row[data-metric="${rowData.id}"]`);
    if (current) current.replaceWith(sparkPairMetricRow(rowData));
  });
}

function sparkPairClockOffsetMetric(left, right) {
  return sparkPairNumericMetric({
    id: "clock-offset",
    label: "Clock offset",
    leftValue: left.clockOffsetNs,
    rightValue: right.clockOffsetNs,
    formatter: sparkPairClockOffsetLabel,
    deltaFormatter: (_delta, absDelta) => sparkPairClockOffsetLabel(absDelta),
    note: "Clock-source offset; PTP/chrony when available",
    watchDelta: 100_000,
    poorDelta: 1_000_000,
    maxValue: Math.max(1_000_000, Math.abs(numeric(left.clockOffsetNs, 0)), Math.abs(numeric(right.clockOffsetNs, 0))),
    includeWhen: Number.isFinite(left.clockOffsetNs) || Number.isFinite(right.clockOffsetNs)
  });
}

function sparkPairSampleSkewMetric(left, right) {
  const leftTime = sparkPairGeneratedAtMs(left);
  const rightTime = sparkPairGeneratedAtMs(right);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return null;
  const skewMs = Math.abs(leftTime - rightTime);
  return {
    id: "clock-sample-skew",
    label: "Sample skew",
    leftText: sparkPairClockTimeLabel(leftTime),
    rightText: sparkPairClockTimeLabel(rightTime),
    leftDetail: sparkPairClockDetail(left),
    rightDetail: sparkPairClockDetail(right),
    deltaLabel: sparkPairAgeLabel(skewMs),
    deltaTitle: "SPARK1/SPARK2 host sample timestamp difference",
    note: "PTP makes sub-second comparisons safer",
    tone: skewMs <= 1000 ? "good" : skewMs <= 5000 ? "watch" : "poor",
    leftPercent: null,
    rightPercent: null
  };
}

function sparkPairGeneratedAtMs(machineContext) {
  const generatedAt = machineContext?.context?.generatedAt ? safeDate(machineContext.context.generatedAt, null) : null;
  return generatedAt ? generatedAt.getTime() : Number.NaN;
}

function sparkPairClockStateLabel(machineContext) {
  if (machineContext.clockPtpActive) return machineContext.clockSynchronized ? "PTP synced" : "PTP active";
  if (machineContext.clockSynchronized) return machineContext.clockSource ? `${machineContext.clockSource} synced` : "synced";
  if (machineContext.clockPtpInstalled) return "PTP inactive";
  return machineContext.clockSource === "unsynchronized" ? "unsynced" : "not observed";
}

function sparkPairClockDetail(machineContext) {
  const bits = [];
  if (machineContext.clockPtpGrandmaster) bits.push(`GM ${machineContext.clockPtpGrandmaster}`);
  if (machineContext.clockPtpPortState) bits.push(machineContext.clockPtpPortState);
  if (machineContext.clockChronyReference) bits.push(machineContext.clockChronyReference);
  if (Number.isFinite(machineContext.clockOffsetNs)) bits.push(sparkPairClockOffsetLabel(machineContext.clockOffsetNs));
  if (machineContext.clockTimezone) bits.push(machineContext.clockTimezone);
  return bits.join(" | ") || machineContext.clockSyncDetail || "clock telemetry";
}

function sparkPairClockPairNote(left, right) {
  return `${sparkPairClockStateLabel(left)} | ${sparkPairClockStateLabel(right)}`;
}

function sparkPairClockOffsetLabel(value) {
  if (!Number.isFinite(value)) return "--";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${formatDecimal(abs / 1_000_000, 2)}ms`;
  if (abs >= 1000) return `${sign}${formatDecimal(abs / 1000, 1)}us`;
  return `${sign}${round(abs)}ns`;
}

function sparkPairClockTimeLabel(valueMs) {
  if (!Number.isFinite(valueMs)) return "--";
  return new Date(valueMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function sparkPairPercentMetric(id, label, leftValue, rightValue, note, watchDelta, poorDelta, includeWhen = true) {
  return sparkPairNumericMetric({
    id,
    label,
    leftValue,
    rightValue,
    formatter: pct,
    deltaFormatter: (delta) => sparkPairSignedDelta(delta, "pp"),
    note,
    watchDelta,
    poorDelta,
    maxValue: 100,
    includeWhen
  });
}

function sparkPairThroughputMetric(id, label, leftValue, rightValue, note) {
  const maxValue = Math.max(1, numeric(leftValue), numeric(rightValue));
  return sparkPairNumericMetric({
    id,
    label,
    leftValue,
    rightValue,
    formatter: (value) => Number.isFinite(value) && value > 0 ? formatBytesPerSecond(value) : "--",
    deltaFormatter: (delta, absDelta) => `${delta >= 0 ? "+" : "-"}${formatBytesPerSecond(absDelta)}`,
    note,
    maxValue,
    toneFn: sparkPairRelativeSkewTone,
    includeWhen: Number.isFinite(leftValue) || Number.isFinite(rightValue)
  });
}

function sparkPairNumericMetric(options) {
  if (options.includeWhen === false) return null;

  const leftValue = numeric(options.leftValue, Number.NaN);
  const rightValue = numeric(options.rightValue, Number.NaN);
  const leftFinite = Number.isFinite(leftValue);
  const rightFinite = Number.isFinite(rightValue);
  const bothFinite = leftFinite && rightFinite;
  const delta = bothFinite ? leftValue - rightValue : Number.NaN;
  const absDelta = bothFinite ? Math.abs(delta) : Number.NaN;
  const maxValue = Number.isFinite(options.maxValue) && options.maxValue > 0
    ? options.maxValue
    : Math.max(1, leftFinite ? Math.abs(leftValue) : 0, rightFinite ? Math.abs(rightValue) : 0);
  const formatter = options.formatter || ((value) => String(value));
  const deltaFormatter = options.deltaFormatter || ((value) => sparkPairSignedDelta(value, ""));
  const tone = typeof options.toneFn === "function"
    ? options.toneFn(leftValue, rightValue, absDelta)
    : bothFinite
      ? sparkPairDeltaTone(absDelta, options.watchDelta, options.poorDelta)
      : leftFinite || rightFinite ? "poor" : "watch";

  return {
    id: options.id,
    label: options.label,
    leftText: leftFinite ? formatter(leftValue) : "--",
    rightText: rightFinite ? formatter(rightValue) : "--",
    leftDetail: options.leftDetail || "",
    rightDetail: options.rightDetail || "",
    deltaLabel: bothFinite ? deltaFormatter(delta, absDelta) : "missing",
    deltaTitle: bothFinite ? "SPARK1 - SPARK2" : "One side is missing",
    note: options.note,
    tone,
    leftPercent: leftFinite ? clamp((leftValue / maxValue) * 100) : null,
    rightPercent: rightFinite ? clamp((rightValue / maxValue) * 100) : null
  };
}

function sparkPairCategoryMetric(options) {
  if (options.includeWhen === false) return null;
  const leftText = String(options.leftValue || "--");
  const rightText = String(options.rightValue || "--");
  return {
    id: options.id,
    label: options.label,
    leftText,
    rightText,
    leftDetail: options.leftDetail || "",
    rightDetail: options.rightDetail || "",
    deltaLabel: leftText === rightText ? "match" : "diff",
    deltaTitle: "Categorical parity",
    note: options.note,
    tone: options.tone || (leftText === rightText ? "good" : "watch"),
    leftPercent: null,
    rightPercent: null
  };
}

function sparkPairDeltaTone(absDelta, watchDelta = 10, poorDelta = 25) {
  if (!Number.isFinite(absDelta)) return "watch";
  if (absDelta >= poorDelta) return "poor";
  if (absDelta >= watchDelta) return "watch";
  return "good";
}

function sparkPairRelativeSkewTone(leftValue, rightValue, absDelta) {
  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return Number.isFinite(leftValue) || Number.isFinite(rightValue) ? "poor" : "watch";
  const maxValue = Math.max(Math.abs(leftValue), Math.abs(rightValue), 1);
  const ratio = absDelta / maxValue;
  if (ratio >= 0.5) return "poor";
  if (ratio >= 0.2) return "watch";
  return "good";
}

function sparkPairSignedDelta(delta, suffix, digits = 1) {
  if (!Number.isFinite(delta)) return "--";
  return `${delta >= 0 ? "+" : ""}${formatDecimal(delta, digits)}${suffix}`;
}

function sparkPairAbsDelta(leftValue, rightValue) {
  const leftNumber = numeric(leftValue, Number.NaN);
  const rightNumber = numeric(rightValue, Number.NaN);
  return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) ? Math.abs(leftNumber - rightNumber) : Number.NaN;
}

function sparkPairDeltaLabel(value, suffix) {
  return Number.isFinite(value) ? `${formatDecimal(value, 1)}${suffix}` : "--";
}

function sparkPairThroughputDeltaLabel(value) {
  return Number.isFinite(value) ? formatBytesPerSecond(value) : "--";
}

function sparkPairSampleAgeMilliseconds(machineContext) {
  const generatedAt = machineContext?.context?.generatedAt ? safeDate(machineContext.context.generatedAt, null) : null;
  return generatedAt ? Math.max(0, Date.now() - generatedAt.getTime()) : Number.NaN;
}

function sparkPairAgeLabel(milliseconds) {
  if (!Number.isFinite(milliseconds)) return "--";
  if (milliseconds < 1000) return `${round(milliseconds)}ms`;
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

function sparkPairDockerCpuPct(machineContext) {
  return (machineContext?.dockerContainers || []).reduce((total, container) => total + numeric(container.cpuPct), 0);
}

function sparkPairNetworkNote(left, right) {
  const leftIface = left.networkInterface || "iface n/a";
  const rightIface = right.networkInterface || "iface n/a";
  const leftLink = Number.isFinite(left.networkLinkSpeedMbps) && left.networkLinkSpeedMbps > 0 ? `${compactNumber.format(left.networkLinkSpeedMbps)} Mbps` : "speed n/a";
  const rightLink = Number.isFinite(right.networkLinkSpeedMbps) && right.networkLinkSpeedMbps > 0 ? `${compactNumber.format(right.networkLinkSpeedMbps)} Mbps` : "speed n/a";
  return `${leftIface} ${leftLink} | ${rightIface} ${rightLink}`;
}

function sparkPairOllamaModelLabel(machineContext) {
  return machineContext.ollamaProbeModel || machineContext.ollamaRunningModels[0] || `${machineContext.modelCount} local`;
}

function renderFleetComparisonPanel(container, comparison) {
  if (!comparison.available) {
    const empty = document.createElement("div");
    empty.className = "operator-empty";
    empty.textContent = comparison.emptyText;
    container.replaceChildren(empty);
    return;
  }

  const summary = document.createElement("div");
  summary.className = "fleet-comparison-summary";
  summary.append(...comparison.summaries.map(fleetComparisonSummaryItem));

  const benchmarkGrid = document.createElement("div");
  benchmarkGrid.className = "fleet-benchmark-histograms";
  if (comparison.benchmarkHistograms?.length) {
    benchmarkGrid.append(...comparison.benchmarkHistograms.map(fleetBenchmarkHistogramNode));
  }
  const benchmarkSection = fleetBenchmarkHistogramSection(comparison, benchmarkGrid);

  const rankGrid = document.createElement("div");
  rankGrid.className = "fleet-comparison-rank-grid";
  rankGrid.append(fleetComparisonHeader(["Rank", "Host", "Score", "Pressure", "Capacity", "Network", "Signature"], "fleet-comparison-rank-row"));
  comparison.rows.forEach((row) => {
    rankGrid.append(fleetComparisonRankRow(row));
  });

  const spreadGrid = document.createElement("div");
  spreadGrid.className = "fleet-comparison-spread-grid";
  spreadGrid.append(fleetComparisonHeader(["Metric", "Median", "Range", "Spread", "Outliers"], "fleet-comparison-spread-row"));
  comparison.spreadRows.slice(0, 10).forEach((row) => {
    spreadGrid.append(fleetComparisonSpreadRow(row));
  });

  container.replaceChildren(
    summary,
    ...(benchmarkSection ? [benchmarkSection] : []),
    rankGrid,
    spreadGrid
  );
}

function fleetBenchmarkHistogramSection(comparison, benchmarkGrid) {
  const piRows = comparison.rows.filter(isPiFleetRow);
  if (piRows.length < 2 && !comparison.benchmarkHistograms?.length) return null;

  const section = document.createElement("div");
  section.className = "fleet-benchmark-section";

  const head = document.createElement("div");
  head.className = "fleet-benchmark-section-head";
  const title = document.createElement("strong");
  title.textContent = "Pi Benchmark Histograms";
  const meta = document.createElement("small");
  const benchmarkRows = piRows.filter(fleetBenchmarkAvailable);
  const pending = Math.max(0, piRows.length - benchmarkRows.length);
  meta.textContent = piRows.length
    ? `${benchmarkRows.length}/${piRows.length} suites${pending ? ` | ${pending} pending` : ""}`
    : "waiting for Pi hosts";
  head.append(title, meta);

  if (!benchmarkGrid.children.length) {
    const empty = document.createElement("div");
    empty.className = "fleet-benchmark-empty";
    empty.textContent = piRows.length ? "Waiting for periodic benchmark samples." : "Waiting for Pi fleet samples.";
    benchmarkGrid.append(empty);
  }

  section.append(head, benchmarkGrid);
  return section;
}

function isPiFleetRow(row) {
  return /^pi(?:[1-9]|1[0-2])$/i.test(String(row?.host || ""));
}

function fleetComparisonHeader(labels, rowClass) {
  const row = document.createElement("div");
  row.className = `${rowClass} fleet-comparison-head`;
  labels.forEach((label) => {
    const cell = document.createElement("span");
    cell.textContent = label;
    row.append(cell);
  });
  return row;
}

function fleetComparisonSummaryItem(item) {
  const node = document.createElement("div");
  node.className = "fleet-comparison-summary-item";
  node.dataset.tone = item.tone;
  const label = document.createElement("span");
  label.textContent = item.label;
  const value = document.createElement("strong");
  value.textContent = item.value;
  const note = document.createElement("small");
  note.textContent = item.note;
  node.append(label, value, note);
  return node;
}

function fleetBenchmarkHistogramNode(histogram) {
  const node = document.createElement("div");
  node.className = "fleet-benchmark-histogram";

  const head = document.createElement("div");
  head.className = "fleet-benchmark-head";
  const title = document.createElement("strong");
  title.textContent = histogram.label;
  const meta = document.createElement("small");
  meta.textContent = histogram.sampleCount
    ? `${histogram.bestHost || "--"} best | median ${histogram.formatter(histogram.median)}`
    : `${histogram.pendingCount} pending`;
  head.append(title, meta);

  const bars = document.createElement("div");
  bars.className = "fleet-benchmark-bars";
  histogram.bars.forEach((bar) => {
    bars.append(fleetBenchmarkBarNode(bar));
  });

  node.append(head, bars);
  return node;
}

function fleetBenchmarkBarNode(bar) {
  const row = document.createElement("div");
  row.className = "fleet-benchmark-bar-row";
  row.dataset.status = bar.status;
  if (!bar.available) row.dataset.available = "false";

  const host = document.createElement("span");
  host.textContent = bar.host;
  const track = document.createElement("span");
  track.className = "fleet-benchmark-track";
  const fill = document.createElement("i");
  fill.style.width = `${bar.percent}%`;
  track.append(fill);
  const value = document.createElement("strong");
  value.textContent = bar.label;
  const age = document.createElement("small");
  age.textContent = bar.age;
  row.append(host, track, value, age);
  return row;
}

function fleetComparisonRankRow(rowData) {
  const row = document.createElement("div");
  row.className = "fleet-comparison-rank-row";
  row.dataset.tone = rowData.tone;

  row.append(
    fleetComparisonCell(`#${rowData.rank}`, rowData.outlierLabels.length ? rowData.outlierLabels.join(", ") : "in range"),
    fleetComparisonCell(rowData.host, fleetComparisonHostNote(rowData)),
    fleetComparisonScoreCell(rowData.score),
    fleetComparisonCell(
      `${pct(rowData.cpuUsagePct)} CPU`,
      `${pct(rowData.memoryUsedPct)} RAM | ${fleetTemperatureLabel(rowData.cpuTemperatureC)}`
    ),
    fleetComparisonCell(
      `${number.format(rowData.cpuCount)} cores`,
      `${formatBytes(rowData.memoryTotalBytes)} RAM | ${formatBytes(rowData.diskTotalBytes)} disk`
    ),
    fleetComparisonCell(
      fleetMbpsLabel(rowData.networkLinkSpeedMbps),
      `${formatBytesPerSecond(rowData.networkThroughputBps)} | ${number.format(rowData.networkIssueCount)} issues`
    ),
    fleetComparisonCell(
      fleetSignatureLabel(rowData.signatureDelta),
      rowData.signatureMetricCount ? `${rowData.signatureMetricCount} features` : "waiting"
    )
  );

  return row;
}

function fleetComparisonSpreadRow(rowData) {
  const row = document.createElement("div");
  row.className = "fleet-comparison-spread-row";
  row.dataset.tone = rowData.tone;
  const format = rowData.formatter || String;
  row.append(
    fleetComparisonCell(rowData.label, rowData.bestHost ? `best ${rowData.bestHost}` : ""),
    fleetComparisonCell(format(rowData.median), "median"),
    fleetComparisonCell(`${format(rowData.min)} - ${format(rowData.max)}`, rowData.worstHost ? `watch ${rowData.worstHost}` : ""),
    fleetComparisonCell(`CV ${formatDecimal(rowData.cv, 2)}`, "coefficient"),
    fleetComparisonCell(`${rowData.outlierCount}`, rowData.outlierCount ? "robust MAD" : "none")
  );
  return row;
}

function fleetComparisonCell(value, detail = "") {
  const cell = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = value;
  cell.append(strong);
  if (detail) {
    const small = document.createElement("small");
    small.textContent = detail;
    cell.append(small);
  }
  return cell;
}

function fleetComparisonScoreCell(score) {
  const cell = fleetComparisonCell(`${round(score)}`, "composite");
  const bar = document.createElement("span");
  bar.className = "fleet-comparison-score-bar";
  const fill = document.createElement("i");
  fill.style.width = `${clamp(score)}%`;
  bar.append(fill);
  cell.append(bar);
  return cell;
}

function fleetComparisonHostNote(rowData) {
  const bits = [];
  if (rowData.platform) bits.push(rowData.platform);
  if (rowData.cpuModel) bits.push(rowData.cpuModel.replace(/\s+/g, " ").slice(0, 42));
  if (Number.isFinite(rowData.sampleAgeMs)) bits.push(`${sparkPairAgeLabel(rowData.sampleAgeMs)} old`);
  return bits.join(" | ") || "live host";
}

function renderSparkPairComparisonPanel(container, comparison) {
  if (!comparison.available) {
    const empty = document.createElement("div");
    empty.className = "operator-empty";
    empty.textContent = comparison.emptyText;
    container.replaceChildren(empty);
    return;
  }

  const summary = document.createElement("div");
  summary.className = "spark-pair-summary";
  summary.append(...comparison.summaries.map(sparkPairSummaryItem));

  const clockPanel = sparkPairClockGraphPanel(comparison.clockHistory || []);

  const grid = document.createElement("div");
  grid.className = "spark-pair-grid";
  const header = document.createElement("div");
  header.className = "spark-pair-row spark-pair-row-head";
  ["Metric", comparison.leftLabel, comparison.rightLabel, "Delta"].forEach((text) => {
    const cell = document.createElement("span");
    cell.textContent = text;
    header.append(cell);
  });
  grid.append(header, ...comparison.rows.map(sparkPairMetricRow));

  container.replaceChildren(summary, clockPanel, grid);
}

function sparkPairSummaryItem(item) {
  const node = document.createElement("div");
  node.className = "spark-pair-summary-item";
  node.dataset.tone = item.tone;
  const label = document.createElement("span");
  label.textContent = item.label;
  const value = document.createElement("strong");
  value.textContent = item.value;
  const note = document.createElement("small");
  note.textContent = item.note;
  node.append(label, value, note);
  return node;
}

function sparkPairClockGraphPanel(history) {
  const panel = document.createElement("div");
  panel.className = "spark-pair-clock-panel";
  const latest = history[history.length - 1] || {};
  const offsetValues = history.flatMap((sample) => [sample.leftOffsetNs, sample.rightOffsetNs, sample.offsetDeltaNs]).filter(Number.isFinite);
  const skewValues = history.map((sample) => sample.sampleSkewMs).filter(Number.isFinite);

  const head = document.createElement("div");
  head.className = "spark-pair-clock-head";
  const title = document.createElement("strong");
  title.textContent = "Clock offset";
  const meta = document.createElement("small");
  meta.textContent = history.length
    ? `${history.length} samples | delta ${sparkPairClockOffsetLabel(latest.offsetDeltaNs)} | skew ${sparkPairAgeLabel(latest.sampleSkewMs)}`
    : "waiting for SPARK clock samples";
  head.append(title, meta);

  const body = document.createElement("div");
  body.className = "spark-pair-clock-body";
  body.append(
    sparkPairClockGraphCard({
      label: "Offset",
      history,
      series: [
        { key: "leftOffsetNs", label: "SPARK1" },
        { key: "rightOffsetNs", label: "SPARK2" },
        { key: "offsetDeltaNs", label: "Delta" }
      ],
      formatter: sparkPairClockOffsetLabel,
      values: offsetValues,
      empty: "offset unavailable"
    }),
    sparkPairClockGraphCard({
      label: "Sample skew",
      history,
      series: [
        { key: "sampleSkewMs", label: "Skew" }
      ],
      formatter: sparkPairAgeLabel,
      values: skewValues,
      empty: "skew unavailable"
    })
  );

  const legend = document.createElement("div");
  legend.className = "spark-pair-clock-legend";
  [
    ["SPARK1", "spark1"],
    ["SPARK2", "spark2"],
    ["Delta", "delta"],
    ["Skew", "skew"]
  ].forEach(([label, key]) => {
    const item = document.createElement("span");
    item.dataset.series = key;
    item.textContent = label;
    legend.append(item);
  });

  panel.append(head, body, legend);
  return panel;
}

function sparkPairClockGraphCard({ label, history, series, formatter, values, empty }) {
  const card = document.createElement("div");
  card.className = "spark-pair-clock-card";
  const head = document.createElement("div");
  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  const latestText = document.createElement("strong");
  const latest = history[history.length - 1] || {};
  const firstSeries = series[0] || {};
  latestText.textContent = Number.isFinite(latest[firstSeries.key]) ? formatter(latest[firstSeries.key]) : "--";
  head.append(labelEl, latestText);

  const graph = buildSparkPairClockGraph(history, series, values, { empty });
  const note = document.createElement("small");
  const finiteValues = values.filter(Number.isFinite);
  note.textContent = finiteValues.length
    ? `range ${formatter(Math.min(...finiteValues))} to ${formatter(Math.max(...finiteValues))}`
    : empty;

  card.append(head, graph, note);
  return card;
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

function sparkPairMetricRow(rowData) {
  const row = document.createElement("div");
  row.className = "spark-pair-row";
  row.dataset.metric = rowData.id;
  row.dataset.tone = rowData.tone;

  const label = document.createElement("div");
  label.className = "spark-pair-label";
  const title = document.createElement("strong");
  title.textContent = rowData.label;
  const note = document.createElement("small");
  note.textContent = rowData.note || "";
  label.append(title, note);

  const left = sparkPairHostCell(rowData.leftText, rowData.leftPercent, rowData.leftDetail);
  const right = sparkPairHostCell(rowData.rightText, rowData.rightPercent, rowData.rightDetail);
  const delta = document.createElement("div");
  delta.className = "spark-pair-delta";
  delta.title = rowData.deltaTitle || "";
  const deltaValue = document.createElement("strong");
  deltaValue.textContent = rowData.deltaLabel;
  const deltaNote = document.createElement("small");
  deltaNote.textContent = rowData.deltaTitle || "Delta";
  delta.append(deltaValue, deltaNote);

  row.append(label, left, right, delta);
  return row;
}

function sparkPairHostCell(value, percent, detail) {
  const cell = document.createElement("div");
  cell.className = "spark-pair-host-cell";
  const strong = document.createElement("strong");
  strong.textContent = value;
  cell.append(strong);

  if (Number.isFinite(percent)) {
    const bar = document.createElement("span");
    bar.className = "spark-pair-bar";
    const fill = document.createElement("i");
    fill.style.width = `${clamp(percent)}%`;
    bar.append(fill);
    cell.append(bar);
  }

  if (detail) {
    const small = document.createElement("small");
    small.textContent = detail;
    cell.append(small);
  }

  return cell;
}

function buildOperatorCommands({ summary, machineContext, grafana, kafka }) {
  const hostUrl = machineContext?.context?.hostUrl || "http://192.168.10.20:8000";
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
      detail: "Open SPARK1 machine demo",
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

function renderOperatorLaunchpad(launchpad, commands) {
  const signature = operatorLaunchpadCommandSignature(commands);
  if (operatorLaunchpadSignature === signature && launchpad.children.length === commands.length) {
    return;
  }

  operatorLaunchpadSignature = signature;
  launchpad.replaceChildren(...commands.map(operatorCommandButton));
}

function operatorLaunchpadCommandSignature(commands) {
  return JSON.stringify(commands.map((command) => ({
    label: command.label,
    detail: command.detail,
    command: command.command || "",
    url: command.url || "",
    action: Boolean(command.action)
  })));
}

function operatorHeartbeatCard(source) {
  const item = document.createElement("div");
  item.className = "source-heartbeat-card";
  item.dataset.tone = source.tone;

  const heart = document.createElement("span");
  heart.className = "source-heartbeat-heart";
  heart.setAttribute("aria-hidden", "true");
  heart.textContent = "♥";

  const copy = document.createElement("div");
  const label = document.createElement("strong");
  label.textContent = source.label;
  const note = document.createElement("small");
  note.textContent = source.note;
  copy.append(label, note);

  const status = document.createElement("span");
  status.className = "source-heartbeat-status";
  status.textContent = source.status;

  item.append(heart, copy, status);
  return item;
}

function operatorTimelineItem(event) {
  const item = document.createElement("article");
  item.className = "event-timeline-item";
  item.dataset.tone = event.tone;

  const marker = document.createElement("span");
  marker.className = "event-timeline-marker";
  marker.textContent = operatorTimelineIcon(event.source);
  const body = document.createElement("div");
  const label = document.createElement("strong");
  label.textContent = event.label;
  const note = document.createElement("small");
  note.textContent = event.note || event.source;
  const time = document.createElement("time");
  time.textContent = event.time ? event.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "now";
  if (event.time) time.dateTime = event.time.toISOString();
  body.append(label, note);

  item.append(marker, body, time);
  return item;
}

function operatorTimelineIcon(source) {
  return {
    host: "H",
    kubernetes: "K8s",
    scheduler: "Q",
    prometheus: "P",
    dcgm: "GPU",
    kafka: "K",
    grafana: "G",
    gb10: "G10",
    analyzer: "A",
    opportunity: "$",
    simulator: "S",
    confidence: "%"
  }[source] || "•";
}

function operatorCommandButton(command) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "demo-command-button";
  const label = document.createElement("strong");
  label.textContent = command.label;
  const detail = document.createElement("small");
  detail.textContent = command.detail;
  button.append(label, detail);
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.dataset.state = "working";
    try {
      if (command.action) {
        command.action();
        setLaunchpadButtonFeedback(button, detail, "Started");
        return;
      }
      if (command.url) {
        const opened = window.open(command.url, "_blank");
        if (opened) {
          opened.opener = null;
          setIngestStatus(`${command.label} opened`, "good");
          setLaunchpadButtonFeedback(button, detail, "Opened");
          return;
        }
        const copied = await copyTextToClipboard(command.url);
        setIngestStatus(copied ? `${command.label} link copied` : `${command.label} link ready to copy`, copied ? "good" : "watch");
        setLaunchpadButtonFeedback(button, detail, copied ? "Link copied" : "Link ready");
        if (!copied) showManualCopyPrompt(command.label, command.url);
        return;
      }
      const copied = await copyTextToClipboard(command.command);
      setIngestStatus(copied ? `${command.label} command copied` : `${command.label} command ready to copy`, copied ? "good" : "watch");
      setLaunchpadButtonFeedback(button, detail, copied ? "Command copied" : "Command ready");
      if (!copied) showManualCopyPrompt(command.label, command.command);
    } catch (error) {
      setIngestStatus(`${command.label} failed`, "poor");
      setLaunchpadButtonFeedback(button, detail, "Try again");
    } finally {
      window.setTimeout(() => {
        button.disabled = false;
        button.dataset.state = "";
        detail.textContent = command.detail;
      }, 1400);
    }
  });
  return button;
}

function setLaunchpadButtonFeedback(button, detail, message) {
  button.dataset.state = "done";
  detail.textContent = message;
}

function showManualCopyPrompt(label, text) {
  if (!text || typeof window.prompt !== "function") return;
  window.prompt(`${label}: copy this`, text);
}

function operatorKafkaNodes(kafka) {
  const nodes = [];
  const summary = document.createElement("div");
  summary.className = "kafka-stream-summary";
  summary.dataset.tone = kafka.reachable ? "good" : "poor";
  summary.append(
    operatorMetricPill(kafka.reachable ? "reachable" : "missing", "Broker"),
    operatorMetricPill(kafka.processedMessages ? `${kafka.processedMessages}` : "n/a", "Messages"),
    operatorMetricPill(kafka.status, "Smoke")
  );
  nodes.push(summary);

  const details = document.createElement("dl");
  details.className = "operator-detail-list";
  [
    ["Cluster bootstrap", kafka.bootstrapServers],
    ["NodePort", kafka.nodePortBootstrap],
    ["Topic", kafka.topic || "No smoke topic observed"],
    ["Message ID", kafka.messageId || "No consumed payload observed"],
    ["Timestamp", kafka.timestamp || "n/a"]
  ].forEach(([term, value]) => {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = value;
    details.append(dt, dd);
  });
  nodes.push(details);

  const pre = document.createElement("pre");
  pre.className = "kafka-payload";
  pre.textContent = Object.keys(kafka.payload || {}).length ? JSON.stringify(kafka.payload, null, 2) : "No Kafka payload captured yet. Run the Kafka smoke check to attach the latest proof.";
  nodes.push(pre);
  return nodes;
}

function operatorConfidenceNodes(confidence) {
  const meter = document.createElement("div");
  meter.className = "confidence-meter";
  meter.dataset.tone = confidence.score >= 80 ? "good" : confidence.score >= 55 ? "watch" : "poor";
  const value = document.createElement("strong");
  value.textContent = pct(confidence.score);
  const track = document.createElement("span");
  const fill = document.createElement("i");
  fill.style.width = `${clamp(confidence.score)}%`;
  track.append(fill);
  meter.append(value, track);

  const list = document.createElement("ul");
  list.className = "confidence-list";
  [
    `${confidence.sourceCount}/${confidence.totalSources} sources present`,
    `Source freshness score ${pct(confidence.sourceScore)}`,
    `Workload evidence score ${pct(confidence.workloadScore)}`,
    confidence.missing.length ? `Missing: ${confidence.missing.join(", ")}` : "No critical source is fully missing",
    confidence.stale.length ? `Stale: ${confidence.stale.join(", ")}` : "No critical source is stale"
  ].forEach((text) => {
    const item = document.createElement("li");
    item.textContent = text;
    list.append(item);
  });

  return [meter, list];
}

function operatorReplayNodes(cockpit) {
  const status = document.createElement("p");
  status.textContent = state.operatorReplay
    ? `Replaying the latest ${liveTelemetryHistory.length} live telemetry samples.`
    : `Ready to replay ${liveTelemetryHistory.length} captured live telemetry samples.`;

  const controls = document.createElement("div");
  controls.className = "replay-controls";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.textContent = state.operatorReplay ? "Stop Replay" : "Replay Latest";
  toggle.disabled = liveTelemetryHistory.length < 2;
  toggle.addEventListener("click", () => {
    state.operatorReplay = !state.operatorReplay;
    state.operatorReplayStartedAt = state.operatorReplay ? new Date() : null;
    render();
  });
  const capture = document.createElement("button");
  capture.type = "button";
  capture.textContent = "Export Evidence v2";
  capture.addEventListener("click", exportEvidencePack);
  controls.append(toggle, capture);

  const note = document.createElement("small");
  note.textContent = cockpit.generatedAt
    ? `Latest live sample ${formatHostSampleAgeMilliseconds(cockpit.ageMilliseconds)} old. Replay is browser-local and uses the current session history.`
    : "Replay will activate once live samples are collected.";
  return [status, controls, note];
}

function operatorGrafanaNodes(grafana) {
  if (!grafana.links.length) {
    const empty = document.createElement("p");
    empty.className = "operator-empty";
    empty.textContent = "No Grafana dashboard or Explore link is attached to this selection yet.";
    return [empty];
  }

  const details = document.createElement("dl");
  details.className = "operator-detail-list";
  [
    ["Dashboard", grafana.dashboards[0] || "n/a"],
    ["Datasource", grafana.datasources[0] || "n/a"],
    ["Instance", grafana.instances[0] || "n/a"],
    ["Range", grafanaTimeRangeLabel(grafana.timeRange)]
  ].forEach(([term, value]) => {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = value;
    details.append(dt, dd);
  });

  const links = document.createElement("div");
  links.className = "grafana-mini-links";
  grafana.links.slice(0, 3).forEach((link) => {
    const anchor = document.createElement("a");
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = link.label || titleCase(link.type || "Grafana link");
    links.append(anchor);
  });

  return [details, links];
}

function operatorFleetTile(tile) {
  const item = document.createElement(tile.key ? "button" : "article");
  item.className = "fleet-tile";
  item.dataset.tone = tile.tone;
  if (tile.key) {
    item.type = "button";
    item.setAttribute("aria-selected", String(tile.selected));
    item.setAttribute("aria-label", `Show ${tile.host} telemetry`);
    item.addEventListener("click", () => {
      state.scope = "job";
      state.selectedKey = tile.key;
      render();
    });
  }
  const title = document.createElement("strong");
  title.textContent = tile.host;
  const gpu = document.createElement("span");
  gpu.textContent = tile.gpu;
  const status = document.createElement("small");
  status.textContent = `${tile.status}${tile.age === null ? "" : ` | ${tile.age}s old`}`;
  const services = document.createElement("small");
  services.textContent = tile.services.length ? tile.services.join(", ") : "No local services";
  item.append(title, gpu, status, services);
  return item;
}

function operatorMetricPill(value, label) {
  const pill = document.createElement("span");
  const strong = document.createElement("strong");
  const small = document.createElement("small");
  strong.textContent = value;
  small.textContent = label;
  pill.append(strong, small);
  return pill;
}

function latestDate(values) {
  const dates = values
    .map((value) => value ? safeDate(value, null) : null)
    .filter((value) => value instanceof Date && !Number.isNaN(value.getTime()));
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
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

function recordLiveTelemetrySample(machineContext, generatedAt) {
  const context = machineContext.context || {};
  const timestampMs = generatedAt instanceof Date && !Number.isNaN(generatedAt.getTime())
    ? generatedAt.getTime()
    : Date.now();
  const host = machineContext.host || "host";
  const last = liveTelemetryHistory[liveTelemetryHistory.length - 1];
  if (last && last.host !== host) {
    liveTelemetryHistory = [];
  }
  if (last && last.host === host && last.timestampMs === timestampMs) {
    return liveTelemetryHistory;
  }

  liveTelemetryHistory.push({
    host,
    timestampMs,
    label: new Date(timestampMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    cpu: clamp(machineContext.cpuUsagePct),
    ram: clamp(machineContext.memoryUsedPct),
    disk: clamp(machineContext.diskUsedPct),
    dockerCpu: clamp(machineContext.dockerContainers.reduce((total, container) => total + numeric(container.cpuPct), 0)),
    gpu: machineContext.gpuPresent ? clamp(machineContext.gpuUtilizationPct) : null,
    gpuMemory: machineContext.gpuPresent ? clamp(machineContext.gpuMemoryUsedPct) : null,
    gpuPower: machineContext.gpuPresent && machineContext.gpuPowerWatts > 0 ? numeric(machineContext.gpuPowerWatts) : null,
    gpuTemperature: machineContext.gpuPresent && machineContext.gpuTemperatureC > 0 ? numeric(machineContext.gpuTemperatureC) : null,
    memoryUsedBytes: Math.max(0, numeric(context.memoryTotalBytes) - numeric(context.memoryAvailableBytes)),
    networkUtilization: Number.isFinite(machineContext.networkUtilizationPct) ? clamp(machineContext.networkUtilizationPct) : null,
    networkThroughputBps: Number.isFinite(machineContext.networkThroughputBps) ? Math.max(0, machineContext.networkThroughputBps) : null
  });

  if (liveTelemetryHistory.length > LIVE_TELEMETRY_LIMIT) {
    liveTelemetryHistory = liveTelemetryHistory.slice(-LIVE_TELEMETRY_LIMIT);
  }

  return liveTelemetryHistory;
}

function analyzeLiveTelemetryRelationships(history, machineContext) {
  const window = history.slice(-LIVE_TELEMETRY_RELATIONSHIP_WINDOW);
  const sampleCount = window.length;
  const first = window[0];
  const latest = window[sampleCount - 1] || {};
  const windowSeconds = first && latest.timestampMs
    ? Math.max(0, Math.round((latest.timestampMs - first.timestampMs) / 1000))
    : 0;
  const trends = {
    cpu: telemetryTrend(window, "cpu"),
    ram: telemetryTrend(window, "ram"),
    disk: telemetryTrend(window, "disk"),
    networkUtilization: telemetryTrend(window, "networkUtilization"),
    networkThroughputBps: telemetryTrend(window, "networkThroughputBps"),
    gpu: telemetryTrend(window, "gpu"),
    gpuPower: telemetryTrend(window, "gpuPower"),
    gpuMemory: telemetryTrend(window, "gpuMemory"),
    gpuTemperature: telemetryTrend(window, "gpuTemperature")
  };
  const networkRelationshipKey = telemetryRelationshipKey(window, ["networkUtilization", "networkThroughputBps"]);
  const relationships = [
    telemetryRelationship("Network/GPU", telemetryCorrelation(window, networkRelationshipKey, "gpu"), networkRelationshipKey === "networkUtilization" ? "Link utilization vs accelerator work" : "Network throughput vs accelerator work"),
    telemetryRelationship("Network/CPU", telemetryCorrelation(window, networkRelationshipKey, "cpu"), networkRelationshipKey === "networkUtilization" ? "Link utilization vs host activity" : "Network throughput vs host activity"),
    telemetryRelationship("CPU/GPU", telemetryCorrelation(window, "cpu", "gpu"), "Host pressure vs accelerator work"),
    telemetryRelationship("Power/GPU", telemetryCorrelation(window, "gpuPower", "gpu"), "Power draw vs useful accelerator motion"),
    telemetryRelationship("RAM/CPU", telemetryCorrelation(window, "ram", "cpu"), "Memory pressure vs host activity")
  ];
  const covarianceMatrix = buildLiveCovarianceMatrix(window);
  const alerts = [];

  if (Number.isFinite(machineContext.hardwareFaultScore) && machineContext.hardwareFaultScore >= 18) {
    const topFault = machineContext.hardwareFaults[0];
    alerts.push(liveTelemetryAlert({
      severity: machineContext.hardwareFaultScore >= 80 || machineContext.hardwareCriticalFaultCount > 0 ? "critical" : machineContext.hardwareFaultScore >= 45 ? "high" : "medium",
      title: "Hardware health needs attention",
      evidence: topFault?.detail || `Hardware fault score is ${round(machineContext.hardwareFaultScore)} with ${round(numeric(machineContext.hardwareFaultCount))} observed fault signals.`,
      recommendation: machineContext.hardwareRepairRequiresApproval
        ? `${machineContext.hardwareRepairAction || "Inspect host"} requires operator approval.`
        : machineContext.hardwareRepairAction || "Inspect host and keep remediation in dry-run until confirmed.",
      confidence: Number.isFinite(machineContext.hardwareRepairConfidence) ? machineContext.hardwareRepairConfidence : 0.72
    }));
  }

  if (sampleCount < 6) {
    return {
      contextKey: liveObservationContextKey(null, machineContext, window),
      sampleCount,
      windowSeconds,
      alerts,
      relationships,
      covarianceMatrix,
      status: "Learning baseline"
    };
  }

  const avgGpu = telemetryAverage(window, "gpu");
  const avgCpu = telemetryAverage(window, "cpu");
  const avgDockerCpu = telemetryAverage(window, "dockerCpu");
  const avgNetworkThroughput = telemetryAverage(window, "networkThroughputBps");
  const hostWorkObserved = (avgCpu !== null && avgCpu >= 15)
    || (avgDockerCpu !== null && avgDockerCpu >= 8)
    || (avgNetworkThroughput !== null && avgNetworkThroughput >= 1024 * 1024);
  const latestGpu = numeric(latest.gpu, 0);
  const latestCpu = numeric(latest.cpu, 0);
  const latestRam = numeric(latest.ram, 0);
  const latestDisk = numeric(latest.disk, 0);
  const latestNetworkUtilization = telemetryValue(latest, "networkUtilization");
  const latestPower = numeric(latest.gpuPower, 0);
  const latestTemp = numeric(latest.gpuTemperature, 0);
  const cpuGpuCorrelation = telemetryCorrelation(window, "cpu", "gpu");
  const powerGpuCorrelation = telemetryCorrelation(window, "gpuPower", "gpu");

  if (machineContext.gpuPresent && hostWorkObserved && avgGpu !== null && avgGpu <= 5 && sampleCount >= 10) {
    alerts.push(liveTelemetryAlert({
      severity: avgCpu !== null && avgCpu > 35 ? "high" : "medium",
      title: "Accelerator is trending idle",
      evidence: `GPU averaged ${pct(avgGpu)} across ${sampleCount} samples while the host stayed at ${pct(avgCpu || 0)} CPU.`,
      recommendation: "Start a controlled workload or attach scheduler/request counters before treating this as workload saturation.",
      confidence: sampleCount >= 30 ? 0.86 : 0.72
    }));
  }

  if (trends.cpu.slopePerMinute > 8 && latestCpu > 20 && machineContext.gpuPresent && (trends.gpu.slopePerMinute < 1 || latestGpu < 20)) {
    alerts.push(liveTelemetryAlert({
      severity: latestCpu > 65 ? "high" : "medium",
      title: "CPU rising while GPU is flat",
      evidence: `CPU is moving ${signedRate(trends.cpu.slopePerMinute, "pts/min")} while GPU is moving ${signedRate(trends.gpu.slopePerMinute, "pts/min")}.`,
      recommendation: "Check preprocessing, request fan-in, tokenization, data loading, or host-side queues before adding GPUs.",
      confidence: Math.min(0.92, 0.64 + Math.abs(trends.cpu.slopePerMinute) / 100)
    }));
  }

  if (latestRam >= 85 || (trends.ram.slopePerMinute > 3 && latestRam >= 55)) {
    alerts.push(liveTelemetryAlert({
      severity: latestRam >= 90 ? "critical" : "high",
      title: "Memory pressure is drifting up",
      evidence: `RAM is at ${pct(latestRam)} with a short-window trend of ${signedRate(trends.ram.slopePerMinute, "pts/min")}.`,
      recommendation: "Inspect resident model processes, cache growth, and batch/concurrency settings before the host starts swapping.",
      confidence: latestRam >= 85 ? 0.9 : 0.74
    }));
  }

  if (latestDisk >= 85 || trends.disk.slopePerMinute > 0.5) {
    alerts.push(liveTelemetryAlert({
      severity: latestDisk >= 92 ? "critical" : "medium",
      title: "Disk usage trend needs attention",
      evidence: `Root filesystem is at ${pct(latestDisk)} and moving ${signedRate(trends.disk.slopePerMinute, "pts/min")}.`,
      recommendation: "Check logs, model cache growth, checkpoints, and local dataset staging before writes fail.",
      confidence: latestDisk >= 85 ? 0.88 : 0.68
    }));
  }

  if (latestTemp >= 78 || (trends.gpuTemperature.slopePerMinute > 2 && latestTemp >= 60)) {
    alerts.push(liveTelemetryAlert({
      severity: latestTemp >= 86 ? "critical" : "high",
      title: "GPU thermal trend is worsening",
      evidence: `GPU temperature is ${round(latestTemp)} C and moving ${signedRate(trends.gpuTemperature.slopePerMinute, "C/min")}.`,
      recommendation: "Check fan curve, power limits, enclosure airflow, and co-located heat sources before performance throttles.",
      confidence: latestTemp >= 78 ? 0.9 : 0.76
    }));
  }

  if (
    machineContext.gpuPresent
    && latestPower > 0
    && powerGpuCorrelation !== null
    && powerGpuCorrelation < -0.25
    && trends.gpuPower.slopePerMinute > 1
    && trends.gpu.slopePerMinute < 0
  ) {
    alerts.push(liveTelemetryAlert({
      severity: "high",
      title: "Power and utilization are diverging",
      evidence: `Power/GPU correlation is ${formatCorrelation(powerGpuCorrelation)}; power is rising while utilization is falling.`,
      recommendation: "Inspect thermal limits, background GPU contexts, clock behavior, and workload stalls.",
      confidence: 0.8
    }));
  }

  if (
    machineContext.gpuPresent
    && Number.isFinite(latestNetworkUtilization)
    && latestNetworkUtilization >= 70
    && (trends.gpu.slopePerMinute < 1 || latestGpu < 20)
  ) {
    alerts.push(liveTelemetryAlert({
      severity: latestNetworkUtilization >= 88 ? "high" : "medium",
      title: "Network utilization is high while GPU is flat",
      evidence: `Network utilization is ${pct(latestNetworkUtilization)} while GPU is moving ${signedRate(trends.gpu.slopePerMinute, "pts/min")}.`,
      recommendation: "Inspect data ingress, model shard traffic, all-reduce placement, and host NIC saturation before adding accelerator capacity.",
      confidence: 0.78
    }));
  }

  if (
    machineContext.gpuPresent
    && Number.isFinite(latestNetworkUtilization)
    && trends.networkUtilization.slopePerMinute > 8
    && trends.gpu.slopePerMinute < 1
  ) {
    alerts.push(liveTelemetryAlert({
      severity: latestNetworkUtilization >= 60 ? "high" : "medium",
      title: "Network pressure is rising ahead of GPU work",
      evidence: `Network utilization is moving ${signedRate(trends.networkUtilization.slopePerMinute, "pts/min")} while GPU is moving ${signedRate(trends.gpu.slopePerMinute, "pts/min")}.`,
      recommendation: "Check input streaming, collective fan-out, and cross-node placement while the window is still short.",
      confidence: 0.74
    }));
  }

  if (
    machineContext.gpuPresent
    && cpuGpuCorrelation !== null
    && cpuGpuCorrelation < -0.35
    && trends.cpu.slopePerMinute > 2
    && trends.gpu.slopePerMinute < -1
  ) {
    alerts.push(liveTelemetryAlert({
      severity: "medium",
      title: "Host and accelerator are moving against each other",
      evidence: `CPU/GPU correlation is ${formatCorrelation(cpuGpuCorrelation)} over the latest ${sampleCount} samples.`,
      recommendation: "Look for CPU-side blocking, synchronous request queues, dataloader stalls, or single-threaded orchestration.",
      confidence: 0.76
    }));
  }

  if (machineContext.gpuSampleCached && machineContext.gpuSampleAgeMs > 5000) {
    alerts.push(liveTelemetryAlert({
      severity: "medium",
      title: "GPU counter is lagging behind host telemetry",
      evidence: `The latest GPU sample is ${formatDecimal(machineContext.gpuSampleAgeMs / 1000, 1)}s older than the current host sample.`,
      recommendation: "Keep host alerts active, but treat GPU/power relationships as delayed until nvidia-smi catches up.",
      confidence: 0.84
    }));
  }

  const severityRank = { critical: 4, high: 3, medium: 2, low: 1 };
  alerts.sort((left, right) => severityRank[right.severity] - severityRank[left.severity] || right.confidence - left.confidence);

  return {
    contextKey: liveObservationContextKey(null, machineContext, window),
    sampleCount,
    windowSeconds,
    alerts: alerts.slice(0, LIVE_TELEMETRY_ALERT_LIMIT),
    relationships,
    covarianceMatrix,
    status: alerts.length ? `${alerts.length} active` : "Stable"
  };
}

function analyzeAnalysisResourceRelationships(summary) {
  const network = numeric(summary.networkUtilization);
  const gpu = numeric(summary.gpuUtil);
  const cpuPrep = numeric(summary.cpuPrep);
  const networkWait = numeric(summary.networkWait);
  const nccl = numeric(summary.ncclTime);
  const placement = numeric(summary.placementQuality);
  const crossPod = numeric(summary.crossPodTraffic);
  const alerts = [];
  const relationships = [
    analysisRelationship(
      "Network/GPU",
      `${pct(network)} / ${pct(gpu)}`,
      networkGpuSnapshotNote(summary),
      network >= 70 && gpu < 45 ? "poor" : network >= 70 || gpu < 35 ? "watch" : "good"
    ),
    analysisRelationship(
      "Network/CPU",
      `${pct(network)} / ${pct(cpuPrep)}`,
      networkCpuSnapshotNote(summary),
      network >= 70 && cpuPrep >= 20 ? "poor" : network >= 70 || cpuPrep >= 20 ? "watch" : "good"
    ),
    analysisRelationship(
      "Network wait/GPU",
      `${pct(networkWait)} / ${pct(gpu)}`,
      "Network wait tracks stall/latency pressure against accelerator utilization",
      networkWait >= 18 && gpu < 55 ? "poor" : networkWait >= 10 ? "watch" : "good"
    ),
    analysisRelationship(
      "Placement/Network",
      `${pct(placement)} / ${pct(crossPod)}`,
      "Placement fit compared with cross-pod traffic pressure",
      placement < 60 && crossPod >= 30 ? "poor" : crossPod >= 20 || placement < 75 ? "watch" : "good"
    )
  ];

  if (network >= 70 && gpu < 45) {
    alerts.push(liveTelemetryAlert({
      severity: network >= 88 ? "high" : "medium",
      title: "Network utilization may be limiting GPU work",
      evidence: `Network utilization is ${pct(network)} while GPU utilization is ${pct(gpu)} in this run snapshot.`,
      recommendation: "Check input streaming, collective traffic, placement, and NIC capacity before adding accelerator capacity.",
      confidence: 0.74
    }));
  }

  if (network >= 70 && cpuPrep >= 20) {
    alerts.push(liveTelemetryAlert({
      severity: network >= 88 || cpuPrep >= 35 ? "high" : "medium",
      title: "Network and CPU prep are both elevated",
      evidence: `Network utilization is ${pct(network)} and CPU prep is ${pct(cpuPrep)} in the interpreted metrics.`,
      recommendation: "Inspect host data loading, tokenization, serialization, and ingress fan-in for CPU-side network pressure.",
      confidence: 0.7
    }));
  }

  if (network >= 60 && networkWait >= 10) {
    alerts.push(liveTelemetryAlert({
      severity: networkWait >= 20 ? "high" : "medium",
      title: "Throughput pressure and network wait coexist",
      evidence: `Network utilization is ${pct(network)} while network wait is ${pct(networkWait)} and NCCL time is ${pct(nccl)}.`,
      recommendation: "Separate capacity saturation from latency/loss stalls by checking interface errors, drops, and collective topology.",
      confidence: 0.76
    }));
  }

  return {
    contextKey: `snapshot:${summary.scope}:${summary.key}`,
    sampleCount: 1,
    windowSeconds: 0,
    badgeText: "Analysis snapshot",
    covarianceBadgeText: "Waiting for live counters",
    covarianceFootText: "Live host CPU, GPU, RAM, and network samples are required for covariance; current view is a static run snapshot.",
    emptyAlertText: "No adverse snapshot relationship detected in the selected run.",
    alerts: alerts.slice(0, LIVE_TELEMETRY_ALERT_LIMIT),
    relationships,
    covarianceMatrix: buildLiveCovarianceMatrix([]),
    observations: analysisResourceObservations(summary, alerts),
    history: analysisResourceHistory(summary),
    status: alerts.length ? `${alerts.length} snapshot ${alerts.length === 1 ? "signal" : "signals"}` : "Snapshot stable"
  };
}

function analysisRelationship(label, value, note, tone = "watch") {
  return { label, value, note, tone };
}

function networkGpuSnapshotNote(summary) {
  const network = numeric(summary.networkUtilization);
  const gpu = numeric(summary.gpuUtil);
  if (network >= 70 && gpu < 45) return "High link pressure with low GPU use points to data-motion bottlenecks";
  if (network >= 70) return "Link utilization is material; compare against network wait and NCCL";
  if (gpu >= 70 && network <= 40) return "GPU is busy without heavy link pressure";
  return "Snapshot comparison of link pressure against accelerator work";
}

function networkCpuSnapshotNote(summary) {
  const network = numeric(summary.networkUtilization);
  const cpuPrep = numeric(summary.cpuPrep);
  if (network >= 70 && cpuPrep >= 20) return "CPU prep is the host-side proxy for Network/CPU in this snapshot";
  if (network >= 70) return "Network pressure is elevated; CPU prep is not elevated in this run";
  if (cpuPrep >= 20) return "CPU prep is elevated without matching link utilization";
  return "Uses CPU prep as the host-side CPU proxy until live CPU counters arrive";
}

function analysisResourceObservations(summary, alerts) {
  const alertRows = alerts.map((alert) => ({
    tone: alert.severity === "critical" || alert.severity === "high" ? "poor" : alert.severity === "medium" ? "watch" : "good",
    label: titleCase(alert.severity),
    title: alert.title,
    detail: alert.evidence
  }));
  const network = numeric(summary.networkUtilization);
  const gpu = numeric(summary.gpuUtil);
  const cpuPrep = numeric(summary.cpuPrep);
  const rows = [
    {
      tone: inverseGrade(network, 70, 88).key,
      label: "Snapshot",
      title: "Network utilization",
      detail: `${pct(network)} link utilization | ${pct(summary.networkWait)} network wait | ${pct(summary.ncclTime)} NCCL`
    },
    {
      tone: network >= 70 && gpu < 45 ? "poor" : network >= 70 || gpu < 35 ? "watch" : "good",
      label: "Relationship",
      title: "Network/GPU",
      detail: `${pct(network)} network utilization compared with ${pct(gpu)} GPU utilization. ${networkGpuSnapshotNote(summary)}.`
    },
    {
      tone: network >= 70 && cpuPrep >= 20 ? "poor" : network >= 70 || cpuPrep >= 20 ? "watch" : "good",
      label: "Relationship",
      title: "Network/CPU",
      detail: `${pct(network)} network utilization compared with ${pct(cpuPrep)} CPU prep. ${networkCpuSnapshotNote(summary)}.`
    },
    {
      tone: inverseGrade(summary.networkWait, 10, 20).key,
      label: "Snapshot",
      title: "Network wait",
      detail: `${pct(summary.networkWait)} stall/latency pressure, kept separate from ${pct(network)} utilization.`
    }
  ];

  return [...alertRows, ...rows].slice(0, LIVE_OBSERVATION_LIMIT);
}

function analysisResourceHistory(summary) {
  return [{
    host: summary.label,
    timestampMs: Date.now(),
    label: "Snapshot",
    networkUtilization: clamp(summary.networkUtilization),
    gpu: clamp(summary.gpuUtil),
    cpuPrep: clamp(summary.cpuPrep),
    networkWait: clamp(summary.networkWait),
    ncclTime: clamp(summary.ncclTime),
    placementQuality: clamp(summary.placementQuality)
  }];
}

function renderLiveTelemetryAlerts(container, analysis) {
  const platformMatrix = platformVirtualSensorCache.baseUrl === platformApiBaseUrl()
    ? platformVirtualSensorCache.matrix
    : null;
  const effectiveAnalysis = platformMatrix
    ? {
        ...analysis,
        covarianceMatrix: platformMatrix,
        covarianceBadgeText: "API virtual sensors",
        covarianceFootText: "Covariance and principal mode loaded from the platform API virtual sensor tables."
      }
    : analysis;
  const wrapper = document.createElement("section");
  wrapper.className = "live-relationship-panel";

  const head = document.createElement("div");
  head.className = "live-relationship-head";
  const label = document.createElement("p");
  label.textContent = "Relationship Watch";
  const title = document.createElement("h3");
  title.textContent = effectiveAnalysis.status;
  const badge = document.createElement("span");
  badge.textContent = effectiveAnalysis.badgeText || (effectiveAnalysis.sampleCount
    ? `${effectiveAnalysis.sampleCount} samples | ${effectiveAnalysis.windowSeconds}s`
    : "No samples");
  head.append(label, title, badge);

  const relationshipGrid = document.createElement("div");
  relationshipGrid.className = "live-relationship-grid";
  effectiveAnalysis.relationships.forEach((relationship) => {
    relationshipGrid.append(liveRelationshipCard(relationship));
  });

  const covariancePanel = effectiveAnalysis.covarianceMatrix
    ? liveCovarianceMatrixPanel(effectiveAnalysis.covarianceMatrix, effectiveAnalysis)
    : null;

  const alertList = document.createElement("div");
  alertList.className = "live-alert-list";
  if (!effectiveAnalysis.alerts.length) {
    const empty = document.createElement("div");
    empty.className = "live-alert-empty";
    empty.textContent = effectiveAnalysis.emptyAlertText || (effectiveAnalysis.sampleCount < 6
      ? "Learning enough signal history to score adverse trends."
      : "No adverse relationship trend detected in the current window.");
    alertList.append(empty);
  } else {
    effectiveAnalysis.alerts.forEach((alert) => {
      alertList.append(liveAlertCard(alert));
    });
  }

  wrapper.append(head);
  if (covariancePanel) wrapper.append(covariancePanel);
  wrapper.append(relationshipGrid, alertList);
  container.replaceChildren(wrapper);
  refreshPlatformVirtualSensors(container, analysis);
}

async function refreshPlatformVirtualSensors(container, analysis) {
  const baseUrl = platformApiBaseUrl();
  if (!baseUrl || platformVirtualSensorCache.inFlight) return;
  if (platformVirtualSensorCache.baseUrl === baseUrl && Date.now() - platformVirtualSensorCache.fetchedAt < 5000) return;
  platformVirtualSensorCache.inFlight = true;
  try {
    const [covariance, principalMode, systemIdentification] = await Promise.all([
      platformApiFetch("/v1/virtual-sensors/covariance").then((response) => response.ok ? response.json() : null),
      platformApiFetch("/v1/virtual-sensors/principal-resource-mode").then((response) => response.ok ? response.json() : null),
      platformApiFetch("/v1/virtual-sensors/system-identification").then((response) => response.ok ? response.json() : null)
    ]);
    const matrix = platformCovarianceMatrix(covariance, principalMode);
    const characterization = platformSystemIdentification(systemIdentification);
    if (matrix || characterization) {
      platformVirtualSensorCache = {
        baseUrl,
        fetchedAt: Date.now(),
        inFlight: false,
        matrix: matrix || platformVirtualSensorCache.matrix,
        systemIdentification: characterization || platformVirtualSensorCache.systemIdentification
      };
      refreshSystemCharacterizationPanelFromCache();
      if (matrix) renderLiveTelemetryAlerts(container, analysis);
      return;
    }
  } catch {
    // Keep local live telemetry fallback when the platform API is unavailable.
  }
  platformVirtualSensorCache = {
    ...platformVirtualSensorCache,
    baseUrl,
    fetchedAt: Date.now(),
    inFlight: false
  };
  refreshSystemCharacterizationPanelFromCache();
}

function platformCovarianceMatrix(covariance, principalMode) {
  if (!covariance || !Array.isArray(covariance.metrics) || !Array.isArray(covariance.rows)) return null;
  const metricByApiKey = new Map([
    ["cpu", LIVE_COVARIANCE_METRICS[0]],
    ["gpu", LIVE_COVARIANCE_METRICS[1]],
    ["ram", LIVE_COVARIANCE_METRICS[2]],
    ["network", LIVE_COVARIANCE_METRICS[3]]
  ]);
  const rows = covariance.rows
    .map((row) => {
      const metric = metricByApiKey.get(row.metric);
      if (!metric || !Array.isArray(row.cells)) return null;
      return {
        metric,
        cells: row.cells.map((cell) => {
          const rightMetric = metricByApiKey.get(cell.rightMetric || cell.right_metric);
          return {
            rowKey: metric.key,
            columnKey: rightMetric?.key || "",
            rowLabel: metric.label,
            columnLabel: rightMetric?.label || "",
            stats: {
              sampleCount: numeric(cell.sampleCount ?? cell.sample_count, 0),
              covariance: numeric(cell.covariance, null),
              correlation: numeric(cell.correlation, null)
            },
            trend: []
          };
        })
      };
    })
    .filter(Boolean);
  if (!rows.length) return null;
  return {
    metrics: LIVE_COVARIANCE_METRICS,
    rows,
    principalMode: platformPrincipalMode(principalMode)
  };
}

function platformPrincipalMode(mode) {
  if (!mode || mode.status !== "ready") {
    return {
      status: "learning",
      title: "Learning resource mode",
      badge: "API virtual sensors",
      explainedPct: null,
      note: "Waiting for platform virtual sensor tables to produce a principal resource mode.",
      loadings: LIVE_COVARIANCE_METRICS.map((metric) => ({ ...metric, value: null, trend: [] })),
      eigenvalues: []
    };
  }
  const keyMap = new Map([
    ["cpu", LIVE_COVARIANCE_METRICS[0]],
    ["gpu", LIVE_COVARIANCE_METRICS[1]],
    ["ram", LIVE_COVARIANCE_METRICS[2]],
    ["network", LIVE_COVARIANCE_METRICS[3]]
  ]);
  const loadingByKey = new Map((mode.loadings || []).map((loading) => [loading.metric, loading.value]));
  return {
    status: "ready",
    title: mode.title || "Principal resource mode",
    badge: "API virtual sensors",
    explainedPct: numeric(mode.explainedPct, null),
    note: "Computed by the platform virtual sensor API from the Parquet/DuckDB lakehouse path.",
    loadings: LIVE_COVARIANCE_METRICS.map((metric) => {
      const apiKey = [...keyMap.entries()].find(([, mapped]) => mapped.key === metric.key)?.[0];
      return { ...metric, value: numeric(loadingByKey.get(apiKey), null), trend: [] };
    }),
    eigenvalues: (mode.eigenvalues || []).map((entry) => ({
      value: numeric(entry.value, 0),
      sharePct: numeric(entry.sharePct, 0),
      trend: []
    }))
  };
}

function platformSystemIdentification(payload) {
  if (!payload || !Array.isArray(payload.rows)) return null;
  const rows = payload.rows
    .map((row) => ({
      hostId: String(row.host_id || row.hostId || ""),
      eventTs: String(row.event_ts || row.eventTs || ""),
      timestampMs: systemIdTimestampMs(row.event_ts || row.eventTs),
      runId: String(row.run_id || row.runId || row.experiment_id || row.experimentId || ""),
      experimentId: String(row.experiment_id || row.experimentId || row.run_id || row.runId || ""),
      phaseId: String(row.phase_id || row.phaseId || ""),
      target: String(row.target || ""),
      profile: String(row.profile || ""),
      outputMetric: String(row.output_metric || row.outputMetric || ""),
      feature: String(row.feature || ""),
      value: numeric(row.value, Number.NaN)
    }))
    .filter((row) => row.hostId && row.runId && Number.isFinite(row.value));
  if (!rows.length) {
    return {
      status: "empty",
      rows: [],
      hosts: [],
      count: numeric(payload.count, 0),
      fetchedAt: Date.now()
    };
  }

  const runsByHost = new Map();
  rows.forEach((row) => {
    if (!runsByHost.has(row.hostId)) runsByHost.set(row.hostId, new Map());
    const hostRuns = runsByHost.get(row.hostId);
    if (!hostRuns.has(row.runId)) {
      hostRuns.set(row.runId, {
        hostId: row.hostId,
        runId: row.runId,
        experimentId: row.experimentId,
        eventTs: row.eventTs,
        timestampMs: row.timestampMs,
        rows: []
      });
    }
    const run = hostRuns.get(row.runId);
    run.rows.push(row);
    if (row.timestampMs >= run.timestampMs) {
      run.timestampMs = row.timestampMs;
      run.eventTs = row.eventTs;
    }
  });

  const hosts = Array.from(runsByHost.entries())
    .map(([hostId, hostRuns]) => {
      const runs = Array.from(hostRuns.values()).sort((left, right) => right.timestampMs - left.timestampMs);
      const latest = runs[0];
      return systemIdentificationHostSummary(hostId, latest, rows, runs);
    })
    .sort(systemIdentificationHostSort);

  return {
    status: "ready",
    rows,
    hosts,
    count: numeric(payload.count, rows.length),
    fetchedAt: Date.now()
  };
}

function systemIdentificationHostSummary(hostId, latest, allRows, runs) {
  const featureMap = new Map(latest.rows.map((row) => [systemIdFeatureKey(row), row.value]));
  const feature = (target, profile, outputMetric, name) => numeric(featureMap.get(`${target}:${profile}:${outputMetric}:${name}`), null);
  const profiles = unique(latest.rows.map((row) => row.profile).filter(Boolean))
    .sort((left, right) => systemIdProfileRank(left) - systemIdProfileRank(right));
  const targets = unique(latest.rows.map((row) => row.target).filter(Boolean)).sort();
  const subsystems = systemIdentificationSubsystemSummaries(hostId, latest.rows, allRows, feature);
  const cpu = subsystems.find((subsystem) => subsystem.key === "cpu") || {};
  return {
    hostId,
    runId: latest.runId,
    eventTs: latest.eventTs,
    timestampMs: latest.timestampMs,
    ageLabel: formatSystemIdRunAge(latest.timestampMs),
    runCount: runs.length,
    profiles,
    targets,
    subsystems,
    cpuStepGain: cpu.stepGain,
    cpuStepPeak: cpu.stepPeak,
    cpuStepCorrelation: cpu.stepCorrelation,
    cpuImpulseGain: cpu.impulseGain,
    cpuImpulsePeak: cpu.impulsePeak,
    cpuRampPeak: cpu.rampPeak,
    profilePeaks: cpu.profilePeaks || {},
    profileGains: cpu.profileGains || {},
    stepGainTrend: cpu.stepGainTrend || [],
    stepPeakTrend: cpu.stepPeakTrend || [],
    impulseGainTrend: cpu.impulseGainTrend || []
  };
}

function systemIdentificationSubsystemSummaries(hostId, rows, allRows, feature) {
  return SYSTEM_ID_SUBSYSTEMS
    .map((config) => {
      const target = systemIdentificationTargetForOutput(rows, config);
      if (!target) return null;
      const profilePeaks = Object.fromEntries(SYSTEM_ID_PROFILE_ORDER.map((profile) => [profile, feature(target, profile, config.outputMetric, "peak_delta_pct")]));
      const profileGains = Object.fromEntries(SYSTEM_ID_PROFILE_ORDER.map((profile) => [profile, feature(target, profile, config.outputMetric, "gain")]));
      const stepGain = feature(target, "step", config.outputMetric, "gain");
      const stepPeak = feature(target, "step", config.outputMetric, "peak_delta_pct");
      const impulseGain = feature(target, "impulse", config.outputMetric, "gain");
      const impulsePeak = feature(target, "impulse", config.outputMetric, "peak_delta_pct");
      const rampPeak = feature(target, "ramp", config.outputMetric, "peak_delta_pct");
      const hasSignal = [
        stepGain,
        stepPeak,
        impulseGain,
        impulsePeak,
        rampPeak,
        ...Object.values(profilePeaks),
        ...Object.values(profileGains)
      ].some(Number.isFinite);
      if (!hasSignal) return null;
      return {
        ...config,
        target,
        targetLabel: systemIdentificationTargetLabel(target),
        stepGain,
        stepPeak,
        stepCorrelation: feature(target, "step", config.outputMetric, "cross_correlation"),
        impulseGain,
        impulsePeak,
        rampPeak,
        profilePeaks,
        profileGains,
        stepGainTrend: systemIdentificationTrend(allRows, hostId, target, "step", config.outputMetric, "gain"),
        stepPeakTrend: systemIdentificationTrend(allRows, hostId, target, "step", config.outputMetric, "peak_delta_pct"),
        impulseGainTrend: systemIdentificationTrend(allRows, hostId, target, "impulse", config.outputMetric, "gain")
      };
    })
    .filter(Boolean);
}

function systemIdentificationTargetForOutput(rows, config) {
  const candidates = unique(rows
    .filter((row) => row.outputMetric === config.outputMetric)
    .map((row) => row.target)
    .filter(Boolean));
  if (!candidates.length) return "";
  return candidates.sort((left, right) => {
    const leftRank = systemIdentificationTargetRank(left, config.target);
    const rightRank = systemIdentificationTargetRank(right, config.target);
    return leftRank - rightRank || left.localeCompare(right);
  })[0];
}

function systemIdentificationTargetRank(target, preferred) {
  if (target === preferred) return 0;
  const index = SYSTEM_ID_SUBSYSTEMS.findIndex((subsystem) => subsystem.target === target || subsystem.key === target);
  return index === -1 ? SYSTEM_ID_SUBSYSTEMS.length + 1 : index + 1;
}

function systemIdentificationTargetLabel(target) {
  return SYSTEM_ID_SUBSYSTEMS.find((subsystem) => subsystem.target === target || subsystem.key === target)?.shortLabel || titleCase(target);
}

function systemIdentificationHostSort(left, right) {
  const rank = (host) => {
    const id = host.hostId.toUpperCase();
    if (id === "SPARK1") return 1;
    if (id === "SPARK2") return 2;
    const piMatch = id.match(/^PI(\d+)$/);
    if (piMatch) return 100 + numeric(piMatch[1], 0);
    if (id.includes("NUC")) return 9;
    return 5;
  };
  return rank(left) - rank(right) || left.hostId.localeCompare(right.hostId, undefined, { numeric: true });
}

function systemIdFeatureKey(row) {
  return `${row.target}:${row.profile}:${row.outputMetric}:${row.feature}`;
}

function systemIdentificationTrend(rows, hostId, target, profile, outputMetric, feature) {
  const byRun = new Map();
  rows.forEach((row) => {
    if (row.hostId !== hostId || row.target !== target || row.profile !== profile || row.outputMetric !== outputMetric || row.feature !== feature) return;
    const existing = byRun.get(row.runId);
    if (!existing || row.timestampMs >= existing.timestampMs) {
      byRun.set(row.runId, {
        value: row.value,
        timestampMs: row.timestampMs,
        label: row.eventTs
      });
    }
  });
  return Array.from(byRun.values()).sort((left, right) => left.timestampMs - right.timestampMs).slice(-24);
}

function systemIdTimestampMs(value) {
  const normalized = String(value || "")
    .trim()
    .replace(" ", "T")
    .replace(/(\.\d{3})\d+/, "$1");
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function systemIdProfileRank(profile) {
  const index = SYSTEM_ID_PROFILE_ORDER.indexOf(profile);
  return index === -1 ? SYSTEM_ID_PROFILE_ORDER.length : index;
}

function formatSystemIdRunAge(timestampMs) {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return "time unknown";
  const seconds = Math.max(0, Math.round((Date.now() - timestampMs) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function refreshSystemCharacterizationPanelFromCache() {
  const panel = document.querySelector("#systemCharacterizationPanel");
  const badge = document.querySelector("#systemCharacterizationBadge");
  if (!panel) return;
  updateSystemCharacterizationBadge(badge, platformVirtualSensorCache.systemIdentification);
  renderSystemCharacterizationPanel(panel, platformVirtualSensorCache.systemIdentification);
}

function updateSystemCharacterizationBadge(badge, characterization) {
  if (!badge) return;
  if (!characterization || characterization.status !== "ready") {
    badge.textContent = platformApiBaseUrl() ? "Waiting" : "No API";
    badge.dataset.tone = platformApiBaseUrl() ? "watch" : "poor";
    return;
  }
  badge.textContent = `${characterization.hosts.length} ${characterization.hosts.length === 1 ? "host" : "hosts"}`;
  badge.dataset.tone = characterization.hosts.length >= 2 ? "good" : "watch";
}

function renderSystemCharacterizationPanel(container, characterization) {
  if (!characterization || characterization.status !== "ready" || !characterization.hosts.length) {
    const empty = document.createElement("div");
    empty.className = "operator-empty";
    empty.textContent = platformApiBaseUrl()
      ? "Waiting for system-identification virtual sensor rows."
      : "Platform API is not configured for this dashboard host.";
    container.replaceChildren(empty);
    return;
  }

  const summary = document.createElement("div");
  summary.className = "system-characterization-summary";
  characterization.hosts.slice(0, SYSTEM_CHARACTERIZATION_HOST_LIMIT).forEach((host) => {
    summary.append(systemCharacterizationHostCard(host));
  });

  const chart = systemCharacterizationProfileChart(characterization.hosts);
  const trends = systemCharacterizationTrendGrid(characterization.hosts);
  container.replaceChildren(summary, chart, trends);
}

function systemCharacterizationHostCard(host) {
  const card = document.createElement("article");
  card.className = "system-characterization-host";
  const head = document.createElement("div");
  head.className = "system-characterization-host-head";
  const title = document.createElement("strong");
  title.textContent = host.hostId;
  const badge = document.createElement("span");
  badge.textContent = host.ageLabel;
  head.append(title, badge);

  const stats = document.createElement("div");
  stats.className = "system-characterization-stats";
  const subsystemStats = (host.subsystems || []).slice(0, 4);
  if (subsystemStats.length) {
    stats.append(...subsystemStats.map((subsystem) => systemCharacterizationStat(
      `${subsystem.shortLabel} step`,
      systemIdDelta(subsystem.stepPeak),
      subsystem.stepPeakTrend,
      true
    )));
  } else {
    stats.append(systemCharacterizationStat("Step peak", systemIdDelta(host.cpuStepPeak), host.stepPeakTrend, true));
  }

  const meta = document.createElement("small");
  const profileText = host.profiles.map((profile) => SYSTEM_ID_PROFILE_LABELS[profile] || titleCase(profile)).join(", ");
  const subsystemText = (host.subsystems || []).map((subsystem) => subsystem.shortLabel).join(", ");
  meta.textContent = `${subsystemText || "Subsystems"} | ${profileText} | ${host.runCount} ${host.runCount === 1 ? "run" : "runs"}`;
  card.append(head, stats, meta);
  return card;
}

function systemCharacterizationStat(label, value, trend, signed) {
  const item = document.createElement("div");
  item.className = "system-characterization-stat";
  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  const valueEl = document.createElement("strong");
  valueEl.textContent = value;
  const spark = buildTrendSparkline(trend || [], {
    className: "system-characterization-sparkline",
    emptyClassName: "system-characterization-sparkline-empty",
    lineClassName: "system-characterization-sparkline-line",
    zeroClassName: "system-characterization-sparkline-zero",
    signed
  });
  item.append(labelEl, valueEl, spark);
  return item;
}

function systemCharacterizationProfileChart(hosts) {
  const chart = document.createElement("section");
  chart.className = "system-characterization-chart";
  const title = document.createElement("div");
  title.className = "system-characterization-chart-title";
  title.append(systemCharacterizationChartLabel("Subsystem profile response"), systemCharacterizationChartLabel("peak delta"));

  const series = systemCharacterizationProfileSeries(hosts);
  const values = hosts.flatMap((host) => (host.subsystems || []).flatMap((subsystem) => Object.values(subsystem.profilePeaks || {}).filter(Number.isFinite)));
  const maxAbs = Math.max(1, ...values.map((value) => Math.abs(value)));
  const rows = series.map((item) => systemCharacterizationProfileRow(item, hosts, maxAbs));

  chart.append(title, ...rows);
  return chart;
}

function systemCharacterizationProfileSeries(hosts) {
  const items = [];
  SYSTEM_ID_SUBSYSTEMS.forEach((config) => {
    SYSTEM_ID_PROFILE_ORDER.forEach((profile) => {
      const hasValue = hosts.some((host) => {
        const subsystem = systemCharacterizationHostSubsystem(host, config.key);
        return Number.isFinite(subsystem?.profilePeaks?.[profile]);
      });
      if (hasValue) items.push({ config, profile });
    });
  });
  return items;
}

function systemCharacterizationProfileRow(item, hosts, maxAbs) {
  const row = document.createElement("div");
  row.className = "system-characterization-profile-row";
  const label = document.createElement("span");
  label.textContent = `${item.config.shortLabel} ${SYSTEM_ID_PROFILE_LABELS[item.profile] || titleCase(item.profile)}`;
  const bars = document.createElement("div");
  bars.className = "system-characterization-bars";
  hosts.slice(0, SYSTEM_CHARACTERIZATION_HOST_LIMIT).forEach((host) => {
    const subsystem = systemCharacterizationHostSubsystem(host, item.config.key);
    const value = subsystem?.profilePeaks?.[item.profile];
    const bar = document.createElement("div");
    bar.className = "system-characterization-bar";
    bar.dataset.host = host.hostId.toLowerCase();
    bar.dataset.polarity = numeric(value, 0) < 0 ? "negative" : "positive";
    bar.title = `${host.hostId} ${item.config.label} ${SYSTEM_ID_PROFILE_LABELS[item.profile] || item.profile}: ${systemIdDelta(value)}`;
    const fill = document.createElement("i");
    fill.style.width = Number.isFinite(value) ? `${Math.max(2, Math.min(100, (Math.abs(value) / maxAbs) * 100))}%` : "2%";
    const text = document.createElement("span");
    text.textContent = `${host.hostId} ${systemIdDelta(value)}`;
    bar.append(fill, text);
    bars.append(bar);
  });
  row.append(label, bars);
  return row;
}

function systemCharacterizationHostSubsystem(host, key) {
  return (host.subsystems || []).find((subsystem) => subsystem.key === key) || null;
}

function systemCharacterizationTrendGrid(hosts) {
  const grid = document.createElement("div");
  grid.className = "system-characterization-trends";
  hosts.slice(0, SYSTEM_CHARACTERIZATION_HOST_LIMIT).forEach((host) => {
    const subsystems = (host.subsystems || []).filter((subsystem) => Number.isFinite(subsystem.stepPeak) || (subsystem.stepPeakTrend || []).length).slice(0, 4);
    subsystems.forEach((subsystem) => {
      grid.append(systemCharacterizationTrendCell(host, `${subsystem.shortLabel} step`, subsystem.stepPeakTrend, true, systemIdDelta));
    });
  });
  return grid;
}

function systemCharacterizationTrendCell(host, label, trend, signed, formatter = systemIdRatio) {
  const item = document.createElement("div");
  item.className = "system-characterization-trend-cell";
  const labelEl = document.createElement("span");
  labelEl.textContent = `${host.hostId} ${label}`;
  const points = trend || [];
  const latest = points.length ? points[points.length - 1].value : null;
  const value = document.createElement("strong");
  value.textContent = formatter(latest);
  const spark = buildTrendSparkline(trend || [], {
    className: "system-characterization-trend",
    emptyClassName: "system-characterization-sparkline-empty",
    lineClassName: "system-characterization-sparkline-line",
    zeroClassName: "system-characterization-sparkline-zero",
    signed
  });
  item.append(labelEl, value, spark);
  return item;
}

function systemCharacterizationChartLabel(text) {
  const label = document.createElement("span");
  label.textContent = text;
  return label;
}

function systemIdRatio(value) {
  return Number.isFinite(value) ? formatDecimal(value, 3) : "--";
}

function systemIdDelta(value) {
  return Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${formatDecimal(value, 2)}%` : "--";
}

function renderLiveObservationLog(container, analysis, machineContext, history) {
  const sampleHistory = Array.isArray(history) ? history : [];
  const contextKey = liveObservationContextKey(analysis, machineContext, sampleHistory);
  const rawObservations = Array.isArray(analysis.observations)
    ? analysis.observations.slice(0, LIVE_OBSERVATION_LIMIT)
    : liveObservations(analysis, machineContext, sampleHistory);
  const observations = filterLiveObservationRows(rawObservations, contextKey);
  const latest = sampleHistory[sampleHistory.length - 1] || {};
  const wrapper = document.createElement("section");
  wrapper.className = "live-observation-panel";

  const head = document.createElement("div");
  head.className = "live-observation-head";
  const label = document.createElement("p");
  label.textContent = "Observation Log";
  const title = document.createElement("h3");
  title.textContent = `${observations.length} ${observations.length === 1 ? "entry" : "entries"}`;
  const meta = document.createElement("div");
  meta.className = "live-observation-meta";
  const badge = document.createElement("span");
  badge.textContent = latest.label ? `Latest ${latest.label}` : analysis.badgeText || "Waiting";
  meta.append(
    badge,
    liveObservationActions({
      observations,
      contextKey,
      clearTimestampMs: liveObservationClearTimestamp(rawObservations, sampleHistory),
      onClear: () => renderLiveObservationLog(container, analysis, machineContext, sampleHistory)
    })
  );
  head.append(label, title, meta);

  if (!observations.length) {
    const empty = document.createElement("div");
    empty.className = "live-observation-empty";
    empty.textContent = liveObservationWasCleared(contextKey) && rawObservations.length
      ? "Observation log cleared. Waiting for a newer sample."
      : analysis.emptyObservationText || (sampleHistory.length ? "No meaningful observation events in the current window." : "Waiting for live samples.");
    wrapper.append(head, empty);
    container.replaceChildren(wrapper);
    return;
  }

  const list = document.createElement("ol");
  list.className = "live-observation-list";
  observations.forEach((observation) => {
    list.append(liveObservationItem(observation));
  });

  wrapper.append(head, list);
  container.replaceChildren(wrapper);
}

function liveObservationActions({ observations, contextKey, clearTimestampMs, onClear }) {
  const actions = document.createElement("div");
  actions.className = "live-observation-actions";

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "live-observation-action";
  copy.textContent = "Copy";
  copy.disabled = observations.length === 0;
  copy.setAttribute("aria-label", "Copy observation log");
  copy.addEventListener("click", async () => {
    const text = formatLiveObservationLog(observations);
    copy.disabled = true;
    const copied = await copyTextToClipboard(text);
    copy.dataset.state = copied ? "done" : "failed";
    copy.textContent = copied ? "Copied" : "Copy failed";
    setIngestStatus(copied ? "Observation log copied" : "Observation log ready to copy", copied ? "good" : "watch");
    if (!copied) showManualCopyPrompt("Observation log", text);
    window.setTimeout(() => {
      copy.dataset.state = "";
      copy.textContent = "Copy";
      copy.disabled = observations.length === 0;
    }, 1200);
  });

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "live-observation-action";
  clear.textContent = "Clear";
  clear.disabled = observations.length === 0;
  clear.setAttribute("aria-label", "Clear observation log");
  clear.addEventListener("click", () => {
    liveObservationClearState = { contextKey, clearedAtMs: clearTimestampMs };
    setIngestStatus("Observation log cleared", "watch");
    onClear();
  });

  actions.append(copy, clear);
  return actions;
}

function liveObservationContextKey(analysis, machineContext, history) {
  if (analysis?.contextKey) return analysis.contextKey;
  const host = machineContext?.host || history.find((sample) => sample?.host)?.host || "host";
  return `live:${host}`;
}

function filterLiveObservationRows(observations, contextKey) {
  if (!liveObservationWasCleared(contextKey)) return observations;
  return observations.filter((observation) => Number.isFinite(observation.timestampMs) && observation.timestampMs > liveObservationClearState.clearedAtMs);
}

function liveObservationWasCleared(contextKey) {
  return liveObservationClearState.contextKey === contextKey && Number.isFinite(liveObservationClearState.clearedAtMs);
}

function liveObservationClearTimestamp(observations, history) {
  const latestSample = history[history.length - 1];
  if (Number.isFinite(latestSample?.timestampMs)) return latestSample.timestampMs;
  const stamps = observations.map((observation) => observation.timestampMs).filter(Number.isFinite);
  return stamps.length ? Math.max(...stamps) : Date.now();
}

function formatLiveObservationLog(observations) {
  return observations
    .map((observation) => {
      const stamp = observation.dateTime || observation.label || "Observation";
      return `[${stamp}] ${observation.title}: ${observation.detail}`;
    })
    .join("\n");
}

function liveObservations(analysis, machineContext, history) {
  const alerts = Array.isArray(analysis.alerts) ? analysis.alerts : [];
  const sampleHistory = Array.isArray(history) ? history : [];
  const latest = sampleHistory[sampleHistory.length - 1] || {};
  const alertRows = alerts.map((alert) => ({
    tone: alert.severity === "critical" || alert.severity === "high" ? "poor" : alert.severity === "medium" ? "watch" : "good",
    label: titleCase(alert.severity),
    title: alert.title,
    detail: alert.evidence,
    timestampMs: Number.isFinite(latest.timestampMs) ? latest.timestampMs : Date.now()
  }));
  const sampleRows = liveSignificantSampleObservations(sampleHistory, machineContext);

  return [...alertRows, ...sampleRows].slice(0, LIVE_OBSERVATION_LIMIT);
}

function liveSignificantSampleObservations(history, machineContext) {
  const rows = [];
  const seen = new Set();
  const window = history.slice(-LIVE_TELEMETRY_RELATIONSHIP_WINDOW);

  for (let index = window.length - 1; index >= 0 && rows.length < LIVE_OBSERVATION_LIMIT; index -= 1) {
    const sample = window[index];
    const previous = window[index - 1] || null;
    const candidates = liveSampleObservationEvents(sample, previous, machineContext);

    candidates.forEach((observation) => {
      if (rows.length >= LIVE_OBSERVATION_LIMIT) return;
      const signature = `${observation.eventKey}:${observation.title}`;
      if (seen.has(signature)) return;
      seen.add(signature);
      rows.push(observation);
    });
  }

  return rows;
}

function liveSampleObservationEvents(sample, previous, machineContext) {
  const timestampMs = Number.isFinite(sample.timestampMs) ? sample.timestampMs : undefined;
  const dateTime = Number.isFinite(timestampMs) ? new Date(timestampMs).toISOString() : "";
  const label = sample.label || "sample";
  const host = sample.host || machineContext?.host || "host";
  const rows = [];
  const add = ({ eventKey, tone = "watch", title, detail }) => {
    rows.push({ eventKey, tone, label, timestampMs, dateTime, title, detail });
  };
  const metricConfigs = [
    { key: "cpu", label: "CPU", warn: 70, poor: 90, delta: 15, floor: 20 },
    { key: "ram", label: "RAM", warn: 75, poor: 90, delta: 8, floor: 50 },
    { key: "disk", label: "Disk", warn: 75, poor: 92, delta: 2, floor: 70 },
    { key: "gpu", label: "GPU", warn: 85, poor: 96, delta: 18, floor: 15 },
    { key: "networkUtilization", label: "Network", warn: 70, poor: 88, delta: 15, floor: 20 }
  ];

  metricConfigs.forEach((config) => {
    const value = telemetryValue(sample, config.key);
    if (!Number.isFinite(value)) return;
    const previousValue = previous ? telemetryValue(previous, config.key) : Number.NaN;
    if (value >= config.poor) {
      add({
        eventKey: `${config.key}:poor`,
        tone: "poor",
        title: `${config.label} pressure is high`,
        detail: `${config.label} reached ${pct(value)} on ${host}.`
      });
      return;
    }
    if (value >= config.warn) {
      add({
        eventKey: `${config.key}:watch`,
        tone: "watch",
        title: `${config.label} pressure is elevated`,
        detail: `${config.label} is at ${pct(value)} on ${host}.`
      });
      return;
    }
    if (Number.isFinite(previousValue) && value >= config.floor && Math.abs(value - previousValue) >= config.delta) {
      add({
        eventKey: `${config.key}:delta`,
        tone: "watch",
        title: `${config.label} activity changed`,
        detail: `${config.label} moved ${signedRate(value - previousValue, "pts")} to ${pct(value)} on ${host}.`
      });
    }
  });

  const gpu = telemetryValue(sample, "gpu");
  const previousGpu = previous ? telemetryValue(previous, "gpu") : Number.NaN;
  if (machineContext?.gpuPresent && !Number.isFinite(gpu) && Number.isFinite(previousGpu)) {
    add({
      eventKey: "gpu:missing",
      tone: "watch",
      title: "GPU counter disappeared",
      detail: "The latest live sample did not include GPU utilization after it was previously present."
    });
  }

  const throughput = telemetryValue(sample, "networkThroughputBps");
  const previousThroughput = previous ? telemetryValue(previous, "networkThroughputBps") : Number.NaN;
  const throughputDelta = Number.isFinite(previousThroughput) ? throughput - previousThroughput : 0;
  const materialThroughput = 1024 * 1024;
  if (Number.isFinite(throughput) && throughput >= materialThroughput && Math.abs(throughputDelta) >= materialThroughput) {
    add({
      eventKey: "networkThroughput:delta",
      tone: "watch",
      title: "Network throughput changed",
      detail: `Network throughput moved ${formatBytesPerSecond(Math.abs(throughputDelta))} to ${formatBytesPerSecond(throughput)} on ${host}.`
    });
  }

  return rows;
}

function liveSampleObservation(sample, machineContext) {
  const parts = [
    `CPU ${pct(telemetryValue(sample, "cpu"))}`,
    `RAM ${pct(telemetryValue(sample, "ram"))}`,
    `Disk ${pct(telemetryValue(sample, "disk"))}`
  ];
  const gpu = telemetryValue(sample, "gpu");
  const networkUtilization = telemetryValue(sample, "networkUtilization");
  const networkThroughput = telemetryValue(sample, "networkThroughputBps");

  if (Number.isFinite(gpu)) {
    parts.push(`GPU ${pct(gpu)}`);
  } else if (machineContext?.gpuPresent) {
    parts.push("GPU unavailable");
  }

  if (Number.isFinite(networkUtilization)) {
    parts.push(`Network ${pct(networkUtilization)}`);
  } else if (Number.isFinite(networkThroughput)) {
    parts.push(`Network ${formatBytesPerSecond(networkThroughput)}`);
  }

  return {
    tone: liveSampleObservationTone(sample),
    label: sample.label || "sample",
    timestampMs: Number.isFinite(sample.timestampMs) ? sample.timestampMs : undefined,
    dateTime: Number.isFinite(sample.timestampMs) ? new Date(sample.timestampMs).toISOString() : "",
    title: sample.host || machineContext?.host || "host",
    detail: parts.join(" | ")
  };
}

function liveSampleObservationTone(sample) {
  const cpu = telemetryValue(sample, "cpu");
  const ram = telemetryValue(sample, "ram");
  const disk = telemetryValue(sample, "disk");
  const network = telemetryValue(sample, "networkUtilization");
  if (cpu >= 90 || ram >= 90 || disk >= 92 || network >= 88) return "poor";
  if (cpu >= 70 || ram >= 75 || disk >= 75 || network >= 70) return "watch";
  return "good";
}

function liveObservationItem(observation) {
  const item = document.createElement("li");
  item.className = "live-observation-item";
  item.dataset.tone = observation.tone;

  const marker = document.createElement("span");
  marker.className = "live-observation-marker";
  marker.setAttribute("aria-hidden", "true");

  const body = document.createElement("div");
  const head = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = observation.title;
  const label = observation.dateTime ? document.createElement("time") : document.createElement("span");
  label.textContent = observation.label;
  if (observation.dateTime) label.setAttribute("datetime", observation.dateTime);
  head.append(title, label);

  const detail = document.createElement("small");
  detail.textContent = observation.detail;
  body.append(head, detail);

  item.append(marker, body);
  return item;
}

function liveCovarianceMatrixPanel(matrix, analysis) {
  const panel = document.createElement("section");
  panel.className = "live-covariance-panel";

  const head = document.createElement("div");
  head.className = "live-covariance-head";
  const label = document.createElement("p");
  label.textContent = "Covariance Matrix";
  const title = document.createElement("h3");
  title.textContent = "CPU, GPU, RAM, network";
  const badge = document.createElement("span");
  badge.textContent = analysis.covarianceBadgeText || (analysis.sampleCount >= 4
    ? `Rolling ${Math.min(analysis.sampleCount, LIVE_TELEMETRY_RELATIONSHIP_WINDOW)} samples`
    : "Learning");
  head.append(label, title, badge);

  const scroller = document.createElement("div");
  scroller.className = "live-covariance-scroll";
  const grid = document.createElement("div");
  grid.className = "live-covariance-grid";
  grid.setAttribute("role", "table");
  grid.setAttribute("aria-label", "Rolling live covariance matrix for CPU load, GPU utilization, RAM usage, and network utilization");

  const corner = document.createElement("div");
  corner.className = "live-covariance-corner";
  corner.setAttribute("aria-hidden", "true");
  grid.append(corner);

  matrix.metrics.forEach((metric) => {
    const columnHeader = document.createElement("div");
    columnHeader.className = "live-covariance-axis live-covariance-axis-column";
    columnHeader.setAttribute("role", "columnheader");
    columnHeader.textContent = metric.shortLabel;
    columnHeader.title = metric.label;
    grid.append(columnHeader);
  });

  matrix.rows.forEach((row) => {
    const rowHeader = document.createElement("div");
    rowHeader.className = "live-covariance-axis live-covariance-axis-row";
    rowHeader.setAttribute("role", "rowheader");
    rowHeader.textContent = row.metric.shortLabel;
    rowHeader.title = row.metric.label;
    grid.append(rowHeader);

    row.cells.forEach((cell) => {
      grid.append(liveCovarianceMatrixCell(cell));
    });
  });

  scroller.append(grid);
  const principalMode = livePrincipalResourceModePanel(matrix.principalMode);
  const foot = document.createElement("div");
  foot.className = "live-covariance-foot";
  foot.textContent = analysis.covarianceFootText || "Covariance in percentage-point^2; color follows correlation. Mini-lines show each cell's rolling trend.";
  panel.append(head, scroller, principalMode, foot);
  return panel;
}

function liveCovarianceMatrixCell(cell) {
  const item = document.createElement("div");
  item.className = "live-covariance-cell";
  const { stats } = cell;
  const isDiagonal = cell.rowKey === cell.columnKey;
  const covariance = Number.isFinite(stats.covariance) ? stats.covariance : null;
  const correlation = Number.isFinite(stats.correlation) ? stats.correlation : null;
  const tone = covarianceCellTone(correlation, isDiagonal, stats.sampleCount);
  item.dataset.tone = tone;
  item.style.backgroundColor = covarianceCellBackground(correlation, isDiagonal, stats.sampleCount);

  const value = document.createElement("strong");
  value.textContent = covariance === null ? "learning" : formatCovariance(covariance, isDiagonal);
  const note = document.createElement("small");
  note.textContent = covariance === null
    ? `${stats.sampleCount}/4 pairs`
    : isDiagonal ? "variance" : formatCorrelation(correlation);
  const trend = buildCovarianceSparkline(cell.trend || [], isDiagonal);

  item.title = covariance === null
    ? `${cell.rowLabel} and ${cell.columnLabel}: waiting for at least 4 paired live samples.`
    : `${cell.rowLabel} vs ${cell.columnLabel}: covariance ${formatCovariance(covariance, isDiagonal)} pct-pt^2, ${isDiagonal ? "variance" : formatCorrelation(correlation)}, ${stats.sampleCount} paired samples.`;
  item.setAttribute("role", "cell");
  item.setAttribute("aria-label", item.title);

  item.append(value, trend, note);
  return item;
}

function livePrincipalResourceModePanel(mode) {
  const panel = document.createElement("section");
  panel.className = "live-eigen-panel";
  panel.dataset.status = mode?.status || "learning";

  const head = document.createElement("div");
  head.className = "live-eigen-head";
  const label = document.createElement("p");
  label.textContent = "Principal Resource Mode";
  const title = document.createElement("h3");
  title.textContent = mode?.title || "Learning resource mode";
  const badge = document.createElement("span");
  badge.textContent = Number.isFinite(mode?.explainedPct)
    ? `${pct(mode.explainedPct)} explained`
    : mode?.badge || "Learning";
  head.append(label, title, badge);

  const loadings = document.createElement("div");
  loadings.className = "live-eigen-loadings";
  (mode?.loadings || LIVE_COVARIANCE_METRICS.map((metric) => ({ ...metric, value: null }))).forEach((loading) => {
    loadings.append(liveEigenLoadingItem(loading));
  });

  const values = document.createElement("div");
  values.className = "live-eigen-values";
  if (mode?.eigenvalues?.length) {
    mode.eigenvalues.forEach((entry, index) => {
      values.append(liveEigenValueItem(entry, index));
    });
  } else {
    const empty = document.createElement("div");
    empty.className = "live-eigen-empty";
    empty.textContent = mode?.note || "Waiting for enough live covariance history to compute eigenvalues.";
    values.append(empty);
  }

  const note = document.createElement("small");
  note.className = "live-eigen-note";
  note.textContent = mode?.note || "Computed from the rolling correlation matrix so each resource contributes on the same scale.";

  panel.append(head, loadings, values, note);
  return panel;
}

function liveEigenLoadingItem(loading) {
  const item = document.createElement("div");
  item.className = "live-eigen-loading";
  item.dataset.tone = Number.isFinite(loading.value) && Math.abs(loading.value) >= 0.5 ? "strong" : "muted";
  item.dataset.polarity = Number.isFinite(loading.value) && loading.value < 0 ? "negative" : "positive";

  const label = document.createElement("span");
  label.textContent = loading.shortLabel || loading.label;
  label.title = loading.label || "";
  const value = document.createElement("strong");
  value.textContent = Number.isFinite(loading.value) ? signedLoading(loading.value) : "--";
  const trend = buildEigenSparkline(loading.trend || [], true);

  item.title = Number.isFinite(loading.value)
    ? `${loading.label || loading.shortLabel}: principal-mode loading ${signedLoading(loading.value)}.`
    : `${loading.label || loading.shortLabel}: waiting for enough movement to compute a loading.`;
  item.setAttribute("aria-label", item.title);

  item.append(label, value, trend);
  return item;
}

function liveEigenValueItem(entry, index) {
  const item = document.createElement("div");
  item.className = "live-eigen-value";

  const label = document.createElement("span");
  label.textContent = `L${index + 1}`;
  const value = document.createElement("strong");
  value.textContent = formatDecimal(entry.value, 2);
  const trend = buildEigenSparkline(entry.trend || [], false);
  const share = document.createElement("small");
  share.textContent = `${pct(entry.sharePct)} share`;

  item.title = `L${index + 1}: eigenvalue ${formatDecimal(entry.value, 2)}, ${pct(entry.sharePct)} share of rolling resource variance.`;
  item.setAttribute("aria-label", item.title);

  item.append(label, value, trend, share);
  return item;
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

function covarianceCellTone(correlation, isDiagonal, sampleCount) {
  if (sampleCount < 4) return "learning";
  if (isDiagonal) return "self";
  if (!Number.isFinite(correlation) || Math.abs(correlation) < 0.2) return "weak";
  return correlation > 0 ? "positive" : "negative";
}

function covarianceCellBackground(correlation, isDiagonal, sampleCount) {
  if (sampleCount < 4) return "rgba(98, 117, 129, 0.08)";
  if (isDiagonal) return "rgba(36, 95, 145, 0.14)";
  if (!Number.isFinite(correlation)) return "rgba(98, 117, 129, 0.1)";
  const strength = Math.min(1, Math.abs(correlation));
  const alpha = 0.08 + strength * 0.34;
  return correlation >= 0
    ? `rgba(0, 143, 115, ${formatDecimal(alpha, 3)})`
    : `rgba(184, 76, 62, ${formatDecimal(alpha, 3)})`;
}

function formatCovariance(value, unsigned = false) {
  if (!Number.isFinite(value)) return "learning";
  const displayValue = Math.abs(value) < 0.005 ? 0 : value;
  const absValue = Math.abs(displayValue);
  const digits = absValue >= 100 ? 0 : absValue >= 10 ? 1 : 2;
  const sign = unsigned || displayValue < 0 ? "" : "+";
  return `${sign}${displayValue.toFixed(digits)}`;
}

function signedLoading(value) {
  if (!Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${formatDecimal(value, 2)}`;
}

function principalMetricName(metric) {
  if (metric.key === "networkUtilization") return "Network";
  if (metric.key === "cpu") return "CPU";
  if (metric.key === "gpu") return "GPU";
  if (metric.key === "ram") return "RAM";
  return metric.shortLabel || metric.label;
}

function liveRelationshipCard(relationship) {
  const item = document.createElement("div");
  item.className = "live-relationship-card";
  item.dataset.tone = relationship.tone;

  const label = document.createElement("span");
  label.textContent = relationship.label;
  const value = document.createElement("strong");
  value.textContent = relationship.value;
  const note = document.createElement("small");
  note.textContent = relationship.note;

  item.append(label, value, note);
  return item;
}

function liveAlertCard(alert) {
  const item = document.createElement("article");
  item.className = "live-alert-card";
  item.dataset.severity = alert.severity;

  const head = document.createElement("div");
  const severity = document.createElement("span");
  severity.textContent = titleCase(alert.severity);
  const confidence = document.createElement("small");
  confidence.textContent = `${pct(alert.confidence * 100)} confidence`;
  head.append(severity, confidence);

  const title = document.createElement("strong");
  title.textContent = alert.title;
  const evidence = document.createElement("p");
  evidence.textContent = alert.evidence;
  const recommendation = document.createElement("small");
  recommendation.textContent = alert.recommendation;

  item.append(head, title, evidence, recommendation);
  return item;
}

function liveTelemetryAlert({ severity, title, evidence, recommendation, confidence }) {
  return { severity, title, evidence, recommendation, confidence: clamp(confidence, 0, 1) };
}

function telemetryValue(sample, key) {
  const value = sample?.[key];
  if (value === undefined || value === null || value === "") return Number.NaN;
  return numeric(value, Number.NaN);
}

function telemetryRelationshipKey(history, keys) {
  return keys.find((key) => history.filter((sample) => Number.isFinite(telemetryValue(sample, key))).length >= 2) || keys[0];
}

function telemetryRelationship(label, correlation, note) {
  if (correlation === null) {
    return {
      label,
      value: "learning",
      note,
      tone: "watch"
    };
  }

  const strength = Math.abs(correlation);
  return {
    label,
    value: formatCorrelation(correlation),
    note: `${strength >= 0.7 ? "Strong" : strength >= 0.35 ? "Moderate" : "Weak"} ${correlation >= 0 ? "positive" : "negative"} relationship`,
    tone: correlation < -0.35 ? "poor" : strength >= 0.7 ? "good" : "watch"
  };
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

function calculatePrincipalResourceMode(history) {
  const activeMetrics = LIVE_COVARIANCE_METRICS
    .map((metric) => ({
      ...metric,
      varianceStats: telemetryCovarianceStats(history, metric.key, metric.key)
    }))
    .filter((metric) => Number.isFinite(metric.varianceStats.covariance) && metric.varianceStats.covariance > LIVE_EIGEN_MIN_VARIANCE);

  if (activeMetrics.length < 2) {
    return {
      status: "learning",
      title: "Learning resource mode",
      badge: "Need moving counters",
      explainedPct: null,
      note: "Need at least two live counters with variance across the rolling window to compute eigenvalues.",
      loadings: LIVE_COVARIANCE_METRICS.map((metric) => ({ ...metric, value: null })),
      eigenvalues: []
    };
  }

  const correlationMatrix = activeMetrics.map((rowMetric) => (
    activeMetrics.map((columnMetric) => {
      if (rowMetric.key === columnMetric.key) return 1;
      const correlation = telemetryCorrelation(history, rowMetric.key, columnMetric.key);
      return Number.isFinite(correlation) ? clamp(correlation, -1, 1) : 0;
    })
  ));
  const decomposition = symmetricEigenDecomposition(correlationMatrix);
  const eigenPairs = decomposition.values
    .map((value, index) => ({
      value: Math.max(0, value),
      vector: decomposition.vectors[index]
    }))
    .sort((left, right) => right.value - left.value);
  const principal = eigenPairs[0];
  const total = eigenPairs.reduce((sum, pair) => sum + pair.value, 0) || activeMetrics.length;
  const dominantIndex = principal.vector.reduce((best, value, index) => (
    Math.abs(value) > Math.abs(principal.vector[best]) ? index : best
  ), 0);
  const direction = principal.vector[dominantIndex] < 0 ? -1 : 1;
  const directedVector = principal.vector.map((value) => value * direction);
  const dominantLabels = directedVector
    .map((value, index) => ({ value: Math.abs(value), label: principalMetricName(activeMetrics[index]) }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 2)
    .map((entry) => entry.label);
  const loadingByKey = new Map(activeMetrics.map((metric, index) => [metric.key, directedVector[index]]));

  return {
    status: "ready",
    title: dominantLabels.join(" + ") || "Principal resource mode",
    badge: `${activeMetrics.length} counters`,
    explainedPct: (principal.value / total) * 100,
    note: `Computed from the rolling correlation matrix across ${activeMetrics.length} moving ${activeMetrics.length === 1 ? "counter" : "counters"}.`,
    loadings: LIVE_COVARIANCE_METRICS.map((metric) => ({
      ...metric,
      value: loadingByKey.has(metric.key) ? loadingByKey.get(metric.key) : null
    })),
    eigenvalues: eigenPairs.map((pair) => ({
      value: pair.value,
      sharePct: (pair.value / total) * 100
    }))
  };
}

function telemetryPrincipalModeTrend(history) {
  return history
    .map((sample, index) => {
      const window = history.slice(Math.max(0, index - LIVE_TELEMETRY_RELATIONSHIP_WINDOW + 1), index + 1);
      const mode = calculatePrincipalResourceMode(window);
      if (mode.status !== "ready") return null;
      return {
        timestampMs: sample.timestampMs,
        label: sample.label || "",
        explainedPct: mode.explainedPct,
        loadings: mode.loadings,
        eigenvalues: mode.eigenvalues
      };
    })
    .filter(Boolean);
}

function symmetricEigenDecomposition(matrix) {
  const n = matrix.length;
  const values = matrix.map((row) => row.slice());
  const vectors = Array.from({ length: n }, (_, row) => (
    Array.from({ length: n }, (_, column) => (row === column ? 1 : 0))
  ));

  for (let iteration = 0; iteration < 80; iteration += 1) {
    let p = 0;
    let q = 1;
    let largest = 0;
    for (let row = 0; row < n; row += 1) {
      for (let column = row + 1; column < n; column += 1) {
        const magnitude = Math.abs(values[row][column]);
        if (magnitude > largest) {
          largest = magnitude;
          p = row;
          q = column;
        }
      }
    }
    if (largest < 1e-10) break;

    const app = values[p][p];
    const aqq = values[q][q];
    const apq = values[p][q];
    const tau = (aqq - app) / (2 * apq);
    const sign = tau >= 0 ? 1 : -1;
    const t = sign / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;

    for (let index = 0; index < n; index += 1) {
      if (index !== p && index !== q) {
        const aip = values[index][p];
        const aiq = values[index][q];
        values[index][p] = c * aip - s * aiq;
        values[p][index] = values[index][p];
        values[index][q] = s * aip + c * aiq;
        values[q][index] = values[index][q];
      }
    }

    values[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    values[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    values[p][q] = 0;
    values[q][p] = 0;

    for (let row = 0; row < n; row += 1) {
      const vip = vectors[row][p];
      const viq = vectors[row][q];
      vectors[row][p] = c * vip - s * viq;
      vectors[row][q] = s * vip + c * viq;
    }
  }

  return {
    values: values.map((row, index) => row[index]),
    vectors: values.map((_, index) => vectors.map((row) => row[index]))
  };
}

function telemetryTrend(history, key) {
  const points = history
    .map((sample) => ({
      x: numeric(sample.timestampMs, Number.NaN),
      y: telemetryValue(sample, key)
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  if (points.length < 2) {
    return {
      count: points.length,
      latest: points[0]?.y ?? 0,
      delta: 0,
      slopePerMinute: 0,
      average: points[0]?.y ?? null
    };
  }

  const start = points[0].x;
  const xs = points.map((point) => (point.x - start) / 60000);
  const ys = points.map((point) => point.y);
  const n = points.length;
  const sumX = xs.reduce((total, value) => total + value, 0);
  const sumY = ys.reduce((total, value) => total + value, 0);
  const sumXY = xs.reduce((total, value, index) => total + value * ys[index], 0);
  const sumX2 = xs.reduce((total, value) => total + value * value, 0);
  const denominator = n * sumX2 - sumX * sumX;
  const slopePerMinute = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;

  return {
    count: n,
    latest: ys[n - 1],
    delta: ys[n - 1] - ys[0],
    slopePerMinute,
    average: sumY / n
  };
}

function telemetryCorrelation(history, leftKey, rightKey) {
  const pairs = history
    .map((sample) => [telemetryValue(sample, leftKey), telemetryValue(sample, rightKey)])
    .filter(([left, right]) => Number.isFinite(left) && Number.isFinite(right));
  if (pairs.length < 4) return null;

  const leftAvg = pairs.reduce((total, pair) => total + pair[0], 0) / pairs.length;
  const rightAvg = pairs.reduce((total, pair) => total + pair[1], 0) / pairs.length;
  const covariance = pairs.reduce((total, [left, right]) => total + (left - leftAvg) * (right - rightAvg), 0);
  const leftVariance = pairs.reduce((total, [left]) => total + (left - leftAvg) ** 2, 0);
  const rightVariance = pairs.reduce((total, [, right]) => total + (right - rightAvg) ** 2, 0);
  if (leftVariance === 0 || rightVariance === 0) return null;
  return covariance / Math.sqrt(leftVariance * rightVariance);
}

function telemetryCovarianceStats(history, leftKey, rightKey) {
  const pairs = history
    .map((sample) => [telemetryValue(sample, leftKey), telemetryValue(sample, rightKey)])
    .filter(([left, right]) => Number.isFinite(left) && Number.isFinite(right));

  if (pairs.length < 4) {
    return {
      sampleCount: pairs.length,
      covariance: null,
      correlation: null
    };
  }

  const leftAvg = pairs.reduce((total, pair) => total + pair[0], 0) / pairs.length;
  const rightAvg = pairs.reduce((total, pair) => total + pair[1], 0) / pairs.length;
  const denominator = Math.max(1, pairs.length - 1);
  const covariance = pairs.reduce((total, [left, right]) => total + (left - leftAvg) * (right - rightAvg), 0) / denominator;
  const leftVariance = pairs.reduce((total, [left]) => total + (left - leftAvg) ** 2, 0) / denominator;
  const rightVariance = pairs.reduce((total, [, right]) => total + (right - rightAvg) ** 2, 0) / denominator;
  const correlation = leftKey === rightKey
    ? 1
    : leftVariance === 0 || rightVariance === 0
      ? null
      : covariance / Math.sqrt(leftVariance * rightVariance);

  return {
    sampleCount: pairs.length,
    covariance,
    correlation
  };
}

function telemetryCovarianceTrend(history, leftKey, rightKey) {
  return history
    .map((sample, index) => {
      const window = history.slice(Math.max(0, index - LIVE_TELEMETRY_RELATIONSHIP_WINDOW + 1), index + 1);
      const stats = telemetryCovarianceStats(window, leftKey, rightKey);
      if (!Number.isFinite(stats.covariance)) return null;
      return {
        timestampMs: sample.timestampMs,
        label: sample.label || "",
        value: stats.covariance
      };
    })
    .filter(Boolean);
}

function telemetryAverage(history, key) {
  const values = history.map((sample) => telemetryValue(sample, key)).filter(Number.isFinite);
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function formatCorrelation(value) {
  if (value === null || !Number.isFinite(value)) return "learning";
  return `r ${value >= 0 ? "+" : ""}${formatDecimal(value, 2)}`;
}

function signedRate(value, unit) {
  const parsed = numeric(value, 0);
  return `${parsed >= 0 ? "+" : ""}${formatDecimal(parsed, 1)} ${unit}`;
}

function formatDecimal(value, digits) {
  const parsed = numeric(value, 0);
  return parsed.toFixed(digits);
}

function renderAnalysisResourceGraphs(container, summary, history = analysisResourceHistory(summary)) {
  const latest = history[history.length - 1] || {};
  const latestLabel = "Current analysis snapshot";
  container.replaceChildren(
    liveTelemetryGraphCard({
      label: "Network util",
      valueKey: "networkUtilization",
      history,
      latestLabel,
      valueText: pct(latest.networkUtilization),
      note: "NIC/link utilization from run evidence",
      max: 100,
      tone: inverseGrade(latest.networkUtilization, 70, 88).key
    }),
    liveTelemetryGraphCard({
      label: "GPU util",
      valueKey: "gpu",
      history,
      latestLabel,
      valueText: pct(latest.gpu),
      note: "Accelerator utilization",
      max: 100,
      tone: grade(latest.gpu, 45, 70).key
    }),
    liveTelemetryGraphCard({
      label: "CPU prep",
      valueKey: "cpuPrep",
      history,
      latestLabel,
      valueText: pct(latest.cpuPrep),
      note: "Host-side CPU proxy",
      max: 100,
      tone: inverseGrade(latest.cpuPrep, 20, 35).key
    }),
    liveTelemetryGraphCard({
      label: "Network wait",
      valueKey: "networkWait",
      history,
      latestLabel,
      valueText: pct(latest.networkWait),
      note: "Latency/loss/stall pressure",
      max: 100,
      tone: inverseGrade(latest.networkWait, 10, 20).key
    }),
    liveTelemetryGraphCard({
      label: "NCCL time",
      valueKey: "ncclTime",
      history,
      latestLabel,
      valueText: pct(latest.ncclTime),
      note: "Collective communication time",
      max: 100,
      tone: inverseGrade(latest.ncclTime, 15, 30).key
    })
  );
}

function renderLiveTelemetryGraphs(container, machineContext, history) {
  const sampleCount = history.length;
  const latest = history[sampleCount - 1] || {};
  const latestLabel = latest.label ? `Latest sample ${latest.label}` : "Waiting for live samples";
  const networkGraphKey = Number.isFinite(latest.networkUtilization) ? "networkUtilization" : "networkThroughputBps";
  const networkGraphHasPercent = networkGraphKey === "networkUtilization";
  container.replaceChildren(
    liveTelemetryGraphCard({
      label: "CPU",
      valueKey: "cpu",
      history,
      latestLabel,
      valueText: pct(latest.cpu),
      note: "Host CPU usage",
      max: 100,
      tone: inverseGrade(latest.cpu, 70, 90).key
    }),
    liveTelemetryGraphCard({
      label: "RAM",
      valueKey: "ram",
      history,
      latestLabel,
      valueText: pct(latest.ram),
      note: latest.memoryUsedBytes ? `${formatBytes(latest.memoryUsedBytes)} used` : "Host memory usage",
      max: 100,
      tone: inverseGrade(latest.ram, 75, 90).key
    }),
    liveTelemetryGraphCard({
      label: "GPU util",
      valueKey: "gpu",
      history,
      latestLabel,
      valueText: machineContext.gpuPresent ? pct(latest.gpu) : "unavailable",
      note: machineContext.gpuPresent
        ? machineContext.gpuSampleCached
          ? `nvidia-smi cached ${Math.max(1, Math.round(machineContext.gpuSampleAgeMs / 1000))}s`
          : "nvidia-smi utilization.gpu"
        : "Driver telemetry blocked",
      max: 100,
      tone: machineContext.gpuPresent ? grade(latest.gpu, 30, 70).key : "poor"
    }),
    liveTelemetryGraphCard({
      label: "GPU power",
      valueKey: "gpuPower",
      history,
      latestLabel,
      valueText: latest.gpuPower ? `${round(latest.gpuPower)} W` : "not reported",
      note: latest.gpuTemperature ? `${round(latest.gpuTemperature)} C` : "Power counter unavailable",
      max: adaptiveGraphMax(history, "gpuPower", 450),
      tone: latest.gpuPower ? inverseGrade(latest.gpuPower, 330, 430).key : "watch"
    }),
    liveTelemetryGraphCard({
      label: "GPU memory",
      valueKey: "gpuMemory",
      history,
      latestLabel,
      valueText: machineContext.gpuPresent ? pct(latest.gpuMemory) : "unavailable",
      note: machineContext.gpuPresent ? "GPU memory in use" : "Driver telemetry blocked",
      max: 100,
      tone: machineContext.gpuPresent ? inverseGrade(latest.gpuMemory, 82, 94).key : "poor"
    }),
    liveTelemetryGraphCard({
      label: "Disk",
      valueKey: "disk",
      history,
      latestLabel,
      valueText: pct(latest.disk),
      note: "Root filesystem usage",
      max: 100,
      tone: inverseGrade(latest.disk, 75, 90).key
    }),
    liveTelemetryGraphCard({
      label: "Network util",
      valueKey: networkGraphKey,
      history,
      latestLabel,
      valueText: networkGraphHasPercent
        ? pct(latest.networkUtilization)
        : Number.isFinite(latest.networkThroughputBps) ? formatBytesPerSecond(latest.networkThroughputBps) : "learning",
      note: networkGraphHasPercent ? "NIC link utilization" : "NIC throughput",
      max: networkGraphHasPercent ? 100 : adaptiveGraphMax(history, "networkThroughputBps", 1),
      tone: networkGraphHasPercent ? inverseGrade(latest.networkUtilization, 70, 88).key : "watch"
    })
  );
}

function liveTelemetryGraphCard({ label, valueKey, history, latestLabel, valueText, note, max = 100, tone = "watch" }) {
  const item = document.createElement("div");
  item.className = "live-telemetry-card";
  item.dataset.tone = tone;

  const head = document.createElement("div");
  const labelEl = document.createElement("span");
  const valueEl = document.createElement("strong");
  labelEl.textContent = label;
  valueEl.textContent = valueText;
  head.append(labelEl, valueEl);

  const svg = buildTelemetrySparkline(history, valueKey, max);
  const noteEl = document.createElement("small");
  noteEl.textContent = `${note} | ${latestLabel}`;

  item.append(head, svg, noteEl);
  return item;
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

function adaptiveGraphMax(history, key, fallback) {
  const observed = history.map((sample) => telemetryValue(sample, key)).filter(Number.isFinite);
  if (!observed.length) return fallback;
  return Math.max(10, Math.ceil(Math.max(...observed, fallback * 0.2) * 1.25));
}

function liveResourceCard({ label, value, note, percent = null, tone = "watch" }) {
  const item = document.createElement("div");
  item.className = "live-resource-card";
  item.dataset.tone = tone;

  const labelEl = document.createElement("span");
  labelEl.textContent = label;

  const valueEl = document.createElement("strong");
  valueEl.textContent = value;

  const noteEl = document.createElement("small");
  noteEl.textContent = note;

  item.append(labelEl, valueEl, noteEl);

  const track = document.createElement("div");
  track.className = "live-resource-track";
  const fill = document.createElement("span");
  fill.style.width = Number.isFinite(percent) ? `${clamp(percent)}%` : "100%";
  track.append(fill);
  item.append(track);

  return item;
}

function renderSchedulerSimulator(simulator, summary = null) {
  const controls = document.querySelectorAll("#simulatorControls button");
  const stats = document.querySelector("#simulatorStats");
  const narrative = document.querySelector("#simulatorNarrative");
  const list = document.querySelector("#simulatorScenarios");
  const badge = document.querySelector("#simulatorBadge");
  if (!stats || !narrative || !list || !badge) return;
  const machineContext = summary ? machineDemoContext(summary) : null;

  if (machineContext) {
    controls.forEach((button) => button.setAttribute("aria-selected", "false"));
    badge.textContent = "No scheduler export";
    stats.replaceChildren(
      simulatorStat("GPU process", machineContext.gpuProcessQuerySkipped ? "skipped" : machineContext.gpuProcesses.length ? `${machineContext.gpuProcesses.length} active` : "none", machineContext.gpuProcesses.length ? "good" : "watch"),
      simulatorStat("Docker", `${machineContext.dockerContainers.length} containers`, machineContext.dockerContainers.length ? "good" : "watch"),
      simulatorStat("Services", `${machineDemoServices(machineContext.context.observedServices).length} reachable`, "good"),
      simulatorStat("Workload counters", machineContext.workloadCountersObserved ? "present" : "not collected", machineContext.workloadCountersObserved ? "good" : "watch")
    );
    narrative.replaceChildren(
      simulatorNarrativeItem("Scope", "Single Linux host observation"),
      simulatorNarrativeItem("Scheduler", "No Kubernetes, Slurm, admission, or provider scheduler export is attached"),
      simulatorNarrativeItem("Next signal", machineContext.driverUnavailable ? "Fix NVIDIA driver access before expecting GPU counters" : machineContext.gpuProcessQuerySkipped ? "Use a slower diagnostic collection when process attribution matters" : machineContext.idle ? "Start a controlled GPU workload to measure active behavior" : "Join request or training counters to the host sample")
    );
    list.replaceChildren();
    return;
  }

  const scenarios = simulator.scenarios || [];
  const recommended = simulator.recommended || scenarios[0];
  const selected = state.schedulerScenario === "recommended"
    ? recommended
    : scenarios.find((scenario) => scenario.id === state.schedulerScenario) || recommended;

  if (!selected) {
    stats.replaceChildren();
    narrative.replaceChildren();
    list.replaceChildren();
    badge.textContent = "No scenario";
    return;
  }

  controls.forEach((button) => {
    const selectedControl = button.dataset.schedulerScenario === state.schedulerScenario
      || (state.schedulerScenario === "recommended" && selected.id === recommended?.id && button.dataset.schedulerScenario === "recommended");
    button.setAttribute("aria-selected", String(selectedControl));
  });

  badge.textContent = selected.id === recommended?.id ? "Recommended" : selected.label;
  stats.replaceChildren(
    simulatorStat("GPU-hour upside", number.format(selected.recoveredGpuHours), "good"),
    simulatorStat("Dollar upside", currency.format(selected.dollarUpside), "good"),
    simulatorStat("Queue saved", `${round(selected.deltas.queueWaitMinutes)} min`, selected.deltas.queueWaitMinutes > 0 ? "good" : "watch"),
    simulatorStat("Placement fit", pct(selected.projected.placementQuality), grade(selected.projected.placementQuality, 65, 82).key)
  );

  narrative.replaceChildren(
    simulatorNarrativeItem("Scenario", selected.label),
    simulatorNarrativeItem("Action", selected.action),
    simulatorNarrativeItem("Projection", `${pct(selected.projected.usefulCompute)} useful compute, ${round(selected.projected.queueWaitMinutes)} minute queue wait, ${pct(selected.projected.crossPodTraffic)} cross-pod traffic.`)
  );

  list.replaceChildren();
  scenarios.forEach((scenario) => {
    list.append(simulatorScenarioCard(scenario, selected.id === scenario.id, recommended?.id === scenario.id));
  });
}

function simulatorStat(label, value, tone) {
  const item = document.createElement("div");
  item.dataset.tone = tone;

  const labelEl = document.createElement("span");
  const valueEl = document.createElement("strong");
  labelEl.textContent = label;
  valueEl.textContent = value;
  item.append(labelEl, valueEl);

  return item;
}

function simulatorNarrativeItem(label, value) {
  const item = document.createElement("div");
  const labelEl = document.createElement("span");
  const valueEl = document.createElement("strong");
  labelEl.textContent = label;
  valueEl.textContent = value;
  item.append(labelEl, valueEl);
  return item;
}

function simulatorScenarioCard(scenario, selected, recommended) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "simulator-scenario";
  button.setAttribute("aria-selected", String(selected));
  button.addEventListener("click", () => {
    state.schedulerScenario = scenario.id;
    render();
  });

  const head = document.createElement("div");
  const title = document.createElement("strong");
  const badge = document.createElement("span");
  title.textContent = scenario.label;
  badge.textContent = recommended ? "Recommended" : `${pct(scenario.confidence)} confidence`;
  head.append(title, badge);

  const metrics = document.createElement("div");
  metrics.className = "simulator-scenario-metrics";
  metrics.append(
    simulatorMiniMetric(currency.format(scenario.dollarUpside), "upside"),
    simulatorMiniMetric(`${round(scenario.deltas.queueWaitMinutes)} min`, "queue"),
    simulatorMiniMetric(`${round(scenario.deltas.usefulCompute)} pts`, "useful")
  );

  const note = document.createElement("small");
  note.textContent = scenario.evidence;

  button.append(head, metrics, note);
  return button;
}

function simulatorMiniMetric(value, label) {
  const item = document.createElement("span");
  const valueEl = document.createElement("strong");
  const labelEl = document.createElement("small");
  valueEl.textContent = value;
  labelEl.textContent = label;
  item.append(valueEl, labelEl);
  return item;
}

function renderGrafanaHandoff(summary) {
  const badge = document.querySelector("#grafanaBadge");
  const context = document.querySelector("#grafanaContext");
  const links = document.querySelector("#grafanaLinks");
  if (!badge || !context || !links) return;
  const machineContext = machineDemoContext(summary);

  if (machineContext) {
    const services = machineDemoServices(machineContext.context.observedServices);
    const grafanaLinks = [
      machineContext.context.grafanaDashboardUrl ? {
        label: machineContext.context.grafanaDashboardTitle || "turbalance Fleet Runtime",
        type: "dashboard",
        url: machineContext.context.grafanaDashboardUrl
      } : null,
      machineContext.context.grafanaExploreUrl ? {
        label: "Explore",
        type: "explore",
        url: machineContext.context.grafanaExploreUrl
      } : null
    ].filter(Boolean);
    badge.textContent = services.includes("grafana") ? "Service reachable" : "No Grafana";
    context.replaceChildren(
      grafanaContextItem("Dashboard", machineContext.context.grafanaDashboardTitle || "No dashboard overlay imported"),
      grafanaContextItem("Datasource", machineContext.context.grafanaDatasourceName || (services.includes("node-exporter") ? "node-exporter reachable" : "No datasource export")),
      grafanaContextItem("Window", "live host sample"),
      grafanaContextItem("Variables", machineContext.host)
    );
    links.replaceChildren();
    if (grafanaLinks.length) {
      grafanaLinks.forEach((link) => links.append(grafanaLinkItem(link)));
      return;
    }
    const empty = document.createElement("div");
    empty.className = "grafana-empty";
    empty.textContent = services.includes("grafana")
      ? "Grafana health is reachable, but no dashboard/export contract is attached to this live sample."
      : "No Grafana service was detected on this host.";
    links.append(empty);
    return;
  }

  const grafana = summary.grafana || {};
  const sourceCount = numeric(grafana.sourceCount);
  const linkItems = grafana.links || [];

  badge.textContent = sourceCount > 0
    ? `${linkItems.length} ${linkItems.length === 1 ? "link" : "links"}`
    : "No overlay";

  context.replaceChildren(
    grafanaContextItem("Dashboard", listLabel(grafana.dashboards, 2)),
    grafanaContextItem("Datasource", listLabel(grafana.datasources, 2)),
    grafanaContextItem("Window", grafanaTimeRangeLabel(grafana.timeRange)),
    grafanaContextItem("Variables", grafana.variableKeys?.length ? grafana.variableKeys.slice(0, 4).join(", ") : "n/a")
  );

  links.replaceChildren();
  if (linkItems.length === 0) {
    const empty = document.createElement("div");
    empty.className = "grafana-empty";
    empty.textContent = "No Grafana links attached";
    links.append(empty);
    return;
  }

  linkItems.slice(0, 5).forEach((link) => {
    links.append(grafanaLinkItem(link));
  });
}

function grafanaContextItem(label, value) {
  const item = document.createElement("div");
  const labelEl = document.createElement("span");
  const valueEl = document.createElement("strong");
  labelEl.textContent = label;
  valueEl.textContent = value || "n/a";
  item.append(labelEl, valueEl);
  return item;
}

function grafanaLinkItem(link) {
  const item = document.createElement("a");
  item.className = "grafana-link";
  item.href = safeExternalUrl(link.url) || "#";
  item.target = "_blank";
  item.rel = "noopener noreferrer";
  item.dataset.type = String(link.type || "dashboard").toLowerCase();

  const title = document.createElement("strong");
  const meta = document.createElement("span");
  title.textContent = link.label || "Grafana link";
  meta.textContent = titleCase(link.type || "dashboard");
  item.append(title, meta);

  return item;
}

function grafanaTimeRangeLabel(timeRange = {}) {
  if (!timeRange.from && !timeRange.to) return "n/a";
  return `${timeRange.from || "start"} to ${timeRange.to || "now"}`;
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""), window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
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

function renderTaskMemory(memory) {
  const panel = document.querySelector("#taskMemoryPanel");
  const badge = document.querySelector("#taskMemoryBadge");
  const identity = document.querySelector("#taskMemoryIdentity");
  const resources = document.querySelector("#taskMemoryResources");
  const changes = document.querySelector("#taskMemoryChanges");
  if (!panel || !badge || !identity || !resources || !changes) return;

  if (!memory?.visible || !memory.current) {
    panel.hidden = true;
    identity.replaceChildren();
    resources.replaceChildren();
    changes.replaceChildren();
    return;
  }

  const current = memory.current;
  const resource = current.resources || {};
  const category = current.categories || {};

  panel.hidden = false;
  badge.textContent = taskMemoryBadgeText(memory);
  badge.dataset.tone = taskMemoryTone(memory.differenceLevel);

  identity.replaceChildren(
    taskMemoryIdentityItem("Task family", current.taskLabel),
    taskMemoryIdentityItem("Current run", listLabel(current.runIds.length ? current.runIds : [current.key], 2)),
    taskMemoryIdentityItem("Category", taskMemoryCategoryLabel(category.primary)),
    taskMemoryIdentityItem("History", memory.previousRuns > 0 ? `${memory.previousRuns} previous ${memory.previousRuns === 1 ? "run" : "runs"}` : "Learning")
  );

  resources.replaceChildren(
    taskMemoryResourceCard("Accelerators", `${number.format(resource.gpus)} GPUs`, listLabel(resource.gpuModels, 2) || "GPU model unknown"),
    taskMemoryResourceCard("Placement", `${number.format(resource.nodes.length)} nodes`, `${listLabel(resource.clusters, 2)} | ${number.format(resource.partialNodes.length)} partial`),
    taskMemoryResourceCard("Scheduler", listLabel(resource.queueNames, 2) || "No queue", listLabel(resource.requestedGpuShapes, 2) || listLabel(resource.priorityClasses, 2) || "No shape"),
    taskMemoryResourceCard("Owner", listLabel(resource.tenants, 1), listLabel(resource.reservations, 1)),
    taskMemoryResourceCard("Sources", `${number.format(resource.adapters.length)} adapters`, listLabel(resource.adapters, 3) || "Seeded run")
  );

  changes.replaceChildren();
  const changeRows = [
    ...(memory.categoryChange ? [taskMemoryCategoryChangeRow(memory.categoryChange)] : []),
    ...memory.significantChanges.slice(0, 5).map(taskMemoryMetricChangeRow),
    ...memory.resourceChanges.slice(0, 3).map(taskMemoryResourceChangeRow)
  ];

  if (changeRows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "task-memory-empty";
    empty.textContent = memory.summary;
    changes.append(empty);
    return;
  }

  changeRows.forEach((row) => changes.append(row));
}

function taskMemoryBadgeText(memory) {
  if (memory.differenceLevel === "learning") return "Learning";
  if (memory.differenceLevel === "same") return "Stable";
  if (memory.differenceLevel === "major") return "Major drift";
  if (memory.differenceLevel === "changed") return "Changed";
  if (memory.differenceLevel === "minor") return "Minor drift";
  return "Task memory";
}

function taskMemoryTone(level) {
  if (level === "same") return "good";
  if (level === "major" || level === "changed") return "poor";
  return "watch";
}

function taskMemoryIdentityItem(label, value) {
  const item = document.createElement("div");
  const labelEl = document.createElement("span");
  const valueEl = document.createElement("strong");
  labelEl.textContent = label;
  valueEl.textContent = value || "n/a";
  item.append(labelEl, valueEl);
  return item;
}

function taskMemoryResourceCard(label, value, note) {
  const card = document.createElement("div");
  card.className = "task-memory-resource";

  const labelEl = document.createElement("span");
  const valueEl = document.createElement("strong");
  const noteEl = document.createElement("small");
  labelEl.textContent = label;
  valueEl.textContent = value || "n/a";
  noteEl.textContent = note || "n/a";

  card.append(labelEl, valueEl, noteEl);
  return card;
}

function taskMemoryMetricChangeRow(change) {
  const row = document.createElement("div");
  row.className = "task-memory-change";
  row.dataset.direction = change.direction;

  const label = document.createElement("strong");
  const value = document.createElement("span");
  const note = document.createElement("small");

  label.textContent = change.label;
  value.textContent = `${formatTaskMetricValue(change.current, change.unit)} now`;
  note.textContent = `${formatTaskDelta(change.delta, change.unit)} vs ${formatTaskMetricValue(change.baseline, change.unit)} historical average`;

  row.append(label, value, note);
  return row;
}

function taskMemoryCategoryChangeRow(change) {
  const row = document.createElement("div");
  row.className = "task-memory-change";
  row.dataset.direction = "changed";

  const label = document.createElement("strong");
  const value = document.createElement("span");
  const note = document.createElement("small");

  label.textContent = "Utilization category";
  value.textContent = taskMemoryCategoryLabel(change.current);
  note.textContent = `Was ${taskMemoryCategoryLabel(change.previous)}`;

  row.append(label, value, note);
  return row;
}

function taskMemoryResourceChangeRow(change) {
  const row = document.createElement("div");
  row.className = "task-memory-change";
  row.dataset.direction = "changed";

  const label = document.createElement("strong");
  const value = document.createElement("span");
  const note = document.createElement("small");

  label.textContent = change.label;
  value.textContent = change.added.length ? `Added ${listLabel(change.added, 2)}` : "Resource removed";
  note.textContent = change.text;

  row.append(label, value, note);
  return row;
}

function taskMemoryCategoryLabel(value) {
  return titleCase(String(value || "uncategorized").replace(/[-_]+/g, " "));
}

function formatTaskMetricValue(value, unit) {
  if (unit === "USD") return currency.format(value);
  if (unit === "points") return pct(value);
  if (unit === "minutes") return `${round(value)} min`;
  if (unit === "count") return number.format(value);
  return number.format(value);
}

function formatTaskDelta(value, unit) {
  if (unit === "USD") return signedCurrency(value);
  if (unit === "points") return `${signedNumber(value)} pts`;
  if (unit === "minutes") return `${signedNumber(value)} min`;
  if (unit === "count") return signedNumber(value);
  if (unit === "GPU-hours") return `${signedNumber(value)} GPU-hours`;
  return signedNumber(value);
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
      metric: `${pct(summary.ncclTime)} collectives time, ${pct(summary.networkWait)} network wait, ${pct(summary.networkUtilization)} network utilization`,
      status: inverseGrade(summary.ncclTime + summary.networkWait + summary.networkUtilization * 0.16, 18, 34)
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
  const machineContext = machineDemoContext(summary);
  if (machineContext) {
    document.querySelector("#primaryBottleneck").textContent = machineContext.driverUnavailable ? "NVIDIA telemetry unavailable" : machineContext.noGpu ? "Host-only telemetry" : machineContext.idle ? "Idle GPU capacity" : "Live host utilization";
    document.querySelector("#secondaryBottleneck").textContent = machineContext.driverUnavailable ? "nvidia-smi cannot reach driver" : machineContext.gpuProcessQuerySkipped ? "Process query skipped for 1s refresh" : machineContext.gpuProcesses.length ? "Active NVIDIA process" : "No NVIDIA compute process";
    document.querySelector("#improvementEstimate").textContent = machineContext.driverUnavailable ? "Repair driver access or use a supported GPU counter source, then collect again." : machineContext.gpuProcessQuerySkipped ? "Use high-rate graphs for resource movement, then run slower process attribution only when needed." : machineContext.idle ? "Start a controlled workload, then compare the next live sample." : "Attach request or training counters before tuning.";
    document.querySelector("#bottleneckBadge").textContent = "Live host";

    const list = document.querySelector("#bottleneckBars");
    list.replaceChildren(
      progressRow({
        className: "bar-row",
        fillClass: "bar-fill",
        label: "GPU utilization",
        value: machineContext.gpuUtilizationPct,
        suffix: "observed",
        note: machineContext.driverUnavailable ? machineContext.gpuError || "nvidia-smi unavailable" : "nvidia-smi utilization.gpu"
      }),
      progressRow({
        className: "bar-row",
        fillClass: "bar-fill",
        label: "GPU memory",
        value: machineContext.gpuMemoryUsedPct,
        suffix: "observed",
        note: `${number.format(machineContext.gpuMemoryUsedMiB)} / ${number.format(machineContext.gpuMemoryTotalMiB)} MiB`
      }),
      progressRow({
        className: "bar-row",
        fillClass: "bar-fill",
        label: "CPU usage",
        value: machineContext.cpuUsagePct,
        suffix: "observed",
        note: "Sampled from host CPU counters"
      }),
      progressRow({
        className: "bar-row",
        fillClass: "bar-fill",
        label: "Memory used",
        value: machineContext.memoryUsedPct,
        suffix: "observed",
        note: "Host memory pressure"
      }),
      progressRow({
        className: "bar-row",
        fillClass: "bar-fill",
        label: "Disk used",
        value: machineContext.diskUsedPct,
        suffix: "observed",
        note: "Root filesystem usage"
      })
    );
    return;
  }

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

function renderProviderLens(summary, provider, classifier) {
  const badge = document.querySelector("#providerBadge");
  const context = document.querySelector("#providerContext");
  const stats = document.querySelector("#providerStats");
  const actions = document.querySelector("#providerActions");
  const providerData = summary.provider || {};
  const sloData = summary.slo || {};
  const machineContext = machineDemoContext(summary);

  if (machineContext) {
    badge.textContent = "Local host";
    context.replaceChildren(
      providerContextItem("Host", machineContext.host),
      providerContextItem("OS", machineContext.context.os || "unknown"),
      providerContextItem("GPU", machineContext.gpuModel),
      providerContextItem("Services", machineContext.services)
    );
    stats.replaceChildren(
      providerStat({
        label: "GPU temp",
        value: machineContext.gpuTemperatureC ? `${round(machineContext.gpuTemperatureC)} C` : "n/a",
        note: machineContext.gpuPowerWatts ? `${round(machineContext.gpuPowerWatts)} W draw` : "Power not reported",
        grade: machineContext.gpuTemperatureC ? inverseGrade(machineContext.gpuTemperatureC, 75, 86).key : "watch"
      }),
      providerStat({
        label: "CPU usage",
        value: pct(machineContext.cpuUsagePct),
        note: `${machineContext.context.cpuCount || "n/a"} logical CPUs`,
        grade: inverseGrade(machineContext.cpuUsagePct, 70, 90).key
      }),
      providerStat({
        label: "Memory used",
        value: pct(machineContext.memoryUsedPct),
        note: "Host memory pressure",
        grade: inverseGrade(machineContext.memoryUsedPct, 75, 90).key
      }),
      providerStat({
        label: "Disk used",
        value: pct(machineContext.diskUsedPct),
        note: "Root filesystem",
        grade: inverseGrade(machineContext.diskUsedPct, 75, 90).key
      })
    );
    actions.replaceChildren(
      providerAction("No provider billing, SLO, Kubernetes, DCGM, eBPF, or scheduler export is attached to this live machine sample."),
      providerAction(machineContext.driverUnavailable ? "Fix NVIDIA driver telemetry on this host before presenting GPU utilization from it." : machineContext.idle ? "Start a controlled local GPU workload before the demo to show active utilization changing live." : "Join request logs or training counters before making workload-efficiency claims."),
      providerAction("Use provider pilot bundles only when approved source-system exports are available.")
    );
    return;
  }

  badge.textContent = listLabel(providerData.customerTiers, 1);
  context.replaceChildren(
    providerContextItem("Tenant", listLabel(providerData.tenants)),
    providerContextItem("Account", listLabel(providerData.accounts)),
    providerContextItem("Reservation", listLabel(providerData.reservations)),
    providerContextItem("Billing", listLabel(providerData.billingModels))
  );

  stats.replaceChildren(
    providerStat({
      label: "Sellable waste",
      value: currency.format(provider.sellableWasteValue),
      note: `${number.format(summary.wastedGpuHours)} GPU-hours not useful`,
      grade: inverseGrade(provider.sellableWastePct, 22, 42).key
    }),
    providerStat({
      label: "Commit burn",
      value: provider.committedGpuHours > 0 ? pct(provider.reservationBurnPct) : "n/a",
      note: provider.committedGpuHours > 0
        ? `${number.format(summary.allocatedGpuHours)} / ${number.format(provider.committedGpuHours)} committed GPU-hours`
        : "No commitment metadata",
      grade: provider.committedGpuHours > 0 ? grade(Math.min(provider.reservationBurnPct, 100), 35, 65).key : "watch"
    }),
    providerStat({
      label: "Queue SLO",
      value: provider.queueSloPct > 0 ? pct(provider.queueSloPct) : "n/a",
      note: queueSloNote(provider),
      grade: provider.queueSloPct > 0 ? inverseGrade(provider.queueSloPct, 100, 140).key : "watch"
    }),
    providerStat({
      label: "Gross margin",
      value: provider.hasFloorCost ? pct(provider.grossMarginPct) : "n/a",
      note: provider.hasFloorCost ? `${currency.format(provider.grossMargin)} after floor cost` : "Floor cost missing",
      grade: provider.hasFloorCost ? grade(provider.grossMarginPct, 22, 38).key : "watch"
    })
  );

  actions.replaceChildren(
    ...providerActionsFor(summary, provider, classifier, sloData).map(providerAction)
  );
}

function providerContextItem(label, value) {
  const item = document.createElement("div");
  const labelEl = document.createElement("span");
  const valueEl = document.createElement("strong");

  labelEl.textContent = label;
  valueEl.textContent = value;
  item.append(labelEl, valueEl);

  return item;
}

function providerStat({ label, value, note, grade: gradeKey }) {
  const item = document.createElement("div");
  const labelEl = document.createElement("span");
  const valueEl = document.createElement("strong");
  const noteEl = document.createElement("small");

  item.dataset.grade = gradeKey;
  labelEl.textContent = label;
  valueEl.textContent = value;
  noteEl.textContent = note;
  item.append(labelEl, valueEl, noteEl);

  return item;
}

function providerAction(text) {
  const item = document.createElement("div");
  item.className = "provider-action";
  item.textContent = text;
  return item;
}

function renderProviderSummaryTables() {
  const container = document.querySelector("#providerSummaryTables");
  const badge = document.querySelector("#providerSummaryBadge");
  if (!container || !badge) return;

  const rows = providerPortfolioRows();
  const queueMisses = rows
    .filter((row) => row.queueSloPct > 100)
    .sort((a, b) => b.queueSloPct - a.queueSloPct)
    .slice(0, 4);
  const marginRows = rows
    .filter((row) => row.hasFloorCost)
    .sort((a, b) => a.grossMarginPct - b.grossMarginPct)
    .slice(0, 4);
  const noiseRows = rows
    .filter((row) => row.noiseEvents > 0 || row.contentionPct > 0)
    .sort((a, b) => (b.noiseEvents * 100 + b.contentionPct) - (a.noiseEvents * 100 + a.contentionPct))
    .slice(0, 4);

  badge.textContent = `${rows.length} ${rows.length === 1 ? "group" : "groups"}`;
  container.replaceChildren(
    providerSummaryTable({
      title: "Top sellable waste",
      rows: [...rows].sort((a, b) => b.sellableWasteValue - a.sellableWasteValue).slice(0, 4),
      empty: "No sellable waste",
      value: (row) => currency.format(row.sellableWasteValue),
      note: (row) => `${number.format(row.wastedGpuHours)} wasted GPU-hours`
    }),
    providerSummaryTable({
      title: "Queue SLO misses",
      rows: queueMisses,
      empty: "No queue misses",
      value: (row) => pct(row.queueSloPct),
      note: (row) => `${round(row.queueSloGapMinutes)} minutes over target`
    }),
    providerSummaryTable({
      title: "Margin pressure",
      rows: marginRows,
      empty: "No floor cost metadata",
      value: (row) => pct(row.grossMarginPct),
      note: (row) => `${currency.format(row.grossMargin)} after floor cost`
    }),
    providerSummaryTable({
      title: "Noisy neighbor",
      rows: noiseRows,
      empty: "No contention events",
      value: (row) => `${number.format(row.noiseEvents)}`,
      note: (row) => `${pct(row.contentionPct)} contention`
    })
  );
}

function providerPortfolioRows() {
  return ["tenant", "account", "reservation"].flatMap((scope) => (
    buildEntries(scope).map((entry) => {
      const summary = summarizeEntry(entry);
      const provider = providerEconomics(summary);
      const classifier = classifyBottlenecks(summary);

      return {
        key: entry.key,
        label: entry.label,
        scope,
        jobCount: summary.count,
        bottleneck: classifier.primary.short,
        allocatedGpuHours: summary.allocatedGpuHours,
        wastedGpuHours: summary.wastedGpuHours,
        noiseEvents: summary.noiseEvents,
        contentionPct: summary.contentionPct,
        sellableWasteValue: provider.sellableWasteValue,
        queueSloPct: provider.queueSloPct,
        queueSloGapMinutes: provider.queueSloGapMinutes,
        grossMarginPct: provider.grossMarginPct,
        grossMargin: provider.grossMargin,
        hasFloorCost: provider.hasFloorCost
      };
    })
  ));
}

function providerSummaryTable({ title, rows, empty, value, note }) {
  const table = document.createElement("section");
  table.className = "provider-summary-table";

  const heading = document.createElement("h3");
  heading.textContent = title;

  const list = document.createElement("div");
  list.className = "provider-summary-list";

  if (rows.length === 0) {
    const emptyEl = document.createElement("div");
    emptyEl.className = "provider-summary-empty";
    emptyEl.textContent = empty;
    list.append(emptyEl);
  } else {
    rows.forEach((row) => {
      list.append(providerSummaryRow(row, value(row), note(row)));
    });
  }

  table.append(heading, list);
  return table;
}

function providerSummaryRow(row, value, note) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "provider-summary-row";
  button.setAttribute("aria-selected", String(row.scope === state.scope && row.key === state.selectedKey));
  button.addEventListener("click", () => {
    state.scope = row.scope;
    state.selectedKey = row.key;
    render();
  });

  const copy = document.createElement("div");
  copy.className = "provider-summary-copy";
  const label = document.createElement("strong");
  const meta = document.createElement("span");
  const metric = document.createElement("strong");

  metric.className = "summary-value";
  label.textContent = row.label;
  meta.textContent = `${scopeLabel(row.scope)} | ${row.jobCount} ${row.jobCount === 1 ? "job" : "jobs"} | ${row.bottleneck} | ${note}`;
  metric.textContent = value;

  copy.append(label, meta);
  button.append(copy, metric);

  return button;
}

function renderOpportunityCenter(engine) {
  const badge = document.querySelector("#opportunityBadge");
  const stats = document.querySelector("#opportunityStats");
  const list = document.querySelector("#opportunityList");
  if (!badge || !stats || !list) return;

  const opportunities = engine.opportunities || [];
  badge.textContent = `${opportunities.length} ${opportunities.length === 1 ? "open" : "open"}`;
  badge.dataset.severity = engine.highestSeverity;
  stats.replaceChildren(
    opportunityStat("Recoverable value", currency.format(engine.totalImpactDollars), engine.highestSeverity),
    opportunityStat("GPU-hour upside", number.format(engine.totalImpactGpuHours), engine.highestSeverity),
    opportunityStat("Top severity", titleCase(engine.highestSeverity), engine.highestSeverity),
    opportunityStat("Confidence", opportunities[0] ? pct(opportunities[0].confidence) : "n/a", confidenceTone(opportunities[0]?.confidence))
  );

  list.replaceChildren();
  if (opportunities.length === 0) {
    const empty = document.createElement("div");
    empty.className = "opportunity-empty";
    empty.textContent = "No ranked opportunities";
    list.append(empty);
    return;
  }

  opportunities.slice(0, 5).forEach((opportunity) => {
    list.append(opportunityRow(opportunity));
  });
}

function opportunityStat(label, value, tone) {
  const item = document.createElement("div");
  item.dataset.tone = tone;

  const labelEl = document.createElement("span");
  const valueEl = document.createElement("strong");

  labelEl.textContent = label;
  valueEl.textContent = value;
  item.append(labelEl, valueEl);

  return item;
}

function opportunityRow(opportunity) {
  const row = document.createElement("article");
  row.className = "opportunity-row";
  row.dataset.severity = opportunity.severity;

  const head = document.createElement("div");
  head.className = "opportunity-row-head";

  const copy = document.createElement("div");
  const category = document.createElement("span");
  const title = document.createElement("strong");
  category.className = "opportunity-category";
  category.textContent = opportunity.category;
  title.textContent = opportunity.title;
  copy.append(category, title);

  const impact = document.createElement("strong");
  impact.className = "opportunity-impact";
  impact.textContent = opportunity.impactDollars > 0
    ? currency.format(opportunity.impactDollars)
    : `${number.format(opportunity.impactGpuHours)} GPU-hours`;

  head.append(copy, impact);

  const meta = document.createElement("div");
  meta.className = "opportunity-meta";
  meta.append(
    opportunityPill(titleCase(opportunity.severity)),
    opportunityPill(`${pct(opportunity.confidence)} confidence`),
    opportunityPill(opportunity.owner)
  );

  const evidence = document.createElement("p");
  evidence.textContent = opportunity.evidence;

  const recommendation = document.createElement("small");
  recommendation.textContent = opportunity.recommendation;

  row.append(head, meta, evidence, recommendation);
  return row;
}

function opportunityPill(text) {
  const pill = document.createElement("span");
  pill.className = "opportunity-pill";
  pill.textContent = text || "Unassigned";
  return pill;
}

function confidenceTone(confidence) {
  const value = numeric(confidence);
  if (value >= 74) return "high";
  if (value >= 58) return "medium";
  return "low";
}

function providerActionsFor(summary, provider, classifier, sloData) {
  const tenant = listLabel(summary.provider?.tenants, 1);
  const reservation = listLabel(summary.provider?.reservations, 1);
  const priority = listLabel(sloData.priorities, 1).toUpperCase();
  const actions = [];

  if (provider.queueSloGapMinutes > 0) {
    actions.push(`${priority} start-risk: queue wait is ${round(provider.queueSloGapMinutes)} minutes over target for ${tenant}.`);
  }

  if (provider.sellableWasteValue > 0) {
    actions.push(`Customer-success QBR: ${currency.format(provider.sellableWasteValue)} of sellable GPU time is tied to non-useful work in ${reservation}.`);
  }

  if (classifier.primary.short === "Communication" || classifier.primary.short === "Placement") {
    actions.push(`Scheduler action: repack ${reservation} into fewer locality groups before the next reserved burst.`);
  } else if (classifier.primary.short === "Noisy neighbor") {
    actions.push(`Tenant trust: isolate ${tenant} during congestion windows and compare contention against ticket timing.`);
  } else {
    actions.push(`Capacity planning: use the efficiency gap to decide whether this demand should renew, retune, or move to a different pool.`);
  }

  if (provider.efficiencyGap > 0) {
    actions.push(`Renewal risk: useful compute is ${round(provider.efficiencyGap)} points below the target efficiency in the contract/SLO overlay.`);
  }

  return actions.slice(0, 3);
}

function queueSloNote(provider) {
  if (provider.queueSloPct <= 0) return "No start target";
  if (provider.queueSloGapMinutes > 0) return `${round(provider.queueSloGapMinutes)} minutes over target`;
  return `${round(Math.abs(provider.queueSloGapMinutes))} minutes inside target`;
}

function listLabel(values = [], max = 2) {
  const labels = values.filter(Boolean);
  if (labels.length <= max) return labels.join(", ") || "n/a";
  return `${labels.slice(0, max).join(", ")} +${labels.length - max}`;
}

function hasProviderContext(summary) {
  return (summary.sourceItems || []).some((job) => (
    Boolean(job.source?.refs?.tenant || job.source?.refs?.account || job.source?.refs?.reservation)
    || Boolean(job.commercial?.contractId)
    || Boolean(job.slo?.supportTicketId)
    || Number.isFinite(job.commercial?.listGpuHourRate)
    || Number.isFinite(job.commercial?.floorGpuHourCost)
  ));
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
  const provider = providerEconomics(summary);
  const tenant = listLabel(summary.provider?.tenants, 1);
  const reservation = listLabel(summary.provider?.reservations, 1);
  const workMetric = summary.tokensM > 0
    ? `${currency.format(summary.costPerMillionTokens)} per million training tokens`
    : summary.inferenceRequestsM > 0
      ? `${currency.format(summary.costPerMillionRequests)} per million inference requests`
      : `${currency.format(summary.costPerStep)} per training step`;
  const providerLine = hasProviderContext(summary)
    ? `Provider lens: ${tenant} shows ${currency.format(provider.sellableWasteValue)} of sellable waste value on ${reservation}.`
    : "";
  const report = [
    `${summary.label} achieved ${pct(summary.usefulCompute)} accelerator efficiency in ${state.window.toLowerCase()}, consuming ${number.format(summary.allocatedGpuHours)} GPU-hours with ${number.format(summary.usefulGpuHours)} useful GPU-hours.`,
    `Estimated waste is ${number.format(summary.wastedGpuHours)} GPU-hours (${currency.format(summary.wasteDollars)}), mostly from ${primary} with ${secondary} as the secondary bottleneck.`,
    `Current useful-work cost is ${workMetric}.`,
    providerLine,
    recommendationFor(summary, classifier)
  ].filter(Boolean).join(" ");

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

function providerEconomics(summary) {
  return analytics.summarizeProviderEconomics(summary, { rate: state.rate });
}

function simulateScheduler(summary) {
  return analytics.simulateSchedulerScenarios(summary, { rate: state.rate });
}

function generateOpportunities(summary, classifier, provider) {
  return analytics.generateOpportunities(summary, {
    classifier,
    provider,
    rate: state.rate
  });
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

function sumCommercialHours(items, field) {
  return items.reduce((total, job) => total + numeric(job.commercial?.[field]), 0);
}

function sumUniqueCommercialHours(items, field) {
  const keyedHours = new Map();
  let unkeyedHours = 0;

  items.forEach((job) => {
    const value = numeric(job.commercial?.[field]);
    if (value <= 0) return;

    const reservationKey = job.source?.refs?.reservation || job.commercial?.contractId;
    if (!reservationKey) {
      unkeyedHours += value;
      return;
    }

    keyedHours.set(reservationKey, Math.max(keyedHours.get(reservationKey) || 0, value));
  });

  return Array.from(keyedHours.values()).reduce((total, value) => total + value, unkeyedHours);
}

function weightedOptionalAverage(items, getter, weightKey) {
  const weightedItems = items
    .map((item) => ({
      value: Number(getter(item)),
      weight: Number(item[weightKey]) || 0
    }))
    .filter((item) => Number.isFinite(item.value) && item.value > 0 && item.weight > 0);

  const totalWeight = weightedItems.reduce((total, item) => total + item.weight, 0);
  if (totalWeight === 0) return Number.NaN;

  return weightedItems.reduce((total, item) => total + item.value * item.weight, 0) / totalWeight;
}

function knownLabels(values, fallback) {
  const labels = unique(
    values
      .map((value) => String(value || "").trim())
      .filter((value) => value && value !== "Unknown")
  );

  return labels.length > 0 ? labels : [fallback];
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

function uniqueBy(values, keyFn) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyFn(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function formatBytes(value) {
  const bytes = numeric(value, 0);
  if (bytes <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const scaled = bytes / (1024 ** index);
  return `${scaled >= 10 || index === 0 ? round(scaled) : scaled.toFixed(1)} ${units[index]}`;
}

function formatBytesPerSecond(value) {
  return `${formatBytes(value)}/s`;
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
    cluster: "Clusters",
    tenant: "Tenants",
    account: "Accounts",
    reservation: "Reservations"
  };
  return titles[scope] || "Inventory";
}

function scopeLabel(scope) {
  const labels = {
    job: "Job",
    model: "Model",
    user: "User",
    team: "Team",
    cluster: "Cluster",
    tenant: "Tenant",
    account: "Account",
    reservation: "Reservation"
  };
  return labels[scope] || "Scope";
}

function inventoryMeta(summary) {
  if (summary.scope === "job") {
    const job = summary.jobs[0];
    return `${job.tenant} | ${job.team} | ${job.gpus} GPUs | ${job.status}`;
  }

  if (summary.scope === "tenant" || summary.scope === "account" || summary.scope === "reservation") {
    return `${summary.count} jobs | ${number.format(summary.allocatedGpuHours)} GPU-hours | ${listLabel(summary.provider.billingModels, 1)}`;
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

  await copyTextToClipboard(report);

  button.classList.add("copy-flash");
  window.setTimeout(() => button.classList.remove("copy-flash"), 900);
}

async function copyTextToClipboard(text) {
  const value = String(text || "");
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the textarea copy path for non-secure local HTTP contexts.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.append(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}
