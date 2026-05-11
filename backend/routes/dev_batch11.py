"""Phase 4 Batch 11 — Contenido / Amenidades / Legal / Comercialización / Unit Drawer.

Endpoints:
  GET  /api/dev/projects/:id/commercialization
  PATCH /api/dev/projects/:id/commercialization
  GET  /api/dev/projects/:id/amenities
  PATCH /api/dev/projects/:id/amenities
  GET  /api/dev/units/:dev_id/:unit_id/price-history
  GET  /api/dev/units/:dev_id/:unit_id/comparables
  GET  /api/dev/units/:dev_id/:unit_id/market-comparables
  POST /api/dev/units/:dev_id/:unit_id/ai-prediction
  PATCH /api/dev/units/:dev_id/:unit_id
  GET  /api/dev/projects/:id/preassignments
  POST /api/dev/projects/:id/preassignments
  DELETE /api/dev/projects/:id/preassignments/:user_id
"""
from __future__ import annotations

import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.batch11")
router = APIRouter(prefix="/api/dev", tags=["batch11"])

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
CLAUDE_HAIKU_MODEL = "claude-haiku-4-5"
AI_PREDICTION_TTL_HOURS = 1


# ─── helpers ─────────────────────────────────────────────────────────────────

def _db(req: Request):
    return req.app.state.db


async def _auth(req: Request):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in ("developer_admin", "developer_member", "superadmin"):
        raise HTTPException(403, "Rol no autorizado")
    return user


def _tenant(user) -> str:
    return getattr(user, "tenant_id", None) or getattr(user, "org_id", None) or "default"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid(prefix: str = "b11") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _user_dev_ids(user) -> List[str]:
    from data_developments import DEVELOPMENTS
    if user.role == "superadmin":
        return [d["id"] for d in DEVELOPMENTS]
    tenant = _tenant(user)
    ids = [d["id"] for d in DEVELOPMENTS if d.get("developer_id", "").startswith(tenant.split("_")[-1][:3])]
    return ids or [DEVELOPMENTS[0]["id"], DEVELOPMENTS[1]["id"]]


async def _safe_audit(db, user, action: str, entity_type: str, entity_id: str,
                      before: Any, after: Any, request: Request, ml_event: str,
                      ml_context: Optional[Dict] = None):
    try:
        import audit_log as al
        import asyncio
        asyncio.create_task(al.log_mutation(
            db, user_id=user.user_id, role=user.role, org_id=_tenant(user),
            action=action, entity_type=entity_type, entity_id=entity_id,
            before=before, after=after, ip=request.client.host if request.client else None,
        ))
        from observability import emit_ml_event
        asyncio.create_task(emit_ml_event(
            db, ml_event, user.user_id, _tenant(user), user.role,
            context=ml_context or {},
        ))
    except Exception:
        pass


async def _claude_haiku(db, dev_org_id: str, system: str, user_text: str,
                        session_id: str, call_type: str) -> Optional[Dict]:
    if not EMERGENT_LLM_KEY:
        return None
    try:
        from ai_budget import is_within_budget
        if not await is_within_budget(db, dev_org_id):
            return None
    except Exception:
        pass
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=system + "\n\nResponde EXCLUSIVAMENTE con JSON válido sin markdown ni backticks.",
        ).with_model("anthropic", CLAUDE_HAIKU_MODEL)
        raw = await chat.send_message(UserMessage(text=user_text[:6000]))
        if raw:
            t_in = (len(system) + len(user_text[:6000])) // 4
            t_out = len(raw) // 4
            try:
                from ai_budget import track_ai_call
                await track_ai_call(db, dev_org_id, CLAUDE_HAIKU_MODEL, 0, call_type,
                                    tokens_in=t_in, tokens_out=t_out)
            except Exception:
                pass
            text = raw.strip()
            if text.startswith("```"):
                text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.S).strip()
            return json.loads(text)
    except Exception as e:
        log.warning(f"[batch11] Claude error: {e}")
    return None


# ══════════════════════════════════════════════════════════════════════════════
# AMENIDADES
# ══════════════════════════════════════════════════════════════════════════════

ALL_AMENIDADES = {
    "comunes": {
        "alberca": "Alberca", "gym": "Gimnasio", "roof": "Rooftop",
        "spa": "Spa", "salon_eventos": "Salón de eventos",
        "sky_lounge": "Sky Lounge", "cava": "Cava",
        "area_pets": "Área de mascotas", "jardines": "Jardines",
        "cowork": "Coworking", "business_center": "Business Center",
    },
    "internas": {
        "closet": "Clóset integrado", "cocina_equipada": "Cocina equipada",
        "bodega": "Bodega", "balcon": "Balcón/Terraza privada",
        "cuarto_servicio": "Cuarto de servicio",
    },
    "tecnologicas": {
        "domotica": "Domótica", "cargador_ev": "Cargador VE",
        "fibra_optica": "Fibra óptica", "seguridad": "Sistema de seguridad 24h",
        "acceso_biometrico": "Acceso biométrico",
    },
    "sustentabilidad": {
        "paneles_solares": "Paneles solares", "cisterna": "Cisterna",
        "huertos": "Huertos urbanos", "bicicletas": "Estacionamiento bicis",
        "pet": "Pet-friendly certificado", "estacionamiento": "Estacionamiento incluido",
        "concierge": "Concierge",
    },
}


@router.get("/projects/{project_id}/amenities")
async def get_amenities(project_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    doc = await db.project_amenities.find_one(
        {"project_id": project_id, "dev_org_id": _tenant(user)}, {"_id": 0}
    )
    if doc:
        return doc

    # Fall back to seed data
    from data_developments import DEVELOPMENTS
    dev = next((d for d in DEVELOPMENTS if d["id"] == project_id), None)
    seed = dev.get("amenities", []) if dev else []
    return {
        "project_id": project_id,
        "amenities": seed,
        "all_categories": ALL_AMENIDADES,
    }


class AmenitiesPatch(BaseModel):
    amenities: List[str]


@router.patch("/projects/{project_id}/amenities")
async def patch_amenities(project_id: str, payload: AmenitiesPatch, request: Request):
    user = await _auth(request)
    if user.role not in ("developer_admin", "superadmin"):
        raise HTTPException(403, "Solo developer_admin puede editar amenidades")
    db = _db(request)
    dev_ids = _user_dev_ids(user)
    if project_id not in dev_ids:
        raise HTTPException(403, "Proyecto no accesible")

    now_iso = _now().isoformat()
    old = await db.project_amenities.find_one({"project_id": project_id}, {"_id": 0})
    update = {
        "project_id": project_id, "dev_org_id": _tenant(user),
        "amenities": payload.amenities,
        "updated_at": now_iso, "updated_by": user.user_id,
    }
    await db.project_amenities.update_one(
        {"project_id": project_id, "dev_org_id": _tenant(user)},
        {"$set": update}, upsert=True
    )
    await _safe_audit(db, user, "update", "amenidades", project_id,
                      before=old, after=update, request=request,
                      ml_event="amenities_changed",
                      ml_context={"project_id": project_id, "count": len(payload.amenities)})
    return {"ok": True, "amenities": payload.amenities}


# ══════════════════════════════════════════════════════════════════════════════
# COMERCIALIZACIÓN
# ══════════════════════════════════════════════════════════════════════════════

class CommercializationPatch(BaseModel):
    works_with_brokers: Optional[bool] = None
    default_commission_pct: Optional[float] = Field(None, ge=0, le=15)
    iva_included: Optional[bool] = None
    broker_terms: Optional[str] = None
    in_house_only: Optional[bool] = None
    approved_inmobiliarias: Optional[List[str]] = None


@router.get("/projects/{project_id}/commercialization")
async def get_commercialization(project_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    doc = await db.project_commercialization.find_one(
        {"project_id": project_id, "dev_org_id": _tenant(user)}, {"_id": 0}
    )
    if not doc:
        return {
            "project_id": project_id, "works_with_brokers": False,
            "default_commission_pct": 3.0, "iva_included": False,
            "broker_terms": "", "in_house_only": True,
            "approved_inmobiliarias": [],
        }
    return doc


@router.patch("/projects/{project_id}/commercialization")
async def patch_commercialization(project_id: str, payload: CommercializationPatch, request: Request):
    user = await _auth(request)
    if user.role not in ("developer_admin", "superadmin"):
        raise HTTPException(403, "Solo developer_admin puede editar política comercial")
    db = _db(request)
    dev_ids = _user_dev_ids(user)
    if project_id not in dev_ids:
        raise HTTPException(403, "Proyecto no accesible")

    old = await db.project_commercialization.find_one({"project_id": project_id}, {"_id": 0})
    now_iso = _now().isoformat()
    changes = {k: v for k, v in payload.dict(exclude_none=True).items()}
    base = old or {"project_id": project_id, "dev_org_id": _tenant(user)}
    update = {**base, **changes, "updated_at": now_iso, "updated_by": user.user_id}

    await db.project_commercialization.update_one(
        {"project_id": project_id, "dev_org_id": _tenant(user)},
        {"$set": update}, upsert=True
    )
    await _safe_audit(db, user, "update", "commercialization", project_id,
                      before=old, after=update, request=request,
                      ml_event="commercialization_changed",
                      ml_context={"project_id": project_id, "changed_fields": list(changes.keys())})
    return {"ok": True, **update}


# ══════════════════════════════════════════════════════════════════════════════
# PRE-ASSIGNMENTS
# ══════════════════════════════════════════════════════════════════════════════

class PreAssignCreate(BaseModel):
    user_id: str
    commission_pct: Optional[float] = Field(None, ge=0, le=20)


@router.get("/projects/{project_id}/preassignments")
async def list_preassignments(project_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    items = await db.project_preassignments.find(
        {"project_id": project_id, "dev_org_id": _tenant(user)}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    # Resolve user names
    ids = [x["assigned_user_id"] for x in items]
    name_map = {}
    if ids:
        async for u in db.users.find({"user_id": {"$in": ids}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1}):
            name_map[u["user_id"]] = u
    for it in items:
        it["user_info"] = name_map.get(it["assigned_user_id"], {})
    return {"items": items, "project_id": project_id}


@router.post("/projects/{project_id}/preassignments")
async def create_preassignment(project_id: str, payload: PreAssignCreate, request: Request):
    user = await _auth(request)
    if user.role not in ("developer_admin", "superadmin"):
        raise HTTPException(403, "Solo developer_admin puede pre-asignar asesores")
    db = _db(request)
    dev_ids = _user_dev_ids(user)
    if project_id not in dev_ids:
        raise HTTPException(403, "Proyecto no accesible")

    existing = await db.project_preassignments.find_one({
        "project_id": project_id, "assigned_user_id": payload.user_id
    })
    if existing:
        raise HTTPException(409, "Asesor ya pre-asignado a este proyecto")

    now_iso = _now().isoformat()
    doc = {
        "id": _uid("pa"),
        "project_id": project_id,
        "dev_org_id": _tenant(user),
        "assigned_user_id": payload.user_id,
        "commission_pct": payload.commission_pct,
        "created_at": now_iso,
        "created_by": user.user_id,
    }
    await db.project_preassignments.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.delete("/projects/{project_id}/preassignments/{assigned_user_id}")
async def delete_preassignment(project_id: str, assigned_user_id: str, request: Request):
    user = await _auth(request)
    if user.role not in ("developer_admin", "superadmin"):
        raise HTTPException(403, "Solo developer_admin puede modificar pre-asignaciones")
    db = _db(request)
    await db.project_preassignments.delete_one({
        "project_id": project_id,
        "assigned_user_id": assigned_user_id,
        "dev_org_id": _tenant(user),
    })
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# UNIT ENRICHED DATA
# ══════════════════════════════════════════════════════════════════════════════

def _get_unit(dev_id: str, unit_id: str):
    from data_developments import DEVELOPMENTS
    dev = next((d for d in DEVELOPMENTS if d["id"] == dev_id), None)
    if not dev:
        return None, None
    unit = next((u for u in dev.get("units", []) if u["id"] == unit_id or u.get("unit_number") == unit_id), None)
    return dev, unit


@router.get("/units/{dev_id}/{unit_id}/price-history")
async def get_unit_price_history(dev_id: str, unit_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    # Real price changes from audit log
    history = []
    async for entry in db.audit_log.find(
        {"entity_id": f"{dev_id}__{unit_id}", "entity_type": "unit", "action": "update"},
        {"_id": 0}
    ).sort("created_at", -1).limit(24):
        before = entry.get("before") or {}
        after = entry.get("after") or {}
        if before.get("price") != after.get("price") and after.get("price"):
            history.append({
                "date": entry.get("created_at"),
                "price_before": before.get("price"),
                "price_after": after.get("price"),
                "changed_by": entry.get("user_id"),
                "reason": after.get("price_change_reason", ""),
            })

    # Deterministic synthetic history if none (so UI always has data)
    dev, unit = _get_unit(dev_id, unit_id)
    if not history and unit and unit.get("price"):
        seed = abs(hash(f"{dev_id}{unit_id}")) % 1000
        base_price = unit["price"]
        from datetime import date
        today = _now()
        for i in range(6, 0, -1):
            delta = 1 + (seed * i % 5) / 100
            month = today - timedelta(days=30 * i)
            history.append({
                "date": month.isoformat(),
                "price_before": int(base_price / delta),
                "price_after": int(base_price / (delta * 0.99)),
                "changed_by": "sistema",
                "reason": "Ajuste de mercado",
                "synthetic": True,
            })
        history.append({
            "date": today.isoformat(),
            "price_before": history[-1]["price_after"],
            "price_after": base_price,
            "changed_by": "sistema",
            "reason": "Precio actual",
            "synthetic": True,
        })

    colonia_avg = None
    if dev and unit and unit.get("price"):
        # Get avg price/m2 from same colonia units
        area = unit.get("area_total") or unit.get("area", 0)
        if area:
            colonia_id = dev.get("colonia_id", dev.get("colonia", ""))
            from data_developments import DEVELOPMENTS
            similar = [
                u2["price"] / (u2.get("area_total") or u2.get("area", 1))
                for d in DEVELOPMENTS
                if d.get("colonia_id", d.get("colonia", "")) == colonia_id
                for u2 in d.get("units", [])
                if u2.get("price") and (u2.get("area_total") or u2.get("area"))
            ]
            colonia_avg = int(sum(similar) / len(similar)) if similar else None

    return {
        "unit_id": unit_id,
        "dev_id": dev_id,
        "current_price": unit["price"] if unit else None,
        "area": unit.get("area_total") or unit.get("area") if unit else None,
        "colonia_avg_price_m2": colonia_avg,
        "history": history,
    }


@router.get("/units/{dev_id}/{unit_id}/comparables")
async def get_unit_comparables(dev_id: str, unit_id: str, request: Request):
    user = await _auth(request)
    dev, unit = _get_unit(dev_id, unit_id)
    if not unit:
        raise HTTPException(404, "Unidad no encontrada")

    proto = unit.get("prototype")
    same_proto = [
        {
            "unit_number": u["unit_number"],
            "status": u.get("status", "disponible"),
            "price": u.get("price"),
            "level": u.get("level"),
            "area_total": u.get("area_total") or u.get("area"),
            "is_current": u["id"] == unit_id or u.get("unit_number") == unit_id,
        }
        for u in dev.get("units", [])
        if u.get("prototype") == proto
    ]
    vendidas = [u for u in same_proto if u["status"] == "vendido"]
    avg_price = int(sum(u["price"] for u in vendidas if u["price"]) / len(vendidas)) if vendidas else None

    return {
        "prototype": proto,
        "units": same_proto,
        "avg_price_sold": avg_price,
        "total_count": len(same_proto),
        "available_count": sum(1 for u in same_proto if u["status"] == "disponible"),
        "sold_count": len(vendidas),
    }


@router.get("/units/{dev_id}/{unit_id}/market-comparables")
async def get_unit_market_comparables(dev_id: str, unit_id: str, request: Request):
    user = await _auth(request)
    dev, unit = _get_unit(dev_id, unit_id)
    if not unit:
        raise HTTPException(404, "Unidad no encontrada")

    colonia_id = dev.get("colonia_id", dev.get("colonia", ""))
    target_area = unit.get("area_total") or unit.get("area", 80)
    target_price = unit.get("price", 0)

    from data_developments import DEVELOPMENTS
    comps = []
    for d in DEVELOPMENTS:
        if d["id"] == dev_id:
            continue
        if d.get("colonia_id", d.get("colonia", "")) != colonia_id:
            continue
        for u in d.get("units", []):
            area = u.get("area_total") or u.get("area", 0)
            if not area or abs(area - target_area) > target_area * 0.3:
                continue
            if not u.get("price"):
                continue
            comps.append({
                "project_name": d["name"],
                "unit_number": u["unit_number"],
                "area_total": area,
                "price": u["price"],
                "price_m2": round(u["price"] / area, 0),
                "status": u.get("status", "disponible"),
            })
        if len(comps) >= 10:
            break

    prices_m2 = [c["price_m2"] for c in comps if c["price_m2"]]
    market_avg = int(sum(prices_m2) / len(prices_m2)) if prices_m2 else None
    my_price_m2 = round(target_price / target_area, 0) if target_area and target_price else None
    vs_market_pct = round((my_price_m2 / market_avg - 1) * 100, 1) if market_avg and my_price_m2 else None

    return {
        "colonia": colonia_id,
        "comparables": comps[:8],
        "market_avg_price_m2": market_avg,
        "my_price_m2": my_price_m2,
        "vs_market_pct": vs_market_pct,
    }


class UnitPatch(BaseModel):
    price: Optional[float] = None
    status: Optional[str] = None
    price_change_reason: Optional[str] = None


@router.patch("/units/{dev_id}/{unit_id}")
async def patch_unit(dev_id: str, unit_id: str, payload: UnitPatch, request: Request):
    user = await _auth(request)
    db = _db(request)
    dev_ids = _user_dev_ids(user)
    if dev_id not in dev_ids:
        raise HTTPException(403, "Proyecto no accesible")

    _, unit = _get_unit(dev_id, unit_id)
    if not unit:
        raise HTTPException(404, "Unidad no encontrada")

    now_iso = _now().isoformat()
    changes = {k: v for k, v in payload.dict(exclude_none=True).items()}

    existing = await db.developer_unit_overrides.find_one({"dev_id": dev_id, "unit_id": unit_id}, {"_id": 0})
    update = {**(existing or {}), **changes,
              "dev_id": dev_id, "unit_id": unit_id,
              "updated_at": now_iso, "updated_by": user.user_id}
    await db.developer_unit_overrides.update_one(
        {"dev_id": dev_id, "unit_id": unit_id},
        {"$set": update}, upsert=True
    )
    await _safe_audit(db, user, "update", "unit", f"{dev_id}__{unit_id}",
                      before=existing, after=update, request=request,
                      ml_event="unit_price_changed" if payload.price else "unit_status_changed",
                      ml_context={"dev_id": dev_id, "unit_id": unit_id, "changes": list(changes.keys())})
    return {"ok": True, **update}


AI_PRED_SYSTEM = """
Eres un modelo de valoración inmobiliaria para LATAM real estate.
Dada la información de una unidad (precio, área, prototipo, colonia, status, comparables),
genera una predicción de cierre en JSON con estos campos exactos:
{
  "prob_cierre_90d_pct": <int 0-100>,
  "prob_si_baja_3pct": <int 0-100>,
  "dias_estimados_cierre": <int>,
  "recomendaciones": [<string>, <string>, <string>],
  "nivel_confianza": "alta|media|baja",
  "cierres_base_historicos": <int>,
  "disclaimer": <string>
}
Responde SÓLO con JSON. Usa español es-MX para strings. No inventes datos de clientes.
"""


@router.post("/units/{dev_id}/{unit_id}/ai-prediction")
async def get_unit_ai_prediction(dev_id: str, unit_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    dev_ids = _user_dev_ids(user)
    if dev_id not in dev_ids:
        raise HTTPException(403, "Proyecto no accesible")

    dev, unit = _get_unit(dev_id, unit_id)
    if not unit:
        raise HTTPException(404, "Unidad no encontrada")

    # Rate-limit: 1x / hour per unit
    cache_key = f"ai_pred_{dev_id}_{unit_id}"
    cached = await db.ai_predictions_cache.find_one({"key": cache_key}, {"_id": 0})
    if cached:
        exp = cached.get("expires_at")
        if exp:
            try:
                exp_dt = datetime.fromisoformat(exp)
                if exp_dt > _now():
                    return {**cached["result"], "from_cache": True, "expires_at": exp}
            except Exception:
                pass

    # Collect context
    colonia = dev.get("colonia_id", dev.get("colonia", ""))
    price = unit.get("price", 0)
    area = unit.get("area_total") or unit.get("area", 0)
    status = unit.get("status", "disponible")

    # Quick comparables for context
    same_proto = [u for u in dev.get("units", []) if u.get("prototype") == unit.get("prototype")]
    sold_count = sum(1 for u in same_proto if u.get("status") == "vendido")
    total_proto = len(same_proto)

    user_text = (
        f"Unidad: {unit.get('unit_number')} | Prototipo: {unit.get('prototype')} | "
        f"Colonia: {colonia} | Precio: ${price:,.0f} MXN | Área: {area}m² | "
        f"Precio/m²: ${(price / area) if area else 0:,.0f} | Status: {status} | "
        f"Misma prototipo: {sold_count} vendidas de {total_proto} total | "
        f"Etapa proyecto: {dev.get('stage','preventa')} | "
        f"Construcción: {dev.get('construction_progress',{}).get('percentage',0) if isinstance(dev.get('construction_progress'),dict) else 0}% "
        f"Entrega estimada: {dev.get('delivery_estimate','N/A')}"
    )

    result = await _claude_haiku(
        db, _tenant(user), AI_PRED_SYSTEM, user_text,
        session_id=f"unit_pred_{dev_id}_{unit_id}",
        call_type="unit_ai_prediction"
    )

    if not result:
        # Fallback stub
        result = {
            "prob_cierre_90d_pct": max(10, min(85, int(sold_count / max(1, total_proto) * 100 + 15))),
            "prob_si_baja_3pct": max(15, min(90, int(sold_count / max(1, total_proto) * 100 + 22))),
            "dias_estimados_cierre": 45 + (total_proto - sold_count) * 5,
            "recomendaciones": [
                "Revisar pricing vs colonia", "Mejorar fotos del inmueble",
                "Aumentar visibilidad en portales",
            ],
            "nivel_confianza": "baja",
            "cierres_base_historicos": sold_count,
            "disclaimer": "Estimación basada en datos históricos internos. No garantiza resultados futuros.",
            "stub": True,
        }

    # Cache it
    expires_at = (_now() + timedelta(hours=AI_PREDICTION_TTL_HOURS)).isoformat()
    await db.ai_predictions_cache.update_one(
        {"key": cache_key},
        {"$set": {"key": cache_key, "result": result, "expires_at": expires_at}},
        upsert=True
    )

    await _safe_audit(db, user, "read", "unit_ai_prediction", f"{dev_id}__{unit_id}",
                      before=None, after=None, request=request,
                      ml_event="unit_ai_prediction_requested",
                      ml_context={"dev_id": dev_id, "unit_id": unit_id})

    return {**result, "from_cache": False, "expires_at": expires_at}


# ══════════════════════════════════════════════════════════════════════════════
# UNIT ENGAGEMENT  (stub honesto enriquecido con IE scores si existen)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/units/{dev_id}/{unit_id}/engagement")
async def get_unit_engagement(dev_id: str, unit_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    dev_ids = _user_dev_ids(user)
    if dev_id not in dev_ids:
        raise HTTPException(403)

    # Try real engagement from PostHog-style event tracking if implemented
    real = await db.unit_engagement.find_one({"dev_id": dev_id, "unit_id": unit_id}, {"_id": 0})
    if real:
        return real

    # Deterministic stub seeded by unit_id for consistent demo data
    seed = abs(hash(f"{dev_id}{unit_id}")) % 997
    base = (seed % 80) + 20
    return {
        "unit_id": unit_id, "dev_id": dev_id, "is_stub": True,
        "asesores": {
            "vistas": base,
            "clicks_fotos": int(base * 0.7),
            "clicks_precios": int(base * 0.4),
            "tiempo_promedio_seg": 45 + seed % 60,
            "compartidos": seed % 8,
            "citas_agendadas": seed % 4,
            "mensajes_caya": seed % 6,
            "intent_score": round(30 + (seed % 50), 1),
        },
        "clientes": {
            "busquedas": int(base * 1.4),
            "vistas": int(base * 0.9),
            "clicks_fotos": int(base * 0.5),
            "guardados_favoritos": seed % 10,
            "tiempo_promedio_seg": 30 + seed % 45,
            "compartidos": seed % 5,
            "intent_score_avg": round(25 + (seed % 45), 1),
        },
        "funnel": [
            {"stage": "Impresiones", "count": base * 4},
            {"stage": "Vistas", "count": base},
            {"stage": "Interés", "count": int(base * 0.45)},
            {"stage": "Contacto", "count": int(base * 0.15)},
            {"stage": "Cita", "count": seed % 5},
        ],
    }



async def ensure_batch11_indexes(db):
    await db.project_commercialization.create_index(
        [("project_id", 1), ("dev_org_id", 1)], unique=True, background=True
    )
    await db.project_amenities.create_index(
        [("project_id", 1), ("dev_org_id", 1)], background=True
    )
    await db.project_preassignments.create_index(
        [("project_id", 1), ("assigned_user_id", 1)], unique=True, background=True
    )
    await db.ai_predictions_cache.create_index(
        "key", unique=True, background=True
    )
    await db.ai_predictions_cache.create_index(
        "expires_at", expireAfterSeconds=3600, background=True
    )


# ══════════════════════════════════════════════════════════════════════════════
# ASSETS — Set Cover Role (B11 cover badge)
# ══════════════════════════════════════════════════════════════════════════════

class AssetRolePatch(BaseModel):
    role: str  # 'cover' | 'normal'


@router.patch("/projects/{project_id}/assets/{asset_id}/role", include_in_schema=False)
async def patch_asset_role_alias(project_id: str, asset_id: str, payload: AssetRolePatch, request: Request):
    """Lightweight alias that stores asset role in project_asset_meta."""
    user = await _auth(request)
    db = _db(request)
    now_iso = _now().isoformat()
    if payload.role == "cover":
        # Unset any existing cover for this project
        await db.project_asset_meta.update_many(
            {"project_id": project_id, "role": "cover"},
            {"$set": {"role": "normal", "updated_at": now_iso}},
        )
    await db.project_asset_meta.update_one(
        {"project_id": project_id, "asset_id": asset_id},
        {"$set": {
            "project_id": project_id,
            "asset_id": asset_id,
            "role": payload.role,
            "updated_at": now_iso,
            "updated_by": user.user_id,
        }},
        upsert=True,
    )
    return {"ok": True, "asset_id": asset_id, "role": payload.role}
