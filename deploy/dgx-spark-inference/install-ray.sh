#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_command python3

python3 -m venv "${VENV_DIR}"
"$(python_bin)" -m pip install --upgrade pip setuptools wheel
"$(python_bin)" -m pip install "ray[default]==${RAY_VERSION}"
"$(ray_bin)" --version
