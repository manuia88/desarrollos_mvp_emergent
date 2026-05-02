"""
IE Engine · Phase C2 — N5 LLM Narrative generator + cache + endpoints.

Diseño:
  - Cache hit si (scope, entity_id) tiene narrativa no expirada (7 días) Y scores no cambiaron ≥5 puntos abs.
  - Cache miss → llama Claude Sonnet 4.5 con temperature=0.3, max_tokens=300.
  - Persiste scores_snapshot para detectar drift posterior.
  - Cap budget $5/sesión (approx): tracked en narrative_budget collection con cost_usd por call.

Schema ie_narratives:
  { _id (uuid), scope: "colonia"|"development", entity_id, narrative_text,
    prompt_version, scores_snapshot: {code: value}, generated_at, expires_at,
    model: "claude-sonnet-4-5-20250929", input_tokens, output_tokens, cost_usd }
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from recipes.narrative.prompts import (
    PROMPT_VERSION,
    SYSTEM_PROMPT_COLONIA,
    SYSTEM_PROMPT_PROYECTO,
    build_user_prompt_colonia,
    build_user_prompt_proyecto,
)

# Claude Sonnet 4.5 pricing (2025): $3/M input, $15/M output (approx)
PRICE_IN_PER_1K = 0.003
PRICE_OUT_PER_1K = 0.015
SESSION_BUDGET_CAP_USD = 5.0
CACHE_TTL_DAYS = 7
DRIFT_THRESHOLD = 5.0           # abs punto diff en cualquier score N1-N4 → invalida cache

pub_router = APIRouter(prefix="/api", tags=["narratives"])
sa_router = APIRouter(prefix="/api/superadmin", tags=["narratives-admin"])


def _ensure_aware(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _now():
    return datetime.now(timezone.utc)


def _scores_changed(prev_snap: Dict[str, float], current_scores: Dict[str, Dict[str, Any]]) -> bool:
    """Returns True if any score drifted ≥ DRIFT_THRESHOLD."""
    if not prev_snap:
        return True
    for code, data in current_scores.items():
        v_now = data.get("value")
        if v_now is None:
            continue
        v_prev = prev_snap.get(code)
        if v_prev is None:
            return True  # new score appeared
        if abs(float(v_now) - float(v_prev)) >= DRIFT_THRESHOLD:
            return True
    return False


def _build_snapshot(scores: Dict[str, Dict[str, Any]]) -> Dict[str, float]:
    return {code: float(d["value"]) for code, d in scores.items() if d.get("value") is not None}


async def _fetch_scores_map(db, zone_id: str) -> Dict[str, Dict[str, Any]]:
    """Returns {code: {value, tier, confidence, is_stub}} real only."""
    docs = await db.ie_scores.find(
        {"zone_id": zone_id, "is_stub": False, "value": {"$ne": None}},
        {"_id": 0, "code": 1, "value": 1, "tier": 1, "confidence": 1},
    ).to_list(length=100)
    return {d["code"]: d for d in docs}


async def _session_budget_used(db) -> float:
    """Sum cost_usd of narratives generated in the last 1 hour (pragmatic 'session')."""
    since = _now() - timedelta(hours=1)
    pipe = [{"$match": {"generated_at": {"$gte": since}}},
            {"$group": {"_id": None, "cost": {"$sum": "$cost_usd"}}}]
    res = await db.ie_narratives.aggregate(pipe).to_list(length=1)
    return float(res[0]["cost"]) if res else 0.0


async def _generate_narrative(scope: str, entity_id: str, system_prompt: str, user_prompt: str) -> Dict[str, Any]:
    """Single Claude call. Returns {text, input_tokens, output_tokens, cost_usd, model}."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY no configurado")

    model = "claude-sonnet-4-5-20250929"
    chat = LlmChat(
        api_key=api_key,
        session_id=f"ie_narr_{scope}_{entity_id}_{int(_now().timestamp())}",
        system_message=system_prompt,
    ).with_model("anthropic", model)

    resp = await chat.send_message(UserMessage(text=user_prompt))
    text = (resp or "").strip()
    # Hard cap 400 chars
    if len(text) > 400:
        text = text[:397].rstrip() + "…"

    # Token accounting — library does not expose token counts reliably, so approximate
    in_tokens = len(user_prompt) // 4 + len(system_prompt) // 4
    out_tokens = len(text) // 4
    cost = (in_tokens / 1000.0) * PRICE_IN_PER_1K + (out_tokens / 1000.0) * PRICE_OUT_PER_1K

    return {
        "text": text,
        "input_tokens": in_tokens,
        "output_tokens": out_tokens,
        "cost_usd": round(cost, 6),
        "model": model,
    }


async def get_or_generate(db, scope: str, entity_id: str, force: bool = False) -> Dict[str, Any]:
    """Main entry point. Returns narrative doc ready for UI."""
    # Resolve context
    if scope == "colonia":
        try:
            from data_seed import COLONIAS_BY_ID
            col_id_db = entity_id.replace("_", "-")
            col = COLONIAS_BY_ID.get(col_id_db) or COLONIAS_BY_ID.get(entity_id)
        except (ImportError, KeyError):
            col = None
        if not col:
            raise HTTPException(404, f"Colonia {entity_id} no existe")
        zone_for_scores = col["id"].replace("-", "_")
        scores = await _fetch_scores_map(db, zone_for_scores)
        name = col.get("name", entity_id)
        alcaldia = col.get("alcaldia", "CDMX")
        system_prompt = SYSTEM_PROMPT_COLONIA
        user_prompt = build_user_prompt_colonia(name, alcaldia, scores)
        cache_id = zone_for_scores
    else:  # development
        try:
            from data_developments import DEVELOPMENTS_BY_ID, DEVELOPERS_BY_ID
            dev = DEVELOPMENTS_BY_ID.get(entity_id)
        except ImportError:
            dev = None
        if not dev:
            raise HTTPException(404, f"Desarrollo {entity_id} no existe")
        proj_scores = await _fetch_scores_map(db, entity_id)
        col_zone = (dev.get("colonia_id") or "").replace("-", "_")
        col_scores = await _fetch_scores_map(db, col_zone) if col_zone else {}
        developer = DEVELOPERS_BY_ID.get(dev.get("developer_id"))
        system_prompt = SYSTEM_PROMPT_PROYECTO
        user_prompt = build_user_prompt_proyecto(dev.get("name", ""), dev.get("colonia", ""), proj_scores, col_scores, developer)
        scores = {**proj_scores, **{f"colonia_{c}": v for c, v in col_scores.items()}}
        cache_id = entity_id

    # Cache lookup
    existing = await db.ie_narratives.find_one(
        {"scope": scope, "entity_id": cache_id, "prompt_version": PROMPT_VERSION},
        {"_id": 0},
        sort=[("generated_at", -1)],
    )
    cache_valid = (
        existing
        and existing.get("expires_at")
        and _ensure_aware(existing["expires_at"]) > _now()
        and not _scores_changed(existing.get("scores_snapshot", {}), scores)
        and not force
    )
    if cache_valid:
        return {**existing, "cache_hit": True}

    # Budget gate
    used = await _session_budget_used(db)
    if used >= SESSION_BUDGET_CAP_USD:
        # Degrade gracefully: return stub
        if existing:
            return {**existing, "cache_hit": True, "stale": True}
        raise HTTPException(429, f"Cap de presupuesto LLM alcanzado ({used:.2f}/{SESSION_BUDGET_CAP_USD} USD/h). Intenta en 1 hora.")

    # If no real scores → no narrative (cero hallucination)
    if not scores or all(d.get("value") is None for d in scores.values()):
        raise HTTPException(422, "Sin scores reales suficientes para generar narrativa.")

    # Generate
    out = await _generate_narrative(scope, cache_id, system_prompt, user_prompt)
    now = _now()
    doc = {
        "id": uuid.uuid4().hex,
        "scope": scope,
        "entity_id": cache_id,
        "narrative_text": out["text"],
        "prompt_version": PROMPT_VERSION,
        "scores_snapshot": _build_snapshot(scores),
        "generated_at": now,
        "expires_at": now + timedelta(days=CACHE_TTL_DAYS),
        "model": out["model"],
        "input_tokens": out["input_tokens"],
        "output_tokens": out["output_tokens"],
        "cost_usd": out["cost_usd"],
    }
    # AI budget tracking for narrative engine
    try:
        from ai_budget import track_ai_call
        await track_ai_call(
            db, "narrative_engine", out["model"],
            out["input_tokens"] + out["output_tokens"],
            f"narrative_{scope}",
            tokens_in=out["input_tokens"],
            tokens_out=out["output_tokens"],
        )
    except Exception:
        pass
    await db.ie_narratives.insert_one(doc)
    doc.pop("_id", None)
    return {**doc, "cache_hit": False}


# ─── Endpoints públicos ──────────────────────────────────────────────────────
class NarrativeOut(BaseModel):
    id: str
    scope: str
    entity_id: str
    narrative_text: str
    prompt_version: str
    scores_snapshot: Dict[str, float]
    generated_at: datetime
    expires_at: datetime
    model: str
    cache_hit: bool = False


@pub_router.get("/zones/{zone_id}/narrative", response_model=NarrativeOut)
async def public_zone_narrative(zone_id: str, request: Request):
    db = request.app.state.db
    doc = await get_or_generate(db, "colonia", zone_id)
    return NarrativeOut(**{k: doc[k] for k in NarrativeOut.model_fields.keys() if k in doc})


@pub_router.get("/developments/{dev_id}/narrative", response_model=NarrativeOut)
async def public_dev_narrative(dev_id: str, request: Request):
    db = request.app.state.db
    doc = await get_or_generate(db, "development", dev_id)
    return NarrativeOut(**{k: doc[k] for k in NarrativeOut.model_fields.keys() if k in doc})


# ─── Superadmin endpoints ────────────────────────────────────────────────────
async def _require_superadmin(request: Request):
    from server import get_current_user  # local import to avoid cycle
    user = await get_current_user(request)
    if user.role != "superadmin":
        raise HTTPException(403, "Requiere role superadmin")
    return user


@sa_router.post("/narratives/regenerate")
async def force_regenerate(request: Request, id: str = Query(...), scope: str = Query(...)):
    await _require_superadmin(request)
    if scope not in ("colonia", "development"):
        raise HTTPException(400, "scope debe ser colonia|development")
    db = request.app.state.db
    doc = await get_or_generate(db, "colonia" if scope == "colonia" else "development", id, force=True)
    return {
        "id": doc["id"], "scope": doc["scope"], "entity_id": doc["entity_id"],
        "narrative_text": doc["narrative_text"], "cost_usd": doc.get("cost_usd"),
        "cache_hit": doc.get("cache_hit", False),
    }


@sa_router.get("/narratives/budget")
async def budget_status(request: Request):
    await _require_superadmin(request)
    db = request.app.state.db
    used = await _session_budget_used(db)
    total_docs = await db.ie_narratives.count_documents({})
    return {
        "budget_used_1h_usd": round(used, 4),
        "budget_cap_usd": SESSION_BUDGET_CAP_USD,
        "narratives_total": total_docs,
        "prompt_version": PROMPT_VERSION,
    }


@sa_router.post("/narratives/batch-generate")
async def batch_generate(request: Request, scope: str = Query("all")):
    """Pre-calienta cache para todas las colonias + devs (runs one-shot)."""
    await _require_superadmin(request)
    db = request.app.state.db
    results = {"colonia": 0, "development": 0, "cache_hits": 0, "errors": [], "cost_total_usd": 0.0}

    if scope in ("all", "colonia"):
        try:
            from data_seed import COLONIAS
            for c in COLONIAS:
                try:
                    d = await get_or_generate(db, "colonia", c["id"].replace("-", "_"))
                    results["colonia"] += 1
                    if d.get("cache_hit"):
                        results["cache_hits"] += 1
                    else:
                        results["cost_total_usd"] += d.get("cost_usd", 0)
                except Exception as e:  # noqa: BLE001
                    results["errors"].append(f"{c['id']}: {e}")
        except ImportError:
            pass

    if scope in ("all", "development"):
        try:
            from data_developments import DEVELOPMENTS_BY_ID
            for dev_id in DEVELOPMENTS_BY_ID.keys():
                try:
                    d = await get_or_generate(db, "development", dev_id)
                    results["development"] += 1
                    if d.get("cache_hit"):
                        results["cache_hits"] += 1
                    else:
                        results["cost_total_usd"] += d.get("cost_usd", 0)
                except Exception as e:  # noqa: BLE001
                    results["errors"].append(f"{dev_id}: {e}")
        except ImportError:
            pass

    results["cost_total_usd"] = round(results["cost_total_usd"], 5)
    return results


def register_routes(app):
    app.include_router(pub_router)
    app.include_router(sa_router)


async def ensure_indexes(db):
    await db.ie_narratives.create_index([("scope", 1), ("entity_id", 1), ("prompt_version", 1)])
    await db.ie_narratives.create_index([("generated_at", -1)])
    await db.ie_narratives.create_index([("expires_at", 1)])
