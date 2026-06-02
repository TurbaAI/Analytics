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
const SNAPSHOT_SCOPES = ["job", "model", "user", "team", "cluster", "tenant", "account", "reservation"];
const SNAPSHOT_LIMIT = 360;
const MACHINE_DEMO_REFRESH_MS = 5000;
const LIVE_TELEMETRY_LIMIT = 72;

const DEFAULT_INGESTION = applySourceImports(SAMPLE_INGESTION, SAMPLE_SOURCE_EXPORTS, ncclTraceFixtures);
let workspaceStore = loadWorkspaceStore(DEFAULT_INGESTION);
let activeIngestion = applyPersistedBaselines(workspaceStore.ingestion, workspaceStore.baselines);
let jobs = normalizeIngestion(activeIngestion);
let snapshotHistory = normalizeSnapshotStore(workspaceStore.snapshots);
let liveTelemetryHistory = [];
let machineDemoRefreshTimer = null;
let machineDemoLoadInFlight = false;

const state = {
  scope: "job",
  selectedKey: "run-7421",
  window: "Last 24 hours",
  rate: 6.2,
  samePod: false,
  trendMetric: "usefulCompute",
  schedulerScenario: "recommended",
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
  bindEvents();
  prefillMachineDemoUrl();
  render();
  maybeAutoLoadMachineDemoBundle();
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
          networkWait
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
    ["prometheus", "dcgm", "kubernetes", "scheduler", "grafana", "ebpf", "provider", "opportunities"].forEach((key) => {
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
    ["prometheus", "dcgm", "kubernetes", "scheduler", "grafana", "ebpf", "provider", "opportunities"].forEach((key) => {
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

function isKnownMachineDemoHost() {
  return [
    "192.168.10.101",
    "nuc14e",
    "192.168.10.20",
    "spark1",
    "100.96.89.98",
    "dgx-pat"
  ].includes(window.location.hostname.toLowerCase());
}

function machineDemoBundleUrl() {
  const params = new URLSearchParams(window.location.search);
  return parseImportUrl(params.get("bundle") || "build/demo/live-machine-bundle.json");
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
    snapshots: snapshotHistory
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
    snapshots: snapshotHistory
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
    "imported opportunity free text"
    ]
  };

  return redacted;
}

function buildRedactionPlan(store) {
  const ingestion = store.ingestion || {};
  const runs = Array.isArray(ingestion.runs) ? ingestion.runs : [];
  const entities = ingestion.entities || {};
  const plan = {
    entities: {},
    runs: buildValueMap(runs.map((run) => run.id), "run"),
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
    schedulerNames: buildValueMap(flattenRunValues(runs, (run) => [run.sourceContext?.schedulerName, run.schedulerEvidence?.schedulerName, ...(run.schedulerEvidence?.schedulerNames || [])]), "scheduler"),
    schedulerQueues: buildValueMap(flattenRunValues(runs, (run) => [run.sourceContext?.queueName, run.schedulerEvidence?.queueName, ...(run.schedulerEvidence?.queueNames || [])]), "queue"),
    priorityClasses: buildValueMap(flattenRunValues(runs, (run) => [run.sourceContext?.priorityClass, run.schedulerEvidence?.priorityClass, ...(run.schedulerEvidence?.priorityClasses || [])]), "priority"),
    admissionClasses: buildValueMap(flattenRunValues(runs, (run) => [run.sourceContext?.admissionClass, run.schedulerEvidence?.admissionClass, ...(run.schedulerEvidence?.admissionClasses || [])]), "admission"),
    requestedGpuShapes: buildValueMap(flattenRunValues(runs, (run) => [run.sourceContext?.requestedGpuShape, run.schedulerEvidence?.requestedGpuShape, ...(run.schedulerEvidence?.requestedGpuShapes || [])]), "shape"),
    localityPreferences: buildValueMap(flattenRunValues(runs, (run) => [run.sourceContext?.localityPreference, run.schedulerEvidence?.localityPreference, ...(run.schedulerEvidence?.localityPreferences || [])]), "locality")
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
    grafanaExploreUrl: mappedValue(plan.grafanaUrls, context.grafanaExploreUrl, "grafana-url")
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
  document.querySelector("#exportRedactedWorkspaceButton").addEventListener("click", () => exportWorkspace({ redacted: true }));
  document.querySelector("#exportEvidencePackButton").addEventListener("click", exportEvidencePack);
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
  const provider = providerEconomics(summary);
  const opportunityEngine = generateOpportunities(summary, classifier, provider);
  const schedulerSimulator = simulateScheduler(summary);

  renderInventory(entries);
  renderDiagnosis(summary, classifier);
  renderLiveResources(summary);
  renderMetricRibbon(summary);
  renderSchedulerSimulator(schedulerSimulator, summary);
  renderGrafanaHandoff(summary);
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
  const idleStatus = sourceItems.some((item) => /gpu idle|idle capacity/i.test(String(item.status || "")));
  const adapters = unique(["local-machine", ...(machineItem.source?.adapters || [])]);
  const gpuModel = machineDemoGpuModel(context, summary, machineItem);
  const gpuPresent = context.gpuPresent === true || (
    summary.gpus > 0
    && !/no nvidia|unavailable|none/i.test(gpuModel)
  );
  const driverUnavailable = !gpuPresent && context.gpuSource === "nvidia-smi-unavailable";

  return {
    host: context.hostname || summary.clusters[0] || "this host",
    gpuModel,
    adapters: adapters.join(", "),
    services: services.length ? services.join(", ") : "local observability services",
    modelCount: ollamaModels.length,
    context,
    gpuUtilizationPct: numeric(context.gpuUtilizationPct, summary.gpuUtil),
    gpuMemoryUsedPct: numeric(context.gpuMemoryUsedPct, summary.hbmCapacity),
    gpuMemoryUsedMiB: numeric(context.gpuMemoryUsedMiB),
    gpuMemoryTotalMiB: numeric(context.gpuMemoryTotalMiB),
    gpuTemperatureC: numeric(context.gpuTemperatureC),
    gpuPowerWatts: numeric(context.gpuPowerWatts),
    gpuProcesses: Array.isArray(context.gpuComputeProcesses) ? context.gpuComputeProcesses : [],
    cpuUsagePct: numeric(context.cpuUsagePct),
    memoryUsedPct: numeric(context.memoryUsedPct),
    diskUsedPct: numeric(context.diskUsedPct),
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
  const graphs = document.querySelector("#liveTelemetryGraphs");
  if (!panel || !title || !badge || !grid || !graphs) return;

  const machineContext = machineDemoContext(summary);
  if (!machineContext) {
    panel.hidden = true;
    grid.replaceChildren();
    graphs.replaceChildren();
    liveTelemetryHistory = [];
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

  panel.hidden = false;
  title.textContent = `${machineContext.host} live resources`;
  badge.textContent = ageSeconds === null ? "Live" : `Updated ${ageSeconds}s ago`;
  badge.dataset.tone = ageSeconds !== null && ageSeconds <= 12 ? "good" : "watch";

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
      label: "GPU",
      value: machineContext.driverUnavailable ? "unavailable" : machineContext.noGpu ? "not detected" : pct(machineContext.gpuUtilizationPct),
      note: machineContext.driverUnavailable ? "Driver telemetry blocked" : machineContext.noGpu ? "No NVIDIA counter source" : `${machineContext.gpuProcesses.length} compute process${machineContext.gpuProcesses.length === 1 ? "" : "es"}`,
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
      label: "Disk",
      value: pct(machineContext.diskUsedPct),
      note: context.diskTotalBytes ? `${formatBytes(context.diskUsedBytes)} / ${formatBytes(context.diskTotalBytes)}` : "Root filesystem",
      percent: machineContext.diskUsedPct,
      tone: inverseGrade(machineContext.diskUsedPct, 75, 90).key
    }),
    liveResourceCard({
      label: "Docker",
      value: `${machineContext.dockerContainers.length}`,
      note: `${pct(dockerCpu)} aggregate container CPU`,
      percent: clamp(dockerCpu),
      tone: machineContext.dockerContainers.length ? "good" : "watch"
    }),
    liveResourceCard({
      label: "Signals",
      value: `${machineDemoServices(context.observedServices).length}`,
      note: machineContext.adapters,
      percent: null,
      tone: "good"
    })
  );

  renderLiveTelemetryGraphs(graphs, machineContext, telemetry);
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
    memoryUsedBytes: Math.max(0, numeric(context.memoryTotalBytes) - numeric(context.memoryAvailableBytes))
  });

  if (liveTelemetryHistory.length > LIVE_TELEMETRY_LIMIT) {
    liveTelemetryHistory = liveTelemetryHistory.slice(-LIVE_TELEMETRY_LIMIT);
  }

  return liveTelemetryHistory;
}

function renderLiveTelemetryGraphs(container, machineContext, history) {
  const sampleCount = history.length;
  const latest = history[sampleCount - 1] || {};
  const latestLabel = latest.label ? `Latest sample ${latest.label}` : "Waiting for live samples";
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
      note: machineContext.gpuPresent ? "nvidia-smi utilization.gpu" : "Driver telemetry blocked",
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
      const value = numeric(sample[valueKey], Number.NaN);
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
  const observed = history.map((sample) => numeric(sample[key], Number.NaN)).filter(Number.isFinite);
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
      simulatorStat("GPU process", machineContext.gpuProcesses.length ? `${machineContext.gpuProcesses.length} active` : "none", machineContext.gpuProcesses.length ? "good" : "watch"),
      simulatorStat("Docker", `${machineContext.dockerContainers.length} containers`, machineContext.dockerContainers.length ? "good" : "watch"),
      simulatorStat("Services", `${machineDemoServices(machineContext.context.observedServices).length} reachable`, "good"),
      simulatorStat("Workload counters", machineContext.workloadCountersObserved ? "present" : "not collected", machineContext.workloadCountersObserved ? "good" : "watch")
    );
    narrative.replaceChildren(
      simulatorNarrativeItem("Scope", "Single Linux host observation"),
      simulatorNarrativeItem("Scheduler", "No Kubernetes, Slurm, admission, or provider scheduler export is attached"),
      simulatorNarrativeItem("Next signal", machineContext.driverUnavailable ? "Fix NVIDIA driver access before expecting GPU counters" : machineContext.idle ? "Start a controlled GPU workload to measure active behavior" : "Join request or training counters to the host sample")
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
    badge.textContent = services.includes("grafana") ? "Service reachable" : "No Grafana";
    context.replaceChildren(
      grafanaContextItem("Dashboard", "No dashboard overlay imported"),
      grafanaContextItem("Datasource", services.includes("node-exporter") ? "node-exporter reachable" : "No datasource export"),
      grafanaContextItem("Window", "live host sample"),
      grafanaContextItem("Variables", machineContext.host)
    );
    links.replaceChildren();
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
  const machineContext = machineDemoContext(summary);
  if (machineContext) {
    document.querySelector("#primaryBottleneck").textContent = machineContext.driverUnavailable ? "NVIDIA telemetry unavailable" : machineContext.noGpu ? "Host-only telemetry" : machineContext.idle ? "Idle GPU capacity" : "Live host utilization";
    document.querySelector("#secondaryBottleneck").textContent = machineContext.driverUnavailable ? "nvidia-smi cannot reach driver" : machineContext.gpuProcesses.length ? "Active NVIDIA process" : "No NVIDIA compute process";
    document.querySelector("#improvementEstimate").textContent = machineContext.driverUnavailable ? "Repair driver access or use a supported GPU counter source, then collect again." : machineContext.idle ? "Start a controlled workload, then compare the next live sample." : "Attach request or training counters before tuning.";
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
