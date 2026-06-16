"""LIV — Livability por perfil (Tanda 7, el moat diferenciador).

Reutiliza los 6 sub-scores reales de `zone_score_engine.get_zone_with_subscores`
(lifestyle/seguridad/transporte/amenidades/precio/vibe) y los REPONDERA por perfil de
comprador (familia/joven/senior/inversión). NO inventa dato: si un sub-score falta, su
peso se excluye y se renormaliza; si no hay ninguno, el perfil queda `available:false`
(esperando-fuente honesto). Mismo "dato, muchos lentes": el diferenciador es la
personalización, no un dato nuevo.
"""
from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

import zone_score_engine as _zse

# Pesos por perfil sobre los 6 sub-scores (cada perfil suma 1.0).
LIV_PROFILES: Dict[str, Dict[str, float]] = {
    "familia":   {"seguridad": 0.30, "lifestyle": 0.25, "amenidades": 0.20, "transporte": 0.10, "precio": 0.10, "vibe": 0.05},
    "joven":     {"vibe": 0.25, "lifestyle": 0.25, "transporte": 0.20, "amenidades": 0.15, "precio": 0.10, "seguridad": 0.05},
    "senior":    {"seguridad": 0.30, "amenidades": 0.25, "transporte": 0.15, "precio": 0.15, "lifestyle": 0.10, "vibe": 0.05},
    "inversion": {"precio": 0.40, "amenidades": 0.15, "transporte": 0.15, "seguridad": 0.15, "lifestyle": 0.10, "vibe": 0.05},
}

PROFILE_META: Dict[str, Dict[str, str]] = {
    "familia":   {"nombre": "Familia",        "que_busca": "Seguridad, escuelas, parques y calidad de vida."},
    "joven":     {"nombre": "Joven / Pareja",  "que_busca": "Ambiente, conectividad y vida de barrio."},
    "senior":    {"nombre": "Adulto Mayor",    "que_busca": "Calma, seguridad y servicios cerca."},
    "inversion": {"nombre": "Inversión",       "que_busca": "Precio de entrada y potencial de renta/plusvalía."},
}


def _letter(v: float) -> str:
    if v >= 80: return "A"
    if v >= 65: return "B"
    if v >= 50: return "C"
    if v >= 35: return "D"
    return "F"


def _score_for_profile(subs: Dict[str, Optional[float]], weights: Dict[str, float]) -> Optional[Tuple[float, int]]:
    """Promedio ponderado sobre los sub-scores DISPONIBLES (renormaliza). None si ninguno."""
    num = 0.0
    wsum = 0.0
    used = 0
    for k, w in weights.items():
        v = subs.get(k)
        if v is not None:
            num += float(v) * w
            wsum += w
            used += 1
    if wsum <= 0:
        return None
    return round(num / wsum, 1), used


async def compute_liv(db, slug: str) -> Dict[str, Any]:
    """LIV por los 4 perfiles para una colonia. Reusa los sub-scores reales (no inventa)."""
    z = await _zse.get_zone_with_subscores(db, slug)
    subs = z.get("subscores") or {}
    real = z.get("source") == "real"
    perfiles: Dict[str, Any] = {}
    for pid, weights in LIV_PROFILES.items():
        r = _score_for_profile(subs, weights)
        if r is None:
            perfiles[pid] = {"available": False, "reason": "Esperando los scores de la zona", **PROFILE_META[pid]}
        else:
            val, used = r
            perfiles[pid] = {
                "available": True, "valor": val, "letra": _letter(val),
                "es_estimado": not real, "dims_usadas": used, **PROFILE_META[pid],
            }
    return {"slug": slug, "perfiles": perfiles, "fuente": "real" if real else "estimado"}
