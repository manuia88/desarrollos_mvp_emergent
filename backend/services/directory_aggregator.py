"""Phase 15 · Batch 38 — Directory Aggregator Service.

Aggregates cross-org partnership data into 3 directory views:
- get_dev_red_comercial(dev_org_id) → inmobiliarias + asesores in-house + asesores freelance
- get_asesor_mis_aliados(asesor_id) → devs approved (dev_advisor_authorizations B36)
- get_inmobiliaria_red_comercial(inmobiliaria_id) → devs partners + asesores + cross-inmobiliaria

Reuses schemas from B35 (inmobiliaria_advisor_relationships, inmobiliaria_dev_partnerships),
B36 (dev_advisor_authorizations), B37 (dev_internal_users, inmobiliaria_internal_users,
cross_org_partnerships).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.directory_aggregator")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(v) -> Optional[str]:
    if isinstance(v, datetime):
        return v.isoformat()
    return v


# ─── Branding helpers (B19.5 fallback) ────────────────────────────────────────

async def _get_dev_branding(db, dev_org_id: str) -> Dict[str, Any]:
    """Return branding info for a dev org. Falls back to defaults if not set."""
    doc = await db.dev_orgs.find_one(
        {"org_id": dev_org_id},
        {"_id": 0, "name": 1, "display_name": 1, "logo_url": 1, "tagline": 1},
    )
    name = (doc or {}).get("display_name") or (doc or {}).get("name") or dev_org_id.replace("_", " ").title()
    return {
        "logo_url": (doc or {}).get("logo_url"),
        "display_name": name,
        "tagline": (doc or {}).get("tagline") or "",
    }


async def _get_inmobiliaria_branding(db, inm_id: str) -> Dict[str, Any]:
    doc = await db.inmobiliarias.find_one(
        {"id": inm_id},
        {"_id": 0, "name": 1, "logo_url": 1, "tagline": 1, "ampi_verified": 1},
    )
    return {
        "logo_url": (doc or {}).get("logo_url"),
        "display_name": (doc or {}).get("name") or inm_id,
        "tagline": (doc or {}).get("tagline") or "",
        "ampi_verified": bool((doc or {}).get("ampi_verified")),
    }


# ─── KPI helpers ──────────────────────────────────────────────────────────────

async def _kpi_for_asesor(db, asesor_id: str, *, dev_org_id: Optional[str] = None,
                          period_days: int = 365) -> Dict[str, Any]:
    """Aggregate KPIs for an asesor, optionally scoped to a dev_org."""
    cutoff_12m = _now() - timedelta(days=period_days)
    cutoff_30d = _now() - timedelta(days=30)

    deals_q: Dict[str, Any] = {"assigned_to": asesor_id, "status": "cerrado_ganado",
                                "closed_at": {"$gte": cutoff_12m.isoformat()}}
    leads_q: Dict[str, Any] = {"assigned_to": asesor_id,
                                "created_at": {"$gte": cutoff_30d.isoformat()}}
    if dev_org_id:
        deals_q["dev_org_id"] = dev_org_id
        leads_q["dev_org_id"] = dev_org_id

    deals_12m = await db.leads.count_documents(deals_q)
    leads_30d = await db.leads.count_documents(leads_q)

    # Conversion = deals_closed / leads_created (last 12m window)
    leads_12m_q = dict(deals_q)
    leads_12m_q.pop("status", None)
    leads_12m_q["created_at"] = {"$gte": cutoff_12m.isoformat()}
    leads_12m_q.pop("closed_at", None)
    leads_12m = await db.leads.count_documents(leads_12m_q)
    conversion_pct = round((deals_12m / leads_12m) * 100, 1) if leads_12m > 0 else 0.0

    # Last activity
    last_lead = await db.leads.find_one(
        {"assigned_to": asesor_id, **({"dev_org_id": dev_org_id} if dev_org_id else {})},
        {"_id": 0, "last_activity_at": 1, "closed_at": 1, "created_at": 1},
        sort=[("last_activity_at", -1)],
    )
    last_activity_at = None
    last_deal_at = None
    if last_lead:
        last_activity_at = last_lead.get("last_activity_at") or last_lead.get("created_at")
    last_deal = await db.leads.find_one(
        {"assigned_to": asesor_id, "status": "cerrado_ganado",
         **({"dev_org_id": dev_org_id} if dev_org_id else {})},
        {"_id": 0, "closed_at": 1},
        sort=[("closed_at", -1)],
    )
    if last_deal:
        last_deal_at = last_deal.get("closed_at")

    # Trust score (B32)
    trust_doc = await db.asesor_trust_scores.find_one(
        {"asesor_id": asesor_id},
        {"_id": 0, "trust_score": 1},
    )
    trust_score = (trust_doc or {}).get("trust_score", 0)

    return {
        "deals_closed_12m": deals_12m,
        "leads_referred_30d": leads_30d,
        "conversion_pct": conversion_pct,
        "last_activity_at": last_activity_at,
        "last_deal_at": last_deal_at,
        "trust_score": trust_score,
    }


async def _kpi_for_inmobiliaria(db, inmobiliaria_id: str, *, dev_org_id: Optional[str] = None,
                                period_days: int = 365) -> Dict[str, Any]:
    """KPIs for an inmobiliaria's collaboration with a dev org (or globally)."""
    cutoff_12m = _now() - timedelta(days=period_days)
    cutoff_30d = _now() - timedelta(days=30)

    deals_q: Dict[str, Any] = {"origin_inmobiliaria_id": inmobiliaria_id,
                                "status": "cerrado_ganado",
                                "closed_at": {"$gte": cutoff_12m.isoformat()}}
    leads_q: Dict[str, Any] = {"origin_inmobiliaria_id": inmobiliaria_id,
                                "created_at": {"$gte": cutoff_30d.isoformat()}}
    if dev_org_id:
        deals_q["dev_org_id"] = dev_org_id
        leads_q["dev_org_id"] = dev_org_id

    deals_12m = await db.leads.count_documents(deals_q)
    leads_30d = await db.leads.count_documents(leads_q)

    leads_12m_q = {"origin_inmobiliaria_id": inmobiliaria_id,
                   "created_at": {"$gte": cutoff_12m.isoformat()}}
    if dev_org_id:
        leads_12m_q["dev_org_id"] = dev_org_id
    leads_12m = await db.leads.count_documents(leads_12m_q)
    conversion_pct = round((deals_12m / leads_12m) * 100, 1) if leads_12m > 0 else 0.0

    last_lead = await db.leads.find_one(
        {"origin_inmobiliaria_id": inmobiliaria_id,
         **({"dev_org_id": dev_org_id} if dev_org_id else {})},
        {"_id": 0, "last_activity_at": 1, "created_at": 1},
        sort=[("last_activity_at", -1)],
    )
    last_activity_at = (last_lead or {}).get("last_activity_at") or (last_lead or {}).get("created_at")

    return {
        "deals_closed_12m": deals_12m,
        "leads_referred_30d": leads_30d,
        "conversion_pct": conversion_pct,
        "last_activity_at": last_activity_at,
    }


# ─── 1) Dev Red Comercial ─────────────────────────────────────────────────────

async def get_dev_red_comercial(db, dev_org_id: str) -> Dict[str, List[Dict[str, Any]]]:
    """Aggregate inmobiliarias partners + asesores in-house + asesores freelance."""
    # Inmobiliarias aliadas (B35)
    inm_partnerships = await db.inmobiliaria_dev_partnerships.find(
        {"dev_org_id": dev_org_id, "status": "active"},
        {"_id": 0},
    ).to_list(200)

    inmobiliarias = []
    for p in inm_partnerships:
        inm_id = p.get("inmobiliaria_id")
        if not inm_id:
            continue
        branding = await _get_inmobiliaria_branding(db, inm_id)
        kpi = await _kpi_for_inmobiliaria(db, inm_id, dev_org_id=dev_org_id)
        inmobiliarias.append({
            "type": "inmobiliaria",
            "id": inm_id,
            "partnership_id": p.get("partnership_id"),
            "branding": branding,
            "commission_pct": p.get("commission_pct"),
            "notes": p.get("notes"),
            "since": _iso(p.get("created_at")),
            "kpi": kpi,
        })

    # Asesores in-house (B37 dev_internal_users)
    inhouse = await db.dev_internal_users.find(
        {"dev_org_id": dev_org_id, "status": "active"},
        {"_id": 0},
    ).to_list(500)
    asesores_inhouse = []
    for u in inhouse:
        asesor_id = u.get("user_id") or u.get("id")
        if not asesor_id:
            continue
        kpi = await _kpi_for_asesor(db, asesor_id, dev_org_id=dev_org_id)
        asesores_inhouse.append({
            "type": "asesor_inhouse",
            "id": asesor_id,
            "email": u.get("email"),
            "name": u.get("name") or u.get("email"),
            "role": u.get("role"),
            "status": u.get("status"),
            "assigned_projects": u.get("assigned_projects") or [],
            "kpi": kpi,
        })

    # Asesores freelance approved (B36 dev_advisor_authorizations)
    auth_freelance = await db.dev_advisor_authorizations.find(
        {"dev_org_id": dev_org_id, "status": "approved"},
        {"_id": 0},
    ).to_list(500)
    asesores_freelance = []
    for a in auth_freelance:
        asesor_id = a.get("asesor_id")
        if not asesor_id:
            continue
        u_doc = await db.users.find_one(
            {"user_id": asesor_id},
            {"_id": 0, "name": 1, "email": 1, "picture": 1},
        )
        kpi = await _kpi_for_asesor(db, asesor_id, dev_org_id=dev_org_id)
        asesores_freelance.append({
            "type": "asesor_freelance",
            "id": asesor_id,
            "auth_id": a.get("auth_id"),
            "name": (u_doc or {}).get("name") or asesor_id,
            "email": (u_doc or {}).get("email"),
            "picture": (u_doc or {}).get("picture"),
            "auto_approved": bool(a.get("auto_approved")),
            "approved_at": _iso(a.get("decided_at")),
            "commission_pct": a.get("commission_pct"),
            "kpi": kpi,
        })

    return {
        "inmobiliarias": inmobiliarias,
        "asesores_inhouse": asesores_inhouse,
        "asesores_freelance": asesores_freelance,
        "totals": {
            "inmobiliarias": len(inmobiliarias),
            "asesores_inhouse": len(asesores_inhouse),
            "asesores_freelance": len(asesores_freelance),
        },
    }


# ─── 2) Asesor Mis Aliados ────────────────────────────────────────────────────

async def get_asesor_mis_aliados(db, asesor_id: str) -> Dict[str, Any]:
    """Devs approved con whitelist + comisión + KPI personal del asesor."""
    auths = await db.dev_advisor_authorizations.find(
        {"asesor_id": asesor_id, "status": "approved"},
        {"_id": 0},
    ).to_list(200)

    aliados = []
    for a in auths:
        dev_org_id = a.get("dev_org_id")
        if not dev_org_id:
            continue
        branding = await _get_dev_branding(db, dev_org_id)

        # Inventario count
        try:
            from data_developments import DEVELOPMENTS
            inventario_count = sum(
                1 for d in DEVELOPMENTS
                if (d.get("developer_id") or d.get("dev_org_id")) == dev_org_id
            )
        except Exception:
            inventario_count = 0

        kpi = await _kpi_for_asesor(db, asesor_id, dev_org_id=dev_org_id)

        # Response time avg (simple proxy: avg time to first reply on leads)
        response_time_avg_hours = None
        try:
            sample = await db.leads.find(
                {"assigned_to": asesor_id, "dev_org_id": dev_org_id,
                 "first_response_at": {"$ne": None}},
                {"_id": 0, "created_at": 1, "first_response_at": 1},
            ).limit(50).to_list(50)
            if sample:
                deltas = []
                for s in sample:
                    try:
                        c = datetime.fromisoformat(s["created_at"])
                        r = datetime.fromisoformat(s["first_response_at"])
                        deltas.append((r - c).total_seconds() / 3600.0)
                    except Exception:
                        pass
                if deltas:
                    response_time_avg_hours = round(sum(deltas) / len(deltas), 1)
        except Exception:
            pass

        # Default commission from dev_org if not on auth
        commission_pct = a.get("commission_pct")
        if commission_pct is None:
            org_doc = await db.dev_orgs.find_one(
                {"org_id": dev_org_id},
                {"_id": 0, "default_commission_pct": 1},
            )
            commission_pct = (org_doc or {}).get("default_commission_pct")

        aliados.append({
            "auth_id": a.get("auth_id"),
            "dev_org_id": dev_org_id,
            "branding": branding,
            "commission_pct": commission_pct,
            "inventario_count": inventario_count,
            "approved_at": _iso(a.get("decided_at")),
            "auto_approved": bool(a.get("auto_approved")),
            "kpi": {
                **kpi,
                "response_time_avg_hours": response_time_avg_hours,
            },
        })

    return {
        "items": aliados,
        "total": len(aliados),
    }


# ─── 3) Inmobiliaria Red Comercial ────────────────────────────────────────────

async def get_inmobiliaria_red_comercial(db, inmobiliaria_id: str) -> Dict[str, List[Dict[str, Any]]]:
    """Devs partners + asesores in-house + freelance + cross-inmobiliaria."""
    # Devs partners (B35)
    dev_partnerships = await db.inmobiliaria_dev_partnerships.find(
        {"inmobiliaria_id": inmobiliaria_id, "status": "active"},
        {"_id": 0},
    ).to_list(200)
    devs = []
    for p in dev_partnerships:
        dev_id = p.get("dev_org_id")
        if not dev_id:
            continue
        branding = await _get_dev_branding(db, dev_id)
        kpi = await _kpi_for_inmobiliaria(db, inmobiliaria_id, dev_org_id=dev_id)
        devs.append({
            "type": "dev",
            "id": dev_id,
            "partnership_id": p.get("partnership_id"),
            "branding": branding,
            "commission_pct": p.get("commission_pct"),
            "notes": p.get("notes"),
            "since": _iso(p.get("created_at")),
            "kpi": kpi,
        })

    # Asesores in-house (B37 inmobiliaria_internal_users)
    inhouse = await db.inmobiliaria_internal_users.find(
        {"inmobiliaria_id": inmobiliaria_id, "status": "active"},
        {"_id": 0},
    ).to_list(500)
    asesores_inhouse = []
    for u in inhouse:
        asesor_id = u.get("user_id") or u.get("id")
        if not asesor_id:
            continue
        kpi = await _kpi_for_asesor(db, asesor_id)
        asesores_inhouse.append({
            "type": "asesor_inhouse",
            "id": asesor_id,
            "email": u.get("email"),
            "name": u.get("name") or u.get("email"),
            "role": u.get("role"),
            "status": u.get("status"),
            "kpi": kpi,
        })

    # Asesores freelance asociados (B35 inmobiliaria_advisor_relationships)
    rels = await db.inmobiliaria_advisor_relationships.find(
        {"inmobiliaria_id": inmobiliaria_id, "status": "active"},
        {"_id": 0},
    ).to_list(500)
    asesores_freelance = []
    for r in rels:
        asesor_id = r.get("user_id") or r.get("rel_id")
        if not asesor_id:
            continue
        u_doc = await db.users.find_one(
            {"user_id": asesor_id},
            {"_id": 0, "name": 1, "email": 1, "picture": 1},
        )
        kpi = await _kpi_for_asesor(db, asesor_id)
        asesores_freelance.append({
            "type": "asesor_freelance",
            "id": asesor_id,
            "rel_id": r.get("rel_id"),
            "name": (u_doc or {}).get("name") or r.get("asesor_email") or asesor_id,
            "email": (u_doc or {}).get("email") or r.get("asesor_email"),
            "picture": (u_doc or {}).get("picture"),
            "role": r.get("role"),
            "since": _iso(r.get("created_at") or r.get("activated_at")),
            "kpi": kpi,
        })

    # Cross-inmobiliaria partnerships (B37)
    cross_docs = await db.cross_org_partnerships.find(
        {
            "$or": [
                {"requester_org_id": inmobiliaria_id, "target_org_type": "inmobiliaria",
                 "status": "approved"},
                {"target_org_id": inmobiliaria_id, "requester_org_type": "inmobiliaria",
                 "status": "approved"},
            ],
        },
        {"_id": 0},
    ).to_list(200)
    cross_inm = []
    for c in cross_docs:
        partner_id = (c.get("target_org_id") if c.get("requester_org_id") == inmobiliaria_id
                      else c.get("requester_org_id"))
        if not partner_id:
            continue
        branding = await _get_inmobiliaria_branding(db, partner_id)
        kpi = await _kpi_for_inmobiliaria(db, partner_id)
        cross_inm.append({
            "type": "cross_inmobiliaria",
            "id": partner_id,
            "partnership_id": c.get("partnership_id"),
            "branding": branding,
            "commission_pct": c.get("commission_pct_default"),
            "notes": c.get("notes"),
            "since": _iso(c.get("decided_at") or c.get("requested_at")),
            "kpi": kpi,
        })

    return {
        "devs": devs,
        "asesores_inhouse": asesores_inhouse,
        "asesores_freelance": asesores_freelance,
        "cross_inmobiliaria": cross_inm,
        "totals": {
            "devs": len(devs),
            "asesores_inhouse": len(asesores_inhouse),
            "asesores_freelance": len(asesores_freelance),
            "cross_inmobiliaria": len(cross_inm),
        },
    }
