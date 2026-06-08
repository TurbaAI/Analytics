#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_SPARK_REMOTES = ["user@192.168.10.20", "user@192.168.10.21"];

const args = parseArgs(process.argv.slice(2));
const outPath = args.out || process.env.TURBALANCE_SPARK_CLOCK_FEED || "build/demo/spark-clock-offset.json";
const loopMs = numberArg(args["loop-ms"], 1000);
const remotes = arrayArg(args.remote || process.env.TURBALANCE_SPARK_CLOCK_REMOTES || DEFAULT_SPARK_REMOTES.join(","));
const ptpContainer = args["ptp-container"] || process.env.TURBALANCE_LINUXPTP_CONTAINER || "turbalance-linuxptp";

if (loopMs > 0) {
  runLoop();
} else {
  runOnce();
}

function runLoop() {
  while (true) {
    const startedAt = Date.now();
    runOnce();
    sleep(Math.max(0, loopMs - (Date.now() - startedAt)));
  }
}

function runOnce() {
  const generatedAt = new Date();
  const samples = remotes.map((remote, index) => collectRemoteClock(remote, index));
  const payload = {
    metadata: {
      generatedAt: generatedAt.toISOString(),
      source: "run-spark-clock-feed.js",
      intervalMs: loopMs,
      remotes
    },
    samples
  };
  writeJsonAtomic(outPath, payload);
  process.stdout.write(`${JSON.stringify({
    generatedAt: payload.metadata.generatedAt,
    outPath,
    samples: samples.map((sample) => ({
      host: sample.hostname || sample.role,
      role: sample.role,
      status: sample.status,
      offsetNs: sample.clockOffsetNs,
      port: sample.clockPtpPortState
    }))
  })}\n`);
}

function collectRemoteClock(remote, index) {
  const role = index === 0 ? "SPARK1" : index === 1 ? "SPARK2" : `SPARK${index + 1}`;
  const collectedAt = new Date();
  const result = spawnSync("ssh", [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=4",
    "-o",
    "StrictHostKeyChecking=accept-new",
    remote,
    remoteClockCommand()
  ], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 7000,
    maxBuffer: 1024 * 1024
  });

  if (result.status !== 0) {
    return {
      role,
      remote,
      hostname: remoteHost(remote),
      status: "unreachable",
      generatedAt: collectedAt.toISOString(),
      error: compactWhitespace(result.stderr || result.stdout || result.error?.message || "ssh clock sample failed")
    };
  }

  return parseClockSample(result.stdout, { role, remote, fallbackHost: remoteHost(remote), collectedAt });
}

function remoteClockCommand() {
  const container = shellQuote(ptpContainer);
  return [
    "set +e;",
    "printf '%s\\n' __TURBA_HOST__;",
    "hostname;",
    "printf '%s\\n' __TURBA_DATE_MS__;",
    "date +%s%3N;",
    "printf '%s\\n' __TURBA_DATE_NS__;",
    "date +%s%N;",
    "printf '%s\\n' __TURBA_TIMEDATE__;",
    "timedatectl show -p NTPSynchronized -p Timezone 2>/dev/null;",
    "printf '%s\\n' __TURBA_PMC_TIME__;",
    `docker exec ${container} pmc -u -b 0 'GET TIME_STATUS_NP' 2>/dev/null;`,
    "printf '%s\\n' __TURBA_PMC_PORT__;",
    `docker exec ${container} pmc -u -b 0 'GET PORT_DATA_SET' 2>/dev/null;`,
    "printf '%s\\n' __TURBA_DONE__;"
  ].join(" ");
}

function parseClockSample(stdout, { role, remote, fallbackHost, collectedAt }) {
  const sections = parseSections(stdout);
  const timedate = parseKeyValueLines(sections.timedate.join("\n"));
  const pmc = sections.pmc_time.join("\n");
  const port = sections.pmc_port.join("\n");
  const dateMs = optionalFinite(sections.date_ms[0]);
  const generatedAt = Number.isFinite(dateMs) ? new Date(dateMs) : collectedAt;
  const offsetNs = optionalFinite((pmc.match(/\bmaster_offset\s+(-?\d+)/i) || [])[1]);
  const grandmaster = (pmc.match(/\bgmIdentity\s+([0-9a-f:.]+)/i) || [])[1] || "";
  const portState = (port.match(/\bportState\s+([A-Z_]+)/i) || [])[1] || "";
  const ptpActive = Boolean(pmc.trim() || portState);

  return {
    role,
    remote,
    hostname: sections.host[0] || fallbackHost,
    status: ptpActive ? "ok" : "missing-ptp",
    generatedAt: generatedAt.toISOString(),
    clockTimeUnixMs: generatedAt.getTime(),
    clockTimeUnixNs: sections.date_ns[0] || "",
    clockSource: ptpActive ? "ptp" : timedate.NTPSynchronized === "yes" ? "timedatectl" : "unsynchronized",
    clockSynchronized: ptpActive || timedate.NTPSynchronized === "yes",
    clockTimezone: timedate.Timezone || "",
    clockOffsetNs: Number.isFinite(offsetNs) ? offsetNs : undefined,
    clockPtpInstalled: ptpActive,
    clockPtpActive: ptpActive,
    clockPtpPortState: portState,
    clockPtpGrandmaster: grandmaster,
    clockSyncDetail: ptpActive ? "fast linuxptp clock sample" : "linuxptp container not observed"
  };
}

function parseSections(stdout) {
  const sections = {
    host: [],
    date_ms: [],
    date_ns: [],
    timedate: [],
    pmc_time: [],
    pmc_port: []
  };
  let current = "";
  stdout.split(/\r?\n/).forEach((line) => {
    const marker = line.match(/^__TURBA_([A-Z_]+)__$/);
    if (marker) {
      current = marker[1].toLowerCase();
      return;
    }
    if (current && sections[current]) sections[current].push(line);
  });
  Object.keys(sections).forEach((key) => {
    sections[key] = sections[key].map((line) => line.trim()).filter(Boolean);
  });
  return sections;
}

function parseKeyValueLines(text) {
  return Object.fromEntries(text.split("\n")
    .map((line) => line.match(/^([^=]+)=(.*)$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]));
}

function writeJsonAtomic(filePath, payload) {
  const fullPath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const tempPath = `${fullPath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(tempPath, fullPath);
}

function arrayArg(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => String(item || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean));
}

function remoteHost(remote) {
  return String(remote || "").split("@").pop().split(":")[0] || "unknown";
}

function compactWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function optionalFinite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function numberArg(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
