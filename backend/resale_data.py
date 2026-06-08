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

from typing import Any, Dict, List, Optional, Tuple

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
    except Exception:
        return None
    return doc


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
