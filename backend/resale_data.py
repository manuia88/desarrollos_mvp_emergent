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

from typing import Any, Dict, List, Optional

MIN_REAL = 2  # captaciones mínimas para considerar la referencia "real"


def _median(xs: List[float]) -> Optional[float]:
    xs = sorted(x for x in xs if x and x > 0)
    if not xs:
        return None
    n = len(xs)
    mid = n // 2
    return xs[mid] if n % 2 else (xs[mid - 1] + xs[mid]) / 2.0


async def resale_reference(db, colonia_slug: str) -> Dict[str, Any]:
    """Mediana de $/m² de la reventa captada por asesores en la colonia.

    Devuelve {pm2, n, fuente}. fuente: 'captaciones' si n>=MIN_REAL, si no 'insuficiente'.
    """
    if not colonia_slug:
        return {"pm2": None, "n": 0, "fuente": "insuficiente"}
    pm2s: List[float] = []
    try:
        cursor = db.asesor_captaciones.find(
            {"colonia_id": colonia_slug, "tipo_operacion": "venta",
             "m2_construidos": {"$gt": 0}, "precio_sugerido": {"$gt": 0}},
            {"_id": 0, "m2_construidos": 1, "precio_sugerido": 1},
        )
        async for c in cursor:
            m2 = c.get("m2_construidos") or 0
            price = c.get("precio_sugerido") or 0
            if m2 and price:
                pm2s.append(price / m2)
    except Exception:
        pass
    med = _median(pm2s)
    n = len(pm2s)
    return {
        "pm2": round(med) if med else None,
        "n": n,
        "fuente": "captaciones" if (med and n >= MIN_REAL) else "insuficiente",
    }
