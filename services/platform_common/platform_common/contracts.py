from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

SCHEMA_VERSION = "turba.telemetry_batch.v1"

RAW_TABLE_BY_SENSOR = {
    "host_heartbeat": "raw_host_heartbeat",
    "ebpf_cpu_sched": "raw_ebpf_cpu_sched",
    "ebpf_net_socket": "raw_ebpf_net_socket",
    "gpu_sample": "raw_gpu_sample",
    "memory_sample": "raw_memory_sample",
    "process_sample": "raw_process_sample",
    "collector_audit": "raw_collector_audit",
    "source_bundle_metric": "raw_source_bundle_metric",
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


def _clean_label_map(labels: dict[str, Any] | None) -> dict[str, str]:
    if not labels:
        return {}
    cleaned: dict[str, str] = {}
    for key, value in labels.items():
        if value is None:
            continue
        cleaned[str(key)] = str(value)
    return cleaned


class TelemetryMetric(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    name: str
    value: float
    unit: str = ""
    kind: str = "gauge"
    labels: dict[str, str] = Field(default_factory=dict)

    @field_validator("labels", mode="before")
    @classmethod
    def normalize_labels(cls, value: dict[str, Any] | None) -> dict[str, str]:
        return _clean_label_map(value)


class TelemetrySample(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    sample_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sensor_type: str
    source: str
    event_ts: datetime = Field(default_factory=utc_now)
    run_id: str | None = None
    node: str | None = None
    namespace: str | None = None
    pod_name: str | None = None
    container_name: str | None = None
    labels: dict[str, str] = Field(default_factory=dict)
    metrics: list[TelemetryMetric]

    @field_validator("labels", mode="before")
    @classmethod
    def normalize_labels(cls, value: dict[str, Any] | None) -> dict[str, str]:
        return _clean_label_map(value)


class TelemetryBatch(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    schema_version: str = SCHEMA_VERSION
    batch_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    host_id: str
    agent_id: str
    sequence_no: int = 0
    trace_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_ts: datetime = Field(default_factory=utc_now)
    ingest_ts: datetime = Field(default_factory=utc_now)
    samples: list[TelemetrySample]

    @field_validator("schema_version")
    @classmethod
    def validate_schema_version(cls, value: str) -> str:
        if value != SCHEMA_VERSION:
            raise ValueError(f"expected schema_version {SCHEMA_VERSION}, got {value}")
        return value


def parse_batch(payload: dict[str, Any] | TelemetryBatch) -> TelemetryBatch:
    if isinstance(payload, TelemetryBatch):
        return payload
    return TelemetryBatch.model_validate(payload)


def batch_payload_hash(payload: dict[str, Any] | TelemetryBatch) -> str:
    if isinstance(payload, BaseModel):
        body = payload.model_dump(mode="json", by_alias=True)
    else:
        body = payload
    encoded = json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def flatten_metric_rows(payload: dict[str, Any] | TelemetryBatch) -> list[dict[str, Any]]:
    batch = parse_batch(payload)
    payload_hash = batch_payload_hash(batch)
    rows: list[dict[str, Any]] = []

    for sample in batch.samples:
        table_name = RAW_TABLE_BY_SENSOR.get(sample.sensor_type, "raw_metric_sample")
        sample_labels = _clean_label_map(sample.labels)
        for metric in sample.metrics:
            labels = {**sample_labels, **_clean_label_map(metric.labels)}
            rows.append(
                {
                    "table_name": table_name,
                    "tenant_id": batch.tenant_id,
                    "host_id": batch.host_id,
                    "agent_id": batch.agent_id,
                    "sensor_type": sample.sensor_type,
                    "source": sample.source,
                    "schema_version": batch.schema_version,
                    "batch_id": batch.batch_id,
                    "sequence_no": batch.sequence_no,
                    "event_ts": sample.event_ts,
                    "ingest_ts": batch.ingest_ts,
                    "trace_id": batch.trace_id,
                    "payload_hash": payload_hash,
                    "sample_id": sample.sample_id,
                    "run_id": sample.run_id or "",
                    "node": sample.node or "",
                    "namespace": sample.namespace or "",
                    "pod_name": sample.pod_name or "",
                    "container_name": sample.container_name or "",
                    "metric_name": metric.name,
                    "metric_value": metric.value,
                    "metric_unit": metric.unit,
                    "metric_kind": metric.kind,
                    "labels_json": json.dumps(labels, sort_keys=True),
                }
            )

    return rows


def source_bundle_to_batch(
    bundle: dict[str, Any],
    *,
    tenant_id: str = "demo-tenant",
    host_id: str = "source-bundle",
    agent_id: str = "source-bundle-adapter",
    sequence_no: int = 0,
    event_ts: datetime | None = None,
) -> TelemetryBatch:
    event_time = event_ts or utc_now()
    samples: list[TelemetrySample] = []
    sources = bundle.get("sources", {}) if isinstance(bundle, dict) else {}

    for item in sources.get("prometheus", []) or []:
        metrics = [
            TelemetryMetric(name=name, value=float(value), kind=_metric_kind(name), unit=_metric_unit(name))
            for name, value in (item.get("metrics") or {}).items()
            if _is_number(value)
        ]
        if metrics:
            samples.append(
                TelemetrySample(
                    sensor_type="source_bundle_metric",
                    source="prometheus",
                    event_ts=event_time,
                    run_id=item.get("runId"),
                    metrics=metrics,
                )
            )

    for item in sources.get("ebpf", []) or []:
        labels = {
            "ebpf_export_id": item.get("ebpfExportId", ""),
            "kernel_release": item.get("kernelRelease", ""),
            "cgroup_path": item.get("cgroupPath", ""),
        }
        cpu_metrics = _nested_metrics(item, "cpu") + _nested_metrics(item, "scheduler")
        if cpu_metrics:
            samples.append(
                TelemetrySample(
                    sensor_type="ebpf_cpu_sched",
                    source=item.get("collector") or "ebpf",
                    event_ts=event_time,
                    run_id=item.get("runId"),
                    node=item.get("node"),
                    namespace=item.get("namespace"),
                    pod_name=item.get("podName"),
                    container_name=item.get("containerName"),
                    labels=labels,
                    metrics=cpu_metrics,
                )
            )
        network_metrics = _nested_metrics(item, "network")
        if network_metrics:
            samples.append(
                TelemetrySample(
                    sensor_type="ebpf_net_socket",
                    source=item.get("collector") or "ebpf",
                    event_ts=event_time,
                    run_id=item.get("runId"),
                    node=item.get("node"),
                    namespace=item.get("namespace"),
                    pod_name=item.get("podName"),
                    container_name=item.get("containerName"),
                    labels=labels,
                    metrics=network_metrics,
                )
            )
        storage_metrics = _nested_metrics(item, "storage") + _nested_metrics(item, "noise")
        if storage_metrics:
            samples.append(
                TelemetrySample(
                    sensor_type="process_sample",
                    source=item.get("collector") or "ebpf",
                    event_ts=event_time,
                    run_id=item.get("runId"),
                    node=item.get("node"),
                    namespace=item.get("namespace"),
                    pod_name=item.get("podName"),
                    container_name=item.get("containerName"),
                    labels=labels,
                    metrics=storage_metrics,
                )
            )

    if not samples:
        raise ValueError("source bundle did not contain supported telemetry sources")

    return TelemetryBatch(
        tenant_id=tenant_id,
        host_id=host_id,
        agent_id=agent_id,
        sequence_no=sequence_no,
        event_ts=event_time,
        samples=samples,
    )


def _nested_metrics(item: dict[str, Any], key: str) -> list[TelemetryMetric]:
    metrics = []
    for name, value in (item.get(key) or {}).items():
        if _is_number(value):
            metrics.append(
                TelemetryMetric(
                    name=f"{key}.{name}",
                    value=float(value),
                    kind=_metric_kind(name),
                    unit=_metric_unit(name),
                )
            )
    return metrics


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _metric_kind(name: str) -> str:
    lowered = name.lower()
    if lowered.endswith("total") or lowered.endswith("bytes"):
        return "counter"
    if "ratio" in lowered:
        return "ratio"
    if "pct" in lowered or "percent" in lowered or "utilization" in lowered:
        return "percent"
    if "bytes" in lowered:
        return "bytes"
    if "ms" in lowered or "minutes" in lowered or "seconds" in lowered:
        return "duration"
    return "gauge"


def _metric_unit(name: str) -> str:
    lowered = name.lower()
    if "ratio" in lowered:
        return "ratio"
    if "pct" in lowered or "percent" in lowered or "utilization" in lowered:
        return "percent"
    if "bytes" in lowered:
        return "bytes"
    if "minutes" in lowered:
        return "minutes"
    if "ms" in lowered:
        return "ms"
    if "seconds" in lowered:
        return "seconds"
    return ""
