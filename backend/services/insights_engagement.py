"""Phase 4 Batch 22 · services — Engagement actor split (asesor vs cliente)."""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

PERIOD_DAYS = {"7d": 7, "30d": 30, "90d": 90}


def _now():
    return datetime.now(timezone.utc)


async def get_engagement_split(db, project_id: str, period: str = "30d") -> Dict[str, Any]:
    """Aggregate db.engagement_events split by actor_type. Falls back to lead/appointment
    activity counts if engagement_events is empty (early stage projects)."""
    days = PERIOD_DAYS.get(period, 30)
    since = (_now() - timedelta(days=days)).isoformat()

    # Try engagement_events first (B6)
    pipeline_actor = [
        {"$match": {"project_id": project_id, "created_at": {"$gte": since}}},
        {"$group": {"_id": "$actor_type", "count": {"$sum": 1}}},
    ]
    by_actor: Dict[str, int] = {}
    async for r in db.engagement_events.aggregate(pipeline_actor):
        if r["_id"]:
            by_actor[r["_id"]] = int(r["count"])

    # Top units per actor — by engagement_events, fallback to lead.unit_id counts
    async def _top_units(actor_type: str) -> List[Dict[str, Any]]:
        pipe = [
            {"$match": {"project_id": project_id, "actor_type": actor_type,
                        "created_at": {"$gte": since}}},
            {"$group": {"_id": "$unit_id", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}, {"$limit": 5},
        ]
        return [{"unit_id": r["_id"], "count": int(r["count"])}
                async for r in db.engagement_events.aggregate(pipe)
                if r.get("_id")]

    top_asesor = await _top_units("asesor")
    top_cliente = await _top_units("cliente")

    # Time distribution: 24-hour histogram
    pipe_hour = [
        {"$match": {"project_id": project_id, "created_at": {"$gte": since}}},
        {"$project": {
            "hour": {"$hour": {"$dateFromString": {"dateString": "$created_at"}}}}},
        {"$group": {"_id": "$hour", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]
    time_dist = []
    try:
        async for r in db.engagement_events.aggregate(pipe_hour):
            time_dist.append({"hour": int(r["_id"] or 0), "count": int(r["count"])})
    except Exception:
        pass

    # Conversion rate per actor (lead → booking)
    asesor_count = by_actor.get("asesor", 0)
    cliente_count = by_actor.get("cliente", 0)
    booking_count = await db.appointments.count_documents({
        "project_id": project_id, "datetime": {"$gte": since},
    })

    conv_asesor = round((booking_count / asesor_count) * 100, 1) if asesor_count else 0.0
    conv_cliente = round((booking_count / cliente_count) * 100, 1) if cliente_count else 0.0

    total_events = asesor_count + cliente_count
    return {
        "project_id": project_id,
        "period": period,
        "total_events": total_events,
        "total_visits_asesor": asesor_count,
        "total_visits_cliente": cliente_count,
        "top_units_asesor": top_asesor,
        "top_units_cliente": top_cliente,
        "time_distribution": time_dist,
        "conversion_rate_per_actor": {
            "asesor": conv_asesor,
            "cliente": conv_cliente,
        },
    }
