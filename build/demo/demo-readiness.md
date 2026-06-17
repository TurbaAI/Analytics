# turbalance Analytics Demo Readiness

- Status: PASS
- Generated: 2026-06-17T04:39:08.169Z
- Output directory: /Users/ahmadbyagowi/git/Analytics/build/demo
- Checks: 16 passed, 1 warnings, 0 failed

## Demo Path

- Local server: `python3 -m http.server 8000`
- Local URL: http://127.0.0.1:8000/
- Primary dataset: `fixtures/neo-cloud-provider-bundle.json`
- Generated provider bundle: `/Users/ahmadbyagowi/git/Analytics/build/demo/provider-pilot-bundle.json`
- Live machine bundle: `/Users/ahmadbyagowi/git/Analytics/build/demo/live-machine-bundle.json`

## Artifacts

- providerOverlay: `/Users/ahmadbyagowi/git/Analytics/build/demo/provider-overlay.json`
- schedulerOverlay: `/Users/ahmadbyagowi/git/Analytics/build/demo/scheduler-overlay.json`
- ebpfOverlay: `/Users/ahmadbyagowi/git/Analytics/build/demo/ebpf-overlay.json`
- providerPilotBundle: `/Users/ahmadbyagowi/git/Analytics/build/demo/provider-pilot-bundle.json`
- liveMachineBundle: `/Users/ahmadbyagowi/git/Analytics/build/demo/live-machine-bundle.json`
- sourceBundleValidation: `/Users/ahmadbyagowi/git/Analytics/build/demo/source-bundle-validation.json`
- providerReadiness: `/Users/ahmadbyagowi/git/Analytics/build/demo/provider-readiness.json`
- managedKubernetes: `/Users/ahmadbyagowi/git/Analytics/build/demo/managed-kubernetes.yaml`
- imageDryRun: `/Users/ahmadbyagowi/git/Analytics/build/demo/provider-image-dry-run.json`
- reportJson: `/Users/ahmadbyagowi/git/Analytics/build/demo/demo-readiness.json`
- reportMarkdown: `/Users/ahmadbyagowi/git/Analytics/build/demo/demo-readiness.md`

## Hardware Notes

- Demo: Laptop or small VM is enough for the offline dashboard and generated telemetry bundles.
- Integration: One Linux NVIDIA GPU node is enough for smoke testing DCGM/Prometheus/Kubernetes exports.
- Realistic pilot: Two to four or more GPU nodes are recommended for scheduler placement, topology, queue, and multi-tenant behavior.
- MIG: A100/H100-class MIG-capable hardware is useful only if the demo includes MIG partitioning or isolation policy.

## NVIDIA SM Scheduler Position

Do not claim SM scheduler replacement. The practical control surface is kernel/workload design plus cluster-level placement, batching, streams, MPS, MIG, admission, and topology-aware scheduling.

## Caveats

- The demo is offline-first unless a provider grants staging source-system access.
- Do not claim live cluster or billing connectivity unless source contracts and approvals point at real provider staging systems.
- Run screenshot QA with Playwright before sharing screenshots after any layout change.

