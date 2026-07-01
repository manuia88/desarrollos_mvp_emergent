"""
Seed · colonia_valoracion (Fase 2 del mapa de valores)
======================================================
Siembra la colección `colonia_valoracion` (un doc por colonia) para las 1,811 colonias
con geometría. Cada doc trae:
  · market_m2  — precio de mercado $/m² (Monopolio → mini-AVM → catastro; con fuente+confianza)
  · valor_catastral_m2 — valor de suelo oficial SIGCDMX
  · plusvalia / alcaldia_plusvalia — serie anual DERIVADA del índice SHF de la alcaldía (es_estimado)

REUSA backend/colonia_valoracion_engine.upsert_valoracion (que a su vez reusa market_estimate_engine
+ shf_engine + catastro). NO inventa: todo va marcado con fuente/confianza/es_estimado.

Idempotente (upsert por colonia_id). Fail-soft por colonia (si una falla, sigue con las demás).

Uso (desde la raíz del repo):
  scripts/.venv/bin/python3 scripts/seed_colonia_valoracion.py
  scripts/.venv/bin/python3 scripts/seed_colonia_valoracion.py --limit 20   # prueba rápida
  scripts/.venv/bin/python3 scripts/seed_colonia_valoracion.py --clean       # vaciar la colección
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "desarrollosmx")


async def _db():
    cli = AsyncIOMotorClient(MONGO_URL)
    return cli, cli[DB_NAME]


async def clean(db):
    r = await db.colonia_valoracion.delete_many({})
    print(f"Limpiado: {r.deleted_count} docs de colonia_valoracion.")


async def seed(db, limit: int = 0):
    from colonia_valoracion_engine import upsert_valoracion

    # Índice para lectura por colonia_id (idempotente).
    try:
        await db.colonia_valoracion.create_index("colonia_id", unique=True)
    except Exception:
        pass

    cur = db.colonias.find({"geometry": {"$exists": True}}, {"_id": 0, "id": 1})
    ids = [c["id"] async for c in cur if c.get("id")]
    if limit:
        ids = ids[:limit]

    total = len(ids)
    print(f"Sembrando valoración para {total} colonias con geometría...")

    sembradas = con_market_real = con_market_est = 0
    con_plusvalia = con_plusvalia_propia = fallidas = 0

    for i, cid in enumerate(ids, 1):
        try:
            doc = await upsert_valoracion(db, cid)
        except Exception as e:
            fallidas += 1
            print(f"  ! {cid}: {str(e)[:100]}")
            continue
        if not doc:
            fallidas += 1
            continue
        sembradas += 1
        mk = doc.get("market_m2") or {}
        if mk.get("fuente") == "mercado":
            con_market_real += 1
        elif mk.get("valor") is not None:
            con_market_est += 1
        pv = doc.get("plusvalia") or {}
        if pv.get("series"):
            con_plusvalia += 1
        if (doc.get("alcaldia_plusvalia") or {}).get("es_propio"):
            con_plusvalia_propia += 1
        if i % 200 == 0:
            print(f"  ... {i}/{total}")

    print("─" * 60)
    print(f"Sembradas:                 {sembradas}/{total}")
    print(f"Fallidas (sin metadata):   {fallidas}")
    print(f"Market REAL (Monopolio):   {con_market_real}")
    print(f"Market ESTIMADO/catastro:  {con_market_est}")
    print(f"Con serie de plusvalía:    {con_plusvalia}")
    print(f"  · plusvalía de alcaldía PROPIA (5 SHF): {con_plusvalia_propia}")
    print(f"  · resto hereda CDMX estatal (es_estimado marcado)")
    print("─" * 60)
    n = await db.colonia_valoracion.count_documents({})
    print(f"Total en colonia_valoracion ahora: {n}")


async def main():
    args = sys.argv[1:]
    cli, db = await _db()
    try:
        if "--clean" in args:
            await clean(db)
            return
        limit = 0
        if "--limit" in args:
            limit = int(args[args.index("--limit") + 1])
        await seed(db, limit=limit)
    finally:
        cli.close()


if __name__ == "__main__":
    asyncio.run(main())
