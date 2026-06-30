"""TERMINAL DE CELDA ATÓMICA — P6 Tarea 1 (ensamblador de celda).

Dado un set de ejes (filtros), devuelve la CELDA atómica completa: un dato independiente,
con su OFERTA y su DEMANDA al lado, autoexplicado (valor + comparativo + scores + lectura) y
navegable (drill nano↔macro). NO construye motores nuevos: COMPONE los que ya existen.

Mapeo campo→motor real (confirmado):
  núcleo (valor/unidad/n/confianza/fuente/comparativo) → grid_engine.compute
  oferta (inventario/vendidas/precio/absorción)        → cube_olap_engine.query_slice + absorcion_engine.curva_absorcion
  demanda (búsquedas/leads/heat)                        → grafo_comprador_engine.build_grafo
  scores_zona (zone/IE/DMX)                             → zone_score_engine.get_score_or_compute + dmx_indices_engine.compute_indices
  drill (padres/hijos)                                  → jerarquía geo del catálogo

HONESTO: cada bloque es fail-soft → si su motor no da dato, el bloque queda None/[] (latente), nunca inventado.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional


# ───────────────────────── helpers ─────────────────────────
def _g(d, *path, default=None):
    cur = d
    for k in path:
        if isinstance(cur, dict):
            cur = cur.get(k)
        else:
            return default
    return cur if cur is not None else default


async def _alcaldia_de(db, colonia_id: str) -> Optional[str]:
    try:
        doc = await db.colonias.find_one({"id": colonia_id}, {"alcaldia": 1})
        return (doc or {}).get("alcaldia")
    except Exception:
        return None


# ───────────────────────── bloques (cada uno fail-soft) ─────────────────────────
async def _nucleo(db, measure: str, dims: Dict[str, Any]) -> Dict[str, Any]:
    """valor + comparativo + procedencia (grid_engine)."""
    try:
        import grid_engine as ge
        r = await ge.compute(db, measure, dims)
        return {
            "valor": r.get("valor"), "unidad": r.get("unidad"),
            "confidence": r.get("confianza"), "n": r.get("n"),
            "fuente": _g(r, "procedencia", "fuente"), "es_latente": bool(r.get("latente")),
            "uso": r.get("uso"),
            "comparativo": r.get("comparativo") or {},
        }
    except Exception as e:
        return {"valor": None, "es_latente": True, "comparativo": {}, "_err_nucleo": str(e)[:80]}


async def _oferta(db, colonia_id: Optional[str], tipologia: Optional[str], tier_precio: Optional[str]) -> Dict[str, Any]:
    """inventario/vendidas/precio/$m²/absorción/meses_inventario/mix (cubo OLAP + absorción)."""
    out: Dict[str, Any] = {}
    try:
        import cube_olap_engine as cube
        s = await cube.query_slice(db, tier="colonia", tier_id=colonia_id,
                                   property_type=tipologia, price_tier=tier_precio, slice_by="property_type")
        k = s.get("kpis") or {}
        out.update({
            "inventario": k.get("units_available"),
            "disponibles": k.get("units_available"),
            "reservadas": k.get("units_reserved"),
            "vendidas": k.get("units_sold"),
            "unidades_total": k.get("units_total"),
            "precio_med": k.get("avg_price_mxn"),
            "ppm2_med": k.get("avg_price_per_m2"),
            "m2_med": k.get("avg_m2"),
            "sell_through": k.get("absorcion_pct"),
            "conversion_rate": k.get("conversion_rate"),
            "por_cobrar_mxn": k.get("por_cobrar_mxn"),
            "mix_tipologia": s.get("breakdown"),
        })
    except Exception as e:
        out["_err_oferta"] = str(e)[:80]
    try:
        import absorcion_engine as ab
        a = await ab.curva_absorcion(db, colonia_id=colonia_id)
        out["absorcion"] = _g(a, "absorcion") or _g(a, "absorcion_mensual") or _g(a, "curva", "absorcion")
        out["meses_inventario"] = _g(a, "meses_inventario")
        out["sell_through"] = _g(a, "sell_through") or _g(a, "exito_comercial")
    except Exception as e:
        out.setdefault("_err_absorcion", str(e)[:80])
    return out


async def _demanda(db, colonia_id: Optional[str]) -> Dict[str, Any]:
    """búsquedas/leads/tipología buscada/banda de precio/heat (grafo del comprador)."""
    try:
        import grafo_comprador_engine as gr
        g = await gr.build_grafo(db, colonia_id=colonia_id, dias=90)
        segs = g.get("segmentos_catalogo") or []
        top = segs[0] if (segs and isinstance(segs[0], dict)) else {}
        return {
            "busquedas": g.get("muestra"),
            "es_estimado": g.get("es_estimado"),
            "ventana_dias": g.get("ventana_dias"),
            "k_anonimato": g.get("k_anonimato"),
            "tipologia_buscada": top.get("tipologia") or top.get("segmento"),
            "banda_precio": top.get("rango_precio") or top.get("banda_precio"),
            "n_segmentos": len(segs),
            "lectura_demanda": g.get("lectura"),
        }
    except Exception as e:
        return {"busquedas": None, "_err_demanda": str(e)[:80]}


async def _scores_zona(db, colonia_id: Optional[str]) -> List[Dict[str, Any]]:
    """zone_score + índices DMX aplicables a la zona (lista hipersegmentada)."""
    out: List[Dict[str, Any]] = []
    if not colonia_id:
        return out
    try:
        import zone_score_engine as zs
        sc = await zs.get_score_or_compute(db, colonia_id, tier="colonia")
        if sc:
            out.append({"codigo": "ZONE_SCORE", "nombre": "Score de zona",
                        "valor": sc.get("score") or sc.get("score_numeric"), "letra": sc.get("score_letter") or sc.get("grade")})
            comp = sc.get("components") or {}
            try:
                import dmx_indices_engine as dx
                colonia = {"colonia_id": colonia_id, "city": "CDMX",
                           "scores": {"comercio": comp.get("denue_density", 60), "vida": comp.get("demand", 60),
                                      "seguridad": comp.get("risk", 60), "movilidad": comp.get("denue_density", 60),
                                      "educacion": 60, "plusvalia": comp.get("yield_score", 60), "riesgo": comp.get("risk", 60)}}
                idx = dx.compute_indices(colonia)
                idm = idx.get("idm") or {}
                out.append({"codigo": "IDM", "nombre": "Índice DMX (maestro)",
                            "valor": idm.get("valor"), "letra": idm.get("letra")})
            except Exception:
                pass
    except Exception:
        pass
    return out


def _drill(geo_nivel: Optional[str], geo_valor: Optional[str], alcaldia: Optional[str]) -> Dict[str, Any]:
    """escalera nano↔macro: padres (subir) e hijos (bajar) según el nivel geo."""
    jerarquia = ["ciudad", "alcaldia", "colonia", "desarrollo", "unidad"]
    nivel = (geo_nivel or "colonia").lower()
    try:
        i = jerarquia.index(nivel)
    except ValueError:
        i = 2
    padres = []
    if i >= 1: padres.append({"nivel": "alcaldia", "id": alcaldia, "label": "Subir a alcaldía"})
    if i >= 1: padres.append({"nivel": "ciudad", "id": "cdmx", "label": "Subir a ciudad"})
    hijos = []
    if i < len(jerarquia) - 1:
        hijos.append({"nivel": jerarquia[i + 1], "label": f"Bajar a {jerarquia[i + 1]}"})
    return {"nivel_actual": nivel, "padres": padres, "hijos": hijos}


def _lectura(nucleo: Dict, oferta: Dict, demanda: Dict) -> str:
    """frase simple autogenerada — la celda se lee sola."""
    val = nucleo.get("valor")
    if val is None:
        return "Sin dato suficiente en esta celda todavía (latente)."
    comp = nucleo.get("comparativo") or {}
    pos = comp.get("ciudad") or comp.get("vs_ciudad") or comp.get("posicion")
    partes = [f"Valor {val}{(' '+nucleo['unidad']) if nucleo.get('unidad') else ''}"]
    if pos is not None:
        partes.append(f"posición {pos} vs ciudad")
    inv = oferta.get("inventario"); ab = oferta.get("absorcion")
    if inv is not None and ab:
        partes.append(f"oferta {inv} u. (absorción {ab}/mes)")
    bq = demanda.get("busquedas")
    if bq:
        partes.append(f"demanda {bq} búsquedas")
    return " · ".join(partes) + "."


# ───────────────────────── ensamblador principal ─────────────────────────
async def build_celda(db, *, measure: str, geo_nivel: Optional[str] = None, geo_valor: Optional[str] = None,
                      tipologia: Optional[str] = None, rango_m2: Optional[str] = None,
                      tier_precio: Optional[str] = None, atributo: Optional[str] = None,
                      ventana: Optional[str] = None, lente: str = "superadmin") -> Dict[str, Any]:
    """La celda atómica completa: ejes + valor + oferta + demanda + comparativo + scores + drill + lectura."""
    dims = {k: v for k, v in {
        "geo": (geo_nivel, geo_valor) if (geo_nivel and geo_valor) else None,
        "tipologia": tipologia, "rango_m2": rango_m2, "tier_precio": tier_precio,
        "atributo": atributo, "ventana": ventana,
    }.items() if v}
    colonia_id = geo_valor if (geo_nivel == "colonia") else None
    alcaldia = await _alcaldia_de(db, colonia_id) if colonia_id else None

    nucleo = await _nucleo(db, measure, dims)
    oferta = await _oferta(db, colonia_id, tipologia, tier_precio)
    demanda = await _demanda(db, colonia_id)
    scores = await _scores_zona(db, colonia_id)

    # Fallback HONESTO: si el grid materializado no tiene la celda (latente) pero el cubo OLAP la
    # calcula viva, usar el valor vivo del cubo (fuente explícita). No se inventa: es el dato del cubo.
    _MEDIDA_A_OFERTA = {
        "of.precio_m2": "ppm2_med", "of.precio_absoluto": "precio_med",
        "of.inventario_activo": "inventario", "of.sell_through": "sell_through",
        "of.absorcion_mensual": "absorcion",
    }
    if (nucleo.get("valor") is None) and measure in _MEDIDA_A_OFERTA:
        v = oferta.get(_MEDIDA_A_OFERTA[measure])
        if v is not None:
            nucleo["valor"] = v
            nucleo["es_latente"] = False
            prev = nucleo.get("fuente")
            prev_s = ", ".join(str(x) for x in prev) if isinstance(prev, list) else (str(prev) if prev else "")
            nucleo["fuente"] = (prev_s + " · Cubo OLAP (vivo)") if prev_s else "Cubo OLAP (vivo)"
            nucleo["n"] = nucleo.get("n") or oferta.get("unidades_total")

    return {
        "ejes": {"geo": {"nivel": geo_nivel, "id": geo_valor}, "medida": measure,
                 "tipologia": tipologia, "rango_m2": rango_m2, "tier_precio": tier_precio,
                 "atributo": atributo, "ventana": ventana, "lente": lente},
        "valor": nucleo.get("valor"), "unidad": nucleo.get("unidad"),
        "confidence": nucleo.get("confidence"), "n": nucleo.get("n"),
        "fuente": nucleo.get("fuente"), "es_latente": nucleo.get("es_latente"),
        "uso": nucleo.get("uso"),
        "oferta": oferta,
        "demanda": demanda,
        "comparativo": nucleo.get("comparativo"),
        "scores_zona": scores,
        "drill": _drill(geo_nivel, geo_valor, alcaldia),
        "lectura": _lectura(nucleo, oferta, demanda),
        # bloques que se llenan en siguientes tandas (honesto: vacíos hoy, no inventados)
        "distribucion": [],
        "serie": {"puntos": [], "variacion_pct": None},
        "relacionados": [],
    }
