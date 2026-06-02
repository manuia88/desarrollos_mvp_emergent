#!/usr/bin/env bash
# =====================================================
# DMX · dev-up.sh
# Levanta MongoDB (Docker) + backend FastAPI + frontend React
# Uso: ./scripts/dev-up.sh
# =====================================================
set -euo pipefail

# Colores
RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; NC=$'\033[0m'
log()  { echo "${GREEN}[dev-up]${NC} $*"; }
warn() { echo "${YELLOW}[dev-up]${NC} $*"; }
err()  { echo "${RED}[dev-up ERROR]${NC} $*" >&2; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

mkdir -p scripts/logs scripts/dev-data

# -----------------------------------------------------
# 1) Pre-check
# -----------------------------------------------------
command -v docker  >/dev/null || { err "Docker no instalado"; exit 1; }
command -v node    >/dev/null || { err "Node no instalado"; exit 1; }

if ! docker info >/dev/null 2>&1; then
  err "Motor Docker (OrbStack/Docker Desktop) no está corriendo · ábrelo y reintenta"
  exit 1
fi

# Buscar Python 3.10+ (requirements.txt lo exige · apify_client>=2.0 etc)
PYTHON_BIN=""
for cand in python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$cand" >/dev/null 2>&1; then
    PYVER=$("$cand" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
    PYMAJ=${PYVER%.*}; PYMIN=${PYVER#*.}
    if [ "$PYMAJ" -eq 3 ] && [ "$PYMIN" -ge 10 ]; then
      PYTHON_BIN="$cand"
      log "Python $PYVER OK ($cand)"
      break
    fi
  fi
done

if [ -z "$PYTHON_BIN" ]; then
  err "Necesitas Python 3.10+ y solo tienes $(python3 --version 2>&1)."
  err "Instálalo así (un solo comando):"
  err "   brew install python@3.11"
  err "Luego reintenta: ./scripts/dev-up.sh"
  exit 1
fi

# -----------------------------------------------------
# 2) Mongo (Docker)
# -----------------------------------------------------
MONGO_NAME="dmx-local-mongo"
if docker ps --format '{{.Names}}' | grep -q "^${MONGO_NAME}$"; then
  log "Mongo ya corriendo · contenedor ${MONGO_NAME}"
elif docker ps -a --format '{{.Names}}' | grep -q "^${MONGO_NAME}$"; then
  log "Reiniciando contenedor existente ${MONGO_NAME}"
  docker start "${MONGO_NAME}" >/dev/null
else
  log "Creando contenedor Mongo ${MONGO_NAME} (puerto 27017)"
  docker run -d --name "${MONGO_NAME}" \
    -p 27017:27017 \
    -v "${ROOT}/scripts/dev-data/mongo:/data/db" \
    mongo:7 >/dev/null
fi

# Esperar a que mongo responda (max 20s)
log "Esperando a Mongo..."
for i in {1..20}; do
  if docker exec "${MONGO_NAME}" mongosh --quiet --eval "db.runCommand({ ping: 1 })" >/dev/null 2>&1; then
    log "Mongo OK"
    break
  fi
  sleep 1
  if [ "$i" -eq 20 ]; then err "Mongo no respondió en 20s"; exit 1; fi
done

# -----------------------------------------------------
# 3) Backend (FastAPI · puerto 8000)
# -----------------------------------------------------
cd "$ROOT/backend"

# venv
if [ ! -d "$ROOT/scripts/.venv" ]; then
  log "Creando venv Python en scripts/.venv (con $PYTHON_BIN)"
  "$PYTHON_BIN" -m venv "$ROOT/scripts/.venv"
fi
# shellcheck disable=SC1091
source "$ROOT/scripts/.venv/bin/activate"

log "Instalando dependencias backend (primera vez tarda ~2 min · log → scripts/logs/pip.log)"
pip install --quiet --upgrade pip 2>&1 | tail -3

# Usar requirements.local.txt si existe (excluye paquetes privados emergent.sh)
REQ_FILE="$ROOT/backend/requirements.txt"
if [ -f "$ROOT/scripts/requirements.local.txt" ]; then
  REQ_FILE="$ROOT/scripts/requirements.local.txt"
  log "Usando override scripts/requirements.local.txt"
fi

if ! pip install -r "$REQ_FILE" > "$ROOT/scripts/logs/pip.log" 2>&1; then
  err "pip install FALLÓ · últimas líneas:"
  tail -15 "$ROOT/scripts/logs/pip.log" >&2
  exit 1
fi

# Stub local para emergentintegrations (paquete privado · features LLM degradadas)
if [ -d "$ROOT/scripts/emergent_stub" ]; then
  pip install --quiet "$ROOT/scripts/emergent_stub" >> "$ROOT/scripts/logs/pip.log" 2>&1 || \
    warn "stub emergentintegrations falló · features LLM no funcionarán"
fi

log "Backend deps OK"

# Cargar .env.local explícitamente
if [ ! -f "$ROOT/backend/.env.local" ]; then
  err "Falta backend/.env.local · ¿corriste el setup?"
  exit 1
fi
set -a
# shellcheck disable=SC1091
source "$ROOT/backend/.env.local"
set +a

# Matar instancia previa
pkill -f "uvicorn server:app" 2>/dev/null || true
sleep 1

log "Arrancando backend en http://localhost:8000"
nohup uvicorn server:app --host 0.0.0.0 --port 8000 --reload \
  > "$ROOT/scripts/logs/backend.log" 2>&1 &
echo $! > "$ROOT/scripts/logs/backend.pid"

# Esperar backend (max 30s)
for i in {1..30}; do
  if curl -s http://localhost:8000/api/ >/dev/null 2>&1 || curl -s http://localhost:8000/docs >/dev/null 2>&1; then
    log "Backend OK"
    break
  fi
  sleep 1
  if [ "$i" -eq 30 ]; then
    err "Backend no respondió en 30s · revisa scripts/logs/backend.log"
    tail -30 "$ROOT/scripts/logs/backend.log" >&2
    exit 1
  fi
done

# -----------------------------------------------------
# 4) Frontend (React · puerto 3000)
# -----------------------------------------------------
cd "$ROOT/frontend"

# Resolver yarn (corepack → npm global → npx fallback)
YARN_CMD="yarn"
if ! command -v yarn >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    log "Habilitando yarn vía corepack"
    corepack enable >/dev/null 2>&1 || true
  fi
  if ! command -v yarn >/dev/null 2>&1; then
    log "Instalando yarn global vía npm"
    npm install -g yarn >/dev/null 2>&1 || {
      warn "npm install -g falló · usando 'npx --yes yarn' (más lento)"
      YARN_CMD="npx --yes yarn"
    }
  fi
fi

if [ ! -d node_modules ]; then
  log "Instalando dependencias frontend (primera vez tarda ~3 min)"
  $YARN_CMD install --silent 2>&1 | tail -5 || {
    warn "yarn install falló · intentando npm install"
    npm install --silent
  }
fi

# Matar instancia previa en puerto 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 1

log "Arrancando frontend en http://localhost:3000"
BROWSER=none nohup $YARN_CMD start \
  > "$ROOT/scripts/logs/frontend.log" 2>&1 &
echo $! > "$ROOT/scripts/logs/frontend.pid"

# Esperar frontend (max 60s · compila webpack)
log "Esperando compile frontend (~30-60s primera vez)..."
for i in {1..60}; do
  if curl -s http://localhost:3000 >/dev/null 2>&1; then
    log "Frontend OK"
    break
  fi
  sleep 1
  if [ "$i" -eq 60 ]; then
    warn "Frontend tarda más de 60s · puede estar compilando · revisa scripts/logs/frontend.log"
  fi
done

# -----------------------------------------------------
# 5) Resumen
# -----------------------------------------------------
echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║  DMX LOCAL · UP                                       ║"
echo "╠═══════════════════════════════════════════════════════╣"
echo "║  Frontend → http://localhost:3000                     ║"
echo "║  Backend  → http://localhost:8000/docs                ║"
echo "║  Mongo    → localhost:27017 (Docker ${MONGO_NAME})    ║"
echo "║                                                       ║"
echo "║  Superadmin login:                                    ║"
echo "║    email:    admin@local.dmx.io                       ║"
echo "║    password: localdev                                 ║"
echo "║                                                       ║"
echo "║  Apagar todo: ./scripts/dev-down.sh                   ║"
echo "║  Cargar data demo: python3 scripts/dev-seed.py        ║"
echo "║  Logs: scripts/logs/{backend,frontend}.log            ║"
echo "╚═══════════════════════════════════════════════════════╝"
