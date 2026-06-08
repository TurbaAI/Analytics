#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_docker

docker rm -f "${OLLAMA_OPENAI_PROXY_CONTAINER}" >/dev/null 2>&1 || true
docker inspect "${VLLM_RAY_HEAD_CONTAINER}" >/dev/null 2>&1 || die "start ${VLLM_RAY_HEAD_CONTAINER} first"

docker exec "${VLLM_RAY_HEAD_CONTAINER}" bash -lc "pkill -f '[v]llm serve' >/dev/null 2>&1 || true"

docker exec -d \
  -e "HF_TOKEN=${HF_TOKEN}" \
  -e "HUGGING_FACE_HUB_TOKEN=${HF_TOKEN}" \
  -e "HF_HOME=/data/hf-cache" \
  -e "RAY_ADDRESS=${VLLM_MN_HEAD_IP}:${RAY_PORT}" \
  "${VLLM_RAY_HEAD_CONTAINER}" \
  bash -lc "mkdir -p /data/logs && \
    exec vllm serve '${VLLM_405B_MODEL}' \
    --host 0.0.0.0 \
    --port '${OPENAI_API_PORT}' \
    --served-model-name '${VLLM_405B_SERVED_MODEL_NAME}' \
    --api-key '${OPENAI_API_KEY}' \
    --distributed-executor-backend ray \
    --tensor-parallel-size '${VLLM_405B_TENSOR_PARALLEL_SIZE}' \
    --max-model-len '${VLLM_405B_MAX_MODEL_LEN}' \
    --gpu-memory-utilization '${VLLM_405B_GPU_MEMORY_UTILIZATION}' \
    --max-num-seqs '${VLLM_405B_MAX_NUM_SEQS}' \
    --max-num-batched-tokens '${VLLM_405B_MAX_NUM_BATCHED_TOKENS}' \
    > /data/logs/vllm-405b-openai.log 2>&1"

echo "Started ${VLLM_405B_SERVED_MODEL_NAME}; tailing /data/logs/vllm-405b-openai.log"
docker exec "${VLLM_RAY_HEAD_CONTAINER}" bash -lc "tail -n 80 /data/logs/vllm-405b-openai.log || true"
