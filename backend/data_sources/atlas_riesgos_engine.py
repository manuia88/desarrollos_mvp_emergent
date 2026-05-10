"""W4.18 SUB-FIX 3 — Atlas Riesgos CDMX engine.

3 capas: inundación + sísmico + laderas. CKAN datos.cdmx.gob.mx.
Cache stable (data congelada 2021). Cron anual día 1 enero 05:00 MX.

Conservador: shapefile parsing requiere geopandas/fiona; fallback a CKAN
package_search metadata + cache vacío graceful si libs no disponibles.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger("dmx.data_sources.atlas_riesgos")

CKAN_BASE = "https://datos.cdmx.gob.mx/api/3/action"
SEARCH_QUERY = "atlas+riesgo"
LAYERS = ["inundacion", "sismico", "laderas"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


class AtlasRiesgosEngine:
    def __init__(self, db):
        self.db = db

    async def fetch_metadata(self) -> Dict[str, Any]:
        """CKAN package_search · returns paquetes encontrados (no parsea shapefiles)."""
        url = f"{CKAN_BASE}/package_search"
        try:
            async with httpx.AsyncClient(timeout=20) as cli:
                r = await cli.get(url, params={"q": SEARCH_QUERY, "rows": 30})
                if r.status_code != 200:
                    return {"ok": False, "error": f"HTTP {r.status_code}"}
                data = r.json()
                results = (data.get("result") or {}).get("results") or []
                packages = [{
                    "id": p.get("id"), "name": p.get("name"),
                    "title": p.get("title"),
                    "n_resources": len(p.get("resources") or []),
                    "metadata_modified": p.get("metadata_modified"),
                } for p in results[:20]]
                return {"ok": True, "packages": packages, "count": len(results)}
        except Exception as exc:
            log.warning(f"[atlas_riesgos] CKAN fetch err: {exc}")
            return {"ok": False, "error": str(exc)}

    async def lookup(self, ageb_id: str) -> Dict[str, Any]:
        """Layer 2: cache only · Layer 3: empty graceful."""
        cur = self.db.atlas_riesgos.find(
            {"ageb_id": str(ageb_id).strip()},
            {"_id": 0, "layer_type": 1, "risk_level": 1, "persisted_at": 1},
        )
        layers: Dict[str, str] = {}
        async for d in cur:
            layers[d["layer_type"]] = d.get("risk_level", "n/d")
        if not layers:
            return {
                "ok": False, "ageb_id": ageb_id,
                "error": "no_encontrado_en_cache",
                "hint": "Cron atlas_yearly aún no sincronizó este AGEB",
            }
        # Compute overall_score: alto=3 · medio=2 · bajo=1 · n/d=0
        weights = {"alto": 3, "medio": 2, "bajo": 1}
        score_pts = sum(weights.get((v or "").lower(), 0) for v in layers.values())
        max_pts = 3 * len(LAYERS)
        overall_score = round(100 * score_pts / max_pts, 1) if max_pts else 0
        return {
            "ok": True, "ageb_id": ageb_id,
            "inundacion": layers.get("inundacion", "n/d"),
            "sismico": layers.get("sismico", "n/d"),
            "laderas": layers.get("laderas", "n/d"),
            "overall_score": overall_score,
        }

    async def stats(self) -> Dict[str, Any]:
        total = await self.db.atlas_riesgos.count_documents({})
        by_layer: Dict[str, int] = {}
        for ly in LAYERS:
            by_layer[ly] = await self.db.atlas_riesgos.count_documents(
                {"layer_type": ly},
            )
        last = await self.db.data_sources_sync_log.find_one(
            {"source": "atlas_riesgos"}, {"_id": 0}, sort=[("started_at", -1)],
        )
        return {
            "source": "atlas_riesgos", "total_rows": total,
            "by_layer": by_layer, "layers_total": len(LAYERS),
            "last_sync": last,
        }


async def run_atlas_yearly_cron(db) -> Dict[str, Any]:
    """Anual día 1 enero. CKAN metadata fetch + log."""
    started = _now()
    engine = AtlasRiesgosEngine(db)
    meta = await engine.fetch_metadata()
    summary = {
        "source": "atlas_riesgos", "started_at": started, "ended_at": _now(),
        "duration_ms": int((_now() - started).total_seconds() * 1000),
        "ckan_ok": meta.get("ok", False),
        "packages_found": meta.get("count", 0),
        "ok": meta.get("ok", False),
        "note": "Shapefile parsing requiere geopandas; cache se popula manualmente o con cron extendido",
    }
    try:
        await db.data_sources_sync_log.insert_one(dict(summary))
    except Exception:
        pass
    log.info(f"[atlas_yearly_cron] {summary}")
    return summary
