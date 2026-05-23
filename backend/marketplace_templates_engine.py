"""W6.4 · Marketplace Templates Engine.

Permite a asesores (T2+) publicar sus workflows como plantillas reutilizables
en un marketplace público. Otros asesores pueden clonarlas (gratis o pagas).

Reusa el JSON schema de `workflow_engine` (NO duplica): un template es un
workflow normal con metadata adicional (price · category · status moderación).

Categorías: nurture · post-visita · win-back · custom
Pricing tiers: free (0) · pro (50-200 MXN) · enterprise (500+ MXN)
Revenue split: 70% author / 30% DMX (configurable env).

Status flow: draft → pending_review → approved (superadmin) → public.
Clone solo si status="approved".

Collections:
  - marketplace_templates       (templates publicados)
  - marketplace_clones          (auditoría de clones + revenue split)
  - marketplace_ratings         (ratings 1-5 idempotente por user_id)
  - marketplace_templates_cache (cache list 7d)

Audit hooks: publish · clone · approve · delete.
"""
from __future__ import annotations

import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.marketplace_templates_engine")

CATEGORIES = ("nurture", "post-visita", "win-back", "custom")
STATUSES = ("draft", "pending_review", "approved", "rejected")
SORT_MODES = ("popular", "recent", "rating")
PRICE_TIERS = ("free", "pro", "enterprise")

PRICE_FREE_MAX = 0
PRICE_PRO_MIN = 1
PRICE_PRO_MAX = 200
PRICE_ENT_MIN = 201

CACHE_TTL_SECONDS = 7 * 86400  # 7 días

REVENUE_DMX_PCT_DEFAULT = 30


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _tpl_id() -> str:
    return f"mt_{uuid.uuid4().hex[:14]}"


def _clone_id() -> str:
    return f"mtc_{uuid.uuid4().hex[:14]}"


def _rating_id() -> str:
    return f"mtr_{secrets.token_urlsafe(10)}"


def _revenue_dmx_pct() -> int:
    try:
        v = int(os.environ.get("MARKETPLACE_TEMPLATE_REVENUE_DMX_PCT", REVENUE_DMX_PCT_DEFAULT))
        if v < 0 or v > 100:
            return REVENUE_DMX_PCT_DEFAULT
        return v
    except Exception:
        return REVENUE_DMX_PCT_DEFAULT


def _price_tier(price_mxn: int) -> str:
    if price_mxn <= PRICE_FREE_MAX:
        return "free"
    if price_mxn <= PRICE_PRO_MAX:
        return "pro"
    return "enterprise"


def _serialize(doc: Optional[Dict[str, Any]], public_safe: bool = True) -> Dict[str, Any]:
    """Serializa template doc · datetime → ISO.

    Audit forense F.68 fix · CRÍTICO PII protection:
    public_safe=True (default) elimina author_email del output (endpoints públicos T0).
    public_safe=False permite ver author_email · debe usarse SOLO en endpoints admin/self con auth.
    """
    if not doc:
        return {}
    out = dict(doc)
    out.pop("_id", None)
    for k in ("created_at", "updated_at", "published_at", "approved_at", "deleted_at",
              "cloned_at", "rated_at", "cache_expires_at"):
        v = out.get(k)
        if isinstance(v, datetime):
            out[k] = v.isoformat()
    # F.68 PII protection · strip author_email en public_safe mode
    if public_safe:
        out.pop("author_email", None)
    return out


# ─── Publish ──────────────────────────────────────────────────────────────────

async def publish_template(
    db,
    author_user_id: str,
    workflow_id: str,
    metadata: Dict[str, Any],
    author_email: Optional[str] = None,
) -> Dict[str, Any]:
    """Snapshot del workflow del autor → nuevo template status=pending_review.

    metadata = {title, description, category, price_mxn}.
    """
    title = (metadata.get("title") or "").strip()
    description = (metadata.get("description") or "").strip()
    category = (metadata.get("category") or "custom").strip().lower()
    try:
        price_mxn = int(metadata.get("price_mxn") or 0)
    except Exception:
        price_mxn = 0
    if price_mxn < 0:
        price_mxn = 0

    if len(title) < 4 or len(title) > 120:
        return {"ok": False, "error": "title 4-120 chars"}
    if len(description) > 2000:
        return {"ok": False, "error": "description máx 2000 chars"}
    if category not in CATEGORIES:
        return {"ok": False, "error": f"category inválida · {'|'.join(CATEGORIES)}"}

    wf = await db.workflows.find_one(
        {"id": workflow_id, "deleted_at": None}, {"_id": 0},
    )
    if not wf:
        return {"ok": False, "error": "workflow no encontrado"}
    if wf.get("owner_user_id") != author_user_id:
        return {"ok": False, "error": "solo el dueño del workflow puede publicarlo"}

    nodes = wf.get("nodes") or []
    edges = wf.get("edges") or []
    if not nodes:
        return {"ok": False, "error": "workflow vacío · no se puede publicar"}

    doc = {
        "id": _tpl_id(),
        "author_user_id": author_user_id,
        "author_email": author_email,
        "source_workflow_id": workflow_id,
        "title": title,
        "description": description,
        "category": category,
        "price_mxn": price_mxn,
        "price_tier": _price_tier(price_mxn),
        "status": "pending_review",
        "nodes": nodes,
        "edges": edges,
        "downloads": 0,
        "avg_rating": 0.0,
        "ratings_count": 0,
        "revenue_total_mxn": 0,
        "created_at": _now(),
        "updated_at": _now(),
        "published_at": _now(),
        "approved_at": None,
        "deleted_at": None,
    }
    await db.marketplace_templates.insert_one(doc)

    try:
        import audit_immutable_engine
        await audit_immutable_engine.log(
            db,
            {"user_id": author_user_id, "role": "advisor"},
            "marketplace_template.publish",
            "template", doc["id"],
            before=None,
            after={"title": title, "category": category, "price_mxn": price_mxn},
        )
    except Exception as exc:
        log.warning(f"audit publish skipped: {exc}")

    await _bust_cache(db)
    return {"ok": True, "template": _serialize(doc)}


# ─── Approve / Reject / Delete ────────────────────────────────────────────────

async def approve_template(db, template_id: str, admin_user_id: str) -> Dict[str, Any]:
    doc = await db.marketplace_templates.find_one({"id": template_id, "deleted_at": None}, {"_id": 0})
    if not doc:
        return {"ok": False, "error": "template no encontrado"}
    if doc.get("status") == "approved":
        return {"ok": True, "already": True, "template": _serialize(doc)}
    await db.marketplace_templates.update_one(
        {"id": template_id},
        {"$set": {"status": "approved", "approved_at": _now(), "updated_at": _now()}},
    )
    try:
        import audit_immutable_engine
        await audit_immutable_engine.log(
            db,
            {"user_id": admin_user_id, "role": "superadmin"},
            "marketplace_template.approve",
            "template", template_id,
            before={"status": doc.get("status")}, after={"status": "approved"},
        )
    except Exception as exc:
        log.warning(f"audit approve skipped: {exc}")

    await _bust_cache(db)
    fresh = await db.marketplace_templates.find_one({"id": template_id}, {"_id": 0})
    return {"ok": True, "template": _serialize(fresh)}


async def reject_template(db, template_id: str, admin_user_id: str, reason: str = "") -> Dict[str, Any]:
    doc = await db.marketplace_templates.find_one({"id": template_id, "deleted_at": None}, {"_id": 0})
    if not doc:
        return {"ok": False, "error": "template no encontrado"}
    await db.marketplace_templates.update_one(
        {"id": template_id},
        {"$set": {"status": "rejected", "rejection_reason": reason[:500], "updated_at": _now()}},
    )
    try:
        import audit_immutable_engine
        await audit_immutable_engine.log(
            db,
            {"user_id": admin_user_id, "role": "superadmin"},
            "marketplace_template.reject",
            "template", template_id,
            before={"status": doc.get("status")},
            after={"status": "rejected", "reason": reason[:200]},
        )
    except Exception as exc:
        log.warning(f"audit reject skipped: {exc}")

    await _bust_cache(db)
    return {"ok": True}


async def delete_template(db, template_id: str, admin_user_id: str) -> Dict[str, Any]:
    doc = await db.marketplace_templates.find_one({"id": template_id, "deleted_at": None}, {"_id": 0})
    if not doc:
        return {"ok": False, "error": "template no encontrado"}
    await db.marketplace_templates.update_one(
        {"id": template_id},
        {"$set": {"deleted_at": _now(), "status": "rejected", "updated_at": _now()}},
    )
    try:
        import audit_immutable_engine
        await audit_immutable_engine.log(
            db,
            {"user_id": admin_user_id, "role": "superadmin"},
            "marketplace_template.delete",
            "template", template_id,
            before={"title": doc.get("title")}, after=None,
        )
    except Exception as exc:
        log.warning(f"audit delete skipped: {exc}")

    await _bust_cache(db)
    return {"ok": True, "deleted": template_id}


# ─── Clone ────────────────────────────────────────────────────────────────────

async def clone_template(
    db,
    template_id: str,
    target_user_id: str,
    target_email: Optional[str] = None,
    paid_amount_mxn: Optional[int] = None,
) -> Dict[str, Any]:
    """Crea un workflow nuevo (status=draft) en la account del target_user_id
    copiando nodes/edges del template. Registra clone + revenue split.
    """
    tpl = await db.marketplace_templates.find_one({"id": template_id, "deleted_at": None}, {"_id": 0})
    if not tpl:
        return {"ok": False, "error": "template no encontrado"}
    if tpl.get("status") != "approved":
        return {"ok": False, "error": "template no aprobado · no puede clonarse"}

    # Cap workflows per user (reusa límite del workflow_engine)
    try:
        from workflow_engine import MAX_WORKFLOWS_PER_USER, _wf_id
    except Exception:
        MAX_WORKFLOWS_PER_USER = 20

        def _wf_id():
            return f"wf_{uuid.uuid4().hex[:14]}"

    count = await db.workflows.count_documents({"owner_user_id": target_user_id, "deleted_at": None})
    if count >= MAX_WORKFLOWS_PER_USER:
        return {"ok": False, "error": f"máximo {MAX_WORKFLOWS_PER_USER} workflows por usuario"}

    price = int(tpl.get("price_mxn") or 0)
    if paid_amount_mxn is None:
        paid_amount_mxn = price
    paid_amount_mxn = int(paid_amount_mxn)
    if paid_amount_mxn < price:
        return {"ok": False, "error": f"monto insuficiente · requiere {price} MXN"}

    new_wf = {
        "id": _wf_id(),
        "owner_user_id": target_user_id,
        "owner_email": target_email,
        "tenant_id": None,
        "name": f"{tpl.get('title')} (copia)",
        "description": tpl.get("description"),
        "nodes": tpl.get("nodes") or [],
        "edges": tpl.get("edges") or [],
        "status": "draft",
        "created_at": _now(),
        "updated_at": _now(),
        "deleted_at": None,
        "last_run_at": None,
        "cloned_from_template_id": template_id,
    }
    await db.workflows.insert_one(new_wf)

    dmx_pct = _revenue_dmx_pct()
    author_pct = 100 - dmx_pct
    author_amount = (paid_amount_mxn * author_pct) // 100
    dmx_amount = paid_amount_mxn - author_amount

    clone_doc = {
        "id": _clone_id(),
        "template_id": template_id,
        "author_user_id": tpl.get("author_user_id"),
        "target_user_id": target_user_id,
        "target_email": target_email,
        "new_workflow_id": new_wf["id"],
        "paid_amount_mxn": paid_amount_mxn,
        "author_revenue_mxn": author_amount,
        "dmx_revenue_mxn": dmx_amount,
        "dmx_pct": dmx_pct,
        "cloned_at": _now(),
    }
    await db.marketplace_clones.insert_one(clone_doc)

    await db.marketplace_templates.update_one(
        {"id": template_id},
        {"$inc": {"downloads": 1, "revenue_total_mxn": paid_amount_mxn}},
    )

    try:
        import audit_immutable_engine
        await audit_immutable_engine.log(
            db,
            {"user_id": target_user_id, "role": "advisor"},
            "marketplace_template.clone",
            "template", template_id,
            before=None,
            after={"new_workflow_id": new_wf["id"], "paid": paid_amount_mxn},
        )
    except Exception as exc:
        log.warning(f"audit clone skipped: {exc}")

    return {
        "ok": True,
        "new_workflow_id": new_wf["id"],
        "paid_amount_mxn": paid_amount_mxn,
        "author_revenue_mxn": author_amount,
        "dmx_revenue_mxn": dmx_amount,
    }


# ─── List / Search / Detail ───────────────────────────────────────────────────

async def _bust_cache(db) -> None:
    try:
        await db.marketplace_templates_cache.delete_many({})
    except Exception:
        pass


async def _read_cache(db, key: str) -> Optional[Dict[str, Any]]:
    try:
        doc = await db.marketplace_templates_cache.find_one({"key": key}, {"_id": 0})
        if not doc:
            return None
        exp = doc.get("cache_expires_at")
        if isinstance(exp, datetime) and exp < _now():
            return None
        return doc.get("payload")
    except Exception:
        return None


async def _write_cache(db, key: str, payload: Dict[str, Any]) -> None:
    try:
        await db.marketplace_templates_cache.update_one(
            {"key": key},
            {"$set": {"key": key, "payload": payload,
                      "cache_expires_at": _now() + timedelta(seconds=CACHE_TTL_SECONDS)}},
            upsert=True,
        )
    except Exception:
        pass


async def list_templates(
    db,
    category: Optional[str] = None,
    price_tier: Optional[str] = None,
    sort: str = "popular",
    limit: int = 50,
    include_pending: bool = False,
) -> Dict[str, Any]:
    limit = max(1, min(100, int(limit or 50)))
    sort = sort if sort in SORT_MODES else "popular"

    cache_key = f"list|{category}|{price_tier}|{sort}|{limit}|{int(include_pending)}"
    cached = await _read_cache(db, cache_key)
    if cached:
        return cached

    query: Dict[str, Any] = {"deleted_at": None}
    if include_pending:
        query["status"] = {"$in": ["approved", "pending_review"]}
    else:
        query["status"] = "approved"
    if category and category in CATEGORIES:
        query["category"] = category
    if price_tier and price_tier in PRICE_TIERS:
        query["price_tier"] = price_tier

    if sort == "popular":
        sort_spec = [("downloads", -1), ("avg_rating", -1)]
    elif sort == "rating":
        sort_spec = [("avg_rating", -1), ("ratings_count", -1)]
    else:
        sort_spec = [("published_at", -1)]

    cursor = db.marketplace_templates.find(query, {"_id": 0}).sort(sort_spec).limit(limit)
    items = await cursor.to_list(length=limit)
    payload = {"items": [_serialize(d) for d in items], "count": len(items),
               "sort": sort, "category": category, "price_tier": price_tier}
    await _write_cache(db, cache_key, payload)
    return payload


async def search_templates(db, query: str, limit: int = 30) -> Dict[str, Any]:
    q = (query or "").strip().lower()
    limit = max(1, min(50, int(limit or 30)))
    if not q:
        return {"items": [], "count": 0, "query": ""}

    cursor = db.marketplace_templates.find(
        {"deleted_at": None, "status": "approved"},
        {"_id": 0},
    ).limit(500)
    raw = await cursor.to_list(length=500)
    hits = []
    for d in raw:
        haystack = " ".join([
            (d.get("title") or ""),
            (d.get("description") or ""),
            (d.get("category") or ""),
        ]).lower()
        if q in haystack:
            hits.append(_serialize(d))
    hits.sort(key=lambda x: (x.get("downloads") or 0), reverse=True)
    hits = hits[:limit]
    return {"items": hits, "count": len(hits), "query": q}


async def get_template(db, template_id: str) -> Dict[str, Any]:
    doc = await db.marketplace_templates.find_one(
        {"id": template_id, "deleted_at": None}, {"_id": 0},
    )
    if not doc:
        return {}
    out = _serialize(doc)
    # Ratings recientes
    try:
        rcur = db.marketplace_ratings.find(
            {"template_id": template_id}, {"_id": 0},
        ).sort("rated_at", -1).limit(10)
        ratings = await rcur.to_list(length=10)
        for r in ratings:
            ts = r.get("rated_at")
            if isinstance(ts, datetime):
                r["rated_at"] = ts.isoformat()
        out["recent_ratings"] = ratings
    except Exception:
        out["recent_ratings"] = []
    return out


# ─── Rate ─────────────────────────────────────────────────────────────────────

async def rate_template(
    db,
    template_id: str,
    user_id: str,
    stars: int,
    comment: Optional[str] = None,
) -> Dict[str, Any]:
    try:
        stars = int(stars)
    except Exception:
        return {"ok": False, "error": "stars debe ser entero"}
    if stars < 1 or stars > 5:
        return {"ok": False, "error": "stars 1-5"}

    tpl = await db.marketplace_templates.find_one({"id": template_id, "deleted_at": None}, {"_id": 0})
    if not tpl:
        return {"ok": False, "error": "template no encontrado"}

    cloned = await db.marketplace_clones.find_one(
        {"template_id": template_id, "target_user_id": user_id},
    )
    if not cloned:
        return {"ok": False, "error": "debes clonar la plantilla antes de calificarla"}

    existing = await db.marketplace_ratings.find_one(
        {"template_id": template_id, "user_id": user_id},
    )
    if existing:
        await db.marketplace_ratings.update_one(
            {"_id": existing.get("_id")},
            {"$set": {"stars": stars, "comment": (comment or "")[:1000],
                      "rated_at": _now()}},
        )
    else:
        await db.marketplace_ratings.insert_one({
            "id": _rating_id(),
            "template_id": template_id,
            "user_id": user_id,
            "stars": stars,
            "comment": (comment or "")[:1000],
            "rated_at": _now(),
        })

    # Recalcular avg
    cursor = db.marketplace_ratings.find({"template_id": template_id}, {"_id": 0, "stars": 1})
    all_r = await cursor.to_list(length=10000)
    if all_r:
        avg = sum(int(r.get("stars") or 0) for r in all_r) / max(1, len(all_r))
    else:
        avg = 0.0
    await db.marketplace_templates.update_one(
        {"id": template_id},
        {"$set": {"avg_rating": round(avg, 2), "ratings_count": len(all_r),
                  "updated_at": _now()}},
    )
    await _bust_cache(db)
    return {"ok": True, "avg_rating": round(avg, 2), "ratings_count": len(all_r)}


# ─── Revenue stats ────────────────────────────────────────────────────────────

async def get_revenue_stats(db, author_user_id: Optional[str] = None) -> Dict[str, Any]:
    """Si author_user_id → revenue self · sin → revenue global (superadmin)."""
    query: Dict[str, Any] = {}
    if author_user_id:
        query["author_user_id"] = author_user_id

    cursor = db.marketplace_clones.find(query, {"_id": 0}).limit(10000)
    clones = await cursor.to_list(length=10000)

    total_clones = len(clones)
    total_paid = sum(int(c.get("paid_amount_mxn") or 0) for c in clones)
    author_rev = sum(int(c.get("author_revenue_mxn") or 0) for c in clones)
    dmx_rev = sum(int(c.get("dmx_revenue_mxn") or 0) for c in clones)

    # Top sellers (cuando es vista superadmin)
    top_sellers: List[Dict[str, Any]] = []
    if not author_user_id:
        by_author: Dict[str, Dict[str, Any]] = {}
        for c in clones:
            aid = c.get("author_user_id") or "unknown"
            entry = by_author.setdefault(aid, {"author_user_id": aid, "clones": 0,
                                                "revenue_mxn": 0})
            entry["clones"] += 1
            entry["revenue_mxn"] += int(c.get("author_revenue_mxn") or 0)
        top_sellers = sorted(by_author.values(),
                              key=lambda x: x["revenue_mxn"], reverse=True)[:10]

    # Templates owned (cuando es vista self · puede ver su propio email)
    my_templates: List[Dict[str, Any]] = []
    if author_user_id:
        tcursor = db.marketplace_templates.find(
            {"author_user_id": author_user_id, "deleted_at": None}, {"_id": 0},
        ).sort("downloads", -1).limit(50)
        my_templates = [_serialize(d, public_safe=False) for d in await tcursor.to_list(length=50)]

    return {
        "total_clones": total_clones,
        "total_paid_mxn": total_paid,
        "author_revenue_mxn": author_rev,
        "dmx_revenue_mxn": dmx_rev,
        "dmx_pct": _revenue_dmx_pct(),
        "top_sellers": top_sellers,
        "my_templates": my_templates,
    }


async def get_admin_stats(db) -> Dict[str, Any]:
    """KPIs para superadmin dashboard."""
    total = await db.marketplace_templates.count_documents({"deleted_at": None})
    pending = await db.marketplace_templates.count_documents(
        {"deleted_at": None, "status": "pending_review"},
    )
    approved = await db.marketplace_templates.count_documents(
        {"deleted_at": None, "status": "approved"},
    )
    cutoff = _now() - timedelta(days=30)
    cursor = db.marketplace_clones.find(
        {"cloned_at": {"$gte": cutoff}}, {"_id": 0, "paid_amount_mxn": 1},
    ).limit(10000)
    rec = await cursor.to_list(length=10000)
    revenue_30d = sum(int(c.get("paid_amount_mxn") or 0) for c in rec)
    return {
        "templates_total": total,
        "templates_pending": pending,
        "templates_approved": approved,
        "revenue_30d_mxn": revenue_30d,
        "clones_30d": len(rec),
    }


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    try:
        await db.marketplace_templates.create_index("id", unique=True)
        await db.marketplace_templates.create_index(
            [("author_user_id", 1), ("status", 1)],
            name="idx_mt_author_status", background=True,
        )
        await db.marketplace_templates.create_index(
            [("status", 1), ("category", 1)],
            name="idx_mt_status_category", background=True,
        )
        await db.marketplace_templates.create_index(
            [("downloads", -1)], name="idx_mt_downloads", background=True,
        )
        await db.marketplace_clones.create_index("id", unique=True)
        await db.marketplace_clones.create_index(
            [("template_id", 1), ("target_user_id", 1)],
            name="idx_mtc_tpl_target", background=True,
        )
        await db.marketplace_clones.create_index(
            [("author_user_id", 1), ("cloned_at", -1)],
            name="idx_mtc_author_at", background=True,
        )
        await db.marketplace_ratings.create_index("id", unique=True)
        await db.marketplace_ratings.create_index(
            [("template_id", 1), ("user_id", 1)],
            unique=True, name="idx_mtr_tpl_user_uq", background=True,
        )
        await db.marketplace_templates_cache.create_index("key", unique=True)
        await db.marketplace_templates_cache.create_index(
            "cache_expires_at", expireAfterSeconds=0,
            background=True, name="ttl_mt_cache",
        )
        log.info("[marketplace_templates_engine] indexes OK")
    except Exception as exc:
        log.warning(f"[marketplace_templates_engine] ensure_indexes warning: {exc}")
