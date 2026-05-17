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
