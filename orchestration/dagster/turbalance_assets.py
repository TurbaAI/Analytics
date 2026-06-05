from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
for relative in ("services/duckdb-query-service", "services/transform-runner", "services/raw-writer"):
    path = ROOT / relative
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from duckdb_query_service import LakeQuery  # noqa: E402
from raw_writer import apply_retention, compact_raw_partition, reconcile_lake  # noqa: E402
from transform_runner import TransformRunner, validate_transform_runtime  # noqa: E402

try:
    from dagster import (  # type: ignore
        AssetCheckResult,
        DailyPartitionsDefinition,
        Definitions,
        ScheduleDefinition,
        asset,
        asset_check,
    )
except Exception:  # pragma: no cover - local repo can import without Dagster installed
    DailyPartitionsDefinition = None
    Definitions = None
    ScheduleDefinition = None

    class AssetCheckResult:  # type: ignore
        def __init__(self, passed: bool, metadata: dict[str, Any] | None = None) -> None:
            self.passed = passed
            self.metadata = metadata or {}

    def asset(*_args: Any, **_kwargs: Any):  # type: ignore
        def decorator(fn):
            return fn

        return decorator

    def asset_check(*_args: Any, **_kwargs: Any):  # type: ignore
        def decorator(fn):
            return fn

        return decorator


def lake_root() -> Path:
    return Path(os.environ.get("TURBALANCE_LAKE_ROOT", "build/lakehouse"))


@asset(name="raw_parquet_tables")
def raw_parquet_tables() -> dict[str, Any]:
    query = LakeQuery(lake_root())
    tables = query.list_tables()
    return {"tables": tables, "table_count": len(tables), "engine": query.engine}


@asset(name="virtual_sensor_tables", deps=[raw_parquet_tables])
def virtual_sensor_tables() -> dict[str, Any]:
    return TransformRunner(lake_root()).materialize()


@asset(name="lakehouse_compaction", deps=[raw_parquet_tables])
def lakehouse_compaction() -> dict[str, Any]:
    table_name = os.environ.get("TURBALANCE_COMPACTION_TABLE", "")
    tenant_id = os.environ.get("TURBALANCE_COMPACTION_TENANT_ID", "demo-tenant")
    dt = os.environ.get("TURBALANCE_COMPACTION_DATE", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    hour = os.environ.get("TURBALANCE_COMPACTION_HOUR", "")
    if not table_name:
        return {"status": "skipped", "reason": "TURBALANCE_COMPACTION_TABLE is not set"}
    return compact_raw_partition(
        lake_root(),
        table_name=table_name,
        tenant_id=tenant_id,
        dt=dt,
        hour=hour or None,
        delete_inputs=os.environ.get("TURBALANCE_COMPACTION_DELETE_INPUTS", "true").lower() == "true",
    )


@asset(name="lakehouse_reconciliation", deps=[raw_parquet_tables])
def lakehouse_reconciliation() -> dict[str, Any]:
    return reconcile_lake(lake_root())


@asset(name="transform_runtime_validation", deps=[virtual_sensor_tables, lakehouse_reconciliation])
def transform_runtime_validation() -> dict[str, Any]:
    tenant_id = os.environ.get("TURBALANCE_VALIDATION_TENANT_ID") or None
    return validate_transform_runtime(lake_root(), tenant_id=tenant_id)


@asset(name="lakehouse_retention")
def lakehouse_retention() -> dict[str, Any]:
    retention_days = int(os.environ.get("TURBALANCE_RETENTION_DAYS", "30"))
    return apply_retention(lake_root(), retention_days=retention_days).as_dict()


@asset_check(asset=raw_parquet_tables, name="raw_tables_present")
def raw_tables_present_check() -> AssetCheckResult:
    query = LakeQuery(lake_root())
    tables = query.list_tables()
    return AssetCheckResult(passed=bool(tables), metadata={"table_count": len(tables)})


@asset_check(asset=virtual_sensor_tables, name="resource_pressure_fresh")
def resource_pressure_fresh_check() -> AssetCheckResult:
    rows = LakeQuery(lake_root()).resource_pressure()
    return AssetCheckResult(passed=bool(rows), metadata={"sample_count": len(rows)})


@asset_check(asset=lakehouse_reconciliation, name="raw_lake_reconciles")
def raw_lake_reconciles_check() -> AssetCheckResult:
    result = reconcile_lake(lake_root())
    return AssetCheckResult(passed=result.get("status") == "ok", metadata=result)


@asset_check(asset=transform_runtime_validation, name="transform_runtime_valid")
def transform_runtime_valid_check() -> AssetCheckResult:
    result = validate_transform_runtime(lake_root(), tenant_id=os.environ.get("TURBALANCE_VALIDATION_TENANT_ID") or None)
    return AssetCheckResult(passed=result.get("status") == "ok", metadata=result)


if Definitions is not None and ScheduleDefinition is not None:
    virtual_sensor_schedule = ScheduleDefinition(
        name="virtual_sensor_refresh_minutely",
        cron_schedule="* * * * *",
        target=[raw_parquet_tables, virtual_sensor_tables, lakehouse_reconciliation, transform_runtime_validation],
    )
    compaction_schedule = ScheduleDefinition(
        name="lakehouse_compaction_hourly",
        cron_schedule="9 * * * *",
        target=[lakehouse_compaction, lakehouse_reconciliation],
    )
    retention_schedule = ScheduleDefinition(
        name="lakehouse_retention_daily",
        cron_schedule="17 2 * * *",
        target=[lakehouse_retention],
    )
    defs = Definitions(
        assets=[
            raw_parquet_tables,
            virtual_sensor_tables,
            lakehouse_compaction,
            lakehouse_reconciliation,
            transform_runtime_validation,
            lakehouse_retention,
        ],
        asset_checks=[
            raw_tables_present_check,
            resource_pressure_fresh_check,
            raw_lake_reconciles_check,
            transform_runtime_valid_check,
        ],
        schedules=[virtual_sensor_schedule, compaction_schedule, retention_schedule],
    )
else:
    virtual_sensor_schedule = None
    compaction_schedule = None
    retention_schedule = None
    defs = None
