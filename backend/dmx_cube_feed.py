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
