"""W5.FF5 Sub-A — A/B Testing Engine.

Deterministic bucket assignment per (user_id, experiment_key) via SHA-256 modulo 100.
Variants stored in `ab_test_variants` (TTL 90d). Experiments stored in `ab_experiments`.

API:
  assign_variant(user_id, experiment_key, split_pct=50) → "A" | "B"   (PURE deterministic)
  create_experiment(db, feature_key, name, split_pct, hypothesis, expires_at)
  list_experiments(db, status=None, feature_key=None)
  get_experiment(db, experiment_id)
  stop_experiment(db, experiment_id)
  record_assignment(db, user_id, experiment_id, variant)
  compute_experiment_stats(db, experiment_id)
  get_active_experiments_for_features(db, feature_keys)  → mapping feature_key → exp doc

FAIL-OPEN: cualquier excepción async retorna estructura neutra (variants vacíos,
stats con state="error"). Cero raise propagated · no rompe get_user_features.
"""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

_log = logging.getLogger("dmx.ab_testing_engine")

# Collection names
COLL_EXPERIMENTS = "ab_experiments"
COLL_VARIANTS = "ab_test_variants"

# Variant TTL (auto-cleanup behavioral tail)
VARIANT_TTL_DAYS = 90


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(d: datetime) -> str:
    return d.isoformat()


# ─── Pure bucket assignment (no DB) ──────────────────────────────────────────
def assign_variant(user_id: str, experiment_key: str, split_pct: int = 50) -> str:
    """Deterministic A/B bucket.

    Hash(user_id:experiment_key)[:8] → int → % 100. Bucket < split_pct → "A" else "B".
    Same (user_id, experiment_key) ALWAYS returns the same variant (idempotent).
    """
    if not user_id or not experiment_key:
        return "A"  # safe default
    try:
        sp = max(0, min(100, int(split_pct)))
    except Exception:
        sp = 50
    h = hashlib.sha256(f"{user_id}:{experiment_key}".encode("utf-8")).hexdigest()
    bucket = int(h[:8], 16) % 100
    return "A" if bucket < sp else "B"


# ─── Experiment management (DB) ──────────────────────────────────────────────
async def create_experiment(
    db,
    feature_key: str,
    name: str,
    split_pct: int = 50,
    hypothesis: str = "",
    expires_at: Optional[str] = None,
    actor_user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Creates a new active experiment. Returns the inserted doc.

    expires_at: ISO string or None (no expiration).
    """
    if not feature_key or not name:
        raise ValueError("feature_key and name are required")
    ts = int(_now().timestamp())
    exp_id = f"ab_{feature_key}_{ts}_{secrets.token_hex(3)}"
    doc = {
        "id": exp_id,
        "feature_key": feature_key,
        "name": name,
        "split_pct": max(0, min(100, int(split_pct))),
        "hypothesis": (hypothesis or "").strip()[:500],
        "status": "active",
        "created_at": _iso(_now()),
        "created_by": actor_user_id,
        "expires_at": expires_at,
        "stopped_at": None,
    }
    await db[COLL_EXPERIMENTS].insert_one(dict(doc))
    # Audit
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": actor_user_id or "superadmin", "role": "superadmin"},
            action="ab_experiment_created",
            entity_type="ab_experiment",
            entity_id=exp_id,
            before=None,
            after={
                "feature_key": feature_key,
                "name": name,
                "split_pct": doc["split_pct"],
                "expires_at": expires_at,
            },
        )
    except Exception as exc:
        _log.warning(f"[ab_testing] audit create non-fatal: {exc}")
    return doc


async def list_experiments(
    db,
    status: Optional[str] = None,
    feature_key: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {}
    if status:
        q["status"] = status
    if feature_key:
        q["feature_key"] = feature_key
    try:
        cursor = db[COLL_EXPERIMENTS].find(q, {"_id": 0}).sort("created_at", -1).limit(int(limit))
        return [row async for row in cursor]
    except Exception as exc:
        _log.warning(f"[ab_testing] list_experiments failed: {exc}")
        return []


async def get_experiment(db, experiment_id: str) -> Optional[Dict[str, Any]]:
    try:
        return await db[COLL_EXPERIMENTS].find_one({"id": experiment_id}, {"_id": 0})
    except Exception:
        return None


async def stop_experiment(
    db,
    experiment_id: str,
    actor_user_id: Optional[str] = None,
) -> Dict[str, Any]:
    now_iso = _iso(_now())
    res = await db[COLL_EXPERIMENTS].update_one(
        {"id": experiment_id, "status": "active"},
        {"$set": {"status": "stopped", "stopped_at": now_iso}},
    )
    stopped = bool(res.modified_count)
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": actor_user_id or "superadmin", "role": "superadmin"},
            action="ab_experiment_stopped",
            entity_type="ab_experiment",
            entity_id=experiment_id,
            before=None,
            after={"stopped_at": now_iso, "modified": stopped},
        )
    except Exception as exc:
        _log.warning(f"[ab_testing] audit stop non-fatal: {exc}")
    return {"experiment_id": experiment_id, "stopped": stopped, "stopped_at": now_iso}


# ─── Variant tracking (DB) ───────────────────────────────────────────────────
async def record_assignment(
    db, user_id: str, experiment_id: str, variant: str
) -> None:
    """Idempotent upsert of (user_id, experiment_id) → variant + assigned_at.

    Safe to call repeatedly; first-write wins on (user_id, experiment_id).
    """
    if db is None or not user_id or not experiment_id:
        return
    try:
        now = _now()
        await db[COLL_VARIANTS].update_one(
            {"user_id": user_id, "experiment_id": experiment_id},
            {
                "$setOnInsert": {
                    "user_id": user_id,
                    "experiment_id": experiment_id,
                    "variant": variant,
                    "assigned_at": now,
                },
            },
            upsert=True,
        )
    except Exception as exc:
        _log.warning(
            f"[ab_testing] record_assignment failed user={user_id} exp={experiment_id} err={exc}"
        )


async def ensure_indexes(db) -> None:
    """Idempotent index ensure. Called from feature_gate startup chain optionally."""
    try:
        await db[COLL_EXPERIMENTS].create_index("id", unique=True, background=True)
        await db[COLL_EXPERIMENTS].create_index(
            [("status", 1), ("feature_key", 1)], background=True
        )
        await db[COLL_VARIANTS].create_index(
            [("user_id", 1), ("experiment_id", 1)],
            unique=True,
            background=True,
        )
        # TTL 90 days on assigned_at
        await db[COLL_VARIANTS].create_index(
            "assigned_at",
            expireAfterSeconds=VARIANT_TTL_DAYS * 24 * 3600,
            background=True,
        )
    except Exception as exc:
        _log.warning(f"[ab_testing] ensure_indexes non-fatal: {exc}")


# ─── Active experiments helper (for feature_gate_engine integration) ─────────
async def get_active_experiments_for_features(
    db, feature_keys: List[str]
) -> Dict[str, Dict[str, Any]]:
    """Returns {feature_key: experiment_doc} for active experiments matching keys.

    FAIL-OPEN: {} si DB falla. Used by feature_gate_engine.get_user_features to
    apply variant=B filtering. Cero raises propagated.
    """
    if db is None or not feature_keys:
        return {}
    try:
        now_iso = _iso(_now())
        cursor = db[COLL_EXPERIMENTS].find(
            {
                "status": "active",
                "feature_key": {"$in": list(feature_keys)},
                "$or": [{"expires_at": None}, {"expires_at": {"$gt": now_iso}}],
            },
            {"_id": 0},
        )
        out: Dict[str, Dict[str, Any]] = {}
        async for row in cursor:
            fk = row.get("feature_key")
            if fk and fk not in out:
                out[fk] = row
        return out
    except Exception as exc:
        _log.warning(f"[ab_testing] get_active_experiments_for_features failed: {exc}")
        return {}


# ─── Stats aggregation ───────────────────────────────────────────────────────
def _chi_square_significance(a_users: int, a_events: int, b_users: int, b_events: int) -> Dict[str, Any]:
    """Very simple chi-square test for 2x2 contingency on conversion rate.

    Returns {significant: bool, chi2: float, p_threshold: 3.84 (alpha=0.05, df=1)}.
    "insufficient_data" if any cell <30 or denominators 0.
    """
    if min(a_users, b_users) < 30:
        return {"state": "insufficient_data", "min_per_arm": 30}
    if a_users == 0 or b_users == 0:
        return {"state": "insufficient_data"}
    a_no = max(0, a_users - a_events)
    b_no = max(0, b_users - b_events)
    obs = [[a_events, a_no], [b_events, b_no]]
    total = a_users + b_users
    row1 = a_events + b_events
    row0 = a_no + b_no
    if row1 == 0 or row0 == 0 or total == 0:
        return {"state": "insufficient_data"}
    chi2 = 0.0
    for i, row_total in enumerate((row1, row0)):
        for j, col_total in enumerate((a_users, b_users)):
            expected = (row_total * col_total) / total
            if expected <= 0:
                continue
            observed = obs[i][j]
            chi2 += ((observed - expected) ** 2) / expected
    crit = 3.84  # alpha=0.05, df=1
    return {
        "state": "ok",
        "chi2": round(chi2, 3),
        "critical_value": crit,
        "significant": chi2 > crit,
    }


async def compute_experiment_stats(db, experiment_id: str) -> Dict[str, Any]:
    """Returns counts per variant + event counts cross-referenced with
    behavioral_events (W4.3) for the feature_key of the experiment.

    Conversion proxy: count of events for the feature in the variant arm.
    """
    out: Dict[str, Any] = {
        "experiment_id": experiment_id,
        "state": "ok",
        "variant_A": {"users": 0, "events": 0, "conversion_rate": 0.0},
        "variant_B": {"users": 0, "events": 0, "conversion_rate": 0.0},
        "statistical_significance": {"state": "insufficient_data"},
    }
    try:
        exp = await db[COLL_EXPERIMENTS].find_one({"id": experiment_id}, {"_id": 0})
        if not exp:
            out["state"] = "experiment_not_found"
            return out
        feature_key = exp.get("feature_key")
        out["feature_key"] = feature_key
        out["name"] = exp.get("name")
        out["status"] = exp.get("status")

        # Users per variant
        pipeline = [
            {"$match": {"experiment_id": experiment_id}},
            {"$group": {"_id": "$variant", "users": {"$addToSet": "$user_id"}}},
        ]
        rows = await db[COLL_VARIANTS].aggregate(pipeline).to_list(length=2)
        users_a: List[str] = []
        users_b: List[str] = []
        for r in rows:
            if r["_id"] == "A":
                users_a = [u for u in r.get("users") or [] if u]
            elif r["_id"] == "B":
                users_b = [u for u in r.get("users") or [] if u]
        out["variant_A"]["users"] = len(users_a)
        out["variant_B"]["users"] = len(users_b)

        # Events per variant (behavioral_events for the feature, scoped to those user_ids)
        async def _events_for(uids: List[str]) -> int:
            if not uids or not feature_key:
                return 0
            try:
                cnt = await db.behavioral_events.count_documents({
                    "user_id": {"$in": uids},
                    "feature": feature_key,
                })
                return int(cnt or 0)
            except Exception:
                return 0

        events_a = await _events_for(users_a)
        events_b = await _events_for(users_b)
        out["variant_A"]["events"] = events_a
        out["variant_B"]["events"] = events_b
        out["variant_A"]["conversion_rate"] = round(events_a / len(users_a), 4) if users_a else 0.0
        out["variant_B"]["conversion_rate"] = round(events_b / len(users_b), 4) if users_b else 0.0

        out["statistical_significance"] = _chi_square_significance(
            len(users_a), events_a, len(users_b), events_b
        )
        return out
    except Exception as exc:
        _log.warning(f"[ab_testing] compute_experiment_stats failed exp={experiment_id} err={exc}")
        out["state"] = "error"
        return out
