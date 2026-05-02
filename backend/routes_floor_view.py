"""Phase 4 Batch 18 Sub-B — Vista Planta 2.0

Endpoints:
  GET  /api/projects/{project_id}/floors
       → floor list with unit count + status counts per floor
  GET  /api/projects/{project_id}/floors/{floor_number}
       → { layout, units[] with position + status + price + prototipo }
  PUT  /api/projects/{project_id}/floors/{floor_number}/layout
       → upsert floor_layouts (admin only)
  PATCH /api/units/{unit_id}/position
       → body {x, y, width, height} (dev_admin only)

Collections:
  db.floor_layouts         : { project_id, floor_number, svg_background_url,
                               grid_dimensions: {width,height}, updated_at, updated_by }
  db.floor_unit_positions  : { unit_id (unique), project_id, floor_number,
                               position: {x,y,width,height}, updated_at, updated_by }

Edge cases (conservative):
  - Units without saved position → auto-grid placement (documented below).
  - project_id not in static data → 404 immediately.
  - floor_number not in unit levels → empty units[], no 404.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

log = logging.getLogger("dmx.floor_view")
router = APIRouter(tags=["floor_view"])

# ─── Auto-positioning constants ────────────────────────────────────────────────
# Units without a saved position are placed in a readable grid.
# SVG canvas is 1000×800 (normalised).
_AUTO_COLS = 8
_AUTO_W, _AUTO_H = 80, 60
_AUTO_GAP_X, _AUTO_GAP_Y = 16, 16
_MARGIN_X, _MARGIN_Y = 40, 70      # top margin reserves space for a label row


def _auto_pos(idx: int) -> Dict[str, int]:
    col = idx % _AUTO_COLS
    row = idx // _AUTO_COLS
    return {
        "x": _MARGIN_X + col * (_AUTO_W + _AUTO_GAP_X),
        "y": _MARGIN_Y + row * (_AUTO_H + _AUTO_GAP_Y),
        "width": _AUTO_W,
        "height": _AUTO_H,
    }


def _now():
    return datetime.now(timezone.utc)


def _db(request: Request):
    return request.app.state.db


async def _require_dev_admin(request: Request):
    from server import get_current_user
    DEV_ADMIN = {"developer_admin", "superadmin"}
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in DEV_ADMIN:
        raise HTTPException(403, "Acceso restringido a administradores del proyecto")
    return user


async def _any_authenticated(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


def _load_dev(project_id: str):
    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(project_id)
    if not dev:
        raise HTTPException(404, f"Proyecto '{project_id}' no encontrado")
    return dev


# ─── GET /api/projects/{project_id}/floors ────────────────────────────────────

@router.get("/api/projects/{project_id}/floors")
async def list_floors(project_id: str, request: Request):
    """Return available floor numbers + unit counts + status breakdowns."""
    await _any_authenticated(request)
    db = _db(request)
    dev = _load_dev(project_id)

    # Group units by floor (= level field; fallback 1 if None)
    floor_map: Dict[int, List[dict]] = {}
    for u in dev.get("units", []):
        fl = int(u.get("level") or 1)
        floor_map.setdefault(fl, []).append(u)

    # Load layout metadata for each floor
    layout_docs = {}
    if floor_map:
        async for doc in db.floor_layouts.find(
            {"project_id": project_id}, {"_id": 0}
        ):
            layout_docs[int(doc["floor_number"])] = doc

    result = []
    for fl in sorted(floor_map.keys()):
        units = floor_map[fl]
        counts: Dict[str, int] = {}
        for u in units:
            s = u.get("status", "disponible")
            counts[s] = counts.get(s, 0) + 1
        layout = layout_docs.get(fl, {})
        result.append({
            "floor_number": fl,
            "unit_count": len(units),
            "status_counts": counts,
            "has_custom_layout": bool(layout),
            "svg_background_url": layout.get("svg_background_url"),
        })

    return {"project_id": project_id, "floors": result}


# ─── GET /api/projects/{project_id}/floors/{floor_number} ─────────────────────

@router.get("/api/projects/{project_id}/floors/{floor_number}")
async def get_floor_detail(project_id: str, floor_number: int, request: Request):
    """Return layout + units with positions for a specific floor."""
    await _any_authenticated(request)
    db = _db(request)
    dev = _load_dev(project_id)

    # Filter units for this floor
    floor_units = [
        u for u in dev.get("units", [])
        if int(u.get("level") or 1) == floor_number
    ]

    # Load custom positions for these units
    unit_ids = [u["id"] for u in floor_units if "id" in u]
    saved_positions: Dict[str, dict] = {}
    if unit_ids:
        async for doc in db.floor_unit_positions.find(
            {"unit_id": {"$in": unit_ids}}, {"_id": 0}
        ):
            saved_positions[doc["unit_id"]] = doc.get("position", {})

    # Load floor layout metadata
    layout_doc = await db.floor_layouts.find_one(
        {"project_id": project_id, "floor_number": floor_number}, {"_id": 0}
    ) or {}

    # Build response units with positions
    response_units = []
    for idx, u in enumerate(sorted(floor_units, key=lambda x: str(x.get("unit_number", "")))):
        uid = u.get("id", f"{project_id}-{u.get('unit_number','?')}")
        pos = saved_positions.get(uid) or _auto_pos(idx)
        response_units.append({
            "id": uid,
            "unit_number": u.get("unit_number"),
            "floor_number": floor_number,
            "prototype": u.get("prototype"),
            "unit_type_id": u.get("prototype"),   # alias for spec
            "status": u.get("status", "disponible"),
            "price": u.get("price"),
            "bedrooms": u.get("bedrooms"),
            "bathrooms": u.get("bathrooms"),
            "area_total": u.get("m2_total"),
            "area_private": u.get("m2_privative"),
            "orientation": u.get("orientation"),
            "position": pos,
            "is_auto_positioned": uid not in saved_positions,
        })

    return {
        "project_id": project_id,
        "floor_number": floor_number,
        "layout": {
            "grid_dimensions": layout_doc.get("grid_dimensions", {"width": 1000, "height": 800}),
            "svg_background_url": layout_doc.get("svg_background_url"),
        },
        "units": response_units,
        "total": len(response_units),
    }


# ─── PUT /api/projects/{project_id}/floors/{floor_number}/layout ──────────────

class LayoutBody(BaseModel):
    svg_background_url: Optional[str] = None
    grid_dimensions: Optional[Dict[str, int]] = None


@router.put("/api/projects/{project_id}/floors/{floor_number}/layout")
async def upsert_floor_layout(
    project_id: str,
    floor_number: int,
    payload: LayoutBody,
    request: Request,
):
    """Upsert floor layout metadata. dev_admin only."""
    user = await _require_dev_admin(request)
    db = _db(request)
    _load_dev(project_id)   # validates project exists

    updates: Dict[str, Any] = {
        "project_id": project_id,
        "floor_number": floor_number,
        "updated_at": _now(),
        "updated_by": user.user_id,
    }
    if payload.svg_background_url is not None:
        updates["svg_background_url"] = payload.svg_background_url
    if payload.grid_dimensions is not None:
        updates["grid_dimensions"] = payload.grid_dimensions

    await db.floor_layouts.update_one(
        {"project_id": project_id, "floor_number": floor_number},
        {"$set": updates},
        upsert=True,
    )

    # Activity log
    try:
        from routes_dev_batch14 import log_activity
        await log_activity(
            db, user.user_id, "developer_admin",
            f"Layout piso {floor_number} actualizado",
            project_id, "project",
            {"floor_number": floor_number},
        )
    except Exception as exc:
        log.warning(f"[floor_view] activity log failed: {exc}")

    return {"ok": True, "project_id": project_id, "floor_number": floor_number}


# ─── PATCH /api/units/{unit_id}/position ──────────────────────────────────────

class PositionBody(BaseModel):
    x: float
    y: float
    width: float
    height: float
    floor_number: Optional[int] = None


@router.patch("/api/units/{unit_id}/position")
async def patch_unit_position(unit_id: str, payload: PositionBody, request: Request):
    """Reposition a unit on the floor plan. dev_admin only."""
    user = await _require_dev_admin(request)
    db = _db(request)

    # Derive project_id from unit_id (pattern: {project_id}-{unit_num})
    # Conservative: store whatever we receive; project_id is advisory
    parts = unit_id.rsplit("-", 2)
    project_id = parts[0] if len(parts) >= 2 else "unknown"

    pos = {
        "x": max(0.0, payload.x),
        "y": max(0.0, payload.y),
        "width": max(10.0, payload.width),
        "height": max(10.0, payload.height),
    }

    await db.floor_unit_positions.update_one(
        {"unit_id": unit_id},
        {
            "$set": {
                "unit_id": unit_id,
                "project_id": project_id,
                "floor_number": payload.floor_number,
                "position": pos,
                "updated_at": _now(),
                "updated_by": user.user_id,
            }
        },
        upsert=True,
    )

    # Activity log
    try:
        from routes_dev_batch14 import log_activity
        await log_activity(
            db, user.user_id, "developer_admin",
            f"Unidad {unit_id} reposicionada",
            unit_id, "unit",
            {"position": pos, "floor_number": payload.floor_number},
        )
    except Exception as exc:
        log.warning(f"[floor_view] activity log failed: {exc}")

    return {"ok": True, "unit_id": unit_id, "position": pos}


# ─── Indexes ───────────────────────────────────────────────────────────────────

async def ensure_floor_view_indexes(db) -> None:
    await db.floor_layouts.create_index(
        [("project_id", 1), ("floor_number", 1)], unique=True
    )
    await db.floor_unit_positions.create_index("unit_id", unique=True)
    await db.floor_unit_positions.create_index([("project_id", 1), ("floor_number", 1)])
    log.info("[floor_view] indexes OK")
