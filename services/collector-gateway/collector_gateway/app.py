from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[3]
for relative in ("services/platform_common", "services/raw-writer"):
    path = ROOT / relative
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from platform_common import HttpRequestMetrics, install_request_observability, parse_batch  # noqa: E402
from raw_writer import TelemetryLakeWriter  # noqa: E402
from .backpressure import BackpressureAdapter  # noqa: E402
from .identity import ClientIdentityError, client_identity_from_xfcc  # noqa: E402
from .queue import create_queue_publisher  # noqa: E402
from .security import AuditLog, RateLimiter, ReplayStore, SignatureHeaders, verify_signature  # noqa: E402


@dataclass(frozen=True)
class CollectorSettings:
    lake_root: str | Path
    bearer_token: str = ""
    hmac_secret: str = ""
    replay_db: Path = Path("build/collector/replay.sqlite")
    audit_log: Path = Path("build/collector/audit.jsonl")
    max_body_bytes: int = 5 * 1024 * 1024
    rate_limit_per_minute: int = 600
    max_inflight_writes: int = 8
    spool_dir: Path | None = Path("build/collector/spool")
    max_spool_files: int = 1000
    require_mtls: bool = False
    trusted_spiffe_prefix: str = "spiffe://turbalance.local/"
    queue_backend: str = ""
    queue_url: str = ""
    queue_dir: Path = Path("build/collector/queue")
    queue_token: str = ""
    queue_timeout_seconds: float = 2.0
    service_name: str = "collector-gateway"

    @classmethod
    def from_env(cls) -> "CollectorSettings":
        return cls(
            lake_root=os.environ.get("TURBALANCE_LAKE_ROOT", "build/lakehouse"),
            bearer_token=os.environ.get("TURBALANCE_COLLECTOR_TOKEN", ""),
            hmac_secret=os.environ.get("TURBALANCE_COLLECTOR_HMAC_SECRET", ""),
            replay_db=Path(os.environ.get("TURBALANCE_COLLECTOR_REPLAY_DB", "build/collector/replay.sqlite")),
            audit_log=Path(os.environ.get("TURBALANCE_COLLECTOR_AUDIT_LOG", "build/collector/audit.jsonl")),
            max_body_bytes=int(os.environ.get("TURBALANCE_COLLECTOR_MAX_BODY_BYTES", str(5 * 1024 * 1024))),
            rate_limit_per_minute=int(os.environ.get("TURBALANCE_COLLECTOR_RATE_LIMIT_PER_MINUTE", "600")),
            max_inflight_writes=int(os.environ.get("TURBALANCE_COLLECTOR_MAX_INFLIGHT_WRITES", "8")),
            spool_dir=Path(os.environ.get("TURBALANCE_COLLECTOR_SPOOL_DIR", "build/collector/spool")),
            max_spool_files=int(os.environ.get("TURBALANCE_COLLECTOR_MAX_SPOOL_FILES", "1000")),
            require_mtls=_env_bool(os.environ.get("TURBALANCE_COLLECTOR_REQUIRE_MTLS", "false")),
            trusted_spiffe_prefix=os.environ.get("TURBALANCE_TRUSTED_SPIFFE_PREFIX", "spiffe://turbalance.local/"),
            queue_backend=os.environ.get("TURBALANCE_COLLECTOR_QUEUE_BACKEND", ""),
            queue_url=os.environ.get("TURBALANCE_COLLECTOR_QUEUE_URL", ""),
            queue_dir=Path(os.environ.get("TURBALANCE_COLLECTOR_QUEUE_DIR", "build/collector/queue")),
            queue_token=os.environ.get("TURBALANCE_COLLECTOR_QUEUE_TOKEN", ""),
            queue_timeout_seconds=float(os.environ.get("TURBALANCE_COLLECTOR_QUEUE_TIMEOUT_SECONDS", "2")),
            service_name=os.environ.get("TURBALANCE_OTEL_SERVICE_NAME", "collector-gateway"),
        )


class SourceBundleIngestRequest(BaseModel):
    tenantId: str = "demo-tenant"
    hostId: str = "source-bundle"
    agentId: str = "source-bundle-adapter"
    bundle: dict[str, Any]


class CollectorStats:
    def __init__(self) -> None:
        self.accepted_batches = 0
        self.rejected_batches = 0
        self.quarantined_batches = 0
        self.written_rows = 0
        self.auth_failures = 0
        self.rate_limited = 0
        self.queued_batches = 0
        self.backpressure_rejections = 0
        self.mtls_authentications = 0
        self.mtls_failures = 0

    def render_prometheus(self) -> str:
        return "\n".join(
            [
                "# HELP turbalance_collector_accepted_batches_total Accepted telemetry batches.",
                "# TYPE turbalance_collector_accepted_batches_total counter",
                f"turbalance_collector_accepted_batches_total {self.accepted_batches}",
                "# HELP turbalance_collector_rejected_batches_total Rejected telemetry batches.",
                "# TYPE turbalance_collector_rejected_batches_total counter",
                f"turbalance_collector_rejected_batches_total {self.rejected_batches}",
                "# HELP turbalance_collector_quarantined_batches_total Quarantined telemetry batches.",
                "# TYPE turbalance_collector_quarantined_batches_total counter",
                f"turbalance_collector_quarantined_batches_total {self.quarantined_batches}",
                "# HELP turbalance_collector_written_rows_total Rows written to raw Parquet.",
                "# TYPE turbalance_collector_written_rows_total counter",
                f"turbalance_collector_written_rows_total {self.written_rows}",
                "# HELP turbalance_collector_auth_failures_total Collector auth failures.",
                "# TYPE turbalance_collector_auth_failures_total counter",
                f"turbalance_collector_auth_failures_total {self.auth_failures}",
                "# HELP turbalance_collector_rate_limited_total Rate-limited collector requests.",
                "# TYPE turbalance_collector_rate_limited_total counter",
                f"turbalance_collector_rate_limited_total {self.rate_limited}",
                "# HELP turbalance_collector_queued_batches_total Authenticated batches queued by backpressure.",
                "# TYPE turbalance_collector_queued_batches_total counter",
                f"turbalance_collector_queued_batches_total {self.queued_batches}",
                "# HELP turbalance_collector_backpressure_rejections_total Requests rejected by backpressure.",
                "# TYPE turbalance_collector_backpressure_rejections_total counter",
                f"turbalance_collector_backpressure_rejections_total {self.backpressure_rejections}",
                "# HELP turbalance_collector_mtls_authentications_total Collector requests authenticated by trusted mTLS identity.",
                "# TYPE turbalance_collector_mtls_authentications_total counter",
                f"turbalance_collector_mtls_authentications_total {self.mtls_authentications}",
                "# HELP turbalance_collector_mtls_failures_total Collector requests rejected by mTLS identity enforcement.",
                "# TYPE turbalance_collector_mtls_failures_total counter",
                f"turbalance_collector_mtls_failures_total {self.mtls_failures}",
                "",
            ]
        )


def create_app(settings: CollectorSettings | None = None) -> FastAPI:
    settings = settings or CollectorSettings.from_env()
    writer = TelemetryLakeWriter(settings.lake_root)
    stats = CollectorStats()
    replay_store = ReplayStore(settings.replay_db)
    rate_limiter = RateLimiter(limit_per_minute=settings.rate_limit_per_minute)
    audit = AuditLog(settings.audit_log)
    queue_publisher = create_queue_publisher(
        settings.queue_backend,
        queue_url=settings.queue_url,
        queue_dir=settings.queue_dir,
        bearer_token=settings.queue_token,
        timeout_seconds=settings.queue_timeout_seconds,
    )
    backpressure = BackpressureAdapter(
        max_inflight=settings.max_inflight_writes,
        spool_dir=settings.spool_dir,
        max_spool_files=settings.max_spool_files,
        queue_publisher=queue_publisher,
    )
    app = FastAPI(title="turbalance collector gateway", version="0.1.0")
    request_metrics = HttpRequestMetrics(service_name=settings.service_name)
    install_request_observability(app, request_metrics)

    async def guard(
        request: Request,
        authorization: str | None,
        signature: str | None,
        timestamp: str | None,
        nonce: str | None,
        x_forwarded_client_cert: str | None,
    ) -> bytes:
        body = await request.body()
        client = request.client.host if request.client else "unknown"
        rate_key = request.headers.get("x-turbalance-agent-id") or client
        if not rate_limiter.allow(rate_key):
            stats.rejected_batches += 1
            stats.rate_limited += 1
            audit.write("rate_limited", client=client, rateKey=rate_key)
            raise HTTPException(status_code=429, detail="collector rate limit exceeded")
        if len(body) > settings.max_body_bytes:
            stats.rejected_batches += 1
            audit.write("body_too_large", client=client, bodyBytes=len(body))
            raise HTTPException(status_code=413, detail="telemetry batch exceeds collector body limit")
        if settings.require_mtls:
            try:
                identity = client_identity_from_xfcc(
                    x_forwarded_client_cert,
                    trusted_spiffe_prefix=settings.trusted_spiffe_prefix,
                )
            except ClientIdentityError as exc:
                stats.rejected_batches += 1
                stats.auth_failures += 1
                stats.mtls_failures += 1
                audit.write("invalid_mtls_identity", client=client, reason=str(exc))
                raise HTTPException(status_code=401, detail="invalid collector mTLS identity") from exc
            stats.mtls_authentications += 1
            audit.write(
                "mtls_identity_accepted",
                client=client,
                spiffeId=identity.spiffe_id,
                subject=identity.subject,
                fingerprint=identity.fingerprint,
            )
            if not (settings.bearer_token or settings.hmac_secret):
                return body
        if settings.bearer_token:
            expected = f"Bearer {settings.bearer_token}"
            if authorization == expected:
                return body
        if settings.hmac_secret:
            if not (signature and timestamp and nonce):
                stats.rejected_batches += 1
                stats.auth_failures += 1
                audit.write("missing_signature", client=client)
                raise HTTPException(status_code=401, detail="missing collector signature headers")
            headers = SignatureHeaders(timestamp=timestamp, nonce=nonce, signature=signature)
            if not verify_signature(settings.hmac_secret, headers, body):
                stats.rejected_batches += 1
                stats.auth_failures += 1
                audit.write("invalid_signature", client=client, nonce=nonce)
                raise HTTPException(status_code=401, detail="invalid collector signature")
            if not replay_store.check_and_record(nonce):
                stats.rejected_batches += 1
                stats.auth_failures += 1
                audit.write("replay_detected", client=client, nonce=nonce)
                raise HTTPException(status_code=409, detail="collector nonce has already been used")
            return body
        if settings.bearer_token:
            stats.rejected_batches += 1
            stats.auth_failures += 1
            audit.write("invalid_bearer", client=client)
            raise HTTPException(status_code=401, detail="invalid collector token")
        return body

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/ready")
    async def ready() -> dict[str, Any]:
        if writer.storage.local_root is not None:
            writer.storage.local_root.mkdir(parents=True, exist_ok=True)
        else:
            writer.storage.fs.create_dir(writer.storage.base_path, recursive=True)
        return {"status": "ready", "lakeRoot": str(settings.lake_root), "backpressure": backpressure.snapshot()}

    @app.post("/v1/telemetry/batches")
    async def ingest_batch(
        request: Request,
        authorization: str | None = Header(default=None),
        x_turbalance_signature: str | None = Header(default=None),
        x_turbalance_timestamp: str | None = Header(default=None),
        x_turbalance_nonce: str | None = Header(default=None),
        x_forwarded_client_cert: str | None = Header(default=None),
    ) -> dict[str, Any]:
        body = await guard(
            request,
            authorization,
            x_turbalance_signature,
            x_turbalance_timestamp,
            x_turbalance_nonce,
            x_forwarded_client_cert,
        )
        admission = backpressure.admit_or_spool(body, metadata={"route": "telemetry_batches"})
        if admission.queued:
            stats.queued_batches += 1
            audit.write("batch_queued", path=admission.path, queueBackend=admission.queue_backend)
            return {"status": "queued", "path": admission.path, "queueBackend": admission.queue_backend}
        if admission.rejected:
            stats.rejected_batches += 1
            stats.backpressure_rejections += 1
            audit.write("backpressure_rejected", reason=admission.reason)
            raise HTTPException(status_code=503, detail=admission.reason)
        try:
            payload = await request.json()
            try:
                batch = parse_batch(payload)
            except Exception as exc:
                stats.rejected_batches += 1
                audit.write("invalid_batch", reason=str(exc))
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            result = writer.write_batch(batch)
            _record_write_result(stats, result)
            audit.write("batch_ingested", batchId=result.get("batchId"), status=result.get("status"), rowCount=result.get("rowCount"))
            return result
        finally:
            backpressure.release(admission)

    @app.post("/v1/source-bundles")
    async def ingest_source_bundle(
        body: SourceBundleIngestRequest,
        request: Request,
        authorization: str | None = Header(default=None),
        x_turbalance_signature: str | None = Header(default=None),
        x_turbalance_timestamp: str | None = Header(default=None),
        x_turbalance_nonce: str | None = Header(default=None),
        x_forwarded_client_cert: str | None = Header(default=None),
    ) -> dict[str, Any]:
        request_body = await guard(
            request,
            authorization,
            x_turbalance_signature,
            x_turbalance_timestamp,
            x_turbalance_nonce,
            x_forwarded_client_cert,
        )
        admission = backpressure.admit_or_spool(request_body, metadata={"route": "source_bundles"})
        if admission.queued:
            stats.queued_batches += 1
            audit.write("source_bundle_queued", path=admission.path, queueBackend=admission.queue_backend)
            return {"status": "queued", "path": admission.path, "queueBackend": admission.queue_backend}
        if admission.rejected:
            stats.rejected_batches += 1
            stats.backpressure_rejections += 1
            audit.write("backpressure_rejected", reason=admission.reason)
            raise HTTPException(status_code=503, detail=admission.reason)
        try:
            result = writer.write_source_bundle(
                body.bundle,
                tenant_id=body.tenantId,
                host_id=body.hostId,
                agent_id=body.agentId,
            )
            _record_write_result(stats, result)
            audit.write("source_bundle_ingested", hostId=body.hostId, status=result.get("status"), rowCount=result.get("rowCount"))
            return result
        finally:
            backpressure.release(admission)

    @app.get("/metrics", response_class=PlainTextResponse)
    async def metrics() -> str:
        return stats.render_prometheus() + request_metrics.render_prometheus("turbalance_collector") + "\n"

    return app


def _record_write_result(stats: CollectorStats, result: dict[str, Any]) -> None:
    if result.get("status") == "written":
        stats.accepted_batches += 1
        stats.written_rows += int(result.get("rowCount") or 0)
    elif result.get("status") == "quarantined":
        stats.quarantined_batches += 1
    else:
        stats.rejected_batches += 1


def _env_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


app = create_app()
