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


def _norm_stage(s, delivery=None):
    """Solo 2 etapas de cara al comprador: PREVENTA o ENTREGA INMEDIATA. Clasifica por la FECHA de entrega (no solo
    la etiqueta): si la entrega ya llegó (fecha pasada o este mes) = ENTREGA INMEDIATA; si falta, = PREVENTA. Así
    nunca sale el contradictorio 'preventa · entrega ya'."""
    if str(s or "").lower() in ("entrega_inmediata", "entregado", "lista", "listo"):
        return "entrega_inmediata"
    if delivery:
        import re as _re
        from datetime import datetime as _dt
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
        return {"ok": True, "busquedas_7d": last7, "trend_pct": trend,
                "nivel": "alta" if last7 >= 10 else "media" if last7 >= 3 else "baja",
                "rec_moda": (_C(recs).most_common(1)[0][0] if recs else None),
                "precio_buscado_prom": (round(sum(precios) / len(precios)) if precios else None),
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
        out = {"ok": True, "n_desarrollos": len(devs)}
        if precios:
            out["precio_prom"] = round(sum(precios) / len(precios))
            out["precio_min"] = min(precios)
            out["precio_max"] = max(precios)
        pm2s = [d["price_from"] / ((d.get("m2_range") or [0])[0]) for d in devs
                if d.get("price_from") and (d.get("m2_range") or [0])[0]]
        if pm2s:
            out["precio_m2"] = round(sum(pm2s) / len(pm2s))
        rep = out.get("precio_prom") or (out.get("precio_m2", 50000) * 80)
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
                    dem_alerta = await db.marketplace_searches.count_documents({"colonias": colonia_id, "alert": True})
                    out["demanda_zona"] = {"busquedas": int(dem), "con_alerta": int(dem_alerta)}
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
            {"zone_id": colonia_id}, {"_id": 0, "places": 1, "source": 1})
        if not (d and d.get("places")):
            return {"ok": True, "lugares": {}}
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
            zid = body.get("zone_id")
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
                "zone_id": body.get("zone_id"), "precio": inp.get("valor_propiedad"),
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
        return {"ok": False, "error": str(e)[:200]}


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
        out["riesgo"] = {
            "flood_risk": cs.get("flood_risk"), "sismic_score": nrl.get("sismic_score"),
            "subsidence": nrl.get("subsidence_cm_yr") or nrl.get("subsidence"),
            "drivers": cs.get("top_drivers"), "completeness": cs.get("data_completeness_pct"),
            "tiene_datos": bool(nrl) or (cs.get("data_completeness_pct") or 0) > 0,
        }
    except Exception as e:
        out["riesgo"] = {"error": str(e)[:120]}
    return out


@router.post("/api/inversion-v4/airroi")
async def inversion_v4_airroi(request: Request):
    """Trae renta corta REAL de AirROI para una zona (ADR, ocupación, revenue). AirROI COBRA por llamada, así que
    cacheamos por zona (TTL 30 días) y solo pegamos a la API en refresh explícito (este endpoint, por botón). Devuelve
    la tarifa/noche ya convertida a MXN con el FIX vivo. Reusa el conector real connectors_ie.AirRoiConnector."""
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
):
    results = list(DEVELOPMENTS)
    if colonia:
        cset = {c.lower() for c in colonia}
        results = [d for d in results if d["colonia_id"].lower() in cset]
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
        cset = {c.lower() for c in colonia}
        # La ZONA es sagrada: si el cliente pidió una zona, los "casi" se quedan en esa zona (nunca cruzamos a otra
        # que NO pidió). Si no hay nada en su zona, devuelve vacío — honesto.
        pool = [d for d in pool if d["colonia_id"].lower() in cset]
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
    # CIERRA CICLO comprador → desarrollador: una búsqueda COMPLETA en zona que SÍ cubrimos pero donde NADA cumple
    # todo = HUECO DE PRODUCTO exacto. Lo captamos (dedup por visitor+criterios+día, no infla por re-render) para que
    # el dev/superadmin vea "X personas buscaron esto exacto en tu zona y no hay nada". Fire-and-forget.
    if colonia:
        try:
            from services.ratelimit import allow, client_ip
            if not allow("demanda_insatisf", client_ip(request), 30):
                return {"casi": out}   # rate-limit: no dejes que un bot (rotando visitor_id) envenene el cubo
            from collections import Counter as _C
            import json as _json, hashlib as _hl
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
    out["stage"] = _norm_stage(out.get("stage"), out.get("delivery_estimate"))   # por fecha de entrega real
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


_AI_RATE: Dict[str, list] = {}
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
        _col = filters.get("colonia")
        _cols = _col if isinstance(_col, list) else ([_col] if _col else [])
        _miss = _parse_misses(q, filters)   # bucle de fallas de lectura
        await db.marketplace_searches.insert_one({
            "source": "ai_search",
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
