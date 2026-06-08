#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_docker

docker rm -f "${OLLAMA_OPENAI_PROXY_CONTAINER}" >/dev/null 2>&1 || true

docker run -d \
  --name "${OLLAMA_OPENAI_PROXY_CONTAINER}" \
  --restart unless-stopped \
  --network host \
  "${OLLAMA_OPENAI_PROXY_IMAGE}" \
  -d -d "TCP-LISTEN:${OLLAMA_OPENAI_PROXY_PORT},reuseaddr,fork" "TCP:${OLLAMA_UPSTREAM_HOST}:${OLLAMA_UPSTREAM_PORT}"

curl -fsS "http://${DGX_HEAD_IP}:${OLLAMA_OPENAI_PROXY_PORT}/v1/models" >/dev/null
docker ps --filter "name=${OLLAMA_OPENAI_PROXY_CONTAINER}"
