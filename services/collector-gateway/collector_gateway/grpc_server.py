from __future__ import annotations

import json
import sys
from concurrent import futures
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
for relative in ("services/platform_common", "services/raw-writer", "build/generated/python"):
    path = ROOT / relative
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from raw_writer import TelemetryLakeWriter  # noqa: E402

try:
    import grpc  # type: ignore
    from telemetry.v1 import telemetry_batch_pb2, telemetry_batch_pb2_grpc  # type: ignore
except Exception:  # pragma: no cover - generated/runtime deps are installed in platform images
    grpc = None
    telemetry_batch_pb2 = None
    telemetry_batch_pb2_grpc = None


class GeneratedGrpcUnavailable(RuntimeError):
    pass


def generated_available() -> bool:
    return grpc is not None and telemetry_batch_pb2 is not None and telemetry_batch_pb2_grpc is not None


def create_server(lake_root: str | Path):
    if not generated_available():
        raise GeneratedGrpcUnavailable("run scripts/generate-telemetry-protos.sh and install grpcio first")
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=8))
    telemetry_batch_pb2_grpc.add_TelemetryCollectorServicer_to_server(
        TelemetryCollectorServicer(TelemetryLakeWriter(lake_root)),
        server,
    )
    return server


class TelemetryCollectorServicer(telemetry_batch_pb2_grpc.TelemetryCollectorServicer if telemetry_batch_pb2_grpc else object):
    def __init__(self, writer: TelemetryLakeWriter) -> None:
        self.writer = writer

    def WriteTelemetryBatch(self, request, _context):  # noqa: N802 - protobuf service casing
        payload = _message_to_payload(request)
        result = self.writer.write_batch(payload)
        response = telemetry_batch_pb2.WriteTelemetryBatchResponse(
            status=result.get("status", ""),
            batch_id=result.get("batchId", ""),
            row_count=int(result.get("rowCount") or 0),
            file_count=int(result.get("fileCount") or 0),
            manifest_path=result.get("manifestPath", ""),
            reason=result.get("reason", ""),
        )
        for file_info in result.get("files", []):
            response.files.append(
                telemetry_batch_pb2.WriteResultFile(
                    table_name=file_info.get("table_name", ""),
                    path=file_info.get("path", ""),
                    row_count=int(file_info.get("row_count") or 0),
                    tenant_id=file_info.get("tenant_id", ""),
                    dt=file_info.get("dt", ""),
                    hour=file_info.get("hour", ""),
                )
            )
        return response

    def Health(self, _request, _context):  # noqa: N802 - protobuf service casing
        return telemetry_batch_pb2.CollectorHealthResponse(status="ok", version="0.1.0")


def _message_to_payload(request: Any) -> dict[str, Any]:
    return {
        "schemaVersion": request.schema_version,
        "batchId": request.batch_id,
        "tenantId": request.tenant_id,
        "hostId": request.host_id,
        "agentId": request.agent_id,
        "sequenceNo": int(request.sequence_no),
        "traceId": request.trace_id,
        "eventTs": request.event_ts,
        "ingestTs": request.ingest_ts,
        "samples": [
            {
                "sampleId": sample.sample_id,
                "sensorType": sample.sensor_type,
                "source": sample.source,
                "eventTs": sample.event_ts,
                "runId": sample.run_id,
                "node": sample.node,
                "namespace": sample.namespace,
                "podName": sample.pod_name,
                "containerName": sample.container_name,
                "labels": dict(sample.labels),
                "metrics": [
                    {
                        "name": metric.name,
                        "value": metric.value,
                        "unit": metric.unit,
                        "kind": metric.kind,
                        "labels": dict(metric.labels),
                    }
                    for metric in sample.metrics
                ],
            }
            for sample in request.samples
        ],
    }
