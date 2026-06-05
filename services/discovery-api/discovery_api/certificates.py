from __future__ import annotations

import hashlib
import json
import shlex
import subprocess
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID


@dataclass(frozen=True)
class CertificateBundle:
    certificate_pem: str
    ca_certificate_pem: str
    private_key_pem: str
    serial_number: str
    not_before: str
    not_after: str
    fingerprint_sha256: str


class LocalCertificateAuthority:
    def __init__(self, ca_dir: str | Path, *, common_name: str = "turbalance local telemetry CA") -> None:
        self.ca_dir = Path(ca_dir)
        self.common_name = common_name
        self.key_path = self.ca_dir / "ca.key.pem"
        self.cert_path = self.ca_dir / "ca.cert.pem"

    def issue_agent_certificate(
        self,
        *,
        agent_id: str,
        host_id: str,
        spiffe_id: str,
        csr_pem: str = "",
        public_key_pem: str = "",
        ttl_days: int = 30,
    ) -> CertificateBundle:
        ca_key, ca_cert = self._load_or_create()
        private_key_pem = ""
        if csr_pem.strip():
            csr = x509.load_pem_x509_csr(csr_pem.encode("utf-8"))
            public_key = csr.public_key()
        elif public_key_pem.strip():
            public_key = serialization.load_pem_public_key(public_key_pem.encode("utf-8"))
        else:
            private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
            public_key = private_key.public_key()
            private_key_pem = private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption(),
            ).decode("utf-8")

        now = datetime.now(timezone.utc)
        cert = (
            x509.CertificateBuilder()
            .subject_name(
                x509.Name(
                    [
                        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "turbalance"),
                        x509.NameAttribute(NameOID.COMMON_NAME, agent_id),
                    ]
                )
            )
            .issuer_name(ca_cert.subject)
            .public_key(public_key)
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(minutes=1))
            .not_valid_after(now + timedelta(days=max(1, ttl_days)))
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(
                x509.SubjectAlternativeName(
                    [
                        x509.UniformResourceIdentifier(spiffe_id),
                        x509.DNSName(_dns_safe(host_id)),
                        x509.DNSName(_dns_safe(agent_id)),
                    ]
                ),
                critical=False,
            )
            .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.CLIENT_AUTH]), critical=False)
            .sign(private_key=ca_key, algorithm=hashes.SHA256())
        )
        cert_pem = cert.public_bytes(serialization.Encoding.PEM).decode("utf-8")
        return CertificateBundle(
            certificate_pem=cert_pem,
            ca_certificate_pem=ca_cert.public_bytes(serialization.Encoding.PEM).decode("utf-8"),
            private_key_pem=private_key_pem,
            serial_number=str(cert.serial_number),
            not_before=cert.not_valid_before_utc.isoformat(),
            not_after=cert.not_valid_after_utc.isoformat(),
            fingerprint_sha256=hashlib.sha256(cert.public_bytes(serialization.Encoding.DER)).hexdigest(),
        )

    def _load_or_create(self):
        self.ca_dir.mkdir(parents=True, exist_ok=True)
        if self.key_path.exists() and self.cert_path.exists():
            key = serialization.load_pem_private_key(self.key_path.read_bytes(), password=None)
            cert = x509.load_pem_x509_certificate(self.cert_path.read_bytes())
            return key, cert

        key = rsa.generate_private_key(public_exponent=65537, key_size=4096)
        now = datetime.now(timezone.utc)
        subject = x509.Name(
            [
                x509.NameAttribute(NameOID.ORGANIZATION_NAME, "turbalance"),
                x509.NameAttribute(NameOID.COMMON_NAME, self.common_name),
            ]
        )
        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(subject)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(minutes=1))
            .not_valid_after(now + timedelta(days=3650))
            .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
            .add_extension(x509.KeyUsage(True, False, False, False, False, True, True, False, False), critical=True)
            .sign(private_key=key, algorithm=hashes.SHA256())
        )
        self.key_path.write_bytes(
            key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption(),
            )
        )
        self.cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        return key, cert


class ExternalCertificateAuthority:
    def __init__(self, command: str, *, timeout_seconds: float = 10.0) -> None:
        self.command = command
        self.timeout_seconds = timeout_seconds

    def issue_agent_certificate(
        self,
        *,
        agent_id: str,
        host_id: str,
        spiffe_id: str,
        csr_pem: str = "",
        public_key_pem: str = "",
        ttl_days: int = 30,
    ) -> CertificateBundle:
        if not self.command.strip():
            raise RuntimeError("external certificate mode requires TURBALANCE_DISCOVERY_EXTERNAL_CA_COMMAND")
        request = {
            "agentId": agent_id,
            "hostId": host_id,
            "spiffeId": spiffe_id,
            "csrPem": csr_pem,
            "publicKeyPem": public_key_pem,
            "ttlDays": ttl_days,
        }
        completed = subprocess.run(
            shlex.split(self.command),
            input=json.dumps(request, sort_keys=True),
            text=True,
            capture_output=True,
            timeout=self.timeout_seconds,
            check=False,
        )
        if completed.returncode != 0:
            reason = (completed.stderr or completed.stdout or f"external CA command exited {completed.returncode}").strip()
            raise RuntimeError(reason)
        response = json.loads(completed.stdout)
        certificate_pem = str(response.get("certificatePem") or "")
        fingerprint = str(response.get("fingerprintSha256") or "")
        if certificate_pem and not fingerprint:
            fingerprint = _certificate_fingerprint(certificate_pem)
        return CertificateBundle(
            certificate_pem=certificate_pem,
            ca_certificate_pem=str(response.get("caCertificatePem") or ""),
            private_key_pem=str(response.get("generatedPrivateKeyPem") or ""),
            serial_number=str(response.get("serialNumber") or ""),
            not_before=str(response.get("notBefore") or ""),
            not_after=str(response.get("notAfter") or ""),
            fingerprint_sha256=fingerprint,
        )


def _dns_safe(value: str) -> str:
    cleaned = "".join(char.lower() if char.isalnum() else "-" for char in value).strip("-")
    return cleaned[:63] or "unknown"


def _certificate_fingerprint(certificate_pem: str) -> str:
    cert = x509.load_pem_x509_certificate(certificate_pem.encode("utf-8"))
    return hashlib.sha256(cert.public_bytes(serialization.Encoding.DER)).hexdigest()
