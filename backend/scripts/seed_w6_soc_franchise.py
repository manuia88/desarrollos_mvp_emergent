"""W6 seed · soc_franchise.

Seeds 20 asesores con scores distribuidos:
 - 5 platinum (90-95)
 - 7 gold    (70-89)
 - 5 silver  (50-69)
 - 3 bronze  (30-49)
Plus 10 history snapshots 7d atrás para simular delta_week.

Usage:
    python backend/scripts/seed_w6_soc_franchise.py [--count 20] [--clean]
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
USER_PREFIX = "seed-w6-soc-"

LEVELS_DIST = [
    ("platinum", 5, (90, 95)),
    ("gold",     7, (70, 89)),
    ("silver",   5, (50, 69)),
    ("bronze",   3, (30, 49)),
]


def _now():
    return datetime.now(timezone.utc)


def _make_breakdown(target_score: float, rng: random.Random) -> dict:
    base = max(20.0, target_score - rng.uniform(5, 15))
    spread = lambda center: round(max(0.0, min(100.0, center + rng.uniform(-10, 10))), 1)  # noqa: E731
    return {
        "lead_conversion": spread(target_score),
        "nps_proxy": spread(target_score - 3),
        "response_time": spread(target_score + 2),
        "revenue_30d": spread(target_score - 5),
        "compliance": spread(target_score + 4),
        "weights": {"lead_conversion": 0.30, "nps_proxy": 0.20, "response_time": 0.20,
                    "revenue_30d": 0.20, "compliance": 0.10},
        "base_index": round(base, 1),
    }


async def run_seed(db, count: int) -> dict:
    users_upserts = 0
    cache_upserts = 0
    history_inserts = 0
    history_skipped = 0

    plan = []
    for level, n, (lo, hi) in LEVELS_DIST:
        for _ in range(n):
            plan.append((level, lo, hi))
    plan = plan[:count]

    for idx, (level, lo, hi) in enumerate(plan):
        rng = random.Random(USER_PREFIX + str(idx))
        user_id = f"{USER_PREFIX}{idx:03d}"
        score = round(rng.uniform(lo, hi), 1)

        # 1. Synthetic user
        user_doc = {
            "user_id": user_id,
            "name": f"Asesor Synthetic {idx:03d}",
            "email": f"asesor{idx:03d}@seed.dmx",
            "role": "asesor",
            "tenant_id": "seed-tenant",
            "avatar_url": None,
            SEED_FLAG: True,
        }
        await db.users.update_one({"user_id": user_id}, {"$set": user_doc}, upsert=True)
        users_upserts += 1

        # 2. soc_franchise_cache score
        cache_doc = {
            "user_id": user_id,
            "name": user_doc["name"],
            "score": score,
            "level": level,
            "breakdown": _make_breakdown(score, rng),
            "computed_at": _now(),
            "version": "seed-w6",
            "tenant_id": "seed-tenant",
            "manual_override": None,
            SEED_FLAG: True,
        }
        await db.soc_franchise_cache.update_one({"user_id": user_id}, {"$set": cache_doc}, upsert=True)
        cache_upserts += 1

        # 3. History snapshot 7d ago (first 10 only · simulates delta_week)
        if idx < 10:
            snap_id = f"{user_id}-snap-7d"
            existing = await db.soc_franchise_history.find_one({"snapshot_id": snap_id}, {"_id": 1})
            if existing:
                history_skipped += 1
            else:
                prev_score = round(max(0.0, min(100.0, score - rng.uniform(-8, 8))), 1)
                await db.soc_franchise_history.insert_one({
                    "snapshot_id": snap_id,
                    "user_id": user_id,
                    "score": prev_score,
                    "level": level,
                    "snapshot_at": _now() - timedelta(days=7),
                    SEED_FLAG: True,
                })
                history_inserts += 1

    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "seed-script", "role": "system"},
            action="seed.w6.soc_franchise",
            entity_type="seed_batch",
            entity_id=f"soc-{_now().isoformat()}",
            before=None,
            after={"users_upserts": users_upserts, "cache_upserts": cache_upserts,
                   "history_inserts": history_inserts},
        )
    except Exception as exc:
        print(f"  [warn] audit log skipped: {exc}")

    return {"users_upserts": users_upserts, "cache_upserts": cache_upserts,
            "history_inserts": history_inserts, "history_skipped": history_skipped}


async def run_clean(db) -> dict:
    u = await db.users.delete_many({"user_id": {"$regex": f"^{USER_PREFIX}"}})
    c = await db.soc_franchise_cache.delete_many({"user_id": {"$regex": f"^{USER_PREFIX}"}})
    h = await db.soc_franchise_history.delete_many({"user_id": {"$regex": f"^{USER_PREFIX}"}})
    return {"users_deleted": u.deleted_count, "cache_deleted": c.deleted_count,
            "history_deleted": h.deleted_count}


async def main():
    parser = argparse.ArgumentParser(description="Seed W6 soc_franchise")
    parser.add_argument("--count", type=int, default=20)
    parser.add_argument("--clean", action="store_true")
    args = parser.parse_args()

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    if args.clean:
        print("Cleaning W6 soc_franchise seeds...")
        res = await run_clean(db)
        print(f"  cleaned: {res}")
    else:
        print(f"Seeding W6 soc_franchise · count={args.count}...")
        res = await run_seed(db, args.count)
        print(f"  done: {res}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
