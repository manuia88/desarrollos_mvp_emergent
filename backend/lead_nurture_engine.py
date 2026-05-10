"""W4.2D3.5 — Lead Nurture Engine.

Daily cron (04:00 MX): para cada landing_lead activo busca desarrollos nuevos en
su zone_interest después de lead.created_at y envía email vía Resend si hay
matches (con throttle anti-spam: 7 días entre emails al mismo (email, zone)).

Si RESEND_API_KEY no presente → log stub + skip envío real (no crash).
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger("dmx.lead_nurture_engine")

NURTURE_THROTTLE_DAYS = 7
RESEND_FROM = os.environ.get(
    "RESEND_FROM_LEAD_NURTURE",
    "DesarrollosMX <no-reply@desarrollosmx.com>",
)
SITE_BASE = "https://desarrollosmx.io"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_days_ago(days: int) -> str:
    return (_now() - timedelta(days=days)).isoformat()


def _zone_interest_slug(zi: str) -> str:
    """Strip prefix from zone_interest (zone-/alcaldia-/intent-)."""
    if not zi:
        return ""
    for prefix in ("zone-", "alcaldia-", "intent-"):
        if zi.startswith(prefix):
            return zi[len(prefix):]
    return zi


def _zone_interest_kind(zi: str) -> str:
    if zi.startswith("zone-"):
        return "zone"
    if zi.startswith("alcaldia-"):
        return "alcaldia"
    if zi.startswith("intent-"):
        return "intent"
    return "other"


# ─── Match resolution ─────────────────────────────────────────────────────────
async def _developments_for_zone_kind(kind: str, slug: str, since_iso: str) -> List[Dict[str, Any]]:
    """Return list of dev dicts that match a given (kind, slug) and were created after since_iso.

    For zone (colonia): match colonia_id == slug.
    For alcaldia: match colonia in that alcaldía via data_seed.
    For intent: match by stage/tipo filter from INTENT_LANDINGS.
    Uses data_developments.DEVELOPMENTS as authoritative source (no DB hit).
    """
    try:
        from data_developments import DEVELOPMENTS
    except Exception:
        return []

    matches: List[Dict[str, Any]] = []

    if kind == "zone":
        for d in DEVELOPMENTS:
            if d.get("colonia_id") == slug:
                matches.append(d)
    elif kind == "alcaldia":
        try:
            from seo_landings_config import COLONIAS_TARGET
            slugs_in_alcaldia = {
                k for k, v in COLONIAS_TARGET.items()
                if v.get("alcaldia_slug") == slug
            }
            for d in DEVELOPMENTS:
                if d.get("colonia_id") in slugs_in_alcaldia:
                    matches.append(d)
        except Exception as e:
            log.warning(f"[lead_nurture] alcaldia match failed for {slug}: {e}")
    elif kind == "intent":
        try:
            from seo_landings_config import INTENT_LANDINGS
            cfg = INTENT_LANDINGS.get(slug)
            if cfg:
                stage_f = cfg.get("stage_filter")
                tipo_f = cfg.get("tipo_filter")
                for d in DEVELOPMENTS:
                    if stage_f and (d.get("stage") or "").lower() != stage_f:
                        continue
                    if tipo_f:
                        td = (d.get("tipo") or d.get("property_type") or "").lower()
                        if td != tipo_f:
                            continue
                    matches.append(d)
        except Exception as e:
            log.warning(f"[lead_nurture] intent match failed for {slug}: {e}")

    # Filter by since_iso when dev has created_at; otherwise include (assumes dev is "new" relative to lead).
    out: List[Dict[str, Any]] = []
    for d in matches:
        ca = d.get("created_at") or d.get("listed_at") or ""
        if ca and isinstance(ca, str) and ca < since_iso:
            continue
        out.append(d)
    return out[:5]  # limit to 5 per email


def _zone_display_name(kind: str, slug: str) -> str:
    try:
        if kind == "zone":
            from seo_landings_config import COLONIAS_TARGET
            info = COLONIAS_TARGET.get(slug)
            if info:
                return info["name"]
        elif kind == "alcaldia":
            from seo_landings_config import ALCALDIAS_CDMX
            return ALCALDIAS_CDMX.get(slug, slug)
        elif kind == "intent":
            from seo_landings_config import INTENT_LANDINGS
            cfg = INTENT_LANDINGS.get(slug)
            if cfg:
                return cfg.get("label", slug)
    except Exception:
        pass
    return slug.replace("-", " ").title()


def _zone_landing_url(kind: str, slug: str) -> str:
    if kind == "zone":
        return f"{SITE_BASE}/zona/{slug}"
    if kind == "alcaldia":
        return f"{SITE_BASE}/alcaldia/{slug}"
    if kind == "intent":
        return f"{SITE_BASE}/cdmx/{slug}"
    return f"{SITE_BASE}/marketplace"


# ─── Email composition + send ─────────────────────────────────────────────────
def _compose_email_html(zone_name: str, zone_url: str, devs: List[Dict[str, Any]]) -> str:
    items_html = "".join(
        f"""<li style="margin-bottom: 10px;">
              <strong style="font-family: Arial, sans-serif; font-size: 14px; color: #06080F;">
                {d.get('name') or d.get('id')}
              </strong>
              <span style="font-family: Arial, sans-serif; font-size: 13px; color: #6b7280;">
                · {(d.get('stage') or 'preventa').replace('_', ' ')}
              </span>
            </li>"""
        for d in devs
    )
    return f"""<!doctype html>
<html><body style="background:#F0EBE0; padding:24px; margin:0;">
  <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:14px; padding:28px 26px; font-family: Arial, sans-serif;">
    <div style="font-size:11px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; color:#6366F1; margin-bottom:8px;">
      Alerta de inventario · DesarrollosMX
    </div>
    <h1 style="font-family: Arial, sans-serif; font-size:22px; color:#06080F; margin:0 0 12px;">
      Nuevo inventario en {zone_name}
    </h1>
    <p style="font-size:14px; color:#374151; line-height:1.6; margin:0 0 18px;">
      Tu zona de interés <strong>{zone_name}</strong> tiene {len(devs)} nuevo(s) desarrollo(s) verificado(s) por DesarrollosMX.
    </p>
    <ul style="padding-left:18px; margin:0 0 22px;">
      {items_html}
    </ul>
    <a href="{zone_url}"
       style="display:inline-block; padding:10px 22px; border-radius:9999px;
              background: linear-gradient(90deg, #6366F1, #EC4899);
              color:#fff; text-decoration:none; font-weight:700; font-size:14px;">
      Ver en DesarrollosMX
    </a>
    <p style="font-size:11px; color:#9ca3af; margin:26px 0 0;">
      Recibes este correo porque te suscribiste a alertas de {zone_name} en {SITE_BASE}.
      Si ya no te interesa, responde a este correo con "BAJA".
    </p>
  </div>
</body></html>"""


async def _send_resend_email(to_email: str, subject: str, html: str) -> bool:
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        log.info(f"[lead_nurture] Resend stub (no RESEND_API_KEY) → would email {to_email}: {subject}")
        return False
    body = {
        "from": RESEND_FROM,
        "to": [to_email],
        "subject": subject,
        "html": html,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as cli:
            r = await cli.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}"},
                json=body,
            )
        ok = r.status_code in (200, 202)
        if not ok:
            log.warning(f"[lead_nurture] Resend HTTP {r.status_code}: {r.text[:200]}")
        return ok
    except Exception as e:
        log.warning(f"[lead_nurture] email send failed: {e}")
        return False


# ─── Main entry: find_matches + send ──────────────────────────────────────────
async def find_matches(db) -> List[Dict[str, Any]]:
    """For each active landing_lead, find new developments after lead.created_at
    where last_nurture_sent_at is older than NURTURE_THROTTLE_DAYS.
    Returns list of {lead_id, email, zone_interest, kind, slug, zone_name, zone_url, dev_matches}.
    """
    cutoff_iso = _iso_days_ago(NURTURE_THROTTLE_DAYS)

    # Query: leads that have NEVER been nurtured OR last sent before cutoff.
    q = {
        "$or": [
            {"last_nurture_sent_at": {"$exists": False}},
            {"last_nurture_sent_at": None},
            {"last_nurture_sent_at": {"$lt": cutoff_iso}},
        ],
    }
    leads = await db.landing_leads.find(q, {"_id": 0}).limit(1000).to_list(length=1000)

    out: List[Dict[str, Any]] = []
    for lead in leads:
        zi = lead.get("zone_interest") or ""
        if not zi:
            continue
        kind = _zone_interest_kind(zi)
        slug = _zone_interest_slug(zi)
        if kind == "other" or not slug:
            continue

        since_iso = lead.get("created_at") or _iso_days_ago(30)
        devs = await _developments_for_zone_kind(kind, slug, since_iso)
        if not devs:
            continue

        out.append({
            "lead_id": lead.get("lead_id"),
            "email": lead.get("email"),
            "zone_interest": zi,
            "kind": kind,
            "slug": slug,
            "zone_name": _zone_display_name(kind, slug),
            "zone_url": _zone_landing_url(kind, slug),
            "dev_matches": devs,
        })
    return out


async def send_nurture_email(email: str, zone_name: str, zone_url: str,
                             dev_matches: List[Dict[str, Any]]) -> bool:
    if not email or not dev_matches:
        return False
    subject = f"Nuevo inventario en {zone_name} · DesarrollosMX"
    html = _compose_email_html(zone_name, zone_url, dev_matches)
    return await _send_resend_email(email, subject, html)


async def run_lead_nurture_match(db) -> Dict[str, Any]:
    """Cron entry point. Returns {matches, sent, skipped, ts, smart_routing}."""
    ts = _now().isoformat()

    # W4.6 Y.3A — Pre-paso: smart-route fresh leads (created_at <2h sin assigned_to)
    routing_summary: Dict[str, Any] = {"routed": 0, "auto_accepted": 0,
                                       "pending": 0, "flagged": 0, "failed": 0}
    try:
        from agentic_crm.smart_routing_engine import auto_route_fresh_leads
        routing_summary = await auto_route_fresh_leads(db, hours_window=2)
    except Exception as e:  # noqa: BLE001
        log.warning(f"[lead_nurture] smart-routing pre-step failed: {e}")

    matches = await find_matches(db)
    sent = 0
    skipped = 0

    for m in matches:
        ok = await send_nurture_email(
            m["email"], m["zone_name"], m["zone_url"], m["dev_matches"],
        )
        if ok:
            try:
                await db.landing_leads.update_one(
                    {"lead_id": m["lead_id"]},
                    {"$set": {
                        "last_nurture_sent_at": _now().isoformat(),
                        "last_nurture_match_count": len(m["dev_matches"]),
                    }},
                )
            except Exception as e:
                log.warning(f"[lead_nurture] update lead failed: {e}")
            sent += 1
        else:
            skipped += 1

    summary = {"matches": len(matches), "sent": sent, "skipped": skipped,
               "smart_routing": routing_summary, "ts": ts}
    log.info(f"[lead_nurture] run completed: {summary}")
    return summary
