"""W3.4B — Perception Risk Engine (ENVIPE INEGI).

Source: INEGI ENVIPE (Encuesta Nacional Victimización y Percepción Seguridad
Pública). Indicador 6207067968 (% percepción inseguridad municipal).

Schema db.perception_risk_data:
  { alcaldia, year, perception_inseguridad_pct, sample_size, computed_at }
  unique (alcaldia, year)
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.perception_risk_engine")

INEGI_TOKEN = os.environ.get("IE_INEGI_TOKEN")
INEGI_INDICATOR_PERCEPTION = "6207067968"

# CDMX alcaldías → INEGI municipio code
ALCALDIA_INEGI_CODE = {
    "alvaro_obregon": "09010",
    "azcapotzalco": "09002",
    "benito_juarez": "09014",
    "coyoacan": "09003",
    "cuajimalpa": "09004",
    "cuauhtemoc": "09015",
    "gustavo_a_madero": "09005",
    "iztacalco": "09006",
    "iztapalapa": "09007",
    "magdalena_contreras": "09008",
    "miguel_hidalgo": "09016",
    "milpa_alta": "09009",
    "tlahuac": "09011",
    "tlalpan": "09012",
    "venustiano_carranza": "09017",
    "xochimilco": "09013",
}


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slug_alcaldia(name: str) -> str:
    return (name or "").lower().replace(" ", "_").replace("-", "_")


# ─── Fetch from INEGI ─────────────────────────────────────────────────────────

async def fetch_envipe_perception(db, year: int = 2024) -> Dict[str, Any]:
    """Best-effort INEGI ENVIPE fetch per alcaldía. NO new cron — called from
    SESNSP monthly cron (W3.4A)."""
    if not INEGI_TOKEN:
        return {"ok": False, "reason": "inegi_token_missing"}

    inserted = 0
    failed = 0
    try:
        import httpx
        async with httpx.AsyncClient(timeout=20) as client:
            for alc_slug, muni_code in ALCALDIA_INEGI_CODE.items():
                try:
                    url = (
                        f"https://www.inegi.org.mx/app/api/indicadores/desarrolladores/"
                        f"jsonxml/INDICATOR/{INEGI_INDICATOR_PERCEPTION}/es/"
                        f"070000{muni_code}/false/BISE/2.0/{INEGI_TOKEN}?type=json"
                    )
                    r = await client.get(url)
                    if r.status_code != 200:
                        failed += 1; continue
                    data = r.json()
                    series = (data.get("Series") or [])
                    if not series:
                        failed += 1; continue
                    obs = (series[0].get("OBSERVATIONS") or [])
                    target_obs = next(
                        (o for o in obs if str(o.get("TIME_PERIOD", "")).startswith(str(year))),
                        obs[0] if obs else None,
                    )
                    if not target_obs:
                        failed += 1; continue
                    pct = float(target_obs.get("OBS_VALUE") or 0)
                    await db.perception_risk_data.update_one(
                        {"alcaldia": alc_slug, "year": year},
                        {"$set": {
                            "alcaldia": alc_slug, "year": year,
                            "perception_inseguridad_pct": pct,
                            "sample_size": None,
                            "computed_at": _iso(),
                        }},
                        upsert=True,
                    )
                    inserted += 1
                except Exception:
                    failed += 1
    except Exception as e:
        return {"ok": False, "reason": "fetch_error", "error": str(e)[:200]}

    return {"ok": True, "inserted": inserted, "failed": failed, "year": year}


async def upsert_perception(
    db, alcaldia: str, year: int, perception_pct: float,
) -> Dict[str, Any]:
    """Operator helper: manual upsert (when API blocked)."""
    doc = {
        "alcaldia": _slug_alcaldia(alcaldia),
        "year": year,
        "perception_inseguridad_pct": float(perception_pct),
        "sample_size": None,
        "computed_at": _iso(),
    }
    await db.perception_risk_data.update_one(
        {"alcaldia": doc["alcaldia"], "year": year},
        {"$set": doc}, upsert=True,
    )
    return doc


# ─── Compute per zone ─────────────────────────────────────────────────────────

async def compute_perception_risk_zone(db, zone_id: str) -> Dict[str, Any]:
    """Map zone → alcaldía → ENVIPE %. Returns honest stub when no data.
    Score: inverted (more perception of insecurity → more risk → lower score)."""
    z = await db.dim_zones.find_one(
        {"zone_id": zone_id}, {"_id": 0, "tier": 1, "parent_zone_id": 1},
    )
    if not z:
        return {"available": False, "reason": "zone_unknown"}
    alc = z["zone_id"] if z.get("tier") == "alcaldia" else (z.get("parent_zone_id") or zone_id)
    alc_slug = _slug_alcaldia(alc.replace("-", "_"))

    cursor = db.perception_risk_data.find(
        {"alcaldia": alc_slug}, {"_id": 0},
    ).sort("year", -1).limit(1)
    rows = [r async for r in cursor]
    if not rows:
        return {"available": False, "reason": "no_envipe_data", "alcaldia": alc_slug}

    pct = rows[0].get("perception_inseguridad_pct") or 0
    # Higher pct = more insecure perceived → higher RISK; we return risk 0-100
    risk = round(min(100.0, max(0.0, pct)), 1)
    return {
        "available": True,
        "zone_id": zone_id,
        "alcaldia": alc_slug,
        "perception_pct": pct,
        "perception_risk_score": risk,
        "year": rows[0].get("year"),
        "sources": ["envipe_inegi"],
    }


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    try:
        await db.perception_risk_data.create_index(
            [("alcaldia", 1), ("year", -1)],
            unique=True, name="perception_alc_year_unique",
        )
    except Exception as e:
        log.warning(f"[envipe] ensure_indexes failed: {e}")
