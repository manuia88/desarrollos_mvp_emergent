"""OLEADA 1 · backfill de db.transactions desde data de mercado REAL (auditoría 07-08).

transactions tenía 1 doc → toda la cadena de valuación (hedónico 730 modelos apagados → AVM → fraude →
forecast → DRPI → FSD → auditoría) corría en fallback. Combustible REAL disponible:
  · 250 units ingeridos con precio+m² (precios de desarrollador = mercado primario)
  · 212 cierres históricos DECA con precio+colonia (ventas reales cerradas 2019-2025)

Se ingieren como transactions (source=bulk_ingest, confidence 65) vía ingest_transaction (anonimiza,
deriva descuento, geo). Idempotente por (source, zone_id, closing_price, unit ref). NO fabrica data:
convierte precios reales ya capturados a la forma que consume el motor hedónico.
"""
import asyncio
import os

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv(".env.local", override=True)

from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    db = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))["desarrollosmx"]
    from transaction_network_engine import ingest_transaction

    # dedup: marca de origen para no re-insertar (borra los previos de esta fuente y re-crea limpio)
    await db.transactions.delete_many({"source": "bulk_ingest", "_backfill": True})

    ins = 0
    # (1) units ingeridos (precio + m² + features) → tx con zone_id = colonia del dev
    devs = {d["id"]: d async for d in db.developments.find(
        {"source": "bulk_ingest"}, {"_id": 0, "id": 1, "colonia_id": 1, "lat": 1, "lng": 1})}
    async for u in db.units.find(
            {"development_id": {"$in": list(devs)}, "price_mxn": {"$gt": 0}}, {"_id": 0}):
        dev = devs.get(u.get("development_id")) or {}
        zone = dev.get("colonia_id")
        m2 = u.get("size_m2_total") or u.get("size_m2")
        if not zone or not m2:
            continue
        raw = {
            "zone_id": zone, "closing_price_mxn": u.get("price_mxn"),
            "listed_price_mxn": u.get("price_mxn"),
            "property_type": ("casa" if "casa" in str(u.get("type") or u.get("prototype") or "").lower() else "depto"),
            "m2": m2, "recamaras": u.get("bedrooms"), "baños": u.get("bathrooms"),
            "lat": dev.get("lat"), "lng": dev.get("lng"),
            "status_hint": u.get("status"), "tier": "colonia", "_backfill": True,
        }
        try:
            await ingest_transaction(db, raw, source="bulk_ingest")
            ins += 1
        except Exception:  # noqa: BLE001
            continue

    # (2) cierres históricos DECA (precio + colonia + fecha real; sin m², zone-level) → tx
    async for s in db.lista_snapshots.find(
            {"retro": True, "colonia_id": {"$ne": None}}, {"_id": 0, "colonia_id": 1, "fecha": 1, "units": 1, "lat": 1, "lng": 1}):
        for u in s.get("units", []):
            if not u.get("price"):
                continue
            raw = {
                "zone_id": s["colonia_id"], "closing_price_mxn": u.get("price"),
                "property_type": ("casa" if "casa" in str(u.get("unit_number") or "").lower() else "depto"),
                "lat": s.get("lat"), "lng": s.get("lng"),
                "closed_at": s.get("fecha"), "tier": "colonia", "_backfill": True, "_retro": True,
            }
            try:
                await ingest_transaction(db, raw, source="bulk_ingest")
                ins += 1
            except Exception:  # noqa: BLE001
                continue

    total = await db.transactions.count_documents({})
    print(f"transactions insertadas: {ins} · total en DB: {total}")
    # distribución por zona (para saber cuáles llegan a MIN_SAMPLE_SIZE=30 del hedónico)
    from collections import Counter
    zc = Counter()
    async for t in db.transactions.find({}, {"_id": 0, "zone_id": 1}):
        zc[t.get("zone_id")] += 1
    con30 = [z for z, n in zc.items() if n >= 30]
    print(f"zonas con ≥30 tx (hedónico entrenable): {len(con30)} · top: {zc.most_common(6)}")

asyncio.run(main())
