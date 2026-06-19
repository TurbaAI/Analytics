from __future__ import annotations

import fcntl
import http.server
import json
import os
import pathlib
import pty
import subprocess
import sys
import tempfile
import threading
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "cli" / "turbatop"))

import turbatop  # noqa: E402


def assert_equal(left, right, message: str) -> None:
    if left != right:
        raise AssertionError(f"{message}\nexpected: {right!r}\nactual:   {left!r}")


def assert_keyboard_quits_during_slow_fetch() -> None:
    child = f"""
import argparse
import sys
import time
sys.path.insert(0, {str(ROOT / "cli" / "turbatop")!r})
import turbatop

class SlowClient:
    def fetch(self, scope="tenant"):
        time.sleep(5)
        return {{"scope": scope, "hosts": {{"hosts": []}}, "resources": {{}}, "ready": {{"status": "slow"}}}}, []

args = argparse.Namespace(
    api_url="fixture",
    no_color=True,
    refresh=30,
    scope="tenant",
    sort="fleet",
    page="overview",
    snapshot_file="",
    no_mouse=True,
    width=100,
    height=20,
    llm_url="",
    llm_model="",
    llm_token="",
    llm_timeout=12,
    insecure=False,
)
raise SystemExit(turbatop.run_live(args, SlowClient()))
"""
    master, slave = pty.openpty()
    proc = subprocess.Popen(
        [sys.executable, "-c", child],
        cwd=ROOT,
        stdin=slave,
        stdout=slave,
        stderr=slave,
        close_fds=True,
        env={**os.environ, "TERM": "xterm-256color"},
    )
    os.close(slave)
    flags = fcntl.fcntl(master, fcntl.F_GETFL)
    fcntl.fcntl(master, fcntl.F_SETFL, flags | os.O_NONBLOCK)
    start = time.time()
    sent_quit = False
    try:
        while time.time() - start < 3:
            try:
                while os.read(master, 8192):
                    pass
            except BlockingIOError:
                pass
            except OSError:
                break
            if not sent_quit and time.time() - start > 0.4:
                os.write(master, b"q")
                sent_quit = True
            if proc.poll() is not None:
                break
            time.sleep(0.05)
    finally:
        try:
            os.close(master)
        except OSError:
            pass
    if proc.poll() is None:
        proc.kill()
        proc.wait()
        raise AssertionError("keyboard quit should not wait for an in-flight API fetch")
    if proc.returncode != 0:
        raise AssertionError(f"slow-fetch keyboard smoke exited {proc.returncode}")


def assert_arrow_keys_route_pages_and_hosts() -> None:
    child = f"""
import argparse
import sys
sys.path.insert(0, {str(ROOT / "cli" / "turbatop")!r})
import turbatop

args = argparse.Namespace(
    api_url="fixture",
    no_color=True,
    refresh=30,
    scope="tenant",
    sort="fleet",
    page="overview",
    snapshot_file="",
    no_mouse=True,
    width=100,
    height=22,
    llm_url="",
    llm_model="",
    llm_token="",
    llm_timeout=12,
    insecure=False,
)
client = turbatop.FixtureClient({str(ROOT / "fixtures" / "turbatop-api.json")!r})
raise SystemExit(turbatop.run_live(args, client))
"""
    master, slave = pty.openpty()
    proc = subprocess.Popen(
        [sys.executable, "-c", child],
        cwd=ROOT,
        stdin=slave,
        stdout=slave,
        stderr=slave,
        close_fds=True,
        env={**os.environ, "TERM": "xterm-256color"},
    )
    os.close(slave)
    flags = fcntl.fcntl(master, fcntl.F_GETFL)
    fcntl.fcntl(master, fcntl.F_SETFL, flags | os.O_NONBLOCK)
    output = ""

    def pump(duration: float) -> str:
        nonlocal output
        end = time.time() + duration
        while time.time() < end:
            try:
                output += os.read(master, 65536).decode("utf-8", "ignore")
            except BlockingIOError:
                pass
            except OSError:
                break
            time.sleep(0.03)
        return output

    try:
        pump(0.8)
        if "[1]overview" not in output:
            raise AssertionError("arrow smoke should start on overview")
        if "new data" not in output:
            raise AssertionError("fresh live data should briefly render the heartbeat indicator")
        os.write(master, b"\x1b[C")
        pump(0.5)
        if "[2]hosts" not in output:
            raise AssertionError("right arrow should switch to hosts page")
        marker = len(output)
        os.write(master, b"\t")
        pump(0.5)
        tabbed = output[marker:]
        if "[2]hosts" not in tabbed or "▣ HOST INSPECTOR" not in tabbed:
            raise AssertionError("tab should keep the page and focus the next panel")
        marker = len(output)
        os.write(master, b"\x1b[B")
        pump(0.5)
        if "[2]hosts" not in output:
            raise AssertionError("down arrow should keep the hosts page selected")
        changed = output[marker:]
        if "[1]overview" in changed or "[3]signals" in changed or "[4]ops" in changed:
            raise AssertionError("down arrow should navigate inside the page, not switch pages")
        if "▸ class accelerator" not in changed:
            raise AssertionError("down arrow should move inside the focused inspector panel after tab")
        os.write(master, b"\x1b[D")
        pump(0.5)
        if "[1]overview" not in output:
            raise AssertionError("left arrow should switch back to overview")
        os.write(master, b"q")
        pump(0.2)
        if proc.poll() is None:
            try:
                proc.wait(timeout=1)
            except subprocess.TimeoutExpired:
                pass
    finally:
        try:
            os.close(master)
        except OSError:
            pass
        if proc.poll() is None:
            proc.kill()
            proc.wait()
    if proc.returncode not in (0, None):
        raise AssertionError(f"arrow key smoke exited {proc.returncode}")


def assert_llm_report_uses_openai_compatible_endpoint() -> None:
    requests: list[dict] = []

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            length = int(self.headers.get("Content-Length") or "0")
            body = self.rfile.read(length).decode("utf-8")
            requests.append(json.loads(body))
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "choices": [{
                    "message": {
                        "content": "# Executive Summary\nMock LLM customer report from CONTEXT_JSON.\n\n# Next Actions\nPrioritize L1-L6 pressure gaps."
                    }
                }]
            }).encode("utf-8"))

        def log_message(self, *_args: object) -> None:
            return

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        result = subprocess.run(
            [
                sys.executable,
                str(ROOT / "cli" / "turbatop" / "turbatop.py"),
                "--once",
                "--fixture",
                str(ROOT / "fixtures" / "turbatop-api.json"),
                "--page",
                "report",
                "--llm-url",
                f"http://127.0.0.1:{server.server_port}",
                "--llm-model",
                "mock-model",
                "--width",
                "120",
                "--height",
                "26",
                "--no-color",
            ],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
            timeout=15,
        )
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
    if result.returncode != 0:
        raise AssertionError(result.stderr or result.stdout)
    if "Mock LLM customer report from CONTEXT_JSON" not in result.stdout:
        raise AssertionError("report page should render mocked LLM text")
    if "mock-model" not in result.stdout:
        raise AssertionError("report page should show the configured LLM model")
    if len(requests) != 1:
        raise AssertionError(f"LLM endpoint should be called once, got {len(requests)}")
    request_text = json.dumps(requests[0])
    if requests[0].get("model") != "mock-model" or "CONTEXT_JSON" not in request_text:
        raise AssertionError("LLM request should use the configured model and include context JSON")


def assert_report_page_g_generates_llm_in_live_mode() -> None:
    requests: list[dict] = []

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            length = int(self.headers.get("Content-Length") or "0")
            body = self.rfile.read(length).decode("utf-8")
            requests.append(json.loads(body))
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "choices": [{
                    "message": {
                        "content": "# Executive Summary\nGenerated via report hotkey from CONTEXT_JSON."
                    }
                }]
            }).encode("utf-8"))

        def log_message(self, *_args: object) -> None:
            return

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    child = f"""
import argparse
import sys
sys.path.insert(0, {str(ROOT / "cli" / "turbatop")!r})
import turbatop

args = argparse.Namespace(
    api_url="fixture",
    no_color=True,
    refresh=30,
    scope="tenant",
    sort="fleet",
    page="report",
    snapshot_file="",
    no_mouse=True,
    width=120,
    height=26,
    llm_url={f"http://127.0.0.1:{server.server_port}"!r},
    llm_model="hotkey-model",
    llm_token="",
    llm_timeout=12,
    insecure=False,
)
client = turbatop.FixtureClient({str(ROOT / "fixtures" / "turbatop-api.json")!r})
raise SystemExit(turbatop.run_live(args, client))
"""
    master, slave = pty.openpty()
    proc = subprocess.Popen(
        [sys.executable, "-c", child],
        cwd=ROOT,
        stdin=slave,
        stdout=slave,
        stderr=slave,
        close_fds=True,
        env={**os.environ, "TERM": "xterm-256color"},
    )
    os.close(slave)
    flags = fcntl.fcntl(master, fcntl.F_GETFL)
    fcntl.fcntl(master, fcntl.F_SETFL, flags | os.O_NONBLOCK)
    output = ""

    def pump(duration: float) -> str:
        nonlocal output
        end = time.time() + duration
        while time.time() < end:
            try:
                output += os.read(master, 65536).decode("utf-8", "ignore")
            except BlockingIOError:
                pass
            except OSError:
                break
            time.sleep(0.03)
        return output

    try:
        pump(0.8)
        if "[6]report" not in output or "Press G to generate" not in output:
            raise AssertionError("report page should advertise G generation when LLM is configured")
        if requests:
            raise AssertionError("live report page should wait for G before calling the LLM endpoint")
        os.write(master, b"G")
        deadline = time.time() + 5
        while time.time() < deadline:
            pump(0.2)
            if "Generated via report hotkey from CONTEXT_JSON" in output:
                break
        if "Generated via report hotkey from CONTEXT_JSON" not in output:
            raise AssertionError("G on report page should render generated LLM text")
        if len(requests) != 1:
            raise AssertionError(f"G should call the LLM endpoint once, got {len(requests)}")
        if requests[0].get("model") != "hotkey-model":
            raise AssertionError("G-triggered LLM request should use configured model")
        os.write(master, b"q")
        pump(0.2)
        if proc.poll() is None:
            try:
                proc.wait(timeout=1)
            except subprocess.TimeoutExpired:
                pass
    finally:
        try:
            os.close(master)
        except OSError:
            pass
        if proc.poll() is None:
            proc.kill()
            proc.wait()
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
    if proc.returncode not in (0, None):
        raise AssertionError(f"report G hotkey smoke exited {proc.returncode}")


def assert_api_client_prefers_live_bundle_fast() -> None:
    api_hits: list[str] = []
    bundle_payload = json.loads((ROOT / "fixtures" / "turbatop-live-bundle.json").read_text())

    class SlowApiHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            api_hits.append(self.path)
            time.sleep(1.5)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b"{}")

        def log_message(self, *_args: object) -> None:
            return

    class BundleHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            body = json.dumps(bundle_payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args: object) -> None:
            return

    api_server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), SlowApiHandler)
    bundle_server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), BundleHandler)
    api_thread = threading.Thread(target=api_server.serve_forever, daemon=True)
    bundle_thread = threading.Thread(target=bundle_server.serve_forever, daemon=True)
    api_thread.start()
    bundle_thread.start()
    try:
        client = turbatop.ApiClient(
            f"http://127.0.0.1:{api_server.server_port}",
            timeout=0.4,
            bundle_url=f"http://127.0.0.1:{bundle_server.server_port}/bundle.json",
            prefer_bundle=True,
        )
        started = time.perf_counter()
        payload, errors = client.fetch("tenant")
        elapsed = time.perf_counter() - started
    finally:
        api_server.shutdown()
        bundle_server.shutdown()
        api_server.server_close()
        bundle_server.server_close()
        api_thread.join(timeout=2)
        bundle_thread.join(timeout=2)
    if errors:
        raise AssertionError(f"bundle-first fetch should not report errors: {errors}")
    if elapsed > 0.8:
        raise AssertionError(f"bundle-first fetch waited too long: {elapsed:.3f}s")
    if api_hits:
        raise AssertionError(f"bundle-first fetch should not call slow API endpoints: {api_hits}")
    frame = turbatop.normalize_payload(payload, errors, api_url="fixture")
    host_ids = [host.host_id for host in frame.hosts]
    assert_equal(host_ids, ["SPARK1", "pi1"], "bundle-first fetch should render live bundle hosts")
    if not any("fast path" in notice for notice in payload.get("notices", [])):
        raise AssertionError("bundle-first fetch should label the fast path in notices")


def assert_bundle_http_cache_uses_conditional_get() -> None:
    requests: list[str] = []
    last_modified = "Fri, 19 Jun 2026 13:30:00 GMT"
    bundle_payload = json.loads((ROOT / "fixtures" / "turbatop-live-bundle.json").read_text())

    class CacheHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            requests.append(self.headers.get("If-Modified-Since", ""))
            if self.headers.get("If-Modified-Since") == last_modified:
                self.send_response(304)
                self.end_headers()
                return
            body = json.dumps(bundle_payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Last-Modified", last_modified)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args: object) -> None:
            return

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), CacheHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        client = turbatop.ApiClient("http://127.0.0.1:9", timeout=0.5)
        url = f"http://127.0.0.1:{server.server_port}/bundle.json"
        first = client.get_url_json(url)
        second = client.get_url_json(url)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
    assert_equal(first, second, "304 bundle cache should return the cached JSON payload")
    assert_equal(requests, ["", last_modified], "second bundle request should use If-Modified-Since")


def main() -> None:
    assert_equal(turbatop.sparkline([], 4), "▕    ▏", "empty sparkline")
    assert_equal(turbatop.sparkline([7], 4), "▕▁▁▁▁▏", "single-value sparkline")
    assert_equal(turbatop.sparkline([0, 50, 100], 3), "▕▁▅█▏", "scaled sparkline")
    assert_equal(turbatop.gauge(0, 5, color=False), "░░░░░", "zero gauge")
    assert_equal(turbatop.gauge(60, 5, color=False), "███░░", "mid gauge")
    assert_equal(turbatop.gauge(100, 5, color=False), "█████", "full gauge")
    assert_equal(turbatop.gauge(float("nan"), 5, color=False), "░░░░░", "nan gauge")
    assert_equal(
        turbatop.default_bundle_url("http://192.168.10.30:8080"),
        "http://192.168.10.30:8000/build/demo/live-machine-bundle.json",
        "API URL should derive the same-appliance bundle fallback",
    )
    assert_api_client_prefers_live_bundle_fast()
    assert_bundle_http_cache_uses_conditional_get()
    with tempfile.TemporaryDirectory() as temp_dir:
        token_file = pathlib.Path(temp_dir) / "api-viewer-token"
        token_file.write_text("viewer-from-file\n")
        assert_equal(turbatop.resolve_token("", str(token_file)), "viewer-from-file", "token file should supply bearer token")
        assert_equal(turbatop.resolve_token("direct-token", str(token_file)), "direct-token", "explicit token should win")
    sorted_hosts = sorted(["pi1", "pi10", "pi2", "SPARK2", "NUC14E", "SPARK1"], key=turbatop.host_sort_key)
    assert_equal(sorted_hosts, ["NUC14E", "SPARK1", "SPARK2", "pi1", "pi2", "pi10"], "fleet hosts should sort naturally")
    sample_hosts = [
        turbatop.HostRow("pi1", cpu=10, ram=12),
        turbatop.HostRow("pi2", cpu=65, ram=20),
        turbatop.HostRow("pi3", cpu=20, ram=91),
    ]
    assert_equal([host.host_id for host in turbatop.sort_hosts(sample_hosts, "pressure")], ["pi3", "pi2", "pi1"], "pressure sort")
    assert_equal(turbatop.next_page("overview"), "hosts", "page cycling should advance")
    assert_equal(turbatop.next_page("overview", -1), "report", "page cycling should wrap backward")
    assert_equal(turbatop.page_for_key("3"), "signals", "number keys should select pages")
    assert_equal(turbatop.page_for_key("5"), "compare", "number keys should select comparison page")
    assert_equal(turbatop.page_for_key("6"), "report", "number keys should select report page")
    heartbeat_frame = turbatop.TuiFrame(fleet="demo", hosts=sample_hosts, heartbeat_active=True)
    heartbeat_frame.heartbeat_phase = 0
    if "♥ new data" not in turbatop.render_frame(heartbeat_frame, width=120, height=24, color=False):
        raise AssertionError("heartbeat frame should render a filled heart on fresh data")
    heartbeat_frame.heartbeat_phase = 1
    if "♡ new data" not in turbatop.render_frame(heartbeat_frame, width=120, height=24, color=False):
        raise AssertionError("heartbeat frame should alternate heart glyphs while beating")
    heartbeat_frame.heartbeat_active = False
    if "♡ idle" not in turbatop.render_frame(heartbeat_frame, width=120, height=24, color=False):
        raise AssertionError("heartbeat frame should leave an idle heart visible between data updates")
    assert_equal(turbatop.key_from_escape_sequence("\x1b[1;2A"), "up", "modified up arrow should decode")
    assert_equal(turbatop.key_from_escape_sequence("\x1b[1;2B"), "down", "modified down arrow should decode")
    assert_equal(turbatop.key_from_escape_sequence("\x1b[D"), "left", "left arrow should decode")
    assert_equal(turbatop.key_from_escape_sequence("\x1b[C"), "right", "right arrow should decode")
    assert_equal(turbatop.key_from_escape_sequence("\x1b[1;2D"), "left", "modified left arrow should decode")
    assert_equal(turbatop.key_from_escape_sequence("\x1b[1;2C"), "right", "modified right arrow should decode")
    assert_equal(turbatop.key_from_escape_sequence("\x1bOA"), "up", "application up arrow should decode")
    assert_equal(turbatop.key_from_escape_sequence("\x1bOB"), "down", "application down arrow should decode")
    assert_equal(turbatop.key_from_escape_sequence("\x1bOD"), "left", "application left arrow should decode")
    assert_equal(turbatop.key_from_escape_sequence("\x1bOC"), "right", "application right arrow should decode")
    assert_equal(turbatop.key_from_escape_sequence("\x1b[?1;2A"), "up", "private-mode modified up arrow should decode")
    assert_equal(turbatop.key_from_escape_sequence("\x1b[?1;2B"), "down", "private-mode modified down arrow should decode")
    assert_equal(turbatop.key_from_escape_sequence("\x1b[?1;2D"), "left", "private-mode modified left arrow should decode")
    assert_equal(turbatop.key_from_escape_sequence("\x1b[?1;2C"), "right", "private-mode modified right arrow should decode")
    assert_equal(turbatop.key_from_escape_sequence("\x1b[Z"), "shift_tab", "shift-tab should decode")
    assert_equal(turbatop.page_navigation_delta("left"), -1, "left should move to previous page")
    assert_equal(turbatop.page_navigation_delta("right"), 1, "right should move to next page")
    assert_equal(turbatop.next_page("hosts", turbatop.page_navigation_delta("right") or 0), "signals", "right should advance pages")
    assert_equal(turbatop.next_page("hosts", turbatop.page_navigation_delta("left") or 0), "overview", "left should move back pages")
    assert_equal(turbatop.panel_count("overview"), 6, "overview should expose all panels to tab focus")
    assert_equal(turbatop.next_panel_focus("hosts", 0), 1, "tab should advance host page panel focus")
    assert_equal(turbatop.next_panel_focus("hosts", 0, -1), 1, "shift-tab should wrap host page panel focus")
    assert_equal(turbatop.panel_label("overview", 3), "warnings", "panel label should describe focus")
    assert_equal(turbatop.panel_moves_hosts("overview", 2), True, "overview host panel should route arrows to hosts")
    assert_equal(turbatop.panel_moves_hosts("overview", 3), False, "overview warnings panel should route arrows to its own rows")
    assert_equal(turbatop.host_navigation_delta("hosts", "j"), 1, "hosts page j should move down")
    assert_equal(turbatop.host_navigation_delta("overview", "j"), None, "overview j should remain available for job scope")
    assert_equal(turbatop.host_navigation_delta("hosts", "up"), -1, "hosts page up should move selection")
    assert_equal(turbatop.scroll_start_for(10, 5, 12), 7, "scroll should follow selected host")
    sample_frame = turbatop.TuiFrame(hosts=sample_hosts)
    hero_left, hero_right = turbatop.overview_hero_widths(120)
    panel_left, panel_right = turbatop.split_widths(120)
    if not (hero_left > hero_right and abs(panel_left - panel_right) <= 2):
        raise AssertionError("overview hero should keep a compact score rail while lower panels split evenly")
    if "◜" not in turbatop.score_orbit(41, color=False):
        raise AssertionError("score orbit should render a visible terminal instrument")
    if "▕" not in turbatop.host_heat_strip(sample_hosts, 8, color=False):
        raise AssertionError("fleet heat strip should render framed heat blocks")
    assert_equal(turbatop.move_selection(sample_frame, 0, "", "fleet", turbatop.host_navigation_delta("hosts", "down") or 0), 1, "hosts page down should select next host")
    assert_equal(turbatop.initial_selected_index(sample_frame, "", "pressure"), 2, "pressure sort should select the hottest host")
    assert_equal(turbatop.edge_selection(sample_frame, "", "fleet", last=False), 0, "edge selection should jump first")
    assert_equal(turbatop.edge_selection(sample_frame, "", "fleet", last=True), 2, "edge selection should jump last")
    assert "▕" in turbatop.render_host(sample_hosts[2], selected=True, width=70, color=False)
    cpu_only = turbatop.HostRow("pi1", cpu=48, ram=18, network=7, accelerator=False)
    cpu_only_line = turbatop.render_host(cpu_only, selected=False, width=96, color=False)
    if "GPU" in cpu_only_line or "HBM" in cpu_only_line:
        raise AssertionError(f"CPU-only hosts must not render accelerator columns: {cpu_only_line!r}")
    if "CPU" not in cpu_only_line or "RAM" not in cpu_only_line or "NET" not in cpu_only_line:
        raise AssertionError(f"CPU-only hosts should render CPU/RAM/NET columns: {cpu_only_line!r}")
    assert_equal(turbatop.host_pressure(cpu_only), 48, "CPU-only pressure should use CPU/RAM/NET")
    mixed_hosts = [
        cpu_only,
        turbatop.HostRow("spark1", gpu=0, hbm=4, cpu=5, ram=6, accelerator=True),
    ]
    mixed_payload = {
        "alerts": {"alerts": [{"title": "GPU starvation", "evidence": "summary copy without host"}]},
        "alertCandidates": {"rows": [
            {"host_id": "pi1", "title": "GPU starvation", "evidence": "Pi should not appear"},
            {"host_id": "spark1", "title": "GPU starvation", "evidence": "SPARK should appear"},
        ]},
    }
    warnings = turbatop.build_warnings(mixed_payload, mixed_hosts)
    if any("Pi should not appear" in warning for warning in warnings):
        raise AssertionError("CPU-only GPU warnings should be suppressed")
    if not any("SPARK should appear" in warning for warning in warnings):
        raise AssertionError("accelerator GPU warnings should still render")
    actions = turbatop.build_actions(mixed_payload, mixed_hosts)
    assert_equal([action.get("detail") for action in actions], ["SPARK should appear"], "CPU-only GPU actions should be suppressed")
    assert_equal(turbatop.parse_mouse_event("\x1b[<0;12;7M"), turbatop.MouseEvent(button=0, x=12, y=7), "SGR mouse click")
    overview_layout = turbatop.layout_state(sample_frame, 100, 28, 0, "", "fleet")
    third_host_y = overview_layout.host_start_y + 2
    clicked = turbatop.apply_mouse_event(turbatop.MouseEvent(0, 5, third_host_y), sample_frame, 0, "", "fleet", "tenant", False, 100, 28)
    assert_equal(clicked[0], 2, "left-click should select the clicked host row")
    clicked_again = turbatop.apply_mouse_event(turbatop.MouseEvent(0, 5, third_host_y), sample_frame, 2, "", "fleet", "tenant", False, 100, 28)
    assert_equal(clicked_again[3], True, "clicking the selected host should toggle drill-in")
    wheel_up = turbatop.apply_mouse_event(turbatop.MouseEvent(64, 5, third_host_y), sample_frame, 2, "", "fleet", "tenant", False, 100, 28)
    assert_equal(wheel_up[0], 1, "mouse wheel should move host selection")
    footer = turbatop.bottom_border(turbatop.status_line(sample_frame, "tenant", "", "fleet"), 100)
    sort_x = footer.find("s sort:fleet") + 1
    sorted_click = turbatop.apply_mouse_event(turbatop.MouseEvent(0, sort_x, turbatop.layout_state(sample_frame, 100, 28, 0, "", "fleet").status_y), sample_frame, 0, "", "fleet", "tenant", False, 100, 28)
    assert_equal(sorted_click[1], "pressure", "footer sort click should cycle sort mode")
    assert_equal(sorted_click[0], 2, "footer sort click should select the top host in the new sort")
    wide_footer = turbatop.bottom_border(turbatop.status_line(sample_frame, "tenant", "", "fleet", paused=True), 160)
    pause_x = wide_footer.find("p resume") + 1
    pause_click = turbatop.apply_mouse_event(turbatop.MouseEvent(0, pause_x, turbatop.layout_state(sample_frame, 160, 28, 0, "", "fleet").status_y), sample_frame, 0, "", "fleet", "tenant", False, 160, 28, paused=True)
    assert_equal(pause_click[4], "pause", "footer pause click should toggle pause")
    help_x = wide_footer.find("h help") + 1
    help_click = turbatop.apply_mouse_event(turbatop.MouseEvent(0, help_x, turbatop.layout_state(sample_frame, 160, 28, 0, "", "fleet").status_y), sample_frame, 0, "", "fleet", "tenant", False, 160, 28)
    assert_equal(help_click[4], "help", "footer help click should open help")
    page_footer = turbatop.bottom_border(turbatop.status_line(sample_frame, "tenant", "", "fleet", page="overview"), 160)
    hosts_x = page_footer.find("2:hosts") + 1
    hosts_click = turbatop.apply_mouse_event(turbatop.MouseEvent(0, hosts_x, turbatop.layout_state(sample_frame, 160, 28, 0, "", "fleet").status_y), sample_frame, 0, "", "fleet", "tenant", False, 160, 28)
    assert_equal(hosts_click[4], "page:hosts", "footer page tab should switch pages")
    overview_frame = turbatop.render_frame(sample_frame, width=120, height=24, color=False, page="overview")
    if "Fleet heat" not in overview_frame or "◜" not in overview_frame:
        raise AssertionError("overview page should render the advanced score and fleet heat graphics")
    focused_overview = turbatop.render_frame(sample_frame, width=120, height=24, color=False, page="overview", panel_focus=3)
    if "▣ FORECAST & WARNINGS" not in focused_overview or "panel:warnings" not in focused_overview:
        raise AssertionError("overview tab focus should mark the active panel")
    warning_frame = turbatop.TuiFrame(hosts=sample_hosts, warnings=["first warning", "second warning"])
    focused_warning_row = turbatop.render_frame(warning_frame, width=120, height=24, color=False, page="overview", panel_focus=3, panel_cursor=1)
    if "▸ second warning" not in focused_warning_row:
        raise AssertionError("overview warning focus should mark the active warning row")
    hosts_frame = turbatop.render_frame(sample_frame, width=100, height=24, color=False, page="hosts")
    if "HOST DIRECTORY" not in hosts_frame or "HOST INSPECTOR" not in hosts_frame:
        raise AssertionError("hosts page should render the expanded host directory")
    focused_hosts_frame = turbatop.render_frame(sample_frame, width=100, height=24, color=False, page="hosts", panel_focus=1)
    if "▣ HOST INSPECTOR" not in focused_hosts_frame or "panel:inspector" not in focused_hosts_frame:
        raise AssertionError("hosts tab focus should move to the inspector panel")
    focused_inspector_row = turbatop.render_frame(sample_frame, width=100, height=24, color=False, page="hosts", panel_focus=1, panel_cursor=1)
    if "▸ class accelerator" not in focused_inspector_row:
        raise AssertionError("hosts inspector focus should move inside inspector rows")
    signals_frame = turbatop.render_frame(sample_frame, width=100, height=24, color=False, page="signals")
    if "SIGNAL CENTER" not in signals_frame or "PRESCRIBED ACTIONS" not in signals_frame:
        raise AssertionError("signals page should render warnings and actions panels")
    ops_frame = turbatop.render_frame(sample_frame, width=100, height=24, color=False, page="ops")
    if "OPERATIONS" not in ops_frame or "Page controls" not in ops_frame:
        raise AssertionError("ops page should render source and command context")
    compare_frame = turbatop.render_frame(sample_frame, width=120, height=24, color=False, page="compare")
    if "MACHINE L1-L6" not in compare_frame or "MACHINE L1-L6 LADDER" not in compare_frame or "PEER & FLEET CONTEXT" not in compare_frame:
        raise AssertionError("compare page should render machine L1-L6 and peer context")
    report_frame = turbatop.render_frame(sample_frame, width=120, height=24, color=False, page="report")
    if "CUSTOMER REPORT" not in report_frame or "CONTEXT INGESTED" not in report_frame:
        raise AssertionError("report page should render customer report and ingested context")
    if "LLM CUSTOMER REPORT" in report_frame:
        raise AssertionError("report page should label the report panel as customer report")
    color_frame = turbatop.render_frame(sample_frame, width=120, height=24, color=True, page="hosts")
    if "\033[" not in color_frame or "▟█▙" not in color_frame:
        raise AssertionError("color mode should render the btop-style neon wordmark and ANSI theme")
    help_frame = turbatop.render_frame(sample_frame, width=100, height=24, color=False, help_open=True, paused=True, snapshot_file="snap.txt")
    if "Keyboard" not in help_frame or "w write snapshot" not in help_frame or "CPU-only hosts" not in help_frame or "1-6 switch pages" not in help_frame or "tab panel focus" not in help_frame:
        raise AssertionError("help frame should document keyboard, snapshot, and CPU-only rendering")
    with tempfile.TemporaryDirectory() as temp_dir:
        snapshot_path = pathlib.Path(temp_dir) / "nested" / "snapshot.txt"
        message = turbatop.write_snapshot(str(snapshot_path), "hello snapshot\n")
        assert_equal(message, f"snapshot saved {snapshot_path}", "snapshot writer should report success")
        assert_equal(snapshot_path.read_text(), "hello snapshot\n", "snapshot writer should persist content")

    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "cli" / "turbatop" / "turbatop.py"),
            "--once",
            "--fixture",
            str(ROOT / "fixtures" / "turbatop-api.json"),
            "--width",
            "100",
            "--height",
            "28",
            "--no-color",
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise AssertionError(result.stderr or result.stdout)
    golden = (ROOT / "tests" / "fixtures" / "turbatop-golden.txt").read_text()
    assert_equal(result.stdout, golden, "golden frame")

    error_result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "cli" / "turbatop" / "turbatop.py"),
            "--once",
            "--api-url",
            "http://127.0.0.1:9",
            "--width",
            "80",
            "--height",
            "20",
            "--no-color",
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
        timeout=15,
    )
    if error_result.returncode != 0:
        raise AssertionError(error_result.stderr or error_result.stdout)
    if "status:" not in error_result.stdout:
        raise AssertionError("API errors should render a status line")

    bundle_payload, bundle_errors = turbatop.FixtureClient(str(ROOT / "fixtures" / "turbatop-live-bundle.json")).fetch("tenant")
    bundle_frame = turbatop.normalize_payload(bundle_payload, bundle_errors, api_url="fixture")
    assert_equal(bundle_frame.fleet, "local-lab", "source bundle tenant should become fleet label")
    assert_equal([host.host_id for host in bundle_frame.hosts], ["SPARK1", "pi1"], "source bundle hosts should render in fleet order")
    assert_equal(round(bundle_frame.hosts[0].gpu or 0), 42, "source bundle GPU percent should map to host row")
    bundle_pi = bundle_frame.hosts[1]
    assert_equal(bundle_pi.accelerator, False, "source bundle Pi should be CPU-only")
    assert_equal(bundle_pi.gpu, None, "source bundle Pi should not expose synthetic GPU utilization")
    assert_equal(bundle_pi.hbm, None, "source bundle Pi should not expose synthetic HBM")
    if not any("pi3" in warning for warning in bundle_frame.warnings):
        raise AssertionError("source bundle remote failures should become warnings")
    api_payload, api_errors = turbatop.FixtureClient(str(ROOT / "fixtures" / "turbatop-api.json")).fetch("tenant")
    merged = turbatop.merge_bundle_hosts(api_payload, bundle_payload)
    if "pi1" not in merged:
        raise AssertionError("source bundle should merge missing hosts into API payload")
    api_with_bundle = turbatop.normalize_payload(api_payload, api_errors, api_url="fixture")
    merged_host_ids = [host.host_id for host in api_with_bundle.hosts]
    if "pi1" not in merged_host_ids:
        raise AssertionError("merged source-bundle host should render with API hosts")
    assert_equal(merged_host_ids[:3], ["spark1", "spark2", "pi1"], "merged hosts should use natural fleet order")
    if "SPARK1" in merged_host_ids:
        raise AssertionError("merge should de-dupe host IDs case-insensitively")

    bundle_result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "cli" / "turbatop" / "turbatop.py"),
            "--once",
            "--fixture",
            str(ROOT / "fixtures" / "turbatop-live-bundle.json"),
            "--width",
            "100",
            "--height",
            "24",
            "--no-color",
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if bundle_result.returncode != 0:
        raise AssertionError(bundle_result.stderr or bundle_result.stdout)
    if "pi1" not in bundle_result.stdout or "SPARK1" not in bundle_result.stdout:
        raise AssertionError("source bundle fixture should render live hosts")
    assert_llm_report_uses_openai_compatible_endpoint()
    assert_report_page_g_generates_llm_in_live_mode()
    assert_keyboard_quits_during_slow_fetch()
    assert_arrow_keys_route_pages_and_hosts()

    print("turbatop tests passed")


if __name__ == "__main__":
    main()
