from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol
from urllib import error, request


@dataclass(frozen=True)
class QueuePublishResult:
    accepted: bool
    backend: str
    destination: str = ""
    reason: str = ""


class QueuePublisher(Protocol):
    backend: str

    def publish(self, body: bytes, metadata: dict[str, Any]) -> QueuePublishResult:
        ...


class FileQueuePublisher:
    backend = "file"

    def __init__(self, queue_dir: str | Path) -> None:
        self.queue_dir = Path(queue_dir)

    def publish(self, body: bytes, metadata: dict[str, Any]) -> QueuePublishResult:
        now = datetime.now(timezone.utc)
        path = self.queue_dir / f"dt={now.strftime('%Y-%m-%d')}" / f"queue-{uuid.uuid4().hex}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(
                {
                    "queuedAt": now.isoformat(),
                    "spooledAt": now.isoformat(),
                    "metadata": metadata,
                    "body": body.decode("utf-8", errors="replace"),
                },
                indent=2,
                sort_keys=True,
            ),
            encoding="utf-8",
        )
        return QueuePublishResult(accepted=True, backend=self.backend, destination=str(path))


class HttpQueuePublisher:
    backend = "http"

    def __init__(self, url: str, *, bearer_token: str = "", timeout_seconds: float = 2.0) -> None:
        self.url = url
        self.bearer_token = bearer_token
        self.timeout_seconds = timeout_seconds

    def publish(self, body: bytes, metadata: dict[str, Any]) -> QueuePublishResult:
        payload = json.dumps(
            {
                "queuedAt": datetime.now(timezone.utc).isoformat(),
                "metadata": metadata,
                "body": body.decode("utf-8", errors="replace"),
            },
            sort_keys=True,
        ).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self.bearer_token:
            headers["Authorization"] = f"Bearer {self.bearer_token}"
        queue_request = request.Request(self.url, data=payload, headers=headers, method="POST")
        try:
            with request.urlopen(queue_request, timeout=self.timeout_seconds) as response:
                if 200 <= response.status < 300:
                    return QueuePublishResult(accepted=True, backend=self.backend, destination=self.url)
                return QueuePublishResult(
                    accepted=False,
                    backend=self.backend,
                    destination=self.url,
                    reason=f"queue returned HTTP {response.status}",
                )
        except (OSError, error.HTTPError, error.URLError) as exc:
            return QueuePublishResult(accepted=False, backend=self.backend, destination=self.url, reason=str(exc))


def create_queue_publisher(
    backend: str = "",
    *,
    queue_url: str = "",
    queue_dir: str | Path | None = None,
    bearer_token: str = "",
    timeout_seconds: float = 2.0,
) -> QueuePublisher | None:
    normalized = backend.strip().lower()
    if normalized in {"", "disabled", "none", "off"}:
        return None
    if normalized == "file":
        if queue_dir is None:
            raise ValueError("file queue backend requires queue_dir")
        return FileQueuePublisher(queue_dir)
    if normalized in {"http", "webhook", "gateway"}:
        if not queue_url:
            raise ValueError("http queue backend requires queue_url")
        return HttpQueuePublisher(queue_url, bearer_token=bearer_token, timeout_seconds=timeout_seconds)
    if normalized in {"nats", "redpanda", "kafka"}:
        if not queue_url:
            raise ValueError(f"{normalized} queue backend requires a gateway URL")
        return HttpQueuePublisher(queue_url, bearer_token=bearer_token, timeout_seconds=timeout_seconds)
    raise ValueError(f"unsupported collector queue backend {backend!r}")
