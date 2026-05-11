"""Phase 4 Batch 0 — User preferences + Universal Search routes.
Preferences: GET/PATCH /api/user/preferences
Search: GET /api/search?q=&types=&scope=
"""
from __future__ import annotations
import logging
import re
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel

log = logging.getLogger("dmx.preferences")
router = APIRouter(tags=["preferences", "search"])


def _db(request: Request):
    return request.app.state.db


async def _auth(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


# ─── User Preferences ─────────────────────────────────────────────────────────

class PrefPatch(BaseModel):
    key: str
    value: object


@router.get("/api/user/preferences")
async def get_preferences(request: Request):
    user = await _auth(request)
    db = _db(request)
    doc = await db.user_preferences.find_one({"user_id": user.user_id}, {"_id": 0}) or {}
    doc.pop("user_id", None)
    return doc


@router.patch("/api/user/preferences")
async def set_preference(payload: PrefPatch, request: Request):
    user = await _auth(request)
    db = _db(request)
    await db.user_preferences.update_one(
        {"user_id": user.user_id},
        {
            "$set": {
                payload.key: payload.value,
                f"_updated_{payload.key}": datetime.now(timezone.utc),
            },
            "$setOnInsert": {"user_id": user.user_id},
        },
        upsert=True,
    )
    return {"ok": True, "key": payload.key, "value": payload.value}


async def ensure_preferences_indexes(db) -> None:
    await db.user_preferences.create_index("user_id", unique=True)


# ─── Universal Search ──────────────────────────────────────────────────────────
SEARCH_TYPES = {"development", "colonia", "lead", "unit", "asesor", "project"}


@router.get("/api/search")
async def universal_search(
    request: Request,
    q: str = Query(""),
    types: Optional[str] = Query(None),  # comma-separated
    scope: Optional[str] = Query(None),
    limit: int = Query(10),
):
    if not q or len(q.strip()) < 2:
        return {"results": [], "query": q}
    user = await _auth(request)
    db = _db(request)
    role = getattr(user, "role", "buyer")
    tenant_id = getattr(user, "tenant_id", None)

    requested = set((types or "").split(",")) & SEARCH_TYPES if types else SEARCH_TYPES
    pattern = re.compile(re.escape(q.strip()), re.IGNORECASE)

    results = []

    # ── Developments (public catalogue) ──────────────────────────────────────
    if "development" in requested:
        from data_developments import DEVELOPMENTS
        matched = [
            {
                "type": "development",
                "id": d["id"],
                "label": d["name"],
                "sub": d.get("colonia", ""),
                "meta": {"stage": d.get("stage"), "price_from_display": d.get("price_from_display")},
                "url": f"/desarrollo/{d['id']}",
            }
            for d in DEVELOPMENTS
            if pattern.search(d.get("name", "")) or pattern.search(d.get("colonia", ""))
        ]
        results.extend(matched[:limit])

    # ── Colonias ──────────────────────────────────────────────────────────────
    if "colonia" in requested:
        from data_seed import COLONIAS
        matched = [
            {
                "type": "colonia",
                "id": c["id"],
                "label": c["name"],
                "sub": c.get("alcaldia", ""),
                "meta": {},
                "url": f"/barrios?colonia={c['id']}",
            }
            for c in COLONIAS
            if pattern.search(c.get("name", "")) or pattern.search(c.get("alcaldia", ""))
        ]
        results.extend(matched[:limit])

    # ── Leads (role-gated) ────────────────────────────────────────────────────
    if "lead" in requested and role in ("developer_admin", "developer_member", "superadmin",
                                        "inmobiliaria_admin", "inmobiliaria_member"):
        query_filter: dict = {}
        if role != "superadmin":
            query_filter["dev_org_id"] = tenant_id
        text_filter = {"$regex": q, "$options": "i"}
        query_filter["$or"] = [
            {"client_name": text_filter},
            {"client_email": text_filter},
            {"client_phone": text_filter},
        ]
        docs = await db.dev_leads.find(query_filter, {"_id": 0}).limit(limit).to_list(limit)
        for d in docs:
            results.append({
                "type": "lead",
                "id": d.get("lead_id"),
                "label": d.get("client_name", "Lead"),
                "sub": d.get("project_name", ""),
                "meta": {"status": d.get("status"), "heat_tag": d.get("heat_tag")},
                "url": f"/desarrollador/leads?id={d.get('lead_id')}",
            })

    # ── Asesores (advisor-scoped) ─────────────────────────────────────────────
    if "asesor" in requested and role in ("advisor", "asesor_admin", "superadmin"):
        text_filter = {"$regex": q, "$options": "i"}
        filter_q: dict = {"$or": [{"name": text_filter}, {"email": text_filter}]}
        if role != "superadmin":
            filter_q["tenant_id"] = tenant_id
        docs = await db.users.find(
            {**filter_q, "role": {"$in": ["advisor", "asesor_admin"]}},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1}
        ).limit(limit).to_list(limit)
        for d in docs:
            results.append({
                "type": "asesor",
                "id": d.get("user_id"),
                "label": d.get("name", ""),
                "sub": d.get("email", ""),
                "meta": {"role": d.get("role")},
                "url": "/asesor/contactos",
            })

    # Audit search usage
    try:
        from observability import emit_ml_event
        await emit_ml_event(
            db, "search_query_executed", user.user_id,
            tenant_id or "default", role,
            {"query": q, "types": list(requested), "result_count": len(results)},
            {}, {},
        )
    except Exception:
        pass

    return {"results": results[:limit * 3], "query": q, "total": len(results)}
