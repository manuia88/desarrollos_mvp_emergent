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
