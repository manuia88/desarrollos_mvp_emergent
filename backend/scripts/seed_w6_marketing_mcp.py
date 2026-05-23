"""W6 seed · marketing_mcp.

Seeds 25 publishes 30d (10 Twitter · 6 LinkedIn · 5 Telegram · 4 Discord)
+ 3 scheduled pending. Status mix: 70% ok · 20% skipped · 10% error.

Usage:
    python backend/scripts/seed_w6_marketing_mcp.py [--count 25] [--clean]
"""
from __future__ import annotations

import argparse
import asyncio
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
LOG_PREFIX = "seed-w6-mkt-"
SCHED_PREFIX = "seed-w6-mkt-sched-"

PLATFORM_DIST = (["twitter"] * 10) + (["linkedin"] * 6) + (["telegram"] * 5) + (["discord"] * 4)

POST_TEMPLATES = [
    "Nuevo desarrollo en {z} · entrega 2027 · desde {p}M MXN",
    "Reporte: precios residenciales {z} suben +{x}% YoY",
    "AVM CDMX semana · {z} tasa absorción {y} meses",
    "Tour 3D nuevo proyecto {z} disponible ahora",
    "Lead segmentation insight: tier T1 buyers prefieren {z}",
]
ZONES = ["Polanco", "Roma Norte", "Condesa", "Santa Fe", "Coyoacán"]


def _now():
    return datetime.now(timezone.utc)


def _make_log_doc(idx: int, platform: str) -> dict:
    rng = random.Random(LOG_PREFIX + str(idx))
    status = rng.choices(["ok", "skipped", "error"], weights=[70, 20, 10])[0]
    zone = rng.choice(ZONES)
    content = rng.choice(POST_TEMPLATES).format(z=zone, p=rng.randint(3, 12),
                                                x=rng.randint(3, 18), y=rng.randint(6, 24))
    result = {
        "platform": platform,
        "status": status,
        "url": f"https://stub-{platform}.dmx/seed/{idx:04d}" if status == "ok" else None,
        "id": f"{platform}-stub-{idx:04d}" if status == "ok" else None,
        "error": "missing_api_key" if status == "skipped" else ("rate_limited" if status == "error" else None),
    }
    return {
        "record_id": f"{LOG_PREFIX}{idx:04d}",
        "content": content,
        "platforms": [platform],
        "results": [result],
        "created_at": (_now() - timedelta(days=rng.randint(0, 30), hours=rng.randint(0, 23))).isoformat(),
        "created_by": "seed-script",
        SEED_FLAG: True,
    }


async def run_seed(db, count: int) -> dict:
    inserted = 0
    skipped = 0
    by_platform = {"twitter": 0, "linkedin": 0, "telegram": 0, "discord": 0}
    by_status = {"ok": 0, "skipped": 0, "error": 0}

    plan = (PLATFORM_DIST * ((count // len(PLATFORM_DIST)) + 1))[:count]
    for i, platform in enumerate(plan):
        doc = _make_log_doc(i, platform)
        existing = await db.marketing_mcp_log.find_one({"record_id": doc["record_id"]}, {"_id": 1})
        if existing:
            skipped += 1
            continue
        await db.marketing_mcp_log.insert_one(doc)
        inserted += 1
        by_platform[platform] += 1
        by_status[doc["results"][0]["status"]] += 1

    # 3 scheduled pending
    sched_inserted = 0
    sched_skipped = 0
    for j in range(3):
        rng = random.Random(SCHED_PREFIX + str(j))
        sched_id = f"{SCHED_PREFIX}{j:03d}"
        existing = await db.marketing_mcp_scheduled.find_one({"scheduled_id": sched_id}, {"_id": 1})
        if existing:
            sched_skipped += 1
            continue
        await db.marketing_mcp_scheduled.insert_one({
            "scheduled_id": sched_id,
            "content": f"Programado synthetic #{j}: nuevo insight residencial CDMX",
            "platforms": [rng.choice(["twitter", "linkedin", "telegram"])],
            "scheduled_at": (_now() + timedelta(hours=2 + j * 6)).isoformat(),
            "status": "pending",
            "created_at": _now().isoformat(),
            "created_by": "seed-script",
            SEED_FLAG: True,
        })
        sched_inserted += 1

    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "seed-script", "role": "system"},
            action="seed.w6.marketing_mcp",
            entity_type="seed_batch",
            entity_id=f"mkt-{_now().isoformat()}",
            before=None,
            after={"logs_inserted": inserted, "by_platform": by_platform, "by_status": by_status,
                   "scheduled_inserted": sched_inserted},
        )
    except Exception as exc:
        print(f"  [warn] audit log skipped: {exc}")

    return {"logs_inserted": inserted, "logs_skipped": skipped,
            "by_platform": by_platform, "by_status": by_status,
            "scheduled_inserted": sched_inserted, "scheduled_skipped": sched_skipped}


async def run_clean(db) -> dict:
    l = await db.marketing_mcp_log.delete_many({"record_id": {"$regex": f"^{LOG_PREFIX}"}})
    s = await db.marketing_mcp_scheduled.delete_many({"scheduled_id": {"$regex": f"^{SCHED_PREFIX}"}})
    return {"logs_deleted": l.deleted_count, "scheduled_deleted": s.deleted_count}


async def main():
    parser = argparse.ArgumentParser(description="Seed W6 marketing_mcp")
    parser.add_argument("--count", type=int, default=25)
    parser.add_argument("--clean", action="store_true")
    args = parser.parse_args()

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    if args.clean:
        print("Cleaning W6 marketing_mcp seeds...")
        res = await run_clean(db)
        print(f"  cleaned: {res}")
    else:
        print(f"Seeding W6 marketing_mcp · count={args.count}...")
        res = await run_seed(db, args.count)
        print(f"  done: {res}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
