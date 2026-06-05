#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function check(name, passed, detail) {
  return { name, passed: Boolean(passed), detail };
}

function main() {
  const dashboard = JSON.parse(read("grafana/turbalance-lakehouse-virtual-sensors.json"));
  const rules = read("ops/kubernetes/lakehouse-prometheus-rules.yaml");
  const api = read("services/api-server/api_server/app.py");
  const router = read("services/alert-engine/alert_engine/router.py");
  const frontend = read("frontend/react/src/App.tsx");
  const panelTitles = new Set((dashboard.panels || []).map((panel) => panel.title));
  const checks = [
    check("grafana_covariance_panel", panelTitles.has("Covariance Matrix Trend"), "Grafana includes covariance matrix panel"),
    check("grafana_eigen_panel", panelTitles.has("Eigenvalue Rolling Trend"), "Grafana includes eigenvalue trend panel"),
    check("grafana_alert_panel", panelTitles.has("Alert API Contract"), "Grafana includes alert panel"),
    check("api_covariance_endpoint", api.includes('/v1/virtual-sensors/covariance'), "API exposes covariance virtual sensor endpoint"),
    check("api_principal_mode_endpoint", api.includes('/v1/virtual-sensors/principal-resource-mode'), "API exposes principal resource mode endpoint"),
    check("api_alert_delivery_results", api.includes('"deliveries"') || api.includes("'deliveries'"), "Alert endpoint returns delivery results"),
    check("router_slack_supported", router.includes("slack_webhook_url"), "Alert router supports Slack webhook delivery"),
    check("router_pagerduty_supported", router.includes("pagerduty_routing_key"), "Alert router supports PagerDuty delivery"),
    check("frontend_covariance_sparkline", frontend.includes("function Sparkline") && frontend.includes("cell.covariance"), "React covariance cells show rolling sparklines"),
    check("frontend_eigen_sparkline", frontend.includes("point.eigenvalues[index]"), "React eigenvalues show rolling sparklines"),
    check("prometheus_backpressure_alert", rules.includes("TurbalanceCollectorBackpressure"), "Prometheus rules include collector backpressure alert"),
    check("prometheus_api_auth_alert", rules.includes("TurbalanceApiAuthFailures"), "Prometheus rules include API auth failure alert"),
    check("prometheus_virtual_sensor_freshness_alert", rules.includes("TurbalanceVirtualSensorFreshness"), "Prometheus rules include virtual sensor freshness alert"),
    check("prometheus_ebpf_readiness_alert", rules.includes("TurbalanceEbpfReadinessLow"), "Prometheus rules include eBPF readiness alert")
  ];
  const failed = checks.filter((item) => !item.passed);
  console.log(JSON.stringify({ status: failed.length ? "failed" : "ok", checks }, null, 2));
  if (failed.length) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
