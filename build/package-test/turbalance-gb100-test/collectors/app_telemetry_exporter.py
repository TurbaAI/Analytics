#!/usr/bin/env python3
"""Prometheus exporter for GB100/GB200 app, facility, and capability telemetry."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

try:
    from facility_adapter import normalize_facility_payload
    from nvml_confidential_collector import collect_nvml_confidential_metrics
except ImportError:  # pragma: no cover - direct module path fallback
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from facility_adapter import normalize_facility_payload
    from nvml_confidential_collector import collect_nvml_confidential_metrics


SAFE_LABELS = [
    "cluster",
    "hostname",
    "node",
    "gpu_index",
    "gpu_uuid",
    "pci_bus_id",
    "mig_instance",
    "namespace",
    "pod",
    "container",
    "workload_id",
    "tenant_id",
    "model_name",
    "framework",
    "precision_mode",
    "transformer_engine_enabled",
    "nvcomp_codec",
]

BLOCKED_LABELS = {"request_id", "user_id", "session_id", "trace_id"}
PRECISION_VALUES = {"fp16", "bf16", "fp8", "fp4", "nvfp4", "unknown"}

APP_GAUGES = {
    "tokens_per_second": ("gb100_app_tokens_per_second", "Application token throughput."),
    "requests_per_second": ("gb100_app_requests_per_second", "Application request throughput."),
    "batch_size": ("gb100_app_batch_size", "Application batch size."),
    "sequence_length": ("gb100_app_sequence_length", "Application sequence length."),
    "kv_cache_used_bytes": ("gb100_app_kv_cache_used_bytes", "Application KV cache bytes in use."),
    "compressed_bytes_per_second": ("gb100_app_compressed_bytes_per_second", "Application compressed byte throughput."),
    "decompressed_bytes_per_second": ("gb100_app_decompressed_bytes_per_second", "Application decompressed byte throughput."),
    "nccl_allreduce_bytes_per_second": ("gb100_app_nccl_allreduce_bytes_per_second", "Application NCCL all-reduce byte throughput."),
    "nccl_allgather_bytes_per_second": ("gb100_app_nccl_allgather_bytes_per_second", "Application NCCL all-gather byte throughput."),
    "nccl_reducescatter_bytes_per_second": ("gb100_app_nccl_reducescatter_bytes_per_second", "Application NCCL reduce-scatter byte throughput."),
}

APP_COUNTERS = {
    "decompression_errors_total": ("gb100_app_decompression_errors_total", "Application decompression errors."),
}

FACILITY_GAUGES = {
    "rack_inlet_coolant_temp_celsius": "Rack inlet coolant temperature.",
    "rack_outlet_coolant_temp_celsius": "Rack outlet coolant temperature.",
    "coolant_flow_liters_per_minute": "Coolant flow.",
    "cdu_alarm_state": "CDU alarm state as numeric severity.",
    "facility_power_kw": "Facility power draw in kilowatts.",
}


def _escape_label(value: str) -> str:
    return value.replace("\\", "\\\\").replace("\n", "\\n").replace('"', '\\"')


def _safe_label_value(value: Any) -> str:
    text = str(value if value is not None else "unknown").strip()
    text = re.sub(r"[^A-Za-z0-9_.:/@=-]", "_", text)
    return text[:96] or "unknown"


def _numeric(value: Any) -> float | None:
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def _labels(sample: Dict[str, Any], include_transformer: bool = True) -> str:
    labels: List[Tuple[str, str]] = []
    for key in SAFE_LABELS:
        if key == "transformer_engine_enabled" and not include_transformer:
            continue
        if key in sample:
            labels.append((key, _safe_label_value(sample[key])))
    return "{" + ",".join(f'{key}="{_escape_label(value)}"' for key, value in labels) + "}" if labels else ""


def _normalize_sample(payload: Dict[str, Any]) -> Dict[str, Any]:
    sample = {key: value for key, value in payload.items() if key not in BLOCKED_LABELS}
    sample.setdefault("precision_mode", "unknown")
    if str(sample.get("precision_mode")).lower() not in PRECISION_VALUES:
        sample["precision_mode"] = "unknown"
    sample.setdefault("transformer_engine_enabled", "unknown")
    sample.setdefault("nvcomp_codec", "unknown")
    sample["updated_at_unix"] = time.time()
    return sample


def _metric_line(name: str, value: float, labels: str = "") -> str:
    return f"{name}{labels} {value:.12g}"


class TelemetryStore:
    def __init__(self, capabilities_path: str | None = None):
        self.lock = threading.Lock()
        self.app_samples: List[Dict[str, Any]] = []
        self.facility_samples: List[Dict[str, float]] = []
        self.capabilities = self._load_capabilities(capabilities_path)

    def _load_capabilities(self, path: str | None) -> Dict[str, Any]:
        if not path:
            return {"nativeDcgm": {}, "nonNative": {}}
        try:
            with Path(path).open("r", encoding="utf-8") as handle:
                data = json.load(handle)
            if isinstance(data, dict):
                return data
        except Exception as exc:
            print(f"warning: capability file unavailable: {exc}", file=sys.stderr)
        return {"nativeDcgm": {}, "nonNative": {}}

    def add_app_payload(self, payload: Any) -> int:
        items = payload if isinstance(payload, list) else [payload]
        accepted = 0
        with self.lock:
            for item in items:
                if not isinstance(item, dict):
                    continue
                self.app_samples.append(_normalize_sample(item))
                accepted += 1
            self.app_samples = self.app_samples[-1000:]
        return accepted

    def add_facility_payload(self, payload: Dict[str, Any]) -> int:
        normalized = normalize_facility_payload(payload)
        if not normalized:
            return 0
        normalized["updated_at_unix"] = time.time()
        with self.lock:
            self.facility_samples.append(normalized)
            self.facility_samples = self.facility_samples[-100:]
        return 1

    def render(self) -> str:
        with self.lock:
            app_samples = list(self.app_samples)
            facility_samples = list(self.facility_samples)
            capabilities = dict(self.capabilities)

        lines: List[str] = [
            "# HELP gb100_app_collector_up App telemetry collector health.",
            "# TYPE gb100_app_collector_up gauge",
            "gb100_app_collector_up 1",
        ]

        for source, specs in [("nativeDcgm", capabilities.get("nativeDcgm", {})), ("nonNative", capabilities.get("nonNative", {}))]:
            for metric, info in sorted(specs.items()):
                status = _safe_label_value(info.get("status", "unknown"))
                reason = _safe_label_value(info.get("reason", "No reason provided."))
                source_field = _safe_label_value(info.get("source", source))
                labels = f'{{metric="{_escape_label(metric)}",status="{_escape_label(status)}",source="{_escape_label(source_field)}",reason="{_escape_label(reason)}"}}'
                if "gb100_metric_capability" not in "\n".join(lines):
                    lines.append("# HELP gb100_metric_capability Static metric support status. Value 1 means the stated capability row applies.")
                    lines.append("# TYPE gb100_metric_capability gauge")
                lines.append(_metric_line("gb100_metric_capability", 1, labels))

        for field, (metric_name, help_text) in APP_GAUGES.items():
            lines.append(f"# HELP {metric_name} {help_text}")
            lines.append(f"# TYPE {metric_name} gauge")
            for sample in app_samples:
                value = _numeric(sample.get(field))
                if value is not None:
                    lines.append(_metric_line(metric_name, value, _labels(sample)))

        for field, (metric_name, help_text) in APP_COUNTERS.items():
            lines.append(f"# HELP {metric_name} {help_text}")
            lines.append(f"# TYPE {metric_name} counter")
            for sample in app_samples:
                value = _numeric(sample.get(field))
                if value is not None:
                    lines.append(_metric_line(metric_name, value, _labels(sample)))

        lines.extend([
            "# HELP gb100_app_transformer_engine_enabled Transformer Engine enabled flag from app instrumentation. Unknown is -1.",
            "# TYPE gb100_app_transformer_engine_enabled gauge",
            "# HELP gb100_app_llm_workload_info LLM workload marker from app instrumentation.",
            "# TYPE gb100_app_llm_workload_info gauge",
        ])
        for sample in app_samples:
            enabled = str(sample.get("transformer_engine_enabled", "unknown")).lower()
            value = 1 if enabled in {"1", "true", "yes"} else 0 if enabled in {"0", "false", "no"} else -1
            lines.append(_metric_line("gb100_app_transformer_engine_enabled", value, _labels(sample)))
            framework = str(sample.get("framework", "")).lower()
            model = str(sample.get("model_name", "")).lower()
            is_llm = 1 if any(token in framework + " " + model for token in ["llm", "triton", "vllm", "pytorch", "tensorrt"]) else 0
            lines.append(_metric_line("gb100_app_llm_workload_info", is_llm, _labels(sample, include_transformer=False)))

        for metric_name, help_text in FACILITY_GAUGES.items():
            lines.append(f"# HELP {metric_name} {help_text} Optional external_system_required facility metric.")
            lines.append(f"# TYPE {metric_name} gauge")
            for sample in facility_samples:
                value = _numeric(sample.get(metric_name))
                if value is not None:
                    lines.append(_metric_line(metric_name, value))

        nvml = collect_nvml_confidential_metrics()
        lines.append("# HELP gpu_confidential_compute_collector_warning NVML confidential collector warning marker.")
        lines.append("# TYPE gpu_confidential_compute_collector_warning gauge")
        for warning in nvml.get("warnings", []):
            labels = f'{{reason="{_escape_label(_safe_label_value(warning))}"}}'
            lines.append(_metric_line("gpu_confidential_compute_collector_warning", 1, labels))
        for name, value in sorted(nvml.get("metrics", {}).items()):
            if "{" in name:
                metric, labels = name.split("{", 1)
                lines.append(f"# TYPE {metric} gauge")
                lines.append(_metric_line(metric, _numeric(value) or 0, "{" + labels))
            else:
                lines.append(f"# TYPE {name} gauge")
                lines.append(_metric_line(name, _numeric(value) or 0))

        return "\n".join(lines) + "\n"


def _load_jsonl(path: str, store: TelemetryStore) -> int:
    accepted = 0
    with Path(path).open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            text = line.strip()
            if not text or text.startswith("#"):
                continue
            try:
                payload = json.loads(text)
            except json.JSONDecodeError as exc:
                print(f"warning: skipped invalid JSONL line {line_number}: {exc}", file=sys.stderr)
                continue
            accepted += store.add_app_payload(payload)
    return accepted


class ExporterHandler(BaseHTTPRequestHandler):
    store: TelemetryStore

    def _send(self, status: int, body: str, content_type: str = "text/plain; version=0.0.4") -> None:
        encoded = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/healthz":
            self._send(200, "ok\n", "text/plain")
            return
        if self.path == "/metrics":
            self._send(200, self.store.render())
            return
        self._send(404, "not found\n", "text/plain")

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as exc:
            self._send(400, json.dumps({"error": str(exc)}) + "\n", "application/json")
            return
        if self.path == "/metrics/app":
            accepted = self.store.add_app_payload(payload)
            self._send(202, json.dumps({"accepted": accepted}) + "\n", "application/json")
            return
        if self.path == "/metrics/facility":
            accepted = self.store.add_facility_payload(payload)
            self._send(202, json.dumps({"accepted": accepted}) + "\n", "application/json")
            return
        self._send(404, "not found\n", "text/plain")

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"{self.client_address[0]} - {fmt % args}", file=sys.stderr)


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="GB100/GB200 app and optional facility telemetry exporter")
    parser.add_argument("--listen", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=9500)
    parser.add_argument("--jsonl", help="Optional JSONL file of app metrics to preload")
    parser.add_argument("--facility-json", help="Optional JSON or Redfish-shaped facility payload to preload")
    parser.add_argument("--capabilities", default=str(Path(__file__).resolve().parents[1] / "metrics" / "gb100-metric-capabilities.json"))
    parser.add_argument("--once", action="store_true", help="Render Prometheus text and exit")
    args = parser.parse_args(list(argv) if argv is not None else None)

    store = TelemetryStore(args.capabilities)
    if args.jsonl:
        accepted = _load_jsonl(args.jsonl, store)
        print(f"loaded {accepted} app telemetry samples from {args.jsonl}", file=sys.stderr)
    if args.facility_json:
        with Path(args.facility_json).open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if isinstance(payload, dict):
            store.add_facility_payload(payload)

    if args.once:
        print(store.render(), end="")
        return 0

    ExporterHandler.store = store
    server = ThreadingHTTPServer((args.listen, args.port), ExporterHandler)
    print(f"GB100 telemetry app collector listening on {args.listen}:{args.port}", file=sys.stderr)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
