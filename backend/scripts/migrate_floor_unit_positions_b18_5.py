"""Phase 4 Batch 18.5 — One-shot migration: clean corrupted floor_unit_positions.

The previous PATCH /api/units/{unit_id}/position derived project_id from
unit_id via `rsplit('-', 2)`. For unit_ids like `altavista-polanco-A201`
this produced `project_id="altavista-polanco"` (correct), but for unit_ids
where the unit_number contained a dash (e.g. `proj-x-A-201`) it produced
truncated/wrong values such as `proj-x` instead of `proj-x-A`.

This script:
  1. Loads `data_developments.DEVELOPMENTS_BY_ID` (source of truth).
  2. For every doc in `db.floor_unit_positions`, attempts to find the matching
     development by checking which project's units list contains `unit_id`.
  3. If found and `project_id` differs → fix it (and best-effort floor_number).
  4. If not found in any development → mark the doc as orphaned in
     `db.floor_unit_positions_orphaned` and remove from the live collection.

Idempotent: safe to run multiple times.

Usage:
    cd /app/backend && python scripts/migrate_floor_unit_positions_b18_5.py
    cd /app/backend && python scripts/migrate_floor_unit_positions_b18_5.py --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone

# Ensure backend dir is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from data_developments import DEVELOPMENTS_BY_ID    # noqa: E402

# Load .env so MONGO_URL is available when invoked outside supervisor.
try:
    from dotenv import load_dotenv  # noqa: E402
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
except ImportError:
    pass

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


def _build_unit_index() -> dict[str, tuple[str, int]]:
    """unit_id → (project_id, floor_number) lookup from static data."""
    idx: dict[str, tuple[str, int]] = {}
    for pid, dev in DEVELOPMENTS_BY_ID.items():
        for u in dev.get("units", []):
            uid = u.get("id")
            if not uid:
                continue
            floor = int(u.get("level") or 1)
            idx[uid] = (pid, floor)
    return idx


async def run(dry_run: bool = False) -> dict:
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    unit_idx = _build_unit_index()

    stats = {
        "scanned": 0,
        "ok": 0,
        "fixed_project_id": 0,
        "fixed_floor_number": 0,
        "orphaned_moved": 0,
        "errors": 0,
    }

    async for doc in db.floor_unit_positions.find({}):
        stats["scanned"] += 1
        uid = doc.get("unit_id")
        if not uid:
            stats["errors"] += 1
            continue

        truth = unit_idx.get(uid)
        if truth is None:
            # Orphaned — unit_id not present in any development.
            stats["orphaned_moved"] += 1
            if not dry_run:
                doc.pop("_id", None)
                doc["archived_at"] = datetime.now(timezone.utc)
                doc["archived_reason"] = "unit_id not found in DEVELOPMENTS_BY_ID"
                await db.floor_unit_positions_orphaned.insert_one(doc)
                await db.floor_unit_positions.delete_one({"unit_id": uid})
            continue

        true_pid, true_floor = truth
        updates: dict = {}
        if doc.get("project_id") != true_pid:
            stats["fixed_project_id"] += 1
            updates["project_id"] = true_pid
        # Conservative: only set floor_number if missing or null
        if doc.get("floor_number") in (None, 0) and true_floor:
            stats["fixed_floor_number"] += 1
            updates["floor_number"] = true_floor

        if updates:
            updates["migrated_at_b18_5"] = datetime.now(timezone.utc)
            if not dry_run:
                await db.floor_unit_positions.update_one(
                    {"unit_id": uid}, {"$set": updates}
                )
        else:
            stats["ok"] += 1

    client.close()
    return stats


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print(
        f"[migrate_floor_unit_positions_b18_5] starting "
        f"({'DRY RUN' if args.dry_run else 'WRITE'})…"
    )
    stats = asyncio.run(run(dry_run=args.dry_run))
    print(f"[migrate_floor_unit_positions_b18_5] DONE → {stats}")


if __name__ == "__main__":
    main()
