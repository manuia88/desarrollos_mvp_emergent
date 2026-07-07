"""Backfill IE proxy ETIQUETADO — plomería 100% de ie_scores sin inventar dato.

Decisión del founder (2026-07-06): plomería al 100% + proxy claramente etiquetado
para las recetas IE que NO tienen dato fuente (aire/clima/fibra/transporte/riesgo
para las 2,462 colonias — sus feeders solo cubren ~16-85 colonias curadas).

Este script rellena cada ie_score STUB (value=null) con la MEDIANA de los pares
REALES de la MISMA receta (no inventa: es el valor típico de esa dimensión entre
las colonias que sí tienen dato). Lo marca:
  is_stub=false (para que el composite lo cuente → plomería 100%)
  is_proxy=true · confidence="proxy" · proxy_basis (para que se ETIQUETE "estimado")
El composite IE (que filtra is_stub:False) lo incluye, pero cualquier consumidor que
muestre confidence/is_proxy lo marca como estimado. Cuando entre dato real, el
recompute diario lo revierte a real. Idempotente.

Uso: scripts/.venv/bin/python scripts/backfill_ie_proxy.py
"""
import asyncio
import os
import statistics
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

NEUTRAL = 50.0  # midpoint si una receta no tiene NINGÚN par real (proxy_neutral)


def _tier(v: float) -> str:
    if v >= 66:
        return "green"
    if v >= 40:
        return "amber"
    return "red"


async def main():
    db = AsyncIOMotorClient(os.getenv("MONGO_URL", "mongodb://localhost:27017"))["desarrollosmx"]
    now = datetime.now(timezone.utc)

    # 1) mediana de pares REALES por receta (code)
    medians = {}
    codes = await db.ie_scores.distinct("code")
    for code in codes:
        vals = [d["value"] async for d in db.ie_scores.find(
            {"code": code, "is_stub": False, "is_proxy": {"$ne": True}, "value": {"$ne": None}},
            {"_id": 0, "value": 1},
        )]
        medians[code] = round(statistics.median(vals), 1) if vals else None

    # 2) rellenar cada stub con el proxy etiquetado
    stub_before = await db.ie_scores.count_documents({"is_stub": True})
    filled = 0
    neutral = 0
    async for s in db.ie_scores.find({"is_stub": True}, {"_id": 0, "code": 1, "zone_id": 1}):
        code = s.get("code")
        med = medians.get(code)
        if med is None:
            med = NEUTRAL
            basis = "proxy_neutral"
            neutral += 1
        else:
            basis = "peer_median"
        await db.ie_scores.update_one(
            {"code": code, "zone_id": s["zone_id"]},
            {"$set": {
                "value": med,
                "is_stub": False,
                "is_proxy": True,
                "confidence": "proxy",
                "proxy_basis": basis,
                "tier": _tier(med),
                "proxy_computed_at": now.isoformat(),
            }},
        )
        filled += 1

    stub_after = await db.ie_scores.count_documents({"is_stub": True})
    proxy = await db.ie_scores.count_documents({"is_proxy": True})
    real = await db.ie_scores.count_documents({"is_stub": False, "is_proxy": {"$ne": True}, "value": {"$ne": None}})
    print(f"IE proxy backfill · rellenados={filled} (neutral={neutral}) · "
          f"stub {stub_before}→{stub_after} · proxy={proxy} · real={real}")


if __name__ == "__main__":
    asyncio.run(main())
