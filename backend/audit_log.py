"""Phase F0.1 — Audit Log Global Mutations.

Transversal write-audit trail for all critical data mutations.
Fire-and-forget insert keeps p99 latency impact < 1ms per request.

Schema (audit_log):
  _id, ts, actor:{user_id,role,org_id,tenant_id,name},
  action: create|update|delete|revert,
  entity_type, entity_id,
  before:{}, after:{}, diff_keys:[],
  ip, user_agent, route, request_id
"""
from __future__ import annotations

import asyncio
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel

log = logging.getLogger("dmx.audit")

# ─── Router ───────────────────────────────────────────────────────────────────
router = APIRouter(prefix="/api/audit", tags=["audit"])


# ─── Pydantic models ──────────────────────────────────────────────────────────
class AuditActor(BaseModel):
    user_id: str
    role: str
    org_id: Optional[str] = None
    tenant_id: Optional[str] = None
    name: Optional[str] = None
    by_ai: bool = False   # B3: distingue acción de AGENTE/IA vs humano (superadmin lo filtra)


class AuditEntry(BaseModel):
    id: str
    ts: str
    actor: AuditActor
    action: str
    entity_type: str
    entity_id: Optional[str] = None
    before: Optional[Dict[str, Any]] = None
    after: Optional[Dict[str, Any]] = None
    diff_keys: List[str] = []
    ip: Optional[str] = None
    user_agent: Optional[str] = None
    route: Optional[str] = None
    request_id: Optional[str] = None


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uid() -> str:
    return f"audit_{uuid.uuid4().hex[:16]}"


def _compute_diff_keys(before: Optional[Dict], after: Optional[Dict]) -> List[str]:
    """Return keys that changed between before and after."""
    if not before and not after:
        return []
    b = before or {}
    a = after or {}
    all_keys = set(b.keys()) | set(a.keys())
    return [k for k in all_keys if b.get(k) != a.get(k)]


# Entidades sensibles: borrarlas/mutarlas es de máxima gravedad (usuarios, orgs, devs, precios, roles).
_ENTIDADES_CRITICAS = {"user", "usuario", "developer", "development", "dev", "inmobiliaria",
                       "tenant", "org", "role", "permiso", "lead"}


def _derive_severity(action: str, entity_type: Optional[str],
                     before: Optional[Dict], after: Optional[Dict], diff_keys: List[str]) -> str:
    """Palanca 6: deriva severity del audit (antes NUNCA se escribía → critical_24h siempre 0).
    critical = borrado de entidad sensible / autorización denegada.  high = delete/revert o cambio de
    precio grande (>20%).  info = el resto. Determinista, sin dependencias."""
    a = (action or "").lower()
    ent = (entity_type or "").lower()
    if "deny" in a or "denied" in a or "forbidden" in a or ent in {"authz", "authorization"}:
        return "critical"
    if a in {"delete", "purge", "revert"}:
        return "critical" if ent in _ENTIDADES_CRITICAS else "high"
    if "price" in diff_keys or "price_mxn" in diff_keys:
        try:
            ov = float((before or {}).get("price") or (before or {}).get("price_mxn") or 0)
            nv = float((after or {}).get("price") or (after or {}).get("price_mxn") or 0)
            if ov and nv and abs(nv - ov) / ov > 0.20:
                return "high"
        except (TypeError, ValueError):
            pass
    return "info"


def _safe_strip(doc: Optional[Dict]) -> Optional[Dict]:
    """Remove _id and binary fields from a MongoDB document before storing."""
    if doc is None:
        return None
    if not isinstance(doc, dict):   # B3 robustez: un before/after no-dict no debe tirar el audit (antes: silent-fail)
        return {"value": doc}
    return {k: v for k, v in doc.items() if k != "_id" and not isinstance(v, bytes)}


def _extract_request_meta(request: Optional[Request]) -> Dict[str, Optional[str]]:
    """Extract IP, user_agent, route from FastAPI Request safely."""
    if request is None:
        return {"ip": None, "user_agent": None, "route": None}
    ip = None
    try:
        from ratelimit import client_ip as _c  # SEGURIDAD (4ª pasada): IP canónica (auditoría fiable, no XFF[0] spoofeable)
        ip = _c(request)
    except Exception:
        pass
    return {
        "ip": ip,
        "user_agent": request.headers.get("user-agent"),
        "route": str(request.url.path) if request.url else None,
    }


# ─── Core helper (fire-and-forget) ────────────────────────────────────────────
async def log_mutation(
    db,
    actor,          # UserOut or dict with user_id, role, tenant_id, name
    action: str,    # create | update | delete | revert
    entity_type: str,
    entity_id: Optional[str] = None,
    before: Optional[Dict[str, Any]] = None,
    after: Optional[Dict[str, Any]] = None,
    request: Optional[Request] = None,
    by_ai: Optional[bool] = None,   # B3: marca explícita acción de agente/IA. None → se deriva (rol system / user_id de motor).
) -> None:
    """Fire-and-forget audit log insert. Never raises."""
    try:
        # Build actor dict — B3: NUNCA vacío (si no hay actor → sistema/IA, no se pierde la atribución).
        if actor is None or (isinstance(actor, dict) and not actor.get("user_id") and not actor.get("role")):
            actor_dict = {"user_id": "system", "role": "system", "org_id": None, "tenant_id": None, "name": "Sistema"}
        elif hasattr(actor, "user_id"):
            actor_dict = {
                "user_id": actor.user_id,
                "role": getattr(actor, "role", "unknown"),
                "org_id": getattr(actor, "tenant_id", None),
                "tenant_id": getattr(actor, "tenant_id", None),
                "name": getattr(actor, "name", None),
            }
        else:
            actor_dict = {
                "user_id": actor.get("user_id", ""),
                "role": actor.get("role", "unknown"),
                "org_id": actor.get("tenant_id"),
                "tenant_id": actor.get("tenant_id"),
                "name": actor.get("name"),
            }
        # B3: deriva by_ai si no es explícito — rol 'system' o user_id de motor/agente ('agent:...', 'kg_consumer:...', '*_engine')
        if by_ai is None:
            _uid_s = str(actor_dict.get("user_id") or "").lower()
            # rol 'system' (señal primaria) · 'agent:'/'kg_consumer:' (':') · cualquier motor ('engine' en el id) — Audit B 🔴 defensivo
            by_ai = (actor_dict.get("role") == "system") or (":" in _uid_s) or ("engine" in _uid_s) or ("agent" in _uid_s)
        actor_dict["by_ai"] = bool(by_ai)

        meta = _extract_request_meta(request)
        before_clean = _safe_strip(before)
        after_clean = _safe_strip(after)
        diff_keys = _compute_diff_keys(before_clean, after_clean)

        doc = {
            "id": _uid(),
            "ts": _now_iso(),
            "actor": actor_dict,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "before": before_clean,
            "after": after_clean,
            "diff_keys": diff_keys,
            "severity": _derive_severity(action, entity_type, before_clean, after_clean, diff_keys),
            "ip": meta["ip"],
            "user_agent": meta["user_agent"],
            "route": meta["route"],
            "request_id": str(uuid.uuid4().hex[:12]),
        }

        # Fire-and-forget — wrap in coroutine for asyncio.create_task compatibility
        async def _persist():
            try:
                await db.audit_log.insert_one(doc)
            except Exception as ex:
                log.warning(f"[audit] persist failed: {ex}")
        asyncio.create_task(_persist())

    except Exception as exc:
        # fail-open a propósito (el audit nunca tira la mutación) pero NUNCA mudo: queda el warning
        log.warning(f"[audit] log_mutation failed (fail-open): {exc}")


async def log_agent_action(db, agent: str, action: str, entity_type: str,
                           entity_id: Optional[str] = None, before: Optional[Dict[str, Any]] = None,
                           after: Optional[Dict[str, Any]] = None, org_id: Optional[str] = None) -> None:
    """B3: loguea una acción de un AGENTE/IA en audit_log con by_ai=True, atribuida a 'agent:<agent>'. Para que el
    superadmin SÍ distinga lo que decidió la IA (ruteo, nurture, pricing…) de lo que hizo un humano. Fire-and-forget."""
    await log_mutation(
        db, {"user_id": f"agent:{agent}", "role": "system", "tenant_id": org_id, "name": agent},
        action, entity_type, entity_id=entity_id, before=before, after=after, by_ai=True)


# ─── Multi-tenant scope filter ─────────────────────────────────────────────────
def _scope_filter(user) -> Dict[str, Any]:
    """Return Mongo query filter based on caller's role/tenant."""
    role = getattr(user, "role", "") if hasattr(user, "role") else user.get("role", "")
    tenant_id = getattr(user, "tenant_id", None) if hasattr(user, "tenant_id") else user.get("tenant_id")
    user_id = getattr(user, "user_id", "") if hasattr(user, "user_id") else user.get("user_id", "")

    if role == "superadmin":
        return {}  # sees all
    if role in ("developer_admin", "inmobiliaria_admin", "asesor_admin"):
        return {"actor.org_id": tenant_id}
    # advisor / asesor → only own acts
    return {"actor.user_id": user_id}


# ─── Reusable filter builder (W2.2 SA3) ───────────────────────────────────────
def build_filter_query(filters: Dict[str, Any], base: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Build a Mongo query from a flat filters dict.

    Supported keys (any subset, all optional):
      actor_user_id, actor_role, entity_type, entity_id, action, tenant_id,
      severity, from_ts, to_ts, q (regex on action + entity_type + entity_id)
    `base` is merged first (e.g. _scope_filter result for non-superadmin endpoints).
    """
    q: Dict[str, Any] = dict(base or {})
    if filters.get("actor_user_id"):
        q["actor.user_id"] = filters["actor_user_id"]
    if filters.get("actor_role"):
        q["actor.role"] = filters["actor_role"]
    if filters.get("entity_type"):
        q["entity_type"] = filters["entity_type"]
    if filters.get("entity_id"):
        q["entity_id"] = filters["entity_id"]
    if filters.get("action"):
        act = filters["action"]
        if act == "mutations":
            # Treat "mutations" as the canonical write-actions set
            q["action"] = {"$in": ["create", "update", "delete", "revert", "patch", "merge",
                                   "approve", "reject", "force_match", "recompute",
                                   "test", "retry", "replay", "alert_resolved", "alert_test_triggered"]}
        else:
            q["action"] = act
    if filters.get("tenant_id"):
        q["actor.tenant_id"] = filters["tenant_id"]
    if filters.get("severity"):
        q["severity"] = filters["severity"]
    if filters.get("from_ts") or filters.get("to_ts"):
        ts: Dict[str, Any] = q.get("ts") or {}
        if filters.get("from_ts"):
            ts["$gte"] = filters["from_ts"]
        if filters.get("to_ts"):
            ts["$lte"] = filters["to_ts"]
        q["ts"] = ts
    if filters.get("q"):
        rx = {"$regex": filters["q"], "$options": "i"}
        q["$or"] = [
            {"action": rx},
            {"entity_type": rx},
            {"entity_id": rx},
        ]
    return q


# ─── Indexes ──────────────────────────────────────────────────────────────────
async def ensure_audit_log_indexes(db) -> None:
    await db.audit_log.create_index([("actor.tenant_id", 1), ("ts", -1)], background=True)
    await db.audit_log.create_index([("entity_type", 1), ("entity_id", 1), ("ts", -1)], background=True)
    await db.audit_log.create_index([("actor.user_id", 1), ("ts", -1)], background=True)
    await db.audit_log.create_index([("ts", -1)], background=True)
    log.info("[audit] indexes ensured")


# ─── GET /api/audit/log ───────────────────────────────────────────────────────
@router.get("/log")
async def list_audit_log(
    request: Request,
    entity_type: Optional[str] = Query(None),
    actor_user_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    from_: Optional[str] = Query(None, alias="from"),
    to_: Optional[str] = Query(None, alias="to"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """Paginated audit log. Scoped by role."""
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    allowed_roles = {"superadmin", "developer_admin", "inmobiliaria_admin", "asesor_admin", "advisor"}
    if user.role not in allowed_roles:
        raise HTTPException(403, "Acceso denegado")

    db = request.app.state.db
    filt = _scope_filter(user)

    if entity_type:
        filt["entity_type"] = entity_type
    if actor_user_id:
        filt["actor.user_id"] = actor_user_id
    if action:
        filt["action"] = action
    if from_ or to_:
        ts_filter: Dict[str, Any] = {}
        if from_:
            ts_filter["$gte"] = from_
        if to_:
            ts_filter["$lte"] = to_
        filt["ts"] = ts_filter

    skip = (page - 1) * limit
    total = await db.audit_log.count_documents(filt)
    docs = await db.audit_log.find(filt, {"_id": 0}).sort("ts", -1).skip(skip).limit(limit).to_list(limit)

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": max(1, (total + limit - 1) // limit),
        "items": docs,
    }


# ─── GET /api/audit/log/entity/:entity_type/:entity_id ────────────────────────
@router.get("/log/entity/{entity_type}/{entity_id}")
async def entity_trail(entity_type: str, entity_id: str, request: Request):
    """Full audit trail for a specific entity."""
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in {"superadmin", "developer_admin", "inmobiliaria_admin", "asesor_admin", "advisor"}:
        raise HTTPException(403, "Acceso denegado")

    db = request.app.state.db
    base_filt = _scope_filter(user)
    base_filt["entity_type"] = entity_type
    base_filt["entity_id"] = entity_id

    docs = await db.audit_log.find(base_filt, {"_id": 0}).sort("ts", -1).limit(200).to_list(200)
    return {"entity_type": entity_type, "entity_id": entity_id, "trail": docs}


# ─── GET /api/audit/log/stats ─────────────────────────────────────────────────
@router.get("/log/stats")
async def audit_stats(request: Request):
    """Counts in last 24h by action + top entity_types."""
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in {"superadmin", "developer_admin", "inmobiliaria_admin", "asesor_admin", "advisor"}:
        raise HTTPException(403, "Acceso denegado")

    db = request.app.state.db
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

    base_filt = _scope_filter(user)
    base_filt["ts"] = {"$gte": since}

    total_24h = await db.audit_log.count_documents(base_filt)

    # Action breakdown
    action_pipeline = [
        {"$match": base_filt},
        {"$group": {"_id": "$action", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    action_agg = await db.audit_log.aggregate(action_pipeline).to_list(20)
    by_action = {row["_id"]: row["count"] for row in action_agg}

    # Top entity_types
    type_pipeline = [
        {"$match": base_filt},
        {"$group": {"_id": "$entity_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 8},
    ]
    type_agg = await db.audit_log.aggregate(type_pipeline).to_list(8)
    top_entities = [{"entity_type": r["_id"], "count": r["count"]} for r in type_agg]

    return {
        "total_24h": total_24h,
        "by_action": by_action,
        "top_entities": top_entities,
        "since": since,
    }
