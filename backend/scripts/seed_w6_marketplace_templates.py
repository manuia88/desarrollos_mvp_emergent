"""W6 seed · Marketplace Templates (W6.4 catálogo workflows).

D.32 audit fix · paridad con otros 7 seed scripts W6.
Pobla marketplace_templates con 12 plantillas approved + 3 pending_review + revenue ratings.

Usage:
    python backend/scripts/seed_w6_marketplace_templates.py [--count N] [--clean]
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import os
import random
import sys
import uuid
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
TPL_PREFIX = "seed-w6-mkt-tpl-"
CLONE_PREFIX = "seed-w6-mkt-clone-"
RATING_PREFIX = "seed-w6-mkt-rating-"

TEMPLATE_DATA = [
    ("Nurture 30d Polanco luxury", "nurture", "pro", 149, 4.8, 87),
    ("Post-visita 24h compradores primerizos", "post_visita", "free", 0, 4.5, 142),
    ("Win-back 60 días", "win_back", "free", 0, 4.2, 95),
    ("Welcome series asesor nuevo", "nurture", "pro", 99, 4.7, 64),
    ("Reactivación leads fríos 90d", "win_back", "pro", 199, 4.6, 38),
    ("Follow-up post-cotización CDMX", "post_visita", "free", 0, 4.3, 112),
    ("Secuencia inversor extranjero", "custom", "enterprise", 599, 4.9, 23),
    ("Nurture millennial First-home", "nurture", "pro", 149, 4.4, 71),
    ("Re-engagement 7d sin abrir email", "win_back", "free", 0, 4.0, 88),
    ("Post-tour 3D agradecimiento", "post_visita", "pro", 99, 4.6, 52),
    ("Onboarding asesor freelance", "custom", "enterprise", 499, 4.8, 19),
    ("Birthday lead nurture", "custom", "free", 0, 4.1, 76),
]

PENDING_TITLES = [
    "Cold outreach LinkedIn premium",
    "Cross-sell Polanco→Condesa",
    "Renovación contrato anual",
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _ensure_db():
    client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    await client.admin.command("ping")
    return client[DB_NAME]


async def _audit_log(db, action: str, count: int):
    try:
        await db.audit_immutable.insert_one({
            "id": f"seed_{uuid.uuid4().hex[:12]}",
            "timestamp": _now(),
            "actor": {"type": "system", "id": "seed_script"},
            "action": action,
            "entity_type": "seed_run",
            "entity_id": "marketplace_templates",
            "after": {"count": count, "feature": "marketplace_templates"},
        })
    except Exception as exc:
        print(f"  audit_log skip: {exc}")


async def clean(db):
    print("Cleaning seed_w6_marketplace_templates entries...")
    r1 = await db.marketplace_templates.delete_many({SEED_FLAG: True})
    r2 = await db.marketplace_template_clones.delete_many({SEED_FLAG: True})
    r3 = await db.marketplace_template_ratings.delete_many({SEED_FLAG: True})
    print(f"  removed: {r1.deleted_count} templates · {r2.deleted_count} clones · {r3.deleted_count} ratings")
    await _audit_log(db, "seed.w6.marketplace_templates.clean", r1.deleted_count + r2.deleted_count + r3.deleted_count)


async def seed(db, count: int):
    print(f"Seeding marketplace_templates (~{count} approved + 3 pending)...")
    now = _now()
    tpl_count = 0
    clone_count = 0
    rating_count = 0

    # Approved templates
    for i, (title, category, tier, price, avg_rating, downloads) in enumerate(TEMPLATE_DATA[:count]):
        tpl_id = f"{TPL_PREFIX}{hashlib.sha1(title.encode()).hexdigest()[:10]}"
        author_user_id = f"seed_author_{(i % 4) + 1}"  # 4 authors distintos
        existing = await db.marketplace_templates.find_one({"id": tpl_id})
        if existing:
            continue

        await db.marketplace_templates.insert_one({
            "id": tpl_id,
            "title": title,
            "description": f"Plantilla {category} probada con {downloads} clones · DMX seed",
            "category": category,
            "price_tier": tier,
            "price_mxn": price,
            "author_user_id": author_user_id,
            "author_email": f"{author_user_id}@dmx-seed.local",
            "workflow_id": f"seed_wf_{tpl_id}",
            "status": "approved",
            "downloads": downloads,
            "avg_rating": avg_rating,
            "ratings_count": int(downloads * 0.3),
            "revenue_total_mxn": round(downloads * price * 0.7, 2),
            "published_at": now - timedelta(days=random.randint(30, 180)),
            "approved_at": now - timedelta(days=random.randint(20, 170)),
            "deleted_at": None,
            "created_at": now - timedelta(days=random.randint(35, 200)),
            "updated_at": now,
            SEED_FLAG: True,
        })
        tpl_count += 1

        # Random clones per template (proportional to downloads · max 5 seed clones each)
        n_clones = min(5, max(1, downloads // 20))
        for c in range(n_clones):
            clone_id = f"{CLONE_PREFIX}{hashlib.sha1(f'{tpl_id}{c}'.encode()).hexdigest()[:12]}"
            existing_c = await db.marketplace_template_clones.find_one({"id": clone_id})
            if existing_c:
                continue
            await db.marketplace_template_clones.insert_one({
                "id": clone_id,
                "template_id": tpl_id,
                "target_user_id": f"seed_cloner_{(c * 7 + i) % 20}",
                "target_email": f"cloner{(c * 7 + i) % 20}@dmx-seed.local",
                "paid_amount_mxn": price,
                "revenue_share_author_mxn": round(price * 0.7, 2),
                "revenue_share_dmx_mxn": round(price * 0.3, 2),
                "cloned_at": now - timedelta(days=random.randint(1, 60)),
                "cloned_workflow_id": f"seed_wf_clone_{clone_id}",
                SEED_FLAG: True,
            })
            clone_count += 1

        # Random ratings (1-3 per template)
        n_ratings = random.randint(1, 3)
        for r in range(n_ratings):
            rating_id = f"{RATING_PREFIX}{hashlib.sha1(f'{tpl_id}{r}'.encode()).hexdigest()[:12]}"
            existing_r = await db.marketplace_template_ratings.find_one({"id": rating_id})
            if existing_r:
                continue
            stars = max(3, min(5, round(avg_rating + random.uniform(-0.5, 0.5))))
            await db.marketplace_template_ratings.insert_one({
                "id": rating_id,
                "template_id": tpl_id,
                "user_id": f"seed_rater_{(r * 11 + i) % 15}",
                "stars": stars,
                "comment": f"Funcionó bien para mi flujo {category}" if r == 0 else None,
                "rated_at": now - timedelta(days=random.randint(1, 90)),
                SEED_FLAG: True,
            })
            rating_count += 1

    # Pending review templates (no clones · no ratings)
    for i, title in enumerate(PENDING_TITLES):
        tpl_id = f"{TPL_PREFIX}pending-{hashlib.sha1(title.encode()).hexdigest()[:10]}"
        existing = await db.marketplace_templates.find_one({"id": tpl_id})
        if existing:
            continue
        await db.marketplace_templates.insert_one({
            "id": tpl_id,
            "title": title,
            "description": f"Plantilla en revisión · DMX seed",
            "category": "custom",
            "price_tier": "pro",
            "price_mxn": 149,
            "author_user_id": f"seed_author_pending_{i + 1}",
            "author_email": f"seed_author_pending_{i + 1}@dmx-seed.local",
            "workflow_id": f"seed_wf_pending_{tpl_id}",
            "status": "pending_review",
            "downloads": 0,
            "avg_rating": 0,
            "ratings_count": 0,
            "revenue_total_mxn": 0,
            "published_at": now - timedelta(days=random.randint(1, 7)),
            "approved_at": None,
            "deleted_at": None,
            "created_at": now - timedelta(days=random.randint(2, 10)),
            "updated_at": now,
            SEED_FLAG: True,
        })
        tpl_count += 1

    print(f"  added: {tpl_count} templates ({len(TEMPLATE_DATA[:count])} approved + {len(PENDING_TITLES)} pending) · {clone_count} clones · {rating_count} ratings")
    await _audit_log(db, "seed.w6.marketplace_templates.add", tpl_count)
    return {"templates": tpl_count, "clones": clone_count, "ratings": rating_count}


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=12, help="Cantidad approved templates (max 12)")
    parser.add_argument("--clean", action="store_true", help="Borra entries seedeados")
    args = parser.parse_args()

    db = await _ensure_db()
    if args.clean:
        await clean(db)
    else:
        await seed(db, min(args.count, len(TEMPLATE_DATA)))


if __name__ == "__main__":
    asyncio.run(main())
