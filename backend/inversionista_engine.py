"""
inversionista_engine — F2.10 · Memo de Inversionista + Perfil de Inquilino + Comercio PB.
═══════════════════════════════════════════════════════════════════════════════
REUSA (grep-antes-de-construir):
  • vertical_products_engine.compute_investor_yield → cap rate, cash-on-cash, IRR, Monte Carlo
  • investment_simulator_engine.get_colonia_baseline → tier + plusvalía base
  • perfil_zona_engine (qué le falta) → para decidir comercio en planta baja
NUEVO (lo que falta):
  • El MEMO armado (entregable de inversionista, exportable a PDF/print)
  • Perfil de inquilino objetivo (del NSE/tier · estudio 4S: estudiantes 19-25 C+ / jóvenes 25-35 C+)
  • Decisión de comercio en PB (solo deptos 53% vs con comercio 47% · ajustada por lo que pide la zona)
FAIL-OPEN, honesto. Cierra el ciclo: el lado inversión consume los mismos motores que el dev.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.inversionista")

# Perfil de inquilino objetivo por tier de zona (estudio 4S + NSE).
_INQUILINO = {
    "luxury":        {"perfil": "Ejecutivos y adultos jóvenes 30-45 · NSE A/B", "nse": "A/B"},
    "premium":       {"perfil": "Adultos jóvenes 28-40 · NSE A/C+ · ejecutivos y parejas", "nse": "A/C+"},
    "trendy":        {"perfil": "Jóvenes profesionistas 25-35 · NSE C+ · parejas sin hijos", "nse": "C+"},
    "emerging":      {"perfil": "Estudiantes foráneos 19-25 y primer empleo · NSE C+/C", "nse": "C+/C"},
    "mid":           {"perfil": "Jóvenes profesionistas 25-35 · NSE C+/C", "nse": "C+/C"},
    # Tiers adicionales del catálogo de colonias (antes caían al genérico por mismatch de tier):
    "mid-up":        {"perfil": "Profesionistas establecidos y familias jóvenes 30-45 · NSE C+/B", "nse": "C+/B"},
    "central":       {"perfil": "Profesionistas y parejas urbanas 25-40 · NSE C+", "nse": "C+"},
    "up-and-coming": {"perfil": "Jóvenes en primer/segundo empleo 23-32 · NSE C+/C", "nse": "C+/C"},
    "revival":       {"perfil": "Creativos y jóvenes profesionistas 25-38 · NSE C+", "nse": "C+"},
    "corporate":     {"perfil": "Ejecutivos y corporativos 28-45 · NSE A/C+", "nse": "A/C+"},
    "colonial":      {"perfil": "Familias y profesionistas establecidos 30-50 · NSE C+/B", "nse": "C+/B"},
    "family":        {"perfil": "Familias jóvenes con hijos 30-45 · NSE C+/B", "nse": "C+/B"},
}
_INQUILINO_DEFAULT = {"perfil": "Jóvenes profesionistas 25-35 · NSE C+", "nse": "C+"}


def perfil_inquilino(tier: Optional[str]) -> Dict[str, Any]:
    """A quién rentar, según el tier/NSE de la zona (estudio 4S)."""
    t = (tier or "").lower()
    return _INQUILINO.get(t, _INQUILINO_DEFAULT)


async def comercio_pb(db, colonia_id: Optional[str]) -> Dict[str, Any]:
    """¿Comercio en planta baja? Reusa perfil_zona (qué le falta) + el 53/47 del estudio. FAIL-OPEN."""
    falta_comercio = []
    try:
        from perfil_zona_engine import perfil_zona
        pz = await perfil_zona(db, colonia_id)
        for f in ((pz.get("que_le_falta") or {}).get("faltan") or []):
            if f["giro"] in ("Restaurantes", "Cafés", "Súper / Comercio", "Bares / Antros"):
                falta_comercio.append(f["giro"])
    except Exception as e:
        log.warning(f"[inversionista] comercio_pb fail-open: {e}")
    if falta_comercio:
        rec = "Sí · comercio en planta baja"
        razon = f"La zona pide comercio (falta: {', '.join(falta_comercio[:3])}). Suma absorción y renta de locales."
    else:
        rec = "Mejor solo departamentos"
        razon = "La zona ya tiene comercio; el 53% prefiere edificio solo de deptos (privacidad/seguridad)."
    return {"recomendacion": rec, "razon": razon,
            "referencia_estudio": "Estudio 4S: 53% prefiere solo deptos · 47% con comercio",
            "giros_que_faltan": falta_comercio}


async def memo_inversionista(db, colonia_id: Optional[str], precio: Optional[float],
                             m2: Optional[float], plazo_meses: int = 24) -> Dict[str, Any]:
    """Memo de inversionista de la zona/producto. Reusa yield + baseline. FAIL-OPEN."""
    tier = None
    plusvalia = None
    try:
        from investment_simulator_engine import get_colonia_baseline
        base = await get_colonia_baseline(db, colonia_id)
        tier = base.get("tier_zona")
        plusvalia = base.get("base_aprec_anual_pct")
    except Exception as e:
        log.warning(f"[inversionista] baseline fail-open: {e}")

    rendimiento = None
    if precio and m2 and colonia_id:
        try:
            from vertical_products_engine import compute_investor_yield
            y = await compute_investor_yield(db, {"purchase_price": precio, "m2": m2, "zone_id": colonia_id}, hold_years=5)
            if y.get("available"):
                rendimiento = {
                    "cap_rate_pct": y.get("cap_rate_pct"),
                    "cash_on_cash_pct": y.get("cash_on_cash_pct"),
                    "irr_pct": y.get("irr_pct"),
                    "renta_mensual_estimada": round((y.get("cap_rate_pct") or 0) / 100 * precio / 12) if precio else None,
                    "monte_carlo": y.get("monte_carlo") or y.get("monte"),
                }
        except Exception as e:
            log.warning(f"[inversionista] yield fail-open: {e}")

    # El perfil de inquilino va por el TIER de la colonia (NSE real: Premium/Luxury/Trendy…), no por
    # tier_zona (A/B/C/D del baseline de inversión) — el mismatch tiraba TODA zona al genérico.
    try:
        from data_seed import COLONIAS_BY_ID
        seed_tier = (COLONIAS_BY_ID.get(colonia_id) or {}).get("tier")
    except Exception:  # noqa: BLE001
        seed_tier = None
    # Solo damos perfil de inquilino cuando hay NSE REAL de la colonia (tier del catálogo seed) — sin inventar
    # un NSE para zonas sin ese dato (honestidad: mejor ocultar que adivinar mal en una zona premium).
    inq = perfil_inquilino(seed_tier) if seed_tier else None
    pb = await comercio_pb(db, colonia_id)

    veredicto = []
    if rendimiento and rendimiento.get("irr_pct"):
        veredicto.append(f"IRR estimado ~{rendimiento['irr_pct']}% · cap rate {rendimiento.get('cap_rate_pct')}% a 5 años.")
    if plusvalia:
        veredicto.append(f"Plusvalía base de la zona ~{plusvalia}%/año.")
    if inq:
        veredicto.append(f"Rentar a: {inq['perfil']}.")
    veredicto.append(f"Comercio en PB: {pb['recomendacion'].lower()} — {pb['razon']}")

    return {
        "colonia_id": colonia_id, "tier": tier,
        "precio": round(precio) if precio else None, "m2": round(m2) if m2 else None,
        "rendimiento": rendimiento,
        "plusvalia_anual_pct": plusvalia,
        "perfil_inquilino": inq,
        "comercio_pb": pb,
        "veredicto": veredicto,
        "es_estimado": rendimiento is None,
        "fuente": "Memo de Inversionista DMX · reusa simulador de inversión + yield + perfil de zona",
    }
