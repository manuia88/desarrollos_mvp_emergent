"""Phase 4 Batch 20 · services — Asesor metrics computation."""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional


PERIOD_DAYS = {"7d": 7, "30d": 30, "90d": 90}
WON_STATUSES = {"won", "ganado", "cerrado_ganado", "closed_won"}
LOST_STATUSES = {"lost", "perdido", "cerrado_perdido", "closed_lost"}
INACTIVE = WON_STATUSES | LOST_STATUSES


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_div(a: float, b: float) -> float:
    return a / b if b else 0.0


def _expected_value(lead: Dict[str, Any]) -> float:
    for k in ("expected_value", "budget", "expected_price", "lead_value"):
        v = lead.get(k)
        if isinstance(v, (int, float)) and v > 0:
            return float(v)
    return 0.0


def _stage(lead: Dict[str, Any]) -> str:
    return (lead.get("lead_stage") or lead.get("status") or "").lower()


async def compute_asesor_metrics(db, asesor_id: str, period: str = "30d") -> Dict[str, Any]:
    """Compute live metrics for an asesor across the given period.

    Returns dict matching asesor_metrics_snapshots schema (snapshot_at = now).
    """
    days = PERIOD_DAYS.get(period, 30)
    now = _now()
    since = (now - timedelta(days=days)).isoformat()
    last7d = (now - timedelta(days=7)).isoformat()

    user = await db.users.find_one({"user_id": asesor_id},
                                     {"_id": 0, "tenant_id": 1, "user_id": 1, "name": 1})
    inmobiliaria_id = (user or {}).get("tenant_id") or "default"

    # ─ Leads ───────────────────────────────────────────────────────────────
    leads = await db.leads.find(
        {"$or": [
            {"assigned_to": asesor_id},
            {"asesor_id": asesor_id},
            {"assigned_user_id": asesor_id},
        ]},
        {"_id": 0},
    ).to_list(20000)

    active = [ld for ld in leads if _stage(ld) not in INACTIVE]
    pipeline_value = sum(_expected_value(ld) for ld in active)

    leads_in_period = []
    for ld in leads:
        ca = ld.get("created_at") or ""
        if isinstance(ca, str) and ca >= since:
            leads_in_period.append(ld)
    won_in_period = sum(1 for ld in leads_in_period if _stage(ld) in WON_STATUSES)
    conversion = round(_safe_div(won_in_period, len(leads_in_period)) * 100, 1)

    # Response time (h)
    rt_hours: List[float] = []
    for ld in leads:
        ca = ld.get("created_at")
        fr = ld.get("first_response_at") or ld.get("first_contact_at")
        try:
            if ca and fr:
                cdt = datetime.fromisoformat(str(ca).replace("Z", "+00:00"))
                fdt = datetime.fromisoformat(str(fr).replace("Z", "+00:00"))
                delta_h = (fdt - cdt).total_seconds() / 3600
                if 0 <= delta_h <= 720:
                    rt_hours.append(delta_h)
        except Exception:
            pass
    response_time = round(sum(rt_hours) / len(rt_hours), 1) if rt_hours else 0.0

    # ─ Citas ────────────────────────────────────────────────────────────────
    citas_30d = await db.appointments.count_documents({
        "$or": [
            {"asesor_id": asesor_id},
            {"asesor_assigned": asesor_id},
        ],
        "status": {"$in": ["confirmed", "completed"]},
        "datetime": {"$gte": since},
    })

    # ─ Activity score 7d (raw count) ────────────────────────────────────────
    activity_7d = await db.activities.count_documents({
        "actor_id": asesor_id,
        "$or": [
            {"timestamp": {"$gte": last7d}},
            {"created_at": {"$gte": last7d}},
        ],
    })

    # ─ Active links ────────────────────────────────────────────────────────
    links_active = await db.tracking_links.count_documents(
        {"asesor_id": asesor_id, "active": True}
    )

    # ─ Health score (latest from B14) ──────────────────────────────────────
    hs = await db.health_scores.find_one(
        {"entity_type": "asesor", "entity_id": asesor_id},
        {"_id": 0, "score": 1}, sort=[("computed_at", -1)],
    )
    health_score = int((hs or {}).get("score", 0))

    # ─ Trust score (B32, optional) ─────────────────────────────────────────
    trust_score = 0
    try:
        ts = await db.asesor_trust_scores.find_one(
            {"asesor_id": asesor_id}, {"_id": 0, "score": 1},
        )
        if ts:
            trust_score = int(ts.get("score", 0))
    except Exception:
        pass

    return {
        "asesor_id": asesor_id,
        "inmobiliaria_id": inmobiliaria_id,
        "snapshot_date": now.date().isoformat(),
        "snapshot_at": now.isoformat(),
        "period": period,
        "pipeline_value_mxn": round(pipeline_value, 2),
        "leads_active": len(active),
        "leads_in_period": len(leads_in_period),
        "conversion_rate_pct": conversion,
        "response_time_hours": response_time,
        "citas_booked_30d": citas_30d,
        "activity_score_7d": activity_7d,
        "links_active": links_active,
        "health_score": health_score,
        "trust_score": trust_score,
    }


async def get_team_metrics(db, inmobiliaria_id: Optional[str], period: str = "30d") -> List[Dict[str, Any]]:
    """Return computed metrics for every asesor in the tenant, ranked by pipeline desc."""
    q: Dict[str, Any] = {"role": {"$in": ["advisor", "asesor_admin"]}}
    if inmobiliaria_id:
        q["tenant_id"] = inmobiliaria_id
    asesores = await db.users.find(
        q, {"_id": 0, "user_id": 1, "name": 1, "email": 1, "avatar_url": 1},
    ).to_list(500)
    out: List[Dict[str, Any]] = []
    for a in asesores:
        m = await compute_asesor_metrics(db, a["user_id"], period)
        m["name"] = a.get("name") or a.get("email") or a["user_id"]
        m["avatar_url"] = a.get("avatar_url", "")
        out.append(m)
    # Rank desc by pipeline
    out.sort(key=lambda r: -r["pipeline_value_mxn"])
    avg_pipeline = sum(r["pipeline_value_mxn"] for r in out) / len(out) if out else 0
    for i, r in enumerate(out):
        r["rank"] = i + 1
        r["vs_team_avg_pct"] = (
            round((r["pipeline_value_mxn"] / avg_pipeline - 1) * 100, 1)
            if avg_pipeline > 0 else 0.0
        )
    return out
