# Demo Logistics

Use this note when someone asks for a working demo, hardware requirements, or whether turbalance can influence NVIDIA's low-level SM scheduling behavior.

## Demo Offer

Yes. We have a working demo path now.

The demo can show the branded dashboard, provider/operator views, telemetry import flow, Grafana handoff, Opportunity Engine, evidence-pack export, controlled ingestion path, source-contract validation, and the generated provider pilot artifacts.

For a local/offline demo, run:

```sh
node scripts/prepare-demo.js --out-dir build/demo
python3 -m http.server 8000
```

Then open `http://127.0.0.1:8000/` and import `fixtures/neo-cloud-provider-bundle.json` or the generated `build/demo/provider-pilot-bundle.json`.

## Hardware Needed

No special hardware is required for the first demo. A laptop or small VM is enough because the dashboard can run from fixture data and generated source bundles.

For integration testing against real infrastructure, the useful minimum is:

- One Linux NVIDIA GPU node
- NVIDIA driver, CUDA runtime support, and container runtime
- DCGM Exporter feeding Prometheus
- Kubernetes pod/job metadata, or exported scheduler/admission events
- Optional Grafana links, NCCL traces, eBPF host summaries, and billing/SLO exports

For a realistic neo-cloud pilot, use:

- Two to four or more GPU nodes
- Kubernetes or a scheduler environment with real queue and placement behavior
- DCGM/Prometheus/Grafana already deployed
- Provider staging exports for billing, commitments, support tickets, queue SLOs, and reservations
- Optional MIG-capable A100/H100-class hardware if the pilot includes MIG partitioning or tenant-isolation policy

## NVIDIA SM Scheduler Position

Do not position turbalance as replacing NVIDIA's integrated SM scheduler.

NVIDIA's scheduling of thread blocks onto SMs and warp scheduling within SMs is handled by the GPU hardware and driver/runtime stack. CUDA, MPS, MIG, streams, priorities, launch geometry, occupancy tuning, batching, kernel design, and cluster-level placement can influence observed behavior, but replacing the low-level SM scheduler is not a practical or supported product direction.

The right positioning is:

- turbalance observes workload behavior and explains inefficient GPU-hour usage.
- turbalance recommends changes to placement, batching, topology, admission, MPS/MIG policy, and scheduler behavior above the GPU runtime.
- turbalance helps operators avoid unsupported driver or hardware modifications while still improving utilization, queue SLOs, customer escalations, and sellable GPU-hour recovery.

## Short Reply

Yes, we can give a demo. The first demo does not require special hardware; it can run from generated telemetry bundles on a laptop or VM. For proper integration testing, we would want at least one Linux NVIDIA GPU node with DCGM Exporter, Prometheus/Grafana, and Kubernetes or scheduler metadata. For realistic provider scheduling and topology behavior, two to four or more GPU nodes are better.

On NVIDIA's internal SM scheduler, I would not plan to rewrite or override it. That scheduling is handled by NVIDIA's hardware/driver/runtime stack. The practical path is to influence behavior above that layer through kernel configuration, batching, CUDA streams/priorities, MPS/MIG, and cluster-level scheduling/admission policy. turbalance is valuable because it can analyze where GPU-hours are lost and guide those higher-level controls.
