from __future__ import annotations

import hashlib
import hmac
import json
import sqlite3
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class SignatureHeaders:
    timestamp: str
    nonce: str
    signature: str


class ReplayStore:
    def __init__(self, path: Path, *, ttl_seconds: int = 900) -> None:
        self.path = path
        self.ttl_seconds = ttl_seconds
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.execute(
                """
                create table if not exists nonces(
                  nonce text primary key,
                  seen_at integer not null
                )
                """
            )

    def check_and_record(self, nonce: str) -> bool:
        now = int(time.time())
        cutoff = now - self.ttl_seconds
        with self._connect() as db:
            db.execute("delete from nonces where seen_at < ?", (cutoff,))
            exists = db.execute("select 1 from nonces where nonce = ?", (nonce,)).fetchone()
            if exists:
                return False
            db.execute("insert into nonces(nonce, seen_at) values (?, ?)", (nonce, now))
            return True

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path)


class RateLimiter:
    def __init__(self, *, limit_per_minute: int) -> None:
        self.limit_per_minute = limit_per_minute
        self.events: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        if self.limit_per_minute <= 0:
            return True
        now = time.time()
        window_start = now - 60
        bucket = self.events[key]
        while bucket and bucket[0] < window_start:
            bucket.popleft()
        if len(bucket) >= self.limit_per_minute:
            return False
        bucket.append(now)
        return True


class AuditLog:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def write(self, event_type: str, **fields: Any) -> None:
        event = {
            "eventType": event_type,
            "observedAt": datetime.now(timezone.utc).isoformat(),
            **fields,
        }
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event, sort_keys=True, default=str) + "\n")


def verify_signature(secret: str, headers: SignatureHeaders, body: bytes, *, max_skew_seconds: int = 300) -> bool:
    try:
        timestamp = int(headers.timestamp)
    except ValueError:
        return False
    if abs(int(time.time()) - timestamp) > max_skew_seconds:
        return False
    expected = sign_body(secret, headers.timestamp, headers.nonce, body)
    supplied = headers.signature.removeprefix("v1=")
    return hmac.compare_digest(expected, supplied)


def sign_body(secret: str, timestamp: str, nonce: str, body: bytes) -> str:
    payload = timestamp.encode("utf-8") + b"." + nonce.encode("utf-8") + b"." + body
    return hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
