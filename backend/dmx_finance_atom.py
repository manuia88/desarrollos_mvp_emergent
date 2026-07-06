"""
DMX · CUBO TOTAL F1 — ÁTOMO FINANCIERO por unidad
═══════════════════════════════════════════════════════════════════════════════
Materializa en cada unidad del átomo (dmx_units.finance) las dimensiones financieras
que hacen posible filtrar como pide el founder: "deptos con enganche <10% y mensualidad
hipotecaria <$20k con aforo 80%". Escalera completa: valor → esquema → corrida → pago.

REUSA (regla dura, cero duplicación):
  · payment_schemes.compute_breakdown / default_schemes  — esquemas del dev (dev_payment_schemes)
  · market_rates_engine.market_context                    — tasa hipotecaria VIVA (Banxico, fail-open)
  · inversion_v4_finance.pmt / amortization               — matemática hipotecaria canónica

Honestidad: la tasa lleva fuente + es_estimado; sin precio → sin finance (no se inventa).
Corre como cron nocturno (03:45 MX, después del cubo) y on-demand (backfill).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from dmx_unit_schema import COLLECTIONS

log = logging.getLogger("dmx.finance_atom")

UNITS = COLLECTIONS["units"]

# Escenarios hipotecarios materializados (aforo = % del precio que financia el banco).
# Cada uno queda como campo plano indexable para filtros del cubo.
AFOROS = (0.80, 0.90)
PLAZOS_ANIOS = (15, 20)

# Bandas para usar como DIMENSIÓN en el cross-cut (mensualidad hipotecaria escenario base 80/20).
def banda_mensualidad(m: Optional[float]) -> str:
    if not m or m <= 0:
        return "sin_dato"
    if m < 15_000:
        return "<15k"
    if m < 20_000:
        return "15-20k"
    if m < 30_000:
        return "20-30k"
    if m < 50_000:
        return "30-50k"
    return "50k+"


def banda_enganche(pct: Optional[float]) -> str:
    if pct is None:
        return "sin_dato"
    if pct < 10:
        return "<10%"
    if pct < 20:
        return "10-20%"
    if pct < 30:
        return "20-30%"
    return "30%+"


async def _schemes_for_project(db, project_id: str, dev_cache: Dict[str, Any]) -> Dict[str, Any]:
    """Esquemas del dev para el proyecto (dev_payment_schemes) o defaults canónicos. Cacheado por corrida."""
    if project_id in dev_cache:
        return dev_cache[project_id]
    import payment_schemes as ps
    doc = await db.dev_payment_schemes.find_one({"project_id": project_id}, {"_id": 0})
    out = {
        "schemes": (doc or {}).get("schemes") or ps.default_schemes(),
        "fecha_inicio": (doc or {}).get("fecha_inicio"),
        "fecha_entrega": (doc or {}).get("fecha_entrega"),
        "fuente": "dev" if doc else "default",
    }
    dev_cache[project_id] = out
    return out


def _finance_for_unit(precio: float, schemes_ctx: Dict[str, Any], tasa_anual: float,
                      tasa_fuente: str, tasa_es_estimado: bool) -> Dict[str, Any]:
    """El bloque finance de UNA unidad: esquemas desglosados + escenarios hipotecarios + planos indexables."""
    import payment_schemes as ps
    from inversion_v4_finance import pmt

    # ── Esquemas de pago (preventa): corrida por esquema (REUSA compute_breakdown) ──
    esquemas: List[Dict[str, Any]] = []
    for sch in schemes_ctx["schemes"]:
        bd = ps.compute_breakdown(precio, sch, schemes_ctx["fecha_inicio"], schemes_ctx["fecha_entrega"])
        esquemas.append({
            "id": sch.get("id") or sch.get("nombre"),
            "nombre": sch.get("nombre"),
            "enganche_pct": bd["firma_pct"],
            "descuento_pct": bd["descuento_pct"],
            "precio_aplicado": bd["precio_aplicado"],
            "firma": bd["firma"],
            # honestidad: sin fechas de obra no hay meses → None, no un 0 que parece dato
            "mensualidad_preventa": (bd["mensualidad_restante"] or None) if bd["meses_restantes"] else None,
            "meses_restantes": bd["meses_restantes"],
            "escrituracion": bd["escrituracion"],
        })
    enganche_min_pct = min((e["enganche_pct"] for e in esquemas), default=None)
    # ticket de entrada mínimo = lo que necesitas HOY para amarrar la unidad (apartado + firma del
    # esquema con menor enganche, sobre su precio aplicado)
    e_min = min(esquemas, key=lambda e: e["enganche_pct"]) if esquemas else None
    apartado = 0
    for sch in schemes_ctx["schemes"]:
        if (sch.get("id") or sch.get("nombre")) == (e_min or {}).get("id"):
            apartado = round(float(sch.get("apartado_mxn") or 0))
            break
    ticket_entrada_min = round((e_min["firma"] if e_min else 0) + apartado)

    # ── Escenarios hipotecarios (a la escritura): aforo × plazo, tasa VIVA ──
    tasa_m = tasa_anual / 12.0
    escenarios: List[Dict[str, Any]] = []
    for aforo in AFOROS:
        credito = precio * aforo
        for anios in PLAZOS_ANIOS:
            mens = pmt(credito, tasa_m, anios * 12)
            escenarios.append({
                "aforo_pct": round(aforo * 100),
                "plazo_anios": anios,
                "credito": round(credito),
                "mensualidad": round(mens),
                # regla 30%: ingreso bruto mensual requerido para calificar
                "ingreso_requerido": round(mens / 0.30),
            })

    def _esc(aforo_pct: int, anios: int) -> Optional[int]:
        for e in escenarios:
            if e["aforo_pct"] == aforo_pct and e["plazo_anios"] == anios:
                return e["mensualidad"]
        return None

    mens_80_20 = _esc(80, 20)
    return {
        "precio_ref": round(precio),
        "tasa_anual": round(tasa_anual, 4),
        "tasa_fuente": tasa_fuente,
        "tasa_es_estimado": tasa_es_estimado,
        "esquemas": esquemas,
        "esquemas_fuente": schemes_ctx["fuente"],
        "escenarios": escenarios,
        # ── planos indexables (los FILTROS del cubo) ──
        "enganche_min_pct": enganche_min_pct,
        "ticket_entrada_min": ticket_entrada_min,
        "mens_80_20": mens_80_20,                      # escenario base: aforo 80 · 20 años
        "mens_90_20": _esc(90, 20),
        "mens_80_15": _esc(80, 15),
        "banda_mensualidad": banda_mensualidad(mens_80_20),
        "banda_enganche": banda_enganche(enganche_min_pct),
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }


async def materialize_finance(db, limit: int = 5000) -> Dict[str, Any]:
    """Materializa dmx_units.finance para todas las unidades con precio. Idempotente (upsert del bloque)."""
    from market_rates_engine import market_context
    ctx = await market_context(db)
    tasa = float(ctx.get("tasa_hipotecaria") or 0.1145)
    tasa_fuente = "banxico_vivo" if ctx.get("live") else "seed_mercado"
    tasa_es_estimado = not bool(ctx.get("live"))

    dev_cache: Dict[str, Any] = {}
    n_ok = n_sin_precio = 0
    async for u in db[UNITS].find({}, {"_id": 0, "unit_id": 1, "development_id": 1, "commercial": 1}).limit(limit):
        com = u.get("commercial") or {}
        precio = com.get("precio_cierre_mxn") or com.get("precio_lista_mxn")
        if not precio or precio <= 0 or not u.get("unit_id"):
            n_sin_precio += 1
            continue
        schemes_ctx = await _schemes_for_project(db, u.get("development_id") or "", dev_cache)
        fin = _finance_for_unit(float(precio), schemes_ctx, tasa, tasa_fuente, tasa_es_estimado)
        await db[UNITS].update_one({"unit_id": u["unit_id"]}, {"$set": {"finance": fin}})
        n_ok += 1
    summary = {"ok": True, "materializadas": n_ok, "sin_precio": n_sin_precio,
               "tasa_anual": tasa, "tasa_fuente": tasa_fuente,
               "completed_at": datetime.now(timezone.utc).isoformat()}
    log.info(f"[finance_atom] {summary}")
    return summary


async def ensure_indexes(db) -> None:
    try:
        await db[UNITS].create_index([("finance.mens_80_20", 1)], name="fin_mens8020")
        await db[UNITS].create_index([("finance.enganche_min_pct", 1)], name="fin_enganche")
        await db[UNITS].create_index([("finance.banda_mensualidad", 1)], name="fin_banda_mens")
    except Exception as e:  # noqa: BLE001
        log.warning(f"[finance_atom] indexes: {e}")


def register_finance_cron(scheduler, db) -> None:
    """Cron nocturno 03:45 MX (tras el cubo 03:30): recalcula con la tasa del día y precios/overrides frescos."""
    from apscheduler.triggers.cron import CronTrigger
    try:
        from cron_heartbeat import wrap_apscheduler_job
        wrapped = wrap_apscheduler_job(materialize_finance, "finance_atom_refresh")
    except Exception:  # noqa: BLE001
        wrapped = materialize_finance
    scheduler.add_job(wrapped, CronTrigger(hour=3, minute=45, timezone="America/Mexico_City"),
                      id="finance_atom_refresh", replace_existing=True, kwargs={"db": db})
