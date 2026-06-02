#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const args = parseArgs(process.argv.slice(2));
const root = path.join(__dirname, "..");
const host = args.host || process.env.TURBALANCE_SANDBOX_SOURCE_HOST || "127.0.0.1";
const port = Number(args.port || process.env.TURBALANCE_SANDBOX_SOURCE_PORT || 8891);
const inputDir = path.resolve(args["input-dir"] || process.env.TURBALANCE_EXPORT_INPUT_DIR || path.join(root, "fixtures", "provider-pilot-export-inputs"));
const readyFile = args["ready-file"] || "";

const payloads = {
  "/kubernetes/jobs": readFixture("kubernetes.json"),
  "/scheduler/export": readFixture("scheduler.json"),
  "/grafana/handoffs": readFixture("grafana.json"),
  "/billing-slo/export": {
    billingRecords: readFixture("billing-records.json"),
    supportTickets: readFixture("support-tickets.json")
  },
  "/ebpf/summary": readFixture("ebpf.json"),
  "/nccl/traces": readFixture("nccl-traces.json"),
  "/opportunities/export": readFixture("opportunities.json")
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${host}`);
  res.setHeader("content-type", "application/json; charset=utf-8");

  if (url.pathname === "/health") {
    res.end(JSON.stringify({ ok: true, service: "turbalance-sandbox-source-gateway" }));
    return;
  }

  if (url.pathname === "/api/v1/query") {
    res.end(JSON.stringify({
      status: "success",
      data: {
        resultType: "vector",
        result: [{
          metric: {},
          value: [Math.floor(Date.now() / 1000), "0.73"]
        }]
      }
    }));
    return;
  }

  if (Object.hasOwn(payloads, url.pathname)) {
    res.end(JSON.stringify(payloads[url.pathname]));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found", path: url.pathname }));
});

server.listen(port, host, () => {
  const address = server.address();
  const report = {
    ok: true,
    service: "turbalance-sandbox-source-gateway",
    url: `http://${address.address}:${address.port}`,
    inputDir
  };
  if (readyFile) {
    const fullPath = path.resolve(readyFile);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  process.stderr.write(`${JSON.stringify(report)}\n`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));

function readFixture(fileName) {
  return JSON.parse(fs.readFileSync(path.join(inputDir, fileName), "utf8"));
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    parsed[arg.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : "1";
  }
  return parsed;
}
