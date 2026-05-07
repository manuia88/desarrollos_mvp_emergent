"""W2.3 SA4 — AI cost aggregations + forecast helpers.

All queries operate on `db.ai_call_events` (new per-call collection from
ai_budget.track_ai_call dual-write). Forecast = run_rate × days_remaining_month.
"""
from __future__ import annotations

import calendar
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.ai_cost_aggregations")

HAIKU_KEYS = ("haiku",)  # any model containing 'haiku' is haiku
SONNET_KEYS = ("sonnet",)

# ─── Time window helpers ──────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _month_iso() -> str:
    n = _now()
    return f"{n.year}-{n.month:02d}"


def period_window(period: str) -> Tuple[datetime, datetime, str]:
    """Return (from_dt, to_dt, label)."""
    n = _now()
    if period == "7d":
        return n - timedelta(days=7), n, "7d"
    if period == "30d":
        return n - timedelta(days=30), n, "30d"
    # default: month
    start = datetime(n.year, n.month, 1, tzinfo=timezone.utc)
    return start, n, "month"


def previous_period_window(period: str) -> Tuple[datetime, datetime]:
    n = _now()
    if period == "7d":
        return n - timedelta(days=14), n - timedelta(days=7)
    if period == "30d":
        return n - timedelta(days=60), n - timedelta(days=30)
    # month: previous full month
    if n.month == 1:
        py, pm = n.year - 1, 12
    else:
        py, pm = n.year, n.month - 1
    last_day = calendar.monthrange(py, pm)[1]
    return (datetime(py, pm, 1, tzinfo=timezone.utc),
            datetime(py, pm, last_day, 23, 59, 59, tzinfo=timezone.utc))


def days_remaining_in_month() -> int:
    n = _now()
    last_day = calendar.monthrange(n.year, n.month)[1]
    return max(0, last_day - n.day)


def model_class(model: str) -> str:
    if not model:
        return "other"
    m = model.lower()
    if any(k in m for k in HAIKU_KEYS):
        return "haiku"
    if any(k in m for k in SONNET_KEYS):
        return "sonnet"
    return "other"


# ─── Common pipeline filters ──────────────────────────────────────────────────
def _ts_match(from_dt: datetime, to_dt: datetime) -> Dict[str, Any]:
    return {"ts": {"$gte": from_dt, "$lte": to_dt}}


# ─── Tenant resolution (best-effort name lookup) ──────────────────────────────
async def _tenant_name_map(db, ids: List[str]) -> Dict[str, str]:
    if not ids:
        return {}
    out: Dict[str, str] = {}
    try:
        cur = db.developer_organizations.find(
            {"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1},
        )
        async for d in cur:
            out[d["id"]] = d.get("name") or d["id"]
    except Exception as e:
        log.warning(f"[ai_cost] tenant_name_map: {e}")
    # Also try inmobiliarias / asesores collections (best-effort)
    missing = [i for i in ids if i not in out]
    if missing:
        try:
            cur = db.inmobiliaria_organizations.find(
                {"id": {"$in": missing}}, {"_id": 0, "id": 1, "name": 1},
            )
            async for d in cur:
                out[d["id"]] = d.get("name") or d["id"]
        except Exception:
            pass
    return out


# ─── Overview ─────────────────────────────────────────────────────────────────
async def overview(db, period: str = "month") -> Dict[str, Any]:
    from_dt, to_dt, _label = period_window(period)
    base_match = _ts_match(from_dt, to_dt)

    # Total
    total_pipeline = [
        {"$match": base_match},
        {"$group": {"_id": None, "mxn": {"$sum": "$cost_mxn"},
                    "calls": {"$sum": 1}}},
    ]
    total_doc = None
    async for d in db.ai_call_events.aggregate(total_pipeline):
        total_doc = d
        break
    total_mxn = round(float((total_doc or {}).get("mxn") or 0), 2)
    total_calls = int((total_doc or {}).get("calls") or 0)

    # Top 5 spenders
    top_spend_pipeline = [
        {"$match": base_match},
        {"$group": {"_id": "$dev_org_id", "mxn": {"$sum": "$cost_mxn"},
                    "calls": {"$sum": 1}}},
        {"$sort": {"mxn": -1}}, {"$limit": 5},
    ]
    spenders_raw = [d async for d in db.ai_call_events.aggregate(top_spend_pipeline)]
    name_map = await _tenant_name_map(db, [s["_id"] for s in spenders_raw if s.get("_id")])
    top_spenders = [
        {
            "tenant_id": s["_id"],
            "name": name_map.get(s["_id"], s["_id"]),
            "mxn": round(float(s.get("mxn") or 0), 2),
            "calls": int(s.get("calls") or 0),
            "pct_total": round((float(s.get("mxn") or 0) / total_mxn) * 100, 1) if total_mxn > 0 else 0,
        }
        for s in spenders_raw
    ]

    # Top 5 features
    feat_pipeline = [
        {"$match": base_match},
        {"$group": {"_id": "$feature_key", "mxn": {"$sum": "$cost_mxn"},
                    "calls": {"$sum": 1}}},
        {"$sort": {"mxn": -1}}, {"$limit": 5},
    ]
    feat_raw = [d async for d in db.ai_call_events.aggregate(feat_pipeline)]
    top_features = [
        {
            "key": f.get("_id") or "other",
            "mxn": round(float(f.get("mxn") or 0), 2),
            "calls": int(f.get("calls") or 0),
            "pct": round((float(f.get("mxn") or 0) / total_mxn) * 100, 1) if total_mxn > 0 else 0,
        }
        for f in feat_raw
    ]

    # Haiku vs Sonnet split
    model_pipeline = [
        {"$match": base_match},
        {"$group": {"_id": "$model", "mxn": {"$sum": "$cost_mxn"}, "calls": {"$sum": 1}}},
    ]
    haiku_mxn = sonnet_mxn = other_mxn = 0.0
    haiku_calls = sonnet_calls = other_calls = 0
    async for d in db.ai_call_events.aggregate(model_pipeline):
        cls = model_class(d.get("_id") or "")
        if cls == "haiku":
            haiku_mxn += float(d.get("mxn") or 0)
            haiku_calls += int(d.get("calls") or 0)
        elif cls == "sonnet":
            sonnet_mxn += float(d.get("mxn") or 0)
            sonnet_calls += int(d.get("calls") or 0)
        else:
            other_mxn += float(d.get("mxn") or 0)
            other_calls += int(d.get("calls") or 0)

    # Trend vs previous period
    pf, pt = previous_period_window(period)
    prev_total = 0.0
    async for d in db.ai_call_events.aggregate([
        {"$match": _ts_match(pf, pt)},
        {"$group": {"_id": None, "mxn": {"$sum": "$cost_mxn"}}},
    ]):
        prev_total = float(d.get("mxn") or 0)
        break
    if prev_total > 0:
        trend_pct = round(((total_mxn - prev_total) / prev_total) * 100, 1)
    else:
        trend_pct = 100.0 if total_mxn > 0 else 0.0

    # Forecast end of month
    fc = await forecast(db, tenant_id=None)

    return {
        "period": period,
        "from_ts": from_dt.isoformat(),
        "to_ts": to_dt.isoformat(),
        "total_mxn": total_mxn,
        "total_calls": total_calls,
        "top_5_spenders": top_spenders,
        "top_5_features": top_features,
        "haiku_vs_sonnet_split": {
            "haiku": {"mxn": round(haiku_mxn, 2), "calls": haiku_calls},
            "sonnet": {"mxn": round(sonnet_mxn, 2), "calls": sonnet_calls},
            "other": {"mxn": round(other_mxn, 2), "calls": other_calls},
        },
        "trend_pct_vs_prev_period": trend_pct,
        "forecast_end_of_month_mxn": fc.get("projected_mxn"),
    }


# ─── By tenant ────────────────────────────────────────────────────────────────
async def by_tenant(db, period: str = "month", limit: int = 50, skip: int = 0,
                    sort: str = "spend_desc") -> Dict[str, Any]:
    from_dt, to_dt, _ = period_window(period)
    pipeline = [
        {"$match": _ts_match(from_dt, to_dt)},
        {"$group": {
            "_id": "$dev_org_id",
            "mxn": {"$sum": "$cost_mxn"},
            "calls": {"$sum": 1},
            "tokens_in": {"$sum": "$tokens_in"},
            "tokens_out": {"$sum": "$tokens_out"},
        }},
    ]
    if sort == "name_asc":
        pipeline += [{"$sort": {"_id": 1}}]
    else:
        pipeline += [{"$sort": {"mxn": -1}}]
    pipeline += [{"$skip": skip}, {"$limit": limit}]

    rows = [d async for d in db.ai_call_events.aggregate(pipeline)]
    name_map = await _tenant_name_map(db, [r["_id"] for r in rows])

    # Caps
    caps_map: Dict[str, Dict[str, Any]] = {}
    async for c in db.ai_budget_caps.find({"tenant_id": {"$in": [r["_id"] for r in rows]}}, {"_id": 0}):
        caps_map[c["tenant_id"]] = c

    # Total for pct
    total = await _period_total(db, from_dt, to_dt)

    items = []
    for r in rows:
        tid = r["_id"]
        spent = round(float(r.get("mxn") or 0), 2)
        cap = caps_map.get(tid, {})
        cap_mxn = float(cap.get("monthly_cap_mxn") or 0)
        threshold = float(cap.get("alert_threshold_pct") or 80)
        pct_used = round((spent / cap_mxn) * 100, 1) if cap_mxn > 0 else None
        items.append({
            "tenant_id": tid,
            "name": name_map.get(tid, tid),
            "mxn": spent,
            "calls": int(r.get("calls") or 0),
            "tokens_in": int(r.get("tokens_in") or 0),
            "tokens_out": int(r.get("tokens_out") or 0),
            "pct_total": round((spent / total) * 100, 1) if total > 0 else 0,
            "cap_mxn": cap_mxn or None,
            "pct_used_of_cap": pct_used,
            "alert_threshold_pct": threshold if cap_mxn else None,
            "alert_flag": (pct_used or 0) >= threshold if cap_mxn > 0 else False,
            "hard_block": bool(cap.get("hard_block")),
        })
    return {"items": items, "total_period_mxn": round(total, 2), "skip": skip, "limit": limit}


async def _period_total(db, from_dt: datetime, to_dt: datetime) -> float:
    async for d in db.ai_call_events.aggregate([
        {"$match": _ts_match(from_dt, to_dt)},
        {"$group": {"_id": None, "mxn": {"$sum": "$cost_mxn"}}},
    ]):
        return float(d.get("mxn") or 0)
    return 0.0


# ─── By feature ───────────────────────────────────────────────────────────────
async def by_feature(db, period: str = "month", tenant_id: Optional[str] = None) -> Dict[str, Any]:
    from_dt, to_dt, _ = period_window(period)
    match: Dict[str, Any] = _ts_match(from_dt, to_dt)
    if tenant_id:
        match["dev_org_id"] = tenant_id

    pipeline = [
        {"$match": match},
        {"$group": {
            "_id": {"feature": "$feature_key", "model": "$model"},
            "mxn": {"$sum": "$cost_mxn"},
            "calls": {"$sum": 1},
        }},
    ]
    rows = [d async for d in db.ai_call_events.aggregate(pipeline)]
    feature_acc: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        feat = (r.get("_id") or {}).get("feature") or "other"
        mdl = model_class((r.get("_id") or {}).get("model") or "")
        f = feature_acc.setdefault(feat, {"feature_key": feat, "mxn": 0.0, "calls": 0,
                                          "model_mix": {"haiku": 0.0, "sonnet": 0.0, "other": 0.0}})
        f["mxn"] += float(r.get("mxn") or 0)
        f["calls"] += int(r.get("calls") or 0)
        f["model_mix"][mdl] += float(r.get("mxn") or 0)

    items = sorted(feature_acc.values(), key=lambda x: -x["mxn"])
    total = sum(it["mxn"] for it in items) or 1.0

    # top tenant per feature
    for it in items:
        it["mxn"] = round(it["mxn"], 2)
        it["pct"] = round((it["mxn"] / total) * 100, 1) if total else 0
        for k, v in it["model_mix"].items():
            it["model_mix"][k] = round(v, 2)
        # top tenant
        top_pipeline = [
            {"$match": {**match, "feature_key": it["feature_key"]}},
            {"$group": {"_id": "$dev_org_id", "mxn": {"$sum": "$cost_mxn"}}},
            {"$sort": {"mxn": -1}}, {"$limit": 1},
        ]
        async for tr in db.ai_call_events.aggregate(top_pipeline):
            it["top_tenant_id"] = tr["_id"]
            it["top_tenant_mxn"] = round(float(tr.get("mxn") or 0), 2)
            break
    name_map = await _tenant_name_map(
        db, [it.get("top_tenant_id") for it in items if it.get("top_tenant_id")],
    )
    for it in items:
        if it.get("top_tenant_id"):
            it["top_tenant_name"] = name_map.get(it["top_tenant_id"], it["top_tenant_id"])
    return {"items": items, "total_period_mxn": round(total if total != 1.0 else 0, 2)}


# ─── By model ─────────────────────────────────────────────────────────────────
async def by_model(db, period: str = "month") -> Dict[str, Any]:
    from_dt, to_dt, _ = period_window(period)
    pipeline = [
        {"$match": _ts_match(from_dt, to_dt)},
        {"$group": {"_id": "$model", "mxn": {"$sum": "$cost_mxn"},
                    "calls": {"$sum": 1},
                    "tokens_in": {"$sum": "$tokens_in"},
                    "tokens_out": {"$sum": "$tokens_out"}}},
    ]
    items = []
    async for r in db.ai_call_events.aggregate(pipeline):
        calls = int(r.get("calls") or 0)
        mxn = round(float(r.get("mxn") or 0), 2)
        items.append({
            "model": r.get("_id") or "unknown",
            "model_class": model_class(r.get("_id") or ""),
            "mxn": mxn,
            "calls": calls,
            "tokens_in": int(r.get("tokens_in") or 0),
            "tokens_out": int(r.get("tokens_out") or 0),
            "avg_cost_per_call_mxn": round(mxn / calls, 4) if calls else 0,
        })
    items.sort(key=lambda x: -x["mxn"])
    return {"items": items}


# ─── Tenant timeseries ────────────────────────────────────────────────────────
async def tenant_timeseries(db, tenant_id: str, days: int = 30) -> Dict[str, Any]:
    end = _now()
    start = end - timedelta(days=days)
    pipeline = [
        {"$match": {"dev_org_id": tenant_id, "ts": {"$gte": start, "$lte": end}}},
        {"$group": {"_id": {"day": "$daily_iso", "model": "$model"},
                    "mxn": {"$sum": "$cost_mxn"}, "calls": {"$sum": 1}}},
    ]
    bucket: Dict[str, Dict[str, Any]] = {}
    async for r in db.ai_call_events.aggregate(pipeline):
        day = r["_id"]["day"]
        cls = model_class(r["_id"].get("model") or "")
        b = bucket.setdefault(day, {"date": day, "mxn": 0.0, "calls": 0,
                                    "by_model": {"haiku": 0.0, "sonnet": 0.0, "other": 0.0}})
        b["mxn"] += float(r.get("mxn") or 0)
        b["calls"] += int(r.get("calls") or 0)
        b["by_model"][cls] += float(r.get("mxn") or 0)
    # Fill missing days with 0
    out: List[Dict[str, Any]] = []
    cur = start
    while cur <= end:
        d = cur.strftime("%Y-%m-%d")
        if d in bucket:
            b = bucket[d]
            b["mxn"] = round(b["mxn"], 2)
            for k, v in b["by_model"].items():
                b["by_model"][k] = round(v, 2)
            out.append(b)
        else:
            out.append({"date": d, "mxn": 0.0, "calls": 0,
                        "by_model": {"haiku": 0.0, "sonnet": 0.0, "other": 0.0}})
        cur += timedelta(days=1)
    return {"tenant_id": tenant_id, "days": days, "items": out}


# ─── Forecast ─────────────────────────────────────────────────────────────────
async def forecast(db, tenant_id: Optional[str] = None) -> Dict[str, Any]:
    """End-of-month projection based on last 7 days run-rate."""
    n = _now()
    start_month = datetime(n.year, n.month, 1, tzinfo=timezone.utc)
    last_7_start = n - timedelta(days=7)

    match_mtd: Dict[str, Any] = {"ts": {"$gte": start_month, "$lte": n}}
    match_7d: Dict[str, Any] = {"ts": {"$gte": last_7_start, "$lte": n}}
    if tenant_id:
        match_mtd["dev_org_id"] = tenant_id
        match_7d["dev_org_id"] = tenant_id

    mtd = await _agg_sum(db, match_mtd)
    last7 = await _agg_sum(db, match_7d)
    run_rate_daily = round(last7 / 7.0, 2) if last7 else 0.0
    days_left = days_remaining_in_month()
    projected = round(mtd + run_rate_daily * days_left, 2)

    cap_mxn = None
    pct_vs_cap = None
    if tenant_id:
        cap_doc = await db.ai_budget_caps.find_one({"tenant_id": tenant_id}, {"_id": 0})
        if cap_doc and cap_doc.get("monthly_cap_mxn"):
            cap_mxn = float(cap_doc["monthly_cap_mxn"])
            pct_vs_cap = round((projected / cap_mxn) * 100, 1) if cap_mxn > 0 else None

    return {
        "tenant_id": tenant_id,
        "current_mtd_mxn": round(mtd, 2),
        "run_rate_daily_mxn": run_rate_daily,
        "projected_mxn": projected,
        "days_remaining": days_left,
        "monthly_cap_mxn": cap_mxn,
        "vs_cap_pct": pct_vs_cap,
    }


async def _agg_sum(db, match: Dict[str, Any]) -> float:
    async for d in db.ai_call_events.aggregate([
        {"$match": match},
        {"$group": {"_id": None, "mxn": {"$sum": "$cost_mxn"}}},
    ]):
        return float(d.get("mxn") or 0)
    return 0.0


# ─── Daily snapshot cron ──────────────────────────────────────────────────────
async def materialize_daily_snapshot(db) -> Dict[str, Any]:
    """Aggregate yesterday's data per tenant/feature into ai_cost_daily_snapshots."""
    n = _now()
    yesterday = (n - timedelta(days=1)).strftime("%Y-%m-%d")
    pipeline = [
        {"$match": {"daily_iso": yesterday}},
        {"$group": {
            "_id": {"tenant": "$dev_org_id", "feature": "$feature_key"},
            "mxn": {"$sum": "$cost_mxn"},
            "calls": {"$sum": 1},
            "tokens_in": {"$sum": "$tokens_in"},
            "tokens_out": {"$sum": "$tokens_out"},
        }},
    ]
    inserted = 0
    async for r in db.ai_call_events.aggregate(pipeline):
        await db.ai_cost_daily_snapshots.update_one(
            {"daily_iso": yesterday,
             "tenant_id": r["_id"]["tenant"],
             "feature_key": r["_id"]["feature"]},
            {"$set": {
                "daily_iso": yesterday,
                "tenant_id": r["_id"]["tenant"],
                "feature_key": r["_id"]["feature"] or "other",
                "mxn": round(float(r.get("mxn") or 0), 2),
                "calls": int(r.get("calls") or 0),
                "tokens_in": int(r.get("tokens_in") or 0),
                "tokens_out": int(r.get("tokens_out") or 0),
                "materialized_at": n.isoformat(),
            }},
            upsert=True,
        )
        inserted += 1
    return {"daily_iso": yesterday, "snapshots_upserted": inserted}
