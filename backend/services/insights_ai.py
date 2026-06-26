"""Phase 4 Batch 22 · services — Insights AI (predictions + recommendations + narrative)."""
from __future__ import annotations
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.insights_ai")

EMERGENT_LLM_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
SONNET_MODEL = "claude-sonnet-4-5-20250929"
HAIKU_MODEL = "claude-haiku-4-5-20251001"
CACHE_TTL_HOURS = 24


def _now():
    return datetime.now(timezone.utc)


async def _budget_ok(db, dev_org_id: str = "default") -> bool:
    try:
        from ai_budget import is_within_budget
        return await is_within_budget(db, dev_org_id)
    except Exception:
        return False


async def _cache_get(db, project_id: str, subtype: str):
    return await db.ai_suggestions.find_one(
        {"entity_type": "project_insight", "entity_id": project_id,
         "subtype": subtype, "status": "active",
         "expires_at": {"$gt": _now().isoformat()}},
        {"_id": 0},
    )


async def _cache_put(db, project_id: str, subtype: str, payload: Dict[str, Any],
                      model: str) -> Dict[str, Any]:
    sug_id = f"sug_{uuid.uuid4().hex[:12]}"
    doc = {
        "id": sug_id,
        "entity_type": "project_insight",
        "entity_id": project_id,
        "subtype": subtype,
        "dev_org_id": "default",
        "payload": payload,
        "status": "active",
        "model": model,
        "generated_at": _now().isoformat(),
        "expires_at": (_now() + timedelta(hours=CACHE_TTL_HOURS)).isoformat(),
        "created_by_ai": True,
    }
    # Mark prior cache stale
    await db.ai_suggestions.update_many(
        {"entity_type": "project_insight", "entity_id": project_id,
         "subtype": subtype, "status": "active"},
        {"$set": {"status": "expired", "expired_at": _now().isoformat()}},
    )
    await db.ai_suggestions.insert_one({**doc})
    return doc


async def _build_context(db, project_id: str) -> Dict[str, Any]:
    p = await db.projects.find_one(
        {"$or": [{"id": project_id}, {"slug": project_id}]}, {"_id": 0},
    ) or {}
    if not p:
        try:
            from data_developments import DEVELOPMENTS_BY_ID
            dev = DEVELOPMENTS_BY_ID.get(project_id)
            if dev:
                p = {
                    "name": dev.get("name", project_id),
                    "stage": dev.get("stage"),
                    "colonia": dev.get("colonia"),
                    "segmento": dev.get("segmento") or dev.get("segment"),
                    "price_from": dev.get("price_from") or dev.get("price_min"),
                }
        except Exception:
            pass
    units_count = await db.units.count_documents({"project_id": project_id})
    units_sold = await db.units.count_documents(
        {"project_id": project_id, "status": {"$in": ["vendido", "vendida"]}}
    )
    leads_30d = await db.leads.count_documents({
        "project_id": project_id,
        "created_at": {"$gte": (_now() - timedelta(days=30)).isoformat()},
    })
    hs = await db.health_scores.find_one(
        {"entity_type": "project", "entity_id": project_id},
        {"_id": 0, "score": 1, "components": 1, "trend_7d": 1},
        sort=[("computed_at", -1)],
    ) or {}
    return {
        "project_id": project_id,
        "name": p.get("name"),
        "stage": p.get("stage"),
        "colonia": p.get("colonia"),
        "segmento": p.get("segmento"),
        "price_from": p.get("price_from"),
        "total_units": units_count,
        "units_sold": units_sold,
        "leads_30d": leads_30d,
        "health_score": hs.get("score"),
        "trend_7d": hs.get("trend_7d"),
    }


async def _call_claude(model: str, system: str, user_text: str) -> Optional[str]:
    if not EMERGENT_LLM_KEY:
        return None
    try:
        from llm_client import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"insight_{uuid.uuid4().hex[:8]}",
            system_message=system,
        ).with_model("anthropic", model)
        return await chat.send_message(UserMessage(text=user_text[:4500]))
    except Exception as e:
        log.warning(f"[insights_ai] Claude error: {e}")
        return None


def _parse_json(raw: str) -> Optional[Any]:
    if not raw:
        return None
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.S).strip()
    try:
        return json.loads(text)
    except Exception:
        return None


# ─── Predictions ─────────────────────────────────────────────────────────────

async def generate_predictions(db, project_id: str) -> Dict[str, Any]:
    cached = await _cache_get(db, project_id, "prediction")
    if cached:
        return {"items": cached["payload"].get("items", []), "cached": True,
                 "model": cached.get("model")}
    if not await _budget_ok(db):
        return {"items": _fallback_predictions(await _build_context(db, project_id)),
                "cached": False, "fallback": True}

    ctx = await _build_context(db, project_id)
    system = (
        "Eres un experto en bienes raíces LATAM. Generas predicciones cuantitativas. "
        "Responde SIEMPRE en es-MX, sin emojis. Solo JSON válido sin markdown:\n"
        '{"items":[{"type":"venta_3m|venta_6m|conversion|absorption_rate","confidence_pct":int 0-100,'
        '"value":"<= 60 chars","reasoning":"<= 180 chars"}]}\n'
        "Devuelve EXACTAMENTE 3 items, ordenados por relevancia."
    )
    raw = await _call_claude(SONNET_MODEL, system,
                               f"CONTEXTO:\n{json.dumps(ctx, ensure_ascii=False, default=str)}")
    data = _parse_json(raw or "")
    items = (data or {}).get("items", []) if isinstance(data, dict) else []
    items = [
        {
            "type": (i.get("type") or "insight")[:30],
            "confidence_pct": min(100, max(0, int(i.get("confidence_pct") or 50))),
            "value": (i.get("value") or "")[:80],
            "reasoning": (i.get("reasoning") or "")[:220],
        }
        for i in items[:3]
    ]
    if not items:
        items = _fallback_predictions(ctx)
    doc = await _cache_put(db, project_id, "prediction", {"items": items}, SONNET_MODEL)
    return {"items": items, "cached": False, "model": doc["model"]}


def _fallback_predictions(ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    out = []
    units = ctx.get("total_units") or 0
    sold = ctx.get("units_sold") or 0
    leads = ctx.get("leads_30d") or 0
    hs = ctx.get("health_score") or 50
    if units > 0:
        absorption = round((sold / units) * 100, 1)
        out.append({
            "type": "absorption_rate",
            "confidence_pct": 70,
            "value": f"{absorption}% absorción actual",
            "reasoning": f"De {units} unidades, {sold} vendidas. Cálculo determinístico.",
        })
    if leads > 0:
        out.append({
            "type": "venta_3m",
            "confidence_pct": 55,
            "value": f"~{max(1, leads // 4)} unidades en 3 meses",
            "reasoning": "Estimación lineal basada en leads recientes (4:1 lead-to-close ratio típico).",
        })
    out.append({
        "type": "conversion",
        "confidence_pct": min(95, max(20, hs)),
        "value": f"Health score {hs}/100",
        "reasoning": "El health score es el mejor indicador disponible sin más data histórica.",
    })
    return out[:3]


# ─── Recommendations ─────────────────────────────────────────────────────────

async def generate_recommendations(db, project_id: str) -> Dict[str, Any]:
    cached = await _cache_get(db, project_id, "recommendation")
    if cached:
        return {"items": cached["payload"].get("items", []), "cached": True,
                 "model": cached.get("model")}
    if not await _budget_ok(db):
        return {"items": _fallback_recommendations(await _build_context(db, project_id)),
                "cached": False, "fallback": True}

    ctx = await _build_context(db, project_id)
    system = (
        "Eres un asesor experto DMX en mercadeo de proyectos inmobiliarios. "
        "Generas recomendaciones accionables, breves, en es-MX, sin emojis. "
        "Solo JSON válido sin markdown:\n"
        '{"items":[{"priority":"high|med|low","title":"<= 70 chars","body":"<= 180 chars",'
        '"expected_impact_pct":int|null,"category":"contenido|precio|distribucion|comercial"}]}\n'
        "Devuelve hasta 5 items, ordenados por prioridad descendente."
    )
    raw = await _call_claude(SONNET_MODEL, system,
                               f"CONTEXTO:\n{json.dumps(ctx, ensure_ascii=False, default=str)}")
    data = _parse_json(raw or "")
    items = (data or {}).get("items", []) if isinstance(data, dict) else []
    valid_priority = {"high", "med", "low"}
    items = [
        {
            "priority": i.get("priority") if i.get("priority") in valid_priority else "med",
            "title": (i.get("title") or "")[:80],
            "body": (i.get("body") or "")[:220],
            "expected_impact_pct": (
                int(i["expected_impact_pct"]) if isinstance(i.get("expected_impact_pct"), (int, float)) else None
            ),
            "category": (i.get("category") or "general")[:30],
        }
        for i in items[:5]
    ]
    if not items:
        items = _fallback_recommendations(ctx)
    doc = await _cache_put(db, project_id, "recommendation", {"items": items}, SONNET_MODEL)
    return {"items": items, "cached": False, "model": doc["model"]}


def _fallback_recommendations(ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    out = []
    if (ctx.get("health_score") or 0) < 70:
        out.append({
            "priority": "high",
            "title": "Mejora la salud del proyecto",
            "body": "El health score está por debajo de 70. Revisa documentos pendientes, fotos faltantes y leads sin atender.",
            "expected_impact_pct": 25,
            "category": "general",
        })
    if (ctx.get("leads_30d") or 0) < 5:
        out.append({
            "priority": "high",
            "title": "Activa el portal público",
            "body": "Has captado pocos leads este mes. Comparte el link público + crea links UTM por canal.",
            "expected_impact_pct": 40,
            "category": "comercial",
        })
    out.append({
        "priority": "med",
        "title": "Sube fotos de los prototipos",
        "body": "Los proyectos con galerías completas convierten 1.8x mejor en el marketplace.",
        "expected_impact_pct": 18,
        "category": "contenido",
    })
    return out[:5]


# ─── Narrative ───────────────────────────────────────────────────────────────

async def generate_narrative(db, project_id: str, period: str = "30d",
                              force: bool = False) -> Dict[str, Any]:
    if not force:
        cached = await _cache_get(db, project_id, f"narrative_{period}")
        if cached:
            return {"text": cached["payload"].get("text", ""), "cached": True,
                     "model": cached.get("model")}
    if not await _budget_ok(db):
        ctx = await _build_context(db, project_id)
        return {"text": _fallback_narrative(ctx, period), "cached": False, "fallback": True}

    ctx = await _build_context(db, project_id)
    system = (
        "Eres un analista DMX. Escribe un párrafo narrativo en español de México (es-MX), "
        "≤200 palabras, sin emojis ni markdown. Tono profesional, accionable, basado solo en "
        "los datos del contexto. No inventes números."
    )
    user = f"PERIODO: {period}\nCONTEXTO:\n{json.dumps(ctx, ensure_ascii=False, default=str)}"
    raw = await _call_claude(SONNET_MODEL, system, user)
    text = (raw or "").strip()[:2400]
    if not text:
        text = _fallback_narrative(ctx, period)
    doc = await _cache_put(db, project_id, f"narrative_{period}",
                              {"text": text}, SONNET_MODEL)
    return {"text": text, "cached": False, "model": doc["model"]}


def _fallback_narrative(ctx: Dict[str, Any], period: str) -> str:
    return (
        f"En los últimos {period}, {ctx.get('name', 'el proyecto')} muestra "
        f"{ctx.get('leads_30d', 0)} leads nuevos sobre un inventario de "
        f"{ctx.get('total_units', 0)} unidades y {ctx.get('units_sold', 0)} cerradas. "
        f"Health score actual: {ctx.get('health_score', 'N/D')}. "
        "Esta narrativa es determinística porque la generación con IA no está disponible "
        "en este momento (presupuesto agotado o servicio offline)."
    )


# ─── Resumen narrative for Sub-A (Haiku, shorter) ────────────────────────────

async def generate_resumen_narrative(db, project_id: str) -> str:
    cached = await _cache_get(db, project_id, "resumen_narrative")
    if cached:
        return cached["payload"].get("text", "")
    if not await _budget_ok(db):
        ctx = await _build_context(db, project_id)
        return _fallback_narrative(ctx, "30d")[:480]
    ctx = await _build_context(db, project_id)
    system = (
        "Eres un asistente DMX. Resume el estado de este proyecto en ≤80 palabras, "
        "es-MX, sin emojis ni markdown. Solo texto plano. Tono ejecutivo."
    )
    raw = await _call_claude(HAIKU_MODEL, system,
                               f"CONTEXTO:\n{json.dumps(ctx, ensure_ascii=False, default=str)}")
    text = (raw or "").strip()[:800]
    if not text:
        text = _fallback_narrative(ctx, "30d")[:480]
    await _cache_put(db, project_id, "resumen_narrative",
                       {"text": text}, HAIKU_MODEL)
    return text
