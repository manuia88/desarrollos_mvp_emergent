"""Phase 4 Batch 0 — Public marketplace routes extracted from server.py.
Endpoints: /api/colonias/*, /api/properties/*, /api/developments/*, /api/developers/*,
           /api/search/*, /api/health
Backward-compat: same URLs, same response shape.
"""
import os
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel

from data_seed import COLONIAS as SEED_COLONIAS, COLONIAS_BY_ID, PROPERTIES as SEED_PROPERTIES
from data_developments import DEVELOPMENTS, DEVELOPMENTS_BY_ID, DEVELOPERS, DEVELOPERS_BY_ID

router = APIRouter(tags=["public"])

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
DMX_FALLBACK_WHATSAPP = os.environ.get("DMX_FALLBACK_WHATSAPP", "+525512345678")

# ─── Dev overlay cache (shared singleton via module-level dict) ────────────────
_dev_overlay_cache: dict = {}


def invalidate_dev_overlay_cache(dev_id: str = None):
    if dev_id:
        _dev_overlay_cache.pop(dev_id, None)
    else:
        _dev_overlay_cache.clear()


async def _ensure_overlay_loaded(dev_id: str, db=None):
    if dev_id in _dev_overlay_cache:
        return _dev_overlay_cache[dev_id]
    if db is None:
        return {}
    try:
        o = await db.dev_overlays.find_one({"development_id": dev_id}, {"_id": 0}) or {}
    except Exception:
        o = {}
    _dev_overlay_cache[dev_id] = o
    return o


def _apply_overlay(d: dict) -> dict:
    overlay = _dev_overlay_cache.get(d["id"]) or {}
    fields = overlay.get("fields") or {}
    units_overlay = overlay.get("units_overlay") or []
    if not fields and not units_overlay:
        return d
    out = dict(d)
    PRIVATE = {"predial_private", "fiscal_private"}
    for k, v in fields.items():
        if k in PRIVATE:
            continue
        out[k] = v
    if units_overlay:
        out["units"] = units_overlay
    out["_overlay_synced_fields"] = sorted(k for k in fields.keys() if k not in PRIVATE)
    if overlay.get("last_auto_sync_at"):
        ts = overlay["last_auto_sync_at"]
        out["last_auto_sync_at"] = ts.isoformat() if hasattr(ts, "isoformat") else ts
    return out


def _dev_public(d: dict, include_units: bool = False) -> dict:
    d = _apply_overlay(d)
    out = {k: v for k, v in d.items() if k != "_id" and (include_units or k != "units")}
    if not include_units:
        out["units_sample"] = d.get("units", [])[:0]
    dev = DEVELOPERS_BY_ID.get(d["developer_id"])
    if dev:
        out["developer"] = {
            "id": dev["id"], "name": dev["name"],
            "founded_year": dev["founded_year"],
            "projects_delivered": dev["projects_delivered"],
            "logo_hue": dev.get("logo_hue", 231),
        }
    out["contact_phone"] = d.get("contact_phone") or DMX_FALLBACK_WHATSAPP
    return out


async def _enrich_listing(db, devs: list) -> list:
    """Enriquece las tarjetas del listado con dato FRESCO del dev, en BATCH (3 queries con $in ·
    no llamada por-item · ruta caliente). Cierra el ciclo: lo que el dev edita (precio/unidades/
    amenidades/foto) aparece en el listado del comprador, no solo en la ficha.
      1) overlays → precio/unidades frescas (calienta el cache que usa _apply_overlay)
      2) project_amenities → amenidades + servicios enriquecidos
      3) foto de portada REAL del dev (hero) si la subió."""
    ids = [d["id"] for d in devs]
    if not ids:
        return [_dev_public(d) for d in devs]
    # 1) overlays (calienta cache)
    try:
        async for o in db.dev_overlays.find({"development_id": {"$in": ids}}, {"_id": 0}):
            _dev_overlay_cache[o.get("development_id")] = o
    except Exception:
        pass
    # 2) amenidades enriquecidas
    amen_by: Dict[str, Any] = {}
    try:
        async for a in db.project_amenities.find(
                {"project_id": {"$in": ids}}, {"_id": 0, "project_id": 1, "amenities": 1, "servicios": 1}):
            amen_by[a.get("project_id")] = a
    except Exception:
        pass
    # 3) foto de portada real del dev (batch)
    hero_by: Dict[str, str] = {}
    try:
        from dev_assets import public_hero_map
        hero_by = await public_hero_map(db, ids)
    except Exception:
        hero_by = {}
    # 4) Señales de VALOR para la tarjeta: precio/m² vs promedio de la zona (AVM-ligero) + plusvalía
    #    real de la colonia (momentum) + forecast 12m si está disponible. Colonia en memoria (siempre
    #    disponible); forecast batch desde zone_forecasts (cuando el cron corra). AVM hedónico full = buy_signal.
    col_ids = list({d.get("colonia_id") for d in devs if d.get("colonia_id")})
    try:
        from data_seed import COLONIAS_BY_ID as _COLS
    except Exception:
        _COLS = {}
    fc_by_col: Dict[str, float] = {}
    if col_ids:
        try:
            async for fc in db.zone_forecasts.find(
                    {"zone_slug": {"$in": col_ids}, "available": True},
                    {"_id": 0, "zone_slug": 1, "horizons.12m.delta_pct": 1}):
                d12 = (((fc.get("horizons") or {}).get("12m") or {}).get("delta_pct"))
                if d12 is not None:
                    fc_by_col[fc.get("zone_slug")] = float(d12)
        except Exception:
            pass
    out = []
    for d in devs:
        card = _dev_public(d)
        cid = d.get("colonia_id")
        col = _COLS.get(cid) or {}
        m2lo = (d.get("m2_range") or [0])[0] or 0
        dev_pm2 = (d.get("price_from") or 0) / m2lo if m2lo else 0
        if dev_pm2:
            card["price_m2_dev"] = round(dev_pm2)
            zona_pm2 = col.get("price_m2_num") or ((col.get("price_m2") or 0) * 1000)
            if zona_pm2:
                card["precio_vs_zona_pct"] = round((dev_pm2 / float(zona_pm2) - 1) * 100)
        if col.get("momentum"):
            card["plusvalia_zona"] = col.get("momentum")        # tendencia real de la colonia
        if cid in fc_by_col:
            card["forecast_12m_pct"] = round(fc_by_col[cid], 1)  # forecast (cuando hay dato)
        am = amen_by.get(d["id"]) or {}
        rich = am.get("amenities") or card.get("amenities") or []
        card["amenities"] = rich
        card["amenidades_count"] = len(rich)
        serv = am.get("servicios") if isinstance(am.get("servicios"), dict) else {}
        card["servicios_top"] = [k for k, v in serv.items() if v][:2]
        hero = hero_by.get(d["id"])
        if hero:
            card["hero_photo"] = hero          # foto real del dev (marketing, ya filtrada segura)
            card["foto_fuente"] = "dev"
        out.append(card)
    return out


def _colonia_public(c: dict) -> dict:
    return {k: v for k, v in c.items() if k != "_id"}


def _iso_week_tag() -> str:
    now = datetime.now(timezone.utc)
    y, w, _ = now.isocalendar()
    return f"{y}-W{w:02d}"


# ─── Colonias ──────────────────────────────────────────────────────────────────
@router.get("/api/colonias")
async def get_colonias():
    return [_colonia_public(c) for c in SEED_COLONIAS]


@router.get("/api/colonias-geojson")
async def colonias_geojson(request: Request, alcaldia: Optional[str] = None, limit: int = 2200):
    """FeatureCollection de las colonias REALES (db.colonias.geometry · 1,811 IECM) para el Mapa de
    Valores coroplético. Une precio/scores/momentum desde los seed (por nombre) donde exista el dato."""
    db = request.app.state.db
    import unicodedata

    def _n(s):
        s = (s or "").strip().lower()
        return "".join(ch for ch in unicodedata.normalize("NFD", s) if unicodedata.category(ch) != "Mn")
    seed_by_name = {_n(c.get("name")): c for c in SEED_COLONIAS}
    # Valor catastral por id de colonia IECM (cruce ESPACIAL · 99% cobertura · exacto, sin adivinar nombres).
    cat_byid: Dict[str, int] = {}
    try:
        async for r in db.colonia_catastro_byid.find({}, {"_id": 0, "colonia_id": 1, "valor_suelo_m2": 1}):
            cat_byid[r["colonia_id"]] = r["valor_suelo_m2"]
    except Exception:
        pass
    q: Dict[str, Any] = {"geometry": {"$exists": True}}
    if alcaldia:
        q["alcaldia"] = {"$regex": f"^{alcaldia}$", "$options": "i"}
    feats: List[Dict[str, Any]] = []
    try:
        cursor = db.colonias.find(q, {
            "_id": 0, "id": 1, "name": 1, "alcaldia": 1, "geometry": 1,
            "scores_reales": 1, "scores_es_estimado": 1, "scores_cobertura_pct": 1,
        }).limit(limit)
        async for c in cursor:
            props = {"id": c["id"], "name": c.get("name"), "alcaldia": c.get("alcaldia")}
            s = seed_by_name.get(_n(c.get("name")))
            if s:
                props["price_m2"] = s.get("price_m2")
                props["momentum"] = s.get("momentum")
                props["scores"] = s.get("scores")
                props["trend"] = s.get("trend")
                props["has_data"] = True
            # SCORES reales por colonia (vida/movilidad/seguridad/comercio…) → el panel los lee directo.
            # Antes solo se exponían a las 9 colonias que matcheaban semilla; ahora a TODAS (el dato YA existe
            # en scores_reales para ~1,900 colonias vía OSM+FGJ). Esto llena las 4 tarjetas del panel.
            sr = c.get("scores_reales") or {}
            vals = [v for v in sr.values() if isinstance(v, (int, float))]
            if vals:
                if "scores" not in props:
                    props["scores"] = {k: round(v) for k, v in sr.items() if isinstance(v, (int, float))}
                props["calidad"] = round(sum(vals) / len(vals))
                props["calidad_estimada"] = bool(c.get("scores_es_estimado"))
                props["cobertura_pct"] = c.get("scores_cobertura_pct")
            # Valor catastral REAL por id de colonia (cruce espacial) → el choropleth se colorea con dato verdadero
            vc = cat_byid.get(c["id"])
            if vc:
                props["valor_catastral"] = vc
            feats.append({"type": "Feature", "properties": props, "geometry": c["geometry"]})
    except Exception:
        pass
    return {"type": "FeatureCollection", "features": feats, "count": len(feats)}


_SCORE_KEYS = ["vida", "movilidad", "seguridad", "comercio", "plusvalia", "educacion"]


async def _db_colonias_scored(db) -> Dict[str, Dict[str, Any]]:
    """TODAS las colonias (1,811) con scores reales + valor catastral — base de similar/para-ti/watch.
    Reemplaza las 16 semilla en RAM por la BD real."""
    cols: Dict[str, Dict[str, Any]] = {}
    async for c in db.colonias.find(
            {"geometry": {"$exists": True}, "scores_reales": {"$exists": True}},
            {"_id": 0, "id": 1, "name": 1, "alcaldia": 1, "scores_reales": 1}):
        sr = c.get("scores_reales") or {}
        cols[c["id"]] = {"id": c["id"], "name": c.get("name"), "alcaldia": c.get("alcaldia"),
                         "scores": {k: sr.get(k) for k in _SCORE_KEYS if isinstance(sr.get(k), (int, float))}}
    async for v in db.colonia_catastro_byid.find({}, {"_id": 0, "colonia_id": 1, "valor_suelo_m2": 1}):
        if v.get("colonia_id") in cols:
            cols[v["colonia_id"]]["valor_m2"] = v.get("valor_suelo_m2")
    return cols


def _similar_to(target: Dict[str, Any], pool: Dict[str, Dict[str, Any]], n: int) -> List[Dict[str, Any]]:
    """Colonias más parecidas por el vector de scores (distancia euclidiana)."""
    ts = target.get("scores") or {}
    if not ts:
        return []

    def dist(c):
        s = c.get("scores") or {}
        return sum((float(ts.get(k, 0)) - float(s.get(k, 0))) ** 2 for k in _SCORE_KEYS) ** 0.5
    others = [c for cid, c in pool.items() if cid != target.get("id") and c.get("scores")]
    others.sort(key=dist)
    return [{"id": c["id"], "name": c["name"], "alcaldia": c.get("alcaldia"), "valor_m2": c.get("valor_m2")}
            for c in others[:n]]


# ─── Upgrade #1 · "Vigila esta colonia" (watch + alerta de cambio · cierra ciclo de re-engagement) ──
class WatchIn(BaseModel):
    colonia_id: str
    watcher: str          # id de cliente (localStorage) — funciona anónimo, se migra a cuenta al loguear
    name: Optional[str] = None


async def _colonia_value(db, colonia_id: str) -> Dict[str, Any]:
    """Valor catastral $/m² + calidad de una colonia desde la BD (cualquiera de las 1,811)."""
    out: Dict[str, Any] = {}
    c = await db.colonias.find_one({"id": colonia_id}, {"_id": 0, "name": 1, "scores_reales": 1})
    if c:
        out["name"] = c.get("name")
        sr = c.get("scores_reales") or {}
        vals = [v for v in sr.values() if isinstance(v, (int, float))]
        out["calidad"] = round(sum(vals) / len(vals)) if vals else None
    v = await db.colonia_catastro_byid.find_one({"colonia_id": colonia_id}, {"_id": 0, "valor_suelo_m2": 1})
    out["valor_m2"] = (v or {}).get("valor_suelo_m2")
    return out


@router.post("/api/colonia-watch")
async def colonia_watch_add(payload: WatchIn, request: Request):
    db = request.app.state.db
    cv = await _colonia_value(db, payload.colonia_id)
    baseline = {"valor_m2": cv.get("valor_m2"), "calidad": cv.get("calidad")}
    await db.colonia_watches.update_one(
        {"watcher": payload.watcher, "colonia_id": payload.colonia_id},
        {"$set": {"watcher": payload.watcher, "colonia_id": payload.colonia_id,
                  "name": payload.name or cv.get("name"), "baseline": baseline,
                  "updated_at": datetime.now(timezone.utc)},
         "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
        upsert=True)
    return {"ok": True, "watching": payload.colonia_id}


@router.delete("/api/colonia-watch")
async def colonia_watch_del(watcher: str, colonia_id: str, request: Request):
    await request.app.state.db.colonia_watches.delete_one({"watcher": watcher, "colonia_id": colonia_id})
    return {"ok": True}


@router.get("/api/colonia-watch")
async def colonia_watch_list(watcher: str, request: Request):
    """Lista lo que vigila + detecta CAMBIO vs el baseline (precio/momentum). El forecast cron actualiza
    el precio → aquí aparece el cambio → el front/Atlax avisa al comprador (cierra el ciclo)."""
    db = request.app.state.db
    out = []
    async for w in db.colonia_watches.find({"watcher": watcher}, {"_id": 0}).sort("created_at", -1):
        cv = await _colonia_value(db, w["colonia_id"])
        cur = cv.get("valor_m2")
        base = (w.get("baseline") or {}).get("valor_m2")
        change = round((cur / base - 1) * 100, 1) if (cur and base and cur != base) else None
        out.append({"colonia_id": w["colonia_id"], "name": w.get("name"),
                    "valor_m2": cur, "calidad": cv.get("calidad"), "change_pct": change})
    return {"watching": out, "count": len(out), "alerts": [w for w in out if w["change_pct"]]}


# ─── Catastro OFICIAL por colonia (SIGCDMX) — valor catastral + desglose por predio ──────────────
@router.get("/api/catastro/colonia/{colonia}")
async def catastro_colonia(colonia: str, request: Request):
    """Valor catastral OFICIAL agregado de la colonia + desglose por predio (Catastro SIGCDMX 2021).
    Esta es la granularidad por-predio que pedía el founder, con dato oficial."""
    db = request.app.state.db
    try:
        from catastro_sig_engine import colonia_catastro
        out = await colonia_catastro(db, colonia)
    except Exception as e:
        return {"colonia": colonia, "disponible": False, "error": str(e)[:120]}
    # Precio de VENTA (mercado) estimado — capa real (semilla/cierres) o mini-AVM etiquetado. Cierra el gap
    # con propiedades.com sin scrapear: número honesto con sello de fuente/confianza.
    try:
        from market_estimate_engine import market_for_colonia
        cv = await _colonia_value(db, colonia)
        out["mercado"] = await market_for_colonia(db, colonia, out.get("valor_suelo_m2"), cv.get("calidad"))
    except Exception:
        pass
    return out


@router.get("/api/precio-posicion")
async def precio_posicion(request: Request, colonia: str, precio: float, m2: float, nueva: bool = False,
                          rec: Optional[int] = None, ban: Optional[int] = None, anio: Optional[int] = None):
    """¿Este precio está BAJO / JUSTO / ALTO vs el mercado de su zona? (nuestro AVM hedónico propio).
    Si pasas rec/ban/anio usa el AVM por PROPIEDAD (ajusta por tamaño/recámaras/baños/edad); si no, mediana de
    zona. `nueva=true` para DESARROLLOS → juzga contra obra nueva (prima real de la zona), no contra usada.
    Wedge para comprador (oportunidades) / asesor (precia bien) / dev (posiciona)."""
    db = request.app.state.db
    try:
        from catastro_sig_engine import colonia_catastro
        from market_estimate_engine import market_for_colonia, price_position
        cat = await colonia_catastro(db, colonia)
        cv = await _colonia_value(db, colonia)
        mkt = await market_for_colonia(db, colonia, cat.get("valor_suelo_m2"), cv.get("calidad"))
        pos = price_position(precio, m2, mkt.get("precio_venta_m2"), es_nueva=nueva,
                             premium=mkt.get("premium_zona"), avm_base=mkt.get("avm_base"),
                             rec=rec, ban=ban, anio=anio)
        pos["mercado_fuente"] = mkt.get("source")
        pos["mercado_confianza"] = mkt.get("confianza")
        pos["prima_zona"] = mkt.get("premium_zona")
        return pos
    except Exception as e:
        return {"disponible": False, "error": str(e)[:120]}


class PrecioPosicionBatchIn(BaseModel):
    colonia: str
    nueva: bool = True
    unidades: List[Dict[str, Any]]   # [{id, precio, m2, rec?, ban?, anio?}]


@router.post("/api/precio-posicion-batch")
async def precio_posicion_batch(payload: PrecioPosicionBatchIn, request: Request):
    """Evalúa varias unidades de una colonia en UNA llamada (lista de precios del desarrollo) → bajo/justo/alto
    por unidad con nuestro AVM hedónico. Cierra el ciclo: el comprador ve qué unidad está mejor de precio."""
    db = request.app.state.db
    out: List[Dict[str, Any]] = []
    try:
        from catastro_sig_engine import colonia_catastro
        from market_estimate_engine import market_for_colonia, price_position
        cat = await colonia_catastro(db, payload.colonia)
        cv = await _colonia_value(db, payload.colonia)
        mkt = await market_for_colonia(db, payload.colonia, cat.get("valor_suelo_m2"), cv.get("calidad"))
        m2m = mkt.get("precio_venta_m2")
        for u in (payload.unidades or [])[:120]:
            try:
                pos = price_position(u.get("precio"), u.get("m2"), m2m, es_nueva=payload.nueva,
                                     premium=mkt.get("premium_zona"), avm_base=mkt.get("avm_base"),
                                     rec=u.get("rec"), ban=u.get("ban"), anio=u.get("anio"))
                out.append({"id": u.get("id"), "etiqueta": pos.get("etiqueta"), "color": pos.get("color"),
                            "diff_pct": pos.get("diff_pct"), "disponible": pos.get("disponible", False)})
            except Exception:
                out.append({"id": u.get("id"), "disponible": False})
    except Exception:
        pass
    return {"unidades": out, "fuente": "mercado_real" if out else None}


@router.get("/api/catastro/predios-bbox")
async def predios_bbox(request: Request, w: float, s: float, e: float, n: float, limit: int = 2500):
    """Predios (POLÍGONOS del lote) dentro del recuadro visible → se cargan solo con zoom cercano.
    Así se ven las formas reales de los lotes (no puntitos) sin trabar el navegador (estilo propiedades.com)."""
    import json
    db = request.app.state.db
    box = {"type": "Polygon", "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}
    q = {"geo": {"$geoWithin": {"$geometry": box}}, "poly": {"$exists": True}}
    feats: List[Dict[str, Any]] = []
    try:
        async for p in db.catastro_predios.find(
                q, {"_id": 0, "poly": 1, "valor_unitario_suelo": 1, "valor_suelo": 1, "calle": 1,
                    "sup_terreno": 1, "sup_construccion": 1, "anio": 1, "colonia": 1, "cp": 1,
                    "n_unidades": 1, "unidades": 1}
        ).limit(limit):
            props = {
                "v": p.get("valor_unitario_suelo") or 0, "vs": p.get("valor_suelo") or 0,
                "calle": (p.get("calle") or "")[:60], "sup": p.get("sup_terreno") or 0,
                "supc": p.get("sup_construccion") or 0, "anio": p.get("anio") or "",
                "colonia": (p.get("colonia") or "")[:40], "cp": p.get("cp") or ""}
            if p.get("n_unidades"):
                props["nu"] = p["n_unidades"]
                # unidades como JSON (Mapbox aplana props → se parsea en el popup)
                props["unidades"] = json.dumps([{
                    "r": (u.get("ref") or "")[:50], "c": u.get("sup_construccion") or 0, "vs": u.get("valor_suelo") or 0
                } for u in (p.get("unidades") or [])[:30]], ensure_ascii=False)
            feats.append({"type": "Feature", "geometry": p["poly"], "properties": props})
    except Exception:
        pass
    return {"type": "FeatureCollection", "features": feats, "count": len(feats)}


# ─── #3 "Búsqueda viva / Para ti" — personaliza desde el comportamiento (watchlist) · cold-start trending ──
@router.get("/api/para-ti")
async def para_ti(request: Request, watcher: Optional[str] = None, n: int = 6):
    """Recomendación viva para el comprador: parte de lo que VIGILA (comportamiento real) → colonias
    parecidas; si aún no hay señal, cae a 'tendencia' (mejor momentum). Reusa scores + watchlist."""
    db = request.app.state.db
    pool = await _db_colonias_scored(db)
    watched = []
    if watcher:
        try:
            async for w in db.colonia_watches.find({"watcher": watcher}, {"_id": 0, "colonia_id": 1}):
                watched.append(w.get("colonia_id"))
        except Exception:
            pass
    scored: Dict[str, float] = {}
    for cid in watched:
        t = pool.get(cid)
        if not t or not t.get("scores"):
            continue
        ts = t["scores"]
        for ocid, c in pool.items():
            if ocid in watched or not c.get("scores"):
                continue
            d = sum((float(ts.get(k, 0)) - float(c["scores"].get(k, 0))) ** 2 for k in _SCORE_KEYS) ** 0.5
            scored[ocid] = min(scored.get(ocid, 9e9), d)
    if scored:
        order = sorted(scored.items(), key=lambda kv: kv[1])[:n]
        recs = [pool[cid] for cid, _ in order if cid in pool]
        basis = "personalizado"
    else:
        # cold-start: las de mayor valor (zonas premium · aspiracional) con dato real
        recs = sorted([c for c in pool.values() if c.get("valor_m2")],
                      key=lambda c: c["valor_m2"], reverse=True)[:n]
        basis = "tendencia"
    out = [{"id": c["id"], "name": c["name"], "alcaldia": c.get("alcaldia"), "valor_m2": c.get("valor_m2")}
           for c in recs]
    return {"para_ti": out, "basis": basis, "watched": len(watched)}


# ─── Upgrade #3 · "Parecidas a las que te gustaron" (recomendación por similitud · taste-lite) ──
@router.get("/api/colonias-similar/{colonia_id}")
async def colonias_similar(colonia_id: str, request: Request, n: int = 3):
    """Colonias con perfil PARECIDO (distancia en el vector de scores). Cierra el ciclo de descubrimiento:
    te gustó X → aquí Y, Z parecidas. Ahora sobre las 1,811 colonias (no solo 16)."""
    pool = await _db_colonias_scored(request.app.state.db)
    target = pool.get(colonia_id)
    if not target or not target.get("scores"):
        return {"similar": [], "based_on": None}
    return {"similar": _similar_to(target, pool, n), "based_on": target.get("name")}


@router.get("/api/colonias/{colonia_id}")
async def get_colonia(colonia_id: str):
    c = COLONIAS_BY_ID.get(colonia_id)
    if not c:
        raise HTTPException(404, "Colonia no encontrada")
    return _colonia_public(c)


@router.get("/api/colonias/{colonia_id}/propiedades")
async def get_colonia_propiedades(colonia_id: str):
    if colonia_id not in COLONIAS_BY_ID:
        raise HTTPException(404, "Colonia no encontrada")
    return [p for p in SEED_PROPERTIES if p["colonia_id"] == colonia_id]


# ─── Properties ───────────────────────────────────────────────────────────────
@router.get("/api/properties")
async def get_properties(
    colonia: Optional[List[str]] = Query(None),
    min_price: Optional[int] = None,
    max_price: Optional[int] = None,
    min_sqm: Optional[int] = None,
    max_sqm: Optional[int] = None,
    beds: Optional[int] = None,
    baths: Optional[int] = None,
    parking: Optional[int] = None,
    tipo: Optional[str] = None,
    tag: Optional[str] = None,
    amenity: Optional[List[str]] = Query(None),
    sort: Optional[str] = "recent",
    limit: int = 100,
):
    results = list(SEED_PROPERTIES)
    if colonia:
        cset = {c.lower() for c in colonia}
        results = [p for p in results if p["colonia_id"].lower() in cset]
    if min_price is not None:
        results = [p for p in results if p["price"] >= min_price]
    if max_price is not None:
        results = [p for p in results if p["price"] <= max_price]
    if min_sqm is not None:
        results = [p for p in results if p["sqm"] >= min_sqm]
    if max_sqm is not None:
        results = [p for p in results if p["sqm"] <= max_sqm]
    if beds is not None:
        results = [p for p in results if p["beds"] >= beds]
    if baths is not None:
        results = [p for p in results if p["baths"] >= baths]
    if parking is not None:
        results = [p for p in results if p["parking"] >= parking]
    if tipo:
        results = [p for p in results if p["tipo"] == tipo]
    if tag:
        results = [p for p in results if p["tag"] == tag]
    if amenity:
        aset = set(amenity)
        results = [p for p in results if aset.issubset(set(p.get("amenities", [])))]
    if sort == "price_asc":
        results.sort(key=lambda p: p["price"])
    elif sort == "price_desc":
        results.sort(key=lambda p: -p["price"])
    elif sort == "sqm_desc":
        results.sort(key=lambda p: -p["sqm"])
    return results[:limit]


@router.get("/api/properties/{prop_id}")
async def get_property(prop_id: str):
    for p in SEED_PROPERTIES:
        if p["id"] == prop_id:
            return p
    raise HTTPException(404, "Propiedad no encontrada")


@router.get("/api/properties/{prop_id}/similares")
async def get_property_similares(prop_id: str):
    target = next((p for p in SEED_PROPERTIES if p["id"] == prop_id), None)
    if not target:
        raise HTTPException(404, "Propiedad no encontrada")
    pool = [p for p in SEED_PROPERTIES if p["id"] != prop_id]

    def score(p):
        s = 0
        if p["colonia_id"] == target["colonia_id"]:
            s -= 100
        s += abs(p["price"] - target["price"]) / 1_000_000
        s += abs(p["sqm"] - target["sqm"]) / 10
        return s

    pool.sort(key=score)
    return pool[:3]


# ─── Property briefing (Claude) ───────────────────────────────────────────────
BRIEFING_SYSTEM = (
    "Eres el analista estrella de DesarrollosMX. Generas briefings contextuales sobre colonias de CDMX "
    "para compradores que están a punto de tomar una decisión. Tu texto se comparte por WhatsApp, así que es "
    "breve, concreto y accionable. Reglas estrictas: máximo 280 caracteres, un solo párrafo, sin emoji, sin "
    "markdown, sin viñetas, sin saludos. Cierra con una recomendación clara. Tono profesional y directo."
)


@router.post("/api/properties/{prop_id}/briefing")
async def generate_property_briefing(prop_id: str, request: Request):
    db = request.app.state.db
    p = next((x for x in SEED_PROPERTIES if x["id"] == prop_id), None)
    if not p:
        raise HTTPException(404, "Propiedad no encontrada")
    c = COLONIAS_BY_ID.get(p["colonia_id"])
    if not c:
        raise HTTPException(404, "Colonia no encontrada para la propiedad")
    week = _iso_week_tag()
    cache_key = f"{prop_id}__{week}"
    cached = await db.property_briefings.find_one({"cache_key": cache_key}, {"_id": 0})
    if cached and cached.get("text"):
        return {"text": cached["text"], "cached": True, "week": week}
    text = None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        scores = c.get("scores", {})
        prompt = (
            f"Propiedad: {p['titulo']}, {p['sqm']} m², {p['beds']} rec, precio {p['price_display']}.\n"
            f"Colonia: {c['name']}. Momentum: {c.get('momentum', 'n/a')}.\n"
            f"Scores -> Vida: {scores.get('vida', 0)}, Movilidad: {scores.get('movilidad', 0)}, "
            f"Seguridad: {scores.get('seguridad', 0)}, Comercio: {scores.get('comercio', 0)}.\n"
            "Genera el briefing en un solo párrafo de máximo 280 caracteres en español MX."
        )
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"brief_{prop_id}_{week}",
            system_message=BRIEFING_SYSTEM,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        raw = await chat.send_message(UserMessage(text=prompt))
        text = (raw or "").strip().strip('"')
        if len(text) > 290:
            text = text[:277].rstrip() + "..."
        # Budget tracking for public briefing AI
        if text:
            try:
                from ai_budget import track_ai_call
                await track_ai_call(db, "public", "claude-sonnet-4-5-20250929", 0,
                                    "property_briefing", tokens_in=len(prompt)//4, tokens_out=len(text)//4)
            except Exception:
                pass
    except Exception:
        text = None
    if not text:
        scores = c.get("scores", {})
        text = (
            f"{c['name']} marca {c.get('momentum', '+0%')} a 24m. "
            f"Scores: Vida {scores.get('vida', 0)}, Seg {scores.get('seguridad', 0)}."
        )[:280]
    await db.property_briefings.update_one(
        {"cache_key": cache_key},
        {"$set": {"cache_key": cache_key, "property_id": prop_id, "week": week, "text": text,
                  "created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"text": text, "cached": False, "week": week}


# ─── Developments ──────────────────────────────────────────────────────────────
@router.get("/api/developments")
async def list_developments(
    request: Request,
    colonia: Optional[List[str]] = Query(None),
    min_price: Optional[int] = None,
    max_price: Optional[int] = None,
    min_sqm: Optional[int] = None,
    max_sqm: Optional[int] = None,
    beds: Optional[int] = None,
    baths: Optional[int] = None,
    parking: Optional[int] = None,
    stage: Optional[str] = None,
    tipo: Optional[str] = None,
    alcaldia: Optional[str] = None,
    unit_feature: Optional[List[str]] = Query(None),
    orientacion: Optional[List[str]] = Query(None),
    piso_min: Optional[int] = None,
    amenity: Optional[List[str]] = Query(None),
    featured: Optional[bool] = None,
    enganche_max: Optional[int] = None,
    mensualidad_max: Optional[int] = None,
    sort: Optional[str] = "recent",
    limit: int = 100,
    subscore_min: Optional[str] = Query(None, description="W5.2 — JSON encoded ej. {\"seguridad\":85}"),
    forecast_delta_min: Optional[int] = Query(None, description="W5.3 P2B — % mínimo crecimiento 12m"),
):
    results = list(DEVELOPMENTS)
    if colonia:
        cset = {c.lower() for c in colonia}
        results = [d for d in results if d["colonia_id"].lower() in cset]
    # ── Filtros a nivel PROYECTO (del DESARROLLO): zona, etapa, tipo, alcaldía, AMENIDADES del edificio, destacado ──
    if stage:
        results = [d for d in results if d["stage"] == stage]
    if tipo:
        _tmap = {"dept": "departamento", "depto": "departamento", "departamento": "departamento", "casa": "casa", "casas": "casa"}
        _want = _tmap.get(tipo.lower(), tipo.lower())
        results = [d for d in results if d.get("property_type") == _want]
    if alcaldia:
        _na = alcaldia.lower().replace("_", " ").strip()
        results = [d for d in results if (d.get("alcaldia") or "").lower().replace("_", " ").strip() == _na]
    if amenity:
        aset = set(amenity)  # amenidades = del EDIFICIO → se piden al desarrollo (gym/alberca/roof/concierge…)
        results = [d for d in results if aset.issubset(set(d.get("amenities", [])))]
    if featured is not None:
        results = [d for d in results if d["featured"] == featured]

    # ── Filtros a nivel UNIDAD (depto individual): lo INTERNO del depto (recámaras/baños/cajones/m²/precio/balcón/
    #    terraza/roof garden/orientación/piso) se valida contra la LISTA DE PRECIOS real → el desarrollo aparece solo
    #    si tiene ≥1 unidad DISPONIBLE que cumple TODO junto. Así separamos "lo del depto" de "lo del edificio".
    #    Fallback a los rangos del proyecto si un desarrollo no trae lista de unidades. ────────────────────────────
    _ufset = [f.lower() for f in (unit_feature or [])]
    _oset = {o.lower() for o in (orientacion or [])}
    _has_unit_crit = any(v is not None for v in (min_price, max_price, min_sqm, max_sqm, beds, baths, parking, piso_min, enganche_max, mensualidad_max)) or _ufset or _oset
    match_counts: Dict[str, int] = {}
    match_samples: Dict[str, list] = {}
    _fin_by_dev: Dict[str, dict] = {}
    _cbd = None
    if _has_unit_crit:
        # Esquemas de pago REALES del dev (los cambia cuando quiera) → enganche$/mensualidad$ por unidad. Se cargan en
        # TODA búsqueda de unidad para MOSTRAR el enganche aunque no se filtre por él ("enganche desde $X · $Y/mes").
        try:
            from payment_schemes import compute_breakdown as _cbd_fn
            _cbd = _cbd_fn
            async for _ps in request.app.state.db.dev_payment_schemes.find({}, {"_id": 0, "project_id": 1, "schemes": 1, "fecha_inicio": 1, "fecha_entrega": 1}):
                _fin_by_dev[_ps.get("project_id")] = _ps
        except Exception:
            _cbd = None

        def _unit_finance(price, fin):
            """El MEJOR escenario para el comprador: el esquema con menor enganche (el dev ofrece varios)."""
            if not fin or not price or _cbd is None:
                return None
            best = None
            for s in (fin.get("schemes") or []):
                try:
                    bd = _cbd(price, s, fin.get("fecha_inicio"), fin.get("fecha_entrega"))
                    eng = bd.get("firma") or 0
                    if best is None or eng < best["enganche"]:
                        best = {"enganche": eng, "mensualidad": bd.get("mensualidad") or 0, "apartado": bd.get("apartado") or 0, "esquema": s.get("nombre")}
                except Exception:
                    continue
            return best

        def _unit_ok(u: dict, fin: dict = None) -> bool:
            if u.get("status") != "disponible":
                return False
            if beds is not None and (u.get("bedrooms") or 0) < beds:
                return False
            if baths is not None and (u.get("bathrooms") or 0) < baths:
                return False
            if parking is not None and (u.get("parking_spots") or 0) < parking:
                return False
            _sqm = u.get("m2_total") or u.get("m2_privative") or 0
            if min_sqm is not None and _sqm < min_sqm:
                return False
            if max_sqm is not None and _sqm > max_sqm:
                return False
            _pr = u.get("price") or 0
            if min_price is not None and _pr < min_price:
                return False
            if max_price is not None and _pr > max_price:
                return False
            if piso_min is not None and (u.get("level") or 0) < piso_min:
                return False
            if _ufset and not all(u.get(f) for f in _ufset):
                return False
            if _oset and (u.get("orientation") or "").lower() not in _oset:
                return False
            if enganche_max is not None or mensualidad_max is not None:
                f = _unit_finance(u.get("price"), fin)
                if not f:
                    return False  # el dev no publicó esquema de pago → no prometemos el enganche
                if enganche_max is not None and f["enganche"] > enganche_max:
                    return False
                if mensualidad_max is not None and f["mensualidad"] > mensualidad_max:
                    return False
            return True

        def _range_ok(d: dict) -> bool:
            # Sin lista de precios → cae a los rangos del proyecto (no perder desarrollos sin inventario detallado).
            if beds is not None and d.get("bedrooms_range", [0, 0])[1] < beds:
                return False
            if baths is not None and d.get("bathrooms_range", [0, 0])[1] < baths:
                return False
            if parking is not None and d.get("parking_range", [0, 0])[1] < parking:
                return False
            if min_sqm is not None and d.get("m2_range", [0, 0])[1] < min_sqm:
                return False
            if max_sqm is not None and d.get("m2_range", [0, 0])[0] > max_sqm:
                return False
            if max_price is not None and d.get("price_from", 0) > max_price:
                return False
            if min_price is not None and d.get("price_to", 10**12) < min_price:
                return False
            if _ufset and not set(_ufset).issubset({x.lower() for x in d.get("unit_features", [])}):
                return False
            return True

        def _unit_card(u: dict, fin: dict = None) -> dict:
            # Lo mínimo para NOMBRAR la unidad en el front + el enganche/mensualidad REAL (esquema del dev).
            card = {
                "unit_number": u.get("unit_number"), "prototype": u.get("prototype"), "level": u.get("level"),
                "bedrooms": u.get("bedrooms"), "bathrooms": u.get("bathrooms"), "parking_spots": u.get("parking_spots"),
                "m2_total": u.get("m2_total") or u.get("m2_privative"), "price": u.get("price"),
                "price_display": u.get("price_display"), "orientation": u.get("orientation"), "vista": u.get("vista"),
            }
            f = _unit_finance(u.get("price"), fin)
            if f:
                card["enganche"] = f["enganche"]
                card["mensualidad"] = f["mensualidad"]
                card["esquema"] = f["esquema"]
            return card

        _kept = []
        for d in results:
            fin = _fin_by_dev.get(d.get("id"))
            units = d.get("units") or []
            if units:
                mu = [u for u in units if _unit_ok(u, fin)]
                if mu:
                    _kept.append(d)
                    match_counts[d["id"]] = len(mu)
                    match_samples[d["id"]] = [_unit_card(u, fin) for u in sorted(mu, key=lambda x: x.get("price") or 0)[:4]]
            elif _range_ok(d):
                _kept.append(d)  # cumple por rango, sin lista de unidades detallada (no count)
        results = _kept

    # W5.2 Sub-C — Filter by zone sub-scores
    if subscore_min:
        try:
            import json as _json
            thresholds = _json.loads(subscore_min)
            if isinstance(thresholds, dict) and thresholds:
                from zone_score_engine import get_zone_with_subscores, SUBSCORE_KEYS
                valid_thresholds = {
                    k: float(v) for k, v in thresholds.items()
                    if k in SUBSCORE_KEYS
                }
                if valid_thresholds:
                    db = request.app.state.db
                    zone_cache: Dict[str, Dict[str, Any]] = {}
                    needed_zones = {d.get("colonia_id") for d in results}
                    for z in needed_zones:
                        if z and z not in zone_cache:
                            zone_cache[z] = await get_zone_with_subscores(db, z)
                    filtered: List[Dict[str, Any]] = []
                    for d in results:
                        z_doc = zone_cache.get(d.get("colonia_id")) or {}
                        subs = z_doc.get("subscores") or {}
                        if all((subs.get(k) or 0) >= thr for k, thr in valid_thresholds.items()):
                            filtered.append(d)
                    results = filtered
        except (ValueError, TypeError):
            # JSON inválido → ignorar filtro (backward-compat)
            pass

    # W5.3 Parte 2B Sub-E — Filter by zone forecast delta 12m
    if forecast_delta_min is not None and forecast_delta_min > 0:
        try:
            db = request.app.state.db
            threshold = float(forecast_delta_min)
            needed = {d.get("colonia_id") for d in results}
            cursor = db.zone_forecasts.find(
                {"zone_slug": {"$in": list(needed)}, "available": True},
                {"_id": 0, "zone_slug": 1, "horizons.12m.delta_pct": 1},
            )
            allowed: set = set()
            async for fc in cursor:
                d12 = (((fc.get("horizons") or {}).get("12m") or {}).get("delta_pct"))
                if d12 is not None and float(d12) >= threshold:
                    allowed.add(fc.get("zone_slug"))
            results = [d for d in results if d.get("colonia_id") in allowed]
        except Exception:
            pass

    if sort == "price_asc":
        results.sort(key=lambda d: d["price_from"])
    elif sort == "price_desc":
        results.sort(key=lambda d: -d["price_from"])
    elif sort == "sqm_desc":
        results.sort(key=lambda d: -d["m2_range"][1])
    # Enriquecimiento en batch (precio fresco + amenidades + foto real del dev) · cierra ciclo.
    cards = await _enrich_listing(request.app.state.db, results[:limit])
    # Adjunta cuántas unidades DISPONIBLES cumplen + la MUESTRA (para nombrarlas: "#14B $11.2M, #21A $11.8M").
    if match_counts or match_samples:
        for c in cards:
            cid = c.get("id")
            if match_counts.get(cid) is not None:
                c["units_match"] = match_counts[cid]
            if match_samples.get(cid):
                c["units_match_sample"] = match_samples[cid]
    return cards


@router.get("/api/developments/casi")
async def casi_cumple(
    request: Request,
    colonia: Optional[List[str]] = Query(None),
    min_price: Optional[int] = None, max_price: Optional[int] = None,
    min_sqm: Optional[int] = None, max_sqm: Optional[int] = None,
    beds: Optional[int] = None, baths: Optional[int] = None, parking: Optional[int] = None,
    stage: Optional[str] = None, tipo: Optional[str] = None,
    amenity: Optional[List[str]] = Query(None),
    unit_feature: Optional[List[str]] = Query(None),
    orientacion: Optional[List[str]] = Query(None),
    limit: int = 6,
):
    """"Los que MÁS se asemejan": cuando nada cumple TODO, rankea por cuántos criterios cumple y dice QUÉ LE FALTA
    a cada uno (la idea del founder: nombrarlos por filtros). Honesto — no finge, muestra el más cercano + el gap."""
    _AML = {"gym": "gimnasio", "alberca": "alberca", "roof": "roof garden", "concierge": "concierge", "pet": "pet friendly",
            "seguridad": "seguridad", "spa": "spa", "cowork": "coworking", "bicicletas": "biciestacionamiento",
            "salon_eventos": "salón de eventos", "cava": "cava", "sky_lounge": "sky lounge", "business_center": "business center",
            "cancha_padel": "cancha de pádel", "cancha_tenis": "cancha de tenis", "paneles_solares": "paneles solares", "jardines": "jardines"}
    _UFL = {"balcon": "balcón", "terraza": "terraza", "bodega": "bodega", "roof_garden": "roof garden privado"}
    _tmap = {"dept": "departamento", "depto": "departamento", "departamento": "departamento", "casa": "casa", "casas": "casa"}
    pool = list(DEVELOPMENTS)
    if colonia:
        cset = {c.lower() for c in colonia}
        # La ZONA es sagrada: si el cliente pidió una zona, los "casi" se quedan en esa zona (nunca cruzamos a otra
        # que NO pidió). Si no hay nada en su zona, devuelve vacío — honesto.
        pool = [d for d in pool if d["colonia_id"].lower() in cset]
    scored = []
    for d in pool:
        units = [u for u in (d.get("units") or []) if u.get("status") == "disponible"]
        crit = []  # (label_humano, cumple)
        if stage:
            crit.append((f"etapa {stage.replace('_', ' ')}", d.get("stage") == stage))
        if tipo:
            crit.append((_tmap.get(tipo.lower(), tipo), d.get("property_type") == _tmap.get(tipo.lower(), tipo.lower())))
        for a in (amenity or []):
            crit.append((_AML.get(a, a.replace("_", " ")), a in (d.get("amenities") or [])))
        if beds is not None:
            crit.append((f"{beds} recámaras", any((u.get("bedrooms") or 0) >= beds for u in units) or (d.get("bedrooms_range", [0, 0])[1] >= beds)))
        if baths is not None:
            crit.append((f"{baths} baños", any((u.get("bathrooms") or 0) >= baths for u in units) or (d.get("bathrooms_range", [0, 0])[1] >= baths)))
        if parking is not None:
            crit.append((f"{parking} cajones", any((u.get("parking_spots") or 0) >= parking for u in units) or (d.get("parking_range", [0, 0])[1] >= parking)))
        if max_price is not None:
            crit.append((f"hasta ${round(max_price/1e6)}M", any((u.get("price") or 10**12) <= max_price for u in units) or (d.get("price_from", 10**12) <= max_price)))
        if min_price is not None:
            crit.append((f"desde ${round(min_price/1e6)}M", any((u.get("price") or 0) >= min_price for u in units) or (d.get("price_to", 0) >= min_price)))
        if min_sqm is not None:
            crit.append((f"≥{min_sqm}m²", any((u.get("m2_total") or u.get("m2_privative") or 0) >= min_sqm for u in units) or (d.get("m2_range", [0, 0])[1] >= min_sqm)))
        if max_sqm is not None:
            crit.append((f"≤{max_sqm}m²", any((u.get("m2_total") or u.get("m2_privative") or 10**9) <= max_sqm for u in units) or (d.get("m2_range", [0, 0])[0] <= max_sqm)))
        for f in (unit_feature or []):
            crit.append((_UFL.get(f, f), any(u.get(f) for u in units) or (f in (d.get("unit_features") or []))))
        for o in (orientacion or []):
            crit.append((f"orientación {o}", any((u.get("orientation") or "").lower() == o.lower() for u in units)))
        if not crit:
            continue
        met = sum(1 for _, ok in crit if ok)
        scored.append({"d": d, "met": met, "total": len(crit), "falta": [l for l, ok in crit if not ok]})
    # rankea: más criterios cumplidos primero; descarta los que no cumplen casi nada
    scored = [s for s in scored if s["met"] > 0]
    scored.sort(key=lambda s: (-s["met"], len(s["falta"])))
    top = scored[:limit]
    cards = await _enrich_listing(request.app.state.db, [s["d"] for s in top])
    by_id = {c.get("id"): c for c in cards}
    out = []
    for s in top:
        c = by_id.get(s["d"]["id"])
        if c:
            c["match_met"] = s["met"]
            c["match_total"] = s["total"]
            c["match_falta"] = s["falta"]
            out.append(c)
    return {"casi": out}


@router.get("/api/developments/{dev_id}")
async def get_development(dev_id: str, request: Request):
    db = request.app.state.db
    d = DEVELOPMENTS_BY_ID.get(dev_id)
    if d:
        await _ensure_overlay_loaded(dev_id, db)
        out = _dev_public(d, include_units=True)
    else:
        # B0.3 · Proyecto creado/publicado por el dev → leer la tienda unificada (no solo el seed)
        pub = await db.developments.find_one({"id": dev_id}, {"_id": 0})
        if not pub:
            raise HTTPException(404, "Desarrollo no encontrado")
        out = {k: v for k, v in pub.items() if k != "config"}
        out["contact_phone"] = pub.get("contact_phone") or DMX_FALLBACK_WHATSAPP
    # B0.3 · Overlay del dev (amenidades/servicios/pagos/sistema) sobre la ficha pública — fail-open
    try:
        from routes.dev_project_full import project_public_overlay
        ov = await project_public_overlay(db, dev_id)
        if ov:
            out["config"] = ov
            if ov.get("amenidades"):
                out["amenities"] = ov["amenidades"]  # el dev es la fuente de verdad
    except Exception:
        pass
    return out


@router.get("/api/developments/{dev_id}/units")
async def list_dev_units(
    dev_id: str, request: Request,
    status: Optional[str] = None,
    beds: Optional[int] = None,
    baths: Optional[int] = None,
    parking: Optional[int] = None,
):
    d = DEVELOPMENTS_BY_ID.get(dev_id)
    if not d:
        raise HTTPException(404, "Desarrollo no encontrado")
    await _ensure_overlay_loaded(dev_id, request.app.state.db)
    d = _apply_overlay(d)
    units = list(d.get("units", []))
    # Fusiona las ediciones MANUALES del dev (developer_unit_overrides) → el comprador ve el dato
    # actualizado (precio/estado/m²), no solo el seed. Cierra el ciclo dev→comprador.
    try:
        ov_map = {}
        async for ov in request.app.state.db.developer_unit_overrides.find({"dev_id": dev_id}, {"_id": 0}):
            ov_map[ov.get("unit_id")] = ov
        if ov_map:
            _skip = {"unit_id", "dev_id", "updated_by", "updated_at", "reason"}
            units = [({**u, **{k: v for k, v in (ov_map.get(u.get("id")) or {}).items()
                               if k not in _skip and v is not None}}) for u in units]
    except Exception:
        pass
    if status:
        units = [u for u in units if u.get("status") == status]
    if beds is not None:
        units = [u for u in units if (u.get("bedrooms") or 0) >= beds]
    if baths is not None:
        units = [u for u in units if (u.get("bathrooms") or 0) >= baths]
    if parking is not None:
        units = [u for u in units if (u.get("parking_spots") or 0) >= parking]
    return units


@router.get("/api/developments/{dev_id}/compliance-badge")
async def get_compliance_badge(dev_id: str, request: Request):
    d = DEVELOPMENTS_BY_ID.get(dev_id)
    if not d:
        raise HTTPException(404, "Desarrollo no encontrado")
    db = request.app.state.db
    extracted_count = await db.di_documents.count_documents({"development_id": dev_id, "status": "extracted"})
    scores = {}
    for code in ("IE_PROY_RISK_LEGAL", "IE_PROY_COMPLIANCE_SCORE", "IE_PROY_QUALITY_DOCS"):
        s = await db.ie_scores.find_one({"zone_id": dev_id, "code": code}, {"_id": 0})
        if s and not s.get("is_stub"):
            scores[code] = {"value": s.get("value"), "tier": s.get("tier")}
        else:
            scores[code] = None
    overlay = await db.dev_overlays.find_one({"development_id": dev_id}, {"_id": 0, "last_auto_sync_at": 1}) or {}
    last = overlay.get("last_auto_sync_at")
    last_iso = last.isoformat() if last else None
    tier = None
    if extracted_count >= 1 and all(scores[c] is not None for c in scores):
        risk = scores["IE_PROY_RISK_LEGAL"]
        comp = scores["IE_PROY_COMPLIANCE_SCORE"]
        qd = scores["IE_PROY_QUALITY_DOCS"]
        if risk["tier"] == "red":
            tier = None
        elif min(risk["value"] or 0, comp["value"] or 0, qd["value"] or 0) >= 80:
            tier = "green"
        elif min(risk["value"] or 0, comp["value"] or 0, qd["value"] or 0) >= 50:
            tier = "amber"
        else:
            tier = None
    return {
        "development_id": dev_id, "tier": tier,
        "scores": {
            "risk_legal": scores["IE_PROY_RISK_LEGAL"],
            "compliance": scores["IE_PROY_COMPLIANCE_SCORE"],
            "quality_docs": scores["IE_PROY_QUALITY_DOCS"],
        },
        "verified_docs_count": extracted_count,
        "last_update_at": last_iso,
        "label_es": (
            "DMX Verificado · Documentos al día" if tier == "green"
            else ("Documentos parciales · En verificación" if tier == "amber" else None)
        ),
    }


@router.get("/api/developments/{dev_id}/similar")
async def get_similar_developments(dev_id: str):
    target = DEVELOPMENTS_BY_ID.get(dev_id)
    if not target:
        raise HTTPException(404, "Desarrollo no encontrado")
    pool = [d for d in DEVELOPMENTS if d["id"] != dev_id]
    pool.sort(key=lambda d: (
        -100 if d["colonia_id"] == target["colonia_id"] else 0
    ) + abs(d["price_from"] - target["price_from"]) / 1_000_000)
    return [_dev_public(p) for p in pool[:3]]


@router.get("/api/developments/{dev_id}/rank")
async def get_development_rank(dev_id: str, request: Request):
    target = DEVELOPMENTS_BY_ID.get(dev_id)
    if not target:
        raise HTTPException(404, "Desarrollo no encontrado")
    peers = [d for d in DEVELOPMENTS if d["colonia_id"] == target["colonia_id"]]
    total = len(peers)
    if total <= 1:
        return {"rank": 1, "total": total, "badge_tier": None, "colonia": target["colonia"]}
    db = request.app.state.db
    peer_ids = [d["id"] for d in peers]
    score_docs = await db.ie_scores.find(
        {"zone_id": {"$in": peer_ids}, "code": "IE_PROY_BADGE_TOP", "is_stub": False, "value": {"$ne": None}},
        {"_id": 0, "zone_id": 1, "value": 1},
    ).to_list(length=50)
    score_by_id = {d["zone_id"]: d["value"] for d in score_docs}
    ranked = sorted(peer_ids, key=lambda i: score_by_id.get(i, -1), reverse=True)
    try:
        rank = ranked.index(dev_id) + 1
    except ValueError:
        rank = total
    has_real_score = dev_id in score_by_id
    pct = rank / total
    if rank == 1 and has_real_score:
        badge_tier = "top"
    elif pct <= 0.30 and has_real_score:
        badge_tier = "high"
    elif has_real_score:
        badge_tier = "mid"
    else:
        badge_tier = None
    return {"rank": rank, "total": total, "badge_tier": badge_tier, "colonia": target["colonia"]}


@router.get("/api/developers/{developer_id}")
async def get_developer(developer_id: str):
    d = DEVELOPERS_BY_ID.get(developer_id)
    if not d:
        raise HTTPException(404, "Desarrolladora no encontrada")
    their_devs = [
        {"id": x["id"], "name": x["name"], "stage": x["stage"], "units_total": x["units_total"]}
        for x in DEVELOPMENTS if x["developer_id"] == developer_id
    ]
    return {**d, "current_developments": their_devs}


@router.post("/api/developments/{dev_id}/briefing")
async def generate_dev_briefing(dev_id: str, request: Request):
    db = request.app.state.db
    d = DEVELOPMENTS_BY_ID.get(dev_id)
    if not d:
        raise HTTPException(404, "Desarrollo no encontrado")
    c = COLONIAS_BY_ID.get(d["colonia_id"])
    week = _iso_week_tag()
    cache_key = f"dev_{dev_id}__{week}"
    cached = await db.property_briefings.find_one({"cache_key": cache_key}, {"_id": 0})
    if cached and cached.get("text"):
        return {"text": cached["text"], "cached": True, "week": week}
    text = None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        scores = c.get("scores", {}) if c else {}
        stage_label = {
            "preventa": "Preventa", "en_construccion": "En construcción",
            "entrega_inmediata": "Entrega inmediata", "exclusiva": "Exclusiva",
        }.get(d["stage"], d["stage"])
        prompt = (
            f"Desarrollo: {d['name']} en {c['name'] if c else d.get('colonia_id', '')}.\n"
            f"Etapa: {stage_label}. Precio desde {d['price_from_display']} hasta {d['price_to_display']}.\n"
            f"Scores Vida: {scores.get('vida', 0)}, Movilidad: {scores.get('movilidad', 0)}, "
            f"Seguridad: {scores.get('seguridad', 0)}. {d['units_available']} unidades disponibles.\n"
            "Genera briefing en máximo 280 caracteres en español MX, un párrafo."
        )
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"devbrief_{dev_id}_{week}",
            system_message=BRIEFING_SYSTEM,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        raw = await chat.send_message(UserMessage(text=prompt))
        text = (raw or "").strip().strip('"')
        if len(text) > 290:
            text = text[:277].rstrip() + "..."
    except Exception:
        text = None
    if not text:
        text = f"{d['name']}: desde {d['price_from_display']}, {d['units_available']} disponibles."[:280]
    await db.property_briefings.update_one(
        {"cache_key": cache_key},
        {"$set": {"cache_key": cache_key, "text": text, "week": week, "created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"text": text, "cached": False, "week": week}


# ─── AI Search parser ──────────────────────────────────────────────────────────
AI_SEARCH_SYSTEM = (
    "Eres el parser de búsqueda natural de DesarrollosMX (CDMX). La gente se expresa de MIL maneras — tu trabajo es "
    "entender CUALQUIER frase y devolver ESTRICTAMENTE un JSON con TODOS los filtros que puedas detectar. Sé GENEROSO: "
    "extrae todo lo que el usuario exprese (dinero, recámaras, amenidades, características, zona, crédito). Schema:\n"
    '{"colonia":[string],"alcaldia":string,"tipo":string,"min_price":number,"max_price":number,'
    '"min_sqm":number,"max_sqm":number,"beds":number,"baths":number,"parking":number,"stage":string,'
    '"amenity":[string],"unit_feature":[string],"orientacion":[string],"piso_min":number,'
    '"enganche_max":number,"mensualidad_max":number}\n'
    "DINERO (MXN): 'mil'=1000, 'millones/mdp/melones'=1000000, '5M'=5000000. RANGO → min_price+max_price: "
    "'10-15mdp'/'10 a 15 millones'/'entre 10 y 15'→min_price:10000000,max_price:15000000. Tope simple 'hasta 15M'→"
    "max_price. 'enganche menor a 500 mil / a lo mucho 500,000'→enganche_max:500000. 'mensualidades de máx 20mil / "
    "que no pasen de 20 mil al mes'→mensualidad_max:20000.\n"
    "tipo ∈ {dept,casa}. stage ∈ {preventa,entrega_inmediata,en_construccion}. orientacion ∈ {Norte,Sur,Oriente,Poniente}.\n"
    "unit_feature (de la UNIDAD) ∈ {terraza,balcon,roof_garden,estacionamiento_independiente,bodega,pet_friendly}. "
    "'roof garden privado'→roof_garden; 'cajón/elevaautos/estacionamiento individual'→estacionamiento_independiente.\n"
    "amenity (del EDIFICIO) usa SLUGS con guión_bajo. Ejemplos: alberca, gym(gimnasio), spa, sauna, jacuzzi, concierge, "
    "seguridad(vigilancia 24/7), cowork(coworking), cancha_padel(padel/pádel), cancha_tenis, asadores(parrilla/bbq), "
    "roof_garden, sky_lounge, cine, area_infantil(juegos niños), business_center, paneles_solares, elevador(ascensor), "
    "salon_eventos, cava, jardines, pet(pet friendly del edificio), bicicletas. Mapea CUALQUIER amenidad que mencionen a "
    "su slug (minúsculas, guión_bajo); si no estás seguro del slug exacto, usa el nombre en minúsculas con guión_bajo.\n"
    "Reglas: omite claves sin evidencia. NO inventes zona si no la dicen (deja colonia fuera)."
)


class AISearchIn(BaseModel):
    query: str


_AI_RATE: Dict[str, list] = {}
_AI_RATE_MAX = int(os.environ.get("AI_SEARCH_MAX_PER_HOUR", "40"))


def _ai_rate_ok(ip: str) -> bool:
    """Cap de costo del LLM: máx N búsquedas con IA por IP/hora. Si se pasa → False (se usa el parser gratis)."""
    import time as _t
    now = _t.time()
    bucket = [t for t in _AI_RATE.get(ip, []) if now - t < 3600]
    if len(bucket) >= _AI_RATE_MAX:
        _AI_RATE[ip] = bucket
        return False
    bucket.append(now)
    _AI_RATE[ip] = bucket
    return True


@router.post("/api/properties/search-ai")
async def ai_search_parser(payload: AISearchIn, request: Request):
    import json as _json
    db = request.app.state.db
    q = (payload.query or "").strip()
    if not q:
        return {"filters": {}, "query": q, "cached": False}
    cache_key = q.lower()[:500]
    cached = await db.ai_search_cache.find_one({"cache_key": cache_key}, {"_id": 0})
    if cached:
        ts = cached.get("created_at")
        if ts is not None and ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts and (datetime.now(timezone.utc) - ts).total_seconds() < 86400:
            return {"filters": cached.get("filters", {}), "query": q, "cached": True, "zona_no_disponible": cached.get("zona_no_disponible")}
    parsed = {}
    # SAFE LIMIT del LLM (control de costo, founder): máx N búsquedas IA por IP/hora. Si se pasa, NO se llama al LLM
    # → cae al parser DETERMINISTA (gratis) abajo. Así el costo de API no se dispara y la búsqueda igual funciona.
    _ip = (request.client.host if request.client else "") or "x"
    _allow_llm = _ai_rate_ok(_ip)
    try:
        if not _allow_llm:
            raise RuntimeError("ai_rate_limited")  # salta al fallback determinista
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"aisrch_{hash(cache_key) & 0xffffffff}",
            system_message=AI_SEARCH_SYSTEM,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        raw = await chat.send_message(UserMessage(text=q))
        txt = (raw or "").strip()
        if txt.startswith("```"):
            txt = txt.strip("`")
            if txt.lower().startswith("json"):
                txt = txt[4:].lstrip()
        s, e = txt.find("{"), txt.rfind("}")
        if s >= 0 and e > s:
            parsed = _json.loads(txt[s:e + 1])
    except Exception:
        parsed = {}
    allowed = {"colonia", "alcaldia", "tipo", "min_price", "max_price", "min_sqm", "max_sqm", "beds", "baths", "parking", "stage", "amenity", "unit_feature", "orientacion", "piso_min", "enganche_max", "mensualidad_max"}
    filters = {k: v for k, v in parsed.items() if k in allowed and v not in (None, "", [], {})}

    # ── Fallback DETERMINISTA (sin LLM) ──────────────────────────────────────────
    # El parser LLM puede estar apagado (local) o no sacar la zona → resultados en zonas que NADIE pidió. Esto saca
    # zona/recámaras/precio/tipo/etapa del texto crudo para que "depa 3 rec en del valle" RESPETE Del Valle (zona =
    # filtro DURO, regla del founder). También es un backstop confiable en prod (corrige lo que el LLM omite).
    import re as _re
    ql = q.lower()
    _DIRS = (" centro", " norte", " sur", " oriente", " poniente", " 1a seccion", " 2a seccion", " i", " ii")
    if "colonia" not in filters:
        cand = []  # (texto_a_buscar, colonia_id) · gana el match más LARGO (evita "valle" antes que "del valle")
        seen_ids = set()
        for c in SEED_COLONIAS:
            nm = (c.get("name") or "").lower().strip()
            cid = c.get("id")
            if not nm or not cid:
                continue
            variants = {nm}
            for d in _DIRS:
                if nm.endswith(d):
                    variants.add(nm[:-len(d)].strip())
            for v in variants:
                if len(v) >= 4:
                    cand.append((v, cid))
            seen_ids.add(cid)
        for d in DEVELOPMENTS:  # colonias con inventario que no estén en el seed
            nm = (d.get("colonia") or "").lower().strip()
            cid = d.get("colonia_id")
            if nm and cid and cid not in seen_ids and len(nm) >= 4:
                cand.append((nm, cid))
        cand.sort(key=lambda x: len(x[0]), reverse=True)
        for v, cid in cand:
            if _re.search(r"\b" + _re.escape(v), ql):
                filters["colonia"] = cid
                break
    if "beds" not in filters:
        m = _re.search(r"(\d+)\s*(rec|rec[aá]mara|habitac|cuarto|dorm)", ql)
        if m:
            filters["beds"] = int(m.group(1))
    if "tipo" not in filters:
        if "depa" in ql or "departamento" in ql:
            filters["tipo"] = "departamento"
        elif "casa" in ql:
            filters["tipo"] = "casa"
    # Enganche / mensualidad ANTES que el precio (para que "enganche menor a 500 mil" no se lea como precio).
    def _money(num, unit):
        n = float((num or "0").replace(",", "").replace(" ", ""))
        u = (unit or "").lower()
        if "mill" in u or u in ("mdp", "mp"):
            return n * 1_000_000
        if u in ("mil", "k"):
            return n * 1_000
        return n
    # Estrategia: saca enganche/mensualidad (van pegados a su palabra) y QUÍTALOS del texto; lo que queda es el
    # precio → así "10-15mdp con mensualidades max 20mil" no confunde el 20mil con el precio.
    _work = ql
    if "enganche_max" not in filters:
        m = _re.search(r"enganche\D{0,22}?(\d[\d,\. ]*)\s*(millones|mill[oó]n|mdp|mil|k)?", _work)
        if m:
            v = _money(m.group(1), m.group(2))
            if v > 0:
                filters["enganche_max"] = int(v)
            _work = _work.replace(m.group(0), " ")
    if "mensualidad_max" not in filters:
        m = _re.search(r"mensualidad\w*\D{0,18}?(\d[\d,\. ]*)\s*(mil|k|mdp)?", _work)
        if m:
            v = _money(m.group(1), m.group(2))
            if 1000 <= v <= 2_000_000:
                filters["mensualidad_max"] = int(v)
            _work = _work.replace(m.group(0), " ")
    # Precio: RANGO ("10-15mdp", "10 a 15 millones", "entre 10 y 15") o tope simple ("hasta 15 millones", "$15M").
    if "max_price" not in filters and "min_price" not in filters:
        mr = _re.search(r"(\d+(?:\.\d+)?)\s*(?:-|–|—|a|y)\s*(\d+(?:\.\d+)?)\s*(mdp|millones|mill[oó]n|m)\b", _work)
        if mr:
            lo, hi = float(mr.group(1)), float(mr.group(2))
            filters["min_price"] = int(min(lo, hi) * 1_000_000)
            filters["max_price"] = int(max(lo, hi) * 1_000_000)
        else:
            ms = _re.search(r"(\d+(?:\.\d+)?)\s*(mdp|millones|mill[oó]n|m\b|mp\b)", _work)
            if ms:
                filters["max_price"] = int(float(ms.group(1)) * 1_000_000)
    if "stage" not in filters:
        if "preventa" in ql:
            filters["stage"] = "preventa"
        elif "inmediata" in ql or "entrega inmediata" in ql or "lista" in ql:
            filters["stage"] = "entrega_inmediata"
    # Amenidades (edificio) + features de la unidad — granularidad fina sin LLM. Solo el vocabulario REAL del
    # catálogo (no se inventa lo que no existe, ej. "campo de golf" no está en desarrollos urbanos de CDMX).
    _UF_KW = {"balcon": ["balcon", "balcón"], "terraza": ["terraza"], "bodega": ["bodega"], "roof_garden": ["roof garden", "roofgarden", "roof-garden"]}
    _AM_KW = {"gym": ["gimnasio", "gym"], "alberca": ["alberca", "piscina"], "spa": ["spa"], "cowork": ["coworking", "cowork"],
              "concierge": ["concierge", "conserje"], "seguridad": ["seguridad", "vigilancia"], "bicicletas": ["bicicleta", "biciclet"],
              "salon_eventos": ["salón de eventos", "salon de eventos", "salon eventos"], "cava": ["cava"], "sky_lounge": ["sky lounge", "skylounge"],
              "business_center": ["business center", "centro de negocios"], "pet": ["pet friendly", "pet-friendly", "mascota"], "jardines": ["jardín", "jardin", "jardines"],
              "roof": ["roof"],
              # Amenidades aspiracionales (taxonomía canónica) — hoy ningún seed las ofrece → se capturan como
              # DEMANDA/hueco ("padel: N pedidos · 0 ofrecen") y el filtro las respeta honesto (0 si nadie la tiene).
              "cancha_padel": ["padel", "pádel"], "cancha_tenis": ["cancha de tenis", "tenis"], "paneles_solares": ["panel solar", "paneles solares"],
              "asadores": ["asador", "asadores", "parrilla", "parrillas", "bbq"], "jacuzzi": ["jacuzzi"], "sauna": ["sauna"],
              "alberca_techada": ["alberca techada"], "area_infantil": ["área infantil", "area infantil", "juegos infantiles", "niños"],
              "cine": ["cine", "sala de cine"], "lavanderia": ["lavandería", "lavanderia"], "elevador": ["elevador", "ascensor"]}
    # COBERTURA TOTAL: suma todo el catálogo canónico (~55 amenidades) por su nombre legible → reconoce cualquiera
    # que el dev pueda ofrecer. El LLM (prod) cubre las frases libres; esto es el respaldo determinista.
    try:
        from dmx_unit_schema import AMENITY_TAXONOMY as _TAX
        for _slugs in _TAX.values():
            for _slug in _slugs:
                _AM_KW.setdefault(_slug, [_slug.replace("_", " ")])
    except Exception:
        pass
    if "unit_feature" not in filters:
        ufh = [s for s, kws in _UF_KW.items() if any(k in ql for k in kws)]
        if ufh:
            filters["unit_feature"] = ufh
    if "amenity" not in filters:
        amh = [s for s, kws in _AM_KW.items() if any(k in ql for k in kws) and not (s == "roof" and ("unit_feature" in filters and "roof_garden" in filters.get("unit_feature", [])))]
        if amh:
            filters["amenity"] = amh
    # HONESTIDAD DE ZONA: si el usuario nombró un lugar que NO cubrimos (ej. Interlomas = Edomex, no CDMX) y no mapeó
    # a ninguna colonia, NO finjas resultados de otra zona — devuelve el nombre para avisarle. Detecta "en <lugar>".
    zona_no_disponible = None
    if "colonia" not in filters:
        mz = _re.search(r"\ben\s+([a-záéíóúñ]+(?:\s+(?!y\b|con\b|de\b|por\b|m[aá]x|menos|cerca)[a-záéíóúñ]+)?)", ql)
        if mz:
            cand = mz.group(1).strip()
            _NONZONE = {"balcon", "balcón", "terraza", "bodega", "roof", "gimnasio", "gym", "alberca", "spa", "preventa",
                        "obra", "construccion", "construcción", "venta", "renta", "piso", "credito", "crédito", "contado", "preci"}
            if len(cand) >= 4 and cand.split()[0] not in _NONZONE:
                zona_no_disponible = cand
    out = {"cache_key": cache_key, "filters": filters, "query": q, "created_at": datetime.now(timezone.utc)}
    if zona_no_disponible:
        out["zona_no_disponible"] = zona_no_disponible
    await db.ai_search_cache.update_one({"cache_key": cache_key}, {"$set": out}, upsert=True)

    # ── B · CAPTURA DE DEMANDA GRANULAR ──────────────────────────────────────────
    # Cada "Buscar con IA" es una señal de lo que el mercado QUIERE — incluso lo que NO podemos cumplir (padel,
    # zapata, Cofinavit, Interlomas) = los HUECOS, el dato más valioso. Anónimo (ip_hash). Fail-open. Alimenta el
    # cubo de demanda para dev/superadmin (no perdemos ninguna intención del comprador).
    try:
        import hashlib as _hl
        from datetime import datetime as _dt
        _amen = filters.get("amenity") or []
        _ip = (request.client.host if request.client else "") or "x"
        # Supply coarse: ¿cuántos desarrollos ofrecen TODAS las amenidades pedidas? (0 = hueco claro)
        _supply = sum(1 for d in DEVELOPMENTS if set(_amen).issubset(set(d.get("amenities", [])))) if _amen else None
        # A · CAPTURA TOTAL: los 4 obligatorios marcan si la intención fue COMPLETA o exploratoria/abandonada (las
        # incompletas también son demanda: "quería X pero no completó"). Guardamos el texto CRUDO para descubrir
        # cómo habla la gente (mejora el parser + revela demanda que ni mapeamos).
        _completa = bool(filters.get("colonia") and filters.get("max_price") and filters.get("beds")
                         and (filters.get("min_sqm") or filters.get("max_sqm")))
        await db.marketplace_searches.insert_one({
            "source": "ai_search",
            "colonias": [filters["colonia"]] if filters.get("colonia") else [],
            "colonia_id": filters.get("colonia"),
            "recamaras_min": filters.get("beds"), "banos_min": filters.get("baths"),
            "precio_min": filters.get("min_price"), "precio_max": filters.get("max_price"),
            "m2_min": filters.get("min_sqm"), "m2_max": filters.get("max_sqm"),
            "enganche_max": filters.get("enganche_max"), "mensualidad_max": filters.get("mensualidad_max"),
            "stage_pedido": filters.get("stage"), "tipo_pedido": filters.get("tipo"),
            "amenidades_pedidas": _amen, "features_pedidos": filters.get("unit_feature") or [],
            "zona_no_disponible": zona_no_disponible,
            "unmet": bool(zona_no_disponible) or (_supply == 0),
            "completa": _completa,
            "texto_crudo": q[:300], "query": q[:200], "ip_hash": _hl.sha256(_ip.encode()).hexdigest()[:16],
            "created_at_dt": _dt.utcnow(),
        })
    except Exception:
        pass
    return {"filters": filters, "query": q, "cached": False, "zona_no_disponible": zona_no_disponible}


class NLPSearchIn(BaseModel):
    query: str


@router.post("/api/search/nlp")
async def nlp_search(payload: NLPSearchIn):
    q = payload.query.lower()
    results = [p for p in SEED_PROPERTIES if q in p["colonia"].lower() or q in p["titulo"].lower()]
    return {"properties": results or SEED_PROPERTIES[:3], "reasoning": "Búsqueda por palabras clave", "chips": []}


# ─── Health ────────────────────────────────────────────────────────────────────
@router.get("/api/health")
async def health():
    return {
        "status": "ok", "service": "DesarrollosMX API v2",
        "colonias": len(SEED_COLONIAS), "properties": len(SEED_PROPERTIES),
    }
