"""Phase 4 Batch 22 · services — Find comparable projects via similarity scoring."""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List


def _now():
    return datetime.now(timezone.utc)


def _similarity(a: Dict[str, Any], b: Dict[str, Any]) -> float:
    """Score 0-100 based on colonia/alcaldia match + price proximity + size proximity."""
    score = 0.0
    if a.get("colonia") and a.get("colonia") == b.get("colonia"):
        score += 40
    elif a.get("municipio") and a.get("municipio") == b.get("municipio"):
        score += 25
    pa, pb = a.get("price_from") or 0, b.get("price_from") or 0
    if pa and pb:
        diff = abs(pa - pb) / max(pa, pb)
        if diff <= 0.20:
            score += 30 * (1 - diff / 0.20)
    sa, sb = a.get("total_units") or 0, b.get("total_units") or 0
    if sa and sb:
        diff_u = abs(sa - sb) / max(sa, sb)
        if diff_u <= 0.30:
            score += 20 * (1 - diff_u / 0.30)
    if a.get("segmento") and a.get("segmento") == b.get("segmento"):
        score += 10
    return round(score, 1)


async def _enrich(db, p: Dict[str, Any]) -> Dict[str, Any]:
    pid = p.get("id") or p.get("slug")
    units_total = await db.units.count_documents({"project_id": pid})
    units_sold = await db.units.count_documents(
        {"project_id": pid, "status": {"$in": ["vendido", "vendida"]}}
    )
    # Price/m² estimate
    sample = await db.units.find_one({"project_id": pid, "price": {"$gt": 0}, "sqm": {"$gt": 0}},
                                       {"_id": 0, "price": 1, "sqm": 1})
    price_m2 = round((sample["price"] / sample["sqm"]), 2) if sample else 0
    hs = await db.health_scores.find_one(
        {"entity_type": "project", "entity_id": pid},
        {"_id": 0, "score": 1}, sort=[("computed_at", -1)],
    )
    health = int((hs or {}).get("score", 0))
    # Sale velocity (units sold last 30d)
    since = (_now() - timedelta(days=30)).isoformat()
    velocity = await db.units.count_documents({
        "project_id": pid, "status": {"$in": ["vendido", "vendida"]},
        "$or": [{"sold_at": {"$gte": since}}, {"updated_at": {"$gte": since}}],
    })
    days_listed = 0
    try:
        ca = p.get("created_at")
        if ca:
            cdt = datetime.fromisoformat(str(ca).replace("Z", "+00:00"))
            days_listed = max(0, (datetime.now(timezone.utc) - cdt).days)
    except Exception:
        pass
    return {
        "id": pid,
        "name": p.get("name", pid),
        "colonia": p.get("colonia") or p.get("municipio") or "",
        "price_from": p.get("price_from") or 0,
        "total_units": units_total,
        "units_sold": units_sold,
        "price_per_m2": price_m2,
        "health_score": health,
        "sale_velocity_per_month": velocity,
        "days_listed": days_listed,
    }


async def find_comparables(db, project_id: str, top_n: int = 5) -> Dict[str, Any]:
    """Return top_n similar projects + delta vs current."""
    current = await db.projects.find_one(
        {"$or": [{"id": project_id}, {"slug": project_id}]}, {"_id": 0},
    )
    if not current:
        try:
            from data_developments import DEVELOPMENTS_BY_ID
            dev = DEVELOPMENTS_BY_ID.get(project_id)
            if dev:
                current = {
                    "id": project_id, "slug": project_id,
                    "name": dev.get("name", project_id),
                    "colonia": dev.get("colonia"),
                    "municipio": dev.get("municipio") or dev.get("alcaldia"),
                    "segmento": dev.get("segmento") or dev.get("segment"),
                    "price_from": dev.get("price_from") or dev.get("price_min"),
                    "total_units": dev.get("total_units") or dev.get("units_total"),
                    "created_at": dev.get("created_at") or dev.get("listed_at"),
                }
        except Exception:
            pass
    if not current:
        return {"current": None, "comparables": [], "alcaldia": ""}

    candidates_q: Dict[str, Any] = {
        "$or": [
            {"colonia": current.get("colonia")},
            {"municipio": current.get("municipio")},
        ],
        "id": {"$ne": current.get("id")},
    }
    candidates = await db.projects.find(candidates_q, {"_id": 0}).limit(50).to_list(50)

    # Legacy fallback: include DEVELOPMENTS in same alcaldia/colonia
    try:
        from data_developments import DEVELOPMENTS
        for dev in DEVELOPMENTS:
            did = dev.get("id") or dev.get("slug")
            if not did or did == current.get("id"):
                continue
            if did in {c.get("id") for c in candidates}:
                continue
            same_col = dev.get("colonia") and dev.get("colonia") == current.get("colonia")
            same_mun = (dev.get("municipio") or dev.get("alcaldia")) and (
                (dev.get("municipio") or dev.get("alcaldia")) == current.get("municipio")
            )
            if same_col or same_mun:
                candidates.append({
                    "id": did, "slug": did,
                    "name": dev.get("name", did),
                    "colonia": dev.get("colonia"),
                    "municipio": dev.get("municipio") or dev.get("alcaldia"),
                    "segmento": dev.get("segmento") or dev.get("segment"),
                    "price_from": dev.get("price_from") or dev.get("price_min"),
                    "total_units": dev.get("total_units") or dev.get("units_total"),
                    "created_at": dev.get("created_at") or dev.get("listed_at"),
                })
    except Exception:
        pass

    scored = []
    for c in candidates:
        score = _similarity(current, c)
        if score > 0:
            scored.append((score, c))
    scored.sort(key=lambda x: -x[0])

    enriched_current = await _enrich(db, current)
    out = []
    for sim_score, cand in scored[:top_n]:
        e = await _enrich(db, cand)
        delta = {
            "price_per_m2_pct": _signed_pct(enriched_current["price_per_m2"], e["price_per_m2"]),
            "health_pct": _signed_pct(enriched_current["health_score"], e["health_score"]),
            "velocity_pct": _signed_pct(enriched_current["sale_velocity_per_month"],
                                          e["sale_velocity_per_month"]),
            "days_listed_pct": _signed_pct(enriched_current["days_listed"], e["days_listed"]),
        }
        out.append({**e, "similarity_score": sim_score, "delta_vs_current": delta})

    return {
        "current": enriched_current,
        "comparables": out,
        "alcaldia": current.get("municipio") or current.get("colonia") or "",
    }


def _signed_pct(current: float, comp: float) -> float:
    if not comp:
        return 0.0
    return round(((current / comp) - 1) * 100, 1)
