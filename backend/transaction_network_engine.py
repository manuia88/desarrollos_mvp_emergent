"""W3.2 ZZ.2 Transaction Network — Core Engine.

Anonymized closing-price tracker. Foundation for DRPI (W3.3) and Fraud Detection (W3.4).

Collections:
  db.transactions:
    { id, anonymized_id (SHA-256), property_id_hash, zone_id, tier, ageb_id?,
      property_type, m2, recamaras, baños, year_built, floor?, view?, orientation?,
      listed_price_mxn, closing_price_mxn, discount_pct, days_on_market,
      source, confidence_score, closed_at, ingested_at, anonymized:true,
      geo:{type:"Point", coordinates:[lng,lat]} }
    index (zone_id, closed_at desc) · (tier, property_type) · 2dsphere geo
    TTL 5 años (LFPDPPP compliance)

  db.price_index_snapshots:
    { zone_id, tier, property_type, period, median_price_per_m2,
      median_discount_pct, transactions_count, p25, p75, iqr, computed_at }
    unique (zone_id, tier, property_type, period, computed_at)
"""
from __future__ import annotations

import csv
import hashlib
import io
import logging
import secrets
import statistics
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.transaction_network_engine")

ANON_SALT = "dmx_lfpdppp_2025"   # non-secret, merely domain-separation
K_ANON_MIN = 5                    # minimum transactions for public output
VALID_PROPERTY_TYPES = {"depto", "casa", "loft", "town", "PH"}
VALID_SOURCES = {"dmx_native", "dev_self_report", "notary_partner", "bulk_ingest"}
VALID_PERIODS = {"week", "month"}


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str = "tx") -> str:
    return f"{prefix}_{secrets.token_urlsafe(10)}"


def _sha256_short(value: str) -> str:
    return hashlib.sha256(f"{ANON_SALT}:{value}".encode()).hexdigest()[:20]


def _discount_pct(listed: float, closing: float) -> float:
    if listed <= 0:
        return 0.0
    return round((closing - listed) / listed * 100, 2)


# ─── Anonymize + validate ingest shape ────────────────────────────────────────

def _anonymize_raw(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Remove any PII and produce clean anonymized transaction record."""
    # Buyer PII — always removed
    raw.pop("buyer_name", None)
    raw.pop("buyer_email", None)
    raw.pop("buyer_phone", None)
    raw.pop("buyer_rfc", None)
    raw.pop("address", None)
    raw.pop("street", None)
    raw.pop("notary_name", None)

    # Hash identifiers
    buyer_ref = raw.pop("buyer_id", "") or ""
    prop_ref  = raw.pop("property_id", "") or raw.pop("property_address", "") or ""
    raw["anonymized_id"]    = _sha256_short(buyer_ref + prop_ref + _iso()[:10])
    raw["property_id_hash"] = _sha256_short(prop_ref) if prop_ref else ""
    raw["anonymized"] = True
    return raw


def _compute_discount(doc: Dict[str, Any]) -> Dict[str, Any]:
    listed  = doc.get("listed_price_mxn") or 0
    closing = doc.get("closing_price_mxn") or 0
    if listed and closing:
        doc["discount_pct"] = _discount_pct(listed, closing)
    else:
        doc["discount_pct"] = None
    return doc


# ─── Core ingest ──────────────────────────────────────────────────────────────

async def ingest_transaction(
    db, raw_data: Dict[str, Any], source: str = "dmx_native",
) -> Dict[str, Any]:
    """Anonymize, validate, and insert a transaction.
    Returns the inserted document (no PII).
    """
    doc = dict(raw_data)
    doc["source"] = source if source in VALID_SOURCES else "dmx_native"

    # Validate required fields
    missing = [f for f in ("zone_id", "closing_price_mxn") if not doc.get(f)]
    if missing:
        raise ValueError(f"Campos obligatorios faltantes: {missing}")

    # Normalize property_type
    pt = str(doc.get("property_type") or "depto").lower()
    doc["property_type"] = pt if pt in VALID_PROPERTY_TYPES else "depto"

    # Compute derived fields
    _compute_discount(doc)

    # Build geo point if lat/lng available
    lat = _safe_float(doc.pop("lat", None))
    lng = _safe_float(doc.pop("lng", None))
    if lat is not None and lng is not None:
        doc["geo"] = {"type": "Point", "coordinates": [lng, lat]}
    else:
        doc.pop("geo", None)

    # Anonymize PII
    _anonymize_raw(doc)

    # IDs + timestamps
    doc["id"] = _new_id("tx")
    doc["ingested_at"] = _iso()
    if not doc.get("closed_at"):
        doc["closed_at"] = _iso()

    # Default confidence
    if not doc.get("confidence_score"):
        confidence_map = {
            "dmx_native": 90, "notary_partner": 95,
            "dev_self_report": 70, "bulk_ingest": 65,
        }
        doc["confidence_score"] = confidence_map.get(doc["source"], 60)

    # Parse numeric fields
    for k in ("m2", "recamaras", "baños", "year_built", "floor",
              "listed_price_mxn", "closing_price_mxn"):
        if doc.get(k) is not None:
            doc[k] = _safe_float(doc[k]) if k in ("m2",) else _safe_int(doc[k])

    try:
        await db.transactions.insert_one(doc)
    except Exception as e:
        log.warning(f"[txn] insert error: {e}")
        raise

    out = dict(doc)
    out.pop("_id", None)
    return out


def _safe_float(v) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(str(v).replace(",", "").replace("$", ""))
    except Exception:
        return None


def _safe_int(v) -> Optional[int]:
    f = _safe_float(v)
    return int(f) if f is not None else None


# ─── Comparables (Haversine) ──────────────────────────────────────────────────

def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    import math
    R = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = math.sin(d_lat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2)**2
    return R * 2 * math.asin(math.sqrt(a))


def _similarity_score(target: Dict[str, Any], comp: Dict[str, Any]) -> float:
    """0–100 similarity based on m2, recamaras, year_built proximity."""
    score = 50.0  # base

    # m2 similarity (weight 40%)
    t_m2 = target.get("m2") or 0
    c_m2 = comp.get("m2") or 0
    if t_m2 and c_m2:
        m2_pct = abs(t_m2 - c_m2) / max(t_m2, 1)
        m2_s = max(0, 1 - m2_pct / 0.20)   # 20% tolerance = 0 score
        score += 25 * m2_s

    # Recamaras exact match (weight 30%)
    if target.get("recamaras") and comp.get("recamaras"):
        score += 20 if target["recamaras"] == comp["recamaras"] else 0

    # year_built similarity ±5y (weight 15%)
    t_yr = target.get("year_built") or 0
    c_yr = comp.get("year_built") or 0
    if t_yr and c_yr:
        yr_diff = abs(t_yr - c_yr)
        yr_s = max(0, 1 - yr_diff / 5)
        score += 10 * yr_s

    return round(min(100.0, score), 1)


async def compute_comparables(
    db,
    target: Dict[str, Any],
    radius_km: float = 2.0,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """Find comparable transactions near target property using geo + attribute similarity."""
    geo = target.get("geo") or {}
    coords = geo.get("coordinates")  # [lng, lat]

    if coords and len(coords) == 2:
        # Use 2dsphere $nearSphere
        lng, lat = coords
        pipeline = [
            {"$geoNear": {
                "near": {"type": "Point", "coordinates": [lng, lat]},
                "distanceField": "dist_m",
                "maxDistance": radius_km * 1000,
                "spherical": True,
            }},
            {"$match": {
                "property_type": target.get("property_type", "depto"),
                "m2": {"$gte": (target.get("m2") or 60) * 0.80,
                       "$lte": (target.get("m2") or 60) * 1.20},
            }},
            {"$project": {"_id": 0}},
            {"$limit": limit * 3},  # over-fetch for similarity sort
        ]
        try:
            raw = [doc async for doc in db.transactions.aggregate(pipeline)]
        except Exception as e:
            log.warning(f"[txn] geoNear error: {e}")
            raw = []
    else:
        # Fallback: same zone_id
        q: Dict[str, Any] = {
            "zone_id": target.get("zone_id", ""),
            "property_type": target.get("property_type", "depto"),
        }
        m2 = target.get("m2") or 0
        if m2:
            q["m2"] = {"$gte": m2 * 0.80, "$lte": m2 * 1.20}
        raw = await db.transactions.find(q, {"_id": 0}).limit(limit * 3).to_list(limit * 3)

    # Score + sort
    for doc in raw:
        doc["similarity_score"] = _similarity_score(target, doc)
    raw.sort(key=lambda d: d["similarity_score"], reverse=True)

    return raw[:limit]


# ─── Price Index ──────────────────────────────────────────────────────────────

def _median_iqr(values: List[float]) -> Tuple[float, float, float, float]:
    """Return (median, q25, q75, iqr) for a list of floats."""
    if not values:
        return 0.0, 0.0, 0.0, 0.0
    s = sorted(values)
    n = len(s)
    median = s[n // 2] if n % 2 == 1 else (s[n // 2 - 1] + s[n // 2]) / 2
    q25 = s[max(0, int(n * 0.25))]
    q75 = s[min(n - 1, int(n * 0.75))]
    return round(median, 0), round(q25, 0), round(q75, 0), round(q75 - q25, 0)


async def compute_price_index(
    db, zone_id: str, tier: str = "colonia",
    property_type: str = "depto", period: str = "month",
) -> Dict[str, Any]:
    """Compute median price/m² and discount distribution for a zone."""
    if period not in VALID_PERIODS:
        period = "month"

    days = 30 if period == "month" else 7
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    cutoff_iso = cutoff.isoformat()

    q: Dict[str, Any] = {
        "zone_id": zone_id,
        "closed_at": {"$gte": cutoff_iso},
    }
    if property_type != "all":
        q["property_type"] = property_type

    docs = await db.transactions.find(q, {"_id": 0, "closing_price_mxn": 1, "m2": 1, "discount_pct": 1}).to_list(500)

    prices_per_m2 = [
        d["closing_price_mxn"] / d["m2"]
        for d in docs
        if d.get("closing_price_mxn") and d.get("m2") and d["m2"] > 0
    ]
    discounts = [d["discount_pct"] for d in docs if d.get("discount_pct") is not None]

    median, p25, p75, iqr = _median_iqr(prices_per_m2)
    med_disc = _median_iqr(discounts)[0] if discounts else None

    result = {
        "zone_id": zone_id,
        "tier": tier,
        "property_type": property_type,
        "period": period,
        "transactions_count": len(docs),
        "median_price_per_m2": median,
        "p25": p25,
        "p75": p75,
        "iqr": iqr,
        "median_discount_pct": med_disc,
        "computed_at": _iso(),
    }

    # Upsert snapshot
    try:
        snap = dict(result)
        snap["period_start"] = cutoff_iso
        await db.price_index_snapshots.update_one(
            {"zone_id": zone_id, "tier": tier, "property_type": property_type,
             "period": period, "computed_at": snap["computed_at"]},
            {"$set": snap},
            upsert=True,
        )
    except Exception as e:
        log.warning(f"[txn] price_index upsert failed: {e}")

    return result


async def get_price_index_history(
    db, zone_id: str, tier: str = "colonia",
    property_type: str = "depto", period: str = "month", n_periods: int = 12,
) -> List[Dict[str, Any]]:
    """Return last N price index snapshots for time-series chart."""
    cursor = db.price_index_snapshots.find(
        {"zone_id": zone_id, "tier": tier, "property_type": property_type, "period": period},
        {"_id": 0},
    ).sort("computed_at", -1).limit(n_periods)
    items = [doc async for doc in cursor]
    items.reverse()  # oldest first for chart
    return items


# ─── Anomaly Detection ────────────────────────────────────────────────────────

async def detect_price_anomaly(
    db, listing: Dict[str, Any],
) -> Dict[str, Any]:
    """Compare listing price/m² against verified comparables.
    Returns severity: ok|amber|red + deviation_pct + reasoning.
    Foundation for W3.4 Fraud Detection.
    """
    listing_price = listing.get("listing_price_mxn") or listing.get("closing_price_mxn") or 0
    m2 = listing.get("m2") or 0
    if m2 <= 0 or listing_price <= 0:
        return {
            "severity": "ok", "deviation_pct": None,
            "reasoning": "Datos insuficientes para comparación (m2 o precio faltante).",
            "comparables_count": 0,
        }

    listing_pm2 = listing_price / m2
    comps = await compute_comparables(db, listing, radius_km=2.0, limit=10)

    comp_prices = [
        c["closing_price_mxn"] / c["m2"]
        for c in comps
        if c.get("closing_price_mxn") and c.get("m2") and c["m2"] > 0
    ]

    if not comp_prices:
        return {
            "severity": "ok",
            "deviation_pct": None,
            "reasoning": "Sin comparables verificados en radio 2km. No se puede determinar anomalía.",
            "comparables_count": 0,
        }

    median, p25, p75, iqr = _median_iqr(comp_prices)
    deviation_pct = round((listing_pm2 - median) / max(median, 1) * 100, 1)

    if iqr == 0:
        iqr = median * 0.10  # use 10% of median as fallback IQR

    if listing_pm2 > median + 3 * iqr:
        severity = "red"
        reasoning = (f"Precio/m² ${listing_pm2:,.0f} excede mediana verificada ${median:,.0f} "
                     f"en +{deviation_pct}% (>3×IQR). Posible sobrevaluación.")
    elif listing_pm2 > median + 1.5 * iqr:
        severity = "amber"
        reasoning = (f"Precio/m² ${listing_pm2:,.0f} está por encima del rango de comparables "
                     f"(+{deviation_pct}%, 1.5–3×IQR). Revisar justificación.")
    elif listing_pm2 < median - 3 * iqr:
        severity = "red"
        reasoning = (f"Precio/m² ${listing_pm2:,.0f} está muy por debajo de comparables "
                     f"({deviation_pct}%, <-3×IQR). Posible subvaluación / alerta fraude.")
    elif listing_pm2 < median - 1.5 * iqr:
        severity = "amber"
        reasoning = (f"Precio/m² ${listing_pm2:,.0f} por debajo del rango de comparables "
                     f"({deviation_pct}%, 1.5–3×IQR). Verificar fuente.")
    else:
        severity = "ok"
        reasoning = (f"Precio/m² ${listing_pm2:,.0f} dentro del rango normal de comparables "
                     f"(desviación {deviation_pct}%).")

    return {
        "severity": severity,
        "deviation_pct": deviation_pct,
        "listing_price_per_m2": round(listing_pm2, 0),
        "median_comparable_per_m2": round(median, 0),
        "iqr": round(iqr, 0),
        "p25": round(p25, 0),
        "p75": round(p75, 0),
        "comparables_count": len(comps),
        "reasoning": reasoning,
        "w3_4_foundation": True,
    }


# ─── CSV Bulk Ingest ──────────────────────────────────────────────────────────

REQUIRED_CSV_COLS = {"zone_id", "closing_price_mxn", "closed_at"}
NUMERIC_CSV_COLS = {"m2", "recamaras", "baños", "year_built", "floor",
                    "listed_price_mxn", "closing_price_mxn", "lat", "lng",
                    "days_on_market", "confidence_score"}


async def bulk_ingest_csv(
    db, csv_bytes: bytes, source: str = "bulk_ingest",
) -> Dict[str, Any]:
    """Parse CSV bytes and ingest each row as a transaction.
    Returns {inserted, skipped_duplicates, errors}.
    """
    inserted = 0
    skipped = 0
    errors: List[str] = []

    try:
        text = csv_bytes.decode("utf-8-sig")
    except Exception:
        text = csv_bytes.decode("latin-1", errors="replace")

    reader = csv.DictReader(io.StringIO(text))

    for i, row in enumerate(reader, start=1):
        try:
            raw = {k.strip(): (v.strip() if v else None) for k, v in row.items()}
            missing = [c for c in REQUIRED_CSV_COLS if not raw.get(c)]
            if missing:
                errors.append(f"Fila {i}: columnas faltantes {missing}")
                continue

            for col in NUMERIC_CSV_COLS:
                if raw.get(col):
                    raw[col] = _safe_float(raw[col]) or _safe_int(raw[col])

            await ingest_transaction(db, raw, source)
            inserted += 1
        except Exception as e:
            errors.append(f"Fila {i}: {str(e)[:80]}")

    return {
        "inserted": inserted,
        "skipped_duplicates": skipped,
        "errors": errors,
        "total_rows": inserted + skipped + len(errors),
    }


# ─── Stats KPI ────────────────────────────────────────────────────────────────

async def compute_stats(db) -> Dict[str, Any]:
    """Cross-org KPI snapshot: total verified, DOM avg, discount avg, top velocity zones."""
    total = await db.transactions.count_documents({})

    # DOM avg
    pipeline_dom = [
        {"$group": {"_id": None, "avg_dom": {"$avg": "$days_on_market"}}},
    ]
    dom_res = await db.transactions.aggregate(pipeline_dom).to_list(1)
    avg_dom = round(dom_res[0]["avg_dom"] or 0, 1) if dom_res else None

    # Discount avg
    pipeline_disc = [
        {"$match": {"discount_pct": {"$ne": None}}},
        {"$group": {"_id": None, "avg_disc": {"$avg": "$discount_pct"}}},
    ]
    disc_res = await db.transactions.aggregate(pipeline_disc).to_list(1)
    avg_disc = round(disc_res[0]["avg_disc"] or 0, 1) if disc_res else None

    # Top 10 zones by velocity (most transactions in last 30 days)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    pipeline_zones = [
        {"$match": {"closed_at": {"$gte": cutoff}}},
        {"$group": {"_id": "$zone_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
        {"$project": {"zone_id": "$_id", "count": 1, "_id": 0}},
    ]
    top_zones = [z async for z in db.transactions.aggregate(pipeline_zones)]

    return {
        "total_verified": total,
        "avg_dom": avg_dom,
        "avg_discount_pct": avg_disc,
        "top_zones_velocity": top_zones,
        "computed_at": _iso(),
    }


# ─── Daily cron price index refresh ──────────────────────────────────────────

async def cron_price_index_refresh(db) -> Dict[str, Any]:
    """Refresh price index per zone × tier × property_type × period."""
    # Zones with recent transactions
    cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    pipeline = [
        {"$match": {"closed_at": {"$gte": cutoff}}},
        {"$group": {"_id": {"zone_id": "$zone_id", "tier": "$tier", "property_type": "$property_type"}}},
    ]
    combos = [r["_id"] async for r in db.transactions.aggregate(pipeline)]
    if not combos:
        # Fall back to cube aggregations zones
        cursor = db.cube_aggregations.find(
            {"period": "current"}, {"_id": 0, "tier_id": 1, "tier": 1},
        ).limit(100)
        combos = [{"zone_id": r["tier_id"], "tier": r.get("tier", "colonia"),
                   "property_type": "depto"} async for r in cursor]

    refreshed = 0
    failed = 0
    for combo in combos:
        for period in ("week", "month"):
            try:
                await compute_price_index(
                    db,
                    combo["zone_id"], combo.get("tier", "colonia"),
                    combo.get("property_type", "depto"), period,
                )
                refreshed += 1
            except Exception as e:
                log.warning(f"[txn cron] price_index failed {combo}: {e}")
                failed += 1

    return {"ok": True, "refreshed": refreshed, "failed": failed, "completed_at": _iso()}


def schedule_price_index_cron(scheduler, db) -> None:
    """Register cron `transaction_price_index_refresh` 04:30 MX."""
    try:
        from cron_heartbeat import wrap_apscheduler_job
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            wrap_apscheduler_job(cron_price_index_refresh, "transaction_price_index_refresh"),
            CronTrigger(hour=4, minute=30, timezone="America/Mexico_City"),
            args=[db], id="transaction_price_index_refresh",
            replace_existing=True, misfire_grace_time=3600,
        )
    except Exception as e:
        log.warning(f"[txn] schedule cron failed: {e}")


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    try:
        await db.transactions.create_index(
            [("zone_id", 1), ("closed_at", -1)], name="txn_zone_closed")
        await db.transactions.create_index(
            [("tier", 1), ("property_type", 1)], name="txn_tier_type")
        await db.transactions.create_index(
            [("geo", "2dsphere")], name="txn_geo_2dsphere",
            sparse=True)
        await db.transactions.create_index(
            "ingested_at",
            expireAfterSeconds=5 * 365 * 86400,  # TTL 5 years LFPDPPP
            name="txn_ttl_5y")
        await db.transactions.create_index("anonymized_id", name="txn_anon_id")

        await db.price_index_snapshots.create_index(
            [("zone_id", 1), ("tier", 1), ("property_type", 1),
             ("period", 1), ("computed_at", -1)],
            name="pi_snapshot_lookup")
    except Exception as e:
        log.warning(f"[txn] ensure_indexes failed: {e}")
