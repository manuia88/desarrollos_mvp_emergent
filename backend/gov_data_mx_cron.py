"""W6.MOV.2 — Gov Data MX Cron · Track B parsers.

2 cron jobs:
  1. cron_gov_data_pull_weekly   @ domingos 04:00 UTC (paralelo asyncio.gather 6 sources)
  2. cron_gov_data_pull_monthly  @ día 1 mes 05:00 UTC (SEP · INEGI Censo · IMSS · CNBV · ENVIPE · Atlas Riesgo CDMX)

6 parsers idempotentes:
  - SEP Estadística 911       · CSV ZIP descarga
  - INEGI Censo ITER          · datasets grandes · chunked
  - IMSS asegurados           · CSV mensual
  - CNBV Portafolio bancos    · Excel
  - ENVIPE seguridad          · CSV
  - Atlas Riesgo CDMX         · GeoJSON

Persiste raw_data hash en gov_data_mx_raw collection · audit log per run.
Stub-aware: si URLs cambian o no se llega → status="error" graceful.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

import httpx
from apscheduler.triggers.cron import CronTrigger

log = logging.getLogger("dmx.gov_data_mx_cron")

DEFAULT_TIMEOUT_S = 45
USER_AGENT = "DesarrollosMX-Bot/1.0 (+https://desarrollosmx.io)"

# Parser IDs (canonical · used in gov_data_mx_raw collection)
PARSER_SEP_911 = "sep_estadistica_911"
PARSER_INEGI_ITER = "inegi_censo_iter"
PARSER_IMSS_ASEGURADOS = "imss_asegurados"
PARSER_CNBV_PORTAFOLIO = "cnbv_portafolio_bancos"
PARSER_ENVIPE = "envipe_seguridad"
PARSER_ATLAS_CDMX = "atlas_riesgo_cdmx"

# Landing pages (HTML scrape · seguro · no descarga binarios grandes en cron init)
PARSER_URLS = {
    PARSER_SEP_911:         "https://www.planeacion.sep.gob.mx/principalescifras/",
    PARSER_INEGI_ITER:      "https://www.inegi.org.mx/programas/ccpv/2020/#datos_abiertos",
    PARSER_IMSS_ASEGURADOS: "http://datos.imss.gob.mx/dataset/asegurados",
    PARSER_CNBV_PORTAFOLIO: "https://www.cnbv.gob.mx/SECTORES-SUPERVISADOS/BANCA-MULTIPLE/Paginas/Informacion-Estadistica.aspx",
    PARSER_ENVIPE:          "https://www.inegi.org.mx/programas/envipe/2024/",
    PARSER_ATLAS_CDMX:      "https://datos.cdmx.gob.mx/dataset/atlas-de-riesgo",
}

WEEKLY_PARSERS = [PARSER_SEP_911, PARSER_ATLAS_CDMX, PARSER_ENVIPE]
MONTHLY_PARSERS = [PARSER_INEGI_ITER, PARSER_IMSS_ASEGURADOS, PARSER_CNBV_PORTAFOLIO]
ALL_PARSERS = list(PARSER_URLS.keys())


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


def _period_label(parser_id: str) -> str:
    """Idempotency key per parser · weekly=ISO week · monthly=YYYY-MM."""
    n = _now()
    if parser_id in MONTHLY_PARSERS:
        return n.strftime("%Y-%m")
    return n.strftime("%Y-W%V")


def _hash_bytes(b: bytes) -> str:
    return hashlib.sha256(b or b"").hexdigest()


async def _audit_run(db, parser_id: str, summary: Dict[str, Any]) -> None:
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "system", "role": "system"},
            action="gov_data_mx_cron_run",
            entity_type="gov_data_mx_parser",
            entity_id=parser_id,
            before=None,
            after=summary,
        )
    except Exception:
        pass


async def _fetch_and_persist(db, parser_id: str) -> Dict[str, Any]:
    """Fetch landing/CSV URL · persist raw_hash + snippet en gov_data_mx_raw.

    Idempotente: si (parser_id, period) ya existe, skip.
    """
    url = PARSER_URLS.get(parser_id)
    if not url:
        return {"parser_id": parser_id, "status": "error", "error": "unknown parser"}

    period = _period_label(parser_id)
    try:
        existing = await db.gov_data_mx_raw.find_one(
            {"parser_id": parser_id, "period": period}, {"_id": 0, "raw_hash": 1}
        )
        if existing:
            return {"parser_id": parser_id, "period": period, "status": "skipped",
                    "reason": "already_ingested"}
    except Exception as exc:
        log.warning(f"[gov_data_mx_cron] idem check failed {parser_id}: {exc}")

    headers = {"User-Agent": USER_AGENT}
    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_S, follow_redirects=True) as client:
            r = await client.get(url, headers=headers)
        http_status = r.status_code
        if http_status != 200:
            return {"parser_id": parser_id, "period": period, "status": "error",
                    "http_status": http_status, "error": f"HTTP {http_status}"}
        # Cap content para evitar memoria · primeros 256KB
        raw = (r.content or b"")[:262144]
        raw_hash = _hash_bytes(raw)
        snippet = ""
        try:
            snippet = (r.text or "")[:1024]
        except Exception:
            snippet = ""

        doc = {
            "parser_id": parser_id,
            "period": period,
            "raw_hash": raw_hash,
            "snippet": snippet,
            "byte_count": len(raw),
            "http_status": http_status,
            "url": url,
            "ingested_at": _iso(),
        }
        try:
            await db.gov_data_mx_raw.insert_one(doc)
        except Exception as exc:
            log.warning(f"[gov_data_mx_cron] insert failed {parser_id}: {exc}")
            return {"parser_id": parser_id, "period": period, "status": "error",
                    "error": str(exc)}
        return {"parser_id": parser_id, "period": period, "status": "ok",
                "byte_count": len(raw), "raw_hash": raw_hash}
    except Exception as exc:
        log.warning(f"[gov_data_mx_cron] fetch failed {parser_id}: {exc}")
        return {"parser_id": parser_id, "period": period, "status": "error", "error": str(exc)}


async def _run_parser_batch(db, parser_ids: List[str], job_label: str) -> Dict[str, Any]:
    """Run multiple parsers in parallel · summary."""
    start = _now()
    coros = [_fetch_and_persist(db, pid) for pid in parser_ids]
    results = await asyncio.gather(*coros, return_exceptions=True)
    summary: Dict[str, Any] = {
        "job": job_label,
        "total": len(parser_ids),
        "ok": 0, "error": 0, "skipped": 0,
        "duration_s": 0.0,
        "results": [],
    }
    for pid, r in zip(parser_ids, results):
        if isinstance(r, Exception):
            rec = {"parser_id": pid, "status": "error", "error": str(r)}
        else:
            rec = r or {"parser_id": pid, "status": "error", "error": "no response"}
        status = rec.get("status") or "error"
        if status in summary:
            summary[status] += 1
        summary["results"].append(rec)
    summary["duration_s"] = round((_now() - start).total_seconds(), 2)
    log.info(f"[gov_data_mx_cron:{job_label}] {summary['ok']}/{summary['total']} ok")
    await _audit_run(db, job_label, {k: v for k, v in summary.items() if k != "results"})
    return summary


async def cron_gov_data_pull_weekly(db) -> Dict[str, Any]:
    return await _run_parser_batch(db, WEEKLY_PARSERS, "weekly")


async def cron_gov_data_pull_monthly(db) -> Dict[str, Any]:
    return await _run_parser_batch(db, MONTHLY_PARSERS, "monthly")


async def get_cron_status(db) -> Dict[str, Any]:
    """Track B status · last run per parser."""
    out: Dict[str, Any] = {"parsers": [], "total": len(ALL_PARSERS)}
    for pid in ALL_PARSERS:
        try:
            last = await db.gov_data_mx_raw.find_one(
                {"parser_id": pid}, sort=[("ingested_at", -1)],
                projection={"_id": 0, "period": 1, "ingested_at": 1, "byte_count": 1,
                            "http_status": 1, "raw_hash": 1},
            )
        except Exception as exc:
            log.warning(f"[gov_data_mx_cron] status lookup failed {pid}: {exc}")
            last = None
        out["parsers"].append({
            "parser_id": pid,
            "schedule": "weekly" if pid in WEEKLY_PARSERS else "monthly",
            "last_period": (last or {}).get("period"),
            "last_ingested_at": (last or {}).get("ingested_at"),
            "last_byte_count": (last or {}).get("byte_count"),
            "last_http_status": (last or {}).get("http_status"),
        })
    return out


def register_gov_data_mx_jobs(scheduler, db) -> None:
    """Register both cron jobs."""
    scheduler.add_job(
        cron_gov_data_pull_weekly,
        CronTrigger(day_of_week="sun", hour=4, minute=0, timezone="UTC"),
        id="gov_data_mx_weekly_cron",
        replace_existing=True,
        max_instances=1,
        kwargs={"db": db},
    )
    scheduler.add_job(
        cron_gov_data_pull_monthly,
        CronTrigger(day=1, hour=5, minute=0, timezone="UTC"),
        id="gov_data_mx_monthly_cron",
        replace_existing=True,
        max_instances=1,
        kwargs={"db": db},
    )
    log.info(
        "[gov_data_mx_cron] Jobs registrados: weekly @ dom 04:00 UTC · "
        "monthly @ día 1 05:00 UTC"
    )
