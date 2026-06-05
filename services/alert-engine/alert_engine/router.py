from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import request


@dataclass(frozen=True)
class AlertRouteResult:
    route: str
    delivered: bool
    count: int
    destination: str = ""
    reason: str = ""


class AlertRouter:
    def __init__(
        self,
        *,
        webhook_url: str = "",
        slack_webhook_url: str = "",
        pagerduty_routing_key: str = "",
        dry_run_path: str | Path | None = None,
        timeout_seconds: float = 2.0,
    ) -> None:
        self.webhook_url = webhook_url
        self.slack_webhook_url = slack_webhook_url
        self.pagerduty_routing_key = pagerduty_routing_key
        self.dry_run_path = Path(dry_run_path) if dry_run_path else None
        self.timeout_seconds = timeout_seconds
        self._sent_keys: set[tuple[str, str]] = set()

    @classmethod
    def from_env(cls) -> "AlertRouter":
        return cls(
            webhook_url=os.environ.get("TURBALANCE_ALERT_WEBHOOK_URL", ""),
            slack_webhook_url=os.environ.get("TURBALANCE_ALERT_SLACK_WEBHOOK_URL", ""),
            pagerduty_routing_key=os.environ.get("TURBALANCE_ALERT_PAGERDUTY_ROUTING_KEY", ""),
            dry_run_path=os.environ.get("TURBALANCE_ALERT_DRY_RUN_PATH", ""),
            timeout_seconds=float(os.environ.get("TURBALANCE_ALERT_ROUTE_TIMEOUT_SECONDS", "2")),
        )

    def dispatch(self, alerts: list[dict[str, Any]]) -> list[AlertRouteResult]:
        open_alerts = [alert for alert in alerts if alert.get("status") == "open"]
        if not open_alerts:
            return []
        results: list[AlertRouteResult] = []
        if self.dry_run_path:
            results.append(self._write_dry_run(open_alerts))
        if self.webhook_url:
            results.append(self._post_json("webhook", self.webhook_url, _webhook_payload(open_alerts)))
        if self.slack_webhook_url:
            results.append(self._post_json("slack", self.slack_webhook_url, _slack_payload(open_alerts)))
        if self.pagerduty_routing_key:
            results.extend(self._send_pagerduty(open_alerts))
        return results

    def _write_dry_run(self, alerts: list[dict[str, Any]]) -> AlertRouteResult:
        assert self.dry_run_path is not None
        self.dry_run_path.parent.mkdir(parents=True, exist_ok=True)
        delivered = 0
        with self.dry_run_path.open("a", encoding="utf-8") as handle:
            for alert in alerts:
                key = ("dry-run", str(alert.get("incidentKey")))
                if key in self._sent_keys:
                    continue
                self._sent_keys.add(key)
                delivered += 1
                handle.write(json.dumps(_webhook_payload([alert]), sort_keys=True) + "\n")
        return AlertRouteResult(route="dry-run", delivered=True, count=delivered, destination=str(self.dry_run_path))

    def _post_json(self, route: str, url: str, payload: dict[str, Any]) -> AlertRouteResult:
        alert_keys = tuple(str(alert.get("incidentKey")) for alert in payload.get("alerts", []))
        if alert_keys and all((route, key) in self._sent_keys for key in alert_keys):
            return AlertRouteResult(route=route, delivered=True, count=0, destination=url, reason="deduped")
        body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        req = request.Request(url, data=body, headers={"content-type": "application/json"}, method="POST")
        try:
            with request.urlopen(req, timeout=self.timeout_seconds) as response:
                delivered = 200 <= response.status < 300
        except Exception as exc:
            return AlertRouteResult(route=route, delivered=False, count=0, destination=url, reason=str(exc))
        if delivered:
            for key in alert_keys:
                self._sent_keys.add((route, key))
        return AlertRouteResult(route=route, delivered=delivered, count=len(alert_keys), destination=url)

    def _send_pagerduty(self, alerts: list[dict[str, Any]]) -> list[AlertRouteResult]:
        results: list[AlertRouteResult] = []
        for alert in alerts:
            key = str(alert.get("incidentKey"))
            if ("pagerduty", key) in self._sent_keys:
                results.append(AlertRouteResult(route="pagerduty", delivered=True, count=0, reason="deduped"))
                continue
            payload = _pagerduty_payload(alert, self.pagerduty_routing_key)
            result = self._post_json("pagerduty", "https://events.pagerduty.com/v2/enqueue", payload)
            if result.delivered:
                self._sent_keys.add(("pagerduty", key))
            results.append(result)
        return results


def _webhook_payload(alerts: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "type": "turbalance.alerts",
        "sentAt": datetime.now(timezone.utc).isoformat(),
        "alerts": alerts,
    }


def _slack_payload(alerts: list[dict[str, Any]]) -> dict[str, Any]:
    lines = [
        f"*{alert.get('severity', 'warning').upper()}* `{alert.get('incidentKey')}`: {alert.get('title')}"
        for alert in alerts
    ]
    return {"text": "turbalance alerts\n" + "\n".join(lines)}


def _pagerduty_payload(alert: dict[str, Any], routing_key: str) -> dict[str, Any]:
    severity = str(alert.get("severity") or "warning").lower()
    if severity == "info":
        severity = "info"
    elif severity in {"critical", "error"}:
        severity = "critical"
    else:
        severity = "warning"
    return {
        "routing_key": routing_key,
        "event_action": "trigger",
        "dedup_key": str(alert.get("incidentKey")),
        "payload": {
            "summary": str(alert.get("title") or alert.get("incidentKey")),
            "source": str(alert.get("owner") or "turbalance"),
            "severity": severity,
            "custom_details": alert,
        },
    }
