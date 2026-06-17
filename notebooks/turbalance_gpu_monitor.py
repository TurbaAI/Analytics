"""Jupyter helper for Turbalance GPU diagnostics source bundles.

Usage in a notebook:

    from turbalance_gpu_monitor import display_gpu_monitor
    display_gpu_monitor("build/demo/live-machine-bundle.json")

The helper is intentionally read-only. It renders process attribution, thermal
qualification, and topology fingerprint fields that are already present in a
validated Turbalance source bundle.
"""

from __future__ import annotations

import html
import json
from pathlib import Path
from typing import Any, Mapping


def display_gpu_monitor(bundle_path: str | Path) -> Mapping[str, Any]:
    """Render a compact GPU diagnostic table and return the raw context."""

    context = load_gpu_context(bundle_path)
    rows = [
        ("Host", context.get("hostname") or context.get("node") or "unknown"),
        ("GPU", context.get("gpuName") or "not detected"),
        ("Utilization", _percent(context.get("gpuUtilizationPct"))),
        ("Power", _watts(context.get("gpuPowerWatts"))),
        ("Temperature", _celsius(context.get("gpuTemperatureC"))),
        ("Process inspector", context.get("gpuProcessInspectorSummary") or "not observed"),
        ("Thermal qualification", context.get("gpuThermalQualificationSummary") or context.get("gpuThermalQualificationStatus") or "unknown"),
        ("Topology fingerprint", _topology_label(context)),
    ]

    try:
        from IPython.display import HTML, display

        display(HTML(_table_html(rows) + _process_table_html(context)))
    except Exception:
        print("turbalance GPU monitor")
        for key, value in rows:
            print(f"{key}: {value}")

    return context


def load_gpu_context(bundle_path: str | Path) -> Mapping[str, Any]:
    payload = json.loads(Path(bundle_path).read_text())
    runs = payload.get("ingestion", {}).get("runs") or payload.get("runs") or []
    if not runs:
        raise ValueError("bundle does not contain ingestion runs")
    context = runs[0].get("sourceContext") or {}
    if not isinstance(context, Mapping):
        raise ValueError("first run does not contain a sourceContext object")
    return context


def _table_html(rows: list[tuple[str, Any]]) -> str:
    cells = "\n".join(
        f"<tr><th>{html.escape(str(key))}</th><td>{html.escape(str(value))}</td></tr>"
        for key, value in rows
    )
    return f"""
    <table>
      <caption>Turbalance GPU diagnostics</caption>
      <tbody>{cells}</tbody>
    </table>
    """


def _process_table_html(context: Mapping[str, Any]) -> str:
    processes = context.get("gpuComputeProcesses") or []
    if not isinstance(processes, list) or not processes:
        return ""
    rows = "\n".join(
        "<tr>"
        f"<td>{html.escape(str(process.get('pid', '')))}</td>"
        f"<td>{html.escape(str(process.get('gpuUuid') or process.get('gpuIndex') or ''))}</td>"
        f"<td>{html.escape(str(process.get('usedMemoryMiB', '')))} MiB</td>"
        f"<td>{html.escape(str(process.get('username', '')))}</td>"
        f"<td>{html.escape(str(process.get('command') or process.get('processName') or ''))}</td>"
        "</tr>"
        for process in processes[:12]
        if isinstance(process, Mapping)
    )
    return f"""
    <table>
      <caption>GPU processes</caption>
      <thead><tr><th>PID</th><th>GPU</th><th>Memory</th><th>User</th><th>Command</th></tr></thead>
      <tbody>{rows}</tbody>
    </table>
    """


def _topology_label(context: Mapping[str, Any]) -> str:
    fingerprint = context.get("gpuTopologyFingerprint") or ""
    summary = context.get("gpuTopologySummary") or ""
    return " | ".join(str(value) for value in (fingerprint, summary) if value) or "not observed"


def _percent(value: Any) -> str:
    return _unit(value, "%")


def _watts(value: Any) -> str:
    return _unit(value, "W")


def _celsius(value: Any) -> str:
    return _unit(value, "C")


def _unit(value: Any, suffix: str) -> str:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return "unknown"
    return f"{parsed:.1f} {suffix}"
