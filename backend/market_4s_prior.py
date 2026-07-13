"""
market_4s_prior.py — Los ÁTOMOS 4S alimentan a los MOTORES + contraste vs mercado VIVO.

Dos piezas:
 1. prior_zona(db, estudio): el "prior" de la zona desde facts_4s — qué producto pide (recámaras/
    cocina), cuánto aguanta de cuota, qué enganche/crédito usa, qué descuento convierte. Señales
    agregadas de zona (anonimizadas) para: recomendar_cuota (amenidades_engine), esquemas de pago
    y generador de producto.
 2. contraste_4s_vs_observado(db): el estudio 4S es una foto (mayo/junio 2026); el marketplace
    OBSERVA al comprador real cada día (marketplace_searches: recámaras/precio/colonias por
    visitor_id — captura ya construida, ver demand_intelligence). Este motor compara el prior 4S
    contra lo observado en las colonias de influencia del estudio → valida o detecta drift.
    Cierra el ciclo: estudio estático → señal viva → dato que se actualiza solo.

Doctrina: agregados de zona, fail-open, honesto sin señal ("el prior 4S manda hasta tener n≥K").
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.market_4s_prior")

MIN_SENAL = 10   # señales observadas mínimas para contrastar (k-anon + significancia mínima)

# demanda_4s nombra los estudios por sub-zona EPRAV; facts_4s por documento. Alias puente entre capas.
_ALIAS_FACTS = {"insurgentes": "insurgentes_antonio_caso", "antonio_caso": "insurgentes_antonio_caso"}
# Puente de Alvarado (estudio jun-2026) no está en demanda_4s: su zona de influencia viene del PDF p54.
_INFLUENCIA_EXTRA = {"puente_alvarado": {"tabacalera", "guerrero"}}


def _facts_estudio(estudio: str) -> str:
    return _ALIAS_FACTS.get(estudio, estudio)


async def _zonas_influencia(db) -> Dict[str, set]:
    """{estudio: colonias_norm} = demanda_4s (3 estudios de mayo) + Puente de Alvarado (junio)."""
    try:
        from market_4s_bridge import _estudio_colonias
        out = dict(await _estudio_colonias(db))
    except Exception as e:
        log.warning("[4s_prior] zonas fail-open: %s", e)
        out = {}
    for k, v in _INFLUENCIA_EXTRA.items():
        out.setdefault(k, set()).update(v)
    return out


async def _facts(db, estudio: str, tema: str, pregunta: str) -> List[Dict[str, Any]]:
    try:
        out = []
        q = {"estudio": _facts_estudio(estudio), "tema": tema, "pregunta": pregunta}
        async for f in db.facts_4s.find(q, {"_id": 0}):
            if not f.get("corte"):
                out.append(f)
        return out
    except Exception as e:
        log.warning("[4s_prior] facts fail-open: %s", e)
        return []


def _dominante(facts: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    con_valor = [f for f in facts if isinstance(f.get("valor"), (int, float))]
    if not con_valor:
        return None
    top = max(con_valor, key=lambda f: f["valor"])
    return {"opcion": top["opcion"], "pct": top["valor"], "pagina": top.get("pagina")}


async def prior_zona(db, estudio: str) -> Dict[str, Any]:
    """El prior de mercado de la zona (dominantes por pregunta clave), desde los átomos."""
    recamaras = _dominante(await _facts(db, estudio, "producto", "dormitorios_pct"))
    cocina = _dominante(await _facts(db, estudio, "producto", "cocina_pct"))
    enganche = _dominante(await _facts(db, estudio, "esquema_pago", "enganche_pct"))
    credito = _dominante(await _facts(db, estudio, "esquema_pago", "credito_pct"))
    descuento = _dominante(await _facts(db, estudio, "esquema_pago", "descuento_atractivo_pct"))
    cuota = _dominante(await _facts(db, estudio, "amenidades", "cuota_dispuesta_pct"))
    tipo_compra = _dominante(await _facts(db, estudio, "esquema_pago", "tipo_compra_pct"))
    tiene = any(x for x in (recamaras, cocina, enganche, cuota))
    return {
        "estudio": estudio, "es_estimado": not tiene, "fuente": "4s_granular_2026",
        "recamaras": recamaras, "cocina": cocina,
        "enganche": enganche, "credito": credito, "descuento": descuento,
        "tipo_compra": tipo_compra,
        "cuota_mantenimiento": cuota,   # bin dominante, p.ej. '3101_3200'
    }


def _cuota_bin_a_rango(opcion: str) -> Optional[List[int]]:
    """'3101_3200' → [3101, 3200] (fail-open)."""
    try:
        lo, hi = opcion.split("_")
        return [int(lo), int(hi)]
    except Exception:
        return None


async def cuota_tope_por_colonia(db, colonia_nombre: str) -> Optional[Dict[str, Any]]:
    """Cuota de mantenimiento que el mercado de ESA zona declara aguantar (bin dominante 4S).
    Para recomendar_cuota: si la colonia cae en zona de influencia de un estudio → dato real."""
    try:
        from market_4s_bridge import norm_colonia
        est_cols = await _zonas_influencia(db)
        nc = norm_colonia(colonia_nombre or "")
        # preferir el estudio MÁS RECIENTE que cubra la colonia (puente_alvarado = jun-2026)
        candidatos = [e for e, cols in est_cols.items() if nc in cols]
        estudio = ("puente_alvarado" if "puente_alvarado" in candidatos else
                   (candidatos[0] if candidatos else None))
        if not estudio:
            return None
        cuota = _dominante(await _facts(db, estudio, "amenidades", "cuota_dispuesta_pct"))
        if not cuota:
            return None
        rango = _cuota_bin_a_rango(cuota["opcion"])
        return {"estudio": estudio, "rango_mxn": rango, "pct_mercado": cuota["pct"],
                "fuente": "4s_granular_2026", "es_estimado": False}
    except Exception as e:
        log.warning("[4s_prior] cuota_tope fail-open: %s", e)
        return None


# ── Contraste: prior 4S vs comprador OBSERVADO en el marketplace ──────────────
def _band_precio_mdp(v: float) -> str:
    """Banda de 0.5 mdp para comparar contra el presupuesto 4S."""
    lo = int(v / 500000) * 0.5
    return f"{lo:.1f}-{lo + 0.5:.1f}"


async def _observado_en_zona(db, colonias_norm: set, dias: int = 90) -> Dict[str, Any]:
    """Lo que el marketplace observó en esas colonias: recámaras + presupuesto + m² + features (A8)."""
    from market_4s_bridge import norm_colonia
    cutoff = datetime.now(timezone.utc) - timedelta(days=dias)
    rec: Dict[str, int] = {}
    pres: Dict[str, int] = {}
    m2b: Dict[str, int] = {}
    feats: Dict[str, int] = {}
    n = 0
    try:
        async for s in db.marketplace_searches.find({}, {"_id": 0, "colonias": 1, "recamaras_min": 1,
                                                         "precio_max": 1, "m2_min": 1, "features_pedidos": 1,
                                                         "amenidades_pedidas": 1, "created_at_dt": 1}):
            dt = s.get("created_at_dt")
            if dt is not None and hasattr(dt, "tzinfo"):
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                if dt < cutoff:
                    continue
            cols = {norm_colonia(str(c)) for c in (s.get("colonias") or [])}
            if not (cols & colonias_norm):
                continue
            n += 1
            r = s.get("recamaras_min")
            if r:
                rec[str(int(r))] = rec.get(str(int(r)), 0) + 1
            p = s.get("precio_max")
            if p:
                b = _band_precio_mdp(float(p))
                pres[b] = pres.get(b, 0) + 1
            m2 = s.get("m2_min")
            if m2:
                from demand_genome import banda_m2
                bb = banda_m2(float(m2))
                m2b[bb] = m2b.get(bb, 0) + 1
            from demand_genome import normalizar_features
            nf = normalizar_features((s.get("features_pedidos") or []) + (s.get("amenidades_pedidas") or []))
            for slug in nf["reconocidos"]:
                feats[slug] = feats.get(slug, 0) + 1
    except Exception as e:
        log.warning("[4s_prior] observado fail-open: %s", e)
    return {"n_senales": n, "recamaras": rec, "presupuesto_bandas": pres,
            "m2_bandas": m2b, "features": dict(sorted(feats.items(), key=lambda x: -x[1])[:10])}


def _rangos_se_tocan(a: str, b: str) -> bool:
    """'71_80' (4S) vs '70-80' (banda observada) → ¿se traslapan? Fail-open False."""
    import re
    try:
        na = [int(x) for x in re.split(r"[_\-]", str(a)) if x.isdigit()]
        nb = [int(x) for x in re.split(r"[_\-]", str(b)) if x.isdigit()]
        if len(na) < 2 or len(nb) < 2:
            return False
        return na[0] <= nb[1] and nb[0] <= na[1]
    except Exception:
        return False


async def contraste_4s_vs_observado(db, dias: int = 90) -> Dict[str, Any]:
    """Por estudio: prior 4S vs comprador observado en el marketplace (colonias de influencia).
    n<MIN_SENAL → 'sin señal suficiente, el prior 4S manda'. Con señal → coincide o DRIFT."""
    est_cols = await _zonas_influencia(db)

    estudios = []
    for estudio, cols in sorted(est_cols.items()):
        prior = await prior_zona(db, estudio)
        obs = await _observado_en_zona(db, cols, dias=dias)
        rec_prior = (prior.get("recamaras") or {}).get("opcion")
        rec_obs = max(obs["recamaras"], key=obs["recamaras"].get) if obs["recamaras"] else None
        suficiente = obs["n_senales"] >= MIN_SENAL
        # A8 · m² también entra al veredicto (metraje dominante 4S vs banda observada)
        met_prior = _dominante(await _facts(db, estudio, "hipotesis_qc", "metraje_pct"))
        m2_obs = max(obs["m2_bandas"], key=obs["m2_bandas"].get) if obs.get("m2_bandas") else None
        metraje_coincide = (_rangos_se_tocan(met_prior["opcion"], m2_obs)
                            if (suficiente and met_prior and m2_obs) else None)
        if not suficiente:
            veredicto = f"Sin señal suficiente ({obs['n_senales']}/{MIN_SENAL}) — el prior 4S manda."
            estado = "prior_4s"
        elif rec_obs == rec_prior:
            veredicto = f"El marketplace CONFIRMA al estudio: {rec_obs} recámaras domina en ambos."
            estado = "confirmado"
        else:
            veredicto = (f"DRIFT: 4S dice {rec_prior} rec (may-2026), el marketplace observa {rec_obs} rec "
                         f"con {obs['n_senales']} señales — revisar mezcla.")
            estado = "drift"
        if metraje_coincide is False:
            veredicto += f" OJO m²: 4S dice {met_prior['opcion']} m², el mercado pide {m2_obs} m²."
        estudios.append({
            "estudio": estudio, "n_colonias_influencia": len(cols),
            "prior_4s": {"recamaras": prior.get("recamaras"), "enganche": prior.get("enganche"),
                         "cuota": prior.get("cuota_mantenimiento"), "metraje": met_prior},
            "observado": obs, "estado": estado,
            "metraje_coincide": metraje_coincide,
            "features_observadas_top": obs.get("features"),
            "veredicto": veredicto,
        })
    con_senal = sum(1 for e in estudios if e["estado"] != "prior_4s")
    return {
        "dias": dias, "estudios": estudios,
        "es_estimado": not bool(estudios),
        "lectura": (f"{con_senal}/{len(estudios)} zonas con señal viva del marketplace; "
                    f"el resto opera con el prior 4S hasta juntar {MIN_SENAL}+ señales.")
                   if estudios else "Carga los átomos 4S para activar el contraste.",
    }
