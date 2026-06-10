"""
Reventa real de la zona — derivada de las captaciones del asesor.
═══════════════════════════════════════════════════════════════════════════════
Cierra el flywheel: lo que el asesor capta (propiedades de reventa, con m² y precio)
se vuelve la referencia REAL de "mercado de reventa" de la colonia — reemplazando la
referencia estimada (price_m2_num) en el "Precio en Contexto" del comprador.

Sin captaciones suficientes cae limpio al estimado (etiquetado). Cero deuda: se afina
solo a medida que los asesores capturan. Multi-fuente listo: hoy asesor_captaciones,
mañana cualquier feed de reventa real se suma aquí.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.resale_data")

MIN_REAL = 2          # captaciones mínimas para considerar la referencia "real"
_MAD_K = 3.5          # umbral robusto de atípico (mediana ± K·MAD)


def _median(xs: List[float]) -> Optional[float]:
    xs = sorted(x for x in xs if x and x > 0)
    if not xs:
        return None
    n = len(xs)
    mid = n // 2
    return xs[mid] if n % 2 else (xs[mid - 1] + xs[mid]) / 2.0


def _pctl(xs: List[float], p: float) -> Optional[float]:
    xs = sorted(xs)
    if not xs:
        return None
    k = (len(xs) - 1) * p
    f = int(k)
    c = min(f + 1, len(xs) - 1)
    return xs[f] + (xs[c] - xs[f]) * (k - f)


def _split_outliers(pm2s: List[float]) -> Tuple[List[float], List[float]]:
    """Separa precios atípicos por MAD (robusto · no se deja arrastrar por 1 inflado).
    Devuelve (dentro, atípicos). Con <4 puntos no filtra (no hay base estadística)."""
    med = _median(pm2s)
    if med is None or len(pm2s) < 4:
        return list(pm2s), []
    mad = _median([abs(x - med) for x in pm2s]) or 0
    if mad <= 0:
        return list(pm2s), []
    lo, hi = med - _MAD_K * mad, med + _MAD_K * mad
    dentro = [x for x in pm2s if lo <= x <= hi]
    atip = [x for x in pm2s if x < lo or x > hi]
    return (dentro or list(pm2s)), atip


def _confianza(n_usadas: int) -> str:
    if n_usadas >= 6:
        return "alta"
    if n_usadas >= 3:
        return "media"
    if n_usadas >= MIN_REAL:
        return "baja"
    return "insuficiente"


async def _pm2s_captaciones(db, colonia_slug: str) -> List[float]:
    out: List[float] = []
    try:
        cur = db.asesor_captaciones.find(
            {"colonia_id": colonia_slug, "tipo_operacion": "venta",
             "m2_construidos": {"$gt": 0}, "precio_sugerido": {"$gt": 0}},
            {"_id": 0, "m2_construidos": 1, "precio_sugerido": 1},
        )
        async for c in cur:
            m2, price = c.get("m2_construidos") or 0, c.get("precio_sugerido") or 0
            if m2 and price:
                out.append(price / m2)
    except Exception:
        pass
    return out


async def _pm2s_cierres(db, colonia_slug: str) -> List[float]:
    out: List[float] = []
    try:
        cur = db.cierres_reales.find(
            {"colonia_id": colonia_slug, "pm2": {"$gt": 0}}, {"_id": 0, "pm2": 1})
        async for c in cur:
            if c.get("pm2"):
                out.append(float(c["pm2"]))
    except Exception:
        pass
    return out


async def resale_reference(db, colonia_slug: str) -> Dict[str, Any]:
    """Referencia ROBUSTA de $/m² de la colonia, ANCLADA a CIERRES REALES cuando los hay.

    Jerarquía de confianza (lección Monopolio/DD360): un precio de CIERRE (lo que de verdad se
    pagó) vale más que uno de lista (captación). Si hay cierres, la referencia se ancla a ellos;
    las captaciones solo amplían el rango. Sin cierres, cae a captaciones (atípicos filtrados).
    """
    if not colonia_slug:
        return {"pm2": None, "n": 0, "confianza": "insuficiente", "fuente": "insuficiente", "anclado_cierres": False}

    cierres = await _pm2s_cierres(db, colonia_slug)
    capt = await _pm2s_captaciones(db, colonia_slug)

    if cierres:
        dentro, atip = _split_outliers(cierres)
        med = _median(dentro)
        # rango: de los cierres si hay ≥3; si no, se amplía con captaciones
        pool = dentro if len(dentro) >= 3 else (dentro + _split_outliers(capt)[0])
        conf = "alta" if len(dentro) >= 3 else "media"
        return {
            "pm2": round(med) if med else None,
            "rango_bajo": round(_pctl(pool, 0.25)) if pool else None,
            "rango_alto": round(_pctl(pool, 0.75)) if pool else None,
            "n": len(cierres) + len(capt), "n_cierres": len(cierres), "n_captaciones": len(capt),
            "n_usadas": len(dentro), "n_atipicas": len(atip),
            "confianza": conf, "fuente": "cierres" if not capt else "cierres+captaciones",
            "anclado_cierres": True,
        }

    # Sin cierres → captaciones (robusto, como antes)
    dentro, atip = _split_outliers(capt)
    med = _median(dentro)
    n_usadas = len(dentro)
    return {
        "pm2": round(med) if med else None,
        "rango_bajo": round(_pctl(dentro, 0.25)) if dentro else None,
        "rango_alto": round(_pctl(dentro, 0.75)) if dentro else None,
        "n": len(capt), "n_cierres": 0, "n_captaciones": len(capt),
        "n_usadas": n_usadas, "n_atipicas": len(atip),
        "confianza": _confianza(n_usadas),
        "fuente": "captaciones" if (med and n_usadas >= MIN_REAL) else "insuficiente",
        "anclado_cierres": False,
    }


async def registrar_cierre(db, *, colonia_id: str, m2: float, precio: float,
                           owner_id: Optional[str] = None, org_id: Optional[str] = None,
                           captacion_id: Optional[str] = None, fecha: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Registra un CIERRE REAL (una propiedad que se vendió a un precio final). Es el dato de
    mayor confianza para el AVM. Honesto: sin colonia/m²/precio válidos, no registra nada."""
    import secrets
    from datetime import datetime, timezone
    if not colonia_id or not m2 or not precio or m2 <= 0 or precio <= 0:
        return None
    doc = {
        "id": "cierre_" + secrets.token_urlsafe(8),
        "colonia_id": colonia_id, "m2": float(m2), "precio": float(precio),
        "pm2": round(precio / m2), "owner_id": owner_id, "org_id": org_id,
        "captacion_id": captacion_id,
        "fecha": fecha or datetime.now(timezone.utc).isoformat(), "source": "cierre",
    }
    try:
        await db.cierres_reales.insert_one(dict(doc))
    except Exception as _ie:
        log.warning(f"[registrar_cierre] no se pudo guardar el cierre (dato clave del AVM): {_ie}")
        return None
    # Flywheel: una venta nueva recalibra el modelo suelo→comercial (ING.2) — fail-open.
    try:
        import comercial_value_model as cvm
        await cvm.recalibrate(db, city="CDMX")
    except Exception:
        pass
    return doc


def _robust_median(xs: List[float]) -> Optional[float]:
    dentro, _ = _split_outliers([x for x in xs if x and x > 0])
    return _median(dentro)


_VAL_LEYENDA = {
    "alta": "Basado en ventas reales de la zona.",
    "media": "Basado en ventas y propiedades en venta de la zona.",
    "baja": "Pocos datos aún — se afina con más ventas en la zona.",
    "estimado": "Estimado de zona — aún sin transacciones registradas.",
    "insuficiente": "Aún no hay datos suficientes en la zona.",
}


async def colonia_valuation(db, colonia_slug: str, *,
                            obra_pm2: Optional[List[float]] = None,
                            base_pm2: Optional[float] = None) -> Dict[str, Any]:
    """Mezcla 4-FUENTES del valor por m² de la colonia, con su confianza y desglose honesto:
      1) Ventas Reales (cierres) — mayor peso · 2) En Venta/Reventa (captaciones) ·
      3) Obra Nueva (inventario dev) · 4) Estimado de Zona (base).
    Cada fuente aporta su mediana robusta ponderada por confianza. Sin nada → insuficiente.
    """
    cierres = await _pm2s_cierres(db, colonia_slug)
    capt = await _pm2s_captaciones(db, colonia_slug)
    fuentes: List[Dict[str, Any]] = []
    if cierres:
        m = _robust_median(cierres)
        if m:
            fuentes.append({"tipo": "cierres", "etiqueta": "Ventas Reales", "pm2": round(m), "n": len(cierres), "peso": 5})
    if capt:
        m = _robust_median(capt)
        if m:
            fuentes.append({"tipo": "reventa", "etiqueta": "En Venta (Reventa)", "pm2": round(m), "n": len(capt), "peso": 2})
    if obra_pm2:
        vals = [p for p in obra_pm2 if p and p > 0]
        m = _median(vals)
        if m:
            fuentes.append({"tipo": "obra_nueva", "etiqueta": "Obra Nueva", "pm2": round(m), "n": len(vals), "peso": 2})
    # Estimado de zona — preferimos el ANCLADO al valor oficial del suelo (catastral × modelo
    # calibrado con ventas reales · ING.2) sobre la heurística. Solo si el modelo es fiable.
    estimado_src = None
    try:
        import comercial_value_model as cvm
        ce = await cvm.estimate_commercial_pm2(db, colonia_slug)
        if ce and ce.get("pm2"):
            estimado_src = {"tipo": "estimado", "etiqueta": "Estimado del Valor Oficial del Suelo",
                            "pm2": ce["pm2"], "n": 0, "peso": 1, "base": "catastral",
                            "catastral": ce.get("catastral"), "leyenda": ce.get("leyenda")}
    except Exception:
        estimado_src = None
    if estimado_src is None and base_pm2 and base_pm2 > 0:
        estimado_src = {"tipo": "estimado", "etiqueta": "Estimado de Zona", "pm2": round(base_pm2), "n": 0, "peso": 1}
    if estimado_src:
        fuentes.append(estimado_src)

    if not fuentes:
        return {"pm2": None, "confianza": "insuficiente", "anclado": None, "fuentes": [],
                "leyenda": _VAL_LEYENDA["insuficiente"]}

    peso_tot = sum(f["peso"] for f in fuentes)
    pm2 = round(sum(f["pm2"] * f["peso"] for f in fuentes) / peso_tot)
    reales = [f for f in fuentes if f["tipo"] in ("cierres", "reventa", "obra_nueva")]
    if any(f["tipo"] == "cierres" and f["n"] >= 3 for f in fuentes):
        conf = "alta"
    elif cierres or len(reales) >= 2:
        conf = "media"
    elif reales:
        conf = "baja"
    else:
        conf = "estimado"
    return {
        "pm2": pm2, "confianza": conf, "anclado": fuentes[0]["tipo"],
        "fuentes": fuentes, "leyenda": _VAL_LEYENDA[conf],
    }


def obra_nueva_pm2_map() -> Dict[str, List[float]]:
    """$/m² de obra nueva por colonia (del inventario de desarrollos)."""
    out: Dict[str, List[float]] = {}
    try:
        from data_developments import DEVELOPMENTS
        for d in DEVELOPMENTS:
            from data_developments import colonia_slug as _cs  # P2.2
            col = d.get("colonia_id") or _cs(d.get("colonia"))
            mr = d.get("m2_range") or [0]
            pm2 = (d.get("price_from") or 0) / mr[0] if (mr and mr[0]) else 0
            if col and pm2 > 0:
                out.setdefault(col, []).append(pm2)
    except Exception:
        pass
    return out


async def precio_rescore(db, city: str = "CDMX") -> int:
    """7ª dimensión (precio/plusvalía): para cada colonia con fuente REAL de precio, calcula su
    $/m² mezclado y lo guarda como `precio_score` (percentil del valor de la ciudad). Solo cuenta
    si hay dato real (cierres/reventa/obra nueva), no el estimado de zona. Barato (local + obra map).
    """
    import metric_normalizer as _mn
    try:
        from data_seed import COLONIAS_BY_ID
    except Exception:
        COLONIAS_BY_ID = {}
    obra = obra_nueva_pm2_map()
    rows: List[Dict[str, Any]] = []
    async for c in db.colonias.find({"city": city}, {"_id": 0, "id": 1}):
        zid = c["id"]
        base = (COLONIAS_BY_ID.get(zid) or {}).get("price_m2_num")
        val = await colonia_valuation(db, zid, obra_pm2=obra.get(zid), base_pm2=base)
        # solo REAL (no "estimado"/"insuficiente"): debe tener cierres/reventa/obra
        if val.get("pm2") and val.get("confianza") in ("alta", "media", "baja"):
            rows.append({"id": zid, "pm2": val["pm2"]})
    if not rows:
        return 0
    sorted_vals = (_mn.dist_from_values([r["pm2"] for r in rows]).get("_sorted") or [])
    for r in rows:
        pr = _mn.percentile_rank(r["pm2"], sorted_vals)
        await db.colonias.update_one(
            {"id": r["id"]}, {"$set": {"precio_pm2": r["pm2"], "precio_score": round(pr * 100)}})
    return len(rows)


# Bandas de comunicación cuando un precio se compara con la referencia de la colonia.
_BANDAS_PRECIO = {
    "muy_alto":   ("Bastante Arriba del Rango", "Este precio está bastante arriba de lo que se capta en la colonia — revísalo o respáldalo con su valor diferencial."),
    "alto":       ("Arriba del Rango Típico", "Un poco arriba del rango típico de la colonia."),
    "en_rango":   ("Dentro del Rango Típico", "En línea con lo que se capta en la colonia."),
    "bajo":       ("Abajo del Rango Típico", "Un poco abajo del rango típico — buena oportunidad o conviene revisar."),
    "muy_bajo":   ("Bastante Abajo del Rango", "Bastante abajo de lo típico — verifica que el dato sea correcto."),
    "sin_referencia": ("Sin Referencia Aún", "Aún no hay suficientes captaciones en la colonia para comparar."),
}


def clasificar_precio(pm2: Optional[float], ref: Dict[str, Any]) -> Dict[str, Any]:
    """Clasifica el $/m² de una propiedad vs la referencia de la colonia (honesto, en palabra).
    Avisa al asesor si su precio está fuera del rango típico (guard de atípicos · no bloquea)."""
    base = (ref or {}).get("pm2")
    if not pm2 or not base or (ref or {}).get("fuente") == "insuficiente":
        et, msg = _BANDAS_PRECIO["sin_referencia"]
        return {"banda": "sin_referencia", "etiqueta": et, "mensaje": msg, "dentro": None}
    lo = ref.get("rango_bajo") or base * 0.85
    hi = ref.get("rango_alto") or base * 1.15
    ratio = pm2 / base
    if pm2 > hi * 1.15 or ratio >= 1.4:
        banda = "muy_alto"
    elif pm2 > hi:
        banda = "alto"
    elif pm2 < lo * 0.85 or ratio <= 0.65:
        banda = "muy_bajo"
    elif pm2 < lo:
        banda = "bajo"
    else:
        banda = "en_rango"
    et, msg = _BANDAS_PRECIO[banda]
    return {"banda": banda, "etiqueta": et, "mensaje": msg,
            "dentro": banda in ("en_rango", "alto", "bajo"),
            "rango_bajo": ref.get("rango_bajo"), "rango_alto": ref.get("rango_alto")}
