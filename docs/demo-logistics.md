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

Then open `http://192.168.10.101:8000/`. The app auto-loads `build/demo/live-machine-bundle.json` on that host and refreshes it every 1 second while the tab is visible. That bundle reflects the actual machine state for NUC14E and SPARK1: host OS counters, Docker state, reachable Grafana/Netdata/Ollama/node-exporter services, Ollama tokens-per-second and time-to-first-token telemetry when `/api/ps` reports an already-loaded model, NUC14E's RTX 4090 through `nvidia-smi`, and SPARK1's current NVIDIA driver telemetry availability. It does not pretend Kubernetes, DCGM, eBPF, scheduler/admission, provider billing, or customer SLO exports are installed when they are not.

For the standalone `DGX-pat` demo on `100.96.89.98`, run the local collector on that machine and serve the same static app:

```sh
/home/user/.lmstudio/.internal/utils/node scripts/collect-local-machine-bundle.js --out build/demo/live-machine-bundle.json --host-url http://100.96.89.98:8000
python3 -m http.server 8000 --bind 0.0.0.0
```

Then open `http://100.96.89.98:8000/`. The app also auto-loads `build/demo/live-machine-bundle.json` on this host. Treat `DGX-pat` as a single observed Linux machine: if `nvidia-smi` is installed but cannot communicate with the NVIDIA driver, the dashboard should show NVIDIA telemetry unavailable instead of fabricating usable GPU counters.

For the standalone `SPARK1` demo on `192.168.10.20`, run the same local-host path:

```sh
node scripts/collect-local-machine-bundle.js --out build/demo/live-machine-bundle.json --host-url http://192.168.10.20:8000
python3 -m http.server 8000 --bind 0.0.0.0
```

For a reboot-safe SPARK1 demo, install the same path as systemd services instead of relying on foreground shells or `nohup`:

```sh
cd /home/user/Analytics
ls -la install.sh scripts/collect-local-machine-bundle.js

sudo ./install.sh \
  --mode static \
  --prefix /opt/turbalance-analytics \
  --with-systemd \
  --live-machine \
  --live-machine-host-url http://192.168.10.20:8000
```

If `sudo ./install.sh` prints `sudo: ./install.sh: command not found`, SPARK1 is not in a checkout that contains the installer or it has an older copied app tree. Run `find /home/user -maxdepth 4 -name install.sh -print` and rerun the command from the directory that contains `install.sh`; if the file exists but is not executable, use `sudo sh ./install.sh ...` with the same flags. If `install.sh` is missing but `scripts/collect-local-machine-bundle.js` exists, create `turbalance-analytics.service` and `turbalance-live-machine-collector.service` manually from `/home/user/Analytics`; the README has the full `systemd` unit fallback.

That enables `turbalance-analytics.service`, `turbalance-gb100-app-collector.service`, and `turbalance-live-machine-collector.service`; the third service is what recreates and refreshes `build/demo/live-machine-bundle.json` after reboot. Then open `http://192.168.10.20:8000/`. Treat it as a single observed Linux machine. The live resources panel updates from `build/demo/live-machine-bundle.json` every 1 second in the browser and should show CPU, RAM, disk, Docker, Ollama, signal freshness, relationship alerts, live telemetry graphs, and any GPU utilization, GPU power, GPU memory, or temperature counters exposed by `nvidia-smi`. When GB10 is detected, the dashboard should add the GB10 monitoring list and show `GB10 NVML/nvidia-smi`, `Linux UMA memory`, `App metrics`, and `Nsight/CUPTI optional profiling exporter` rows only for that host. The relationship watch computes short-window correlations and trend slopes so the demo can flag idle accelerators, CPU/GPU divergence, memory/disk drift, thermal drift, lagging GPU counters, and power/utilization mismatch. The SPARK1 high-rate collector runs as a resident loop, skips the slower NVIDIA process-attribution query, and may reuse a very recent GPU sample when `nvidia-smi` is slower than the one-second UI cadence; use a slower diagnostic collection only when process ownership matters. If Ollama is reachable and has a loaded model in `/api/ps`, the collector records a tiny streaming generation probe for tokens per second and time to first token, then caches that result for 30 seconds so the one-second UI loop does not hammer the model. Use `--ollama-probe 0` to disable this probe or `--ollama-probe-ms <milliseconds>` to tune the cache interval. If no model is loaded, the dashboard should show Ollama as reachable with no loaded-model throughput instead of waking a model just to create a number. If `nvidia-smi` cannot communicate with the NVIDIA driver, the dashboard should present that as the current telemetry state and use `?demo=sample` for the richer provider-value walkthrough.

For the SPARK1 Kubernetes workload demo, first verify the GPU path on SPARK1:

```sh
nvidia-smi
kubectl get nodes
kubectl get nodes -o custom-columns=NAME:.metadata.name,GPUS:.status.allocatable.nvidia\\.com/gpu
```

If Kubernetes is not installed yet, use a lightweight single-node `k3s` setup, then install NVIDIA Kubernetes GPU support with either the NVIDIA device plugin or GPU Operator. On SPARK1's GB10 GPU, use the v0.18.x NVIDIA device plugin line; v0.17.1 can fail device registration because GB10 reports GPU memory as `Not Supported`. The working SPARK1 path is the v0.18.2 device plugin DaemonSet with `runtimeClassName: nvidia` on the plugin pod. Prometheus should be reachable from SPARK1 or port-forwarded to `http://127.0.0.1:9090`; DCGM Exporter should feed GPU metrics into that Prometheus. Keep this as an observed lab cluster, not a fabricated neo-cloud: one SPARK1 node can show real pod/job state, scheduling timestamps, GPU allocation, and DCGM metrics, but it cannot prove multi-node topology or cross-pod placement.

Run the labeled GPU smoke workload and collect the analyzer bundle:

```sh
kubectl apply -f ops/kubernetes/spark1-gpu-demo-job.yaml
kubectl -n turbalance-demo get pods -l turba.ai/run-id=spark1-k8s-demo-001 -w

node scripts/collect-spark1-kubernetes-demo.js \
  --run-id spark1-k8s-demo-001 \
  --namespace turbalance-demo \
  --prometheus-url http://127.0.0.1:9090 \
  --grafana-url http://192.168.10.20:3000/d/spark1-dcgm/spark1-dcgm-gpu-demo \
  --out build/demo/spark1-k8s-bundle.json
```

Then serve the app from SPARK1 and import `build/demo/spark1-k8s-bundle.json`. The analyzer should show `kubernetes`, `scheduler`, and, when Prometheus/DCGM are reachable, `prometheus` and `dcgm` source chips. When `--grafana-url` is supplied, it also shows a Grafana handoff for the SPARK1 DCGM dashboard. Use the source context to show the namespace, pod selector, pod names, node name, requested GPU count, queue wait, placement quality, and any collector warnings.

For a Kafka-backed workload signal on the same SPARK1 `k3s` node, enable the single-node KRaft broker and run the produce/consume smoke test:

```sh
node scripts/check-spark1-kafka.js
kubectl -n turbalance-demo get deploy,svc,job -l turba.ai/demo=spark1-kafka
kubectl -n turbalance-demo logs job/spark1-kafka-smoke
```

The broker is exposed inside the cluster as `spark1-kafka.turbalance-demo.svc.cluster.local:9092` and on SPARK1 as `192.168.10.20:30992` for local lab checks. The smoke Job creates a unique topic, produces one JSON message, consumes that exact message ID back, and prints `SPARK1 Kafka smoke test passed` when the broker path is functional. The live-machine collector also marks `kafka` as a reachable service when the NodePort answers, so the analyzer can show Kafka as observed host infrastructure without inventing a Kafka source export.

The analyzer's Live Operator Cockpit sits under Live System Resources. Use it to show per-source heartbeats, the live event timeline, data-confidence scoring, Kafka smoke payload proof, launchpad commands, replay readiness, Grafana handoff links, and fleet tiles. The launchpad buttons copy the exact SPARK1 commands for GPU load, Kafka smoke, and Kubernetes bundle refresh; Grafana and analyzer actions open the live links.

For Prometheus/DCGM/Grafana metrics on SPARK1, apply the local observability stack and keep the Prometheus and Grafana port-forwards running:

```sh
kubectl apply -f ops/kubernetes/spark1-observability.yaml
kubectl -n turbalance-observability rollout status daemonset/dcgm-exporter
kubectl -n turbalance-observability rollout status deployment/prometheus
kubectl -n turbalance-observability rollout status deployment/grafana

nohup kubectl -n turbalance-observability port-forward svc/prometheus 9090:9090 \
  --address 127.0.0.1 > build/demo/prometheus-port-forward.log 2>&1 &

nohup kubectl -n turbalance-observability port-forward svc/grafana 3000:3000 \
  --address 0.0.0.0 > build/demo/grafana-port-forward.log 2>&1 &
```

To generate sustained non-idle DCGM readings, compile and run the CUDA load Job before collecting:

```sh
/usr/local/cuda/bin/nvcc -O3 -arch=native -cudart static \
  -o build/demo/cuda-spin scripts/spark1-cuda-spin.cu
kubectl -n turbalance-demo delete job -l turba.ai/run-id=spark1-k8s-demo-001 --ignore-not-found
kubectl apply -f ops/kubernetes/spark1-cuda-load-job.yaml

node scripts/collect-spark1-kubernetes-demo.js \
  --run-id spark1-k8s-demo-001 \
  --namespace turbalance-demo \
  --prometheus-url http://127.0.0.1:9090 \
  --grafana-url http://192.168.10.20:3000/d/spark1-dcgm/spark1-dcgm-gpu-demo \
  --out build/demo/spark1-k8s-bundle.json
```

On SPARK1's GB10, DCGM currently exposes utilization, power, temperature, memory-copy, encoder/decoder, clock, energy, and related device counters. Some H100/A100-style profiling and framebuffer fields can be absent; the collector falls back to the GB10 monitoring list: NVML/nvidia-smi for strict GPU counters, Linux UMA memory from `/proc/meminfo`, app metrics from the exporter on `:9500`, and optional Nsight/CUPTI profiling hooks under `collectors/profiling/`. Unsupported fields are recorded as warnings rather than synthesized.

## Hardware Needed

No special hardware is required for the first demo. A laptop or small VM is enough because the dashboard can run from fixture data and generated source bundles.

The current `192.168.10.101` demo machine has one NVIDIA GeForce RTX 4090 and is useful for a realistic single-node workstation/edge-provider demo. `192.168.10.20` is included as `SPARK1`, a second observed Linux host; if `nvidia-smi` cannot communicate with the NVIDIA driver there, the dashboard should show that as telemetry unavailable rather than usable GPU capacity. These machines are not a multi-node neo-cloud cluster, so scheduler, topology, and queue behavior should be framed as host/fleet evidence unless provider staging exports are imported.

The `100.96.89.98` machine is tracked as `DGX-pat` for a standalone host demo. It is useful as an observed AI operator workstation/server path, but it should be described only by the counters it exposes at demo time.

The `192.168.10.20` machine can also be used as standalone `SPARK1`; this is useful when the demo should run directly on that host instead of through the NUC fleet collector.

For the SPARK1 Kubernetes workload demo, the practical minimum is one SPARK1 Linux node with `k3s`, a working NVIDIA driver, NVIDIA Kubernetes GPU support, DCGM Exporter, and Prometheus. The included workload is a GPU smoke test; use a longer training or inference Job with the same `turba.ai/run-id` label when the audience needs sustained utilization rather than a scheduling and telemetry smoke path.

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
