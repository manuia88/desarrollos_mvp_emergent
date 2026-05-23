"""W6 master seed runner.

Invokes the 7 individual seed scripts in order + reports aggregate counts.

Usage:
    python backend/scripts/seed_w6_all.py --all
    python backend/scripts/seed_w6_all.py --feature {cq|reviews|gov|soc|workflows|mcp|qw}
    python backend/scripts/seed_w6_all.py --clean
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

try:
    from dotenv import load_dotenv  # noqa: E402
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
except ImportError:
    pass

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "desarrollosmx")

import seed_w6_construction_quality as s_cq  # noqa: E402
import seed_w6_reviews_residents as s_rv  # noqa: E402
import seed_w6_gov_data_mx as s_gov  # noqa: E402
import seed_w6_soc_franchise as s_soc  # noqa: E402
import seed_w6_workflows as s_wf  # noqa: E402
import seed_w6_marketing_mcp as s_mkt  # noqa: E402
import seed_w6_quick_wins as s_qw  # noqa: E402

FEATURES = {
    "cq":        ("construction_quality", s_cq.run_seed, s_cq.run_clean, {"count": 15}),
    "reviews":   ("reviews_residents",    s_rv.run_seed, s_rv.run_clean, {"count": 60}),
    "gov":       ("gov_data_mx",          s_gov.run_seed, s_gov.run_clean, {}),
    "soc":       ("soc_franchise",        s_soc.run_seed, s_soc.run_clean, {"count": 20}),
    "workflows": ("workflows",            s_wf.run_seed, s_wf.run_clean, {"count": 20}),
    "mcp":       ("marketing_mcp",        s_mkt.run_seed, s_mkt.run_clean, {"count": 25}),
    "qw":        ("quick_wins",           s_qw.run_seed, s_qw.run_clean, {}),
}


def _print_table(rows: list) -> None:
    print(f"\n{'feature':<22} {'status':<10} {'detail':<60}")
    print("-" * 95)
    for r in rows:
        print(f"{r['feature']:<22} {r['status']:<10} {r['detail']:<60}")
    print()


async def run_all(db, clean: bool) -> None:
    rows = []
    for key, (name, seed_fn, clean_fn, kwargs) in FEATURES.items():
        label = f"W6 · {name}"
        print(f"\n=== {label} ({key}) ===")
        try:
            if clean:
                res = await clean_fn(db)
                rows.append({"feature": name, "status": "cleaned",
                             "detail": str(res)[:60]})
            else:
                res = await seed_fn(db, **kwargs)
                rows.append({"feature": name, "status": "seeded",
                             "detail": str({k: v for k, v in res.items() if not isinstance(v, dict)})[:60]})
            print(f"  -> {res}")
        except Exception as exc:
            rows.append({"feature": name, "status": "FAILED", "detail": str(exc)[:60]})
            print(f"  ERROR: {exc}")

    _print_table(rows)


async def run_one(db, feature: str, clean: bool) -> None:
    if feature not in FEATURES:
        print(f"Unknown feature '{feature}'. Available: {list(FEATURES)}")
        return
    name, seed_fn, clean_fn, kwargs = FEATURES[feature]
    print(f"\n=== W6 · {name} ({feature}) ===")
    try:
        if clean:
            res = await clean_fn(db)
        else:
            res = await seed_fn(db, **kwargs)
        print(f"  -> {res}")
    except Exception as exc:
        print(f"  ERROR: {exc}")


async def main():
    parser = argparse.ArgumentParser(description="W6 master seed runner")
    parser.add_argument("--all", action="store_true", help="Seed all 7 features")
    parser.add_argument("--feature", type=str, choices=list(FEATURES), help="Seed only one feature")
    parser.add_argument("--clean", action="store_true", help="Clean instead of seed")
    args = parser.parse_args()

    if not (args.all or args.feature or args.clean):
        parser.print_help()
        return

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    if args.feature:
        await run_one(db, args.feature, args.clean)
    else:
        await run_all(db, args.clean)

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
