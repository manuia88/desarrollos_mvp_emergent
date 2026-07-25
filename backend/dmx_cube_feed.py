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

import re
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


def db_unit_to_atom(u: Dict[str, Any], dev: Dict[str, Any]) -> Dict[str, Any]:
    """Mapea una unidad INGERIDA (db.units, shape bulk-ingest) al átomo dmx_units. Espejo de
    seed_to_atom pero con los campos que escribe la ingesta (size_m2/size_m2_total/storage/parking/…)."""
    beds = u.get("bedrooms")
    try:
        n_park = int(re.sub(r"[^\d]", "", str(u.get("parking") or "")) or 0)
    except Exception:  # noqa: BLE001
        n_park = 1 if u.get("parking") else 0
    parking = [{"arreglo": None} for _ in range(n_park)] if n_park else []
    storage = [{"incluida": True}] if u.get("storage") else []
    amenities = dev.get("amenities")
    amenity_keys = amenities if isinstance(amenities, list) and amenities and isinstance(amenities[0], str) else None
    return {
        "unit_id": u.get("id"),
        "development_id": u.get("development_id") or dev.get("id"),
        "prototype_id": u.get("type"),
        # Tipo REAL de la unidad (casa/depto/loft/estudio). Antes no viajaba al cubo y el corte por
        # tipo devolvía "departamento" para todo — 150 casas y 7 roof gardens salían mal clasificados
        # (auditoría A–Z 07-24).
        "tipo_unidad": (u.get("type") or u.get("property_type") or "").strip().lower() or None,
        "org_id": u.get("developer_id") or dev.get("developer_id"),
        "developer_id": u.get("developer_id") or dev.get("developer_id"),
        "tipologia": tipologia_from_beds(beds),
        # P8: mapear piso/orientación (antes None → dims 'sin_dato' siempre). Normaliza vía _ORIENT.
        "position": {"piso": u.get("level"),
                     "orientacion": _ORIENT.get(str(u.get("orientacion") or u.get("orientation") or "").strip().lower())
                     or u.get("orientacion") or u.get("orientation")},
        # P8: terraza/balcón/roof reales (antes None → has_terraza/has_roof siempre False en el cubo)
        "areas": {"m2_construido": u.get("size_m2_total") or u.get("m2_total") or u.get("size_m2"),
                  "m2_privativo": u.get("size_m2") or u.get("m2_privative"),
                  "m2_terraza": u.get("m2_terrace"), "m2_balcon": u.get("m2_balcony"),
                  "m2_roof_garden_privado": u.get("m2_roof_garden")},
        "interior": {"recamaras": beds, "banos_completos": u.get("bathrooms")},
        "parking": parking,
        "storage": storage,
        "commercial": {"precio_lista_mxn": u.get("price_mxn"), "status": u.get("status")},
        "geo": {"colonia_id": u.get("colonia_id") or dev.get("colonia_id"),
                "alcaldia": dev.get("alcaldia"), "calle": dev.get("address"),
                "cp": None, "lat": dev.get("lat"), "lng": dev.get("lng")},
        "amenity_keys": amenity_keys,
        "sources": {"_origin": "bulk_ingest"},
        "updated_at": _iso(),
    }


async def sync_ingested_to_atom(db, developer_id: Optional[str] = None) -> Dict[str, Any]:
    """CABLE #3 · RUTA CANÓNICA del inventario al cubo (Palanca 8, auditoría 07-20):
        db.units (+ developer_unit_overrides) = unidades_efectivas → proyección FIEL en dmx_units.
    Antes el átomo se construía del db.units CRUDO (sin overrides) → el cubo OLAP contaba como
    'disponible' una unidad que el dev ya marcó 'vendido' en su portal (dos universos). Ahora se
    funden los overrides ANTES de proyectar, así TODO lector del átomo (OLAP, demanda, absorción,
    query-libre) ve lo mismo que corte_engine (que lee unidades_efectivas). Idempotente."""
    q: Dict[str, Any] = {"developer_id": developer_id} if developer_id else {}
    devs: Dict[str, Dict[str, Any]] = {}
    # TODOS los devs REALES (07-20): antes solo 'bulk_ingest' → QC/Punto Destino (ingesta_en_sesion)
    # nunca entraban al cubo. Los del seed no están en db.developments, no se tocan.
    async for d in db.developments.find(q, {"_id": 0}):
        devs[d["id"]] = d
    if not devs:
        return {"synced": 0, "collection": UNITS}
    # overrides del portal dev (misma fusión canónica que unidades_efectivas) — átomo FIEL
    from unidades_efectivas import fusionar
    overrides: Dict[str, Dict[str, Any]] = {}
    async for ov in db.developer_unit_overrides.find(
            {"$or": [{"dev_id": {"$in": list(devs.keys())}}, {"development_id": {"$in": list(devs.keys())}}]},
            {"_id": 0}):
        if ov.get("unit_id"):
            overrides[ov["unit_id"]] = ov
    n = 0
    async for u in db.units.find({"development_id": {"$in": list(devs.keys())}}, {"_id": 0}):
        dev = devs.get(u.get("development_id")) or {}
        if overrides.get(u.get("id")):                       # P8: aplica la edición del portal dev
            u = fusionar([u], {u["id"]: overrides[u["id"]]})[0]
        atom = db_unit_to_atom(u, dev)
        if not atom.get("unit_id"):
            continue
        await db[UNITS].update_one(
            {"unit_id": atom["unit_id"]},
            {"$set": atom, "$setOnInsert": {"created_at": _iso()}},
            upsert=True,
        )
        n += 1
    pruned = await podar_atomos_fantasma(db)     # global: caza también devs borrados
    # P8: materializa el bloque finance (mens/enganche/ticket) sobre los átomos con precio → la
    # dimensión 'financiero' del cubo deja de estar en 30%. Idempotente, fail-open.
    fin = None
    try:
        from dmx_finance_atom import materialize_finance
        fin = await materialize_finance(db)
    except Exception as e:  # noqa: BLE001
        import logging
        logging.getLogger("dmx.cube_feed").warning(f"[sync] finance materialize: {e}")
    return {"synced": n, "pruned": pruned, "finance": fin, "collection": UNITS}


async def podar_atomos_fantasma(db, dev_ids: Optional[list] = None) -> int:
    """Borra átomos INGERIDOS (sources._origin ≠ seed_backfill) cuyo unit_id ya no existe en
    db.units — la re-ingesta les daba id nuevo y el átomo viejo quedaba FANTASMA (32% del cubo
    inflado, 07-20). NUNCA toca los átomos del seed (fallback demo). Idempotente. Scoped a
    dev_ids si se pasa; global si no."""
    live = {u["id"] async for u in db.units.find({}, {"id": 1})}
    base: Dict[str, Any] = {"sources._origin": {"$ne": "seed_backfill"}}
    if dev_ids is not None:
        base["development_id"] = {"$in": dev_ids}
    stale = [a["unit_id"] async for a in db[UNITS].find(base, {"unit_id": 1})
             if a.get("unit_id") not in live]
    total = 0
    for i in range(0, len(stale), 500):
        lote = dict(base, **{"unit_id": {"$in": stale[i:i + 500]}})
        r = await db[UNITS].delete_many(lote)
        total += r.deleted_count
    return total


async def juez_cubo_universos(db) -> Dict[str, Any]:
    """Palanca 8 · el juez que TRAZA las dos rutas del inventario y verifica que convergen:
    el átomo REAL (dmx_units sin seed) debe ser 1:1 con db.units; el seed queda como demo. Reporta
    desalineación, cobertura de colonia y de finance. Corre en el vigía (metricas_salud.cubo)."""
    live = {u["id"] async for u in db.units.find({}, {"_id": 0, "id": 1})}
    total = await db[UNITS].estimated_document_count()
    seed = await db[UNITS].count_documents({"sources._origin": "seed_backfill"})
    real_ids = {a["unit_id"] async for a in db[UNITS].find(
        {"sources._origin": {"$ne": "seed_backfill"}}, {"_id": 0, "unit_id": 1})}
    fantasmas = len(real_ids - live)          # átomo real sin unidad viva → debe ser 0 (prune)
    faltan_en_atomo = len(live - real_ids)    # unidad viva sin átomo → sync incompleto
    col_vacia = await db[UNITS].count_documents(
        {"$or": [{"geo.colonia_id": None}, {"geo.colonia_id": ""}, {"geo.colonia_id": {"$exists": False}}]})
    con_finance = await db[UNITS].count_documents({"finance.mens_80_20": {"$exists": True, "$ne": None}})
    con_precio = await db[UNITS].count_documents({"commercial.precio_lista_mxn": {"$exists": True, "$ne": None}})
    return {
        "db_units_vivas": len(live), "atomo_total": total, "atomo_seed": seed,
        "atomo_real": len(real_ids), "fantasmas": fantasmas, "faltan_en_atomo": faltan_en_atomo,
        "colonia_vacia": col_vacia,
        "finance_cobertura_pct": round(con_finance * 100 / con_precio) if con_precio else 0,
        # convergen: el átomo real = db.units viva (sin fantasmas ni faltantes)
        "convergen": fantasmas == 0 and faltan_en_atomo == 0,
    }


# ─── átomo → plano (para el agregador del cubo) ──────────────────────────────
def _tipo_normalizado(v) -> str:
    """Tipo de unidad para el cubo: casa / depto / loft / estudio / terreno. 'depto' sólo si no hay dato."""
    t = str(v or "").strip().lower()
    if not t:
        return "depto"
    if "casa" in t:
        return "casa"
    if "terreno" in t or "lote" in t:
        return "terreno"
    if "loft" in t:
        return "loft"
    if "estudio" in t or "studio" in t:
        return "estudio"
    if "roof" in t:
        return "roof_garden"
    if "local" in t or "oficina" in t:
        return t
    return "depto"


def _entero_si_cabe(v):
    """2.0 → 2 (mismo valor, misma cubeta). Deja intacto lo que no sea número."""
    if v is None:
        return "sin_dato"
    try:
        f = float(v)
        return int(f) if f.is_integer() else f
    except (TypeError, ValueError):
        return v


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
        # Las DOS ramas del ternario anterior devolvían "depto", así que el corte por tipo estaba
        # muerto: una casa se reportaba como departamento. Ahora se lee el tipo real del átomo y
        # sólo se cae a "depto" cuando de verdad no hay dato.
        "unit_type": _tipo_normalizado(a.get("tipo_unidad")),
        "colonia_id": geo.get("colonia_id"),
        "zone_id": geo.get("colonia_id"),
        "alcaldia": geo.get("alcaldia"),
        # dimensiones RICAS (nuevas)
        "tipologia": a.get("tipologia") or "sin_dato",
        # '2' y '2.0' eran cubetas SEPARADAS en los cortes (1,016 + 1,349 unidades partidas en dos).
        # Se normaliza a entero cuando el valor es entero, antes de que el agregador lo pase por str().
        "recamaras": _entero_si_cabe(interior.get("recamaras")),
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
