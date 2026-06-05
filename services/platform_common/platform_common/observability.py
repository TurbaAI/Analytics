from __future__ import annotations

import time
import json
import os
import secrets
from concurrent.futures import ThreadPoolExecutor
from collections import defaultdict
from dataclasses import dataclass
from typing import Any
from urllib import request as urlrequest


@dataclass(frozen=True)
class RequestMetric:
    method: str
    path: str
    status_code: int
    count: int
    duration_seconds_sum: float


class HttpRequestMetrics:
    def __init__(self, *, service_name: str) -> None:
        self.service_name = service_name
        self._counts: dict[tuple[str, str, int], int] = defaultdict(int)
        self._duration_sums: dict[tuple[str, str, int], float] = defaultdict(float)

    def record(self, *, method: str, path: str, status_code: int, duration_seconds: float) -> None:
        key = (method.upper(), path, status_code)
        self._counts[key] += 1
        self._duration_sums[key] += max(0.0, duration_seconds)

    def snapshot(self) -> list[RequestMetric]:
        return [
            RequestMetric(
                method=method,
                path=path,
                status_code=status_code,
                count=count,
                duration_seconds_sum=self._duration_sums[(method, path, status_code)],
            )
            for (method, path, status_code), count in sorted(self._counts.items())
        ]

    def render_prometheus(self, prefix: str) -> str:
        lines = [
            f"# HELP {prefix}_http_requests_total HTTP requests by route and status.",
            f"# TYPE {prefix}_http_requests_total counter",
        ]
        for metric in self.snapshot():
            labels = _labels(
                service=self.service_name,
                method=metric.method,
                path=metric.path,
                status=str(metric.status_code),
            )
            lines.append(f"{prefix}_http_requests_total{{{labels}}} {metric.count}")
        lines.extend(
            [
                f"# HELP {prefix}_http_request_duration_seconds_sum Total HTTP request duration by route and status.",
                f"# TYPE {prefix}_http_request_duration_seconds_sum counter",
            ]
        )
        for metric in self.snapshot():
            labels = _labels(
                service=self.service_name,
                method=metric.method,
                path=metric.path,
                status=str(metric.status_code),
            )
            lines.append(f"{prefix}_http_request_duration_seconds_sum{{{labels}}} {metric.duration_seconds_sum:.6f}")
        return "\n".join(lines)


class OtlpHttpSpanExporter:
    def __init__(self, *, endpoint: str, service_name: str, timeout_seconds: float = 0.5) -> None:
        self.endpoint = _normalize_otlp_trace_endpoint(endpoint)
        self.service_name = service_name
        self.timeout_seconds = timeout_seconds
        self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix=f"{service_name}-otel")

    @classmethod
    def from_env(cls, service_name: str) -> "OtlpHttpSpanExporter | None":
        endpoint = os.environ.get("TURBALANCE_OTEL_EXPORTER_OTLP_ENDPOINT") or os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
        if not endpoint:
            return None
        timeout = float(os.environ.get("TURBALANCE_OTEL_EXPORT_TIMEOUT_SECONDS", "0.5"))
        return cls(endpoint=endpoint, service_name=service_name, timeout_seconds=timeout)

    def export_http_request_span(
        self,
        *,
        method: str,
        path: str,
        status_code: int,
        start_time_unix_nano: int,
        end_time_unix_nano: int,
        trace_id: str = "",
    ) -> None:
        trace_id = trace_id or secrets.token_hex(16)
        span = {
            "traceId": trace_id,
            "spanId": secrets.token_hex(8),
            "name": f"{method.upper()} {path}",
            "kind": "SPAN_KIND_SERVER",
            "startTimeUnixNano": str(start_time_unix_nano),
            "endTimeUnixNano": str(end_time_unix_nano),
            "attributes": [
                _otlp_attribute("http.request.method", method.upper()),
                _otlp_attribute("url.path", path),
                _otlp_attribute("http.response.status_code", status_code),
            ],
            "status": {"code": "STATUS_CODE_ERROR" if status_code >= 500 else "STATUS_CODE_UNSET"},
        }
        payload = {
            "resourceSpans": [
                {
                    "resource": {
                        "attributes": [
                            _otlp_attribute("service.name", self.service_name),
                            _otlp_attribute("telemetry.sdk.language", "python"),
                        ]
                    },
                    "scopeSpans": [
                        {
                            "scope": {"name": "turbalance.platform_common.observability", "version": "0.1.0"},
                            "spans": [span],
                        }
                    ],
                }
            ]
        }
        self._executor.submit(self._post_payload, payload)

    def _post_payload(self, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        req = urlrequest.Request(
            self.endpoint,
            data=body,
            headers={"content-type": "application/json"},
            method="POST",
        )
        try:
            with urlrequest.urlopen(req, timeout=self.timeout_seconds):
                pass
        except Exception:
            return


def install_request_observability(
    app: Any,
    metrics: HttpRequestMetrics,
    span_exporter: OtlpHttpSpanExporter | None = None,
) -> None:
    span_exporter = span_exporter or OtlpHttpSpanExporter.from_env(metrics.service_name)

    @app.middleware("http")
    async def observe_requests(request: Any, call_next: Any) -> Any:
        started_perf = time.perf_counter()
        started_ns = time.time_ns()
        trace_id = trace_id_from_traceparent(request.headers.get("traceparent", ""))
        status_code = 500
        response = None
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            ended_ns = time.time_ns()
            path = _route_path(request)
            metrics.record(
                method=request.method,
                path=path,
                status_code=status_code,
                duration_seconds=time.perf_counter() - started_perf,
            )
            if span_exporter is not None:
                span_exporter.export_http_request_span(
                    method=request.method,
                    path=path,
                    status_code=status_code,
                    start_time_unix_nano=started_ns,
                    end_time_unix_nano=ended_ns,
                    trace_id=trace_id,
                )
            if response is not None and trace_id:
                response.headers["x-trace-id"] = trace_id


def trace_id_from_traceparent(traceparent: str) -> str:
    parts = traceparent.strip().split("-")
    if len(parts) != 4:
        return ""
    version, trace_id, _span_id, _flags = parts
    if version != "00" or len(trace_id) != 32:
        return ""
    if not all(char in "0123456789abcdefABCDEF" for char in trace_id):
        return ""
    return trace_id.lower()


def _route_path(request: Any) -> str:
    route = request.scope.get("route")
    return getattr(route, "path", request.url.path)


def _labels(**labels: str) -> str:
    return ",".join(f'{key}="{_escape(value)}"' for key, value in labels.items())


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def _normalize_otlp_trace_endpoint(endpoint: str) -> str:
    endpoint = endpoint.rstrip("/")
    return endpoint if endpoint.endswith("/v1/traces") else f"{endpoint}/v1/traces"


def _otlp_attribute(key: str, value: str | int | float | bool) -> dict[str, Any]:
    if isinstance(value, bool):
        otlp_value = {"boolValue": value}
    elif isinstance(value, int):
        otlp_value = {"intValue": str(value)}
    elif isinstance(value, float):
        otlp_value = {"doubleValue": value}
    else:
        otlp_value = {"stringValue": str(value)}
    return {"key": key, "value": otlp_value}
