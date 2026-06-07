"""
El Precio en Contexto — comparación responsable para obra nueva (reemplaza el A12 ingenuo).
═══════════════════════════════════════════════════════════════════════════════
PROBLEMA que corrige: comparar el precio de obra nueva contra el promedio MEZCLADO de
la colonia (nuevo + reventa) hace que TODO desarrollo salga "caro" → nadie se registra.
La reventa siempre es más barata que estrenar; comparar contra ella es manzanas-con-peras.

SOLUCIÓN (manzanas con manzanas + comunicación cuidada, pro-conversión y honesta):
  1. vs OBRA NUEVA comparable  → dónde cae el precio entre otros desarrollos NUEVOS de la
     zona (entrada / en rango / premium). Nunca dice "caro".
  2. vs MERCADO DE REVENTA      → "la prima de estrenar" (% sobre usada), REFORMULADA como
     valor: qué obtienes a cambio (estrenar, garantía, amenidades, normas, preventa).
  3. REFERENCIA COMBINADA       → un promedio balanceado.
  + "Lo que respalda el precio"  → amenidades, calidad de zona (ICO), plusvalía (IPV).

Sin fuente de reventa propia (no scrapeamos competidores), la referencia de mercado usa
`price_m2_num` de la colonia (mercado general, mayormente reventa), etiquetada; se afina
sola si algún día se conecta un feed de reventa real. Cero deuda, cero "sobreprecio".
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional


def _median(xs: List[float]) -> Optional[float]:
    xs = sorted(x for x in xs if x and x > 0)
    if not xs:
        return None
    n = len(xs)
    mid = n // 2
    return xs[mid] if n % 2 else (xs[mid - 1] + xs[mid]) / 2.0


# Banda de posición vs obra nueva — NEUTRAL, nunca punitiva.
def _band_vs_nuevo(vs_pct: float) -> Dict[str, str]:
    if vs_pct <= -7:
        return {"clave": "entrada", "color": "verde", "etiqueta": "Precio de entrada en obra nueva",
                "lectura": "Está en la parte accesible de la obra nueva de la zona — buen punto de entrada."}
    if vs_pct < 9:
        return {"clave": "en_rango", "color": "verde", "etiqueta": "En el rango de obra nueva",
                "lectura": "El precio va en línea con otros desarrollos nuevos comparables de la zona."}
    if vs_pct < 22:
        return {"clave": "premium", "color": "theme", "etiqueta": "Premium de obra nueva",
                "lectura": "Está en la parte alta de la obra nueva de la zona — normalmente por ubicación, marca o producto."}
    return {"clave": "top", "color": "theme", "etiqueta": "Tope de gama de la zona",
            "lectura": "Es de lo más alto en obra nueva de la zona; vale la pena ver qué lo distingue (vista, amenidades, acabados)."}


def _valor_de_estrenar(stage: Optional[str]) -> List[str]:
    base = [
        "Estrenas: sin remodelar ni reparaciones de entrada",
        "Garantía del desarrollador sobre la construcción",
        "Amenidades y servicios completos desde el día uno",
        "Cumple normas de construcción y sísmicas vigentes",
    ]
    if stage in ("preventa", "en_construccion"):
        base.append("Preventa: compras a precio de hoy y te entregan ya revalorizado")
    return base


def compute_price_context(
    este_pm2: float, colonia: Dict[str, Any], peers_pm2: List[float],
    *, dev: Optional[Dict[str, Any]] = None, stage: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Tres referencias + posición + prima de estrenar + respaldo, en lenguaje cuidado."""
    if not este_pm2 or este_pm2 <= 0:
        return None

    nuevo_pm2 = _median(peers_pm2)
    usada_pm2 = (colonia or {}).get("price_m2_num")  # mercado general (mayormente reventa)
    n_peers = len([p for p in peers_pm2 if p and p > 0])

    # Si no hay con qué comparar obra nueva, caemos al mercado general como referencia única (low conf).
    if not nuevo_pm2 and usada_pm2:
        nuevo_pm2 = round(usada_pm2 * 1.18)  # prima típica de estrenar ~18% (estimada, etiquetada)
        nuevo_fuente = "estimado"
    else:
        nuevo_fuente = "comparables" if n_peers >= 2 else "pocos_comparables"

    refs = []
    if nuevo_pm2:
        refs.append({"clave": "nuevo", "label": "Obra nueva comparable", "pm2": round(nuevo_pm2),
                     "fuente": nuevo_fuente})
    if usada_pm2:
        refs.append({"clave": "reventa", "label": "Mercado de reventa (general)", "pm2": round(usada_pm2),
                     "fuente": "mercado_general"})
    promedio_pm2 = None
    if nuevo_pm2 and usada_pm2:
        promedio_pm2 = round((nuevo_pm2 + usada_pm2) / 2)
        refs.append({"clave": "promedio", "label": "Referencia combinada", "pm2": promedio_pm2, "fuente": "promedio"})

    # ── 1. Posición vs OBRA NUEVA (la comparación justa) ──
    posicion = None
    if nuevo_pm2:
        vs_nuevo = round((este_pm2 - nuevo_pm2) / nuevo_pm2 * 100, 1)
        posicion = {"vs_pct": vs_nuevo, **_band_vs_nuevo(vs_nuevo)}
        if nuevo_fuente == "pocos_comparables":
            posicion["nota"] = "Pocos desarrollos comparables aún — referencia preliminar."

    # ── 2. Prima de ESTRENAR (vs reventa) reformulada como valor ──
    prima = None
    if usada_pm2:
        prima_pct = round((este_pm2 - usada_pm2) / usada_pm2 * 100, 1)
        prima = {
            "pct": prima_pct,
            "lectura": (f"Estrenar en esta zona cuesta ~{abs(prima_pct):.0f}% {'más' if prima_pct >= 0 else 'menos'} "
                        "que una vivienda de reventa. A cambio obtienes:"),
            "valor": _valor_de_estrenar(stage),
        }

    # ── 3. Lo que RESPALDA el precio (el porqué del premium) ──
    respaldo: List[Dict[str, str]] = []
    try:
        import dmx_indices_engine as ix
        idx = ix.compute_indices(colonia)
        by = {i["key"]: i for i in idx["indices"]}
        ico, ipv = by.get("ICO"), by.get("IPV")
        if ico and ico["valor"] >= 70:
            respaldo.append({"icono": "calidad", "texto": f"Calidad de zona alta ({ico['valor']}/100): {colonia.get('name')} bien calificada para vivir."})
        if ipv and ipv["valor"] >= 60:
            respaldo.append({"icono": "plusvalia", "texto": f"Plusvalía a favor ({ipv['valor']}/100): la zona se revaloriza."})
    except Exception:
        pass
    n_amen = len((dev or {}).get("amenities") or [])
    if n_amen >= 6:
        respaldo.append({"icono": "amenidades", "texto": f"{n_amen} amenidades — producto completo."})
    if stage in ("preventa", "en_construccion"):
        respaldo.append({"icono": "preventa", "texto": "En preventa: precio de hoy por un bien que se entrega revalorizado."})

    return {
        "este_pm2": round(este_pm2),
        "referencias": refs,
        "posicion": posicion,
        "prima_estrenar": prima,
        "respaldo": respaldo,
        "nota": "Comparamos obra nueva contra obra nueva (no contra reventa, que siempre es más barata). "
                "La referencia de reventa usa el mercado general de la zona y se afina al conectar un feed de reventa.",
    }
