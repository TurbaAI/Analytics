from __future__ import annotations

import json
import os
import shutil
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[3]
for relative in ("services/duckdb-query-service", "services/platform_common"):
    path = ROOT / relative
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from duckdb_query_service import LakeQuery  # noqa: E402


class TransformRunner:
    def __init__(self, lake_root: str | Path) -> None:
        self.lake_root = Path(lake_root)
        self.query = LakeQuery(self.lake_root)

    def materialize(self, *, tenant_id: str | None = None) -> dict[str, Any]:
        pressure = self.query.resource_pressure(tenant_id=tenant_id)
        covariance = self.query.covariance(tenant_id=tenant_id)
        principal = self.query.principal_mode(tenant_id=tenant_id)
        written = []

        if pressure:
            written.append(self._write_derived("vs_resource_pressure_1m", pressure, tenant_id=tenant_id))

        covariance_rows = []
        for row in covariance.get("rows", []):
            for cell in row.get("cells", []):
                covariance_rows.append(
                    {
                        "left_metric": row.get("metric"),
                        "sample_count": cell.get("sampleCount"),
                        "covariance": cell.get("covariance"),
                        "correlation": cell.get("correlation"),
                    }
                )
        metrics = covariance.get("metrics", [])
        for index, row in enumerate(covariance.get("rows", [])):
            for cell_index, cell in enumerate(row.get("cells", [])):
                covariance_rows[index * len(metrics) + cell_index]["right_metric"] = metrics[cell_index]
        if covariance_rows:
            written.append(self._write_derived("vs_cpu_gpu_ram_net_covariance", covariance_rows, tenant_id=tenant_id))

        principal_row = {
            "status": principal.get("status"),
            "title": principal.get("title"),
            "explained_pct": principal.get("explainedPct"),
            "loadings_json": json.dumps(principal.get("loadings", []), sort_keys=True),
            "eigenvalues_json": json.dumps(principal.get("eigenvalues", []), sort_keys=True),
        }
        written.append(self._write_derived("vs_principal_resource_mode", [principal_row], tenant_id=tenant_id))

        for table_name, rows in (
            ("vs_gpu_starvation", self.query.gpu_starvation(tenant_id=tenant_id)),
            ("vs_network_gpu_coupling", self.query.network_gpu_coupling(tenant_id=tenant_id)),
            ("vs_noisy_neighbor", self.query.noisy_neighbor(tenant_id=tenant_id)),
            ("vs_input_pipeline_stall", self.query.input_pipeline_stall(tenant_id=tenant_id)),
            ("vs_system_identification_signature", self.query.system_identification(tenant_id=tenant_id)),
            ("vs_host_hardware_health", self.query.hardware_health(tenant_id=tenant_id)),
            ("vs_repair_candidates", self.query.repair_candidates(tenant_id=tenant_id)),
            ("vs_fleet_rca", self.query.fleet_rca(tenant_id=tenant_id)),
            ("vs_alert_candidates", self.query.alert_candidates(tenant_id=tenant_id)),
        ):
            if rows:
                written.append(self._write_derived(table_name, rows, tenant_id=tenant_id))

        return {"status": "materialized", "tables": written}

    def _write_derived(self, table_name: str, rows: list[dict[str, Any]], *, tenant_id: str | None) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        clean_tenant = _path_part(tenant_id or "all")
        relative_path = (
            Path("derived")
            / table_name
            / f"tenant_id={clean_tenant}"
            / f"dt={now.strftime('%Y-%m-%d')}"
            / f"part-{uuid.uuid4().hex[:12]}.parquet"
        )
        final_path = self.lake_root / relative_path
        rows_with_time = [{**row, "materialized_at": now} for row in rows]
        _write_parquet_atomic(rows_with_time, final_path)
        return {"table": table_name, "path": str(relative_path), "rowCount": len(rows)}


def _write_parquet_atomic(rows: list[dict[str, Any]], final_path: Path) -> None:
    final_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = final_path.with_suffix(f".{uuid.uuid4().hex}.tmp")
    pq.write_table(pa.Table.from_pylist(rows), tmp_path, compression="zstd")
    try:
        os.replace(tmp_path, final_path)
    except OSError:
        shutil.move(str(tmp_path), str(final_path))


def _path_part(value: str) -> str:
    return "".join(char if char.isalnum() or char in ("-", "_", ".") else "_" for char in value)
