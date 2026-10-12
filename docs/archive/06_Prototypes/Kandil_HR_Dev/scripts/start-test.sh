#!/usr/bin/env bash
set -euo pipefail
node apps/frappe/socketio.js &
socket_pid=$!
node /opt/kandil/test-loopback-proxy.cjs &
proxy_pid=$!
trap 'kill "$socket_pid" "$proxy_pid" 2>/dev/null || true' EXIT
bench --site kandil-test.localhost serve --port 8000 --noreload
