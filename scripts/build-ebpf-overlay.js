#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const inputDir = path.resolve(process.argv[2] || path.join(__dirname, "..", "fixtures", "ebpf-export-inputs"));

function readJsonArray(fileName) {
  const fullPath = path.join(inputDir, fileName);
  if (!fs.existsSync(fullPath)) return [];

  const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`${fileName} must contain a JSON array`);
  }

  return parsed;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => (
      entry !== undefined
      && entry !== null
      && entry !== ""
      && !(typeof entry === "number" && Number.isNaN(entry))
      && !(typeof entry === "object" && !Array.isArray(entry) && Object.keys(entry).length === 0)
    ))
  );
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const hostSamples = readJsonArray("host-samples.json");

const ebpf = hostSamples
  .map((row) => compactObject({
    runId: row.runId,
    ebpfExportId: row.ebpfExportId,
    collector: row.collector,
    kernelRelease: row.kernelRelease,
    host: row.host,
    node: row.node,
    namespace: row.namespace,
    podName: row.podName,
    containerName: row.containerName,
    cgroupPath: row.cgroupPath,
    cpu: compactObject({
      offCpuTimePct: numeric(row.offCpuTimePct),
      cpuThrottlePct: numeric(row.cpuThrottlePct),
      softIrqPct: numeric(row.softIrqPct)
    }),
    scheduler: compactObject({
      runQueueLatencyMsP95: numeric(row.runQueueLatencyMsP95)
    }),
    network: compactObject({
      tcpRetransmitPct: numeric(row.tcpRetransmitPct),
      socketLatencyMsP95: numeric(row.socketLatencyMsP95),
      utilizationPct: numeric(row.networkUtilizationPct)
    }),
    storage: compactObject({
      blockIoLatencyMsP95: numeric(row.blockIoLatencyMsP95),
      filesystemLatencyMsP95: numeric(row.filesystemLatencyMsP95)
    }),
    noise: compactObject({
      noisyNeighborScore: numeric(row.noisyNeighborScore),
      noiseEvents: numeric(row.noiseEvents)
    })
  }))
  .filter((sample) => sample.runId);

process.stdout.write(`${JSON.stringify({ sources: { ebpf } }, null, 2)}\n`);
