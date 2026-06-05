from __future__ import annotations

import json
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import PlainTextResponse
from platform_common import HttpRequestMetrics, install_request_observability
from pydantic import BaseModel, Field

from .certificates import CertificateBundle, ExternalCertificateAuthority, LocalCertificateAuthority
from .consul import ConsulClient
from .store import MetadataStore, create_metadata_store


@dataclass(frozen=True)
class DiscoverySettings:
    db_path: Path
    database_url: str = ""
    enrollment_token: str = ""
    trust_domain: str = "turbalance.local"
    ca_dir: Path = Path("build/discovery/ca")
    certificate_ttl_days: int = 30
    certificate_mode: str = "local-ca"
    external_ca_command: str = ""
    external_ca_timeout_seconds: float = 10.0
    consul_url: str = ""
    consul_token: str = ""
    consul_kv_prefix: str = "turbalance/discovery"
    consul_timeout_seconds: float = 2.0
    service_name: str = "discovery-api"

    @classmethod
    def from_env(cls) -> "DiscoverySettings":
        return cls(
            db_path=Path(os.environ.get("TURBALANCE_DISCOVERY_DB", "build/discovery/catalog.sqlite")),
            database_url=os.environ.get("TURBALANCE_DISCOVERY_DATABASE_URL") or os.environ.get("TURBALANCE_POSTGRES_URL", ""),
            enrollment_token=os.environ.get("TURBALANCE_DISCOVERY_ENROLLMENT_TOKEN", ""),
            trust_domain=os.environ.get("TURBALANCE_TRUST_DOMAIN", "turbalance.local"),
            ca_dir=Path(os.environ.get("TURBALANCE_DISCOVERY_CA_DIR", "build/discovery/ca")),
            certificate_ttl_days=int(os.environ.get("TURBALANCE_AGENT_CERT_TTL_DAYS", "30")),
            certificate_mode=os.environ.get("TURBALANCE_DISCOVERY_CERTIFICATE_MODE", "local-ca"),
            external_ca_command=os.environ.get("TURBALANCE_DISCOVERY_EXTERNAL_CA_COMMAND", ""),
            external_ca_timeout_seconds=float(os.environ.get("TURBALANCE_DISCOVERY_EXTERNAL_CA_TIMEOUT_SECONDS", "10")),
            consul_url=os.environ.get("TURBALANCE_CONSUL_URL", ""),
            consul_token=os.environ.get("TURBALANCE_CONSUL_TOKEN", ""),
            consul_kv_prefix=os.environ.get("TURBALANCE_CONSUL_KV_PREFIX", "turbalance/discovery"),
            consul_timeout_seconds=float(os.environ.get("TURBALANCE_CONSUL_TIMEOUT_SECONDS", "2")),
            service_name=os.environ.get("TURBALANCE_OTEL_SERVICE_NAME", "discovery-api"),
        )


class HostRegistration(BaseModel):
    hostId: str
    hostname: str = ""
    agentId: str
    capabilities: dict[str, Any] = Field(default_factory=dict)
    labels: dict[str, str] = Field(default_factory=dict)


class ServiceRegistration(BaseModel):
    serviceId: str
    serviceType: str
    baseUrl: str
    healthUrl: str = ""
    labels: dict[str, str] = Field(default_factory=dict)


class AgentEnrollment(BaseModel):
    hostId: str
    hostname: str = ""
    agentId: str = ""
    capabilities: dict[str, Any] = Field(default_factory=dict)
    labels: dict[str, str] = Field(default_factory=dict)
    publicKeyPem: str = ""
    certificateSigningRequestPem: str = ""


class AgentCertificateRotation(BaseModel):
    publicKeyPem: str = ""
    certificateSigningRequestPem: str = ""
    ttlDays: int | None = None


def create_app(settings: DiscoverySettings | None = None) -> FastAPI:
    settings = settings or DiscoverySettings.from_env()
    store = create_metadata_store(settings.database_url, settings.db_path)
    store.init_schema()
    certificate_mode = _certificate_mode(settings.certificate_mode)
    ca = _certificate_issuer(settings, certificate_mode)
    consul = ConsulClient(
        base_url=settings.consul_url,
        token=settings.consul_token,
        kv_prefix=settings.consul_kv_prefix,
        timeout_seconds=settings.consul_timeout_seconds,
    )
    app = FastAPI(title="turbalance discovery API", version="0.1.0")
    request_metrics = HttpRequestMetrics(service_name=settings.service_name)
    install_request_observability(app, request_metrics)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/ready")
    async def ready() -> dict[str, str]:
        return {
            "status": "ready",
            "metadataBackend": store.backend,
            "certificateMode": certificate_mode,
            "consulMode": "mirror" if consul.enabled else "disabled",
        }

    @app.get("/metrics", response_class=PlainTextResponse)
    async def metrics() -> str:
        base_metrics = "\n".join(
            [
                "# HELP turbalance_discovery_up Discovery API health gauge.",
                "# TYPE turbalance_discovery_up gauge",
                "turbalance_discovery_up 1",
                "# HELP turbalance_discovery_metadata_backend_info Discovery metadata backend label.",
                "# TYPE turbalance_discovery_metadata_backend_info gauge",
                f'turbalance_discovery_metadata_backend_info{{backend="{store.backend}"}} 1',
                "# HELP turbalance_discovery_certificate_mode_info Discovery certificate mode label.",
                "# TYPE turbalance_discovery_certificate_mode_info gauge",
                f'turbalance_discovery_certificate_mode_info{{mode="{certificate_mode}"}} 1',
                "# HELP turbalance_discovery_consul_enabled Discovery Consul mirror enabled gauge.",
                "# TYPE turbalance_discovery_consul_enabled gauge",
                f"turbalance_discovery_consul_enabled {1 if consul.enabled else 0}",
                "",
            ]
        )
        return base_metrics + request_metrics.render_prometheus("turbalance_discovery") + "\n"

    @app.post("/v1/hosts")
    async def register_host(body: HostRegistration) -> dict[str, Any]:
        now = _now()
        with store.connect() as db:
            db.execute(
                """
                insert into hosts(host_id, hostname, agent_id, capabilities_json, labels_json, last_seen_at)
                values (?, ?, ?, ?, ?, ?)
                on conflict(host_id) do update set
                  hostname=excluded.hostname,
                  agent_id=excluded.agent_id,
                  capabilities_json=excluded.capabilities_json,
                  labels_json=excluded.labels_json,
                  last_seen_at=excluded.last_seen_at
                """,
                (
                    body.hostId,
                    body.hostname,
                    body.agentId,
                    json.dumps(body.capabilities, sort_keys=True),
                    json.dumps(body.labels, sort_keys=True),
                    now,
                ),
            )
        mirror = consul.put_json(
            f"hosts/{body.hostId}",
            {
                "hostId": body.hostId,
                "hostname": body.hostname,
                "agentId": body.agentId,
                "capabilities": body.capabilities,
                "labels": body.labels,
                "lastSeenAt": now,
            },
        )
        return {
            "status": "registered",
            "hostId": body.hostId,
            "lastSeenAt": now,
            "consulMirrored": mirror.mirrored,
            "consulError": mirror.error,
        }

    @app.post("/v1/agents/enroll")
    async def enroll_agent(
        body: AgentEnrollment,
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        _require_enrollment_token(settings, authorization)
        now = _now()
        agent_id = body.agentId or f"agent-{uuid.uuid4()}"
        spiffe_id = _spiffe_id(settings.trust_domain, body.hostId, agent_id)
        cert_secret = f"turbalance-agent-{_kubernetes_name(agent_id)}-mtls"
        certificate = _issue_certificate(
            ca,
            mode=certificate_mode,
            agent_id=agent_id,
            host_id=body.hostId,
            spiffe_id=spiffe_id,
            csr_pem=body.certificateSigningRequestPem,
            public_key_pem=body.publicKeyPem,
            ttl_days=settings.certificate_ttl_days,
        )
        certificate_status = "external" if certificate_mode == "spire" else "active"
        with store.connect() as db:
            db.execute(
                """
                insert into agents(
                  agent_id,
                  host_id,
                  hostname,
                  public_key_pem,
                  certificate_signing_request_pem,
                  spiffe_id,
                  client_cert_secret_name,
                  capabilities_json,
                  labels_json,
                  status,
                  enrolled_at,
                  last_seen_at,
                  certificate_pem,
                  ca_certificate_pem,
                  generated_private_key_pem,
                  certificate_serial,
                  certificate_not_before,
                  certificate_not_after,
                  certificate_fingerprint_sha256,
                  certificate_status
                )
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                on conflict(agent_id) do update set
                  host_id=excluded.host_id,
                  hostname=excluded.hostname,
                  public_key_pem=excluded.public_key_pem,
                  certificate_signing_request_pem=excluded.certificate_signing_request_pem,
                  spiffe_id=excluded.spiffe_id,
                  client_cert_secret_name=excluded.client_cert_secret_name,
                  capabilities_json=excluded.capabilities_json,
                  labels_json=excluded.labels_json,
                  status=excluded.status,
                  last_seen_at=excluded.last_seen_at,
                  certificate_pem=excluded.certificate_pem,
                  ca_certificate_pem=excluded.ca_certificate_pem,
                  generated_private_key_pem=excluded.generated_private_key_pem,
                  certificate_serial=excluded.certificate_serial,
                  certificate_not_before=excluded.certificate_not_before,
                  certificate_not_after=excluded.certificate_not_after,
                  certificate_fingerprint_sha256=excluded.certificate_fingerprint_sha256,
                  certificate_status=excluded.certificate_status
                """,
                (
                    agent_id,
                    body.hostId,
                    body.hostname,
                    body.publicKeyPem,
                    body.certificateSigningRequestPem,
                    spiffe_id,
                    cert_secret,
                    json.dumps(body.capabilities, sort_keys=True),
                    json.dumps(body.labels, sort_keys=True),
                    "enrolled",
                    now,
                    now,
                    certificate.certificate_pem,
                    certificate.ca_certificate_pem,
                    certificate.private_key_pem,
                    certificate.serial_number,
                    certificate.not_before,
                    certificate.not_after,
                    certificate.fingerprint_sha256,
                    certificate_status,
                ),
            )
            db.execute(
                """
                insert into hosts(host_id, hostname, agent_id, capabilities_json, labels_json, last_seen_at)
                values (?, ?, ?, ?, ?, ?)
                on conflict(host_id) do update set
                  hostname=excluded.hostname,
                  agent_id=excluded.agent_id,
                  capabilities_json=excluded.capabilities_json,
                  labels_json=excluded.labels_json,
                  last_seen_at=excluded.last_seen_at
                """,
                (
                    body.hostId,
                    body.hostname,
                    agent_id,
                    json.dumps(body.capabilities, sort_keys=True),
                    json.dumps(body.labels, sort_keys=True),
                    now,
                ),
            )
        mirror = consul.put_json(
            f"agents/{agent_id}",
            {
                "agentId": agent_id,
                "hostId": body.hostId,
                "hostname": body.hostname,
                "spiffeId": spiffe_id,
                "capabilities": body.capabilities,
                "labels": body.labels,
                "certificateStatus": certificate_status,
                "lastSeenAt": now,
            },
        )
        return {
            "status": "enrolled",
            "agentId": agent_id,
            "hostId": body.hostId,
            "spiffeId": spiffe_id,
            "clientCertSecretName": cert_secret,
            "mtlsMode": _mtls_mode(certificate_mode),
            "certificate": _certificate_response(certificate, status=certificate_status),
            "lastSeenAt": now,
            "consulMirrored": mirror.mirrored,
            "consulError": mirror.error,
        }

    @app.get("/v1/agents")
    async def agents() -> dict[str, Any]:
        with store.connect() as db:
            rows = db.execute("select * from agents order by host_id, agent_id").fetchall()
        return {"agents": [_agent_row(row) for row in rows]}

    @app.get("/v1/agents/{agent_id}/identity")
    async def agent_identity(agent_id: str) -> dict[str, Any]:
        with store.connect() as db:
            row = db.execute("select * from agents where agent_id = ?", (agent_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="agent identity not found")
        agent = _agent_row(row)
        return {
            "agentId": agent["agentId"],
            "hostId": agent["hostId"],
            "status": agent["status"],
            "spiffeId": agent["spiffeId"],
            "clientCertSecretName": agent["clientCertSecretName"],
            "mtlsMode": _mtls_mode(certificate_mode),
            "certificateStatus": agent["certificateStatus"],
            "certificateNotAfter": agent["certificateNotAfter"],
            "certificateFingerprintSha256": agent["certificateFingerprintSha256"],
            "lastSeenAt": agent["lastSeenAt"],
        }

    @app.post("/v1/agents/{agent_id}/certificates/rotate")
    async def rotate_agent_certificate(
        agent_id: str,
        body: AgentCertificateRotation,
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        _require_enrollment_token(settings, authorization)
        if certificate_mode == "spire":
            raise HTTPException(status_code=409, detail="certificate rotation is managed by SPIRE/SVID outside discovery-api")
        with store.connect() as db:
            row = db.execute("select * from agents where agent_id = ?", (agent_id,)).fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="agent identity not found")
            agent = _agent_row(row)
            certificate = _issue_certificate(
                ca,
                mode=certificate_mode,
                agent_id=agent_id,
                host_id=agent["hostId"],
                spiffe_id=agent["spiffeId"],
                csr_pem=body.certificateSigningRequestPem or agent["certificateSigningRequestPem"],
                public_key_pem=body.publicKeyPem or agent["publicKeyPem"],
                ttl_days=body.ttlDays or settings.certificate_ttl_days,
            )
            db.execute(
                """
                update agents
                set certificate_pem = ?,
                    ca_certificate_pem = ?,
                    generated_private_key_pem = ?,
                    certificate_serial = ?,
                    certificate_not_before = ?,
                    certificate_not_after = ?,
                    certificate_fingerprint_sha256 = ?,
                    certificate_status = ?,
                    last_seen_at = ?
                where agent_id = ?
                """,
                (
                    certificate.certificate_pem,
                    certificate.ca_certificate_pem,
                    certificate.private_key_pem,
                    certificate.serial_number,
                    certificate.not_before,
                    certificate.not_after,
                    certificate.fingerprint_sha256,
                    "active",
                    _now(),
                    agent_id,
                ),
            )
        return {"status": "rotated", "agentId": agent_id, "mtlsMode": _mtls_mode(certificate_mode), "certificate": _certificate_response(certificate)}

    @app.post("/v1/agents/{agent_id}/certificates/revoke")
    async def revoke_agent_certificate(agent_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
        _require_enrollment_token(settings, authorization)
        with store.connect() as db:
            row = db.execute("select * from agents where agent_id = ?", (agent_id,)).fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="agent identity not found")
            db.execute(
                "update agents set certificate_status = ?, status = ?, last_seen_at = ? where agent_id = ?",
                ("revoked", "certificate_revoked", _now(), agent_id),
            )
        return {"status": "revoked", "agentId": agent_id}

    @get_hosts(app, store)
    async def _hosts() -> None:
        return None

    @app.post("/v1/services")
    async def register_service(body: ServiceRegistration) -> dict[str, Any]:
        now = _now()
        with store.connect() as db:
            db.execute(
                """
                insert into services(service_id, service_type, base_url, health_url, labels_json, last_seen_at)
                values (?, ?, ?, ?, ?, ?)
                on conflict(service_id) do update set
                  service_type=excluded.service_type,
                  base_url=excluded.base_url,
                  health_url=excluded.health_url,
                  labels_json=excluded.labels_json,
                  last_seen_at=excluded.last_seen_at
                """,
                (
                    body.serviceId,
                    body.serviceType,
                    body.baseUrl,
                    body.healthUrl,
                    json.dumps(body.labels, sort_keys=True),
                    now,
                ),
            )
        service_mirror = consul.register_service(
            service_id=body.serviceId,
            service_type=body.serviceType,
            base_url=body.baseUrl,
            health_url=body.healthUrl,
            labels=body.labels,
        )
        kv_mirror = consul.put_json(
            f"services/{body.serviceId}",
            {
                "serviceId": body.serviceId,
                "serviceType": body.serviceType,
                "baseUrl": body.baseUrl,
                "healthUrl": body.healthUrl,
                "labels": body.labels,
                "lastSeenAt": now,
            },
        )
        return {
            "status": "registered",
            "serviceId": body.serviceId,
            "lastSeenAt": now,
            "consulMirrored": service_mirror.mirrored and kv_mirror.mirrored,
            "consulError": service_mirror.error or kv_mirror.error,
        }

    @app.get("/v1/services")
    async def services() -> dict[str, Any]:
        with store.connect() as db:
            rows = db.execute("select * from services order by service_type, service_id").fetchall()
        return {"services": [_service_row(row) for row in rows]}

    return app


def get_hosts(app: FastAPI, store: MetadataStore):
    def decorator(_fn):
        @app.get("/v1/hosts")
        async def hosts() -> dict[str, Any]:
            with store.connect() as db:
                rows = db.execute("select * from hosts order by host_id").fetchall()
            return {"hosts": [_host_row(row) for row in rows]}

        return hosts

    return decorator


def _host_row(row: Any) -> dict[str, Any]:
    return {
        "hostId": row["host_id"],
        "hostname": row["hostname"],
        "agentId": row["agent_id"],
        "capabilities": json.loads(row["capabilities_json"]),
        "labels": json.loads(row["labels_json"]),
        "lastSeenAt": row["last_seen_at"],
    }


def _service_row(row: Any) -> dict[str, Any]:
    return {
        "serviceId": row["service_id"],
        "serviceType": row["service_type"],
        "baseUrl": row["base_url"],
        "healthUrl": row["health_url"],
        "labels": json.loads(row["labels_json"]),
        "lastSeenAt": row["last_seen_at"],
    }


def _agent_row(row: Any) -> dict[str, Any]:
    return {
        "agentId": row["agent_id"],
        "hostId": row["host_id"],
        "hostname": row["hostname"],
        "publicKeyPem": row["public_key_pem"],
        "certificateSigningRequestPem": row["certificate_signing_request_pem"],
        "spiffeId": row["spiffe_id"],
        "clientCertSecretName": row["client_cert_secret_name"],
        "capabilities": json.loads(row["capabilities_json"]),
        "labels": json.loads(row["labels_json"]),
        "status": row["status"],
        "enrolledAt": row["enrolled_at"],
        "lastSeenAt": row["last_seen_at"],
        "certificatePem": row["certificate_pem"],
        "caCertificatePem": row["ca_certificate_pem"],
        "generatedPrivateKeyPem": row["generated_private_key_pem"],
        "certificateSerial": row["certificate_serial"],
        "certificateNotBefore": row["certificate_not_before"],
        "certificateNotAfter": row["certificate_not_after"],
        "certificateFingerprintSha256": row["certificate_fingerprint_sha256"],
        "certificateStatus": row["certificate_status"],
    }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _require_enrollment_token(settings: DiscoverySettings, authorization: str | None) -> None:
    if not settings.enrollment_token:
        return
    if authorization != f"Bearer {settings.enrollment_token}":
        raise HTTPException(status_code=401, detail="invalid enrollment token")


def _spiffe_id(trust_domain: str, host_id: str, agent_id: str) -> str:
    return f"spiffe://{_slug(trust_domain)}/host/{_slug(host_id)}/agent/{_slug(agent_id)}"


def _slug(value: str) -> str:
    return "".join(char if char.isalnum() or char in ("-", "_", ".") else "-" for char in value).strip("-") or "unknown"


def _kubernetes_name(value: str) -> str:
    cleaned = "".join(char.lower() if char.isalnum() else "-" for char in value)
    return cleaned.strip("-")[:48] or "unknown"


def _certificate_mode(value: str) -> str:
    normalized = value.strip().lower().replace("_", "-")
    if normalized in {"", "local", "local-ca", "dev-ca"}:
        return "local-ca"
    if normalized in {"spire", "svid", "spire-svid"}:
        return "spire"
    if normalized in {"external", "external-ca", "vault", "cert-manager"}:
        return "external-ca"
    raise ValueError(f"unsupported discovery certificate mode {value!r}")


def _certificate_issuer(settings: DiscoverySettings, mode: str):
    if mode == "local-ca":
        return LocalCertificateAuthority(settings.ca_dir)
    if mode == "external-ca":
        return ExternalCertificateAuthority(
            settings.external_ca_command,
            timeout_seconds=settings.external_ca_timeout_seconds,
        )
    return None


def _issue_certificate(
    issuer: Any,
    *,
    mode: str,
    agent_id: str,
    host_id: str,
    spiffe_id: str,
    csr_pem: str = "",
    public_key_pem: str = "",
    ttl_days: int = 30,
) -> CertificateBundle:
    if mode == "spire":
        return CertificateBundle(
            certificate_pem="",
            ca_certificate_pem="",
            private_key_pem="",
            serial_number="spire-managed",
            not_before="",
            not_after="",
            fingerprint_sha256="",
        )
    if issuer is None:
        raise RuntimeError(f"certificate mode {mode!r} does not have an issuer")
    return issuer.issue_agent_certificate(
        agent_id=agent_id,
        host_id=host_id,
        spiffe_id=spiffe_id,
        csr_pem=csr_pem,
        public_key_pem=public_key_pem,
        ttl_days=ttl_days,
    )


def _mtls_mode(mode: str) -> str:
    if mode == "local-ca":
        return "issued-local-ca"
    if mode == "external-ca":
        return "issued-external-ca"
    return "spire-svid"


def _certificate_response(certificate: CertificateBundle, *, status: str = "active") -> dict[str, str]:
    return {
        "certificatePem": certificate.certificate_pem,
        "caCertificatePem": certificate.ca_certificate_pem,
        "generatedPrivateKeyPem": certificate.private_key_pem,
        "serialNumber": certificate.serial_number,
        "notBefore": certificate.not_before,
        "notAfter": certificate.not_after,
        "fingerprintSha256": certificate.fingerprint_sha256,
        "status": status,
    }

app = create_app()
