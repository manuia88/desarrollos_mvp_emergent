#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# CONTROL DEL GUARDIÁN DEL BACKEND (launchd KeepAlive)
#   scripts/backend-guardian.sh install   → instala y prende (auto-reinicio ON)
#   scripts/backend-guardian.sh stop      → apaga y desinstala el guardián
#   scripts/backend-guardian.sh restart   → reinicia el backend (tras cambios de código)
#   scripts/backend-guardian.sh status    → dice si está prendido y sano
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
LABEL="io.desarrollosmx.backend"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

health() { curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:8000/api/health 2>/dev/null; }

case "${1:-status}" in
  install)
    # self-healing: si no existe el plist en LaunchAgents, cópialo desde el repo
    if [ ! -f "$PLIST" ]; then
      SRC="$(cd "$(dirname "$0")" && pwd)/io.desarrollosmx.backend.plist"
      mkdir -p "$HOME/Library/LaunchAgents"
      cp "$SRC" "$PLIST" && echo "plist instalado desde $SRC"
    fi
    launchctl unload "$PLIST" 2>/dev/null || true
    pkill -9 -f "uvicorn server:app" 2>/dev/null || true
    sleep 1
    launchctl load -w "$PLIST"
    echo "Guardián instalado. Esperando a que el backend abra..."
    for i in $(seq 1 30); do [ "$(health)" = "200" ] && { echo "✅ backend ARRIBA (auto-reinicio ON)"; exit 0; }; sleep 2; done
    echo "⏳ aún abriendo · revisa scripts/logs/backend.log"
    ;;
  stop)
    launchctl unload "$PLIST" 2>/dev/null || true
    pkill -9 -f "uvicorn server:app" 2>/dev/null || true
    echo "Guardián apagado y desinstalado. El backend ya no se reinicia solo."
    ;;
  restart)
    # con KeepAlive, basta matar el proceso: launchd lo reprende con el código nuevo
    launchctl kickstart -k "gui/$(id -u)/$LABEL" 2>/dev/null || { pkill -9 -f "uvicorn server:app"; }
    echo "Reiniciando backend..."
    for i in $(seq 1 30); do [ "$(health)" = "200" ] && { echo "✅ backend reiniciado y sano"; exit 0; }; sleep 2; done
    echo "⏳ aún abriendo · revisa scripts/logs/backend.log"
    ;;
  status)
    # launchctl print (sin pipe) evita el falso-negativo de `list | grep -q` con pipefail (SIGPIPE)
    if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
      echo "Guardián: INSTALADO (auto-reinicio ON) · health=$(health)"
    else
      echo "Guardián: NO instalado · health=$(health)"
    fi
    ;;
  *) echo "uso: $0 {install|stop|restart|status}"; exit 1 ;;
esac
