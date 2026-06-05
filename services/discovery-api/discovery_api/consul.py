from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ConsulMirrorResult:
    enabled: bool
    mirrored: bool
    error: str = ""


@dataclass(frozen=True)
class ConsulClient:
    base_url: str = ""
    token: str = ""
    kv_prefix: str = "turbalance/discovery"
    timeout_seconds: float = 2.0

    @property
    def enabled(self) -> bool:
        return bool(self.base_url.strip())

    def put_json(self, key: str, payload: dict[str, Any]) -> ConsulMirrorResult:
        if not self.enabled:
            return ConsulMirrorResult(enabled=False, mirrored=False)
        consul_key = "/".join(part.strip("/") for part in [self.kv_prefix, key] if part.strip("/"))
        url = f"{self.base_url.rstrip('/')}/v1/kv/{urllib.parse.quote(consul_key, safe='/')}"
        return self._request("PUT", url, json.dumps(payload, sort_keys=True).encode("utf-8"))

    def register_service(
        self,
        *,
        service_id: str,
        service_type: str,
        base_url: str,
        health_url: str,
        labels: dict[str, str],
    ) -> ConsulMirrorResult:
        if not self.enabled:
            return ConsulMirrorResult(enabled=False, mirrored=False)
        parsed = urllib.parse.urlparse(base_url)
        registration = {
            "ID": service_id,
            "Name": service_type,
            "Address": parsed.hostname or "",
            "Port": parsed.port or default_port(parsed.scheme),
            "Meta": {
                **labels,
                "baseUrl": base_url,
                "healthUrl": health_url,
                "source": "turbalance-discovery-api",
            },
        }
        if health_url:
            registration["Checks"] = [
                {
                    "HTTP": health_url,
                    "Interval": "30s",
                    "Timeout": "5s",
                    "DeregisterCriticalServiceAfter": "5m",
                }
            ]
        url = f"{self.base_url.rstrip('/')}/v1/agent/service/register"
        return self._request("PUT", url, json.dumps(registration, sort_keys=True).encode("utf-8"))

    def _request(self, method: str, url: str, body: bytes) -> ConsulMirrorResult:
        request = urllib.request.Request(url, data=body, method=method)
        request.add_header("Content-Type", "application/json")
        if self.token:
            request.add_header("X-Consul-Token", self.token)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                return ConsulMirrorResult(enabled=True, mirrored=200 <= response.status < 300)
        except (urllib.error.URLError, TimeoutError) as exc:
            return ConsulMirrorResult(enabled=True, mirrored=False, error=str(exc))


def default_port(scheme: str) -> int:
    if scheme == "https":
        return 443
    return 80
