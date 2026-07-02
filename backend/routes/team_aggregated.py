"""Phase 4 Batch 21 · Sub-Chunk C — Team Aggregated Performance Table.

GET /api/metrics/team-aggregated?period=7d|30d|90d
Permission: developer_admin | inmobiliaria_admin | asesor_admin | superadmin

Response:
    {
      "period": "30d",
      "team_average": { pipeline_value_mxn, conversion_rate_pct, response_time_hours,
                         activity_score_7d, health_score_avg, citas_booked },
      "asesores": [{
         asesor_id, name, avatar_url, pipeline_value_mxn, leads_active,
         conversion_rate_pct, response_time_hours, activity_score_7d,
         health_score, citas_booked, tours_completed, vs_team_avg_pct
      }]
    }
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any

from fastapi import APIRouter, HTTPException, Query, Request

log = logging.getLogger("dmx.team_aggregated")

router = APIRouter(tags=["metrics_team"])

ASESOR_ROLES = {"advisor", "asesor_admin"}
ADMIN_ROLES = {"developer_admin", "developer_director", "developer_member",
                "inmobiliaria_admin", "asesor_admin", "superadmin"}

WON_STATUSES = {"won", "ganado", "cerrado_ganado", "closed_won"}
LOST_STATUSES = {"lost", "perdido", "cerrado_perdido", "closed_lost"}
INACTIVE_STATUSES = WON_STATUSES | LOST_STATUSES

PERIOD_DAYS = {"7d": 7, "30d": 30, "90d": 90}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _db(req: Request):
    return req.app.state.db


async def _auth(req: Request):
    from server import get_current_user
    u = await get_current_user(req)
    if not u:
        raise HTTPException(401, "No autenticado")
    return u


def _require_admin(user) -> None:
    if getattr(user, "role", "") not in ADMIN_ROLES:
        raise HTTPException(403, "Solo administradores pueden ver métricas del equipo")


def _safe_div(a: float, b: float, default: float = 0.0) -> float:
    return a / b if b else default


def _expected_value(lead: Dict[str, Any]) -> float:
    """Best-effort lead value: expected_value | budget | expected_price | 0."""
    for k in ("expected_value", "budget", "expected_price", "lead_value", "valor_esperado"):
        v = lead.get(k)
        if isinstance(v, (int, float)) and v > 0:
            return float(v)
    return 0.0


def _lead_status(lead: Dict[str, Any]) -> str:
    return (lead.get("lead_stage") or lead.get("status") or "").lower()


def _lead_assignee(lead: Dict[str, Any]) -> str:
    return lead.get("assigned_to") or lead.get("asesor_id") \
        or lead.get("assigned_user_id") or ""


@router.get("/api/metrics/team-aggregated")
async def team_aggregated(
    request: Request,
    period: str = Query("30d", pattern="^(7d|30d|90d)$"),
):
    user = await _auth(request)
    _require_admin(user)
    db = _db(request)

    days = PERIOD_DAYS[period]
    now = _now()
    since = (now - timedelta(days=days)).isoformat()
    last7d = (now - timedelta(days=7)).isoformat()
    tenant = getattr(user, "tenant_id", None) or ""

    # ── 1) Asesor pool scoped to admin tenant ───────────────────────────
    asesor_query: Dict[str, Any] = {"role": {"$in": list(ASESOR_ROLES)}}
    if user.role != "superadmin":
        # [AUD-036] fail-CLOSED: antes con tenant vacío se SALTABA el filtro → el pool abarcaba asesores
        # de TODOS los tenants (fuga de roster + métricas de negocio). Un admin sin tenant real ahora
        # matchea CERO asesores (cae al payload vacío de abajo), no god-view.
        asesor_query["tenant_id"] = tenant or "__no_tenant_fail_closed__"
    asesores = await db.users.find(
        asesor_query,
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "avatar_url": 1, "role": 1},
    ).to_list(500)
    if not asesores:
        return {
            "period": period,
            "team_average": {
                "pipeline_value_mxn": 0, "conversion_rate_pct": 0,
                "response_time_hours": 0, "activity_score_7d": 0,
                "health_score_avg": 0, "citas_booked": 0,
            },
            "asesores": [],
        }
    asesor_ids = [a["user_id"] for a in asesores]

    # ── 2) Pull leads + appointments + activities + health_scores in batch
    # Leads — assigned to any asesor in pool (no period filter for pipeline/value;
    # period filter applies for conversion bucket).
    leads = await db.leads.find(
        {"$or": [
            {"assigned_to": {"$in": asesor_ids}},
            {"asesor_id": {"$in": asesor_ids}},
            {"assigned_user_id": {"$in": asesor_ids}},
        ]},
        {"_id": 0},
    ).to_list(20000)

    # Appointments
    appointments = await db.appointments.find(
        {"$or": [
            {"asesor_id": {"$in": asesor_ids}},
            {"asesor_assigned": {"$in": asesor_ids}},
        ],
        # Estados canónicos en español (LEAD_REGISTRATION_RULES §4.2) + inglés legacy.
        # "Booked" = agendada/confirmada/reagendada/realizada (excluye cancelada/no_show).
        "status": {"$in": ["confirmed", "completed", "pending",
                           "agendada", "confirmada", "reagendada", "realizada"]},
        },
        {"_id": 0, "asesor_id": 1, "asesor_assigned": 1, "status": 1, "datetime": 1},
    ).to_list(10000)

    # Activities last 7d (for activity_score_7d)
    activities_7d_pipeline = [
        {"$match": {
            "actor_id": {"$in": asesor_ids},
            "$or": [
                {"timestamp": {"$gte": last7d}},
                {"created_at": {"$gte": last7d}},
            ],
        }},
        {"$group": {"_id": "$actor_id", "count": {"$sum": 1}}},
    ]
    activity_7d_by_id: Dict[str, int] = {}
    async for row in db.activities.aggregate(activities_7d_pipeline):
        if row.get("_id"):
            activity_7d_by_id[row["_id"]] = int(row.get("count", 0))

    # Health scores latest per asesor
    health_by_id: Dict[str, int] = {}
    async for hs in db.health_scores.find(
        {"entity_type": "asesor", "entity_id": {"$in": asesor_ids}},
        {"_id": 0, "entity_id": 1, "score": 1, "computed_at": 1},
    ).sort("computed_at", -1):
        if hs["entity_id"] not in health_by_id:
            health_by_id[hs["entity_id"]] = int(hs.get("score", 0))

    # User preferences for tours_completed
    prefs = await db.user_preferences.find(
        {"user_id": {"$in": asesor_ids}},
        {"_id": 0, "user_id": 1, "tours_completed": 1},
    ).to_list(2000)
    tours_by_id = {p["user_id"]: len(p.get("tours_completed") or [])
                    for p in prefs if p.get("user_id")}

    # ── 3) Per-asesor compute ───────────────────────────────────────────
    rows: List[Dict[str, Any]] = []
    name_by_id = {a["user_id"]: a.get("name") or a.get("email") or a["user_id"]
                   for a in asesores}
    avatar_by_id = {a["user_id"]: a.get("avatar_url") or "" for a in asesores}

    # Group leads by assignee
    leads_by_assignee: Dict[str, List[Dict[str, Any]]] = {aid: [] for aid in asesor_ids}
    for lead in leads:
        aid = _lead_assignee(lead)
        if aid in leads_by_assignee:
            leads_by_assignee[aid].append(lead)

    appts_by_asesor: Dict[str, int] = {aid: 0 for aid in asesor_ids}
    for ap in appointments:
        aid = ap.get("asesor_id") or ap.get("asesor_assigned") or ""
        if aid in appts_by_asesor and ap.get("status") in ("confirmed", "completed"):
            appts_by_asesor[aid] += 1

    max_activity_7d = max(activity_7d_by_id.values()) if activity_7d_by_id else 0

    for a in asesores:
        aid = a["user_id"]
        my_leads = leads_by_assignee.get(aid, [])

        # Pipeline value: active leads (not won/lost) — sum of expected values
        active_leads = [ld for ld in my_leads if _lead_status(ld) not in INACTIVE_STATUSES]
        pipeline_val = sum(_expected_value(ld) for ld in active_leads)
        leads_active = len(active_leads)

        # Conversion: leads in period (created_at >= since)
        leads_in_period = []
        for ld in my_leads:
            ca = ld.get("created_at") or ""
            if isinstance(ca, str) and ca >= since:
                leads_in_period.append(ld)
        won_in_period = sum(1 for ld in leads_in_period if _lead_status(ld) in WON_STATUSES)
        conv_rate = round(_safe_div(won_in_period, len(leads_in_period)) * 100, 1)

        # Response time: avg (first_response_at - created_at) hours
        rt_hours: List[float] = []
        for ld in my_leads:
            ca = ld.get("created_at")
            fr = ld.get("first_response_at") or ld.get("first_contact_at")
            try:
                if ca and fr:
                    cdt = datetime.fromisoformat(str(ca).replace("Z", "+00:00"))
                    fdt = datetime.fromisoformat(str(fr).replace("Z", "+00:00"))
                    delta_h = (fdt - cdt).total_seconds() / 3600
                    if 0 <= delta_h <= 720:  # filter outliers >30d
                        rt_hours.append(delta_h)
            except Exception:
                continue
        response_time = round(sum(rt_hours) / len(rt_hours), 1) if rt_hours else 0.0

        # Activity score normalized 0-100
        my_act_7d = activity_7d_by_id.get(aid, 0)
        act_score = round(_safe_div(my_act_7d, max_activity_7d) * 100, 1) if max_activity_7d else 0.0

        rows.append({
            "asesor_id": aid,
            "name": name_by_id.get(aid, aid),
            "avatar_url": avatar_by_id.get(aid, ""),
            "pipeline_value_mxn": round(pipeline_val, 2),
            "leads_active": leads_active,
            "conversion_rate_pct": conv_rate,
            "response_time_hours": response_time,
            "activity_score_7d": act_score,
            "health_score": health_by_id.get(aid, 0),
            "citas_booked": appts_by_asesor.get(aid, 0),
            "tours_completed": tours_by_id.get(aid, 0),
            "vs_team_avg_pct": 0.0,  # filled below
        })

    # ── 4) Team averages ───────────────────────────────────────────────
    n = len(rows) or 1
    avg_pipeline = sum(r["pipeline_value_mxn"] for r in rows) / n
    avg_conv = round(sum(r["conversion_rate_pct"] for r in rows) / n, 1)
    avg_rt = round(sum(r["response_time_hours"] for r in rows) / n, 1)
    avg_act = round(sum(r["activity_score_7d"] for r in rows) / n, 1)
    avg_health = round(sum(r["health_score"] for r in rows) / n, 1)
    total_citas = sum(r["citas_booked"] for r in rows)

    # vs_team_avg_pct: pipeline-based
    for r in rows:
        if avg_pipeline > 0:
            r["vs_team_avg_pct"] = round((r["pipeline_value_mxn"] / avg_pipeline - 1) * 100, 1)
        else:
            r["vs_team_avg_pct"] = 0.0

    # Default sort: pipeline_value desc
    rows.sort(key=lambda r: -r["pipeline_value_mxn"])

    return {
        "period": period,
        "team_average": {
            "pipeline_value_mxn": round(avg_pipeline, 2),
            "conversion_rate_pct": avg_conv,
            "response_time_hours": avg_rt,
            "activity_score_7d": avg_act,
            "health_score_avg": avg_health,
            "citas_booked": total_citas,
        },
        "asesores": rows,
    }
