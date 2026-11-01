#!/usr/bin/env bash
# Kept for existing callers. Build-time devDependencies can ship in the Worker.
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "${script_dir}/audit-dependencies.mjs"
