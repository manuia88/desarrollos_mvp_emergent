"""Espinazo de demanda — atribución + higiene (Palanca 4, auditoría 07-20).

Dos hallazgos que resultaron ser el MISMO problema: (1) 995/1359 buyer_signals tienen entity_id
que NO matchea ningún dev real → 'atribución rota'; (2) roma-norte-85 (#1 en interés) es tráfico
sintético (469 señales de UN visitor). La raíz común: la demanda está contaminada con SEED/DEMO
(slugs de la semilla, visitors de prueba). Este módulo: `marca env='demo'|'real'` en cada señal
y `dev_id` cuando la entidad resuelve a un dev real, para que TODA lectura de métricas filtre lo
sintético y atribuya lo real.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Optional, Set

_TEST_VISITOR = re.compile(r"(?i)e2e|_test|^test|\btest\b|demo|seed|smoke|dummy|fixture")


def es_visitor_prueba(visitor_id: Any) -> bool:
    return bool(_TEST_VISITOR.search(str(visitor_id or "")))


async def _dev_ids_reales(db) -> Set[str]:
    return {d["id"] async for d in db.developments.find({}, {"_id": 0, "id": 1})}


async def resolver_dev(db, ref: Any, reales: Optional[Set[str]] = None) -> Optional[str]:
    """entity_id/slug/nombre → dev_id real, o None si no existe (seed/borrado)."""
    if not ref:
        return None
    reales = reales if reales is not None else await _dev_ids_reales(db)
    if ref in reales:
        return ref
    # ¿un slug o nombre que matchee un dev real?
    d = await db.developments.find_one(
        {"$or": [{"slug": ref}, {"colonia_id": ref}]}, {"_id": 0, "id": 1})
    return d["id"] if d and d["id"] in reales else None


async def marcar_env(db) -> Dict[str, Any]:
    """Backfill: marca env='demo' (tráfico sintético/seed/borrado) o 'real' en las colecciones de
    demanda, y estampa dev_id en las señales cuya entidad es un dev real. Idempotente."""
    reales = await _dev_ids_reales(db)
    res: Dict[str, Any] = {}
    # 1) atribuye dev_id donde la entidad es un dev real (SOLO dev_id, sin tocar env todavía)
    r4 = await db.buyer_signals.update_many(
        {"entity_id": {"$in": list(reales)}}, [{"$set": {"dev_id": "$entity_id"}}])
    # 2) demo GANA: entity no-real O visitor de prueba (después del dev_id, para que el demo pise)
    r1 = await db.buyer_signals.update_many({"entity_id": {"$nin": list(reales)}}, {"$set": {"env": "demo"}})
    r2 = await db.buyer_signals.update_many({"visitor_id": {"$regex": _TEST_VISITOR.pattern, "$options": "i"}},
                                            {"$set": {"env": "demo"}})
    # 3) el resto (con dev_id real y visitor no-prueba) = real
    r3 = await db.buyer_signals.update_many({"env": {"$exists": False}}, {"$set": {"env": "real"}})
    res["buyer_signals"] = {"demo": r1.modified_count + r2.modified_count, "real": r3.modified_count,
                            "dev_id_atribuido": r4.modified_count}
    # demand_atoms + leads: demo por visitor de prueba (o sin visitor real)
    for coll in ("demand_atoms", "leads"):
        rd = await db[coll].update_many({"visitor_id": {"$regex": _TEST_VISITOR.pattern, "$options": "i"}},
                                        {"$set": {"env": "demo"}})
        rr = await db[coll].update_many({"env": {"$exists": False}}, {"$set": {"env": "real"}})
        res[coll] = {"demo": rd.modified_count, "real": rr.modified_count}
    return res
