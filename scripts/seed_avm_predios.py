#!/usr/bin/env python3
"""SEED AVM PREDIOS — materializa el AVM de MERCADO $/m² por predio en db.avm_predios.

Recorre db.catastro_predios en batch, corre avm_predios_engine.avm_predio(pred) por cada uno,
y upserta un doc ligero por predio en la colección materializada db.avm_predios:

    {predio_id, colonia_id, geo, avm_m2, fuente, confianza, es_estimado, factor_predio,
     avm_m2_colonia, sup_construccion, sup_terreno, alcaldia, updated_at}

El endpoint /api/mapa/colonia/{id}/predios-avm lee ESTA colección (rápido, ya calculado).

⚠️ NO corre 1.08M en la prueba. Por defecto siembra UNA colonia de muestra (Condesa, con
market_comps real + ~1,324 predios). El batch FULL es un comando documentado (costoso).

Uso:
  # prueba (default): siembra la colonia de muestra
  scripts/.venv/bin/python3 scripts/seed_avm_predios.py

  # una colonia específica (por su id/slug IECM, == colonias.id == catastro_predios.colonia_iecm)
  scripts/.venv/bin/python3 scripts/seed_avm_predios.py --colonia hipodromo-condesa-cuauhtemoc

  # una alcaldía completa
  scripts/.venv/bin/python3 scripts/seed_avm_predios.py --alcaldia "Cuauhtémoc"

  # BATCH FULL 1.08M — COSTOSO, correr a conciencia (idempotente, upsert por predio_id):
  scripts/.venv/bin/python3 scripts/seed_avm_predios.py --full
"""
import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
os.chdir(os.path.join(os.path.dirname(__file__), "..", "backend"))
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from avm_predios_engine import avm_predio, ColoniaAvmCache  # noqa: E402

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "desarrollosmx")

# colonia de muestra (Condesa: tiene market_comps real + ~1,324 predios cruzados).
SAMPLE_COLONIA = "condesa-cuauhtemoc"

PROJ = {
    "_id": 0, "catastro_id": 1, "colonia_iecm": 1, "geo": 1, "alcaldia": 1,
    "valor_suelo": 1, "valor_unitario_suelo": 1, "sup_construccion": 1, "sup_terreno": 1,
}


async def _ensure_indexes(db):
    await db.avm_predios.create_index("predio_id", unique=True)
    await db.avm_predios.create_index("colonia_id")
    await db.avm_predios.create_index([("geo", "2dsphere")])


async def seed(db, query: dict, label: str, batch: int = 2000) -> int:
    cache = ColoniaAvmCache(db)   # una sola caché de colonia por corrida
    total = await db.catastro_predios.count_documents(query)
    print(f"[seed] {label}: {total:,} predios a materializar → db.avm_predios")
    if total == 0:
        print("[seed] nada que sembrar (revisa el filtro).")
        return 0

    ops, n, con_avm = [], 0, 0
    from pymongo import UpdateOne
    cur = db.catastro_predios.find(query, PROJ)
    async for p in cur:
        r = await avm_predio(db, p, cache)
        doc = {
            "predio_id": p.get("catastro_id"),
            "colonia_id": r.get("colonia_id"),
            "geo": p.get("geo"),
            "avm_m2": r.get("avm_m2"),
            "fuente": r.get("fuente"),
            "confianza": r.get("confianza"),
            "es_estimado": r.get("es_estimado"),
            "factor_predio": r.get("factor_predio"),
            "avm_m2_colonia": r.get("avm_m2_colonia"),
            "sup_construccion": p.get("sup_construccion"),
            "sup_terreno": p.get("sup_terreno"),
            "alcaldia": p.get("alcaldia"),
            "updated_at": datetime.now(timezone.utc),
        }
        if r.get("avm_m2"):
            con_avm += 1
        ops.append(UpdateOne({"predio_id": doc["predio_id"]}, {"$set": doc}, upsert=True))
        if len(ops) >= batch:
            await db.avm_predios.bulk_write(ops, ordered=False)
            n += len(ops)
            ops = []
            print(f"[seed]   … {n:,}/{total:,}")
    if ops:
        await db.avm_predios.bulk_write(ops, ordered=False)
        n += len(ops)
    print(f"[seed] ✅ {n:,} predios materializados · {con_avm:,} con avm_m2 "
          f"({round(100*con_avm/max(1,n))}%) · sin_dato={n-con_avm:,}")
    return n


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--colonia", help="id/slug IECM de la colonia (== colonias.id)")
    ap.add_argument("--alcaldia", help="nombre de alcaldía (ej. 'Cuauhtémoc')")
    ap.add_argument("--full", action="store_true", help="TODOS los 1.08M predios (COSTOSO)")
    args = ap.parse_args()

    db = AsyncIOMotorClient(MONGO_URL)[DB_NAME]
    await _ensure_indexes(db)

    if args.full:
        await seed(db, {"colonia_iecm": {"$exists": True}}, "BATCH FULL 1.08M")
    elif args.alcaldia:
        await seed(db, {"alcaldia": args.alcaldia}, f"alcaldía {args.alcaldia}")
    else:
        cid = args.colonia or SAMPLE_COLONIA
        await seed(db, {"colonia_iecm": cid}, f"colonia de muestra {cid}")


if __name__ == "__main__":
    asyncio.run(main())
