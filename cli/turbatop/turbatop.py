#!/usr/bin/env python3
"""turbatop: read-only terminal UI for turbalance product API."""

from __future__ import annotations

import argparse
import json
import math
import os
import queue
import re
import select
import shutil
import ssl
import sys
import termios
import threading
import time
import textwrap
import tty
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any


PALETTE = {
    "fg": "38;2;222;229;240",
    "green": "38;2;47;170;90",
    "amber": "38;2;232;161;58",
    "red": "38;2;224;88;78",
    "blue": "38;2;82;142;255",
    "cyan": "38;2;45;212;255",
    "magenta": "38;2;255;92;207",
    "purple": "38;2;177;122;255",
    "title": "1;38;2;245;247;255",
    "border": "38;2;80;220;255",
    "panel": "38;2;132;154;255",
    "empty": "38;2;53;63;86",
    "muted": "38;2;117;124;135",
    "dim": "2;38;2;117;124;135",
    "bold": "1",
}
BLOCKS = "▁▂▃▄▅▆▇█"
SPARK_COLORS = ["blue", "cyan", "green", "amber", "magenta"]
RULE_COLORS = ["cyan", "blue", "purple", "magenta"]
SORT_MODES = ["fleet", "pressure", "gpu", "cpu", "ram", "net", "status"]
PAGES = ["overview", "hosts", "signals", "ops", "compare", "report"]
PAGE_SHORT_LABELS = {
    "overview": "ovw",
    "hosts": "hosts",
    "signals": "sig",
    "ops": "ops",
    "compare": "cmp",
    "report": "rpt",
}
PAGE_PANELS = {
    "overview": ["summary", "score", "hosts", "warnings", "bottlenecks", "actions"],
    "hosts": ["hosts", "inspector"],
    "signals": ["warnings", "actions"],
    "ops": ["source", "session"],
    "compare": ["ladder", "peers"],
    "report": ["report", "context"],
}
LLM_CONTEXT_MAX_CHARS = 60000
HEARTBEAT_DURATION_SECONDS = 3.0
HEARTBEAT_FRAME_SECONDS = 0.16
NO_ACCELERATOR_SOURCE_MARKERS = (
    "not-found",
    "not installed",
    "unavailable",
    "unsupported",
    "not-present",
    "no-gpu",
    "none",
)


@dataclass
class HostRow:
    host_id: str
    gpu: float | None = None
    hbm: float | None = None
    cpu: float | None = None
    ram: float | None = None
    network: float | None = None
    status: str = "ok"
    history: list[float] = field(default_factory=list)
    detail: str = ""
    accelerator: bool = True


@dataclass
class TuiFrame:
    fleet: str = "fleet"
    api_url: str = ""
    ready: dict[str, Any] = field(default_factory=dict)
    hosts: list[HostRow] = field(default_factory=list)
    bottlenecks: list[tuple[str, float]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    actions: list[dict[str, Any]] = field(default_factory=list)
    savings: dict[str, Any] | None = None
    summary: dict[str, Any] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    notices: list[str] = field(default_factory=list)
    generated_at: str = ""
    llm_report: str = ""
    llm_report_model: str = ""
    llm_report_error: str = ""
    llm_report_fingerprint: str = ""
    heartbeat_active: bool = False
    heartbeat_phase: int = 0


@dataclass
class MouseEvent:
    button: int
    x: int
    y: int
    released: bool = False


@dataclass
class LayoutState:
    host_rows: list[HostRow]
    selected_host: HostRow | None
    visible_host_count: int
    scroll_start: int
    left_width: int
    right_width: int
    host_start_y: int
    status_y: int


class ApiClient:
    def __init__(
        self,
        api_url: str,
        token: str = "",
        insecure: bool = False,
        timeout: float = 4.0,
        bundle_url: str = "",
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        self.context = ssl._create_unverified_context() if insecure else None
        self.bundle_url = bundle_url

    def fetch(self, scope: str = "tenant") -> tuple[dict[str, Any], list[str]]:
        payload: dict[str, Any] = {}
        errors: list[str] = []
        notices: list[str] = []

        def get_optional(name: str, path: str, *, required: bool = False) -> Any:
            try:
                return self.get_json(path)
            except Exception as exc:  # API availability is a status-line concern, not a crash.
                target = errors if required else notices
                target.append(f"{name}: {compact_error(exc)}")
                return None

        payload["ready"] = get_optional("ready", "/ready") or {}
        payload["me"] = get_optional("me", "/v1/me", required=True) or {}
        payload["hosts"] = get_optional("hosts", "/v1/hosts", required=True) or {"hosts": []}
        payload["principal"] = get_optional("principal", "/v1/virtual-sensors/principal-resource-mode") or {}
        payload["fleetRca"] = get_optional("fleet-rca", "/v1/virtual-sensors/fleet-rca") or {"rows": []}
        payload["alertCandidates"] = get_optional("alert-candidates", "/v1/virtual-sensors/alert-candidates") or {"rows": []}
        payload["alerts"] = get_optional("alerts", "/v1/alerts") or {"alerts": []}

        savings = get_optional("savings", "/v1/savings-ledger")
        if savings is not None:
            payload["savings"] = savings

        resources: dict[str, Any] = {}
        for host in normalize_host_ids(payload.get("hosts"))[:40]:
            quoted = urllib.parse.quote(host, safe="")
            resources[host] = get_optional(f"{host}/resources", f"/v1/hosts/{quoted}/resources") or {"rows": []}
        payload["resources"] = resources
        payload["scope"] = scope
        api_host_ids = normalize_host_ids(payload.get("hosts"))
        if self.bundle_url:
            try:
                fallback = payload_from_source_bundle(self.get_url_json(self.bundle_url), self.bundle_url)
                if not api_host_ids and normalize_host_ids(fallback.get("hosts")):
                    fallback["scope"] = scope
                    fallback["ready"] = payload.get("ready") or fallback.get("ready") or {}
                    fallback["me"] = payload.get("me") or fallback.get("me") or {}
                    fallback["notices"] = dedupe([
                        f"showing live bundle fallback: {url_label(self.bundle_url)}",
                        *errors,
                        *notices,
                    ])
                    return fallback, []
                if api_host_ids:
                    merged = merge_bundle_hosts(payload, fallback)
                    if merged:
                        notices.append(f"merged live bundle hosts: {', '.join(merged[:4])}")
                elif not normalize_host_ids(fallback.get("hosts")):
                    notices.append(f"bundle: no host rows in {url_label(self.bundle_url)}")
            except Exception as exc:
                target = errors if not api_host_ids else notices
                target.append(f"bundle: {compact_error(exc)}")
        payload["notices"] = notices
        return payload, errors

    def get_json(self, path: str) -> Any:
        target = urllib.parse.urljoin(self.api_url + "/", path.lstrip("/"))
        request = urllib.request.Request(target, headers={"Accept": "application/json"})
        if self.token:
            request.add_header("Authorization", f"Bearer {self.token}")
        with urllib.request.urlopen(request, timeout=self.timeout, context=self.context) as response:
            body = response.read().decode("utf-8")
        return json.loads(body)

    def get_url_json(self, target: str) -> Any:
        request = urllib.request.Request(target, headers={"Accept": "application/json"})
        with urllib.request.urlopen(request, timeout=self.timeout, context=self.context) as response:
            body = response.read().decode("utf-8")
        return json.loads(body)


class FixtureClient:
    def __init__(self, path: str) -> None:
        self.path = path

    def fetch(self, scope: str = "tenant") -> tuple[dict[str, Any], list[str]]:
        with open(self.path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if is_source_bundle(payload):
            payload = payload_from_source_bundle(payload, self.path)
        payload.setdefault("scope", scope)
        return payload, []


class LlmReportClient:
    def __init__(
        self,
        base_url: str = "",
        model: str = "",
        token: str = "",
        timeout: float = 12.0,
        insecure: bool = False,
    ) -> None:
        self.base_url = base_url.strip()
        self.model = model.strip()
        self.token = token.strip()
        self.timeout = timeout
        self.context = ssl._create_unverified_context() if insecure else None

    def configured(self) -> bool:
        return bool(self.base_url and self.model)

    def generate(self, prompt: str) -> str:
        if not self.configured():
            return ""
        body = json.dumps({
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": "You write concise customer-facing infrastructure reports from supplied telemetry context only.",
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            "temperature": 0.2,
            "max_tokens": 1400,
        }).encode("utf-8")
        request = urllib.request.Request(
            llm_chat_completions_url(self.base_url),
            data=body,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        if self.token:
            request.add_header("Authorization", f"Bearer {self.token}")
        with urllib.request.urlopen(request, timeout=self.timeout, context=self.context) as response:
            payload = json.loads(response.read().decode("utf-8"))
        report = extract_llm_report_text(payload)
        if not report:
            raise ValueError("LLM endpoint returned no report text")
        return report


def llm_chat_completions_url(base_url: str) -> str:
    trimmed = base_url.strip().rstrip("/")
    if not trimmed:
        return ""
    if re.search(r"/chat/completions$", trimmed, re.IGNORECASE):
        return trimmed
    if re.search(r"/v1$", trimmed, re.IGNORECASE):
        return trimmed + "/chat/completions"
    return trimmed + "/v1/chat/completions"


def extract_llm_report_text(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    choices = payload.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0] if isinstance(choices[0], dict) else {}
        message = first.get("message") if isinstance(first.get("message"), dict) else {}
        content = message.get("content") or first.get("text")
        if content:
            return str(content).strip()
    if payload.get("output_text"):
        return str(payload.get("output_text")).strip()
    output = payload.get("output")
    if isinstance(output, list):
        parts: list[str] = []
        for item in output:
            content = item.get("content") if isinstance(item, dict) else None
            if isinstance(content, list):
                for part in content:
                    if isinstance(part, dict):
                        parts.append(str(part.get("text") or part.get("content") or ""))
        return "\n".join(part for part in parts if part).strip()
    return ""


def normalize_payload(payload: dict[str, Any], errors: list[str], api_url: str = "") -> TuiFrame:
    me = payload.get("me") if isinstance(payload.get("me"), dict) else {}
    ready = payload.get("ready") if isinstance(payload.get("ready"), dict) else {}
    summary = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
    fleet = str(summary.get("fleet") or me.get("tenantId") or payload.get("scope") or "fleet")
    resources = payload.get("resources") if isinstance(payload.get("resources"), dict) else {}
    hosts = build_hosts(payload.get("hosts"), resources)
    if not hosts and isinstance(payload.get("hostRows"), list):
        hosts = [host_from_summary(row) for row in payload.get("hostRows", []) if isinstance(row, dict)]
    principal = payload.get("principal") if isinstance(payload.get("principal"), dict) else {}
    frame = TuiFrame(
        fleet=fleet,
        api_url=api_url,
        ready=ready,
        hosts=hosts,
        bottlenecks=build_bottlenecks(principal, hosts, payload),
        warnings=build_warnings(payload, hosts),
        actions=build_actions(payload, hosts),
        savings=build_savings(payload.get("savings")),
        summary=summary,
        errors=errors + [str(item) for item in payload.get("errors", []) if item],
        notices=[str(item) for item in payload.get("notices", []) if item],
        generated_at=str(payload.get("generatedAt") or summary.get("generatedAt") or ""),
    )
    return frame


def attach_llm_report(
    frame: TuiFrame,
    payload: dict[str, Any],
    llm_client: LlmReportClient | None,
    cache: dict[str, str] | None = None,
    *,
    generate: bool = True,
) -> TuiFrame:
    context = build_customer_report_context(frame, payload)
    fingerprint = stable_fingerprint(context)
    frame.llm_report_fingerprint = fingerprint
    if not llm_client or not llm_client.configured():
        return frame
    frame.llm_report_model = llm_client.model
    if cache is not None and fingerprint in cache:
        frame.llm_report = cache[fingerprint]
        return frame
    if not generate:
        return frame
    try:
        prompt = build_customer_report_prompt(context)
        frame.llm_report = llm_client.generate(prompt)
        if cache is not None:
            cache[fingerprint] = frame.llm_report
    except Exception as exc:
        frame.llm_report_error = compact_error(exc)
    return frame


def build_customer_report_context(frame: TuiFrame, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "generatedAt": frame.generated_at,
        "fleet": frame.fleet,
        "apiUrl": frame.api_url,
        "source": data_source_label(frame),
        "ready": frame.ready,
        "summary": frame.summary,
        "hosts": [
            {
                "hostId": host.host_id,
                "class": "accelerator" if host.accelerator else "cpu-only",
                "status": host.status,
                "pressurePct": round(host_pressure(host), 2),
                "gpuPct": host.gpu,
                "hbmPct": host.hbm,
                "cpuPct": host.cpu,
                "ramPct": host.ram,
                "networkPct": host.network,
                "detail": host.detail,
            }
            for host in frame.hosts
        ],
        "machineComparison": [
            {
                "level": row["level"],
                "label": row["label"],
                "value": row["value"],
                "detail": row["detail"],
                "tone": row["tone"],
            }
            for row in machine_l1_l6_rows(frame, frame.hosts[0] if frame.hosts else None)
        ],
        "bottlenecks": [{"label": label, "score": score} for label, score in frame.bottlenecks],
        "warnings": frame.warnings,
        "actions": frame.actions,
        "savings": frame.savings,
        "notices": frame.notices,
        "errors": frame.errors,
        "rawPayload": compact_payload_for_llm(payload),
    }


def compact_payload_for_llm(payload: dict[str, Any]) -> Any:
    text = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    if len(text) <= LLM_CONTEXT_MAX_CHARS:
        return payload
    return {
        "truncated": True,
        "chars": len(text),
        "prefix": text[:LLM_CONTEXT_MAX_CHARS],
    }


def build_customer_report_prompt(context: dict[str, Any]) -> str:
    context_json = json.dumps(context, indent=2, sort_keys=True, default=str)
    if len(context_json) > LLM_CONTEXT_MAX_CHARS:
        context_json = context_json[:LLM_CONTEXT_MAX_CHARS] + "\n...TRUNCATED_FOR_CONTEXT_WINDOW..."
    return "\n".join([
        "You are the turbalance customer report analyst.",
        "Use only CONTEXT_JSON facts. Do not invent customers, hardware, savings, or remediation status.",
        "Write a concise customer-facing report with executive summary, observed evidence, business impact, machine L1-L6 comparison, and next actions.",
        "Separate live/API evidence from inferred or unavailable evidence.",
        "CONTEXT_JSON:",
        context_json,
    ])


def stable_fingerprint(value: Any) -> str:
    text = json.dumps(stable_fingerprint_value(value), sort_keys=True, separators=(",", ":"), default=str)
    hash_value = 2166136261
    for char in text:
        hash_value ^= ord(char)
        hash_value = (hash_value * 16777619) & 0xFFFFFFFF
    return f"{hash_value:08x}"


def stable_fingerprint_value(value: Any, key: str = "") -> Any:
    if key in {"generatedAt", "event_ts", "timestamp", "time", "updatedAt"}:
        return None
    if isinstance(value, dict):
        return {
            child_key: child
            for child_key in sorted(value)
            if (child := stable_fingerprint_value(value[child_key], child_key)) is not None
        }
    if isinstance(value, list):
        return [item for item in (stable_fingerprint_value(item) for item in value) if item is not None]
    return value


def is_source_bundle(payload: dict[str, Any]) -> bool:
    ingestion = payload.get("ingestion") if isinstance(payload, dict) else None
    return isinstance(ingestion, dict) and isinstance(ingestion.get("runs"), list)


def payload_from_source_bundle(bundle: dict[str, Any], source: str = "") -> dict[str, Any]:
    metadata = bundle.get("metadata") if isinstance(bundle.get("metadata"), dict) else {}
    ingestion = bundle.get("ingestion") if isinstance(bundle.get("ingestion"), dict) else {}
    runs = [run for run in ingestion.get("runs", []) if isinstance(run, dict)]
    hosts: list[dict[str, Any]] = []
    resources: dict[str, Any] = {}
    host_rows: list[dict[str, Any]] = []
    tenants: list[str] = []
    gpu_history: list[float] = []
    useful_history: list[float] = []
    actions: list[dict[str, Any]] = []

    for run in runs:
        context = run.get("sourceContext") if isinstance(run.get("sourceContext"), dict) else {}
        refs = run.get("refs") if isinstance(run.get("refs"), dict) else {}
        utilization = run.get("utilization") if isinstance(run.get("utilization"), dict) else {}
        communication = run.get("communication") if isinstance(run.get("communication"), dict) else {}
        input_pipeline = run.get("inputPipeline") if isinstance(run.get("inputPipeline"), dict) else {}
        memory = run.get("memory") if isinstance(run.get("memory"), dict) else {}
        reliability = run.get("reliability") if isinstance(run.get("reliability"), dict) else {}
        host_id = str(
            context.get("hostname")
            or refs.get("cluster")
            or refs.get("account")
            or run.get("hostId")
            or run.get("id")
            or run.get("name")
            or "host"
        )
        tenants.append(str(refs.get("tenant") or ""))
        accelerator = bundle_has_accelerator(host_id, context, run)
        gpu = first_number(context, "gpuUtilizationPct", "gpu_utilization_pct")
        if gpu is None:
            gpu = normalize_ratio_percent(first_number(utilization, "gpuUtil", "gpu_util"))
        hbm = first_number(context, "gpuMemoryUsedPct", "gpu_memory_used_pct")
        if hbm is None:
            hbm = normalize_ratio_percent(first_number(memory, "hbmCapacity", "hbm_capacity", "kvCachePressure"))
        if not accelerator:
            gpu = None
            hbm = None
        cpu = first_number(context, "cpuUsagePct", "cpu_usage_pct")
        if cpu is None:
            cpu = normalize_ratio_percent(first_number(input_pipeline, "cpuPrep", "cpu_prep"))
        ram = first_number(context, "memoryUsedPct", "memory_used_pct")
        network = first_number(context, "networkUtilizationPct", "network_utilization_pct")
        if network is None:
            network = normalize_ratio_percent(first_number(communication, "networkUtilization", "network_utilization"))
        useful = normalize_ratio_percent(first_number(utilization, "usefulCompute", "useful_compute"))
        if accelerator and gpu is not None:
            gpu_history.append(gpu)
        if accelerator and useful is not None:
            useful_history.append(useful)
        status = bundle_host_status(context, run)
        detail = bundle_host_detail(context, run, accelerator)
        resource_row = {
            "host_id": host_id,
            "event_ts": metadata.get("generatedAt") or context.get("clockIso") or run.get("id"),
            "accelerator": accelerator,
            "gpu": gpu,
            "hbm": hbm,
            "cpu": cpu,
            "ram": ram,
            "network": network,
            "status": status,
            "detail": detail,
            "reachable": context.get("reachable"),
            "gpuName": context.get("gpuName"),
            "gpuSource": context.get("gpuSource"),
        }
        hosts.append({"hostId": host_id})
        resources[host_id] = {"rows": [resource_row]}
        host_rows.append({
            "hostId": host_id,
            "accelerator": accelerator,
            "gpu": gpu,
            "hbm": hbm,
            "cpu": cpu,
            "ram": ram,
            "network": network,
            "status": status,
            "detail": detail,
            "history": [gpu if accelerator else cpu] if (gpu if accelerator else cpu) is not None else [],
        })
        if status != "ok":
            actions.append({
                "title": f"Inspect {host_id}",
                "confidence": 0.8,
                "detail": detail,
            })

    warnings = bundle_warnings(metadata)
    fleet = next((tenant for tenant in tenants if tenant), "") or str(metadata.get("source") or "live-fleet")
    summary = {
        "fleet": fleet,
        "gpuUtilPct": average(gpu_history),
        "usefulComputePct": average(useful_history),
        "dominantBottleneck": "",
        "history": {
            "gpuUtilPct": gpu_history[-18:],
            "usefulComputePct": useful_history[-18:],
        },
        "generatedAt": metadata.get("generatedAt") or "",
        "source": source,
    }
    return {
        "ready": {"status": "live-bundle", "source": source},
        "hosts": {"hosts": hosts},
        "resources": resources,
        "hostRows": host_rows,
        "summary": summary,
        "predictiveWarnings": warnings,
        "actions": actions,
        "generatedAt": metadata.get("generatedAt") or "",
    }


def merge_bundle_hosts(payload: dict[str, Any], bundle_payload: dict[str, Any]) -> list[str]:
    api_host_ids = normalize_host_ids(payload.get("hosts"))
    bundle_host_ids = normalize_host_ids(bundle_payload.get("hosts"))
    if not api_host_ids or not bundle_host_ids:
        return []
    existing = {host_id.lower() for host_id in api_host_ids}
    missing = [host_id for host_id in bundle_host_ids if host_id.lower() not in existing]
    if not missing:
        return []

    host_payload = payload.get("hosts") if isinstance(payload.get("hosts"), dict) else {}
    host_rows = host_payload.get("hosts", []) if isinstance(host_payload.get("hosts"), list) else []
    merged_hosts = []
    bundle_resources = bundle_payload.get("resources") if isinstance(bundle_payload.get("resources"), dict) else {}
    resources = payload.get("resources") if isinstance(payload.get("resources"), dict) else {}
    for host_id in missing:
        merged_hosts.append({"hostId": host_id})
        if host_id in bundle_resources:
            resources[host_id] = bundle_resources[host_id]
    merged_hosts.extend(host_rows)
    merged_hosts.sort(key=lambda row: host_sort_key(str(row.get("hostId") or row.get("host_id") or row.get("id") or "")))
    payload["hosts"] = {**host_payload, "hosts": merged_hosts}
    payload["resources"] = resources
    return missing


def build_hosts(host_payload: Any, resources: dict[str, Any]) -> list[HostRow]:
    hosts: list[HostRow] = []
    for host_id in normalize_host_ids(host_payload):
        rows = rows_from(resources.get(host_id))
        latest = latest_row(rows)
        accelerator = infer_accelerator(host_id, latest)
        history_keys = ("gpu", "gpuUtil", "gpu_utilization_pct", "gpuUtilizationPct") if accelerator else ("cpu", "cpuUsagePct", "cpu_usage_pct")
        history = [first_number(row, *history_keys) for row in rows]
        hosts.append(HostRow(
            host_id=host_id,
            gpu=first_number(latest, "gpu", "gpuUtil", "gpu_utilization_pct", "gpuUtilizationPct") if accelerator else None,
            hbm=first_number(latest, "hbm", "gpuMemory", "gpuMemoryUsedPct", "gpu_memory_used_pct") if accelerator else None,
            cpu=first_number(latest, "cpu", "cpuUsagePct", "cpu_usage_pct"),
            ram=first_number(latest, "ram", "memoryUsedPct", "memory_used_pct"),
            network=first_number(latest, "network", "networkUtilizationPct", "network_utilization_pct"),
            status=host_status(latest),
            history=[value for value in history if value is not None],
            detail=str(latest.get("evidence") or latest.get("detail") or ""),
            accelerator=accelerator,
        ))
    return sorted(hosts, key=lambda host: host_sort_key(host.host_id))


def host_from_summary(row: dict[str, Any]) -> HostRow:
    host_id = str(row.get("hostId") or row.get("host_id") or row.get("name") or "host")
    accelerator = infer_accelerator(host_id, row)
    return HostRow(
        host_id=host_id,
        gpu=first_number(row, "gpu", "gpuUtil", "gpuUtilizationPct") if accelerator else None,
        hbm=first_number(row, "hbm", "gpuMemoryUsedPct") if accelerator else None,
        cpu=first_number(row, "cpu"),
        ram=first_number(row, "ram"),
        network=first_number(row, "network"),
        status=str(row.get("status") or "ok"),
        history=[value for value in [number(item) for item in row.get("history", [])] if value is not None],
        detail=str(row.get("detail") or ""),
        accelerator=accelerator,
    )


def build_bottlenecks(principal: dict[str, Any], hosts: list[HostRow], payload: dict[str, Any]) -> list[tuple[str, float]]:
    explicit = payload.get("bottlenecks")
    if isinstance(explicit, list):
        rows = []
        for item in explicit:
            if isinstance(item, dict):
                rows.append((str(item.get("label") or item.get("name") or "Bottleneck"), bounded(first_number(item, "score", "value", "pct") or 0)))
        if rows:
            return rows[:6]
    loadings = principal.get("loadings") if isinstance(principal.get("loadings"), list) else []
    rows = []
    for item in loadings:
        if not isinstance(item, dict):
            continue
        value = number(item.get("value"))
        if value is None:
            continue
        rows.append((bottleneck_label(str(item.get("metric") or "")), bounded(abs(value) * 100)))
    if rows:
        return sorted(rows, key=lambda row: row[1], reverse=True)[:6]
    averages = {
        "Communication": average([host.network for host in hosts]),
        "Input": average([host.cpu for host in hosts]),
        "Memory": average([host.hbm for host in hosts]),
        "Placement": average([host.ram for host in hosts]),
    }
    return sorted([(name, value) for name, value in averages.items() if value is not None], key=lambda row: row[1], reverse=True)[:6]


def build_warnings(payload: dict[str, Any], hosts: list[HostRow] | None = None) -> list[str]:
    accelerators = accelerator_index(hosts or [])
    warnings: list[str] = []
    alerts = payload.get("alerts")
    alert_rows = alerts.get("alerts", []) if isinstance(alerts, dict) else []
    for item in alert_rows:
        if isinstance(item, dict):
            if should_suppress_gpu_alert(item, accelerators, suppress_unattributed=True):
                continue
            warnings.append(warning_text(item))
    candidates = payload.get("alertCandidates")
    candidate_rows = candidates.get("rows", []) if isinstance(candidates, dict) else []
    for item in candidate_rows:
        if isinstance(item, dict):
            if should_suppress_gpu_alert(item, accelerators):
                continue
            warnings.append(warning_text(item))
    predictive = payload.get("predictiveWarnings")
    if isinstance(predictive, list):
        for item in predictive:
            if isinstance(item, dict):
                warnings.append(warning_text(item))
            elif item:
                warnings.append(str(item))
    return dedupe(warnings)[:6]


def build_actions(payload: dict[str, Any], hosts: list[HostRow] | None = None) -> list[dict[str, Any]]:
    accelerators = accelerator_index(hosts or [])
    actions: list[dict[str, Any]] = []
    for key in ("actions", "opportunities"):
        rows = payload.get(key)
        if isinstance(rows, list):
            actions.extend(
                item for item in rows
                if isinstance(item, dict) and not should_suppress_gpu_alert(item, accelerators)
            )
    fleet_rca = payload.get("fleetRca")
    if isinstance(fleet_rca, dict):
        for row in fleet_rca.get("rows", []):
            if isinstance(row, dict):
                if should_suppress_gpu_alert(row, accelerators):
                    continue
                actions.append({
                    "title": row.get("suggested_action") or row.get("suggestedAction") or row.get("title") or "Investigate fleet pattern",
                    "value": row.get("recoveredDollars") or row.get("predictedDollars"),
                    "gpuHours": row.get("recoveredGpuHours") or row.get("predictedGpuHours"),
                    "confidence": row.get("confidence"),
                    "detail": row.get("evidence") or row.get("title"),
                })
    candidates = payload.get("alertCandidates")
    if isinstance(candidates, dict):
        for row in candidates.get("rows", []):
            if isinstance(row, dict):
                if should_suppress_gpu_alert(row, accelerators):
                    continue
                actions.append({
                    "title": row.get("suggested_action") or row.get("suggestedAction") or row.get("title") or "Inspect warning",
                    "confidence": row.get("confidence"),
                    "detail": row.get("evidence"),
                })
    return actions[:6]


def accelerator_index(hosts: list[HostRow]) -> dict[str, bool]:
    return {host.host_id.lower(): host.accelerator for host in hosts}


def should_suppress_gpu_alert(
    item: dict[str, Any],
    accelerators: dict[str, bool],
    *,
    suppress_unattributed: bool = False,
) -> bool:
    if not accelerators or not gpu_specific_alert(item):
        return False
    host_id = alert_host_id(item)
    if not host_id:
        return suppress_unattributed and gpu_starvation_alert(item)
    has_accelerator = accelerators.get(host_id.lower())
    return has_accelerator is False


def alert_host_id(item: dict[str, Any]) -> str:
    value = first_present(item, "host_id", "hostId", "host", "hostname", "cluster")
    return str(value or "").strip()


def gpu_specific_alert(item: dict[str, Any]) -> bool:
    fields = [
        item.get("title"),
        item.get("name"),
        item.get("metric"),
        item.get("detail"),
        item.get("evidence"),
        item.get("suggested_action"),
        item.get("suggestedAction"),
    ]
    text = " ".join(str(value or "") for value in fields).lower()
    return "gpu" in text or "accelerator" in text or "hbm" in text


def gpu_starvation_alert(item: dict[str, Any]) -> bool:
    title = str(item.get("title") or item.get("name") or item.get("metric") or "").lower()
    return "gpu starvation" in title or "gpuutil" in title


def build_savings(savings_payload: Any) -> dict[str, Any] | None:
    if not isinstance(savings_payload, dict):
        return None
    entries = savings_payload.get("entries")
    if not isinstance(entries, list):
        return None
    verified = [
        entry for entry in entries
        if isinstance(entry, dict)
        and str(entry.get("status") or "").lower() == "verified"
        and str(entry.get("attribution") or "measured").lower() == "measured"
    ]
    dollars = sum(first_number(entry, "deltaDollars", "delta_dollars") or 0 for entry in verified)
    gpu_hours = sum(first_number(entry, "deltaGpuHours", "delta_gpu_hours") or 0 for entry in verified)
    predicted = sum(first_number(entry, "predictedDollars", "predicted_dollars") or 0 for entry in verified)
    realization = (dollars / predicted * 100) if predicted > 0 else None
    return {
        "dollars": dollars,
        "gpuHours": gpu_hours,
        "realizationPct": realization,
        "count": len(verified),
        "history": [first_number(entry, "deltaDollars", "delta_dollars") or 0 for entry in verified][-12:],
    }


def render_frame(
    frame: TuiFrame,
    *,
    width: int,
    height: int,
    color: bool = True,
    selected: int = 0,
    scope: str = "tenant",
    filter_text: str = "",
    drill: bool = False,
    sort_mode: str = "fleet",
    page: str = "overview",
    paused: bool = False,
    help_open: bool = False,
    status_message: str = "",
    snapshot_file: str = "",
    fetching: bool = False,
    panel_focus: int = 0,
    panel_cursor: int = 0,
) -> str:
    width = max(40, width)
    page = normalize_page(page)
    panel_focus = normalize_panel_focus(page, panel_focus)
    if width < 64 or height < 16:
        return tiny_frame(width, color, frame.errors)
    if help_open:
        return render_help_frame(
            frame,
            width=width,
            height=height,
            color=color,
            scope=scope,
            sort_mode=sort_mode,
            page=page,
            filter_text=filter_text,
            paused=paused,
            status_message=status_message,
            snapshot_file=snapshot_file,
            fetching=fetching,
            panel_focus=panel_focus,
            panel_cursor=panel_cursor,
        )
    if page == "hosts":
        return render_hosts_page(
            frame,
            width=width,
            height=height,
            color=color,
            selected=selected,
            scope=scope,
            filter_text=filter_text,
            drill=drill,
            sort_mode=sort_mode,
            page=page,
            paused=paused,
            status_message=status_message,
            fetching=fetching,
            panel_focus=panel_focus,
            panel_cursor=panel_cursor,
        )
    if page == "signals":
        return render_signals_page(
            frame,
            width=width,
            height=height,
            color=color,
            selected=selected,
            scope=scope,
            filter_text=filter_text,
            sort_mode=sort_mode,
            page=page,
            paused=paused,
            status_message=status_message,
            fetching=fetching,
            panel_focus=panel_focus,
            panel_cursor=panel_cursor,
        )
    if page == "ops":
        return render_ops_page(
            frame,
            width=width,
            height=height,
            color=color,
            selected=selected,
            scope=scope,
            filter_text=filter_text,
            sort_mode=sort_mode,
            page=page,
            paused=paused,
            status_message=status_message,
            fetching=fetching,
            panel_focus=panel_focus,
            panel_cursor=panel_cursor,
        )
    if page == "compare":
        return render_compare_page(
            frame,
            width=width,
            height=height,
            color=color,
            selected=selected,
            scope=scope,
            filter_text=filter_text,
            sort_mode=sort_mode,
            page=page,
            paused=paused,
            status_message=status_message,
            fetching=fetching,
            panel_focus=panel_focus,
            panel_cursor=panel_cursor,
        )
    if page == "report":
        return render_report_page(
            frame,
            width=width,
            height=height,
            color=color,
            selected=selected,
            scope=scope,
            filter_text=filter_text,
            sort_mode=sort_mode,
            page=page,
            paused=paused,
            status_message=status_message,
            fetching=fetching,
            panel_focus=panel_focus,
            panel_cursor=panel_cursor,
        )
    inner = width - 2
    selected = max(0, min(selected, max(0, len(frame.hosts) - 1)))
    selected_host = frame.hosts[selected] if frame.hosts else None
    gpu_util = first_number(frame.summary, "gpuUtilPct", "gpuUtil", "gpu_util_pct")
    useful = first_number(frame.summary, "usefulComputePct", "usefulCompute", "useful_compute_pct")
    if gpu_util is None:
        gpu_util = average([host.gpu for host in frame.hosts])
    wasted = first_number(frame.summary, "wastedGpuHours", "wasted_gpu_hours")
    cost = first_number(frame.summary, "costPerUsefulGpuHour", "cost_per_useful_gpu_hour")
    dominant = str(frame.summary.get("dominantBottleneck") or (frame.bottlenecks[0][0] if frame.bottlenecks else "learning"))
    gpu_hist = series_from_summary(frame.summary, "gpuUtilPct") or [host.gpu for host in frame.hosts if host.gpu is not None]
    useful_hist = series_from_summary(frame.summary, "usefulComputePct")
    if not useful_hist and useful is not None:
        useful_hist = [useful]

    layout = layout_state(frame, width, height, selected, filter_text, sort_mode, drill, page=page)
    lines = [top_border(frame_title("turbatop", color, width, frame), top_controls(frame, scope, color=color), width, color=color)]
    lines.extend(overview_hero_lines(
        frame,
        width=width,
        color=color,
        gpu_util=gpu_util,
        useful=useful,
        wasted=wasted,
        cost=cost,
        dominant=dominant,
        gpu_hist=gpu_hist,
        useful_hist=useful_hist,
        panel_focus=panel_focus,
        panel_cursor=panel_cursor,
    ))

    host_rows = layout.host_rows
    selected_host = layout.selected_host
    visible_host_count = layout.visible_host_count
    scroll_start = layout.scroll_start
    host_title = host_section_title(scroll_start, visible_host_count, len(host_rows), sort_mode)
    warning_title = f"FORECAST & WARNINGS {len(frame.warnings)}" if frame.warnings else "FORECAST & WARNINGS"
    lines.append(split_border(
        panel_title(host_title, page, panel_focus, 2),
        panel_title(warning_title, page, panel_focus, 3),
        width,
        color=color,
    ))
    left_width = layout.left_width
    right_width = layout.right_width
    warnings = frame.warnings or ["No warnings returned by API."]
    for index in range(visible_host_count):
        host_index = scroll_start + index
        host = host_rows[host_index] if host_index < len(host_rows) else None
        left = render_host(host, selected=(host is not None and host == selected_host), width=left_width, color=color)
        right_text = color_signal_text(warnings[index], color) if index < len(warnings) else ""
        right = fit(focus_row(right_text, page, panel_focus, 3, index, panel_cursor, color), right_width)
        lines.append(split_row(left, right, color=color))

    lines.append(split_border(
        panel_title("BOTTLENECKS", page, panel_focus, 4),
        panel_title("PRESCRIBED ACTIONS", page, panel_focus, 5),
        width,
        color=color,
    ))
    for index in range(panel_row_count(frame, height, visible_host_count)):
        left_text = render_bottleneck(frame.bottlenecks[index] if index < len(frame.bottlenecks) else None, left_width, color)
        right_text = render_action_or_recovered(frame, index, right_width, color)
        left = fit(focus_row(left_text, page, panel_focus, 4, index, panel_cursor, color), left_width)
        right = fit(focus_row(right_text, page, panel_focus, 5, index, panel_cursor, color), right_width)
        lines.append(split_row(left, right, color=color))

    if drill and frame.hosts:
        lines.append(mid_border(f"HOST DETAIL · {frame.hosts[selected].host_id}", width, color=color))
        lines.append(wrap_line(" " + host_detail(frame.hosts[selected]), inner, color=color))

    status = status_line(frame, scope, filter_text, sort_mode, page=page, paused=paused, message=status_message, fetching=fetching, color=color, panel_focus=panel_focus, panel_cursor=panel_cursor)
    return finish_frame(lines, status, width, height, color)


def overview_hero_lines(
    frame: TuiFrame,
    *,
    width: int,
    color: bool,
    gpu_util: float | None,
    useful: float | None,
    wasted: float | None,
    cost: float | None,
    dominant: str,
    gpu_hist: list[Any],
    useful_hist: list[Any],
    panel_focus: int = 0,
    panel_cursor: int = 0,
) -> list[str]:
    inner = width - 2
    score = efficiency_score(gpu_util, useful)
    kicker = overview_kicker(frame)
    headline = overview_headline(frame)
    detail = overview_detail(frame, dominant)
    efficiency = (
        f"  Fleet heat {host_heat_strip(frame.hosts, 18, color=color)}"
        f"  dom {dominant}"
    )
    if width >= 96:
        left_width, right_width = overview_hero_widths(width)
        return [
            asymmetric_border(
                panel_title("turbalance Analytics · turbatop", "overview", panel_focus, 0),
                panel_title("EFFICIENCY SCORE", "overview", panel_focus, 1),
                left_width,
                right_width,
                color,
            ),
            asymmetric_row(
                focus_row(kicker, "overview", panel_focus, 0, 0, panel_cursor, color),
                focus_row(f"  {score_orbit(score, color=color)} {pct(score)}", "overview", panel_focus, 1, 0, panel_cursor, color),
                left_width,
                right_width,
                color,
            ),
            asymmetric_row(
                focus_row("  " + headline, "overview", panel_focus, 0, 1, panel_cursor, color),
                focus_row(f"  Useful {gauge(useful, 14, color=color)} {pct(useful)}", "overview", panel_focus, 1, 1, panel_cursor, color),
                left_width,
                right_width,
                color,
            ),
            asymmetric_row(
                focus_row("  " + detail, "overview", panel_focus, 0, 2, panel_cursor, color),
                focus_row(f"  GPU    {sparkline(gpu_hist, 12, color=color)} {pct(gpu_util)}", "overview", panel_focus, 1, 2, panel_cursor, color),
                left_width,
                right_width,
                color,
            ),
            asymmetric_row(
                focus_row(efficiency, "overview", panel_focus, 0, 3, panel_cursor, color),
                focus_row(f"  Waste  {short_hours(wasted)} · {money_per_hour(cost)}", "overview", panel_focus, 1, 3, panel_cursor, color),
                left_width,
                right_width,
                color,
            ),
        ]
    return [
        mid_border(panel_title("turbalance Analytics · turbatop", "overview", panel_focus, 0), width, color=color),
        wrap_line(kicker, inner, color=color),
        wrap_line("  " + headline, inner, color=color),
        wrap_line("  " + detail, inner, color=color),
        wrap_line(efficiency + f"  Score {score_orbit(score, color=color)} {pct(score)}", inner, color=color),
    ]


def overview_kicker(frame: TuiFrame) -> str:
    total = effective_host_count(frame.hosts)
    watch = effective_watch_count(frame.hosts)
    accelerators = effective_accelerator_count(frame.hosts)
    fresh = first_number(frame.summary, "freshHosts", "freshHostCount", "fresh_host_count")
    similarity = first_number(frame.summary, "similarityPct", "fleetSimilarityPct", "similarity_pct")
    bits = ["  t", "FLEET", f"{total} HOSTS"]
    if fresh is not None:
        bits.append(f"{round(fresh)}/{total} FRESH")
    else:
        bits.append(f"{accelerators}/{total} ACCEL")
    if similarity is not None:
        bits.append(f"{pct(similarity)} SIMILARITY")
    else:
        bits.append(f"{watch} WATCH")
    bits.append(data_source_label(frame).upper())
    return " | ".join(bits)


def overview_headline(frame: TuiFrame) -> str:
    total = effective_host_count(frame.hosts)
    watch = effective_watch_count(frame.hosts)
    ok = max(0, total - watch)
    fresh = first_number(frame.summary, "freshHosts", "freshHostCount", "fresh_host_count")
    similarity = first_number(frame.summary, "similarityPct", "fleetSimilarityPct", "similarity_pct")
    watch_text = plural(watch, "host") + " to watch"
    if fresh is not None and similarity is not None:
        return f"{total}-host fleet aggregate: {round(fresh)}/{total} fresh, {pct(similarity)} similarity, {watch_text}."
    return f"{total}-host fleet aggregate: {ok}/{total} ok, {watch_text}."


def overview_detail(frame: TuiFrame, dominant: str) -> str:
    hottest = max(frame.hosts, key=host_pressure, default=None)
    hot = f"hottest host is {hottest.host_id} at {pct(host_pressure(hottest))}" if hottest else "hottest host is learning"
    freshness = f"as of {compact_timestamp(frame.generated_at)}" if frame.generated_at else "awaiting timestamp"
    return f"{hot}. Dominant bottleneck is {dominant}; {freshness}."


def efficiency_score(gpu_util: Any, useful: Any) -> float | None:
    useful_value = number(useful)
    if useful_value is not None:
        return useful_value
    return number(gpu_util)


def score_orbit(value: Any, *, color: bool) -> str:
    parsed = number(value)
    if parsed is None:
        body = gauge(None, 12, color=color)
    else:
        body = gauge(parsed, 12, color=color)
    if not color:
        return "◜" + body + "◞"
    return ansi("◜", "magenta", enabled=True) + body + ansi("◞", "cyan", enabled=True)


def host_heat_strip(hosts: list[HostRow], width: int, *, color: bool) -> str:
    values: list[float] = []
    for host in hosts:
        pressure = host_pressure(host)
        if pressure < 0:
            continue
        values.extend([pressure] * host_span_count(host.host_id))
    if not values:
        body = " " * width
    else:
        if len(values) > width:
            step = len(values) / width
            values = [values[min(len(values) - 1, int(index * step))] for index in range(width)]
        elif len(values) < width:
            values = values + ([values[-1]] * (width - len(values)))
        body = "".join(heat_block(value, color=color) for value in values[:width])
    if not color:
        return "▕" + body + "▏"
    return ansi("▕", "border", enabled=True) + body + ansi("▏", "border", enabled=True)


def heat_block(value: Any, *, color: bool) -> str:
    parsed = bounded(number(value) or 0)
    index = max(0, min(len(BLOCKS) - 1, int(round(parsed / 100 * (len(BLOCKS) - 1)))))
    block = BLOCKS[index]
    if not color:
        return block
    if parsed >= 90:
        name = "red"
    elif parsed >= 70:
        name = "amber"
    elif parsed >= 45:
        name = "green"
    else:
        name = "cyan"
    return ansi(block, name, enabled=True)


def effective_host_count(hosts: list[HostRow]) -> int:
    return sum(host_span_count(host.host_id) for host in hosts)


def effective_watch_count(hosts: list[HostRow]) -> int:
    return sum(host_span_count(host.host_id) for host in hosts if host.status != "ok")


def effective_accelerator_count(hosts: list[HostRow]) -> int:
    return sum(host_span_count(host.host_id) for host in hosts if host.accelerator)


def host_span_count(host_id: str) -> int:
    match = re.search(r"(\d+)\.\.(\d+)$", host_id)
    if not match:
        return 1
    start = int(match.group(1))
    end = int(match.group(2))
    return abs(end - start) + 1


def plural(count: int, singular: str) -> str:
    suffix = "" if count == 1 else "s"
    return f"{count} {singular}{suffix}"


def render_hosts_page(
    frame: TuiFrame,
    *,
    width: int,
    height: int,
    color: bool,
    selected: int,
    scope: str,
    filter_text: str,
    drill: bool,
    sort_mode: str,
    page: str,
    paused: bool,
    status_message: str,
    fetching: bool,
    panel_focus: int = 0,
    panel_cursor: int = 0,
) -> str:
    inner = width - 2
    layout = layout_state(frame, width, height, selected, filter_text, sort_mode, drill, page=page)
    lines = [top_border(frame_title("turbatop", color, width, frame), top_controls(frame, scope, color=color), width, color=color)]
    lines.append(wrap_line(" HOST DIRECTORY  " + fleet_summary_line(frame), inner, color=color))
    lines.append(wrap_line(" " + host_composition_line(frame, layout.selected_host), inner, color=color))
    lines.append(split_border(
        panel_title(host_section_title(layout.scroll_start, layout.visible_host_count, len(layout.host_rows), sort_mode), page, panel_focus, 0),
        panel_title("HOST INSPECTOR", page, panel_focus, 1),
        width,
        color=color,
    ))

    detail_rows = host_inspector_rows(frame, layout.selected_host, color)
    for index in range(layout.visible_host_count):
        host_index = layout.scroll_start + index
        host = layout.host_rows[host_index] if host_index < len(layout.host_rows) else None
        left = render_host(host, selected=(host is not None and host == layout.selected_host), width=layout.left_width, color=color)
        right_text = detail_rows[index] if index < len(detail_rows) else ""
        right = fit(focus_row(right_text, page, panel_focus, 1, index, panel_cursor, color), layout.right_width)
        lines.append(split_row(left, right, color=color))

    status = status_line(frame, scope, filter_text, sort_mode, page=page, paused=paused, message=status_message, fetching=fetching, color=color, panel_focus=panel_focus, panel_cursor=panel_cursor)
    return finish_frame(lines, status, width, height, color)


def render_signals_page(
    frame: TuiFrame,
    *,
    width: int,
    height: int,
    color: bool,
    selected: int,
    scope: str,
    filter_text: str,
    sort_mode: str,
    page: str,
    paused: bool,
    status_message: str,
    fetching: bool,
    panel_focus: int = 0,
    panel_cursor: int = 0,
) -> str:
    inner = width - 2
    left_width = max(32, (inner // 2) - 1)
    right_width = inner - left_width - 1
    selected_host = frame.hosts[max(0, min(selected, max(0, len(frame.hosts) - 1)))] if frame.hosts else None
    lines = [top_border(frame_title("turbatop", color, width, frame), top_controls(frame, scope, color=color), width, color=color)]
    lines.append(wrap_line(" SIGNAL CENTER  " + fleet_summary_line(frame), inner, color=color))
    lines.append(wrap_line(" " + signal_summary_line(frame, selected_host), inner, color=color))
    lines.append(split_border(
        panel_title("WARNINGS & BOTTLENECKS", page, panel_focus, 0),
        panel_title("PRESCRIBED ACTIONS & SAVINGS", page, panel_focus, 1),
        width,
        color=color,
    ))

    left_rows = signal_left_rows(frame, color)
    right_rows = signal_right_rows(frame, color)
    row_count = max(3, height - len(lines) - 1)
    for index in range(row_count):
        left_text = left_rows[index] if index < len(left_rows) else ""
        right_text = right_rows[index] if index < len(right_rows) else ""
        left = fit(focus_row(left_text, page, panel_focus, 0, index, panel_cursor, color), left_width)
        right = fit(focus_row(right_text, page, panel_focus, 1, index, panel_cursor, color), right_width)
        lines.append(split_row(left, right, color=color))

    status = status_line(frame, scope, filter_text, sort_mode, page=page, paused=paused, message=status_message, fetching=fetching, color=color, panel_focus=panel_focus, panel_cursor=panel_cursor)
    return finish_frame(lines, status, width, height, color)


def render_ops_page(
    frame: TuiFrame,
    *,
    width: int,
    height: int,
    color: bool,
    selected: int,
    scope: str,
    filter_text: str,
    sort_mode: str,
    page: str,
    paused: bool,
    status_message: str,
    fetching: bool,
    panel_focus: int = 0,
    panel_cursor: int = 0,
) -> str:
    inner = width - 2
    left_width = max(32, (inner // 2) - 1)
    right_width = inner - left_width - 1
    selected_host = frame.hosts[max(0, min(selected, max(0, len(frame.hosts) - 1)))] if frame.hosts else None
    lines = [top_border(frame_title("turbatop", color, width, frame), top_controls(frame, scope, color=color), width, color=color)]
    lines.append(wrap_line(" OPERATIONS  source, health, auth, and operator commands", inner, color=color))
    lines.append(wrap_line(" " + ops_summary_line(frame, selected_host), inner, color=color))
    lines.append(split_border(
        panel_title("SOURCE & HEALTH", page, panel_focus, 0),
        panel_title("SESSION & COMMANDS", page, panel_focus, 1),
        width,
        color=color,
    ))

    left_rows = ops_left_rows(frame)
    right_rows = ops_right_rows(frame, scope, filter_text, sort_mode, paused)
    row_count = max(3, height - len(lines) - 1)
    for index in range(row_count):
        left_text = left_rows[index] if index < len(left_rows) else ""
        right_text = right_rows[index] if index < len(right_rows) else ""
        left = fit(focus_row(left_text, page, panel_focus, 0, index, panel_cursor, color), left_width)
        right = fit(focus_row(right_text, page, panel_focus, 1, index, panel_cursor, color), right_width)
        lines.append(split_row(left, right, color=color))

    status = status_line(frame, scope, filter_text, sort_mode, page=page, paused=paused, message=status_message, fetching=fetching, color=color, panel_focus=panel_focus, panel_cursor=panel_cursor)
    return finish_frame(lines, status, width, height, color)


def render_compare_page(
    frame: TuiFrame,
    *,
    width: int,
    height: int,
    color: bool,
    selected: int,
    scope: str,
    filter_text: str,
    sort_mode: str,
    page: str,
    paused: bool,
    status_message: str,
    fetching: bool,
    panel_focus: int = 0,
    panel_cursor: int = 0,
) -> str:
    inner = width - 2
    left_width, right_width = split_widths(width)
    selected_host = frame.hosts[max(0, min(selected, max(0, len(frame.hosts) - 1)))] if frame.hosts else None
    levels = machine_l1_l6_rows(frame, selected_host)
    peers = machine_peer_rows(frame, selected_host)
    lines = [top_border(frame_title("turbatop", color, width, frame), top_controls(frame, scope, color=color), width, color=color)]
    lines.append(wrap_line(" MACHINE L1-L6  " + machine_compare_summary_line(frame, selected_host), inner, color=color))
    lines.append(wrap_line(" " + fleet_summary_line(frame), inner, color=color))
    lines.append(split_border(
        panel_title("MACHINE L1-L6 LADDER", page, panel_focus, 0),
        panel_title("PEER & FLEET CONTEXT", page, panel_focus, 1),
        width,
        color=color,
    ))
    row_count = max(6, height - len(lines) - 1)
    for index in range(row_count):
        left_text = render_machine_level(levels[index], left_width, color) if index < len(levels) else ""
        right_text = render_machine_peer(peers[index], right_width, color) if index < len(peers) else ""
        left = fit(focus_row(left_text, page, panel_focus, 0, index, panel_cursor, color), left_width)
        right = fit(focus_row(right_text, page, panel_focus, 1, index, panel_cursor, color), right_width)
        lines.append(split_row(left, right, color=color))
    status = status_line(frame, scope, filter_text, sort_mode, page=page, paused=paused, message=status_message, fetching=fetching, color=color, panel_focus=panel_focus, panel_cursor=panel_cursor)
    return finish_frame(lines, status, width, height, color)


def render_report_page(
    frame: TuiFrame,
    *,
    width: int,
    height: int,
    color: bool,
    selected: int,
    scope: str,
    filter_text: str,
    sort_mode: str,
    page: str,
    paused: bool,
    status_message: str,
    fetching: bool,
    panel_focus: int = 0,
    panel_cursor: int = 0,
) -> str:
    inner = width - 2
    left_width, right_width = split_widths(width)
    selected_host = frame.hosts[max(0, min(selected, max(0, len(frame.hosts) - 1)))] if frame.hosts else None
    report_rows = customer_report_rows(frame, left_width)
    context_rows = customer_report_context_rows(frame, selected_host)
    lines = [top_border(frame_title("turbatop", color, width, frame), top_controls(frame, scope, color=color), width, color=color)]
    lines.append(wrap_line(" CUSTOMER REPORT  " + customer_report_summary_line(frame), inner, color=color))
    lines.append(wrap_line(" " + report_source_line(frame), inner, color=color))
    lines.append(split_border(
        panel_title("CUSTOMER REPORT", page, panel_focus, 0),
        panel_title("CONTEXT INGESTED", page, panel_focus, 1),
        width,
        color=color,
    ))
    row_count = max(6, height - len(lines) - 1)
    for index in range(row_count):
        left_text = report_rows[index] if index < len(report_rows) else ""
        right_text = context_rows[index] if index < len(context_rows) else ""
        left = fit(focus_row(left_text, page, panel_focus, 0, index, panel_cursor, color), left_width)
        right = fit(focus_row(right_text, page, panel_focus, 1, index, panel_cursor, color), right_width)
        lines.append(split_row(left, right, color=color))
    status = status_line(frame, scope, filter_text, sort_mode, page=page, paused=paused, message=status_message, fetching=fetching, color=color, panel_focus=panel_focus, panel_cursor=panel_cursor)
    return finish_frame(lines, status, width, height, color)


def finish_frame(lines: list[str], status: str, width: int, height: int, color: bool) -> str:
    inner = width - 2
    while len(lines) < height - 1:
        lines.append(wrap_line("", inner, color=color))
    if len(lines) >= height:
        lines = lines[:height - 1]
    lines.append(bottom_border(status, width, color=color))
    return "\n".join(lines[:height]) + "\n"


def host_composition_line(frame: TuiFrame, selected_host: HostRow | None) -> str:
    accelerators = sum(1 for host in frame.hosts if host.accelerator)
    cpu_only = len(frame.hosts) - accelerators
    watch = sum(1 for host in frame.hosts if host.status != "ok")
    selected = selected_host.host_id if selected_host else "none"
    return (
        f"selected {selected} · accelerators {accelerators} · cpu-only {cpu_only} · "
        f"watch {watch} · avg pressure {pct(average([host_pressure(host) for host in frame.hosts]))}"
    )


def host_inspector_rows(frame: TuiFrame, host: HostRow | None, color: bool) -> list[str]:
    if host is None:
        return [" No host selected.", "", " Use arrows, wheel, or click a host row."]
    accelerator_label = "accelerator" if host.accelerator else "cpu-only"
    rows = [
        f" Host {host.host_id}",
        f" class {accelerator_label}   status {host.status}   pressure {pct(host_pressure(host))}",
        f" trend {sparkline(host.history or host_fallback_history(host), 12, color=color)}",
        "",
    ]
    if host.accelerator:
        rows.extend([
            metric_row("GPU", host.gpu, color),
            metric_row("HBM", host.hbm, color),
            metric_row("CPU", host.cpu, color),
            metric_row("RAM", host.ram, color),
            metric_row("NET", host.network, color),
        ])
    else:
        rows.extend([
            " accelerator none detected",
            metric_row("CPU", host.cpu, color),
            metric_row("RAM", host.ram, color),
            metric_row("NET", host.network, color),
        ])
    if host.detail:
        rows.extend(["", f" detail {host.detail}"])
    rows.extend([
        "",
        " Fleet mix",
        f" accelerators {sum(1 for item in frame.hosts if item.accelerator)}/{len(frame.hosts)}",
        f" cpu-only {sum(1 for item in frame.hosts if not item.accelerator)}/{len(frame.hosts)}",
    ])
    return rows


def metric_row(label: str, value: Any, color: bool) -> str:
    return f" {label:<4} {gauge(value, 14, color=color)} {pct(value):>4}"


def signal_summary_line(frame: TuiFrame, selected_host: HostRow | None) -> str:
    hot = selected_host.host_id if selected_host else "none"
    action_count = len(frame.actions)
    warning_count = len(frame.warnings)
    bottleneck = frame.bottlenecks[0][0] if frame.bottlenecks else "learning"
    return f"warnings {warning_count} · actions {action_count} · dominant {bottleneck} · selected {hot}"


def signal_left_rows(frame: TuiFrame, color: bool) -> list[str]:
    rows: list[str] = []
    warnings = frame.warnings or ["No warnings returned by API."]
    rows.append(" Warnings")
    rows.extend(" " + color_signal_text(warning, color) for warning in warnings)
    rows.append("")
    rows.append(" Bottlenecks")
    if frame.bottlenecks:
        rows.extend(render_bottleneck(row, 80, color).rstrip() for row in frame.bottlenecks)
    else:
        rows.append(" none reported")
    if frame.errors:
        rows.append("")
        rows.append(" API errors")
        rows.extend(f" {error}" for error in dedupe(frame.errors)[:6])
    return rows


def signal_right_rows(frame: TuiFrame, color: bool) -> list[str]:
    rows: list[str] = [" Actions"]
    if frame.actions:
        rows.extend(render_action(action, index + 1, 80, color).rstrip() for index, action in enumerate(frame.actions))
    else:
        rows.append(" none prescribed")
    rows.append("")
    rows.append(" Savings")
    rows.append(" " + (savings_line(frame.savings, color=color) if frame.savings else "no verified savings rows"))
    if frame.notices:
        rows.append("")
        rows.append(" Notices")
        rows.extend(f" {notice}" for notice in dedupe(frame.notices)[:6])
    return rows


def ops_summary_line(frame: TuiFrame, selected_host: HostRow | None) -> str:
    ready = str(frame.ready.get("status") or "unknown")
    source = data_source_label(frame)
    selected = selected_host.host_id if selected_host else "none"
    return f"ready {ready} · source {source} · selected {selected} · generated {compact_timestamp(frame.generated_at) if frame.generated_at else 'n/a'}"


def ops_left_rows(frame: TuiFrame) -> list[str]:
    ready = str(frame.ready.get("status") or "unknown")
    rows = [
        f" API {frame.api_url or 'n/a'}",
        f" source {data_source_label(frame)}",
        f" ready {ready}",
        f" generated {compact_timestamp(frame.generated_at) if frame.generated_at else 'n/a'}",
        f" fleet {frame.fleet}",
        f" hosts {len(frame.hosts)}",
        "",
        " Notices",
    ]
    notices = dedupe(frame.notices) or ["none"]
    rows.extend(f" {notice}" for notice in notices[:8])
    if frame.errors:
        rows.append("")
        rows.append(" Errors")
        rows.extend(f" {error}" for error in dedupe(frame.errors)[:8])
    return rows


def ops_right_rows(frame: TuiFrame, scope: str, filter_text: str, sort_mode: str, paused: bool) -> list[str]:
    rows = [
        f" scope {scope}",
        f" sort {sort_mode}",
        f" filter {filter_text or 'none'}",
        f" refresh {'paused' if paused else 'live'}",
        "",
        " Page controls",
        " ←/→ pages   1 overview   2 hosts   3 signals   4 ops   5 compare   6 report",
        " Tab panel focus   Shift-Tab previous panel   ] next page   [ previous page",
        "",
        " Host controls",
        " ↑/↓ move inside focused panel   wheel select   hosts page j/k navigate",
        " enter/click drill",
        " s sort   / filter   j/m/t/T/c scope",
        "",
        " Incident controls",
        " r refresh   p pause/resume   w snapshot   h help",
    ]
    if frame.savings:
        rows.extend(["", " Recovered", " " + savings_line(frame.savings)])
    return rows


def machine_compare_summary_line(frame: TuiFrame, host: HostRow | None) -> str:
    if host is None:
        return "waiting for a machine row"
    peer_count = len([item for item in frame.hosts if item.accelerator == host.accelerator]) - 1
    return (
        f"focus {host.host_id} · class {'accelerator' if host.accelerator else 'cpu-only'} · "
        f"pressure {pct(host_pressure(host))} · peers {max(0, peer_count)}"
    )


def machine_l1_l6_rows(frame: TuiFrame, host: HostRow | None) -> list[dict[str, Any]]:
    if host is None:
        return [
            machine_level("L1", "Machine", "waiting", "No host telemetry loaded.", None, "watch"),
            machine_level("L2", "Peer", "waiting", "Need at least one comparable machine.", None, "watch"),
            machine_level("L3", "Cohort", "waiting", "Need host-class telemetry.", None, "watch"),
            machine_level("L4", "Fleet", "waiting", "Need fleet host rows.", None, "watch"),
            machine_level("L5", "Workload", "waiting", "Need bottleneck and warning signals.", None, "watch"),
            machine_level("L6", "Customer", "waiting", "Need action or savings evidence.", None, "watch"),
        ]
    pressure = host_pressure(host)
    health = max(0.0, 100.0 - max(0.0, pressure))
    cohort = [item for item in frame.hosts if item.accelerator == host.accelerator]
    peers = [item for item in cohort if item is not host]
    peer_pressure = average([host_pressure(item) for item in peers])
    cohort_pressure = average([host_pressure(item) for item in cohort])
    ranked = sorted(frame.hosts, key=lambda item: (host_pressure(item), host_sort_key(item.host_id)))
    rank = ranked.index(host) + 1 if host in ranked else 1
    fleet_score = 100.0 if len(ranked) <= 1 else 100.0 * (1.0 - ((rank - 1) / max(1, len(ranked) - 1)))
    bottleneck_label_value = frame.bottlenecks[0] if frame.bottlenecks else ("learning", 0.0)
    top_action = frame.actions[0] if frame.actions else {}
    savings_value = first_number(frame.savings or {}, "dollars")
    action_value = first_number(top_action, "value", "predictedDollars", "recoveredDollars")
    customer_value = savings_value if savings_value is not None else action_value
    customer_score = first_number(frame.savings or {}, "realizationPct")
    if customer_score is None:
        customer_score = first_number(top_action, "confidence", "score")
        if customer_score is not None and customer_score <= 1:
            customer_score *= 100

    peer_detail = "Need another comparable machine."
    peer_value = "single host"
    peer_score: float | None = None
    peer_tone = "watch"
    if peer_pressure is not None:
        delta = pressure - peer_pressure
        peer_value = signed_points(delta)
        peer_detail = f"peer avg pressure {pct(peer_pressure)} across {len(peers)} machine{'s' if len(peers) != 1 else ''}"
        peer_score = max(0.0, min(100.0, 75.0 - delta))
        peer_tone = "good" if delta <= 5 else "watch" if delta <= 15 else "poor"

    cohort_detail = "Host class average unavailable."
    cohort_value = "n/a"
    cohort_score: float | None = None
    if cohort_pressure is not None:
        cohort_value = pct(cohort_pressure)
        cohort_detail = f"{'accelerator' if host.accelerator else 'cpu-only'} cohort pressure across {len(cohort)} host rows"
        cohort_score = max(0.0, 100.0 - cohort_pressure)

    warning_count = len(frame.warnings)
    action_count = len(frame.actions)
    bottleneck_score = float(bottleneck_label_value[1] or 0)
    customer_detail = f"{action_count} actions ranked"
    if frame.savings:
        customer_detail = f"{frame.savings.get('count', 0)} verified savings entries"

    return [
        machine_level("L1", "Machine", f"health {pct(health)}", machine_metric_detail(host), health, tone_for_good_score(health)),
        machine_level("L2", "Peer", peer_value, peer_detail, peer_score, peer_tone),
        machine_level("L3", "Cohort", cohort_value, cohort_detail, cohort_score, tone_for_good_score(cohort_score)),
        machine_level("L4", "Fleet", f"rank #{rank}/{max(1, len(ranked))}", f"lower pressure ranks first; score {pct(fleet_score)}", fleet_score, tone_for_good_score(fleet_score)),
        machine_level("L5", "Workload", str(bottleneck_label_value[0]), f"bottleneck {pct(bottleneck_score)} · warnings {warning_count}", max(0.0, 100.0 - bottleneck_score), "poor" if bottleneck_score >= 75 else "watch" if bottleneck_score >= 45 else "good"),
        machine_level("L6", "Customer", money(customer_value) if customer_value is not None else "n/a", customer_detail, customer_score, tone_for_good_score(customer_score)),
    ]


def machine_level(level: str, label: str, value: str, detail: str, score: float | None, tone: str) -> dict[str, Any]:
    return {
        "level": level,
        "label": label,
        "value": value,
        "detail": detail,
        "score": score,
        "tone": tone,
    }


def render_machine_level(row: dict[str, Any], width: int, color: bool) -> str:
    score = row.get("score")
    bar = gauge(score, 8, color=color) if score is not None else "░" * 8
    tone = str(row.get("tone") or "watch")
    level = ansi(str(row.get("level") or ""), tone_color(tone), enabled=color)
    return fit(f" {level:<2} {str(row.get('label') or ''):<9} {bar} {row.get('value')} · {row.get('detail')}", width)


def machine_peer_rows(frame: TuiFrame, host: HostRow | None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if host is not None:
        rows.append({
            "label": "Focus",
            "value": host.host_id,
            "detail": host_detail(host),
            "score": max(0.0, 100.0 - host_pressure(host)),
            "tone": tone_for_good_score(max(0.0, 100.0 - host_pressure(host))),
        })
    for index, peer in enumerate(sorted(frame.hosts, key=lambda item: (host_pressure(item), host_sort_key(item.host_id)))[:8], start=1):
        rows.append({
            "label": f"Peer {index}",
            "value": peer.host_id,
            "detail": f"{'accelerator' if peer.accelerator else 'cpu-only'} pressure {pct(host_pressure(peer))}",
            "score": max(0.0, 100.0 - host_pressure(peer)),
            "tone": "good" if peer.status == "ok" else "watch",
        })
    if not rows:
        rows.append({"label": "Peers", "value": "waiting", "detail": "No machine rows available.", "score": None, "tone": "watch"})
    return rows


def render_machine_peer(row: dict[str, Any], width: int, color: bool) -> str:
    score = row.get("score")
    bar = gauge(score, 7, color=color) if score is not None else "░" * 7
    label = ansi(str(row.get("label") or ""), tone_color(str(row.get("tone") or "watch")), enabled=color)
    return fit(f" {label:<8} {str(row.get('value') or ''):<16} {bar} {row.get('detail')}", width)


def machine_metric_detail(host: HostRow) -> str:
    if host.accelerator:
        return f"gpu {pct(host.gpu)} hbm {pct(host.hbm)} cpu {pct(host.cpu)} ram {pct(host.ram)} net {pct(host.network)}"
    return f"cpu-only cpu {pct(host.cpu)} ram {pct(host.ram)} net {pct(host.network)}"


def signed_points(value: float) -> str:
    sign = "+" if value >= 0 else ""
    return f"{sign}{round(value):.0f} pts"


def tone_for_good_score(score: Any) -> str:
    parsed = number(score)
    if parsed is None:
        return "watch"
    if parsed >= 70:
        return "good"
    if parsed >= 40:
        return "watch"
    return "poor"


def tone_color(tone: str) -> str:
    return {"good": "green", "poor": "red"}.get(tone, "amber")


def customer_report_summary_line(frame: TuiFrame) -> str:
    return (
        f"fleet {frame.fleet} · hosts {len(frame.hosts)} · warnings {len(frame.warnings)} · "
        f"actions {len(frame.actions)} · {llm_report_status(frame)}"
    )


def report_source_line(frame: TuiFrame) -> str:
    if frame.llm_report:
        return f"LLM generated by {frame.llm_report_model or 'configured model'} · context {frame.llm_report_fingerprint or 'n/a'}"
    if frame.llm_report_error:
        return f"LLM error {frame.llm_report_error}; showing deterministic customer draft"
    if frame.llm_report_model:
        return f"Press G to generate with {frame.llm_report_model} · context {frame.llm_report_fingerprint or 'pending'}"
    return "LLM endpoint not configured; showing deterministic customer draft and the ingested context"


def customer_report_rows(frame: TuiFrame, width: int) -> list[str]:
    text = frame.llm_report or fallback_customer_report(frame)
    return report_text_rows(text, width)


def report_text_rows(text: str, width: int) -> list[str]:
    rows: list[str] = []
    for raw_line in str(text or "").splitlines():
        line = raw_line.strip()
        if not line:
            rows.append("")
            continue
        if line.startswith("#"):
            line = line.lstrip("#").strip().upper()
        rows.extend(wrap_text_rows(line, max(20, width - 1), prefix=" "))
    return rows or [" No report text available."]


def fallback_customer_report(frame: TuiFrame) -> str:
    useful = first_number(frame.summary, "usefulComputePct", "usefulCompute", "useful_compute_pct")
    gpu_util = first_number(frame.summary, "gpuUtilPct", "gpuUtil", "gpu_util_pct")
    wasted = first_number(frame.summary, "wastedGpuHours", "wasted_gpu_hours")
    bottleneck = frame.bottlenecks[0][0] if frame.bottlenecks else str(frame.summary.get("dominantBottleneck") or "learning")
    top_action = frame.actions[0] if frame.actions else {}
    action_title = str(top_action.get("title") or top_action.get("label") or "Keep collecting evidence")
    lines = [
        "# Executive Summary",
        f"{frame.fleet} currently reports {len(frame.hosts)} host rows with useful compute at {pct(useful)} and GPU utilization at {pct(gpu_util)}. The dominant signal is {bottleneck}.",
        "",
        "# Observed Evidence",
        f"The TUI ingested {len(frame.warnings)} warnings, {len(frame.bottlenecks)} bottleneck rows, {len(frame.actions)} ranked actions, and {len(frame.hosts)} normalized host records from {data_source_label(frame)}.",
        "",
        "# Business Impact",
        f"Tracked waste is {short_hours(wasted)}. Verified savings are {savings_line(frame.savings) if frame.savings else 'not yet attached to this frame'}.",
        "",
        "# Machine Comparison",
        machine_l1_l6_rows(frame, frame.hosts[0] if frame.hosts else None)[0]["detail"],
        "",
        "# Next Actions",
        action_title,
    ]
    return "\n".join(lines)


def customer_report_context_rows(frame: TuiFrame, selected_host: HostRow | None) -> list[str]:
    rows = [
        f" LLM status {llm_report_status(frame)}",
        f" model {frame.llm_report_model or 'not configured'}",
        f" context fingerprint {frame.llm_report_fingerprint or 'pending'}",
        f" source {data_source_label(frame)}",
        f" generated {compact_timestamp(frame.generated_at) if frame.generated_at else 'n/a'}",
        "",
        " Ingested",
        f" hosts {len(frame.hosts)}",
        f" warnings {len(frame.warnings)}",
        f" bottlenecks {len(frame.bottlenecks)}",
        f" actions {len(frame.actions)}",
        f" savings {'yes' if frame.savings else 'no'}",
        "",
        " Evidence highlights",
    ]
    if selected_host:
        rows.append(f" selected {selected_host.host_id} pressure {pct(host_pressure(selected_host))}")
    if frame.bottlenecks:
        rows.append(f" top bottleneck {frame.bottlenecks[0][0]} {pct(frame.bottlenecks[0][1])}")
    if frame.warnings:
        rows.append(f" warning {frame.warnings[0]}")
    if frame.actions:
        rows.append(f" action {str(frame.actions[0].get('title') or frame.actions[0].get('label') or 'Action')}")
    if frame.llm_report_error:
        rows.extend(["", f" Error {frame.llm_report_error}"])
    if not frame.llm_report and not frame.llm_report_error and frame.llm_report_model:
        rows.extend(["", " Press G to generate LLM report."])
    elif not frame.llm_report and not frame.llm_report_error:
        rows.extend(["", " Configure --llm-url and --llm-model", " or TURBA_LLM_URL/TURBA_LLM_MODEL."])
    return rows


def llm_report_status(frame: TuiFrame) -> str:
    if frame.llm_report:
        return "LLM generated"
    if frame.llm_report_error:
        return "LLM error"
    if frame.llm_report_model:
        return "LLM ready"
    return "draft"


def wrap_text_rows(text: str, width: int, prefix: str = "") -> list[str]:
    wrapped = textwrap.wrap(str(text), width=max(10, width - visible_len(prefix)), replace_whitespace=True)
    return [prefix + line for line in (wrapped or [""])]


def render_help_frame(
    frame: TuiFrame,
    *,
    width: int,
    height: int,
    color: bool,
    scope: str,
    sort_mode: str,
    page: str,
    filter_text: str,
    paused: bool,
    status_message: str,
    snapshot_file: str,
    fetching: bool = False,
    panel_focus: int = 0,
    panel_cursor: int = 0,
) -> str:
    inner = width - 2
    lines = [top_border(frame_title("help", color, width, frame), top_controls(frame, scope, color=color), width, color=color)]
    rows = [
        "Keyboard",
        "  q quit   r refresh   p pause/resume   s sort   / filter   enter drill   h/? close help",
        "  left/right switch pages   1-6 switch pages   tab panel focus   shift-tab previous panel",
        "  ] next page   [ previous page",
        "  up/down move inside focused panel   k/J select hosts   hosts page j/k navigate",
        "  pageup/pagedown jump   g first   G generate on report / last elsewhere   w write snapshot",
        "",
        "Mouse",
        "  wheel selects hosts; click a host to select; click selected host or right-click to drill in",
        "  click bottom page tabs, host title/footer sort, scope/filter/pause/snapshot/help controls",
        "",
        "Pages",
        "  overview combines efficiency, hosts, warnings, bottlenecks, actions, and recovered savings",
        "  hosts expands the fleet table with selected-host inspector and fleet composition",
        "  signals gives warnings, bottlenecks, actions, savings, notices, and API errors more room",
        "  ops shows data source, readiness, generated time, session state, and incident commands",
        "  compare shows the selected machine across L1-L6 plus peer and fleet context",
        "  report shows an LLM-generated customer report when configured, with deterministic fallback",
        "",
        "Host Rendering",
        "  accelerator hosts show GPU/HBM plus CPU/RAM/NET when space allows",
        "  CPU-only hosts show CPU/RAM/NET pressure and never synthesize GPU/HBM",
        "",
        "Operations",
        f"  refresh: {'paused' if paused else 'live'} at current interval; manual r still fetches while paused",
        f"  page: {page}   panel: {panel_label(page, panel_focus)} row:{panel_cursor + 1}   sort: {sort_mode}   filter: {filter_text or 'none'}   snapshot: {snapshot_file or 'not configured'}",
    ]
    for row in rows:
        lines.append(wrap_line(" " + row, inner, color=color))
    status = status_line(frame, scope, filter_text, sort_mode, page=page, paused=paused, message=status_message, fetching=fetching, color=color, panel_focus=panel_focus, panel_cursor=panel_cursor)
    return finish_frame(lines, status, width, height, color)


def layout_state(
    frame: TuiFrame,
    width: int,
    height: int,
    selected: int,
    filter_text: str,
    sort_mode: str,
    drill: bool = False,
    page: str = "overview",
) -> LayoutState:
    inner = max(0, width - 2)
    left_width = max(32, (inner // 2) - 1)
    right_width = inner - left_width - 1
    selected = max(0, min(selected, max(0, len(frame.hosts) - 1)))
    selected_host = frame.hosts[selected] if frame.hosts else None
    host_rows = display_hosts(frame.hosts, filter_text, sort_mode)
    selected_visible = index_of_host(host_rows, selected_host)
    page_name = normalize_page(page)
    if page_name == "hosts":
        visible_host_count = max(3, height - 5)
        host_start_y = 5
    elif page_name == "overview":
        visible_host_count = max(3, min(8, height - 18))
        host_start_y = 7
    else:
        visible_host_count = max(3, min(8, height - 16))
        host_start_y = 5
    scroll_start = scroll_start_for(selected_visible, visible_host_count, len(host_rows))
    return LayoutState(
        host_rows=host_rows,
        selected_host=selected_host,
        visible_host_count=visible_host_count,
        scroll_start=scroll_start,
        left_width=left_width,
        right_width=right_width,
        host_start_y=host_start_y,
        status_y=height,
    )


def panel_row_count(frame: TuiFrame, height: int, visible_host_count: int) -> int:
    lines_before_panel_rows = 5 + visible_host_count
    return max(4, min(7, height - lines_before_panel_rows - 4))


def render_host(host: HostRow | None, *, selected: bool, width: int, color: bool) -> str:
    if host is None:
        return fit("", width)
    dot = colored_host_dot(host, color)
    status = colored_status(host.status, color)
    trend = sparkline(host.history or host_fallback_history(host), 5, color=color)
    prefix = "▸" if selected else " "
    if not host.accelerator:
        if width >= 86:
            body = (
                f"{prefix} {dot} {host.host_id:<12}"
                f" {trend}"
                f" CPU {gauge(host.cpu, 4, color=color)} {pct(host.cpu):>4}"
                f" RAM {gauge(host.ram, 3, color=color)} {pct(host.ram):>4}"
                f" NET {gauge(host.network, 3, color=color)} {pct(host.network):>4}"
                f" P {pct(host_pressure(host)):>4}"
                f" {status}"
            )
        elif width >= 68:
            body = (
                f"{prefix} {dot} {host.host_id:<11}"
                f" {trend}"
                f" CPU {gauge(host.cpu, 4, color=color)} {pct(host.cpu):>4}"
                f" RAM {gauge(host.ram, 3, color=color)} {pct(host.ram):>4}"
                f" P {pct(host_pressure(host)):>4}"
                f" {status}"
            )
        else:
            body = (
                f"{prefix} {dot} {host.host_id:<10}"
                f" CPU {gauge(host.cpu, 5, color=color)} {pct(host.cpu):>5}"
                f" RAM {gauge(host.ram, 4, color=color)} {pct(host.ram):>5}"
                f" {status}"
            )
        return fit(body, width)
    if width >= 86:
        body = (
            f"{prefix} {dot} {host.host_id:<12}"
            f" {trend}"
            f" GPU {gauge(host.gpu, 4, color=color)} {pct(host.gpu):>4}"
            f" HBM {gauge(host.hbm, 3, color=color)} {pct(host.hbm):>4}"
            f" CPU {gauge(host.cpu, 3, color=color)} {pct(host.cpu):>4}"
            f" RAM {gauge(host.ram, 3, color=color)} {pct(host.ram):>4}"
            f" NET {gauge(host.network, 2, color=color)} {pct(host.network):>4}"
            f" {status}"
        )
    elif width >= 68:
        body = (
            f"{prefix} {dot} {host.host_id:<11}"
            f" {trend}"
            f" GPU {gauge(host.gpu, 4, color=color)} {pct(host.gpu):>4}"
            f" HBM {gauge(host.hbm, 3, color=color)} {pct(host.hbm):>4}"
            f" P {pct(host_pressure(host)):>4}"
            f" {status}"
        )
    else:
        body = (
            f"{prefix} {dot} {host.host_id:<10}"
            f" GPU {gauge(host.gpu, 5, color=color)} {pct(host.gpu):>5}"
            f" HBM {gauge(host.hbm, 4, color=color)} {pct(host.hbm):>5}"
            f" {status}"
        )
    return fit(body, width)


def host_fallback_history(host: HostRow) -> list[float]:
    if host.accelerator and host.gpu is not None:
        return [host.gpu]
    if not host.accelerator and host.cpu is not None:
        return [host.cpu]
    return []


def colored_host_dot(host: HostRow, color: bool) -> str:
    if host.status == "ok":
        return ansi("●", "green", enabled=color)
    return ansi("▲", "amber", enabled=color)


def colored_status(status: str, color: bool) -> str:
    return ansi(status, "green" if status == "ok" else "amber", enabled=color)


def render_bottleneck(row: tuple[str, float] | None, width: int, color: bool) -> str:
    if row is None:
        return fit("", width)
    label, value = row
    return fit(f" {label:<14} {gauge(value, 12, color=color)} {round(value):>3}", width)


def render_action(action: dict[str, Any] | None, index: int, width: int, color: bool) -> str:
    if action is None:
        return fit("", width)
    title = str(action.get("title") or action.get("label") or "Action")
    value = first_number(action, "value", "predictedDollars", "recoveredDollars")
    gpu_hours = first_number(action, "gpuHours", "predictedGpuHours", "recoveredGpuHours")
    confidence = first_number(action, "confidence", "score")
    bits = [f"{index}", title]
    if confidence is not None and width >= 54:
        bits.append(gauge(confidence * 100 if confidence <= 1 else confidence, 5, color=color))
    if value is not None:
        bits.append(money(value))
    if gpu_hours is not None:
        bits.append(hours(gpu_hours))
    if confidence is not None:
        bits.append(f"{round(confidence * 100 if confidence <= 1 else confidence)}%")
    return fit(" " + "  ".join(bits), width)


def render_action_or_recovered(frame: TuiFrame, index: int, width: int, color: bool) -> str:
    if index < len(frame.actions):
        return render_action(frame.actions[index], index + 1, width, color)
    if frame.savings and index == len(frame.actions):
        return fit(" Recovered  " + savings_line(frame.savings, color=color), width)
    return fit("", width)


def tiny_frame(width: int, color: bool, errors: list[str]) -> str:
    message = "turbatop needs at least 64x16; enlarge terminal."
    status = errors[0] if errors else "waiting for API data"
    return "\n".join([
        "┌" + "─" * (width - 2) + "┐",
        wrap_line(" " + message, width - 2, color=color),
        wrap_line(" " + status, width - 2, color=color),
        "└" + "─" * (width - 2) + "┘",
    ]) + "\n"


def top_border(left: str, right: str, width: int, color: bool = False) -> str:
    content_width = width - 2
    left = f" {left} "
    right = f" {right} "
    fill = max(0, content_width - visible_len(left) - visible_len(right))
    if not color:
        return "┌" + left + "─" * fill + right + "┐"
    right_text = right if "\033[" in right else ansi(right, "muted", enabled=True)
    return (
        ansi("┌", "border", enabled=True)
        + ansi(left, "title", enabled=True)
        + gradient_rule(fill, enabled=True)
        + right_text
        + ansi("┐", "border", enabled=True)
    )


def split_border(left: str, right: str, width: int, color: bool = False) -> str:
    left_width, right_width = split_widths(width)
    if not color:
        return "├" + section_title(left, left_width) + "┬" + section_title(right, right_width) + "┤"
    return (
        ansi("├", "border", enabled=True)
        + section_title(left, left_width, color=True)
        + ansi("┬", "border", enabled=True)
        + section_title(right, right_width, color=True)
        + ansi("┤", "border", enabled=True)
    )


def split_widths(width: int) -> tuple[int, int]:
    inner = max(0, width - 2)
    left_width = max(32, (inner // 2) - 1)
    right_width = inner - left_width - 1
    return left_width, right_width


def overview_hero_widths(width: int) -> tuple[int, int]:
    inner = max(0, width - 2)
    right_width = min(38, max(30, inner // 3))
    left_width = max(32, inner - right_width - 1)
    return left_width, inner - left_width - 1


def asymmetric_border(left: str, right: str, left_width: int, right_width: int, color: bool = False) -> str:
    if not color:
        return "├" + section_title(left, left_width) + "┬" + section_title(right, right_width) + "┤"
    return (
        ansi("├", "border", enabled=True)
        + section_title(left, left_width, color=True)
        + ansi("┬", "border", enabled=True)
        + section_title(right, right_width, color=True)
        + ansi("┤", "border", enabled=True)
    )


def asymmetric_row(left: str, right: str, left_width: int, right_width: int, color: bool = False) -> str:
    left_text = fit(left, left_width)
    right_text = fit(right, right_width)
    if not color:
        return f"│{left_text}│{right_text}│"
    border = ansi("│", "border", enabled=True)
    return border + left_text + border + right_text + border


def mid_border(title: str, width: int, color: bool = False) -> str:
    if not color:
        return "├" + section_title(title, width - 2) + "┤"
    return ansi("├", "border", enabled=True) + section_title(title, width - 2, color=True) + ansi("┤", "border", enabled=True)


def bottom_border(status: str, width: int, color: bool = False) -> str:
    text = " " + fit(status, width - 4) + " "
    fill = max(0, width - 2 - visible_len(text))
    if not color:
        return "└" + text + "─" * fill + "┘"
    return ansi("└", "border", enabled=True) + text + gradient_rule(fill, enabled=True) + ansi("┘", "border", enabled=True)


def section_title(title: str, width: int, color: bool = False) -> str:
    text = f" {title} "
    fill = max(0, width - visible_len(text))
    if not color:
        return text + "─" * fill
    return ansi(" ", "border", enabled=True) + ansi(title, "title", enabled=True) + ansi(" ", "border", enabled=True) + gradient_rule(fill, enabled=True)


def wrap_line(text: str, width: int, color: bool) -> str:
    if not color:
        return "│" + fit(text, width) + "│"
    return ansi("│", "border", enabled=True) + fit(text, width) + ansi("│", "border", enabled=True)


def split_row(left: str, right: str, *, color: bool) -> str:
    if not color:
        return f"│{left}│{right}│"
    border = ansi("│", "border", enabled=True)
    return border + left + border + right + border


def top_controls(frame: TuiFrame, scope: str, color: bool = False) -> str:
    heartbeat = heartbeat_indicator(frame, color=color)
    heartbeat_bit = f"   {heartbeat}" if heartbeat else ""
    return f"fleet: {frame.fleet}{heartbeat_bit}   ⟳ {scope}   h help   q quit"


def heartbeat_indicator(frame: TuiFrame, color: bool = False) -> str:
    if not frame.heartbeat_active:
        return ansi("♡", "muted", enabled=color) + ansi(" idle", "muted", enabled=color) if color else "♡ idle"
    icon = "♥" if frame.heartbeat_phase % 2 == 0 else "♡"
    if not color:
        return f"{icon} new data"
    return ansi(icon, "red", enabled=True) + ansi(" new data", "green", enabled=True)


def title_heartbeat(frame: TuiFrame | None, color: bool = False) -> str:
    if frame is None:
        return ""
    icon = "♥" if frame.heartbeat_active and frame.heartbeat_phase % 2 == 0 else "♡"
    if not color:
        return " " + icon
    return " " + ansi(icon, "red" if frame.heartbeat_active else "muted", enabled=True)


def frame_title(section: str, color: bool, width: int, frame: TuiFrame | None = None) -> str:
    heartbeat = title_heartbeat(frame, color=color)
    if not color:
        return "t turbalance" + heartbeat + " · " + section
    if width >= 104:
        return "▟█▙  t turbalance" + heartbeat + " · " + section + "  ▜█▛"
    return "▟█▙ t" + heartbeat + " · " + section


def status_line(
    frame: TuiFrame,
    scope: str,
    filter_text: str,
    sort_mode: str = "fleet",
    *,
    page: str = "overview",
    paused: bool = False,
    message: str = "",
    fetching: bool = False,
    color: bool = False,
    panel_focus: int = 0,
    panel_cursor: int = 0,
) -> str:
    panel_bit = footer_token(f"panel:{panel_label(page, panel_focus)} row:{panel_cursor + 1}", "purple", color)
    prefix = page_tabs(page, color=color) + "   " + panel_bit + "   "
    status_prefix = page_tabs(page, color=color) + "   "
    if message:
        return status_prefix + color_status_text("status: " + message, "blue", color)
    if frame.errors:
        return status_prefix + color_status_text("status: " + "; ".join(dedupe(frame.errors)[:2]), "red", color)
    visible_notices = [
        notice for notice in frame.notices
        if frame.hosts and notice.startswith("showing ")
    ]
    if visible_notices:
        return status_prefix + color_status_text("status: " + "; ".join(dupe_safe_status(visible_notices + auth_notices(frame.notices))[:2]), "amber", color)
    filter_bit = f" filter:{filter_text}" if filter_text else ""
    pause_bit = "p resume" if paused else "p pause"
    fetch_bit = "refreshing   " if fetching else ""
    edge_hint = "G generate report   g first" if normalize_page(page) == "report" else "g/G edge"
    return (
        prefix +
        footer_token(f"s sort:{sort_mode}", "cyan", color) + "   "
        + footer_token(pause_bit, "green" if paused else "amber", color) + "   "
        + footer_token("w snap", "purple", color) + "   "
        + footer_token("h help", "magenta", color) + "   "
        + footer_token(f"/ filter{filter_bit}", "blue", color) + "   "
        + ansi("scope: ", "muted", enabled=color)
        + footer_token("[j]ob", "cyan", color) + " "
        + footer_token("[m]odel", "cyan", color) + " "
        + footer_token("[t]eam", "cyan", color) + " "
        + footer_token("[tenant]", "title", color) + " "
        + footer_token("[c]luster", "cyan", color) + "   "
        + color_status_text(f"{fetch_bit}tab panel   ↑↓/wheel select   enter/click drill   {edge_hint}", "muted", color)
    )


def page_tabs(page: str, color: bool = False) -> str:
    labels = [
        footer_token(label, "magenta" if name == normalize_page(page) else "muted", color)
        for name, label in page_tab_labels(page)
    ]
    return ansi("pages ", "muted", enabled=color) + " ".join(labels)


def page_tab_labels(page: str) -> list[tuple[str, str]]:
    current = normalize_page(page)
    return [
        (name, f"[{index}]{name}" if name == current else f"{index}:{PAGE_SHORT_LABELS.get(name, name)}")
        for index, name in enumerate(PAGES, start=1)
    ]


def fleet_summary_line(frame: TuiFrame) -> str:
    ok_count = sum(1 for host in frame.hosts if host.status == "ok")
    watch_count = len(frame.hosts) - ok_count
    accelerator_count = sum(1 for host in frame.hosts if host.accelerator)
    hottest = max(frame.hosts, key=host_pressure, default=None)
    pressure = host_pressure(hottest) if hottest else None
    bits = [
        f"FLEET  hosts {len(frame.hosts)}",
        f"accel {accelerator_count}",
        f"ok {ok_count}",
        f"watch {watch_count}",
        f"avg cpu {pct(average([host.cpu for host in frame.hosts]))}",
        f"ram {pct(average([host.ram for host in frame.hosts]))}",
        f"net {pct(average([host.network for host in frame.hosts]))}",
    ]
    if hottest:
        bits.append(f"hot {hottest.host_id} {pct(pressure)}")
    bits.append(f"source {data_source_label(frame)}")
    if frame.generated_at:
        bits.append(f"asof {compact_timestamp(frame.generated_at)}")
    return " · ".join(bits)


def data_source_label(frame: TuiFrame) -> str:
    if any("showing live bundle fallback" in notice for notice in frame.notices):
        return "bundle-fallback"
    if any("merged live bundle hosts" in notice for notice in frame.notices):
        return "api+bundle"
    ready_status = str(frame.ready.get("status") or "").lower()
    if ready_status == "live-bundle":
        return "bundle"
    return "api"


def compact_timestamp(value: str) -> str:
    text = str(value)
    match = re.match(r"(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})", text)
    if match:
        return f"{match.group(2)}/{match.group(3)} {match.group(4)}:{match.group(5)}Z"
    return text[:16]


def host_section_title(start: int, count: int, total: int, sort_mode: str) -> str:
    if total <= 0:
        return f"HOSTS sort:{sort_mode}"
    end = min(total, start + count)
    return f"HOSTS {start + 1}-{end}/{total} sort:{sort_mode}"


def display_hosts(hosts: list[HostRow], filter_text: str, sort_mode: str) -> list[HostRow]:
    return sort_hosts(filtered_hosts(hosts, filter_text), sort_mode)


def sort_hosts(hosts: list[HostRow], sort_mode: str) -> list[HostRow]:
    mode = normalize_sort_mode(sort_mode)
    if mode == "gpu":
        return sorted(hosts, key=lambda host: missing_low(host.gpu if host.accelerator else None), reverse=True)
    if mode == "cpu":
        return sorted(hosts, key=lambda host: missing_low(host.cpu), reverse=True)
    if mode == "ram":
        return sorted(hosts, key=lambda host: missing_low(host.ram), reverse=True)
    if mode == "net":
        return sorted(hosts, key=lambda host: missing_low(host.network), reverse=True)
    if mode == "pressure":
        return sorted(hosts, key=host_pressure, reverse=True)
    if mode == "status":
        return sorted(hosts, key=lambda host: (0 if host.status != "ok" else 1, host_sort_key(host.host_id)))
    return sorted(hosts, key=lambda host: host_sort_key(host.host_id))


def normalize_sort_mode(sort_mode: str) -> str:
    return sort_mode if sort_mode in SORT_MODES else "fleet"


def next_sort_mode(sort_mode: str) -> str:
    mode = normalize_sort_mode(sort_mode)
    return SORT_MODES[(SORT_MODES.index(mode) + 1) % len(SORT_MODES)]


def normalize_page(page: str) -> str:
    return page if page in PAGES else "overview"


def next_page(page: str, delta: int = 1) -> str:
    current = normalize_page(page)
    return PAGES[(PAGES.index(current) + delta) % len(PAGES)]


def panel_count(page: str) -> int:
    return len(PAGE_PANELS.get(normalize_page(page), PAGE_PANELS["overview"]))


def normalize_panel_focus(page: str, panel_focus: int) -> int:
    count = panel_count(page)
    if count <= 0:
        return 0
    return panel_focus % count


def next_panel_focus(page: str, panel_focus: int, delta: int = 1) -> int:
    return normalize_panel_focus(page, panel_focus + delta)


def panel_label(page: str, panel_focus: int) -> str:
    panels = PAGE_PANELS.get(normalize_page(page), PAGE_PANELS["overview"])
    if not panels:
        return "panel"
    return panels[normalize_panel_focus(page, panel_focus)]


def panel_title(title: str, page: str, panel_focus: int, panel_index: int) -> str:
    return f"▣ {title}" if normalize_panel_focus(page, panel_focus) == panel_index else title


def focus_row(text: Any, page: str, panel_focus: int, panel_index: int, row_index: int, panel_cursor: int, color: bool) -> str:
    raw = str(text)
    if normalize_panel_focus(page, panel_focus) != panel_index or row_index != panel_cursor:
        return raw
    marker = ansi("▸", "magenta", enabled=color)
    if raw.startswith("  "):
        return marker + raw[1:]
    if raw.startswith(" "):
        return marker + raw
    return marker + " " + raw


def panel_state_key(page: str, panel_focus: int) -> str:
    return f"{normalize_page(page)}:{panel_label(page, panel_focus)}"


def panel_moves_hosts(page: str, panel_focus: int) -> bool:
    page_name = normalize_page(page)
    focus = normalize_panel_focus(page_name, panel_focus)
    return (page_name == "overview" and focus == 2) or (page_name == "hosts" and focus == 0)


def move_panel_cursor(
    frame: TuiFrame,
    page: str,
    panel_focus: int,
    panel_cursor: int,
    delta: int,
    *,
    width: int,
    height: int,
    selected: int,
    filter_text: str,
    sort_mode: str,
    drill: bool,
    scope: str,
    paused: bool,
) -> int:
    count = panel_item_count(
        frame,
        page,
        panel_focus,
        width=width,
        height=height,
        selected=selected,
        filter_text=filter_text,
        sort_mode=sort_mode,
        drill=drill,
        scope=scope,
        paused=paused,
    )
    if count <= 1:
        return 0
    return max(0, min(count - 1, panel_cursor + delta))


def panel_item_count(
    frame: TuiFrame,
    page: str,
    panel_focus: int,
    *,
    width: int,
    height: int,
    selected: int,
    filter_text: str,
    sort_mode: str,
    drill: bool,
    scope: str,
    paused: bool,
) -> int:
    page_name = normalize_page(page)
    focus = normalize_panel_focus(page_name, panel_focus)
    if page_name == "overview":
        if focus in (0, 1):
            return 4
        if focus == 2:
            return len(display_hosts(frame.hosts, filter_text, sort_mode))
        if focus == 3:
            return len(frame.warnings or ["No warnings returned by API."])
        if focus == 4:
            return max(1, len(frame.bottlenecks))
        return max(1, len(frame.actions) + (1 if frame.savings else 0))
    if page_name == "hosts":
        if focus == 0:
            return len(display_hosts(frame.hosts, filter_text, sort_mode))
        selected_host = frame.hosts[max(0, min(selected, max(0, len(frame.hosts) - 1)))] if frame.hosts else None
        return len(host_inspector_rows(frame, selected_host, False))
    if page_name == "signals":
        return len(signal_left_rows(frame, False)) if focus == 0 else len(signal_right_rows(frame, False))
    if page_name == "ops":
        return len(ops_left_rows(frame)) if focus == 0 else len(ops_right_rows(frame, scope, filter_text, sort_mode, paused))
    if page_name == "compare":
        selected_host = frame.hosts[max(0, min(selected, max(0, len(frame.hosts) - 1)))] if frame.hosts else None
        return len(machine_l1_l6_rows(frame, selected_host)) if focus == 0 else len(machine_peer_rows(frame, selected_host))
    if page_name == "report":
        selected_host = frame.hosts[max(0, min(selected, max(0, len(frame.hosts) - 1)))] if frame.hosts else None
        return len(customer_report_rows(frame, max(32, (width - 2) // 2))) if focus == 0 else len(customer_report_context_rows(frame, selected_host))
    return 1


def page_for_key(key: str) -> str | None:
    if key in {str(index) for index in range(1, len(PAGES) + 1)}:
        return PAGES[int(key) - 1]
    return None


def host_navigation_delta(page: str, key: str) -> int | None:
    if key in ("up", "k"):
        return -1
    if key in ("down", "J"):
        return 1
    if normalize_page(page) == "hosts" and key == "j":
        return 1
    return None


def page_navigation_delta(key: str) -> int | None:
    if key == "left":
        return -1
    if key == "right":
        return 1
    return None


def host_pressure(host: HostRow | None) -> float:
    if host is None:
        return -1
    values = [host.cpu, host.ram, host.network]
    if host.accelerator:
        values.extend([host.gpu, host.hbm])
    clean = [value for value in values if number(value) is not None]
    return max(clean) if clean else -1


def missing_low(value: Any) -> float:
    parsed = number(value)
    return parsed if parsed is not None else -1


def index_of_host(hosts: list[HostRow], host: HostRow | None) -> int:
    if host is None:
        return 0
    try:
        return hosts.index(host)
    except ValueError:
        return 0


def scroll_start_for(selected: int, visible_count: int, total: int) -> int:
    if total <= visible_count:
        return 0
    selected = max(0, min(selected, total - 1))
    half = max(1, visible_count // 2)
    return max(0, min(selected - half, total - visible_count))


def savings_line(savings: dict[str, Any], color: bool = False) -> str:
    realization = first_number(savings, "realizationPct")
    return (
        f"✓ {money(first_number(savings, 'dollars'))} / {hours(first_number(savings, 'gpuHours'))} verified"
        f" · realization {pct(realization)}  {sparkline(savings.get('history') or [], 8, color=color)}"
    )


def host_detail(host: HostRow) -> str:
    trend = sparkline(host.history or host_fallback_history(host), 8)
    pressure = pct(host_pressure(host))
    if not host.accelerator:
        return (
            f"class=cpu-only pressure={pressure} trend={trend} cpu={pct(host.cpu)} "
            f"ram={pct(host.ram)} network={pct(host.network)} status={host.status} {host.detail}"
        )
    return (
        f"class=accelerator pressure={pressure} trend={trend} gpu={pct(host.gpu)} "
        f"hbm={pct(host.hbm)} cpu={pct(host.cpu)} ram={pct(host.ram)} "
        f"network={pct(host.network)} status={host.status} {host.detail}"
    )


def sparkline(values: list[Any], width: int = 8, *, color: bool = False) -> str:
    clean = [float(value) for value in values if number(value) is not None]
    if width <= 0:
        return ""
    if not clean:
        body = " " * width
        return ansi("▕", "empty", enabled=color) + body + ansi("▏", "empty", enabled=color)
    if len(clean) == 1:
        clean = clean * width
    if len(clean) > width:
        step = len(clean) / width
        clean = [clean[min(len(clean) - 1, int(index * step))] for index in range(width)]
    elif len(clean) < width:
        clean = ([clean[0]] * (width - len(clean))) + clean
    low = min(clean)
    high = max(clean)
    span = high - low
    chars = []
    for value in clean:
        idx = 0 if span <= 0 else int(round((value - low) / span * (len(BLOCKS) - 1)))
        block = BLOCKS[max(0, min(len(BLOCKS) - 1, idx))]
        if color:
            chars.append(ansi(block, SPARK_COLORS[min(len(SPARK_COLORS) - 1, idx * len(SPARK_COLORS) // len(BLOCKS))], enabled=True))
        else:
            chars.append(block)
    return ansi("▕", "border", enabled=color) + "".join(chars) + ansi("▏", "border", enabled=color)


def gauge(value: Any, width: int = 10, *, color: bool = True) -> str:
    parsed = number(value)
    if parsed is None:
        return ansi("░" * width, "empty", enabled=color) if color else "░" * width
    parsed = bounded(parsed)
    filled = int(round(parsed / 100 * width))
    if not color:
        return "█" * filled + "░" * max(0, width - filled)
    parts = []
    for index in range(width):
        if index >= filled:
            parts.append(ansi("░", "empty", enabled=True))
            continue
        ratio = (index + 1) / max(1, width)
        if parsed >= 90 and ratio > 0.72:
            name = "red"
        elif parsed >= 70 and ratio > 0.55:
            name = "amber"
        elif ratio < 0.35:
            name = "cyan"
        elif ratio < 0.7:
            name = "green"
        else:
            name = "purple"
        parts.append(ansi("█", name, enabled=True))
    return "".join(parts)


def ansi(text: str, name: str, *, enabled: bool) -> str:
    if not enabled:
        return text
    return f"\033[{PALETTE[name]}m{text}\033[0m"


def gradient_rule(width: int, *, enabled: bool) -> str:
    if width <= 0:
        return ""
    if not enabled:
        return "─" * width
    return "".join(ansi("─", RULE_COLORS[index % len(RULE_COLORS)], enabled=True) for index in range(width))


def footer_token(text: str, name: str, color: bool) -> str:
    return ansi(text, name, enabled=color)


def color_status_text(text: str, name: str, color: bool) -> str:
    return ansi(text, name, enabled=color)


def color_signal_text(text: str, color: bool) -> str:
    if not color:
        return text
    stripped = str(text)
    if stripped.startswith("⚠") or stripped.startswith("△"):
        return ansi(stripped, "amber", enabled=True)
    if stripped.startswith("✓"):
        return ansi(stripped, "green", enabled=True)
    if "HTTP 401" in stripped or "Unauthorized" in stripped or "error" in stripped.lower():
        return ansi(stripped, "red", enabled=True)
    if stripped.startswith("•"):
        return ansi(stripped, "cyan", enabled=True)
    return ansi(stripped, "fg", enabled=True)


def visible_len(text: str) -> int:
    count = 0
    index = 0
    while index < len(text):
        if text[index] == "\033":
            end = text.find("m", index)
            index = len(text) if end == -1 else end + 1
            continue
        count += 1
        index += 1
    return count


def fit(text: Any, width: int) -> str:
    raw = str(text)
    if visible_len(raw) <= width:
        return raw + " " * (width - visible_len(raw))
    out = ""
    count = 0
    index = 0
    while index < len(raw) and count < max(0, width - 1):
        if raw[index] == "\033":
            end = raw.find("m", index)
            if end == -1:
                break
            out += raw[index:end + 1]
            index = end + 1
            continue
        out += raw[index]
        count += 1
        index += 1
    reset = "\033[0m" if "\033[" in out and not out.endswith("\033[0m") else ""
    return out + reset + "…"


def pct(value: Any) -> str:
    parsed = number(value)
    return "n/a" if parsed is None else f"{round(parsed):.0f}%"


def hours(value: Any) -> str:
    parsed = number(value)
    if parsed is None:
        return "n/a GPU-hrs"
    return f"{parsed:,.0f} GPU-hrs"


def short_hours(value: Any) -> str:
    parsed = number(value)
    if parsed is None:
        return "n/a h"
    return f"{parsed:,.0f}h"


def money(value: Any) -> str:
    parsed = number(value)
    if parsed is None:
        return "$n/a"
    if abs(parsed) >= 1000:
        return f"${parsed / 1000:.1f}k"
    return f"${parsed:,.0f}"


def money_per_hour(value: Any) -> str:
    parsed = number(value)
    return "$n/a/ugh" if parsed is None else f"${parsed:,.0f}/ugh"


def bounded(value: float) -> float:
    return max(0.0, min(100.0, float(value)))


def average(values: list[Any]) -> float | None:
    clean = [float(value) for value in values if number(value) is not None]
    return sum(clean) / len(clean) if clean else None


def number(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(parsed) or math.isinf(parsed):
        return None
    return parsed


def first_number(row: dict[str, Any], *keys: str) -> float | None:
    for key in keys:
        parsed = number(row.get(key))
        if parsed is not None:
            return parsed
    return None


def normalize_ratio_percent(value: Any) -> float | None:
    parsed = number(value)
    if parsed is None:
        return None
    if 0 <= parsed <= 1:
        return parsed * 100
    return parsed


def normalize_host_ids(host_payload: Any) -> list[str]:
    rows = host_payload.get("hosts", []) if isinstance(host_payload, dict) else host_payload
    if not isinstance(rows, list):
        return []
    ids = []
    for row in rows:
        if isinstance(row, str):
            ids.append(row)
        elif isinstance(row, dict):
            ids.append(str(row.get("hostId") or row.get("host_id") or row.get("id") or ""))
    return [item for item in dedupe(ids) if item]


def host_sort_key(host_id: str) -> tuple[int, Any, str]:
    label = host_id.lower()
    if "nuc" in label:
        match = re.search(r"nuc(\d+)", label)
        return (0, int(match.group(1)) if match else 0, label)
    if label.startswith("spark"):
        match = re.search(r"spark(\d+)", label)
        return (1, int(match.group(1)) if match else 0, label)
    if label.startswith("pi"):
        match = re.search(r"pi(\d+)", label)
        return (2, int(match.group(1)) if match else 0, label)
    chunks = [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", label)]
    return (3, chunks, label)


def rows_from(payload: Any) -> list[dict[str, Any]]:
    rows = payload.get("rows", []) if isinstance(payload, dict) else payload
    return [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []


def latest_row(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {}
    return sorted(rows, key=lambda row: str(row.get("event_ts") or row.get("timestamp") or ""))[-1]


def host_status(row: dict[str, Any]) -> str:
    explicit = str(row.get("status") or "").lower()
    if explicit:
        return explicit
    if str(row.get("reachable") or "true").lower() == "false":
        return "watch"
    return "ok"


def infer_accelerator(host_id: str, row: dict[str, Any]) -> bool:
    explicit = first_present(row, "accelerator", "hasAccelerator", "has_accelerator", "hasGpu", "has_gpu")
    parsed = boolish(explicit)
    if parsed is not None:
        return parsed
    gpu_name = str(first_present(row, "gpuName", "gpu_name") or "").strip()
    if gpu_name:
        return True
    gpu_source = str(first_present(row, "gpuSource", "gpu_source") or "").lower()
    if accelerator_source_absent(gpu_source):
        return False
    gpu = first_number(row, "gpu", "gpuUtil", "gpu_utilization_pct", "gpuUtilizationPct")
    hbm = first_number(row, "hbm", "gpuMemory", "gpuMemoryUsedPct", "gpu_memory_used_pct")
    if cpu_only_host_id(host_id) and not positive(gpu) and not positive(hbm):
        return False
    if positive(gpu) or positive(hbm):
        return True
    return not cpu_only_host_id(host_id)


def bundle_has_accelerator(host_id: str, context: dict[str, Any], run: dict[str, Any]) -> bool:
    row = {
        "gpuName": context.get("gpuName"),
        "gpuSource": context.get("gpuSource"),
        "gpu": context.get("gpuUtilizationPct"),
        "hbm": context.get("gpuMemoryUsedPct"),
    }
    if row["gpu"] is None:
        utilization = run.get("utilization") if isinstance(run.get("utilization"), dict) else {}
        row["gpu"] = normalize_ratio_percent(first_number(utilization, "gpuUtil", "gpu_util"))
    if row["hbm"] is None:
        memory = run.get("memory") if isinstance(run.get("memory"), dict) else {}
        row["hbm"] = normalize_ratio_percent(first_number(memory, "hbmCapacity", "hbm_capacity", "kvCachePressure"))
    return infer_accelerator(host_id, row)


def accelerator_source_absent(source: str) -> bool:
    lowered = source.lower()
    return any(marker in lowered for marker in NO_ACCELERATOR_SOURCE_MARKERS)


def cpu_only_host_id(host_id: str) -> bool:
    return re.fullmatch(r"pi\d+(?:\.\.\d+)?", host_id.lower()) is not None


def positive(value: Any) -> bool:
    parsed = number(value)
    return parsed is not None and parsed > 0


def first_present(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in row and row.get(key) is not None:
            return row.get(key)
    return None


def boolish(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "y"}:
            return True
        if lowered in {"0", "false", "no", "n"}:
            return False
    if isinstance(value, (int, float)):
        return bool(value)
    return None


def bottleneck_label(metric: str) -> str:
    return {
        "network": "Communication",
        "cpu": "Input",
        "ram": "Memory",
        "gpu": "GPU saturation",
    }.get(metric.lower(), metric.title() or "Bottleneck")


def warning_text(item: dict[str, Any]) -> str:
    title = str(item.get("title") or item.get("name") or item.get("metric") or "Warning")
    detail = str(item.get("detail") or item.get("evidence") or item.get("message") or item.get("status") or "")
    severity = str(item.get("severity") or item.get("urgency") or "warn")
    prefix = "⚠" if severity not in {"info", "ok"} else "•"
    return f"{prefix} {title}" + (f" → {detail}" if detail else "")


def series_from_summary(summary: dict[str, Any], key: str) -> list[float]:
    history = summary.get("history") if isinstance(summary.get("history"), dict) else {}
    values = history.get(key) if isinstance(history, dict) else None
    if isinstance(values, list):
        return [float(value) for value in values if number(value) is not None]
    return []


def filtered_hosts(hosts: list[HostRow], filter_text: str) -> list[HostRow]:
    if not filter_text:
        return hosts
    needle = filter_text.lower()
    return [host for host in hosts if needle in host.host_id.lower() or needle in host.status.lower()]


def dedupe(values: list[Any]) -> list[Any]:
    seen = set()
    out = []
    for value in values:
        if not value:
            continue
        key = str(value)
        if key in seen:
            continue
        seen.add(key)
        out.append(value)
    return out


def dupe_safe_status(values: list[Any]) -> list[str]:
    return [str(item) for item in dedupe(values) if item]


def auth_notices(values: list[str]) -> list[str]:
    return [value for value in values if "HTTP 401" in value or "Unauthorized" in value]


def bundle_host_status(context: dict[str, Any], run: dict[str, Any]) -> str:
    if context.get("reachable") is False:
        return "watch"
    ssh_status = str(context.get("sshStatus") or "").lower()
    if ssh_status and ssh_status not in {"ok", "reachable", "connected", "success"}:
        return "watch"
    status = str(run.get("status") or "").lower()
    if "unreachable" in status or "failed" in status:
        return "watch"
    return "ok"


def bundle_host_detail(context: dict[str, Any], run: dict[str, Any], accelerator: bool | None = None) -> str:
    refs = run.get("refs") if isinstance(run.get("refs"), dict) else {}
    parts = []
    gpu_name = str(context.get("gpuName") or "")
    gpu_source = str(context.get("gpuSource") or "")
    if accelerator is False:
        parts.append("accelerator=none")
    elif gpu_name:
        parts.append(gpu_name)
    elif gpu_source:
        parts.append(f"gpu={gpu_source}")
    if refs.get("model"):
        parts.append(str(refs.get("model")))
    if context.get("networkLinkRole"):
        parts.append(str(context.get("networkLinkRole")))
    if context.get("sshStatus"):
        parts.append(f"ssh={context.get('sshStatus')}")
    return " · ".join(parts)


def bundle_warnings(metadata: dict[str, Any]) -> list[dict[str, Any] | str]:
    rows: list[dict[str, Any] | str] = []
    failures = metadata.get("remoteCollectionFailures")
    if isinstance(failures, list):
        for failure in failures:
            if isinstance(failure, dict):
                remote = failure.get("remote") or failure.get("host") or failure.get("hostname") or "remote"
                detail = failure.get("error") or failure.get("message") or failure.get("detail") or "collection failed"
                rows.append({"title": f"Remote collection {remote}", "detail": detail, "severity": "warn"})
            elif failure:
                rows.append(str(failure))
    note = metadata.get("note")
    if note:
        rows.append({"title": "Bundle note", "detail": str(note), "severity": "info"})
    return rows


def default_bundle_url(api_url: str) -> str:
    try:
        parsed = urllib.parse.urlsplit(api_url if "://" in api_url else f"http://{api_url}")
    except ValueError:
        return ""
    if not parsed.hostname:
        return ""
    port = parsed.port
    bundle_port = 8000 if port == 8080 else port
    host = parsed.hostname
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    netloc = host + (f":{bundle_port}" if bundle_port else "")
    return urllib.parse.urlunsplit((parsed.scheme or "http", netloc, "/build/demo/live-machine-bundle.json", "", ""))


def url_label(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    if parsed.netloc:
        return parsed.netloc + parsed.path
    return url


def compact_error(exc: Exception) -> str:
    if isinstance(exc, urllib.error.HTTPError):
        return f"HTTP {exc.code} {exc.reason}"
    if isinstance(exc, urllib.error.URLError):
        return str(exc.reason)
    return str(exc)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="turbatop: read-only terminal UI for turbalance API")
    parser.add_argument("--api-url", default=os.environ.get("TURBA_API_URL", "http://127.0.0.1:8080"))
    parser.add_argument("--token", default=os.environ.get("TURBA_TOKEN", ""))
    parser.add_argument("--token-file", default=os.environ.get("TURBA_TOKEN_FILE", ""), help="read bearer token from a file")
    parser.add_argument("--bundle-url", default=os.environ.get("TURBA_BUNDLE_URL", ""), help="live-machine bundle fallback URL")
    parser.add_argument("--no-bundle-fallback", action="store_true", help="disable live-machine bundle fallback")
    parser.add_argument("--refresh", type=float, default=float(os.environ.get("TURBA_REFRESH", "2")))
    parser.add_argument("--scope", default=os.environ.get("TURBA_SCOPE", "tenant"))
    parser.add_argument("--sort", default=os.environ.get("TURBA_SORT", "fleet"), choices=SORT_MODES, help="host sort mode")
    parser.add_argument("--page", default=os.environ.get("TURBA_PAGE", "overview"), choices=PAGES, help="starting page")
    parser.add_argument("--llm-url", default=os.environ.get("TURBA_LLM_URL", ""), help="OpenAI-compatible base URL for the report page")
    parser.add_argument("--llm-model", default=os.environ.get("TURBA_LLM_MODEL", ""), help="model name for the report page")
    parser.add_argument("--llm-token", default=os.environ.get("TURBA_LLM_TOKEN", ""), help="bearer token for the LLM endpoint")
    parser.add_argument("--llm-timeout", type=float, default=float(os.environ.get("TURBA_LLM_TIMEOUT", "12")), help="LLM report timeout in seconds")
    parser.add_argument("--insecure", action="store_true", help="allow self-signed HTTPS certificates")
    parser.add_argument("--once", action="store_true", help="render one frame and exit")
    parser.add_argument("--no-color", action="store_true", help="disable ANSI color")
    parser.add_argument("--no-mouse", action="store_true", help="disable terminal mouse controls")
    parser.add_argument("--snapshot-file", default=os.environ.get("TURBA_SNAPSHOT_FILE", "build/turbatop/snapshot.txt"), help="path written when pressing w in live mode")
    parser.add_argument("--fixture", default="", help="read API payload from a JSON fixture instead of the network")
    parser.add_argument("--width", type=int, default=0, help=argparse.SUPPRESS)
    parser.add_argument("--height", type=int, default=0, help=argparse.SUPPRESS)
    return parser.parse_args(argv)


def terminal_size(args: argparse.Namespace) -> tuple[int, int]:
    size = shutil.get_terminal_size((100, 30))
    return args.width or size.columns, args.height or size.lines


def resolve_token(token: str = "", token_file: str = "") -> str:
    if token:
        return token
    for candidate in [token_file, *default_token_files()]:
        if not candidate:
            continue
        try:
            with open(candidate, "r", encoding="utf-8") as handle:
                value = handle.read().strip()
        except OSError:
            continue
        if value:
            return value
    return ""


def default_token_files() -> list[str]:
    return [
        "build/product-secrets/api-viewer-token",
        "/opt/turbalance/Analytics/build/product-secrets/api-viewer-token",
        "/home/user/turbalance-analytics/build/product-secrets/api-viewer-token",
    ]


def read_key(timeout: float) -> str | MouseEvent:
    ready, _, _ = select.select([sys.stdin], [], [], timeout)
    if not ready:
        return ""
    ch = read_stdin_char()
    if ch == "\x1b":
        seq = read_escape_sequence(ch)
        mouse = parse_mouse_event(seq)
        if mouse:
            return mouse
        key = key_from_escape_sequence(seq)
        if key:
            return key
        return seq
    if ch in ("\r", "\n"):
        return "enter"
    return ch


def read_stdin_char() -> str:
    try:
        data = os.read(sys.stdin.fileno(), 1)
    except OSError:
        return ""
    return data.decode("utf-8", "ignore")


def read_escape_sequence(prefix: str, timeout: float = 0.12) -> str:
    seq = prefix
    while len(seq) < 64:
        ready, _, _ = select.select([sys.stdin], [], [], timeout)
        if not ready:
            break
        ch = read_stdin_char()
        if not ch:
            break
        seq += ch
        if ch in "ABCDFH~" and not seq.startswith("\x1b[<"):
            break
        if seq.startswith("\x1bO") and len(seq) >= 3:
            break
        if len(seq) > 2 and seq.startswith("\x1b[") and not seq.startswith("\x1b[<") and 0x40 <= ord(ch) <= 0x7E and ch not in "0123456789;:?":
            break
        if ch in "Mm" and seq.startswith("\x1b[<"):
            break
    return seq


def parse_mouse_event(seq: str) -> MouseEvent | None:
    match = re.fullmatch(r"\x1b\[<(\d+);(\d+);(\d+)([Mm])", seq)
    if not match:
        return None
    return MouseEvent(
        button=int(match.group(1)),
        x=int(match.group(2)),
        y=int(match.group(3)),
        released=match.group(4) == "m",
    )


def key_from_escape_sequence(seq: str) -> str:
    if seq == "\x1b[Z":
        return "shift_tab"
    final = escape_final_byte(seq)
    if final == "A":
        return "up"
    if final == "B":
        return "down"
    if final == "D":
        return "left"
    if final == "C":
        return "right"
    if final == "H":
        return "home"
    if final == "F":
        return "end"
    if seq == "\x1b[5~" or re.fullmatch(r"\x1b\[5;\d+~", seq):
        return "pageup"
    if seq == "\x1b[6~" or re.fullmatch(r"\x1b\[6;\d+~", seq):
        return "pagedown"
    return ""


def escape_final_byte(seq: str) -> str:
    if re.fullmatch(r"\x1bO[ABCDHF]", seq):
        return seq[-1]
    match = re.fullmatch(r"\x1b\[[0-9;:?]*([ABCDHF])", seq)
    return match.group(1) if match else ""


def set_mouse_reporting(enabled: bool) -> None:
    # Xterm SGR mouse reporting: click, drag, and wheel events with coordinates.
    sys.stdout.write("\033[?1000h\033[?1002h\033[?1006h" if enabled else "\033[?1000l\033[?1002l\033[?1006l")
    sys.stdout.flush()


def build_llm_client(args: argparse.Namespace) -> LlmReportClient | None:
    client = LlmReportClient(
        args.llm_url,
        args.llm_model,
        args.llm_token,
        timeout=max(0.5, args.llm_timeout),
        insecure=args.insecure,
    )
    return client if client.configured() else None


def fetch_frame(
    client: ApiClient | FixtureClient,
    scope: str,
    api_url: str,
    llm_client: LlmReportClient | None = None,
    llm_cache: dict[str, str] | None = None,
    *,
    generate_llm: bool = True,
) -> TuiFrame:
    payload, errors = client.fetch(scope)
    frame = normalize_payload(payload, errors, api_url=api_url)
    return attach_llm_report(frame, payload, llm_client, llm_cache, generate=generate_llm)


def run_once(args: argparse.Namespace, client: ApiClient | FixtureClient) -> int:
    payload, errors = client.fetch(args.scope)
    width, height = terminal_size(args)
    frame = normalize_payload(payload, errors, api_url=args.api_url)
    frame = attach_llm_report(frame, payload, build_llm_client(args), {})
    selected = initial_selected_index(frame, "", args.sort)
    sys.stdout.write(render_frame(
        frame,
        width=width,
        height=height,
        color=not args.no_color and "NO_COLOR" not in os.environ,
        selected=selected,
        scope=args.scope,
        sort_mode=args.sort,
        page=args.page,
        snapshot_file=args.snapshot_file,
    ))
    return 0


def run_live(args: argparse.Namespace, client: ApiClient | FixtureClient) -> int:
    selected = 0
    drill = False
    help_open = False
    paused = False
    scope = args.scope
    sort_mode = args.sort
    page = args.page
    panel_focus = 0
    panel_cursors: dict[str, int] = {}
    filter_text = ""
    status_message = ""
    last_render = ""
    frame = TuiFrame(api_url=args.api_url, errors=["loading"])
    llm_client = build_llm_client(args)
    llm_cache: dict[str, str] = {}
    refresh_interval = max(0.25, args.refresh)
    next_fetch = 0.0
    fetching = False
    fetching_llm = False
    heartbeat_started_at = 0.0
    heartbeat_until = 0.0
    queued_request: tuple[str, bool] | None = None
    request_queue: queue.Queue[Any] = queue.Queue()
    result_queue: queue.Queue[tuple[str, TuiFrame | None, str, bool]] = queue.Queue()

    def fetch_worker() -> None:
        while True:
            request = request_queue.get()
            if request is None:
                return
            requested_scope, generate_llm = request
            try:
                result_queue.put((
                    str(requested_scope),
                    fetch_frame(
                        client,
                        str(requested_scope),
                        args.api_url,
                        llm_client,
                        llm_cache,
                        generate_llm=bool(generate_llm),
                    ),
                    "",
                    bool(generate_llm),
                ))
            except Exception as exc:
                result_queue.put((str(requested_scope), None, compact_error(exc), bool(generate_llm)))

    def request_fetch(requested_scope: str, *, generate_llm: bool = False) -> None:
        nonlocal fetching, fetching_llm, queued_request
        if fetching:
            queued_request = (
                requested_scope,
                bool(generate_llm) or (queued_request[1] if queued_request is not None else False),
            )
            return
        fetching = True
        fetching_llm = bool(generate_llm)
        request_queue.put((requested_scope, bool(generate_llm)))

    def finish_fetch_if_ready() -> bool:
        nonlocal frame, fetching, fetching_llm, next_fetch, queued_request, heartbeat_started_at, heartbeat_until
        updated = False
        while True:
            try:
                _, new_frame, error, _generated_llm = result_queue.get_nowait()
            except queue.Empty:
                break
            fetching = False
            fetching_llm = False
            if error:
                existing = [] if frame.errors == ["loading"] else frame.errors
                frame.errors = dedupe([*existing, error])
            elif new_frame is not None:
                frame = new_frame
                heartbeat_started_at = time.time()
                heartbeat_until = heartbeat_started_at + HEARTBEAT_DURATION_SECONDS
            next_fetch = time.time() + refresh_interval
            updated = True
            if queued_request is not None:
                next_scope, generate_llm = queued_request
                queued_request = None
                request_fetch(next_scope, generate_llm=generate_llm)
        return updated

    worker = threading.Thread(target=fetch_worker, name="turbatop-fetch", daemon=True)
    worker.start()
    old_settings = termios.tcgetattr(sys.stdin) if sys.stdin.isatty() else None
    mouse_enabled = bool(old_settings and not args.no_mouse)
    try:
        if old_settings:
            tty.setcbreak(sys.stdin.fileno())
        if mouse_enabled:
            set_mouse_reporting(True)
        while True:
            finish_fetch_if_ready()
            if not fetching and not paused and time.time() >= next_fetch:
                request_fetch(scope)
            now = time.time()
            frame.heartbeat_active = now < heartbeat_until
            frame.heartbeat_phase = int(max(0.0, now - heartbeat_started_at) / HEARTBEAT_FRAME_SECONDS)
            width, height = terminal_size(args)
            cursor_key = panel_state_key(page, panel_focus)
            active_panel_cursor = move_panel_cursor(
                frame,
                page,
                panel_focus,
                panel_cursors.get(cursor_key, 0),
                0,
                width=width,
                height=height,
                selected=selected,
                filter_text=filter_text,
                sort_mode=sort_mode,
                drill=drill,
                scope=scope,
                paused=paused,
            )
            panel_cursors[cursor_key] = active_panel_cursor
            last_render = render_frame(
                frame,
                width=width,
                height=height,
                color=not args.no_color and "NO_COLOR" not in os.environ,
                selected=selected,
                scope=scope,
                filter_text=filter_text,
                drill=drill,
                sort_mode=sort_mode,
                page=page,
                paused=paused,
                help_open=help_open,
                status_message=status_message or ("generating LLM report" if fetching_llm else ""),
                snapshot_file=args.snapshot_file,
                fetching=fetching,
                panel_focus=panel_focus,
                panel_cursor=active_panel_cursor,
            )
            sys.stdout.write("\033[2J\033[H")
            sys.stdout.write(last_render)
            sys.stdout.flush()
            status_message = ""
            while True:
                if finish_fetch_if_ready():
                    break
                wait = 0.05 if fetching else (0.1 if paused else max(0, min(0.1, next_fetch - time.time())))
                if sys.stdin.isatty():
                    key = read_key(wait)
                else:
                    time.sleep(max(0.05, wait))
                    key = ""
                if not key:
                    if finish_fetch_if_ready():
                        break
                    if heartbeat_until and frame.heartbeat_active:
                        break
                    if not paused and not fetching and time.time() >= next_fetch:
                        break
                    continue
                if isinstance(key, MouseEvent):
                    previous_scope = scope
                    selected, sort_mode, scope, drill, command = apply_mouse_event(
                        key,
                        frame,
                        selected,
                        filter_text,
                        sort_mode,
                        scope,
                        drill,
                        width,
                        height,
                        paused=paused,
                        page=page,
                    )
                    if command == "quit":
                        return 0
                    if command.startswith("page:"):
                        page = normalize_page(command.split(":", 1)[1])
                        panel_focus = 0
                        help_open = False
                        break
                    if command == "refresh":
                        request_fetch(scope)
                        break
                    if command == "pause":
                        paused = not paused
                        if not paused:
                            request_fetch(scope)
                        break
                    if command == "snapshot":
                        status_message = write_snapshot(args.snapshot_file, last_render)
                        break
                    if command == "help":
                        help_open = not help_open
                        break
                    if command == "filter":
                        if mouse_enabled:
                            set_mouse_reporting(False)
                        filter_text = read_filter(filter_text)
                        if mouse_enabled:
                            set_mouse_reporting(True)
                        selected = initial_selected_index(frame, filter_text, sort_mode)
                    if scope != previous_scope:
                        request_fetch(scope)
                    break
                if key in ("q", "Q"):
                    return 0
                key_text = str(key)
                page_delta = page_navigation_delta(key_text)
                navigation_delta = host_navigation_delta(page, key_text)
                requested_page = page_for_key(key_text)
                if requested_page is not None:
                    page = requested_page
                    panel_focus = 0
                    help_open = False
                    break
                if page_delta is not None:
                    page = next_page(page, page_delta)
                    panel_focus = 0
                    help_open = False
                    break
                if key in ("r", "R"):
                    request_fetch(scope)
                    break
                if key == "G" and normalize_page(page) == "report":
                    if not llm_client:
                        status_message = "configure --llm-url and --llm-model before generating"
                    else:
                        already_fetching = fetching
                        request_fetch(scope, generate_llm=True)
                        status_message = (
                            f"queued LLM report with {llm_client.model}"
                            if already_fetching
                            else f"generating LLM report with {llm_client.model}"
                        )
                    break
                if key in ("h", "H", "?"):
                    help_open = not help_open
                elif key in ("p", "P"):
                    paused = not paused
                    if not paused:
                        request_fetch(scope)
                elif key in ("w", "W"):
                    status_message = write_snapshot(args.snapshot_file, last_render)
                elif key == "\t":
                    panel_focus = next_panel_focus(page, panel_focus)
                elif key == "shift_tab":
                    panel_focus = next_panel_focus(page, panel_focus, -1)
                elif key == "]":
                    page = next_page(page)
                    panel_focus = 0
                    help_open = False
                elif key == "[":
                    page = next_page(page, -1)
                    panel_focus = 0
                    help_open = False
                elif navigation_delta is not None:
                    if panel_moves_hosts(page, panel_focus):
                        selected = move_selection(frame, selected, filter_text, sort_mode, navigation_delta)
                    else:
                        cursor_key = panel_state_key(page, panel_focus)
                        panel_cursors[cursor_key] = move_panel_cursor(
                            frame,
                            page,
                            panel_focus,
                            panel_cursors.get(cursor_key, 0),
                            navigation_delta,
                            width=width,
                            height=height,
                            selected=selected,
                            filter_text=filter_text,
                            sort_mode=sort_mode,
                            drill=drill,
                            scope=scope,
                            paused=paused,
                        )
                elif key == "pageup":
                    selected = move_selection(frame, selected, filter_text, sort_mode, -5)
                elif key == "pagedown":
                    selected = move_selection(frame, selected, filter_text, sort_mode, 5)
                elif key in ("home", "g"):
                    selected = edge_selection(frame, filter_text, sort_mode, last=False)
                elif key in ("end", "G"):
                    selected = edge_selection(frame, filter_text, sort_mode, last=True)
                elif key == "enter":
                    drill = not drill
                elif key == "/":
                    if mouse_enabled:
                        set_mouse_reporting(False)
                    filter_text = read_filter(filter_text)
                    if mouse_enabled:
                        set_mouse_reporting(True)
                    selected = initial_selected_index(frame, filter_text, sort_mode)
                elif key == "s":
                    sort_mode = next_sort_mode(sort_mode)
                    selected = initial_selected_index(frame, filter_text, sort_mode)
                elif key in ("j", "m", "t", "c"):
                    scope = {"j": "job", "m": "model", "t": "team", "c": "cluster"}[key]
                    selected = initial_selected_index(frame, filter_text, sort_mode)
                    request_fetch(scope)
                elif key == "T":
                    scope = "tenant"
                    selected = initial_selected_index(frame, filter_text, sort_mode)
                    request_fetch(scope)
                elif key == "u":
                    scope = "tenant"
                    selected = initial_selected_index(frame, filter_text, sort_mode)
                    request_fetch(scope)
                break
    finally:
        request_queue.put(None)
        if mouse_enabled:
            set_mouse_reporting(False)
        if old_settings:
            termios.tcsetattr(sys.stdin, termios.TCSADRAIN, old_settings)


def apply_mouse_event(
    event: MouseEvent,
    frame: TuiFrame,
    selected: int,
    filter_text: str,
    sort_mode: str,
    scope: str,
    drill: bool,
    width: int,
    height: int,
    *,
    paused: bool = False,
    page: str = "overview",
) -> tuple[int, str, str, bool, str]:
    if event.released:
        return selected, sort_mode, scope, drill, ""
    if event.button & 64:
        delta = 1 if event.button & 1 else -1
        return move_selection(frame, selected, filter_text, sort_mode, delta), sort_mode, scope, drill, ""

    base_button = event.button & 3
    if base_button not in (0, 2):
        return selected, sort_mode, scope, drill, ""

    top = top_border("t turbalance · turbatop", top_controls(frame, scope), width)
    if event.y == 1:
        if line_hit(top, "q quit", event.x):
            return selected, sort_mode, scope, drill, "quit"
        if line_hit(top, "h help", event.x):
            return selected, sort_mode, scope, drill, "help"
        if line_hit(top, "⟳", event.x):
            return selected, sort_mode, scope, drill, "refresh"

    page = normalize_page(page)
    layout = layout_state(frame, width, height, selected, filter_text, sort_mode, drill, page=page)
    if page in ("overview", "hosts") and event.y == layout.host_start_y - 1 and 2 <= event.x <= layout.left_width + 1:
        sort_mode = next_sort_mode(sort_mode)
        selected = initial_selected_index(frame, filter_text, sort_mode)
        return selected, sort_mode, scope, drill, ""

    host_row = event.y - layout.host_start_y
    if page in ("overview", "hosts") and 0 <= host_row < layout.visible_host_count and 2 <= event.x <= layout.left_width + 1:
        row_index = layout.scroll_start + host_row
        if row_index < len(layout.host_rows):
            host = layout.host_rows[row_index]
            try:
                next_selected = frame.hosts.index(host)
            except ValueError:
                return selected, sort_mode, scope, drill, ""
            if next_selected == selected or base_button == 2:
                drill = not drill
            selected = next_selected
        return selected, sort_mode, scope, drill, ""

    footer = bottom_border(status_line(frame, scope, filter_text, sort_mode, page=page, paused=paused), width)
    if event.y == layout.status_y:
        for next_page_name, label in page_tab_labels(page):
            if line_hit(footer, label, event.x):
                return selected, sort_mode, scope, drill, f"page:{next_page_name}"
        for label, next_scope in (
            ("[j]ob", "job"),
            ("[m]odel", "model"),
            ("[t]eam", "team"),
            ("[tenant]", "tenant"),
            ("[c]luster", "cluster"),
        ):
            if line_hit(footer, label, event.x):
                selected = initial_selected_index(frame, filter_text, sort_mode)
                return selected, sort_mode, next_scope, drill, "refresh"
        if line_hit(footer, f"s sort:{sort_mode}", event.x):
            sort_mode = next_sort_mode(sort_mode)
            selected = initial_selected_index(frame, filter_text, sort_mode)
        elif line_hit(footer, "enter/click drill", event.x):
            drill = not drill
        elif line_hit(footer, "/ filter", event.x):
            return selected, sort_mode, scope, drill, "filter"
        elif line_hit(footer, "p pause", event.x) or line_hit(footer, "p resume", event.x):
            return selected, sort_mode, scope, drill, "pause"
        elif line_hit(footer, "w snap", event.x):
            return selected, sort_mode, scope, drill, "snapshot"
        elif line_hit(footer, "h help", event.x):
            return selected, sort_mode, scope, drill, "help"
    return selected, sort_mode, scope, drill, ""


def line_hit(line: str, needle: str, x: int) -> bool:
    start = line.find(needle)
    if start < 0:
        return False
    return start + 1 <= x <= start + len(needle)


def read_filter(existing: str) -> str:
    sys.stdout.write("\nfilter: ")
    sys.stdout.flush()
    value = ""
    while True:
        ch = sys.stdin.read(1)
        if ch in ("\r", "\n"):
            return value
        if ch == "\x7f":
            value = value[:-1]
        elif ch == "\x1b":
            return existing
        else:
            value += ch


def move_selection(frame: TuiFrame, selected: int, filter_text: str, sort_mode: str, delta: int) -> int:
    rows = display_hosts(frame.hosts, filter_text, sort_mode)
    if not rows:
        return 0
    selected_host = frame.hosts[max(0, min(selected, len(frame.hosts) - 1))] if frame.hosts else None
    visible_index = index_of_host(rows, selected_host)
    next_index = max(0, min(len(rows) - 1, visible_index + delta))
    try:
        return frame.hosts.index(rows[next_index])
    except ValueError:
        return selected


def edge_selection(frame: TuiFrame, filter_text: str, sort_mode: str, *, last: bool) -> int:
    rows = display_hosts(frame.hosts, filter_text, sort_mode)
    if not rows:
        return 0
    target = rows[-1] if last else rows[0]
    try:
        return frame.hosts.index(target)
    except ValueError:
        return 0


def initial_selected_index(frame: TuiFrame, filter_text: str, sort_mode: str) -> int:
    rows = display_hosts(frame.hosts, filter_text, sort_mode)
    if not rows:
        return 0
    try:
        return frame.hosts.index(rows[0])
    except ValueError:
        return 0


def write_snapshot(path: str, content: str) -> str:
    if not path:
        return "snapshot path is not configured"
    try:
        parent = os.path.dirname(path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(content)
    except OSError as exc:
        return f"snapshot failed: {exc}"
    return f"snapshot saved {path}"


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    client: ApiClient | FixtureClient
    bundle_url = "" if args.no_bundle_fallback else (args.bundle_url or default_bundle_url(args.api_url))
    token = resolve_token(args.token, args.token_file)
    client = FixtureClient(args.fixture) if args.fixture else ApiClient(args.api_url, token, args.insecure, bundle_url=bundle_url)
    if args.once or not sys.stdin.isatty():
        return run_once(args, client)
    return run_live(args, client)


if __name__ == "__main__":
    raise SystemExit(main())
