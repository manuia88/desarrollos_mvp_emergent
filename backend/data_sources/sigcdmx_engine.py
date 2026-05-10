"""W4.18 SUB-FIX 2 — SIGCDMX Uso de Suelo engine.

16 alcaldías CDMX. CSV oficial vía catalogov2.sig.cdmx.gob.mx.
Cache TTL ilimitada (data congelada 2021). Cron mensual día 1 04:00 MX.
"""
from __future__ import annotations

import csv
import io
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger("dmx.data_sources.sigcdmx")

ALCALDIAS = [
    "alvaro_obregon", "azcapotzalco", "benito_juarez", "coyoacan",
    "cuajimalpa", "cuauhtemoc", "gustavo_a_madero", "iztacalco",
    "iztapalapa", "magdalena_contreras", "miguel_hidalgo", "milpa_alta",
    "tlahuac", "tlalpan", "venustiano_carranza", "xochimilco",
]

BASE_URL = "https://catalogov2.sig.cdmx.gob.mx/descargas/csv_shapes"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_int(v):
    try:
        s = str(v or "").strip()
        if s.replace(".", "", 1).isdigit():
            return int(float(s))
    except Exception:
        pass
    return None


class SIGCDMXEngine:
    def __init__(self, db):
        self.db = db

    async def fetch_alcaldia(self, alcaldia: str) -> List[Dict[str, Any]]:
        """Live fetch CSV de una alcaldía. Returns parsed rows."""
        url = f"{BASE_URL}/{alcaldia}.csv"
        try:
            async with httpx.AsyncClient(
                timeout=60, follow_redirects=True,
                headers={"User-Agent": "DesarrollosMX/1.0 (data-sources/sigcdmx)"},
            ) as cli:
                r = await cli.get(url)
                if r.status_code != 200:
                    log.warning(f"[sigcdmx] {alcaldia} HTTP {r.status_code}")
                    return []
                content = r.text
        except Exception as exc:
            log.warning(f"[sigcdmx] {alcaldia} fetch err: {exc}")
            return []

        rows: List[Dict[str, Any]] = []
        try:
            reader = csv.DictReader(io.StringIO(content))
            for i, d in enumerate(reader):
                # SIGCDMX schema 2021: alcaldia,calle,no_externo,colonia,codigo_pos,...
                # No tiene cuenta_catastral directo — se sintetiza desde liga_ciudadana o coords
                cuenta = (d.get("cuenta_catastral") or d.get("CUENTA")
                          or d.get("CTA"))
                if not cuenta:
                    liga = d.get("liga_ciuda") or d.get("LIGA_CIUDA") or ""
                    if "cuentaCatastral=" in liga:
                        try:
                            cuenta = liga.split("cuentaCatastral=")[1].split("&")[0]
                        except Exception:
                            pass
                if not cuenta:
                    # Sintetizar id estable: alcaldia + lat + lng
                    lat = d.get("latitud") or d.get("LATITUD")
                    lng = d.get("longitud") or d.get("LONGITUD")
                    if lat and lng:
                        cuenta = f"{alcaldia[:3].upper()}-{str(lat)[:8]}-{str(lng)[:9]}"
                    else:
                        continue
                rows.append({
                    "cuenta_catastral": str(cuenta).strip(),
                    "alcaldia": alcaldia,
                    "uso_suelo_categoria": (
                        d.get("uso_descri") or d.get("uso_suelo")
                        or d.get("USO_SUELO") or d.get("CATEGORIA") or "n/d"
                    ),
                    "densidad_permitida": (
                        d.get("densidad_d") or d.get("densidad")
                        or d.get("DENSIDAD")
                    ),
                    "niveles_max": _to_int(d.get("niveles") or d.get("niveles_max") or d.get("NIVELES")),
                    "raw_metadata": dict(list(d.items())[:18]),
                    "persisted_at": _now(),
                })
                if i >= 50000:  # safety cap
                    break
        except Exception as exc:
            log.warning(f"[sigcdmx] {alcaldia} parse err: {exc}")
        return rows

    async def persist_to_cache(self, rows: List[Dict[str, Any]]) -> int:
        n = 0
        for r in rows:
            try:
                await self.db.sigcdmx_uso_suelo.update_one(
                    {"cuenta_catastral": r["cuenta_catastral"]},
                    {"$set": r}, upsert=True,
                )
                n += 1
            except Exception:
                pass
        return n

    async def lookup(self, cuenta_catastral: str) -> Dict[str, Any]:
        doc = await self.db.sigcdmx_uso_suelo.find_one(
            {"cuenta_catastral": str(cuenta_catastral).strip()},
            {"_id": 0, "alcaldia": 1, "uso_suelo_categoria": 1,
             "densidad_permitida": 1, "niveles_max": 1, "persisted_at": 1},
        )
        if not doc:
            return {
                "ok": False, "cuenta_catastral": cuenta_catastral,
                "error": "no_encontrado_en_cache",
                "hint": "Ejecutar cron sigcdmx_monthly_cron",
            }
        if isinstance(doc.get("persisted_at"), datetime):
            doc["persisted_at"] = doc["persisted_at"].isoformat()
        return {
            "ok": True, "cuenta_catastral": cuenta_catastral,
            "alcaldia": doc.get("alcaldia"),
            "categoria": doc.get("uso_suelo_categoria"),
            "densidad": doc.get("densidad_permitida"),
            "niveles_max": doc.get("niveles_max"),
            "persisted_at": doc.get("persisted_at"),
        }

    async def stats(self) -> Dict[str, Any]:
        total = await self.db.sigcdmx_uso_suelo.count_documents({})
        by_alc: Dict[str, int] = {}
        for a in ALCALDIAS:
            by_alc[a] = await self.db.sigcdmx_uso_suelo.count_documents({"alcaldia": a})
        last = await self.db.data_sources_sync_log.find_one(
            {"source": "sigcdmx"}, {"_id": 0}, sort=[("started_at", -1)],
        )
        return {
            "source": "sigcdmx", "total_rows": total,
            "by_alcaldia": by_alc, "alcaldias_total": len(ALCALDIAS),
            "last_sync": last,
        }


async def run_sigcdmx_monthly_cron(db) -> Dict[str, Any]:
    started = _now()
    engine = SIGCDMXEngine(db)
    total_upserted = 0
    failed: List[str] = []
    for alc in ALCALDIAS:
        rows = await engine.fetch_alcaldia(alc)
        if rows:
            total_upserted += await engine.persist_to_cache(rows)
        else:
            failed.append(alc)
    summary = {
        "source": "sigcdmx", "started_at": started, "ended_at": _now(),
        "duration_ms": int((_now() - started).total_seconds() * 1000),
        "alcaldias_total": len(ALCALDIAS), "alcaldias_failed": failed,
        "rows_upserted": total_upserted, "ok": len(failed) < len(ALCALDIAS),
    }
    try:
        await db.data_sources_sync_log.insert_one(dict(summary))
    except Exception:
        pass
    log.info(f"[sigcdmx_cron] {summary}")
    return summary
