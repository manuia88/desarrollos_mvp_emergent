"""
market_timeline.py — LA BITÁCORA TEMPORAL del mercado (la 4ª dimensión del genoma).

Pregunta del founder: "en 4 años quiero ver la evolución de TODA la data que hoy recolectamos —
¿cuánto costaba un PH de cierta tipología con ciertas features? ¿las mensualidades? ¿las tasas?"

Estado antes de este motor: la demanda YA es temporal (átomos con ts) y las tasas YA se guardan
(gov_rates), pero la OFERTA solo existía como estado actual — el precio de hoy PISABA al de ayer.

Este motor lo arregla con EVENT-SOURCING por cambio:
  · snapshot_oferta()   — por unidad: si (precio, disponible, vector) cambió vs su último evento,
                          se escribe un evento nuevo con fecha. Nada se pisa, nunca.
  · snapshot_contexto() — foto diaria idempotente del contexto: tasas (BANXICO), inventario,
                          mediana $/m², átomos — el "clima" del mercado de ese día.
  · evolucion()         — la serie temporal UNIVERSAL: cualquier filtro del genoma (dimensión,
                          valor, colonia, o UNA unidad específica) × granularidad (día/mes/año)
                          → demanda, oferta que satisface, $/m² mediana y tasa, por periodo.

En 4 años: "el PH u-402 de 120m² con roof" = evolucion(unit_id=...) → su precio mes a mes.
UNIVERSALIDAD: el filtro reusa la semántica del espejo (registro) — cualquier dimensión presente
o futura filtra sin tocar este código. FAIL-OPEN. Superadmin-only en superficie.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

log = logging.getLogger("dmx.market_timeline")


def _ahora():
    return datetime.now(timezone.utc)


def _hash_estado(u: Dict[str, Any]) -> str:
    base = {"p": u.get("precio"), "d": u.get("disponible"), "v": u.get("vector"),
            "c": u.get("crudos"), "s": u.get("status")}
    return hashlib.sha256(json.dumps(base, sort_keys=True, default=str).encode()).hexdigest()[:16]


# REGISTRO de granularidades (universalidad: una nueva = una entrada). El founder pide CUALQUIER
# temporalidad: hora → día → semana → mes → trimestre → año, sin límite de horizonte.
def _g_hora(dt): return dt.isoformat()[:13]
def _g_dia(dt): return dt.isoformat()[:10]
def _g_semana(dt): iso = dt.isocalendar(); return f"{iso[0]}-W{iso[1]:02d}"
def _g_mes(dt): return dt.isoformat()[:7]
def _g_trimestre(dt): return f"{dt.year}-Q{(dt.month - 1) // 3 + 1}"
def _g_ano(dt): return str(dt.year)


GRANULARIDADES = {"hora": _g_hora, "dia": _g_dia, "semana": _g_semana,
                  "mes": _g_mes, "trimestre": _g_trimestre, "ano": _g_ano, "año": _g_ano}


def _periodo(ts, granularidad: str) -> Optional[str]:
    if ts is None:
        return None
    try:
        if isinstance(ts, str):
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        fn = GRANULARIDADES.get(granularidad, _g_mes)
        return fn(ts)
    except Exception:
        s = str(ts)
        return {"hora": s[:13], "dia": s[:10], "semana": s[:7], "mes": s[:7],
                "trimestre": s[:7], "ano": s[:4], "año": s[:4]}.get(granularidad, s[:7])


# ── snapshot de OFERTA (event-sourced por cambio) ─────────────────────────────
async def snapshot_oferta(db) -> Dict[str, Any]:
    from demand_mirror import _oferta_vectores
    unidades = await _oferta_vectores(db)

    # último hash conocido por unidad
    ultimo: Dict[str, str] = {}
    try:
        async for e in db.oferta_timeline.find({}, {"_id": 0, "unit_id": 1, "hash": 1, "ts": 1}):
            uid = str(e.get("unit_id"))
            if uid not in ultimo or str(e.get("ts", "")) > ultimo[uid][1]:
                ultimo[uid] = (e.get("hash"), str(e.get("ts", "")))
    except Exception as e:
        log.warning("[timeline] leer fail-open: %s", e)

    nuevos, sin_cambio = 0, 0
    ts = _ahora()
    for u in unidades:
        uid = str(u.get("unit_id") or "")
        if not uid:
            continue
        h = _hash_estado(u)
        if ultimo.get(uid, (None,))[0] == h:
            sin_cambio += 1
            continue
        evento = {"unit_id": uid, "colonia": u["colonia"], "dev_id": u.get("dev_id"),
                  "ts": ts, "hash": h,
                  "precio": u.get("precio"), "m2": u.get("m2"),
                  "recamaras": u.get("recamaras"), "piso": u.get("piso"),
                  "pm2": round(u["precio"] / u["m2"]) if (u.get("precio") and u.get("m2")) else None,
                  "disponible": u["disponible"], "status": u.get("status"),
                  "crudos": u.get("crudos") or {},
                  "vector": u["vector"]}
        try:
            await db.oferta_timeline.insert_one(evento)
            nuevos += 1
        except Exception as e:
            log.warning("[timeline] insert fail-open: %s", e)
    try:
        await db.oferta_timeline.create_index("unit_id")
    except Exception:
        pass
    return {"unidades": len(unidades), "eventos_nuevos": nuevos, "sin_cambio": sin_cambio}


# ── snapshot de CONTEXTO (el clima del mercado, diario idempotente) ───────────
async def snapshot_contexto(db) -> Dict[str, Any]:
    from demand_mirror import _oferta_vectores
    fecha = _ahora().isoformat()[:10]
    tasas: Dict[str, float] = {}
    try:
        from banxico_rates import get_rate_sync
        for k in ("tiie_28d", "cetes_28d", "tiie_91d"):
            try:
                tasas[k] = float(get_rate_sync(k))
            except Exception:
                continue
    except Exception as e:
        log.warning("[timeline] tasas fail-open: %s", e)

    unidades = await _oferta_vectores(db)
    pm2s = sorted(u["precio"] / u["m2"] for u in unidades if u.get("precio") and u.get("m2"))
    n_atomos = 0
    try:
        async for _ in db.demand_atoms.find({}, {"_id": 1}):
            n_atomos += 1
            if n_atomos >= 100000:
                break
    except Exception:
        pass

    doc = {"fecha": fecha, "ts": _ahora(), "tasas": tasas,
           "n_unidades": len(unidades),
           "n_disponibles": sum(1 for u in unidades if u["disponible"]),
           "pm2_mediana": round(pm2s[len(pm2s) // 2]) if pm2s else None,
           "n_atomos": n_atomos}
    await db.contexto_timeline.update_one({"fecha": fecha}, {"$set": doc}, upsert=True)
    return {"ok": True, **{k: v for k, v in doc.items() if k != "ts"}}


# ── EVOLUCIÓN v2: hipersegmentada — cortes MÚLTIPLES (Y lógico) + DESGLOSE ────
def _normaliza_cortes(dimension, valor, cortes) -> List[Dict[str, str]]:
    """Acepta 1 corte (dimension/valor) o N cortes [{dimension, valor}] — retrocompatible."""
    out = [c for c in (cortes or []) if c.get("dimension")]
    if dimension:
        out.append({"dimension": dimension, "valor": valor})
    return out


def _unidad_pasa(ev: Dict[str, Any], cortes: List[Dict[str, str]]) -> Optional[bool]:
    """¿El estado de la unidad satisface TODOS los cortes? (semántica del espejo, universal).
    None si algún corte es de una dimensión sin lado-oferta (se reporta, no se finge)."""
    from demand_mirror import _satisface
    vec = ev.get("vector") or {}
    # crudos del evento con FALLBACK al vector (eventos viejos o insertados a mano siguen vivos)
    fila = {"vector": vec,
            "recamaras": ev.get("recamaras") if ev.get("recamaras") is not None else vec.get("producto.recamaras"),
            "m2": ev.get("m2"), "precio": ev.get("precio"),
            "piso": ev.get("piso") if ev.get("piso") is not None else vec.get("producto.nivel")}
    for c in cortes:
        s = _satisface(fila, c["dimension"], str(c.get("valor")))
        if s is None:
            return None
        if not s:
            return False
    return True


async def evolucion(db, *, colonias: Optional[Set[str]] = None,
                    dimension: Optional[str] = None, valor: Optional[str] = None,
                    cortes: Optional[List[Dict[str, str]]] = None,
                    desglosar_por: Optional[str] = None,
                    unit_id: Optional[str] = None,
                    desde: Optional[str] = None, hasta: Optional[str] = None,
                    granularidad: str = "mes") -> Dict[str, Any]:
    """La serie temporal HIPERSEGMENTADA:
    · cortes múltiples con Y lógico ('2 rec Y roof Y ≤5mdp') — el visitante cuenta solo si pidió TODO
    · desglosar_por: una serie por CADA valor de esa dimensión (hipergranularidad)
    · granularidad: hora/día/semana/mes/trimestre/año — cualquier horizonte
    · tensión (demanda/oferta) calculada por periodo · unit_id: la vida de UNA unidad."""
    lista_cortes = _normaliza_cortes(dimension, valor, cortes)

    def _en_rango(p: Optional[str]) -> bool:
        if not p:
            return False
        return (not desde or p >= desde[:len(p)]) and (not hasta or p <= hasta[:len(p)])

    # DEMANDA: visitantes por (periodo × dimensión × valor) + pesos — una pasada, todo en memoria
    vis: Dict[tuple, Set[str]] = {}      # (periodo, dim, val) → visitantes
    pesos: Dict[tuple, float] = {}
    todos_vis: Dict[str, Set[str]] = {}  # periodo → todos los visitantes (sin corte)
    try:
        async for a in db.demand_atoms.find({}, {"_id": 0}):
            if colonias and a.get("colonia") not in colonias:
                continue
            p = _periodo(a.get("ts"), granularidad)
            if not _en_rango(p):
                continue
            v = a.get("visitor_id") or a.get("search_id") or "?"
            k = (p, a["dimension"], a["valor"])
            vis.setdefault(k, set()).add(v)
            pesos[k] = pesos.get(k, 0.0) + float(a.get("peso", 1.0))
            todos_vis.setdefault(p, set()).add(v)
    except Exception as e:
        log.warning("[evolucion] demanda fail-open: %s", e)

    def _demanda_periodo(p: str, extra_corte: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """Visitantes que pidieron TODOS los cortes (∩) en el periodo — el Y lógico."""
        activos = lista_cortes + ([extra_corte] if extra_corte else [])
        if not activos:
            conjunto = todos_vis.get(p, set())
            peso = sum(w for (pp, _, _), w in pesos.items() if pp == p)
            return {"visitantes": len(conjunto), "senales": round(peso, 1)}
        conjuntos = [vis.get((p, c["dimension"], str(c.get("valor"))), set()) for c in activos]
        inter = set.intersection(*conjuntos) if conjuntos else set()
        peso = sum(pesos.get((p, c["dimension"], str(c.get("valor"))), 0.0) for c in activos)
        return {"visitantes": len(inter), "senales": round(peso, 1)}

    # OFERTA: eventos por unidad (reconstrucción: último evento ≤ fin del periodo)
    eventos: Dict[str, List[Dict[str, Any]]] = {}
    try:
        async for ev in db.oferta_timeline.find({}, {"_id": 0}):
            if unit_id and str(ev.get("unit_id")) != str(unit_id):
                continue
            if colonias and ev.get("colonia") not in colonias:
                continue
            eventos.setdefault(str(ev["unit_id"]), []).append(ev)
    except Exception as e:
        log.warning("[evolucion] oferta fail-open: %s", e)

    periodos: Set[str] = set(todos_vis)
    for evs in eventos.values():
        for ev in evs:
            p = _periodo(ev.get("ts"), granularidad)
            if _en_rango(p):
                periodos.add(p)

    def _fila_periodo(p: str, extra_corte: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        estado: Dict[str, Dict[str, Any]] = {}
        for uid, evs in eventos.items():
            cand = [e for e in evs if (_periodo(e.get("ts"), granularidad) or "") <= p]
            if cand:
                estado[uid] = max(cand, key=lambda e: str(e.get("ts", "")))
        activos = lista_cortes + ([extra_corte] if extra_corte else [])
        sin_espejo = False
        vivos = []
        for e in estado.values():
            if not e.get("disponible"):
                continue
            pasa = _unidad_pasa(e, activos) if activos else True
            if pasa is None:
                sin_espejo = True
            elif pasa:
                vivos.append(e)
        dem = _demanda_periodo(p, extra_corte)
        pm2s = sorted(e["pm2"] for e in vivos if e.get("pm2"))
        oferta = None if sin_espejo else len(vivos)
        return {"periodo": p, "demanda_visitantes": dem["visitantes"], "senales": dem["senales"],
                "oferta_disponible": oferta,
                "tension": (round(dem["visitantes"] / oferta, 2) if oferta else None),
                "pm2_mediana": pm2s[len(pm2s) // 2] if pm2s else None,
                "precio_unidad": (list(estado.values())[0].get("precio")
                                  if unit_id and estado else None)}

    # HIPERGRANULARIDAD: desglose → una serie por cada valor observado de esa dimensión
    if desglosar_por:
        valores = sorted({val for (_, d, val) in vis if d == desglosar_por})
        series_por_valor = {val: [_fila_periodo(p, {"dimension": desglosar_por, "valor": val})
                                  for p in sorted(periodos)] for val in valores}
        return {"granularidad": granularidad, "desglose": desglosar_por,
                "valores": valores, "n_periodos": len(periodos),
                "filtro": {"colonias": sorted(colonias) if colonias else None,
                           "cortes": lista_cortes, "unit_id": unit_id, "desde": desde, "hasta": hasta},
                "es_estimado": not bool(valores),
                "series_por_valor": series_por_valor,
                "lectura": (f"Desglose por {desglosar_por}: {len(valores)} series × "
                            f"{len(periodos)} periodos ({granularidad}).") if valores else
                           f"Sin señal para desglosar por {desglosar_por}."}

    series = [_fila_periodo(p) for p in sorted(periodos)]

    # contexto (tasas) por periodo
    try:
        ctx: Dict[str, List[float]] = {}
        async for c in db.contexto_timeline.find({}, {"_id": 0}):
            p = _periodo(c.get("fecha"), granularidad)
            t = (c.get("tasas") or {}).get("tiie_28d")
            if p and t is not None:
                ctx.setdefault(p, []).append(float(t))
        for s in series:
            vals = ctx.get(s["periodo"])
            s["tasa_tiie_28d"] = round(sum(vals) / len(vals), 2) if vals else None
    except Exception as e:
        log.warning("[evolucion] contexto fail-open: %s", e)

    return {"granularidad": granularidad, "n_periodos": len(series),
            "filtro": {"colonias": sorted(colonias) if colonias else None,
                       "cortes": lista_cortes, "unit_id": unit_id,
                       "desde": desde, "hasta": hasta},
            "es_estimado": not bool(series), "series": series,
            "lectura": (f"{len(series)} periodos ({granularidad}). La bitácora acumula desde hoy — "
                        f"cada cambio de precio/estado queda escrito para siempre.") if series else
                       "Bitácora vacía aún — los snapshots corren solos (arranque + cron diario)."}


# ── INSTANTÁNEA: la pregunta-2033 del founder ────────────────────────────────
# "¿De qué tamaño eran los depas VENDIDOS con balcón de 10m² en mayo 2027? ¿qué precio? ¿qué
# amenidades? ¿3 recámaras?" — cualquier fecha, cualquier mezcla de dimensiones, y la respuesta
# trae VALORES UNITARIOS (cada depa con todo su estado de ESE momento) + VALORES MÚLTIPLES
# (agregados). Operadores universales sobre cualquier campo: =, >=, <=, rango, tiene.
_OPS = {"=", ">=", "<=", "rango", "tiene"}


def _valor_en_evento(ev: Dict[str, Any], campo: str) -> Any:
    """Resuelve un campo en CUALQUIER capa del evento: top-level → crudos → vector. Universal:
    un campo nuevo capturado mañana ya es consultable hoy."""
    if campo in ev and not isinstance(ev.get(campo), dict):
        return ev.get(campo)
    crudos = ev.get("crudos") or {}
    if campo in crudos:
        return crudos[campo]
    vec = ev.get("vector") or {}
    if campo in vec:
        return vec[campo]
    corto = f"producto.{campo}"
    if corto in vec:
        return vec[corto]
    return None


def _aplica_corte(ev: Dict[str, Any], c: Dict[str, Any]) -> bool:
    campo, op = c.get("campo") or c.get("dimension"), c.get("op", "=")
    if op == "tiene":   # feature por slug: balcon, roof_garden…
        return f"producto.feature.{c.get('valor')}" in (ev.get("vector") or {})
    v = _valor_en_evento(ev, campo)
    if v is None:
        return False
    try:
        fv, cv = float(v), float(c.get("valor"))
        if op == "=":
            return abs(fv - cv) < 1e-9
        if op == ">=":
            return fv >= cv
        if op == "<=":
            return fv <= cv
        if op == "rango":
            return cv <= fv <= float(c.get("valor2"))
    except (TypeError, ValueError):
        return str(v).strip().lower() == str(c.get("valor")).strip().lower() if op == "=" else False
    return False


async def instantanea(db, *, fecha: Optional[str] = None,
                      colonias: Optional[Set[str]] = None,
                      cortes: Optional[List[Dict[str, Any]]] = None,
                      vendidas_desde: Optional[str] = None, vendidas_hasta: Optional[str] = None,
                      limite: int = 100) -> Dict[str, Any]:
    """El mercado COMO ERA en `fecha` (o hoy), filtrado por cualquier mezcla de cortes.
    vendidas_desde/hasta: solo unidades cuya VENTA (disponible→no) ocurrió en ese rango.
    Devuelve los registros unitarios (cada depa con su estado de ese momento) + agregados."""
    corte_fecha = fecha or "9999-12-31"

    eventos: Dict[str, List[Dict[str, Any]]] = {}
    try:
        async for ev in db.oferta_timeline.find({}, {"_id": 0}):
            if colonias and ev.get("colonia") not in colonias:
                continue
            eventos.setdefault(str(ev["unit_id"]), []).append(ev)
    except Exception as e:
        log.warning("[instantanea] fail-open: %s", e)

    seleccion = []
    for uid, evs in sorted(eventos.items()):
        evs.sort(key=lambda e: str(e.get("ts", "")))
        pasados = [e for e in evs if str(e.get("ts", ""))[:len(corte_fecha)] <= corte_fecha]
        if not pasados:
            continue
        estado = pasados[-1]   # cómo ERA la unidad en esa fecha

        # transición de VENTA dentro del rango pedido (disponible → no disponible)
        if vendidas_desde or vendidas_hasta:
            venta_ts = None
            previo_disponible = False
            for e in evs:
                if previo_disponible and not e.get("disponible"):
                    venta_ts = str(e.get("ts", ""))
                previo_disponible = bool(e.get("disponible"))
            if not venta_ts:
                continue
            if vendidas_desde and venta_ts[:len(vendidas_desde)] < vendidas_desde:
                continue
            if vendidas_hasta and venta_ts[:len(vendidas_hasta)] > vendidas_hasta:
                continue
            estado = dict(estado)
            estado["vendida_ts"] = venta_ts

        if all(_aplica_corte(estado, c) for c in (cortes or [])):
            seleccion.append(estado)

    # VALORES MÚLTIPLES (agregados) sobre la selección
    def _med(vals):
        s = sorted(v for v in vals if v is not None)
        return s[len(s) // 2] if s else None
    feats: Dict[str, int] = {}
    recs: Dict[str, int] = {}
    for e in seleccion:
        for k in (e.get("vector") or {}):
            if k.startswith("producto.feature."):
                f = k.rsplit(".", 1)[1]
                feats[f] = feats.get(f, 0) + 1
        if e.get("recamaras") is not None:
            r = str(int(e["recamaras"]))
            recs[r] = recs.get(r, 0) + 1

    return {
        "fecha_consulta": fecha or "ahora",
        "ventana_venta": {"desde": vendidas_desde, "hasta": vendidas_hasta}
                         if (vendidas_desde or vendidas_hasta) else None,
        "cortes": cortes or [], "n_unidades": len(seleccion),
        "es_estimado": not bool(seleccion),
        # VALORES UNITARIOS: cada depa con TODO su estado de ese momento
        "unidades": [{k: v for k, v in e.items() if k != "hash"} for e in seleccion[:limite]],
        "agregados": {"precio_mediana": _med([e.get("precio") for e in seleccion]),
                      "m2_mediana": _med([e.get("m2") for e in seleccion]),
                      "pm2_mediana": _med([e.get("pm2") for e in seleccion]),
                      "recamaras_dist": recs,
                      "features_frecuencia": dict(sorted(feats.items(), key=lambda x: -x[1])[:15])},
        "lectura": (f"{len(seleccion)} unidades cumplen el corte"
                    + (f" (vendidas {vendidas_desde or ''}→{vendidas_hasta or ''})" if vendidas_desde or vendidas_hasta else "")
                    + (f" al {fecha}" if fecha else " hoy")
                    + ".") if seleccion else
                   "Ninguna unidad de la bitácora cumple ese corte — respuesta honesta, no vacío por error.",
    }
