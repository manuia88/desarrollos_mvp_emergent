"""W3.4A — Crime Data Engine (SESNSP integration).

Source: https://www.gob.mx/sesnsp · CSV mensual gratuito · Incidencia Delictiva
Fuero Común Nueva Metodología.

Schema db.crime_data_sesnsp:
  { municipio, year_month, category, incidents_count, ingested_at }
  unique (municipio, year_month, category)

Crime categories filtered to those relevant for residential risk:
  - robo_casa_habitacion
  - robo_a_transeunte
  - homicidio_doloso
  - secuestro
  - extorsion
  - violencia_familiar
"""
from __future__ import annotations

import csv
import io
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.crime_data_engine")

SESNSP_URL_TEMPLATE = (
    "https://drive.google.com/uc?export=download&id="
    "1fxiQuV9-ej7eYXwqBkcS5L7KZlyP3IVf"  # placeholder — will fail gracefully
)

RELEVANT_CATEGORIES_RAW = {
    "robo a casa habitación", "robo a casa habitacion",
    "robo a transeúnte en vía pública", "robo a transeunte en via publica",
    "robo a transeúnte", "robo a transeunte",
    "homicidio doloso",
    "secuestro",
    "extorsión", "extorsion",
    "violencia familiar",
}

# Normalize raw → canonical category id used downstream.
def _canon(label: str) -> Optional[str]:
    s = (label or "").strip().lower()
    if not s:
        return None
    if "casa habitaci" in s and "robo" in s:
        return "robo_casa_habitacion"
    if "transeúnte" in s or "transeunte" in s:
        return "robo_a_transeunte"
    if "homicidio doloso" in s:
        return "homicidio_doloso"
    if "secuestro" == s or s.startswith("secuestro"):
        return "secuestro"
    if "extorsi" in s:
        return "extorsion"
    if "violencia familiar" in s:
        return "violencia_familiar"
    return None


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slug_municipio(name: str) -> str:
    s = (name or "").strip().lower()
    s = (s.replace("á", "a").replace("é", "e").replace("í", "i")
           .replace("ó", "o").replace("ú", "u").replace("ñ", "n"))
    return "".join(c if c.isalnum() else "-" for c in s).strip("-").replace("--", "-")


# ─── CSV parsing ──────────────────────────────────────────────────────────────

MONTH_COLS = ["enero","febrero","marzo","abril","mayo","junio",
              "julio","agosto","septiembre","octubre","noviembre","diciembre"]


async def parse_sesnsp_csv(db, csv_bytes: bytes, restrict_year: Optional[int] = None) -> Dict[str, Any]:
    """Parse SESNSP municipal CSV (state=CDMX) and INSERT canonical rows.
    Returns counters."""
    try:
        text = csv_bytes.decode("utf-8-sig")
    except Exception:
        text = csv_bytes.decode("latin-1", errors="replace")

    reader = csv.DictReader(io.StringIO(text))
    inserted = 0
    skipped = 0

    # CSV columns vary; we try canonical mapping
    # Expected normalized lower keys: año, entidad, municipio, subtipo de delito, mes columns
    for row in reader:
        rl = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items() if k}
        entidad = rl.get("entidad") or rl.get("entidad federativa") or ""
        if "ciudad de m" not in entidad.lower() and "cdmx" not in entidad.lower():
            skipped += 1
            continue

        try:
            year = int(rl.get("año") or rl.get("ano") or rl.get("year") or 0)
        except Exception:
            year = 0
        if restrict_year and year != restrict_year:
            skipped += 1
            continue

        municipio = rl.get("municipio") or rl.get("alcaldía") or rl.get("alcaldia") or ""
        subt = rl.get("subtipo de delito") or rl.get("tipo de delito") or rl.get("modalidad") or ""
        cat = _canon(subt)
        if not cat or not municipio:
            skipped += 1
            continue

        muni_slug = _slug_municipio(municipio)
        for i, mcol in enumerate(MONTH_COLS, start=1):
            v = rl.get(mcol)
            if not v:
                continue
            try:
                count = int(float(v))
            except Exception:
                continue
            ym = f"{year}-{i:02d}"
            try:
                await db.crime_data_sesnsp.update_one(
                    {"municipio": muni_slug, "year_month": ym, "category": cat},
                    {"$set": {
                        "municipio": muni_slug,
                        "year_month": ym,
                        "category": cat,
                        "incidents_count": count,
                        "ingested_at": _iso(),
                    }},
                    upsert=True,
                )
                inserted += 1
            except Exception:
                skipped += 1

    return {"inserted": inserted, "skipped": skipped}


async def fetch_sesnsp_monthly(db, year: int, month: int) -> Dict[str, Any]:
    """Best-effort fetch of monthly SESNSP CSV. Falls back to honest stub if
    network unavailable. Source URL changes monthly; placeholder is set so this
    routine logs what it would do — operator can call `parse_sesnsp_csv` manually."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(SESNSP_URL_TEMPLATE)
            if r.status_code != 200 or "text/csv" not in (r.headers.get("content-type") or ""):
                return {"ok": False, "reason": "csv_unavailable",
                        "status": r.status_code, "year": year, "month": month}
            return await parse_sesnsp_csv(db, r.content, restrict_year=year)
    except Exception as e:
        log.warning(f"[sesnsp] fetch failed: {e}")
        return {"ok": False, "reason": "fetch_error", "error": str(e)[:200]}


# ─── Aggregation per zone ─────────────────────────────────────────────────────

async def aggregate_crime_zone(
    db, zone_id: str, period_months: int = 6,
) -> Dict[str, Any]:
    """Sum incidents per category last N months for the alcaldía (or alcaldia
    parent of a colonia) + normalize per 100K hab."""
    # Resolve alcaldia from dim_zones
    z = await db.dim_zones.find_one(
        {"zone_id": zone_id}, {"_id": 0, "tier": 1, "parent_zone_id": 1, "population_2020": 1},
    )
    if not z:
        return {"available": False, "reason": "zone_unknown", "zone_id": zone_id}

    alc_zid = z["zone_id"] if z.get("tier") == "alcaldia" else (z.get("parent_zone_id") or zone_id)
    population = z.get("population_2020") or 0
    if z.get("tier") != "alcaldia":
        alc = await db.dim_zones.find_one({"zone_id": alc_zid}, {"_id": 0, "population_2020": 1})
        if alc:
            population = alc.get("population_2020") or population

    # Cut-off: most recent year-month minus N months
    now = datetime.now(timezone.utc)
    months_iso: List[str] = []
    y, m = now.year, now.month
    for _ in range(period_months):
        m -= 1
        if m == 0:
            m = 12; y -= 1
        months_iso.append(f"{y}-{m:02d}")

    pipeline = [
        {"$match": {"municipio": alc_zid, "year_month": {"$in": months_iso}}},
        {"$group": {"_id": "$category", "incidents": {"$sum": "$incidents_count"}}},
        {"$project": {"_id": 0, "category": "$_id", "incidents": 1}},
    ]
    rows = [r async for r in db.crime_data_sesnsp.aggregate(pipeline)]
    by_cat = {r["category"]: r["incidents"] for r in rows}
    total = sum(by_cat.values())

    if total == 0:
        return {
            "available": False, "reason": "no_data",
            "zone_id": zone_id, "alcaldia": alc_zid,
            "by_category": by_cat, "period_months": period_months,
            "population": population,
        }

    per_100k = round(total / max(population, 1) * 100000, 2) if population > 0 else None
    return {
        "available": True,
        "zone_id": zone_id,
        "alcaldia": alc_zid,
        "period_months": period_months,
        "total_incidents": total,
        "by_category": by_cat,
        "population": population,
        "incidents_per_100k": per_100k,
    }


# ─── Cron ─────────────────────────────────────────────────────────────────────

async def cron_sesnsp_monthly_ingest(db) -> Dict[str, Any]:
    """Cron: 1ro de mes 08:00 MX. Best-effort fetch SESNSP. NEVER raises so the
    cron heartbeat stays green — failures persisted as system_alerts.
    Also triggers ENVIPE annual perception update (W3.4B, no new cron)."""
    now = datetime.now(timezone.utc)
    # Fetch month is two months back (SESNSP publishes with ~30-60d lag)
    target_month = now.month - 2
    target_year = now.year
    if target_month <= 0:
        target_month += 12; target_year -= 1
    out = await fetch_sesnsp_monthly(db, target_year, target_month)
    if not out.get("ok") and out.get("reason"):
        try:
            await db.system_alerts.insert_one({
                "ts": now, "severity": "warning",
                "source": "sesnsp_monthly_ingest",
                "message": f"SESNSP fetch fallido · {target_year}-{target_month:02d} · {out.get('reason')}",
                "details": out, "resolved_at": None,
            })
        except Exception:
            pass

    # W3.4B — absorb ENVIPE annual update (cheap, runs monthly but data updates yearly)
    try:
        import perception_risk_engine as perception
        perc_out = await perception.fetch_envipe_perception(db, year=now.year)
        out["envipe"] = perc_out
    except Exception as e:
        log.warning(f"[sesnsp cron] envipe absorbed update failed: {e}")
        out["envipe"] = {"ok": False, "error": str(e)[:120]}

    out["target"] = f"{target_year}-{target_month:02d}"
    out["completed_at"] = _iso()
    return out


def schedule_sesnsp_monthly_cron(scheduler, db) -> None:
    try:
        from cron_heartbeat import wrap_apscheduler_job
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            wrap_apscheduler_job(cron_sesnsp_monthly_ingest, "sesnsp_monthly_ingest"),
            CronTrigger(day=1, hour=8, minute=0, timezone="America/Mexico_City"),
            args=[db], id="sesnsp_monthly_ingest",
            replace_existing=True, misfire_grace_time=3600,
        )
    except Exception as e:
        log.warning(f"[sesnsp] schedule cron failed: {e}")


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    try:
        await db.crime_data_sesnsp.create_index(
            [("municipio", 1), ("year_month", 1), ("category", 1)],
            unique=True, name="crime_muni_ym_cat_unique",
        )
        await db.crime_data_sesnsp.create_index(
            [("municipio", 1), ("year_month", -1)], name="crime_muni_ym",
        )
    except Exception as e:
        log.warning(f"[sesnsp] ensure_indexes failed: {e}")
