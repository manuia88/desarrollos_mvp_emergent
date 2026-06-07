"""
Tasas oficiales (Banxico / Hacienda) — fuente ÚNICA de verdad, con conector que auto-llena.
═══════════════════════════════════════════════════════════════════════════════
Lección (founder, 2026-06-07): no usar números de blogs. Anclar a la fuente OFICIAL y
mantenerla viva. Valores por defecto = OFICIALES al 2026-06-07 (citados con fuente+fecha,
NO inventados):
  · TIIE 28 días: 6.6554%  (Hacienda · mst.hacienda.gob.mx / Banxico SIE serie SF60648)
  · Tasa objetivo Banxico: 6.50%
  · Hipoteca fija de referencia: ~10.5% (banca comercial fija, CONDUSEF/BBVA)

Conector: si se configura `BANXICO_TOKEN` (token gratuito de la API SIE de Banxico), el
conector baja el valor EN VIVO y lo cachea → la tasa se mantiene actual sola. Sin token,
usa el default oficial documentado (con su fecha). Cero inventos, cero deuda.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.banxico_rates")

# ── Defaults OFICIALES al 2026-06-07 (fuente + fecha · actualizar aquí o vía conector) ──
_OFICIAL: Dict[str, Dict[str, Any]] = {
    "tiie_28d":          {"valor": 0.066554, "fuente": "Hacienda/Banxico SF60648", "as_of": "2026-06-07"},
    "tasa_objetivo":     {"valor": 0.0650,   "fuente": "Banxico (tasa objetivo)",  "as_of": "2026-06-07"},
    "hipoteca_fija_ref": {"valor": 0.105,    "fuente": "Banca fija (CONDUSEF/BBVA)", "as_of": "2026-06"},
}
# Series SIE de Banxico para el conector en vivo
BANXICO_SERIES = {"tiie_28d": "SF60648"}

# Cache de proceso (lo llena el conector). get_rate_sync lee: cache → env → default oficial.
_CACHE: Dict[str, float] = {}


def get_rate_sync(key: str = "tiie_28d") -> float:
    """Tasa vigente (decimal, ej 0.066554). Orden: cache vivo → env override → default oficial."""
    if key in _CACHE:
        return _CACHE[key]
    env = os.getenv(f"DMX_RATE_{key.upper()}")
    if env:
        try:
            return float(env)
        except ValueError:
            pass
    return _OFICIAL.get(key, _OFICIAL["tiie_28d"])["valor"]


def get_rate_meta(key: str = "tiie_28d") -> Dict[str, Any]:
    """Tasa + de dónde viene (para mostrar fuente y fecha honestas, no un número pelón)."""
    if key in _CACHE:
        return {"valor": _CACHE[key], "fuente": "Banxico API (en vivo)", "as_of": "hoy", "tipo": "vivo"}
    env = os.getenv(f"DMX_RATE_{key.upper()}")
    if env:
        try:
            return {"valor": float(env), "fuente": "config (env)", "as_of": None, "tipo": "config"}
        except ValueError:
            pass
    o = _OFICIAL.get(key, _OFICIAL["tiie_28d"])
    return {**o, "tipo": "default_oficial"}


async def refresh_from_banxico(db=None) -> Dict[str, Any]:
    """Conector (auto-fill): baja TIIE 28d en vivo de la API SIE de Banxico y la cachea.
    Sin BANXICO_TOKEN → no-op honesto (sigue el default oficial documentado). Fail-open."""
    token = os.getenv("BANXICO_TOKEN")
    if not token:
        return {"ok": False, "reason": "sin BANXICO_TOKEN — usando default oficial documentado", "rate": get_rate_meta("tiie_28d")}
    serie = BANXICO_SERIES["tiie_28d"]
    url = f"https://www.banxico.org.mx/SieAPIRest/service/v1/series/{serie}/datos/oportuno"
    try:
        import httpx
        async with httpx.AsyncClient(timeout=12) as c:
            r = await c.get(url, headers={"Bmx-Token": token})
            r.raise_for_status()
            dato = r.json()["bmx"]["series"][0]["datos"][0]
            val = float(str(dato["dato"]).replace(",", "")) / 100.0   # viene en %, ej "6.6554"
            _CACHE["tiie_28d"] = val
            if db is not None:
                await db.gov_rates.update_one(
                    {"key": "tiie_28d"},
                    {"$set": {"key": "tiie_28d", "valor": val, "fecha": dato.get("fecha"), "fuente": "Banxico API SF60648"}},
                    upsert=True,
                )
            return {"ok": True, "valor": val, "fecha": dato.get("fecha")}
    except Exception as exc:
        log.warning(f"[banxico_rates] refresh falló (fail-open): {exc}")
        return {"ok": False, "reason": str(exc), "rate": get_rate_meta("tiie_28d")}
