"""BACKFILL de los snapshots retro DECA ya minados (aprobado founder 07-08).

Los 13 snapshots minados quedaron SIN colonia_id (los comparables de zona no se ligaron) y sin eventos
delta (esa fase se cortó por timeout). Este script, SIN LLM (solo geocoding barato + diffs en DB):
  1. resuelve colonia_id de cada snapshot por geocoding del nombre (calle) → colonia más cercana,
  2. crea el comparable de zona (dev_competitor_price_snapshots) para battle cards,
  3. deriva los eventos delta (price_events + unit_status_events) entre snapshots del MISMO dev.
Idempotente.
"""
import asyncio
import os
import re

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv(".env.local", override=True)

from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    db = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))["desarrollosmx"]
    import bulk_ingest_engine as bie
    from geocode_engine import geocode
    from estudio_mercado_engine import colonias_en_radio

    snaps = [s async for s in db.lista_snapshots.find({"retro": True}, {"_id": 0})]
    ligados = comparables = 0
    for s in snaps:
        if s.get("colonia_id"):
            continue
        # nombre del dev = calle + número (Tajín 328, Bolívar 577) → geocode a CDMX → colonia cercana
        nombre = re.sub(r"\(.*?\)", "", s.get("dev_name") or "").strip()
        addr = s.get("address") or f"{nombre}, Ciudad de México"
        lat, lng = await geocode(addr, s.get("colonia_raw"), s.get("alcaldia") or "Benito Juárez")
        if lat is None:
            print(f"  ⚠ sin geo: {nombre}")
            continue
        near = await colonias_en_radio(db, lat, lng, 1200)
        if not near:
            continue
        col = near[0]
        await db.lista_snapshots.update_one({"file_id": s["file_id"]},
            {"$set": {"colonia_id": col.get("id"), "colonia_geo": col.get("name"), "lat": lat, "lng": lng}})
        ligados += 1
        # comparable de zona (para battle cards) si hay $/m² mediano
        if s.get("price_m2_median"):
            ya = await db.dev_competitor_price_snapshots.find_one({"source": "retro_lista", "file_id": s["file_id"]})
            if not ya:
                await db.dev_competitor_price_snapshots.insert_one({
                    "project_name": s.get("dev_name"), "colonia_id": col.get("id"), "zone_id": col.get("id"),
                    "price_m2_median": s["price_m2_median"],
                    "units_available": sum(1 for u in (s.get("units") or []) if u.get("status") == "disponible"),
                    "cerrado": s.get("cerrado", True), "ts": s.get("fecha"), "file_id": s["file_id"],
                    "source": "retro_lista"})
                comparables += 1
        print(f"  ✓ {nombre[:24]:<24} → {col.get('name')} ({col.get('id')})")

    # eventos delta entre snapshots del MISMO dev (cronológico)
    from collections import defaultdict
    por_dev = defaultdict(list)
    for s in [s async for s in db.lista_snapshots.find({"retro": True}, {"_id": 0})]:
        por_dev[re.sub(r"\(.*?\)|\d+", "", s.get("dev_name") or "").strip().lower()].append(s)
    eventos = 0
    for k, ss in por_dev.items():
        if len(ss) < 2:
            continue
        ss.sort(key=lambda x: x.get("fecha") or "")
        for prev, cur in zip(ss, ss[1:]):
            pu = {bie._unit_identity(u["unit_number"]): u for u in prev["units"] if u.get("unit_number")}
            cu = {bie._unit_identity(u["unit_number"]): u for u in cur["units"] if u.get("unit_number")}
            dev_id = cur.get("dev_id") or cur.get("dev_name")
            for uk, p in pu.items():
                c = cu.get(uk)
                if c and p.get("price") and c.get("price") and p["price"] != c["price"]:
                    if not await db.price_events.find_one({"dev_id": dev_id, "unit_number": p["unit_number"],
                                                           "changed_at": cur["fecha"], "source": "retro_lista"}):
                        await db.price_events.insert_one({
                            "dev_id": dev_id, "unit_number": p["unit_number"], "old_price": p["price"],
                            "new_price": c["price"], "delta_pct": round((c["price"] / p["price"] - 1) * 100, 2),
                            "changed_at": cur["fecha"], "source": "retro_lista",
                            "label": f"Δ {prev.get('fecha')}→{cur.get('fecha')}"})
                        eventos += 1

    print(f"\nBACKFILL: {ligados} snapshots ligados a colonia · {comparables} comparables de zona · {eventos} eventos delta")

asyncio.run(main())
