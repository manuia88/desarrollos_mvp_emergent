"""Migración one-shot: backfill del vocabulario CANÓNICO en las unidades ya ingeridas (db.units source bulk_ingest*).

Las unidades ingeridas antes de la auditoría 07-07 quedaron solo con nombres legacy (price_mxn / size_m2 / status en
inglés). El front + los filtros del marketplace + la semilla esperan el canónico (price / m2_total / m2_privative /
parking_spots / bodega / status en español). Este script las normaliza IN-PLACE, sin re-ingerir. Idempotente.

Uso:  ../scripts/.venv/bin/python migrations/backfill_ingested_units.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from ingested_reader import normalize_unit  # noqa: E402


async def main():
    db = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017")).desarrollosmx
    q = {"source": {"$in": ["bulk_ingest", "bulk_ingest_merge"]}}
    total = await db.units.count_documents(q)
    updated = 0
    async for u in db.units.find(q):
        n = normalize_unit(u)
        patch = {
            "price": n.get("price"),
            "price_display": n.get("price_display"),
            "m2_total": n.get("m2_total"),
            "m2_privative": n.get("m2_privative"),
            "parking_spots": n.get("parking_spots"),
            "bodega": n.get("bodega"),
            "prototype": n.get("prototype"),
            "status": n.get("status"),
        }
        # solo escribe lo que cambia (idempotente)
        diff = {k: v for k, v in patch.items() if u.get(k) != v}
        if diff:
            await db.units.update_one({"id": u["id"]}, {"$set": diff})
            updated += 1
    print(f"[backfill] unidades ingeridas: {total} · actualizadas: {updated}")

    # verificación
    ok_price = await db.units.count_documents({**q, "price": {"$ne": None}})
    ok_dispo = await db.units.count_documents({**q, "status": "disponible"})
    print(f"[verify] con price canónico: {ok_price}/{total} · status 'disponible': {ok_dispo}")


if __name__ == "__main__":
    asyncio.run(main())
