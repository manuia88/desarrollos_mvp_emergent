#!/usr/bin/env bash
# =====================================================
# DMX · dev-down.sh
# Apaga backend + frontend + (opcional) Mongo
# Uso: ./scripts/dev-down.sh           # apaga procesos · deja Mongo vivo
#      ./scripts/dev-down.sh --all     # apaga TODO incluido Mongo
# =====================================================
set -uo pipefail

GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; NC=$'\033[0m'
log()  { echo "${GREEN}[dev-down]${NC} $*"; }
warn() { echo "${YELLOW}[dev-down]${NC} $*"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Backend
if [ -f "$ROOT/scripts/logs/backend.pid" ]; then
  PID=$(cat "$ROOT/scripts/logs/backend.pid")
  kill "$PID" 2>/dev/null && log "Backend apagado (PID $PID)" || warn "Backend ya no corría"
  rm -f "$ROOT/scripts/logs/backend.pid"
fi
pkill -f "uvicorn server:app" 2>/dev/null && log "Cualquier uvicorn residual matado" || true

# Frontend
if [ -f "$ROOT/scripts/logs/frontend.pid" ]; then
  PID=$(cat "$ROOT/scripts/logs/frontend.pid")
  kill "$PID" 2>/dev/null && log "Frontend apagado (PID $PID)" || warn "Frontend ya no corría"
  rm -f "$ROOT/scripts/logs/frontend.pid"
fi
lsof -ti:3000 | xargs kill -9 2>/dev/null && log "Puerto 3000 liberado" || true

# Mongo (solo si --all)
if [ "${1:-}" = "--all" ]; then
  if docker ps --format '{{.Names}}' | grep -q "^dmx-local-mongo$"; then
    docker stop dmx-local-mongo >/dev/null && log "Mongo Docker detenido"
  fi
else
  log "Mongo sigue corriendo · usa './scripts/dev-down.sh --all' para apagarlo"
fi

log "OK"
