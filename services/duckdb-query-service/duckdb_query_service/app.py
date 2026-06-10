from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Query
from fastapi.responses import PlainTextResponse
from platform_common import HttpRequestMetrics, install_request_observability

from .query import LakeQuery


@dataclass(frozen=True)
class QuerySettings:
    lake_root: Path
    max_rows: int = 5000
    service_name: str = "duckdb-query-service"

    @classmethod
    def from_env(cls) -> "QuerySettings":
        return cls(
            lake_root=Path(os.environ.get("TURBALANCE_LAKE_ROOT", "build/lakehouse")),
            max_rows=int(os.environ.get("TURBALANCE_QUERY_MAX_ROWS", "5000")),
            service_name=os.environ.get("TURBALANCE_OTEL_SERVICE_NAME", "duckdb-query-service"),
        )


def create_app(settings: QuerySettings | None = None) -> FastAPI:
    settings = settings or QuerySettings.from_env()
    lake = LakeQuery(settings.lake_root, max_rows=settings.max_rows)
    app = FastAPI(title="turbalance DuckDB query service", version="0.1.0")
    request_metrics = HttpRequestMetrics(service_name=settings.service_name)
    install_request_observability(app, request_metrics)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "engine": lake.engine}

    @app.get("/metrics", response_class=PlainTextResponse)
    async def metrics() -> str:
        base_metrics = "\n".join(
            [
                "# HELP turbalance_query_up DuckDB query service health gauge.",
                "# TYPE turbalance_query_up gauge",
                "turbalance_query_up 1",
                "# HELP turbalance_query_engine_info DuckDB query engine label.",
                "# TYPE turbalance_query_engine_info gauge",
                f'turbalance_query_engine_info{{engine="{lake.engine}"}} 1',
                "",
            ]
        )
        return base_metrics + request_metrics.render_prometheus("turbalance_query") + "\n"

    @app.get("/v1/raw/tables")
    async def list_tables() -> dict[str, Any]:
        return {"tables": lake.list_tables(), "engine": lake.engine}

    @app.get("/v1/raw/{table_name}")
    async def read_table(
        table_name: str,
        tenant_id: str | None = Query(default=None, alias="tenantId"),
        limit: int = Query(default=500, ge=1, le=5000),
    ) -> dict[str, Any]:
        rows = lake.read_table(table_name, tenant_id=tenant_id, limit=limit)
        return {"table": table_name, "count": len(rows), "rows": rows, "engine": lake.engine}

    @app.get("/v1/virtual-sensors/resource-pressure")
    async def resource_pressure(
        tenant_id: str | None = Query(default=None, alias="tenantId"),
        limit: int = Query(default=5000, ge=1, le=5000),
    ) -> dict[str, Any]:
        rows = lake.resource_pressure(tenant_id=tenant_id, limit=limit)
        return {"count": len(rows), "rows": rows}

    @app.get("/v1/virtual-sensors/covariance")
    async def covariance(
        tenant_id: str | None = Query(default=None, alias="tenantId"),
        limit: int = Query(default=5000, ge=1, le=5000),
    ) -> dict[str, Any]:
        return lake.covariance(tenant_id=tenant_id, limit=limit)

    @app.get("/v1/virtual-sensors/principal-resource-mode")
    async def principal_resource_mode(
        tenant_id: str | None = Query(default=None, alias="tenantId"),
        limit: int = Query(default=5000, ge=1, le=5000),
    ) -> dict[str, Any]:
        return lake.principal_mode(tenant_id=tenant_id, limit=limit)

    @app.get("/v1/virtual-sensors/system-identification")
    async def system_identification(
        tenant_id: str | None = Query(default=None, alias="tenantId"),
        limit: int = Query(default=5000, ge=1, le=5000),
    ) -> dict[str, Any]:
        rows = lake.system_identification(tenant_id=tenant_id, limit=limit)
        return {"count": len(rows), "rows": rows}

    @app.get("/v1/virtual-sensors/hardware-health")
    async def hardware_health(
        tenant_id: str | None = Query(default=None, alias="tenantId"),
        limit: int = Query(default=5000, ge=1, le=5000),
    ) -> dict[str, Any]:
        rows = lake.hardware_health(tenant_id=tenant_id, limit=limit)
        return {"count": len(rows), "rows": rows}

    @app.get("/v1/virtual-sensors/repair-candidates")
    async def repair_candidates(
        tenant_id: str | None = Query(default=None, alias="tenantId"),
        limit: int = Query(default=5000, ge=1, le=5000),
    ) -> dict[str, Any]:
        rows = lake.repair_candidates(tenant_id=tenant_id, limit=limit)
        return {"count": len(rows), "rows": rows}

    @app.get("/v1/virtual-sensors/fleet-rca")
    async def fleet_rca(
        tenant_id: str | None = Query(default=None, alias="tenantId"),
        limit: int = Query(default=5000, ge=1, le=5000),
    ) -> dict[str, Any]:
        rows = lake.fleet_rca(tenant_id=tenant_id, limit=limit)
        return {"count": len(rows), "rows": rows}

    return app


app = create_app()
