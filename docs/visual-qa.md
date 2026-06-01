# Visual QA Checklist

Browser automation for local URLs is blocked in the current Codex environment by policy. Use this checklist in a local browser before sharing the prototype.

## Desktop

Open `index.html` at a wide desktop viewport.

- Header controls fit without overlap.
- Scope tabs are reachable, including tenant, account, and reservation.
- Import, fetch, export, reset, and status controls are visible.
- Inventory rows select correctly.
- Diagnosis headline and narrative wrap cleanly.
- Metric ribbon values fit in their cells.
- Trend metric tabs switch between efficiency, waste, NCCL, cost, sellable waste, opportunity impact, commit burn, queue SLO, and gross margin.
- Trend chart axis labels and recent snapshot cards are legible.
- Truth table, bottleneck, provider lens, provider portfolio, Scheduler Simulator, Opportunity Engine, component, topology, trace, fingerprint, regression, and report panels render.
- Scheduler scenario tabs switch between recommended, repack, locality, and queue-SLO views.
- Evidence-pack export button is visible in the Opportunity Engine heading.
- Copy report button updates visually after click.

## Mobile

Open `index.html` around 390px wide.

- Header controls stack.
- Scope tabs scroll horizontally without clipping.
- Ingestion controls stack and remain tap targets.
- Inventory and panels are single column.
- Topology SVG does not overflow the viewport.
- Scheduler Simulator stats, narrative, and scenario cards stack without text overlap.
- Opportunity Engine rows stack without text overlap.
- Trend stats and snapshot rows collapse to one column.
- Long job names, report text, and metric labels wrap without overlap.

## Import And Workspace

- Import `fixtures/external-source-bundle.json`.
- Confirm the ingestion status chip reports the imported file.
- Confirm scheduler evidence appears in the Scheduler Simulator cards when the imported bundle includes `sources.scheduler`.
- Click Analyze and confirm the trend point count increases.
- Export the workspace and inspect that the downloaded JSON has `storageSchemaVersion: "turba.workspace.v2"`.
- Export the redacted workspace and inspect that tenant, account, reservation, contract, support-ticket, run identifiers, and imported opportunity free text are surrogate IDs or redacted placeholders.
- Export an evidence pack and inspect that the Markdown includes scheduler what-if, ranked actions, and redacted source context.
- Re-import the exported workspace and confirm the dashboard restores.
- Reset workspace and confirm the sample feed returns.

## Known Constraint

Screenshots in `build/` are static artifacts. Regenerate them in a local browser whenever layout changes materially.
