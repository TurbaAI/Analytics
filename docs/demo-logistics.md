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

For the live machine demo on `192.168.10.101`, run:

```sh
node scripts/prepare-demo.js --out-dir build/demo --host-url http://192.168.10.101:8000 --remote-machine user@192.168.10.20
python3 -m http.server 8000 --bind 0.0.0.0
```

Then open `http://192.168.10.101:8000/`. The app auto-loads `build/demo/live-machine-bundle.json` on that host and refreshes it every 30 seconds while the tab is visible. That bundle reflects the actual machine state for NUC14E and SPARK1: host OS counters, Docker state, reachable Grafana/Netdata/Ollama/node-exporter services, NUC14E's RTX 4090 through `nvidia-smi`, and SPARK1's current NVIDIA driver telemetry availability. It does not pretend Kubernetes, DCGM, eBPF, scheduler/admission, provider billing, or customer SLO exports are installed when they are not.

For the standalone `DGX-pat` demo on `100.96.89.98`, run the local collector on that machine and serve the same static app:

```sh
/home/user/.lmstudio/.internal/utils/node scripts/collect-local-machine-bundle.js --out build/demo/live-machine-bundle.json --host-url http://100.96.89.98:8000
python3 -m http.server 8000 --bind 0.0.0.0
```

Then open `http://100.96.89.98:8000/`. The app also auto-loads `build/demo/live-machine-bundle.json` on this host. Treat `DGX-pat` as a single observed Linux machine: if `nvidia-smi` is installed but cannot communicate with the NVIDIA driver, the dashboard should show NVIDIA telemetry unavailable instead of fabricating usable GPU counters.

## Hardware Needed

No special hardware is required for the first demo. A laptop or small VM is enough because the dashboard can run from fixture data and generated source bundles.

The current `192.168.10.101` demo machine has one NVIDIA GeForce RTX 4090 and is useful for a realistic single-node workstation/edge-provider demo. `192.168.10.20` is included as `SPARK1`, a second observed Linux host; if `nvidia-smi` cannot communicate with the NVIDIA driver there, the dashboard should show that as telemetry unavailable rather than usable GPU capacity. These machines are not a multi-node neo-cloud cluster, so scheduler, topology, and queue behavior should be framed as host/fleet evidence unless provider staging exports are imported.

The `100.96.89.98` machine is tracked as `DGX-pat` for a standalone host demo. It is useful as an observed AI operator workstation/server path, but it should be described only by the counters it exposes at demo time.

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
