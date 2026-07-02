"""W6 seed · gov_data_mx.

Seeds 6 API sources cache entries + 6 parser cron entries + 5 admin uploads
+ 1 successful run per cron type.

Usage:
    python backend/scripts/seed_w6_gov_data_mx.py [--clean]
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

try:
    from dotenv import load_dotenv  # noqa: E402
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
except ImportError:
    pass

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "desarrollosmx")

SEED_FLAG = "_seed_synthetic"

API_SOURCES = [
    ("inegi_denue", {"negocios_total": 12450, "zona": "polanco", "categorias": 18}),
    ("banxico_sie", {"tiie_28d": 11.25, "inpc_anual": 4.8, "usd_mxn": 17.42}),
    ("datamexico_se", {"pib_estatal_cdmx_mdp": 4_120_000, "tasa_desempleo_pct": 3.4}),
    ("conavi_vivienda", {"creditos_federales_2026": 312_000, "subsidios_mdp": 8_400}),
    ("sesnsp_delitos", {"robo_casa_habitacion_mes": 412, "homicidio_doloso_mes": 87}),
    ("cenapred_atlas", {"riesgo_sismico": "B", "riesgo_inundacion": "C"}),
]
PARSER_SOURCES = [
    "notarias_cnnym_parser", "rpp_cdmx_parser", "catastro_miguel_hidalgo_parser",
    "catastro_cuauhtemoc_parser", "shf_reportes_parser", "bmv_fibras_local_parser",
]
UPLOAD_SOURCES = [
    "notarias_cnnym", "rpp_cdmx", "catastro_miguel_hidalgo",
    "shf_reportes", "bmv_fibras_local",
]


def _now():
    return datetime.now(timezone.utc)


async def run_seed(db) -> dict:
    cache_upserts = 0
    upload_inserts = 0
    upload_skipped = 0
    runs_upserts = 0
    now = _now()
    ttl = (now + timedelta(days=14)).isoformat()

    # 1. API + parser source cache entries
    for source_id, payload in API_SOURCES:
        doc = {
            "source_id": source_id,
            "fetched_at": now.isoformat(),
            "expires_at": ttl,
            "payload": payload,
            "status": "ok",
            "error": None,
            "http_status": 200,
            SEED_FLAG: True,
        }
        await db.gov_data_mx_cache.update_one({"source_id": source_id}, {"$set": doc}, upsert=True)
        cache_upserts += 1

    for parser_id in PARSER_SOURCES:
        doc = {
            "source_id": parser_id,
            "fetched_at": now.isoformat(),
            "expires_at": ttl,
            "payload": {"records_parsed": 1240, "errors": 3, "last_run_ok": True},
            "status": "ok",
            "error": None,
            "http_status": None,
            SEED_FLAG: True,
        }
        await db.gov_data_mx_cache.update_one({"source_id": parser_id}, {"$set": doc}, upsert=True)
        cache_upserts += 1

    # 2. Admin uploads
    for i, label in enumerate(UPLOAD_SOURCES):
        upload_id = f"seed-w6-gov-upl-{i:03d}"
        existing = await db.gov_data_mx_uploads.find_one({"upload_id": upload_id}, {"_id": 1})
        if existing:
            upload_skipped += 1
            continue
        ext = ["csv", "xlsx", "pdf"][i % 3]
        doc = {
            "upload_id": upload_id,
            "source_label": label,
            "filename": f"{label}_{i:03d}.{ext}",
            "mime_type": {"csv": "text/csv", "xlsx": "application/vnd.openxmlformats", "pdf": "application/pdf"}[ext],
            "size_bytes": 1024 * (50 + i * 25),
            "uploaded_at": now.isoformat(),
            "uploaded_by": "seed-script",
            "deleted": False,
            "notes": f"Synthetic upload mock {label}",
            SEED_FLAG: True,
        }
        await db.gov_data_mx_uploads.insert_one(doc)
        upload_inserts += 1

    # 3. Cron runs · one last successful run per cron type
    for cron_type in ["api_fetch", "parser_fetch", "upload_index"]:
        run_doc = {
            "run_id": f"seed-w6-gov-run-{cron_type}",
            "cron_type": cron_type,
            "started_at": (now - timedelta(hours=2)).isoformat(),
            "finished_at": (now - timedelta(hours=1, minutes=45)).isoformat(),
            "status": "ok",
            "items_processed": 12,
            "errors": 0,
            SEED_FLAG: True,
        }
        await db.gov_data_mx_runs.update_one({"run_id": run_doc["run_id"]}, {"$set": run_doc}, upsert=True)
        runs_upserts += 1

    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "seed-script", "role": "system"},
            action="seed.w6.gov_data_mx",
            entity_type="seed_batch",
            entity_id=f"gov-{_now().isoformat()}",
            before=None,
            after={"cache_upserts": cache_upserts, "uploads_inserted": upload_inserts,
                   "uploads_skipped": upload_skipped, "runs_upserts": runs_upserts},
        )
    except Exception as exc:
        print(f"  [warn] audit log skipped: {exc}")

    return {"cache_upserts": cache_upserts, "uploads_inserted": upload_inserts,
            "uploads_skipped": upload_skipped, "runs_upserts": runs_upserts}


async def run_clean(db) -> dict:
    c = await db.gov_data_mx_cache.delete_many({SEED_FLAG: True})
    u = await db.gov_data_mx_uploads.delete_many({SEED_FLAG: True})
    r = await db.gov_data_mx_runs.delete_many({SEED_FLAG: True})
    return {"cache_deleted": c.deleted_count, "uploads_deleted": u.deleted_count,
            "runs_deleted": r.deleted_count}


async def main():
    parser = argparse.ArgumentParser(description="Seed W6 gov_data_mx")
    parser.add_argument("--clean", action="store_true")
    args = parser.parse_args()

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    if args.clean:
        print("Cleaning W6 gov_data_mx seeds...")
        res = await run_clean(db)
        print(f"  cleaned: {res}")
    else:
        print("Seeding W6 gov_data_mx...")
        res = await run_seed(db)
        print(f"  done: {res}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
