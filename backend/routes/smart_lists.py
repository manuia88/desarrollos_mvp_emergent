"""W5.ASR.3 Parte 1 · Smart Lists Routes (asesor).

Endpoints:
  GET /api/asesor/smart-lists/presets               · metadata pública 5 presets
  GET /api/asesor/smart-lists/counts                · auth · {preset_key: count}
  GET /api/asesor/smart-lists/{preset_key}/leads    · auth · paginado
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("dmx.smart_lists_routes")
router = APIRouter(tags=["smart-lists"])

# Rate-limit counts 60/min/asesor (sliding window)
_RATE_BUCKETS: Dict[str, List[float]] = {}
RATE_CAP = 60
RATE_WINDOW_S = 60


def _check_rate(key: str) -> bool:
    now = time.monotonic()
    bucket = _RATE_BUCKETS.setdefault(key, [])
    pruned = [t for t in bucket if now - t < RATE_WINDOW_S]
    _RATE_BUCKETS[key] = pruned
    if len(pruned) >= RATE_CAP:
        return False
    pruned.append(now)
    return True


def _db(request: Request):
    return request.app.state.db


async def _auth_asesor(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    role = (getattr(user, "role", "") or "").lower()
    allowed = {"advisor", "asesor", "asesor_admin", "asesor_freelance",
               "broker", "superadmin"}
    if role not in allowed:
        raise HTTPException(403, "Solo asesores tienen acceso a smart lists")
    return user


# ─── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/api/asesor/smart-lists/presets")
async def get_presets() -> Dict[str, Any]:
    """Metadata pública de los 5 presets (sin auth · usado para hidratar UI)."""
    from smart_lists_engine import list_presets
    return {"presets": list_presets()}


@router.get("/api/asesor/smart-lists/counts")
async def get_counts(request: Request) -> Dict[str, Any]:
    """Counts cacheados (TTL 5 min) por (asesor, preset). Rate-limit 60/min/asesor."""
    user = await _auth_asesor(request)
    asesor_id = getattr(user, "user_id", "") or "anon"
    if not _check_rate(asesor_id):
        raise HTTPException(429, "Límite de 60 solicitudes/min alcanzado")
    db = _db(request)
    from smart_lists_engine import count_all_presets
    counts = await count_all_presets(db, asesor_id)
    return {"counts": counts}


@router.get("/api/asesor/smart-lists/{preset_key}/leads")
async def get_leads_in_preset(
    preset_key: str, request: Request,
    limit: int = 50, offset: int = 0,
) -> Dict[str, Any]:
    """Lista paginada de leads que matchean el preset · shape contacto-compatible."""
    user = await _auth_asesor(request)
    asesor_id = getattr(user, "user_id", "") or "anon"
    db = _db(request)

    from smart_lists_engine import get_preset, list_leads_in_preset
    if not get_preset(preset_key):
        raise HTTPException(404, f"Preset '{preset_key}' no encontrado")

    items = await list_leads_in_preset(
        db, preset_key, asesor_id, limit=limit, offset=offset,
    )
    return {
        "preset_key": preset_key,
        "items": items,
        "count": len(items),
        "limit": limit,
        "offset": offset,
    }


# ═════════════════════════════════════════════════════════════════════════════
# W5.ASR.3 Parte 2 — Broker rollup cross-asesor (director/admin only)
# ═════════════════════════════════════════════════════════════════════════════

# Cache rollup por org_id (TTL 5 min)
import time as _rt_time
_ROLLUP_CACHE: Dict[str, tuple] = {}
_ROLLUP_TTL_S = 300
_ROLLUP_RATE: Dict[str, list] = {}


async def _auth_director(request: Request):
    """Auth para director/admin de inmobiliaria. Roles permitidos:
    developer_admin · developer_director · inmobiliaria_admin · superadmin.
    """
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    role = (getattr(user, "role", "") or "").lower()
    allowed = {"developer_admin", "developer_director",
               "inmobiliaria_admin", "superadmin"}
    if role not in allowed:
        raise HTTPException(403, "Solo directores/admins de inmobiliaria")
    return user


@router.get("/api/inmobiliaria/smart-lists/rollup")
async def get_smart_lists_rollup(request: Request) -> Dict[str, Any]:
    """Rollup cross-asesor: por cada preset · total + breakdown per_asesor."""
    user = await _auth_director(request)
    db = _db(request)
    role = (getattr(user, "role", "") or "").lower()
    org_id = getattr(user, "tenant_id", None) or "default"
    cache_key = f"{org_id}::{role}"

    # Rate-limit 30/min/(org+role)
    now_mono = _rt_time.monotonic()
    bucket = _ROLLUP_RATE.setdefault(cache_key, [])
    pruned = [t for t in bucket if now_mono - t < 60]
    _ROLLUP_RATE[cache_key] = pruned
    if len(pruned) >= 30:
        raise HTTPException(429, "Límite 30/min alcanzado")
    pruned.append(now_mono)

    # Cache hit
    entry = _ROLLUP_CACHE.get(cache_key)
    if entry and (_rt_time.monotonic() - entry[1]) < _ROLLUP_TTL_S:
        return {**entry[0], "_cache": "hit"}

    # Resolver asesores del org
    asesor_filter: Dict[str, Any] = {"role": {"$in": ["advisor", "asesor_admin",
                                                      "asesor_freelance"]}}
    if role != "superadmin":
        asesor_filter["tenant_id"] = org_id
    asesores: List[Dict[str, str]] = []
    async for u in db.users.find(
        asesor_filter,
        {"_id": 0, "user_id": 1, "name": 1, "email": 1},
    ).limit(500):
        if u.get("user_id"):
            asesores.append({
                "asesor_id": u["user_id"],
                "asesor_name": u.get("name") or u.get("email") or u["user_id"],
            })

    from smart_lists_engine import PRESETS, count_lead_in_preset
    rollup: Dict[str, Any] = {}
    for preset_key in PRESETS.keys():
        per_asesor_rows: List[Dict[str, Any]] = []
        total = 0
        for ase in asesores:
            try:
                c = await count_lead_in_preset(db, preset_key, ase["asesor_id"])
            except Exception:
                c = 0
            total += c
            per_asesor_rows.append({
                "asesor_id": ase["asesor_id"],
                "asesor_name": ase["asesor_name"],
                "count": c,
            })
        # Orden desc por count para top 3 fácil consumo
        per_asesor_rows.sort(key=lambda r: r["count"], reverse=True)
        rollup[preset_key] = {
            "label": PRESETS[preset_key]["label"],
            "color": PRESETS[preset_key]["color"],
            "icon": PRESETS[preset_key]["icon"],
            "total": total,
            "per_asesor": per_asesor_rows,
            "top_3": per_asesor_rows[:3],
        }

    response = {
        "org_id": org_id,
        "asesores_count": len(asesores),
        "rollup": rollup,
    }
    _ROLLUP_CACHE[cache_key] = (response, _rt_time.monotonic())
    return {**response, "_cache": "miss"}
