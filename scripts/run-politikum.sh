#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/clop/citadel/politikum/app"
ENGINE_DIR="/home/clop/citadel/citadel-engine"

SERVER_PORT=8001
VITE_PORT=5177
HOST="0.0.0.0"

PID_DIR="/tmp"
SERVER_PID="$PID_DIR/politikum-server.pid"
VITE_PID="$PID_DIR/politikum-vite.pid"
SERVER_LOG="$PID_DIR/politikum-server.log"
VITE_LOG="$PID_DIR/politikum-vite.log"

say() { echo "[politikum] $*"; }

kill_pidfile() {
  local pidfile="$1"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid="$(cat "$pidfile" 2>/dev/null || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      say "killing pid $pid ($pidfile)"
      kill "$pid" 2>/dev/null || true
      sleep 0.3
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile"
  fi
}

kill_listeners_on_port() {
  local port="$1"
  # Extract pids from ss output like: users:(("node",pid=1234,fd=21))
  local pids
  pids=$(ss -lntp 2>/dev/null | awk -v p=":${port}" '$4 ~ p {print $NF}' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | sort -u)
  if [[ -n "${pids:-}" ]]; then
    say "killing listeners on port $port: $pids"
    for pid in $pids; do
      kill "$pid" 2>/dev/null || true
    done
    sleep 0.3
    for pid in $pids; do
      kill -9 "$pid" 2>/dev/null || true
    done
  fi
}

start_server() {
  cd "$APP_DIR"
  say "starting server on :$SERVER_PORT"
  nohup node src/multiplayer/Server.js >"$SERVER_LOG" 2>&1 &
  echo $! >"$SERVER_PID"
}

start_vite() {
  cd "$APP_DIR"
  say "starting vite on :$VITE_PORT"
  nohup npm run dev -- --host "$HOST" --port "$VITE_PORT" >"$VITE_LOG" 2>&1 &
  echo $! >"$VITE_PID"
}

wait_listen() {
  local port="$1"
  local tries=25
  for _ in $(seq 1 "$tries"); do
    if ss -lnt 2>/dev/null | grep -qE ":${port}\\b"; then
      return 0
    fi
    sleep 0.2
  done
  return 1
}

cmd="${1:-start}"
case "$cmd" in
  start)
    # optional: rebuild engine first (ensures dist exists)
    say "building engine"
    (cd "$ENGINE_DIR" && npm run build)

    kill_pidfile "$SERVER_PID"
    kill_pidfile "$VITE_PID"
    kill_listeners_on_port "$SERVER_PORT"
    kill_listeners_on_port "$VITE_PORT"

    start_server
    start_vite

    if wait_listen "$SERVER_PORT"; then
      say "server listening on :$SERVER_PORT"
    else
      say "WARNING: server not listening yet (check $SERVER_LOG)"
    fi

    if wait_listen "$VITE_PORT"; then
      say "vite listening on :$VITE_PORT"
    else
      say "WARNING: vite not listening yet (check $VITE_LOG)"
    fi

    say "UI:   http://192.168.8.14:$VITE_PORT/"
    say "API:  http://192.168.8.14:$SERVER_PORT/games/politikum"
    ;;

  stop)
    kill_pidfile "$SERVER_PID"
    kill_pidfile "$VITE_PID"
    kill_listeners_on_port "$SERVER_PORT"
    kill_listeners_on_port "$VITE_PORT"
    ;;

  status)
    say "vite pid:   $(cat "$VITE_PID" 2>/dev/null || echo '-')"
    say "server pid: $(cat "$SERVER_PID" 2>/dev/null || echo '-')"
    ss -lntp 2>/dev/null | grep -E ":(${SERVER_PORT}|${VITE_PORT})\\b" || true
    ;;

  logs)
    say "--- server log ($SERVER_LOG) ---"
    tail -n 80 "$SERVER_LOG" 2>/dev/null || true
    say "--- vite log ($VITE_LOG) ---"
    tail -n 80 "$VITE_LOG" 2>/dev/null || true
    ;;

  *)
    echo "Usage: $0 {start|stop|status|logs}"
    exit 2
    ;;
esac
