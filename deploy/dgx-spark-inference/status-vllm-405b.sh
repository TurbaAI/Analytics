#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_docker

docker ps --filter "name=${VLLM_RAY_HEAD_CONTAINER}" --filter "name=${VLLM_RAY_WORKER_CONTAINER}" \
  --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'

if docker inspect "${VLLM_RAY_HEAD_CONTAINER}" >/dev/null 2>&1; then
  docker exec "${VLLM_RAY_HEAD_CONTAINER}" ray status --address="${VLLM_MN_HEAD_IP}:${RAY_PORT}" || true
  docker exec "${VLLM_RAY_HEAD_CONTAINER}" bash -lc "pgrep -af 'vllm serve' || true"
  docker exec "${VLLM_RAY_HEAD_CONTAINER}" bash -lc "tail -n 80 /data/logs/vllm-405b-openai.log 2>/dev/null || true"
  curl -fsS -H "Authorization: Bearer ${OPENAI_API_KEY}" \
    "http://${DGX_PUBLIC_HEAD_IP}:${OPENAI_API_PORT}/v1/models" || true
fi
