#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_docker

CONTAINER=""
if docker inspect "${VLLM_RAY_HEAD_CONTAINER}" >/dev/null 2>&1; then
  CONTAINER="${VLLM_RAY_HEAD_CONTAINER}"
elif docker inspect "${VLLM_RAY_WORKER_CONTAINER}" >/dev/null 2>&1; then
  CONTAINER="${VLLM_RAY_WORKER_CONTAINER}"
else
  die "start the vLLM Ray head or worker container before downloading the model"
fi

docker exec \
  -e "HF_TOKEN=${HF_TOKEN}" \
  -e "HUGGING_FACE_HUB_TOKEN=${HF_TOKEN}" \
  -e "HF_HOME=/data/hf-cache" \
  "${CONTAINER}" \
  bash -lc "hf download '${VLLM_405B_MODEL}'"
