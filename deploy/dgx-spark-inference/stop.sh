#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

if [[ -x "$(ray_bin)" ]]; then
  "$(ray_bin)" stop --force || true
fi

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker rm -f \
    "${VLLM_CONTAINER_NAME}" \
    "${VLLM_RAY_HEAD_CONTAINER}" \
    "${VLLM_RAY_WORKER_CONTAINER}" \
    "${NIM_CONTAINER_NAME}-primary" \
    "${NIM_CONTAINER_NAME}-worker" \
    "${OLLAMA_OPENAI_PROXY_CONTAINER}" \
    open-webui >/dev/null 2>&1 || true
fi
