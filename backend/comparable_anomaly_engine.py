"""W4.1D — Comparable Anomaly Engine.

Detects 3 types of market signals from same-colonia comparable developments:
  A1  PRICE_DROP         — last 2 price_history entries show >5% drop
  A2  SOLD_OUT_VELOCITY  — units_sold/units_total > 85%
  A3  NEW_LAUNCH         — comparable is "preventa" while self is not

Throttle: 1 alert per (dev_id, comparable_id, anomaly_type) per 7 days.
DMX-pure: reads only DEVELOPMENTS_BY_ID embedded data + db.comparable_alerts.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.comparable_anomaly")

_SEV: Dict[str, str] = {
    "PRICE_DROP": "high",
    "SOLD_OUT_VELOCITY": "medium",
    "NEW_LAUNCH": "low",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


@dataclass
class ComparableAlert:
    alert_id: str
    dev_id: str
    comparable_id: str
    comparable_name: str
    anomaly_type: str        # PRICE_DROP | SOLD_OUT_VELOCITY | NEW_LAUNCH
    severity: str            # high | medium | low
    title: str
    message: str
    generated_at: str
    last_fired_at: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


async def _throttle_check(db, dev_id: str, comparable_id: str, anomaly_type: str) -> Optional[str]:
    """Return existing alert_id if fired within last 7 days, else None."""
    cutoff = (_now() - timedelta(days=7)).isoformat()
    doc = await db.comparable_alerts.find_one(
        {
            "dev_id": dev_id,
            "comparable_id": comparable_id,
            "anomaly_type": anomaly_type,
            "last_fired_at": {"$gte": cutoff},
        },
        {"_id": 0, "alert_id": 1},
    )
    return doc["alert_id"] if doc else None


async def _upsert_alert(db, alert: ComparableAlert) -> None:
    """Insert or update-timestamp existing alert."""
    await db.comparable_alerts.update_one(
        {
            "dev_id": alert.dev_id,
            "comparable_id": alert.comparable_id,
            "anomaly_type": alert.anomaly_type,
        },
        {
            "$set": {
                **alert.to_dict(),
                "last_fired_at": _now_iso(),
            }
        },
        upsert=True,
    )


# ─── Anomaly detectors ────────────────────────────────────────────────────────

def _detect_price_drop(dev: Dict, comp: Dict) -> Optional[Dict[str, str]]:
    """A1: last-to-second-to-last price_history shows >5% drop."""
    history = comp.get("price_history", [])
    if len(history) < 2:
        return None
    # Try to use numeric prices from last two entries
    try:
        prices = [float(e["price"]) for e in history if e.get("price") and float(e["price"]) > 0]
    except (TypeError, ValueError):
        return None
    if len(prices) < 2:
        return None
    prev_price, last_price = prices[-2], prices[-1]
    if prev_price <= 0:
        return None
    pct_change = (last_price - prev_price) / prev_price
    if pct_change >= -0.05:
        return None
    drop_pct = abs(pct_change) * 100
    return {
        "title": f"Comparable '{comp['name']}' bajó precio -{drop_pct:.1f}%",
        "message": (
            f"Comparable {comp['name']} registró una caída de -{drop_pct:.1f}% en precio promedio "
            f"(de ${prev_price:,.0f} a ${last_price:,.0f} MXN). "
            "Evalúa ajuste competitivo si tu precio está en percentil alto."
        ),
    }


def _detect_sold_out_velocity(dev: Dict, comp: Dict) -> Optional[Dict[str, str]]:
    """A2: comparable >85% sold."""
    total = comp.get("units_total", 0)
    sold = comp.get("units_sold", 0)
    if not total:
        return None
    ratio = sold / total
    if ratio <= 0.85:
        return None
    pct = ratio * 100
    return {
        "title": f"Comparable '{comp['name']}' cerca de sold-out ({pct:.0f}% vendido)",
        "message": (
            f"Comparable {comp['name']} tiene {pct:.0f}% de su inventario vendido ({sold}/{total} unidades). "
            "Tu inventario no enfrenta presión competitiva directa — oportunidad de mantener precio sin descuento."
        ),
    }


def _detect_new_launch(dev: Dict, comp: Dict) -> Optional[Dict[str, str]]:
    """A3: comparable in preventa while self is not (en_construccion / entrega)."""
    comp_stage = comp.get("stage", "")
    self_stage = dev.get("stage", "")
    if comp_stage != "preventa":
        return None
    if self_stage == "preventa":
        return None  # Both in preventa → not a new threat signal
    return {
        "title": f"Nuevo lanzamiento en preventa: '{comp['name']}'",
        "message": (
            f"Comparable {comp['name']} está en preventa en la misma colonia "
            f"mientras tu desarrollo está en etapa '{self_stage}'. "
            "Tipología similar. Evalúa diferenciador (acabados, amenidades, precio, entrega inmediata)."
        ),
    }


# ─── Main entry ───────────────────────────────────────────────────────────────

async def detect_anomalies_for_dev(db, dev_id: str) -> List[ComparableAlert]:
    """Run A1/A2/A3 detectors for all same-colonia comparables.

    Returns list of ComparableAlert (newly fired + recently throttled).
    """
    from data_developments import DEVELOPMENTS_BY_ID, DEVELOPMENTS

    dev = DEVELOPMENTS_BY_ID.get(dev_id)
    if not dev:
        return []

    colonia_id = dev.get("colonia_id")
    if not colonia_id:
        return []

    comparables = [d for d in DEVELOPMENTS if d.get("colonia_id") == colonia_id and d["id"] != dev_id]
    if not comparables:
        return []

    results: List[ComparableAlert] = []

    _DETECTORS = [
        ("PRICE_DROP",         _detect_price_drop),
        ("SOLD_OUT_VELOCITY",  _detect_sold_out_velocity),
        ("NEW_LAUNCH",         _detect_new_launch),
    ]

    for comp in comparables:
        comp_id = comp["id"]
        comp_name = comp.get("name", comp_id)

        for anomaly_type, detector in _DETECTORS:
            try:
                signal = detector(dev, comp)
            except Exception as e:
                log.warning(f"[comparable_anomaly] detector {anomaly_type} {comp_id}: {e}")
                continue

            if signal is None:
                continue

            now_iso = _now_iso()
            severity = _SEV.get(anomaly_type, "low")

            # Throttle check — skip if fired in last 7d (just return the existing alert)
            existing_id = await _throttle_check(db, dev_id, comp_id, anomaly_type)
            if existing_id:
                # Return existing alert (re-fetch)
                existing = await db.comparable_alerts.find_one(
                    {"alert_id": existing_id}, {"_id": 0}
                )
                if existing:
                    results.append(ComparableAlert(**{
                        k: existing.get(k, "") for k in ComparableAlert.__dataclass_fields__
                    }))
                continue

            alert = ComparableAlert(
                alert_id=str(uuid.uuid4()),
                dev_id=dev_id,
                comparable_id=comp_id,
                comparable_name=comp_name,
                anomaly_type=anomaly_type,
                severity=severity,
                title=signal["title"],
                message=signal["message"],
                generated_at=now_iso,
                last_fired_at=now_iso,
            )
            await _upsert_alert(db, alert)
            results.append(alert)
            log.info(f"[comparable_anomaly] fired {anomaly_type} for {dev_id} ← {comp_id}")

    return results


async def ensure_comparable_alert_indexes(db) -> None:
    await db.comparable_alerts.create_index(
        [("dev_id", 1), ("comparable_id", 1), ("anomaly_type", 1)],
        unique=True, background=True,
    )
    await db.comparable_alerts.create_index(
        [("dev_id", 1), ("severity", -1), ("last_fired_at", -1)],
        background=True,
    )
    await db.comparable_alerts.create_index(
        "last_fired_at", background=True,
    )
