"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PRODUCT_CONFIG_VERSION = "turba.product.v1";
const DEFAULT_SPARK_REMOTES = ["user@192.168.10.20", "user@192.168.10.21"];
const DEFAULT_PI_REMOTES = Array.from({ length: 12 }, (_unused, index) => `pi@pi${index + 1}`);
const SECRET_KEY_PATTERN = /TOKEN|SECRET|PASSWORD|PRIVATE|API_KEY|HMAC|BEARER|AUTHORIZATION|KEY$/i;

function readProductConfig(configPath) {
  const fullPath = path.resolve(configPath || "ops/turbalance-product.example.json");
  const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  return normalizeProductConfig(parsed, fullPath);
}

function normalizeProductConfig(config, configPath = "") {
  const controller = config.controller || {};
  const fleet = config.fleet || {};
  const security = config.security || {};
  const observability = config.observability || {};
  const services = controller.services || {};
  const host = controller.host || "192.168.10.30";
  const staticUrl = controller.staticUrl || `http://${host}:8000`;
  const apiUrl = controller.apiUrl || `http://${host}:8080`;
  const collectorUrl = controller.collectorUrl || `http://${host}:8801/v1/source-bundles`;
  const prometheusUrl = observability.prometheusUrl || controller.prometheusUrl || `http://${host}:9091`;
  const grafanaUrl = observability.grafanaUrl || controller.grafanaUrl || `http://${host}:3001`;
  const grafanaPublicUrl = observability.grafanaPublicUrl || controller.grafanaPublicUrl || grafanaUrl;
  const tenantId = fleet.tenantId || config.tenantId || "dgx-lab";
  const machines = normalizeMachines(fleet.machines, tenantId);

  return {
    configPath,
    schemaVersion: config.schemaVersion || PRODUCT_CONFIG_VERSION,
    product: {
      name: config.product?.name || "turbalance Analytics",
      version: config.product?.version || process.env.TURBALANCE_PRODUCT_VERSION || "0.1.0",
      environment: config.product?.environment || "pilot"
    },
    controller: {
      host,
      publicBaseUrl: controller.publicBaseUrl || staticUrl,
      staticUrl,
      apiUrl,
      collectorUrl,
      prometheusUrl,
      grafanaUrl,
      grafanaPublicUrl,
      remoteRoot: controller.remoteRoot || "/home/user/turbalance-analytics",
      lakeRoot: controller.lakeRoot || "build/lakehouse",
      liveBundlePath: controller.liveBundlePath || "build/demo/live-machine-bundle.json",
      loopMs: numberOr(controller.loopMs, 1000),
      transformIntervalMs: numberOr(controller.transformIntervalMs, 10000),
      dataRetentionDays: numberOr(controller.dataRetentionDays, 30),
      services: {
        staticDashboard: serviceConfig(services.staticDashboard, "turbalance-dashboard", 8000),
        api: serviceConfig(services.api, "turbalance-api", 8080),
        collector: serviceConfig(services.collector, "turbalance-collector", 8801),
        grafana: serviceConfig(services.grafana, "turbalance-grafana-runtime", 3001),
        prometheus: serviceConfig(services.prometheus, "turbalance-prometheus-runtime", 9091)
      }
    },
    fleet: {
      tenantId,
      defaultRemoteRoot: fleet.defaultRemoteRoot || "/opt/turbalance/Analytics",
      agentLoopMs: numberOr(fleet.agentLoopMs, 5000),
      postTimeoutMs: numberOr(fleet.postTimeoutMs, 10000),
      includePiFleet: Boolean(fleet.includePiFleet),
      machines
    },
    security: {
      requireApiAuth: Boolean(security.requireApiAuth),
      apiTokensFile: security.apiTokensFile || "",
      collectorToken: security.collectorToken || "",
      collectorTokenFile: security.collectorTokenFile || "",
      collectorHmacSecret: security.collectorHmacSecret || "",
      collectorHmacSecretFile: security.collectorHmacSecretFile || "",
      tlsMode: security.tlsMode || "lab-http",
      edgeHttpsPort: numberOr(security.edgeHttpsPort, 8443),
      collectorMtlsPort: numberOr(security.collectorMtlsPort, 9443),
      tlsCaFile: security.tlsCaFile || "build/product-tls/ca.crt",
      collectorClientCertFile: security.collectorClientCertFile || "build/product-tls/agent-client.crt",
      collectorClientKeyFile: security.collectorClientKeyFile || "build/product-tls/agent-client.key",
      allowedCorsOrigins: arrayValue(security.allowedCorsOrigins || ["*"])
    },
    observability: {
      prometheusUrl,
      grafanaUrl,
      grafanaPublicUrl,
      grafanaDashboardUrl: observability.grafanaDashboardUrl || `${grafanaPublicUrl.replace(/\/+$/, "")}/d/turbalance-fleet-runtime/turbalance-fleet-runtime?orgId=1&from=now-1h&to=now&refresh=5s`,
      prometheusApiTokenFile: observability.prometheusApiTokenFile || "build/product-secrets/api-viewer-token",
      otelEndpoint: observability.otelEndpoint || "",
      supportBundleRetentionDays: numberOr(observability.supportBundleRetentionDays, 14)
    }
  };
}

function normalizeMachines(machines, tenantId) {
  const configured = Array.isArray(machines) && machines.length
    ? machines
    : [
      { id: "SPARK1", remote: DEFAULT_SPARK_REMOTES[0], role: "spark", benchmarks: true },
      { id: "SPARK2", remote: DEFAULT_SPARK_REMOTES[1], role: "spark", benchmarks: true },
      ...DEFAULT_PI_REMOTES.map((remote, index) => ({ id: `pi${index + 1}`, remote, role: "pi", benchmarks: true }))
    ];

  return configured.map((machine) => {
    const id = machine.id || machine.hostId || hostFromRemote(machine.remote) || "machine";
    const role = machine.role || inferRole(machine.remote || id);
    return {
      id,
      hostId: machine.hostId || id,
      tenantId: machine.tenantId || tenantId,
      remote: machine.remote || "",
      role,
      enabled: machine.enabled !== false,
      remoteRoot: machine.remoteRoot || "",
      labels: machine.labels || {},
      benchmarks: machine.benchmarks !== undefined ? Boolean(machine.benchmarks) : role === "pi",
      gpuBackend: machine.gpuBackend || "auto",
      gpustatBin: machine.gpustatBin || "",
      networkInterface: machine.networkInterface || "",
      dgxInterconnectInterface: machine.dgxInterconnectInterface || (role === "spark" ? "enp1s0f1np1" : ""),
      dgxInterconnectSubnetPrefix: machine.dgxInterconnectSubnetPrefix || (role === "spark" ? "192.168.100." : "")
    };
  });
}

function serviceConfig(value, name, port) {
  const service = value || {};
  return {
    name: service.name || name,
    port: numberOr(service.port, port),
    url: service.url || "",
    systemd: service.systemd || "",
    container: service.container || ""
  };
}

function inferRole(value) {
  const text = String(value || "");
  if (/pi(?:[1-9]|1[0-2])$/i.test(text)) return "pi";
  if (/spark|192\.168\.10\.(20|21)/i.test(text)) return "spark";
  return "nuc";
}

function hostFromRemote(remote) {
  return String(remote || "").split("@").pop();
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function arrayValue(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => String(item || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean));
}

function redactConfig(value) {
  return redactValue(value, "");
}

function redactValue(value, key) {
  if (Array.isArray(value)) return value.map((item) => redactValue(item, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      redactValue(childValue, childKey)
    ]));
  }
  if (SECRET_KEY_PATTERN.test(key) && value) return "[REDACTED]";
  return value;
}

function renderEnv(env) {
  return Object.entries(env)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${shellEnvValue(value)}`)
    .join("\n") + "\n";
}

function shellEnvValue(value) {
  const text = String(value || "");
  if (!text) return "";
  if (/^[A-Za-z0-9_./:@,%+=-]+$/.test(text)) return text;
  return `"${text.replace(/["\\$`]/g, "\\$&")}"`;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else if (parsed[key] === undefined) {
      parsed[key] = next;
      index += 1;
    } else if (Array.isArray(parsed[key])) {
      parsed[key].push(next);
      index += 1;
    } else {
      parsed[key] = [parsed[key], next];
      index += 1;
    }
  }
  return parsed;
}

module.exports = {
  PRODUCT_CONFIG_VERSION,
  readProductConfig,
  normalizeProductConfig,
  redactConfig,
  renderEnv,
  parseArgs,
  arrayValue
};
