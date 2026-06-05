from __future__ import annotations

import json
import shutil
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
RAW_WRITER_PATH = ROOT / "services" / "raw-writer"
if str(RAW_WRITER_PATH) not in sys.path:
    sys.path.insert(0, str(RAW_WRITER_PATH))

from raw_writer import TelemetryLakeWriter


@dataclass(frozen=True)
class ReplayResult:
    status: str
    replayed: int
    failed: int
    remaining: int
    processed_paths: list[str]
    dead_letter_paths: list[str]

    def as_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "replayed": self.replayed,
            "failed": self.failed,
            "remaining": self.remaining,
            "processedPaths": self.processed_paths,
            "deadLetterPaths": self.dead_letter_paths,
        }


def replay_spool(
    *,
    lake_root: str | Path,
    spool_dir: str | Path,
    processed_dir: str | Path | None = None,
    dead_letter_dir: str | Path | None = None,
    limit: int = 100,
) -> ReplayResult:
    spool_root = Path(spool_dir)
    processed_root = Path(processed_dir) if processed_dir else spool_root.parent / "processed"
    dead_root = Path(dead_letter_dir) if dead_letter_dir else spool_root.parent / "dead-letter"
    writer = TelemetryLakeWriter(lake_root)
    processed_paths: list[str] = []
    dead_letter_paths: list[str] = []

    for path in _spool_files(spool_root)[: max(0, limit)]:
        try:
            replay_one_spool_file(path, writer)
        except Exception as exc:
            dead_letter_paths.append(str(_move_with_reason(path, dead_root, str(exc))))
        else:
            processed_paths.append(str(_move(path, processed_root)))

    remaining = len(_spool_files(spool_root))
    failed = len(dead_letter_paths)
    return ReplayResult(
        status="ok" if failed == 0 else "partial_failure",
        replayed=len(processed_paths),
        failed=failed,
        remaining=remaining,
        processed_paths=processed_paths,
        dead_letter_paths=dead_letter_paths,
    )


def replay_one_spool_file(path: str | Path, writer: TelemetryLakeWriter) -> dict[str, Any]:
    envelope = json.loads(Path(path).read_text(encoding="utf-8"))
    metadata = envelope.get("metadata") or {}
    route = metadata.get("route") or "telemetry_batches"
    body = json.loads(envelope.get("body") or "{}")
    if route == "source_bundles":
        result = writer.write_source_bundle(
            body.get("bundle") or {},
            tenant_id=body.get("tenantId") or "demo-tenant",
            host_id=body.get("hostId") or "source-bundle",
            agent_id=body.get("agentId") or "source-bundle-adapter",
        )
    elif route == "telemetry_batches":
        result = writer.write_batch(body)
    else:
        raise ValueError(f"unknown collector spool route {route!r}")
    if result.get("status") not in {"written", "quarantined"}:
        raise ValueError(f"spool replay failed with writer status {result.get('status')!r}")
    return result


def _spool_files(spool_root: Path) -> list[Path]:
    if not spool_root.exists():
        return []
    return sorted(
        [path for path in spool_root.rglob("*.json") if path.is_file()],
        key=lambda path: (path.stat().st_mtime, str(path)),
    )


def _move(path: Path, target_root: Path) -> Path:
    target = target_root / datetime.now(timezone.utc).strftime("dt=%Y-%m-%d") / f"{path.stem}-{uuid.uuid4().hex[:8]}{path.suffix}"
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(path), str(target))
    return target


def _move_with_reason(path: Path, target_root: Path, reason: str) -> Path:
    target = _move(path, target_root)
    reason_path = target.with_suffix(".error.json")
    reason_path.write_text(
        json.dumps(
            {
                "failedAt": datetime.now(timezone.utc).isoformat(),
                "spoolFile": str(target),
                "reason": reason,
            },
            indent=2,
            sort_keys=True,
        ),
        encoding="utf-8",
    )
    return target
