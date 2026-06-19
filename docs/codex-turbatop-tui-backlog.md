# Backlog — `turbatop` terminal UI (TUI)

Standalone backlog. **Independent of the differentiation backlog** (`docs/codex-differentiation-backlog.md`):
`turbatop` is a *thin client* that only reads the existing product API and renders it.
It introduces **no new analytics** and should not modify `analytics-core.js`,
`predictive-core.js`, `platform_common/`, or the dashboard. Safe to build in parallel.

## Goal

A fast, beautiful, btop-style terminal dashboard for GPU-fleet efficiency that runs
over SSH with **zero browser and no outbound network** — the operator surface for
bare-metal / air-gapped / sovereign deployments, and a high-leverage developer-marketing
asset.

Answers the operator's three questions at a glance: **what's wasted, what will break,
what do I do.**

## Positioning constraints (keep it honest + tasteful)

- Density and responsiveness over decoration. Use braille/block sparklines, color, and
  live refresh — **not** gratuitous ASCII art. One tasteful branded header with the `t`
  mark is enough.
- Read-only v1. No write-back/remediation from the TUI yet (that's the connectors epic).
- Must degrade gracefully: small terminals, no color (NO_COLOR), and API/auth errors
  never crash — show a clear status line.

## Tech decision (pick one; recommendation: Go)

- **Recommended — Go + Bubbletea + Lipgloss + Bubbles.** Compiles to a single static
  binary with no runtime deps → `scp turbatop user@host && ./turbatop`. This *is* the
  air-gapped/sovereign distribution story. Cost: a new language in the repo (`cli/turbatop/`).
- **Alternative — Python + Textual + Rich.** Reuses the existing Python toolchain; fastest
  to first demo. Cost: requires a Python runtime on the target.

Decide first and record it in the epic's README. The rest of this backlog is language-agnostic.

## Data source (no new endpoints required for v1)

Consume the existing product API (same data the dashboard uses):

- Fleet + per-scope summary (utilization, useful compute, wasted GPU-hours, cost/useful
  GPU-hour) — the API behind the dashboard's operator cockpit.
- Bottleneck classification + opportunity/action list (the opportunity engine output).
- Predictive warnings (forecasts, saturation ETAs, anomalies) from the predictive API.
- Verified savings rollup **if available** (Epic A); otherwise hide that panel behind a
  feature check — do not hard-depend on it.

Auth: reuse the product API bearer token via `--token`/`TURBA_TOKEN` and
`--api-url`/`TURBA_API_URL`. Honor the same RBAC scoping the API already enforces.

## Target layout (render goal for v1)

```
┌ turbalance · turbatop ───────────────────────────── fleet: prod-a   ⟳ 1s   q quit ┐
│ EFFICIENCY  GPU util 62%  ▕▆▆▅▆▇▆▆▅▏   Useful compute 41%  ▕▃▃▄▃▄▃▄▏  ▲ dominant: │
│             Wasted 8,146 GPU-hrs  ·  $15 / useful GPU-hr        Communication 29% │
├ HOSTS (4) ───────────────────────────────┬ FORECAST & WARNINGS ───────────────────┤
│ ● spark1   GPU ▇▇▇▆ 91%  HBM ▆▆▇ 88%  ok │ ⚠ HBM capacity → crosses 100 in ~2d    │
│ ● spark2   GPU ▅▅▆▅ 73%  HBM ▄▄▅ 61%  ok │ ⚠ queue wait   → 12m, rising            │
│ ● pi1..12  GPU ▃▃▂▃ 18%  …          watch │ �◐ gpuUtil regression risk: elevated    │
├ BOTTLENECKS ─────────────────────────────┼ PRESCRIBED ACTIONS ────────────────────┤
│ Communication ████████░░ 78            │ 1 ⬆ Recover wasted spend  $12k/3060h 80%│
│ Input         █████░░░░░ 54            │ 2 ⬆ Repack topology       $8.3k/690h 74%│
│ Memory        ████░░░░░░ 41            │ 3   Remove storage stalls $4.8k/540h 71%│
│ Placement     ███░░░░░░░ 33            │   verify: compare NCCL trace before/after│
├ RECOVERED (90d) ─────────────────────────┴────────────────────────────────────────┤
│ ✓ $142k / 38,200 GPU-hrs verified · realization 71%  ▕▂▃▅▆▇█▏                       │
└ scope: [j]ob [m]odel [t]eam [tenant] [c]luster   ↑↓ select host   enter drill-in ───┘
```

## Tasks

1. **Scaffold + config.** `cli/turbatop/` (Go) or `cli/turbatop/` (Python). Flags/env:
   `--api-url`, `--token`, `--refresh` (default 2s), `--scope`, `--insecure` (self-signed
   lab certs), `--once` (render one frame and exit — used for tests/screenshots),
   `--no-color`. Print usage on `-h`.
2. **API client.** Typed client for the summary, opportunities, predictive-warnings, and
   (optional) savings endpoints. Transparent caching between refreshes; timeouts; on error
   keep last good frame and show an error in the status bar.
3. **Sparkline + gauge widgets.** Braille/block sparkline from a numeric series; horizontal
   bar gauge with thresholds (green/amber/red mirroring the dashboard palette
   `2FAA5A`/`E8A13A`/`E0584E`). Unit-test the string output at fixed widths.
4. **Panels.** Efficiency header, Hosts list (selectable), Forecast & warnings, Bottlenecks,
   Prescribed actions, Recovered (savings) — each a self-contained component fed by the
   client. Hide Recovered if the savings endpoint is absent.
5. **Interaction.** Keys: `q` quit, `r` force refresh, `↑/↓` select host, `enter` drill-in,
   scope switch keys, `/` filter. Responsive reflow for narrow terminals; graceful minimum
   size message.
6. **Theme + branding.** turbalance palette; one-line header with the `t` glyph; respect
   `NO_COLOR`. No full-screen ASCII logo.
7. **Packaging.** Go: `make turbatop` cross-compiles linux/amd64 + arm64 static binaries
   (the Pi fleet is arm64). Python: `pipx`-installable entry point. Add the binary/build to
   the release packaging and the support-bundle file list. Document `scp`-and-run in
   `docs/`.
8. **Docs.** `docs/turbatop.md`: install (air-gapped path), flags, keybindings, a captured
   screenshot/asciinema.

## Acceptance criteria

- `turbatop --once --api-url … --token …` renders a full frame to stdout and exits 0
  (deterministic, snapshot-testable).
- Runs with **no outbound network** beyond the configured API URL; works against the
  internal HTTP API and the self-signed HTTPS edge (`--insecure`).
- Never crashes on API error, empty data, tiny terminal, or `NO_COLOR`; shows a status line.
- Single static binary (Go path) for linux amd64 + arm64.
- Adds no dependency to and makes no change in the analytics engines or dashboard.

## Tests / CI

- Widget unit tests: sparkline/gauge output at fixed widths and edge values (empty, single
  point, NaN).
- A golden-frame test: feed a fixed fixture JSON to `--once`, assert the rendered frame
  matches a checked-in golden (normalize timestamps).
- Wire a smoke check into CI (build + `--once` against a fixture). If Go, add a `go test`
  job to `.github/workflows`; if Python, add to `tests/run-all.js` via a spawned process
  like the existing python-backed tests.
- Add one phase-4/process audit check in `scripts/audit-productization-phases.js`:
  the `cli/turbatop` build target + `docs/turbatop.md` exist (assert real paths).

## Out of scope for v1 (note for later)

- Write-back/remediation from the TUI (belongs to the action-connectors epic).
- `asciinema`-driven marketing GIF (do after v1 is stable).
- Multi-cluster federation view.

## Suggested sequencing

Scaffold + client → sparkline/gauge widgets (+ tests) → efficiency/hosts/bottlenecks panels
→ forecast/actions panels → interaction + scope switching → packaging (static binaries) →
docs + golden-frame test + audit check. Ship read-only v1, then revisit write-back once the
action-connectors epic lands.
