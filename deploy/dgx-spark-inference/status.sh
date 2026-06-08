#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

printf 'Ray address: %s:%s\n' "${DGX_HEAD_IP}" "${RAY_PORT}"
if [[ -x "$(ray_bin)" ]]; then
  "$(ray_bin)" status --address="${DGX_HEAD_IP}:${RAY_PORT}" || true
else
  printf 'Ray venv is not installed at %s\n' "${VENV_DIR}"
fi

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  printf '\nContainers:\n'
  docker ps --filter "name=dgx-" --filter "name=open-webui" \
    --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
fi

printf '\nEndpoint checks:\n'
curl -fsS "http://${DGX_HEAD_IP}:${RAY_DASHBOARD_PORT}" >/dev/null \
  && printf 'ok Ray dashboard http://%s:%s\n' "${DGX_HEAD_IP}" "${RAY_DASHBOARD_PORT}" \
  || printf 'warn Ray dashboard is not reachable\n'

curl -fsS -H "Authorization: Bearer ${OPENAI_API_KEY}" \
  "${OPENAI_API_BASE_URL}/models" >/dev/null \
  && printf 'ok OpenAI-compatible API %s\n' "${OPENAI_API_BASE_URL}" \
  || printf 'warn OpenAI-compatible API is not reachable yet\n'

curl -fsS "${OLLAMA_BASE_URL}/api/tags" >/dev/null \
  && printf 'ok Ollama-compatible API %s\n' "${OLLAMA_BASE_URL}" \
  || printf 'warn Ollama-compatible API is not reachable yet\n'

curl -fsS "http://${DGX_HEAD_IP}:${OPEN_WEBUI_PORT}" >/dev/null \
  && printf 'ok Open WebUI http://%s:%s\n' "${DGX_HEAD_IP}" "${OPEN_WEBUI_PORT}" \
  || printf 'warn Open WebUI is not reachable yet\n'
