"""
norma3_engine — F1.4 · Detector de Oportunidades de Fusión (Norma General N°3).
═══════════════════════════════════════════════════════════════════════════════
QUÉ ES LA NORMA 3 (en simple): cuando fusionas dos predios con distinta zonificación,
el predio resultante puede tomar la de MAYOR potencial. Traducción: si tu lote está
pegado a una zona que deja construir MÁS (mayor CUS), fusionarlo con un predio de esa
zona puede subir cuánto construyes — y con eso, cuánto vale tu suelo.

QUÉ HACE ESTE MOTOR: dada la colonia de tu predio, busca colonias VECINAS con CUS más
alto y calcula cuánto subiría tu OFERTA MÁXIMA por el terreno si capturas ese CUS
(mismo lugar y mismo precio de venta, solo cambia cuánto puedes construir). Las ordena
por el dinero en juego.

REUTILIZA (no inventa): db.colonias (center + cus + precio · poblado en F1.0) +
valor_residual_engine (el mismo cálculo residual de F1.2). Honesto (Doctrina): trabaja
a nivel COLONIA por cercanía de centroides — NO confirma colindancia legal predio-a-
predio; eso lo verifica el dev/perito. Señala el potencial, no promete el trámite.
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.norma3")

_RADIO_KM_DEFAULT = 1.5     # vecindad por cercanía de centroide
_SALTO_CUS_MIN = 0.5        # salto de CUS mínimo para que valga la pena
_MAX_RESULTADOS = 6


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _haversine_km(a: List[float], b: List[float]) -> Optional[float]:
    """Distancia en km entre dos [lng, lat]."""
    try:
        lng1, lat1 = float(a[0]), float(a[1])
        lng2, lat2 = float(b[0]), float(b[1])
    except (TypeError, ValueError, IndexError):
        return None
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    h = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


async def detectar_fusiones(
    db,
    colonia_id: str,
    terreno_m2: float = 1000,
    categoria: str = "media",
    city: str = "CDMX",
    radio_km: float = _RADIO_KM_DEFAULT,
) -> Dict[str, Any]:
    """Encuentra colonias vecinas con mayor CUS y cuantifica el upside de fusión. Nunca crashea."""
    target = await db.colonias.find_one(
        {"id": colonia_id, "city": city},
        {"_id": 0, "id": 1, "name": 1, "alcaldia": 1, "cos": 1, "cus": 1, "center": 1,
         "precio_pm2": 1, "vsuelo_pm2_catastral": 1},
    )
    if not target or not target.get("center") or not (target.get("cus") or 0) > 0:
        return {"ok": True, "disponible": False,
                "motivo": "Necesitamos la ubicación y el CUS de tu colonia para buscar fusiones.",
                "oportunidades": [], "computed_at": _iso()}

    cus_t = float(target["cus"])
    center_t = target["center"]

    # Precio de venta de referencia: el de TU ubicación (no se mueve; solo cambia el CUS).
    from valor_residual_engine import _precio_venta_pm2
    precio_info = await _precio_venta_pm2(db, target, categoria, city)
    precio_pm2 = precio_info["pm2"]

    # Candidatos: colonias con CUS mayor (salto mínimo), misma ciudad.
    cur = db.colonias.find(
        {"city": city, "center": {"$ne": None}, "cus": {"$gte": cus_t + _SALTO_CUS_MIN}},
        {"_id": 0, "id": 1, "name": 1, "alcaldia": 1, "cos": 1, "cus": 1, "center": 1},
    )
    vecinos: List[Dict[str, Any]] = []
    async for c in cur:
        if c["id"] == colonia_id:
            continue
        d = _haversine_km(center_t, c.get("center"))
        if d is None or d > radio_km:
            continue
        vecinos.append({**c, "dist_km": round(d, 2)})

    # Ordena por mayor CUS primero, luego más cerca; toma los mejores.
    vecinos.sort(key=lambda v: (-(v["cus"] or 0), v["dist_km"]))
    vecinos = vecinos[:_MAX_RESULTADOS]

    # Para cada vecino, cuantifica el uplift con el MISMO cálculo residual (solo cambia el CUS).
    from valor_residual_engine import calcular_residual
    base = await calcular_residual(db, terreno_m2=terreno_m2, categoria=categoria,
                                   colonia_id=colonia_id, cus_manual=cus_t,
                                   precio_venta_pm2_manual=precio_pm2, city=city)
    oferta_base = base["respuesta"]["oferta_maxima_terreno"]

    oportunidades: List[Dict[str, Any]] = []
    for v in vecinos:
        cus_n = float(v["cus"])
        alt = await calcular_residual(db, terreno_m2=terreno_m2, categoria=categoria,
                                      colonia_id=colonia_id, cus_manual=cus_n,
                                      precio_venta_pm2_manual=precio_pm2, city=city)
        oferta_alt = alt["respuesta"]["oferta_maxima_terreno"]
        uplift = oferta_alt - oferta_base
        if uplift <= 0:
            continue
        oportunidades.append({
            "colonia_vecina": v["name"],
            "alcaldia": v.get("alcaldia"),
            "dist_km": v["dist_km"],
            "cus_actual": round(cus_t, 2),
            "cus_potencial": round(cus_n, 2),
            "m2_construibles_extra": round((cus_n - cus_t) * terreno_m2),
            "valor_terreno_actual": oferta_base,
            "valor_terreno_potencial": oferta_alt,
            "uplift_mxn": round(uplift),
            "uplift_pct": round(100 * uplift / oferta_base, 1) if oferta_base > 0 else None,
        })

    oportunidades.sort(key=lambda o: -o["uplift_mxn"])
    mejor = oportunidades[0] if oportunidades else None

    if mejor:
        resumen = (
            f"Encontramos {len(oportunidades)} zona(s) vecina(s) con mayor potencial. La mejor: "
            f"{mejor['colonia_vecina']} (CUS {mejor['cus_potencial']} vs tu {mejor['cus_actual']}) "
            f"a {mejor['dist_km']} km — fusionar podría subir el valor de tu terreno ~"
            f"{mejor['uplift_pct']}%.")
    else:
        resumen = ("No encontramos zonas vecinas con CUS notablemente mayor: tu predio ya está en la "
                   "mejor zonificación de su entorno, o no hay un salto que mueva la aguja.")

    return {
        "ok": True,
        "disponible": True,
        "colonia": target["name"],
        "cus_actual": round(cus_t, 2),
        "precio_referencia_pm2": round(precio_pm2),
        "precio_origen": precio_info.get("origen"),
        "terreno_m2": terreno_m2,
        "resumen": resumen,
        "oportunidades": oportunidades,
        "como_funciona": "Norma General de Ordenación N°3: al fusionar predios con distinta "
                         "zonificación, el conjunto puede tomar la de mayor potencial.",
        "advertencia": "Señal a nivel zona por cercanía — NO confirma que los predios colinden ni "
                       "que el trámite proceda. Verifica la colindancia real y la factibilidad ante "
                       "SEDUVI con un perito antes de decidir.",
        "computed_at": _iso(),
    }
