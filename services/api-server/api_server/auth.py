from __future__ import annotations

import base64
import hmac
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable
from urllib.request import urlopen

from fastapi import HTTPException
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives import hashes


ROLE_RANK = {"viewer": 1, "operator": 2, "admin": 3}


@dataclass(frozen=True)
class Principal:
    subject: str
    role: str
    tenant_id: str = ""
    authenticated: bool = False


@dataclass(frozen=True)
class TokenRule:
    tenant_id: str
    token: str
    role: str = "viewer"
    subject: str = "api-token"


@dataclass(frozen=True)
class JwtSettings:
    jwks: dict[str, Any] | None = None
    issuer: str = ""
    audience: str = ""
    tenant_claim: str = "tenant_id"
    role_claim: str = "role"
    subject_claim: str = "sub"


class ApiAuthenticator:
    def __init__(
        self,
        *,
        require_auth: bool = False,
        token_rules: Iterable[TokenRule] = (),
        jwt_verifier: "JwtVerifier | None" = None,
    ) -> None:
        self.require_auth = require_auth
        self.token_rules = tuple(token_rules)
        self.jwt_verifier = jwt_verifier

    def require(self, authorization: str | None, minimum_role: str = "viewer") -> Principal:
        if not self.require_auth:
            return Principal(subject="anonymous", role="admin", authenticated=False)
        if not self.token_rules and self.jwt_verifier is None:
            raise HTTPException(status_code=503, detail="api auth is required but no tokens are configured")
        token = _bearer_token(authorization)
        if not token:
            raise HTTPException(status_code=401, detail="missing API bearer token")
        for rule in self.token_rules:
            if hmac.compare_digest(rule.token, token):
                role = _normalize_role(rule.role)
                if ROLE_RANK[role] < ROLE_RANK[_normalize_role(minimum_role)]:
                    raise HTTPException(status_code=403, detail="API token role is not permitted for this operation")
                return Principal(
                    subject=rule.subject or "api-token",
                    role=role,
                    tenant_id=rule.tenant_id,
                    authenticated=True,
                )
        if self.jwt_verifier is not None:
            principal = self.jwt_verifier.verify(token)
            if ROLE_RANK[principal.role] < ROLE_RANK[_normalize_role(minimum_role)]:
                raise HTTPException(status_code=403, detail="API token role is not permitted for this operation")
            return principal
        raise HTTPException(status_code=401, detail="invalid API bearer token")

    def scoped_tenant(self, principal: Principal, requested_tenant_id: str | None) -> str | None:
        if not self.require_auth:
            return requested_tenant_id
        if principal.role == "admin" or principal.tenant_id in {"", "*"}:
            return requested_tenant_id
        if requested_tenant_id and requested_tenant_id != principal.tenant_id:
            raise HTTPException(status_code=403, detail="API token cannot access the requested tenant")
        return principal.tenant_id


def load_token_rules(raw_tokens: str = "", tokens_file: str | Path | None = None) -> tuple[TokenRule, ...]:
    values: list[str] = []
    if raw_tokens.strip():
        values.extend(_split_token_entries(raw_tokens))
    if tokens_file:
        path = Path(tokens_file)
        if path.exists():
            values.extend(_split_token_entries(path.read_text(encoding="utf-8")))
    return tuple(_parse_token_rule(value) for value in values if value.strip())


class JwtVerifier:
    def __init__(self, settings: JwtSettings) -> None:
        if not settings.jwks:
            raise ValueError("JWT verifier requires JWKS")
        self.settings = settings
        self.keys = {key.get("kid", ""): key for key in settings.jwks.get("keys", []) if key.get("kty") == "RSA"}

    def verify(self, token: str) -> Principal:
        try:
            header_b64, payload_b64, signature_b64 = token.split(".", 2)
            header = json.loads(_b64url_decode(header_b64))
            payload = json.loads(_b64url_decode(payload_b64))
            signature = _b64url_decode(signature_b64)
            signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
            if header.get("alg") != "RS256":
                raise ValueError("unsupported JWT alg")
            key = self.keys.get(header.get("kid", ""))
            if key is None:
                raise ValueError("unknown JWT kid")
            _rsa_public_key(key).verify(signature, signing_input, padding.PKCS1v15(), hashes.SHA256())
            self._validate_claims(payload)
            role = _role_from_claim(payload.get(self.settings.role_claim))
            return Principal(
                subject=str(payload.get(self.settings.subject_claim) or "jwt-subject"),
                role=role,
                tenant_id=str(payload.get(self.settings.tenant_claim) or ""),
                authenticated=True,
            )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=401, detail=f"invalid API JWT: {exc}") from exc

    def _validate_claims(self, payload: dict[str, Any]) -> None:
        now = int(time.time())
        if "exp" in payload and int(payload["exp"]) < now:
            raise ValueError("JWT is expired")
        if "nbf" in payload and int(payload["nbf"]) > now:
            raise ValueError("JWT is not yet valid")
        if self.settings.issuer and payload.get("iss") != self.settings.issuer:
            raise ValueError("JWT issuer mismatch")
        if self.settings.audience and not _audience_matches(payload.get("aud"), self.settings.audience):
            raise ValueError("JWT audience mismatch")


def load_jwt_verifier(
    *,
    jwks_json: str = "",
    jwks_path: str | Path | None = None,
    jwks_url: str = "",
    issuer: str = "",
    audience: str = "",
    tenant_claim: str = "tenant_id",
    role_claim: str = "role",
    subject_claim: str = "sub",
) -> JwtVerifier | None:
    jwks = _load_jwks(jwks_json=jwks_json, jwks_path=jwks_path, jwks_url=jwks_url)
    if jwks is None:
        return None
    return JwtVerifier(
        JwtSettings(
            jwks=jwks,
            issuer=issuer,
            audience=audience,
            tenant_claim=tenant_claim,
            role_claim=role_claim,
            subject_claim=subject_claim,
        )
    )


def _parse_token_rule(value: str) -> TokenRule:
    parts = value.strip().split(":")
    if len(parts) < 2:
        raise ValueError("API token entries must use tenant:token[:role[:subject]]")
    tenant_id, token = parts[0], parts[1]
    if not tenant_id or not token:
        raise ValueError("API token entries require tenant and token")
    role = _normalize_role(parts[2] if len(parts) > 2 and parts[2] else "viewer")
    subject = parts[3] if len(parts) > 3 and parts[3] else f"{tenant_id}:{role}"
    return TokenRule(tenant_id=tenant_id, token=token, role=role, subject=subject)


def _split_token_entries(value: str) -> list[str]:
    return [entry.strip() for entry in value.replace("\n", ",").split(",") if entry.strip()]


def _bearer_token(authorization: str | None) -> str:
    if not authorization:
        return ""
    prefix = "Bearer "
    if not authorization.startswith(prefix):
        return ""
    return authorization[len(prefix) :].strip()


def _normalize_role(role: str) -> str:
    normalized = role.strip().lower()
    if normalized not in ROLE_RANK:
        raise ValueError(f"unsupported API role {role!r}")
    return normalized


def _role_from_claim(value: Any) -> str:
    if isinstance(value, list):
        for entry in value:
            try:
                return _normalize_role(str(entry))
            except ValueError:
                continue
        return "viewer"
    if value is None:
        return "viewer"
    return _normalize_role(str(value))


def _load_jwks(*, jwks_json: str, jwks_path: str | Path | None, jwks_url: str) -> dict[str, Any] | None:
    if jwks_json.strip():
        return json.loads(jwks_json)
    if jwks_path:
        path = Path(jwks_path)
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    if jwks_url:
        with urlopen(jwks_url, timeout=5) as response:
            return json.loads(response.read().decode("utf-8"))
    return None


def _b64url_decode(value: str) -> bytes:
    padded = value + "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def _rsa_public_key(key: dict[str, Any]):
    n = int.from_bytes(_b64url_decode(key["n"]), "big")
    e = int.from_bytes(_b64url_decode(key["e"]), "big")
    return rsa.RSAPublicNumbers(e, n).public_key()


def _audience_matches(value: Any, expected: str) -> bool:
    if isinstance(value, list):
        return expected in value
    return value == expected
