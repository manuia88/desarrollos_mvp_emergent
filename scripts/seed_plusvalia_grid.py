"""
Seed · plusvalia_grid (PLUSVALÍA HIPER-SEGMENTADA)
==================================================
Siembra la colección `plusvalia_grid` (un doc por celda métrica×dimensión, patrón grid_engine).
Cada celda = colonia × atributo × tipo(price-tier), con la plusvalía anual esperada:

  valor_pct = factor_shf (base de la alcaldía, shf_engine) × (1 + ajuste_hedonico/100)

Se siembran las colonias que tienen hedónico (dmx_units con n≥umbral) × atributos principales
(roof/terraza/estacionamiento/balcon/bodega) + la celda base sin atributo.

REUSA backend/plusvalia_grid_engine.seed_grid (que a su vez orquesta shf_engine + dmx_hedonic_atom).
NO inventa: cada celda va marcada con base/factor_shf/ajuste_hedonico/es_estimado/fuente/confianza/n.

Idempotente (upsert por _id de celda). Fail-soft por celda.

Uso (desde la raíz del repo):
  scripts/.venv/bin/python3 scripts/seed_plusvalia_grid.py
  scripts/.venv/bin/python3 scripts/seed_plusvalia_grid.py --tiers        # además segmenta por price-tier
  scripts/.venv/bin/python3 scripts/seed_plusvalia_grid.py --limit 3      # solo N colonias (prueba)
  scripts/.venv/bin/python3 scripts/seed_plusvalia_grid.py --clean        # vaciar la colección
"""
import argparse
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
    import plusvalia_grid_engine as pg
    r = await db[pg.COLLECTION].delete_many({})
    print(f"Limpiado: {r.deleted_count} docs de {pg.COLLECTION}.")


async def seed(db, with_tiers: bool = False, limit: int = 0):
    import plusvalia_grid_engine as pg

    # Índice de lectura por colonia (idempotente).
    try:
        await db[pg.COLLECTION].create_index("colonia_id")
        await db[pg.COLLECTION].create_index([("colonia_id", 1), ("atributo", 1), ("tipo", 1)])
    except Exception as e:
        print(f"[aviso] índice: {e}")

    cols = await pg.colonias_con_hedonico(db)
    if limit:
        cols = cols[:limit]
    if not cols:
        print("No hay colonias con hedónico (dmx_units vacío) — nada que sembrar.")
        return

    tipos = [None]
    if with_tiers:
        tipos = [None] + list(pg.PRICE_TIER_KEYS)

    sembradas = 0
    for c in cols:
        cid = c["colonia_id"]
        for tipo in tipos:
            for attr in [None] + list(pg.ATRIBUTOS_PRINCIPALES):
                try:
                    doc = await pg.upsert_cell(db, cid, attr, tipo)
                    if doc:
                        sembradas += 1
                except Exception as e:
                    print(f"[fail-soft] {cid}/{attr}/{tipo}: {e}")
        print(f"  · {cid} ({c.get('name')}) — n_átomo={c.get('n')} — celdas hasta ahora: {sembradas}")

    print("─" * 60)
    print(f"Colonias sembradas : {len(cols)}")
    print(f"Atributos          : base + {pg.ATRIBUTOS_PRINCIPALES}")
    print(f"Tipos (price-tier) : {tipos}")
    print(f"Celdas materializadas en {pg.COLLECTION}: {sembradas}")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clean", action="store_true", help="Vaciar la colección y salir.")
    ap.add_argument("--tiers", action="store_true", help="Segmentar también por price-tier.")
    ap.add_argument("--limit", type=int, default=0, help="Solo N colonias (prueba).")
    args = ap.parse_args()

    cli, db = await _db()
    try:
        if args.clean:
            await clean(db)
            return
        await seed(db, with_tiers=args.tiers, limit=args.limit)
    finally:
        cli.close()


if __name__ == "__main__":
    asyncio.run(main())
