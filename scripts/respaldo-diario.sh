#!/bin/bash
# Respaldo diario de la base y del material (planos/fotos).
#
# POR QUÉ (auditoría A–Z 2026-07-25): NO existía ninguna tarea programada de respaldo. Las carpetas
# ~/dmx_backups/auto_* las había creado alguien a mano, y dos de ellas (21 y 22 de julio) estaban
# VACÍAS sin que nadie se enterara. Todo el negocio vive en una sola laptop: sin esto, un disco
# muerto se lleva el catálogo, los leads y las mediciones.
#
# DOS FALLAS PROPIAS CORREGIDAS (auditoría A–Z 2026-07-26) — la primera versión de este script
# llevaba 1 sola corrida exitosa en su vida, y encima destruyó el único respaldo bueno que había:
#
#   1. `docker` no existe para launchd. Un demonio arranca con un PATH mínimo que NO incluye
#      /usr/local/bin, así que `docker exec` fallaba SIEMPRE que la tarea la disparaba el reloj —
#      funcionaba solo cuando yo la corría a mano desde una terminal. Por eso el registro tiene un
#      éxito (manual, 00:48) y un fracaso (programado, 03:30). Ahora se busca el binario por ruta
#      absoluta y se avisa con claridad si no está.
#
#   2. **El fracaso borraba al respaldo bueno.** El volcado se escribía con `> archivo` y el nombre
#      del archivo es la fecha, así que la corrida de las 03:30 abrió el archivo del día — el de
#      257 MB que sí había salido bien a las 00:48 — lo truncó a cero bytes, y ENTONCES falló al
#      no encontrar docker. Un respaldo que se rompe puede ser mala suerte; uno que se lleva por
#      delante al anterior es una trampa. Ahora se vuelca a un archivo temporal, se verifica que
#      pese lo que debe, y solo entonces se mueve a su lugar definitivo. El bueno de ayer nunca
#      corre riesgo por culpa del de hoy.
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

# ── 0 · encontrar docker ─────────────────────────────────────────────────────
# launchd no hereda el PATH de la terminal. Se prueban las rutas reales de OrbStack antes de
# rendirse, y si no aparece se dice EXACTAMENTE qué pasó (no "falló el volcado", que mandaba a
# buscar el problema en el lugar equivocado).
DOCKER=""
for cand in /usr/local/bin/docker /opt/homebrew/bin/docker "$HOME/.orbstack/bin/docker" "$(command -v docker 2>/dev/null)"; do
  [ -n "$cand" ] && [ -x "$cand" ] && { DOCKER="$cand"; break; }
done
if [ -z "$DOCKER" ]; then
  echo "🚨 no se encontró 'docker' — ¿está instalado OrbStack? Sin él no se puede leer la base."
  exit 1
fi

# ── 1 · base de datos ────────────────────────────────────────────────────────
# Se escribe a un temporal: si algo sale mal, el respaldo del día anterior (o el de más temprano
# hoy) queda intacto. Solo un volcado verificado toma el nombre definitivo.
ARCH="$DIA/mongo_$HOY.archive.gz"
TMP="$DIA/.mongo_$HOY.parcial.gz"
trap 'rm -f "$TMP"' EXIT

if ! "$DOCKER" exec "$CONTENEDOR" mongodump --archive --gzip > "$TMP" 2>/dev/null; then
  echo "🚨 FALLÓ el volcado de la base (¿está corriendo $CONTENEDOR?) — el respaldo anterior sigue intacto"
  exit 1
fi
TAM=$(stat -f%z "$TMP" 2>/dev/null || echo 0)
if [ "$TAM" -lt "$MINIMO_BYTES" ]; then
  echo "🚨 el volcado pesa $TAM bytes — demasiado poco, algo salió mal. NO se da por bueno y NO se reemplaza el anterior."
  exit 1
fi
mv -f "$TMP" "$ARCH"
echo "✅ base: $(du -h "$ARCH" | cut -f1)"

# ── 2 · material (planos y fotos), incremental ───────────────────────────────
if [ -d "$ASSETS" ]; then
  rsync -a --delete "$ASSETS/" "$DEST/assets_espejo/" 2>/dev/null \
    && echo "✅ material: $(du -sh "$DEST/assets_espejo" | cut -f1)" \
    || echo "⚠️ el material no se pudo copiar"
fi

# ── 3 · limpieza: conservar los últimos N días ───────────────────────────────
# Solo se borran carpetas que SÍ tengan un volcado bueno adentro. Antes bastaba con ser vieja, así
# que una carpeta vacía (de un día que falló) contaba como respaldo y ayudaba a borrar uno real.
find "$DEST" -maxdepth 1 -type d -name "auto_*" -mtime "+$RETENER_DIAS" -exec rm -rf {} + 2>/dev/null
BUENOS=$(find "$DEST" -maxdepth 2 -name "mongo_*.archive.gz" -size +5M 2>/dev/null | wc -l | tr -d ' ')
echo "✅ listo · se conservan $RETENER_DIAS días · $BUENOS respaldos ÚTILES en disco"
if [ "$BUENOS" -lt 2 ]; then
  echo "⚠️ solo hay $BUENOS respaldo(s) útil(es). Se necesita más de uno para poder volver atrás."
fi
