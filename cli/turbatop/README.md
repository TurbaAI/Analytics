# turbatop

`turbatop` is a read-only terminal UI for the existing turbalance product API.

## Implementation Decision

The backlog recommends Go + Bubbletea for a single static binary, with Python as the alternate path. This workspace does not currently provide a Go toolchain, so v1 is implemented as a dependency-free Python stdlib client under `cli/turbatop/`. The packaging target builds a self-contained Python zipapp at `build/turbatop/turbatop`; operators can copy that one file to hosts that already have Python 3.

The client remains a thin renderer:

- It reads the configured product API first.
- If the API has no host rows, it can fall back to the same appliance's `build/demo/live-machine-bundle.json`.
- It keeps the last frame interactive while API refreshes run in a background worker.
- It naturally orders fleet hosts, scrolls long host lists, and can sort by pressure, GPU, CPU, RAM, network, or status.
- It has six operator pages: overview, expanded hosts, signal center, ops/session context, machine L1-L6 comparison, and customer report.
- The overview includes a text alternative to the web cockpit fleet card: product header, aggregate fleet sentence, hottest host, dominant bottleneck, source, fleet heat strip, and a compact efficiency-score rail.
- It renders a btop-style color theme by default: neon borders, score-orbit and fleet-heat graphics, gradient gauges, colored sparklines, highlighted page tabs, and severity-colored warnings. `--no-color` and `NO_COLOR=1` keep the deterministic plain-text view.
- It supports keyboard and terminal mouse control: click hosts, use the wheel, and click footer/header controls.
- It includes an in-terminal help screen, pause/resume, first/last/page host jumps, and snapshot export for incident notes.
- It renders CPU-only hosts as CPU/RAM/NET rows instead of inventing GPU/HBM columns.
- It performs no remediation or write-back.
- It does not modify analytics engines, predictive engines, platform common code, or the browser dashboard.

## Run

```sh
python3 cli/turbatop/turbatop.py --api-url http://192.168.10.30:8080
python3 cli/turbatop/turbatop.py --api-url http://192.168.10.30:8080 --token-file build/product-secrets/api-viewer-token
python3 cli/turbatop/turbatop.py --api-url http://192.168.10.30:8080 --sort pressure
python3 cli/turbatop/turbatop.py --api-url http://192.168.10.30:8080 --page hosts
python3 cli/turbatop/turbatop.py --api-url http://192.168.10.30:8080 --page compare
python3 cli/turbatop/turbatop.py --api-url http://192.168.10.30:8080 --page report --llm-url http://localhost:11434/v1 --llm-model llama3.1
python3 cli/turbatop/turbatop.py --api-url http://192.168.10.30:8080 --bundle-url http://192.168.10.30:8000/build/demo/live-machine-bundle.json
python3 cli/turbatop/turbatop.py --api-url http://192.168.10.30:8080 --snapshot-file /tmp/turbatop-frame.txt
python3 cli/turbatop/turbatop.py --api-url http://192.168.10.30:8080 --no-mouse
python3 cli/turbatop/turbatop.py --once --fixture fixtures/turbatop-api.json --no-color
```

Build the zipapp:

```sh
make turbatop
./build/turbatop/turbatop --once --fixture fixtures/turbatop-api.json --no-color
```

Useful live controls:

- `q` quit, `r` refresh, `p` pause/resume, `h` or `?` help, `w` write snapshot.
- `←`/`→` switches pages; `1-6` selects overview, hosts, signals, ops, compare, or report; `Tab` and `Shift-Tab` move panel focus inside the current page; `]` and `[` cycle pages.
- `↑`/`↓` navigates inside the current page; `k`/`J`, `PageUp`/`PageDown`, `g`/`G` select hosts. On the hosts page, lowercase `j` also moves down.
- `s` cycles sort, `/` filters, `enter` drills into the selected host.
- Mouse wheel selects hosts; click bottom page tabs and footer/header controls for scope, sort, pause, snapshot, filter, help, refresh, and quit.

The report page uses an OpenAI-compatible `/v1/chat/completions` endpoint when `--llm-url` and `--llm-model` are set. The same options can be supplied with `TURBA_LLM_URL`, `TURBA_LLM_MODEL`, `TURBA_LLM_TOKEN`, and `TURBA_LLM_TIMEOUT`. Without an LLM endpoint, the page shows a deterministic customer-report draft plus the context that would be sent.
