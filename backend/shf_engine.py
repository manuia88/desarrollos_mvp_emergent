"""
shf_engine — Índice SHF de Precios de la Vivienda (plusvalía OFICIAL · ING.3).
═══════════════════════════════════════════════════════════════════════════════
Hallazgo (reporte founder 2026-06-07): el índice SHF NO existe como serie en el SIE de Banxico
(cualquier ID de serie es inventado). Solo se publica como XLSX de datos abiertos en gob.mx
(trimestral · feb/may/ago/nov). Es la plusvalía/apreciación OFICIAL por región, nueva vs usada.

Estrategia honesta (cero deuda · build for endstate):
  · SEED con los valores OFICIALES verificados 1T2026 del reporte (citados, con fecha y fuente).
  · `refresh_from_xlsx`: baja el XLSX y, si es alcanzable, refresca; si no, conserva el seed
    (no inventa). El parser fino del XLSX se cierra cuando se vea su estructura real (prod).
  · `get_appreciation(region)`: la apreciación anual oficial → ancla de plusvalía del modelo.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.shf_engine")

# Valores OFICIALES verificados (Índice SHF de Precios de la Vivienda · 1T2026 · gob.mx).
# Fuente: reporte de adquisición de datos DMX 07/06/2026 (descarga confirmada).
SHF_SEED: Dict[str, Any] = {
    "periodo": "2026-T1",
    "fuente": "Índice SHF de Precios de la Vivienda (datos abiertos · gob.mx)",
    "nacional_anual_pct": 8.7,
    "nueva_anual_pct": 9.1,
    "usada_anual_pct": 8.3,
    "avaluo_promedio": 2024337,
    "avaluo_mediana": 1331000,
    # apreciación anual por región (Valle de México = zona metropolitana de CDMX)
    "regiones": {"Valle de México": 5.1},
    "url_xlsx": "https://www.gob.mx/cms/uploads/attachment/file/1077618/Indice_SHF_datos_abiertos_1_trim_2026.xlsx",
}

_DEFAULT_REGION = "Valle de México"   # CDMX


async def ensure_shf(db) -> Dict[str, Any]:
    """Garantiza que el índice SHF esté en `shf_index` (siembra los valores oficiales si falta)."""
    try:
        doc = await db.shf_index.find_one({"_id": "current"}, {"_id": 0})
        if doc:
            return doc
        doc = {**SHF_SEED, "source": "seed_oficial", "updated_at": _iso()}
        await db.shf_index.update_one({"_id": "current"}, {"$set": doc}, upsert=True)
        return doc
    except Exception as e:
        log.warning(f"[shf] ensure: {e}")
        return dict(SHF_SEED)


async def get_appreciation(db, region: str = _DEFAULT_REGION) -> Dict[str, Any]:
    """Apreciación anual OFICIAL (%) de la región — ancla de plusvalía. CDMX = Valle de México."""
    doc = await ensure_shf(db)
    regiones = doc.get("regiones") or {}
    pct = regiones.get(region)
    if pct is None:
        pct = doc.get("nacional_anual_pct")
        region = "Nacional"
    return {
        "region": region, "plusvalia_anual_pct": pct, "periodo": doc.get("periodo"),
        "fuente": doc.get("fuente"), "es_oficial": True,
    }


async def refresh_from_xlsx(db, url: Optional[str] = None) -> Dict[str, Any]:
    """Baja el XLSX de SHF y refresca el índice. Honesto: si no es alcanzable (CDN bloqueado /
    sin red), conserva el seed oficial y lo reporta. El parser fino se finaliza al ver el XLSX real."""
    url = url or os.environ.get("IE_SHF_XLSX_URL") or SHF_SEED["url_xlsx"]
    try:
        import httpx
        async with httpx.AsyncClient(timeout=40, follow_redirects=True) as c:
            r = await c.get(url, headers={"User-Agent": "Mozilla/5.0 (DMX)"})
        data = r.content
        # Un XLSX válido empieza con 'PK' (zip) y pesa decenas de KB; <10KB = HTML/redirect.
        if r.status_code != 200 or not data[:2] == b"PK" or len(data) < 10_000:
            cur = await ensure_shf(db)
            return {"ok": False, "reason": "XLSX no alcanzable desde aquí (CDN/redirect) — "
                    "se conserva el valor oficial sembrado. Refrescará desde prod o con archivo local.",
                    "current": cur}
        # Alcanzable: registra que se obtuvo (parser fino del layout se cierra al ver el archivo).
        log.info(f"[shf] XLSX descargado ({len(data)} bytes) — parser de layout pendiente de estructura real")
        await db.shf_index.update_one({"_id": "current"},
                                      {"$set": {"xlsx_descargado_bytes": len(data), "updated_at": _iso()}}, upsert=True)
        return {"ok": True, "descargado_bytes": len(data), "nota": "Archivo obtenido; parseo fino al confirmar layout."}
    except Exception as e:
        log.warning(f"[shf] refresh: {e}")
        cur = await ensure_shf(db)
        return {"ok": False, "reason": str(e), "current": cur}


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()
