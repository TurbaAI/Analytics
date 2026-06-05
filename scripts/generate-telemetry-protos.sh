#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OUT_DIR="${1:-$ROOT_DIR/build/generated/python}"

mkdir -p "$OUT_DIR"

python3 -m grpc_tools.protoc \
  -I "$ROOT_DIR/proto" \
  --python_out="$OUT_DIR" \
  --grpc_python_out="$OUT_DIR" \
  "$ROOT_DIR/proto/telemetry/v1/telemetry_batch.proto"

printf '%s\n' "$OUT_DIR"
