"""W6 seed · construction_quality.

Seeds 15 developments with construction tracking fields + 30-50 quality signals
+ runs compute_quality_index for each. Marks docs with _seed_synthetic=True.

Idempotent: re-running upserts by id and skips existing signals by (development_id, idx).

Usage:
    python backend/scripts/seed_w6_construction_quality.py [--count 15] [--clean]
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
SEED_PREFIX = "seed-w6-cq-"

ZONES = ["Polanco", "Roma Norte", "Condesa", "Doctores", "Coyoacán", "Del Valle",
         "Santa Fe", "Cuauhtémoc", "Juárez", "Anzures", "Nápoles", "Escandón"]
DEV_NAME_TEMPLATES = ["Residencial {z}", "Torre {z}", "Skylight {z}", "Be {z}",
                      "Atelier {z}", "Loft {z}", "Mirador {z}", "Origen {z}"]


def _now():
    return datetime.now(timezone.utc)


def _make_dev(idx: int) -> dict:
    rng = random.Random(SEED_PREFIX + str(idx))
    zone = rng.choice(ZONES)
    name = rng.choice(DEV_NAME_TEMPLATES).format(z=zone)
    start = _now() - timedelta(days=rng.randint(180, 900))
    end = start + timedelta(days=rng.randint(540, 1080))
    progress = rng.randint(30, 95)
    total_units = rng.randint(40, 180)
    sold = rng.randint(5, max(6, total_units - 5))

    milestones = []
    for m in range(rng.randint(3, 5)):
        promised = (start + timedelta(days=120 * (m + 1))).isoformat()
        delay = rng.choice([-3, 0, 0, 5, 15, 45, 90])
        actual = (start + timedelta(days=120 * (m + 1) + delay)).isoformat()
        milestones.append({"name": f"Hito {m + 1}", "date_promised": promised, "date_actual": actual})

    return {
        "id": f"{SEED_PREFIX}{idx:03d}",
        "name": f"{name} {idx:03d}",
        "zone": zone,
        "price_min_mxn": rng.randint(2_000_000, 6_000_000),
        "price_max_mxn": rng.randint(7_000_000, 15_000_000),
        "construction_start_date": start.isoformat(),
        "expected_delivery_date": end.isoformat(),
        "construction_progress_pct": progress,
        "total_units": total_units,
        "units_sold_count": sold,
        "milestones_history": milestones,
        "publish_state": "published",
        SEED_FLAG: True,
        "updated_at": _now().isoformat(),
    }


def _make_signal(dev_id: str, idx: int) -> dict:
    rng = random.Random(f"{dev_id}-sig-{idx}")
    sig_type = rng.choices(
        ["finish_ok", "finish_defect", "defect_report"],
        weights=[55, 25, 20],
    )[0]
    severity = rng.randint(1, 5) if sig_type == "defect_report" else None
    return {
        "id": f"{dev_id}-sig-{idx:03d}",
        "development_id": dev_id,
        "signal_type": sig_type,
        "severity": severity,
        "source": rng.choice(["inspection_admin", "resident_report", "internal_qa"]),
        "reported_at": _now() - timedelta(days=rng.randint(1, 180)),
        "notes": f"Synthetic signal #{idx}",
        SEED_FLAG: True,
    }


async def run_seed(db, count: int) -> dict:
    devs_inserted = 0
    sigs_inserted = 0
    sigs_skipped = 0

    # 1. Upsert developments
    for i in range(count):
        doc = _make_dev(i)
        existing = await db.developments.find_one({"id": doc["id"]}, {"_id": 0, "id": 1})
        if existing:
            await db.developments.update_one({"id": doc["id"]}, {"$set": doc})
        else:
            await db.developments.insert_one(doc)
            devs_inserted += 1

    # 2. Insert signals per dev (idempotent by signal.id)
    rng_global = random.Random("w6-cq-global")
    for i in range(count):
        dev_id = f"{SEED_PREFIX}{i:03d}"
        n_signals = rng_global.randint(2, 5)
        for j in range(n_signals):
            sig = _make_signal(dev_id, j)
            existing = await db.construction_quality_signals.find_one({"id": sig["id"]}, {"_id": 1})
            if existing:
                sigs_skipped += 1
                continue
            await db.construction_quality_signals.insert_one(sig)
            sigs_inserted += 1

    # 3. Run compute_quality_index for all seeded devs (best effort)
    scored = 0
    try:
        from construction_quality_engine import compute_quality_index
        for i in range(count):
            dev_id = f"{SEED_PREFIX}{i:03d}"
            res = await compute_quality_index(db, dev_id, use_cache=False)
            if res and res.get("score") is not None:
                scored += 1
    except Exception as exc:
        print(f"  [warn] compute_quality_index skipped: {exc}")

    # 4. Audit log
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "seed-script", "role": "system"},
            action="seed.w6.construction_quality",
            entity_type="seed_batch",
            entity_id=f"cq-{_now().isoformat()}",
            before=None,
            after={"devs_inserted": devs_inserted, "signals_inserted": sigs_inserted, "scored": scored},
        )
    except Exception as exc:
        print(f"  [warn] audit log skipped: {exc}")

    return {
        "devs_inserted": devs_inserted,
        "devs_total_seeded": count,
        "signals_inserted": sigs_inserted,
        "signals_skipped": sigs_skipped,
        "scored": scored,
    }


async def run_clean(db) -> dict:
    devs = await db.developments.delete_many({"id": {"$regex": f"^{SEED_PREFIX}"}})
    sigs = await db.construction_quality_signals.delete_many({SEED_FLAG: True})
    cache = await db.construction_quality_cache.delete_many({"development_id": {"$regex": f"^{SEED_PREFIX}"}})
    return {"devs_deleted": devs.deleted_count, "signals_deleted": sigs.deleted_count,
            "cache_deleted": cache.deleted_count}


async def main():
    parser = argparse.ArgumentParser(description="Seed W6 construction quality data")
    parser.add_argument("--count", type=int, default=15)
    parser.add_argument("--clean", action="store_true")
    args = parser.parse_args()

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    if args.clean:
        print("Cleaning W6 CQ seeds...")
        res = await run_clean(db)
        print(f"  cleaned: {res}")
    else:
        print(f"Seeding W6 construction quality · count={args.count}...")
        res = await run_seed(db, args.count)
        print(f"  done: {res}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
