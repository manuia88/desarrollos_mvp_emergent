#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# GUARDIÁN DEL BACKEND DMX · lo supervisa launchd (KeepAlive) — el "unless-stopped"
# del proceso API, igual que Docker lo hace con Mongo.
#
# launchd corre ESTE script; hacemos `exec uvicorn` para que launchd supervise el
# proceso real: si uvicorn muere (crash, Mac que despierta, lo que sea), launchd lo
# vuelve a prender solo. SIN --reload = estable (el reload reiniciaba en cada edición).
#
# Instalar/quitar: scripts/backend-guardian.sh install | stop | status
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

ROOT="/Users/manuelacosta/Developer/desarrollos_mvp_emergent"
# PATH robusto (launchd trae un PATH mínimo): homebrew, /usr/local, OrbStack, sistema.
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.orbstack/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# 1) Mongo arriba (idempotente — ya tiene restart=unless-stopped, esto es cinturón+tirantes)
docker start dmx-local-mongo >/dev/null 2>&1 || true

# 2) Puerto 8000 libre: mata cualquier uvicorn manual/stale que lo tenga agarrado
#    (launchd corre una sola instancia; la anterior ya salió si estamos reiniciando).
lsof -ti tcp:8000 2>/dev/null | xargs -r kill -9 2>/dev/null || true

# 3) Variables de entorno locales (DB, auth, llaves)
set -a
# shellcheck disable=SC1091
source "$ROOT/backend/.env.local"
set +a

# 4) exec uvicorn — launchd supervisa este PID directamente
cd "$ROOT/backend" || exit 1
exec "$ROOT/scripts/.venv/bin/python" -m uvicorn server:app --host 0.0.0.0 --port 8000
