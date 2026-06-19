from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
for relative in ("services/platform_common", "services/raw-writer"):
    path = ROOT / relative
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from platform_common import (  # noqa: E402
    alert_candidate_rows,
    covariance_snapshot,
    fleet_rca_rows,
    gpu_starvation_rows,
    hardware_health_rows,
    input_pipeline_stall_rows,
    network_gpu_coupling_rows,
    noisy_neighbor_rows,
    principal_resource_mode,
    repair_candidate_rows,
    resource_samples_from_metric_rows,
    system_identification_signature_rows,
)
from raw_writer import LakeStorage  # noqa: E402

try:
    import duckdb  # type: ignore
except Exception:  # pragma: no cover - depends on optional runtime package
    duckdb = None


class LakeQuery:
    def __init__(self, lake_root: str | Path, *, max_rows: int = 5000) -> None:
        self.storage = LakeStorage(lake_root)
        self.lake_root = self.storage.local_root or Path(str(lake_root))
        self.max_rows = max_rows
        self.local_engine = os.environ.get("TURBALANCE_LAKE_QUERY_ENGINE", "pyarrow-stream").strip().lower()
        self.max_files = max(1, int(os.environ.get("TURBALANCE_LAKE_QUERY_MAX_FILES", str(max(1000, max_rows * 5)))))

    @property
    def engine(self) -> str:
        if self.storage.is_object_store:
            return "pyarrow-object"
        if self.storage.local_root is not None and self.local_engine not in {"duckdb", "duckdb-glob"}:
            return "pyarrow-stream"
        return "duckdb" if duckdb is not None else "pyarrow"

    def list_tables(self) -> list[str]:
        if self.storage.local_root is not None:
            raw_root = self.lake_root / "raw"
            if not raw_root.exists():
                return []
            return sorted(path.name for path in raw_root.iterdir() if path.is_dir())
        tables = set()
        for file_path in self.storage.list_files("raw"):
            parts = Path(file_path).parts
            if len(parts) >= 3 and parts[0] == "raw":
                tables.add(parts[1])
        return sorted(tables)

    def read_table(self, table_name: str, *, tenant_id: str | None = None, limit: int = 500) -> list[dict[str, Any]]:
        return self._read_partitioned_table("raw", table_name, tenant_id=tenant_id, limit=limit)

    def read_derived_table(self, table_name: str, *, tenant_id: str | None = None, limit: int = 500) -> list[dict[str, Any]]:
        return self._read_partitioned_table("derived", table_name, tenant_id=tenant_id, limit=limit)

    def _read_partitioned_table(
        self,
        namespace: str,
        table_name: str,
        *,
        tenant_id: str | None = None,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        limit = max(1, min(limit, self.max_rows))
        table_path = self.lake_root / namespace / table_name
        if self.storage.local_root is not None and not table_path.exists():
            return []
        if self.storage.local_root is not None and duckdb is not None and self.local_engine in {"duckdb", "duckdb-glob"}:
            return self._read_table_duckdb(namespace, table_name, tenant_id=tenant_id, limit=limit)
        if self.storage.local_root is not None:
            return self._read_table_local_stream(namespace, table_name, tenant_id=tenant_id, limit=limit)
        return self._read_table_pyarrow(namespace, table_name, tenant_id=tenant_id, limit=limit)

    def metric_rows(self, *, tenant_id: str | None = None, limit: int = 5000) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for table_name in self.list_tables():
            rows.extend(self.read_table(table_name, tenant_id=tenant_id, limit=max(1, limit - len(rows))))
            if len(rows) >= limit:
                break
        return rows[:limit]

    def resource_pressure(self, *, tenant_id: str | None = None, limit: int = 5000) -> list[dict[str, Any]]:
        return resource_samples_from_metric_rows(self.metric_rows(tenant_id=tenant_id, limit=limit))

    def covariance(self, *, tenant_id: str | None = None, limit: int = 5000) -> dict[str, Any]:
        return covariance_snapshot(self.resource_pressure(tenant_id=tenant_id, limit=limit))

    def principal_mode(self, *, tenant_id: str | None = None, limit: int = 5000) -> dict[str, Any]:
        return principal_resource_mode(self.resource_pressure(tenant_id=tenant_id, limit=limit))

    def gpu_starvation(self, *, tenant_id: str | None = None, limit: int = 5000) -> list[dict[str, Any]]:
        return gpu_starvation_rows(self.resource_pressure(tenant_id=tenant_id, limit=limit))

    def network_gpu_coupling(self, *, tenant_id: str | None = None, limit: int = 5000) -> list[dict[str, Any]]:
        return network_gpu_coupling_rows(self.resource_pressure(tenant_id=tenant_id, limit=limit))

    def noisy_neighbor(self, *, tenant_id: str | None = None, limit: int = 5000) -> list[dict[str, Any]]:
        return noisy_neighbor_rows(self.resource_pressure(tenant_id=tenant_id, limit=limit))

    def input_pipeline_stall(self, *, tenant_id: str | None = None, limit: int = 5000) -> list[dict[str, Any]]:
        return input_pipeline_stall_rows(self.resource_pressure(tenant_id=tenant_id, limit=limit))

    def alert_candidates(self, *, tenant_id: str | None = None, limit: int = 5000) -> list[dict[str, Any]]:
        return alert_candidate_rows(self.resource_pressure(tenant_id=tenant_id, limit=limit))

    def hardware_health(self, *, tenant_id: str | None = None, limit: int = 5000) -> list[dict[str, Any]]:
        return hardware_health_rows(self.metric_rows(tenant_id=tenant_id, limit=limit))

    def repair_candidates(self, *, tenant_id: str | None = None, limit: int = 5000) -> list[dict[str, Any]]:
        return repair_candidate_rows(self.metric_rows(tenant_id=tenant_id, limit=limit))

    def fleet_rca(self, *, tenant_id: str | None = None, limit: int = 5000) -> list[dict[str, Any]]:
        return fleet_rca_rows(self.metric_rows(tenant_id=tenant_id, limit=limit))

    def savings_ledger(self, *, tenant_id: str | None = None, limit: int = 5000) -> list[dict[str, Any]]:
        return self.read_table("savings_ledger", tenant_id=tenant_id, limit=limit)

    def system_identification(self, *, tenant_id: str | None = None, limit: int = 5000) -> list[dict[str, Any]]:
        return system_identification_signature_rows(self.read_table("raw_system_identification", tenant_id=tenant_id, limit=limit))

    def _read_table_pyarrow(self, namespace: str, table_name: str, *, tenant_id: str | None, limit: int) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for file_path in self.storage.list_files(Path(namespace) / table_name):
            partitions = _hive_partitions(file_path)
            if tenant_id is not None and partitions.get("tenant_id") != tenant_id:
                continue
            for row in self.storage.read_parquet_table(file_path).to_pylist():
                rows.append({**partitions, **row})
                if len(rows) >= limit:
                    return rows
        return rows

    def _read_table_local_stream(self, namespace: str, table_name: str, *, tenant_id: str | None, limit: int) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        table_path = self.lake_root / namespace / table_name
        scanned_files = 0
        for file_path in table_path.rglob("*.parquet"):
            scanned_files += 1
            if scanned_files > self.max_files:
                break
            relative_path = file_path.relative_to(self.lake_root)
            relative_text = relative_path.as_posix()
            partitions = _hive_partitions(relative_text)
            if tenant_id is not None and partitions.get("tenant_id") != tenant_id:
                continue
            for row in self.storage.read_parquet_table(relative_path).to_pylist():
                rows.append({**partitions, **row})
                if len(rows) >= limit:
                    return rows
        return rows

    def _read_table_duckdb(self, namespace: str, table_name: str, *, tenant_id: str | None, limit: int) -> list[dict[str, Any]]:
        assert duckdb is not None
        pattern = str(self.lake_root / namespace / table_name / "**" / "*.parquet")
        connection = duckdb.connect(":memory:")
        where = " where tenant_id = ?" if tenant_id else ""
        params = [tenant_id, limit] if tenant_id else [limit]
        rows = connection.execute(
            f"select * from read_parquet(?, hive_partitioning=true){where} limit ?",
            [pattern, *params],
        ).fetchall()
        columns = [column[0] for column in connection.description]
        return [dict(zip(columns, row)) for row in rows]


def _hive_partitions(path: str) -> dict[str, str]:
    partitions: dict[str, str] = {}
    for part in Path(path).parts:
        if "=" in part:
            key, value = part.split("=", 1)
            partitions[key] = value
    return partitions
