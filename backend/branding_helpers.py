"""
branding_helpers.py — Shared branding utilities for B19.5
Used by: routes_dev_batch5.py (PDF), routes_dev_batch4_1/4_3.py (email), routes_dev_batch16.py (booking)
"""
from __future__ import annotations
import os
import logging
from typing import Optional, Dict, Any

log = logging.getLogger("dmx.branding_helpers")

DMX_DEFAULTS: Dict[str, Any] = {
    "logo_url": None,
    "primary_color": "#06080F",
    "accent_color": "#F4E9D8",
    "display_name": "DesarrollosMX",
    "tagline": None,
}

UPLOAD_BASE = os.environ.get("IE_UPLOAD_DIR", "/app/backend/uploads/ie_engine")
ORG_LOGOS_DIR = os.path.join(os.path.dirname(UPLOAD_BASE), "org_logos")


async def get_org_branding(db, tenant_id: str) -> Dict[str, Any]:
    """Fetch org branding from db.organizations, merging with DMX defaults."""
    try:
        doc = await db.organizations.find_one(
            {"tenant_id": tenant_id}, {"_id": 0, "branding": 1}
        )
        stored = (doc or {}).get("branding") or {}
        return {**DMX_DEFAULTS, **{k: v for k, v in stored.items() if v is not None}}
    except Exception as e:
        log.warning(f"[branding] Could not load branding for {tenant_id}: {e}")
        return dict(DMX_DEFAULTS)


def logo_url_to_local_path(logo_url: Optional[str]) -> Optional[str]:
    """
    Convert a logo_url stored as '/api/uploads/org_logos/{file}' to a local filesystem path.
    Returns None if URL is external (http) or file does not exist.
    """
    if not logo_url:
        return None
    if logo_url.startswith("http"):
        # External URLs are not accessible in backend PDF generation context
        return None
    # Extract filename from URL path
    # Expected format: /api/uploads/org_logos/{filename}
    if "/org_logos/" in logo_url:
        filename = logo_url.split("/org_logos/")[-1].lstrip("/")
        local_path = os.path.join(ORG_LOGOS_DIR, filename)
        if os.path.isfile(local_path):
            return local_path
    return None


def email_footer_html(branding: Optional[Dict[str, Any]] = None) -> str:
    """
    Returns an HTML footer block with org logo + display_name + tagline.
    Falls back to DMX defaults if branding is None or incomplete.
    """
    b = {**DMX_DEFAULTS, **(branding or {})}
    org_name = b.get("display_name") or "DesarrollosMX"
    tagline   = b.get("tagline") or ""
    logo_url  = b.get("logo_url") or ""
    primary   = b.get("primary_color") or "#06080F"
    accent    = b.get("accent_color") or "#F4E9D8"

    # Only render logo if it's an accessible URL (http/https for email clients)
    logo_block = ""
    if logo_url and logo_url.startswith("http"):
        logo_block = f'<img src="{logo_url}" alt="{org_name}" style="max-height:32px;margin-bottom:6px;" /><br/>'

    tagline_block = f'<div style="font-size:11px;color:rgba(240,235,224,0.45);margin-top:4px;">{tagline}</div>' if tagline else ""

    return f"""
    <div style="margin-top:32px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.08);
                text-align:center;font-family:'DM Sans',Arial,sans-serif;">
      {logo_block}
      <div style="font-family:'Outfit',Arial,sans-serif;font-weight:800;font-size:14px;
                  color:{accent};letter-spacing:-0.01em;">
        {org_name}
      </div>
      {tagline_block}
      <div style="font-size:10px;color:rgba(240,235,224,0.28);margin-top:8px;">
        Enviado por {org_name} vía DesarrollosMX Platform
      </div>
    </div>
    """


def email_header_html(branding: Optional[Dict[str, Any]] = None) -> str:
    """Returns HTML header block with org name styled in primary_color."""
    b = {**DMX_DEFAULTS, **(branding or {})}
    org_name = b.get("display_name") or "DesarrollosMX"
    primary  = b.get("primary_color") or "#06080F"
    accent   = b.get("accent_color") or "#F4E9D8"
    logo_url = b.get("logo_url") or ""

    logo_block = ""
    if logo_url and logo_url.startswith("http"):
        logo_block = f'<img src="{logo_url}" alt="{org_name}" style="max-height:36px;margin-bottom:4px;" /><br/>'

    return f"""
    <div style="border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:16px;margin-bottom:20px;">
      {logo_block}
      <h1 style="font-family:'Outfit',Arial,sans-serif;font-weight:800;font-size:22px;
                 margin:0;color:{accent};">
        {org_name}
      </h1>
    </div>
    """
