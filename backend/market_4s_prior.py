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


def _num_limpio(v) -> str:
    """2.0→'2' · 2.5→'2.5' (para comparar '2' de 4S con banos_min=2.0 observado)."""
    try:
        f = float(v)
        return str(int(f)) if f == int(f) else str(f)
    except (TypeError, ValueError):
        return str(v)


async def _observado_en_zona(db, colonias_norm: set, dias: int = 90) -> Dict[str, Any]:
    """Lo que el marketplace observó en esas colonias — TODAS las dimensiones contrastables
    (recámaras, baños, estacionamientos, m², presupuesto, enganche, mensualidad, features)."""
    from market_4s_bridge import norm_colonia
    from demand_genome import banda_m2, normalizar_features
    cutoff = datetime.now(timezone.utc) - timedelta(days=dias)
    cnt: Dict[str, Dict[str, int]] = {k: {} for k in
                                      ("recamaras", "banos", "estacionamientos", "m2_bandas",
                                       "presupuesto_bandas", "enganche", "mensualidad")}
    feats: Dict[str, int] = {}
    n = 0

    def _suma(dim: str, valor: str):
        cnt[dim][valor] = cnt[dim].get(valor, 0) + 1

    try:
        async for s in db.marketplace_searches.find({}, {"_id": 0}):
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
            if s.get("recamaras_min"):
                _suma("recamaras", _num_limpio(s["recamaras_min"]))
            if s.get("banos_min"):
                _suma("banos", _num_limpio(s["banos_min"]))
            if s.get("estacionamientos_min"):
                _suma("estacionamientos", _num_limpio(s["estacionamientos_min"]))
            if s.get("m2_min"):
                _suma("m2_bandas", banda_m2(float(s["m2_min"])))
            if s.get("precio_max"):
                _suma("presupuesto_bandas", _band_precio_mdp(float(s["precio_max"])))
            if s.get("enganche_max"):
                _suma("enganche", _num_limpio(s["enganche_max"]))
            if s.get("mensualidad_max"):
                _suma("mensualidad", _num_limpio(s["mensualidad_max"]))
            nf = normalizar_features((s.get("features_pedidos") or []) + (s.get("amenidades_pedidas") or []))
            for slug in nf["reconocidos"]:
                feats[slug] = feats.get(slug, 0) + 1
    except Exception as e:
        log.warning("[4s_prior] observado fail-open: %s", e)
    return {"n_senales": n, **cnt,
            "features": dict(sorted(feats.items(), key=lambda x: -x[1])[:10])}


def _rangos_se_tocan(a: str, b: str) -> bool:
    """'71_80' vs '70-80' · '4.3_4.5' vs '4.4-4.6' → ¿se traslapan? (floats). Fail-open False."""
    import re
    try:
        na = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", str(a))]
        nb = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", str(b))]
        if len(na) < 2 or len(nb) < 2:
            return False
        return na[0] <= nb[1] and nb[0] <= na[1]
    except Exception:
        return False


# ═══ REGISTRO UNIVERSAL DE CONTRASTE ═══
# Toda dimensión con prior 4S + señal observada se contrasta SOLA. Agregar una dimensión nueva
# = una línea aquí (no código nuevo). cmp: 'igual' (dominante exacto) | 'rango' (bandas se tocan).
_CONTRASTE_REGISTRO = [
    {"dim": "recamaras", "obs": "recamaras", "prior": ("producto", "dormitorios_pct"), "cmp": "igual"},
    {"dim": "banos", "obs": "banos", "prior": ("producto", "banos_pct"), "cmp": "igual"},
    {"dim": "metraje", "obs": "m2_bandas", "prior": ("hipotesis_qc", "metraje_pct"), "cmp": "rango"},
    {"dim": "presupuesto", "obs": "presupuesto_bandas", "prior": ("perfil", "presupuesto_pct"), "cmp": "rango"},
    {"dim": "enganche", "obs": "enganche", "prior": ("esquema_pago", "enganche_pct"), "cmp": "igual"},
]


async def _contraste_dimensiones(db, estudio: str, obs: Dict[str, Any]) -> List[Dict[str, Any]]:
    """El contraste UNIVERSAL: recorre el registro y compara dominante 4S vs dominante observado
    por dimensión. Honesto por dimensión: sin_prior / sin_senal / coincide / difiere."""
    detalle = []
    for r in _CONTRASTE_REGISTRO:
        prior = _dominante(await _facts(db, estudio, r["prior"][0], r["prior"][1]))
        obs_cnt = obs.get(r["obs"]) or {}
        obs_dom = max(obs_cnt, key=obs_cnt.get) if obs_cnt else None
        if not prior:
            estado = "sin_prior"
        elif not obs_dom:
            estado = "sin_senal"
        elif (r["cmp"] == "rango" and _rangos_se_tocan(prior["opcion"], obs_dom)) or \
             (r["cmp"] == "igual" and _num_limpio(prior["opcion"]) == _num_limpio(obs_dom)):
            estado = "coincide"
        else:
            estado = "difiere"
        detalle.append({"dimension": r["dim"], "prior_4s": prior, "observado_dominante": obs_dom,
                        "n_obs": sum(obs_cnt.values()), "estado": estado})
    return detalle


async def contraste_4s_vs_observado(db, dias: int = 90) -> Dict[str, Any]:
    """Por estudio: prior 4S vs comprador observado en el marketplace (colonias de influencia).
    n<MIN_SENAL → 'sin señal suficiente, el prior 4S manda'. Con señal → coincide o DRIFT."""
    est_cols = await _zonas_influencia(db)

    estudios = []
    for estudio, cols in sorted(est_cols.items()):
        prior = await prior_zona(db, estudio)
        obs = await _observado_en_zona(db, cols, dias=dias)
        suficiente = obs["n_senales"] >= MIN_SENAL
        # CONTRASTE UNIVERSAL: todas las dimensiones del registro, no solo recámaras
        detalle = await _contraste_dimensiones(db, estudio, obs) if suficiente else []
        coinciden = [d["dimension"] for d in detalle if d["estado"] == "coincide"]
        difieren = [d for d in detalle if d["estado"] == "difiere"]
        if not suficiente:
            veredicto = f"Sin señal suficiente ({obs['n_senales']}/{MIN_SENAL}) — el prior 4S manda."
            estado = "prior_4s"
        elif not difieren:
            veredicto = (f"El marketplace CONFIRMA al estudio en {len(coinciden)} dimensiones "
                         f"({', '.join(coinciden)}) con {obs['n_senales']} señales.")
            estado = "confirmado"
        else:
            partes = [f"{d['dimension']}: 4S dice {d['prior_4s']['opcion']}, el mercado pide "
                      f"{d['observado_dominante']}" for d in difieren]
            veredicto = f"DRIFT en {len(difieren)} dimensión(es) — " + " · ".join(partes)
            estado = "drift"
        estudios.append({
            "estudio": estudio, "n_colonias_influencia": len(cols),
            "prior_4s": {"recamaras": prior.get("recamaras"), "enganche": prior.get("enganche"),
                         "cuota": prior.get("cuota_mantenimiento")},
            "observado": obs, "estado": estado,
            "contraste_dimensiones": detalle,
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
