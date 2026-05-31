# Demo Script

Use this script for a five-minute walkthrough after local visual QA passes and GitHub Pages is enabled.

## Setup

1. Open the deployed Pages URL or local `index.html`.
2. Confirm the status chips show the sample feed and local storage state.
3. Keep `fixtures/external-source-bundle.json` ready for import.
4. Keep `fixtures/neo-cloud-provider-bundle.json` ready for the provider walkthrough.

## Flow

1. Start on `Job` scope with `llama-70b-pretrain-7421` selected.
2. Call out the headline: GPU utilization is not the same as useful compute.
3. Read the metric ribbon: allocated GPU-hours, useful GPU-hours, waste, and cost per useful GPU-hour.
4. Use the truth table to separate useful work, communication wait, input stalls, placement fragmentation, and stranded resources.
5. Use the bottleneck classifier to explain primary and secondary loss attribution.
6. Scroll to topology and connect cross-pod placement to NCCL trace attribution.
7. Toggle `Same-pod what-if` and describe the estimated improvement range.
8. Switch to `Model`, `Team`, and `Cluster` scopes to show aggregation.
9. Open the provider lens and call out tenant, reservation, sellable waste value, commit burn, queue SLO, and gross-margin context.
10. Import `fixtures/neo-cloud-provider-bundle.json` and show the same workflow on provider-specific tenant data.
11. Import `fixtures/external-source-bundle.json`.
12. Click Analyze and show the trend panel updating from persisted snapshots.
13. Export the workspace, then re-import it to demonstrate browser-to-browser handoff.
14. Copy the customer report as the final operator summary.

## Close

Position the prototype as a static operator review surface: it does not need cluster credentials, but it does need exported telemetry bundles from Prometheus, DCGM, Kubernetes, NCCL traces, and provider billing/SLO systems for production validation.

## Do Not Claim

- Do not claim live cluster connectivity.
- Do not claim screenshots are current unless they were regenerated after the latest layout changes.
- Do not claim Pages is live until repository settings show GitHub Actions as the Pages source and the deploy workflow succeeds.
