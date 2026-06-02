const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { validateSourceBundle } = require("../lib/source-bundle-validator.js");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-spark1-k8s-"));
const runId = "spark1-k8s-demo-test";
const namespace = "turbalance-demo";
const selector = `turba.ai/run-id=${runId}`;

const podsPath = writeJson("pods.json", {
  items: [{
    metadata: {
      name: "spark1-gpu-vectoradd-abcd",
      namespace,
      creationTimestamp: "2026-06-01T18:00:00Z",
      labels: {
        "app.kubernetes.io/name": "spark1-gpu-vectoradd",
        "turba.ai/run-id": runId
      },
      ownerReferences: [{ kind: "Job", name: "spark1-gpu-vectoradd" }]
    },
    spec: {
      nodeName: "spark1",
      containers: [{
        name: "vectoradd",
        resources: {
          limits: {
            "nvidia.com/gpu": "1"
          }
        }
      }]
    },
    status: {
      phase: "Running",
      startTime: "2026-06-01T18:01:30Z",
      conditions: [{
        type: "PodScheduled",
        status: "True",
        lastTransitionTime: "2026-06-01T18:01:00Z"
      }]
    }
  }]
});
const jobsPath = writeJson("jobs.json", {
  items: [{
    metadata: {
      name: "spark1-gpu-vectoradd",
      namespace,
      creationTimestamp: "2026-06-01T18:00:00Z",
      labels: {
        "turba.ai/run-id": runId
      }
    },
    status: {
      active: 1
    }
  }]
});
const eventsPath = writeJson("events.json", {
  items: [{
    type: "Normal",
    reason: "Scheduled",
    message: "Successfully assigned turbalance-demo/spark1-gpu-vectoradd-abcd to spark1",
    count: 1,
    firstTimestamp: "2026-06-01T18:01:00Z",
    lastTimestamp: "2026-06-01T18:01:00Z",
    involvedObject: {
      kind: "Pod",
      name: "spark1-gpu-vectoradd-abcd"
    }
  }]
});
const nodesPath = writeJson("nodes.json", {
  items: [{
    metadata: {
      name: "spark1",
      labels: {
        "nvidia.com/gpu.product": "NVIDIA-RTX-4090"
      }
    },
    status: {
      allocatable: {
        "nvidia.com/gpu": "1"
      }
    }
  }]
});

(async () => {
  const seenQueries = [];
  const server = http.createServer((req, res) => {
    const query = new URL(req.url, "http://127.0.0.1").searchParams.get("query") || "";
    seenQueries.push(query);
    const value = valueForQuery(query);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      status: "success",
      data: {
        resultType: "vector",
        result: value === undefined ? [] : [{ metric: {}, value: [Date.now() / 1000, String(value)] }]
      }
    }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const outPath = path.join(tempDir, "spark1-k8s-bundle.json");
  const result = await runCollector([
    "scripts/collect-spark1-kubernetes-demo.js",
    "--run-id",
    runId,
    "--namespace",
    namespace,
    "--selector",
    selector,
    "--prometheus-url",
    `http://127.0.0.1:${port}`,
    "--pods-json",
    podsPath,
    "--jobs-json",
    jobsPath,
    "--events-json",
    eventsPath,
    "--nodes-json",
    nodesPath,
    "--out",
    outPath
  ]);
  await new Promise((resolve) => server.close(resolve));

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.sourceCounts.kubernetes, 1);
  assert.equal(report.sourceCounts.scheduler, 1);
  assert.equal(report.sourceCounts.prometheus, 1);
  assert.equal(report.sourceCounts.dcgm, 1);
  assert.ok(seenQueries.some((query) => query.includes("DCGM_FI_DEV_GPU_UTIL")));

  const bundle = JSON.parse(fs.readFileSync(outPath, "utf8"));
  const validation = validateSourceBundle(bundle, { requireSourceExport: true });
  assert.equal(validation.ok, true, validation.errors.join("; "));
  assert.equal(bundle.metadata.source, "collect-spark1-kubernetes-demo.js");
  assert.ok(bundle.metadata.note.includes("Strict SPARK1 Kubernetes observation"));
  assert.equal(bundle.ingestion.runs[0].id, runId);
  assert.equal(bundle.ingestion.runs[0].allocation.gpus, 1);
  assert.equal(bundle.ingestion.runs[0].allocation.gpuModel, "NVIDIA-RTX-4090");
  assert.equal(bundle.ingestion.runs[0].utilization.gpuUtil, 68);
  assert.equal(bundle.ingestion.runs[0].scheduler.queueWaitMinutes, 1);
  assert.equal(bundle.sources.kubernetes[0].podSelector, selector);
  assert.equal(bundle.sources.scheduler[0].schedulerName, "k3s-default-scheduler");
  assert.equal(bundle.sources.prometheus[0].metrics.turba_gpu_utilization_ratio, 0.68);
  assert.equal(bundle.sources.dcgm[0].fields.DCGM_FI_PROF_SM_OCCUPANCY, 62);

  console.log("SPARK1 Kubernetes demo collector tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

function valueForQuery(query) {
  if (query.includes("stddev_over_time")) return 0.93;
  if (query.includes("DCGM_FI_DEV_GPU_UTIL")) return 0.68;
  if (query.includes("DCGM_FI_PROF_PIPE_TENSOR_ACTIVE") && query.includes("/ 100")) return 0.51;
  if (query.includes("DCGM_FI_PROF_PIPE_TENSOR_ACTIVE")) return 51;
  if (query.includes("DCGM_FI_PROF_SM_OCCUPANCY")) return 62;
  if (query.includes("DCGM_FI_DEV_FB_USED")) return 76;
  if (query.includes("DCGM_FI_PROF_DRAM_ACTIVE")) return 57;
  if (query.includes("DCGM_FI_DEV_POWER_USAGE")) return 210;
  if (query.includes("DCGM_FI_DEV_GPU_TEMP")) return 61;
  return undefined;
}

function writeJson(fileName, value) {
  const filePath = path.join(tempDir, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function runCollector(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}
