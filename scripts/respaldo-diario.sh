#!/bin/bash
# Respaldo diario de la base y del material (planos/fotos).
#
# POR QUÉ (auditoría A–Z 2026-07-25): NO existía ninguna tarea programada de respaldo. Las carpetas
# ~/dmx_backups/auto_* las había creado alguien a mano, y dos de ellas (21 y 22 de julio) estaban
# VACÍAS sin que nadie se enterara. Todo el negocio vive en una sola laptop: sin esto, un disco
# muerto se lleva el catálogo, los leads y las mediciones.
#
# Qué hace, cada día:
#   1. Vuelca la base completa a un archivo comprimido (mongodump --archive --gzip).
#   2. Copia el material nuevo (planos/fotos) de forma incremental.
#   3. Conserva 14 días y borra lo más viejo, para no llenar el disco otra vez.
#   4. Verifica que el archivo del día NO esté vacío. Si falla, lo grita en el log y sale con error
#      (launchd lo registra) — un respaldo que falla en silencio es peor que no tenerlo.
set -uo pipefail

DEST="$HOME/dmx_backups"
HOY="$(date +%Y%m%d)"
DIA="$DEST/auto_$HOY"
LOG="$DEST/respaldo.log"
CONTENEDOR="dmx-local-mongo"
ASSETS="$HOME/dmx_data/dev_assets"
RETENER_DIAS=14
MINIMO_BYTES=$((5 * 1024 * 1024))   # un volcado sano de esta base pasa de 5 MB

mkdir -p "$DIA"
exec >>"$LOG" 2>&1
echo "───────── $(date '+%Y-%m-%d %H:%M:%S') · respaldo diario ─────────"

# ── 1 · base de datos ────────────────────────────────────────────────────────
ARCH="$DIA/mongo_$HOY.archive.gz"
if ! docker exec "$CONTENEDOR" mongodump --archive --gzip > "$ARCH" 2>/dev/null; then
  echo "🚨 FALLÓ el volcado de la base (¿está corriendo $CONTENEDOR?)"
  exit 1
fi
TAM=$(stat -f%z "$ARCH" 2>/dev/null || echo 0)
if [ "$TAM" -lt "$MINIMO_BYTES" ]; then
  echo "🚨 el respaldo pesa $TAM bytes — demasiado poco, algo salió mal. NO se da por bueno."
  exit 1
fi
echo "✅ base: $(du -h "$ARCH" | cut -f1)"

# ── 2 · material (planos y fotos), incremental ───────────────────────────────
if [ -d "$ASSETS" ]; then
  rsync -a --delete "$ASSETS/" "$DEST/assets_espejo/" 2>/dev/null \
    && echo "✅ material: $(du -sh "$DEST/assets_espejo" | cut -f1)" \
    || echo "⚠️ el material no se pudo copiar"
fi

# ── 3 · limpieza: conservar los últimos N días ───────────────────────────────
find "$DEST" -maxdepth 1 -type d -name "auto_*" -mtime "+$RETENER_DIAS" -exec rm -rf {} + 2>/dev/null
echo "✅ listo · se conservan $RETENER_DIAS días · $(ls -d "$DEST"/auto_* 2>/dev/null | wc -l | tr -d ' ') respaldos en disco"
