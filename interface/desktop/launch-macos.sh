#!/bin/bash
set -u
PORT=4123
STOP=0
NO_WINDOW="${PI_STUDIO_NO_WINDOW:-0}"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --stop) STOP=1 ;;
    --no-window) NO_WINDOW=1 ;;
    --port) shift; [ "$#" -gt 0 ] || { echo "--port requer uma porta" >&2; exit 2; }; PORT="$1" ;;
    *) echo "Uso: $0 [--port PORT] [--stop] [--no-window]" >&2; exit 2 ;;
  esac
  shift
done
case "$PORT" in *[!0-9]*|'') echo "Porta inválida: $PORT" >&2; exit 2 ;; esac

HOME_DIR="${HOME:?HOME não definido}"
LOG_DIR="$HOME_DIR/Library/Logs/PI Studio"
LOG_FILE="$LOG_DIR/server.log"
PID_FILE="$LOG_DIR/server.pid"
STUDIO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
URL="http://127.0.0.1:$PORT"
mkdir -p "$LOG_DIR"

find_command() {
  local name="$1" candidate
  command -v "$name" 2>/dev/null && return 0
  for candidate in "/opt/homebrew/bin/$name" "/usr/local/bin/$name" "$HOME_DIR/.volta/bin/$name"; do
    if [ -x "$candidate" ]; then printf '%s\n' "$candidate"; return 0; fi
  done
  if [ -d "$HOME_DIR/.nvm/versions/node" ]; then
    local best best_version version
    best=''
    best_version='0.0.0'
    for candidate in "$HOME_DIR"/.nvm/versions/node/*/bin/"$name"; do
      [ -x "$candidate" ] || continue
      version="$(basename "$(dirname "$(dirname "$candidate")")")"
      version="${version#v}"
      if [ "$(awk -v a="$version" -v b="$best_version" 'BEGIN { split(a,x,"."); split(b,y,"."); for (i=1;i<=3;i++) { if ((x[i]+0) > (y[i]+0)) { print 1; exit } if ((x[i]+0) < (y[i]+0)) exit } }')" = 1 ]; then
        best="$candidate"
        best_version="$version"
      fi
    done
    [ -n "$best" ] && { printf '%s\n' "$best"; return 0; }
  fi
  return 1
}

healthy() {
  local page token
  page="$(curl -fsS --max-time 2 "$URL/" 2>/dev/null)" || return 1
  token="$(printf '%s' "$page" | sed -n 's/.*name="pi-studio-token" content="\([a-f0-9][a-f0-9]*\)".*/\1/p')"
  [ -n "$token" ] || return 1
  curl -fsS --max-time 2 -H "X-PI-Studio-Token: $token" "$URL/api/health" >/dev/null 2>&1
}
if [ "$STOP" -eq 1 ]; then
  if [ -f "$PID_FILE" ]; then
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ "$pid" =~ ^[0-9]+$ ]] && ps -p "$pid" -o command= 2>/dev/null | grep -F 'server.mjs' >/dev/null; then
      kill "$pid"
    fi
    rm -f "$PID_FILE"
  fi
  exit 0
fi

if ! healthy; then
  NODE_BIN="$(find_command node)" || { echo 'Node.js não encontrado.' >&2; exit 1; }
  PI_BIN="$(find_command pi)" || { echo 'PI não encontrado no PATH.' >&2; exit 1; }
  export PATH="$(dirname "$NODE_BIN"):$(dirname "$PI_BIN"):$PATH"
  export PI_WEB_PORT="$PORT" PI_WEB_HOST=127.0.0.1
  (
    cd "$STUDIO_DIR"
    nohup "$NODE_BIN" server.mjs >>"$LOG_FILE" 2>&1 &
    echo $! >"$PID_FILE"
  )
  deadline=$((SECONDS + 30))
  until healthy; do
    if [ "$SECONDS" -ge "$deadline" ]; then echo "PI Studio não respondeu em até 30 segundos. Consulte $LOG_FILE" >&2; exit 1; fi
    sleep 0.5
  done
fi

if [ "$NO_WINDOW" = 1 ]; then exit 0; fi
if open -na 'Google Chrome' --args "--app=$URL" 2>/dev/null; then exit 0; fi
if open -na 'Microsoft Edge' --args "--app=$URL" 2>/dev/null; then exit 0; fi
if open -na 'Chromium' --args "--app=$URL" 2>/dev/null; then exit 0; fi
if open -na 'Brave Browser' --args "--app=$URL" 2>/dev/null; then exit 0; fi
open "$URL"
