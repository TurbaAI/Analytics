# Operator Walkthrough

## Open The Prototype

Open `index.html` in a browser. The app loads a seeded workspace into browser-local storage and selects the highest-waste job by default.

## Find The Loss

1. Pick a scope from `Job`, `Model`, `User`, `Team`, or `Cluster`.
2. Select a row in the inventory.
3. Read the diagnosis headline, efficiency score, and metric ribbon.
4. Use the truth table to separate utilization, communication, input, placement, and resource-stranding symptoms.
5. Use the bottleneck classifier for primary and secondary loss attribution.

## Inspect Placement And Trace Evidence

1. Open the topology panel for the selected workload.
2. Compare active nodes, partial nodes, and cross-pod links.
3. Read NCCL trace attribution by topology tier.
4. Toggle `Same-pod what-if` to estimate the locality improvement range.

## Compare Against Baseline

Use the regression panel to compare current step time, NCCL time, GPU efficiency, queue wait, and cost against the persisted baseline for each run.

## Track Trends

The trend panel uses persisted analysis snapshots. A snapshot is captured when the workspace is seeded, reset, imported, restored, or manually analyzed. Use the trend metric selector to compare efficiency, wasted GPU-hours, NCCL time, or cost per useful GPU-hour.

## Import And Restore Data

- Use `Import JSON` for a local `turba.ingestion.v1`, source bundle, or `turba.workspace.v2` file.
- Use `API URL` and `Fetch` for a JSON endpoint or relative fixture path.
- Use export to download the current workspace, including baselines and trend snapshots.
- Use reset to return browser-local state to the sample feed.

## Report The Outcome

Use the customer report panel as the concise operator summary. The copy button places the report text on the clipboard.
