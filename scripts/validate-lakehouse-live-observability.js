#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

const apiRoutes = [
  { name: "api_health", path: "/health" },
  { name: "api_metrics", path: "/metrics", text: true },
  { name: "covariance_virtual_sensor", path: "/v1/virtual-sensors/covariance" },
  { name: "principal_mode_virtual_sensor", path: "/v1/virtual-sensors/principal-resource-mode" },
  { name: "alerts", path: "/v1/alerts" }
];

function parseArgs(argv) {
  const args = {
    envFile: process.env.TURBALANCE_LAKEHOUSE_ENV_FILE || "ops/lakehouse-production.env.example",
    apiUrl: process.env.TURBALANCE_API_URL || "",
    apiToken: process.env.TURBALANCE_API_TOKEN || "",
    grafanaUrl: process.env.TURBALANCE_GRAFANA_URL || "",
    grafanaToken: process.env.TURBALANCE_GRAFANA_TOKEN || "",
    otelUrl: process.env.TURBALANCE_OTEL_COLLECTOR_METRICS_URL || "",
    prometheusUrl: process.env.TURBALANCE_PROMETHEUS_URL || "",
    out: "",
    dryRun: false,
    timeoutMs: 5000
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (!(key in args)) throw new Error(`Unknown argument ${arg}`);
      args[key] = need(arg, next);
      index += 1;
    } else {
      throw new Error(`Unexpected argument ${arg}`);
    }
  }
  args.timeoutMs = Number(args.timeoutMs);
  return args;
}

function need(flag, value) {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: scripts/validate-lakehouse-live-observability.js [--env-file <file>] [--api-url <url>] [--dry-run]

Validates live product API virtual-sensor endpoints and optional Grafana, OpenTelemetry collector metrics, and Prometheus endpoints.`);
}

function parseEnvFile(file) {
  if (!file) return {};
  const fullPath = path.resolve(root, file);
  const values = {};
  for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = unquote(match[2].trim());
  }
  return values;
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

function joinUrl(base, route) {
  return `${String(base).replace(/\/$/, "")}${route}`;
}

function plan(args) {
  const checks = [];
  if (args.apiUrl) {
    for (const route of apiRoutes) checks.push({ name: route.name, url: joinUrl(args.apiUrl, route.path), required: true });
  } else {
    checks.push({ name: "api_url_configured", required: true, missing: "TURBALANCE_API_URL or --api-url" });
  }
  if (args.grafanaUrl) checks.push({ name: "grafana_health", url: joinUrl(args.grafanaUrl, "/api/health"), required: false });
  if (args.otelUrl) checks.push({ name: "otel_collector_metrics", url: args.otelUrl, required: false });
  if (args.prometheusUrl) checks.push({ name: "prometheus_ready", url: joinUrl(args.prometheusUrl, "/-/ready"), required: false });
  return checks;
}

async function get(url, headers, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      url,
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      bodyPreview: json ? jsonPreview(json) : text.slice(0, 500)
    };
  } catch (error) {
    return { url, ok: false, status: 0, error: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

function jsonPreview(value) {
  if (Array.isArray(value)) return { type: "array", length: value.length };
  if (value && typeof value === "object") return { type: "object", keys: Object.keys(value).slice(0, 20) };
  return value;
}

function headersFor(check, args) {
  if (check.name.startsWith("api_") || check.name.includes("virtual_sensor") || check.name === "alerts") {
    return args.apiToken ? { Authorization: `Bearer ${args.apiToken}` } : {};
  }
  if (check.name === "grafana_health") {
    return args.grafanaToken ? { Authorization: `Bearer ${args.grafanaToken}` } : {};
  }
  return {};
}

function write(out, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(root, out)), { recursive: true });
    fs.writeFileSync(path.resolve(root, out), body);
  }
  process.stdout.write(body);
}

async function main() {
  const parsed = parseArgs(process.argv);
  const config = { ...process.env, ...parseEnvFile(parsed.envFile) };
  const args = {
    ...parsed,
    apiUrl: parsed.apiUrl || config.TURBALANCE_API_URL || "",
    apiToken: parsed.apiToken || config.TURBALANCE_API_TOKEN || "",
    grafanaUrl: parsed.grafanaUrl || config.TURBALANCE_GRAFANA_URL || "",
    grafanaToken: parsed.grafanaToken || config.TURBALANCE_GRAFANA_TOKEN || "",
    otelUrl: parsed.otelUrl || config.TURBALANCE_OTEL_COLLECTOR_METRICS_URL || "",
    prometheusUrl: parsed.prometheusUrl || config.TURBALANCE_PROMETHEUS_URL || ""
  };
  const checks = plan(args);
  if (args.dryRun) {
    write(args.out, {
      status: "dry-run",
      envFile: args.envFile,
      checks,
      auth: {
        apiTokenConfigured: Boolean(args.apiToken),
        grafanaTokenConfigured: Boolean(args.grafanaToken)
      }
    });
    return;
  }
  if (typeof fetch !== "function") throw new Error("This script requires Node.js fetch support");
  const missingRequired = checks.filter((check) => check.required && check.missing);
  const results = [];
  for (const check of checks.filter((item) => item.url)) {
    results.push({ name: check.name, required: check.required, ...(await get(check.url, headersFor(check, args), args.timeoutMs)) });
  }
  const failed = [
    ...missingRequired.map((check) => ({ name: check.name, error: check.missing })),
    ...results.filter((item) => item.required && !item.ok)
  ];
  write(args.out, {
    status: failed.length ? "failed" : "ok",
    envFile: args.envFile,
    checks,
    results,
    failures: failed
  });
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
