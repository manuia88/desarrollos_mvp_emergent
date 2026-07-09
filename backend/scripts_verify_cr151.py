"""Verificación fresca de Casa Roma 151 (rentas + balcón) — fondo real, sin timeout."""
import asyncio
import os
import secrets
from datetime import datetime, timezone

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv(".env.local", override=True)

from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    db = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))["desarrollosmx"]
    import bulk_ingest_engine as bie
    now = datetime.now(timezone.utc).isoformat()
    jid = f"bij_cr151_{secrets.token_urlsafe(6)}"
    await db.bulk_ingest_jobs.insert_one({
        "id": jid, "drive_folder_url": "https://drive.google.com/drive/folders/1urTqVT6cw89b-CDVD4SfSktxbHch2y9K",
        "target_dev_org_id": None, "dry_run": True, "only_project": "casa roma 151", "status": "pending",
        "max_mxn": 20.0, "items_total": 0, "items_auto_approved": 0, "items_pending_review": 0,
        "items_rejected": 0, "items_failed": 0, "started_at": now})
    await bie.run(db, jid)
    async for it in db.bulk_ingest_items.find({"job_id": jid}, {"_id": 0}):
        ex = it.get("extracted") or {}
        us = ex.get("units") or []
        rentas = [(u["unit_number"], u.get("_precio_sospechoso_renta")) for u in us if u.get("_precio_sospechoso_renta")]
        bal = [(u["unit_number"], u.get("m2_balcony"), u.get("size_m2_total")) for u in us
               if u.get("m2_balcony") and u.get("size_m2_total") and u["m2_balcony"] >= u["size_m2_total"] * 0.95]
        conp = sum(1 for u in us if u.get("price_mxn"))
        print(f"[cr151] units={len(us)} precio={conp} · rentas marcadas={rentas or 'ninguna'} · balcón≥total={bal or 'ninguno'} · ${float(it.get('ai_cost_mxn') or 0):.2f}", flush=True)

asyncio.run(main())
