"""
Valor estimado de una captación (reventa) — para el asesor, al momento de captar.
═══════════════════════════════════════════════════════════════════════════════
Cierra el ciclo del asesor: mientras llena el captador, ve un "valor estimado de
mercado" que SUBE de precisión con cada detalle que agrega (condición, antigüedad,
estado, vista, amenidades). Reusa la reventa real de la zona (resale_data) cuando
existe; si no, el mercado general de la colonia (etiquetado). NUNCA inventa: marca la
fuente y el rango.

Lenguaje normal en la lectura — cero scores crudos.
"""
from __future__ import annotations

from typing import Any, Dict, Optional


def estimate_resale_value(
    colonia: Optional[Dict[str, Any]], attrs: Dict[str, Any],
    resale_pm2: Optional[float] = None, resale_n: int = 0,
) -> Dict[str, Any]:
    """Valor estimado de una propiedad de reventa a partir de sus atributos.

    attrs: {m2, recamaras, banos, condicion, antiguedad_anos, estado_conservacion,
            vista, orientacion, nivel, n_amenidades}
    """
    import avm_feature_engine as afe

    m2 = float(attrs.get("m2") or 0)
    if m2 <= 0:
        return {"disponible": False, "motivo": "Falta el tamaño (m²) para estimar."}

    # Base $/m²: reventa real de la zona si la hay, si no el mercado general de la colonia.
    if resale_pm2 and resale_n >= 2:
        base_pm2 = float(resale_pm2)
        fuente = "reventa_real"
    else:
        base_pm2 = float((colonia or {}).get("price_m2_num") or 0)
        fuente = "mercado_general"
    if base_pm2 <= 0:
        return {"disponible": False, "motivo": "Aún no tenemos referencia de precio para esta zona."}

    # Ajuste por atributos finos (motor compartido con el AVM) + drivers en lenguaje normal.
    adj = afe.feature_adjustments(attrs)
    valor = base_pm2 * m2 * adj["factor"]
    low, high = round(valor * 0.90), round(valor * 1.10)

    fuente_txt = (f"reventa real de la zona ({resale_n} captaciones)" if fuente == "reventa_real"
                  else "el mercado general de la zona (referencia estimada)")
    lectura = (f"Según {fuente_txt} y los detalles que diste, esta propiedad vale alrededor de "
               f"${round(valor):,.0f}. Entre más detalles agregues, más fino el estimado.")

    return {
        "disponible": True,
        "valor": round(valor), "rango_low": low, "rango_high": high,
        "pm2_estimado": round(valor / m2), "pm2_base": round(base_pm2),
        "fuente": fuente, "lectura": lectura,
        "drivers": adj["drivers"], "drivers_resumen": afe.drivers_headline(adj["drivers"]),
    }
