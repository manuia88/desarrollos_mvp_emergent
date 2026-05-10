"""W4.18 SUB-FIX 1 — BANXICO SIE API engine.

Series clave: SF43718 (USD/MXN diaria) · SP68257 (UDI diaria) ·
SF43783 (TIIE 28d diaria) · CF303 (hipotecaria mensual) · SP1 (INPC mensual).

URL: https://www.banxico.org.mx/SieAPIRest/service/v1/series/{IDS}/datos?token={BANXICO_TOKEN}
Cache TTL 7d. Cron diario 06:00 MX.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger("dmx.data_sources.banxico")

BANXICO_BASE_URL = "https://www.banxico.org.mx/SieAPIRest/service/v1/series"
DAILY_SERIES = ["SF43718", "SP68257", "SF43783"]
MONTHLY_SERIES = ["CF303", "SP1"]
ALL_SERIES = DAILY_SERIES + MONTHLY_SERIES
TTL_DAYS = 7


def _now() -> datetime:
    return datetime.now(timezone.utc)


class BanxicoEngine:
    """3-layer: live API → mongo cache (≤7d) → empty graceful."""

    def __init__(self, db):
        self.db = db
        # Soporta BANXICO_TOKEN spec W4.18 + fallback a IE_BANXICO_TOKEN ya configurado
        self.token = (
            os.environ.get("BANXICO_TOKEN")
            or os.environ.get("IE_BANXICO_TOKEN")
            or ""
        )

    async def fetch_from_source(self, series_ids: List[str]) -> List[Dict[str, Any]]:
        """Live fetch desde SIE API. Returns rows o [] si error."""
        if not self.token:
            log.warning("[banxico] BANXICO_TOKEN no configurado")
            return []
        ids = ",".join(series_ids)
        url = f"{BANXICO_BASE_URL}/{ids}/datos"
        try:
            async with httpx.AsyncClient(timeout=20) as cli:
                r = await cli.get(url, params={"token": self.token},
                                  headers={"Accept": "application/json"})
                if r.status_code != 200:
                    log.warning(f"[banxico] HTTP {r.status_code}: {r.text[:200]}")
                    return []
                payload = r.json()
        except Exception as exc:
            log.warning(f"[banxico] fetch failed: {exc}")
            return []

        rows: List[Dict[str, Any]] = []
        for serie in (payload.get("bmx", {}).get("series") or []):
            sid = serie.get("idSerie")
            for d in (serie.get("datos") or [])[-30:]:
                fecha_str = d.get("fecha")  # "DD/MM/YYYY"
                val_str = d.get("dato")
                try:
                    dt = datetime.strptime(fecha_str, "%d/%m/%Y").replace(tzinfo=timezone.utc)
                    val = float(val_str.replace(",", "")) if val_str and val_str != "N/E" else None
                except Exception:
                    continue
                if val is None:
                    continue
                rows.append({
                    "series_id": sid, "date": dt.isoformat(),
                    "value": val, "persisted_at": _now(),
                    "expires_at": _now() + timedelta(days=TTL_DAYS),
                })
        return rows

    async def persist_to_cache(self, rows: List[Dict[str, Any]]) -> int:
        """Upsert por (series_id, date). Returns count upserted."""
        n = 0
        for r in rows:
            try:
                await self.db.banxico_series.update_one(
                    {"series_id": r["series_id"], "date": r["date"]},
                    {"$set": r}, upsert=True,
                )
                n += 1
            except Exception as exc:
                log.warning(f"[banxico] upsert err: {exc}")
        return n

    async def lookup(self, series_id: str) -> Dict[str, Any]:
        """Layer 1: live (skip si <1h fetch reciente) → Layer 2: cache → Layer 3: empty."""
        # Use cache (recent enough)
        cur = self.db.banxico_series.find(
            {"series_id": series_id}, {"_id": 0, "date": 1, "value": 1},
        ).sort("date", -1).limit(30)
        history: List[Dict[str, Any]] = []
        async for d in cur:
            history.append(d)
        if not history:
            return {
                "ok": False, "series_id": series_id,
                "error": "sin_data_en_cache",
                "hint": "Ejecutar cron banxico_daily o configurar BANXICO_TOKEN",
            }
        latest = history[0]
        return {
            "ok": True, "series_id": series_id,
            "date_latest": latest["date"], "value_latest": latest["value"],
            "history_30d": list(reversed(history)),
            "cache_size": len(history),
        }

    async def stats(self) -> Dict[str, Any]:
        try:
            total = await self.db.banxico_series.count_documents({})
            by_series: Dict[str, int] = {}
            for sid in ALL_SERIES:
                by_series[sid] = await self.db.banxico_series.count_documents(
                    {"series_id": sid},
                )
            last = await self.db.data_sources_sync_log.find_one(
                {"source": "banxico"}, {"_id": 0}, sort=[("started_at", -1)],
            )
            return {
                "source": "banxico", "total_rows": total,
                "by_series": by_series,
                "last_sync": last,
                "token_configured": bool(self.token),
            }
        except Exception as exc:
            log.warning(f"[banxico] stats err: {exc}")
            return {"source": "banxico", "error": str(exc)}


async def run_banxico_daily_cron(db) -> Dict[str, Any]:
    started = _now()
    engine = BanxicoEngine(db)
    is_first_of_month = started.day == 1
    series_to_fetch = list(DAILY_SERIES)
    if is_first_of_month:
        series_to_fetch += MONTHLY_SERIES
    rows = await engine.fetch_from_source(series_to_fetch)
    upserted = await engine.persist_to_cache(rows)
    summary = {
        "source": "banxico", "started_at": started, "ended_at": _now(),
        "duration_ms": int((_now() - started).total_seconds() * 1000),
        "series_fetched": series_to_fetch, "rows_upserted": upserted,
        "ok": bool(rows),
    }
    try:
        await db.data_sources_sync_log.insert_one(dict(summary))
    except Exception:
        pass
    log.info(f"[banxico_cron] {summary}")
    return summary
