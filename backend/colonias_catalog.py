"""
colonias_catalog — Catálogo de colonias por ciudad (EX.1 · build for endstate).
═══════════════════════════════════════════════════════════════════════════════
Hoy: CDMX con 16 colonias curadas. Mañana: crece al ingerir el catálogo oficial
(INEGI/SEDUVI: ~1,800 colonias CDMX con polígono) y al sumar otras ciudades
(Guadalajara, Monterrey, Querétaro, Mérida, Playa del Carmen).

La colección `colonias` y el cargador `upsert_colonias` existen YA: cuando llegue el
dato, se autollena sin tocar el motor (los scores y bandas se calculan por ciudad).
Cero deuda. `coverage()` hace siembra perezosa para que la cobertura sea siempre visible.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

log = logging.getLogger("dmx.colonias_catalog")


async def seed_colonias(db) -> int:
    """Siembra/actualiza el catálogo desde data_seed.COLONIAS (idempotente · upsert por id)."""
    from data_seed import COLONIAS, CITY_DEFAULT
    n = 0
    for c in COLONIAS:
        doc = {
            "id": c["id"], "name": c.get("name"), "city": c.get("city", CITY_DEFAULT),
            "alcaldia": c.get("alcaldia"), "center": c.get("center"),
            "tier": c.get("tier"), "source": "seed",
        }
        await db.colonias.update_one({"id": c["id"]}, {"$set": doc}, upsert=True)
        n += 1
    return n


async def upsert_colonias(db, city: str, items: List[Dict[str, Any]]) -> int:
    """Cargador para el catálogo futuro (oficial u otra ciudad). Upsert por id.

    `items`: lista de dicts con al menos `id`/`slug` y `name`. Se etiqueta con `city`.
    Es el pipe que conecta la ingesta del catálogo oficial → la plataforma. Cero deuda.
    """
    n = 0
    for it in items:
        cid = it.get("id") or it.get("slug")
        if not cid:
            continue
        doc = {**it, "id": cid, "city": city, "source": it.get("source", "ingesta")}
        await db.colonias.update_one({"id": cid}, {"$set": doc}, upsert=True)
        n += 1
    log.info(f"[colonias_catalog] upsert {n} colonias · city={city}")
    return n


async def coverage(db) -> Dict[str, Any]:
    """Cobertura de colonias por ciudad (siembra perezosa si la colección está vacía)."""
    try:
        if await db.colonias.count_documents({}) == 0:
            await seed_colonias(db)
        rows: List[Dict[str, Any]] = []
        async for r in db.colonias.aggregate([
            {"$group": {"_id": "$city", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]):
            rows.append({"city": r["_id"] or "—", "colonias": r["count"]})
        total = sum(r["colonias"] for r in rows)
        return {"ciudades": rows, "total_colonias": total, "total_ciudades": len(rows)}
    except Exception as e:  # fail-open: la cobertura nunca rompe la página
        log.warning(f"[colonias_catalog] coverage: {e}")
        return {"ciudades": [], "total_colonias": 0, "total_ciudades": 0}
