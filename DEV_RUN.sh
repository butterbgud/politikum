#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

kill_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti tcp:"$port" | xargs -r kill || true
  fi
}

run_loop() {
  local name="$1"; shift
  local port="${1:-}"
  while true; do
    if [[ "$name" == "vite" ]]; then kill_port 5176; fi
    if [[ "$name" == "server" ]]; then kill_port 8000; fi
    echo "[$(date +'%H:%M:%S')] starting $name: $*" >&2
    "$@" || true
    echo "[$(date +'%H:%M:%S')] $name exited; restarting in 1s" >&2
    sleep 1
  done
}

run_loop vite npm run dev -- --host 0.0.0.0 --port 5176 --strictPort &
run_loop server node src/multiplayer/Server.js &

wait
