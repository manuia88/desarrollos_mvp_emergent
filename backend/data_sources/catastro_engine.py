"""W4.18 SUB-FIX 4 — Catastro CDMX engine.

CKAN package_search informacion-catastral. CSV con schemas heterogéneos por
alcaldía → adaptive parsing con fallback "raw" mode. Cache trimestral 04:30 MX.
"""
from __future__ import annotations

import csv
import io
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger("dmx.data_sources.catastro")

CKAN_BASE = "https://datos.cdmx.gob.mx/api/3/action"
PACKAGE_NAME = "informacion-catastral-de-la-ciudad-de-mexico"

SCHEMA_FIELDS = {
    "cuenta_catastral": ["cuenta_catastral", "CUENTA", "CTA", "no_cuenta"],
    "alcaldia": ["alcaldia", "ALCALDIA", "delegacion", "DELEGACION"],
    "valor_catastral": ["valor_catastral", "VALOR", "valor_unitario", "valor_terreno"],
    "superficie_m2": ["superficie_m2", "SUPERFICIE", "sup_terreno", "AREA"],
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _adaptive_field(d: Dict[str, Any], canonical: str) -> Optional[Any]:
    for k in SCHEMA_FIELDS.get(canonical, []):
        if k in d and d[k] not in ("", None):
            return d[k]
    return None


class CatastroEngine:
    def __init__(self, db):
        self.db = db

    async def fetch_package(self) -> Dict[str, Any]:
        """CKAN package_show · returns metadata + resources URLs."""
        url = f"{CKAN_BASE}/package_show"
        try:
            async with httpx.AsyncClient(timeout=20) as cli:
                r = await cli.get(url, params={"id": PACKAGE_NAME})
                if r.status_code != 200:
                    return {"ok": False, "error": f"HTTP {r.status_code}"}
                data = r.json().get("result") or {}
                resources = [{
                    "id": res.get("id"), "name": res.get("name"),
                    "format": res.get("format"), "url": res.get("url"),
                } for res in (data.get("resources") or [])]
                return {"ok": True, "package": data.get("name"),
                        "title": data.get("title"),
                        "n_resources": len(resources),
                        "resources": resources[:30]}
        except Exception as exc:
            log.warning(f"[catastro] package_show err: {exc}")
            return {"ok": False, "error": str(exc)}

    async def fetch_resource_csv(self, url: str) -> List[Dict[str, Any]]:
        """Download CSV recurso + parse adaptive."""
        try:
            async with httpx.AsyncClient(timeout=60, follow_redirects=True) as cli:
                r = await cli.get(url)
                if r.status_code != 200:
                    log.warning(f"[catastro] CSV {url} HTTP {r.status_code}")
                    return []
                content = r.text
        except Exception as exc:
            log.warning(f"[catastro] resource fetch err: {exc}")
            return []

        rows: List[Dict[str, Any]] = []
        try:
            reader = csv.DictReader(io.StringIO(content))
            for d in reader:
                cuenta = _adaptive_field(d, "cuenta_catastral")
                if not cuenta:
                    continue
                rows.append({
                    "cuenta_catastral": str(cuenta).strip(),
                    "alcaldia": str(_adaptive_field(d, "alcaldia") or "n/d"),
                    "valor_catastral": _to_float(_adaptive_field(d, "valor_catastral")),
                    "superficie_m2": _to_float(_adaptive_field(d, "superficie_m2")),
                    "raw_metadata": dict(list(d.items())[:15]),
                    "persisted_at": _now(),
                })
        except Exception as exc:
            log.warning(f"[catastro] parse err: {exc}")
        return rows

    async def persist_to_cache(self, rows: List[Dict[str, Any]]) -> int:
        n = 0
        for r in rows[:20000]:  # safety cap
            try:
                await self.db.catastro_cdmx.update_one(
                    {"cuenta_catastral": r["cuenta_catastral"]},
                    {"$set": r}, upsert=True,
                )
                n += 1
            except Exception:
                pass
        return n

    async def lookup(self, cuenta_catastral: str) -> Dict[str, Any]:
        doc = await self.db.catastro_cdmx.find_one(
            {"cuenta_catastral": str(cuenta_catastral).strip()},
            {"_id": 0, "alcaldia": 1, "valor_catastral": 1, "superficie_m2": 1,
             "persisted_at": 1},
        )
        if not doc:
            return {"ok": False, "cuenta_catastral": cuenta_catastral,
                    "error": "no_encontrado_en_cache",
                    "hint": "Ejecutar cron catastro_quarterly_cron"}
        if isinstance(doc.get("persisted_at"), datetime):
            doc["persisted_at"] = doc["persisted_at"].isoformat()
        return {
            "ok": True, "cuenta_catastral": cuenta_catastral,
            "valor_catastral": doc.get("valor_catastral"),
            "superficie_m2": doc.get("superficie_m2"),
            "alcaldia": doc.get("alcaldia"),
            "persisted_at": doc.get("persisted_at"),
        }

    async def stats(self) -> Dict[str, Any]:
        total = await self.db.catastro_cdmx.count_documents({})
        last = await self.db.data_sources_sync_log.find_one(
            {"source": "catastro"}, {"_id": 0}, sort=[("started_at", -1)],
        )
        return {"source": "catastro", "total_rows": total, "last_sync": last}


def _to_float(v) -> Optional[float]:
    if v in (None, "", "n/d"):
        return None
    try:
        return float(str(v).replace(",", "").replace("$", "").strip())
    except Exception:
        return None


async def run_catastro_quarterly_cron(db) -> Dict[str, Any]:
    """Trimestral 04:30 MX. Fetch CKAN metadata + sample first CSV resource."""
    started = _now()
    engine = CatastroEngine(db)
    pkg = await engine.fetch_package()
    upserted = 0
    failed = []
    if pkg.get("ok"):
        # Process up to 16 CSV resources (alcaldías)
        csv_resources = [r for r in pkg.get("resources") or []
                         if (r.get("format") or "").upper() == "CSV"][:16]
        for res in csv_resources:
            url = res.get("url")
            if not url:
                continue
            rows = await engine.fetch_resource_csv(url)
            if rows:
                upserted += await engine.persist_to_cache(rows)
            else:
                failed.append(res.get("name"))
    summary = {
        "source": "catastro", "started_at": started, "ended_at": _now(),
        "duration_ms": int((_now() - started).total_seconds() * 1000),
        "ckan_ok": pkg.get("ok", False),
        "rows_upserted": upserted, "resources_failed": failed[:20],
        "ok": pkg.get("ok", False),
    }
    try:
        await db.data_sources_sync_log.insert_one(dict(summary))
    except Exception:
        pass
    log.info(f"[catastro_cron] {summary}")
    return summary
