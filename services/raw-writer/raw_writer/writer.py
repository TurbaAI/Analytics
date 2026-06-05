from __future__ import annotations

import json
import sys
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
COMMON_PATH = ROOT / "services" / "platform_common"
if str(COMMON_PATH) not in sys.path:
    sys.path.insert(0, str(COMMON_PATH))

from platform_common import (  # noqa: E402
    TelemetryBatch,
    flatten_metric_rows,
    parse_batch,
    source_bundle_to_batch,
    utc_now,
)
from .storage import LakeStorage  # noqa: E402


class TelemetryLakeWriter:
    def __init__(self, lake_root: str | Path) -> None:
        self.storage = LakeStorage(lake_root)
        self.lake_root = self.storage.local_root or Path(str(lake_root))
        self.manifest_root = Path("manifests") / "raw_writer_batches"
        self.quarantine_root = Path("quarantine") / "invalid_batches"

    def write_batch(self, payload: dict[str, Any] | TelemetryBatch) -> dict[str, Any]:
        try:
            batch = parse_batch(payload)
            rows = flatten_metric_rows(batch)
        except Exception as exc:
            return self.quarantine_payload(payload, str(exc))

        if not rows:
            return self.quarantine_payload(payload, "batch contained no metric rows")

        files = []
        grouped: dict[tuple[str, str, str, str], list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            event_ts = _ensure_datetime(row["event_ts"])
            grouped[(
                row["table_name"],
                row["tenant_id"],
                event_ts.strftime("%Y-%m-%d"),
                event_ts.strftime("%H"),
            )].append(row)

        for (table_name, tenant_id, dt, hour), group in grouped.items():
            clean_rows = [_without_table_name(row) for row in group]
            relative_path = (
                Path("raw")
                / table_name
                / f"tenant_id={_path_part(tenant_id)}"
                / f"dt={dt}"
                / f"hour={hour}"
                / f"part-{batch.batch_id}-{uuid.uuid4().hex[:8]}.parquet"
            )
            self.storage.write_parquet_rows(clean_rows, relative_path)
            files.append(
                {
                    "table_name": table_name,
                    "path": str(relative_path),
                    "row_count": len(clean_rows),
                    "tenant_id": tenant_id,
                    "dt": dt,
                    "hour": hour,
                }
            )

        manifest = {
            "batch_id": batch.batch_id,
            "tenant_id": batch.tenant_id,
            "host_id": batch.host_id,
            "agent_id": batch.agent_id,
            "sequence_no": batch.sequence_no,
            "schema_version": batch.schema_version,
            "written_at": utc_now(),
            "min_event_ts": min(_ensure_datetime(row["event_ts"]) for row in rows),
            "max_event_ts": max(_ensure_datetime(row["event_ts"]) for row in rows),
            "file_count": len(files),
            "row_count": len(rows),
            "files_json": json.dumps(files, sort_keys=True),
        }
        manifest_path = (
            self.manifest_root
            / f"dt={manifest['written_at'].strftime('%Y-%m-%d')}"
            / f"part-{batch.batch_id}-{uuid.uuid4().hex[:8]}.parquet"
        )
        self.storage.write_parquet_rows([manifest], manifest_path)

        return {
            "status": "written",
            "batchId": batch.batch_id,
            "rowCount": len(rows),
            "fileCount": len(files),
            "manifestPath": str(manifest_path),
            "files": files,
        }

    def write_source_bundle(
        self,
        payload: dict[str, Any],
        *,
        tenant_id: str = "demo-tenant",
        host_id: str = "source-bundle",
        agent_id: str = "source-bundle-adapter",
    ) -> dict[str, Any]:
        batch = source_bundle_to_batch(
            payload,
            tenant_id=tenant_id,
            host_id=host_id,
            agent_id=agent_id,
        )
        return self.write_batch(batch)

    def quarantine_payload(self, payload: Any, reason: str) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        path = (
            self.quarantine_root
            / f"dt={now.strftime('%Y-%m-%d')}"
            / f"invalid-{uuid.uuid4().hex}.json"
        )
        body = {
            "quarantinedAt": now.isoformat(),
            "reason": reason,
            "payload": payload.model_dump(mode="json", by_alias=True) if hasattr(payload, "model_dump") else payload,
        }
        self.storage.write_json_text(json.dumps(body, indent=2, sort_keys=True), path)
        return {
            "status": "quarantined",
            "reason": reason,
            "path": str(path),
        }


def write_batch_file(input_path: str | Path, lake_root: str | Path) -> dict[str, Any]:
    payload = json.loads(Path(input_path).read_text(encoding="utf-8"))
    return TelemetryLakeWriter(lake_root).write_batch(payload)


def write_source_bundle_file(
    input_path: str | Path,
    lake_root: str | Path,
    *,
    tenant_id: str = "demo-tenant",
    host_id: str = "source-bundle",
    agent_id: str = "source-bundle-adapter",
) -> dict[str, Any]:
    payload = json.loads(Path(input_path).read_text(encoding="utf-8"))
    return TelemetryLakeWriter(lake_root).write_source_bundle(
        payload,
        tenant_id=tenant_id,
        host_id=host_id,
        agent_id=agent_id,
    )


def _without_table_name(row: dict[str, Any]) -> dict[str, Any]:
    clean = dict(row)
    clean.pop("table_name", None)
    clean.pop("tenant_id", None)
    return clean


def _ensure_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    raise TypeError(f"expected datetime-compatible value, got {type(value)!r}")


def _path_part(value: str) -> str:
    return "".join(char if char.isalnum() or char in ("-", "_", ".") else "_" for char in value)
