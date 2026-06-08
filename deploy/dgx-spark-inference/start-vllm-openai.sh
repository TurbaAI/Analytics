#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_docker
require_env VLLM_IMAGE
require_env MODEL_ID

mkdir -p "${HF_HOME}"

if docker inspect "${VLLM_RAY_HEAD_CONTAINER}" >/dev/null 2>&1; then
  docker exec -d \
    -e "HF_TOKEN=${HF_TOKEN}" \
    -e "HUGGING_FACE_HUB_TOKEN=${HF_TOKEN}" \
    -e "HF_HOME=/data/hf-cache" \
    -e "RAY_ADDRESS=${DGX_HEAD_IP}:${RAY_PORT}" \
    "${VLLM_RAY_HEAD_CONTAINER}" \
    bash -lc "vllm serve '${MODEL_ID}' --host 0.0.0.0 --port '${OPENAI_API_PORT}' --served-model-name '${SERVED_MODEL_NAME}' --api-key '${OPENAI_API_KEY}' --distributed-executor-backend ray --tensor-parallel-size '${VLLM_TENSOR_PARALLEL_SIZE}' ${VLLM_EXTRA_ARGS}"
  docker logs --tail=80 "${VLLM_RAY_HEAD_CONTAINER}"
  exit 0
fi

docker run -d \
  --name "${VLLM_CONTAINER_NAME}" \
  --restart unless-stopped \
  --network host \
  --ipc host \
  --shm-size="${VLLM_CONTAINER_SHM_SIZE}" \
  $(docker_gpu_args) \
  $(docker_model_cache_args) \
  -e "RAY_ADDRESS=${DGX_HEAD_IP}:${RAY_PORT}" \
  --entrypoint bash \
  "${VLLM_IMAGE}" \
  -lc "vllm serve '${MODEL_ID}' --host 0.0.0.0 --port '${OPENAI_API_PORT}' --served-model-name '${SERVED_MODEL_NAME}' --api-key '${OPENAI_API_KEY}' --distributed-executor-backend ray --tensor-parallel-size '${VLLM_TENSOR_PARALLEL_SIZE}' ${VLLM_EXTRA_ARGS}"

docker logs --tail=60 "${VLLM_CONTAINER_NAME}"
