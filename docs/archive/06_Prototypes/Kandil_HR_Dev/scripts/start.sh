#!/usr/bin/env bash
set -euo pipefail
until [ -f /workspace/frappe-bench/.kandil-ready ]; do sleep 3; done
cd /workspace/frappe-bench
exec bench start
