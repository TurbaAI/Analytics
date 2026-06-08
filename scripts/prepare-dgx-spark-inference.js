#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const deployDir = path.join(root, "deploy", "dgx-spark-inference");
const buildDir = path.join(root, "build");

const defaults = {
  spark1: "user@192.168.10.20",
  spark2: "user@192.168.10.21",
  remoteDir: "/home/user/dgx-spark-inference",
  out: path.join(buildDir, "dgx-spark-inference-prepare.json")
};

function usage() {
  console.log(`Usage: node scripts/prepare-dgx-spark-inference.js [options]

Options:
  --spark1 <ssh-target>       Ray head / primary server host (${defaults.spark1})
  --spark2 <ssh-target>       Ray worker host (${defaults.spark2})
  --remote-dir <path>         Remote deployment directory (${defaults.remoteDir})
  --sync                      Copy deploy/dgx-spark-inference to both hosts
  --install-ray               Run install-ray.sh on both hosts
  --start-ray                 Start Ray head on spark1 and worker on spark2
  --start-ollama-proxy        Start Ollama OpenAI-compatible fallback proxy on spark1
  --start-open-webui          Start Open WebUI on spark1
  --configure-cx7             Configure the dedicated vLLM CX7 IPv4 subnet
  --pull-vllm-image           Pull the configured vLLM image on both hosts
  --start-vllm-ray            Start containerized vLLM Ray head/worker on CX7
  --download-405b             Download the configured 405B model in each vLLM container
  --start-405b                Start the 405B vLLM OpenAI-compatible server on spark1
  --validate-nccl             Validate NCCL-capable vLLM containers, Ray GPU placement, and a short API generation
  --validate                  Run status.sh on spark1
  --all                       sync, install Ray, start Ray, start Open WebUI, validate
  --dry-run                   Print actions without running SSH commands
  --out <path>                JSON report path
  --help                      Show this help
`);
}

function parseArgs(argv) {
  const options = {
    ...defaults,
    sync: false,
    installRay: false,
    startRay: false,
    startOllamaProxy: false,
    startOpenWebui: false,
    configureCx7: false,
    pullVllmImage: false,
    startVllmRay: false,
    download405b: false,
    start405b: false,
    validateNccl: false,
    validate: false,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value`);
      return argv[index];
    };

    if (arg === "--help") {
      options.help = true;
    } else if (arg === "--spark1") {
      options.spark1 = next();
    } else if (arg === "--spark2") {
      options.spark2 = next();
    } else if (arg === "--remote-dir") {
      options.remoteDir = next();
    } else if (arg === "--sync") {
      options.sync = true;
    } else if (arg === "--install-ray") {
      options.installRay = true;
    } else if (arg === "--start-ray") {
      options.startRay = true;
    } else if (arg === "--start-ollama-proxy") {
      options.startOllamaProxy = true;
    } else if (arg === "--start-open-webui") {
      options.startOpenWebui = true;
    } else if (arg === "--configure-cx7") {
      options.configureCx7 = true;
    } else if (arg === "--pull-vllm-image") {
      options.pullVllmImage = true;
    } else if (arg === "--start-vllm-ray") {
      options.startVllmRay = true;
    } else if (arg === "--download-405b") {
      options.download405b = true;
    } else if (arg === "--start-405b") {
      options.start405b = true;
    } else if (arg === "--validate-nccl") {
      options.validateNccl = true;
    } else if (arg === "--validate") {
      options.validate = true;
    } else if (arg === "--all") {
      options.sync = true;
      options.installRay = true;
      options.startRay = true;
      options.startOllamaProxy = true;
      options.startOpenWebui = true;
      options.validate = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--out") {
      options.out = next();
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function run(command, args, options = {}) {
  if (options.dryRun) {
    return { status: 0, stdout: "", stderr: "", dryRun: true };
  }

  const result = spawnSync(command, args, {
    cwd: root,
    encoding: options.encoding || "utf8",
    input: options.input
  });

  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : undefined
  };
}

function record(report, step, host, result) {
  report.steps.push({
    step,
    host,
    status: result.status,
    ok: result.status === 0,
    stdout: String(result.stdout || "").slice(-4000),
    stderr: String(result.stderr || "").slice(-4000),
    dryRun: Boolean(result.dryRun)
  });
}

function ssh(options, host, command) {
  console.log(`${options.dryRun ? "[dry-run] " : ""}${host}: ${command}`);
  return run("ssh", ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", host, command], {
    dryRun: options.dryRun
  });
}

function syncDeploy(options, host) {
  console.log(`${options.dryRun ? "[dry-run] " : ""}${host}: sync ${deployDir} -> ${options.remoteDir}`);
  if (options.dryRun) return { status: 0, stdout: "", stderr: "", dryRun: true };

  const tar = spawnSync("tar", ["-C", deployDir, "-czf", "-", "."], {
    cwd: root,
    encoding: null
  });
  if (tar.status !== 0) {
    return {
      status: tar.status,
      stdout: "",
      stderr: String(tar.stderr || ""),
      error: tar.error ? tar.error.message : undefined
    };
  }

  return run(
    "ssh",
    [
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      host,
      `mkdir -p ${shellQuote(options.remoteDir)} && tar -xzf - -C ${shellQuote(options.remoteDir)} && chmod +x ${shellQuote(options.remoteDir)}/*.sh && test -f ${shellQuote(options.remoteDir)}/dgx-spark.env || cp ${shellQuote(options.remoteDir)}/dgx-spark.env.example ${shellQuote(options.remoteDir)}/dgx-spark.env`
    ],
    { input: tar.stdout, encoding: null }
  );
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function ensureOk(report) {
  const failed = report.steps.filter((step) => !step.ok);
  if (failed.length > 0) {
    const labels = failed.map((step) => `${step.step}:${step.host}`).join(", ");
    throw new Error(`DGX Spark inference preparation failed: ${labels}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    spark1: options.spark1,
    spark2: options.spark2,
    remoteDir: options.remoteDir,
    steps: []
  };

  fs.mkdirSync(path.dirname(options.out), { recursive: true });

  if (options.sync) {
    record(report, "sync", options.spark1, syncDeploy(options, options.spark1));
    record(report, "sync", options.spark2, syncDeploy(options, options.spark2));
  }

  if (options.installRay) {
    record(report, "install-ray", options.spark1, ssh(options, options.spark1, `cd ${shellQuote(options.remoteDir)} && ./install-ray.sh`));
    record(report, "install-ray", options.spark2, ssh(options, options.spark2, `cd ${shellQuote(options.remoteDir)} && ./install-ray.sh`));
  }

  if (options.configureCx7) {
    record(report, "configure-cx7-head", options.spark1, ssh(options, options.spark1, `cd ${shellQuote(options.remoteDir)} && printf '%s\\n' "${process.env.DGX_SPARK_SUDO_PASSWORD || ""}" | sudo -S ./configure-cx7-link.sh head`));
    record(report, "configure-cx7-worker", options.spark2, ssh(options, options.spark2, `cd ${shellQuote(options.remoteDir)} && printf '%s\\n' "${process.env.DGX_SPARK_SUDO_PASSWORD || ""}" | sudo -S ./configure-cx7-link.sh worker`));
  }

  if (options.pullVllmImage) {
    record(report, "pull-vllm-image", options.spark1, ssh(options, options.spark1, `cd ${shellQuote(options.remoteDir)} && . ./common.sh && docker pull "$VLLM_IMAGE"`));
    record(report, "pull-vllm-image", options.spark2, ssh(options, options.spark2, `cd ${shellQuote(options.remoteDir)} && . ./common.sh && docker pull "$VLLM_IMAGE"`));
  }

  if (options.startRay) {
    record(report, "start-ray-head", options.spark1, ssh(options, options.spark1, `cd ${shellQuote(options.remoteDir)} && ./start-ray-head.sh`));
    record(report, "start-ray-worker", options.spark2, ssh(options, options.spark2, `cd ${shellQuote(options.remoteDir)} && ./start-ray-worker.sh`));
  }

  if (options.startOllamaProxy) {
    record(report, "start-ollama-proxy", options.spark1, ssh(options, options.spark1, `cd ${shellQuote(options.remoteDir)} && ./start-ollama-openai-proxy.sh`));
  }

  if (options.startOpenWebui) {
    record(report, "start-open-webui", options.spark1, ssh(options, options.spark1, `cd ${shellQuote(options.remoteDir)} && ./start-open-webui.sh`));
  }

  if (options.startVllmRay) {
    record(report, "start-vllm-ray-head", options.spark1, ssh(options, options.spark1, `cd ${shellQuote(options.remoteDir)} && ./start-vllm-ray-head.sh`));
    record(report, "start-vllm-ray-worker", options.spark2, ssh(options, options.spark2, `cd ${shellQuote(options.remoteDir)} && ./start-vllm-ray-worker.sh`));
  }

  if (options.download405b) {
    record(report, "download-405b", options.spark1, ssh(options, options.spark1, `cd ${shellQuote(options.remoteDir)} && ./download-vllm-405b-model.sh`));
    record(report, "download-405b", options.spark2, ssh(options, options.spark2, `cd ${shellQuote(options.remoteDir)} && ./download-vllm-405b-model.sh`));
  }

  if (options.start405b) {
    record(report, "start-405b", options.spark1, ssh(options, options.spark1, `cd ${shellQuote(options.remoteDir)} && ./start-vllm-405b-openai.sh`));
    record(report, "status-405b", options.spark1, ssh(options, options.spark1, `cd ${shellQuote(options.remoteDir)} && ./status-vllm-405b.sh`));
  }

  if (options.validateNccl) {
    record(report, "validate-nccl", options.spark1, ssh(options, options.spark1, `cd ${shellQuote(options.remoteDir)} && ./validate-vllm-nccl.sh`));
  }

  if (options.validate) {
    record(report, "validate", options.spark1, ssh(options, options.spark1, `cd ${shellQuote(options.remoteDir)} && ./status.sh`));
  }

  fs.writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`);
  ensureOk(report);
  console.log(`Wrote ${options.out}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
