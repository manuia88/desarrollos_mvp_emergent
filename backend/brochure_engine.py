"""W4.9 — Brochure Engine.

Business logic that orchestrates renderer + Mongo persistence + branding variants.

Variants:
    corporate_navy   — Navy heavy, cream text, restrained
    cream_minimal    — Cream background, navy text, editorial whitespace
    gradient_bold    — Heavy indigo→rose gradient blocks, bold typography
    editorial_serif  — Magazine-style, serif headings, neutral palette
    dmx_neutral      — Default fallback (DMX brand)

Custom uploads bypass renderer (advisor uploads its own PDF).

Mongo collection: `brochures`
    {
      brochure_id, project_id, dev_org_id, generated_by_user_id,
      branding_variant, pdf_url, social_variants: {fb_feed,...},
      generated_at, expires_at, download_count,
      is_custom_upload, custom_upload_url
    }
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import brochure_renderer as renderer

log = logging.getLogger("dmx.brochure_engine")

# ─── Branding variant catalog ────────────────────────────────────────────────

BRANDING_VARIANTS: Dict[str, Dict[str, Any]] = {
    "corporate_navy": {
        "id": "corporate_navy",
        "label": "Corporate Navy",
        "description": "Navy sólido, tipografía restringida, ideal para inversionistas institucionales.",
        "primary": "#06080F",
        "secondary": "#F0EBE0",
        "accent": "#6366F1",
        "heading_font": "Display",
        "body_font": "Body",
        "uses_gradient": False,
    },
    "cream_minimal": {
        "id": "cream_minimal",
        "label": "Cream Minimal",
        "description": "Cream base, mucho whitespace, estilo editorial sereno.",
        "primary": "#F0EBE0",
        "secondary": "#06080F",
        "accent": "#6366F1",
        "heading_font": "Display",
        "body_font": "Body",
        "uses_gradient": False,
    },
    "gradient_bold": {
        "id": "gradient_bold",
        "label": "Gradient Bold",
        "description": "Bloques de gradiente indigo→rose, tipografía bold, impacto visual.",
        "primary": "#06080F",
        "secondary": "#F0EBE0",
        "accent": "#EC4899",
        "heading_font": "Display",
        "body_font": "Body-Bold",
        "uses_gradient": True,
    },
    "editorial_serif": {
        "id": "editorial_serif",
        "label": "Editorial Serif",
        "description": "Magazine-style con serif, cream + grafito, premium tranquilo.",
        "primary": "#F0EBE0",
        "secondary": "#1A1D24",
        "accent": "#6366F1",
        "heading_font": "Display",
        "body_font": "Body",
        "uses_gradient": False,
    },
    "dmx_neutral": {
        "id": "dmx_neutral",
        "label": "DMX Neutral",
        "description": "Branding DMX por defecto.",
        "primary": "#06080F",
        "secondary": "#F0EBE0",
        "accent": "#6366F1",
        "heading_font": "Display",
        "body_font": "Body",
        "uses_gradient": True,
    },
}

DEFAULT_VARIANT = "dmx_neutral"
EXPIRY_DAYS = 30
PUBLIC_PATH_PREFIX = "/api/brochures/files"
MAX_CUSTOM_UPLOAD_MB = 25
ALLOWED_CUSTOM_MIMES = {"application/pdf"}


def list_branding_variants() -> Dict[str, Dict[str, Any]]:
    return BRANDING_VARIANTS


def resolve_variant(variant_id: Optional[str]) -> Dict[str, Any]:
    return BRANDING_VARIANTS.get(variant_id or DEFAULT_VARIANT, BRANDING_VARIANTS[DEFAULT_VARIANT])


# ─── Branding payload assembly ───────────────────────────────────────────────

async def build_branding_payload(
    db,
    user: Dict[str, Any],
    variant_id: str,
    overrides: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Hidrata branding con datos del tenant + overrides explícitos del usuario."""
    variant = resolve_variant(variant_id)
    overrides = overrides or {}

    tenant_id = user.get("tenant_id") or user.get("dev_org_id") or "dmx"
    tenant_doc = None
    try:
        tenant_doc = await db.tenants.find_one({"tenant_id": tenant_id}, {"_id": 0})
    except Exception:
        tenant_doc = None
    if not tenant_doc:
        try:
            tenant_doc = await db.organizations.find_one(
                {"$or": [{"id": tenant_id}, {"organization_id": tenant_id}, {"dev_org_id": tenant_id}]},
                {"_id": 0},
            )
        except Exception:
            tenant_doc = None
    tenant_doc = tenant_doc or {}

    contact_name = (
        overrides.get("contact_name")
        or user.get("name")
        or user.get("full_name")
        or tenant_doc.get("name")
        or "DesarrollosMX"
    )
    contact_email = overrides.get("contact_email") or user.get("email") or tenant_doc.get("contact_email") or ""
    contact_phone = overrides.get("contact_phone") or tenant_doc.get("contact_phone") or ""
    logo = overrides.get("logo") or tenant_doc.get("logo_url") or tenant_doc.get("logo")
    footer = overrides.get("footer_text") or tenant_doc.get("brochure_footer") or (
        f"© {datetime.now().year} {tenant_doc.get('name', 'DesarrollosMX')} · Información sujeta a cambios sin previo aviso."
    )

    return {
        "variant": variant["id"],
        "variant_meta": variant,
        "contact_name": contact_name,
        "contact_email": contact_email,
        "contact_phone": contact_phone,
        "logo": logo,
        "footer_text": footer,
        "tenant_id": tenant_id,
    }


# ─── Project hydration (Zone Score + comparables) ────────────────────────────

async def hydrate_project(db, project: Dict[str, Any]) -> Dict[str, Any]:
    """Enriquece proyecto con zone score y comparables para el brochure."""
    enriched = dict(project)
    zone_id = project.get("zone_id") or project.get("colonia_id") or project.get("colonia")

    # Zone score
    if zone_id:
        try:
            zs = await db.zone_scores.find_one({"zone_id": zone_id}, {"_id": 0})
            if not zs:
                zs = await db.scores.find_one({"zone_id": zone_id}, {"_id": 0})
            if zs:
                enriched["_zone_score"] = zs
        except Exception as exc:
            log.debug(f"[engine] zone score fetch failed: {exc}")

    # Comparables (max 3, same zone, exclude self)
    try:
        from data_developments import DEVELOPMENTS
        comps = []
        own_id = project.get("id") or project.get("slug")
        for d in DEVELOPMENTS:
            if d.get("id") == own_id:
                continue
            if zone_id and (d.get("colonia_id") == zone_id or d.get("colonia") == zone_id):
                comps.append({
                    "name": d.get("name"),
                    "zone_id": d.get("colonia_id") or d.get("colonia"),
                    "price_from": d.get("price_from"),
                    "price_m2": (
                        round(d["price_from"] / d["m2_range"][0])
                        if d.get("price_from") and d.get("m2_range") else None
                    ),
                    "days_in_market": d.get("days_in_market"),
                })
            if len(comps) >= 3:
                break
        enriched["_comparables"] = comps
    except Exception as exc:
        log.debug(f"[engine] comparables fetch failed: {exc}")
        enriched["_comparables"] = []

    # Aliases para renderer
    enriched.setdefault("hero_photo_url",
                        project.get("hero_photo_url") or project.get("cover_photo") or
                        (project.get("photos", [None])[0] if project.get("photos") else None) or
                        (project.get("gallery_photos", [None])[0] if project.get("gallery_photos") else None))
    enriched.setdefault("gallery_photos", project.get("gallery_photos") or project.get("photos") or [])
    enriched.setdefault("zone_id", zone_id)

    # Pricing aliases
    if project.get("m2_range") and not enriched.get("m2_from"):
        enriched["m2_from"] = project["m2_range"][0]
        enriched["m2_to"] = project["m2_range"][1]
    if project.get("price_per_m2") is None and project.get("price_from") and enriched.get("m2_from"):
        enriched["price_per_m2"] = round(project["price_from"] / enriched["m2_from"])

    # Units → bedrooms/bathrooms aggregation
    units = project.get("units") or []
    if units:
        enriched.setdefault("bedrooms_from", min((u.get("beds", 0) for u in units), default="—"))
        enriched.setdefault("bathrooms_from", min((u.get("baths", 0) for u in units), default="—"))
        enriched.setdefault("parking_spots", min((u.get("parking", 0) for u in units), default="—"))

    enriched.setdefault("delivery_year", project.get("delivery_estimate"))
    enriched.setdefault("property_type", project.get("property_type") or "departamento")
    enriched.setdefault("status", project.get("stage") or project.get("status") or "preventa")

    return enriched


# ─── Public URL helpers ──────────────────────────────────────────────────────

def _pdf_public_url(brochure_id: str) -> str:
    return f"{PUBLIC_PATH_PREFIX}/{brochure_id}/pdf"


def _social_public_urls(brochure_id: str, social_paths: Dict[str, str]) -> Dict[str, str]:
    return {
        fmt: f"{PUBLIC_PATH_PREFIX}/{brochure_id}/social/{fmt}"
        for fmt, path in social_paths.items()
        if path
    }


# ─── Generate brochure ───────────────────────────────────────────────────────

async def generate_brochure(
    db,
    user: Dict[str, Any],
    project: Dict[str, Any],
    variant_id: str,
    overrides: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Genera PDF + 4 variantes sociales. Persiste en Mongo. Returns brochure doc."""
    brochure_id = str(uuid.uuid4())
    branding = await build_branding_payload(db, user, variant_id, overrides)
    enriched = await hydrate_project(db, project)

    # Render
    try:
        pdf_path = renderer.render_brochure_pdf(enriched, branding, brochure_id)
    except Exception as exc:
        log.exception(f"[engine] PDF render failed: {exc}")
        raise RuntimeError(f"pdf_render_failed: {exc}")

    try:
        social_paths = renderer.render_all_social(enriched, branding, brochure_id)
    except Exception as exc:
        log.warning(f"[engine] social render partial fail: {exc}")
        social_paths = {}

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=EXPIRY_DAYS)

    doc = {
        "brochure_id": brochure_id,
        "project_id": project.get("id") or project.get("slug"),
        "project_name": project.get("name"),
        "dev_org_id": project.get("dev_org_id") or project.get("developer_id") or "default",
        "tenant_id": branding["tenant_id"],
        "generated_by_user_id": user.get("user_id"),
        "branding_variant": branding["variant"],
        "pdf_url": _pdf_public_url(brochure_id),
        "pdf_path": pdf_path,
        "social_variants": _social_public_urls(brochure_id, social_paths),
        "social_paths": social_paths,
        "generated_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
        "download_count": 0,
        "is_custom_upload": False,
        "custom_upload_url": None,
        "pdf_size_bytes": Path(pdf_path).stat().st_size if Path(pdf_path).exists() else 0,
    }
    try:
        await db.brochures.insert_one(dict(doc))
    except Exception as exc:
        log.warning(f"[engine] mongo insert failed: {exc}")
    doc.pop("_id", None)
    return doc


# ─── Custom upload ───────────────────────────────────────────────────────────

async def register_custom_upload(
    db,
    user: Dict[str, Any],
    project: Dict[str, Any],
    file_bytes: bytes,
    filename: str,
) -> Dict[str, Any]:
    """Persiste un PDF cargado manualmente por el asesor/developer."""
    if len(file_bytes) > MAX_CUSTOM_UPLOAD_MB * 1024 * 1024:
        raise ValueError("upload_too_large")
    if not filename.lower().endswith(".pdf"):
        raise ValueError("only_pdf_allowed")

    brochure_id = str(uuid.uuid4())
    out_dir = renderer.PDF_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{brochure_id}.pdf"
    with open(out_path, "wb") as f:
        f.write(file_bytes)

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=EXPIRY_DAYS)

    doc = {
        "brochure_id": brochure_id,
        "project_id": project.get("id") or project.get("slug"),
        "project_name": project.get("name"),
        "dev_org_id": project.get("dev_org_id") or project.get("developer_id") or "default",
        "tenant_id": user.get("tenant_id") or user.get("dev_org_id") or "dmx",
        "generated_by_user_id": user.get("user_id"),
        "branding_variant": "custom",
        "pdf_url": _pdf_public_url(brochure_id),
        "pdf_path": str(out_path),
        "social_variants": {},
        "social_paths": {},
        "generated_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
        "download_count": 0,
        "is_custom_upload": True,
        "custom_upload_url": _pdf_public_url(brochure_id),
        "original_filename": filename,
        "pdf_size_bytes": len(file_bytes),
    }
    try:
        await db.brochures.insert_one(dict(doc))
    except Exception as exc:
        log.warning(f"[engine] mongo insert (custom) failed: {exc}")
    doc.pop("_id", None)
    return doc


# ─── Mongo helpers ───────────────────────────────────────────────────────────

async def get_brochure(db, brochure_id: str) -> Optional[Dict[str, Any]]:
    try:
        doc = await db.brochures.find_one({"brochure_id": brochure_id}, {"_id": 0})
        return doc
    except Exception:
        return None


async def list_brochures(
    db,
    tenant_id: Optional[str],
    project_id: Optional[str] = None,
    limit: int = 50,
) -> list:
    q: Dict[str, Any] = {}
    if tenant_id:
        q["tenant_id"] = tenant_id
    if project_id:
        q["project_id"] = project_id
    out = []
    try:
        cursor = db.brochures.find(q, {"_id": 0}).sort("generated_at", -1).limit(limit)
        async for d in cursor:
            out.append(d)
    except Exception as exc:
        log.warning(f"[engine] list failed: {exc}")
    return out


async def increment_download(db, brochure_id: str) -> None:
    try:
        await db.brochures.update_one(
            {"brochure_id": brochure_id},
            {"$inc": {"download_count": 1}, "$set": {"last_downloaded_at": datetime.now(timezone.utc).isoformat()}},
        )
    except Exception:
        pass


async def ensure_brochure_indexes(db) -> None:
    try:
        await db.brochures.create_index("brochure_id", unique=True)
        await db.brochures.create_index("tenant_id")
        await db.brochures.create_index("project_id")
        await db.brochures.create_index("generated_at")
    except Exception as exc:
        log.warning(f"[engine] index create failed: {exc}")


# ─── File path resolver (for streaming) ──────────────────────────────────────

def resolve_pdf_path(brochure_id: str) -> Optional[Path]:
    p = renderer.PDF_DIR / f"{brochure_id}.pdf"
    return p if p.exists() else None


def resolve_social_path(brochure_id: str, fmt: str) -> Optional[Path]:
    p = renderer.SOCIAL_DIR / brochure_id / f"{fmt}.png"
    return p if p.exists() else None
