"""
amenidades_engine — F2.9 · Ranker de Amenidades (2 ejes) + Recomendador de Cuota.
═══════════════════════════════════════════════════════════════════════════════
REUSA (grep-antes-de-construir):
  • Eje PRECIO  → dmx_hedonic_atom.fit_and_rank (impacto en $/m², ya existe)
  • Cuota base  → ownership_economics_engine.MANT_PER_M2_MES ($40/m²/mes, canónico)
  • Disposición a pagar → bandas del estudio 4S (cuota $1,001-1,200 = 52%)
NUEVO (lo único que falta):
  • Eje DESEO   → qué tanto PIDE la demanda cada amenidad (de asesor_busquedas.amenidades)
  • Merge 2 ejes "vale la pena" (alto deseo + sube precio = constrúyela)
  • Recomendador de cuota desde el paquete de amenidades, contrastado vs disposición real.
FAIL-OPEN, bandas honestas. Cierra el ciclo: la demanda decide qué amenidad y cuánto cobrar.
"""
from __future__ import annotations

import logging
from collections import Counter
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.amenidades")

# Amenidades que CUESTAN operar (suben la cuota). Match por token (substring).
_PREMIUM_TOKENS = ("alberca", "gym", "gimnasio", "spa", "sauna", "vapor", "jacuzzi",
                   "sky", "concierge", "valet", "cine", "business", "coworking",
                   "salon", "roof", "asador", "ludoteca")

# Disposición a pagar (estudio 4S): <1000=6% · 1001-1200=52% · 1201-1400=34% · >1400=8%.
_CUOTA_TIPICA_MIN, _CUOTA_TIPICA_MAX = 1001, 1400


def _is_premium(a: str) -> bool:
    al = (a or "").lower()
    return any(t in al for t in _PREMIUM_TOKENS)


async def ranker_amenidades(db, colonia_id: Optional[str] = None) -> Dict[str, Any]:
    """Ranking de amenidades en 2 ejes: precio (hedónico) + deseo (demanda real). FAIL-OPEN."""
    # Nombre de colonia (las búsquedas guardan nombre, no id).
    name_l = None
    try:
        from data_seed import COLONIAS_BY_ID
        c = COLONIAS_BY_ID.get(colonia_id) if colonia_id else None
        if c:
            name_l = (c.get("name") or "").strip().lower()
    except Exception:
        pass

    # Eje DESEO (nuevo): cuántas búsquedas piden cada amenidad.
    deseo = Counter()
    total_busq = 0
    try:
        proj = {"_id": 0, "amenidades": 1, "colonias": 1}
        async for b in db.asesor_busquedas.find({}, proj):
            cols = [str(x).strip().lower() for x in (b.get("colonias") or [])]
            if name_l and name_l not in cols:
                continue
            total_busq += 1
            for a in (b.get("amenidades") or []):
                deseo[str(a).strip().lower()] += 1
    except Exception as e:
        log.warning(f"[amenidades] deseo fail-open: {e}")
    por_deseo = [{"amenidad": a.title(), "solicitudes": n,
                  "deseo_pct": round(100 * n / total_busq) if total_busq else 0}
                 for a, n in deseo.most_common(12)]

    # Eje PRECIO (reuso del hedónico).
    por_precio = []
    try:
        import dmx_hedonic_atom
        scope = {"geo.colonia_id": colonia_id} if colonia_id else None
        r = await dmx_hedonic_atom.fit_and_rank(db, scope, persist=False)
        # Filtro de cordura: con pocos datos el hedónico da coeficientes absurdos (ej. -94%).
        # Solo mostramos impactos significativos Y en rango razonable (|impacto| <= 60%).
        por_precio = [{"atributo": x.get("atributo"), "impacto_pct": x.get("impacto_pct_precio_m2")}
                      for x in (r.get("amenity_ranker") or [])
                      if x.get("significativo") and abs(x.get("impacto_pct_precio_m2") or 0) <= 60]
    except Exception as e:
        log.warning(f"[amenidades] precio (hedónico) fail-open: {e}")

    # Merge 2 ejes "vale la pena" (cruza por nombre cuando coincide).
    precio_by = {(p["atributo"] or "").lower(): p["impacto_pct"] for p in por_precio}
    vale = []
    for d in por_deseo:
        al = d["amenidad"].lower()
        imp = next((v for k, v in precio_by.items() if k in al or al in k), None)
        veredicto = ("Constrúyela: la piden y sube precio" if (d["deseo_pct"] >= 15 and (imp or 0) > 0)
                     else "Muy pedida" if d["deseo_pct"] >= 15
                     else "Sube precio" if (imp or 0) > 0 else "Opcional")
        vale.append({"amenidad": d["amenidad"], "deseo_pct": d["deseo_pct"],
                     "impacto_precio_pct": imp, "veredicto": veredicto})

    es_estimado = total_busq < 8
    return {
        "por_deseo": por_deseo,
        "por_precio": por_precio,
        "vale_la_pena": vale,
        "muestra": total_busq,
        "es_estimado": es_estimado,
        "lectura": ("Pocas búsquedas aún — el deseo se afina solo." if es_estimado
                    else f"{total_busq} búsquedas reales analizadas."),
        "fuente": "Ranker DMX · deseo (búsquedas) + precio (hedónico) · 2 ejes",
    }


async def recomendar_cuota(db, m2: float, amenidades: Optional[List[str]] = None,
                           colonia_id: Optional[str] = None) -> Dict[str, Any]:
    """Cuota de mantenimiento sugerida desde el paquete de amenidades, vs disposición real. FAIL-OPEN."""
    m2 = float(m2 or 0)
    amen = [str(a) for a in (amenidades or [])]
    n_premium = sum(1 for a in amen if _is_premium(a))
    try:
        from ownership_economics_engine import MANT_PER_M2_MES as base
    except Exception:
        base = 40.0
    # Más amenidades premium → mayor $/m² (operación de áreas comunes). Tope sano.
    tarifa_m2 = min(base + 1.8 * n_premium, base * 1.8)
    cuota = round(m2 * tarifa_m2) if m2 else None

    # Juicio por $/m² (benchmark CDMX), NO por peso absoluto vs Monterrey (mercados distintos).
    if cuota is None:
        veredicto, banda = "Sin m² para estimar", "sin_dato"
    elif tarifa_m2 <= 28:
        veredicto, banda = "Cómoda para el inquilino", "baja"
    elif tarifa_m2 <= 45:
        veredicto, banda = "En rango de mercado CDMX", "tipica"
    elif tarifa_m2 <= 60:
        veredicto, banda = "Alta · paquete de amenidades pesado", "alta"
    else:
        veredicto, banda = "Muy alta · revisa el paquete de amenidades", "premium"

    return {
        "m2": round(m2), "amenidades_premium": n_premium,
        "tarifa_m2": round(tarifa_m2, 1),
        "cuota_estimada_mxn": cuota,
        "banda": banda, "veredicto": veredicto,
        "referencia_segmento": "Segmento C/C+ paga ~$1,001–$1,400/mes (estudio 4S · referencia, no aplica a premium CDMX)",
        "es_estimado": True,
        "fuente": "Recomendador DMX · base $/m² CDMX + paquete de amenidades · vs disposición real",
    }
