"""Phase 4 Batch 18 Sub-A — User Preferences (density + project switcher)

Endpoints:
  GET  /api/preferences/me                    → get prefs (auto-create defaults)
  PATCH /api/preferences/me                   → partial update {density, theme, ...}
  POST /api/preferences/me/recent-project     → push project_id (dedupe + trim 5)

Schema db.user_preferences (shared with routes_search_prefs.py, same collection):
  { user_id (unique), density, last_project_id, recent_project_ids: [str ≤5],
    sidebar_collapsed, theme, updated_at }
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

log = logging.getLogger("dmx.batch18")
router = APIRouter(tags=["preferences_b18"])

DENSITY_VALUES = {"comfortable", "compact", "spacious"}
THEME_VALUES = {"light", "dark"}

DEFAULTS: dict = {
    "density": "comfortable",
    "last_project_id": None,
    "recent_project_ids": [],
    "sidebar_collapsed": False,
    "theme": "dark",
    # Batch 19 Sub-A — Tours
    "tours_completed": [],
    "tours_dismissed": [],
    # Batch 19 Sub-C — Presentation Mode
    "presentation_mode": {
        "active": False,
        "anonymize_pii": True,
        "hide_pricing": False,
        "hide_internal_notes": True,
    },
}


def _db(request: Request):
    return request.app.state.db


async def _auth(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


# ─── GET /api/preferences/me ──────────────────────────────────────────────────

@router.get("/api/preferences/me")
async def get_my_preferences(request: Request):
    """Returns user prefs. Auto-creates doc with defaults on first call."""
    user = await _auth(request)
    db = _db(request)

    doc = await db.user_preferences.find_one(
        {"user_id": user.user_id}, {"_id": 0}
    )

    if not doc:
        doc = {
            **DEFAULTS,
            "user_id": user.user_id,
            "updated_at": datetime.now(timezone.utc),
        }
        try:
            await db.user_preferences.insert_one({**doc})
        except Exception:
            pass  # concurrent insert — fine

    # Merge defaults for fields added in later batches
    result = {**DEFAULTS}
    for k, v in doc.items():
        if k not in ("_id", "user_id"):
            result[k] = v

    return result


# ─── PATCH /api/preferences/me ────────────────────────────────────────────────

class PresentationModeSubfield(BaseModel):
    active: Optional[bool] = None
    anonymize_pii: Optional[bool] = None
    hide_pricing: Optional[bool] = None
    hide_internal_notes: Optional[bool] = None


class PreferencesPatch(BaseModel):
    density: Optional[str] = None
    last_project_id: Optional[str] = None
    recent_project_ids: Optional[List[str]] = None
    sidebar_collapsed: Optional[bool] = None
    theme: Optional[str] = None
    presentation_mode: Optional[PresentationModeSubfield] = None


@router.patch("/api/preferences/me")
async def patch_my_preferences(payload: PreferencesPatch, request: Request):
    """Partial update of user preferences. Only provided fields are changed."""
    user = await _auth(request)
    db = _db(request)

    updates: dict = {"updated_at": datetime.now(timezone.utc)}

    if payload.density is not None:
        if payload.density not in DENSITY_VALUES:
            raise HTTPException(422, f"density must be one of {sorted(DENSITY_VALUES)}")
        updates["density"] = payload.density

    if payload.last_project_id is not None:
        updates["last_project_id"] = payload.last_project_id

    if payload.recent_project_ids is not None:
        seen: list = []
        for pid in payload.recent_project_ids:
            if pid not in seen:
                seen.append(pid)
        updates["recent_project_ids"] = seen[:5]

    if payload.sidebar_collapsed is not None:
        updates["sidebar_collapsed"] = payload.sidebar_collapsed

    if payload.theme is not None:
        if payload.theme not in THEME_VALUES:
            raise HTTPException(422, f"theme must be one of {sorted(THEME_VALUES)}")
        updates["theme"] = payload.theme

    if payload.presentation_mode is not None:
        pm = payload.presentation_mode
        # Merge into sub-document using dot notation
        if pm.active is not None:
            updates["presentation_mode.active"] = pm.active
        if pm.anonymize_pii is not None:
            updates["presentation_mode.anonymize_pii"] = pm.anonymize_pii
        if pm.hide_pricing is not None:
            updates["presentation_mode.hide_pricing"] = pm.hide_pricing
        if pm.hide_internal_notes is not None:
            updates["presentation_mode.hide_internal_notes"] = pm.hide_internal_notes

    if len(updates) == 1:  # only updated_at → nothing to do
        return {"ok": True, "updated": []}

    await db.user_preferences.update_one(
        {"user_id": user.user_id},
        {
            "$set": updates,
            "$setOnInsert": {
                "user_id": user.user_id,
                # Exclude any key that is a prefix of a dot-notation key already in $set
                **{
                    k: v for k, v in DEFAULTS.items()
                    if k not in updates
                    and not any(uk.startswith(k + ".") for uk in updates)
                },
            },
        },
        upsert=True,
    )
    return {"ok": True, "updated": [k for k in updates if k != "updated_at"]}


# ─── POST /api/preferences/me/recent-project ──────────────────────────────────

class RecentProjectIn(BaseModel):
    project_id: str


@router.post("/api/preferences/me/recent-project")
async def push_recent_project(payload: RecentProjectIn, request: Request):
    """Push project_id to front of recent_project_ids. Deduplicate + trim to 5."""
    user = await _auth(request)
    db = _db(request)

    pid = (payload.project_id or "").strip()
    if not pid:
        raise HTTPException(422, "project_id cannot be empty")

    doc = await db.user_preferences.find_one(
        {"user_id": user.user_id},
        {"_id": 0, "recent_project_ids": 1},
    )
    current: list = (doc or {}).get("recent_project_ids") or []

    # Dedupe: remove existing occurrence, push to front
    deduped = [p for p in current if p != pid]
    new_list = [pid] + deduped
    trimmed = new_list[:5]

    set_fields = {
        "recent_project_ids": trimmed,
        "last_project_id": pid,
        "updated_at": datetime.now(timezone.utc),
    }

    await db.user_preferences.update_one(
        {"user_id": user.user_id},
        {
            "$set": set_fields,
            "$setOnInsert": {
                "user_id": user.user_id,
                **{k: v for k, v in DEFAULTS.items() if k not in set_fields},
            },
        },
        upsert=True,
    )
    return {"ok": True, "recent_project_ids": trimmed, "last_project_id": pid}


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_batch18_indexes(db) -> None:
    """user_preferences already has unique index from routes_search_prefs.
    This is a no-op safety call."""
    try:
        await db.user_preferences.create_index("user_id", unique=True)
    except Exception:
        pass
    log.info("[batch18] user_preferences indexes OK")
