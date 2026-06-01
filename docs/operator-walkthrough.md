# Operator Walkthrough

## Open The Prototype

Open `index.html` in a browser. The app loads a seeded workspace into browser-local storage and selects the highest-waste job by default.

## Find The Loss

1. Pick a scope from `Job`, `Model`, `User`, `Team`, `Cluster`, `Tenant`, `Account`, or `Reservation`.
2. Select a row in the inventory.
3. Read the diagnosis headline, efficiency score, and metric ribbon.
4. Use the truth table to separate utilization, communication, input, placement, and resource-stranding symptoms.
5. Use the bottleneck classifier for primary and secondary loss attribution.

## Inspect Placement And Trace Evidence

1. Open the topology panel for the selected workload.
2. Compare active nodes, partial nodes, and cross-pod links.
3. Read NCCL trace attribution by topology tier.
4. Toggle `Same-pod what-if` to estimate the locality improvement range.

When an eBPF host overlay is present, treat higher network wait, storage wait, CPU preprocessing pressure, contention, latency tail, or noise events as host-side evidence. Use it to separate Linux scheduling, socket, filesystem, or noisy-neighbor symptoms from GPU/NCCL issues.

## Compare Against Baseline

Use the regression panel to compare current step time, NCCL time, GPU efficiency, queue wait, and cost against the persisted baseline for each run.

## Prioritize Opportunities

Use the Opportunity Engine action center after the first diagnosis. It ranks FinOps, topology, scheduler, inference, data pipeline, host-kernel/eBPF, fleet reliability, energy/carbon, and customer evidence-pack actions by estimated impact, risk, and confidence. Treat dollar values as prioritization estimates because categories can overlap.

Use the evidence-pack export button in the action center when a selected job, tenant, account, reservation, or cluster needs a support, QBR, or capacity-planning handoff. The exported Markdown includes the executive summary, ranked actions, impact, evidence, recommendations, and redacted source context.

## Track Trends

The trend panel uses persisted analysis snapshots. A snapshot is captured when the workspace is seeded, reset, imported, restored, or manually analyzed. Use the trend metric selector to compare efficiency, wasted GPU-hours, NCCL time, cost per useful GPU-hour, sellable waste, opportunity impact, commit burn, queue SLO, or gross margin.

## Use The Neo-Cloud Provider Lens

The provider lens appears for every selected scope. When tenant or commercial metadata is present, it ties efficiency loss to provider-side business context.

1. Read tenant, account, reservation, and billing model context.
2. Compare sellable waste value against wasted GPU-hours.
3. Check commit burn to see whether the selected work is consuming reserved capacity faster than expected.
4. Check queue SLO status before deciding whether an escalation is a customer-code issue, placement issue, or capacity issue.
5. Use the provider actions as the support, scheduler, or QBR follow-up.

For tenant escalations, start with `Job` scope and copy the outcome report into the support case. For capacity planning, switch to `Cluster` or `Team` scope and rank by waste, placement quality, and queue pressure.

## Import And Restore Data

- Use `Import JSON` for a local `turba.ingestion.v1`, source bundle, eBPF host overlay, opportunity overlay, or `turba.workspace.v2` file.
- Use `API URL` and `Fetch` for a JSON endpoint or relative fixture path.
- Use export to download the current workspace, including baselines and trend snapshots.
- Use redacted export to replace tenant, account, reservation, contract, support-ticket, run, source-context identifiers, and imported opportunity free text with deterministic surrogate IDs.
- Use evidence-pack export for a selected-scope Markdown handoff that keeps numeric evidence and recommendations while redacting source identifiers.
- Use reset to return browser-local state to the sample feed.
- Use `fixtures/neo-cloud-provider-bundle.json` to exercise tenant, reservation, SLO, and commercial overlays.

## Report The Outcome

Use the customer report panel as the concise operator summary. The copy button places the report text on the clipboard. When provider metadata exists, the report includes sellable waste value and reservation context.
