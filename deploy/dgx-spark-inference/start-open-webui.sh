#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_docker

docker rm -f open-webui >/dev/null 2>&1 || true

docker run -d \
  --name open-webui \
  --restart unless-stopped \
  -p "${OPEN_WEBUI_BIND_ADDR}:${OPEN_WEBUI_PORT}:8080" \
  --add-host=host.docker.internal:host-gateway \
  -e "ENABLE_OPENAI_API=true" \
  -e "OPENAI_API_BASE_URL=${OPENAI_API_BASE_URL}" \
  -e "OPENAI_API_BASE_URLS=${OPENAI_API_BASE_URL}" \
  -e "OPENAI_API_KEY=${OPENAI_API_KEY}" \
  -e "ENABLE_OLLAMA_API=${ENABLE_OLLAMA_API}" \
  -e "OLLAMA_BASE_URL=${OLLAMA_BASE_URL}" \
  -e "WEBUI_AUTH=${WEBUI_AUTH}" \
  -v "${OPEN_WEBUI_VOLUME}:/app/backend/data" \
  "${OPEN_WEBUI_IMAGE}"

docker ps --filter name=open-webui
