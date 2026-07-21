"""Ciclo de vida del desarrollo — el REAPER (Palanca 1, auditoría 07-20).

Borrar o RE-INGERIR un dev limpiaba `units` pero dejaba colgando sus eventos, átomos,
snapshots y overrides → 437 status-events + 22 price-events + 880 átomos huérfanos que
inflaban las métricas y contaminaban el análisis. `purgar_dev()` cierra la CAUSA (se llama
antes de re-ingerir o al borrar); `podar_eventos_huerfanos()` limpia lo que ya se generó.
"""
from __future__ import annotations

from typing import Any, Dict, List

# Colecciones keyed al dev y el campo que lo referencia (verificado en BD 07-20).
# dmx_units se maneja con dmx_cube_feed.podar_atomos_fantasma (respeta el seed).
_POR_DEV: List[tuple] = [
    ("units", "development_id"),
    ("unit_status_events", "dev_id"),
    ("price_events", "dev_id"),
    ("vigia_senales_venta", "development_id"),
    ("oferta_timeline", "dev_id"),
    ("developer_audit", "dev_id"),
    ("developer_unit_overrides", "dev_id"),
    ("moldes", "development_id"),
]


async def purgar_dev(db, dev_id: str, borrar_dev: bool = True) -> Dict[str, int]:
    """Borra en CASCADA todo lo del dev: units + sus eventos/átomos/snapshots/overrides, y
    opcionalmente el propio doc de development. Idempotente. Úsalo ANTES de re-ingerir un dev
    (borrar_dev=False para conservar el doc) o al eliminarlo (borrar_dev=True)."""
    res: Dict[str, int] = {}
    for coll, field in _POR_DEV:
        r = await db[coll].delete_many({field: dev_id})
        if r.deleted_count:
            res[coll] = r.deleted_count
    try:                                              # átomos del cubo (respeta el seed)
        from dmx_cube_feed import podar_atomos_fantasma
        n = await db.dmx_units.delete_many(
            {"development_id": dev_id, "sources._origin": {"$ne": "seed_backfill"}})
        if n.deleted_count:
            res["dmx_units"] = n.deleted_count
        await podar_atomos_fantasma(db)               # barre cualquier resto
    except Exception:  # noqa: BLE001
        pass
    if borrar_dev:
        r = await db.developments.delete_one({"id": dev_id})
        if r.deleted_count:
            res["developments"] = r.deleted_count
    return res


async def podar_eventos_huerfanos(db) -> Dict[str, int]:
    """Limpia eventos/overrides cuyo dev YA NO existe en developments — lo que dejaron las
    re-ingestas de esta semana antes de que existiera purgar_dev(). No toca units (vivos) ni
    los átomos del seed. Idempotente."""
    real: List[str] = [d["id"] async for d in db.developments.find({}, {"_id": 0, "id": 1})]
    res: Dict[str, int] = {}
    for coll, field in _POR_DEV:
        if coll == "units":                           # las unidades vivas no se tocan
            continue
        r = await db[coll].delete_many(
            {field: {"$exists": True, "$ne": None, "$nin": real}})
        if r.deleted_count:
            res[coll] = r.deleted_count
    return res


# Stores de eventos/bitácora keyed al dev (para el juez de integridad). Los retro se keyean por
# NOMBRE (dev_name), no por id → se excluyen del conteo dev-huérfano (son válidos sin dev doc).
_STORES_BITACORA: List[tuple] = [
    ("unit_status_events", "dev_id"),
    ("price_events", "dev_id"),
    ("oferta_timeline", "dev_id"),
    ("vigia_senales_venta", "development_id"),
]


async def podar_bitacora_unit_huerfanos(db) -> Dict[str, int]:
    """Palanca 6 · limpia unit-huérfanos SOLO de `oferta_timeline` (foto de oferta: {unit_id, ts},
    sin precio ni estatus → cero señal analizable). Un unit_id que ya no existe en units, dejado por
    una RE-INGESTA (la unidad se recreó con id nuevo). Re-ancla por unit_number si lo trae; si no,
    borra (es peso muerto que jamás une con nada). NO toca unit_status_events/price_events: esos
    llevan la VENTA/precio real aunque la unidad se re-ingiera. Idempotente."""
    real_unit = {u["id"] async for u in db.units.find({}, {"_id": 0, "id": 1})}
    reanclados = borrados = 0
    a_borrar: List = []
    async for e in db.oferta_timeline.find(
            {"unit_id": {"$exists": True, "$ne": None}},
            {"_id": 1, "unit_id": 1, "unit_number": 1, "dev_id": 1, "development_id": 1}):
        if e["unit_id"] in real_unit:
            continue
        dev = e.get("development_id") or e.get("dev_id")
        un = e.get("unit_number")
        nuevo = None
        if dev and un:
            m = await db.units.find_one(
                {"$or": [{"development_id": dev}, {"dev_id": dev}], "unit_number": un}, {"_id": 0, "id": 1})
            nuevo = m and m.get("id")
        if nuevo:
            await db.oferta_timeline.update_one({"_id": e["_id"]}, {"$set": {"unit_id": nuevo}})
            reanclados += 1
        else:
            a_borrar.append(e["_id"])
    if a_borrar:
        r = await db.oferta_timeline.delete_many({"_id": {"$in": a_borrar}})
        borrados = r.deleted_count
    return {"reanclados": reanclados, "borrados": borrados}


async def juez_integridad_bitacora(db) -> Dict[str, Any]:
    """Palanca 6 · el juez que le faltaba a AUDITAR: cuenta (no borra) los eventos DESANCLADOS —
    dev_id que ya no existe en developments, o unit_id que ya no existe en units. Reporta salud de
    la bitácora para el parte y para que el founder vea si la reversa/purga quedó completa."""
    real_dev = {d["id"] async for d in db.developments.find({}, {"_id": 0, "id": 1})}
    real_unit = {u["id"] async for u in db.units.find({}, {"_id": 0, "id": 1})}
    stores: List[Dict[str, Any]] = []
    total_huerfanos = 0
    for coll, field in _STORES_BITACORA:
        c = db[coll]
        total = await c.estimated_document_count()
        # dev-huérfano: tiene dev_id y NO está en developments (excluye retro por nombre: dev_id None)
        dev_h = await c.count_documents({field: {"$exists": True, "$ne": None, "$nin": list(real_dev)}})
        # unit-huérfano: tiene unit_id y NO está en units (retro no tiene unit_id → no cuenta)
        unit_h = 0
        async for e in c.find({"unit_id": {"$exists": True, "$ne": None}}, {"_id": 0, "unit_id": 1}):
            if e["unit_id"] not in real_unit:
                unit_h += 1
        huerfanos = dev_h + unit_h
        total_huerfanos += huerfanos
        stores.append({"store": coll, "total": total, "dev_huerfano": dev_h,
                       "unit_huerfano": unit_h, "pct_sano": round((total - huerfanos) * 100 / total) if total else 100})
    return {"stores": stores, "huerfanos_total": total_huerfanos,
            "sano": total_huerfanos == 0}
