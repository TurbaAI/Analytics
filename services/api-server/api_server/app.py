from __future__ import annotations

import json
import os
import sys
import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.request import urlopen

from fastapi import Depends, FastAPI, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse

ROOT = Path(__file__).resolve().parents[3]
for relative in ("services/duckdb-query-service", "services/alert-engine", "services/platform_common"):
    path = ROOT / relative
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from duckdb_query_service import LakeQuery  # noqa: E402
from platform_common import HttpRequestMetrics, install_request_observability  # noqa: E402
from .auth import ApiAuthenticator, Principal, load_jwt_verifier, load_token_rules  # noqa: E402

try:
    from alert_engine import AlertEngine  # type: ignore # noqa: E402
except Exception:  # pragma: no cover - alert engine can be developed independently
    AlertEngine = None


@dataclass(frozen=True)
class ApiSettings:
    lake_root: Path
    alert_db: Path = Path("build/alerts/alerts.sqlite")
    cors_origins: tuple[str, ...] = ("*",)
    max_rows: int = 5000
    require_auth: bool = False
    api_tokens: tuple[str, ...] = ()
    api_tokens_file: Path | None = None
    alert_webhook_url: str = ""
    alert_slack_webhook_url: str = ""
    alert_pagerduty_routing_key: str = ""
    alert_dry_run_path: Path | None = None
    alert_route_timeout_seconds: float = 2.0
    stream_interval_seconds: float = 2.0
    stream_max_events: int = 0
    discovery_url: str = ""
    jwks_json: str = ""
    jwks_path: Path | None = None
    jwks_url: str = ""
    jwt_issuer: str = ""
    jwt_audience: str = ""
    jwt_tenant_claim: str = "tenant_id"
    jwt_role_claim: str = "role"
    jwt_subject_claim: str = "sub"
    service_name: str = "api-server"
    product_version: str = "0.1.0"
    deployment_environment: str = "pilot"

    @classmethod
    def from_env(cls) -> "ApiSettings":
        return cls(
            lake_root=Path(os.environ.get("TURBALANCE_LAKE_ROOT", "build/lakehouse")),
            alert_db=Path(os.environ.get("TURBALANCE_ALERT_DB", "build/alerts/alerts.sqlite")),
            cors_origins=tuple(origin.strip() for origin in os.environ.get("TURBALANCE_CORS_ORIGINS", "*").split(",") if origin.strip()),
            max_rows=int(os.environ.get("TURBALANCE_API_MAX_ROWS", "5000")),
            require_auth=_env_bool(os.environ.get("TURBALANCE_API_REQUIRE_AUTH", "false")),
            api_tokens=tuple(
                entry.strip()
                for entry in os.environ.get("TURBALANCE_API_TOKENS", "").replace("\n", ",").split(",")
                if entry.strip()
            ),
            api_tokens_file=Path(os.environ["TURBALANCE_API_TOKENS_FILE"])
            if os.environ.get("TURBALANCE_API_TOKENS_FILE")
            else None,
            alert_webhook_url=os.environ.get("TURBALANCE_ALERT_WEBHOOK_URL", ""),
            alert_slack_webhook_url=os.environ.get("TURBALANCE_ALERT_SLACK_WEBHOOK_URL", ""),
            alert_pagerduty_routing_key=os.environ.get("TURBALANCE_ALERT_PAGERDUTY_ROUTING_KEY", ""),
            alert_dry_run_path=Path(os.environ["TURBALANCE_ALERT_DRY_RUN_PATH"])
            if os.environ.get("TURBALANCE_ALERT_DRY_RUN_PATH")
            else None,
            alert_route_timeout_seconds=float(os.environ.get("TURBALANCE_ALERT_ROUTE_TIMEOUT_SECONDS", "2")),
            stream_interval_seconds=float(os.environ.get("TURBALANCE_API_STREAM_INTERVAL_SECONDS", "2")),
            stream_max_events=int(os.environ.get("TURBALANCE_API_STREAM_MAX_EVENTS", "0")),
            discovery_url=os.environ.get("TURBALANCE_DISCOVERY_URL", ""),
            jwks_json=os.environ.get("TURBALANCE_API_JWKS", ""),
            jwks_path=Path(os.environ["TURBALANCE_API_JWKS_PATH"])
            if os.environ.get("TURBALANCE_API_JWKS_PATH")
            else None,
            jwks_url=os.environ.get("TURBALANCE_API_JWKS_URL", ""),
            jwt_issuer=os.environ.get("TURBALANCE_API_JWT_ISSUER", ""),
            jwt_audience=os.environ.get("TURBALANCE_API_JWT_AUDIENCE", ""),
            jwt_tenant_claim=os.environ.get("TURBALANCE_API_JWT_TENANT_CLAIM", "tenant_id"),
            jwt_role_claim=os.environ.get("TURBALANCE_API_JWT_ROLE_CLAIM", "role"),
            jwt_subject_claim=os.environ.get("TURBALANCE_API_JWT_SUBJECT_CLAIM", "sub"),
            service_name=os.environ.get("TURBALANCE_OTEL_SERVICE_NAME", "api-server"),
            product_version=os.environ.get("TURBALANCE_PRODUCT_VERSION", "0.1.0"),
            deployment_environment=os.environ.get("TURBALANCE_DEPLOYMENT_ENVIRONMENT", "pilot"),
        )


def create_app(settings: ApiSettings | None = None) -> FastAPI:
    settings = settings or ApiSettings.from_env()
    lake = LakeQuery(settings.lake_root, max_rows=settings.max_rows)
    auth = ApiAuthenticator(
        require_auth=settings.require_auth,
        token_rules=load_token_rules(",".join(settings.api_tokens), settings.api_tokens_file),
        jwt_verifier=load_jwt_verifier(
            jwks_json=settings.jwks_json,
            jwks_path=settings.jwks_path,
            jwks_url=settings.jwks_url,
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
            tenant_claim=settings.jwt_tenant_claim,
            role_claim=settings.jwt_role_claim,
            subject_claim=settings.jwt_subject_claim,
        ),
    )
    alert_store = None
    alert_router = None
    if AlertEngine is not None:
        from alert_engine import AlertRouter, AlertStore  # type: ignore

        alert_store = AlertStore(settings.alert_db)
        alert_router = AlertRouter(
            webhook_url=settings.alert_webhook_url,
            slack_webhook_url=settings.alert_slack_webhook_url,
            pagerduty_routing_key=settings.alert_pagerduty_routing_key,
            dry_run_path=settings.alert_dry_run_path,
            timeout_seconds=settings.alert_route_timeout_seconds,
        )
    app = FastAPI(title="turbalance product API", version="0.1.0")
    request_metrics = HttpRequestMetrics(service_name=settings.service_name)
    install_request_observability(app, request_metrics)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "queryEngine": lake.engine, "version": settings.product_version}

    @app.get("/ready")
    async def ready() -> dict[str, Any]:
        if "://" not in str(settings.lake_root):
            settings.lake_root.mkdir(parents=True, exist_ok=True)
        return {
            "status": "ready",
            "lakeRoot": str(settings.lake_root),
            "queryEngine": lake.engine,
            "authRequired": auth.require_auth,
            "version": settings.product_version,
        }

    @app.get("/version")
    async def version() -> dict[str, str]:
        return {
            "name": "turbalance-api",
            "version": settings.product_version,
            "environment": settings.deployment_environment,
        }

    viewer_dependency = _auth_dependency(auth, "viewer")
    operator_dependency = _auth_dependency(auth, "operator")

    @app.get("/metrics", response_class=PlainTextResponse)
    async def metrics(_principal: Principal = Depends(viewer_dependency)) -> str:
        base_metrics = "\n".join(
            [
                "# HELP turbalance_api_up Product API health gauge.",
                "# TYPE turbalance_api_up gauge",
                "turbalance_api_up 1",
                "# HELP turbalance_api_query_engine_info Product API query engine label.",
                "# TYPE turbalance_api_query_engine_info gauge",
                f'turbalance_api_query_engine_info{{engine="{lake.engine}"}} 1',
                "",
            ]
        )
        return base_metrics + request_metrics.render_prometheus("turbalance_api") + "\n"

    @app.get("/v1/me")
    async def me(principal: Principal = Depends(viewer_dependency)) -> dict[str, Any]:
        return {
            "subject": principal.subject,
            "role": principal.role,
            "tenantId": principal.tenant_id,
            "authenticated": principal.authenticated,
            "authRequired": auth.require_auth,
        }

    @app.get("/v1/discovery/catalog")
    async def discovery_catalog(_principal: Principal = Depends(viewer_dependency)) -> dict[str, Any]:
        if not settings.discovery_url:
            return {"status": "unconfigured", "ready": {}, "hosts": [], "agents": [], "services": []}
        base_url = settings.discovery_url.rstrip("/")
        try:
            ready = _fetch_discovery_json(f"{base_url}/ready")
            hosts = _fetch_discovery_json(f"{base_url}/v1/hosts").get("hosts", [])
            agents = _fetch_discovery_json(f"{base_url}/v1/agents").get("agents", [])
            services = _fetch_discovery_json(f"{base_url}/v1/services").get("services", [])
        except Exception as exc:
            return {"status": "unavailable", "reason": str(exc), "ready": {}, "hosts": [], "agents": [], "services": []}
        return {"status": "ready", "ready": ready, "hosts": hosts, "agents": agents, "services": services}

    @app.get("/v1/hosts")
    async def hosts(
        principal: Principal = Depends(viewer_dependency),
        tenant_id: str | None = Query(default=None, alias="tenantId"),
    ) -> dict[str, Any]:
        tenant_id = auth.scoped_tenant(principal, tenant_id)
        rows = lake.metric_rows(tenant_id=tenant_id, limit=settings.max_rows)
        host_ids = sorted({str(row.get("host_id") or "") for row in rows if row.get("host_id")})
        return {"hosts": [{"hostId": host_id} for host_id in host_ids]}

    @app.get("/v1/hosts/{host_id}/resources")
    async def host_resources(
        host_id: str,
        tenant_id: str | None = Query(default=None, alias="tenantId"),
        principal: Principal = Depends(viewer_dependency),
    ) -> dict[str, Any]:
        tenant_id = auth.scoped_tenant(principal, tenant_id)
        rows = [
            row
            for row in lake.resource_pressure(tenant_id=tenant_id, limit=settings.max_rows)
            if row.get("host_id") == host_id
        ]
        return {"hostId": host_id, "count": len(rows), "rows": rows}

    @app.get("/v1/virtual-sensors/covariance")
    async def covariance(
        tenant_id: str | None = Query(default=None, alias="tenantId"),
        principal: Principal = Depends(viewer_dependency),
    ) -> dict[str, Any]:
        tenant_id = auth.scoped_tenant(principal, tenant_id)
        return lake.covariance(tenant_id=tenant_id, limit=settings.max_rows)

    @app.get("/v1/virtual-sensors/principal-resource-mode")
    async def principal_resource_mode(
        tenant_id: str | None = Query(default=None, alias="tenantId"),
        principal: Principal = Depends(viewer_dependency),
    ) -> dict[str, Any]:
        tenant_id = auth.scoped_tenant(principal, tenant_id)
        return lake.principal_mode(tenant_id=tenant_id, limit=settings.max_rows)

    @app.get("/v1/virtual-sensors/gpu-starvation")
    async def gpu_starvation(
        tenant_id: str | None = Query(default=None, alias="tenantId"),
        principal: Principal = Depends(viewer_dependency),
    ) -> dict[str, Any]:
        tenant_id = auth.scoped_tenant(principal, tenant_id)
        rows = lake.gpu_starvation(tenant_id=tenant_id, limit=settings.max_rows)
        return {"rows": rows, "count": len(rows)}

    @app.get("/v1/virtual-sensors/network-gpu-coupling")
    async def network_gpu_coupling(
        tenant_id: str | None = Query(default=None, alias="tenantId"),
        principal: Principal = Depends(viewer_dependency),
    ) -> dict[str, Any]:
        tenant_id = auth.scoped_tenant(principal, tenant_id)
        rows = lake.network_gpu_coupling(tenant_id=tenant_id, limit=settings.max_rows)
        return {"rows": rows, "count": len(rows)}

    @app.get("/v1/virtual-sensors/noisy-neighbor")
    async def noisy_neighbor(
        tenant_id: str | None = Query(default=None, alias="tenantId"),
        principal: Principal = Depends(viewer_dependency),
    ) -> dict[str, Any]:
        tenant_id = auth.scoped_tenant(principal, tenant_id)
        rows = lake.noisy_neighbor(tenant_id=tenant_id, limit=settings.max_rows)
        return {"rows": rows, "count": len(rows)}

    @app.get("/v1/virtual-sensors/input-pipeline-stall")
    async def input_pipeline_stall(
        tenant_id: str | None = Query(default=None, alias="tenantId"),
        principal: Principal = Depends(viewer_dependency),
    ) -> dict[str, Any]:
        tenant_id = auth.scoped_tenant(principal, tenant_id)
        rows = lake.input_pipeline_stall(tenant_id=tenant_id, limit=settings.max_rows)
        return {"rows": rows, "count": len(rows)}

    @app.get("/v1/virtual-sensors/system-identification")
    async def system_identification(
        tenant_id: str | None = Query(default=None, alias="tenantId"),
        principal: Principal = Depends(viewer_dependency),
    ) -> dict[str, Any]:
        tenant_id = auth.scoped_tenant(principal, tenant_id)
        rows = lake.system_identification(tenant_id=tenant_id, limit=settings.max_rows)
        return {"rows": rows, "count": len(rows)}

    @app.get("/v1/virtual-sensors/alert-candidates")
    async def alert_candidates(
        tenant_id: str | None = Query(default=None, alias="tenantId"),
        principal: Principal = Depends(viewer_dependency),
    ) -> dict[str, Any]:
        tenant_id = auth.scoped_tenant(principal, tenant_id)
        rows = lake.alert_candidates(tenant_id=tenant_id, limit=settings.max_rows)
        return {"rows": rows, "count": len(rows)}

    @app.get("/v1/virtual-sensors/hardware-health")
    async def hardware_health(
        tenant_id: str | None = Query(default=None, alias="tenantId"),
        principal: Principal = Depends(viewer_dependency),
    ) -> dict[str, Any]:
        tenant_id = auth.scoped_tenant(principal, tenant_id)
        rows = lake.hardware_health(tenant_id=tenant_id, limit=settings.max_rows)
        return {"rows": rows, "count": len(rows)}

    @app.get("/v1/virtual-sensors/repair-candidates")
    async def repair_candidates(
        tenant_id: str | None = Query(default=None, alias="tenantId"),
        principal: Principal = Depends(viewer_dependency),
    ) -> dict[str, Any]:
        tenant_id = auth.scoped_tenant(principal, tenant_id)
        rows = lake.repair_candidates(tenant_id=tenant_id, limit=settings.max_rows)
        return {"rows": rows, "count": len(rows)}

    @app.get("/v1/virtual-sensors/fleet-rca")
    async def fleet_rca(
        tenant_id: str | None = Query(default=None, alias="tenantId"),
        principal: Principal = Depends(viewer_dependency),
    ) -> dict[str, Any]:
        tenant_id = auth.scoped_tenant(principal, tenant_id)
        rows = lake.fleet_rca(tenant_id=tenant_id, limit=settings.max_rows)
        return {"rows": rows, "count": len(rows)}

    @app.get("/v1/alerts")
    async def alerts(
        tenant_id: str | None = Query(default=None, alias="tenantId"),
        principal: Principal = Depends(viewer_dependency),
    ) -> dict[str, Any]:
        tenant_id = auth.scoped_tenant(principal, tenant_id)
        if AlertEngine is None or alert_store is None:
            return {"alerts": [], "status": "alert-engine-unavailable"}
        engine = AlertEngine(lake)
        stored_alerts = alert_store.upsert_evaluated(engine.evaluate(tenant_id=tenant_id))
        deliveries = alert_router.dispatch(stored_alerts) if alert_router is not None else []
        return {
            "alerts": alert_store.list_alerts(),
            "deliveries": [delivery.__dict__ for delivery in deliveries],
        }

    @app.post("/v1/alerts/{incident_key:path}/ack")
    async def acknowledge_alert(incident_key: str, _principal: Principal = Depends(operator_dependency)) -> dict[str, Any]:
        if alert_store is None:
            return {"status": "alert-engine-unavailable"}
        alert = alert_store.transition(incident_key, "acknowledged")
        if alert is None:
            return {"status": "missing", "incidentKey": incident_key}
        return {"status": "acknowledged", "alert": alert}

    @app.post("/v1/alerts/{incident_key:path}/resolve")
    async def resolve_alert(incident_key: str, _principal: Principal = Depends(operator_dependency)) -> dict[str, Any]:
        if alert_store is None:
            return {"status": "alert-engine-unavailable"}
        alert = alert_store.transition(incident_key, "resolved")
        if alert is None:
            return {"status": "missing", "incidentKey": incident_key}
        return {"status": "resolved", "alert": alert}

    @app.get("/v1/stream/resources")
    async def resource_stream(
        tenant_id: str | None = Query(default=None, alias="tenantId"),
        principal: Principal = Depends(viewer_dependency),
    ) -> StreamingResponse:
        tenant_id = auth.scoped_tenant(principal, tenant_id)
        async def events():
            sent = 0
            while True:
                payload = {
                    "type": "resource_snapshot",
                    "observedAt": _utc_iso(),
                    "rows": lake.resource_pressure(tenant_id=tenant_id, limit=settings.max_rows),
                }
                yield f"event: resource_snapshot\ndata: {json.dumps(payload, default=str)}\n\n"
                sent += 1
                if settings.stream_max_events > 0 and sent >= settings.stream_max_events:
                    break
                await asyncio.sleep(max(0.25, settings.stream_interval_seconds))

        return StreamingResponse(events(), media_type="text/event-stream")

    return app


def _auth_dependency(auth: ApiAuthenticator, minimum_role: str):
    async def dependency(authorization: str | None = Header(default=None)) -> Principal:
        return auth.require(authorization, minimum_role)

    return dependency


def _env_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _fetch_discovery_json(url: str) -> dict[str, Any]:
    with urlopen(url, timeout=2) as response:
        return json.loads(response.read().decode("utf-8"))


def _utc_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


app = create_app()
