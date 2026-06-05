from __future__ import annotations

import json
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .queue import QueuePublisher


@dataclass(frozen=True)
class Admission:
    action: str
    path: str = ""
    reason: str = ""
    queue_backend: str = ""

    @property
    def acquired(self) -> bool:
        return self.action == "acquired"

    @property
    def queued(self) -> bool:
        return self.action == "queued"

    @property
    def rejected(self) -> bool:
        return self.action == "rejected"


class BackpressureAdapter:
    def __init__(
        self,
        *,
        max_inflight: int = 8,
        spool_dir: str | Path | None = None,
        max_spool_files: int = 1000,
        queue_publisher: QueuePublisher | None = None,
    ) -> None:
        self.max_inflight = max(1, max_inflight)
        self.spool_dir = Path(spool_dir) if spool_dir else None
        self.max_spool_files = max(0, max_spool_files)
        self.queue_publisher = queue_publisher
        self._active = 0
        self._lock = threading.Lock()

    def admit_or_spool(self, body: bytes, *, metadata: dict[str, Any] | None = None) -> Admission:
        with self._lock:
            if self._active < self.max_inflight:
                self._active += 1
                return Admission(action="acquired")
        queue_failure = ""
        if self.queue_publisher is not None:
            result = self.queue_publisher.publish(body, metadata or {})
            if result.accepted:
                return Admission(action="queued", path=result.destination, queue_backend=result.backend)
            queue_failure = result.reason
        if self.spool_dir is None:
            reason = "collector in-flight limit reached"
            if queue_failure:
                reason = f"{reason}; queue publish failed: {queue_failure}"
            return Admission(action="rejected", reason=reason)
        if self._spool_file_count() >= self.max_spool_files:
            reason = "collector spool limit reached"
            if queue_failure:
                reason = f"{reason}; queue publish failed: {queue_failure}"
            return Admission(action="rejected", reason=reason)
        path = self._write_spool_file(body, metadata or {})
        return Admission(action="queued", path=str(path), queue_backend="spool")

    def release(self, admission: Admission) -> None:
        if not admission.acquired:
            return
        with self._lock:
            self._active = max(0, self._active - 1)

    def snapshot(self) -> dict[str, int | str]:
        with self._lock:
            active = self._active
        return {
            "active": active,
            "maxInflight": self.max_inflight,
            "spoolDir": str(self.spool_dir or ""),
            "spoolFiles": self._spool_file_count(),
            "maxSpoolFiles": self.max_spool_files,
            "queueBackend": self.queue_publisher.backend if self.queue_publisher else "",
        }

    def _write_spool_file(self, body: bytes, metadata: dict[str, Any]) -> Path:
        assert self.spool_dir is not None
        now = datetime.now(timezone.utc)
        path = self.spool_dir / f"dt={now.strftime('%Y-%m-%d')}" / f"spool-{uuid.uuid4().hex}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(
                {
                    "spooledAt": now.isoformat(),
                    "metadata": metadata,
                    "body": body.decode("utf-8", errors="replace"),
                },
                indent=2,
                sort_keys=True,
            ),
            encoding="utf-8",
        )
        return path

    def _spool_file_count(self) -> int:
        if self.spool_dir is None or not self.spool_dir.exists():
            return 0
        return sum(1 for path in self.spool_dir.rglob("*.json") if path.is_file())
