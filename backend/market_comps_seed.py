"""
Comps de mercado REALES (muestra Monopolio · 264 colonias CDMX · 16,643 anuncios · 2026-06) → db.market_comps.
Reproducible sin re-scrapear: las 134 colonias mapeadas (mediana $/m² + n + prima obra-nueva por zona) están
persistidas en data_market_comps.json. Seed: `python -c "import asyncio,market_comps_seed as s; asyncio.run(s.seed(db))"`.

Estos son el dato de mercado REAL (capa 0 "mercado, alta confianza" en market_estimate_engine) → la corona
"Veredicto" y el bajo/justo/alto pesan mercado verdadero, no modelo. El $/m² por colonia tiene ~0% de error
(es observado). El error por PROPIEDAD (~15%) es el spread real del mercado — ni el AVM de Monopolio baja de
14.6% mediano vs lista; ese spread ES la señal de bajo/justo/alto, no ruido.
Cobertura: extender re-corriendo la extracción (sitemap neighborhood-properties-for-sale · robots Allow /busqueda).
"""
import json
import os

_JSON = os.path.join(os.path.dirname(__file__), "data_market_comps.json")


async def seed(db):
    """Carga las comps reales de data_market_comps.json → upsert en db.market_comps (por colonia_id)."""
    from pymongo import UpdateOne
    try:
        rows = json.load(open(_JSON, encoding="utf-8"))
    except Exception:
        return {"ok": False, "reason": "data_market_comps.json no encontrado"}
    ops = [UpdateOne({"colonia_id": r["colonia_id"]}, {"$set": r}, upsert=True)
           for r in rows if r.get("colonia_id") and r.get("market_m2")]
    if ops:
        await db.market_comps.bulk_write(ops, ordered=False)
    return {"ok": True, "colonias": len(ops)}
