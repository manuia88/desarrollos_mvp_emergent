"""
ola_e_engines.py — OLA E del genoma: PSICOGRÁFICA + PERSONAS (GENOMA_DEMANDA_BLUEPRINT.md).

Del genoma de QUÉ buscan → a QUIÉNES son:

  E1 etapa_de_vida()     — Bayes real: prior = ciclo_vida_pct medido por 4S (facts_4s) ×
                           verosimilitud del vector observado (recámaras, m², features) →
                           posterior por visitante + distribución de la demanda vs demografía.
  E2 saliencia_visual()  — qué fotos RETIENEN (photo_dwell/photo_zoom ya capturados): curva de
                           atención por posición de galería × etapa de vida inferida.
  E3 cohortes_gemelas()  — "compradores como tú terminaron en X": gemelos por Jaccard del genoma
                           + los destinos (lead/save/like) de esos gemelos.
  E4 prima_marca()       — la marca del desarrollador medida: absorción × demanda por unidad ×
                           prima de precio sostenida → score 0-100 por dev.

REGLAS: universalidad (etapas DESCUBIERTAS de los priors 4S; verosimilitudes en REGISTRO de
predicados — una nueva = una entrada), hipersegmentación (colonias en todo), FAIL-OPEN,
es_estimado honesto. Superadmin-only en superficie.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

log = logging.getLogger("dmx.ola_e")


def _med(vals: List[float]) -> Optional[float]:
    s = sorted(v for v in vals if v is not None)
    return s[len(s) // 2] if s else None


def _ts_dt(ts) -> Optional[datetime]:
    try:
        if isinstance(ts, str):
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return ts
    except Exception:
        return None


# ═══ E1 · INFERENCIA DE ETAPA DE VIDA (Bayes: prior 4S × señales) ═════════════
# REGISTRO de verosimilitudes: (predicado sobre (dim, val)) → multiplicadores por etapa.
# Las etapas NO están hardcodeadas: se DESCUBREN de los priors 4S; un multiplicador solo
# ajusta las etapas que nombra (las demás quedan neutras). Una regla nueva = una entrada.
def _es_rec(n: int) -> Callable[[str, str], bool]:
    def _p(dim: str, val: str) -> bool:
        try:
            return dim == "producto.recamaras" and int(float(val)) == n
        except (TypeError, ValueError):
            return False
    return _p


def _rec_3mas(dim: str, val: str) -> bool:
    try:
        return dim == "producto.recamaras" and int(float(val)) >= 3
    except (TypeError, ValueError):
        return False


def _m2_chico(dim: str, val: str) -> bool:
    try:
        return dim == "producto.m2_banda" and float(str(val).split("-")[0]) < 60
    except (TypeError, ValueError, IndexError):
        return False


def _m2_grande(dim: str, val: str) -> bool:
    try:
        return dim == "producto.m2_banda" and float(str(val).split("-")[0]) >= 110
    except (TypeError, ValueError, IndexError):
        return False


def _feature(*slugs: str) -> Callable[[str, str], bool]:
    def _p(dim: str, val: str) -> bool:
        return dim == "producto.feature" and val in slugs
    return _p


_VEROSIMILITUDES: List[Tuple[Callable[[str, str], bool], Dict[str, float]]] = [
    (_es_rec(1), {"soltero_joven": 2.2, "soltero_adulto": 1.8, "pareja_joven_sin_hijos": 1.4,
                  "familia_joven": 0.3, "familia_adulta": 0.2}),
    (_es_rec(2), {"pareja_joven_sin_hijos": 1.6, "pareja_adulta_sin_hijos": 1.4,
                  "familia_joven": 1.2, "soltero_joven": 0.8}),
    (_rec_3mas, {"familia_joven": 2.2, "familia_adulta": 2.0, "soltero_joven": 0.25,
                 "pareja_joven_sin_hijos": 0.5}),
    (_m2_chico, {"soltero_joven": 1.8, "soltero_adulto": 1.4, "familia_joven": 0.4,
                 "familia_adulta": 0.3}),
    (_m2_grande, {"familia_joven": 1.7, "familia_adulta": 1.8, "pareja_adulta_sin_hijos": 1.3,
                  "soltero_joven": 0.4}),
    (_feature("ludoteca", "juegos_infantiles", "canchas"), {"familia_joven": 2.5, "familia_adulta": 1.6,
                                                            "soltero_joven": 0.3}),
    (_feature("pet_friendly", "cowork", "gimnasio", "sky_bar"), {"soltero_joven": 1.5,
                                                                 "pareja_joven_sin_hijos": 1.4,
                                                                 "familia_adulta": 0.7}),
    (_feature("cuarto_servicio", "bodega"), {"familia_adulta": 1.5, "pareja_adulta_sin_hijos": 1.3}),
]


async def _priors_ciclo_vida(db) -> Dict[str, float]:
    """Prior P(etapa) = promedio de los estudios 4S (ciclo_vida_pct MEDIDO, no inventado).
    Fail-open a prior uniforme si no hay facts. Las etapas se DESCUBREN del dato."""
    suma: Dict[str, float] = {}
    n_estudios: Dict[str, int] = {}
    try:
        async for f in db.facts_4s.find({"tema": "perfil", "pregunta": "ciclo_vida_pct"}, {"_id": 0}):
            et, v = f.get("opcion"), f.get("valor")
            if et and v is not None:
                suma[et] = suma.get(et, 0.0) + float(v)
                n_estudios[et] = n_estudios.get(et, 0) + 1
    except Exception as e:
        log.warning("[etapa_vida] priors fail-open: %s", e)
    if not suma:
        return {}
    prior = {et: suma[et] / n_estudios[et] for et in suma}
    total = sum(prior.values()) or 1.0
    return {et: v / total for et, v in prior.items()}


def _posterior(prior: Dict[str, float], senales: List[Tuple[str, str]]) -> Dict[str, float]:
    post = dict(prior)
    for dim, val in senales:
        for pred, mults in _VEROSIMILITUDES:
            if pred(dim, str(val)):
                for et in post:
                    post[et] *= mults.get(et, 1.0)   # etapa no nombrada = neutra (universal)
    total = sum(post.values()) or 1.0
    return {et: v / total for et, v in post.items()}


async def etapa_de_vida(db, colonias: Optional[Set[str]] = None) -> Dict[str, Any]:
    prior = await _priors_ciclo_vida(db)
    if not prior:
        return {"es_estimado": True, "n_visitantes": 0, "filas": [],
                "lectura": "Sin priors 4S de ciclo de vida — corre el loader de facts."}

    por_visitante: Dict[str, List[Tuple[str, str]]] = {}
    try:
        async for a in db.demand_atoms.find({}, {"_id": 0, "visitor_id": 1, "colonia": 1,
                                                 "dimension": 1, "valor": 1}):
            if colonias and a.get("colonia") not in colonias:
                continue
            if a.get("visitor_id"):
                por_visitante.setdefault(a["visitor_id"], []).append(
                    (a.get("dimension", ""), a.get("valor", "")))
    except Exception as e:
        log.warning("[etapa_vida] atoms fail-open: %s", e)

    filas = []
    demanda_dist: Dict[str, float] = {et: 0.0 for et in prior}
    for v, senales in por_visitante.items():
        post = _posterior(prior, senales)
        top = max(post, key=post.get)
        filas.append({"visitor_id": v, "etapa": top, "confianza_pct": round(post[top] * 100, 1),
                      "n_senales": len(senales), "es_estimado": len(senales) < 3,
                      "distribucion": {et: round(p * 100, 1) for et, p in
                                       sorted(post.items(), key=lambda x: -x[1])[:3]}})
        for et, p in post.items():
            demanda_dist[et] += p
    filas.sort(key=lambda x: -x["confianza_pct"])

    total = sum(demanda_dist.values()) or 1.0
    comparativa = [{"etapa": et,
                    "demanda_pct": round(demanda_dist[et] / total * 100, 1),
                    "demografia_4s_pct": round(prior[et] * 100, 1),
                    # >1: esta etapa BUSCA más de lo que la demografía sugiere — a quién construirle
                    "sobre_representacion": round((demanda_dist[et] / total) / prior[et], 2) if prior[et] else None}
                   for et in sorted(prior, key=lambda e: -demanda_dist[e])]
    top_dem = comparativa[0] if comparativa else None
    return {"n_visitantes": len(filas), "etapas_descubiertas": sorted(prior),
            "visitantes": filas[:20], "comparativa_demanda_vs_demografia": comparativa,
            "es_estimado": len(filas) < 5,
            "lectura": (f"{len(filas)} visitantes inferidos. La demanda viva la lidera "
                        f"'{top_dem['etapa']}' ({top_dem['demanda_pct']}%) vs {top_dem['demografia_4s_pct']}% "
                        f"en la demografía 4S — sobre-representación {top_dem['sobre_representacion']}x.")
                       if top_dem else "Sin visitantes con señal."}


# ═══ E2 · SALIENCIA VISUAL (photo_dwell/photo_zoom YA capturados) ══════════════
async def saliencia_visual(db, colonias: Optional[Set[str]] = None, dias: int = 90) -> Dict[str, Any]:
    corte = datetime.now(timezone.utc) - timedelta(days=dias)
    dwell_por_foto: Dict[Tuple[str, str], List[float]] = {}
    zoom_por_foto: Dict[Tuple[str, str], int] = {}
    dwell_por_posicion: Dict[str, List[float]] = {}
    visitantes: Dict[str, List[float]] = {}
    n = 0
    try:
        async for s in db.buyer_signals.find({}, {"_id": 0}):
            if s.get("type") not in ("photo_dwell", "photo_zoom"):
                continue
            dt = _ts_dt(s.get("created_at_dt"))
            if dt and dt < corte:
                continue
            dev = str(s.get("entity_id") or "?")
            foto = str(s.get("value") if s.get("value") is not None else "?")
            n += 1
            if s["type"] == "photo_zoom":
                zoom_por_foto[(dev, foto)] = zoom_por_foto.get((dev, foto), 0) + 1
                continue
            ms = float(s.get("dwell_ms") or 0)
            dwell_por_foto.setdefault((dev, foto), []).append(ms)
            dwell_por_posicion.setdefault(foto, []).append(ms)
            if s.get("visitor_id"):
                visitantes.setdefault(s["visitor_id"], []).append(ms)
    except Exception as e:
        log.warning("[saliencia] fail-open: %s", e)

    top_fotos = sorted(
        [{"desarrollo": d, "foto": f, "dwell_mediano_ms": round(_med(v)), "n": len(v),
          "zooms": zoom_por_foto.get((d, f), 0)} for (d, f), v in dwell_por_foto.items()],
        key=lambda x: -x["dwell_mediano_ms"])
    curva = [{"posicion": p, "dwell_mediano_ms": round(_med(v)), "n": len(v)}
             for p, v in sorted(dwell_por_posicion.items())]

    # × PERFIL: dwell mediano por etapa de vida inferida (E1) — quién se detiene más
    por_etapa: Dict[str, List[float]] = {}
    try:
        prior = await _priors_ciclo_vida(db)
        if prior:
            atoms_v: Dict[str, List[Tuple[str, str]]] = {}
            async for a in db.demand_atoms.find({}, {"_id": 0, "visitor_id": 1, "dimension": 1, "valor": 1}):
                if a.get("visitor_id") in visitantes:
                    atoms_v.setdefault(a["visitor_id"], []).append((a.get("dimension", ""), a.get("valor", "")))
            for v, dwells in visitantes.items():
                if v in atoms_v:
                    post = _posterior(prior, atoms_v[v])
                    et = max(post, key=post.get)
                    por_etapa.setdefault(et, []).extend(dwells)
    except Exception as e:
        log.warning("[saliencia] etapa fail-open: %s", e)
    saliencia_etapa = [{"etapa": et, "dwell_mediano_ms": round(_med(v)), "n_dwells": len(v)}
                       for et, v in sorted(por_etapa.items(), key=lambda x: -_med(x[1]))]

    return {"dias_ventana": dias, "n_senales_foto": n,
            "top_fotos": top_fotos[:15], "curva_atencion_por_posicion": curva,
            "saliencia_por_etapa": saliencia_etapa,
            "es_estimado": n < 10,
            "nota": "Cuando la metadata de fotos traiga TIPO (fachada/cocina/roof/amenidad), la saliencia se segmenta sola por tipo.",
            "lectura": (f"{n} señales de foto. La que más retiene: foto {top_fotos[0]['foto']} de "
                        f"{top_fotos[0]['desarrollo']} ({top_fotos[0]['dwell_mediano_ms']/1000:.1f}s medianos).")
                       if top_fotos else "Sin señales de fotos en la ventana."}


# ═══ E3 · COHORTES GEMELAS ("compradores como tú terminaron en X") ═════════════
_DESTINO_TIPOS = {"lead": 3.0, "intent": 2.0, "unit_save": 1.5, "save": 1.5, "like": 1.0}


async def cohortes_gemelas(db, visitor_id: Optional[str] = None,
                           colonias: Optional[Set[str]] = None,
                           min_similitud: float = 0.2) -> Dict[str, Any]:
    llaves: Dict[str, Set[str]] = {}
    try:
        async for a in db.demand_atoms.find({}, {"_id": 0, "visitor_id": 1, "colonia": 1,
                                                 "dimension": 1, "valor": 1}):
            if colonias and a.get("colonia") not in colonias:
                continue
            d = a.get("dimension", "")
            if not a.get("visitor_id") or d.startswith(("busqueda.texto", "lexico.")):
                continue
            llaves.setdefault(a["visitor_id"], set()).add(f"{d}={a.get('valor')}")
    except Exception as e:
        log.warning("[gemelas] atoms fail-open: %s", e)

    destinos: Dict[str, Dict[str, float]] = {}   # visitor → {destino: peso}
    try:
        async for s in db.buyer_signals.find({}, {"_id": 0, "type": 1, "visitor_id": 1, "entity_id": 1}):
            w = _DESTINO_TIPOS.get(s.get("type"))
            if w and s.get("visitor_id") and s.get("entity_id"):
                d = destinos.setdefault(s["visitor_id"], {})
                d[str(s["entity_id"])] = d.get(str(s["entity_id"]), 0.0) + w
    except Exception as e:
        log.warning("[gemelas] signals fail-open: %s", e)

    def _jaccard(a: Set[str], b: Set[str]) -> float:
        u = len(a | b)
        return len(a & b) / u if u else 0.0

    def _gemelos_de(v: str) -> List[Tuple[str, float]]:
        base = llaves.get(v, set())
        if not base:
            return []
        out = [(o, _jaccard(base, k)) for o, k in llaves.items() if o != v]
        return sorted([(o, s) for o, s in out if s >= min_similitud], key=lambda x: -x[1])[:10]

    def _destinos_de_gemelos(gem: List[Tuple[str, float]]) -> List[Dict[str, Any]]:
        agg: Dict[str, float] = {}
        for o, sim in gem:
            for dest, w in destinos.get(o, {}).items():
                agg[dest] = agg.get(dest, 0.0) + w * sim   # gemelo más parecido pesa más
        return [{"destino": d, "peso": round(w, 2)}
                for d, w in sorted(agg.items(), key=lambda x: -x[1])[:5]]

    if visitor_id:
        gem = _gemelos_de(visitor_id)
        dest = _destinos_de_gemelos(gem)
        return {"visitor_id": visitor_id, "n_gemelos": len(gem),
                "gemelos": [{"visitor_id": o, "similitud": round(s, 2)} for o, s in gem],
                "destinos_de_gemelos": dest,
                "es_estimado": len(gem) < 3,
                "lectura": (f"Compradores como este visitante terminaron en: "
                            f"{', '.join(d['destino'] for d in dest[:3])}.") if dest else
                           "Sus gemelos aún no dejan huella de destino."}

    filas = []
    for v in llaves:
        gem = _gemelos_de(v)
        if not gem:
            continue
        dest = _destinos_de_gemelos(gem)
        filas.append({"visitor_id": v, "n_gemelos": len(gem),
                      "similitud_max": max(s for _, s in gem),
                      "destino_sugerido": dest[0]["destino"] if dest else None,
                      "n_llaves": len(llaves[v])})
    filas.sort(key=lambda x: (-x["n_gemelos"], -x["similitud_max"]))
    con_destino = sum(1 for f in filas if f["destino_sugerido"])
    return {"n_visitantes": len(llaves), "n_con_gemelos": len(filas),
            "filas": filas[:20],
            "es_estimado": len(filas) < 3,
            "lectura": (f"{len(filas)} visitantes tienen gemelos (similitud ≥{min_similitud}); "
                        f"{con_destino} ya tienen un destino sugerido por su cohorte — "
                        f"el 'compradores como tú' listo para servir.") if filas else
                       "Aún no hay pares de visitantes suficientemente parecidos."}


# ═══ E4 · PRIMA DE MARCA DEL DESARROLLADOR ═════════════════════════════════════
# REGISTRO de componentes 0-100: absorción (vende), demanda (lo buscan), prima (cobra más y
# aun así vende). Score = promedio ponderado — un componente nuevo = una entrada.
_PESOS_MARCA = {"absorcion": 0.40, "demanda": 0.30, "prima_precio": 0.30}


async def prima_marca(db, colonias: Optional[Set[str]] = None) -> Dict[str, Any]:
    from demand_mirror import _oferta_vectores
    unidades = await _oferta_vectores(db, colonias)

    pm2_col: Dict[str, List[float]] = {}
    for u in unidades:
        if u.get("precio") and u.get("m2"):
            pm2_col.setdefault(u["colonia"], []).append(u["precio"] / u["m2"])
    pm2_col_med = {c: _med(v) for c, v in pm2_col.items()}

    devs: Dict[str, Dict[str, Any]] = {}
    for u in unidades:
        d = devs.setdefault(str(u.get("dev_id") or "?"),
                            {"total": 0, "disponibles": 0, "primas": [], "colonias": set()})
        d["total"] += 1
        d["colonias"].add(u["colonia"])
        if u.get("disponible"):
            d["disponibles"] += 1
        base = pm2_col_med.get(u["colonia"])
        if u.get("precio") and u.get("m2") and base:
            d["primas"].append((u["precio"] / u["m2"]) / base - 1)

    senales_dev: Dict[str, int] = {}
    try:
        async for s in db.buyer_signals.find({}, {"_id": 0, "entity_id": 1, "type": 1}):
            if s.get("entity_id"):
                senales_dev[str(s["entity_id"])] = senales_dev.get(str(s["entity_id"]), 0) + 1
    except Exception as e:
        log.warning("[marca] signals fail-open: %s", e)

    nombres: Dict[str, str] = {}
    try:
        async for d in db.developments.find({}, {"_id": 0, "id": 1, "name": 1, "nombre": 1}):
            if d.get("id"):
                nombres[str(d["id"])] = d.get("name") or d.get("nombre") or str(d["id"])
    except Exception:
        pass

    dem_max = max((senales_dev.get(k, 0) / max(1, v["total"]) for k, v in devs.items()), default=0)
    filas = []
    for dev, d in devs.items():
        if dev == "?" or d["total"] < 3:
            continue
        absorcion = (1 - d["disponibles"] / d["total"]) * 100
        dem_unidad = senales_dev.get(dev, 0) / d["total"]
        demanda = (dem_unidad / dem_max * 100) if dem_max else 0.0
        prima_med = _med(d["primas"])
        # cobra MÁS que su colonia y aun así absorbe = marca; prima sin absorción NO es marca
        prima_score = max(0.0, min(100.0, 50 + (prima_med or 0) * 200)) * (0.5 + absorcion / 200)
        componentes = {"absorcion": round(absorcion, 1), "demanda": round(demanda, 1),
                       "prima_precio": round(min(100.0, prima_score), 1)}
        score = round(sum(componentes[k] * _PESOS_MARCA[k] for k in componentes), 1)
        filas.append({"dev_id": dev, "nombre": nombres.get(dev, dev), "score_marca": score,
                      **componentes, "prima_pm2_pct": round((prima_med or 0) * 100, 1),
                      "unidades": d["total"], "senales": senales_dev.get(dev, 0),
                      "colonias": sorted(d["colonias"])[:3],
                      "es_estimado": senales_dev.get(dev, 0) < 5})
    filas.sort(key=lambda x: -x["score_marca"])
    return {"n_devs": len(filas), "filas": filas[:25],
            "pesos": _PESOS_MARCA,
            "es_estimado": not filas,
            "lectura": (f"Marca #1: {filas[0]['nombre']} ({filas[0]['score_marca']}/100) — "
                        f"absorbe {filas[0]['absorcion']}% con prima de {filas[0]['prima_pm2_pct']}% "
                        f"sobre su colonia. Cobrar más Y vender = marca.") if filas else
                       "Sin desarrolladores con ≥3 unidades."}
