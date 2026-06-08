const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

[
  "deploy/dgx-spark-inference/dgx-spark.env.example",
  "deploy/dgx-spark-inference/common.sh",
  "deploy/dgx-spark-inference/install-ray.sh",
  "deploy/dgx-spark-inference/start-ray-head.sh",
  "deploy/dgx-spark-inference/start-ray-worker.sh",
  "deploy/dgx-spark-inference/start-ollama-openai-proxy.sh",
  "deploy/dgx-spark-inference/configure-cx7-link.sh",
  "deploy/dgx-spark-inference/download-vllm-405b-model.sh",
  "deploy/dgx-spark-inference/start-vllm-405b-openai.sh",
  "deploy/dgx-spark-inference/start-vllm-ray-head.sh",
  "deploy/dgx-spark-inference/start-vllm-ray-worker.sh",
  "deploy/dgx-spark-inference/start-vllm-openai.sh",
  "deploy/dgx-spark-inference/validate-vllm-nccl.sh",
  "deploy/dgx-spark-inference/start-nim-primary.sh",
  "deploy/dgx-spark-inference/start-nim-worker.sh",
  "deploy/dgx-spark-inference/start-open-webui.sh",
  "deploy/dgx-spark-inference/status.sh",
  "deploy/dgx-spark-inference/stop.sh",
  "deploy/dgx-spark-inference/README.md",
  "scripts/prepare-dgx-spark-inference.js"
].forEach((relativePath) => {
  assert.ok(fs.existsSync(path.join(root, relativePath)), `${relativePath} should exist`);
});

const env = read("deploy/dgx-spark-inference/dgx-spark.env.example");
assert.ok(env.includes("DGX_HEAD_IP=192.168.10.20"));
assert.ok(env.includes("DGX_WORKER_IP=192.168.10.21"));
assert.ok(env.includes("OPENAI_API_PORT=8355"));
assert.ok(env.includes("OPEN_WEBUI_PORT=3001"));
assert.ok(env.includes("OLLAMA_OPENAI_PROXY_IMAGE=alpine/socat:latest"));
assert.ok(env.includes("VLLM_IMAGE=nvcr.io/nvidia/vllm:25.11-py3"));
assert.ok(env.includes("VLLM_MN_HEAD_IP=192.168.100.10"));
assert.ok(env.includes("VLLM_405B_MODEL=hugging-quants/Meta-Llama-3.1-405B-Instruct-AWQ-INT4"));
assert.ok(env.includes("VLLM_RAY_HEAD_CONTAINER=dgx-vllm-ray-head"));
assert.ok(!env.includes("siemens"));

const head = read("deploy/dgx-spark-inference/start-ray-head.sh");
assert.ok(head.includes("--head"));
assert.ok(head.includes("--dashboard-host=0.0.0.0"));
assert.ok(head.includes("--ray-client-server-port"));

const worker = read("deploy/dgx-spark-inference/start-ray-worker.sh");
assert.ok(worker.includes('--address="${DGX_HEAD_IP}:${RAY_PORT}"'));
assert.ok(worker.includes('--node-ip-address="${DGX_WORKER_IP}"'));

const nimPrimary = read("deploy/dgx-spark-inference/start-nim-primary.sh");
assert.ok(nimPrimary.includes("--network host"));
assert.ok(nimPrimary.includes("docker_infiniband_args"));
assert.ok(nimPrimary.includes("NGC_API_KEY"));

const nimWorker = read("deploy/dgx-spark-inference/start-nim-worker.sh");
assert.ok(nimWorker.includes("NIM_PRIMARY_NODE"));
assert.ok(nimWorker.includes("NIM_NODE_MANAGER_PORT"));

const vllm = read("deploy/dgx-spark-inference/start-vllm-openai.sh");
assert.ok(vllm.includes("--distributed-executor-backend ray"));
assert.ok(vllm.includes("--tensor-parallel-size"));
assert.ok(vllm.includes("OPENAI_API_KEY"));
assert.ok(vllm.includes("VLLM_RAY_HEAD_CONTAINER"));

const vllmHead = read("deploy/dgx-spark-inference/start-vllm-ray-head.sh");
assert.ok(vllmHead.includes("ray start --head"));
assert.ok(vllmHead.includes("docker_multinode_env_args"));
assert.ok(vllmHead.includes("VLLM_MN_HEAD_IP"));

const vllmWorker = read("deploy/dgx-spark-inference/start-vllm-ray-worker.sh");
assert.ok(vllmWorker.includes("ray start --address=${VLLM_MN_HEAD_IP}:${RAY_PORT}"));
assert.ok(vllmWorker.includes("VLLM_MN_WORKER_IP"));

const model405b = read("deploy/dgx-spark-inference/start-vllm-405b-openai.sh");
assert.ok(model405b.includes("VLLM_405B_MODEL"));
assert.ok(model405b.includes("--distributed-executor-backend ray"));
assert.ok(model405b.includes("--max-model-len"));
assert.ok(model405b.includes("--max-num-seqs"));

const validateNccl = read("deploy/dgx-spark-inference/validate-vllm-nccl.sh");
assert.ok(validateNccl.includes("dist.is_nccl_available()"));
assert.ok(validateNccl.includes("NCCL_SOCKET_IFNAME"));
assert.ok(validateNccl.includes("ray.cluster_resources()"));
assert.ok(validateNccl.includes("/v1/chat/completions"));
assert.ok(validateNccl.includes("VLLM_405B_SERVED_MODEL_NAME"));

const openWebui = read("deploy/dgx-spark-inference/start-open-webui.sh");
assert.ok(openWebui.includes("OPENAI_API_BASE_URL"));
assert.ok(openWebui.includes("OPENAI_API_BASE_URLS"));
assert.ok(openWebui.includes("OLLAMA_BASE_URL"));
assert.ok(openWebui.includes("OPEN_WEBUI_IMAGE"));
assert.ok(env.includes("OPEN_WEBUI_IMAGE=ghcr.io/open-webui/open-webui:main"));

const ollamaProxy = read("deploy/dgx-spark-inference/start-ollama-openai-proxy.sh");
assert.ok(ollamaProxy.includes("TCP-LISTEN:${OLLAMA_OPENAI_PROXY_PORT}"));
assert.ok(ollamaProxy.includes("/v1/models"));

const help = spawnSync(process.execPath, ["scripts/prepare-dgx-spark-inference.js", "--help"], {
  cwd: root,
  encoding: "utf8"
});
assert.equal(help.status, 0);
assert.ok(help.stdout.includes("user@192.168.10.20"));
assert.ok(help.stdout.includes("--start-ollama-proxy"));
assert.ok(help.stdout.includes("--start-open-webui"));
assert.ok(help.stdout.includes("--start-405b"));
assert.ok(help.stdout.includes("--validate-nccl"));
