const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const pythonCommand = process.platform === "darwin" ? ["/usr/bin/arch", "-arm64", "python3"] : ["python3"];

function run(args, options = {}) {
  const result = spawnSync(pythonCommand[0], [...pythonCommand.slice(1), ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PYTHONPATH: [
        "services/platform_common",
        "services/raw-writer",
        "services/collector-gateway",
        "services/queue-gateway",
        "services/duckdb-query-service",
        "services/transform-runner",
        "services/alert-engine",
        "services/api-server",
        "services/discovery-api",
        "orchestration/dagster"
      ].join(path.delimiter)
    },
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`${pythonCommand.join(" ")} ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function liveMachineRun(id, hostname, localAddress, peerAddress, cpuUsagePct, gpuUtilizationPct, memoryUsedPct, networkUtilizationPct) {
  return {
    id,
    name: `${hostname} live telemetry`,
    refs: {},
    status: "Live host observation",
    allocation: { durationHours: 0, gpus: 1, allocatedGpuHours: 0, gpuModel: "NVIDIA GB10" },
    utilization: { gpuUtil: gpuUtilizationPct, usefulCompute: gpuUtilizationPct, smOccupancy: 0, tensorCoreUtil: 0 },
    communication: { ncclTime: 0, networkWait: 0, networkUtilization: networkUtilizationPct, allToAllTime: 0, crossRackTraffic: 0, crossPodTraffic: 0 },
    inputPipeline: { dataloaderStall: 0, storageWait: 0, cpuPrep: cpuUsagePct },
    memory: { hbmCapacity: 0, hbmBandwidth: 0, memoryFragmentation: 0, kvCachePressure: 0 },
    scheduler: { placementQuality: 100, idleGpus: 0, partialNodes: 0, queueWaitMinutes: 0, gpusPerNode: 1 },
    reliability: { noiseEvents: 0, contentionPct: 0, stepRegularity: 100, latencyTail: 0 },
    configuration: { precisionLoss: 0, batchInefficiency: 0 },
    work: { tokensM: 0, steps: 0, inferenceRequestsM: 0 },
    baseline: { gpuEfficiency: 0, queueWaitMinutes: 0, ncclTime: 0 },
    placement: { nodes: [hostname], partialNodes: [] },
    importedSources: ["local-machine"],
    sourceContext: {
      hostname,
      generatedAt: id.includes("spark2") ? "2026-06-06T20:00:02.000Z" : "2026-06-06T20:00:01.000Z",
      cpuUsagePct,
      memoryUsedPct,
      linuxUmaMemoryUsedPct: memoryUsedPct,
      diskUsedPct: 29,
      networkInterface: "enp1s0f1np1",
      networkLocalAddress: localAddress,
      networkPeerAddress: peerAddress,
      networkLinkRole: "DGX interconnect",
      networkUtilizationPct,
      networkRxBytesPerSecond: 2400,
      networkTxBytesPerSecond: 1800,
      gpuName: "NVIDIA GB10",
      gpuPresent: true,
      gpuUtilizationPct,
      gpuMemoryUsedPct: 8,
      gpuPowerWatts: 42,
      gpuTemperatureC: 61,
      dockerContainers: [{ name: "ray", cpuPct: 12 }],
      hardwareHealthScore: hostname === "SPARK1" ? 54 : 100,
      hardwareFaultScore: hostname === "SPARK1" ? 46 : 0,
      hardwareFaultLevel: hostname === "SPARK1" ? "high" : "healthy",
      hardwareFaultCount: hostname === "SPARK1" ? 1 : 0,
      hardwareCriticalFaultCount: 0,
      hardwareWarningFaultCount: hostname === "SPARK1" ? 1 : 0,
      hardwareKernelEventCount: hostname === "SPARK1" ? 2 : 0,
      hardwareMachineCheckCount: 0,
      hardwareGpuXidCount: hostname === "SPARK1" ? 2 : 0,
      hardwareStorageErrorCount: 0,
      hardwarePcieAerCount: 0,
      hardwareOomKillCount: 0,
      hardwareFailedUnitCount: 0,
      hardwareThermalThrottleActive: false,
      hardwareRepairAction: hostname === "SPARK1" ? "restart-gpu-workload-or-open-ticket" : "observe",
      hardwareRepairConfidence: hostname === "SPARK1" ? 0.78 : 0.5,
      hardwareRepairRequiresApproval: hostname === "SPARK1",
      hardwareRcaFingerprint: hostname === "SPARK1" ? "spark-linux-gpustat-gpu" : "healthy",
      hardwareFaults: hostname === "SPARK1" ? [{
        id: "gpu-xid",
        category: "gpu",
        severity: "high",
        source: "journalctl-kernel",
        count: 2,
        detail: "2 NVIDIA Xid or NVRM events observed.",
        suggestedAction: "restart-gpu-workload-or-open-ticket"
      }] : []
    }
  };
}

run([
  "-m",
  "py_compile",
  "services/platform_common/platform_common/contracts.py",
  "services/platform_common/platform_common/analytics.py",
  "services/platform_common/platform_common/observability.py",
  "services/raw-writer/raw_writer/writer.py",
  "services/raw-writer/raw_writer/storage.py",
  "services/raw-writer/raw_writer/operations.py",
  "services/collector-gateway/collector_gateway/app.py",
  "services/collector-gateway/collector_gateway/security.py",
  "services/collector-gateway/collector_gateway/identity.py",
  "services/collector-gateway/collector_gateway/queue.py",
  "services/collector-gateway/collector_gateway/backpressure.py",
  "services/collector-gateway/collector_gateway/replay.py",
  "services/collector-gateway/collector_gateway/grpc_server.py",
  "services/collector-gateway/collector_gateway/__main__.py",
  "services/queue-gateway/queue_gateway/app.py",
  "services/duckdb-query-service/duckdb_query_service/query.py",
  "services/transform-runner/transform_runner/runner.py",
  "services/transform-runner/transform_runner/validation.py",
  "services/alert-engine/alert_engine/engine.py",
  "services/alert-engine/alert_engine/router.py",
  "services/alert-engine/alert_engine/store.py",
  "services/api-server/api_server/app.py",
  "services/api-server/api_server/auth.py",
  "services/discovery-api/discovery_api/app.py",
  "services/discovery-api/discovery_api/certificates.py",
  "services/discovery-api/discovery_api/consul.py",
  "services/discovery-api/discovery_api/store.py",
  "orchestration/dagster/turbalance_assets.py"
]);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "turba-lakehouse-"));
const lakeRoot = path.join(temp, "lake");
const generatedProtoDir = path.join(temp, "generated-python");

const rawResult = JSON.parse(run([
  "-m",
  "raw_writer",
  "--input",
  "fixtures/external-source-bundle.json",
  "--lake-root",
  lakeRoot,
  "--source-bundle",
  "--tenant-id",
  "tenant-a",
  "--host-id",
  "source-host"
]));

assert.equal(rawResult.status, "written");
assert.equal(rawResult.fileCount, 4);
assert.ok(rawResult.rowCount > 0);

const liveMachineBundlePath = path.join(temp, "live-machine-bundle.json");
fs.writeFileSync(liveMachineBundlePath, JSON.stringify({
  metadata: {
    generatedAt: "2026-06-06T20:00:03.000Z",
    source: "collect-machine-fleet-bundle.js",
    observedHosts: ["SPARK1", "SPARK2"]
  },
  ingestion: {
    schemaVersion: "turba.ingestion.v1",
    entities: {},
    sourceAdapters: ["local-machine"],
    runs: [
      liveMachineRun("machine-spark1-20260606t200001z", "SPARK1", "192.168.100.10", "192.168.100.11", 32, 18, 71, 4),
      liveMachineRun("machine-spark2-20260606t200002z", "SPARK2", "192.168.100.11", "192.168.100.10", 48, 42, 68, 9)
    ]
  },
  sources: {}
}, null, 2));

const liveRawResult = JSON.parse(run([
  "-m",
  "raw_writer",
  "--input",
  liveMachineBundlePath,
  "--lake-root",
  lakeRoot,
  "--source-bundle",
  "--tenant-id",
  "tenant-a",
  "--host-id",
  "dgx-spark-fleet",
  "--agent-id",
  "live-machine-push"
]));

assert.equal(liveRawResult.status, "written");
assert.ok(liveRawResult.rowCount >= 12);
assert.ok(liveRawResult.files.some((file) => file.table_name === "raw_source_bundle_metric"));

const sequencedSourceBundleResult = JSON.parse(run([
  "-c",
  `
import json
from raw_writer import TelemetryLakeWriter
bundle = json.load(open(${JSON.stringify(liveMachineBundlePath)}))
result = TelemetryLakeWriter(${JSON.stringify(lakeRoot)}).write_source_bundle(
  bundle,
  tenant_id="tenant-a",
  host_id="dgx-spark-fleet",
  agent_id="live-machine-push",
  sequence_no=42,
)
print(json.dumps(result, default=str))
`
]));

assert.equal(sequencedSourceBundleResult.status, "written");

const transformResult = JSON.parse(run([
  "-m",
  "transform_runner",
  "--lake-root",
  lakeRoot,
  "--tenant-id",
  "tenant-a"
]));

assert.equal(transformResult.status, "materialized");
assert.ok(transformResult.tables.some((table) => table.table === "vs_resource_pressure_1m"));
assert.ok(transformResult.tables.some((table) => table.table === "vs_cpu_gpu_ram_net_covariance"));
assert.ok(transformResult.tables.some((table) => table.table === "vs_principal_resource_mode"));
assert.ok(transformResult.tables.some((table) => table.table === "vs_network_gpu_coupling"));
assert.ok(transformResult.tables.some((table) => table.table === "vs_host_hardware_health"));
assert.ok(transformResult.tables.some((table) => table.table === "vs_repair_candidates"));
assert.ok(transformResult.tables.some((table) => table.table === "vs_fleet_rca"));

const queryResult = JSON.parse(run([
  "-c",
  `
import json
from duckdb_query_service import LakeQuery
from alert_engine import AlertEngine
lake = LakeQuery(${JSON.stringify(lakeRoot)})
print(json.dumps({
  "engine": lake.engine,
  "tables": lake.list_tables(),
  "metricRows": len(lake.metric_rows(tenant_id="tenant-a")),
  "sequenceNos": sorted({row["sequence_no"] for row in lake.read_table("raw_source_bundle_metric", tenant_id="tenant-a")}),
  "resourceRows": len(lake.resource_pressure(tenant_id="tenant-a")),
  "resourceHosts": sorted({row["host_id"] for row in lake.resource_pressure(tenant_id="tenant-a")}),
  "covarianceSampleCount": lake.covariance(tenant_id="tenant-a")["sampleCount"],
  "networkCouplingRows": len(lake.network_gpu_coupling(tenant_id="tenant-a")),
  "hardwareHealthRows": len(lake.hardware_health(tenant_id="tenant-a")),
  "repairCandidateRows": len(lake.repair_candidates(tenant_id="tenant-a")),
  "fleetRcaRows": len(lake.fleet_rca(tenant_id="tenant-a")),
  "alertCandidateRows": len(lake.alert_candidates(tenant_id="tenant-a")),
  "alerts": AlertEngine(lake).evaluate(tenant_id="tenant-a")
}, default=str))
`
]));

assert.ok(queryResult.tables.includes("raw_source_bundle_metric"));
assert.ok(queryResult.metricRows >= rawResult.rowCount + liveRawResult.rowCount);
assert.ok(queryResult.sequenceNos.includes(42));
assert.ok(queryResult.resourceRows >= 1);
assert.ok(queryResult.resourceHosts.includes("SPARK1"));
assert.ok(queryResult.resourceHosts.includes("SPARK2"));
assert.ok(queryResult.covarianceSampleCount >= 1);
assert.ok(queryResult.networkCouplingRows >= 1);
assert.ok(queryResult.hardwareHealthRows >= 1);
assert.ok(queryResult.repairCandidateRows >= 1);
assert.ok(queryResult.fleetRcaRows >= 1);
assert.ok(queryResult.alertCandidateRows >= 0);
assert.ok(queryResult.alerts.some((alert) => alert.incidentKey.includes("hardware")));

const observabilityResult = JSON.parse(run([
  "-c",
  `
import json
from fastapi import FastAPI
from fastapi.testclient import TestClient
from platform_common import HttpRequestMetrics, install_request_observability

class FakeSpanExporter:
    def __init__(self):
        self.spans = []

    def export_http_request_span(self, **kwargs):
        self.spans.append(kwargs)

app = FastAPI()
metrics = HttpRequestMetrics(service_name="test-api")
exporter = FakeSpanExporter()
install_request_observability(app, metrics, span_exporter=exporter)

@app.get("/ping/{item}")
async def ping(item: str):
    return {"item": item}

trace_id = "a" * 32
client = TestClient(app)
response = client.get("/ping/value", headers={"traceparent": f"00-{trace_id}-{'b' * 16}-01"})
print(json.dumps({
    "status": response.status_code,
    "traceHeader": response.headers.get("x-trace-id"),
    "metricCount": metrics.snapshot()[0].count,
    "spanCount": len(exporter.spans),
    "spanPath": exporter.spans[0]["path"],
    "spanTraceId": exporter.spans[0]["trace_id"],
}))
`
]));

assert.equal(observabilityResult.status, 200);
assert.equal(observabilityResult.traceHeader, "a".repeat(32));
assert.equal(observabilityResult.metricCount, 1);
assert.equal(observabilityResult.spanCount, 1);
assert.equal(observabilityResult.spanPath, "/ping/{item}");
assert.equal(observabilityResult.spanTraceId, "a".repeat(32));

const queryApiResult = JSON.parse(run([
  "-c",
  `
import json
from pathlib import Path
from fastapi.testclient import TestClient
from duckdb_query_service.app import QuerySettings, create_app

client = TestClient(create_app(QuerySettings(lake_root=Path(${JSON.stringify(lakeRoot)}))))
health = client.get("/health")
metrics = client.get("/metrics").text
print(json.dumps({
    "health": health.status_code,
    "hasUpMetric": "turbalance_query_up 1" in metrics,
    "hasRequestMetric": "turbalance_query_http_requests_total" in metrics,
}))
`
]));

assert.equal(queryApiResult.health, 200);
assert.equal(queryApiResult.hasUpMetric, true);
assert.equal(queryApiResult.hasRequestMetric, true);

const apiAuthResult = JSON.parse(run([
  "-c",
  `
import json
from pathlib import Path
from fastapi.testclient import TestClient
from api_server import ApiSettings, create_app, load_token_rules

settings = ApiSettings(
    lake_root=Path(${JSON.stringify(lakeRoot)}),
    alert_db=Path(${JSON.stringify(temp)}) / "api-auth-alerts.sqlite",
    require_auth=True,
    api_tokens=(
        "tenant-a:viewer-token:viewer:tenant-viewer",
        "tenant-a:operator-token:operator:tenant-operator",
        "*:admin-token:admin:platform-admin",
    ),
)
client = TestClient(create_app(settings))
viewer_headers = {"authorization": "Bearer viewer-token"}
operator_headers = {"authorization": "Bearer operator-token"}
admin_headers = {"authorization": "Bearer admin-token"}
no_token = client.get("/v1/hosts")
viewer_hosts = client.get("/v1/hosts", headers=viewer_headers)
viewer_other_tenant = client.get("/v1/hosts?tenantId=tenant-b", headers=viewer_headers)
admin_other_tenant = client.get("/v1/hosts?tenantId=tenant-b", headers=admin_headers)
me = client.get("/v1/me", headers=viewer_headers)
viewer_ack = client.post("/v1/alerts/missing-alert/ack", headers=viewer_headers)
operator_ack = client.post("/v1/alerts/missing-alert/ack", headers=operator_headers)
metrics = client.get("/metrics", headers=viewer_headers)
print(json.dumps({
    "noToken": no_token.status_code,
    "viewerHosts": viewer_hosts.status_code,
    "viewerHostCount": len(viewer_hosts.json().get("hosts", [])),
    "viewerOtherTenant": viewer_other_tenant.status_code,
    "adminOtherTenant": admin_other_tenant.status_code,
    "meRole": me.json().get("role"),
    "meTenant": me.json().get("tenantId"),
    "viewerAck": viewer_ack.status_code,
    "operatorAck": operator_ack.status_code,
    "operatorAckStatus": operator_ack.json().get("status"),
    "metrics": metrics.status_code,
    "parsedRules": len(load_token_rules("tenant-a:viewer-token:viewer:tenant-viewer")),
}))
`
]));

assert.equal(apiAuthResult.noToken, 401);
assert.equal(apiAuthResult.viewerHosts, 200);
assert.ok(apiAuthResult.viewerHostCount >= 1);
assert.equal(apiAuthResult.viewerOtherTenant, 403);
assert.equal(apiAuthResult.adminOtherTenant, 200);
assert.equal(apiAuthResult.meRole, "viewer");
assert.equal(apiAuthResult.meTenant, "tenant-a");
assert.equal(apiAuthResult.viewerAck, 403);
assert.equal(apiAuthResult.operatorAck, 200);
assert.equal(apiAuthResult.operatorAckStatus, "missing");
assert.equal(apiAuthResult.metrics, 200);
assert.equal(apiAuthResult.parsedRules, 1);

const apiDiscoveryResult = JSON.parse(run([
  "-c",
  `
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from fastapi.testclient import TestClient
from api_server import ApiSettings, create_app

class DiscoveryHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        payloads = {
            "/ready": {"status": "ready", "metadataBackend": "postgres", "certificateMode": "spire"},
            "/v1/hosts": {"hosts": [{"hostId": "host-a", "agentId": "agent-a"}]},
            "/v1/agents": {"agents": [{"agentId": "agent-a", "hostId": "host-a", "status": "enrolled", "spiffeId": "spiffe://turbalance.test/host/host-a/agent/agent-a", "certificateStatus": "external", "certificateNotAfter": ""}]},
            "/v1/services": {"services": [{"serviceId": "collector", "serviceType": "collector", "baseUrl": "http://collector", "healthUrl": "http://collector/health"}]},
        }
        body = json.dumps(payloads.get(self.path, {})).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, format, *args):
        return

server = HTTPServer(("127.0.0.1", 0), DiscoveryHandler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
try:
    settings = ApiSettings(
        lake_root=Path(${JSON.stringify(lakeRoot)}),
        discovery_url=f"http://127.0.0.1:{server.server_port}",
    )
    client = TestClient(create_app(settings))
    catalog = client.get("/v1/discovery/catalog")
    print(json.dumps({
        "status": catalog.status_code,
        "catalogStatus": catalog.json().get("status"),
        "metadataBackend": catalog.json().get("ready", {}).get("metadataBackend"),
        "certificateMode": catalog.json().get("ready", {}).get("certificateMode"),
        "hosts": len(catalog.json().get("hosts", [])),
        "agents": len(catalog.json().get("agents", [])),
        "services": len(catalog.json().get("services", [])),
    }))
finally:
    server.shutdown()
`
]));

assert.equal(apiDiscoveryResult.status, 200);
assert.equal(apiDiscoveryResult.catalogStatus, "ready");
assert.equal(apiDiscoveryResult.metadataBackend, "postgres");
assert.equal(apiDiscoveryResult.certificateMode, "spire");
assert.equal(apiDiscoveryResult.hosts, 1);
assert.equal(apiDiscoveryResult.agents, 1);
assert.equal(apiDiscoveryResult.services, 1);

const discoveryConsulResult = JSON.parse(run([
  "-c",
  `
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from fastapi.testclient import TestClient
from discovery_api import DiscoverySettings, create_app

requests = []

class ConsulHandler(BaseHTTPRequestHandler):
    def do_PUT(self):
        body = self.rfile.read(int(self.headers.get("content-length", "0"))).decode("utf-8")
        requests.append({"path": self.path, "body": body, "token": self.headers.get("X-Consul-Token")})
        self.send_response(200)
        self.end_headers()
    def log_message(self, format, *args):
        return

server = HTTPServer(("127.0.0.1", 0), ConsulHandler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
try:
    client = TestClient(create_app(DiscoverySettings(
        db_path=Path(${JSON.stringify(temp)}) / "discovery-consul.sqlite",
        consul_url=f"http://127.0.0.1:{server.server_port}",
        consul_token="consul-token",
    )))
    ready = client.get("/ready")
    host = client.post("/v1/hosts", json={"hostId": "host-consul", "hostname": "host.local", "agentId": "agent-consul"})
    service = client.post("/v1/services", json={
        "serviceId": "api-server",
        "serviceType": "api",
        "baseUrl": "http://api-server:8080",
        "healthUrl": "http://api-server:8080/health",
        "labels": {"lane": "product"},
    })
    print(json.dumps({
        "ready": ready.status_code,
        "consulMode": ready.json().get("consulMode"),
        "hostMirrored": host.json().get("consulMirrored"),
        "serviceMirrored": service.json().get("consulMirrored"),
        "requestCount": len(requests),
        "hasServiceRegister": any(item["path"] == "/v1/agent/service/register" for item in requests),
        "hasServiceKv": any(item["path"].startswith("/v1/kv/turbalance/discovery/services/api-server") for item in requests),
        "hasHostKv": any(item["path"].startswith("/v1/kv/turbalance/discovery/hosts/host-consul") for item in requests),
        "tokenSeen": all(item["token"] == "consul-token" for item in requests),
    }))
finally:
    server.shutdown()
`
]));

assert.equal(discoveryConsulResult.ready, 200);
assert.equal(discoveryConsulResult.consulMode, "mirror");
assert.equal(discoveryConsulResult.hostMirrored, true);
assert.equal(discoveryConsulResult.serviceMirrored, true);
assert.equal(discoveryConsulResult.requestCount, 3);
assert.equal(discoveryConsulResult.hasServiceRegister, true);
assert.equal(discoveryConsulResult.hasServiceKv, true);
assert.equal(discoveryConsulResult.hasHostKv, true);
assert.equal(discoveryConsulResult.tokenSeen, true);

const apiJwtResult = JSON.parse(run([
  "-c",
  `
import base64
import json
import time
from pathlib import Path
from fastapi.testclient import TestClient
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from api_server import ApiSettings, create_app

def b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")

private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
public_numbers = private_key.public_key().public_numbers()
jwks = {
    "keys": [{
        "kty": "RSA",
        "kid": "jwt-test-key",
        "alg": "RS256",
        "use": "sig",
        "n": b64url(public_numbers.n.to_bytes((public_numbers.n.bit_length() + 7) // 8, "big")),
        "e": b64url(public_numbers.e.to_bytes((public_numbers.e.bit_length() + 7) // 8, "big")),
    }]
}
header = {"alg": "RS256", "kid": "jwt-test-key", "typ": "JWT"}
payload = {
    "iss": "https://issuer.example",
    "aud": "turbalance-api",
    "sub": "oidc-user",
    "tenant_id": "tenant-a",
    "role": "operator",
    "exp": int(time.time()) + 600,
}
signing_input = ".".join([
    b64url(json.dumps(header, separators=(",", ":")).encode()),
    b64url(json.dumps(payload, separators=(",", ":")).encode()),
])
signature = private_key.sign(signing_input.encode(), padding.PKCS1v15(), hashes.SHA256())
token = signing_input + "." + b64url(signature)
settings = ApiSettings(
    lake_root=Path(${JSON.stringify(lakeRoot)}),
    alert_db=Path(${JSON.stringify(temp)}) / "api-jwt-alerts.sqlite",
    require_auth=True,
    jwks_json=json.dumps(jwks),
    jwt_issuer="https://issuer.example",
    jwt_audience="turbalance-api",
)
client = TestClient(create_app(settings))
me = client.get("/v1/me", headers={"authorization": "Bearer " + token})
ack = client.post("/v1/alerts/missing-alert/ack", headers={"authorization": "Bearer " + token})
bad_settings = ApiSettings(
    lake_root=Path(${JSON.stringify(lakeRoot)}),
    require_auth=True,
    jwks_json=json.dumps(jwks),
    jwt_issuer="https://issuer.example",
    jwt_audience="wrong-audience",
)
bad = TestClient(create_app(bad_settings)).get("/v1/me", headers={"authorization": "Bearer " + token})
print(json.dumps({
    "me": me.status_code,
    "role": me.json().get("role"),
    "tenantId": me.json().get("tenantId"),
    "ack": ack.status_code,
    "bad": bad.status_code,
}))
`
]));

assert.equal(apiJwtResult.me, 200);
assert.equal(apiJwtResult.role, "operator");
assert.equal(apiJwtResult.tenantId, "tenant-a");
assert.equal(apiJwtResult.ack, 200);
assert.equal(apiJwtResult.bad, 401);

const sourceMetricFile = rawResult.files.find((file) => file.table_name === "raw_source_bundle_metric");
assert.ok(sourceMetricFile, "source bundle metric file should be present");
const compactResult = JSON.parse(run([
  "-m",
  "raw_writer",
  "--lake-root",
  lakeRoot,
  "--compact-table",
  "raw_source_bundle_metric",
  "--tenant-id",
  "tenant-a",
  "--compact-date",
  sourceMetricFile.dt,
  "--compact-hour",
  sourceMetricFile.hour,
  "--delete-compacted-inputs"
]));

assert.equal(compactResult.status, "compacted");
assert.equal(compactResult.inputFileCount, 1);
assert.equal(compactResult.deletedInputs, true);

const reconcileResult = JSON.parse(run([
  "-m",
  "raw_writer",
  "--lake-root",
  lakeRoot,
  "--reconcile"
]));

assert.equal(reconcileResult.status, "ok");
assert.equal(reconcileResult.missingFiles.length, 0);
assert.equal(reconcileResult.rowCountMismatches.length, 0);
assert.equal(reconcileResult.orphanRawFiles.length, 0);

const validationResult = JSON.parse(run([
  "-m",
  "transform_runner",
  "--lake-root",
  lakeRoot,
  "--tenant-id",
  "tenant-a",
  "--validate"
]));

assert.equal(validationResult.status, "ok");
assert.ok(validationResult.checks.some((check) => check.name === "sqlmesh_models_defined" && check.passed));
assert.ok(validationResult.checks.some((check) => check.name === "raw_lake_reconciles" && check.passed));
assert.ok(validationResult.checks.some((check) => check.name === "principal_mode_eigenvalues_available" && check.passed));
assert.ok(validationResult.checks.some((check) => check.name === "expanded_virtual_sensor_catalog_queryable" && check.passed));

const securityResult = JSON.parse(run([
  "-c",
  `
import json
import time
from pathlib import Path
from fastapi.testclient import TestClient
from collector_gateway import CollectorSettings, create_app
from collector_gateway.security import sign_body

lake = Path(${JSON.stringify(lakeRoot)})
settings = CollectorSettings(
    lake_root=lake,
    hmac_secret="test-secret",
    replay_db=lake.parent / "replay.sqlite",
    audit_log=lake.parent / "audit.jsonl",
    rate_limit_per_minute=100,
)
client = TestClient(create_app(settings))
body = json.dumps({
    "schemaVersion": "turba.telemetry_batch.v1",
    "tenantId": "tenant-secure",
    "hostId": "secure-host",
    "agentId": "secure-agent",
    "sequenceNo": 1,
    "samples": [{
        "sensorType": "host_heartbeat",
        "source": "test",
        "eventTs": "2026-06-04T00:00:00Z",
        "metrics": [{"name": "host.load_average_1m", "value": 1.0}]
    }]
}, separators=(",", ":")).encode()
timestamp = str(int(time.time()))
nonce = "nonce-1"
headers = {
    "x-turbalance-timestamp": timestamp,
    "x-turbalance-nonce": nonce,
    "x-turbalance-signature": "v1=" + sign_body("test-secret", timestamp, nonce, body),
    "content-type": "application/json",
}
first = client.post("/v1/telemetry/batches", content=body, headers=headers)
second = client.post("/v1/telemetry/batches", content=body, headers=headers)
metrics = client.get("/metrics").text
print(json.dumps({
    "first": first.status_code,
    "second": second.status_code,
    "audit": (lake.parent / "audit.jsonl").exists(),
    "hasReportRate": "turbalance_collector_incoming_telemetry_reports_per_minute" in metrics,
    "hasReportWindowCount": "turbalance_collector_incoming_telemetry_reports_window_count 1" in metrics,
}))
`
]));

assert.equal(securityResult.first, 200);
assert.equal(securityResult.second, 409);
assert.equal(securityResult.audit, true);
assert.equal(securityResult.hasReportRate, true);
assert.equal(securityResult.hasReportWindowCount, true);

const tenantCredentialResult = JSON.parse(run([
  "-c",
  `
import json
import time
from pathlib import Path
from fastapi.testclient import TestClient
from collector_gateway import CollectorSettings, create_app, load_collector_credentials
from collector_gateway.security import sign_body

lake = Path(${JSON.stringify(lakeRoot)}) / "tenant-credentials"
settings = CollectorSettings(
    lake_root=lake,
    tenant_credentials=load_collector_credentials("tenant-a:token-a:hmac-a:collector-a,tenant-b:token-b:hmac-b:collector-b"),
    replay_db=lake.parent / "tenant-credentials-replay.sqlite",
    audit_log=lake.parent / "tenant-credentials-audit.jsonl",
    rate_limit_per_minute=100,
)
client = TestClient(create_app(settings))

def bundle_body(tenant):
    return json.dumps({
        "tenantId": tenant,
        "hostId": "tenant-host",
        "agentId": "tenant-agent",
        "sequenceNo": 1,
        "bundle": {
            "sources": {
                "prometheus": [{
                    "runId": "run-tenant-1",
                    "metrics": {"gpu_utilization_pct": 42}
                }]
            }
        }
    }, separators=(",", ":")).encode()

def signed_headers(token, secret, nonce, body):
    timestamp = str(int(time.time()))
    return {
        "authorization": "Bearer " + token,
        "x-turbalance-timestamp": timestamp,
        "x-turbalance-nonce": nonce,
        "x-turbalance-signature": "v1=" + sign_body(secret, timestamp, nonce, body),
        "content-type": "application/json",
    }

good_body = bundle_body("tenant-a")
bad_body = bundle_body("tenant-b")
good = client.post("/v1/source-bundles", content=good_body, headers=signed_headers("token-a", "hmac-a", "tenant-cred-1", good_body))
mismatch = client.post("/v1/source-bundles", content=bad_body, headers=signed_headers("token-a", "hmac-a", "tenant-cred-2", bad_body))
ready = client.get("/ready").json()
print(json.dumps({
    "good": good.status_code,
    "mismatch": mismatch.status_code,
    "tenantCredentials": ready["auth"]["tenantCredentials"],
    "goodStatus": good.json().get("status"),
}))
`
]));

assert.equal(tenantCredentialResult.good, 200);
assert.equal(tenantCredentialResult.mismatch, 403);
assert.equal(tenantCredentialResult.tenantCredentials, 2);
assert.equal(tenantCredentialResult.goodStatus, "written");

const mtlsResult = JSON.parse(run([
  "-c",
  `
import json
from pathlib import Path
from fastapi.testclient import TestClient
from collector_gateway import CollectorSettings, create_app, parse_xfcc_header

lake = Path(${JSON.stringify(lakeRoot)})
settings = CollectorSettings(
    lake_root=lake,
    replay_db=lake.parent / "mtls-replay.sqlite",
    audit_log=lake.parent / "mtls-audit.jsonl",
    rate_limit_per_minute=100,
    require_mtls=True,
    trusted_spiffe_prefix="spiffe://turbalance.test/",
)
client = TestClient(create_app(settings))
body = {
    "schemaVersion": "turba.telemetry_batch.v1",
    "tenantId": "tenant-mtls",
    "hostId": "mtls-host",
    "agentId": "mtls-agent",
    "sequenceNo": 1,
    "samples": [{
        "sensorType": "host_heartbeat",
        "source": "test",
        "eventTs": "2026-06-04T00:00:00Z",
        "metrics": [{"name": "host.cpu.load_pct", "value": 33.0}]
    }]
}
trusted_xfcc = 'By=spiffe://proxy;Hash=ABCD;Subject="CN=mtls-agent";URI=spiffe://turbalance.test/host/mtls-host/agent/mtls-agent'
untrusted_xfcc = 'By=spiffe://proxy;Hash=ABCD;Subject="CN=mtls-agent";URI=spiffe://other.test/host/mtls-host/agent/mtls-agent'
missing = client.post("/v1/telemetry/batches", json=body)
untrusted = client.post("/v1/telemetry/batches", json=body, headers={"x-forwarded-client-cert": untrusted_xfcc})
trusted = client.post("/v1/telemetry/batches", json=body, headers={"x-forwarded-client-cert": trusted_xfcc})
metrics = client.get("/metrics").text
parsed = parse_xfcc_header(trusted_xfcc)[0]
print(json.dumps({
    "missing": missing.status_code,
    "untrusted": untrusted.status_code,
    "trusted": trusted.status_code,
    "spiffeId": parsed.spiffe_id,
    "fingerprint": parsed.fingerprint,
    "hasMtlAuthMetric": "turbalance_collector_mtls_authentications_total 1" in metrics,
    "hasMtlFailureMetric": "turbalance_collector_mtls_failures_total 2" in metrics,
}))
`
]));

assert.equal(mtlsResult.missing, 401);
assert.equal(mtlsResult.untrusted, 401);
assert.equal(mtlsResult.trusted, 200);
assert.equal(mtlsResult.spiffeId, "spiffe://turbalance.test/host/mtls-host/agent/mtls-agent");
assert.equal(mtlsResult.fingerprint, "abcd");
assert.equal(mtlsResult.hasMtlAuthMetric, true);
assert.equal(mtlsResult.hasMtlFailureMetric, true);

const discoveryResult = JSON.parse(run([
  "-c",
  `
import json
from pathlib import Path
from fastapi.testclient import TestClient
from discovery_api import DiscoverySettings, create_app, create_metadata_store

settings = DiscoverySettings(
    db_path=Path(${JSON.stringify(temp)}) / "discovery.sqlite",
    enrollment_token="enroll-secret",
    trust_domain="turbalance.test",
    ca_dir=Path(${JSON.stringify(temp)}) / "discovery-ca",
    certificate_ttl_days=7,
)
client = TestClient(create_app(settings))
ready = client.get("/ready")
body = {
    "hostId": "host-secure-1",
    "hostname": "host-secure-1.local",
    "agentId": "agent.secure_1",
    "capabilities": {"ebpf": False, "heartbeat": True},
    "labels": {"rack": "r1"},
}
bad = client.post("/v1/agents/enroll", json=body, headers={"authorization": "Bearer wrong"})
good = client.post("/v1/agents/enroll", json=body, headers={"authorization": "Bearer enroll-secret"})
identity = client.get("/v1/agents/agent.secure_1/identity")
rotate = client.post("/v1/agents/agent.secure_1/certificates/rotate", json={"ttlDays": 3}, headers={"authorization": "Bearer enroll-secret"})
revoked = client.post("/v1/agents/agent.secure_1/certificates/revoke", headers={"authorization": "Bearer enroll-secret"})
revoked_identity = client.get("/v1/agents/agent.secure_1/identity")
hosts = client.get("/v1/hosts")
metrics = client.get("/metrics").text
print(json.dumps({
    "ready": ready.status_code,
    "metadataBackend": ready.json().get("metadataBackend"),
    "certificateMode": ready.json().get("certificateMode"),
    "bad": bad.status_code,
    "good": good.status_code,
    "identity": identity.status_code,
    "rotate": rotate.status_code,
    "revoked": revoked.status_code,
    "revokedStatus": revoked_identity.json().get("certificateStatus"),
    "certificateStatus": good.json().get("certificate", {}).get("status"),
    "hasCertificate": "BEGIN CERTIFICATE" in good.json().get("certificate", {}).get("certificatePem", ""),
    "hasGeneratedPrivateKey": "BEGIN PRIVATE KEY" in good.json().get("certificate", {}).get("generatedPrivateKeyPem", ""),
    "fingerprintLength": len(good.json().get("certificate", {}).get("fingerprintSha256", "")),
    "spiffeId": good.json().get("spiffeId"),
    "secret": good.json().get("clientCertSecretName"),
    "hosts": len(hosts.json().get("hosts", [])),
    "hasDiscoveryUpMetric": "turbalance_discovery_up 1" in metrics,
    "hasDiscoveryRequestMetric": "turbalance_discovery_http_requests_total" in metrics,
    "sqliteStoreBackend": create_metadata_store("", Path(${JSON.stringify(temp)}) / "metadata.sqlite").backend,
    "postgresStoreBackend": create_metadata_store("postgresql://metadata.example/turbalance", Path(${JSON.stringify(temp)}) / "metadata.sqlite").backend,
}))
`
]));

assert.equal(discoveryResult.ready, 200);
assert.equal(discoveryResult.metadataBackend, "sqlite");
assert.equal(discoveryResult.certificateMode, "local-ca");
assert.equal(discoveryResult.bad, 401);
assert.equal(discoveryResult.good, 200);
assert.equal(discoveryResult.identity, 200);
assert.equal(discoveryResult.rotate, 200);
assert.equal(discoveryResult.revoked, 200);
assert.equal(discoveryResult.revokedStatus, "revoked");
assert.equal(discoveryResult.certificateStatus, "active");
assert.equal(discoveryResult.hasCertificate, true);
assert.equal(discoveryResult.hasGeneratedPrivateKey, true);
assert.equal(discoveryResult.fingerprintLength, 64);
assert.equal(discoveryResult.spiffeId, "spiffe://turbalance.test/host/host-secure-1/agent/agent.secure_1");
assert.equal(discoveryResult.secret, "turbalance-agent-agent-secure-1-mtls");
assert.equal(discoveryResult.hosts, 1);
assert.equal(discoveryResult.hasDiscoveryUpMetric, true);
assert.equal(discoveryResult.hasDiscoveryRequestMetric, true);
assert.equal(discoveryResult.sqliteStoreBackend, "sqlite");
assert.equal(discoveryResult.postgresStoreBackend, "postgres");

const discoveryIdentityModesResult = JSON.parse(run([
  "-c",
  `
import json
import sys
from pathlib import Path
from fastapi.testclient import TestClient
from discovery_api import DiscoverySettings, create_app

base = Path(${JSON.stringify(temp)})
body = {"hostId": "host-spire-1", "agentId": "agent-spire-1", "capabilities": {"ebpf": True}}
spire = TestClient(create_app(DiscoverySettings(
    db_path=base / "discovery-spire.sqlite",
    enrollment_token="enroll-secret",
    trust_domain="turbalance.test",
    certificate_mode="spire",
)))
spire_ready = spire.get("/ready")
spire_enroll = spire.post("/v1/agents/enroll", json=body, headers={"authorization": "Bearer enroll-secret"})
spire_rotate = spire.post("/v1/agents/agent-spire-1/certificates/rotate", json={}, headers={"authorization": "Bearer enroll-secret"})
signer_out = base / "external-ca-request.json"
signer_script = base / "external-ca-signer.py"
signer_script.write_text(
    "import json, pathlib, sys\\n"
    "request = json.loads(sys.stdin.read())\\n"
    f"pathlib.Path({str(signer_out)!r}).write_text(json.dumps(request, sort_keys=True), encoding='utf-8')\\n"
    "print(json.dumps({"
    "'certificatePem': '-----BEGIN CERTIFICATE-----\\\\nexternal\\\\n-----END CERTIFICATE-----\\\\n', "
    "'caCertificatePem': '-----BEGIN CERTIFICATE-----\\\\nexternal-ca\\\\n-----END CERTIFICATE-----\\\\n', "
    "'serialNumber': 'external-serial-1', "
    "'notBefore': '2026-06-04T00:00:00+00:00', "
    "'notAfter': '2026-07-04T00:00:00+00:00', "
    "'fingerprintSha256': 'f' * 64"
    "}))\\n",
    encoding="utf-8",
)
external = TestClient(create_app(DiscoverySettings(
    db_path=base / "discovery-external.sqlite",
    enrollment_token="enroll-secret",
    trust_domain="turbalance.test",
    certificate_mode="external-ca",
    external_ca_command=f"{sys.executable} {signer_script}",
)))
external_enroll = external.post("/v1/agents/enroll", json={
    "hostId": "host-external-1",
    "agentId": "agent-external-1",
    "publicKeyPem": "fake-public-key",
}, headers={"authorization": "Bearer enroll-secret"})
signer_request = json.loads(signer_out.read_text(encoding="utf-8"))
print(json.dumps({
    "spireReadyMode": spire_ready.json().get("certificateMode"),
    "spireEnroll": spire_enroll.status_code,
    "spireMtlsMode": spire_enroll.json().get("mtlsMode"),
    "spireCertStatus": spire_enroll.json().get("certificate", {}).get("status"),
    "spireRotate": spire_rotate.status_code,
    "externalEnroll": external_enroll.status_code,
    "externalMtlsMode": external_enroll.json().get("mtlsMode"),
    "externalSerial": external_enroll.json().get("certificate", {}).get("serialNumber"),
    "externalSignerSpiffe": signer_request.get("spiffeId"),
}))
`
]));

assert.equal(discoveryIdentityModesResult.spireReadyMode, "spire");
assert.equal(discoveryIdentityModesResult.spireEnroll, 200);
assert.equal(discoveryIdentityModesResult.spireMtlsMode, "spire-svid");
assert.equal(discoveryIdentityModesResult.spireCertStatus, "external");
assert.equal(discoveryIdentityModesResult.spireRotate, 409);
assert.equal(discoveryIdentityModesResult.externalEnroll, 200);
assert.equal(discoveryIdentityModesResult.externalMtlsMode, "issued-external-ca");
assert.equal(discoveryIdentityModesResult.externalSerial, "external-serial-1");
assert.equal(discoveryIdentityModesResult.externalSignerSpiffe, "spiffe://turbalance.test/host/host-external-1/agent/agent-external-1");

const backpressureResult = JSON.parse(run([
  "-c",
  `
import json
from pathlib import Path
from collector_gateway.backpressure import BackpressureAdapter
from collector_gateway.queue import FileQueuePublisher, create_queue_publisher

spool = Path(${JSON.stringify(temp)}) / "collector-spool"
adapter = BackpressureAdapter(max_inflight=1, spool_dir=spool, max_spool_files=2)
first = adapter.admit_or_spool(b'{"ok": true}', metadata={"route": "test"})
second = adapter.admit_or_spool(b'{"queued": true}', metadata={"route": "test"})
snapshot_while_active = adapter.snapshot()
adapter.release(first)
third = adapter.admit_or_spool(b'{"ok": true}', metadata={"route": "test"})
adapter.release(third)
queue_dir = Path(${JSON.stringify(temp)}) / "collector-queue"
queue_adapter = BackpressureAdapter(
    max_inflight=1,
    spool_dir=None,
    queue_publisher=FileQueuePublisher(queue_dir),
)
queue_first = queue_adapter.admit_or_spool(b'{"held": true}', metadata={"route": "test"})
queue_second = queue_adapter.admit_or_spool(b'{"queued": true}', metadata={"route": "test"})
queue_adapter.release(queue_first)
queue_snapshot = queue_adapter.snapshot()
print(json.dumps({
    "first": first.action,
    "second": second.action,
    "secondPathExists": Path(second.path).exists(),
    "active": snapshot_while_active["active"],
    "spoolFiles": adapter.snapshot()["spoolFiles"],
    "third": third.action,
    "queueFirst": queue_first.action,
    "queueSecond": queue_second.action,
    "queueBackend": queue_second.queue_backend,
    "queuePathExists": Path(queue_second.path).exists(),
    "queueSnapshotBackend": queue_snapshot["queueBackend"],
    "disabledPublisher": create_queue_publisher("disabled") is None,
}))
`
]));

assert.equal(backpressureResult.first, "acquired");
assert.equal(backpressureResult.second, "queued");
assert.equal(backpressureResult.secondPathExists, true);
assert.equal(backpressureResult.active, 1);
assert.equal(backpressureResult.spoolFiles, 1);
assert.equal(backpressureResult.third, "acquired");
assert.equal(backpressureResult.queueFirst, "acquired");
assert.equal(backpressureResult.queueSecond, "queued");
assert.equal(backpressureResult.queueBackend, "file");
assert.equal(backpressureResult.queuePathExists, true);
assert.equal(backpressureResult.queueSnapshotBackend, "file");
assert.equal(backpressureResult.disabledPublisher, true);

const queueGatewayResult = JSON.parse(run([
  "-c",
  `
import json
import sys
from pathlib import Path
from fastapi.testclient import TestClient
from queue_gateway import QueueGatewaySettings, create_app

queue_dir = Path(${JSON.stringify(temp)}) / "queue-gateway"
client = TestClient(create_app(QueueGatewaySettings(file_dir=queue_dir, bearer_token="queue-token")))
payload = {"queuedAt": "2026-06-04T00:00:00Z", "metadata": {"route": "telemetry_batches"}, "body": "{\\"ok\\": true}"}
missing = client.post("/v1/queue/collector", json=payload)
accepted = client.post("/v1/queue/collector", json=payload, headers={"authorization": "Bearer queue-token"})
metrics = client.get("/metrics").text
broker_dry_run = TestClient(create_app(QueueGatewaySettings(
    backend="kafka",
    broker_url="broker-a:9092",
    broker_topic="collector.telemetry",
    dry_run=True,
)))
dry_run_ready = broker_dry_run.get("/ready")
dry_run_publish = broker_dry_run.post("/v1/queue/collector", json=payload)
producer_out = Path(${JSON.stringify(temp)}) / "queue-producer.json"
producer_script = Path(${JSON.stringify(temp)}) / "fake-producer.py"
producer_script.write_text(
    "import json, pathlib, sys\\n"
    f"pathlib.Path({str(producer_out)!r}).write_text(json.dumps({{'argv': sys.argv[1:], 'stdin': sys.stdin.read()}}, sort_keys=True), encoding='utf-8')\\n",
    encoding="utf-8",
)
broker_exec = TestClient(create_app(QueueGatewaySettings(
    backend="kafka",
    broker_url="broker-a:9092",
    broker_topic="collector.telemetry",
    producer_command=f"{sys.executable} {producer_script}",
)))
exec_publish = broker_exec.post("/v1/queue/collector", json=payload)
producer_payload = json.loads(producer_out.read_text(encoding="utf-8"))
producer_envelope = json.loads(producer_payload["stdin"])
print(json.dumps({
    "missing": missing.status_code,
    "accepted": accepted.status_code,
    "pathExists": Path(accepted.json().get("path", "")).exists(),
    "hasAcceptedMetric": "turbalance_queue_gateway_accepted_total 1" in metrics,
    "hasAuthFailureMetric": "turbalance_queue_gateway_auth_failures_total 1" in metrics,
    "hasRequestMetric": "turbalance_queue_gateway_http_requests_total" in metrics,
    "dryRunReady": dry_run_ready.status_code,
    "dryRunPublish": dry_run_publish.status_code,
    "dryRunBackend": dry_run_publish.json().get("backend"),
    "execPublish": exec_publish.status_code,
    "execBackend": exec_publish.json().get("backend"),
    "producerReceivedBody": producer_envelope.get("body") == "{\\"ok\\": true}",
}))
`
]));

assert.equal(queueGatewayResult.missing, 401);
assert.equal(queueGatewayResult.accepted, 200);
assert.equal(queueGatewayResult.pathExists, true);
assert.equal(queueGatewayResult.hasAcceptedMetric, true);
assert.equal(queueGatewayResult.hasAuthFailureMetric, true);
assert.equal(queueGatewayResult.hasRequestMetric, true);
assert.equal(queueGatewayResult.dryRunReady, 200);
assert.equal(queueGatewayResult.dryRunPublish, 200);
assert.equal(queueGatewayResult.dryRunBackend, "kafka");
assert.equal(queueGatewayResult.execPublish, 200);
assert.equal(queueGatewayResult.execBackend, "kafka");
assert.equal(queueGatewayResult.producerReceivedBody, true);

const replaySpoolResult = JSON.parse(run([
  "-c",
  `
import json
from pathlib import Path
from collector_gateway.backpressure import BackpressureAdapter

bundle = json.loads(Path("fixtures/external-source-bundle.json").read_text(encoding="utf-8"))
spool = Path(${JSON.stringify(temp)}) / "replay-spool"
adapter = BackpressureAdapter(max_inflight=1, spool_dir=spool, max_spool_files=10)
held = adapter.admit_or_spool(b'{"held": true}', metadata={"route": "source_bundles"})
queued = adapter.admit_or_spool(json.dumps({
    "tenantId": "tenant-replay",
    "hostId": "replay-host",
    "agentId": "replay-agent",
    "bundle": bundle,
}, separators=(",", ":")).encode(), metadata={"route": "source_bundles"})
adapter.release(held)
print(json.dumps({"queued": queued.action, "spoolPath": queued.path, "exists": Path(queued.path).exists()}))
`
]));

assert.equal(replaySpoolResult.queued, "queued");
assert.equal(replaySpoolResult.exists, true);

const replayResult = JSON.parse(run([
  "-m",
  "collector_gateway",
  "--replay-spool",
  "--lake-root",
  path.join(temp, "replay-lake"),
  "--spool-dir",
  path.join(temp, "replay-spool"),
  "--processed-dir",
  path.join(temp, "replay-processed"),
  "--dead-letter-dir",
  path.join(temp, "replay-dead-letter"),
  "--limit",
  "10"
]));

assert.equal(replayResult.status, "ok");
assert.equal(replayResult.replayed, 1);
assert.equal(replayResult.failed, 0);
assert.equal(replayResult.remaining, 0);
assert.equal(replayResult.processedPaths.length, 1);

const grpcToolsAvailable = spawnSync(pythonCommand[0], [...pythonCommand.slice(1), "-c", "import grpc_tools.protoc"], {
  cwd: root,
  encoding: "utf8"
}).status === 0;

if (grpcToolsAvailable) {
  const generateResult = spawnSync("sh", ["scripts/generate-telemetry-protos.sh", generatedProtoDir], {
    cwd: root,
    encoding: "utf8"
  });
  if (generateResult.status !== 0) {
    throw new Error(`protobuf generation failed\nstdout:\n${generateResult.stdout}\nstderr:\n${generateResult.stderr}`);
  }
  assert.ok(fs.existsSync(path.join(generatedProtoDir, "telemetry/v1/telemetry_batch_pb2.py")));
  assert.ok(fs.existsSync(path.join(generatedProtoDir, "telemetry/v1/telemetry_batch_pb2_grpc.py")));

  const grpcCompatibility = JSON.parse(run([
    "-c",
    `
import json
import sys
from pathlib import Path
sys.path.insert(0, ${JSON.stringify(generatedProtoDir)})
from collector_gateway.grpc_server import create_server, generated_available
server = create_server(Path(${JSON.stringify(lakeRoot)}))
print(json.dumps({"available": generated_available(), "serverType": type(server).__name__}))
`
  ]));
  assert.equal(grpcCompatibility.available, true);
  assert.ok(grpcCompatibility.serverType);
}

const lifecycleResult = JSON.parse(run([
  "-c",
  `
import json
from pathlib import Path
from alert_engine import AlertRouter, AlertStore
store = AlertStore(Path(${JSON.stringify(temp)}) / "alerts.sqlite")
store.upsert_evaluated([{
    "incidentKey": "host-a:cpu-pressure",
    "severity": "warning",
    "title": "CPU pressure",
    "confidence": 0.8,
    "evidence": "CPU pressure is high.",
    "owner": "platform-runtime",
    "status": "open",
    "evaluatedAt": "2026-06-04T00:00:00Z"
}])
ack = store.transition("host-a:cpu-pressure", "acknowledged")
resolved = store.transition("host-a:cpu-pressure", "resolved")
dry_run = Path(${JSON.stringify(temp)}) / "alert-routes.jsonl"
router = AlertRouter(dry_run_path=dry_run)
delivery_first = router.dispatch([{
    "incidentKey": "host-a:network",
    "severity": "warning",
    "title": "Network pressure",
    "confidence": 0.7,
    "evidence": "Network utilization is high.",
    "owner": "platform-network",
    "status": "open",
}])
delivery_second = router.dispatch([{
    "incidentKey": "host-a:network",
    "severity": "warning",
    "title": "Network pressure",
    "confidence": 0.7,
    "evidence": "Network utilization is high.",
    "owner": "platform-network",
    "status": "open",
}])
print(json.dumps({
    "ack": ack["status"],
    "resolved": resolved["status"],
    "count": len(store.list_alerts()),
    "route": delivery_first[0].route,
    "delivered": delivery_first[0].delivered,
    "deliveredCount": delivery_first[0].count,
    "dedupedCount": delivery_second[0].count,
    "dryRunLines": len(dry_run.read_text(encoding="utf-8").splitlines()),
}))
`
]));

assert.equal(lifecycleResult.ack, "acknowledged");
assert.equal(lifecycleResult.resolved, "resolved");
assert.equal(lifecycleResult.count, 1);
assert.equal(lifecycleResult.route, "dry-run");
assert.equal(lifecycleResult.delivered, true);
assert.equal(lifecycleResult.deliveredCount, 1);
assert.equal(lifecycleResult.dedupedCount, 0);
assert.equal(lifecycleResult.dryRunLines, 1);

const packageFailure = spawnSync(process.execPath, ["scripts/package-lakehouse-release.js", "--out", path.join(temp, "bad-release"), "--no-archive"], {
  cwd: root,
  encoding: "utf8",
  env: {
    ...process.env,
    TURBALANCE_IMAGE_REGISTRY: "",
    TURBALANCE_IMAGE_TAG: "",
    TURBALANCE_LAKE_ROOT: "",
    TURBALANCE_API_JWT_ISSUER: "",
    TURBALANCE_QUEUE_GATEWAY_BROKER_URL: "",
  },
});
assert.notEqual(packageFailure.status, 0);
assert.ok(packageFailure.stderr.includes("release package is not production-ready"));

const packageResult = spawnSync(process.execPath, [
  "scripts/package-lakehouse-release.js",
  "--out",
  path.join(temp, "release"),
  "--no-archive",
  "--registry",
  "ghcr.io/acme/turbalance",
  "--tag",
  "2026.06.04.1",
  "--lake-root",
  "s3://acme-turbalance-prod/turbalance/lakehouse",
  "--jwt-issuer",
  "https://issuer.acme.internal",
  "--queue-broker-url",
  "kafka.prod.svc.cluster.local:9092",
  "--certificate-mode",
  "spire"
], {
  cwd: root,
  encoding: "utf8"
});
if (packageResult.status !== 0) {
  throw new Error(`release package failed\nstdout:\n${packageResult.stdout}\nstderr:\n${packageResult.stderr}`);
}
const packagePayload = JSON.parse(packageResult.stdout);
const releaseManifest = JSON.parse(fs.readFileSync(packagePayload.manifest, "utf8"));
const releaseKustomization = fs.readFileSync(path.join(temp, "release", "kustomize", "kustomization.yaml"), "utf8");
assert.equal(releaseManifest.status, "ready");
assert.equal(releaseManifest.certificateMode, "spire");
assert.ok(releaseKustomization.includes("lakehouse-platform-auth-secrets.yaml"));
assert.ok(releaseKustomization.includes("delete-placeholder-secrets.yaml"));

const clusterSmokeDryRun = JSON.parse(spawnSync(process.execPath, [
  "scripts/run-lakehouse-cluster-smoke.js",
  "--dry-run",
  "--namespace",
  "turbalance-lakehouse",
  "--overlay",
  path.join(temp, "release", "kustomize")
], {
  cwd: root,
  encoding: "utf8"
}).stdout);
assert.equal(clusterSmokeDryRun.status, "dry-run");
assert.ok(clusterSmokeDryRun.waits.some((command) => command.includes("deployment/api-server")));
assert.ok(clusterSmokeDryRun.serviceChecks.some((command) => command.includes("exec deploy/api-server")));
assert.ok(clusterSmokeDryRun.serviceChecks.some((command) => command.includes("http://api-server:8080/health")));

const ebpfContractResult = JSON.parse(spawnSync(process.execPath, [
  "scripts/validate-ebpf-agent-host.js",
  "--contract-only",
  "--probe-command",
  "printf 'ebpf.test=1\\n'"
], {
  cwd: root,
  encoding: "utf8"
}).stdout);
assert.equal(ebpfContractResult.status, "ready");
assert.equal(ebpfContractResult.probe.metrics[0].name, "ebpf.test");

for (const script of ["scripts/validate-lakehouse-security.js", "scripts/validate-lakehouse-alerts-dashboards.js"]) {
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${script} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  assert.equal(JSON.parse(result.stdout).status, "ok");
}

console.log("platform lakehouse tests passed");
