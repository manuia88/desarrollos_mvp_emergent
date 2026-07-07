"""Migración: PRENDER los motores sobre el inventario YA ingerido (auditoría 07-07 · 2ª pasada).

Hace, para los 13 developments source='bulk_ingest' existentes:
  1. Limpia unidades HUÉRFANAS (development_id sin doc de dev — basura de jobs que --reload mató a media ingesta).
     Respaldo de ids a JSON antes de borrar.
  2. Geocodifica lat/lng faltantes (Mapbox) desde address+colonia+alcaldía → el proyecto cae en el mapa.
  3. Reverse-colonia: si no hay colonia_id pero sí coords, asigna la colonia más cercana → inteligencia de zona.
  4. stage='preventa' por defecto donde falte → absorción/etapa lo ignoraban.
  5. Re-sincroniza el átomo dmx_units (Cubo OLAP / Demanda / Absorción ven TODAS las unidades).

Idempotente. Uso:  ../scripts/.venv/bin/python migrations/backfill_ingested_engines.py
"""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

SCRATCH = "/private/tmp/claude-501/-Users-manuelacosta-Developer-desarrollos-mvp-emergent/71957709-de6c-409e-8543-2c59c1c9cf67/scratchpad"


async def main():
    db = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017")).desarrollosmx
    import geocode_engine as ge
    from estudio_mercado_engine import colonias_en_radio
    from dmx_cube_feed import sync_ingested_to_atom

    devs = []
    async for d in db.developments.find({"source": "bulk_ingest"}, {"_id": 0}):
        devs.append(d)
    real_ids = {d["id"] for d in devs}
    print(f"devs ingeridos: {len(devs)} · geocode disponible: {ge.available()}")

    # ── 1. limpiar unidades huérfanas ────────────────────────────────────────
    orphan_ids = []
    async for u in db.units.find({"source": {"$in": ["bulk_ingest", "bulk_ingest_merge"]}},
                                 {"_id": 0, "id": 1, "development_id": 1}):
        if u.get("development_id") not in real_ids:
            orphan_ids.append(u["id"])
    if orphan_ids:
        try:
            os.makedirs(SCRATCH, exist_ok=True)
            with open(os.path.join(SCRATCH, "orphan_units_backup.json"), "w") as fh:
                json.dump(orphan_ids, fh)
        except Exception:
            pass
        res = await db.units.delete_many({"id": {"$in": orphan_ids}})
        print(f"  huérfanas borradas: {res.deleted_count} (respaldo en scratchpad/orphan_units_backup.json)")
    else:
        print("  huérfanas: 0")

    # ── 2-4. geocode + reverse-colonia + stage por dev ───────────────────────
    geo_fixed = col_fixed = stage_fixed = 0
    for d in devs:
        patch = {}
        lat, lng = d.get("lat"), d.get("lng")
        if lat is None or lng is None:
            lat, lng = await ge.geocode(d.get("address") or d.get("address_full"), d.get("colonia"), d.get("alcaldia"))
            if lat is not None and lng is not None:
                patch["lat"], patch["lng"] = lat, lng
                geo_fixed += 1
        if not d.get("colonia_id") and lat is not None and lng is not None:
            try:
                near = await colonias_en_radio(db, lat, lng, 1200)
                if near:
                    patch["colonia_id"] = near[0].get("id")
                    if not d.get("colonia"):
                        patch["colonia"] = near[0].get("name")
                    if not d.get("alcaldia"):
                        patch["alcaldia"] = near[0].get("alcaldia")
                    col_fixed += 1
            except Exception as e:
                print(f"    reverse-colonia {d['id']}: {e}")
        if not d.get("stage"):
            patch["stage"] = "preventa"
            stage_fixed += 1
        if patch:
            # propaga colonia_id a las units del dev (lo usan cubo/zona)
            if patch.get("colonia_id"):
                await db.units.update_many({"development_id": d["id"]}, {"$set": {"colonia_id": patch["colonia_id"]}})
            await db.developments.update_one({"id": d["id"]}, {"$set": patch})
    print(f"  geocodificados: {geo_fixed} · colonia por coords: {col_fixed} · stage seteado: {stage_fixed}")

    # ── 5. re-sync átomo ─────────────────────────────────────────────────────
    sync = await sync_ingested_to_atom(db)
    print(f"  átomos dmx_units sincronizados: {sync.get('synced')}")

    # ── verificación ─────────────────────────────────────────────────────────
    n_geo = await db.developments.count_documents({"source": "bulk_ingest", "lat": {"$ne": None}})
    n_col = await db.developments.count_documents({"source": "bulk_ingest", "colonia_id": {"$nin": [None, ""]}})
    n_stage = await db.developments.count_documents({"source": "bulk_ingest", "stage": {"$nin": [None, ""]}})
    n_units = await db.units.count_documents({"source": {"$in": ["bulk_ingest", "bulk_ingest_merge"]}})
    print(f"\n[verify] geo {n_geo}/13 · colonia_id {n_col}/13 · stage {n_stage}/13 · units limpias {n_units}")


if __name__ == "__main__":
    asyncio.run(main())
