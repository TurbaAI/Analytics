from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pyarrow as pa

from .storage import LakeStorage


def compact_raw_partition(
    lake_root: str | Path,
    *,
    table_name: str,
    tenant_id: str,
    dt: str,
    hour: str | None = None,
    delete_inputs: bool = False,
) -> dict[str, Any]:
    storage = LakeStorage(lake_root)
    partition = Path("raw") / table_name / f"tenant_id={_path_part(tenant_id)}" / f"dt={dt}"
    if hour:
        partition = partition / f"hour={hour}"
    input_files = [
        path
        for path in storage.list_files(partition)
        if path.endswith(".parquet") and "/compact-" not in path and not Path(path).name.startswith("compact-")
    ]
    if not input_files:
        return {"status": "skipped", "reason": "no parquet files found", "inputFileCount": 0}

    tables = [storage.read_parquet_table(path) for path in input_files]
    compacted = pa.concat_tables(tables, promote_options="default")
    compacted_at = datetime.now(timezone.utc)
    output_path = partition / f"compact-{compacted_at.strftime('%Y%m%dT%H%M%S')}-{uuid.uuid4().hex[:8]}.parquet"
    storage.write_parquet_rows(compacted.to_pylist(), output_path)

    if delete_inputs:
        for path in input_files:
            storage.delete_file(path)

    manifest_path = (
        Path("manifests")
        / "raw_writer_compactions"
        / f"dt={compacted_at.strftime('%Y-%m-%d')}"
        / f"part-{uuid.uuid4().hex[:12]}.parquet"
    )
    storage.write_parquet_rows(
        [
            {
                "compaction_id": str(uuid.uuid4()),
                "table_name": table_name,
                "tenant_id": tenant_id,
                "dt": dt,
                "hour": hour or "",
                "compacted_at": compacted_at,
                "input_file_count": len(input_files),
                "input_row_count": sum(table.num_rows for table in tables),
                "output_path": output_path.as_posix(),
                "output_row_count": compacted.num_rows,
                "input_files_json": json.dumps(input_files, sort_keys=True),
                "delete_inputs": delete_inputs,
            }
        ],
        manifest_path,
    )
    return {
        "status": "compacted",
        "tableName": table_name,
        "tenantId": tenant_id,
        "dt": dt,
        "hour": hour or "",
        "inputFileCount": len(input_files),
        "inputRowCount": sum(table.num_rows for table in tables),
        "outputPath": output_path.as_posix(),
        "outputRowCount": compacted.num_rows,
        "manifestPath": manifest_path.as_posix(),
        "deletedInputs": delete_inputs,
    }


def reconcile_lake(lake_root: str | Path) -> dict[str, Any]:
    storage = LakeStorage(lake_root)
    raw_manifest_rows = _read_manifest_rows(storage, Path("manifests") / "raw_writer_batches")
    compaction_rows = _read_manifest_rows(storage, Path("manifests") / "raw_writer_compactions")
    compacted_inputs = {
        path
        for row in compaction_rows
        if bool(row.get("delete_inputs"))
        for path in _json_list(row.get("input_files_json"))
    }
    compaction_outputs = {str(row.get("output_path")) for row in compaction_rows if row.get("output_path")}

    expected_files: dict[str, int] = {}
    for row in raw_manifest_rows:
        for file_info in _json_list(row.get("files_json")):
            path = str(file_info.get("path") or "")
            if not path:
                continue
            expected_files[path] = int(file_info.get("row_count") or 0)
    for row in compaction_rows:
        output_path = str(row.get("output_path") or "")
        if output_path:
            expected_files[output_path] = int(row.get("output_row_count") or 0)

    missing_files = []
    row_count_mismatches = []
    for path, expected_rows in expected_files.items():
        if path in compacted_inputs:
            continue
        if not storage.exists(path):
            missing_files.append(path)
            continue
        actual_rows = storage.read_parquet_table(path).num_rows
        if actual_rows != expected_rows:
            row_count_mismatches.append({"path": path, "expectedRows": expected_rows, "actualRows": actual_rows})

    raw_files = {path for path in storage.list_files("raw") if path.endswith(".parquet")}
    known_files = (set(expected_files) | compacted_inputs | compaction_outputs)
    orphan_raw_files = sorted(path for path in raw_files - known_files if not Path(path).name.startswith("."))
    status = "ok" if not missing_files and not row_count_mismatches and not orphan_raw_files else "failed"
    return {
        "status": status,
        "rawManifestCount": len(raw_manifest_rows),
        "compactionManifestCount": len(compaction_rows),
        "expectedFileCount": len(expected_files),
        "missingFiles": sorted(missing_files),
        "rowCountMismatches": row_count_mismatches,
        "orphanRawFiles": orphan_raw_files,
    }


def _read_manifest_rows(storage: LakeStorage, prefix: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for path in storage.list_files(prefix):
        if path.endswith(".parquet"):
            rows.extend(storage.read_parquet_table(path).to_pylist())
    return rows


def _json_list(value: Any) -> list[Any]:
    if not value:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    return []


def _path_part(value: str) -> str:
    return "".join(char if char.isalnum() or char in ("-", "_", ".") else "_" for char in value)
