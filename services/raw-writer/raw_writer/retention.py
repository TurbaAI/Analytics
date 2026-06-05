from __future__ import annotations

import shutil
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path


@dataclass(frozen=True)
class RetentionResult:
    removed_paths: list[str]
    kept_paths: int

    def as_dict(self) -> dict[str, object]:
        return {
            "removedPaths": self.removed_paths,
            "removedCount": len(self.removed_paths),
            "keptPaths": self.kept_paths,
        }


def apply_retention(lake_root: str | Path, *, retention_days: int, dry_run: bool = False) -> RetentionResult:
    root = Path(lake_root)
    cutoff = datetime.now(timezone.utc).date() - timedelta(days=retention_days)
    removed: list[str] = []
    kept = 0
    for partition in _date_partitions(root):
        partition_date = _partition_date(partition)
        if partition_date is None:
            kept += 1
            continue
        if partition_date < cutoff:
            removed.append(str(partition.relative_to(root)))
            if not dry_run:
                shutil.rmtree(partition)
        else:
            kept += 1
    return RetentionResult(removed_paths=removed, kept_paths=kept)


def _date_partitions(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return [path for path in root.glob("**/dt=*") if path.is_dir()]


def _partition_date(path: Path) -> date | None:
    if not path.name.startswith("dt="):
        return None
    try:
        return date.fromisoformat(path.name.removeprefix("dt="))
    except ValueError:
        return None
