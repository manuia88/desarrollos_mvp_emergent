#!/usr/bin/env bash
# Candado anti-regresión del tema claro asesor (B7).
# El color del portal de asesor vive en UN solo lugar: frontend/src/styles/asesor-aurora.css
# (tokens .portal-asesor) — todo lo demás debe usar var(--token).
# Este chequeo falla si una página de asesor vuelve a meter color OSCURO a mano.
#
# Uso:  bash scripts/check-asesor-theme.sh
# Exit: 0 = limpio · 1 = se encontró color oscuro a mano (regresión)
#
# No revisa superadmin/ ni public/ (tienen tema oscuro intencional propio).

set -u
cd "$(dirname "$0")/.." || exit 2
SRC="frontend/src/pages"
DIRS="$SRC/portal/studio $SRC/portal/asesor $SRC/asesor"

# Firmas INEQUÍVOCAS del viejo tema oscuro (cero uso legítimo en tema claro).
# Las familias rgba(240,235,224)=crema y rgba(13,16,23)=tarjeta-oscura y #F0EBE0
# son el tell-tale de "alguien copió el tema oscuro". Más los hex near-black conocidos.
# (No usamos #0xxxxx amplio para no marcar acentos brillantes como #0EA5E9.)
PATTERN='#F0EBE0|rgba\(240, ?235, ?224|rgba\(13, ?16, ?23|rgba\(6, ?8, ?15|#06080[fF]|#0[bB]0[fF]19|#0[dD]1017|#0[dD]1118|#0[eE]1220|#0[aA]0[dD]16|#10131[cC]'

HITS=$(rg -n --no-heading "$PATTERN" $DIRS -g '*.js' 2>/dev/null)

if [ -n "$HITS" ]; then
  echo "❌ Tema asesor: se encontró color oscuro a mano (debe ser var(--token)):"
  echo "$HITS"
  echo ""
  echo "→ Usa los tokens de frontend/src/styles/asesor-aurora.css (var(--bg/--surface/--cream/--border))."
  exit 1
fi

echo "✅ Tema asesor limpio · todo el color vive en asesor-aurora.css (var(--token))."
exit 0
