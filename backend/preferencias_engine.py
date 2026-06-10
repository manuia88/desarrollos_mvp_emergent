"""
preferencias_engine — F2.11 · Deseabilidad de la Unidad + Perfil Psicográfico (tono de marketing).
═══════════════════════════════════════════════════════════════════════════════
REUSA (grep-antes-de-construir):
  • dmx_unit_schema (campos físicos ya existentes): vista, esquina, posicion_vertical,
    niveles_unidad, doble_altura, altura_techo_m, m2_terraza/roof — NO se inventan.
  • studio_buyer_copy_engine.PERSONAS → 7 personas + "tono" para el copy de landings.
  • investment_simulator_engine.get_colonia_baseline → tier/zone_score para el eje "céntrica".
NUEVO (lo que falta):
  • score_deseabilidad(unit, dev) — qué tan deseable es UNA unidad cuando hay varias al
    mismo precio. Pesos del estudio 4S ("5 opciones"): céntrica 30 · vista 25 ·
    menos vecinos 19 · amenidades 17 · lujo 10.
  • perfil_psicografico(tier) — a quién le hablas en la zona → tono de marketing (insumo
    del motor de copy). Cierra el ciclo: marketplace/asesor priorizan y el copy nace del perfil.
FAIL-OPEN, bandas honestas. Construido para el estado final (funciona sin datos completos).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.preferencias")

# ── Pesos del estudio 4S: cómo elige el comprador entre 5 opciones al mismo precio ──
_PESOS = {"centrica": 0.30, "vista": 0.25, "menos_vecinos": 0.19, "amenidades": 0.17, "lujo": 0.10}

# Qué tan buena es cada vista (0..1). Campos reales del átomo (dmx_unit_schema.Vista).
_VISTA_SCORE = {
    "parque": 1.0, "area_verde": 1.0, "ciudad": 0.90, "avenida": 0.60,
    "calle": 0.45, "patio": 0.30, "interior": 0.20,
}
# Menos vecinos = más privacidad (0..1). Campo posicion_vertical.
_POS_PRIVACIDAD = {
    "penthouse": 1.0, "roof": 0.90, "garden": 0.80, "planta_baja": 0.55, "intermedio": 0.40,
}


def _u(unit, *path, default=None):
    """Lee un campo anidado del átomo de unidad, tolerante a esquema plano."""
    cur = unit
    for k in path:
        if isinstance(cur, dict):
            cur = cur.get(k)
        else:
            return default
    return cur if cur is not None else default


def _eje_vista(unit) -> float:
    v = _u(unit, "position", "vista") or _u(unit, "vista")
    return _VISTA_SCORE.get(str(v or "").lower(), 0.40)


def _eje_menos_vecinos(unit) -> float:
    pos = _u(unit, "position", "posicion_vertical") or _u(unit, "posicion_vertical")
    s = _POS_PRIVACIDAD.get(str(pos or "").lower(), 0.40)
    esquina = _u(unit, "position", "esquina")
    if esquina is None:
        esquina = _u(unit, "esquina")
    if esquina:
        s = min(1.0, s + 0.20)                 # esquina = menos colindancias
    niveles = _u(unit, "position", "niveles_unidad") or _u(unit, "niveles_unidad") or 1
    if niveles and niveles > 1:
        s = min(1.0, s + 0.10)                 # duplex/triplex = unidad más privada
    return s


def _eje_amenidades(dev) -> float:
    """Cuántas amenidades de edificio trae el desarrollo (0..1, satura ~12)."""
    if not dev:
        return 0.40
    am = dev.get("amenidades") or dev.get("amenities") or dev.get("building_amenities") or []
    n = len(am) if isinstance(am, (list, tuple)) else 0
    return min(1.0, n / 12.0) if n else 0.40


def _eje_lujo(unit) -> float:
    s = 0.30
    if _u(unit, "areas", "doble_altura") or _u(unit, "doble_altura"):
        s += 0.25
    alt = _u(unit, "areas", "altura_techo_m") or _u(unit, "altura_techo_m")
    if alt and alt >= 3.0:
        s += 0.15
    terraza = (_u(unit, "areas", "m2_terraza") or 0) + (_u(unit, "areas", "m2_roof_garden_privado") or 0)
    if terraza and terraza > 0:
        s += 0.20
    return min(1.0, s)


def _banda_deseo(p: float):
    if p >= 0.75:
        return ("muy_alta", "Muy Deseable", "verde")
    if p >= 0.60:
        return ("alta", "Deseable", "verde")
    if p >= 0.45:
        return ("media", "Promedio", "ambar")
    return ("baja", "Poco Diferenciada", "rojo")


async def score_deseabilidad(db, unit: dict, dev: Optional[dict] = None,
                             centrica: Optional[float] = None) -> Dict[str, Any]:
    """Qué tan deseable es esta unidad cuando hay varias al mismo precio (estudio 4S). FAIL-OPEN.
    `centrica` 0..1 opcional (si no, se infiere del zone_score de la colonia)."""
    dev = dev or {}

    # Eje "céntrica" — zona, igual para todas las unidades del mismo dev. Del zone_score.
    centrica_estimada = centrica is None
    if centrica is None:
        try:
            colonia_id = (unit.get("colonia_id") or _u(unit, "geo", "colonia_id")
                          or dev.get("colonia_id") or "")
            if colonia_id:
                from investment_simulator_engine import get_colonia_baseline
                base = await get_colonia_baseline(db, colonia_id)
                zs = base.get("zone_score")
                centrica = (zs / 100.0) if isinstance(zs, (int, float)) else 0.50
            else:
                centrica = 0.50
        except Exception as e:
            log.warning(f"[preferencias] centrica fail-open: {e}")
            centrica = 0.50

    ejes = {
        "centrica": round(centrica, 3),
        "vista": round(_eje_vista(unit), 3),
        "menos_vecinos": round(_eje_menos_vecinos(unit), 3),
        "amenidades": round(_eje_amenidades(dev), 3),
        "lujo": round(_eje_lujo(unit), 3),
    }
    total = sum(ejes[k] * w for k, w in _PESOS.items())
    total = max(0.0, min(1.0, total))
    nivel, etiqueta, color = _banda_deseo(total)

    # Qué la hace deseable / qué le falta (lenguaje simple).
    _LABEL = {"centrica": "ubicación céntrica", "vista": "vista", "menos_vecinos": "privacidad (pocos vecinos)",
              "amenidades": "amenidades", "lujo": "acabados de lujo"}
    fuertes = [_LABEL[k] for k in ejes if ejes[k] >= 0.70]
    debiles = [_LABEL[k] for k in ejes if ejes[k] < 0.40]

    return {
        "unit_id": unit.get("unit_id") or unit.get("id"),
        "deseabilidad": round(total * 100),
        "nivel": nivel, "etiqueta": etiqueta, "color": color,
        "ejes": {k: round(v * 100) for k, v in ejes.items()},
        "pesos": {k: round(w * 100) for k, w in _PESOS.items()},
        "lo_que_la_hace_deseable": fuertes,
        "lo_que_le_falta": debiles,
        "es_estimado": centrica_estimada,
        "fuente": "Estudio 4S · preferencias al mismo precio (céntrica 30 · vista 25 · menos vecinos 19 · amenidades 17 · lujo 10)",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Perfil psicográfico → tono de marketing (insumo del motor de copy)
# ═══════════════════════════════════════════════════════════════════════════════
# Mapa tier de zona → persona dominante + alterna (claves de studio_buyer_copy_engine.PERSONAS).
_TIER_PERSONA = {
    "luxury":   ("exec", "inversor"),
    "premium":  ("exec", "inversor"),
    "trendy":   ("inversor", "first_buyer"),
    "emerging": ("first_buyer", "inversor"),
    "mid":      ("familia", "first_buyer"),
}
_TIER_PERSONA_DEFAULT = ("familia", "inversor")


def perfil_psicografico(tier: Optional[str]) -> Dict[str, Any]:
    """A quién le hablas en la zona (persona dominante + alterna) y con qué tono.
    Reusa las PERSONAS del motor de copy → mismo lenguaje en toda la plataforma. FAIL-OPEN."""
    try:
        from studio_buyer_copy_engine import PERSONAS
    except Exception as e:
        log.warning(f"[preferencias] PERSONAS fail-open: {e}")
        PERSONAS = {}

    t = (tier or "").lower()
    dom_key, alt_key = _TIER_PERSONA.get(t, _TIER_PERSONA_DEFAULT)

    def _pack(key):
        p = PERSONAS.get(key) or {}
        return {"persona": key, "nombre": p.get("nombre", key),
                "tono": p.get("tono", ""), "enfoque": p.get("enfoque", ""),
                "cta": p.get("cta", "")}

    dom = _pack(dom_key)
    return {
        "tier": tier,
        "dominante": dom,
        "alterna": _pack(alt_key),
        "tono_marketing": dom["tono"],
        "recomendacion": f"Hazle el copy a «{dom['nombre']}»: {dom['tono']}",
        "fuente": "Perfil psicográfico DMX · reusa las 7 personas del motor de copy de landings",
    }
