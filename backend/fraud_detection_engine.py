"""W3.4A — Fraud Detection AI Engine.

3 detectors orchestrated by `detect_listing_fraud`:
  1. Price anomaly via sklearn IsolationForest on Transaction Network W3.2
  2. Duplicate listing via rapidfuzz (W1.5 reuse) + geo proximity
  3. Title chain anomaly — placeholder honest (Y2 RPP partnership)

Schema db.fraud_alerts:
  { id, listing_id_hash (anonymized), zone_id, severity:"critical|amber|info",
    source:"price_anomaly|duplicate|title_chain",
    evidence:{...}, confidence_pct, ml_score?, similarity_match_id?,
    detected_at, status:"open|investigating|resolved|dismissed",
    resolved_by?, resolved_at?, resolution_note? }
  index (status, severity, detected_at desc) · (zone_id)
"""
from __future__ import annotations

import hashlib
import logging
import math
import os
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.fraud_detection_engine")

ANON_SALT = "dmx_fraud_2025"
TITLE_FUZZ_THRESHOLD = 85.0
GEO_PROX_METERS = 500.0
PRICE_TOLERANCE_PCT = 0.05  # ±5%
ML_CRITICAL_THRESHOLD = -0.5
ML_AMBER_THRESHOLD = -0.1


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


def _new_id(prefix: str = "fa") -> str:
    return f"{prefix}_{secrets.token_urlsafe(10)}"


def _hash_listing_id(listing_id: str) -> str:
    return hashlib.sha256(f"{ANON_SALT}:{listing_id or _iso()}".encode()).hexdigest()[:20]


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371000.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (math.sin(d_lat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


# ─── Detector 1 — Price anomaly via IsolationForest ───────────────────────────

_MODEL_CACHE: Dict[str, Any] = {}


def _ml_features(doc: Dict[str, Any]) -> Optional[List[float]]:
    """Numeric feature vector. Returns None if essentials missing."""
    closing = doc.get("closing_price_mxn") or doc.get("listing_price_mxn") or 0
    m2 = doc.get("m2") or 0
    if not closing or not m2 or m2 <= 0:
        return None
    return [
        float(closing),
        float(m2),
        float(doc.get("recamaras") or 0),
        float(doc.get("baños") or 0),
        float(doc.get("year_built") or 2010),
    ]


async def _train_model(db, zone_id: Optional[str] = None):
    """Train IsolationForest on Transaction Network W3.2.
    Uses cached model up to 24h. zone_id=None → global model.
    """
    cache_key = zone_id or "_global_"
    cached = _MODEL_CACHE.get(cache_key)
    if cached and (_now() - cached["fit_at"]).total_seconds() < 86400:
        return cached["model"]

    from sklearn.ensemble import IsolationForest
    import numpy as np

    q: dict = {}
    if zone_id:
        q["zone_id"] = zone_id

    # P2.5 · sort por closed_at desc → las 2000 transacciones MÁS RECIENTES (antes sin orden =
    # las 2000 más viejas por inserción → detección de fraude entrenada con datos añejos).
    docs = await db.transactions.find(q, {"_id": 0}).sort("closed_at", -1).limit(2000).to_list(2000)
    rows: List[List[float]] = []
    for d in docs:
        f = _ml_features(d)
        if f:
            rows.append(f)

    if len(rows) < 30:
        return None

    X = np.array(rows, dtype=float)
    model = IsolationForest(
        n_estimators=100,
        contamination="auto",
        random_state=42,
    )
    model.fit(X)
    _MODEL_CACHE[cache_key] = {"model": model, "fit_at": _now()}
    return model


async def detect_price_anomaly_ml(
    db, listing: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Return {severity, ml_score, evidence} or None when no signal."""
    feats = _ml_features(listing)
    if not feats:
        return None
    zone_id = listing.get("zone_id") or None
    model = await _train_model(db, zone_id) or await _train_model(db, None)
    if model is None:
        return None

    import numpy as np
    X = np.array([feats], dtype=float)
    score = float(model.score_samples(X)[0])
    is_outlier = bool(model.predict(X)[0] == -1)

    if not is_outlier and score > ML_AMBER_THRESHOLD:
        return None
    if score < ML_CRITICAL_THRESHOLD:
        severity = "critical"
        confidence_pct = 90
    elif score < ML_AMBER_THRESHOLD:
        severity = "amber"
        confidence_pct = 70
    else:
        severity = "info"
        confidence_pct = 50

    return {
        "severity": severity,
        "source": "price_anomaly",
        "ml_score": round(score, 4),
        "confidence_pct": confidence_pct,
        "evidence": {
            "model": "IsolationForest",
            "features": ["closing_price_mxn", "m2", "recamaras", "baños", "year_built"],
            "zone_scope": zone_id or "global",
            "sample_size": "≥30 transactions",
        },
    }


# ─── Detector 2 — Duplicate listing via rapidfuzz + geo ───────────────────────

async def detect_duplicate_listing(
    db, listing: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Compare against existing transactions in same zone. Returns alert if
    strong duplicate signal."""
    try:
        from rapidfuzz import fuzz
    except Exception:
        return None

    title = (listing.get("title") or listing.get("project_name") or "").strip().lower()
    addr = (listing.get("address") or listing.get("colonia") or "").strip().lower()
    if not title and not addr:
        return None

    target_str = f"{title} {addr}".strip()
    listing_price = listing.get("closing_price_mxn") or listing.get("listing_price_mxn") or 0
    listing_lat = listing.get("lat")
    listing_lng = listing.get("lng")

    zone_q = {"zone_id": listing.get("zone_id")} if listing.get("zone_id") else {}
    cursor = db.transactions.find(
        zone_q, {"_id": 0, "id": 1, "anonymized_id": 1, "title": 1, "address": 1,
                 "closing_price_mxn": 1, "geo": 1, "zone_id": 1},
    ).limit(500)
    best: Optional[Tuple[float, dict]] = None
    async for cand in cursor:
        cand_str = (
            f"{(cand.get('title') or '').lower()} {(cand.get('address') or '').lower()}"
        ).strip()
        if not cand_str:
            continue
        score = fuzz.WRatio(target_str, cand_str)
        if score < TITLE_FUZZ_THRESHOLD:
            continue

        # Price tolerance ±5%
        cand_price = cand.get("closing_price_mxn") or 0
        price_match = (cand_price > 0 and listing_price > 0
                       and abs(cand_price - listing_price) / max(cand_price, 1) <= PRICE_TOLERANCE_PCT)

        # Geo proximity <500m
        geo_match = False
        coords = (cand.get("geo") or {}).get("coordinates")
        if coords and listing_lat is not None and listing_lng is not None:
            dist = _haversine_m(listing_lat, listing_lng, coords[1], coords[0])
            geo_match = dist < GEO_PROX_METERS

        if price_match or geo_match:
            if best is None or score > best[0]:
                best = (score, {**cand, "score": score, "price_match": price_match, "geo_match": geo_match})

    if not best:
        return None

    sim_score, match = best
    severity = "amber" if sim_score < 92 else "critical"
    return {
        "severity": severity,
        "source": "duplicate",
        "confidence_pct": int(min(100, sim_score)),
        "similarity_match_id": match.get("anonymized_id") or match.get("id"),
        "evidence": {
            "similarity_pct": round(sim_score, 1),
            "price_match": match.get("price_match", False),
            "geo_match": match.get("geo_match", False),
            "fuzz_method": "WRatio",
        },
    }


# ─── Detector 3 — Title chain anomaly (placeholder honest) ───────────────────

async def detect_title_chain_anomaly(
    db, listing: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Heuristic placeholder until RPP API partnership (Y2).
    Flags amber if propiedad_id_hash cambió manos >2 veces en 24m."""
    pid = listing.get("property_id_hash")
    if not pid:
        return None
    cutoff = (_now() - timedelta(days=730)).isoformat()
    count = await db.transactions.count_documents(
        {"property_id_hash": pid, "closed_at": {"$gte": cutoff}},
    )
    if count <= 2:
        return None
    # Price delta > 50% over 12m?
    cutoff_12m = (_now() - timedelta(days=365)).isoformat()
    docs = await db.transactions.find(
        {"property_id_hash": pid, "closed_at": {"$gte": cutoff_12m}},
        {"_id": 0, "closing_price_mxn": 1},
    ).limit(50).to_list(50)
    prices = [d["closing_price_mxn"] for d in docs if d.get("closing_price_mxn")]
    severity = "info"
    if len(prices) >= 2:
        ratio = max(prices) / max(min(prices), 1)
        if ratio > 1.5:
            severity = "amber"

    return {
        "severity": severity,
        "source": "title_chain",
        "confidence_pct": 55,
        "evidence": {
            "transactions_24m": count,
            "price_range_12m": [min(prices), max(prices)] if prices else None,
            "method": "heuristic_placeholder",
            "v2_pending": "RPP partnership Y2",
        },
    }


# ─── Orchestrator ─────────────────────────────────────────────────────────────

async def detect_listing_fraud(db, listing: Dict[str, Any]) -> Dict[str, Any]:
    """Run all 3 detectors. Returns highest-severity alert (or no_signal)."""
    results: List[Dict[str, Any]] = []

    for fn in (detect_price_anomaly_ml, detect_duplicate_listing, detect_title_chain_anomaly):
        try:
            r = await fn(db, listing)
            if r:
                results.append(r)
        except Exception as e:
            log.warning(f"[fraud] detector {fn.__name__} failed: {e}")

    if not results:
        return {"severity": "ok", "evidence": {}, "results": []}

    # Severity rank: critical > amber > info > ok
    rank = {"critical": 3, "amber": 2, "info": 1, "ok": 0}
    results.sort(key=lambda r: rank.get(r.get("severity"), 0), reverse=True)
    best = results[0]
    return {
        "severity": best["severity"],
        "source": best["source"],
        "ml_score": best.get("ml_score"),
        "confidence_pct": best.get("confidence_pct"),
        "similarity_match_id": best.get("similarity_match_id"),
        "evidence": best.get("evidence", {}),
        "all_signals": results,
    }


# ─── Persist alerts ───────────────────────────────────────────────────────────

async def persist_alert(
    db, listing_id: str, zone_id: str, detection: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Insert fraud alert if severity ≥ amber. Returns inserted doc or None."""
    if detection.get("severity") not in ("amber", "critical"):
        return None

    doc = {
        "id": _new_id("fa"),
        "listing_id_hash": _hash_listing_id(listing_id or ""),
        "zone_id": zone_id or "",
        "severity": detection["severity"],
        "source": detection.get("source") or "unknown",
        "evidence": detection.get("evidence") or {},
        "confidence_pct": detection.get("confidence_pct"),
        "ml_score": detection.get("ml_score"),
        "similarity_match_id": detection.get("similarity_match_id"),
        "detected_at": _iso(),
        "detected_at_dt": _now(),
        "status": "open",
        "resolved_by": None,
        "resolved_at": None,
        "resolution_note": None,
    }
    try:
        await db.fraud_alerts.insert_one(dict(doc))
    except Exception as e:
        log.warning(f"[fraud] persist failed: {e}")
        return None

    out = dict(doc); out.pop("_id", None); out.pop("detected_at_dt", None)
    return out


# ─── Daily batch scan ─────────────────────────────────────────────────────────

async def cron_fraud_detection_daily(db) -> Dict[str, Any]:
    """Daily scan: walk active listings (cubo Z + transactions) and flag
    fraud signals. Throttle email alerts via Resend (1/day per critical type)."""
    inserted = 0
    scanned = 0

    # Reuse last 60 days of transactions + active listings from cube units (best effort)
    cutoff = (_now() - timedelta(days=60)).isoformat()
    cursor = db.transactions.find(
        {"closed_at": {"$gte": cutoff}},
        {"_id": 0},
    ).limit(500)

    async for doc in cursor:
        listing = dict(doc)
        # Synthesize geo for the duplicate detector
        if "geo" in listing and isinstance(listing["geo"], dict):
            coords = listing["geo"].get("coordinates")
            if coords and len(coords) == 2:
                listing["lng"], listing["lat"] = coords[0], coords[1]
        det = await detect_listing_fraud(db, listing)
        scanned += 1
        if det.get("severity") in ("amber", "critical"):
            await persist_alert(
                db,
                listing.get("anonymized_id") or listing.get("id") or "",
                listing.get("zone_id") or "",
                det,
            )
            inserted += 1

    # Send email summary if any critical (throttle 1/day)
    crit_count = await db.fraud_alerts.count_documents({
        "severity": "critical", "status": "open",
        "detected_at_dt": {"$gte": _now() - timedelta(hours=24)},
    })
    if crit_count > 0:
        await _maybe_send_summary_email(db, crit_count)

    return {
        "ok": True, "scanned": scanned, "alerts_inserted": inserted,
        "critical_open_24h": crit_count, "completed_at": _iso(),
    }


async def _maybe_send_summary_email(db, count: int) -> None:
    """Throttle 1/day summary email via Resend."""
    try:
        last = await db.system_alerts.find_one(
            {"source": "fraud_detection_daily_email"},
            sort=[("ts", -1)],
        )
        if last and (_now() - last["ts"]).total_seconds() < 86400:
            return
        await db.system_alerts.insert_one({
            "ts": _now(), "severity": "warning",
            "source": "fraud_detection_daily_email",
            "message": f"{count} alertas críticas de fraude abiertas en las últimas 24h",
            "details": {"count": count}, "resolved_at": None,
        })
        resend_key = os.environ.get("RESEND_API_KEY")
        alert_email = os.environ.get("ALERT_EMAIL", "admin@desarrollosmx.io")
        if not resend_key:
            return
        import httpx
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {resend_key}"},
                json={
                    "from": "DMX Fraud <no-reply@desarrollosmx.io>",
                    "to": [alert_email],
                    "subject": f"[DMX] {count} alertas críticas de fraude · 24h",
                    "text": (
                        f"Hay {count} alertas críticas de fraude abiertas en las últimas 24 horas.\n"
                        "Revísalas en /superadmin/fraud-alerts."
                    ),
                },
            )
    except Exception as e:
        log.warning(f"[fraud] email summary failed: {e}")


def schedule_fraud_detection_cron(scheduler, db) -> None:
    try:
        from cron_heartbeat import wrap_apscheduler_job
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            wrap_apscheduler_job(cron_fraud_detection_daily, "fraud_detection_daily"),
            CronTrigger(hour=3, minute=0, timezone="America/Mexico_City"),
            args=[db], id="fraud_detection_daily",
            replace_existing=True, misfire_grace_time=3600,
        )
    except Exception as e:
        log.warning(f"[fraud] schedule cron failed: {e}")


# ─── Resolution actions ───────────────────────────────────────────────────────

async def resolve_alert(db, alert_id: str, user, note: str = "") -> Optional[Dict[str, Any]]:
    from pymongo import ReturnDocument
    res = await db.fraud_alerts.find_one_and_update(
        {"id": alert_id},
        {"$set": {
            "status": "resolved",
            "resolved_by": getattr(user, "user_id", None),
            "resolved_at": _iso(),
            "resolution_note": (note or "")[:500],
        }},
        return_document=ReturnDocument.AFTER,
    )
    if res:
        res.pop("_id", None); res.pop("detected_at_dt", None)
    return res


async def dismiss_alert(db, alert_id: str, user, reason: str = "") -> Optional[Dict[str, Any]]:
    from pymongo import ReturnDocument
    res = await db.fraud_alerts.find_one_and_update(
        {"id": alert_id},
        {"$set": {
            "status": "dismissed",
            "resolved_by": getattr(user, "user_id", None),
            "resolved_at": _iso(),
            "resolution_note": (reason or "")[:500],
        }},
        return_document=ReturnDocument.AFTER,
    )
    if res:
        res.pop("_id", None); res.pop("detected_at_dt", None)
    return res


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    try:
        await db.fraud_alerts.create_index(
            [("status", 1), ("severity", -1), ("detected_at_dt", -1)],
            name="fraud_status_sev_ts",
        )
        await db.fraud_alerts.create_index([("zone_id", 1)], name="fraud_zone")
        await db.fraud_alerts.create_index("id", unique=True, name="fraud_id_unique")
    except Exception as e:
        log.warning(f"[fraud] ensure_indexes failed: {e}")
