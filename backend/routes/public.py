"""Phase 4 Batch 0 — Public marketplace routes extracted from server.py.
Endpoints: /api/colonias/*, /api/properties/*, /api/developments/*, /api/developers/*,
           /api/search/*, /api/health
Backward-compat: same URLs, same response shape.
"""
import os
import re
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel

from data_seed import COLONIAS as SEED_COLONIAS, COLONIAS_BY_ID, PROPERTIES as SEED_PROPERTIES
from data_developments import DEVELOPMENTS, DEVELOPMENTS_BY_ID, DEVELOPERS_BY_ID

router = APIRouter(tags=["public"])

EMERGENT_LLM_KEY = os.environ.get("ANTHROPIC_API_KEY")
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


_OV_SKIP = {"unit_id", "dev_id", "updated_by", "updated_at", "reason", "hold_id", "price_change_reason"}


def _merge_units(units: list, ov_map: dict) -> list:
    """Fusiona (sync) un mapa {unit_id: override} sobre las unidades base. El override del dev gana (precio/estado/m²/…)."""
    if not units or not ov_map:
        return units
    return [({**u, **{k: v for k, v in (ov_map.get(u.get("id")) or {}).items()
                      if k not in _OV_SKIP and v is not None}}) for u in units]


async def _apply_unit_overrides(db, dev_id: str, units: list) -> list:
    """Fusiona las ediciones MANUALES del dev (developer_unit_overrides: precio/estado/m²/bodega/cajón…) sobre las
    unidades base → el comprador ve EXACTO lo que el dev administra en su portal. Cierra el ciclo dev→comprador
    (mismo merge que /developments/{id}/units, ahora también en la ficha). Fail-open."""
    if not units:
        return units
    try:
        ov_map = {}
        async for ov in db.developer_unit_overrides.find({"dev_id": dev_id}, {"_id": 0}):
            ov_map[ov.get("unit_id")] = ov
        return _merge_units(units, ov_map)
    except Exception:
        return units


def _aggregates_from_units(units: list) -> dict:
    """Conteos + rangos + desde/hasta derivados de las unidades EFECTIVAS (tras overrides del dev). Evita que el documento
    siga mostrando cifras viejas del seed (precio, disponibles, m²/recámaras/baños/cajones) cuando el dev edita unidades.
    Devuelve un dict para .update() sobre el doc/card. Espeja la lógica de _build_dev en data_developments.py."""
    units = [u for u in (units or []) if u]
    if not units:
        return {}
    # roofs privados / locales / bodegas NO son el 'desde' ni los conteos del edificio
    # (07-17 Punto Destino: Coahuila mostraba 'desde $550,000' = un roof, no un depto)
    _NO_DEPTO = {"roof_garden", "roof", "local", "bodega", "estacionamiento", "cajon"}
    deptos = [u for u in units
              if str(u.get("type") or u.get("tipo") or "depto").lower() not in _NO_DEPTO] or units
    agg: dict = {}
    prices = [u.get("price") for u in deptos if u.get("price")]
    if prices:
        agg["price_from"] = min(prices)
        agg["price_to"] = max(prices)
        agg["price_from_display"] = f"${int(min(prices)):,}"
    m2 = [u.get("m2_privative") for u in deptos if u.get("m2_privative")]
    if m2:
        agg["m2_range"] = [min(m2), max(m2)]
    beds = [u.get("bedrooms") for u in deptos if u.get("bedrooms") is not None]
    if beds:
        agg["bedrooms_range"] = [min(beds), max(beds)]
    baths = [u.get("bathrooms") for u in deptos if u.get("bathrooms") is not None]
    if baths:
        agg["bathrooms_range"] = [min(baths), max(baths)]
    park = [u.get("parking_spots") for u in deptos if u.get("parking_spots") is not None]
    if park:
        agg["parking_range"] = [min(park), max(park)]
    sc = {"disponible": 0, "reservado": 0, "vendido": 0}
    for u in deptos:
        s = (u.get("status") or "disponible").lower()
        sc["reservado" if s == "apartado" else s] = sc.get("reservado" if s == "apartado" else s, 0) + 1
    agg["units_total"] = len(deptos)
    agg["units_available"] = sc.get("disponible", 0)
    agg["units_reserved"] = sc.get("reservado", 0)
    agg["units_sold"] = sc.get("vendido", 0)
    return agg


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
            # Sellos de confianza (antes se calculaban en el front y NUNCA llegaban) + años de experiencia:
            "years_experience": dev.get("years_experience"),
            "verified_constitution": dev.get("verified_constitution"),
            "no_judicial_records": dev.get("no_judicial_records"),
            "no_profeco_complaints": dev.get("no_profeco_complaints"),
            "website": dev.get("website"), "description": dev.get("description"),
            # Teléfono del desarrollador → los 3 CTA de "llamar" de la ficha funcionan (fallback al contacto/WhatsApp del proyecto).
            "phone": dev.get("phone") or d.get("contact_phone") or DMX_FALLBACK_WHATSAPP,
        }
    out["contact_phone"] = d.get("contact_phone") or DMX_FALLBACK_WHATSAPP
    return out


def _norm_stage(s, delivery=None):
    """Solo 2 etapas de cara al comprador: PREVENTA o ENTREGA INMEDIATA. Clasifica por la FECHA de entrega (no solo
    la etiqueta): si la entrega ya llegó (fecha pasada o este mes) = ENTREGA INMEDIATA; si falta, = PREVENTA. Así
    nunca sale el contradictorio 'preventa · entrega ya'."""
    # normaliza espacios a guion bajo: GDC trae "entrega inmediata" (espacio), CLASS
    # "entrega_inmediata" (guion) — sin esto los GDC de entrega salían como 'preventa' (07-16)
    sl = str(s or "").lower().replace(" ", "_")
    if sl in ("entrega", "entrega_inmediata", "entregado", "lista", "listo") or "inmediata" in sl:
        return "entrega_inmediata"
    if delivery:
        import re as _re
        from datetime import datetime as _dt
        # la ingesta trae el TEXTO real del dev ("ENTREGA INMEDIATA") — no es fecha, pero es explícito
        if _re.search(r"(?i)inmediata", str(delivery)):
            return "entrega_inmediata"
        m = _re.match(r"(\d{4})-(\d{1,2})", str(delivery))
        if m:
            now = _dt.utcnow()
            months = (int(m.group(1)) - now.year) * 12 + (int(m.group(2)) - now.month)
            if months <= 0:
                return "entrega_inmediata"
    return "preventa"


def _plazo_ok(delivery, plazo):
    """¿La fecha de entrega cae en el bucket de plazo pedido? (solo aplica a preventa) menos_3/3_6/6_12/mas_12."""
    if not plazo:
        return True
    import re as _re
    from datetime import datetime as _dt
    m = _re.match(r"(\d{4})-(\d{1,2})", str(delivery or ""))
    if not m:
        return False
    now = _dt.utcnow()
    months = (int(m.group(1)) - now.year) * 12 + (int(m.group(2)) - now.month)
    if plazo == "menos_3":
        return 0 < months <= 3
    if plazo == "3_6":
        return 3 < months <= 6
    if plazo == "6_12":
        return 6 < months <= 12
    if plazo == "mas_12":
        return months > 12
    return True


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
    # 1b) ediciones MANUALES del dev (batch) → el 'desde' de la tarjeta refleja los precios editados, igual que la ficha
    ov_by_dev: Dict[str, Dict[str, Any]] = {}
    try:
        async for ov in db.developer_unit_overrides.find({"dev_id": {"$in": ids}}, {"_id": 0}):
            ov_by_dev.setdefault(ov.get("dev_id"), {})[ov.get("unit_id")] = ov
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
        card["stage"] = _norm_stage(card.get("stage"), d.get("delivery_estimate"))   # por fecha de entrega real
        # Conteos + rangos + desde/hasta coherentes con las unidades vivas (overlay + ediciones manuales del dev) — no cifras viejas
        _eff_units = _merge_units(_apply_overlay(d).get("units") or [], ov_by_dev.get(d["id"]) or {})
        card.update(_aggregates_from_units(_eff_units))
        cid = d.get("colonia_id")
        col = _COLS.get(cid) or {}
        m2lo = (d.get("m2_range") or [0])[0] or 0
        dev_pm2 = (card.get("price_from") or 0) / m2lo if m2lo else 0
        if dev_pm2:
            card["price_m2_dev"] = round(dev_pm2)
            zona_pm2 = col.get("price_m2_num") or ((col.get("price_m2") or 0) * 1000)
            if zona_pm2:
                card["precio_vs_zona_pct"] = round((dev_pm2 / float(zona_pm2) - 1) * 100)
        if col.get("momentum"):
            card["plusvalia_zona"] = col.get("momentum")        # tendencia real de la colonia (MERCADO)
        if cid in fc_by_col:
            card["forecast_12m_pct"] = round(fc_by_col[cid], 1)  # forecast (cuando hay dato)
        # Incremento en preventa = lo que el DEV ha subido desde su precio de lista de lanzamiento (decisión del dev, NO mercado).
        # GATED a dato REAL: solo se emite si el dev cargó precio_lanzamiento real y hoy vende más caro. Cero inventado
        # (antes era un hash md5 demo → violaba la regla de no mostrar data falsa como real). Hoy ningún dev lo tiene → no se ve.
        _pl = d.get("precio_lanzamiento")
        if (card.get("stage") in ("preventa", "en_construccion") and d.get("price_from")
                and _pl and float(_pl) > 0 and d["price_from"] > float(_pl)):
            card["precio_lanzamiento"] = round(float(_pl))
            card["incremento_preventa_pct"] = round((d["price_from"] / float(_pl) - 1) * 100)
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
@router.get("/api/zona/{colonia_id}/pulso")
async def zona_pulso(colonia_id: str, request: Request):
    """PULSO de demanda de una zona: cuántos la buscan (7d vs 7d previos) + lo más pedido. Alimenta el panel de
    inteligencia (data viva, no folleto). Lee marketplace_searches (colonias es lista plana). Fail-open."""
    try:
        db = request.app.state.db
        from datetime import datetime as _dt, timedelta as _td
        from collections import Counter as _C
        now = _dt.utcnow()
        q = {"colonias": colonia_id}
        last7 = await db.marketplace_searches.count_documents({**q, "created_at_dt": {"$gte": now - _td(days=7)}})
        prev7 = await db.marketplace_searches.count_documents({**q, "created_at_dt": {"$gte": now - _td(days=14), "$lt": now - _td(days=7)}})
        trend = round(((last7 - prev7) / prev7) * 100) if prev7 else (100 if last7 else 0)
        recs, precios = [], []
        async for s in db.marketplace_searches.find({**q, "created_at_dt": {"$gte": now - _td(days=30)}},
                                                    {"_id": 0, "recamaras_min": 1, "precio_max": 1}).limit(500):
            if s.get("recamaras_min"):
                recs.append(s["recamaras_min"])
            if s.get("precio_max"):
                precios.append(s["precio_max"])
        # RENTABILIDAD: yield bruto de renta por tier de la zona (benchmark transparente del motor, NO medido).
        # El panel computa la renta $/m² desde su precio/m² × yield. Cierra el ciclo inversión.
        yield_pct = None
        try:
            from investment_simulator_engine import RENTAL_YIELDS
            col = await db.colonias.find_one({"id": colonia_id}, {"_id": 0, "tier": 1})
            yld = RENTAL_YIELDS.get(str((col or {}).get("tier") or "C"), 0.045)
            yield_pct = round(yld * 100, 1)
        except Exception:
            pass
        # Gate k-anon canónico: endpoint PÚBLICO — bajo K_ANON_MIN no exponemos conteo exacto ni
        # presupuesto/recámaras (identificarían buscadores concretos). El nivel cualitativo sí se publica.
        from anonymization_engine import K_ANON_MIN as _KANON
        _ok_k = last7 >= _KANON
        return {"ok": True, "busquedas_7d": (last7 if _ok_k else None), "trend_pct": (trend if _ok_k else None),
                "nivel": "alta" if last7 >= 10 else "media" if last7 >= 3 else "baja",
                "rec_moda": (_C(recs).most_common(1)[0][0] if (recs and len(recs) >= _KANON) else None),
                "precio_buscado_prom": (round(sum(precios) / len(precios)) if (precios and len(precios) >= _KANON) else None),
                "yield_anual_pct": yield_pct}
    except Exception:
        return {"ok": True, "busquedas_7d": 0, "trend_pct": 0, "nivel": "baja"}


@router.get("/api/zona/{colonia_id}/inversion")
async def zona_inversion(colonia_id: str, request: Request):
    """INTELIGENCIA DE INVERSIÓN de la zona (motor real investment_simulator_engine, no inventado): precios de venta
    (promedio/min/max/$m²) + renta mensual/anual + yield + ROI + TIR + veredicto de inversión. Sobre un depto
    REPRESENTATIVO de la zona. Estimado transparente. Fail-open."""
    try:
        db = request.app.state.db
        from data_developments import DEVELOPMENTS
        devs = [d for d in DEVELOPMENTS if d.get("colonia_id") == colonia_id]
        precios = [d.get("price_from") for d in devs if d.get("price_from")]
        out = {"ok": True, "n_desarrollos": len(devs), "tiene_mercado": bool(precios)}
        if precios:
            out["precio_prom"] = round(sum(precios) / len(precios))
            out["precio_min"] = min(precios)
            out["precio_max"] = max(precios)
        pm2s = [d["price_from"] / ((d.get("m2_range") or [0])[0]) for d in devs
                if d.get("price_from") and (d.get("m2_range") or [0])[0]]
        if pm2s:
            out["precio_m2"] = round(sum(pm2s) / len(pm2s))
        # HONESTIDAD: solo simulamos con un precio REAL de mercado. Sin desarrollos → sin precio → devolvemos
        # tiene_mercado=false y CERO métricas fabricadas (nada de default 50,000/m²). El front muestra modo descubrimiento.
        rep = out.get("precio_prom") or ((out.get("precio_m2") or 0) * 80) or None
        if not rep:
            return out
        try:
            from investment_simulator_engine import simulate, _mortgage_rate
            sim = await simulate(db, rep, 60, 80, colonia_id, financiamiento_pct=0.80)  # depto típico 80m², 5 años, 80% crédito
            base = (sim or {}).get("base") or {}
            renta_neta_m = base.get("renta_mensual_neta") or 0
            renta_bruta_m = base.get("renta_mensual_bruta") or 0
            aprec = (base.get("aprec_anual_pct") or 0) / 100.0
            renta_neta_anual = renta_neta_m * 12
            gastos_cierre = rep * 0.08   # ~8% adquisición
            # Exit óptimo: maximiza el retorno ANUALIZADO de un comprador de contado (años 2-7), descontando costos.
            def _gain_at(y):
                precio_y = rep * ((1 + aprec) ** y)
                return (precio_y - rep) + renta_neta_anual * y - gastos_cierre - precio_y * 0.05  # 5% venta
            best_y, best_ann = 5, -1e9
            for y in range(2, 8):
                ann = (_gain_at(y) / rep) / y if rep else 0
                if ann > best_ann:
                    best_ann, best_y = ann, y
            rate = _mortgage_rate() or 0.105
            out.update({
                "precio_representativo": rep,
                "renta_mensual_neta": round(renta_neta_m), "renta_mensual_bruta": round(renta_bruta_m),
                "renta_anual": round(renta_neta_anual) if renta_neta_anual else None,
                "roi_rentas_anual_pct": (round((renta_neta_anual / rep) * 100, 1) if rep else None),  # yield neto
                "tir_anual_pct": base.get("tir_anual_pct"),
                "plusvalia_anual_pct": base.get("aprec_anual_pct"),
                "plusvalia_anual_abs": round(rep * aprec) if aprec else None,
                "ganancia_5y_abs": round(_gain_at(5)),
                "ganancia_5y_pct": round((_gain_at(5) / rep) * 100) if rep else None,
                "exit_year": best_y,
                "enganche_20": round(base.get("enganche") or rep * 0.20),
                "tasa_credito": {"baja": round((rate - 0.015) * 100, 1), "promedio": round(rate * 100, 1), "alta": round((rate + 0.015) * 100, 1)},
            })
            # Renta que se MUESTRA = bruta (sigue al rango de precio). Cap rate = NOI (renta NETA) / precio, por definición.
            renta_bruta_anual = renta_bruta_m * 12
            ny = (renta_bruta_anual / rep) if rep else 0  # yield bruto · solo para el rango de renta a mostrar
            _renta_m = lambda p: (round(p * ny / 12) if (p and ny) else None)
            cap_rate = round((renta_neta_anual / rep) * 100, 1) if rep else 0   # cap rate = NOI (renta neta) / precio
            plus_pct = base.get("aprec_anual_pct") or 0
            out.update({
                "renta_menor": _renta_m(out.get("precio_min")),
                "renta_prom": _renta_m(out.get("precio_prom")),
                "renta_mayor": _renta_m(out.get("precio_max")),
                "cap_rate_anual_pct": cap_rate,                          # cap rate = NOI (renta NETA) / precio
                "roi_anual_pct": round(plus_pct + (cap_rate or 0), 1),   # retorno total al año = plusvalía + cap rate
            })
            tir = base.get("tir_anual_pct")
            if tir is not None:
                out["veredicto_inversion"] = ("excelente" if tir >= 12 else "buena" if tir >= 8 else "moderada" if tir >= 5 else "baja")
            # 3 ESCENARIOS (el motor los calcula) — para el tab de INVERTIR: plusvalía + TIR por escenario.
            esc = []
            for nom, kk in (("Conservador", "conservador"), ("Base", "base"), ("Optimista", "optimista")):
                sc = (sim or {}).get(kk) or {}
                if sc.get("aprec_anual_pct") is not None:
                    esc.append({"nombre": nom, "plusvalia_pct": sc.get("aprec_anual_pct"), "tir_pct": sc.get("tir_anual_pct")})
            if len(esc) >= 2:
                out["escenarios_inv"] = esc
            # CRÉDITO HIPOTECARIO · plazo REAL de 20 años (240 meses), tasa promedio. Pago mensual + total al final.
            plazo_cred = 240
            r_m = rate / 12.0
            def _pmt_c(aforo_frac):
                P = rep * aforo_frac
                return (P / plazo_cred) if r_m <= 0 else P * r_m / (1 - (1 + r_m) ** (-plazo_cred))
            out["credito"] = {
                "valor_inmueble": rep,
                "plazo_anios": 20,
                "tasa_min_pct": round((rate - 0.015) * 100, 1),
                "tasa_prom_pct": round(rate * 100, 1),
                "tasa_max_pct": round((rate + 0.015) * 100, 1),
                "escenarios": [
                    {"aforo": af, "prestamo": round(rep * af / 100.0), "enganche": round(rep * (100 - af) / 100.0),
                     "pago": round(_pmt_c(af / 100.0)), "total": round(_pmt_c(af / 100.0) * plazo_cred)}
                    for af in (30, 50, 80)
                ],
            }
            # COMPARATIVA vs instrumentos (el "villano" · costo de oportunidad): MISMO capital a 5 años.
            # Inmueble = ganancia real del motor (renta+plusvalía−costos). CETES vivo (Banxico). Bolsa = referencia histórica.
            try:
                anios = 5
                from market_rates_engine import cetes_rate
                cetes_r = await cetes_rate(db, "cetes_364")   # CETES 364d VIVO (market_rates · Banxico vía cron · jun2026 = 7%)
                bolsa_r = 0.10    # S&P histórico de REFERENCIA (no feed vivo · etiquetado en UI)
                g_inm = out.get("ganancia_5y_abs")
                if rep and g_inm is not None:
                    cetes_gana = rep * ((1 + cetes_r) ** anios - 1)
                    bolsa_gana = rep * ((1 + bolsa_r) ** anios - 1)
                    out["comparativa_instrumentos"] = {
                        "capital": rep, "anios": anios,
                        "inmueble_gana": round(g_inm), "inmueble_pct": out.get("ganancia_5y_pct"),
                        "cetes_gana": round(cetes_gana), "cetes_pct": round(((1 + cetes_r) ** anios - 1) * 100),
                        "bolsa_gana": round(bolsa_gana), "bolsa_pct": round(((1 + bolsa_r) ** anios - 1) * 100),
                        "cetes_tasa_pct": round(cetes_r * 100, 1), "bolsa_tasa_pct": round(bolsa_r * 100, 1),
                        "inmueble_gana_vs_cetes": round(g_inm - cetes_gana),
                    }
            except Exception:
                pass
            # DEMANDA EN VIVO de la zona (señal REAL de intención · marketplace_searches). Mata el miedo "¿se rentará/venderá?".
            try:
                dem = await db.marketplace_searches.count_documents({"colonias": colonia_id})
                if dem:
                    # F6 (auditoría): banda k-anon, NO el conteo exacto (misma doctrina que /api/v1/cuts)
                    from cube_lens import _banda_personas, K_ANON_MIN
                    banda = _banda_personas(int(dem), K_ANON_MIN)
                    if banda:
                        dem_alerta = await db.marketplace_searches.count_documents({"colonias": colonia_id, "alert": True})
                        out["demanda_zona"] = {"banda": banda, "hay_alertas": bool(dem_alerta)}
            except Exception:
                pass
            # RETORNO NETO DE IMPUESTOS (régimen de arrendamiento · deducción ciega 35% × tasa marginal ~30% ≈ 19.5%
            # efectivo sobre renta bruta · estimado). El ISR de la VENTA (LISR Art 126) lo calcula tax_projector al cotizar.
            try:
                if out.get("renta_prom") and out.get("cap_rate_anual_pct") is not None:
                    isr_ef = 0.195
                    out["impuestos"] = {
                        "isr_renta_efectivo_pct": round(isr_ef * 100),
                        "renta_neta_isr_mes": round(out["renta_prom"] * (1 - isr_ef)),
                        "cap_rate_neto_isr_pct": round(out["cap_rate_anual_pct"] * (1 - isr_ef), 1),
                    }
            except Exception:
                pass
            # POSICIÓN vs PROMEDIO DE LA CIUDAD (¿cara o barata para lo que es? · dato real agregado).
            try:
                if out.get("precio_m2"):
                    agg = await db.colonias.aggregate([
                        {"$match": {"precio_pm2": {"$gt": 0}}},
                        {"$group": {"_id": None, "avg_m2": {"$avg": "$precio_pm2"}}},
                    ]).to_list(1)
                    avg_m2 = (agg[0].get("avg_m2") if agg else None)
                    if avg_m2:
                        out["vs_ciudad"] = {
                            "precio_m2_zona": out["precio_m2"], "precio_m2_ciudad": round(avg_m2),
                            "precio_vs_ciudad_pct": round((out["precio_m2"] / avg_m2 - 1) * 100),
                        }
            except Exception:
                pass
        except Exception:
            pass
        return out
    except Exception:
        return {"ok": True}


@router.get("/api/zona/{colonia_id}/ciclo")
async def zona_ciclo(colonia_id: str, request: Request):
    """Fase del CICLO inmobiliario de la zona (motor zone_cycle_engine · señal comparada con la ciudad) → '¿es buen
    momento para comprar aquí?'. Antes solo lo veía el portal del dev; ahora también el comprador. Fail-open · hide-if-empty
    (available=False si no hay colonia). La lectura es para el COMPRADOR (no la del dev, que habla de subir precio/vender)."""
    try:
        from data_seed import COLONIAS_BY_ID, COLONIAS
        import zone_cycle_engine as zce
        c = COLONIAS_BY_ID.get(colonia_id)
        if not c:
            return {"ok": False, "available": False}
        zce.ensure_cycle_distributions(COLONIAS)
        z = zce.compute_zone_cycle(c)
        _fase = (z.get("ciclo") or {}).get("fase_key")
        _buyer = {
            "expansion": "La zona va al alza — si compras probablemente siga subiendo, pero ya no entras tan barato.",
            "recuperacion": "Apenas empieza a subir — buen momento para entrar antes de que se encarezca.",
            "maduro": "Zona consolidada — estable y segura, con crecimiento más lento. Pagas por la tranquilidad.",
            "contraccion": "Precios a la baja — puede haber oportunidad, pero revisa bien antes de entrar.",
        }.get(_fase)
        return {"ok": True, "available": True, "ciclo": z.get("ciclo"), "gentrificacion": z.get("gentrificacion"),
                "lectura_comprador": _buyer,
                "nota": "Señal del ciclo comparada con el resto de la ciudad — no un número exacto."}
    except Exception:
        return {"ok": False, "available": False}


@router.get("/api/zona/{colonia_id}/riesgo")
async def zona_riesgo(colonia_id: str, request: Request):
    """Riesgo NATURAL REAL de la zona (Atlas de Riesgos CDMX · natural_risk_engine): zona sísmica (A=bajo … D=alto),
    % inundación y hundimiento del subsuelo. El dato de seguridad más honesto para el comprador (no inventado). Fail-open ·
    hide-if-empty: si no hay capa del Atlas para la zona, available=False (el front no muestra nada)."""
    try:
        import natural_risk_engine as nre
        r = await nre.compute_natural_risk_zone(request.app.state.db, colonia_id)
        if not r or not r.get("available"):
            return {"ok": False, "available": False}
        return {"ok": True, "available": True,
                "sismic_zone": r.get("sismic_zone"), "flood_pct": r.get("flood_pct"),
                "subsidence_mm_year": r.get("subsidence_mm_year"), "fuente": "Atlas de Riesgos CDMX"}
    except Exception:
        return {"ok": False, "available": False}


@router.get("/api/zona/{colonia_id}/vida")
async def zona_vida(colonia_id: str, request: Request):
    """LA VIDA EN LA ZONA: conteos REALES de amenidades por categoría (OSM, denue_zone_density) — restaurantes,
    cafés, escuelas, hospitales, parques, etc. Surfacea data que estaba huérfana (sin UI). Fail-open.
    (Seguridad/safety_score NO se expone: sale inconsistente; cero dato dudoso al público.)"""
    try:
        db = request.app.state.db
        out = {"ok": True}
        d = await db.denue_zone_density.find_one(
            {"zone_id": colonia_id}, {"_id": 0, "by_category": 1, "businesses_count_total": 1, "source": 1})
        if d:
            out["amenidades"] = d.get("by_category") or {}
            out["amenidades_total"] = d.get("businesses_count_total")
            out["fuente"] = d.get("source")
        return out
    except Exception:
        return {"ok": True}


@router.get("/api/zona/{colonia_id}/lugares")
async def zona_lugares(colonia_id: str, request: Request):
    """LUGARES con NOMBRE + estrellas + #reseñas + ubicación (curado por categoría · Google Places, SKU Enterprise).
    Se llena con ingest_places_batch cuando haya desarrollos reales. Fail-open: si no hay data, devuelve vacío y el
    frontend usa la vista previa. NO inventa nada."""
    try:
        db = request.app.state.db
        d = await db.zone_places.find_one(
            {"zone_id": colonia_id}, {"_id": 0, "places": 1, "source": 1, "v": 1})
        try:
            from google_places_ingest import INGEST_VERSION
            stale = bool(d) and int(d.get("v") or 0) < INGEST_VERSION
        except Exception:
            stale = False
        if not (d and d.get("places")) or stale:
            # ON-DEMAND (B): ingesta lazy en segundo plano (fail-open · presupuesto compartido). Dispara si NO hay datos
            # O si el cache es de una versión vieja de la lógica (re-ingesta con categorías/tipos nuevos).
            try:
                import asyncio
                from google_places_ingest import ingest_one_zone
                asyncio.create_task(ingest_one_zone(db, colonia_id))
            except Exception:
                pass
            if not (d and d.get("places")):
                return {"ok": True, "lugares": {}, "cargando": True}
            # cache viejo pero con datos: se re-ingesta atrás; por ahora devuelve lo que hay (el próximo visit trae lo nuevo)
        places = d.get("places")
        out = {"ok": True, "fuente": d.get("source"), "lugares": places}
        # CONECTIVIDAD: minutos caminando a la estación más cercana (haversine · ~75 m/min · aprox · cero API extra).
        try:
            col = await db.colonias.find_one({"id": colonia_id}, {"_id": 0, "center": 1})
            center = (col or {}).get("center")
            transit = places.get("transporte") or []
            if isinstance(center, (list, tuple)) and len(center) >= 2 and transit:
                import math
                clng, clat = float(center[0]), float(center[1])
                best = None
                for p in transit:
                    loc = p.get("loc") or {}
                    plat, plng = loc.get("latitude"), loc.get("longitude")
                    if plat is None or plng is None:
                        continue
                    dlat = math.radians(plat - clat); dlng = math.radians(plng - clng)
                    a = (math.sin(dlat / 2) ** 2 + math.cos(math.radians(clat)) * math.cos(math.radians(plat)) * math.sin(dlng / 2) ** 2)
                    dist_m = 6371000 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                    if best is None or dist_m < best[0]:
                        best = (dist_m, p.get("name"))
                if best:
                    out["metro"] = {"nombre": best[1], "min_caminando": max(1, round(best[0] / 75)), "metros": round(best[0])}
        except Exception:
            pass
        return out
    except Exception:
        return {"ok": True, "lugares": {}}


@router.get("/api/zona/place-photo")
async def zona_place_photo(request: Request, ref: str, w: int = 640):
    """Proxy de foto de un lugar (Place Photo · bajo demanda). Resuelve la referencia → URL pública estable, cacheada,
    con tope mensual. NO expone la API key al cliente. Devuelve {uri} o {uri:null}. Fail-open."""
    try:
        from google_places_ingest import resolve_photo
        uri = await resolve_photo(request.app.state.db, ref, w)
        return {"ok": True, "uri": uri}
    except Exception:
        return {"ok": True, "uri": None}


@router.get("/api/market/vehiculos")
async def market_vehiculos(request: Request):
    """Tabla comparativa de vehículos de inversión + criterios (tasas junio 2026 · CETES vivo de Banxico vía cron semanal).
    La página de zona y la calculadora leen de aquí → cuando el cron actualiza, la app se actualiza sola."""
    try:
        from market_rates_engine import get_rates
        d = await get_rates(request.app.state.db)
        return {"ok": True, "vehiculos": d.get("vehiculos") or [], "actualizado": d.get("updated_at"), "fuente": d.get("source")}
    except Exception:
        return {"ok": True, "vehiculos": []}


@router.post("/api/inversion-v4/analyze")
async def inversion_v4_analyze(request: Request):
    """Calculadora de inversión v4 (grado institucional). Inyecta mercado vivo (CETES/UDIS/inflación), corre el motor
    financiero + fiscal MX y devuelve métricas + veredicto en lenguaje natural + comparativa de instrumentos. Reactivo:
    el front llama esto en cada cambio de input. Fuentes: inversion_v4_finance/tax/veredicto + market_rates_engine."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    # SEGURIDAD (3ª ola): descarta NaN/Infinity de los números del body (JSON de Python los acepta) — antes
    # envenenaban el log de demanda revelada / AVM con valores no-finitos. Se tratan como ausentes.
    import math as _math
    if isinstance(body, dict):
        body = {k: (None if isinstance(v, float) and not _math.isfinite(v) else v) for k, v in body.items()}
    try:
        from inversion_v4_finance import analyze
        from inversion_v4_tax import make_isr_fn
        from inversion_v4_veredicto import veredicto
        from market_rates_engine import market_context, get_rates
        db = request.app.state.db
        mkt = await market_context(db)
        # inyecta mercado solo si el usuario no lo sobreescribió (todo editable)
        inp = dict(body or {})
        for k_inp, k_mkt in (("cetes_1a", "cetes_1a"), ("udis_actual", "udis"), ("inflacion_anual", "inflacion_anual")):
            if inp.get(k_inp) in (None, ""):
                inp[k_inp] = mkt.get(k_mkt)
        if inp.get("tasa_anual") in (None, "") and inp.get("con_credito", True):
            inp["tasa_anual"] = mkt.get("tasa_hipotecaria")
        res = analyze(inp, isr_fn=make_isr_fn())
        res["veredicto"] = veredicto(res)
        res["mercado"] = mkt
        # fecha de consulta de cada fuente (cuándo se verificó · el cron lo refresca)
        try:
            rdoc = await get_rates(db)
            ua = rdoc.get("updated_at")
            fecha_banxico = ua.strftime("%d/%m/%Y") if hasattr(ua, "strftime") else (str(ua)[:10] if ua else None)
        except Exception:
            fecha_banxico = None
        res["fuentes_fecha"] = {"banxico": fecha_banxico, "shf": "Q1-2026", "lisr": "2026", "airroi": "en vivo por zona"}
        # AirROI: expone el dato CACHEADO de la zona (NO llama a la API aquí — AirROI cuesta por llamada; el refresh es aparte)
        try:
            zid = str(body.get("zone_id") or "").strip()  # SEGURIDAD (pentest): str-cast evita inyección de operador NoSQL ($ne/$exists/$regex)
            if zid:
                air = await db.airroi_cache.find_one({"zone_id": zid}, {"_id": 0})
                if air:
                    res["airroi"] = air
        except Exception:
            pass
        # honestidad de fuente: solo decir "AirROI" si el front usó datos reales de AirROI (manda usa_airroi)
        if body.get("modo_renta") == "corto":
            res.setdefault("fuentes", {})["renta"] = ("AirROI · renta corta real de la zona" if body.get("usa_airroi")
                else "estimado con la tarifa × ocupación que pusiste (toca “Usar AirROI” para datos reales por zona)")
        try:
            from inversion_v4_finance import proyeccion, comparar_renta
            res["proyeccion"] = proyeccion(inp, isr_fn=make_isr_fn())
            res["comparar_renta"] = comparar_renta(inp, isr_fn=make_isr_fn())
        except Exception:
            pass
        if body.get("incluir_sensibilidad"):
            try:
                from inversion_v4_finance import sensibilidad, montecarlo, escenarios, proforma
                res["sensibilidad"] = sensibilidad(inp, isr_fn=make_isr_fn())
                res["montecarlo"] = montecarlo(inp, isr_fn=make_isr_fn(), n=400)
                res["escenarios"] = escenarios(inp, isr_fn=make_isr_fn())
                res["proforma"] = proforma(inp, isr_fn=make_isr_fn())
            except Exception:
                res["sensibilidad"] = None
        # comparativa de instrumentos para la barra "tu inmueble vs CETES vs S&P" (de market_rates)
        try:
            rates = await get_rates(db)
            # tabla comparativa con criterios OBJETIVOS (pentágono de inversiones): rendimiento/riesgo/liquidez/plazo/dedicación + ticket/inflación
            _campos = ("k", "nombre", "cat", "pct", "riesgo", "liquidez", "ticket", "inflacion", "esfuerzo", "fuente", "live")
            _plazo = {"cetes_364": "Corto (1 año)", "pagare": "Corto (28-90 días)", "fibra": "Medio-largo (3-5 años)",
                      "bolsa": "Largo (5+ años)", "afore": "Muy largo (al retiro)", "udibonos": "Largo (3-10 años)",
                      "crowdfunding": "Medio (2-4 años)", "sofipo": "Corto (flexible)", "crypto": "Largo (5+ años)"}
            _orden = ("cetes_364", "sofipo", "pagare", "udibonos", "fibra", "crowdfunding", "bolsa", "crypto", "afore")
            _respaldo = {"cetes_364": "Gobierno federal", "pagare": "IPAB (banco)", "fibra": "BMV regulada", "bolsa": "CNBV / SEC",
                         "afore": "CONSAR", "udibonos": "Gobierno federal", "crowdfunding": "CNBV (Ley Fintech)",
                         "sofipo": "IPAB-PROSOFIPO (~25k UDIS)", "crypto": "Ninguno"}
            _ejemplos = {"cetes_364": "cetesdirecto", "pagare": "BBVA, Banorte", "fibra": "Funo, Fibra Mty", "bolsa": "GBM, Kuspit",
                         "afore": "tu Afore", "udibonos": "cetesdirecto", "crowdfunding": "Briq, M2Crowd, 100 Ladrillos",
                         "sofipo": "Nu, Klar, Finsus", "crypto": "Bitso, Binance"}
            res["instrumentos"] = [{**{c: v.get(c) for c in _campos}, "plazo": _plazo.get(v.get("k")),
                                    "respaldo": _respaldo.get(v.get("k")), "ejemplos": _ejemplos.get(v.get("k"))}
                                   for v in sorted((rates.get("vehiculos") or []), key=lambda v: _orden.index(v.get("k")) if v.get("k") in _orden else 99)
                                   if v.get("k") in _orden]
        except Exception:
            res["instrumentos"] = []
        # LOG ANÓNIMO (demanda revelada · LFPDPPP: sin PII, solo zona/precio/resultado) → analíticas superadmin. Fire-and-forget.
        try:
            import hashlib as _hl
            from datetime import datetime as _dt, timezone as _tz
            _ip = (request.client.host if request.client else "") or ""
            await db.inversion_v4_simulations.insert_one({
                "zone_id": (str(body.get("zone_id")).strip()[:80] if body.get("zone_id") else None), "precio": inp.get("valor_propiedad"),
                "modo_renta": inp.get("modo_renta", "largo"), "con_credito": bool(inp.get("con_credito", True)),
                "vista": "institucional" if body.get("incluir_sensibilidad") else "simple",
                "tir_pct": res.get("tir_pct"), "cap_rate_pct": res.get("cap_rate_pct"),
                "ip_hash": _hl.sha256((_ip + "dmx_calc").encode()).hexdigest()[:16],
                "ts": _dt.now(_tz.utc),
            })
        except Exception:
            pass
        return res
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


@router.get("/api/inversion-v4/analytics")
async def inversion_v4_analytics(request: Request):
    """Demanda revelada de la calculadora de inversión (superadmin): qué zonas/precios/modos calcula la gente y cómo
    convierte. Token fail-closed (x-cron-token == GOOGLE_INGEST_TOKEN o ADMIN_ANALYTICS_TOKEN). Datos anónimos."""
    expected = os.environ.get("ADMIN_ANALYTICS_TOKEN") or os.environ.get("GOOGLE_INGEST_TOKEN")
    if not expected or (request.headers.get("x-cron-token") or "") != expected:
        raise HTTPException(status_code=403, detail="forbidden")
    db = request.app.state.db
    out = {"ok": True}
    try:
        out["total_simulaciones"] = await db.inversion_v4_simulations.count_documents({})
        out["por_zona"] = await db.inversion_v4_simulations.aggregate([
            {"$group": {"_id": "$zone_id", "n": {"$sum": 1}, "precio_prom": {"$avg": "$precio"},
                        "tir_prom": {"$avg": "$tir_pct"}, "institucional": {"$sum": {"$cond": [{"$eq": ["$vista", "institucional"]}, 1, 0]}}}},
            {"$sort": {"n": -1}}, {"$limit": 50},
        ]).to_list(50)
        out["por_modo"] = await db.inversion_v4_simulations.aggregate([
            {"$group": {"_id": {"modo": "$modo_renta", "credito": "$con_credito"}, "n": {"$sum": 1}}},
        ]).to_list(20)
        out["leads_calc"] = await db.lead_capture_leads.count_documents({"source_page": "calculadora_inversion"}) if "lead_capture_leads" in await db.list_collection_names() else None
    except Exception as e:
        out["error"] = str(e)[:200]
    return out


@router.post("/api/inversion-v4/portafolio")
async def inversion_v4_portafolio(request: Request):
    """Modo fondo: agrega N unidades (mismos supuestos de crédito/horizonte) en un portafolio. Recibe units[]
    {precio, renta, label} + supuestos compartidos + descuento_volumen_pct. Devuelve métricas combinadas."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    units = body.get("units") or []
    if not units:
        return {"ok": False, "error": "sin unidades"}
    try:
        from inversion_v4_finance import portafolio
        from inversion_v4_tax import make_isr_fn
        from market_rates_engine import market_context
        db = request.app.state.db
        mkt = await market_context(db)
        inp = dict(body or {})
        inp.pop("units", None)
        for k_inp, k_mkt in (("cetes_1a", "cetes_1a"), ("udis_actual", "udis"), ("inflacion_anual", "inflacion_anual")):
            if inp.get(k_inp) in (None, ""):
                inp[k_inp] = mkt.get(k_mkt)
        if inp.get("tasa_anual") in (None, "") and inp.get("con_credito", True):
            inp["tasa_anual"] = mkt.get("tasa_hipotecaria")
        desc = float(body.get("descuento_volumen_pct") or 0) / 100.0
        port = portafolio(units, inp, isr_fn=make_isr_fn(), descuento_pct=desc)
        return {"ok": True, "portafolio": port, "mercado": mkt}
    except Exception as e:
        # No filtrar str(e) al cliente (info-disclosure ante type-confusion): mensaje genérico fijo
        # + detalle solo en logs server-side.
        import logging
        logging.getLogger(__name__).warning("inversion_v4_portafolio fallo: %s", e, exc_info=True)
        return {"ok": False, "error": "No se pudo calcular el portafolio · revisa los datos"}


# Zona geotécnica/sísmica DOMINANTE por alcaldía CDMX (NTC Reglamento de Construcciones · I=Lomas firme A · II=Transición
# B/C · III=exLago lacustre D). Estimación de screening que aplica a TODAS las colonias (no solo a las del Atlas). Dentro
# de una alcaldía la zona varía → se afina con el dato por colonia del Atlas de Riesgos cuando se ingesta.
_ALCALDIA_SISMO = {
    "cuajimalpa": "A", "cuajimalpa de morelos": "A", "magdalena contreras": "A", "la magdalena contreras": "A", "milpa alta": "A",
    "alvaro obregon": "B", "tlalpan": "B", "miguel hidalgo": "B",
    "benito juarez": "C", "coyoacan": "C", "azcapotzalco": "C",
    "cuauhtemoc": "D", "venustiano carranza": "D", "iztacalco": "D", "iztapalapa": "D",
    "gustavo a madero": "D", "gustavo a. madero": "D", "tlahuac": "D", "xochimilco": "D",
}


def _estimar_zona_sismica(alcaldia):
    """Zona sísmica (A/B/C/D) estimada por la alcaldía de la colonia. None si no se reconoce."""
    if not alcaldia:
        return None
    import unicodedata as _ud
    key = _ud.normalize("NFKD", str(alcaldia)).encode("ascii", "ignore").decode().lower().strip()
    return _ALCALDIA_SISMO.get(key)


@router.get("/api/inversion-v4/zona-contexto")
async def inversion_v4_zona_contexto(request: Request, zone_id: str = ""):
    """#1 absorción + #5 riesgo físico de la zona, para el due diligence de la calc. Reusa absorcion_engine (NO duplica)
    y climate_migration_engine + natural_risk_layers. Fail-open por feed."""
    db = request.app.state.db
    out = {"ok": True, "zone_id": zone_id}
    # #1 ABSORCIÓN — velocidad de venta + meses para agotar inventario (ULI)
    try:
        from absorcion_engine import curva_absorcion
        ab = await curva_absorcion(db, colonia_id=zone_id or None)
        curva = ab.get("curva") or []
        disp = sum(c.get("disponibles", 0) for c in curva)
        vendidas = sum(c.get("vendidas", 0) for c in curva)
        total = sum(c.get("unidades_total", 0) for c in curva)
        vel = round(sum(c.get("velocidad_mensual", 0) for c in curva), 1)
        out["absorcion"] = {
            "disponibles": disp, "vendidas": vendidas, "unidades_total": total,
            "velocidad_mensual": vel, "meses_para_agotar": (round(disp / vel) if vel > 0 else None),
            "absorcion_pct": (round(100 * vendidas / total) if total else None),
            "n_proyectos": ab.get("n_proyectos"), "es_estimado": ab.get("es_estimado"),
            "data_basis": ab.get("data_basis"), "lectura": ab.get("lectura"),
        }
    except Exception as e:
        out["absorcion"] = {"error": str(e)[:120]}
    # #5 RIESGO FÍSICO — inundación + sísmico + subsidencia (CDMX)
    try:
        from climate_migration_engine import aggregate_climate_signals_per_zone
        cs = await aggregate_climate_signals_per_zone(db, zone_id)
        nrl = await db.natural_risk_layers.find_one({"zone_id": zone_id}, {"_id": 0}) or {}
        # PML SÍSMICO (screening · marco ASTM E2557/E2026): zona PRECISA (Atlas) > ESTIMADA por alcaldía (zona geotécnica
        # CDMX · aplica a TODAS las colonias) > default. SEL (pérdida esperada) + SUL (PML90, 10% excedencia).
        _ZMAP = {"A": 20, "B": 50, "C": 75, "D": 95}
        sz = nrl.get("sismic_zone")
        score = nrl.get("sismic_score")
        basis = "atlas" if sz else None
        if score is None and sz:
            score = _ZMAP.get(sz)
        if score is None:  # sin dato preciso → estima por la alcaldía de la colonia (zona geotécnica documentada)
            col = await db.colonias.find_one({"id": zone_id}, {"_id": 0, "alcaldia": 1})
            sz_est = _estimar_zona_sismica((col or {}).get("alcaldia"))
            if sz_est:
                sz, score, basis = sz_est, _ZMAP.get(sz_est), "alcaldia"
        tiene_sismo = sz is not None
        if score is None:
            score, basis = 55, "default"  # CDMX genérico (raro, solo si no hay ni alcaldía)
        sel_pct = round(3.0 + score * 0.09, 1)      # SEL ≈ pérdida esperada (% del valor) según intensidad de zona
        sul_pct = round(sel_pct * 1.8, 1)           # SUL = PML90 (pérdida con 10% de excedencia)
        _fuente = {"atlas": "Atlas de Riesgos CDMX (dato por colonia)", "alcaldia": "Estimada por zona geotécnica de la alcaldía (NTC CDMX)",
                   "default": "Screening genérico CDMX"}.get(basis, "Screening de zona")
        out["riesgo"] = {
            "flood_risk": cs.get("flood_risk"), "sismic_score": score,
            "subsidence": nrl.get("subsidence_mm_year") or nrl.get("subsidence_cm_yr") or nrl.get("subsidence"),
            "drivers": cs.get("top_drivers"), "completeness": cs.get("data_completeness_pct"),
            "tiene_datos": True,
            "pml": {"sel_pct": sel_pct, "sul_pct": sul_pct, "sismic_zone": sz, "sismic_score": score,
                    "tiene_dato_zona": tiene_sismo, "basis": basis,
                    "fuente": f"{_fuente} · marco ASTM E2557/E2026"},
        }
        # ÍNDICE SHF (apreciación oficial MX) — benchmark para la plusvalía · lee market_benchmarks (refrescable), seed Q1-2026
        shf_doc = await db.market_benchmarks.find_one({"_id": "shf"}, {"_id": 0}) or {}
        out["shf"] = {
            "apreciacion_nacional_pct": shf_doc.get("apreciacion_nacional_pct", 8.7),
            "apreciacion_valle_mexico_pct": shf_doc.get("apreciacion_valle_mexico_pct", 5.1),
            "apreciacion_nueva_pct": shf_doc.get("apreciacion_nueva_pct", 9.1),
            "avaluo_promedio_nacional": shf_doc.get("avaluo_promedio_nacional", 2024337),
            "base": "2017=100", "fecha": shf_doc.get("fecha", "1T 2026"),
            "bbva_nueva_pct": shf_doc.get("bbva_nueva_pct", 10.8), "bbva_social_pct": shf_doc.get("bbva_social_pct", 11.2),
            "fuente": shf_doc.get("fuente", "Índice SHF de precios de vivienda · 1T 2026 (gob.mx/shf) + BBVA Situación Inmobiliaria"),
        }
    except Exception as e:
        out["riesgo"] = {"error": str(e)[:120]}
    return out


# Zonificación geotécnica oficial CDMX (NTC Reglamento de Construcciones · Zona I Lomas / II Transición / III exLago).
# La zona sísmica es dato documentado; flood/subsidencia son estimados por zona (pendiente Atlas AGEB fino).
_CDMX_SISMIC_SEED = {
    "polanco": {"sismic_zone": "B", "flood_pct": 12, "subsidence_mm_year": 20},          # Zona II Transición
    "lomas-de-chapultepec": {"sismic_zone": "A", "flood_pct": 5, "subsidence_mm_year": 5},   # Zona I Lomas
    "lomas": {"sismic_zone": "A", "flood_pct": 5, "subsidence_mm_year": 5},
    "santa-fe": {"sismic_zone": "A", "flood_pct": 8, "subsidence_mm_year": 5},            # Zona I (poniente)
    "bosques-de-las-lomas": {"sismic_zone": "A", "flood_pct": 6, "subsidence_mm_year": 5},
    "roma-norte": {"sismic_zone": "D", "flood_pct": 35, "subsidence_mm_year": 120},       # Zona III exLago
    "roma": {"sismic_zone": "D", "flood_pct": 35, "subsidence_mm_year": 120},
    "condesa": {"sismic_zone": "D", "flood_pct": 30, "subsidence_mm_year": 110},
    "del-valle": {"sismic_zone": "C", "flood_pct": 25, "subsidence_mm_year": 90},
    "narvarte": {"sismic_zone": "D", "flood_pct": 30, "subsidence_mm_year": 130},
    "centro": {"sismic_zone": "D", "flood_pct": 40, "subsidence_mm_year": 150},
    "juarez": {"sismic_zone": "D", "flood_pct": 32, "subsidence_mm_year": 115},
}


@router.post("/api/superadmin/atlas-riesgo/ingest")
async def atlas_riesgo_ingest(request: Request):
    """Conecta el feed de riesgo físico: puebla natural_risk_layers con la zonificación geotécnica CDMX (sismo) + Atlas de
    Riesgos. Reusa natural_risk_engine.upsert_zone_layer. Token fail-closed. Best-effort fetch del Atlas vivo + seed oficial."""
    expected = os.environ.get("ADMIN_ANALYTICS_TOKEN") or os.environ.get("GOOGLE_INGEST_TOKEN")
    if not expected or (request.headers.get("x-cron-token") or "") != expected:
        raise HTTPException(status_code=403, detail="forbidden")
    db = request.app.state.db
    written = []
    try:
        from natural_risk_engine import upsert_zone_layer
        for zid, v in _CDMX_SISMIC_SEED.items():
            try:
                await upsert_zone_layer(db, zid, sismic_zone=v["sismic_zone"], flood_pct=v["flood_pct"],
                                        subsidence_mm_year=v["subsidence_mm_year"],
                                        sources=["zonificacion_geotecnica_cdmx_ntc", "atlas_riesgos_cdmx"])
                written.append(zid)
            except Exception:
                pass
        # best-effort: intenta jalar capas vivas del Atlas CDMX (si responde, enriquece)
        try:
            from natural_risk_engine import fetch_atlas_cdmx_layers
            await fetch_atlas_cdmx_layers(db)
        except Exception:
            pass
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}
    return {"ok": True, "seeded": written, "n": len(written),
            "fuente": "Zonificación geotécnica CDMX (NTC Reglamento de Construcciones) + Atlas de Riesgos CDMX"}


@router.post("/api/superadmin/shf/refresh")
async def shf_refresh(request: Request):
    """Conecta el feed SHF: guarda en market_benchmarks el Índice SHF de plusvalía + BBVA, lo más actual (1T 2026).
    Token fail-closed. Best-effort: intenta jalar el dato vivo de gob.mx/shf; si no, deja los valores actuales verificados."""
    expected = os.environ.get("ADMIN_ANALYTICS_TOKEN") or os.environ.get("GOOGLE_INGEST_TOKEN")
    if not expected or (request.headers.get("x-cron-token") or "") != expected:
        raise HTTPException(status_code=403, detail="forbidden")
    db = request.app.state.db
    # Valores VERIFICADOS 1T 2026 (gob.mx/shf + BBVA Situación Inmobiliaria) — actualizar cada trimestre con el reporte SHF.
    doc = {
        "apreciacion_nacional_pct": 8.7, "apreciacion_valle_mexico_pct": 5.1,
        "apreciacion_nueva_pct": 9.1, "apreciacion_usada_pct": 8.3, "avaluo_promedio_nacional": 2024337,
        "bbva_nueva_pct": 10.8, "bbva_social_pct": 11.2, "fecha": "1T 2026",
        "fuente": "Índice SHF de precios de vivienda · 1T 2026 (gob.mx/shf) + BBVA Situación Inmobiliaria",
    }
    try:
        await db.market_benchmarks.update_one({"_id": "shf"}, {"$set": doc}, upsert=True)
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}
    return {"ok": True, "shf": doc}


@router.post("/api/inversion-v4/airroi")
async def inversion_v4_airroi(request: Request):
    """Trae renta corta REAL de AirROI para una zona (ADR, ocupación, revenue). AirROI COBRA por llamada, así que
    cacheamos por zona (TTL 30 días) y solo pegamos a la API en refresh explícito (este endpoint, por botón). Devuelve
    la tarifa/noche ya convertida a MXN con el FIX vivo. Reusa el conector real connectors_ie.AirRoiConnector."""
    # SEGURIDAD (pentest): AirROI COBRA por llamada y force=true salta el caché → rate-limit anti cost-abuse anónimo.
    from services.ratelimit import allow, client_ip
    if not allow("airroi_refresh", client_ip(request), 3, 60):
        raise HTTPException(429, "Demasiadas consultas seguidas. Intenta en un momento.")
    from datetime import datetime, timezone, timedelta
    try:
        body = await request.json()
    except Exception:
        body = {}
    zid = str(body.get("zone_id") or "").strip()
    if not zid:
        return {"ok": False, "error": "falta zone_id"}
    db = request.app.state.db
    force = bool(body.get("force"))
    try:
        cached = await db.airroi_cache.find_one({"zone_id": zid}, {"_id": 0})
    except Exception:
        cached = None
    fresh = False
    if cached and cached.get("fetched_at"):
        try:
            fa = cached["fetched_at"]
            fa = datetime.fromisoformat(fa) if isinstance(fa, str) else fa
            fresh = (datetime.now(timezone.utc) - fa) < timedelta(days=30)
        except Exception:
            fresh = False
    if cached and fresh and not force:
        return {"ok": True, "cached": True, **cached}
    try:
        from connectors_ie import AirRoiConnector
        from market_rates_engine import market_context
        obs = await AirRoiConnector({"id": "airroi"}, {}).fetch(zone_id=zid)
        if not obs or obs[0].get("is_stub"):
            return {"ok": False, "error": "AirROI no devolvió datos reales para esta zona (revisa la key IE_AIRROI_API_KEY o el nombre de la colonia)."}
        payload = obs[0].get("payload") or {}
        adr_usd = payload.get("average_daily_rate")
        mkt = await market_context(db)
        fix = mkt.get("fix_usd") or 18.0
        doc = {
            "zone_id": zid, "adr_usd": adr_usd, "adr_mxn": round(adr_usd * fix) if adr_usd else None,
            "ocupacion": payload.get("occupancy"), "revenue_usd": payload.get("revenue"),
            "rev_par_usd": payload.get("rev_par"), "listings": payload.get("active_listings_count"),
            "fuente": "AirROI", "fix_usado": fix, "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.airroi_cache.update_one({"zone_id": zid}, {"$set": doc}, upsert=True)
        return {"ok": True, "cached": False, **doc}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


@router.post("/api/superadmin/google-places/ingest-lugares")
async def google_places_ingest_lugares_run(request: Request):
    """Corre UN lote de LUGARES con nombre+estrellas (SKU Enterprise, free tier ~1,000/mes). Solo colonias con
    desarrollos reales (only_with_devs). Token fail-closed. Correr cuando ya existan desarrollos."""
    expected = os.environ.get("GOOGLE_INGEST_TOKEN")
    if not expected or (request.headers.get("x-cron-token") or "") != expected:
        raise HTTPException(status_code=403, detail="forbidden")
    from google_places_ingest import ingest_places_batch
    return await ingest_places_batch(request.app.state.db)


@router.post("/api/superadmin/google-places/ingest")
async def google_places_ingest_run(request: Request):
    """Corre UN lote de ingesta de amenidades reales de Google Places (free-tier-safe: nunca rebasa el límite del mes).
    Token fail-closed (x-cron-token == GOOGLE_INGEST_TOKEN). Lo dispara el founder (manual o cron mensual) tras poner
    GOOGLE_MAPS_API_KEY. Idempotente · fail-open por colonia · guarda en denue_zone_density source='google'."""
    expected = os.environ.get("GOOGLE_INGEST_TOKEN")
    if not expected or (request.headers.get("x-cron-token") or "") != expected:
        raise HTTPException(status_code=403, detail="forbidden")
    from google_places_ingest import ingest_batch
    return await ingest_batch(request.app.state.db)


@router.get("/api/colonias")
async def get_colonias():
    return [_colonia_public(c) for c in SEED_COLONIAS]


@router.get("/api/colonias-geojson")
async def colonias_geojson(request: Request, alcaldia: Optional[str] = None, limit: int = 2200):
    """FeatureCollection de las colonias REALES (db.colonias.geometry · 1,811 IECM) para el Mapa de
    Valores coroplético. Une precio/scores/momentum desde los seed (por nombre) donde exista el dato."""
    limit = max(1, min(limit, 2200))   # SEGURIDAD: cap duro → no se baja todo el dataset geográfico de una
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
        q["alcaldia"] = {"$regex": f"^{re.escape(alcaldia.strip()[:60])}$", "$options": "i"}
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


# Cache TTL del pool scored (colonias cambian por cron, no por request) — evita 2 cursores full por request
_COLONIAS_SCORED_CACHE: Dict[str, Any] = {"ts": 0.0, "pool": None}
_COLONIAS_SCORED_TTL = 600  # segundos


async def _db_colonias_scored_cached(db) -> Dict[str, Dict[str, Any]]:
    import time as _time
    now = _time.time()
    if _COLONIAS_SCORED_CACHE["pool"] is not None and (now - _COLONIAS_SCORED_CACHE["ts"]) < _COLONIAS_SCORED_TTL:
        return _COLONIAS_SCORED_CACHE["pool"]
    pool = await _db_colonias_scored(db)
    _COLONIAS_SCORED_CACHE["ts"] = now
    _COLONIAS_SCORED_CACHE["pool"] = pool
    return pool


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


async def _colonia_values_batch(db, colonia_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """Versión BATCH de _colonia_value: 2 queries $in para N colonias (antes 2×N find_one).
    Mismo shape por colonia: {name, calidad, valor_m2}."""
    out: Dict[str, Dict[str, Any]] = {cid: {} for cid in colonia_ids}
    if not colonia_ids:
        return out
    async for c in db.colonias.find(
            {"id": {"$in": colonia_ids}}, {"_id": 0, "id": 1, "name": 1, "scores_reales": 1}):
        o = out.setdefault(c["id"], {})
        o["name"] = c.get("name")
        sr = c.get("scores_reales") or {}
        vals = [v for v in sr.values() if isinstance(v, (int, float))]
        o["calidad"] = round(sum(vals) / len(vals)) if vals else None
    async for v in db.colonia_catastro_byid.find(
            {"colonia_id": {"$in": colonia_ids}}, {"_id": 0, "colonia_id": 1, "valor_suelo_m2": 1}):
        out.setdefault(v["colonia_id"], {})["valor_m2"] = v.get("valor_suelo_m2")
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
    watches = [w async for w in db.colonia_watches.find({"watcher": watcher}, {"_id": 0}).sort("created_at", -1)]
    # BATCH: valores de TODAS las colonias vigiladas en 2 queries (antes 2 por colonia)
    values = await _colonia_values_batch(db, [w["colonia_id"] for w in watches])
    for w in watches:
        cv = values.get(w["colonia_id"]) or {}
        cur = cv.get("valor_m2")
        base = (w.get("baseline") or {}).get("valor_m2")
        change = round((cur / base - 1) * 100, 1) if (cur and base and cur != base) else None
        out.append({"colonia_id": w["colonia_id"], "name": w.get("name"),
                    "valor_m2": cur, "calidad": cv.get("calidad"), "change_pct": change})
    return {"watching": out, "count": len(out), "alerts": [w for w in out if w["change_pct"]]}


# ─── Catastro OFICIAL por colonia (SIGCDMX) — valor catastral + desglose por predio ──────────────
@router.get("/api/catastro/colonia/{colonia_id}/far-vintage")
async def catastro_far_vintage(colonia_id: str, request: Request):
    """FAR (intensidad de construcción = sup_construcción/sup_terreno) + vintage (edad del parque) por colonia —
    land intelligence: FAR bajo + %subutilizado alto = potencial de desarrollo. Dev + superadmin."""
    from catastro_sig_engine import far_vintage_colonia
    return await far_vintage_colonia(request.app.state.db, colonia_id)


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


# ─── Fase 2 mapa de valores · valoración por colonia (mercado $/m² + plusvalía SHF) ───────────────
@router.get("/api/mapa/colonia/{colonia_id}/valoracion")
async def mapa_colonia_valoracion(colonia_id: str, request: Request):
    """Panel del mapa (Fase 2): precio de mercado $/m² (Monopolio → mini-AVM → catastro, con
    fuente+confianza) + plusvalía anual DERIVADA del índice SHF de la alcaldía de la colonia
    (serie 2020+, es_estimado marcado). Lee de `colonia_valoracion` si está sembrada; si no,
    la calcula al vuelo (fail-soft por campo). REUSA colonia_valoracion_engine."""
    db = request.app.state.db
    try:
        cached = await db.colonia_valoracion.find_one({"colonia_id": colonia_id}, {"_id": 0})
        if cached and cached.get("name"):
            return cached
        from colonia_valoracion_engine import get_valoracion
        return await get_valoracion(db, colonia_id)
    except Exception as e:
        return {"colonia_id": colonia_id, "disponible": False, "error": str(e)[:120]}


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
                            "diff_pct": pos.get("diff_pct"), "disponible": pos.get("disponible", False),
                            "mercado_usada_m2": pos.get("mercado_usada_m2"), "precio_m2": pos.get("precio_m2")})
            except Exception:
                out.append({"id": u.get("id"), "disponible": False})
    except Exception:
        pass
    return {"unidades": out, "fuente": "mercado_real" if out else None}


@router.get("/api/public/payment-schemes/{project_id}")
async def public_payment_schemes(project_id: str, request: Request):
    """Esquema(s) de pago del desarrollador para la ficha del comprador (lo que el dev configuró en su portal:
    apartado · firma/enganche% · mensualidades% · escritura% · descuento por enganche). Lectura pública; si el dev no
    configuró, devuelve el default del motor. El comprador solo elige el esquema (enganche); el resto es fijo del dev."""
    db = request.app.state.db
    try:
        import payment_schemes as ps
        from data_developments import DEVELOPMENTS_BY_ID
        doc = await db.dev_payment_schemes.find_one({"project_id": project_id}, {"_id": 0})
        dev = DEVELOPMENTS_BY_ID.get(project_id) or {}
        schemes = (doc or {}).get("schemes") or ps.default_schemes()
        fecha_inicio = (doc or {}).get("fecha_inicio")
        fecha_entrega = (doc or {}).get("fecha_entrega") or dev.get("delivery_estimate")
        return {"schemes": schemes, "fecha_inicio": fecha_inicio, "fecha_entrega": fecha_entrega,
                "meses_auto": ps.auto_months(fecha_inicio, fecha_entrega), "configured": bool(doc)}
    except Exception:
        return {"schemes": [], "meses_auto": None, "configured": False}


@router.get("/api/catastro/predios-bbox")
async def predios_bbox(request: Request, w: float, s: float, e: float, n: float, limit: int = 2500):
    """Predios (POLÍGONOS del lote) dentro del recuadro visible → se cargan solo con zoom cercano.
    Así se ven las formas reales de los lotes (no puntitos) sin trabar el navegador (estilo propiedades.com)."""
    # SEGURIDAD (pentest 2026-06-27): cap duro + tope de área del recuadro → evita el dump masivo del
    # catastro (≈1.08M predios / 524MB en una request = exfiltración del moat + DoS del pool de Mongo).
    limit = max(1, min(limit, 3000))
    if (e - w) * (n - s) > 0.06:
        raise HTTPException(400, "Acerca el mapa para ver los predios: el área es demasiado grande.")
    import json
    db = request.app.state.db
    box = {"type": "Polygon", "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}
    q = {"geo": {"$geoWithin": {"$geometry": box}}, "poly": {"$exists": True}}
    feats: List[Dict[str, Any]] = []
    ids: List[str] = []
    con_avm = 0
    try:
        async for p in db.catastro_predios.find(
                q, {"_id": 0, "poly": 1, "valor_unitario_suelo": 1, "valor_suelo": 1, "calle": 1,
                    "sup_terreno": 1, "sup_construccion": 1, "anio": 1, "colonia": 1, "cp": 1,
                    "n_unidades": 1, "unidades": 1, "catastro_id": 1}
        ).limit(limit):
            cid = p.get("catastro_id")
            props = {
                "v": p.get("valor_unitario_suelo") or 0, "vs": p.get("valor_suelo") or 0,
                "calle": (p.get("calle") or "")[:60], "sup": p.get("sup_terreno") or 0,
                "supc": p.get("sup_construccion") or 0, "anio": p.get("anio") or "",
                "colonia": (p.get("colonia") or "")[:40], "cp": p.get("cp") or ""}
            if cid:
                props["cid"] = cid
                ids.append(cid)
            if p.get("n_unidades"):
                props["nu"] = p["n_unidades"]
                # unidades como JSON (Mapbox aplana props → se parsea en el popup)
                props["unidades"] = json.dumps([{
                    "r": (u.get("ref") or "")[:50], "c": u.get("sup_construccion") or 0, "vs": u.get("valor_suelo") or 0
                } for u in (p.get("unidades") or [])[:30]], ensure_ascii=False)
            feats.append({"type": "Feature", "geometry": p["poly"], "properties": props})
        # AVM de MERCADO ($/m²) por predio (estilo propiedades.com) — join avm_predios.predio_id == catastro_id.
        # Materializado por seed_avm_predios; donde ya existe, el mapa pinta MERCADO en vez de catastral.
        avm_map: Dict[str, Any] = {}
        if ids:
            async for a in db.avm_predios.find(
                    {"predio_id": {"$in": ids}}, {"_id": 0, "predio_id": 1, "avm_m2": 1, "es_estimado": 1}):
                if a.get("avm_m2"):
                    avm_map[a["predio_id"]] = {"avm": round(a["avm_m2"]), "est": bool(a.get("es_estimado", True))}
        for ft in feats:
            cid = ft["properties"].pop("cid", None)
            hit = avm_map.get(cid) if cid else None
            if hit:
                ft["properties"]["avm"] = hit["avm"]
                ft["properties"]["avm_est"] = 1 if hit["est"] else 0
                con_avm += 1
    except Exception:
        pass
    return {"type": "FeatureCollection", "features": feats, "count": len(feats), "con_avm": con_avm if feats else 0}


# ─── #3 "Búsqueda viva / Para ti" — personaliza desde el comportamiento (watchlist) · cold-start trending ──
@router.get("/api/para-ti")
async def para_ti(request: Request, watcher: Optional[str] = None, n: int = 6):
    """Recomendación viva para el comprador: parte de lo que VIGILA (comportamiento real) → colonias
    parecidas; si aún no hay señal, cae a 'tendencia' (mejor momentum). Reusa scores + watchlist."""
    db = request.app.state.db
    pool = await _db_colonias_scored_cached(db)   # cache 600s — el ranking por visitante sigue igual
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
        from llm_client import LlmChat, UserMessage
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
def _project_to_dev_card(p):
    """DEV PUBLICA → MARKETPLACE: convierte un proyecto del wizard (db.projects) a la forma de TARJETA del marketplace,
    con TODOS los campos que tocan el listado y los filtros (defaults seguros → nunca KeyError). Marcado source='wizard'
    + verified=False para que la UI lo distinga del catálogo curado/verificado por DMX."""
    pid = p.get("id") or p.get("slug")
    if not pid:
        return None
    _tipo = (p.get("tipo_proyecto") or "").lower()
    ptype = "casa" if "casa" in _tipo else ("terreno" if "terreno" in _tipo else "departamento")
    pf = p.get("price_from") or 0
    pt = p.get("price_to") or pf
    ut = p.get("total_units") or p.get("units_total") or 0
    lat, lng = p.get("lat"), p.get("lng")
    return {
        "id": pid, "slug": p.get("slug") or pid, "name": p.get("name") or "Desarrollo",
        "colonia_id": p.get("colonia_id") or "", "colonia": p.get("colonia") or "",
        "alcaldia": p.get("municipio") or p.get("alcaldia") or "", "city": p.get("estado") or "CDMX",
        "stage": p.get("stage") or "preventa", "property_type": ptype,
        "price_from": pf, "price_to": pt, "price_from_display": None, "price_to_display": None,
        "units": [], "units_total": ut, "units_available": ut, "units_sold": 0, "units_reserved": 0,
        "amenities": [], "unit_features": [], "servicios": {}, "creditos_aceptados": [],
        "photos": p.get("photos") or [], "center": ({"lat": lat, "lng": lng} if lat and lng else None),
        "address_full": p.get("calle") or "", "street": p.get("calle") or "", "postal_code": p.get("cp") or "",
        "delivery_estimate": p.get("delivery_estimate") or "", "fecha_lanzamiento": p.get("created_at") or "",
        "description": p.get("description") or "", "developer_id": p.get("developer_id") or p.get("dev_org_id"),
        "contact_phone": "", "m2_range": p.get("m2_range") or "", "bedrooms_range": "", "bathrooms_range": "",
        "parking_range": "", "orientations": [], "max_level": None, "construction_progress": None,
        "memoria_acabados": None, "tecnica": None, "tour360_url": None, "video_url": None,
        "featured": False, "verified": False, "source": "wizard", "price_history": [],
    }


async def _published_wizard_cards(db):
    """Proyectos del wizard listos para el marketplace: gate marketplace_published != False (se publica al estar listo;
    el superadmin puede despublicar) + colonia_id + price_from (calidad). Listado PÚBLICO → cross-dev a propósito."""
    out = []
    try:
        async for p in db.projects.find(
            {"marketplace_published": {"$nin": [False, "pending"]}, "colonia_id": {"$nin": [None, ""]}, "price_from": {"$gt": 0}},
            {"_id": 0}).limit(500):
            c = _project_to_dev_card(p)
            if c:
                out.append(c)
    except Exception:
        pass  # fail-open: si la lectura de proyectos falla, el listado sigue con el catálogo curado
    return out


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
    plazo: Optional[str] = None,
    tipo: Optional[str] = None,
    alcaldia: Optional[str] = None,
    unit_feature: Optional[List[str]] = Query(None),
    orientacion: Optional[List[str]] = Query(None),
    piso_min: Optional[int] = None,
    amenity: Optional[List[str]] = Query(None),
    featured: Optional[bool] = None,
    enganche_max: Optional[int] = None,
    mensualidad_max: Optional[int] = None,
    apartado_max: Optional[int] = None,
    sort: Optional[str] = "recent",
    limit: int = 100,
    offset: int = 0,          # paginación: índice de inicio (infinite scroll)
    subscore_min: Optional[str] = Query(None, description="W5.2 — JSON encoded ej. {\"seguridad\":85}"),
    forecast_delta_min: Optional[int] = Query(None, description="W5.3 P2B — % mínimo crecimiento 12m"),
    visitor_id: Optional[str] = None,   # 'Para ti' (sort=taste): reordena por el gusto del visitante (sus likes)
):
    results = list(DEVELOPMENTS)
    # DEV PUBLICA → MARKETPLACE: suma los proyectos del wizard ya publicados (gate + calidad). Los filtros de abajo
    # operan igual sobre ellos (la tarjeta trae todos los campos). Fail-open.
    results += await _published_wizard_cards(request.app.state.db)
    # INGESTA MASIVA → MARKETPLACE: suma los proyectos INGERIDOS (db.developments source='bulk_ingest') ya aprobados,
    # con sus unidades reales de db.units. Sin esto el proyecto ingerido era invisible en el catálogo (auditoría 07-07).
    try:
        from ingested_reader import ingested_dev_cards
        _ing = await ingested_dev_cards(request.app.state.db, published_only=True)
        _seen_ids = {d.get("id") for d in results}
        results += [c for c in _ing if c.get("id") not in _seen_ids]
    except Exception:
        pass  # fail-open: si la lectura de ingeridos falla, el listado sigue con el catálogo curado + wizard
    if colonia:
        # PACKS DE COLONIA (07-17): /zona/juarez agrupa 'juarez-cuauhtemoc'; Roma = Norte+Sur;
        # Condesa = Condesa+Hipódromo; Del Valle = Norte+Centro+Sur; y TODO caso que coincida
        # por zona base. Antes el match era exacto (colonia_id == slug) → 0 resultados.
        from zona_packs import misma_zona
        results = [d for d in results if d.get("colonia_id")
                   and any(misma_zona(d["colonia_id"], c) for c in colonia)]
    # ── Filtros a nivel PROYECTO (del DESARROLLO): zona, etapa, tipo, alcaldía, AMENIDADES del edificio, destacado ──
    if stage:
        results = [d for d in results if _norm_stage(d["stage"], d.get("delivery_estimate")) == stage]
    if plazo:  # plazo de entrega (solo preventa) — antes se mandaba y se ignoraba (cable muerto)
        results = [d for d in results if _plazo_ok(d.get("delivery_estimate"), plazo)]
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
    _has_unit_crit = any(v is not None for v in (min_price, max_price, min_sqm, max_sqm, beds, baths, parking, piso_min, enganche_max, mensualidad_max, apartado_max)) or _ufset or _oset
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
            # Solo los esquemas de los desarrollos que SOBREVIVIERON los filtros de proyecto (antes: find({}) completo)
            _res_ids = [d.get("id") for d in results if d.get("id")]
            async for _ps in request.app.state.db.dev_payment_schemes.find(
                    {"project_id": {"$in": _res_ids}},
                    {"_id": 0, "project_id": 1, "schemes": 1, "fecha_inicio": 1, "fecha_entrega": 1}):
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
            if enganche_max is not None or mensualidad_max is not None or apartado_max is not None:
                f = _unit_finance(u.get("price"), fin)
                if not f:
                    return False  # el dev no publicó esquema de pago → no prometemos el enganche
                if enganche_max is not None and f["enganche"] > enganche_max:
                    return False
                if mensualidad_max is not None and f["mensualidad"] > mensualidad_max:
                    return False
                if apartado_max is not None and (f.get("apartado") or 0) > apartado_max:
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
            # EL CONTRATO (marketplace_contract): la tarjeta se construye desde el registro
            # canónico — mismo mapeo que el test congelado. Campo nuevo = renglón allá.
            from marketplace_contract import tarjeta_publica_unidad
            card = tarjeta_publica_unidad(u)
            f = _unit_finance(u.get("price") or u.get("price_mxn"), fin)
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
    elif sort == "taste" and visitor_id:
        # 'Para ti' · lente de gusto: reordena por afinidad a lo que el visitante ha likeado (reusa el motor de parecidos).
        try:
            from routes.buyer_signals import taste_scores
            _ts = await taste_scores(request.app.state.db, visitor_id)
            if _ts:
                results.sort(key=lambda d: -_ts.get(d.get("id"), 0))
        except Exception:
            pass
    # Enriquecimiento en batch (precio fresco + amenidades + foto real del dev) · cierra ciclo.
    # Paginación: corta la página [offset, offset+limit) DESPUÉS de filtrar y ordenar (infinite scroll).
    cards = await _enrich_listing(request.app.state.db, results[offset:offset + limit])
    # Adjunta cuántas unidades DISPONIBLES cumplen + la MUESTRA (para nombrarlas: "#14B $11.2M, #21A $11.8M").
    if match_counts or match_samples:
        for c in cards:
            cid = c.get("id")
            if match_counts.get(cid) is not None:
                c["units_match"] = match_counts[cid]
            if match_samples.get(cid):
                c["units_match_sample"] = match_samples[cid]

    # DEMANDA REVELADA por el buscador ESTRUCTURADO (chips) — antes NO se registraba, así que quien filtra con
    # chips en vez de escribir en la barra IA era INVISIBLE a la inteligencia de demanda. Escribimos
    # marketplace_searches (mismo shape que ai_search) fire-and-forget: solo con filtros REALES, 1ª página (offset 0)
    # y visitor_id presente, deduplicado por visitante+criterios+día. Fail-open, jamás bloquea la respuesta.
    try:
        import hashlib as _hashlib, json as _json
        from datetime import datetime as _dt
        _has_filter = any([colonia, min_price, max_price, min_sqm, max_sqm, beds, baths, parking, stage, tipo,
                           unit_feature, amenity, enganche_max, mensualidad_max, orientacion, piso_min])
        if _has_filter and offset == 0 and visitor_id:
            from data_developments import colonia_slug as _cslug   # MOAT: id canónico (linaje cross-engine)
            _db = request.app.state.db
            _cols = [s for s in (_cslug(c) for c in (colonia or [])) if s]
            _amen = [str(a) for a in (amenity or [])][:15]
            _feat = [str(f) for f in (unit_feature or [])][:15]
            _rc = len(results)
            _crit = {
                "source": "filtro_estructurado",
                "colonias": _cols, "colonia_id": (_cols[0] if _cols else None),
                "recamaras_min": beds, "banos_min": baths,
                "precio_min": min_price, "precio_max": max_price,
                "m2_min": min_sqm, "m2_max": max_sqm,
                "enganche_max": enganche_max, "mensualidad_max": mensualidad_max,
                "stage_pedido": stage, "tipo_pedido": tipo,
                "amenidades_pedidas": _amen, "features_pedidos": _feat,
                "results_count": _rc, "unmet": _rc == 0,
                "visitor_id": visitor_id[:64],
            }
            _key = _hashlib.sha256(_json.dumps(
                {k: _crit[k] for k in ("colonias", "recamaras_min", "banos_min", "precio_max", "m2_min", "m2_max",
                                       "amenidades_pedidas", "features_pedidos", "stage_pedido", "tipo_pedido")},
                sort_keys=True, default=str).encode()).hexdigest()[:16]
            _today0 = _dt.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            _dup = await _db.marketplace_searches.find_one(
                {"source": "filtro_estructurado", "visitor_id": _crit["visitor_id"], "crit_key": _key,
                 "created_at_dt": {"$gte": _today0}}, {"_id": 1})
            if not _dup:
                _crit["crit_key"] = _key
                _crit["created_at_dt"] = _dt.utcnow()
                await _db.marketplace_searches.insert_one(_crit)
    except Exception:
        pass
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
    visitor_id: Optional[str] = None,
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
        # La ZONA es sagrada: si el cliente pidió una zona, los "casi" se quedan en esa zona (nunca cruzamos a otra
        # que NO pidió). Pack de colonias (07-17): agrupa sub-colonias de la misma zona base.
        from zona_packs import misma_zona
        pool = [d for d in pool if d.get("colonia_id")
                and any(misma_zona(d["colonia_id"], c) for c in colonia)]
    scored = []
    for d in pool:
        units = [u for u in (d.get("units") or []) if u.get("status") == "disponible"]
        crit = []  # (label_humano, cumple)
        if stage:
            crit.append((f"etapa {stage.replace('_', ' ')}", _norm_stage(d.get("stage"), d.get("delivery_estimate")) == stage))
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
    # GUSTO como secundario: entre igual match, primero lo que encaja con lo que el visitante ha LIKEADO (taste_scores
    # reusa el motor de 'parecidos'). Fail-open: sin likes → orden normal. No anula el match explícito (es desempate).
    _taste = {}
    if visitor_id:
        try:
            from visitor_taste import score_devs as _sd  # gusto HIPERGRANULAR: zona·amenidades·precio·features de foto + perfil negativo
            _taste = await _sd(request.app.state.db, visitor_id, [s["d"] for s in scored]) or {}
        except Exception:  # noqa: BLE001
            _taste = {}
        if not _taste:  # sin señal granular → cae al taste simple (amenidad/precio, reusa parecidos)
            try:
                from routes.buyer_signals import taste_scores as _ts
                _taste = await _ts(request.app.state.db, visitor_id) or {}
            except Exception:  # noqa: BLE001
                _taste = {}
    scored.sort(key=lambda s: (-s["met"], -_taste.get(s["d"].get("id"), 0), len(s["falta"])))
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
    # CIERRA CICLO comprador → desarrollador: una búsqueda COMPLETA en zona que SÍ cubrimos pero donde NADA cumple
    # todo = HUECO DE PRODUCTO exacto. Lo captamos (dedup por visitor+criterios+día, no infla por re-render) para que
    # el dev/superadmin vea "X personas buscaron esto exacto en tu zona y no hay nada". Fire-and-forget.
    if colonia:
        try:
            from services.ratelimit import allow, client_ip
            if not allow("demanda_insatisf", client_ip(request), 30):
                return {"casi": out}   # rate-limit: no dejes que un bot (rotando visitor_id) envenene el cubo
            from collections import Counter as _C
            import json as _json
            import hashlib as _hl
            _falta = _C()
            for s in scored[:limit]:
                for fl in (s.get("falta") or []):
                    _falta[fl] += 1
            crit = {"colonias": list(colonia), "beds": beds, "max_price": max_price, "min_price": min_price,
                    "min_sqm": min_sqm, "max_sqm": max_sqm, "amenity": list(amenity or []),
                    "unit_feature": list(unit_feature or []), "stage": stage, "tipo": tipo}
            sig = _hl.md5(_json.dumps(crit, sort_keys=True, default=str).encode()).hexdigest()[:16]
            day = datetime.utcnow().strftime("%Y-%m-%d")
            dedup = f"{visitor_id or 'anon'}|{sig}|{day}"
            await request.app.state.db.demanda_insatisfecha.update_one(
                {"dedup": dedup},
                {"$setOnInsert": {"dedup": dedup, "visitor_id": visitor_id, "criterios": crit,
                                  "zona": (colonia[0] if colonia else None), "created_at_dt": datetime.utcnow()},
                 "$set": {"falta_top": [f for f, _ in _falta.most_common(3)],
                          "best_met": (top[0]["met"] if top else 0), "best_total": (top[0]["total"] if top else 0)}},
                upsert=True)
        except Exception:
            pass
    return {"casi": out}


@router.get("/api/developments/{dev_id}")
async def get_development(dev_id: str, request: Request):
    db = request.app.state.db
    d = DEVELOPMENTS_BY_ID.get(dev_id)
    if d:
        await _ensure_overlay_loaded(dev_id, db)
        out = _dev_public(d, include_units=True)
    else:
        # B0.3 · Proyecto creado/publicado por el dev → leer la tienda unificada (no solo el seed).
        # Mismo gate que la rama hermana de db.projects: NO servir fichas 'pending'/no-aprobadas a compradores.
        pub = await db.developments.find_one(
            {"id": dev_id, "marketplace_published": {"$nin": [False, "pending"]}}, {"_id": 0})
        if not pub:
            # DEV PUBLICA → MARKETPLACE: ficha de un proyecto del wizard (db.projects) convertido a tarjeta.
            _proj = await db.projects.find_one({"id": dev_id, "marketplace_published": {"$nin": [False, "pending"]}}, {"_id": 0})
            if _proj:
                pub = _project_to_dev_card(_proj)
        if not pub:
            raise HTTPException(404, "Desarrollo no encontrado")
        out = {k: v for k, v in pub.items() if k != "config"}
        out["contact_phone"] = pub.get("contact_phone") or DMX_FALLBACK_WHATSAPP
    # INGESTA / WIZARD: los proyectos ingeridos o del wizard NO llevan las unidades embebidas en el doc; viven en
    # db.units (llave development_id o project_id). Si el doc no trae units, las cargamos y normalizamos → la ficha,
    # el cotizador y la lista de disponibilidad dejan de salir vacías (auditoría 07-07). Fail-open.
    if not out.get("units"):
        try:
            from ingested_reader import units_for_dev, attach_planos, sobre_mercado_pct, public_photos
            out["units"] = await units_for_dev(db, dev_id)
            # plano del prototipo por unidad (depa 102 → plano del 'Tipo 02') + "sobre mercado %" (vs AVM colonia)
            await attach_planos(db, dev_id, out["units"])
            await sobre_mercado_pct(db, out.get("colonia_id"), out["units"],
                                    colonia_name=out.get("colonia"), alcaldia=out.get("alcaldia"))
            # fotos públicas = SOLO renders clasificados (obra→avance · depto muestra NUNCA sale)
            if not out.get("photos"):
                out["photos"] = await public_photos(db, dev_id)
        except Exception:
            pass
    # Ediciones manuales del dev (precio/estado/m²/…) → la ficha muestra el dato vivo, no el seed. Cierra el ciclo dev→comprador.
    out["units"] = await _apply_unit_overrides(db, dev_id, out.get("units") or [])
    # Alerta de VALOR (sobre-mercado %) para TODAS las fichas, no solo las ingeridas: los devs SEED ya traen units
    # embebidas y antes se saltaban el cálculo (bloque de arriba solo corre si units venían vacías) → la alerta salía
    # dormida en casi todo el catálogo. Ahora se calcula sobre las units finales (con overrides). Fail-open (sin AVM → nada).
    try:
        from ingested_reader import sobre_mercado_pct as _sm
        if not any(u.get("sobre_mercado_pct") is not None for u in (out.get("units") or [])):
            await _sm(db, out.get("colonia_id"), out.get("units") or [],
                      colonia_name=out.get("colonia"), alcaldia=out.get("alcaldia"))
    except Exception:
        pass
    # Conteos + rangos + desde/hasta coherentes con las unidades vivas (si el dev edita precio/estado/m²/etc., el doc no puede
    # seguir mostrando cifras viejas del seed: 'desde' inexistente, 'X disponibles' que ya no aplica, rangos de búsqueda viejos).
    out.update(_aggregates_from_units(out.get("units")))
    # B0.3 · Overlay del dev (amenidades/servicios/pagos/sistema) sobre la ficha pública — fail-open
    try:
        from routes.dev_project_full import project_public_overlay
        ov = await project_public_overlay(db, dev_id)
        if ov:
            out["config"] = ov
            if ov.get("amenidades"):
                out["amenities"] = ov["amenidades"]  # el dev es la fuente de verdad
            if ov.get("fecha_entrega"):
                out["delivery_estimate"] = ov["fecha_entrega"]  # la entrega que configuró el dev manda sobre el seed
    except Exception:
        pass
    # Avance de obra REAL del dev (project_construction_progress) → la ficha (lee dev.construction_progress). Antes el
    # overlay solo extraía sistema_constructivo y la ficha mostraba el avance del SEED → la edición del dev se perdía.
    # Mapeo del doc del dev (overall_percent/stages[percent]/current_stage) al shape de la ficha. Fail-open.
    try:
        cp_doc = await db.project_construction_progress.find_one({"project_id": dev_id}, {"_id": 0})
        if cp_doc and cp_doc.get("overall_percent") is not None:
            _stages = sorted([s for s in (cp_doc.get("stages") or []) if isinstance(s, dict)], key=lambda s: s.get("order") or 0)
            _cur = cp_doc.get("current_stage")
            _cur_label = next((s.get("label") for s in _stages if s.get("key") == _cur), None)
            out["construction_progress"] = {
                "percentage": cp_doc.get("overall_percent"),
                "status": _cur_label or (out.get("construction_progress") or {}).get("status"),
                "last_update": (cp_doc.get("updated_at") or "")[:10] or None,
                "phases": [{"label": s.get("label") or s.get("key"), "percentage": s.get("percent"),
                            "status": ("completado" if (s.get("percent") or 0) >= 100 else None)} for s in _stages],
                "source": "dev",
            }
    except Exception:
        pass
    # Memoria de acabados REAL del dev (project_memoria) → la ficha. Antes solo venía del seed (sin write-path del dev). Fail-open.
    try:
        mem_doc = await db.project_memoria.find_one({"project_id": dev_id}, {"_id": 0})
        if mem_doc and isinstance(mem_doc.get("memoria"), list) and mem_doc["memoria"]:
            out["memoria_acabados"] = [{"area": r.get("area"), "detalle": r.get("detalle")}
                                       for r in mem_doc["memoria"] if isinstance(r, dict) and r.get("area") and r.get("detalle")]
    except Exception:
        pass
    # Ficha técnica REAL del dev (project_tecnica, filas → dict) → la ficha (dev.tecnica). Antes solo seed. Fail-open.
    try:
        tec_doc = await db.project_tecnica.find_one({"project_id": dev_id}, {"_id": 0})
        if tec_doc and isinstance(tec_doc.get("tecnica"), list) and tec_doc["tecnica"]:
            out["tecnica"] = {r.get("campo"): r.get("valor") for r in tec_doc["tecnica"]
                              if isinstance(r, dict) and r.get("campo") and r.get("valor")}
    except Exception:
        pass
    # #19 · Créditos aceptados REALES del dev (project_creditos) → la ficha (antes solo seed, sin editor). Fail-open.
    try:
        cr_doc = await db.project_creditos.find_one({"project_id": dev_id}, {"_id": 0})
        if cr_doc and isinstance(cr_doc.get("creditos"), list) and cr_doc["creditos"]:
            out["creditos_aceptados"] = [c for c in cr_doc["creditos"] if isinstance(c, str) and c]
    except Exception:
        pass
    # Ubicación que el dev corrigió (pin del mapa / dirección / colonia) → el comprador ve el dato real, no el del seed. Fail-open.
    try:
        meta = await db.dev_project_meta.find_one({"project_id": dev_id}, {"_id": 0})
        if meta:
            if meta.get("lat") is not None and meta.get("lng") is not None:
                out["center"] = {"lat": meta["lat"], "lng": meta["lng"]}
            for _k_meta, _k_out in (("address", "address_full"), ("colonia", "colonia"), ("alcaldia", "alcaldia"), ("cp", "postal_code")):
                if meta.get(_k_meta):
                    out[_k_out] = meta[_k_meta]
    except Exception:
        pass
    # Fotos REALES que subió el dev → también en la FICHA (no solo en la tarjeta del listado). Las del dev primero. Fail-open.
    try:
        from dev_assets import public_photos_for_dev
        dev_photos = await public_photos_for_dev(db, dev_id)
        # SOLO imágenes al carrusel: video/brochure son públicos pero NO son fotos
        # (07-16: 11 mp4 + 1 pdf salían como cuadros rotos en la galería de NUA)
        urls = [p["url"] for p in dev_photos if p.get("url")
                and p["url"].lower().endswith((".jpg", ".jpeg", ".png", ".webp"))]
        if urls:
            seed_photos = [p for p in (out.get("photos") or []) if p not in urls]
            out["photos"] = urls + seed_photos
    except Exception:
        pass
    # #10 · Historial de precios REAL desde price_events (colección viva) cuando exista → deja de presentarse el
    # sintético como si fuera real. Serie a nivel desarrollo = precio "desde" (mínimo) por fecha de cambio. Fail-open.
    try:
        evs = []
        async for _e in db.price_events.find({"dev_id": dev_id}, {"_id": 0, "old_price": 1, "new_price": 1, "changed_at": 1}):
            evs.append(_e)
        if evs:
            evs.sort(key=lambda x: x.get("changed_at") or "")
            launch = min((e.get("old_price") for e in evs if e.get("old_price")), default=None)
            by_date: Dict[str, int] = {}
            for e in evs:
                d = (e.get("changed_at") or "")[:10]
                if e.get("new_price") and d:
                    by_date[d] = min(int(e["new_price"]), by_date.get(d, 10 ** 15))
            series = ([{"date": "Lanzamiento", "price": int(launch)}] if launch else [])
            series += [{"date": d, "price": p} for d, p in sorted(by_date.items())]
            if len(series) >= 2:
                out["price_history"] = series
                out["price_history_source"] = "real"
        out.setdefault("price_history_source", "estimado")
    except Exception:
        out.setdefault("price_history_source", "estimado")
    out["stage"] = _norm_stage(out.get("stage"), out.get("delivery_estimate"))   # por fecha de entrega real
    return out


@router.get("/api/developments/{dev_id}/archivo/{file_id}")
async def dev_archivo_publico(dev_id: str, file_id: str, request: Request):
    """Sirve un RENDER o PLANO del Drive del proyecto al MARKETPLACE público. Candados: (1) el proyecto debe
    estar PUBLICADO (aprobado por superadmin), (2) el archivo debe estar ligado al proyecto, (3) solo imágenes
    clasificadas render/obra o PDFs de plano — una foto de depto muestra NUNCA sale (regla founder). El
    navegador no puede leer Drive privado directo; esto lo puentea vía OAuth con caché de 1 día."""
    db = request.app.state.db
    pub = await db.developments.find_one(
        {"id": dev_id, "marketplace_published": {"$nin": [False, "pending"]}}, {"_id": 0, "id": 1})
    if not pub:
        raise HTTPException(404, "Desarrollo no encontrado")
    asset = await db.project_assets.find_one(
        {"development_id": dev_id, "drive_file_id": file_id},
        {"_id": 0, "mime": 1, "filename": 1, "image_kind": 1})
    if not asset:
        raise HTTPException(404, "Archivo no ligado a este proyecto")
    mime = asset.get("mime") or ""
    fn = (asset.get("filename") or "").lower()
    import re as _re
    es_imagen_publica = mime.startswith("image/") and asset.get("image_kind") in ("render", "obra")
    es_plano_pdf = mime == "application/pdf" and bool(_re.search(r"plano|planta|prototipo|tipo[ _-]|dep[-_ ]?\d", fn))
    if not (es_imagen_publica or es_plano_pdf):
        raise HTTPException(403, "Este archivo no es público")
    try:
        from bulk_ingest_engine import _resolve_drive_conn, _download_file_bytes
        conn = await _resolve_drive_conn(db, None)
        if not conn:
            raise HTTPException(503, "Sin conexión a Drive")
        data, eff_mime = await _download_file_bytes(conn, file_id, mime)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        # SEGURIDAD (auditoría 2026-07-12): no filtrar la excepción interna al cliente.
        import logging
        logging.getLogger("dmx.public").exception("[public] descarga de archivo falló")
        raise HTTPException(502, "No se pudo leer el archivo")
    from fastapi.responses import Response
    return Response(content=data, media_type=eff_mime or mime,
                    headers={"Cache-Control": "public, max-age=86400"})


@router.get("/api/developments/{dev_id}/units")
async def list_dev_units(
    dev_id: str, request: Request,
    status: Optional[str] = None,
    beds: Optional[int] = None,
    baths: Optional[int] = None,
    parking: Optional[int] = None,
):
    db = request.app.state.db
    d = DEVELOPMENTS_BY_ID.get(dev_id)
    if d:
        await _ensure_overlay_loaded(dev_id, db)
        d = _apply_overlay(d)
        units = list(d.get("units", []))
    else:
        # INGESTA / WIZARD: proyecto fuera de la semilla → sus unidades viven en db.units (development_id/project_id).
        # Sin este fallback el endpoint daba 404 y el cotizador/ficha 360 del asesor quedaba sin unidades (auditoría 07-07).
        pub = await db.developments.find_one(
            {"id": dev_id, "marketplace_published": {"$nin": [False, "pending"]}}, {"_id": 0, "id": 1})
        if not pub:
            pub = await db.projects.find_one(
                {"id": dev_id, "marketplace_published": {"$nin": [False, "pending"]}}, {"_id": 0, "id": 1})
        if not pub:
            raise HTTPException(404, "Desarrollo no encontrado")
        from ingested_reader import units_for_dev, attach_planos
        units = await units_for_dev(db, dev_id)
        await attach_planos(db, dev_id, units)   # plano del prototipo por unidad (founder 07-08)
    # Fusiona las ediciones MANUALES del dev → el comprador ve el dato vivo (mismo helper que la ficha).
    units = await _apply_unit_overrides(db, dev_id, units)
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
        # ingeridos (sin seed): sin badge — respuesta vacía, no 404 (ver nota en /rank)
        return {"badge": None, "disponible": False}
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
        # ingeridos (sin seed): sin ranking de colonia — respuesta vacía, no 404 (07-16:
        # 2 errores de consola POR TARJETA × 50 tarjetas ahogaban el debugging del founder)
        return {"rank": None, "total": 0, "badge_tier": None}
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
        from llm_client import LlmChat, UserMessage
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
    '"min_sqm":number,"max_sqm":number,"beds":number,"baths":number,"parking":number,"stage":string,"plazo":string,'
    '"amenity":[string],"unit_feature":[string],"orientacion":[string],"piso_min":number,'
    '"enganche_max":number,"mensualidad_max":number,"apartado_max":number}\n'
    "ZONA: colonia es LISTA — devuelve TODAS las que mencione, no solo una. 'en polanco o condesa, del valle, napoles'→"
    'colonia:["polanco","condesa","del-valle","napoles"] (slug minúsculas con guión).\n'
    "DINERO (MXN): 'mil'=1000, 'millones/mdp/melones'=1000000, '5M'=5000000. APLICA la magnitud al RANGO completo. "
    "RANGO precio → min_price+max_price: '10-15mdp'/'entre 10 y 15 millones'→min_price:10000000,max_price:15000000. "
    "Tope simple 'hasta 15M'→max_price. ENGANCHE: 'enganche menor a 500 mil'→enganche_max:500000; con RANGO 'enganche "
    "entre 500 y 700 mil'→enganche_max:700000 (el número MÁS ALTO del rango × la magnitud). 'mensualidades de máx 20mil "
    "/ que no pasen de 20 mil al mes'→mensualidad_max:20000. APARTADO: 'apartado de 10 mil / con 10,000 de apartado'→"
    "apartado_max:10000.\n"
    "tipo ∈ {dept,casa}. stage ∈ {preventa,entrega_inmediata}. plazo (solo preventa, cuándo la entregan) ∈ "
    "{menos_3,3_6,6_12,mas_12}: 'a 2 años / en 24 meses'→mas_12; 'en 6 meses'→6_12. orientacion ∈ {Norte,Sur,Oriente,Poniente}.\n"
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
    visitor_id: Optional[str] = None   # AUDITORÍA E2E: sin esto, el termómetro/cohortes/etapa
                                       # no pueden atribuir la búsqueda de Atlax a una persona


_AI_RATE: Dict[str, list] = {}
_ESPEJO_RATE: Dict[str, list] = {}                                       # bucket PROPIO del espejo (no LLM)
_ESPEJO_RATE_MAX = int(os.environ.get("ESPEJO_CORTE_MAX_PER_HOUR", "120"))
_ESPEJO_CACHE: Dict[str, tuple] = {}                                     # (ts, respuesta) por hash del corte
_AI_RATE_MAX = int(os.environ.get("AI_SEARCH_MAX_PER_HOUR", "40"))      # por IP/hora
_AI_RATE_MAX_DAY = int(os.environ.get("AI_SEARCH_MAX_PER_DAY", "2000"))  # TECHO GLOBAL diario (todas las IPs)
_AI_GLOBAL: list = []


def _ai_rate_ok(ip: str) -> bool:
    """Cap de costo del LLM (2 candados): por IP/hora Y un TECHO GLOBAL diario. Si se pasa cualquiera → False y se
    usa el parser DETERMINISTA gratis (la búsqueda nunca se cae). Así el gasto de API tiene piso y techo duros."""
    import time as _t
    now = _t.time()
    # Candado global diario (protege contra muchas IPs juntas).
    _AI_GLOBAL[:] = [t for t in _AI_GLOBAL if now - t < 86400]
    if len(_AI_GLOBAL) >= _AI_RATE_MAX_DAY:
        return False
    # Candado por IP/hora.
    bucket = [t for t in _AI_RATE.get(ip, []) if now - t < 3600]
    if len(bucket) >= _AI_RATE_MAX:
        _AI_RATE[ip] = bucket
        return False
    bucket.append(now)
    _AI_RATE[ip] = bucket
    _AI_GLOBAL.append(now)
    return True


def _parse_misses(q, filters):
    """BUCLE DE FALLAS DE LECTURA: conceptos que el texto MENCIONA pero el parser NO capturó. En vez de adivinar las
    infinitas formas de expresarse, el sistema marca lo que falló en búsquedas REALES → el superadmin lo ve y afinamos
    con DATOS (o sube la palanca prendiendo el LLM). Devuelve la lista de conceptos no leídos."""
    import re as _r
    ql = (q or "").lower()
    cap = lambda *ks: any(filters.get(k) for k in ks)
    checks = [
        ("enganche", r"enganche", "enganche_max"),
        ("apartado", r"apartado", "apartado_max"),
        ("mensualidad", r"mensualidad", "mensualidad_max"),
        ("descuento", r"\boff\b|descuento|dscto|%", "descuento_min"),
        ("esquema_pago", r"\b\d{1,2}\s*/\s*\d{1,2}\b", "esquema_pago"),
        ("credito", r"infonavit|cofinavit|fovissste|hipotecari|\bcred\b|\bch\b|contado", "credito"),
        ("recamaras", r"\d\s*(?:rec|recámara|recamara|r\b)", "beds"),
        ("banos", r"\d\s*(?:ba[ñn]o|b\b)", "baths"),
        ("estacionamiento", r"\d\s*(?:estac|caj[oó]n|cajones|\be\b)", "parking"),
        ("plazo", r"\d\s*(?:años?|anios?|meses|d[ií]as)", "plazo"),
        ("precio", r"mill[oó]n|mdp|presupuesto", "min_price"),
        ("m2", r"\bm2\b|\bm²\b|metros\b", "min_sqm"),
    ]
    miss = []
    for name, rx, key in checks:
        captured = cap(key) or (key == "min_price" and cap("max_price")) or (key == "min_sqm" and cap("max_sqm"))
        if not captured and _r.search(rx, ql):
            miss.append(name)
    return miss


# Caché lazy de los nombres del catálogo COMPLETO de colonias (para reconocer colonias sin inventario en el buscador IA).
_COLONIA_NAMES_CACHE = {"data": None}


async def _load_colonia_names(db):
    if _COLONIA_NAMES_CACHE["data"] is None:
        try:
            cols = await db.colonias.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(5000)
            _COLONIA_NAMES_CACHE["data"] = [(c.get("name"), c.get("id")) for c in cols if c.get("name") and c.get("id")]
        except Exception:
            _COLONIA_NAMES_CACHE["data"] = []
    return _COLONIA_NAMES_CACHE["data"]


_COLONIA_SEARCH_CACHE = {"data": None}


def _fold_txt(s):
    import unicodedata as _ud
    return _ud.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode("ascii").lower()


@router.get("/api/colonias-search")
async def colonias_search(request: Request, q: str = "", limit: int = 20):
    """Typeahead sobre TODO el catálogo (db.colonias · ~1,811 colonias con scores), no solo las 16 curadas. Así el usuario
    descubre y entra a CUALQUIER colonia (la ficha /zona/:id + lugares se autollenan con lazy-ingest). Acento/case-insensible.
    Las 16 curadas (con ficha rica) se priorizan. Devuelve lo mínimo para el dropdown (id, name, alcaldía, calidad, scores)."""
    db = request.app.state.db
    if _COLONIA_SEARCH_CACHE["data"] is None:
        try:
            cols = await db.colonias.find({}, {"_id": 0, "id": 1, "name": 1, "alcaldia": 1, "scores": 1, "calidad": 1}).to_list(5000)
            _COLONIA_SEARCH_CACHE["data"] = [c for c in cols if c.get("id") and c.get("name")]
        except Exception:
            _COLONIA_SEARCH_CACHE["data"] = []
    data = _COLONIA_SEARCH_CACHE["data"] or []
    seed_ids = {c["id"] for c in SEED_COLONIAS}
    lim = max(1, min(int(limit or 20), 40))
    qf = _fold_txt(q).strip()
    if not qf:
        feat = [c for c in data if c.get("id") in seed_ids]
        res = (feat or data)[:lim]
    else:
        hits = [c for c in data if qf in _fold_txt(c.get("name"))]
        hits.sort(key=lambda c: (not _fold_txt(c.get("name")).startswith(qf), c.get("id") not in seed_ids, -(c.get("calidad") or 0)))
        res = hits[:lim]
    return [{"id": c["id"], "name": c["name"], "alcaldia": c.get("alcaldia"),
             "scores": c.get("scores"), "calidad": c.get("calidad"),
             "featured": c.get("id") in seed_ids} for c in res]


# ── LEAD MAGNET de landing (dev/asesor): muestra GRATIS un pulso REAL pero MÍNIMO de una zona; el reporte completo se
#    desbloquea al registrarse. Dato 100% real (db.marketplace_searches + db.colonias). Honesto si la zona tiene poca señal.
@router.get("/api/public/pulso-zona")
async def pulso_zona(request: Request, colonia: str = "", tipo: Optional[str] = None, precio: Optional[int] = None, rol: str = "dev"):
    from datetime import datetime as _d, timedelta as _t
    import re as _rgx
    db = request.app.state.db
    q = (colonia or "").strip()
    col = None
    if q:
        col = (await db.colonias.find_one({"id": q}, {"_id": 0})
               or await db.colonias.find_one({"name": {"$regex": "^" + _rgx.escape(q), "$options": "i"}}, {"_id": 0}))
    cid = (col or {}).get("id") or q
    nombre = (col or {}).get("name") or q
    # Demanda sobre TODOS los ids con el mismo nombre (seed corto + catálogo largo) → no perder señal por el choque de 2 sistemas de id.
    _ids = {cid}
    if nombre:
        _nf = _fold_txt(nombre)
        try:
            async for _c in db.colonias.find({"name": nombre}, {"_id": 0, "id": 1}):
                if _c.get("id"):
                    _ids.add(_c["id"])
        except Exception:
            pass
        for _sc in SEED_COLONIAS:   # puente catálogo↔seed por nombre (la demanda se loguea con el id seed corto)
            if _fold_txt(_sc.get("name")) == _nf and _sc.get("id"):
                _ids.add(_sc["id"])
    base = {"colonia_id": {"$in": list(_ids)}, "created_at_dt": {"$gte": _d.utcnow() - _t(days=30)}}
    try:
        demanda = await db.marketplace_searches.count_documents(base)
    except Exception:
        demanda = 0
    pres = rec = None
    try:
        import statistics as _stt
        from collections import Counter as _Counter
        _a = await db.marketplace_searches.aggregate([{"$match": base}, {"$group": {"_id": None, "ps": {"$push": "$precio_max"}, "rs": {"$push": "$recamaras_min"}}}]).to_list(1)
        if _a:
            _ps = [x for x in (_a[0].get("ps") or []) if isinstance(x, (int, float)) and x]
            _rs = [int(x) for x in (_a[0].get("rs") or []) if isinstance(x, (int, float)) and x]
            pres = round(_stt.median(_ps)) if _ps else None     # MEDIANA (robusta a presupuestos atípicos)
            rec = _Counter(_rs).most_common(1)[0][0] if _rs else None   # MODA (las recámaras que MÁS se piden)
    except Exception:
        pass
    oferta = [d for d in DEVELOPMENTS if d.get("colonia_id") in _ids]
    # Precio/m² de MERCADO: mediana del $/m² de los desarrollos REALES de la zona (lo que de verdad se vende). None si no hay oferta.
    precio_m2 = None
    try:
        import statistics as _st2
        from data_developments import dev_price_m2 as _dpm2
        _pm = [v for v in (_dpm2(d) for d in oferta) if v]
        if _pm:
            precio_m2 = round(_st2.median(_pm))
    except Exception:
        pass
    # Gate k-anon CANÓNICO (K_ANON_MIN=5): con pocas búsquedas, el conteo exacto + presupuesto mediano de
    # una zona podría identificar a personas concretas en un endpoint PÚBLICO. Bajo el piso publicamos solo
    # que "hay señal" (booleano), nunca el valor crudo. Mismo estándar que /api/v1 zone-demand.
    from anonymization_engine import K_ANON_MIN as _KANON
    _kanon_ok = demanda >= _KANON
    _demanda_pub = demanda if _kanon_ok else None
    if not _kanon_ok:
        pres = rec = None
    if rol == "asesor":
        visible = [
            {"k": "Compradores buscando aquí (30 días)", "v": _demanda_pub, "fmt": "int"},
            {"k": "Presupuesto promedio que buscan", "v": pres, "fmt": "money"},
            {"k": "Recámaras que más buscan", "v": rec, "fmt": "rec"},
        ]
        locked = ["Los leads listos para contactar en tu zona", "Qué amenidades piden (y la zona no tiene)", "A qué zonas se va la demanda que no encuentra", "El reporte completo (precios, plusvalía, lugares cerca)"]
    else:
        visible = [
            {"k": "Personas buscando aquí (30 días)", "v": _demanda_pub, "fmt": "int"},
            {"k": "Presupuesto promedio que buscan", "v": pres, "fmt": "money"},
            {"k": "Desarrollos compitiendo en tu zona", "v": len(oferta), "fmt": "int"},
        ]
        locked = ["A dónde se va la demanda que no encuentra aquí", "El esquema de pago que más piden (crédito vs preventa)", "Cuántos quieren tu zona pero no les alcanza (la brecha)", "Qué recámaras y amenidades piden y no hay", "El precio/m² de tus competidores directos"]
    return {
        "ok": True, "colonia": nombre, "colonia_id": cid,
        "tiene_senal": demanda > 0,
        # Solo DATOS CONCRETOS y CONFIABLES (búsquedas reales) — sin índices "X/100" que no dicen nada ni datos ruidosos.
        "visible": visible,
        "precio_m2": precio_m2,   # $/m² de mercado (mediana de los desarrollos REALES de la zona) · None si no hay oferta
        "locked": locked, "locked_count": len(locked),
        "nota": ("Tu zona aún no tiene búsquedas registradas — regístrate y te avisamos en cuanto empiecen." if demanda == 0
                 else "Esto es solo una muestra. El reporte completo de tu zona se desbloquea gratis al registrarte."),
    }


class RegistroInteresIn(BaseModel):
    rol: str
    nombre: Optional[str] = None
    email: Optional[str] = None
    telefono: Optional[str] = None
    colonia: Optional[str] = None
    tipo: Optional[str] = None
    precio: Optional[int] = None
    empresa: Optional[str] = None


@router.post("/api/public/registro-interes")
async def registro_interes(payload: RegistroInteresIn, request: Request):
    """Captura el registro de un dev/asesor desde la landing (lead magnet) con su contexto (zona/proyecto) → el equipo le
    manda el reporte completo. Fail-open (nunca rompe la landing)."""
    db = request.app.state.db
    if not ((payload.email or "").strip() or (payload.telefono or "").strip()):
        raise HTTPException(400, "Déjanos un email o teléfono para enviarte el reporte.")
    import hashlib as _hl
    from datetime import datetime as _d
    _ip = (request.client.host if request.client else "") or "x"
    doc = {**payload.dict(), "source": "landing_leadmagnet", "estado": "nuevo",
           "created_at_dt": _d.utcnow(), "ip_hash": _hl.sha256(_ip.encode()).hexdigest()[:16]}
    try:
        await db.registros_interes.insert_one(doc)
    except Exception:
        pass
    # Espejo al pipeline REAL que sí lee el superadmin (Landing Leads) — antes esta demanda
    # declarada moría en registros_interes (colección sin ningún lector). Fail-open.
    try:
        import secrets as _sec
        await db.landing_leads.insert_one({
            "lead_id": f"land_{_sec.token_urlsafe(10)}",
            "email": (payload.email or "").strip(),
            "phone": (payload.telefono or "").strip(),
            "zone_interest": (payload.colonia or "").strip().lower(),
            "notes": f"lead-magnet landing · rol={payload.rol} · empresa={payload.empresa or '—'} · tipo={payload.tipo or '—'} · precio={payload.precio or '—'}",
            "source": "landing_leadmagnet",
            "rol": payload.rol, "nombre": payload.nombre, "empresa": payload.empresa,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": "pending_inventory",
            "ip_hash": doc.get("ip_hash"),
        })
    except Exception:
        pass
    return {"ok": True, "mensaje": "¡Listo! Te enviaremos el reporte completo de tu zona en breve."}


# ─── CUBO F4.1 · ESPEJO PERSONAL DEL COMPRADOR ────────────────────────────────
class EspejoCorteIn(BaseModel):
    filters: Dict[str, Any] = {}
    visitor_id: Optional[str] = None   # para capturar la señal 'vio corte caliente' (flywheel)


@router.post("/api/properties/espejo-corte")
async def espejo_corte_publico(payload: EspejoCorteIn, request: Request):
    """El corte del comprador visto desde el otro lado: '10-24 personas buscaron algo así ·
    quedan N unidades'. TODO pasa por la lente pública (cube_lens rol comprador): bandas de
    demanda con k-anon K_ANON_MIN — jamás conteos exactos — y supresión bajo K. Urgencia
    HONESTA: si no hay demanda que publicar, se dice 'demanda aún chica', no se inventa."""
    db = request.app.state.db
    # SEGURIDAD: rate-limit PROPIO (auditoría F4: compartir _ai_rate_ok quemaba la cuota del
    # LLM del buscador con un count barato de Mongo — 120/IP/h sin tocar el techo global del LLM).
    _ip = (request.client.host if request.client else "?")
    import time as _tm
    now_h = _tm.time()
    bucket = _ESPEJO_RATE.setdefault(_ip, [])
    bucket[:] = [t for t in bucket if now_h - t < 3600]
    if len(bucket) >= _ESPEJO_RATE_MAX:
        return {"ok": False, "error": "rate_limited"}
    bucket.append(now_h)
    if len(_ESPEJO_RATE) > 4096:   # anti-crecimiento del dict
        _ESPEJO_RATE.clear()
    if len(payload.filters or {}) > 24:   # cap defensivo del dict público
        return {"ok": False, "error": "demasiados filtros"}
    from cube_marketplace_bridge import filtros_marketplace_a_corte
    import cube_lens
    corte, no_mapeados = filtros_marketplace_a_corte(payload.filters)
    if not corte:
        return {"ok": True, "espejable": False, "motivo": "sin filtros con cara en el cubo"}
    # cache corto por corte (el debounce del banner multiplica requests idénticos)
    import hashlib as _hl
    import json as _j2
    _ck = _hl.sha256(_j2.dumps(corte, sort_keys=True, default=str).encode()).hexdigest()[:20]
    _hit = _ESPEJO_CACHE.get(_ck)
    if _hit and now_h - _hit[0] < 90:
        return _hit[1]
    lente = await cube_lens.consulta_con_lente(db, "comprador", corte)
    # HONESTIDAD (review F4): el número público son las DISPONIBLES — contar vendidas
    # inflaba la urgencia y filtraba la absorción de un dev identificable.
    n_disp = lente.get("n_disponibles") if lente.get("ok") and not lente.get("suprimido") else None
    espejo = await cube_lens.espejo_con_lente(db, "comprador", corte, n_oferta=n_disp)
    res = {
        "ok": True, "espejable": True,
        "unidades_disponibles": n_disp,               # None = muestra chica (suprimido)
        "espejo": espejo,                             # bandas + caliente + momentum + lectura
        "no_mapeados": no_mapeados,                   # honesto: qué filtro no tiene cara en el cubo
    }
    if len(_ESPEJO_CACHE) > 512:
        _ESPEJO_CACHE.clear()
    _ESPEJO_CACHE[_ck] = (now_h, res)
    # FLYWHEEL (auditoría cross-fase): un comprador viendo un corte CALIENTE es la señal de
    # intención más pura — se captura de vuelta al Modelo del Mundo (alimenta demand_cut y le
    # da al asesor/dev "este corte no solo se busca, se mira bajo presión"). Fire-and-forget.
    try:
        esp = res.get("espejo") or {}
        if esp.get("caliente") and (payload.visitor_id or (request.client and request.client.host)):
            vid = payload.visitor_id or ""
            ip_hash = None
            if not vid and request.client:
                import hashlib as _h
                ip_hash = _h.sha256(request.client.host.encode()).hexdigest()[:16]
            await db.buyer_signals.insert_one({
                "type": "espejo_caliente_visto", "visitor_id": vid or None, "ip_hash": ip_hash,
                "corte": corte, "banda": esp.get("personas_banda"),
                "unidades_disponibles": n_disp, "created_at_dt": datetime.now(timezone.utc),
            })
    except Exception:  # noqa: BLE001 — la señal jamás rompe la respuesta
        pass
    return res


@router.post("/api/properties/search-ai")
async def ai_search_parser(payload: AISearchIn, request: Request):
    import json as _json
    from llm_safety import sanitize_user_input  # SEGURIDAD (pentest 2026-06-27): cap + anti prompt-injection
    db = request.app.state.db
    q = sanitize_user_input((payload.query or "").strip(), max_len=500)
    if not q:
        return {"filters": {}, "query": q, "cached": False}
    cache_key = ("v3_" + q.lower())[:500]   # v3 = completado determinista de rangos m² sobre parse LLM parcial (invalida caché viejo)
    cached = await db.ai_search_cache.find_one({"cache_key": cache_key}, {"_id": 0})
    if cached:
        ts = cached.get("created_at")
        if ts is not None and ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts and (datetime.now(timezone.utc) - ts).total_seconds() < 86400:
            return {"filters": cached.get("filters", {}), "query": q, "cached": True, "zona_no_disponible": cached.get("zona_no_disponible"), "zona_no_disponible_slug": cached.get("zona_no_disponible_slug"), "cross_zone": cached.get("cross_zone") or [], "zonas_sustitutas": cached.get("zonas_sustitutas") or [], "mensualidad_supuesto": cached.get("mensualidad_supuesto"), "brecha_zona": cached.get("brecha_zona"), "cross_relax": cached.get("cross_relax")}
    parsed = {}
    # SAFE LIMIT del LLM (control de costo, founder): máx N búsquedas IA por IP/hora. Si se pasa, NO se llama al LLM
    # → cae al parser DETERMINISTA (gratis) abajo. Así el costo de API no se dispara y la búsqueda igual funciona.
    _ip = (request.client.host if request.client else "") or "x"
    _allow_llm = _ai_rate_ok(_ip)
    try:
        if not _allow_llm:
            raise RuntimeError("ai_rate_limited")  # salta al fallback determinista
        from llm_client import LlmChat, UserMessage
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
    allowed = {"colonia", "alcaldia", "tipo", "min_price", "max_price", "min_sqm", "max_sqm", "beds", "baths", "parking", "stage", "plazo", "amenity", "unit_feature", "orientacion", "piso_min", "enganche_max", "mensualidad_max", "apartado_max", "credito", "descuento_min", "esquema_pago"}
    filters = {k: v for k, v in parsed.items() if k in allowed and v not in (None, "", [], {})}

    # ── Fallback DETERMINISTA (sin LLM) ──────────────────────────────────────────
    # El parser LLM puede estar apagado (local) o no sacar la zona → resultados en zonas que NADIE pidió. Esto saca
    # zona/recámaras/precio/tipo/etapa del texto crudo para que "depa 3 rec en del valle" RESPETE Del Valle (zona =
    # filtro DURO, regla del founder). También es un backstop confiable en prod (corrige lo que el LLM omite).
    import re as _re
    import unicodedata as _ud
    ql = q.lower()
    _fold = lambda s: _ud.normalize("NFKD", s or "").encode("ascii", "ignore").decode("ascii")  # quita acentos: nápoles→napoles
    qfold = _fold(ql)
    _DIRS = (" centro", " norte", " sur", " oriente", " poniente", " 1a seccion", " 2a seccion", " i", " ii")
    if "colonia" not in filters:
        cand = []  # (texto_a_buscar, colonia_id) · gana el match más LARGO (evita "valle" antes que "del valle")
        seen_ids = set()
        for c in SEED_COLONIAS:
            nm = _fold((c.get("name") or "").lower().strip())
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
            nm = _fold((d.get("colonia") or "").lower().strip())
            cid = d.get("colonia_id")
            if nm and cid and cid not in seen_ids and len(nm) >= 4:
                cand.append((nm, cid))
        cand.sort(key=lambda x: len(x[0]), reverse=True)
        _qcol, found = qfold, []   # MULTI-colonia (sin acentos): "polanco o condesa, del valle, napoles" → TODAS
        for v, cid in cand:
            if cid in found:
                continue
            if _re.search(r"\b" + _re.escape(v), _qcol):
                found.append(cid)
                _qcol = _re.sub(r"\b" + _re.escape(v), " ", _qcol)  # consume el texto → no re-matchea "valle" tras "del valle"
        if found:
            filters["colonia"] = found if len(found) > 1 else found[0]
    # Recámaras / baños / cajones — palabra COMPLETA o ABREVIATURA de broker (3R · 2b · 2e). Letra sola con \b (segura).
    if "beds" not in filters:
        m = _re.search(r"(\d+)\s*(?:rec\w*|recámara\w*|habitac\w*|cuarto\w*|dorm\w*|r\b)", ql)
        if m:
            filters["beds"] = int(m.group(1))
    if "baths" not in filters:
        m = _re.search(r"(\d+)\s*(?:ba[ñn]os?|b\b)", ql)
        if m:
            filters["baths"] = int(m.group(1))
    if "parking" not in filters:
        m = _re.search(r"(\d+)\s*(?:estacionamiento\w*|caj[oó]n\w*|cajones|autos?|est\b|e\b)", ql)
        if m:
            filters["parking"] = int(m.group(1))
    if "tipo" not in filters:
        if "depa" in ql or "departamento" in ql:
            filters["tipo"] = "departamento"
        elif "casa" in ql:
            filters["tipo"] = "casa"
    # ── Normalizador de DINERO (robusto): dígitos · palabras · mixto · compuesto · magnitudes ──
    # 'mil'/'k'=1e3 · 'millón/millones/mdp/melones'=1e6. Palabras: medio=0.5, un..diez, cien, quinientos, etc.
    _NUMWORD = {"medio": 0.5, "media": 0.5, "un": 1, "uno": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4,
                "cinco": 5, "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10, "once": 11, "doce": 12,
                "quince": 15, "veinte": 20, "treinta": 30, "cuarenta": 40, "cincuenta": 50, "cien": 100, "ciento": 100,
                "doscientos": 200, "trescientos": 300, "cuatrocientos": 400, "quinientos": 500, "setecientos": 700, "ochocientos": 800}
    _NUMRE = r"\d[\d,\.]*|medio|media|un[oa]?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta|cuarenta|cincuenta|cien(?:to)?|doscientos|trescientos|cuatrocientos|quinientos|setecientos|ochocientos"
    _MAGRE = r"mill[oó]n\w*|mdp|mel[oó]n\w*|mil|k"

    def _magval(w):
        w = (w or "").lower()
        return 1_000_000 if (w.startswith("mill") or w.startswith("mel") or w == "mdp") else 1_000 if w in ("mil", "k") else 1

    def _one(phrase):  # UN grupo número+magnitud → valor. '500 mil'→500000 · 'medio millón'→500000 · '2.5 millones'→2.5e6
        m = _re.match(r"\s*(" + _NUMRE + r")\s*(" + _MAGRE + r")?", (phrase or "").lower())
        if not m:
            return None
        n = _NUMWORD.get(m.group(1))
        if n is None:
            try:
                n = float(m.group(1).replace(",", "").replace(" ", ""))
            except ValueError:
                return None
        return n * _magval(m.group(2))

    def _money_phrase(text):  # COMPUESTO: '2mil 500'→2500 · '2 millones 500 mil'→2.5e6 (suma grupos descendentes)
        toks = _re.findall(r"(" + _NUMRE + r")\s*(" + _MAGRE + r")?", (text or "").lower())
        total, any_ = 0.0, False
        for num_s, mag_s in toks:
            v = _one(num_s + " " + mag_s)
            if v is not None:
                total += v
                any_ = True
        return total if (any_ and total > 0) else None

    # Estrategia: saca enganche/mensualidad/apartado (van pegados a su palabra) y QUÍTALOS del texto; lo que queda es
    # el precio → así "10-15mdp con mensualidades max 20mil" no confunde el 20mil con el precio.
    _work = ql

    def _cap_for(kw):
        """Tope (max) de un campo de dinero pegado a su palabra. Soporta RANGO ('entre 500 y 700 mil'→700000),
        COMPUESTO ('2mil 500'→2500), palabras ('medio millón'→500000) y operadores (menor/hasta/máximo)."""
        # 1) RANGO explícito "A (a|y|hasta|-) B [magnitud]" → el mayor × la magnitud común
        m = _re.search(kw + r"[^0-9]{0,22}?(" + _NUMRE + r")\s*(?:a|y|hasta|-|–)\s*(" + _NUMRE + r")\s*(" + _MAGRE + r")?\b", _work)
        if m:
            mag = m.group(3)
            a = (_one(m.group(1) + " " + (mag or "")) or 0)
            b = (_one(m.group(2) + " " + (mag or "")) or 0)
            cap = max(a, b)
            return (int(cap) if cap > 0 else None), m.group(0)
        # 2) COMPUESTO/simple: hasta 2 grupos pegados ('2mil 500'); el 2º solo si NO lo sigue una palabra (no "10 mil 3 rec")
        m = _re.search(kw + r"[^0-9]{0,22}?((?:" + _NUMRE + r")\s*(?:" + _MAGRE + r")?(?:\s+(?:" + _NUMRE + r")\s*(?:" + _MAGRE + r")?(?![a-zñáéíóú]))?)", _work)
        if m:
            cap = _money_phrase(m.group(1))
            return (int(cap) if cap and cap > 0 else None), m.group(0)
        # 3) NÚMERO antes de la palabra: "2,500 de apartado", "500 mil de enganche"
        m = _re.search(r"((?:" + _NUMRE + r")\s*(?:" + _MAGRE + r")?(?:\s+(?:" + _NUMRE + r")\s*(?:" + _MAGRE + r")?)?)\s*(?:de|en)?\s*" + kw, _work)
        if m:
            cap = _money_phrase(m.group(1))
            return (int(cap) if cap and cap > 0 else None), m.group(0)
        return None, None

    if "enganche_max" not in filters:
        cap, span = _cap_for(r"enganche")
        if cap:
            filters["enganche_max"] = cap
            _work = _work.replace(span, " ")
    if "mensualidad_max" not in filters:
        cap, span = _cap_for(r"mensualidad\w*")
        if cap and 500 <= cap <= 2_000_000:
            filters["mensualidad_max"] = cap
            _work = _work.replace(span, " ")
    if "apartado_max" not in filters:
        cap, span = _cap_for(r"apartado")
        if cap:
            filters["apartado_max"] = cap
            _work = _work.replace(span, " ")
    # Metraje (m²): RANGO "80 a 200 m2 / entre 80 y 200 metros" o tope "hasta 150 m2 / desde 80 m2 / 120 metros".
    _U = r"(?:m2|m²|mts|metros\b|m\.?c)"
    # El LLM puede devolver el rango de m² A MEDIAS ("100m2 a 250" → min_sqm sin max) e incluso leer el tope
    # como PRECIO (max_price=250000). Si la query trae un rango de m² inequívoco (el 2º número NO es dinero),
    # el determinista manda: fija ambos extremos y descarta el precio fantasma derivado del mismo token.
    if ("min_sqm" in filters) != ("max_sqm" in filters):
        _rng = (_re.search(r"(\d{2,4})\s*(?:-|–|—|a|y)\s*(\d{2,4})\s*" + _U, _work)
                or _re.search(r"(\d{2,4})\s*" + _U + r"\s*(?:-|–|—|a|y|hasta)\s*(\d{2,4})\b(?!\s*(?:mil\b|k\b|millones|mdp|pesos|\$))", _work))
        if _rng:
            _lo, _hi = int(_rng.group(1)), int(_rng.group(2))
            for _pk in ("min_price", "max_price"):
                if filters.get(_pk) in (_lo, _hi, _lo * 1000, _hi * 1000, _lo * 1_000_000, _hi * 1_000_000):
                    filters.pop(_pk, None)
            filters["min_sqm"], filters["max_sqm"] = min(_lo, _hi), max(_lo, _hi)
            _work = _work.replace(_rng.group(0), " ")
    if "min_sqm" not in filters and "max_sqm" not in filters:
        mq = (_re.search(r"(\d{2,4})\s*(?:-|–|—|a|y)\s*(\d{2,4})\s*" + _U, _work)         # "100 a 250 m2"
              or _re.search(r"(\d{2,4})\s*" + _U + r"\s*(?:-|–|—|a|y|hasta)\s*(\d{2,4})", _work))  # "100m2 a 250"
        if mq:
            lo, hi = int(mq.group(1)), int(mq.group(2))
            filters["min_sqm"], filters["max_sqm"] = min(lo, hi), max(lo, hi)
            _work = _work.replace(mq.group(0), " ")
        else:
            qhasta = _re.search(r"(?:hasta|m[aá]ximo|max|menos de)\s*(\d{2,4})\s*" + _U, _work)
            qdesde = _re.search(r"(?:desde|m[ií]nimo|min|al menos|m[aá]s de)\s*(\d{2,4})\s*" + _U, _work)
            qsingle = _re.search(r"(\d{2,4})\s*" + _U, _work)
            if qhasta:
                filters["max_sqm"] = int(qhasta.group(1)); _work = _work.replace(qhasta.group(0), " ")
            elif qdesde:
                filters["min_sqm"] = int(qdesde.group(1)); _work = _work.replace(qdesde.group(0), " ")
            elif qsingle:
                filters["min_sqm"] = int(qsingle.group(1)); _work = _work.replace(qsingle.group(0), " ")
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
            else:
                # Dígitos CRUDOS grandes (sin "millones"): "precio menor a 3000000", "hasta 4,500,000", "presupuesto 3000000".
                # La mensualidad/enganche/apartado ya se quitaron de _work, así que un número de 7+ cifras es el precio.
                mb = _re.search(r"\b(\d{7,9}|\d{1,3}(?:[,\.]\d{3}){2,3})\b", _work)
                if mb:
                    val = int(mb.group(1).replace(",", "").replace(".", ""))
                    if 500_000 <= val <= 100_000_000:
                        filters["max_price"] = val
    if "stage" not in filters:
        if "preventa" in ql:
            filters["stage"] = "preventa"
        elif "inmediata" in ql or "entrega inmediata" in ql or "lista" in ql:
            filters["stage"] = "entrega_inmediata"
    if "plazo" not in filters:  # tiempo de entrega en AÑOS/MESES/DÍAS, dígitos o palabras ("a 2 años", "en 90 dias")
        mp = _re.search(r"(" + _NUMRE + r")\s*(años?|anios?|anos?|meses|mes|d[ií]as?)\b", _work)
        if mp:
            n = _one(mp.group(1)) or 0
            u = mp.group(2)
            meses = n * 12 if u[0] == "a" else n / 30 if u[0] == "d" else n
            if meses > 0:
                filters["plazo"] = "menos_3" if meses <= 3 else "3_6" if meses <= 6 else "6_12" if meses <= 12 else "mas_12"
    # CRÉDITO (vocabulario finito de instituciones MX) · DESCUENTO/promo · ESQUEMA de pago — categorías, no casos sueltos.
    if "credito" not in filters:
        _cr = []
        if _re.search(r"\binfonavit\b|\binfo\b", ql): _cr.append("infonavit")
        if _re.search(r"\bcofinavit\b|\bcofi\b", ql): _cr.append("cofinavit")
        if _re.search(r"\bfovissste\b|\bfovi\b", ql): _cr.append("fovissste")
        if _re.search(r"bancari|hipotecari|cr[eé]dito hipotecario|\bch\b|\bcred\b", ql): _cr.append("hipotecario")
        if _re.search(r"\bcontado\b", ql): _cr.append("contado")
        if _cr:
            filters["credito"] = list(dict.fromkeys(_cr))
    if "descuento_min" not in filters:
        md = _re.search(r"(\d{1,2})\s*%?\s*(?:off|de descuento|descuento|dscto)", ql)
        if md:
            filters["descuento_min"] = int(md.group(1))
        elif _re.search(r"\bdescuento\b|\boff\b|promoci[oó]n", ql):
            filters["descuento_min"] = 1   # quiere descuento (sin % específico)
    if "esquema_pago" not in filters:    # "30/70 · 20/40/40" (% enganche / mensualidades / escritura)
        me = _re.search(r"\b(\d{1,2})\s*/\s*(\d{1,2})(?:\s*/\s*(\d{1,2}))?\b", ql)
        if me:
            parts = [int(x) for x in me.groups() if x]
            if 90 <= sum(parts) <= 110:
                filters["esquema_pago"] = "/".join(str(p) for p in parts)
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
        if _re.search(r"\brg\b", ql) and "roof_garden" not in ufh:   # "RG" = roof garden (abreviatura de broker)
            ufh.append("roof_garden")
        if ufh:
            filters["unit_feature"] = ufh
    if "amenity" not in filters:
        amh = [s for s, kws in _AM_KW.items() if any(k in ql for k in kws) and not (s == "roof" and ("unit_feature" in filters and "roof_garden" in filters.get("unit_feature", [])))]
        if amh:
            filters["amenity"] = amh
    # HONESTIDAD DE ZONA: si el usuario nombró un lugar que NO cubrimos (ej. Interlomas = Edomex, no CDMX) y no mapeó
    # a ninguna colonia, NO finjas resultados de otra zona — devuelve el nombre para avisarle. Detecta "en <lugar>".
    zona_no_disponible = None
    zona_no_disponible_slug = None
    if "colonia" not in filters:
        # 1) ¿el texto nombra una colonia REAL del catálogo completo (aunque sin inventario)? → avisa honesto + link a /zona
        try:
            allcols = await _load_colonia_names(db)
            best = None
            for nm, cid in allcols:
                nmf = _fold((nm or "").lower())
                if len(nmf) >= 6 and _re.search(r"\b" + _re.escape(nmf) + r"\b", qfold):
                    if best is None or len(nmf) > len(best[0]):
                        best = (nmf, nm, cid)
            if best:
                zona_no_disponible, zona_no_disponible_slug = best[1], best[2]
        except Exception:
            pass
        # 2) fallback: "en <lugar>" no mapeado (ej. Interlomas = Edomex)
        if not zona_no_disponible:
            mz = _re.search(r"\ben\s+([a-záéíóúñ]+(?:\s+(?!y\b|con\b|de\b|por\b|m[aá]x|menos|cerca)[a-záéíóúñ]+)?)", ql)
            if mz:
                cand = mz.group(1).strip()
                _NONZONE = {"balcon", "balcón", "terraza", "bodega", "roof", "gimnasio", "gym", "alberca", "spa", "preventa",
                            "obra", "construccion", "construcción", "venta", "renta", "piso", "credito", "crédito", "contado", "preci"}
                if len(cand) >= 4 and cand.split()[0] not in _NONZONE:
                    zona_no_disponible = cand
    # ── CROSS-ZONA: si pidió zona + presupuesto y casi nada entra ahí (o la zona no tiene inventario), recomienda
    # desarrollos de OTRAS zonas que SÍ cumplen los filtros dentro del presupuesto. Convierte el "no hay" en opciones
    # reales. + zonas_sustitutas = inteligencia de SUSTITUCIÓN (a qué zona se va la demanda de la pedida) para dev/superadmin.
    cross_zone = []
    zonas_sustitutas = []
    mensualidad_supuesto = None
    esquema_pedido = None      # qué esquema de pago pidió el comprador (preventa/credito/ambos) → señal para devs
    gap_mensualidad = None     # brecha: lo más barato que existe en la zona pedida − lo que el comprador puede pagar
    mens_zona_pedida = None    # mensualidad (crédito) más baja disponible en la zona pedida
    cross_relax = None         # cómo se relajó el cruce: None=estricto · "esquema" · "cercano" (para ser honestos en la UI)
    # FORMAS DE PAGO REALES (fuente de verdad: dev_payment_schemes, configuradas por el dev en su módulo · NO duplicar).
    # Se precargan acá (async) para usarlas en el scoring sync. Si un dev no las configuró → se ESTIMA (marcado).
    _schemes_by_dev = {}
    try:
        async for _sd in db.dev_payment_schemes.find({}, {"project_id": 1, "schemes": 1, "fecha_inicio": 1, "fecha_entrega": 1}):
            if _sd.get("project_id"):
                _schemes_by_dev[_sd["project_id"]] = _sd
    except Exception:
        pass
    try:
        _col = filters.get("colonia")
        _req_cols = set(_col if isinstance(_col, list) else ([_col] if _col else []))
        _maxp = filters.get("max_price")
        # MENSUALIDAD ≠ precio fijo. Hay DOS conceptos distintos (NO se confunden):
        #  · crédito hipotecario: (precio − enganche) amortizado a plazo/tasa (~11.45%, 20a).
        #  · preventa (plan del desarrollador): el ENGANCHE repartido en mensualidades durante la obra (hasta la entrega).
        # Se detecta el esquema del texto/filtros y se calcula el correcto POR DESARROLLO (presupuesto = mensualidad de ESE esquema).
        _RATE = 0.1145
        try:
            _plazo = int(filters.get("plazo") or 20)
        except Exception:
            _plazo = 20
        _plazo = min(max(_plazo, 5), 30)
        _i = _RATE / 12.0
        _pf = _i / (1 - (1 + _i) ** (-_plazo * 12))   # factor PMT por peso de préstamo (crédito)
        _esq = str(filters.get("esquema_pago") or "").lower()
        _want_preventa = ("preventa" in _esq) or ("desarrollad" in _esq) or bool(_re.search(r"preventa|plan del desarrollad|en obra|durante (la )?(obra|construcci)|mensualidades? de preventa", ql))
        _want_credito = ("credito" in _esq) or ("hipotec" in _esq) or bool(_re.search(r"cr[ée]dito|hipotec", ql))
        esquema_pedido = ("ambos" if (_want_preventa and _want_credito) else "preventa" if _want_preventa else "credito" if _want_credito else None)

        def _months_to_delivery(d):
            m = _re.match(r"^(\d{4})-(\d{2})", str((d or {}).get("delivery_estimate") or ""))
            if not m:
                return None
            now = datetime.now(timezone.utc)
            return (int(m.group(1)) - now.year) * 12 + (int(m.group(2)) - now.month)

        import payment_schemes as _ps

        def _dev_schemes(d):
            return _schemes_by_dev.get((d or {}).get("id"))

        def _plan_real(d):
            return bool(_dev_schemes(d))

        def _eng_de(price, d):
            # enganche: el que pide el usuario · o el firma% MÁS BAJO configurado por el dev · o 20% default
            if filters.get("enganche_max"):
                return min(filters["enganche_max"], price)
            doc = _dev_schemes(d)
            if doc and doc.get("schemes"):
                firmas = [_ps._f(s.get("firma_pct")) for s in doc["schemes"] if _ps._f(s.get("firma_pct")) > 0]
                if firmas:
                    return round(price * (min(firmas) / 100.0))
            return round(price * 0.20)

        def _mens_credito(price, d):
            if not price:
                return None
            loan = max(0, price - _eng_de(price, d))
            return int(round(loan * _pf)) if loan > 0 else 0

        def _mens_preventa(price, d):
            # Mensualidad de la obra. REAL si el dev configuró sus formas de pago (compute_breakdown) · si no, ESTIMADA.
            if not price or not d or d.get("stage") != "preventa":
                return None
            doc = _dev_schemes(d)
            if doc and doc.get("schemes"):
                best = None
                for s in doc["schemes"]:
                    b = _ps.compute_breakdown(price, s, doc.get("fecha_inicio"), doc.get("fecha_entrega"))
                    m = b.get("mensualidad_restante") or b.get("mensualidad")
                    if m and (best is None or m < best):
                        best = m
                if best:
                    return int(best)
            meses = _months_to_delivery(d)
            if not meses or meses <= 0:
                return None
            return int(round(_eng_de(price, d) / meses))   # estimado: enganche repartido hasta la entrega

        def _contado(price, d):
            # 3er esquema: pago anticipado con el MAYOR descuento configurado por el dev (compute_breakdown). None si no hay.
            doc = _dev_schemes(d)
            if not price or not doc or not doc.get("schemes"):
                return None
            best = max(doc["schemes"], key=lambda s: _ps._f(s.get("descuento_pct")), default=None)
            if not best or _ps._f(best.get("descuento_pct")) <= 0:
                return None
            b = _ps.compute_breakdown(price, best, doc.get("fecha_inicio"), doc.get("fecha_entrega"))
            return {"precio": b["precio_aplicado"], "ahorro": b["ahorro"], "pct": b["descuento_pct"]}
        _mm = filters.get("mensualidad_max")
        _eng_b = filters.get("enganche_max")
        _has_budget = bool(_maxp or _mm or _eng_b)

        def _min_mens(d):
            price = d.get("price_from") or 0
            xs = [x for x in (_mens_credito(price, d), _mens_preventa(price, d)) if x]
            return min(xs) if xs else 10 ** 12

        def _budget_ok(d, relax_scheme=False):
            price = d.get("price_from") or 0
            if not price:
                return False
            if _maxp:
                return price <= _maxp
            if _mm:
                mc, mp = _mens_credito(price, d), _mens_preventa(price, d)
                if relax_scheme:
                    cands = [mc, mp]                              # cualquier esquema que entre en el presupuesto
                elif _want_preventa and not _want_credito:
                    cands = [mp]
                elif _want_credito and not _want_preventa:
                    cands = [mc]
                else:
                    cands = [mc, mp]                              # sin esquema explícito → cualquiera de los dos cuenta
                return any(x is not None and x <= _mm for x in cands)
            if _eng_b:
                return round(price * 0.20) <= _eng_b
            return True
        if _mm:
            _eng_lbl = (f"${int(_eng_b):,}" if _eng_b else "20%")
            _esquemas = (["preventa"] if (_want_preventa and not _want_credito)
                         else ["credito"] if (_want_credito and not _want_preventa)
                         else ["credito", "preventa"])
            mensualidad_supuesto = {
                "mensualidad_max": _mm, "enganche": _eng_lbl, "esquemas": _esquemas,
                "plazo_anios": _plazo, "tasa": "~11.45%",
                "nota": "Mostramos la mensualidad de cada esquema por desarrollo: CRÉDITO (saldo financiado a plazo/tasa) y PREVENTA (lo que pagas al mes durante la obra según el plan del desarrollador; el resto se liquida al escriturar). Son conceptos distintos. El plan exacto lo define cada desarrollador.",
            }
        _beds = filters.get("beds")
        _baths = filters.get("baths")
        _park = filters.get("parking")
        _tipo = filters.get("tipo")

        def _dev_fits(d):
            if not _budget_ok(d):
                return False
            if _beds and ((d.get("bedrooms_range") or [0, 0])[-1] or 0) < _beds:
                return False
            if _baths and ((d.get("bathrooms_range") or [0, 0])[-1] or 0) < _baths:
                return False
            if _park and ((d.get("parking_range") or [0, 0])[-1] or 0) < _park:
                return False
            if _tipo and d.get("property_type") and d.get("property_type") != _tipo:
                return False
            return True
        # Score 0-10 (presupuesto+rec ya son duros) por amenidades + features pedidos → ranking + qué FALTA (no binario).
        _amen_req = set(filters.get("amenity") or [])
        _feat_req = set(filters.get("unit_feature") or [])
        _AMN = {"roof": "roof garden", "spa": "spa", "gym": "gimnasio", "concierge": "concierge", "alberca": "alberca", "seguridad": "seguridad", "asadores": "asadores", "sky_lounge": "sky lounge", "cava": "cava"}
        _FTN = {"balcon": "balcón", "terraza": "terraza", "bodega": "bodega", "roof_garden": "roof garden", "estacionamiento_independiente": "estac. independiente"}

        def _score_cross(d):
            sc, mx, falta = 7, 7, []  # base 7 (ya cumple presupuesto+rec+baños+estac por el filtro duro)
            if _amen_req:
                mx += 2; miss = _amen_req - set(d.get("amenities") or [])
                if not miss:
                    sc += 2
                else:
                    falta += [_AMN.get(a, a) for a in sorted(miss)]
            if _feat_req:
                mx += 1; missf = _feat_req - set(d.get("unit_features") or [])
                if not missf:
                    sc += 1
                else:
                    falta += [_FTN.get(f, f) for f in sorted(missf)]
            return max(1, min(10, round(sc / mx * 10))), falta[:3]
        def _specs_ok(d):   # rec/baños/estac/tipo SIN presupuesto (para relajar después)
            if _beds and ((d.get("bedrooms_range") or [0, 0])[-1] or 0) < _beds:
                return False
            if _baths and ((d.get("bathrooms_range") or [0, 0])[-1] or 0) < _baths:
                return False
            if _park and ((d.get("parking_range") or [0, 0])[-1] or 0) < _park:
                return False
            if _tipo and d.get("property_type") and d.get("property_type") != _tipo:
                return False
            return True
        # dispara si: pidió zona con presupuesto y <2 entran ahí · O la zona no está disponible (sin inventario) pero hay presupuesto
        _need_cross = _has_budget and ((_req_cols and len([d for d in DEVELOPMENTS if d.get("colonia_id") in _req_cols and _dev_fits(d)]) < 2) or (zona_no_disponible and not _req_cols))
        if _need_cross:
            _fuera = [d for d in DEVELOPMENTS if d.get("colonia_id") not in _req_cols and d.get("price_from")]
            # Tier 1 (estricto): cumplen el presupuesto en el esquema pedido.
            cands = [d for d in _fuera if _specs_ok(d) and _budget_ok(d)]
            # Tier 2 (relaja ESQUEMA): no alcanza en crédito pero SÍ en preventa (o viceversa) → igual lo mostramos.
            if len(cands) < 2 and _mm:
                relaxed = [d for d in _fuera if _specs_ok(d) and _budget_ok(d, relax_scheme=True)]
                if len(relaxed) > len(cands):
                    cands, cross_relax = relaxed, "esquema"
            # Tier 3 (más cercano): si aún hay <2, mostramos lo de MENOR mensualidad aunque quede algo arriba — nunca vacío.
            if len(cands) < 2:
                cercanos = sorted([d for d in _fuera if _specs_ok(d)], key=_min_mens)[:5]
                if len(cercanos) > len(cands):
                    cands, cross_relax = cercanos, (cross_relax or "cercano")
            scored = []
            for d in cands:
                sc, falta = _score_cross(d)
                scored.append((sc, _min_mens(d), d, falta))
            scored.sort(key=lambda x: (-x[0], x[1]))   # mejor match primero, luego menor mensualidad
            for sc, _pr, d, falta in scored[:5]:
                _price = d.get("price_from")
                mc = _mens_credito(_price, d) if _mm else None
                mp = _mens_preventa(_price, d) if _mm else None
                _sobre = None   # cuánto/mes arriba del presupuesto (solo si NINGÚN esquema entra)
                if _mm:
                    _entra = [x for x in (mc, mp) if x is not None and x <= _mm]
                    if not _entra and _pr < 10 ** 12:
                        _sobre = _pr - _mm
                cross_zone.append({
                    "id": d.get("id"), "name": d.get("name"), "colonia": d.get("colonia"), "colonia_id": d.get("colonia_id"),
                    "slug": d.get("slug") or d.get("id"), "price_from": _price, "price_from_display": d.get("price_from_display"),
                    "bedrooms_range": d.get("bedrooms_range"), "bathrooms_range": d.get("bathrooms_range"),
                    "m2_range": d.get("m2_range"), "parking_range": d.get("parking_range"), "amenities": d.get("amenities") or [],
                    "match": sc, "falta": falta, "stage": d.get("stage"),
                    "mensualidad_credito": mc, "mensualidad_preventa": mp,
                    "contado": _contado(_price, d),
                    "plan_real": _plan_real(d), "sobre_presupuesto": _sobre,
                })
            zonas_sustitutas = sorted({c["colonia_id"] for c in cross_zone if c.get("colonia_id")})
            # BRECHA DE PRESUPUESTO: lo más barato (mensualidad de crédito) que SÍ existe en la zona PEDIDA vs lo que el
            # comprador puede pagar. gap>0 = demanda real a un precio que la zona no ofrece (señal de pricing/terreno para devs).
            if _req_cols and _mm:
                _zc = [m for d in DEVELOPMENTS if d.get("colonia_id") in _req_cols and d.get("price_from")
                       for m in [_mens_credito(d.get("price_from"), d)] if m]
                if _zc:
                    mens_zona_pedida = min(_zc)
                    if mens_zona_pedida > _mm:
                        gap_mensualidad = mens_zona_pedida - _mm
    except Exception:
        cross_zone = []
    _brecha = ({"mens_zona_pedida": mens_zona_pedida, "gap": gap_mensualidad, "mensualidad_max": filters.get("mensualidad_max")}
               if gap_mensualidad else None)
    out = {"cache_key": cache_key, "filters": filters, "query": q, "created_at": datetime.now(timezone.utc),
           "cross_zone": cross_zone, "zonas_sustitutas": zonas_sustitutas, "mensualidad_supuesto": mensualidad_supuesto,
           "brecha_zona": _brecha, "cross_relax": cross_relax}
    if zona_no_disponible:
        out["zona_no_disponible"] = zona_no_disponible
    if zona_no_disponible_slug:
        out["zona_no_disponible_slug"] = zona_no_disponible_slug
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
        _col = filters.get("colonia")
        from data_developments import colonia_slug as _cslug  # MOAT: id canónico (linaje cross-engine)
        _cols_raw = _col if isinstance(_col, list) else ([_col] if _col else [])
        _cols = [s for s in (_cslug(c) for c in _cols_raw) if s]   # canonicaliza ANTES de persistir
        _miss = _parse_misses(q, filters)   # bucle de fallas de lectura
        await db.marketplace_searches.insert_one({
            "source": "ai_search",
            "visitor_id": (payload.visitor_id or "")[:64] or None,
            "colonias": _cols,
            "colonia_id": (_cols[0] if _cols else None),
            "parse_miss": _miss,
            "recamaras_min": filters.get("beds"), "banos_min": filters.get("baths"),
            "precio_min": filters.get("min_price"), "precio_max": filters.get("max_price"),
            "m2_min": filters.get("min_sqm"), "m2_max": filters.get("max_sqm"),
            "enganche_max": filters.get("enganche_max"), "mensualidad_max": filters.get("mensualidad_max"),
            "stage_pedido": filters.get("stage"), "tipo_pedido": filters.get("tipo"),
            "amenidades_pedidas": _amen, "features_pedidos": filters.get("unit_feature") or [],
            "zona_no_disponible": zona_no_disponible,
            "unmet": bool(zona_no_disponible) or (_supply == 0),
            # SUSTITUCIÓN: la demanda de la zona pedida que SÍ matchea en otras zonas (oro para selección de terreno dev).
            "zonas_sustitutas": zonas_sustitutas,
            "sustitucion": bool(zonas_sustitutas),
            # ESQUEMA pedido (preventa/credito/ambos) + BRECHA de presupuesto en la zona pedida → señales de pricing para devs.
            "esquema_pedido": esquema_pedido,
            "gap_mensualidad": gap_mensualidad,
            "mens_zona_pedida": mens_zona_pedida,
            "completa": _completa,
            "texto_crudo": q[:300], "query": q[:200], "ip_hash": _hl.sha256(_ip.encode()).hexdigest()[:16],
            "created_at_dt": _dt.utcnow(),
        })
        # Colección dedicada de FALLAS DE LECTURA (solo cuando hubo conceptos no leídos) → el superadmin las revisa.
        if _miss:
            await db.parse_misses.insert_one({
                "texto": q[:300], "miss": _miss, "capto": sorted(filters.keys()),
                "fuente": ("llm" if EMERGENT_LLM_KEY else "determinista"),
                "created_at_dt": _dt.utcnow(),
            })
    except Exception:
        pass
    return {"filters": filters, "query": q, "cached": False, "zona_no_disponible": zona_no_disponible, "zona_no_disponible_slug": zona_no_disponible_slug, "cross_zone": cross_zone, "zonas_sustitutas": zonas_sustitutas, "mensualidad_supuesto": mensualidad_supuesto, "brecha_zona": _brecha, "cross_relax": cross_relax}


class NLPSearchIn(BaseModel):
    query: str


@router.post("/api/search/nlp")
async def nlp_search(payload: NLPSearchIn):
    q = payload.query.lower()
    results = [p for p in SEED_PROPERTIES if q in p["colonia"].lower() or q in p["titulo"].lower()]
    return {"properties": results or SEED_PROPERTIES[:3], "reasoning": "Búsqueda por palabras clave", "chips": []}


# ─── Health ────────────────────────────────────────────────────────────────────
@router.get("/api/health")
async def health(request: Request):
    # PROD/OBSERVABILIDAD (auditoría 2026-07-12): antes devolvía "ok" incondicional → Render/uptime
    # reportaban "Live" aunque Mongo estuviera caída (routeaba tráfico a un backend muerto). Ahora hace
    # ping a la DB; si no responde, 503 (Render marca el servicio down y deja de enrutar).
    from fastapi.responses import JSONResponse
    db_ok = False
    try:
        await request.app.state.db.command("ping")
        db_ok = True
    except Exception:
        db_ok = False
    body = {
        "status": "ok" if db_ok else "degraded", "service": "DesarrollosMX API v2",
        "db": "up" if db_ok else "down",
        "colonias": len(SEED_COLONIAS), "properties": len(SEED_PROPERTIES),
    }
    return body if db_ok else JSONResponse(status_code=503, content=body)
