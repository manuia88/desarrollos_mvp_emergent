"""W5.22 Z.8.7 Sub-B1 Sub-C — Studio property intake routes (5 endpoints).

Collection: studio_property_intakes
Indexes creados en server.py startup.
Auth: require_studio (T2+) via routes.studio.require_studio (mismo pattern Z.8 v1).
Tenant scoping: created_by_user_id = user.user_id · tenant_id = user.tenant_id.
"""
from __future__ import annotations

import logging
import secrets
import unicodedata
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel, Field, ValidationError

from studio_property_intake_schema import (
    PropertyIntake,
    autofill_defaults,
    HYBRID_TEMPLATES,
    LIVE_ONLY_TEMPLATES,
    INVEST_ONLY_TEMPLATES,
)
from studio_copy_generator.router import generate_copy as gen_copy
from studio_copy_generator.schemas import CopyGenerationRequest, CopyGenerationResponse

log = logging.getLogger("dmx.routes_studio_property_intake")

router = APIRouter(prefix="/api/studio/property-intake", tags=["studio_property_intake"])


# ─── Helpers ────────────────────────────────────────────────────────────────
async def _require_user(request: Request):
    from routes.studio import require_studio
    return await require_studio(request)


def _db(request: Request):
    return request.app.state.db


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


def _uid(prefix: str = "intk") -> str:
    return f"{prefix}_{secrets.token_hex(8)}"


def _slugify(text: str) -> str:
    if not text:
        return secrets.token_hex(4)
    t = unicodedata.normalize("NFKD", text)
    t = t.encode("ascii", "ignore").decode("ascii").lower()
    import re
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    if len(t) < 3:
        t = (t + "-" + secrets.token_hex(2)).strip("-")
    return t[:80]


async def _ensure_unique_slug(db, base: str) -> str:
    candidate = base
    while await db.studio_property_intakes.find_one({"slug": candidate}, {"_id": 0, "slug": 1}):
        candidate = f"{base[:74]}-{secrets.token_hex(2)}"
    return candidate


# ─── Request bodies ─────────────────────────────────────────────────────────
class IntakeCreateBody(BaseModel):
    """Body parcial · validamos contra PropertyIntake tras autofill."""
    project_name: str = Field(..., min_length=2, max_length=160)
    template_key: str = Field(..., min_length=2, max_length=40)
    property_type: str = "development"
    listing_intent: str = "sell"
    buyer_intent: Optional[str] = None
    slug: Optional[str] = None
    # Allow arbitrary additional fields from intake spec
    extra: Dict[str, Any] = Field(default_factory=dict)


class IntakePatchBody(BaseModel):
    patch: Dict[str, Any] = Field(default_factory=dict)


class PublishBody(BaseModel):
    published: bool = True


# ─── Endpoints ──────────────────────────────────────────────────────────────
@router.post("")
async def create_intake(body: Dict[str, Any], request: Request) -> Dict[str, Any]:
    """Crea intake · valida via PropertyIntake (con autofill) · persiste en Mongo."""
    user = await _require_user(request)
    db = _db(request)

    if not body or "project_name" not in body or "template_key" not in body:
        raise HTTPException(422, "project_name y template_key son requeridos")

    # autofill calc defaults
    intake_data = autofill_defaults(body)

    # Validate via Pydantic
    try:
        intake = PropertyIntake(**intake_data)
    except ValidationError as ve:
        raise HTTPException(422, f"Validacion fallida: {ve.errors()}") from ve

    # Slug unicidad
    raw_slug = intake.slug or _slugify(intake.project_name)
    slug = await _ensure_unique_slug(db, raw_slug)

    warnings: List[str] = getattr(intake, "_collected_warnings", []) or []

    doc = intake.model_dump(mode="json")
    doc.update({
        "id": _uid(),
        "slug": slug,
        "tenant_id": user.tenant_id or "default",
        "created_by_user_id": user.user_id,
        "created_at": _iso(),
        "updated_at": _iso(),
        "generated_copy_cached": None,
        "generated_copy_at": None,
        "generated_copy_template_key": None,
        "generated_copy_buyer_intent": None,
        "_warnings": warnings,
        "landing_id": None,
    })
    await db.studio_property_intakes.insert_one(dict(doc))
    doc.pop("_id", None)
    return {"intake_id": doc["id"], "slug": doc["slug"], "intake": doc, "_warnings": warnings}


@router.get("/list")
async def list_intakes(
    request: Request,
    template_key: Optional[str] = Query(None),
    property_type: Optional[str] = Query(None),
    limit: int = Query(30, ge=1, le=100),
    skip: int = Query(0, ge=0),
) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    q: Dict[str, Any] = {"created_by_user_id": user.user_id}
    if template_key:
        q["template_key"] = template_key
    if property_type:
        q["property_type"] = property_type
    cursor = db.studio_property_intakes.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    items = await cursor.to_list(limit)
    total = await db.studio_property_intakes.count_documents(q)
    return {"items": items, "total": total, "skip": skip, "limit": limit}


# ─── Public endpoint (Z.8.7 Sub-D · NO auth · sirve LandingPublic.js) ──────
@router.get("/public/{slug}")
async def get_public_intake(slug: str, request: Request) -> Dict[str, Any]:
    """Endpoint publico · NO require auth · devuelve intake si published=True.

    Consumido por frontend/src/pages/public/LandingPublic.js (Z.8.7 dispatch coexistencia).
    Importante: declarado ANTES de /{intake_id} para evitar wildcard catch.
    """
    db = _db(request)
    doc = await db.studio_property_intakes.find_one(
        {"slug": slug, "published": True},
        {"_id": 0, "tenant_id": 0, "created_by_user_id": 0, "_warnings": 0},
    )
    if not doc:
        raise HTTPException(404, "Landing no encontrada o no publicada")
    return {
        "slug": doc.get("slug"),
        "template_key": doc.get("template_key"),
        "buyer_intent": doc.get("buyer_intent"),
        "intake": doc,
        "generated_copy_cached": doc.get("generated_copy_cached"),
        "generated_copy_at": doc.get("generated_copy_at"),
    }


@router.get("/{intake_id}")
async def get_intake(intake_id: str, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    doc = await db.studio_property_intakes.find_one(
        {"id": intake_id, "created_by_user_id": user.user_id}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(404, "Intake no encontrado")
    return {"intake": doc}


@router.patch("/{intake_id}")
async def patch_intake(intake_id: str, body: IntakePatchBody, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    existing = await db.studio_property_intakes.find_one(
        {"id": intake_id, "created_by_user_id": user.user_id}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(404, "Intake no encontrado")
    # Merge + revalidate
    merged = {**existing, **(body.patch or {})}
    merged = autofill_defaults(merged)
    # Strip server-only fields antes de Pydantic validate
    cleanish = {k: v for k, v in merged.items() if not k.startswith("_") and k not in ("id", "tenant_id", "created_by_user_id", "created_at", "updated_at", "generated_copy_cached", "generated_copy_at", "generated_copy_template_key", "generated_copy_buyer_intent", "landing_id")}
    try:
        intake = PropertyIntake(**cleanish)
    except ValidationError as ve:
        raise HTTPException(422, f"Validacion fallida: {ve.errors()}") from ve
    warnings = getattr(intake, "_collected_warnings", []) or []
    update_doc = intake.model_dump(mode="json")
    update_doc.update({"updated_at": _iso(), "_warnings": warnings})
    await db.studio_property_intakes.update_one(
        {"id": intake_id, "created_by_user_id": user.user_id}, {"$set": update_doc}
    )
    refreshed = await db.studio_property_intakes.find_one(
        {"id": intake_id, "created_by_user_id": user.user_id}, {"_id": 0}
    )
    return {"intake": refreshed, "_warnings": warnings}


@router.post("/{intake_id}/generate-copy", response_model=CopyGenerationResponse)
async def generate_copy_endpoint(intake_id: str, body: CopyGenerationRequest, request: Request) -> CopyGenerationResponse:
    user = await _require_user(request)
    db = _db(request)
    intake = await db.studio_property_intakes.find_one(
        {"id": intake_id, "created_by_user_id": user.user_id}, {"_id": 0}
    )
    if not intake:
        raise HTTPException(404, "Intake no encontrado")

    template_key = intake.get("template_key")
    buyer_intent = intake.get("buyer_intent")

    # Construye project_data (subset relevante para LLM · sin server-only fields)
    project_data = {k: v for k, v in intake.items() if not k.startswith("_") and k not in (
        "id", "tenant_id", "created_by_user_id", "created_at", "updated_at",
        "generated_copy_cached", "generated_copy_at", "generated_copy_template_key", "generated_copy_buyer_intent", "landing_id",
    )}

    result = await gen_copy(
        project_data=project_data,
        template_key=template_key,
        buyer_intent=buyer_intent,
        force_regenerate=body.force_regenerate,
    )

    # Persist solo si tenemos copy_json valido
    if result.get("copy_json"):
        await db.studio_property_intakes.update_one(
            {"id": intake_id, "created_by_user_id": user.user_id},
            {"$set": {
                "generated_copy_cached": result["copy_json"],
                "generated_copy_at": _iso(),
                "generated_copy_template_key": template_key,
                "generated_copy_buyer_intent": buyer_intent,
                "updated_at": _iso(),
            }},
        )

    return CopyGenerationResponse(
        copy_json=result.get("copy_json"),
        cached=bool(result.get("cached")),
        generation_time_ms=int(result.get("generation_time_ms") or 0),
        fallback=bool(result.get("fallback")),
        error=result.get("error"),
    )



# ─── Publish toggle (Z.8.7 Sub-D · auth · scoped al dueno del intake) ──────
@router.post("/{intake_id}/publish")
async def publish_intake(intake_id: str, body: PublishBody, request: Request) -> Dict[str, Any]:
    """Marca intake como publicado/despublicado · expone el slug en endpoint publico."""
    user = await _require_user(request)
    db = _db(request)
    doc = await db.studio_property_intakes.find_one(
        {"id": intake_id, "created_by_user_id": user.user_id}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(404, "Intake no encontrado")

    update_fields: Dict[str, Any] = {
        "published": body.published,
        "updated_at": _iso(),
    }
    if body.published:
        update_fields["published_at"] = _iso()

    await db.studio_property_intakes.update_one(
        {"id": intake_id, "created_by_user_id": user.user_id},
        {"$set": update_fields},
    )

    return {
        "intake_id": intake_id,
        "published": body.published,
        "public_url": f"/landing/{doc.get('slug')}" if body.published else None,
    }
