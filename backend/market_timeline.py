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
    base = {"p": u.get("precio"), "d": u.get("disponible"), "v": u.get("vector")}
    return hashlib.sha256(json.dumps(base, sort_keys=True, default=str).encode()).hexdigest()[:16]


def _periodo(ts, granularidad: str) -> Optional[str]:
    if ts is None:
        return None
    try:
        if isinstance(ts, str):
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        s = ts.isoformat()
    except Exception:
        s = str(ts)
    return {"dia": s[:10], "mes": s[:7], "ano": s[:4], "año": s[:4]}.get(granularidad, s[:7])


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
                  "pm2": round(u["precio"] / u["m2"]) if (u.get("precio") and u.get("m2")) else None,
                  "disponible": u["disponible"], "vector": u["vector"]}
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


# ── EVOLUCIÓN: la serie temporal universal ────────────────────────────────────
async def evolucion(db, *, colonias: Optional[Set[str]] = None,
                    dimension: Optional[str] = None, valor: Optional[str] = None,
                    unit_id: Optional[str] = None,
                    desde: Optional[str] = None, hasta: Optional[str] = None,
                    granularidad: str = "mes") -> Dict[str, Any]:
    """Cualquier corte del genoma × tiempo. unit_id → la vida de UNA unidad (el PH exacto)."""
    from demand_mirror import _satisface

    def _en_rango(p: Optional[str]) -> bool:
        if not p:
            return False
        return (not desde or p >= desde[:len(p)]) and (not hasta or p <= hasta[:len(p)])

    # DEMANDA por periodo (visitantes únicos del corte)
    dem: Dict[str, Set[str]] = {}
    try:
        async for a in db.demand_atoms.find({}, {"_id": 0}):
            if colonias and a.get("colonia") not in colonias:
                continue
            if dimension and a["dimension"] != dimension:
                continue
            if valor and a["valor"] != str(valor):
                continue
            p = _periodo(a.get("ts"), granularidad)
            if not _en_rango(p):
                continue
            dem.setdefault(p, set()).add(a.get("visitor_id") or a.get("search_id") or "?")
    except Exception as e:
        log.warning("[evolucion] demanda fail-open: %s", e)

    # OFERTA por periodo: por unidad, su ÚLTIMO evento ≤ fin del periodo (reconstrucción honesta)
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

    periodos: Set[str] = set(dem)
    for evs in eventos.values():
        for ev in evs:
            p = _periodo(ev.get("ts"), granularidad)
            if _en_rango(p):
                periodos.add(p)

    series = []
    for p in sorted(periodos):
        estado_por_unidad: Dict[str, Dict[str, Any]] = {}
        for uid, evs in eventos.items():
            candidatos = [e for e in evs if (_periodo(e.get("ts"), granularidad) or "") <= p]
            if candidatos:
                estado_por_unidad[uid] = max(candidatos, key=lambda e: str(e.get("ts", "")))
        # filtro universal por dimensión (misma semántica del espejo — min/max/feature)
        def _pasa(ev: Dict[str, Any]) -> bool:
            if not dimension:
                return True
            fila = {"vector": ev.get("vector") or {}, "recamaras": None,
                    "m2": ev.get("m2"), "precio": ev.get("precio"), "piso": None}
            s = _satisface(fila, dimension, str(valor)) if valor else None
            return bool(s) if s is not None else False
        vivos = [e for e in estado_por_unidad.values() if e.get("disponible") and _pasa(e)]
        pm2s = sorted(e["pm2"] for e in vivos if e.get("pm2"))
        series.append({"periodo": p,
                       "demanda_visitantes": len(dem.get(p, set())),
                       "oferta_disponible": len(vivos),
                       "pm2_mediana": pm2s[len(pm2s) // 2] if pm2s else None,
                       "precio_unidad": (list(estado_por_unidad.values())[0].get("precio")
                                         if unit_id and estado_por_unidad else None)})

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
                       "dimension": dimension, "valor": valor, "unit_id": unit_id,
                       "desde": desde, "hasta": hasta},
            "es_estimado": not bool(series), "series": series,
            "lectura": (f"{len(series)} periodos ({granularidad}). La bitácora acumula desde hoy — "
                        f"cada cambio de precio/estado queda escrito para siempre.") if series else
                       "Bitácora vacía aún — los snapshots corren solos (arranque + cron diario)."}
