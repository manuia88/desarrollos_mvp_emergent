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


def _plain_senales(by: Dict[str, Any], renta: Dict[str, Any]) -> list:
    """Convierte los índices (números) en señales que cualquiera entiende y puede usar."""
    out = []
    ipv = (by.get("IPV") or {}).get("valor")
    if ipv is not None:
        if ipv >= 67:
            out.append({"label": "Cómo sube de valor", "plain": "Se revaloriza rápido", "color": "verde"})
        elif ipv >= 45:
            out.append({"label": "Cómo sube de valor", "plain": "Sube de valor a ritmo medio", "color": "ambar"})
        else:
            out.append({"label": "Cómo sube de valor", "plain": "Sube de valor despacio", "color": "ambar"})
    ico = (by.get("ICO") or {}).get("valor")
    if ico is not None:
        if ico >= 75:
            out.append({"label": "Para vivir", "plain": "Muy buena zona para vivir", "color": "verde"})
        elif ico >= 55:
            out.append({"label": "Para vivir", "plain": "Buena zona, con cosas por mejorar", "color": "verde"})
        else:
            out.append({"label": "Para vivir", "plain": "Zona en desarrollo", "color": "ambar"})
    mejor_pct = renta.get("corta_pct") if renta.get("mejor") == "corta" else renta.get("larga_pct")
    if mejor_pct:
        est = " aprox." if renta.get("fuente") == "estimado" else ""
        out.append({"label": "Si la rentas", "plain": f"Te dejaría ~{round(mejor_pct)}% al año{est}", "color": "verde"})
    return out


# ── A07 · Buen Momento (lectura del ciclo en clave comprador) ──
_TIMING_BUYER = {
    "recuperacion": {"color": "verde", "score": 85, "titulo": "Apenas empieza a subir",
                     "lectura": "Apenas empieza a subir — entrar ahora puede capturar plusvalía temprana."},
    "expansion": {"color": "verde", "score": 78, "titulo": "Zona al alza",
                  "lectura": "Zona creciendo fuerte — buena plusvalía esperada, aunque los precios ya van al alza."},
    "maduro": {"color": "ambar", "score": 55, "titulo": "Zona consolidada",
               "lectura": "Zona consolidada — pagas por ubicación y estabilidad, no por una subida rápida."},
    "contraccion": {"color": "ambar", "score": 45, "titulo": "Precios a la baja",
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

    # ── Precio en Contexto (obra nueva vs obra nueva · NO contra reventa) ──
    from data_developments import DEVELOPMENTS
    import price_context_engine as pce
    peers_pm2 = []
    for od in DEVELOPMENTS:
        if od.get("colonia_id") != colonia_slug or od.get("id") == dev_id:
            continue
        omr = od.get("m2_range") or [0]
        opm2 = (od.get("price_from") or 0) / omr[0] if omr and omr[0] else 0
        if opm2:
            peers_pm2.append(opm2)
    try:
        from data_seed import COLONIAS_BY_ID as _CBI
        _col = _CBI.get(colonia_slug)
    except Exception:
        _col = None
    este_pm2 = (u_price / u_m2) if (u_price and u_m2) else 0
    # Reventa REAL de la zona (captaciones del asesor) — cierra el flywheel.
    from resale_data import resale_reference, colonia_valuation
    rref = await resale_reference(db, colonia_slug)
    precio_contexto: Optional[Dict[str, Any]] = None
    if _col and este_pm2:
        precio_contexto = pce.compute_price_context(
            este_pm2, _col, peers_pm2, dev=dev, stage=dev.get("stage"),
            usada_pm2_real=rref.get("pm2"), usada_n=rref.get("n", 0),
        )
        if precio_contexto:
            precio_contexto["precio_lista"] = round(u_price)
            precio_contexto["m2"] = u_m2

    # Valuación 4-fuentes de la zona (ventas reales + reventa + obra nueva + estimado · C.3)
    base_pm2 = float((_col or {}).get("price_m2_num") or 0) or None
    valuacion_zona = await colonia_valuation(db, colonia_slug, obra_pm2=peers_pm2, base_pm2=base_pm2)
    # Plusvalía OFICIAL (Índice SHF · ING.3) — apreciación anual real de la zona metropolitana.
    try:
        import shf_engine as _shf
        valuacion_zona["plusvalia_oficial"] = await _shf.get_appreciation(db)
    except Exception:
        pass

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
            "zona": z["zona"], "fase_key": fase, "fase_label": tb.get("titulo", z["ciclo"]["label"]),
            "color": tb["color"], "score": tb["score"], "lectura": tb["lectura"],
            # Señales en lenguaje normal (cero números crudos al comprador)
            "senales": _plain_senales(by, z["renta"]),
        }

    # ── Veredicto combinado ──
    veredicto = _combined(precio_contexto, timing)

    return JSONResponse({
        "ok": True, "dev_id": dev_id, "nombre": dev.get("name"),
        "zona": dev.get("colonia") or colonia_slug,
        "precio_contexto": precio_contexto, "valuacion_zona": valuacion_zona, "timing": timing, "veredicto": veredicto,
        "nota": "Comparamos obra nueva contra obra nueva comparable de la zona (no contra reventa). "
                "El momento sale de la tendencia real de precios de la zona. No es una recomendación de inversión.",
    })


@router.get("/api/public/ownership/{dev_id}")
async def ownership(
    dev_id: str, request: Request,
    enganche_pct: float = Query(0.20, ge=0.05, le=0.95),
    years: int = Query(10, ge=1, le=30),
    price: Optional[float] = Query(None, gt=0),
    m2: Optional[float] = Query(None, gt=0, le=10000),
):
    """¿Rentar o comprar? (A03) + Costo Total a N años (A05) para un desarrollo.
    Simula comprar vs rentar-e-invertir-la-diferencia con la plusvalía y renta reales de la zona."""
    _rl(_ip(request))
    db = request.app.state.db
    dev = await _load_dev(db, dev_id)
    if not dev:
        raise HTTPException(404, "desarrollo_no_encontrado")
    colonia_slug = dev.get("colonia_id") or (dev.get("colonia") or "").lower().replace(" ", "-")
    rep = _representative_unit(dev)
    u_price = float(price or rep["price"] or 0)
    u_m2 = float(m2 or rep["m2"] or 80)
    try:
        from data_seed import COLONIAS_BY_ID
        col = COLONIAS_BY_ID.get(colonia_slug)
    except Exception:
        col = None
    import ownership_economics_engine as oee
    out = oee.compute_ownership(u_price, u_m2, col, enganche_pct=enganche_pct, years=years)
    return JSONResponse({
        "ok": True, "dev_id": dev_id, "nombre": dev.get("name"),
        "zona": dev.get("colonia") or colonia_slug, **out,
        "nota": "Cálculo educativo con tasas CDMX estándar (predial/mantenimiento/escrituración estimados) y la "
                "plusvalía + renta reales de la zona. No es asesoría financiera.",
    })


def _combined(pc: Optional[Dict[str, Any]], tm: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Cruza posición-en-obra-nueva × momento. NUNCA dice 'caro' por ser obra nueva:
    una vivienda nueva está por arriba de la reventa por definición — eso es valor, no sobreprecio."""
    pos = (pc or {}).get("posicion") or {}
    band = pos.get("clave")  # entrada | en_rango | premium | top
    momento_bueno = tm and tm["fase_key"] in ("recuperacion", "expansion")
    momento_lbl = tm["fase_label"].lower() if tm else ""

    if pc is None and tm is None:
        return {"clave": "sin_datos", "color": "ambar", "titulo": "Aún en contexto",
                "lectura": "Estamos reuniendo comparables de obra nueva para ubicar este precio."}

    # Precio accesible / en rango → señal positiva
    if band in ("entrada", "en_rango"):
        if momento_bueno:
            return {"clave": "buena_entrada", "color": "verde", "titulo": "Buena entrada",
                    "lectura": f"Precio en el rango de obra nueva de la zona y {momento_lbl} a favor — buena combinación."}
        return {"clave": "en_rango", "color": "verde", "titulo": "Precio en su rango",
                "lectura": "Va en línea con otros desarrollos nuevos comparables. " + (tm["lectura"] if tm else "")}

    # Premium / tope → enmarcar el valor, sin asustar
    if band in ("premium", "top"):
        return {"clave": "premium", "color": "theme", "titulo": "Producto premium",
                "lectura": "Está en la parte alta de la obra nueva de la zona — revisa qué lo respalda (ubicación, "
                           "amenidades, marca) y compáralo con tu lista. " + ("La zona va al alza." if momento_bueno else "")}

    # Solo momento (sin contexto de precio)
    if tm:
        return {"clave": "ver_momento", "color": tm["color"], "titulo": "Revisa el momento",
                "lectura": tm["lectura"]}
    return {"clave": "en_contexto", "color": "verde", "titulo": "Precio en contexto",
            "lectura": "Mira cómo se ubica frente a la obra nueva de la zona abajo."}
