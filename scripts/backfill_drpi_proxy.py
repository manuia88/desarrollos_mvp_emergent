"""Backfill DRPI proxy (auditoría 2026-07-06) — prende el pipeline de Forecast.

Los snapshots DRPI reales requieren 6+ meses de transacciones por zona; hoy están
vacíos (available:false, sample_size:0) → zone_forecasts=0 → 404 en fichas/colonias.

Este script genera 24 meses de historia DRPI SINTÉTICA por colonia, anclada al
score real de la zona (score_numeric de zone_scores), CLARAMENTE etiquetada como
proxy (source="proxy_backfill", synthetic=True). El motor de forecast la detecta y
marca el pronóstico resultante como basis="proxy" → la UI lo muestra como "estimado".
Cuando entre historia real, el retrain la reemplaza y basis vuelve a "observed".

Idempotente: solo escribe/actualiza snapshots proxy; NUNCA pisa un snapshot real
(available:True sin source=proxy_backfill). Uso:
    scripts/.venv/bin/python scripts/backfill_drpi_proxy.py
"""
import asyncio
import hashlib
import math
import os
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

MESES = 24            # ventana de historia a generar
BASE_ANUAL = 0.05     # apreciación anual base (5%)
BONO_SCORE = 0.06     # +hasta 6% anual para las colonias mejor puntuadas


def _periodos(n):
    """Últimos n periodos 'YYYY-MM' terminando en el mes actual (ascendente)."""
    now = datetime.now(timezone.utc)
    y, m = now.year, now.month
    out = []
    for _ in range(n):
        out.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    out.reverse()
    return out


def _seed(zone_id: str) -> float:
    h = int(hashlib.sha1(zone_id.encode()).hexdigest()[:8], 16)
    return (h % 628) / 100.0  # fase 0..6.28 para variar la oscilación


def _trayectoria(zone_id: str, score_numeric):
    """Serie index_value (base 100) anclada al score real de la colonia (IE value 0-100).
    Si la colonia es stub (sin score real), usa apreciación base neutral — igual va etiquetada proxy."""
    try:
        s = float(score_numeric)
        s_norm = max(0.0, min(1.0, s / 100.0))
    except (TypeError, ValueError):
        s_norm = 0.5
    anual = BASE_ANUAL + BONO_SCORE * s_norm
    mensual = anual / 12.0
    fase = _seed(zone_id)
    serie = []
    for i in range(MESES):
        base = 100.0 * ((1.0 + mensual) ** i)
        wiggle = 0.6 * math.sin(i * 0.9 + fase)   # oscilación sub-1% (señal realista para ARIMA)
        serie.append(round(base + wiggle, 3))
    return serie


async def main():
    db = AsyncIOMotorClient(os.getenv("MONGO_URL", "mongodb://localhost:27017"))["desarrollosmx"]
    periodos = _periodos(MESES)
    now_iso = datetime.now(timezone.utc).isoformat()

    # Universo COMPLETO de colonias = ie_scores (2,462), no zone_scores (solo 81 activas).
    # Ancla la trayectoria al IE `value` real (0-100) cuando existe; stub → base neutral.
    zonas_map = {}
    async for z in db.ie_scores.find({}, {"_id": 0, "zone_id": 1, "value": 1}):
        zid = z.get("zone_id")
        if zid and zid not in zonas_map:
            zonas_map[zid] = z.get("value")
    zonas = list(zonas_map.items())

    escritas = 0
    zonas_ok = 0
    saltadas_reales = 0
    for zone_id, score in zonas:
        serie = _trayectoria(zone_id, score)
        deltas = [None] + [round((serie[i] / serie[i - 1] - 1) * 100, 3) for i in range(1, len(serie))]
        toco_zona = False
        for period, idx, dpct in zip(periodos, serie, deltas):
            # No pisar un snapshot REAL (available:True y no-proxy)
            existente = await db.drpi_snapshots.find_one(
                {"zone_id": zone_id, "tier": "colonia", "period": period},
                {"_id": 0, "available": 1, "source": 1},
            )
            if existente and existente.get("available") and existente.get("source") != "proxy_backfill":
                saltadas_reales += 1
                continue
            doc = {
                "id": f"drpi_proxy_{hashlib.sha1(f'{zone_id}{period}'.encode()).hexdigest()[:10]}",
                "zone_id": zone_id,
                "tier": "colonia",
                "period": period,
                "index_value": idx,
                "delta_pct": dpct,
                "available": True,
                "sample_size": 0,
                "source": "proxy_backfill",
                "synthetic": True,
                "reason": "proxy_backfill",
                "formula_version": "proxy-1.0",
                "computed_at": now_iso,
            }
            await db.drpi_snapshots.update_one(
                {"zone_id": zone_id, "tier": "colonia", "period": period},
                {"$set": doc},
                upsert=True,
            )
            escritas += 1
            toco_zona = True
        if toco_zona:
            zonas_ok += 1

    print(f"backfill DRPI proxy · zonas={zonas_ok} · snapshots escritos={escritas} · reales respetados={saltadas_reales}")


if __name__ == "__main__":
    asyncio.run(main())
