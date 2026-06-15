/**
 * turbalance Analytics — sample dashboard data.
 *
 * Extracted from app.js to keep that file smaller (PR5 modularization).
 * Loaded as a classic <script> BEFORE app.js, so these top-level consts are
 * visible to app.js via the shared global scope. Pure data only — no logic,
 * no dependencies on app.js (the ingestion schema version is inlined).
 */

const SAMPLE_INGESTION = {
  schemaVersion: "turba.ingestion.v1",
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
