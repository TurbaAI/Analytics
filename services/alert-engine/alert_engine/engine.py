from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


class AlertEngine:
    def __init__(self, lake_query: Any) -> None:
        self.lake_query = lake_query

    def evaluate(self, *, tenant_id: str | None = None) -> list[dict[str, Any]]:
        resources = self.lake_query.resource_pressure(tenant_id=tenant_id)
        covariance = self.lake_query.covariance(tenant_id=tenant_id)
        principal = self.lake_query.principal_mode(tenant_id=tenant_id)
        alerts: list[dict[str, Any]] = []
        latest_by_host: dict[str, dict[str, Any]] = {}

        for sample in resources:
            host_id = sample.get("host_id") or "unknown-host"
            latest_by_host[host_id] = sample

        for host_id, sample in latest_by_host.items():
            gpu = _number(sample.get("gpu"))
            network = _number(sample.get("network"))
            cpu = _number(sample.get("cpu"))
            ram = _number(sample.get("ram"))
            if network is not None and network >= 70 and (gpu is None or gpu < 55):
                alerts.append(
                    _alert(
                        key=f"{host_id}:network-gpu-starvation",
                        severity="warning",
                        title="Network pressure with weak GPU utilization",
                        confidence=0.74,
                        evidence=f"Network utilization is {network:.1f}% while GPU utilization is {gpu if gpu is not None else 'unavailable'}.",
                        owner="platform-network",
                    )
                )
            if cpu is not None and cpu >= 80:
                alerts.append(
                    _alert(
                        key=f"{host_id}:cpu-pressure",
                        severity="warning",
                        title="CPU-side pressure may be limiting useful accelerator work",
                        confidence=0.68,
                        evidence=f"CPU pressure proxy is {cpu:.1f}%.",
                        owner="platform-runtime",
                    )
                )
            if ram is not None and ram >= 85:
                alerts.append(
                    _alert(
                        key=f"{host_id}:ram-pressure",
                        severity="warning",
                        title="RAM pressure is high",
                        confidence=0.7,
                        evidence=f"RAM usage is {ram:.1f}%.",
                        owner="platform-runtime",
                    )
                )

        for row in covariance.get("rows", []):
            left = row.get("metric")
            for cell in row.get("cells", []):
                right = cell.get("rightMetric") or cell.get("right_metric")
                correlation = _number(cell.get("correlation"))
                if left != right and correlation is not None and abs(correlation) >= 0.85:
                    alerts.append(
                        _alert(
                            key=f"covariance:{left}:{right}",
                            severity="info",
                            title="Strong resource coupling detected",
                            confidence=min(0.95, abs(correlation)),
                            evidence=f"{left} and {right or 'peer'} correlation is {correlation:.2f}.",
                            owner="capacity-engineering",
                        )
                    )

        explained = _number(principal.get("explainedPct"))
        if principal.get("status") == "ready" and explained is not None and explained >= 70:
            alerts.append(
                _alert(
                    key="principal-resource-mode:dominant",
                    severity="info",
                    title="Dominant principal resource mode",
                    confidence=min(0.95, explained / 100),
                    evidence=f"{principal.get('title')} explains {explained:.1f}% of rolling resource variance.",
                    owner="capacity-engineering",
                )
            )

        if hasattr(self.lake_query, "alert_candidates"):
            for candidate in self.lake_query.alert_candidates(tenant_id=tenant_id):
                alerts.append(
                    _alert(
                        key=str(candidate.get("incident_key") or candidate.get("incidentKey") or "alert-candidate"),
                        severity=str(candidate.get("severity") or "warning"),
                        title=str(candidate.get("title") or "Virtual sensor alert candidate"),
                        confidence=_number(candidate.get("confidence")) or 0.5,
                        evidence=str(candidate.get("evidence") or ""),
                        owner=str(candidate.get("owner") or "platform-runtime"),
                    )
                )

        return _dedupe(alerts)


def _alert(
    *,
    key: str,
    severity: str,
    title: str,
    confidence: float,
    evidence: str,
    owner: str,
) -> dict[str, Any]:
    return {
        "incidentKey": key,
        "severity": severity,
        "title": title,
        "confidence": round(max(0.0, min(1.0, confidence)), 3),
        "evidence": evidence,
        "owner": owner,
        "status": "open",
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
    }


def _dedupe(alerts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_key: dict[str, dict[str, Any]] = {}
    for alert in alerts:
        existing = by_key.get(alert["incidentKey"])
        if existing is None or alert["confidence"] > existing["confidence"]:
            by_key[alert["incidentKey"]] = alert
    return list(by_key.values())


def _number(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
