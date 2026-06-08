#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${DGX_SPARK_ENV_FILE:-"${SCRIPT_DIR}/dgx-spark.env"}"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "${ENV_FILE}"
  set +a
fi

: "${DGX_HEAD_IP:=192.168.10.20}"
: "${DGX_WORKER_IP:=192.168.10.21}"
: "${DGX_PUBLIC_HEAD_IP:=${DGX_HEAD_IP}}"
: "${VLLM_MN_IF_NAME:=enp1s0f1np1}"
: "${VLLM_MN_HEAD_IP:=192.168.100.10}"
: "${VLLM_MN_WORKER_IP:=192.168.100.11}"
: "${RAY_VERSION:=2.55.1}"
: "${RAY_PORT:=6379}"
: "${RAY_DASHBOARD_PORT:=8265}"
: "${RAY_CLIENT_PORT:=10001}"
: "${RAY_NUM_GPUS:=1}"
: "${RAY_TEMP_DIR:=/tmp/ray}"
: "${OPENAI_API_PORT:=8355}"
: "${OPENAI_API_KEY:=local-dev-key}"
: "${OPENAI_API_BASE_URL:=http://${DGX_HEAD_IP}:${OPENAI_API_PORT}/v1}"
: "${OPEN_WEBUI_IMAGE:=ghcr.io/open-webui/open-webui:main}"
: "${OPEN_WEBUI_PORT:=3001}"
: "${OPEN_WEBUI_BIND_ADDR:=0.0.0.0}"
: "${OPEN_WEBUI_VOLUME:=open-webui}"
: "${WEBUI_AUTH:=true}"
: "${ENABLE_OLLAMA_API:=true}"
: "${OLLAMA_BASE_URL:=http://${DGX_HEAD_IP}:${OPENAI_API_PORT}}"
: "${OLLAMA_OPENAI_PROXY_IMAGE:=alpine/socat:latest}"
: "${OLLAMA_OPENAI_PROXY_CONTAINER:=dgx-ollama-openai-proxy}"
: "${OLLAMA_OPENAI_PROXY_PORT:=${OPENAI_API_PORT}}"
: "${OLLAMA_UPSTREAM_HOST:=127.0.0.1}"
: "${OLLAMA_UPSTREAM_PORT:=11434}"
: "${VLLM_IMAGE:=nvcr.io/nvidia/vllm:25.11-py3}"
: "${VLLM_CONTAINER_NAME:=dgx-vllm-openai}"
: "${VLLM_RAY_HEAD_CONTAINER:=dgx-vllm-ray-head}"
: "${VLLM_RAY_WORKER_CONTAINER:=dgx-vllm-ray-worker}"
: "${VLLM_CONTAINER_SHM_SIZE:=32g}"
: "${MODEL_ID:=}"
: "${SERVED_MODEL_NAME:=${MODEL_ID}}"
: "${HF_TOKEN:=}"
: "${HF_HOME:=${SCRIPT_DIR}/hf-cache}"
: "${VLLM_TENSOR_PARALLEL_SIZE:=2}"
: "${VLLM_EXTRA_ARGS:=}"
: "${VLLM_405B_MODEL:=hugging-quants/Meta-Llama-3.1-405B-Instruct-AWQ-INT4}"
: "${VLLM_405B_SERVED_MODEL_NAME:=llama-3.1-405b-awq-int4}"
: "${VLLM_405B_TENSOR_PARALLEL_SIZE:=2}"
: "${VLLM_405B_MAX_MODEL_LEN:=64}"
: "${VLLM_405B_GPU_MEMORY_UTILIZATION:=0.88}"
: "${VLLM_405B_MAX_NUM_SEQS:=1}"
: "${VLLM_405B_MAX_NUM_BATCHED_TOKENS:=64}"
: "${NIM_IMAGE:=}"
: "${NIM_CONTAINER_NAME:=dgx-nim}"
: "${NGC_API_KEY:=}"
: "${NIM_SERVER_PORT:=${OPENAI_API_PORT}}"
: "${NIM_PRIMARY_NODE:=}"
: "${NIM_NODE_MANAGER_PORT:=20000}"
: "${NIM_DOCKER_ARGS:=}"
: "${NIM_EXTRA_ENV:=}"
: "${NIM_EXTRA_ARGS:=}"
: "${VENV_DIR:=${SCRIPT_DIR}/.venv}"

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

require_env() {
  local name="$1"
  local value="${!name:-}"
  [[ -n "${value}" ]] || die "${name} must be set in ${ENV_FILE}"
}

ray_bin() {
  printf '%s/bin/ray' "${VENV_DIR}"
}

python_bin() {
  printf '%s/bin/python' "${VENV_DIR}"
}

require_ray() {
  [[ -x "$(ray_bin)" ]] || die "Ray is not installed. Run ${SCRIPT_DIR}/install-ray.sh first."
}

require_docker() {
  require_command docker
  docker info >/dev/null 2>&1 || die "Docker is not running or this user cannot access it"
}

docker_gpu_args() {
  printf '%s\n' --gpus all
}

docker_infiniband_args() {
  if [[ -d /dev/infiniband ]]; then
    printf '%s\n' --device=/dev/infiniband --ulimit memlock=-1
  fi
}

docker_model_cache_args() {
  mkdir -p "${HF_HOME}"
  printf '%s\n' -v "${HF_HOME}:/data/hf-cache" -e "HF_HOME=/data/hf-cache" -e "HF_TOKEN=${HF_TOKEN}" -e "HUGGING_FACE_HUB_TOKEN=${HF_TOKEN}"
}

docker_multinode_env_args() {
  local host_ip="$1"
  printf '%s\n' \
    -e "VLLM_HOST_IP=${host_ip}" \
    -e "UCX_NET_DEVICES=${VLLM_MN_IF_NAME}" \
    -e "NCCL_SOCKET_IFNAME=${VLLM_MN_IF_NAME}" \
    -e "OMPI_MCA_btl_tcp_if_include=${VLLM_MN_IF_NAME}" \
    -e "GLOO_SOCKET_IFNAME=${VLLM_MN_IF_NAME}" \
    -e "TP_SOCKET_IFNAME=${VLLM_MN_IF_NAME}" \
    -e "RAY_memory_monitor_refresh_ms=0" \
    -e "MASTER_ADDR=${VLLM_MN_HEAD_IP}"
}
