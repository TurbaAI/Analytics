#!/usr/bin/env python3
"""Normalize optional rack, CDU, BMC, or Redfish facility telemetry."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict


OPTIONAL_FACILITY_FIELDS = {
    "rack_inlet_coolant_temp_celsius": ("rack_inlet_coolant_temp_celsius", "gauge"),
    "rack_outlet_coolant_temp_celsius": ("rack_outlet_coolant_temp_celsius", "gauge"),
    "coolant_flow_liters_per_minute": ("coolant_flow_liters_per_minute", "gauge"),
    "cdu_alarm_state": ("cdu_alarm_state", "gauge"),
    "facility_power_kw": ("facility_power_kw", "gauge"),
}


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def normalize_facility_payload(payload: Dict[str, Any]) -> Dict[str, float]:
    """Return supported facility gauges from a direct JSON or lightly Redfish-shaped payload."""
    data = dict(payload)
    temperatures = payload.get("Temperatures")
    if isinstance(temperatures, list):
        for entry in temperatures:
            if not isinstance(entry, dict):
                continue
            name = str(entry.get("Name", "")).lower()
            reading = entry.get("ReadingCelsius")
            if "inlet" in name and "coolant" in name:
                data.setdefault("rack_inlet_coolant_temp_celsius", reading)
            if "outlet" in name and "coolant" in name:
                data.setdefault("rack_outlet_coolant_temp_celsius", reading)

    power = payload.get("PowerControl")
    if isinstance(power, list) and power:
        watts = power[0].get("PowerConsumedWatts")
        if watts is not None:
            data.setdefault("facility_power_kw", _number(watts) / 1000 if _number(watts) is not None else None)

    normalized: Dict[str, float] = {}
    for source_key, (metric_name, _) in OPTIONAL_FACILITY_FIELDS.items():
        value = _number(data.get(source_key))
        if value is not None:
            normalized[metric_name] = value
    return normalized


def load_facility_json(path: str | Path) -> Dict[str, float]:
    with Path(path).open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError("facility JSON must be an object")
    return normalize_facility_payload(payload)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: facility_adapter.py facility.json", file=sys.stderr)
        raise SystemExit(2)
    print(json.dumps(load_facility_json(sys.argv[1]), indent=2, sort_keys=True))
