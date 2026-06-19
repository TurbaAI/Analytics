# turbatop

`turbatop` is a read-only terminal dashboard for the turbalance product API. It is meant for SSH sessions, air-gapped labs, sovereign deployments, and quick operator checks when opening a browser is inconvenient.

The default live view uses a btop-style terminal theme with neon borders, gradient gauges, colored sparklines, highlighted page tabs, and severity-colored warnings. The overview starts with a text aggregate panel that mirrors the web cockpit's fleet card: product header, fleet count, watch count, source, hottest host, dominant bottleneck, a compact efficiency-score rail, score-orbit graphic, fleet heat strip, and compact GPU/useful/waste signals. Use `--no-color` or `NO_COLOR=1` when exporting deterministic snapshots or running in terminals that do not handle ANSI color well.

It answers three questions at a glance:

- What is wasted?
- What is likely to break?
- What should I inspect next?

## Install

Run directly from a checked-out release:

```sh
python3 cli/turbatop/turbatop.py \
  --api-url http://192.168.10.30:8080
```

Build the single-file Python zipapp:

```sh
make turbatop
scp build/turbatop/turbatop user@host:/tmp/turbatop
ssh user@host '/tmp/turbatop --api-url http://192.168.10.30:8080 --token "$TURBA_TOKEN"'
```

The zipapp has no third-party Python dependencies. The target host needs Python 3.

## Flags

- `--api-url`: product API base URL. Defaults to `TURBA_API_URL` or `http://127.0.0.1:8080`.
- `--token`: bearer token. Defaults to `TURBA_TOKEN`.
- `--token-file`: read bearer token from a file. Defaults to `TURBA_TOKEN_FILE`, then local product paths such as `build/product-secrets/api-viewer-token`.
- `--bundle-url`: live-machine bundle fallback URL. Defaults to `TURBA_BUNDLE_URL` or a same-host `:8000/build/demo/live-machine-bundle.json` URL when `--api-url` uses `:8080`.
- `--no-bundle-fallback`: disable the live-machine bundle fallback and show strict API errors only.
- `--refresh`: live refresh seconds. Defaults to `2`.
- `--scope`: starting scope label. Defaults to `tenant`.
- `--sort`: starting host sort mode: `fleet`, `pressure`, `gpu`, `cpu`, `ram`, `net`, or `status`.
- `--page`: starting page: `overview`, `hosts`, `signals`, or `ops`. Defaults to `TURBA_PAGE` or `overview`.
- `--insecure`: allow self-signed HTTPS certificates for lab edges.
- `--once`: render one frame and exit.
- `--no-color`: disable ANSI color. `NO_COLOR=1` is also honored.
- `--no-mouse`: disable terminal mouse reporting.
- `--snapshot-file`: path written when pressing `w` in live mode. Defaults to `TURBA_SNAPSHOT_FILE` or `build/turbatop/snapshot.txt`.
- `--fixture`: read a fixture JSON instead of the API for screenshots and deterministic tests.

## Keys

- `q`: quit.
- `r`: force refresh.
- `p`: pause or resume automatic refresh. Manual `r` still fetches while paused.
- `h` / `?`: show or hide the built-in help screen.
- `w`: write the current terminal frame to `--snapshot-file`.
- `←` / `→`: switch to the previous or next page.
- `1` / `2` / `3` / `4`: switch to overview, hosts, signals, or ops.
- `Tab`: move focus to the next panel on the current page.
- `Shift-Tab`: move focus to the previous panel on the current page.
- `]`, `[`: move to the next or previous page.
- `↑` / `↓`: move inside the focused panel. Host-list panels move selected hosts; warning, action, inspector, and ops panels move their highlighted row.
- `k` / `J`: select the previous or next host. On the hosts page, lowercase `j` also moves down.
- `PageUp` / `PageDown`: jump by several host rows.
- `g` / `G`, `Home` / `End`: jump to the first or last host in the current sort/filter view.
- Mouse wheel: move host selection.
- Click a bottom page tab: switch pages.
- Left-click a host: select it. Click the selected host again to toggle detail.
- Right-click a host: select and toggle detail.
- Click the host section title or footer sort control: cycle sorting.
- Click footer scope labels, drill, filter, pause, snapshot, help, or the top-right quit/refresh/help controls.
- `s`: cycle host sorting across fleet order, pressure, GPU, CPU, RAM, network, and status.
- `enter`: show or hide selected-host detail.
- `j`, `m`, `t`, `T`, `c`: switch scope label to job, model, team, tenant, cluster. On the hosts page, `j` is reserved for moving down the host list.
- `/`: filter hosts.

## API Contract

The client is intentionally thin. It reads existing product API endpoints:

- `/ready`
- `/v1/me`
- `/v1/hosts`
- `/v1/hosts/{hostId}/resources`
- `/v1/virtual-sensors/principal-resource-mode`
- `/v1/virtual-sensors/fleet-rca`
- `/v1/virtual-sensors/alert-candidates`
- `/v1/alerts`
- `/v1/savings-ledger` when available

If an endpoint fails, `turbatop` keeps rendering and shows the error in the status line. Optional endpoints such as savings are treated as notices. Live refreshes run in a single background worker, so the last good frame stays keyboard- and mouse-interactive while slow API calls are in flight. When the authenticated API returns no hosts, the client can fall back to the appliance live-machine bundle so operators still see current host telemetry while fixing the bearer token.

The host table is scroll-aware, naturally sorts fleet names (`pi2` before `pi10`), and expands on wide terminals to show per-host trend, pressure, CPU, RAM, and network context beside GPU/HBM. CPU-only hosts render as CPU/RAM/NET rows and never synthesize GPU/HBM. Sort modes open on the most relevant host for that view, so `--sort pressure` starts at the hottest machine. The fleet strip summarizes host count, accelerator count, watch count, average pressure, hottest host, data source, and freshness.

## Pages

- `overview`: an at-a-glance cockpit with the web-style text aggregate panel, restored compact score rail, fleet heat strip, hosts, warnings, bottlenecks, prescribed actions, and compact recovered savings.
- `hosts`: an expanded host directory with more visible rows, selected-host inspector, CPU-only/accelerator classification, pressure gauges, and fleet composition.
- `signals`: a wider signal center for warnings, bottlenecks, prescribed actions, savings, notices, and API errors.
- `ops`: source and session context, including API URL, data source, readiness, generated time, notices, errors, active scope/sort/filter, and incident controls.

## Snapshot

```text
┌ t turbalance · turbatop ───────────────────────────── fleet: prod-a   ⟳ tenant   h help   q quit ┐
│ EFFICIENCY  GPU 62% ▕▁▄▃▆█▅▅▂▏   Useful 41% ▕▁▁▃▅▄▇▆█▏   Wasted 8,146h · $15/ugh   dom: Communic…│
│ FLEET  hosts 3 · accel 2 · ok 2 · watch 1 · avg cpu 50% · ram 55% · net 29% · hot spark1 91% · s…│
├ HOSTS 1-3/3 sort:fleet ────────────────────────┬ FORECAST & WARNINGS 3 ──────────────────────────┤
│> ● spark1     GPU █████   91% HBM ████   88% ok│⚠ HBM capacity → crosses 100 in ~2d              │
│  ● spark2     GPU ████░   73% HBM ██░░   61% ok│⚠ queue wait → 12m, rising                       │
│  ▲ pi1..12    CPU ███░░   58% RAM ██░░   44% w…│⚠ gpuUtil regression risk → elevated             │
├ BOTTLENECKS ───────────────────────────────────┬ PRESCRIBED ACTIONS ─────────────────────────────┤
│ Communication  █████████░░░  78                │ 1  Recover wasted spend  $12.0k  3,060 GPU-hrs …│
└ pages [1]overview 2:hosts 3:signals 4:ops   s sort:fleet   p pause   w snap   h help   / filter… ┘
```
