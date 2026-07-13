"""
report_builder.py — GENERADOR DE REPORTES POR MENÚ (Ola B3 · el pedido original del founder).

"Quiero un menú donde YO elijo qué data poner: territorio + bloques + cortes, macro→micro,
sin importar la mezcla." Este motor lo hace con un REGISTRO de bloques (universalidad: agregar
un bloque nuevo = una entrada en BLOQUES, no código en el generador).

  territorio: {"colonias": [...]} y/o {"estudio": "puente_alvarado"} — cualquier escala
              (una colonia, una lista = corredor/alcaldía, vacío = ciudad).
  bloques:    los que el founder marque del catálogo (cada uno reusa un motor existente).
  cortes:     filtro opcional por dimensión del genoma (p.ej. solo recamaras=2).

Cada bloque sale con PROCEDENCIA (medido/observado/transferido/estimado) y falla AISLADO:
si un motor truena, el bloque reporta su error y el resto del reporte vive. Superadmin-only.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

log = logging.getLogger("dmx.report_builder")


# ── bloques (cada uno: motor existente + procedencia) ─────────────────────────
async def _b_demanda_viva(db, ctx) -> Dict[str, Any]:
    from demand_mirror import _demanda_conteos
    conteos = await _demanda_conteos(db, ctx.get("colonias"))   # visitantes únicos + ventana 90d
    corte = ctx.get("cortes") or {}
    if corte.get("dimension"):
        conteos = {k: v for k, v in conteos.items()
                   if k[0] == corte["dimension"] and (not corte.get("valor") or k[1] == str(corte["valor"]))}
    filas = [{"dimension": d, "valor": v, "visitantes": c["visitantes"], "senales": c["senales"]}
             for (d, v), c in sorted(conteos.items(), key=lambda x: -x[1]["visitantes"])[:40]]
    n_vis = sum(f["visitantes"] for f in filas)
    return {"procedencia": "observado", "n_senales": n_vis, "filas": filas,
            "lectura": f"{n_vis} visitantes únicos pidiendo en el territorio (ventana 90 días)."}


async def _b_genoma_kpi(db, ctx) -> Dict[str, Any]:
    """EL KPI DEL MOAT con su curva semanal — la evidencia 'crece solo' para YC."""
    from demand_genome import resumen_genoma, historia_kpi
    r = await resumen_genoma(db)
    hist = await historia_kpi(db)
    crecio = (len(hist) >= 2 and hist[-1]["n_atomos"] > hist[-2]["n_atomos"])
    return {"procedencia": "observado", "n_atomos": r["n_atomos"], "n_visitantes": r["n_visitantes"],
            "dimensiones_con_senal": r["dimensiones_con_senal"],
            "historia_semanal": hist, "radar_lexico": r.get("radar_lexico"),
            "lectura": r["lectura"] + (" La curva semanal SUBE." if crecio else
                                       f" Historia: {len(hist)} snapshot(s) semanales.")}


async def _b_espejo(db, ctx) -> Dict[str, Any]:
    from demand_mirror import espejo
    r = await espejo(db, ctx.get("colonias"))
    return {"procedencia": "observado", **r}


async def _b_escasez(db, ctx) -> Dict[str, Any]:
    from demand_mirror import escasez
    r = await escasez(db, ctx.get("colonias"))
    return {"procedencia": "observado", **r}


async def _b_data_negativa(db, ctx) -> Dict[str, Any]:
    from demand_mirror import data_negativa
    return {"procedencia": "observado", **(await data_negativa(db))}


async def _b_radar_lexico(db, ctx) -> Dict[str, Any]:
    from demand_mirror import radar_lexico
    return {"procedencia": "observado", **(await radar_lexico(db))}


async def _b_oferta_absorcion(db, ctx) -> Dict[str, Any]:
    from absorcion_engine import curva_absorcion
    cols = ctx.get("colonias")
    r = await curva_absorcion(db, col_names=set(cols) if cols else None, nombres_4s=True)
    return {"procedencia": "real" if r.get("data_basis") == "real" else "estimado", **r}


async def _b_prior_4s(db, ctx) -> Dict[str, Any]:
    from market_4s_transfer import prior_para_colonia
    cols = sorted(ctx.get("colonias") or [])
    if not cols:
        return {"procedencia": "sin_dato", "lectura": "Este bloque necesita una colonia."}
    r = await prior_para_colonia(db, cols[0])
    return {"procedencia": r["modo"], **r}


async def _b_contraste_4s(db, ctx) -> Dict[str, Any]:
    from market_4s_prior import contraste_4s_vs_observado
    r = await contraste_4s_vs_observado(db)
    if ctx.get("estudio"):
        r["estudios"] = [e for e in r["estudios"] if e["estudio"] == ctx["estudio"]]
    return {"procedencia": "medido+observado", **r}


async def _b_equilibrio_4s(db, ctx) -> Dict[str, Any]:
    from equilibrium_engine import market_intelligence
    if not ctx.get("estudio"):
        return {"procedencia": "sin_dato", "lectura": "Este bloque necesita un estudio 4S."}
    from brief_4s_engine import _COMPS_ALIAS
    comps = _COMPS_ALIAS.get(ctx["estudio"])
    if not comps:
        return {"procedencia": "sin_dato", "lectura": "Este estudio no tiene comparables cargados (honesto)."}
    r = await market_intelligence(db, estudio=comps, meses_objetivo=12)
    return {"procedencia": "medido", **r}


async def _b_gap_radar(db, ctx) -> Dict[str, Any]:
    from equilibrium_engine import gap_radar
    return {"procedencia": "medido", **(await gap_radar(db))}


async def _b_brief_4s(db, ctx) -> Dict[str, Any]:
    from brief_4s_engine import generar_brief
    if not ctx.get("estudio"):
        return {"procedencia": "sin_dato", "lectura": "Este bloque necesita un estudio 4S."}
    r = await generar_brief(db, ctx["estudio"])
    return {"procedencia": "medido", **r}


async def _b_consumidor_4s(db, ctx) -> Dict[str, Any]:
    from consumer_4s_engine import inteligencia_consumidor
    return {"procedencia": "medido", **(await inteligencia_consumidor(db))}


# ── bloques Ola C (scores del mercado) ──
async def _b_precio_sombra(db, ctx) -> Dict[str, Any]:
    from market_scores_engine import precio_sombra
    return await precio_sombra(db, ctx.get("colonias"))


async def _b_liquidez(db, ctx) -> Dict[str, Any]:
    from market_scores_engine import score_liquidez
    return await score_liquidez(db, ctx.get("colonias"))


async def _b_screener(db, ctx) -> Dict[str, Any]:
    from market_scores_engine import screener
    return await screener(db, ctx.get("colonias"))


async def _b_curva_vertical(db, ctx) -> Dict[str, Any]:
    from market_scores_engine import curva_vertical
    return await curva_vertical(db, ctx.get("colonias"))


async def _b_land_bank(db, ctx) -> Dict[str, Any]:
    from market_scores_engine import land_bank
    return await land_bank(db)


async def _b_corredores(db, ctx) -> Dict[str, Any]:
    from demand_graph_engine import corredores
    return await corredores(db)


async def _b_evolucion(db, ctx) -> Dict[str, Any]:
    """La 4ª dimensión HIPERSEGMENTADA: cortes múltiples (Y lógico) × hora/día/semana/mes/
    trimestre/año × desglose (una serie por valor de la dimensión elegida)."""
    from market_timeline import evolucion
    corte = ctx.get("cortes") or {}
    # acepta 1 corte (dict del front) o N cortes (lista, para llamadas por API)
    lista = corte if isinstance(corte, list) else ([corte] if corte.get("dimension") else [])
    r = await evolucion(db, colonias=ctx.get("colonias"),
                        cortes=lista,
                        desglosar_por=ctx.get("desglosar_por"),
                        unit_id=ctx.get("unit_id"),
                        granularidad=ctx.get("granularidad") or "mes")
    return {"procedencia": "observado", **r}


async def _b_set_competitivo(db, ctx) -> Dict[str, Any]:
    from demand_graph_engine import set_competitivo
    if not ctx.get("unit_id"):
        return {"procedencia": "sin_dato", "lectura": "Este bloque necesita una unidad (unit_id)."}
    return {"procedencia": "observado", **(await set_competitivo(db, unit_id=ctx["unit_id"]))}


# ═══ EL REGISTRO (universalidad: bloque nuevo = una entrada aquí) ═══
BLOQUES: Dict[str, Dict[str, Any]] = {
    "demanda_viva": {"fn": _b_demanda_viva, "titulo": "Demanda viva (átomos del genoma)",
                     "desc": "Qué pide la gente en el territorio, dimensión por dimensión."},
    "espejo": {"fn": _b_espejo, "titulo": "Espejo demanda↔oferta",
               "desc": "Cada llave del genoma: cuántos la piden vs cuántas unidades la tienen."},
    "escasez": {"fn": _b_escasez, "titulo": "Escasez · lo inexistente · inventario ciego",
                "desc": "Tensión demanda/oferta + el producto que nadie ofrece + oferta que nadie pide.",
                "acciones": [{"id": "despachar_inexistente",
                              "titulo": "Enviar 'lo inexistente' al desarrollador (yo autorizo)",
                              "metodo": "POST",
                              "endpoint": "/api/superadmin/genoma/inexistente-a-brief",
                              "params": ["colonias"],
                              "confirmacion": "Esto envía la demanda sin oferta al buzón del dev. ¿Autorizas?"}]},
    "data_negativa": {"fn": _b_data_negativa, "titulo": "Data negativa",
                      "desc": "Zonas ciegas, unidades invisibles, interés sin amor."},
    "radar_lexico": {"fn": _b_radar_lexico, "titulo": "Radar léxico",
                     "desc": "Términos emergentes del deseo antes de que existan en catálogos."},
    "oferta_absorcion": {"fn": _b_oferta_absorcion, "titulo": "Oferta y absorción",
                         "desc": "Curva de absorción por cohorte + comparables (incluye 4S)."},
    "prior_4s": {"fn": _b_prior_4s, "titulo": "Prior 4S de la colonia",
                 "desc": "Real (zona estudiada) / transferido (perfil similar) / sin prior."},
    "contraste_4s": {"fn": _b_contraste_4s, "titulo": "Contraste 4S vs mercado vivo",
                     "desc": "Confirmado o DRIFT por dimensión (registro universal)."},
    "equilibrio_4s": {"fn": _b_equilibrio_4s, "titulo": "Precio de equilibrio + gap",
                      "desc": "A qué $/m² se vende en 12 meses + hueco por rango (requiere estudio)."},
    "gap_radar": {"fn": _b_gap_radar, "titulo": "Radar de oportunidad",
                  "desc": "Zonas×segmentos rankeados por hueco de mercado."},
    "brief_4s": {"fn": _b_brief_4s, "titulo": "Brief de producto",
                 "desc": "La orden de trabajo: qué construir, para quién, a qué precio (requiere estudio).",
                 "necesita": ["estudio"],
                 "acciones": [{"id": "despachar_brief",
                               "titulo": "Enviar brief al desarrollador (yo autorizo)",
                               "metodo": "POST",
                               "endpoint": "/api/superadmin/cubo-4s/brief/despachar",
                               "params": ["estudio"],
                               "confirmacion": "Esto envía el brief al buzón del dev. ¿Autorizas?"}]},
    "consumidor_4s": {"fn": _b_consumidor_4s, "titulo": "Inteligencia del consumidor 4S",
                      "desc": "WTP + producto ideal + score verde + plusvalía validada."},
    # Ola C · scores del mercado (cada uno aparece solo en el menú del founder)
    "precio_sombra": {"fn": _b_precio_sombra, "titulo": "Precio sombra por feature",
                      "desc": "Cuánto vale cada feature en $/m² (mediana con-vs-sin, n≥3 por lado)."},
    "liquidez": {"fn": _b_liquidez, "titulo": "Liquidez por unidad",
                 "desc": "Qué unidades se venden más rápido según la demanda sobre sus llaves."},
    "screener": {"fn": _b_screener, "titulo": "Screener sobre/infravaloradas",
                 "desc": "Unidades fuera de precio vs su valor justo (comparables + sombras)."},
    "curva_vertical": {"fn": _b_curva_vertical, "titulo": "Curva de valor vertical",
                       "desc": "La prima de altura: $/m² por nivel del edificio, por dato."},
    "land_bank": {"fn": _b_land_bank, "titulo": "Land Bank Scorer",
                  "desc": "Dónde comprar tierra: demanda × potencial normativo × brecha suelo→mercado."},
    "corredores": {"fn": _b_corredores, "titulo": "Corredores de demanda",
                   "desc": "Colonias que comparten buscadores — el mercado real, no el radio."},
    "set_competitivo": {"fn": _b_set_competitivo, "titulo": "Set competitivo de una unidad",
                        "desc": "El rival REAL: unidades co-vistas por los mismos visitantes.",
                        "necesita": ["unit_id"]},
    "genoma_kpi": {"fn": _b_genoma_kpi, "titulo": "KPI del moat (curva semanal)",
                   "desc": "Átomos, visitantes y dimensiones con señal + la historia semanal — la evidencia YC."},
    "evolucion": {"fn": _b_evolucion, "titulo": "Evolución en el tiempo (bitácora)",
                  "desc": "Cualquier corte del genoma × tiempo: demanda, oferta, $/m² y tasa por día/mes/año. Con unit_id: la vida de UNA unidad.",
                  "necesita": ["tiempo"]},
}

# los bloques que requieren estudio 4S lo declaran (el front pinta el selector solo)
BLOQUES["equilibrio_4s"]["necesita"] = ["estudio"]


def catalogo() -> Dict[str, Any]:
    """El MENÚ auto-descriptivo (server-driven UI): cada bloque declara qué necesita y qué
    ACCIONES autorizables ofrece — el front pinta inputs y botones desde aquí, sin cablearse."""
    return {"bloques": [{"id": k, "titulo": v["titulo"], "desc": v["desc"],
                         "necesita": v.get("necesita", []),
                         "acciones": v.get("acciones", [])} for k, v in BLOQUES.items()]}


async def generar_reporte(db, *, colonias: Optional[List[str]] = None, estudio: Optional[str] = None,
                          bloques: Optional[List[str]] = None,
                          cortes: Optional[Dict[str, str]] = None,
                          unit_id: Optional[str] = None,
                          granularidad: Optional[str] = None,
                          desglosar_por: Optional[str] = None) -> Dict[str, Any]:
    """El reporte a la medida: cada bloque corre AISLADO (uno truena → los demás viven)."""
    from market_4s_bridge import norm_colonia
    cols: Optional[Set[str]] = {norm_colonia(c) for c in colonias if c} if colonias else None
    ctx = {"colonias": cols, "estudio": estudio, "cortes": cortes or {}, "unit_id": unit_id,
           "granularidad": granularidad, "desglosar_por": desglosar_por}
    pedidos = [b for b in (bloques or list(BLOQUES))]

    secciones = []
    for b in pedidos:
        meta = BLOQUES.get(b)
        if not meta:
            secciones.append({"bloque": b, "error": "bloque desconocido",
                              "disponibles": sorted(BLOQUES)})
            continue
        try:
            r = await meta["fn"](db, ctx)
            secciones.append({"bloque": b, "titulo": meta["titulo"], **r})
        except Exception as e:   # aislamiento: el reporte no muere por un motor
            log.warning("[report] bloque %s fail: %s", b, e)
            secciones.append({"bloque": b, "titulo": meta["titulo"],
                              "error": f"El bloque falló y se aisló: {e}"})

    return {
        "territorio": {"colonias": sorted(cols) if cols else "todas", "estudio": estudio},
        "cortes": cortes or {}, "n_bloques": len(secciones),
        "generado": datetime.now(timezone.utc).isoformat(),
        "secciones": secciones,
    }


# ── HARDENING · reportes con MEMORIA (comparar hoy vs hace un mes) ────────────
async def guardar_reporte(db, reporte: Dict[str, Any], nombre: Optional[str] = None,
                          actor: str = "superadmin") -> Dict[str, Any]:
    import uuid
    rid = f"rep_{uuid.uuid4().hex[:10]}"
    doc = {"id": rid, "nombre": nombre or f"Reporte {reporte.get('generado', '')[:16]}",
           "actor": actor, **reporte}
    await db.reportes_guardados.update_one({"id": rid}, {"$set": doc}, upsert=True)
    return {"ok": True, "id": rid, "nombre": doc["nombre"]}


async def listar_reportes(db, limite: int = 30) -> Dict[str, Any]:
    out = []
    try:
        async for r in db.reportes_guardados.find({}, {"_id": 0, "id": 1, "nombre": 1,
                                                       "generado": 1, "territorio": 1, "n_bloques": 1}):
            out.append(r)
    except Exception as e:
        log.warning("[report] listar fail-open: %s", e)
    out.sort(key=lambda r: r.get("generado", ""), reverse=True)
    return {"reportes": out[:limite]}


async def obtener_reporte(db, reporte_id: str) -> Optional[Dict[str, Any]]:
    try:
        async for r in db.reportes_guardados.find({"id": reporte_id}, {"_id": 0}):
            return r
    except Exception as e:
        log.warning("[report] obtener fail-open: %s", e)
    return None
