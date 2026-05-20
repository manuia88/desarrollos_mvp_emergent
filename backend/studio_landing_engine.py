"""W5.22 Z.8 — Studio Landing Pages Engine.

CRUD + slug + A/B group + view tracker + lead handler.

Collections:
  db.studio_landings           Landing docs (con content nested · slug unique global)
  db.studio_landing_ab_groups  A/B group docs (Chi-square via studio_carrusel_ab_engine pattern)
  db.studio_landing_views      TTL 365d daily counters por landing
  db.studio_landing_leads      Leads capturados (raw payload + IP hash)

Append-only · NO modifica engines Z.1/Z.2.
"""
from __future__ import annotations

import hashlib
import logging
import re
import secrets
import unicodedata
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.studio_landing_engine")

TEMPLATE_KEYS = (
    "luxury", "modern", "family", "investor", "boutique",
    "urgent", "scrollytelling", "video_first", "social_proof", "compare",
)

SLUG_RE = re.compile(r"^[a-z0-9-]{3,60}$")
LEAD_RATE_LIMIT_SECONDS = 60  # 5/min/IP per slug → window check minimal


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


def _uid(prefix: str = "lnd") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def slugify(text: str, max_len: int = 60) -> str:
    """Slug es-MX safe · ASCII only · lowercase · dashes."""
    if not text:
        return secrets.token_hex(4)
    t = unicodedata.normalize("NFKD", text)
    t = t.encode("ascii", "ignore").decode("ascii").lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    if len(t) < 3:
        t = (t + "-" + secrets.token_hex(2)).strip("-")
    return t[:max_len]


def _hash_ip(ip: str) -> str:
    return hashlib.sha256((ip or "anon").encode("utf-8")).hexdigest()[:16]


# ─── Indexes ──────────────────────────────────────────────────────────────────
async def ensure_indexes(db) -> None:
    try:
        await db.studio_landings.create_index("slug", unique=True)
        await db.studio_landings.create_index([("user_id", 1), ("created_at", -1)])
        await db.studio_landings.create_index("tenant_id")
        await db.studio_landings.create_index("project_id")
        await db.studio_landing_ab_groups.create_index("user_id")
        await db.studio_landing_ab_groups.create_index("variant_a_landing_id")
        await db.studio_landing_ab_groups.create_index("variant_b_landing_id")
        await db.studio_landing_views.create_index([("slug", 1), ("date_iso", 1)], unique=True)
        await db.studio_landing_views.create_index("expires_at", expireAfterSeconds=0)
        await db.studio_landing_leads.create_index([("slug", 1), ("created_at", -1)])
        await db.studio_landing_leads.create_index("ip_hash")
        log.info("[studio_landing] indexes ok")
    except Exception as exc:
        log.warning(f"[studio_landing] indexes failed (soft): {exc}")


# ─── Default content template ─────────────────────────────────────────────────
def default_content(title: str, subtitle: str = "") -> Dict[str, Any]:
    return {
        "hero": {
            "title": title or "Tu proximo proyecto",
            "subtitle": subtitle or "Inteligencia inmobiliaria CDMX.",
            "bg_image_r2_key": "",
            "bg_video_r2_key": "",
        },
        "stats": [
            {"label": "Plusvalia 5a", "value": "+38%"},
            {"label": "Entrega", "value": "Q4 2026"},
            {"label": "Desde", "value": "$4.8M MXN"},
        ],
        "features": [
            {"title": "Ubicacion premium", "description": "Walkscore 90+", "icon": "MapPin"},
            {"title": "Amenidades", "description": "Roof + Coworking + Gym", "icon": "Sparkles"},
            {"title": "Plusvalia comprobada", "description": "DRPI verificado", "icon": "TrendingUp"},
        ],
        "testimonials": [],
        "cta": {
            "primary": {"text": "Agenda tu visita", "action": "lead_form"},
            "secondary": {"text": "Descarga brochure", "action": "download_pdf"},
        },
        "lead_form": {
            "fields": [
                {"name": "nombre", "type": "text", "required": True, "label": "Nombre completo"},
                {"name": "email", "type": "email", "required": True, "label": "Correo"},
                {"name": "telefono", "type": "phone", "required": False, "label": "Telefono"},
            ],
            "submit_text": "Enviar",
            "success_message": "Gracias. Te contactamos en menos de 24h.",
        },
        "gallery": {"asset_ids": []},
        "atlax_widget_enabled": False,
        "brochure_pdf_enabled": True,
        "urgent_expires_at": None,
    }


# ─── CRUD ─────────────────────────────────────────────────────────────────────
async def create_landing(
    db,
    *,
    tenant_id: str,
    user_id: str,
    template_key: str,
    title: str,
    slug: Optional[str] = None,
    subtitle: str = "",
    brand_kit_id: Optional[str] = None,
    project_id: Optional[str] = None,
    cta_text: str = "",
) -> Dict[str, Any]:
    if template_key not in TEMPLATE_KEYS:
        return {"ok": False, "error": f"template_key invalido. Validos: {list(TEMPLATE_KEYS)}"}

    raw_slug = (slug or slugify(title) or secrets.token_hex(4)).lower().strip()
    if not SLUG_RE.match(raw_slug):
        return {"ok": False, "error": "slug invalido (a-z0-9- · 3-60 chars)"}

    existing = await db.studio_landings.find_one({"slug": raw_slug}, {"_id": 0, "id": 1})
    if existing:
        return {"ok": False, "error": "slug ya en uso", "status_code": 422}

    content = default_content(title, subtitle)
    if cta_text:
        content["cta"]["primary"]["text"] = cta_text[:40]

    doc = {
        "id": _uid(),
        "tenant_id": tenant_id,
        "user_id": user_id,
        "project_id": project_id,
        "slug": raw_slug,
        "template_key": template_key,
        "brand_kit_id": brand_kit_id,
        "content": content,
        "ab_group_id": None,
        "variant_label": "single",
        "views_count": 0,
        "leads_count": 0,
        "published": False,
        "published_at": None,
        "deleted": False,
        "created_at": _iso(),
        "updated_at": _iso(),
    }
    await db.studio_landings.insert_one(dict(doc))
    doc.pop("_id", None)
    return {"ok": True, "landing": doc}


async def get_landing(db, landing_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    return await db.studio_landings.find_one(
        {"id": landing_id, "user_id": user_id, "deleted": {"$ne": True}}, {"_id": 0}
    )


async def get_landing_by_slug(db, slug: str, include_unpublished: bool = False) -> Optional[Dict[str, Any]]:
    q: Dict[str, Any] = {"slug": slug, "deleted": {"$ne": True}}
    if not include_unpublished:
        q["published"] = True
    return await db.studio_landings.find_one(q, {"_id": 0})


async def list_landings(
    db,
    user_id: str,
    *,
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    template_key: Optional[str] = None,
    limit: int = 30,
    skip: int = 0,
) -> Dict[str, Any]:
    q: Dict[str, Any] = {"user_id": user_id, "deleted": {"$ne": True}}
    if project_id:
        q["project_id"] = project_id
    if template_key:
        q["template_key"] = template_key
    if status == "published":
        q["published"] = True
    elif status == "draft":
        q["published"] = False
    cursor = db.studio_landings.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    items = await cursor.to_list(limit)
    total = await db.studio_landings.count_documents(q)
    return {"items": items, "total": total}


async def update_landing(db, landing_id: str, user_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
    allowed = {"content", "template_key", "brand_kit_id", "project_id"}
    update_doc: Dict[str, Any] = {"updated_at": _iso()}
    for k, v in patch.items():
        if k in allowed and v is not None:
            update_doc[k] = v
    if "template_key" in update_doc and update_doc["template_key"] not in TEMPLATE_KEYS:
        return {"ok": False, "error": "template_key invalido"}
    res = await db.studio_landings.update_one(
        {"id": landing_id, "user_id": user_id, "deleted": {"$ne": True}},
        {"$set": update_doc},
    )
    if res.matched_count == 0:
        return {"ok": False, "error": "Landing no encontrada"}
    return {"ok": True}


async def publish_landing(db, landing_id: str, user_id: str, published: bool = True) -> Dict[str, Any]:
    update_doc: Dict[str, Any] = {"published": published, "updated_at": _iso()}
    if published:
        update_doc["published_at"] = _iso()
    res = await db.studio_landings.update_one(
        {"id": landing_id, "user_id": user_id, "deleted": {"$ne": True}},
        {"$set": update_doc},
    )
    if res.matched_count == 0:
        return {"ok": False, "error": "Landing no encontrada"}
    return {"ok": True, "published": published}


async def delete_landing(db, landing_id: str, user_id: str) -> Dict[str, Any]:
    res = await db.studio_landings.update_one(
        {"id": landing_id, "user_id": user_id},
        {"$set": {"deleted": True, "deleted_at": _iso()}},
    )
    if res.matched_count == 0:
        return {"ok": False, "error": "Landing no encontrada"}
    return {"ok": True}


# ─── A/B variant ──────────────────────────────────────────────────────────────
async def create_ab_variant(
    db, landing_id: str, user_id: str, *, variant_b_template_key: str
) -> Dict[str, Any]:
    if variant_b_template_key not in TEMPLATE_KEYS:
        return {"ok": False, "error": "template_key invalido para variante B"}

    base = await get_landing(db, landing_id, user_id)
    if not base:
        return {"ok": False, "error": "Landing base no encontrada"}
    if base.get("ab_group_id"):
        return {"ok": False, "error": "Esta landing ya pertenece a un grupo A/B"}

    # Crear variante B (clon con template distinto + slug -B)
    b_slug = f"{base['slug']}-b"[:60]
    # Asegurar unicidad
    if await db.studio_landings.find_one({"slug": b_slug}, {"_id": 0, "id": 1}):
        b_slug = f"{base['slug'][:55]}-{secrets.token_hex(2)}"

    b_doc = dict(base)
    b_doc.pop("_id", None)
    b_doc["id"] = _uid()
    b_doc["slug"] = b_slug
    b_doc["template_key"] = variant_b_template_key
    b_doc["variant_label"] = "B"
    b_doc["views_count"] = 0
    b_doc["leads_count"] = 0
    b_doc["published"] = False
    b_doc["published_at"] = None
    b_doc["created_at"] = _iso()
    b_doc["updated_at"] = _iso()
    await db.studio_landings.insert_one(dict(b_doc))
    b_doc.pop("_id", None)

    group_id = f"lnd_ab_{uuid.uuid4().hex[:10]}"
    group_doc = {
        "id": group_id,
        "user_id": user_id,
        "project_id": base.get("project_id"),
        "variant_a_landing_id": base["id"],
        "variant_b_landing_id": b_doc["id"],
        "winner_id": None,
        "stats": {"a_views": 0, "b_views": 0, "a_leads": 0, "b_leads": 0,
                  "a_conv": 0.0, "b_conv": 0.0},
        "status": "active",
        "created_at": _iso(),
    }
    await db.studio_landing_ab_groups.insert_one(dict(group_doc))
    group_doc.pop("_id", None)

    await db.studio_landings.update_one(
        {"id": base["id"]},
        {"$set": {"ab_group_id": group_id, "variant_label": "A", "updated_at": _iso()}},
    )
    await db.studio_landings.update_one(
        {"id": b_doc["id"]},
        {"$set": {"ab_group_id": group_id, "updated_at": _iso()}},
    )
    return {"ok": True, "group": group_doc, "variant_b_landing_id": b_doc["id"]}


# ─── Tracking ─────────────────────────────────────────────────────────────────
async def record_landing_view(db, slug: str, ip: str = "", referrer: str = "") -> None:
    """Increment views · upsert daily counter."""
    try:
        date_iso = _now().strftime("%Y-%m-%d")
        ip_hash = _hash_ip(ip)
        from datetime import timedelta
        expires_at = _now() + timedelta(days=365)
        await db.studio_landing_views.update_one(
            {"slug": slug, "date_iso": date_iso},
            {
                "$inc": {"views_count": 1},
                "$setOnInsert": {"slug": slug, "date_iso": date_iso, "expires_at": expires_at},
                "$addToSet": {"unique_ip_hashes": ip_hash},
            },
            upsert=True,
        )
        await db.studio_landings.update_one(
            {"slug": slug},
            {"$inc": {"views_count": 1}, "$set": {"last_view_at": _iso()}},
        )

        # Update A/B group stats
        landing = await db.studio_landings.find_one({"slug": slug}, {"_id": 0, "ab_group_id": 1, "variant_label": 1})
        if landing and landing.get("ab_group_id"):
            arm = "a" if landing.get("variant_label") == "A" else "b"
            await db.studio_landing_ab_groups.update_one(
                {"id": landing["ab_group_id"]},
                {"$inc": {f"stats.{arm}_views": 1}},
            )
    except Exception as exc:
        log.warning(f"[record_landing_view] failed (soft) slug={slug}: {exc}")


async def submit_landing_lead(
    db, slug: str, payload: Dict[str, Any], ip: str = "", referrer: str = ""
) -> Dict[str, Any]:
    """Captura lead · rate-limit 5/min/IP per slug · feeds leads collection."""
    landing = await db.studio_landings.find_one(
        {"slug": slug, "deleted": {"$ne": True}, "published": True}, {"_id": 0}
    )
    if not landing:
        return {"ok": False, "error": "landing_not_found_or_unpublished"}

    ip_hash = _hash_ip(ip)
    from datetime import timedelta
    cutoff = _now() - timedelta(seconds=LEAD_RATE_LIMIT_SECONDS)
    recent = await db.studio_landing_leads.count_documents({
        "slug": slug,
        "ip_hash": ip_hash,
        "created_at": {"$gte": cutoff.isoformat()},
    })
    if recent >= 5:
        return {"ok": False, "error": "rate_limited", "message": "Demasiados envios. Intenta de nuevo en un minuto."}

    # Dedup last 60s same IP + same email
    email = (payload.get("email") or "").strip().lower()
    if email:
        dup = await db.studio_landing_leads.find_one({
            "slug": slug, "ip_hash": ip_hash, "payload.email": email,
            "created_at": {"$gte": cutoff.isoformat()},
        }, {"_id": 0, "id": 1})
        if dup:
            return {"ok": True, "deduped": True, "message": landing["content"]["lead_form"].get("success_message", "Recibido.")}

    lead_id = _uid("lndlead")
    lead_doc = {
        "id": lead_id,
        "slug": slug,
        "landing_id": landing["id"],
        "tenant_id": landing.get("tenant_id"),
        "owner_user_id": landing.get("user_id"),
        "payload": {k: str(v)[:500] for k, v in payload.items()},
        "ip_hash": ip_hash,
        "referrer": (referrer or "")[:200],
        "created_at": _iso(),
    }
    await db.studio_landing_leads.insert_one(dict(lead_doc))

    # Mirror al pipeline central `leads` (fire-and-forget · sin romper si falla)
    try:
        from datetime import datetime as _dt
        leads_doc = {
            "id": f"lead_{uuid.uuid4().hex[:12]}",
            "first_name": (payload.get("nombre") or payload.get("name") or "").split(" ")[0][:80],
            "last_name": " ".join((payload.get("nombre") or "").split(" ")[1:])[:80],
            "email": email or None,
            "phone": (payload.get("telefono") or payload.get("phone") or "")[:40],
            "status_v2": "nuevo",
            "source": f"landing_{slug}",
            "origin": "landing_z8",
            "assigned_to": landing.get("user_id"),
            "notes": (payload.get("mensaje") or payload.get("message") or "")[:500],
            "nurture_active": True,
            "created_at": _iso(),
            "updated_at": _iso(),
        }
        await db.leads.insert_one(dict(leads_doc))
    except Exception as exc:
        log.warning(f"[submit_landing_lead] mirror to leads failed (soft): {exc}")

    # Lead nurture feed (fire-and-forget)
    try:
        from lead_journey_engine import emit_step
        await emit_step(
            db,
            lead_id=lead_id,
            tenant_id=landing.get("tenant_id"),
            step_type="captured",
            actor_type="system",
            actor_id="studio_landing_engine",
            payload={"source": f"landing_{slug}", "ip_hash": ip_hash},
        )
    except Exception:
        pass

    # Update counters
    await db.studio_landings.update_one(
        {"slug": slug},
        {"$inc": {"leads_count": 1}, "$set": {"last_lead_at": _iso()}},
    )
    date_iso = _now().strftime("%Y-%m-%d")
    await db.studio_landing_views.update_one(
        {"slug": slug, "date_iso": date_iso},
        {"$inc": {"leads_count": 1}},
        upsert=True,
    )
    if landing.get("ab_group_id"):
        arm = "a" if landing.get("variant_label") == "A" else "b"
        await db.studio_landing_ab_groups.update_one(
            {"id": landing["ab_group_id"]},
            {"$inc": {f"stats.{arm}_leads": 1}},
        )

    return {
        "ok": True,
        "lead_id": lead_id,
        "message": landing["content"]["lead_form"].get("success_message", "Gracias."),
    }


# ─── A/B Stats (Chi-square reuse Z.2 pattern) ─────────────────────────────────
CHI2_THRESHOLD = 3.84  # p<0.05, df=1
MIN_EVENTS_PER_ARM = 30


def _chi_square(a_conv: int, a_total: int, b_conv: int, b_total: int) -> Dict[str, Any]:
    if a_total < MIN_EVENTS_PER_ARM or b_total < MIN_EVENTS_PER_ARM:
        return {"stat": 0.0, "significant": False, "winner": None,
                "reason": f"Insuficientes vistas: A={a_total}, B={b_total} (min {MIN_EVENTS_PER_ARM})"}
    a_no = a_total - a_conv
    b_no = b_total - b_conv
    n = a_total + b_total
    e_a_conv = (a_conv + b_conv) * a_total / n
    e_b_conv = (a_conv + b_conv) * b_total / n
    e_a_no = (a_no + b_no) * a_total / n
    e_b_no = (a_no + b_no) * b_total / n

    def _term(o, e):
        return (o - e) ** 2 / e if e else 0.0

    chi2 = _term(a_conv, e_a_conv) + _term(b_conv, e_b_conv) + _term(a_no, e_a_no) + _term(b_no, e_b_no)
    sig = chi2 >= CHI2_THRESHOLD
    winner = None
    if sig:
        ra = a_conv / a_total if a_total else 0
        rb = b_conv / b_total if b_total else 0
        winner = "A" if ra >= rb else "B"
    return {"stat": round(chi2, 4), "significant": sig, "winner": winner}


async def get_ab_stats(db, group_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    group = await db.studio_landing_ab_groups.find_one(
        {"id": group_id, "user_id": user_id}, {"_id": 0}
    )
    if not group:
        return None
    stats = group.get("stats") or {}
    a_views = stats.get("a_views", 0)
    b_views = stats.get("b_views", 0)
    a_leads = stats.get("a_leads", 0)
    b_leads = stats.get("b_leads", 0)
    chi = _chi_square(a_leads, a_views, b_leads, b_views)
    rate_a = round(a_leads / a_views * 100, 2) if a_views else 0
    rate_b = round(b_leads / b_views * 100, 2) if b_views else 0
    return {
        **group,
        "chi_square": chi,
        "conversion_rate_a": rate_a,
        "conversion_rate_b": rate_b,
        "auto_winner": chi.get("winner"),
        "can_declare": chi.get("significant", False),
    }


async def declare_ab_winner(
    db, group_id: str, user_id: str, winner_variant: Optional[str] = None
) -> Dict[str, Any]:
    group = await db.studio_landing_ab_groups.find_one(
        {"id": group_id, "user_id": user_id}, {"_id": 0}
    )
    if not group:
        return {"ok": False, "error": "Grupo A/B no encontrado"}
    if winner_variant in ("A", "B"):
        winner_id = (group["variant_a_landing_id"] if winner_variant == "A"
                     else group["variant_b_landing_id"])
    else:
        stats = group.get("stats") or {}
        chi = _chi_square(
            stats.get("a_leads", 0), stats.get("a_views", 0),
            stats.get("b_leads", 0), stats.get("b_views", 0),
        )
        if not chi.get("significant"):
            return {"ok": False, "error": chi.get("reason", "Prueba no significativa aun")}
        w = chi.get("winner")
        winner_id = (group["variant_a_landing_id"] if w == "A"
                     else group["variant_b_landing_id"])
    await db.studio_landing_ab_groups.update_one(
        {"id": group_id},
        {"$set": {"winner_id": winner_id, "status": "stopped", "decided_at": _iso()}},
    )
    return {"ok": True, "winner_landing_id": winner_id, "group_id": group_id}


# ─── Brand kit lookup helper ──────────────────────────────────────────────────
async def fetch_brand_kit(db, brand_kit_id: Optional[str], user_id: str) -> Optional[Dict[str, Any]]:
    if not brand_kit_id:
        # Fallback: kit activo del user
        kit = await db.brand_kits.find_one(
            {"user_id": user_id, "is_active": True}, {"_id": 0}
        )
        return kit
    return await db.brand_kits.find_one({"id": brand_kit_id, "user_id": user_id}, {"_id": 0})
