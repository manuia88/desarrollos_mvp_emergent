"""
¿Es Buena Compra? — señal de compra para el comprador (catálogo A12 + A07).
═══════════════════════════════════════════════════════════════════════════════
Primer surface DE CARA AL COMPRADOR del arsenal de valuación (hasta hoy solo lo veía
el dev). Cruza dos preguntas que todo comprador se hace, en lenguaje normal:

  · Precio Justo (A12): ¿lo que cuesta este depa es justo vs lo que vale en el mercado?
                        Reusa el AVM (avm_quick_async) → estimado, rango, vs-mercado, comparables.
  · Buen Momento (A07): ¿es buen momento para comprar en esta zona?
                        Reusa zone_cycle_engine (fase del ciclo + gentrificación + renta) +
                        dmx_indices_engine (IDM/IPV) — el mismo motor del dev y el superadmin.

Y un veredicto combinado: "¿Es buena compra?" que cruza precio × momento.

Público + rate-limit. Cero deuda: si el AVM no tiene modelo hedónico cae a heurística
(marcada) y el ROI de renta sale 'estimado' hasta conectar el conector STR.
Integra: marketplace ↔ AVM/DRPI/ciclo/índices ↔ alimenta argumentos al asesor y dev.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Any, Deque, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse

import avm_public_engine as avm_eng
import zone_cycle_engine as zce
import dmx_indices_engine as ix

router = APIRouter()

_RL: Dict[str, Deque[float]] = defaultdict(deque)
RL_LIMIT, RL_WINDOW = 30, 60


def _ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return fwd or (request.client.host if request.client else "unknown")


def _rl(ip: str) -> None:
    now = time.time()
    b = _RL[ip]
    while b and now - b[0] > RL_WINDOW:
        b.popleft()
    if len(b) >= RL_LIMIT:
        raise HTTPException(429, "rate_limit_exceeded")
    b.append(now)


async def _load_dev(db, dev_id: str) -> Optional[Dict[str, Any]]:
    doc = await db.developments.find_one({"id": dev_id}, {"_id": 0})
    if doc:
        return doc
    try:
        from data_developments import DEVELOPMENTS_BY_ID
        return DEVELOPMENTS_BY_ID.get(dev_id)
    except Exception:
        return None


def _representative_unit(dev: Dict[str, Any]) -> Dict[str, Any]:
    """La unidad de 'entrada' (la más barata disponible) para evaluar precio justo."""
    units = dev.get("units") or []
    avail = [u for u in units if u.get("status") in ("disponible", None)] or units
    if avail:
        u = min(avail, key=lambda x: x.get("price") or 1e15)
        return {
            "price": u.get("price") or dev.get("price_from"),
            "m2": u.get("m2_total") or u.get("m2_privative") or 80,
            "rec": u.get("bedrooms") or 2,
            "ban": u.get("bathrooms") or 2,
        }
    m2r = dev.get("m2_range") or [80, 120]
    bedr = dev.get("bedrooms_range") or [2, 3]
    return {"price": dev.get("price_from"), "m2": (m2r[0] if m2r else 80),
            "rec": (bedr[0] if bedr else 2), "ban": 2}


# ── A12 · Precio Justo ──
def _fairness_verdict(vs_pct: float) -> Dict[str, str]:
    if vs_pct <= -8:
        return {"clave": "barato", "color": "verde",
                "etiqueta": "Por debajo del mercado",
                "lectura": "El precio está por debajo de lo que vale en el mercado — buena oportunidad."}
    if vs_pct < 8:
        return {"clave": "justo", "color": "verde",
                "etiqueta": "En línea con el mercado",
                "lectura": "El precio va en línea con lo que vale la zona — precio justo."}
    if vs_pct < 18:
        return {"clave": "caro", "color": "ambar",
                "etiqueta": "Por encima del mercado",
                "lectura": "Pagas algo por encima del mercado — revisa qué lo justifica (vista, marca, acabados) o negocia."}
    return {"clave": "muy_caro", "color": "rojo",
            "etiqueta": "Muy por encima del mercado",
            "lectura": "El precio está bastante arriba del mercado — pide comparables y negocia antes de avanzar."}


# ── A07 · Buen Momento (lectura del ciclo en clave comprador) ──
_TIMING_BUYER = {
    "recuperacion": {"color": "verde", "score": 85,
                     "lectura": "Apenas empieza a subir — entrar ahora puede capturar plusvalía temprana."},
    "expansion": {"color": "verde", "score": 78,
                  "lectura": "Zona creciendo fuerte — buena plusvalía esperada, aunque los precios ya van al alza."},
    "maduro": {"color": "ambar", "score": 55,
               "lectura": "Zona consolidada — pagas por ubicación y estabilidad, no por una subida rápida."},
    "contraccion": {"color": "ambar", "score": 45,
                    "lectura": "Precios a la baja — tienes margen para negociar; ve por el mejor precio."},
}


@router.get("/api/public/buy-signal/{dev_id}")
async def buy_signal(
    dev_id: str, request: Request,
    price: Optional[float] = Query(None, gt=0),
    m2: Optional[float] = Query(None, gt=0, le=10000),
    rec: Optional[int] = Query(None, ge=0, le=15),
    ban: Optional[int] = Query(None, ge=0, le=15),
):
    """Señal de compra para una unidad/desarrollo: precio justo + buen momento + veredicto.
    Sin params usa la unidad de entrada del desarrollo; con price/m2/rec/ban evalúa una unidad puntual."""
    _rl(_ip(request))
    db = request.app.state.db
    dev = await _load_dev(db, dev_id)
    if not dev:
        raise HTTPException(404, "desarrollo_no_encontrado")
    colonia_slug = dev.get("colonia_id") or (dev.get("colonia") or "").lower().replace(" ", "-")

    rep = _representative_unit(dev)
    u_price = float(price or rep["price"] or 0)
    u_m2 = float(m2 or rep["m2"] or 80)
    u_rec = int(rec if rec is not None else rep["rec"])
    u_ban = int(ban if ban is not None else rep["ban"])

    # ── Precio Justo (AVM) ──
    avm = await avm_eng.avm_quick_async(db, colonia_slug, u_m2, u_rec, u_ban, 0)
    precio_justo: Optional[Dict[str, Any]] = None
    if "error" not in avm and avm.get("precio_estimado") and u_price > 0:
        est = float(avm["precio_estimado"])
        vs_pct = round((u_price - est) / est * 100, 1) if est else 0.0
        v = _fairness_verdict(vs_pct)
        precio_justo = {
            "precio_lista": round(u_price), "valor_estimado": round(est),
            "vs_pct": vs_pct, "range_low": avm.get("range_low"), "range_high": avm.get("range_high"),
            "confianza": avm.get("confidence"), "modelo": avm.get("pricing_model"),
            "m2": u_m2, "recamaras": u_rec, "banos": u_ban,
            "comparables": (avm.get("comparables") or [])[:3],
            **v,
        }

    # ── Buen Momento (ciclo + índices) ──
    timing: Optional[Dict[str, Any]] = None
    try:
        from data_seed import COLONIAS_BY_ID
        col = COLONIAS_BY_ID.get(colonia_slug)
    except Exception:
        col = None
    if col:
        z = zce.compute_zone_cycle(col)
        fase = z["ciclo"]["fase_key"]
        tb = _TIMING_BUYER.get(fase, _TIMING_BUYER["maduro"])
        idx = ix.compute_indices(col)
        by = {i["key"]: i for i in idx["indices"]}
        timing = {
            "zona": z["zona"], "fase_key": fase, "fase_label": z["ciclo"]["label"],
            "color": tb["color"], "score": tb["score"], "lectura": tb["lectura"],
            "gentrificacion": z["gentrificacion"]["nivel"],
            "plusvalia_idx": by.get("IPV", {}).get("valor"),
            "idm": idx["idm"]["valor"], "idm_letra": idx["idm"]["letra"],
            "renta": {"larga_pct": z["renta"]["larga_pct"], "corta_pct": z["renta"]["corta_pct"],
                      "mejor": z["renta"]["mejor"], "fuente": z["renta"]["fuente"]},
        }

    # ── Veredicto combinado ──
    veredicto = _combined(precio_justo, timing)

    return JSONResponse({
        "ok": True, "dev_id": dev_id, "nombre": dev.get("name"),
        "zona": dev.get("colonia") or colonia_slug,
        "precio_justo": precio_justo, "timing": timing, "veredicto": veredicto,
        "nota": "El valor estimado sale del modelo AVM de DMX (hedónico cuando hay muestra, si no heurística). "
                "El momento sale de la tendencia real de precios de la zona. No es una recomendación de inversión.",
    })


def _combined(pj: Optional[Dict[str, Any]], tm: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Cruza precio × momento en una frase accionable + un semáforo."""
    precio_ok = pj and pj["clave"] in ("barato", "justo")
    precio_caro = pj and pj["clave"] in ("caro", "muy_caro")
    momento_bueno = tm and tm["fase_key"] in ("recuperacion", "expansion")

    if pj is None and tm is None:
        return {"clave": "sin_datos", "color": "ambar", "titulo": "Aún sin señal",
                "lectura": "No tenemos suficientes datos para evaluar esta compra."}
    if precio_caro:
        return {"clave": "cuida_precio", "color": "ambar",
                "titulo": "Cuida el precio",
                "lectura": "Estás pagando por encima del mercado. Pide comparables y negocia antes de avanzar"
                           + (", aunque la zona vaya al alza." if momento_bueno else ".")}
    if precio_ok and momento_bueno:
        return {"clave": "buena_compra", "color": "verde",
                "titulo": "Buena compra",
                "lectura": "Precio justo en una zona que va al alza — buena combinación de precio y plusvalía esperada."}
    if precio_ok and tm and tm["fase_key"] == "maduro":
        return {"clave": "compra_solida", "color": "verde",
                "titulo": "Compra sólida",
                "lectura": "Precio justo en una zona consolidada — pagas por estabilidad y ubicación más que por una subida rápida."}
    if precio_ok:
        return {"clave": "precio_ok", "color": "verde",
                "titulo": "Precio justo",
                "lectura": "El precio va en línea con el mercado. " + (tm["lectura"] if tm else "")}
    # solo timing
    return {"clave": "ver_momento", "color": tm["color"] if tm else "ambar",
            "titulo": "Revisa el momento",
            "lectura": (tm["lectura"] if tm else "Evalúa el precio contra comparables de la zona.")}
