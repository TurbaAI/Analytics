# Demo Script

Use this script for a five-minute walkthrough after local visual QA passes and GitHub Pages is enabled.

## Setup

1. Open the deployed Pages URL or local `index.html`.
2. Confirm the status chips show the sample feed and local storage state.
3. Keep `fixtures/external-source-bundle.json` ready for import.
4. Keep `fixtures/neo-cloud-provider-bundle.json` ready for the provider walkthrough.
5. Keep a generated provider overlay from `node scripts/build-provider-overlay.js fixtures/provider-export-inputs` ready if the audience wants exporter mechanics.
6. Keep a generated scheduler overlay from `node scripts/build-scheduler-overlay.js fixtures/scheduler-export-inputs` ready if the audience wants scheduler-event evidence mechanics.
7. Keep a generated eBPF overlay from `node scripts/build-ebpf-overlay.js fixtures/ebpf-export-inputs` ready if the audience wants host-kernel evidence mechanics.
8. Keep `grafana/turbalance-provider-overview.json` ready if the audience wants the Grafana dashboard handoff template.
9. Keep a generated all-lanes provider pilot bundle from `node scripts/build-provider-pilot-bundle.js fixtures/provider-pilot-export-inputs` ready if the audience wants the full exporter flow.
10. Keep the backend ingestion service ready if the audience wants signed upload, tenant provisioning, token/key rotation, audit export, and retention mechanics.

## Flow

1. Start on `Job` scope with `llama-70b-pretrain-7421` selected.
2. Call out the headline: GPU utilization is not the same as useful compute.
3. Read the metric ribbon: allocated GPU-hours, useful GPU-hours, waste, and cost per useful GPU-hour.
4. Use the truth table to separate useful work, communication wait, input stalls, placement fragmentation, and stranded resources.
5. Use the bottleneck classifier to explain primary and secondary loss attribution.
6. Scroll to topology and connect cross-pod placement to NCCL trace attribution.
7. Toggle `Same-pod what-if` and describe the estimated improvement range.
8. Use `Capacity what-if` to compare recommended, repack, locality, and queue-SLO scheduler scenarios, including event evidence when available.
9. Open the Grafana Handoff panel and show dashboard or Explore links when an overlay is attached.
10. Switch to `Model`, `Team`, and `Cluster` scopes to show aggregation.
11. Switch to `Tenant`, `Account`, and `Reservation` scopes to show provider-native grouping.
12. Open the provider lens and call out tenant, reservation, sellable waste value, commit burn, queue SLO, and gross-margin context.
13. Use the provider portfolio risk tables to move between top sellable waste, queue SLO misses, margin pressure, and noisy-neighbor candidates.
14. Open the Opportunity Engine action center and show how FinOps, topology, scheduler, inference, eBPF, fleet, energy, and evidence-pack actions are ranked together.
15. Import `fixtures/neo-cloud-provider-bundle.json` and show the same workflow on provider-specific tenant data, including imported `sources.grafana` and `sources.opportunities` rows.
16. Import `fixtures/external-source-bundle.json`.
17. Import the eBPF overlay to show host-side network, storage, CPU scheduling, and noisy-neighbor evidence enriching the same bottleneck lanes.
18. Click Analyze and show the trend panel updating from persisted snapshots, including opportunity impact, sellable waste, commit burn, queue SLO, and gross margin.
19. Export the evidence pack to show a customer/provider Markdown handoff with scheduler what-if, Grafana handoff rows, ranked actions, and redacted source context.
20. Export the workspace, then export the redacted workspace to demonstrate tenant-safe handoff.
21. Re-import the normal exported workspace to demonstrate browser-to-browser restore.
22. Copy the customer report as the final operator summary.

## Close

Position the product as a browser-first operator review surface with an optional controlled ingestion service: it does not need cluster credentials, but it does need exported telemetry bundles from Prometheus, DCGM, Kubernetes, scheduler/admission systems, Grafana handoff links, Linux eBPF summaries, NCCL traces, provider billing/SLO systems, and optional opportunity systems for production validation.

## Do Not Claim

- Do not claim live cluster connectivity.
- Do not claim screenshots are current unless they were regenerated or `scripts/run-screenshot-qa.js` passed in a Playwright-enabled environment after the latest layout changes.
- Do not claim Pages is live until repository settings show GitHub Actions as the Pages source and the deploy workflow succeeds.
