"""W7.AS.3.G · Conversation A/B Testing — superadmin REST routes.

Closes the orphan: conversation_ab_testing.py (Terminal E R2) had public functions
but no HTTP surface. This wires 5 superadmin endpoints + indexes + audit.

  POST   /api/superadmin/ab-testing/create
  GET    /api/superadmin/ab-testing/list
  GET    /api/superadmin/ab-testing/results/{test_id}
  POST   /api/superadmin/ab-testing/pick-winner
  DELETE /api/superadmin/ab-testing/{test_id}

Cada endpoint: require_superadmin · rate-limit 30/min · audit_immutable.log en
las mutaciones (create/pick-winner/delete).
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

import conversation_ab_testing as ab

log = logging.getLogger("dmx.routes_conversation_ab")

router = APIRouter(prefix="/api/superadmin/ab-testing", tags=["conversation-ab-testing"])

# ─── Rate limit · 30/min por usuario ──────────────────────────────────────────
RATE_LIMIT = 30
RATE_WINDOW_S = 60
_buckets: Dict[str, List[float]] = defaultdict(list)


def _check_rate(key: str, limit: int = RATE_LIMIT, window_s: int = RATE_WINDOW_S) -> bool:
    if not key:
        return True  # fail-open
    now = time.monotonic()
    _buckets[key] = [t for t in _buckets[key] if now - t < window_s]
    if len(_buckets[key]) >= limit:
        return False
    _buckets[key].append(now)
    return True


async def _require_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if getattr(user, "role", "") != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    if not _check_rate(getattr(user, "user_id", None) or "sa"):
        raise HTTPException(429, "Demasiadas solicitudes, intenta en un momento")
    return user


async def _audit(db, user, action: str, entity_id: str, after=None, request=None):
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": getattr(user, "user_id", "superadmin"),
                   "role": getattr(user, "role", "superadmin")},
            action=action,
            entity_type="conversation_ab_test",
            entity_id=entity_id,
            after=after,
            request=request,
        )
    except Exception as exc:
        log.warning(f"[ab] audit failed silent: {exc}")


# ─── Pydantic models ──────────────────────────────────────────────────────────
class CreateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    prompt_a: str = Field(..., min_length=1)
    prompt_b: str = Field(..., min_length=1)
    description: Optional[str] = Field(None, max_length=1000)
    tenant_id: Optional[str] = None
    split_pct: int = Field(50, ge=0, le=100)


class PickWinnerIn(BaseModel):
    test_id: str = Field(..., min_length=1)
    variant: Optional[str] = None  # "A"|"B" manual · None → auto


# ─── Endpoints ──────────────────────────────────────────────────────────────
@router.post("/create", status_code=201)
async def create_test(body: CreateIn, request: Request):
    user = await _require_superadmin(request)
    db = request.app.state.db
    result = await ab.create_test(
        db, name=body.name, prompt_a=body.prompt_a, prompt_b=body.prompt_b,
        tenant_id=body.tenant_id, split_pct=body.split_pct,
    )
    test_id = result.get("test_id")
    # description no es parámetro de create_test → set posterior (engine untouched)
    if test_id and body.description:
        try:
            await db.conversation_ab_tests.update_one(
                {"_id": test_id}, {"$set": {"description": body.description}})
            result["description"] = body.description
        except Exception as exc:
            log.warning(f"[ab] set description failed: {exc}")
    await _audit(db, user, "ab_test_create", test_id or "?",
                 after={"name": body.name, "split_pct": body.split_pct}, request=request)
    return result


@router.get("/list")
async def list_tests(request: Request, tenant_id: Optional[str] = Query(None)):
    await _require_superadmin(request)
    db = request.app.state.db
    tests = await ab.list_tests(db, tenant_id=tenant_id)
    return {"count": len(tests), "tests": tests}


@router.get("/results/{test_id}")
async def results(test_id: str, request: Request):
    await _require_superadmin(request)
    db = request.app.state.db
    res = await ab.get_results(db, test_id)
    if res.get("error") == "not_found":
        raise HTTPException(404, "Test no encontrado")
    return res


@router.post("/pick-winner", status_code=201)
async def pick_winner(body: PickWinnerIn, request: Request):
    user = await _require_superadmin(request)
    db = request.app.state.db
    res = await ab.pick_winner(db, body.test_id, variant=body.variant)
    if res.get("error") == "not_found":
        raise HTTPException(404, "Test no encontrado")
    if res.get("error") == "invalid_variant":
        raise HTTPException(422, "Variante inválida (usa A o B)")
    await _audit(db, user, "ab_test_pick_winner", body.test_id,
                 after={"winner": res.get("winner"), "mode": res.get("mode")}, request=request)
    return res


@router.delete("/{test_id}")
async def delete_test(test_id: str, request: Request):
    user = await _require_superadmin(request)
    db = request.app.state.db
    try:
        result = await db.conversation_ab_tests.delete_one({"_id": test_id})
        deleted = getattr(result, "deleted_count", 0)
    except Exception as exc:
        log.error(f"[ab] delete failed: {exc}")
        raise HTTPException(500, "Error al eliminar test")
    if not deleted:
        raise HTTPException(404, "Test no encontrado")
    await _audit(db, user, "ab_test_delete", test_id, after={"deleted": True}, request=request)
    return {"ok": True, "test_id": test_id, "deleted": deleted}


# ─── Indexes (called from server startup) ─────────────────────────────────────
async def ensure_indexes(db) -> None:
    """W7.AS.3.G · conversation_ab_tests indexes. Idempotent / fail-soft."""
    try:
        await db.conversation_ab_tests.create_index(
            [("tenant_id", 1), ("status", 1)], background=True)
        await db.conversation_ab_tests.create_index([("status", 1)], background=True)
        await db.conversation_ab_tests.create_index([("created_at", -1)], background=True)
    except Exception as exc:
        log.warning(f"[ab] ensure_indexes failed: {exc}")
