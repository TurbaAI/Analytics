from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import unquote


class ClientIdentityError(ValueError):
    pass


@dataclass(frozen=True)
class ClientIdentity:
    spiffe_id: str
    subject: str = ""
    fingerprint: str = ""


def client_identity_from_xfcc(header: str | None, *, trusted_spiffe_prefix: str) -> ClientIdentity:
    if not header:
        raise ClientIdentityError("missing x-forwarded-client-cert header")
    identities = parse_xfcc_header(header)
    for identity in identities:
        if identity.spiffe_id.startswith(trusted_spiffe_prefix):
            return identity
    raise ClientIdentityError("no trusted SPIFFE URI found in x-forwarded-client-cert header")


def parse_xfcc_header(header: str) -> list[ClientIdentity]:
    identities: list[ClientIdentity] = []
    for element in _split_quoted(header, ","):
        fields = _parse_xfcc_element(element)
        uri = fields.get("uri", "")
        if not uri:
            continue
        identities.append(
            ClientIdentity(
                spiffe_id=uri,
                subject=fields.get("subject", ""),
                fingerprint=fields.get("hash", "").lower(),
            )
        )
    return identities


def _parse_xfcc_element(element: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for part in _split_quoted(element, ";"):
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        key = key.strip().lower()
        value = value.strip()
        if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
            value = value[1:-1].replace(r"\"", '"').replace(r"\\", "\\")
        fields[key] = unquote(value)
    return fields


def _split_quoted(value: str, separator: str) -> list[str]:
    parts: list[str] = []
    current: list[str] = []
    in_quotes = False
    escaped = False
    for char in value:
        if escaped:
            current.append(char)
            escaped = False
            continue
        if char == "\\":
            current.append(char)
            escaped = True
            continue
        if char == '"':
            in_quotes = not in_quotes
            current.append(char)
            continue
        if char == separator and not in_quotes:
            piece = "".join(current).strip()
            if piece:
                parts.append(piece)
            current = []
            continue
        current.append(char)
    piece = "".join(current).strip()
    if piece:
        parts.append(piece)
    return parts
