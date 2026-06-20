"""Scraper de tasas · fuentes OFICIALES ÚNICAMENTE (pedido founder: Banxico/cetesdirecto/BMV/GBM/investing).

Banxico SIE cubre deuda gubernamental EN VIVO y confiable (verificado jun2026): CETES (28/91/182/364) y TIIE 28d.
Equity (bolsa/FIBRA/Afore) NO tiene un 'rendimiento anual' scrapeable gratis y confiable (BMV/investing bloquean bots y
publican NIVEL de índice, no yield) → se quedan como REFERENCIA etiquetada. NUNCA metemos un dato dudoso como si fuera oficial.

Fail-open por fuente: lo que responde con dato actual, actualiza y marca live=True; lo que no, mantiene el seed.
Lo dispara el cron diario (scheduler_ie.run_rates_update → market_rates_engine.update_rates → scrape_official).
"""
import os
from typing import Dict, List

# Series Banxico SIE VERIFICADAS (responden con dato actual · jun2026). idSerie → key de vehículo.
BANXICO_MAP: Dict[str, str] = {
    "SF43936": "cetes_28",    # CETES 28 días (rendimiento anual %)
    "SF43945": "cetes_364",   # CETES 364 días
    "SF43783": "pagare",      # TIIE 28d — tasa de referencia bancaria (proxy oficial del pagaré). Fuente: Banxico.
}
_BAD = {"N/E", "", "None", None}


async def _banxico(series: List[str]) -> Dict[str, float]:
    """Lee series Banxico SIE (datos/oportuno). Devuelve {idSerie: valor}. Fail-open (sin token → {})."""
    token = os.environ.get("IE_BANXICO_TOKEN")
    if not token:
        return {}
    out: Dict[str, float] = {}
    try:
        import httpx
        url = f"https://www.banxico.org.mx/SieAPIRest/service/v1/series/{','.join(series)}/datos/oportuno"
        async with httpx.AsyncClient() as c:
            r = await c.get(url, headers={"Bmx-Token": token}, timeout=20)
        if r.status_code == 200:
            for s in ((r.json() or {}).get("bmx", {}) or {}).get("series", []) or []:
                datos = s.get("datos") or []
                if datos and str(datos[-1].get("dato")) not in _BAD:
                    try:
                        out[s.get("idSerie")] = float(str(datos[-1]["dato"]).replace(",", ""))
                    except Exception:
                        pass
    except Exception:
        pass
    return out


async def scrape_official(vehiculos: List[Dict]) -> List[str]:
    """Actualiza los vehículos con fuente oficial EN VIVO (Banxico). Fail-open. Devuelve las keys actualizadas."""
    live: List[str] = []
    vals = await _banxico(list(BANXICO_MAP.keys()))
    for sid, val in vals.items():
        k = BANXICO_MAP.get(sid)
        if not k or not val:
            continue
        for v in vehiculos:
            if v.get("k") == k:
                v["pct"] = round(val, 2)
                v["live"] = True
                live.append(k)
    return live
