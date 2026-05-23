"""W6 seed · workflows.

Seeds 8 active workflows + 20 runs (last 30d) con mix success/failed/in_progress.

Usage:
    python backend/scripts/seed_w6_workflows.py [--count 20] [--clean]
"""
from __future__ import annotations

import argparse
import asyncio
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
WF_PREFIX = "seed-w6-wf-"

WORKFLOW_TEMPLATES = [
    ("Onboarding Lead Caliente", "lead_created", ["send_whatsapp", "tag_lead", "wait_2h", "send_email"]),
    ("Follow-up 24h", "lead_no_response_24h", ["send_whatsapp", "tag_lead"]),
    ("Nurture Lead Frío", "lead_score_below_30", ["send_email", "wait_3d", "send_email"]),
    ("Tour Programado", "tour_scheduled", ["send_whatsapp", "create_task"]),
    ("Post-Visita", "visit_completed", ["send_email", "wait_2d", "send_whatsapp"]),
    ("Recordatorio Cita", "appointment_reminder", ["send_whatsapp"]),
    ("Re-engagement 30d", "lead_inactive_30d", ["send_email", "tag_lead"]),
    ("Onboarding Asesor", "advisor_signup", ["send_email", "create_task", "tag_user"]),
]


def _now():
    return datetime.now(timezone.utc)


def _make_workflow(idx: int, template: tuple) -> dict:
    name, trigger_type, actions = template
    rng = random.Random(WF_PREFIX + str(idx))
    wf_id = f"{WF_PREFIX}{idx:03d}"
    nodes = [{"id": f"trigger-{wf_id}", "type": "trigger", "config": {"event": trigger_type}}]
    edges = []
    prev = nodes[0]["id"]
    for i, action in enumerate(actions):
        nid = f"node-{wf_id}-{i:02d}"
        nodes.append({"id": nid, "type": "action", "config": {"action_type": action,
                                                              "delay_seconds": rng.choice([0, 0, 7200, 86400])}})
        edges.append({"from": prev, "to": nid, "branch": "default"})
        prev = nid
    return {
        "id": wf_id,
        "name": name,
        "description": f"Synthetic seeded workflow · {name}",
        "owner_user_id": "seed-script",
        "status": "active",
        "nodes": nodes,
        "edges": edges,
        "version": 1,
        "created_at": _now(),
        "updated_at": _now(),
        "deleted_at": None,
        SEED_FLAG: True,
    }


def _make_run(idx: int, wf_id: str) -> dict:
    rng = random.Random(f"{wf_id}-run-{idx}")
    status = rng.choices(["success", "failed", "running"], weights=[70, 20, 10])[0]
    started = _now() - timedelta(days=rng.randint(0, 30), hours=rng.randint(0, 23))
    finished = None if status == "running" else started + timedelta(seconds=rng.randint(30, 600))
    error = "send_whatsapp:provider_429" if status == "failed" else None
    steps = []
    if status != "running":
        for s in range(rng.randint(1, 3)):
            steps.append({
                "node_id": f"node-{wf_id}-{s:02d}",
                "type": "action",
                "ts": (started + timedelta(seconds=s * 10)).isoformat(),
                "result": "ok" if status == "success" else ("ok" if s < 1 else "error"),
            })
    return {
        "id": f"seed-w6-wfr-{idx:04d}",
        "execution_id": f"exec-{uuid.uuid4().hex[:12]}",
        "workflow_id": wf_id,
        "lead_id": f"seed-lead-{rng.randint(1, 50):04d}",
        "status": status,
        "started_at": started,
        "finished_at": finished,
        "dry_run": False,
        "steps": steps,
        "error": error,
        SEED_FLAG: True,
    }


async def run_seed(db, runs_count: int) -> dict:
    wf_upserts = 0
    runs_inserted = 0
    runs_skipped = 0
    status_counts = {"success": 0, "failed": 0, "running": 0}

    for i, tpl in enumerate(WORKFLOW_TEMPLATES):
        wf = _make_workflow(i, tpl)
        await db.workflows.update_one({"id": wf["id"]}, {"$set": wf}, upsert=True)
        wf_upserts += 1

    wf_ids = [f"{WF_PREFIX}{i:03d}" for i in range(len(WORKFLOW_TEMPLATES))]
    rng_global = random.Random("w6-wf-runs")
    for i in range(runs_count):
        wf_id = rng_global.choice(wf_ids)
        run = _make_run(i, wf_id)
        existing = await db.workflow_runs.find_one({"id": run["id"]}, {"_id": 1})
        if existing:
            runs_skipped += 1
            continue
        await db.workflow_runs.insert_one(run)
        runs_inserted += 1
        status_counts[run["status"]] += 1

    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "seed-script", "role": "system"},
            action="seed.w6.workflows",
            entity_type="seed_batch",
            entity_id=f"workflows-{_now().isoformat()}",
            before=None,
            after={"workflows_upserts": wf_upserts, "runs_inserted": runs_inserted,
                   "status_breakdown": status_counts},
        )
    except Exception as exc:
        print(f"  [warn] audit log skipped: {exc}")

    return {"workflows_upserts": wf_upserts, "runs_inserted": runs_inserted,
            "runs_skipped": runs_skipped, "status_breakdown": status_counts}


async def run_clean(db) -> dict:
    w = await db.workflows.delete_many({"id": {"$regex": f"^{WF_PREFIX}"}})
    r = await db.workflow_runs.delete_many({"id": {"$regex": "^seed-w6-wfr-"}})
    return {"workflows_deleted": w.deleted_count, "runs_deleted": r.deleted_count}


async def main():
    parser = argparse.ArgumentParser(description="Seed W6 workflows")
    parser.add_argument("--count", type=int, default=20)
    parser.add_argument("--clean", action="store_true")
    args = parser.parse_args()

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    if args.clean:
        print("Cleaning W6 workflows seeds...")
        res = await run_clean(db)
        print(f"  cleaned: {res}")
    else:
        print(f"Seeding W6 workflows · runs={args.count}...")
        res = await run_seed(db, args.count)
        print(f"  done: {res}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
