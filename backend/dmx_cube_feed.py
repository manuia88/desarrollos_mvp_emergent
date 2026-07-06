"""
DMX · ALIMENTACIÓN DEL CUBO desde el ÁTOMO milimétrico
═══════════════════════════════════════════════════════════════════════════════
Bridge entre el átomo (dmx_units · dmx_unit_schema) y el cube_olap_engine:
  · seed_to_atom()  — proyecta una unidad seed (ya rica: m²/roof/parking/status) al átomo.
  · backfill_atom() — puebla dmx_units desde el seed (idempotente). El átomo deja de
    estar vacío → el cubo tiene dato real que masticar (build-for-endstate).
  · flatten_atom()  — aplana el átomo al shape plano que el agregador del cubo consume,
    exponiendo TAMBIÉN las dimensiones ricas (tipología/recámaras/banda_m2/roof/parking)
    y geo denormalizado (colonia/alcaldía) — esto último ARREGLA la dimensión 'zone'
    que hoy queda 'unknown' en unidades seed sin colonia_id.
  · helpers de dimensión/medida ricas para que el cubo corte por lo que importa.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from dmx_unit_schema import COLLECTIONS

UNITS = COLLECTIONS["units"]          # "dmx_units"

_ORIENT = {"norte": "N", "sur": "S", "este": "E", "oeste": "O",
           "noreste": "NE", "noroeste": "NO", "sureste": "SE", "suroeste": "SO"}

_PARKING_ARREGLO = {
    "individual": "independiente", "independiente": "independiente",
    "bateria": "en_bateria", "en bateria": "en_bateria", "batería": "en_bateria",
    "bateria_compartida": "en_bateria_compartida", "compartido": "independiente_compartido",
}


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def tipologia_from_beds(b: Optional[int]) -> Optional[str]:
    if b is None:
        return None
    if b <= 0:
        return "estudio"
    if b == 1:
        return "1_recamara"
    if b == 2:
        return "2_recamaras"
    if b == 3:
        return "3_recamaras"
    return "4_mas_recamaras"


def banda_m2(m2: Optional[float]) -> str:
    if not m2 or m2 <= 0:
        return "sin_dato"
    if m2 < 60:
        return "<60"
    if m2 < 90:
        return "60-90"
    if m2 < 120:
        return "90-120"
    if m2 < 180:
        return "120-180"
    return "180+"


# ─── seed → átomo ─────────────────────────────────────────────────────────────
def seed_to_atom(u: Dict[str, Any], dev: Dict[str, Any]) -> Dict[str, Any]:
    """Mapea una unidad seed (data_developments) al documento del átomo dmx_units."""
    beds = u.get("bedrooms")
    center = dev.get("center") or [None, None]
    n_park = int(u.get("parking_spots") or 0)
    arreglo = _PARKING_ARREGLO.get(str(u.get("parking_type") or "").lower())
    parking = [{"arreglo": arreglo} for _ in range(n_park)] if n_park else []
    storage = [{"incluida": True}] if u.get("bodega") else []
    amenities = dev.get("amenities")
    amenity_keys = amenities if isinstance(amenities, list) and amenities and isinstance(amenities[0], str) else None

    return {
        "unit_id": u.get("id"),
        "development_id": u.get("development_id") or dev.get("id"),
        "prototype_id": u.get("prototype"),
        "org_id": dev.get("developer_id"),
        "developer_id": dev.get("developer_id"),
        "tipologia": tipologia_from_beds(beds),
        "position": {"piso": u.get("level"),
                     "orientacion": _ORIENT.get(str(u.get("orientation") or "").lower())},
        "areas": {"m2_construido": u.get("m2_total"), "m2_privativo": u.get("m2_privative"),
                  "m2_terraza": u.get("m2_terrace") or None, "m2_balcon": u.get("m2_balcony") or None,
                  "m2_roof_garden_privado": u.get("m2_roof_garden") or None},
        "interior": {"recamaras": beds, "banos_completos": u.get("bathrooms")},
        "parking": parking,
        "storage": storage,
        "commercial": {"precio_lista_mxn": u.get("price"), "status": u.get("status")},
        "geo": {"colonia_id": dev.get("colonia_id"), "alcaldia": dev.get("alcaldia"),
                "calle": dev.get("street"), "cp": dev.get("postal_code"),
                "lat": center[1] if len(center) > 1 else None,
                "lng": center[0] if center else None},
        "amenity_keys": amenity_keys,
        "sources": {"_origin": "seed_backfill"},
        "updated_at": _iso(),
    }


async def backfill_atom(db) -> Dict[str, Any]:
    """Puebla dmx_units desde el seed (idempotente · upsert por unit_id). Returns conteo."""
    from data_developments import DEVELOPMENTS
    n = 0
    for dev in DEVELOPMENTS:
        for u in (dev.get("units") or []):
            atom = seed_to_atom(u, dev)
            if not atom.get("unit_id"):
                continue
            await db[UNITS].update_one(
                {"unit_id": atom["unit_id"]},
                {"$set": atom, "$setOnInsert": {"created_at": _iso()}},
                upsert=True,
            )
            n += 1
    return {"backfilled": n, "collection": UNITS}


# ─── átomo → plano (para el agregador del cubo) ──────────────────────────────
def flatten_atom(a: Dict[str, Any]) -> Dict[str, Any]:
    """Aplana el átomo al shape plano que cube_olap_engine agrega, + dimensiones ricas."""
    com = a.get("commercial") or {}
    areas = a.get("areas") or {}
    interior = a.get("interior") or {}
    geo = a.get("geo") or {}
    parking = a.get("parking") or []
    m2 = areas.get("m2_privativo") or areas.get("m2_construido")
    precio = com.get("precio_lista_mxn")
    return {
        # LINAJE: retener unit_id en la fila plana — permite (a) que los overrides del dev apliquen al
        # cubo (join ov.unit_id) y (b) rastrear de qué unidad sale cada número (auditoría N1/N3).
        "unit_id": a.get("unit_id"),
        "development_id": a.get("development_id"),
        # claves legacy que el agregador/_key_of_unit ya leen
        "status": com.get("status"),
        "price": precio,
        "price_mxn": precio,
        "m2_privative": m2,
        "size_m2": m2,
        "unit_type": "depto" if (a.get("tipologia") or "").endswith("recamaras") or a.get("tipologia") in ("estudio", "1_recamara") else "depto",
        "colonia_id": geo.get("colonia_id"),
        "zone_id": geo.get("colonia_id"),
        "alcaldia": geo.get("alcaldia"),
        # dimensiones RICAS (nuevas)
        "tipologia": a.get("tipologia") or "sin_dato",
        "recamaras": interior.get("recamaras") if interior.get("recamaras") is not None else "sin_dato",
        "banda_m2": banda_m2(m2),
        "has_roof": "con_roof" if (areas.get("m2_roof_garden_privado") or 0) > 0 else "sin_roof",
        "has_bodega": "con_bodega" if a.get("storage") else "sin_bodega",
        "parking_type": (parking[0].get("arreglo") if parking and parking[0].get("arreglo") else "sin_estac"),
        # medidas ricas (transaccional)
        "precio_cierre": com.get("precio_cierre_mxn"),
        "dias_en_mercado": com.get("dias_en_mercado"),
        # CUBO TOTAL F1 · dimensiones FINANCIERAS del átomo (dmx_finance_atom materializa finance.*)
        "banda_mensualidad": ((a.get("finance") or {}).get("banda_mensualidad") or "sin_dato"),
        "banda_enganche": ((a.get("finance") or {}).get("banda_enganche") or "sin_dato"),
        "mens_80_20": (a.get("finance") or {}).get("mens_80_20"),
        "enganche_min_pct": (a.get("finance") or {}).get("enganche_min_pct"),
        "ticket_entrada_min": (a.get("finance") or {}).get("ticket_entrada_min"),
    }


async def atom_units_for(db, tier: str, tier_id: Optional[str]) -> List[Dict[str, Any]]:
    """Lee el átomo (dmx_units) para un nivel y lo aplana. [] si vacío → el cubo cae a seed."""
    q: Dict[str, Any] = {}
    if tier == "development" and tier_id:
        q = {"development_id": tier_id}
    elif tier == "colonia" and tier_id:
        q = {"geo.colonia_id": tier_id}
    elif tier == "alcaldia" and tier_id:
        from metrics_cube_aggregations import _slug
        # alcaldía slug → match denormalizado
        q = {}  # se filtra abajo por slug
    rows: List[Dict[str, Any]] = []
    try:
        cursor = db[UNITS].find(q, {"_id": 0})
        async for a in cursor:
            if tier == "alcaldia" and tier_id:
                from metrics_cube_aggregations import _slug
                if _slug((a.get("geo") or {}).get("alcaldia") or "") != tier_id:
                    continue
            rows.append(flatten_atom(a))
    except Exception:
        return []
    return rows


# ─── RENTABILIDAD (roadmap de métricas) ───────────────────────────────────────
# El cubo NO tenía renta/cap/yield (0/160 celdas). Estos helpers los computan REUSANDO
# motores existentes (cero fórmula nueva, cero dato inventado):
#   · RENTAL_YIELDS (investment_simulator_engine) → yield BRUTO anual por tier de zona.
#   · inversion_v4_finance.analyze (institucional) → NOI, cap rate, yield neto sobre un
#     depto REPRESENTATIVO de la celda (avg_price_per_m2 × m² típico).
#   · inversion_v4_tax.make_isr_fn → ISR de renta consistente (mismo motor que la calc).
# Cada celda queda etiquetada: fuente / confianza / es_estimado (siempre True aquí:
# es un representativo de zona, no la unidad exacta). Fail-open: si no hay avg_price_per_m2
# la celda queda SIN KPIs de renta (no fabricamos precio).
M2_REPRESENTATIVO = 80          # depto típico de zona (mismo supuesto que /api/zona/:id/inversion)
_CAPEX_RESERVE_PCT = 0.04       # reserva CapEx (default del motor v4)


async def _tier_letter_for(db, tier: str, tier_id: Optional[str], hint_colonia_id: Optional[str] = None) -> str:
    """Resuelve el tier de zona (A/B/C/D/F) para elegir el yield de RENTAL_YIELDS.

    Reusa zone_score_engine (mismo mapeo que get_colonia_baseline). Para colonia/development
    usa el zone_score de la colonia; alcaldía/city caen a 'B' (promedio) — no inventamos un
    score de zona ancha. Fail-open a 'B'.
    """
    zone_id = None
    if tier == "colonia":
        zone_id = tier_id
    elif tier == "development":
        zone_id = hint_colonia_id
    if not zone_id:
        return "B"
    try:
        from zone_score_engine import get_score_or_compute
        zs = await get_score_or_compute(db, zone_id, tier="colonia")
        if zs and not zs.get("error"):
            s = float(zs.get("score_total") or zs.get("score") or zs.get("score_numeric") or 0)
            if s >= 85:
                return "A"
            if s >= 70:
                return "B"
            if s >= 55:
                return "C"
            if s >= 40:
                return "D"
            if s > 0:
                return "F"
    except Exception:
        pass
    return "B"


def rentability_from_pm2(avg_price_per_m2: Optional[float], tier_letter: str,
                         mkt: Optional[Dict[str, Any]] = None,
                         m2: float = M2_REPRESENTATIVO) -> Optional[Dict[str, Any]]:
    """KPIs de renta para UNA celda del cubo (pura, sin I/O). None si no hay precio/m².

    Devuelve: cap_rate_pct, yield_bruto (%), yield_neto (%), renta_m2 (MXN/m²/mes), noi (MXN/año)
    + fuente / confianza / es_estimado. REUSA RENTAL_YIELDS + inversion_v4_finance.analyze.
    """
    try:
        pm2 = float(avg_price_per_m2 or 0)
    except (TypeError, ValueError):
        pm2 = 0.0
    if pm2 <= 0 or m2 <= 0:
        return None

    try:
        from investment_simulator_engine import RENTAL_YIELDS, DEFAULT_RENTAL_YIELD
    except Exception:
        RENTAL_YIELDS, DEFAULT_RENTAL_YIELD = {}, 0.045
    yld_bruto = float(RENTAL_YIELDS.get(tier_letter, DEFAULT_RENTAL_YIELD))   # fracción anual bruta

    valor = pm2 * m2
    renta_mensual = valor * yld_bruto / 12.0
    inp: Dict[str, Any] = {
        "valor_propiedad": valor,
        "renta_mensual": renta_mensual,
        "modo_renta": "largo",
        "con_credito": False,                 # NOI/cap de la zona: sin apalancamiento (going-in)
        "num_unidades": 1,
        "capex_reserve_pct": _CAPEX_RESERVE_PCT,
        "horizonte_anios": 5,
    }
    if mkt:
        for k_inp, k_mkt in (("cetes_1a", "cetes_1a"), ("inflacion_anual", "inflacion_anual")):
            v = mkt.get(k_mkt)
            if v not in (None, ""):
                inp[k_inp] = v

    try:
        from inversion_v4_finance import analyze
        isr_fn = None
        try:
            from inversion_v4_tax import make_isr_fn
            isr_fn = make_isr_fn()
        except Exception:
            isr_fn = None
        res = analyze(inp, isr_fn=isr_fn) or {}
    except Exception:
        res = {}

    noi = res.get("noi")
    cap_rate_pct = res.get("cap_rate_pct")
    # yield neto = NOI / valor (fracción → %). Si el motor no lo dio, cae al cap rate (misma def sin crédito).
    if noi is not None and valor:
        yield_neto_pct = round(noi / valor * 100.0, 2)
    elif cap_rate_pct is not None:
        yield_neto_pct = round(float(cap_rate_pct), 2)
    else:
        yield_neto_pct = None

    return {
        "cap_rate_pct": round(float(cap_rate_pct), 2) if cap_rate_pct is not None else None,
        "yield_bruto": round(yld_bruto * 100.0, 2),
        "yield_neto": yield_neto_pct,
        "renta_m2": round(renta_mensual / m2, 2) if m2 else None,   # MXN por m² al mes
        "noi": round(float(noi)) if noi is not None else None,      # MXN al año (going-in)
        "fuente": "RENTAL_YIELDS (yield por tier) + inversion_v4_finance (NOI/cap institucional)",
        "confianza": "media" if tier_letter != "B" else "baja",     # tier resuelto por zone_score vs default 'B'
        "es_estimado": True,                                        # representativo de zona, no la unidad exacta
        "supuestos": {"m2_representativo": m2, "tier_zona": tier_letter,
                      "capex_reserve_pct": _CAPEX_RESERVE_PCT, "con_credito": False},
    }


async def attach_rentability(db, kpis: Dict[str, Any], tier: str, tier_id: Optional[str],
                             hint_colonia_id: Optional[str] = None,
                             mkt: Optional[Dict[str, Any]] = None) -> None:
    """Escribe los KPIs de renta EN `kpis` (in-place) para una celda del cubo. Fail-open.

    Usa avg_price_per_m2 que el cubo YA calculó. Sin ese dato → deja los campos en None
    (no fabricamos precio). Se llama tras _finalize en metrics_cube_aggregations.
    """
    try:
        letter = await _tier_letter_for(db, tier, tier_id, hint_colonia_id)
        rk = rentability_from_pm2(kpis.get("avg_price_per_m2"), letter, mkt=mkt)
        if rk:
            kpis["cap_rate_pct"] = rk["cap_rate_pct"]
            kpis["yield_bruto"] = rk["yield_bruto"]
            kpis["yield_neto"] = rk["yield_neto"]
            kpis["renta_m2"] = rk["renta_m2"]
            kpis["noi"] = rk["noi"]
            kpis["rentabilidad_meta"] = {"fuente": rk["fuente"], "confianza": rk["confianza"],
                                         "es_estimado": rk["es_estimado"], "supuestos": rk["supuestos"]}
    except Exception:
        # fail-open: la celda simplemente queda sin KPIs de renta
        pass
