"""W5.6 Sub-B — Prompts para narrativa multi-escenario (compra ahora vs espera).

Reglas inmutables:
  - Máximo 200 palabras (hard cap).
  - Idioma: español México (es-MX), profesional, sin emojis, sin markdown.
  - NUNCA inventar datos. Solo citar cifras que vengan en el input.
  - Tagline obligatorio al cierre: "DMX no opina, mide."
"""
from __future__ import annotations

PROMPT_VERSION_SCENARIO = "v1.0"

SYSTEM_PROMPT_SCENARIO = """Eres asesor de inteligencia inmobiliaria de DesarrollosMX (DMX).
Generas análisis multi-escenario honestos y data-backed para compradores serios en CDMX.

Reglas inmutables:
- Máximo 200 palabras (hard cap). Si excedes, trunco.
- Idioma: español México (es-MX), profesional pero accesible.
- NUNCA inventes datos. Solo cita cifras que estén en el input.
- Estructura obligatoria (párrafo continuo, sin headers ni bullets):
  1. CONTEXTO ZONA (1 oración): indicador más relevante de la colonia.
  2. VALOR HOY (1 oración): precio estimado actual con rango de confianza.
  3. ESCENARIO A — COMPRAR HOY (2 oraciones): ventaja de asegurar precio de entrada hoy.
  4. ESCENARIO B — ESPERAR 12 MESES (2 oraciones): precio proyectado según modelo ARIMA, diferencia en pesos.
  5. RECOMENDACIÓN (1 oración): síntesis data-backed sin opinión personal.
- Cierra con: "DMX no opina, mide."
- Output: solo texto plano, sin markdown, sin emojis, sin títulos ni headers."""


def build_user_prompt_scenario(
    zone_name: str,
    colonia: str,
    avm_now: float,
    avm_low: float,
    avm_high: float,
    forecast_12m_value: float | None,
    forecast_12m_delta_pct: float | None,
    forecast_24m_value: float | None,
    subscores: dict,
) -> str:
    """Construye el prompt de usuario para el análisis multi-escenario."""
    lines = [
        f"Genera análisis multi-escenario para propiedad típica en colonia {zone_name or colonia} (CDMX).",
        "",
        f"Valor estimado hoy: ${avm_now:,.0f} MXN (rango confianza: ${avm_low:,.0f} — ${avm_high:,.0f} MXN).",
        "",
    ]

    if forecast_12m_delta_pct is not None and forecast_12m_value:
        sign = "+" if forecast_12m_delta_pct >= 0 else ""
        lines.append(
            f"Forecast 12 meses (modelo ARIMA): "
            f"${forecast_12m_value:,.0f} MXN ({sign}{forecast_12m_delta_pct:.1f}% vs hoy · "
            f"diferencia: ${abs(forecast_12m_value - avm_now):,.0f} MXN)."
        )
    else:
        lines.append("Forecast 12 meses: no disponible para esta zona.")

    if forecast_24m_value and forecast_12m_value:
        lines.append(
            f"Forecast 24 meses (modelo ARIMA): ${forecast_24m_value:,.0f} MXN."
        )

    lines.append("")

    relevant = {k: v for k, v in subscores.items() if v is not None}
    if relevant:
        lines.append("Subscores colonia disponibles (escala 0-100):")
        for k, v in list(relevant.items())[:4]:
            lines.append(f"  {k} = {float(v):.0f}")
        lines.append("")

    lines.append(
        "Estructura requerida: contexto zona · valor hoy · Escenario A comprar hoy · "
        "Escenario B esperar 12 meses · recomendación. Max 200 palabras. Cierra con 'DMX no opina, mide.'."
    )
    return "\n".join(lines)
