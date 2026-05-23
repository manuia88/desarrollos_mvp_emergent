"""W6 seed · Quick Wins (W6.5 templates + W6.11 insights courses/factcheck).

W6.5: 5 projects con is_template=True + 8 entries con duplicated_from
W6.11: 5 insights_courses + 10 insights_factcheck_cache entries

Usage:
    python backend/scripts/seed_w6_quick_wins.py [--clean]
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import os
import random
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
TPL_PREFIX = "seed-w6-tpl-"
DUP_PREFIX = "seed-w6-dup-"
COURSE_PREFIX = "seed-w6-course-"
FC_PREFIX = "seed-w6-fc-"

TEMPLATE_NAMES = [
    "Plantilla Boutique Polanco",
    "Plantilla Family Coyoacán",
    "Plantilla Investor Santa Fe",
    "Plantilla First-Home Doctores",
    "Plantilla Luxury Lomas",
]
COURSES = [
    ("Inversión CDMX 101", "inversion-cdmx-101"),
    ("Forecast residencial 2027", "forecast-residencial-2027"),
    ("AVM CDMX y cómo leer comps", "avm-cdmx-leer-comps"),
    ("Construction Quality Index", "construction-quality-index"),
    ("Marketing MCP para asesores", "marketing-mcp-asesores"),
]
FC_CLAIMS = [
    ("Polanco subió 8% YoY 2025", "https://inegi.org.mx/datos-cdmx", "verified"),
    ("Tasa absorción Roma Norte 11 meses", "https://banxico.org.mx/sie", "verified"),
    ("CDMX tiene 12000 unidades nuevas 2026", "https://datamexico.org", "disputed"),
    ("INPC vivienda CDMX 5.2% 2025", "https://inegi.org.mx/inpc", "verified"),
    ("Santa Fe oferta supera demanda 30%", "https://reportes-internos.dmx", "disputed"),
    ("Tasa hipoteca BBVA bajará Q3 2026", "https://bbva.mx/research", "unverified"),
    ("Coyoacán nuevos desarrollos +18%", "https://datamexico.org/coyoacan", "verified"),
    ("Cuauhtémoc obra detenida por sismos", "https://gobcdmx/proteccion-civil", "disputed"),
    ("Plusvalía Anzures 14% 5 años", "https://siap.gob.mx", "verified"),
    ("Inversionistas extranjeros +25% en 2026", "https://amexcap.org/reportes", "unverified"),
]


def _now():
    return datetime.now(timezone.utc)


def _hash(claim: str, url: str) -> str:
    return hashlib.sha256(f"{claim}|{url}".encode()).hexdigest()[:32]


async def run_seed(db) -> dict:
    tpl_upserts = 0
    dup_inserts = 0
    dup_skipped = 0
    course_inserts = 0
    course_skipped = 0
    fc_upserts = 0

    # 1. Template projects
    for i, name in enumerate(TEMPLATE_NAMES):
        rng = random.Random(TPL_PREFIX + str(i))
        pid = f"{TPL_PREFIX}{i:03d}"
        doc = {
            "id": pid,
            "name": name,
            "is_template": True,
            "zone": rng.choice(["Polanco", "Coyoacán", "Santa Fe", "Doctores", "Lomas"]),
            "publish_state": "template",
            "total_units": rng.randint(40, 120),
            "units_sold_count": 0,
            "price_min_mxn": rng.randint(3_000_000, 6_000_000),
            "price_max_mxn": rng.randint(7_000_000, 14_000_000),
            "created_at": _now().isoformat(),
            "updated_at": _now().isoformat(),
            SEED_FLAG: True,
        }
        await db.projects.update_one({"id": pid}, {"$set": doc}, upsert=True)
        tpl_upserts += 1

    # 2. Duplicate history (8 entries · cada uno from un template)
    rng_dup = random.Random("w6-dup")
    for j in range(8):
        dup_id = f"{DUP_PREFIX}{j:03d}"
        existing = await db.projects.find_one({"id": dup_id}, {"_id": 1})
        if existing:
            dup_skipped += 1
            continue
        source_id = f"{TPL_PREFIX}{j % len(TEMPLATE_NAMES):03d}"
        await db.projects.insert_one({
            "id": dup_id,
            "name": f"Duplicado {j:03d}",
            "is_template": False,
            "publish_state": "draft",
            "duplicated_from": {
                "source_id": source_id,
                "source_collection": "projects",
                "at": _now().isoformat(),
            },
            "units_sold_count": 0,
            "units_reserved_count": 0,
            "leads_active": 0,
            "leads_30d": 0,
            "created_at": _now().isoformat(),
            SEED_FLAG: True,
        })
        dup_inserts += 1

    # 3. Insights courses
    for k, (title, slug) in enumerate(COURSES):
        cid = f"{COURSE_PREFIX}{k:03d}"
        existing = await db.insights_courses.find_one({"slug": slug}, {"_id": 1})
        if existing:
            course_skipped += 1
            continue
        rng = random.Random(slug)
        n_lessons = rng.randint(3, 5)
        lessons = [{"id": f"{slug}-l{i}", "title": f"Lección {i + 1}",
                    "content": f"Contenido educativo sintético lección {i + 1}",
                    "duration_min": rng.randint(5, 15)} for i in range(n_lessons)]
        await db.insights_courses.insert_one({
            "id": cid,
            "slug": slug,
            "title": title,
            "description": f"Curso sintético: {title}",
            "lessons": lessons,
            "lessons_count": len(lessons),
            "source_urls": ["https://inegi.org.mx", "https://banxico.org.mx"],
            "published": True,
            "created_at": _now().isoformat(),
            "updated_at": _now().isoformat(),
            "created_by": "seed-script",
            SEED_FLAG: True,
        })
        course_inserts += 1

    # 4. Factcheck cache · 10 entries with verdict mix
    for m, (claim, url, verdict) in enumerate(FC_CLAIMS):
        confidence = {"verified": 85, "disputed": 50, "unverified": 25}[verdict]
        key = _hash(claim, url)
        doc = {
            "cache_key": key,
            "claim": claim,
            "source_url": url,
            "result": {
                "verdict": verdict,
                "confidence": confidence,
                "rationale": f"Verdict sintético {verdict} para claim seeded",
                "sources_consulted": [url],
            },
            "fetched_at": _now().isoformat(),
            "expires_at": (_now() + timedelta(days=30)).isoformat(),
            SEED_FLAG: True,
        }
        await db.insights_factcheck_cache.update_one({"cache_key": key}, {"$set": doc}, upsert=True)
        fc_upserts += 1

    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "seed-script", "role": "system"},
            action="seed.w6.quick_wins",
            entity_type="seed_batch",
            entity_id=f"qw-{_now().isoformat()}",
            before=None,
            after={"templates_upserts": tpl_upserts, "duplicates_inserts": dup_inserts,
                   "courses_inserts": course_inserts, "factcheck_upserts": fc_upserts},
        )
    except Exception as exc:
        print(f"  [warn] audit log skipped: {exc}")

    return {"templates_upserts": tpl_upserts, "duplicates_inserts": dup_inserts,
            "duplicates_skipped": dup_skipped, "courses_inserts": course_inserts,
            "courses_skipped": course_skipped, "factcheck_upserts": fc_upserts}


async def run_clean(db) -> dict:
    t = await db.projects.delete_many({"id": {"$regex": f"^{TPL_PREFIX}"}})
    d = await db.projects.delete_many({"id": {"$regex": f"^{DUP_PREFIX}"}})
    c = await db.insights_courses.delete_many({SEED_FLAG: True})
    fc = await db.insights_factcheck_cache.delete_many({SEED_FLAG: True})
    return {"templates_deleted": t.deleted_count, "duplicates_deleted": d.deleted_count,
            "courses_deleted": c.deleted_count, "factcheck_deleted": fc.deleted_count}


async def main():
    parser = argparse.ArgumentParser(description="Seed W6 quick wins")
    parser.add_argument("--clean", action="store_true")
    args = parser.parse_args()

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    if args.clean:
        print("Cleaning W6 quick wins seeds...")
        res = await run_clean(db)
        print(f"  cleaned: {res}")
    else:
        print("Seeding W6 quick wins (templates + courses + factcheck)...")
        res = await run_seed(db)
        print(f"  done: {res}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
