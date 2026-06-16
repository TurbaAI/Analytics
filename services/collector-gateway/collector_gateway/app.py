from __future__ import annotations

import os
import sys
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

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
class CollectorCredential:
    tenant_id: str
    bearer_token: str
    hmac_secret: str
    subject: str = "collector"


@dataclass(frozen=True)
class CollectorPrincipal:
    tenant_id: str = ""
    subject: str = "legacy-collector"
    auth_method: str = "legacy"


@dataclass(frozen=True)
class CollectorSettings:
    lake_root: str | Path
    bearer_token: str = ""
    hmac_secret: str = ""
    tenant_credentials: tuple[CollectorCredential, ...] = ()
    tenant_credentials_file: Path | None = None
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
    product_version: str = "0.1.0"
    deployment_environment: str = "pilot"

    @classmethod
    def from_env(cls) -> "CollectorSettings":
        return cls(
            lake_root=os.environ.get("TURBALANCE_LAKE_ROOT", "build/lakehouse"),
            bearer_token=_secret_env("TURBALANCE_COLLECTOR_TOKEN", "TURBALANCE_COLLECTOR_TOKEN_FILE"),
            hmac_secret=_secret_env("TURBALANCE_COLLECTOR_HMAC_SECRET", "TURBALANCE_COLLECTOR_HMAC_SECRET_FILE"),
            tenant_credentials=load_collector_credentials(
                os.environ.get("TURBALANCE_COLLECTOR_TENANT_CREDENTIALS", ""),
                Path(os.environ["TURBALANCE_COLLECTOR_TENANT_CREDENTIALS_FILE"])
                if os.environ.get("TURBALANCE_COLLECTOR_TENANT_CREDENTIALS_FILE")
                else None,
            ),
            tenant_credentials_file=Path(os.environ["TURBALANCE_COLLECTOR_TENANT_CREDENTIALS_FILE"])
            if os.environ.get("TURBALANCE_COLLECTOR_TENANT_CREDENTIALS_FILE")
            else None,
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
            product_version=os.environ.get("TURBALANCE_PRODUCT_VERSION", "0.1.0"),
            deployment_environment=os.environ.get("TURBALANCE_DEPLOYMENT_ENVIRONMENT", "pilot"),
        )


class SourceBundleIngestRequest(BaseModel):
    tenantId: str = "demo-tenant"
    hostId: str = "source-bundle"
    agentId: str = "source-bundle-adapter"
    sequenceNo: int = 0
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
        self.report_rate_window_seconds = 60.0
        self._report_timestamps: deque[float] = deque()

    def render_prometheus(self) -> str:
        report_count, reports_per_second, reports_per_minute = self.report_rate_snapshot()
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
                "# HELP turbalance_collector_incoming_telemetry_reports_per_second Accepted telemetry reports per second over the rolling collector window.",
                "# TYPE turbalance_collector_incoming_telemetry_reports_per_second gauge",
                f"turbalance_collector_incoming_telemetry_reports_per_second {reports_per_second:.6f}",
                "# HELP turbalance_collector_incoming_telemetry_reports_per_minute Accepted telemetry reports per minute over the rolling collector window.",
                "# TYPE turbalance_collector_incoming_telemetry_reports_per_minute gauge",
                f"turbalance_collector_incoming_telemetry_reports_per_minute {reports_per_minute:.6f}",
                "# HELP turbalance_collector_incoming_telemetry_reports_window_count Accepted telemetry reports observed inside the rolling collector window.",
                "# TYPE turbalance_collector_incoming_telemetry_reports_window_count gauge",
                f"turbalance_collector_incoming_telemetry_reports_window_count {report_count}",
                "# HELP turbalance_collector_incoming_telemetry_reports_window_seconds Rolling window used for incoming telemetry report rate gauges.",
                "# TYPE turbalance_collector_incoming_telemetry_reports_window_seconds gauge",
                f"turbalance_collector_incoming_telemetry_reports_window_seconds {self.report_rate_window_seconds:g}",
                "",
            ]
        )

    def record_report(self, timestamp: float | None = None) -> None:
        observed_at = time.monotonic() if timestamp is None else timestamp
        self._report_timestamps.append(observed_at)
        self._prune_report_timestamps(observed_at)

    def report_rate_snapshot(self) -> tuple[int, float, float]:
        self._prune_report_timestamps()
        report_count = len(self._report_timestamps)
        reports_per_second = report_count / self.report_rate_window_seconds
        reports_per_minute = reports_per_second * 60.0
        return report_count, reports_per_second, reports_per_minute

    def _prune_report_timestamps(self, timestamp: float | None = None) -> None:
        observed_at = time.monotonic() if timestamp is None else timestamp
        cutoff = observed_at - self.report_rate_window_seconds
        while self._report_timestamps and self._report_timestamps[0] < cutoff:
            self._report_timestamps.popleft()


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
    ) -> tuple[bytes, CollectorPrincipal]:
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
            if not (settings.bearer_token or settings.hmac_secret or settings.tenant_credentials):
                return body, CollectorPrincipal(auth_method="mtls")
        if settings.tenant_credentials:
            principal = _authenticate_tenant_collector(
                settings.tenant_credentials,
                authorization=authorization,
                signature=signature,
                timestamp=timestamp,
                nonce=nonce,
                body=body,
            )
            if principal is None:
                stats.rejected_batches += 1
                stats.auth_failures += 1
                audit.write("invalid_tenant_credential", client=client)
                raise HTTPException(status_code=401, detail="invalid tenant collector credential")
            if nonce and not replay_store.check_and_record(nonce):
                stats.rejected_batches += 1
                stats.auth_failures += 1
                audit.write("replay_detected", client=client, nonce=nonce, tenantId=principal.tenant_id)
                raise HTTPException(status_code=409, detail="collector nonce has already been used")
            audit.write("tenant_credential_accepted", client=client, tenantId=principal.tenant_id, subject=principal.subject)
            return body, principal
        if settings.bearer_token:
            expected = f"Bearer {settings.bearer_token}"
            if authorization == expected:
                return body, CollectorPrincipal(auth_method="bearer")
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
            return body, CollectorPrincipal(auth_method="hmac")
        if settings.bearer_token:
            stats.rejected_batches += 1
            stats.auth_failures += 1
            audit.write("invalid_bearer", client=client)
            raise HTTPException(status_code=401, detail="invalid collector token")
        return body, CollectorPrincipal(auth_method="none")

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "version": settings.product_version}

    @app.get("/ready")
    async def ready() -> dict[str, Any]:
        if writer.storage.local_root is not None:
            writer.storage.local_root.mkdir(parents=True, exist_ok=True)
        else:
            writer.storage.fs.create_dir(writer.storage.base_path, recursive=True)
        return {
            "status": "ready",
            "lakeRoot": str(settings.lake_root),
            "backpressure": backpressure.snapshot(),
            "auth": {
                "bearerToken": bool(settings.bearer_token),
                "hmac": bool(settings.hmac_secret),
                "mtls": settings.require_mtls,
                "tenantCredentials": len(settings.tenant_credentials),
            },
            "version": settings.product_version,
        }

    @app.get("/version")
    async def version() -> dict[str, str]:
        return {
            "name": "turbalance-collector",
            "version": settings.product_version,
            "environment": settings.deployment_environment,
        }

    @app.post("/v1/telemetry/batches")
    async def ingest_batch(
        request: Request,
        authorization: str | None = Header(default=None),
        x_turbalance_signature: str | None = Header(default=None),
        x_turbalance_timestamp: str | None = Header(default=None),
        x_turbalance_nonce: str | None = Header(default=None),
        x_forwarded_client_cert: str | None = Header(default=None),
    ) -> dict[str, Any]:
        body, principal = await guard(
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
            _enforce_principal_tenant(principal, batch.tenant_id)
            result = writer.write_batch(batch)
            _record_write_result(stats, result)
            audit.write(
                "batch_ingested",
                batchId=result.get("batchId"),
                status=result.get("status"),
                rowCount=result.get("rowCount"),
                tenantId=batch.tenant_id,
                subject=principal.subject,
            )
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
        request_body, principal = await guard(
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
            _enforce_principal_tenant(principal, body.tenantId)
            result = writer.write_source_bundle(
                body.bundle,
                tenant_id=body.tenantId,
                host_id=body.hostId,
                agent_id=body.agentId,
                sequence_no=body.sequenceNo,
            )
            _record_write_result(stats, result)
            audit.write(
                "source_bundle_ingested",
                hostId=body.hostId,
                status=result.get("status"),
                rowCount=result.get("rowCount"),
                tenantId=body.tenantId,
                subject=principal.subject,
            )
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
        stats.record_report()
    elif result.get("status") == "quarantined":
        stats.quarantined_batches += 1
    else:
        stats.rejected_batches += 1


def load_collector_credentials(raw_credentials: str = "", credentials_file: str | Path | None = None) -> tuple[CollectorCredential, ...]:
    values: list[str] = []
    if raw_credentials.strip():
        values.extend(_split_credential_entries(raw_credentials))
    if credentials_file:
        path = Path(credentials_file)
        if path.exists():
            values.extend(_split_credential_entries(path.read_text(encoding="utf-8")))
    return tuple(_parse_collector_credential(value) for value in values if value.strip())


def _authenticate_tenant_collector(
    credentials: Iterable[CollectorCredential],
    *,
    authorization: str | None,
    signature: str | None,
    timestamp: str | None,
    nonce: str | None,
    body: bytes,
) -> CollectorPrincipal | None:
    for credential in credentials:
        if authorization != f"Bearer {credential.bearer_token}":
            continue
        if not (signature and timestamp and nonce):
            continue
        headers = SignatureHeaders(timestamp=timestamp, nonce=nonce, signature=signature)
        if not verify_signature(credential.hmac_secret, headers, body):
            continue
        return CollectorPrincipal(
            tenant_id=credential.tenant_id,
            subject=credential.subject,
            auth_method="tenant-credential",
        )
    return None


def _enforce_principal_tenant(principal: CollectorPrincipal, tenant_id: str) -> None:
    if not principal.tenant_id or principal.tenant_id == "*":
        return
    if tenant_id != principal.tenant_id:
        raise HTTPException(status_code=403, detail="collector credential cannot write the requested tenant")


def _parse_collector_credential(value: str) -> CollectorCredential:
    parts = value.strip().split(":")
    if len(parts) < 3:
        raise ValueError("collector tenant credential entries must use tenant:bearer-token:hmac-secret[:subject]")
    tenant_id, bearer_token, hmac_secret = parts[0], parts[1], parts[2]
    if not tenant_id or not bearer_token or not hmac_secret:
        raise ValueError("collector tenant credential entries require tenant, bearer token, and hmac secret")
    subject = parts[3] if len(parts) > 3 and parts[3] else f"{tenant_id}:collector"
    return CollectorCredential(tenant_id=tenant_id, bearer_token=bearer_token, hmac_secret=hmac_secret, subject=subject)


def _split_credential_entries(value: str) -> list[str]:
    return [entry.strip() for entry in value.replace("\n", ",").split(",") if entry.strip()]


def _env_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _secret_env(value_name: str, file_name: str) -> str:
    direct = os.environ.get(value_name, "")
    if direct:
        return direct
    file_path = os.environ.get(file_name, "")
    if not file_path:
        return ""
    try:
        return Path(file_path).read_text(encoding="utf-8").strip()
    except OSError:
        return ""


app = create_app()
