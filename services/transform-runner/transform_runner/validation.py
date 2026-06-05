from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
for relative in ("services/duckdb-query-service", "services/raw-writer"):
    path = ROOT / relative
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from duckdb_query_service import LakeQuery  # noqa: E402
from raw_writer import reconcile_lake  # noqa: E402

EXPECTED_VIRTUAL_MODELS = {
    "raw_metric_rows": "turbalance.raw_metric_rows",
    "vs_resource_pressure_1m": "turbalance.vs_resource_pressure_1m",
    "vs_cpu_gpu_ram_net_covariance": "turbalance.vs_cpu_gpu_ram_net_covariance",
    "vs_principal_resource_mode": "turbalance.vs_principal_resource_mode",
    "vs_gpu_starvation": "turbalance.vs_gpu_starvation",
    "vs_network_gpu_coupling": "turbalance.vs_network_gpu_coupling",
    "vs_noisy_neighbor": "turbalance.vs_noisy_neighbor",
    "vs_input_pipeline_stall": "turbalance.vs_input_pipeline_stall",
    "vs_alert_candidates": "turbalance.vs_alert_candidates",
}


def validate_transform_runtime(lake_root: str | Path, *, tenant_id: str | None = None) -> dict[str, Any]:
    query = LakeQuery(lake_root)
    checks = [
        _sqlmesh_models_check(),
        _dbt_project_check(),
        _duckdb_views_check(),
        _raw_tables_check(query),
        _resource_pressure_check(query, tenant_id),
        _covariance_check(query, tenant_id),
        _principal_mode_check(query, tenant_id),
        _expanded_virtual_sensor_catalog_check(query, tenant_id),
        _lake_reconciliation_check(lake_root),
    ]
    failed = [check for check in checks if not check["passed"]]
    return {
        "status": "ok" if not failed else "failed",
        "engine": query.engine,
        "tenantId": tenant_id or "",
        "checks": checks,
        "failedChecks": [check["name"] for check in failed],
    }


def _sqlmesh_models_check() -> dict[str, Any]:
    model_root = ROOT / "lakehouse" / "sqlmesh" / "models"
    missing = []
    invalid = []
    for file_stem, model_name in EXPECTED_VIRTUAL_MODELS.items():
        path = model_root / f"{file_stem}.sql"
        if not path.exists():
            missing.append(str(path.relative_to(ROOT)))
            continue
        body = path.read_text(encoding="utf-8")
        if "MODEL (" not in body or model_name not in body:
            invalid.append(str(path.relative_to(ROOT)))
    return {
        "name": "sqlmesh_models_defined",
        "passed": not missing and not invalid,
        "metadata": {"missing": missing, "invalid": invalid, "modelCount": len(EXPECTED_VIRTUAL_MODELS)},
    }


def _dbt_project_check() -> dict[str, Any]:
    project = ROOT / "lakehouse" / "dbt" / "dbt_project.yml"
    profiles = ROOT / "lakehouse" / "dbt" / "profiles.example.yml"
    model_root = ROOT / "lakehouse" / "dbt" / "models"
    body = project.read_text(encoding="utf-8") if project.exists() else ""
    profile_body = profiles.read_text(encoding="utf-8") if profiles.exists() else ""
    missing_models = [
        str((model_root / f"{file_stem}.sql").relative_to(ROOT))
        for file_stem in EXPECTED_VIRTUAL_MODELS
        if not (model_root / f"{file_stem}.sql").exists()
    ]
    passed = "turbalance_lakehouse" in body and "turbalance_duckdb" in body and "type: duckdb" in profile_body and not missing_models
    return {
        "name": "dbt_duckdb_project_defined",
        "passed": passed,
        "metadata": {"project": project.exists(), "profilesExample": profiles.exists(), "missingModels": missing_models},
    }


def _duckdb_views_check() -> dict[str, Any]:
    path = ROOT / "lakehouse" / "duckdb" / "views.sql"
    body = path.read_text(encoding="utf-8") if path.exists() else ""
    missing = [name for name in EXPECTED_VIRTUAL_MODELS if name not in body]
    return {
        "name": "duckdb_views_defined",
        "passed": not missing,
        "metadata": {"missing": missing, "path": str(path.relative_to(ROOT))},
    }


def _raw_tables_check(query: LakeQuery) -> dict[str, Any]:
    tables = query.list_tables()
    return {
        "name": "raw_tables_queryable",
        "passed": bool(tables),
        "metadata": {"tables": tables, "tableCount": len(tables), "engine": query.engine},
    }


def _resource_pressure_check(query: LakeQuery, tenant_id: str | None) -> dict[str, Any]:
    rows = query.resource_pressure(tenant_id=tenant_id)
    return {
        "name": "resource_pressure_rows_present",
        "passed": bool(rows),
        "metadata": {"sampleCount": len(rows)},
    }


def _covariance_check(query: LakeQuery, tenant_id: str | None) -> dict[str, Any]:
    covariance = query.covariance(tenant_id=tenant_id)
    populated_cells = sum(
        1
        for row in covariance.get("rows", [])
        for cell in row.get("cells", [])
        if cell.get("sampleCount", 0) > 0
    )
    return {
        "name": "covariance_matrix_populated",
        "passed": covariance.get("sampleCount", 0) > 0 and populated_cells > 0,
        "metadata": {"sampleCount": covariance.get("sampleCount", 0), "populatedCells": populated_cells},
    }


def _principal_mode_check(query: LakeQuery, tenant_id: str | None) -> dict[str, Any]:
    principal = query.principal_mode(tenant_id=tenant_id)
    return {
        "name": "principal_mode_eigenvalues_available",
        "passed": "eigenvalues" in principal and isinstance(principal.get("eigenvalues"), list),
        "metadata": {
            "status": principal.get("status"),
            "eigenvalueCount": len(principal.get("eigenvalues") or []),
            "title": principal.get("title"),
        },
    }


def _expanded_virtual_sensor_catalog_check(query: LakeQuery, tenant_id: str | None) -> dict[str, Any]:
    results = {
        "gpuStarvation": len(query.gpu_starvation(tenant_id=tenant_id)),
        "networkGpuCoupling": len(query.network_gpu_coupling(tenant_id=tenant_id)),
        "noisyNeighbor": len(query.noisy_neighbor(tenant_id=tenant_id)),
        "inputPipelineStall": len(query.input_pipeline_stall(tenant_id=tenant_id)),
        "alertCandidates": len(query.alert_candidates(tenant_id=tenant_id)),
    }
    return {
        "name": "expanded_virtual_sensor_catalog_queryable",
        "passed": all(isinstance(value, int) for value in results.values()),
        "metadata": results,
    }


def _lake_reconciliation_check(lake_root: str | Path) -> dict[str, Any]:
    reconciliation = reconcile_lake(lake_root)
    return {
        "name": "raw_lake_reconciles",
        "passed": reconciliation.get("status") == "ok",
        "metadata": reconciliation,
    }
