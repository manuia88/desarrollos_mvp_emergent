"""Tasas de vehículos de inversión — seed junio 2026 (verificado · subasta Banxico) + actualización VIVA de CETES.

Un cron (scheduler_ie.run_rates_update, semanal) jala CETES vivo de Banxico SIE y actualiza market_rates. El resto de
vehículos son benchmark de referencia (se ajustan periódicamente). La página de zona y la calculadora leen de aquí, así
que cuando cambian las tasas, la app se actualiza sola. Fail-open: sin token, mantiene el seed.

Series Banxico SIE: SF43936=CETES 28d · SF43945=CETES 364d (rendimiento anual %).
"""
from datetime import datetime, timezone
from typing import Dict, Any, List

# Seed JUNIO 2026 (2a semana · Banxico). pct = rendimiento anual %. Criterios para la tabla comparativa.
VEHICULOS_SEED: List[Dict[str, Any]] = [
    {"k": "inmueble", "nombre": "Departamento (esta zona)", "cat": "Bien raíz", "pct": None, "riesgo": "Medio-bajo",
     "liquidez": "Baja", "ticket": "Enganche", "apalancable": True, "tangible": True, "inflacion": "Sí (real)",
     "mensual": True, "esfuerzo": "Medio", "fuente": "Motor DMX", "hero": True},
    {"k": "cetes_28", "nombre": "CETES 28 días", "cat": "Deuda gubernamental", "pct": 6.25, "riesgo": "Muy bajo",
     "liquidez": "Alta", "ticket": "$100", "apalancable": False, "tangible": False, "inflacion": "Parcial",
     "mensual": False, "esfuerzo": "Nulo", "fuente": "Banxico · cetesdirecto"},
    {"k": "cetes_364", "nombre": "CETES 364 días", "cat": "Deuda gubernamental", "pct": 7.0, "riesgo": "Muy bajo",
     "liquidez": "Media", "ticket": "$100", "apalancable": False, "tangible": False, "inflacion": "Parcial",
     "mensual": False, "esfuerzo": "Nulo", "fuente": "Banxico · cetesdirecto"},
    {"k": "pagare", "nombre": "Pagaré / TIIE 28d", "cat": "Banco", "pct": 6.75, "riesgo": "Bajo", "liquidez": "Media",
     "ticket": "$1,000", "apalancable": False, "tangible": False, "inflacion": "Parcial", "mensual": False,
     "esfuerzo": "Nulo", "fuente": "TIIE · Banxico"},
    {"k": "fibra", "nombre": "FIBRAs", "cat": "Inmobiliario bursátil", "pct": 8.0, "riesgo": "Medio", "liquidez": "Alta",
     "ticket": "$100", "apalancable": False, "tangible": False, "inflacion": "Sí", "mensual": True,
     "esfuerzo": "Bajo", "fuente": "BMV"},
    {"k": "bolsa", "nombre": "Bolsa / S&P 500", "cat": "Renta variable", "pct": 10.0, "riesgo": "Alto",
     "liquidez": "Alta", "ticket": "$100", "apalancable": False, "tangible": False, "inflacion": "Sí",
     "mensual": False, "esfuerzo": "Medio", "fuente": "BMV · investing.com"},
    {"k": "afore", "nombre": "Afore (Siefore)", "cat": "Retiro", "pct": 5.5, "riesgo": "Bajo", "liquidez": "Nula (retiro)",
     "ticket": "Aportación", "apalancable": False, "tangible": False, "inflacion": "Parcial", "mensual": False,
     "esfuerzo": "Nulo", "fuente": "investing.com · GBM"},
    {"k": "udibonos", "nombre": "Udibonos", "cat": "Deuda indexada", "pct": 4.8, "riesgo": "Muy bajo",
     "liquidez": "Media", "ticket": "$100", "apalancable": False, "tangible": False, "inflacion": "Sí (UDI)",
     "mensual": False, "esfuerzo": "Nulo", "fuente": "Banxico"},
    {"k": "crowdfunding", "nombre": "Crowdfunding inmobiliario", "cat": "Bien raíz fraccionado", "pct": 14.0, "riesgo": "Medio-alto",
     "liquidez": "Baja", "ticket": "$1,000", "apalancable": False, "tangible": False, "inflacion": "Sí",
     "mensual": True, "esfuerzo": "Bajo", "fuente": "Briq · M2Crowd · 100 Ladrillos (CNBV)"},
    {"k": "sofipo", "nombre": "SOFIPO (pagaré digital)", "cat": "Banco/fintech", "pct": 12.0, "riesgo": "Medio",
     "liquidez": "Alta", "ticket": "$100", "apalancable": False, "tangible": False, "inflacion": "Parcial",
     "mensual": False, "esfuerzo": "Nulo", "fuente": "Nu · Klar · Finsus (CNBV · seguro IPAB-PROSOFIPO)"},
    {"k": "crypto", "nombre": "Cripto (Bitcoin)", "cat": "Activo digital", "pct": 25.0, "riesgo": "Muy alto",
     "liquidez": "Alta", "ticket": "$100", "apalancable": False, "tangible": False, "inflacion": "Sí (escaso)",
     "mensual": False, "esfuerzo": "Medio", "fuente": "histórico BTC (muy volátil · no garantizado)"},
]

async def seed_rates(db) -> None:
    await db.market_rates.update_one(
        {"_id": "vehiculos"},
        {"$set": {"vehiculos": VEHICULOS_SEED, "updated_at": datetime.now(timezone.utc), "source": "seed_jun2026"},
         "$setOnInsert": {"_id": "vehiculos"}}, upsert=True)


async def get_rates(db) -> Dict[str, Any]:
    """Lee market_rates; si no existe, lo siembra. SELF-HEAL: si el seed tiene vehículos nuevos que no están en el doc
    cacheado (p.ej. crypto/crowdfunding/sofipo), los agrega solo — sin perder valores vivos. Así prod se actualiza sin
    re-seed manual. Devuelve {vehiculos, updated_at, source}."""
    doc = await db.market_rates.find_one({"_id": "vehiculos"}, {"_id": 0})
    if not doc:
        await seed_rates(db)
        doc = await db.market_rates.find_one({"_id": "vehiculos"}, {"_id": 0})
    doc = doc or {"vehiculos": [dict(v) for v in VEHICULOS_SEED]}
    have = {v.get("k") for v in (doc.get("vehiculos") or [])}
    faltan = [dict(v) for v in VEHICULOS_SEED if v.get("k") not in have]
    if faltan:
        doc["vehiculos"] = (doc.get("vehiculos") or []) + faltan
        try:
            await db.market_rates.update_one({"_id": "vehiculos"}, {"$set": {"vehiculos": doc["vehiculos"]}}, upsert=True)
        except Exception:
            pass
    return doc


async def cetes_rate(db, plazo: str = "cetes_364") -> float:
    """Tasa CETES (anual, fracción) desde market_rates. Default 364d. Fallback 0.07."""
    try:
        doc = await get_rates(db)
        for v in (doc.get("vehiculos") or []):
            if v.get("k") == plazo and v.get("pct"):
                return float(v["pct"]) / 100.0
    except Exception:
        pass
    return 0.07


async def market_context(db) -> Dict[str, Any]:
    """Contexto de mercado para la calculadora v4: cetes_1a, cetes_28, udis, inflación, tasa hipotecaria.
    cetes/tasa de market_rates (vivo Banxico); udis live SP68257 (fail-open 8.40); inflación constante (≈Banxico)."""
    ctx = {"cetes_1a": 0.07, "cetes_28": 0.0625, "udis": 8.40, "inflacion_anual": 0.045, "tasa_hipotecaria": 0.1145, "fix_usd": 18.10}
    try:
        doc = await get_rates(db)
        for v in (doc.get("vehiculos") or []):
            if v.get("k") == "cetes_364" and v.get("pct"):
                ctx["cetes_1a"] = round(float(v["pct"]) / 100.0, 4)
            if v.get("k") == "cetes_28" and v.get("pct"):
                ctx["cetes_28"] = round(float(v["pct"]) / 100.0, 4)
    except Exception:
        pass
    # UDIS vivo (Banxico SIE SP68257) · fail-open
    try:
        import os as _os
        token = _os.environ.get("IE_BANXICO_TOKEN")
        if token:
            import httpx
            url = "https://www.banxico.org.mx/SieAPIRest/service/v1/series/SP68257,SF43718/datos/oportuno"
            async with httpx.AsyncClient() as c:
                r = await c.get(url, headers={"Bmx-Token": token}, timeout=15)
            if r.status_code == 200:
                for s in (((r.json() or {}).get("bmx", {}) or {}).get("series", []) or []):
                    d = s.get("datos") or []
                    if not d:
                        continue
                    val = float(str(d[-1]["dato"]).replace(",", ""))
                    if s.get("idSerie") == "SP68257":
                        ctx["udis"] = round(val, 4)
                    elif s.get("idSerie") == "SF43718":
                        ctx["fix_usd"] = round(val, 4)
    except Exception:
        pass
    return ctx


async def update_rates(db) -> Dict[str, Any]:
    """CRON: jala CETES vivo de Banxico (SIE) y actualiza pct de cetes_28/cetes_364. Fail-open (mantiene seed)."""
    doc = await get_rates(db)
    vehiculos = doc.get("vehiculos") or [dict(v) for v in VEHICULOS_SEED]
    actualizados: List[str] = []
    try:
        from rates_scraper import scrape_official   # fuentes oficiales (Banxico SIE verificado · fail-open)
        actualizados = await scrape_official(vehiculos)
    except Exception:
        pass
    await db.market_rates.update_one(
        {"_id": "vehiculos"},
        {"$set": {"vehiculos": vehiculos, "updated_at": datetime.now(timezone.utc),
                  "source": "banxico_live" if actualizados else "seed_jun2026", "last_live": actualizados}},
        upsert=True)
    return {"ok": True, "actualizados": actualizados, "fuente": "banxico_live" if actualizados else "seed_jun2026"}
