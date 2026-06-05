from __future__ import annotations

import json
import os
import shlex
import subprocess
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import PlainTextResponse
from platform_common import HttpRequestMetrics, install_request_observability
from pydantic import BaseModel, Field


@dataclass(frozen=True)
class QueueGatewaySettings:
    backend: str = "file"
    file_dir: Path = Path("build/queue-gateway")
    bearer_token: str = ""
    max_body_bytes: int = 5 * 1024 * 1024
    broker_url: str = ""
    broker_topic: str = "turbalance.collector.telemetry"
    producer_command: str = ""
    producer_timeout_seconds: float = 5.0
    dry_run: bool = False
    service_name: str = "queue-gateway"

    @classmethod
    def from_env(cls) -> "QueueGatewaySettings":
        return cls(
            backend=os.environ.get("TURBALANCE_QUEUE_GATEWAY_BACKEND", "file"),
            file_dir=Path(os.environ.get("TURBALANCE_QUEUE_GATEWAY_FILE_DIR", "build/queue-gateway")),
            bearer_token=os.environ.get("TURBALANCE_QUEUE_GATEWAY_TOKEN", ""),
            max_body_bytes=int(os.environ.get("TURBALANCE_QUEUE_GATEWAY_MAX_BODY_BYTES", str(5 * 1024 * 1024))),
            broker_url=os.environ.get("TURBALANCE_QUEUE_GATEWAY_BROKER_URL", ""),
            broker_topic=os.environ.get("TURBALANCE_QUEUE_GATEWAY_TOPIC", "turbalance.collector.telemetry"),
            producer_command=os.environ.get("TURBALANCE_QUEUE_GATEWAY_PRODUCER_COMMAND", ""),
            producer_timeout_seconds=float(os.environ.get("TURBALANCE_QUEUE_GATEWAY_PRODUCER_TIMEOUT_SECONDS", "5")),
            dry_run=_env_bool(os.environ.get("TURBALANCE_QUEUE_GATEWAY_DRY_RUN", "false")),
            service_name=os.environ.get("TURBALANCE_OTEL_SERVICE_NAME", "queue-gateway"),
        )


class QueueEnvelope(BaseModel):
    queuedAt: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)
    body: str


class QueueGatewayStats:
    def __init__(self) -> None:
        self.accepted = 0
        self.rejected = 0
        self.auth_failures = 0
        self.broker_published = 0
        self.broker_failures = 0

    def render_prometheus(self) -> str:
        return "\n".join(
            [
                "# HELP turbalance_queue_gateway_accepted_total Accepted queue gateway envelopes.",
                "# TYPE turbalance_queue_gateway_accepted_total counter",
                f"turbalance_queue_gateway_accepted_total {self.accepted}",
                "# HELP turbalance_queue_gateway_rejected_total Rejected queue gateway envelopes.",
                "# TYPE turbalance_queue_gateway_rejected_total counter",
                f"turbalance_queue_gateway_rejected_total {self.rejected}",
                "# HELP turbalance_queue_gateway_auth_failures_total Queue gateway auth failures.",
                "# TYPE turbalance_queue_gateway_auth_failures_total counter",
                f"turbalance_queue_gateway_auth_failures_total {self.auth_failures}",
                "# HELP turbalance_queue_gateway_broker_published_total Queue gateway envelopes published to an external broker.",
                "# TYPE turbalance_queue_gateway_broker_published_total counter",
                f"turbalance_queue_gateway_broker_published_total {self.broker_published}",
                "# HELP turbalance_queue_gateway_broker_failures_total Queue gateway broker publish failures.",
                "# TYPE turbalance_queue_gateway_broker_failures_total counter",
                f"turbalance_queue_gateway_broker_failures_total {self.broker_failures}",
                "",
            ]
        )


def create_app(settings: QueueGatewaySettings | None = None) -> FastAPI:
    settings = settings or QueueGatewaySettings.from_env()
    stats = QueueGatewayStats()
    app = FastAPI(title="turbalance queue gateway", version="0.1.0")
    request_metrics = HttpRequestMetrics(service_name=settings.service_name)
    install_request_observability(app, request_metrics)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/ready")
    async def ready() -> dict[str, Any]:
        if settings.backend == "file":
            settings.file_dir.mkdir(parents=True, exist_ok=True)
        normalized = _normalize_backend(settings.backend)
        if normalized in {"kafka", "redpanda", "nats"} and not settings.dry_run:
            if not settings.broker_url:
                raise HTTPException(status_code=503, detail="queue gateway broker URL is not configured")
            if not _producer_command(settings):
                raise HTTPException(status_code=503, detail=f"queue gateway {normalized} producer command is not configured")
        return {
            "status": "ready",
            "backend": normalized,
            "fileDir": str(settings.file_dir),
            "brokerUrl": settings.broker_url,
            "topic": settings.broker_topic,
            "dryRun": settings.dry_run,
        }

    @app.post("/v1/queue/collector")
    async def enqueue(
        envelope: QueueEnvelope,
        request: Request,
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        if settings.bearer_token and authorization != f"Bearer {settings.bearer_token}":
            stats.rejected += 1
            stats.auth_failures += 1
            raise HTTPException(status_code=401, detail="invalid queue gateway token")
        body = await request.body()
        if len(body) > settings.max_body_bytes:
            stats.rejected += 1
            raise HTTPException(status_code=413, detail="queue envelope exceeds body limit")
        backend = _normalize_backend(settings.backend)
        if backend == "file":
            path = _write_file_envelope(settings.file_dir, envelope)
            stats.accepted += 1
            return {"status": "queued", "backend": backend, "path": str(path)}
        if backend in {"kafka", "redpanda", "nats"}:
            result = _publish_broker_envelope(settings, envelope)
            if not result["accepted"]:
                stats.rejected += 1
                stats.broker_failures += 1
                raise HTTPException(status_code=502, detail=result["reason"])
            stats.accepted += 1
            stats.broker_published += 1
            return {"status": "queued", **result}
        stats.rejected += 1
        raise HTTPException(status_code=501, detail=f"queue backend {settings.backend!r} is not supported")

    @app.get("/metrics", response_class=PlainTextResponse)
    async def metrics() -> str:
        return stats.render_prometheus() + request_metrics.render_prometheus("turbalance_queue_gateway") + "\n"

    return app


def _write_file_envelope(file_dir: Path, envelope: QueueEnvelope) -> Path:
    now = datetime.now(timezone.utc)
    path = file_dir / f"dt={now.strftime('%Y-%m-%d')}" / f"collector-{uuid.uuid4().hex}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "acceptedAt": now.isoformat(),
                "queuedAt": envelope.queuedAt or now.isoformat(),
                "metadata": envelope.metadata,
                "body": envelope.body,
            },
            indent=2,
            sort_keys=True,
        ),
        encoding="utf-8",
    )
    return path


def _publish_broker_envelope(settings: QueueGatewaySettings, envelope: QueueEnvelope) -> dict[str, Any]:
    backend = _normalize_backend(settings.backend)
    payload = json.dumps(
        {
            "acceptedAt": datetime.now(timezone.utc).isoformat(),
            "queuedAt": envelope.queuedAt or datetime.now(timezone.utc).isoformat(),
            "metadata": envelope.metadata,
            "body": envelope.body,
        },
        separators=(",", ":"),
        sort_keys=True,
    )
    if settings.dry_run:
        return {
            "accepted": True,
            "backend": backend,
            "destination": f"{settings.broker_url or 'dry-run'}:{settings.broker_topic}",
            "dryRun": True,
        }
    command = _producer_command(settings)
    if not command:
        return {"accepted": False, "backend": backend, "reason": f"{backend} producer command is not configured"}
    try:
        completed = subprocess.run(
            command,
            input=payload,
            text=True,
            capture_output=True,
            timeout=settings.producer_timeout_seconds,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"accepted": False, "backend": backend, "reason": str(exc)}
    if completed.returncode != 0:
        reason = (completed.stderr or completed.stdout or f"producer exited {completed.returncode}").strip()
        return {"accepted": False, "backend": backend, "reason": reason}
    return {
        "accepted": True,
        "backend": backend,
        "destination": f"{settings.broker_url}:{settings.broker_topic}",
    }


def _producer_command(settings: QueueGatewaySettings) -> list[str]:
    if settings.producer_command:
        return shlex.split(settings.producer_command)
    backend = _normalize_backend(settings.backend)
    if backend == "kafka":
        return ["kafka-console-producer", "--bootstrap-server", settings.broker_url, "--topic", settings.broker_topic]
    if backend == "redpanda":
        return ["rpk", "topic", "produce", settings.broker_topic, "--brokers", settings.broker_url]
    if backend == "nats":
        return ["nats", "pub", settings.broker_topic, "--server", settings.broker_url, "-"]
    return []


def _normalize_backend(value: str) -> str:
    normalized = value.strip().lower()
    if normalized == "gateway":
        return "http"
    return normalized or "file"


def _env_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


app = create_app()
