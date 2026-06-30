"""W2.5 SA6 — Metrics Cube aggregation engine.

Aggregates developments + units + leads + ai_usage per geo-tier:
  city → alcaldia → colonia → development → unit (5-level for H1, MX-CDMX scope)

Materializes into `db.cube_aggregations` (one row per (tier, tier_id, period))
via daily cron, and supports on-demand recompute.
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.metrics_cube_aggregations")

TIERS = ("city", "alcaldia", "colonia", "development", "unit")
PERIODS = ("current", "7d", "30d", "90d")
CITY_ROOT_ID = "cdmx"
CITY_ROOT_NAME = "Ciudad de México"


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slug(s: str) -> str:
    if not s:
        return ""
    out = []
    for ch in s.lower().strip():
        if ch.isalnum():
            out.append(ch)
        elif ch in (" ", "-", "_"):
            out.append("-")
    res = "".join(out)
    while "--" in res:
        res = res.replace("--", "-")
    return res.strip("-")


def _period_since(period: str) -> Optional[datetime]:
    now = datetime.now(timezone.utc)
    if period == "current":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if period == "7d":
        return now - timedelta(days=7)
    if period == "30d":
        return now - timedelta(days=30)
    if period == "90d":
        return now - timedelta(days=90)
    return None


def _haversine_km(lat1, lng1, lat2, lng2) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _dev_center_latlng(dev: Dict[str, Any]) -> Optional[tuple]:
    """Returns (lat, lng) from dev.center which is [lng, lat] (GeoJSON)."""
    c = dev.get("center")
    if isinstance(c, list) and len(c) >= 2:
        try:
            return (float(c[1]), float(c[0]))
        except (TypeError, ValueError):
            return None
    lat = dev.get("lat")
    lng = dev.get("lng")
    if lat is not None and lng is not None:
        try:
            return (float(lat), float(lng))
        except (TypeError, ValueError):
            return None
    return None


def _dev_avg_price(dev: Dict[str, Any]) -> Optional[float]:
    pf = dev.get("price_from")
    pt = dev.get("price_to")
    if pf and pt:
        try:
            return (float(pf) + float(pt)) / 2.0
        except (TypeError, ValueError):
            return None
    if pf:
        try:
            return float(pf)
        except (TypeError, ValueError):
            return None
    return None


def _dev_avg_m2(dev: Dict[str, Any]) -> Optional[float]:
    rng = dev.get("m2_range")
    if isinstance(rng, list) and len(rng) >= 2:
        try:
            return (float(rng[0]) + float(rng[1])) / 2.0
        except (TypeError, ValueError):
            return None
    return None


def _dev_days_on_market(dev: Dict[str, Any], now: datetime) -> Optional[int]:
    ts = dev.get("created_at")
    if not ts:
        return None
    try:
        d = datetime.fromisoformat(ts.replace("Z", "+00:00")) if isinstance(ts, str) else ts
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return (now - d).days
    except Exception:
        return None


# ─── Counts per dev: leads in period + AI cost ────────────────────────────────

async def _leads_per_dev(db, since: Optional[datetime]) -> Dict[str, Dict[str, int]]:
    """Returns {dev_id: {leads_count, leads_won}} aggregated from db.leads."""
    out: Dict[str, Dict[str, int]] = {}
    q: Dict[str, Any] = {}
    if since:
        q["created_at"] = {"$gte": since.isoformat()}
    try:
        async for ld in db.leads.find(q, {"_id": 0, "development_id": 1, "project_id": 1, "status": 1}):
            did = ld.get("development_id") or ld.get("project_id")
            if not did:
                continue
            row = out.setdefault(did, {"leads_count": 0, "leads_won": 0})
            row["leads_count"] += 1
            if (ld.get("status") or "").lower() in ("won", "ganado", "cerrado", "cerrado_ganado", "closed"):
                row["leads_won"] += 1
    except Exception as e:
        log.warning(f"[cube] leads aggregation failed: {e}")
    return out


async def _ai_usage_per_tenant(db, since: Optional[datetime]) -> Dict[str, float]:
    """Returns {tenant_id: cost_mxn_total} from db.ai_usage in period."""
    out: Dict[str, float] = {}
    match: Dict[str, Any] = {}
    if since:
        match["ts"] = {"$gte": since.isoformat()}
    pipeline = [
        {"$match": match},
        {"$group": {"_id": "$tenant_id", "total": {"$sum": "$cost_mxn"}}},
    ]
    try:
        async for row in db.ai_usage.aggregate(pipeline):
            tid = row.get("_id")
            if tid:
                out[tid] = round(float(row.get("total") or 0), 2)
    except Exception as e:
        log.warning(f"[cube] ai_usage aggregation failed: {e}")
    return out


# ─── Tier rollups ─────────────────────────────────────────────────────────────

def _empty_kpis() -> Dict[str, Any]:
    return {
        "projects_count": 0,
        "units_total": 0,
        "units_sold": 0,
        "units_available": 0,
        "units_reserved": 0,
        "avg_price_mxn": None,
        "avg_price_per_m2": None,
        "leads_count": 0,
        "conversion_rate": None,
        "days_on_market_avg": None,
        "ie_score_promedio": None,
        "ai_usage_mxn": 0.0,
    }


def _accum_dev(kpis: Dict[str, Any], dev: Dict[str, Any], leads_map: Dict[str, Dict[str, int]],
               ai_map: Dict[str, float], now: datetime, _agg: Dict[str, List[float]]) -> None:
    kpis["projects_count"] += 1
    kpis["units_total"] += int(dev.get("units_total") or 0)
    kpis["units_sold"] += int(dev.get("units_sold") or 0)
    kpis["units_available"] += int(dev.get("units_available") or 0)
    kpis["units_reserved"] += int(dev.get("units_reserved") or 0)
    p = _dev_avg_price(dev)
    m2 = _dev_avg_m2(dev)
    if p is not None:
        _agg["price"].append(p)
        if m2 and m2 > 0:
            _agg["price_per_m2"].append(p / m2)
    dom = _dev_days_on_market(dev, now)
    if dom is not None and dom >= 0:
        _agg["dom"].append(float(dom))
    if dev.get("ie_score") is not None:
        try:
            _agg["ie"].append(float(dev["ie_score"]))
        except (TypeError, ValueError):
            pass
    lrow = leads_map.get(dev.get("id")) or {}
    kpis["leads_count"] += int(lrow.get("leads_count") or 0)
    org = dev.get("developer_id")
    if org and org in ai_map:
        kpis["ai_usage_mxn"] += float(ai_map.get(org) or 0)


def _finalize(kpis: Dict[str, Any], _agg: Dict[str, List[float]]) -> None:
    if _agg["price"]:
        kpis["avg_price_mxn"] = round(sum(_agg["price"]) / len(_agg["price"]), 2)
    if _agg["price_per_m2"]:
        kpis["avg_price_per_m2"] = round(sum(_agg["price_per_m2"]) / len(_agg["price_per_m2"]), 2)
    if _agg["dom"]:
        kpis["days_on_market_avg"] = round(sum(_agg["dom"]) / len(_agg["dom"]), 1)
    if _agg["ie"]:
        kpis["ie_score_promedio"] = round(sum(_agg["ie"]) / len(_agg["ie"]), 2)
    sold = kpis["units_sold"]
    denom = sold + kpis["units_available"] + kpis["units_reserved"]
    if denom > 0:
        kpis["conversion_rate"] = round((sold / denom) * 100.0, 2)
    kpis["ai_usage_mxn"] = round(kpis["ai_usage_mxn"], 2)


async def _all_developments(db) -> List[Dict[str, Any]]:
    """Returns merged list of seeded (in-memory) + ingested (mongo) developments.

    Seed `data_developments.DEVELOPMENTS` is the source-of-truth demo dataset for
    H1 visualization. Mongo `db.developments` adds bulk-ingested user data.
    Mongo entries override seeded ones if id collides.
    """
    by_id: Dict[str, Dict[str, Any]] = {}
    try:
        from data_developments import DEVELOPMENTS as SEED_DEVS
        for d in SEED_DEVS:
            by_id[d["id"]] = dict(d)
    except Exception as e:
        log.warning(f"[cube] seed DEVELOPMENTS load failed: {e}")
    try:
        async for d in db.developments.find({}, {"_id": 0}):
            if d.get("id"):
                by_id[d["id"]] = d
    except Exception as e:
        log.warning(f"[cube] db.developments scan failed: {e}")
    devs = list(by_id.values())
    # Aplicar las ediciones por-unidad del dev (developer_unit_overrides: precio/estado) y RECOMPUTAR los rollups
    # top-level que el cubo lee (price_from/to, units_*). Antes el cubo era CIEGO a las ediciones por-unidad
    # (leía el seed estático) → ahora refleja tanto el edit manual como el apply del subagente. Fail-open.
    try:
        from routes.public import _apply_unit_overrides, _aggregates_from_units
        for d in devs:
            units = d.get("units")
            if not units:
                continue
            try:
                merged = await _apply_unit_overrides(db, d.get("id"), units)
                agg = _aggregates_from_units(merged)
                if agg:
                    d.update(agg)  # price_from/to + units_total/available/reserved/sold EFECTIVOS
            except Exception:
                continue
    except Exception as e:
        log.warning(f"[cube] override merge failed: {e}")
    return devs


async def aggregate_tier(db, tier: str, period: str) -> int:
    """Roll up developments+units+leads+ai_usage per tier_id for a given period.

    UPSERTS into cube_aggregations. Returns count of rows written.
    """
    if tier not in TIERS:
        raise ValueError(f"tier inválido: {tier}")
    if period not in PERIODS:
        raise ValueError(f"period inválido: {period}")

    devs = await _all_developments(db)
    since = _period_since(period)
    leads_map = await _leads_per_dev(db, since)
    ai_map = await _ai_usage_per_tenant(db, since)
    now = datetime.now(timezone.utc)
    rows: List[Dict[str, Any]] = []

    if tier == "city":
        kpis = _empty_kpis()
        _agg = {"price": [], "price_per_m2": [], "dom": [], "ie": []}
        for d in devs:
            _accum_dev(kpis, d, leads_map, ai_map, now, _agg)
        _finalize(kpis, _agg)
        rows.append({
            "tier": "city", "tier_id": CITY_ROOT_ID, "name": CITY_ROOT_NAME,
            "parent_tier_id": None, "parent_name": None,
            "period": period, "kpis": kpis,
            "geo": {"lat": 19.4326, "lng": -99.1332},
            "computed_at": _iso(),
        })

    elif tier == "alcaldia":
        groups: Dict[str, Dict[str, Any]] = {}
        for d in devs:
            alc = d.get("alcaldia") or "Sin alcaldía"
            tid = _slug(alc) or "sin-alcaldia"
            g = groups.setdefault(tid, {"name": alc, "lats": [], "lngs": [],
                                        "kpis": _empty_kpis(),
                                        "_agg": {"price": [], "price_per_m2": [], "dom": [], "ie": []}})
            _accum_dev(g["kpis"], d, leads_map, ai_map, now, g["_agg"])
            ll = _dev_center_latlng(d)
            if ll:
                g["lats"].append(ll[0])
                g["lngs"].append(ll[1])
        for tid, g in groups.items():
            _finalize(g["kpis"], g["_agg"])
            geo = {}
            if g["lats"]:
                geo = {"lat": round(sum(g["lats"]) / len(g["lats"]), 6),
                       "lng": round(sum(g["lngs"]) / len(g["lngs"]), 6)}
            rows.append({
                "tier": "alcaldia", "tier_id": tid, "name": g["name"],
                "parent_tier_id": CITY_ROOT_ID, "parent_name": CITY_ROOT_NAME,
                "period": period, "kpis": g["kpis"], "geo": geo,
                "computed_at": _iso(),
            })

    elif tier == "colonia":
        groups: Dict[str, Dict[str, Any]] = {}
        for d in devs:
            col = d.get("colonia") or "Sin colonia"
            cid = d.get("colonia_id") or _slug(col) or "sin-colonia"
            alc = d.get("alcaldia") or "Sin alcaldía"
            alc_id = _slug(alc) or "sin-alcaldia"
            g = groups.setdefault(cid, {"name": col, "parent_id": alc_id, "parent_name": alc,
                                        "lats": [], "lngs": [],
                                        "kpis": _empty_kpis(),
                                        "_agg": {"price": [], "price_per_m2": [], "dom": [], "ie": []}})
            _accum_dev(g["kpis"], d, leads_map, ai_map, now, g["_agg"])
            ll = _dev_center_latlng(d)
            if ll:
                g["lats"].append(ll[0])
                g["lngs"].append(ll[1])
        for cid, g in groups.items():
            _finalize(g["kpis"], g["_agg"])
            geo = {}
            if g["lats"]:
                geo = {"lat": round(sum(g["lats"]) / len(g["lats"]), 6),
                       "lng": round(sum(g["lngs"]) / len(g["lngs"]), 6)}
            rows.append({
                "tier": "colonia", "tier_id": cid, "name": g["name"],
                "parent_tier_id": g["parent_id"], "parent_name": g["parent_name"],
                "period": period, "kpis": g["kpis"], "geo": geo,
                "computed_at": _iso(),
            })

    elif tier == "development":
        for d in devs:
            kpis = _empty_kpis()
            _agg = {"price": [], "price_per_m2": [], "dom": [], "ie": []}
            _accum_dev(kpis, d, leads_map, ai_map, now, _agg)
            _finalize(kpis, _agg)
            ll = _dev_center_latlng(d)
            geo = {"lat": ll[0], "lng": ll[1]} if ll else {}
            cid = d.get("colonia_id") or _slug(d.get("colonia") or "") or "sin-colonia"
            col = d.get("colonia") or "Sin colonia"
            rows.append({
                "tier": "development", "tier_id": d.get("id"),
                "name": d.get("name") or d.get("id"),
                "parent_tier_id": cid, "parent_name": col,
                "period": period, "kpis": kpis, "geo": geo,
                "computed_at": _iso(),
            })

    elif tier == "unit":
        # Units are queried lazy via /unit/:unit_id — skip materialization here.
        return 0

    written = 0
    for r in rows:
        await db.cube_aggregations.update_one(
            {"tier": r["tier"], "tier_id": r["tier_id"], "period": r["period"]},
            {"$set": r},
            upsert=True,
        )
        written += 1
    return written


async def aggregate_all(db) -> Dict[str, Any]:
    """Run aggregation for all tiers × periods. Used by daily cron + manual refresh."""
    started = datetime.now(timezone.utc)
    summary: Dict[str, int] = {}
    for tier in ("city", "alcaldia", "colonia", "development"):
        for period in PERIODS:
            try:
                n = await aggregate_tier(db, tier, period)
                summary[f"{tier}:{period}"] = n
            except Exception as e:
                log.warning(f"[cube] aggregate_tier({tier}, {period}) failed: {e}")
                summary[f"{tier}:{period}"] = -1
    elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    log.info(f"[cube] aggregate_all done in {elapsed:.1f}s — {summary}")
    return {"ok": True, "summary": summary, "elapsed_s": round(elapsed, 2),
            "completed_at": _iso()}


async def metrics_cube_daily_aggregation(db) -> Dict[str, Any]:
    """Cron entrypoint at 2am MX (instrumented via cron_heartbeat)."""
    return await aggregate_all(db)


# ─── Geo helpers ──────────────────────────────────────────────────────────────

async def find_comparables(db, tier_id: str, radius_km: float = 2.0,
                           limit: int = 20) -> List[Dict[str, Any]]:
    """Top developments inside `radius_km` from `tier_id` (a development.id).

    Falls back to alcaldia/colonia center if tier_id matches a non-dev row.
    """
    devs = await _all_developments(db)
    by_id = {d.get("id"): d for d in devs if d.get("id")}
    origin = by_id.get(tier_id)
    origin_ll = _dev_center_latlng(origin) if origin else None
    if not origin_ll:
        cube_row = await db.cube_aggregations.find_one(
            {"tier_id": tier_id, "period": "current"}, {"_id": 0, "geo": 1},
        )
        geo = (cube_row or {}).get("geo") or {}
        if "lat" in geo and "lng" in geo:
            origin_ll = (geo["lat"], geo["lng"])
    if not origin_ll:
        return []

    out: List[Dict[str, Any]] = []
    for d in devs:
        if d.get("id") == tier_id:
            continue
        ll = _dev_center_latlng(d)
        if not ll:
            continue
        dist = _haversine_km(origin_ll[0], origin_ll[1], ll[0], ll[1])
        if dist <= radius_km:
            avg_p = _dev_avg_price(d)
            avg_m2 = _dev_avg_m2(d)
            ppm2 = (avg_p / avg_m2) if (avg_p and avg_m2 and avg_m2 > 0) else None
            out.append({
                "id": d.get("id"),
                "name": d.get("name"),
                "colonia": d.get("colonia"),
                "alcaldia": d.get("alcaldia"),
                "stage": d.get("stage"),
                "distance_km": round(dist, 2),
                "units_total": d.get("units_total"),
                "units_available": d.get("units_available"),
                "avg_price_mxn": round(avg_p, 2) if avg_p else None,
                "avg_price_per_m2": round(ppm2, 2) if ppm2 else None,
                "geo": {"lat": ll[0], "lng": ll[1]},
                "price_history": (d.get("price_history") or [])[-12:],
            })
    out.sort(key=lambda x: x["distance_km"])
    return out[:limit]


async def ensure_indexes(db) -> None:
    try:
        await db.cube_aggregations.create_index(
            [("tier", 1), ("tier_id", 1), ("period", 1)], unique=True, name="cube_tier_period_uniq",
        )
        await db.cube_aggregations.create_index(
            [("parent_tier_id", 1), ("tier", 1), ("period", 1)], name="cube_parent_tier_period",
        )
    except Exception as e:
        log.warning(f"[cube] ensure_indexes failed: {e}")
