from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class AlertStore:
    def __init__(self, db_path: str | Path) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.execute(
                """
                create table if not exists alerts(
                  incident_key text primary key,
                  status text not null,
                  severity text not null,
                  title text not null,
                  confidence real not null,
                  evidence text not null,
                  owner text not null,
                  first_seen_at text not null,
                  last_seen_at text not null,
                  acknowledged_at text,
                  resolved_at text,
                  payload_json text not null
                )
                """
            )

    def upsert_evaluated(self, alerts: list[dict[str, Any]]) -> list[dict[str, Any]]:
        now = _now()
        with self._connect() as db:
            for alert in alerts:
                key = alert["incidentKey"]
                existing = db.execute("select status, first_seen_at, acknowledged_at, resolved_at from alerts where incident_key = ?", (key,)).fetchone()
                status = existing["status"] if existing and existing["status"] != "resolved" else "open"
                first_seen_at = existing["first_seen_at"] if existing else now
                acknowledged_at = existing["acknowledged_at"] if existing else None
                resolved_at = None if status != "resolved" else existing["resolved_at"]
                payload = {**alert, "status": status, "firstSeenAt": first_seen_at, "lastSeenAt": now, "acknowledgedAt": acknowledged_at, "resolvedAt": resolved_at}
                db.execute(
                    """
                    insert into alerts(
                      incident_key, status, severity, title, confidence, evidence, owner,
                      first_seen_at, last_seen_at, acknowledged_at, resolved_at, payload_json
                    )
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    on conflict(incident_key) do update set
                      status=excluded.status,
                      severity=excluded.severity,
                      title=excluded.title,
                      confidence=excluded.confidence,
                      evidence=excluded.evidence,
                      owner=excluded.owner,
                      last_seen_at=excluded.last_seen_at,
                      acknowledged_at=excluded.acknowledged_at,
                      resolved_at=excluded.resolved_at,
                      payload_json=excluded.payload_json
                    """,
                    (
                        key,
                        status,
                        alert["severity"],
                        alert["title"],
                        float(alert["confidence"]),
                        alert["evidence"],
                        alert["owner"],
                        first_seen_at,
                        now,
                        acknowledged_at,
                        resolved_at,
                        json.dumps(payload, sort_keys=True),
                    ),
                )
        return self.list_alerts()

    def list_alerts(self, *, status: str | None = None) -> list[dict[str, Any]]:
        with self._connect() as db:
            if status:
                rows = db.execute("select payload_json from alerts where status = ? order by last_seen_at desc", (status,)).fetchall()
            else:
                rows = db.execute("select payload_json from alerts order by last_seen_at desc").fetchall()
        return [json.loads(row["payload_json"]) for row in rows]

    def transition(self, incident_key: str, status: str) -> dict[str, Any] | None:
        now = _now()
        with self._connect() as db:
            row = db.execute("select payload_json from alerts where incident_key = ?", (incident_key,)).fetchone()
            if row is None:
                return None
            payload = json.loads(row["payload_json"])
            payload["status"] = status
            if status == "acknowledged":
                payload["acknowledgedAt"] = now
            if status == "resolved":
                payload["resolvedAt"] = now
            db.execute(
                """
                update alerts set
                  status = ?,
                  acknowledged_at = ?,
                  resolved_at = ?,
                  payload_json = ?
                where incident_key = ?
                """,
                (
                    status,
                    payload.get("acknowledgedAt"),
                    payload.get("resolvedAt"),
                    json.dumps(payload, sort_keys=True),
                    incident_key,
                ),
            )
            return payload

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
