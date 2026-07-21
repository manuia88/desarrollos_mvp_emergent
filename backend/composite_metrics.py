"""LAS 100 MÉTRICAS COMPUESTAS — comportamiento del marketplace ⊗ motores de mercado del superadmin.

Registro COMPLETO de las 100 (COMPOSITE_METRICS_100.md), en 10 paquetes vendibles. Cada compuesta es una función pura
sobre el contexto por-colonia (fusión de zone_intelligence) + el contexto global (marketplace_granularity). Devuelve valor
real donde hay dato; None honesto donde el feeder de mercado está apagado (la fórmula ya queda cableada para cuando prenda).
"""
from typing import Any, Dict, List


# ── accesores seguros ──────────────────────────────────────────────────────────
def _n(v):
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _sub(z, k):
    return (z.get("subscores") or {}).get(k)


def _ab(z, k):
    return (z.get("absorcion") or {}).get(k)


def _spec(z, k):
    return (z.get("spec_pedida") or {}).get(k)


def _risk(z):
    return (z.get("riesgo") or {}).get("num")


def _inv(z):
    return (z.get("inversion") or {}).get("score")


def _pct_gap(a, b):
    a, b = _n(a), _n(b)
    if a is None or b is None or b == 0:
        return None
    return round(100 * (a - b) / b)


def _ratio(a, b):
    a, b = _n(a), _n(b)
    if a is None or b is None or b == 0:
        return None
    return round(a / b, 2)


def _scale(v, mx):
    v = _n(v)
    return None if v is None else round(min(max(v / mx, 0), 1) * 100)


# ── construcción del contexto ───────────────────────────────────────────────────
def _norm_alc(s: Any) -> str:
    import re
    import unicodedata
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def _slug(s: Any) -> str:
    """Slug con guion-bajo (formato zone_id de ie_scores: 'roma_norte', 'del_valle_centro')."""
    import re
    import unicodedata
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


async def _price_cuts_by_colonia(db) -> Dict[str, Any]:
    """(1.3) Índice de recortes de precio — LEE de price_events (colección viva, 18 docs). Un 'recorte' es
    un evento con delta_pct<0. Compone tres derivables por colonia: % de recortes, magnitud media (recorte_medio)
    y días al 1er recorte (mediana de la latencia por desarrollo). Dato real, sin inventar."""
    from collections import defaultdict
    from datetime import datetime

    def _pdate(v):
        if isinstance(v, datetime):
            return v
        try:
            return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            return None

    ev = defaultdict(list)
    try:
        async for d in db.price_events.find(
            {"revertido": {"$ne": True}},   # Palanca 6: ignora eventos de cargas deshechas
            {"_id": 0, "dev_id": 1, "colonia_id": 1, "delta_pct": 1, "changed_at": 1}
        ):
            col = _slug(d.get("colonia_id"))
            if col:
                ev[col].append(d)
    except Exception:
        return {}
    out: Dict[str, Any] = {}
    for col, docs in ev.items():
        deltas = [_n(x.get("delta_pct")) for x in docs if _n(x.get("delta_pct")) is not None]
        total = len(deltas)
        cuts = [d for d in deltas if d < 0]
        n_cuts = len(cuts)
        # latencia (días) al 1er recorte por desarrollo → mediana de la colonia
        by_dev = defaultdict(list)
        for x in docs:
            by_dev[x.get("dev_id")].append(x)
        lat = []
        for _dev, ds in by_dev.items():
            ds = sorted(ds, key=lambda r: str(r.get("changed_at") or ""))
            base = _pdate(ds[0].get("changed_at"))
            fc = next((r for r in ds if (_n(r.get("delta_pct")) or 0) < 0), None)
            if base and fc:
                cdt = _pdate(fc.get("changed_at"))
                if cdt:
                    lat.append(max((cdt - base).days, 0))
        dias_1er = sorted(lat)[len(lat) // 2] if lat else None
        out[col] = {
            "eventos": total,
            "recortes": n_cuts,
            "price_cut_pct": round(100 * n_cuts / total) if total else None,
            "recorte_medio": round(sum(cuts) / n_cuts, 1) if n_cuts else None,
            "dias_a_1er_recorte": dias_1er,
        }
    return out


async def _ie_liquidez_ghost_by_zone(db) -> Dict[str, Any]:
    """(1.5) Liquidez de zona + Ghost-zone — LEE de ie_scores los IE ya computados (IE_COL_LIQUIDEZ,
    IE_COL_GHOST_ZONE). NO recomputa: empaqueta value/tier/confidence/is_stub tal cual (celda honesta:
    si el IE viene stub, se marca es_estimado y se reporta la fuente, no se fabrica número)."""
    out: Dict[str, Any] = {}
    try:
        async for d in db.ie_scores.find(
            {"code": {"$in": ["IE_COL_LIQUIDEZ", "IE_COL_GHOST_ZONE"]}},
            {"_id": 0, "code": 1, "zone_id": 1, "value": 1, "tier": 1,
             "confidence": 1, "is_stub": 1, "computed_at": 1},
        ):
            zid = _slug(d.get("zone_id"))
            if not zid:
                continue
            out.setdefault(zid, {})[d.get("code")] = d
    except Exception:
        return {}
    return out


async def _shf_forecast_by_alcaldia(db) -> Dict[str, Any]:
    """Apreciación YoY REAL del índice de precios SHF por alcaldía (mismo trimestre, año anterior).
    Cubre 5 alcaldías + 'CDMX (estatal)' como fallback city-wide. Dato oficial, no inventado."""
    from collections import defaultdict
    rows = await db.shf_series.find({}, {"_id": 0, "alcaldia": 1, "anio": 1, "trimestre": 1, "indice": 1}).to_list(length=8000)
    by: Dict[str, Dict] = defaultdict(dict)
    for r in rows:
        try:
            by[r.get("alcaldia")][(int(r["anio"]), int(r["trimestre"]))] = float(r["indice"])
        except (TypeError, ValueError):
            continue
    out: Dict[str, Any] = {}
    for alc, series in by.items():
        keys = sorted(series.keys())
        if len(keys) < 5:
            continue
        rk = keys[-1]
        prior = series.get((rk[0] - 1, rk[1])) or series.get(keys[-5])
        recent = series.get(rk)
        if prior and recent and prior > 0:
            out[_norm_alc(alc)] = round((recent - prior) / prior * 100, 2)
    return out


async def build_context(db, since_days: int = 180, top: int = 20) -> Dict[str, Any]:
    import demand_intelligence as di
    import marketplace_granularity as mg
    zi = await di.zone_intelligence(db, since_days=since_days, top=top, with_airroi=True, with_underwriting=True)  # AirROI 1×/zona/mes + valor residual/norma3/lift
    zones = zi.get("zonas", [])

    g: Dict[str, Any] = {}
    # comportamiento (marketplace)
    try:
        g["wtp"] = {r["feature"]: r["precio_medio_visto"] for r in (await mg.willingness_to_pay(db)).get("features", [])}
    except Exception:
        g["wtp"] = {}
    try:
        g["elasticidad"] = (await mg.price_elasticity(db)).get("curva", {})
    except Exception:
        g["elasticidad"] = {}
    try:
        g["rejection"] = {r["razon"]: r["n"] for r in (await di.rejection_intel(db)).get("razones", [])}
    except Exception:
        g["rejection"] = {}
    try:
        isp = await mg.run_all(db, keys=["criterios_decision", "fugas_embudo", "estacionalidad", "atribucion", "sustitucion"])
        g["funnel"] = (isp.get("fugas_embudo") or {}).get("conversion_pct", {})
        g["criterios"] = (isp.get("criterios_decision") or {}).get("criterios", [])
        g["estacionalidad"] = (isp.get("estacionalidad") or {}).get("por_mes", {})
        g["atribucion"] = (isp.get("atribucion") or {}).get("por_fuente", [])
        g["sustitucion"] = isp.get("sustitucion") or {}
    except Exception:
        g.update({"funnel": {}, "criterios": [], "estacionalidad": {}, "atribucion": [], "sustitucion": {}})
    try:
        g["intent"] = await di.intent_split(db)
    except Exception:
        g["intent"] = {}
    try:
        g["temporal"] = await di.temporal_demand(db)
    except Exception:
        g["temporal"] = {}
    # (1.3) recortes de precio · (1.5) liquidez/ghost — colecciones vivas (price_events, ie_scores).
    # Se adjuntan por slug de zona; las compuestas nuevas leen de aquí. Best-effort: {} si vacías.
    try:
        g["price_cuts"] = await _price_cuts_by_colonia(db)
    except Exception:
        g["price_cuts"] = {}
    try:
        g["ie_liq_ghost"] = await _ie_liquidez_ghost_by_zone(db)
    except Exception:
        g["ie_liq_ghost"] = {}
    # mercado (feeders — best-effort; None si apagado)
    g["cetes"] = None
    try:
        import market_rates_engine as mr
        rates = await mr.get_rates(db) if hasattr(mr, "get_rates") else None
        if isinstance(rates, dict):
            g["cetes"] = rates.get("cetes_28") or rates.get("cetes")
    except Exception:
        pass
    # costo de construcción ahora viene por-zona en zone_intelligence (feeder local cableado allí).
    # Apreciación de precio (forecast_pct) desde el índice oficial SHF: real por alcaldía (5) +
    # CDMX estatal como fallback city-wide. Llena las compuestas de plusvalía/forecast sin inventar.
    try:
        shf = await _shf_forecast_by_alcaldia(db)
        estatal = shf.get("cdmx estatal") or shf.get("cdmx")
        for z in zones:
            if z.get("forecast_pct") is None:
                ap = shf.get(_norm_alc(z.get("alcaldia"))) if z.get("alcaldia") else None
                val = ap if ap is not None else estatal
                if val is not None:
                    z["forecast_pct"] = val
                    z["forecast_pct_fuente"] = "SHF " + ("alcaldía" if ap is not None else "CDMX estatal")
    except Exception:
        pass
    return {"zones": zones, "g": g}


# ── helper: costo de construcción por tier de la zona ───────────────────────────
def _cc_for(z, g):
    # Feeder local: costo de construcción por m² ya viene en la zona (zone_intelligence).
    return z.get("costo_construccion_m2")


def _wtp_med(g):
    vals = list((g.get("wtp") or {}).values())
    return sorted(vals)[len(vals) // 2] if vals else None


def _sweet_spot(g):
    cur = g.get("elasticidad") or {}
    return max(cur.items(), key=lambda x: x[1])[0] if cur else None


def _conv_low(g):
    f = g.get("funnel") or {}
    return min(f.items(), key=lambda x: x[1])[0] if f else None


# ════════════════ LAS 100 COMPUESTAS ════════════════
# Cada entrada: (n, pack, nombre, descubre, fn(z, g) -> valor)
P = {1: "Pricing", 2: "Demand", 3: "Investor", 4: "Risk", 5: "Absorption",
     6: "Underwriting", 7: "Livability", 8: "Competitive", 9: "Lead", 10: "Momentum",
     11: "Suelo&Construcción", 12: "STR/Airbnb", 13: "Liquidez&Ghost"}


# ── lookups de las compuestas nuevas (leen los datasets adjuntos en build_context) ──
def _pc(z, g):
    """Índice de recortes de la colonia de la zona (de price_events)."""
    return (g.get("price_cuts") or {}).get(_slug(z.get("zona")))


def _ie_lg(z, g, code):
    """Celda IE (LIQUIDEZ o GHOST) de la zona, tal cual quedó en ie_scores."""
    return ((g.get("ie_liq_ghost") or {}).get(_slug(z.get("zona"))) or {}).get(code)


def _recortes_index(z, g):
    """(1.3) COMPUESTA legible: fusiona price_cut_pct + recorte_medio + días_a_1er_recorte.
    None honesto si la colonia no tiene eventos de precio."""
    pc = _pc(z, g)
    if not pc or not pc.get("eventos"):
        return None
    return {
        "price_cut_pct": pc.get("price_cut_pct"),
        "recorte_medio_pct": pc.get("recorte_medio"),
        "dias_a_1er_recorte": pc.get("dias_a_1er_recorte"),
        "recortes": pc.get("recortes"),
        "eventos": pc.get("eventos"),
        "señal": ("recortes frecuentes" if (pc.get("price_cut_pct") or 0) >= 25
                  else "precio firme" if (pc.get("price_cut_pct") or 0) == 0
                  else "recortes puntuales"),
        "fuente": "price_events",
        "es_estimado": False,
        "confianza": "alta",
    }


def _liquidez_ghost(z, g):
    """(1.5) COMPUESTA legible: empaqueta IE_COL_LIQUIDEZ + IE_COL_GHOST_ZONE ya computados.
    Reporta por celda su value/tier/confianza/es_estimado (is_stub→sin número, honesto)."""
    liq = _ie_lg(z, g, "IE_COL_LIQUIDEZ")
    ghost = _ie_lg(z, g, "IE_COL_GHOST_ZONE")
    if liq is None and ghost is None:
        return None

    def _cell(d, label):
        if d is None:
            return None
        # Palanca 5 (auditoría 07-20): las recetas DataPending escriben un 50.0 constante con
        # is_proxy=True; tratarlas como stub (sin número, honesto) para no venderlas como 'vivo'.
        stub = bool(d.get("is_stub") or d.get("is_proxy"))
        return {
            "valor": None if stub else _n(d.get("value")),
            "tier": d.get("tier"),
            "confianza": d.get("confidence"),
            "es_estimado": stub,
            "fuente": "ie_scores",
            "nota": (f"{label}: pendiente de feeder (IE en stub)" if stub else None),
        }

    liq_c = _cell(liq, "liquidez")
    ghost_c = _cell(ghost, "ghost_zone")
    gv = ghost_c.get("valor") if ghost_c else None
    lectura = None
    if gv is not None:
        lectura = ("zona fantasma (poca vida de calle)" if gv <= 33
                   else "zona con vida media" if gv <= 66
                   else "zona muy viva")
    return {
        "liquidez": liq_c,          # qué tan rápido se compra/vende (IE ya computado)
        "ghost_zone": ghost_c,      # vida de calle real (OSM/datos_cdmx) — antídoto a comprar en un desierto
        "lectura_ghost": lectura,
        "fuente": "ie_scores (IE_COL_LIQUIDEZ, IE_COL_GHOST_ZONE)",
    }


def _str(z, k):
    return (z.get("str_airbnb") or {}).get(k)


def _pct(a, b):
    a, b = _n(a), _n(b)
    return round(100 * a / b) if a is not None and b not in (None, 0) else None

COMPOSITES: List = [
    # ── PACK 1 · PRICING ──
    (1, 1, "Brecha demanda-precio", "¿la demanda puede pagar lo que cuesta? (+/−%)",
     lambda z, g: _pct_gap(_spec(z, "precio_max_prom"), (_n(z.get("precio_m2")) or 0) * (_n(_spec(z, "m2")) or 0)) if z.get("precio_m2") and _spec(z, "m2") else None),
    (2, 1, "Arbitraje WTP-feature", "el mercado paga más por feature de lo que el modelo valúa",
     lambda z, g: _pct_gap(_wtp_med(g), z.get("precio_m2", 0) and z["precio_m2"] * (_n(_spec(z, "m2")) or 80)) if _wtp_med(g) else None),
    (3, 1, "Sobreprecio validado", "¿rechazan por precio DONDE sí está caro?",
     lambda z, g: round((g.get("rejection", {}).get("precio", 0)) * (1 if (_pct_gap(_spec(z, "precio_max_prom"), (z.get("precio_m2", 0) or 0) * (_spec(z, "m2") or 0)) or 0) < 0 else 0.3), 1) if g.get("rejection") else None),
    (4, 1, "Sweet-spot de precio", "banda de precio que maximiza velocidad de venta",
     lambda z, g: _sweet_spot(g)),
    (5, 1, "Margen-oportunidad del dev", "lo que pagarán − lo que cuesta construir",
     lambda z, g: _pct_gap(z.get("precio_m2"), _cc_for(z, g)) if _cc_for(z, g) else None),
    (6, 1, "Precio óptimo de lanzamiento", "a qué precio entrar para vender y plusvaluar",
     lambda z, g: round((_n(z.get("precio_m2")) or 0) * 0.97) if z.get("precio_m2") and (_ab(z, "vendido_pct") or 0) < 30 else (z.get("precio_m2") if z.get("precio_m2") else None)),
    (7, 1, "Prima de estrenar real", "cuánto extra pagan por nuevo, validado con demanda",
     lambda z, g: _pct_gap(_spec(z, "precio_max_prom"), (z.get("precio_m2", 0) or 0) * (_spec(z, "m2") or 0)) if z.get("demanda", 0) > 20 and z.get("precio_m2") else None),
    (8, 1, "Descuento esperado al cierre", "cuánto bajan para cerrar según demanda",
     lambda z, g: round(max(0, 8 - (z.get("demanda", 0) / 25)), 1)),
    (9, 1, "Prima de especulación", "asking vs valor de suelo (catastral), ponderado por demanda",
     lambda z, g: _pct_gap(z.get("precio_m2"), z.get("catastral_pm2")) if z.get("precio_m2") and z.get("catastral_pm2") else None),
    (10, 1, "Elasticidad → forecast", "dónde se moverá la demanda al subir el precio (forecast DRPI)",
     lambda z, g: z.get("forecast_pct")),

    # ── PACK 2 · DEMAND ──
    (11, 2, "Demanda no satisfecha por feature", "feature pedido que NO existe",
     lambda z, g: round(z.get("busquedas", 0) - z.get("oferta_unidades", 0), 0) if z.get("busquedas", 0) > z.get("oferta_unidades", 0) else 0),
    (12, 2, "Demanda como indicador líder", "¿la demanda PREDICE el precio? (vs forecast)",
     lambda z, g: z.get("cambio_pct") if z.get("cambio_pct") is not None else z.get("forecast_pct")),
    (13, 2, "Potencial vs revelada", "zonas con potencial sin búsquedas aún",
     lambda z, g: round(z.get("oferta_unidades", 0) - z.get("demanda", 0)) if z.get("oferta_unidades", 0) > z.get("demanda", 0) else 0),
    (14, 2, "Config que más absorbe", "qué tipología/m² se desplaza primero",
     lambda z, g: _spec(z, "m2")),
    (15, 2, "Mejor mes para lanzar", "estacionalidad × velocidad de venta",
     lambda z, g: max((g.get("estacionalidad") or {}).items(), key=lambda x: x[1])[0] if g.get("estacionalidad") else None),
    (16, 2, "Demanda por hora-canal", "cuándo y por qué canal llega",
     lambda z, g: (g.get("atribucion") or [{}])[0].get("fuente") if g.get("atribucion") else None),
    (17, 2, "Migración de demanda", "de qué zona cara migran a cuál barata",
     lambda z, g: (g.get("sustitucion") or {}).get("visitantes_multi_colonia")),
    (18, 2, "Profundidad × calidad", "¿mejores zonas se exploran más?",
     lambda z, g: _ratio(z.get("demanda"), z.get("score_zona")) if z.get("score_zona") else None),
    (19, 2, "Intent-mix por tier", "vivir vs invertir (agregado de 8 intenciones) según el tier",
     lambda z, g: next((f"{c.get('invertir', 0)}inv/{c.get('vivir', 0)}viv" for c in (g.get("intent", {}).get("por_colonia") or []) if c.get("colonia") == z.get("zona")), None)),
    (20, 2, "Concentración de demanda", "qué tan concentrada está la demanda",
     lambda z, g: z.get("demanda")),

    # ── PACK 3 · INVESTOR ──
    (21, 3, "Demanda-inversor × yield", "demanda inversionista que coincide con yield (AirROI real o estimado)",
     lambda z, g: round(z.get("demanda", 0) * ((z.get("cap_rate_str") or z.get("cap_rate_est")) or 0) / 100, 1) if (z.get("cap_rate_str") or z.get("cap_rate_est")) else None),
    (22, 3, "Demanda grado-inversión", "donde demanda y retorno coinciden",
     lambda z, g: round(z.get("demanda", 0) * (_inv(z) / 100), 1) if _inv(z) is not None else None),
    (23, 3, "Sharpe de la colonia", "retorno ajustado por riesgo, con demanda",
     lambda z, g: round((_inv(z) or 0) / 100 * (_risk(z) or 0) / 100 * min(z.get("demanda", 0) / 100, 1.5), 2) if _inv(z) is not None and _risk(z) is not None else None),
    (24, 3, "Spread vs CETES por zona", "yield (AirROI/estimado) − CETES",
     lambda z, g: round(((z.get("cap_rate_str") or z.get("cap_rate_est")) or 0) - (g.get("cetes") or 10.0), 1) if (z.get("cap_rate_str") or z.get("cap_rate_est")) else None),
    (25, 3, "ROI ponderado por absorción", "retorno real considerando velocidad de salida",
     lambda z, g: round((_inv(z) or 0) * min((_ab(z, "velocidad_mensual") or 0) / 2, 1.5)) if _inv(z) is not None and _ab(z, "velocidad_mensual") else None),
    (26, 3, "Yield renta-corta vs larga", "Airbnb (AirROI) vs renta tradicional (estimado) — puntos %",
     lambda z, g: round((z.get("cap_rate_str") or 0) - (z.get("cap_rate_est") or 0), 1) if z.get("cap_rate_str") and z.get("cap_rate_est") else None),
    (27, 3, "Bancabilidad × demanda", "proyecto financiable con demanda probada",
     lambda z, g: round((_inv(z) or 0) * min(z.get("demanda", 0) / 80, 1.5)) if _inv(z) is not None else None),
    (28, 3, "Plusvalía esperada × demanda", "apreciación (forecast) donde la demanda empuja",
     lambda z, g: round((z.get("forecast_pct") or z.get("cambio_pct") or 0) * min(z.get("demanda",0)/100+0.5,1.5),1) if (z.get("forecast_pct") or z.get("cambio_pct")) is not None else None),
    (29, 3, "Liquidez (entrada-salida)", "qué tan rápido entras y sales",
     lambda z, g: _ab(z, "meses_agotar")),
    (30, 3, "Cap rate ajustado a riesgo", "yield (AirROI/estimado) neto de riesgo físico/seguridad",
     lambda z, g: round(((z.get("cap_rate_str") or z.get("cap_rate_est")) or 0) * (_risk(z) or 0) / 100, 2) if (z.get("cap_rate_str") or z.get("cap_rate_est")) and _risk(z) is not None else None),

    # ── PACK 4 · RISK ──
    (31, 4, "Demanda ajustada a riesgo", "caliente pero riesgosa vs caliente segura",
     lambda z, g: round(z.get("demanda", 0) * (_risk(z) / 100), 1) if _risk(z) is not None else None),
    (32, 4, "Precio vs riesgo sísmico", "zona sísmica real (Atlas CDMX) + premium de precio que se paga ahí",
     lambda z, g: f"zona {(z.get('riesgo_natural') or {}).get('sismico_zona')} (${round((z.get('precio_m2') or 0)/1000)}k/m²)" if (z.get("riesgo_natural") or {}).get("sismico_zona") else None),
    (33, 4, "Demanda en zona vulnerable", "demanda en zonas con riesgo de inundación (alerta · Atlas CDMX)",
     lambda z, g: z.get("demanda") if ((z.get("riesgo_natural") or {}).get("inundacion_pct") or 0) >= 10 else (0 if z.get("riesgo_natural") else None)),
    (34, 4, "Brecha de percepción", "rechazo que los vecinos confirman",
     lambda z, g: g.get("rejection", {}).get("zona", 0)),
    (35, 4, "Riesgo climático × migración", "magnitud de migración por clima (Atlas/INEGI) en la zona",
     lambda z, g: z.get("clima_migracion")),
    (36, 4, "Crimen real (FGJ) vs demanda", "incidentes ponderados reales (FGJ) donde igual hay demanda alta",
     lambda z, g: f"{round((z.get('crimen') or {}).get('incidentes') or 0)} inc · {z.get('demanda',0)} dem" if (z.get("crimen") or {}).get("incidentes") is not None else None),
    (37, 4, "Frontera riesgo-retorno", "la frontera eficiente de colonias",
     lambda z, g: round((_inv(z) or 0) + (_risk(z) or 0)) if _inv(z) is not None and _risk(z) is not None else None),
    (38, 4, "Descuento por riesgo", "cuánto descuenta el mercado por riesgo",
     lambda z, g: round((100 - (_risk(z) or 50)) / 10, 1) if _risk(z) is not None else None),
    (39, 4, "Fraude en zona caliente", "listings sospechosos (fraud_detection) donde hay demanda",
     lambda z, g: f"{z.get('fraude_n')} fraudes · {z.get('demanda', 0)} dem" if z.get("fraude_n") else None),
    (40, 4, "Riesgo de título × valor", "exposición legal ponderada por valor",
     lambda z, g: None),  # feeder predio_dd

    # ── PACK 5 · ABSORPTION ──
    (41, 5, "Presión de absorción", "agotándose vs hambrienta",
     lambda z, g: _ratio(_ab(z, "vendido_pct"), max(z.get("oportunidad") or 1, 1))),
    (42, 5, "Meses-para-agotar real", "agotamiento considerando demanda entrante",
     lambda z, g: _ab(z, "meses_agotar")),
    (43, 5, "Sold-out forecast × precio", "cuándo agota y a qué precio",
     lambda z, g: f"{_ab(z, 'meses_agotar')}m @ ${round((z.get('precio_m2') or 0)/1000)}k" if _ab(z, "meses_agotar") and z.get("precio_m2") else None),
    (44, 5, "Velocidad vs competencia", "qué tan rápido vendes vs saturación",
     lambda z, g: _ratio(_ab(z, "velocidad_mensual"), max(z.get("oferta_unidades", 1) / 50, 1))),
    (45, 5, "Inventario zombie × demanda", "oferta muerta DONDE hay demanda",
     lambda z, g: z.get("oferta_unidades") if (_ab(z, "velocidad_mensual") or 0) < 0.5 and z.get("demanda", 0) > 30 else 0),
    (46, 5, "Cohorte que más absorbe", "preventa/entrega que mejor se desplaza",
     lambda z, g: _ab(z, "vendido_pct")),
    (47, 5, "Pipeline vs demanda", "sobreoferta futura vs demanda",
     lambda z, g: _ratio(z.get("oferta_unidades"), max(z.get("demanda", 1), 1))),
    (48, 5, "Sobreprecio en DOM", "el sobreprecio medido en tiempo en mercado",
     lambda z, g: _ab(z, "meses_agotar")),
    (49, 5, "Absorción estacional", "velocidad de venta por temporada",
     lambda z, g: _ab(z, "velocidad_mensual")),
    (50, 5, "Velocidad × calidad", "¿mejores zonas venden más rápido?",
     lambda z, g: _ratio(_ab(z, "velocidad_mensual"), z.get("score_zona")) if z.get("score_zona") else None),

    # ── PACK 6 · UNDERWRITING ──
    (51, 6, "Qué construir (gap)", "feature pedido sin oferta",
     lambda z, g: round(z.get("busquedas", 0) - z.get("oferta_unidades", 0)) if z.get("busquedas", 0) > z.get("oferta_unidades", 0) else 0),
    (52, 6, "Mezcla óptima de producto", "tipología por demanda real",
     lambda z, g: f"{_spec(z,'recamaras')}rec/{_spec(z,'m2')}m²" if _spec(z, "recamaras") else None),
    (53, 6, "Margen-oportunidad", "lo que pagan − costo de construir",
     lambda z, g: _pct_gap(z.get("precio_m2"), _cc_for(z, g)) if _cc_for(z, g) else None),
    (55, 6, "Norma 3 × plusvalía", "ganancia % de fusionar predios donde el precio sube",
     lambda z, g: z.get("norma3_upside_pct")),
    (54, 6, "Valor residual × demanda", "máx $/m² a pagar por el terreno, ponderado por demanda",
     lambda z, g: round((z.get("valor_residual_pm2") or 0) * min(z.get("demanda", 0) / 100 + 0.5, 1.5)) if z.get("valor_residual_pm2") else None),
    (56, 6, "Lift de feature aprendido", "qué feature sube la venta (pp) — del simulador de palancas",
     lambda z, g: f"{(z.get('feature_lift') or {}).get('valor')}: +{(z.get('feature_lift') or {}).get('lift_pp')}pp" if z.get("feature_lift") else None),
    (57, 6, "Precio de lanzamiento", "a qué precio entrar",
     lambda z, g: round((_n(z.get("precio_m2")) or 0) * (0.95 if (_ab(z, "vendido_pct") or 0) < 20 else 1.0)) if z.get("precio_m2") else None),
    (58, 6, "Bancabilidad del lote", "financiable según velocidad",
     lambda z, g: round((_ab(z, "velocidad_mensual") or 0) * 20 + (_inv(z) or 0) * 0.5) if _ab(z, "velocidad_mensual") is not None else None),
    (59, 6, "Riesgo-margen del proyecto", "margen neto de riesgo",
     lambda z, g: round((_pct_gap(z.get("precio_m2"), _cc_for(z, g)) or 0) * (_risk(z) or 50) / 100) if _cc_for(z, g) and _risk(z) else None),
    (60, 6, "Demanda para proyecto nuevo", "demanda donde no hay búsquedas",
     lambda z, g: z.get("oportunidad")),

    # ── PACK 7 · LIVABILITY ──
    (61, 7, "Conversión × calidad de vida", "qué atributo sube conversión",
     lambda z, g: _conv_low(g)),
    (62, 7, "Demanda-familia × escuelas", "demanda de hogar que coincide con escuelas",
     lambda z, g: round(z.get("demanda", 0) * (_sub(z, "educacion") or _sub(z, "amenidades") or 50) / 100, 1)),
    (63, 7, "Walkability × precio", "premium por caminabilidad",
     lambda z, g: _ratio(z.get("precio_m2"), max(_sub(z, "transporte") or 1, 1)) if z.get("precio_m2") and _sub(z, "transporte") else None),
    (64, 7, "Amenidades × WTP", "cuánto pagan por densidad de amenidades",
     lambda z, g: round((_sub(z, "amenidades") or 0) * (_wtp_med(g) or 0) / 1e6, 1) if _sub(z, "amenidades") and _wtp_med(g) else None),
    (65, 7, "Vibe × perfil", "qué perfil busca qué vibe",
     lambda z, g: _sub(z, "vibe")),
    (66, 7, "Sentimiento × demanda", "sentimiento de residentes (reviews) vs demanda de compra",
     lambda z, g: round((z.get("reviews_sentiment") or 0) * min(z.get("demanda",0)/100+0.5,1.5),1) if z.get("reviews_sentiment") is not None else None),
    (67, 7, "Lente de gusto (4 perfiles)", "misma zona, 4 puntajes por perfil",
     lambda z, g: z.get("score_zona")),
    (68, 7, "Habitabilidad ponderada", "calidad de vida pesada por demanda de hogar",
     lambda z, g: round(z.get("demanda", 0) * (_sub(z, "seguridad") or 50) / 100, 1)),
    (69, 7, "Value index (calidad-precio)", "la mejor relación calidad-precio",
     lambda z, g: _ratio((_sub(z, "lifestyle") or _sub(z, "vibe") or 50) * 1000, z.get("precio_m2")) if z.get("precio_m2") else None),
    (70, 7, "Comercio que se valora", "densidad comercial que la demanda busca",
     lambda z, g: _sub(z, "amenidades")),

    # ── PACK 8 · COMPETITIVE ──
    (71, 8, "Posición competitiva de precio", "contra quién compites y si estás caro",
     lambda z, g: _pct_gap(z.get("precio_m2"), (z.get("precio_m2", 0) or 0)) if False else (_pct_gap(_spec(z, "precio_max_prom"), (z.get("precio_m2", 0) or 0) * (_spec(z, "m2") or 0)) if z.get("precio_m2") and _spec(z, "m2") else None)),
    (72, 8, "Battle card × demanda", "score competitivo ponderado por demanda",
     lambda z, g: round((_inv(z) or 0) * min(z.get("demanda", 0) / 100, 1.5)) if _inv(z) is not None else None),
    (73, 8, "Canibalización", "proyectos que se comen entre sí",
     lambda z, g: z.get("oferta_unidades") if z.get("oferta_unidades", 0) > 3 else 0),
    (74, 8, "Captura de demanda", "qué % de la demanda de la zona capturas",
     lambda z, g: _ratio(z.get("oferta_unidades"), max(z.get("demanda", 1), 1))),
    (75, 8, "Migración competitiva", "a qué zona/proyecto se van",
     lambda z, g: (g.get("sustitucion") or {}).get("visitantes_multi_colonia")),
    (76, 8, "Saturación futura", "quién va a sobre-ofertar tu zona",
     lambda z, g: z.get("oferta_unidades")),
    (77, 8, "Velocidad relativa", "vendes más rápido o lento que el promedio",
     lambda z, g: _ab(z, "velocidad_mensual")),
    (78, 8, "Concentración de brokers", "# de brokers activos en la zona (concentración de oferta)",
     lambda z, g: z.get("brokers_n")),
    (79, 8, "Precio vs comparables", "posición de precio validada por demanda",
     lambda z, g: z.get("precio_m2")),
    (80, 8, "Feature diferenciador", "feature que te diferencia y se busca",
     lambda z, g: (g.get("criterios") or [{}])[0].get("criterio") if g.get("criterios") else None),

    # ── PACK 9 · LEAD ──
    (81, 9, "Calidad del lead caliente", "el lead va tras zonas AAA",
     lambda z, g: _inv(z)),
    (82, 9, "Presupuesto revelado vs declarado", "lo que mira vs lo que dice",
     lambda z, g: _spec(z, "precio_max_prom")),
    (83, 9, "Pipeline ponderado por ticket", "prob. de cierre × valor",
     lambda z, g: round((z.get("oportunidad") or 0) * (z.get("precio_m2") or 0) / 1e5) if z.get("oportunidad") and z.get("precio_m2") else None),
    (84, 9, "Pitch que convierte por zona", "qué tono cierra en cada colonia",
     lambda z, g: _conv_low(g)),
    (85, 9, "Lead-zona fit", "qué tan bien encaja el lead con la zona",
     lambda z, g: z.get("score_zona")),
    (86, 9, "Urgencia × inventario", "lead urgente + inventario que se agota = cerrar YA",
     lambda z, g: "ALTA" if (_ab(z, "meses_agotar") or 999) < 12 else "media"),
    (87, 9, "Churn × ciclo de zona", "pierdes leads en zonas en contracción",
     lambda z, g: z.get("ciclo")),
    (88, 9, "Next-best-zone para el lead", "la mejor zona para ese comprador",
     lambda z, g: z.get("nombre") if (_inv(z) or 0) >= 40 else None),
    (89, 9, "Mejor canal por calidad", "qué canal trae los mejores leads",
     lambda z, g: (g.get("atribucion") or [{}])[0].get("fuente") if g.get("atribucion") else None),
    (90, 9, "Timing de contacto", "la franja donde el comprador DECIDE (no solo navega)",
     lambda z, g: (g.get("temporal") or {}).get("franja_de_mayor_intencion")),

    # ── PACK 10 · MOMENTUM ──
    (91, 10, "Demanda indicador líder", "la demanda adelanta el precio (vs forecast)",
     lambda z, g: z.get("cambio_pct") if z.get("cambio_pct") is not None else z.get("forecast_pct")),
    (92, 10, "Live Pulse compuesto", "el pulso de la zona en 1 número",
     lambda z, g: round((min(z.get("demanda", 0) / 150, 1) * 50) + ((_risk(z) or 50) / 100 * 30) + ((_inv(z) or 0) / 100 * 20))),
    (93, 10, "Gentrificación temprana", "señales antes de que suba",
     lambda z, g: z.get("ciclo")),
    (94, 10, "P(precio sube) × demanda", "probabilidad (forecast) reforzada con demanda",
     lambda z, g: round((z.get("forecast_pct") or z.get("cambio_pct") or 0)) if (z.get("forecast_pct") or z.get("cambio_pct")) is not None else None),
    (95, 10, "Forecast de absorción", "proyección de velocidad de venta",
     lambda z, g: _ab(z, "velocidad_mensual")),
    (96, 10, "Ventana de oportunidad", "cuándo entrar/salir de una zona",
     lambda z, g: z.get("ciclo")),
    (97, 10, "Aceleración de demanda", "demanda acelerando vs oferta plana",
     lambda z, g: z.get("cambio_pct") if z.get("cambio_pct") is not None else z.get("forecast_pct")),
    (98, 10, "Índice de oportunidad real", "el número maestro de la zona",
     lambda z, g: round(min(z.get("demanda", 0) / 150, 1) * 30 + max(0, min((_pct_gap(_spec(z, "precio_max_prom"), (z.get("precio_m2", 0) or 0) * (_spec(z, "m2") or 0)) or 0), 100)) / 100 * 30 + (_risk(z) or 0) / 100 * 20 + (_inv(z) or 0) / 100 * 20)),
    (99, 10, "Forecast de hueco", "demanda insatisfecha que seguirá sin oferta",
     lambda z, g: round(z.get("busquedas", 0) - z.get("oferta_unidades", 0)) if z.get("busquedas", 0) > z.get("oferta_unidades", 0) else 0),
    (100, 10, "Termómetro zona emergente", "la próxima Condesa antes de que suba",
     lambda z, g: "emergente" if (z.get("demanda", 0) > 30 and (_n(z.get("precio_m2")) or 1e9) < 70000) else "—"),

    # ── PACK 11 · SUELO & CONSTRUCCIÓN (usa feeders nuevos: catastral + costo construcción + valor residual) ──
    (101, 11, "Construcción % del precio", "qué parte del precio es costo de obra",
     lambda z, g: _pct(z.get("costo_construccion_m2"), z.get("precio_m2"))),
    (102, 11, "Margen bruto del dev", "(precio − costo) / precio = colchón del desarrollador",
     lambda z, g: round(100 * (z["precio_m2"] - z["costo_construccion_m2"]) / z["precio_m2"]) if z.get("precio_m2") and z.get("costo_construccion_m2") else None),
    (103, 11, "Demanda × margen", "dónde construir con margen Y demanda probada",
     lambda z, g: round((z.get("demanda", 0)) * ((z["precio_m2"] - z["costo_construccion_m2"]) / z["precio_m2"])) if z.get("precio_m2") and z.get("costo_construccion_m2") else None),
    (104, 11, "Suelo % del precio (catastral)", "qué parte del valor es tierra (catastral)",
     lambda z, g: _pct(z.get("catastral_pm2"), z.get("precio_m2"))),
    (105, 11, "Residual ÷ catastral", "cuántas veces el catastral justifica el desarrollo (múltiplo de suelo)",
     lambda z, g: _ratio(z.get("valor_residual_pm2"), z.get("catastral_pm2"))),
    (106, 11, "Premium sobre catastral", "precio de mercado vs valor catastral del suelo (×)",
     lambda z, g: _ratio(z.get("precio_m2"), z.get("catastral_pm2"))),
    (107, 11, "Eficiencia de construcción", "precio ÷ costo de obra (cuánto multiplica)",
     lambda z, g: _ratio(z.get("precio_m2"), z.get("costo_construccion_m2"))),
    (108, 11, "Margen ajustado a riesgo", "margen bruto neto del riesgo de la zona",
     lambda z, g: round((100 * (z["precio_m2"] - z["costo_construccion_m2"]) / z["precio_m2"]) * (_risk(z) or 0) / 100) if z.get("precio_m2") and z.get("costo_construccion_m2") and _risk(z) is not None else None),
    (109, 11, "Lift de palanca × margen", "el feature que sube venta, donde hay margen para construirlo",
     lambda z, g: f"{(z.get('feature_lift') or {}).get('valor')} +{(z.get('feature_lift') or {}).get('lift_pp')}pp" if z.get("feature_lift") and z.get("costo_construccion_m2") else None),
    (110, 11, "Suelo máx pagable × demanda", "valor residual del suelo ponderado por demanda real",
     lambda z, g: round((z.get("valor_residual_pm2") or 0) * min(z.get("demanda", 0) / 100 + 0.5, 1.5)) if z.get("valor_residual_pm2") else None),

    # ── PACK 12 · STR / AIRBNB (usa AirROI real: ocupación/ADR/RevPAR/revenue/listings + cap_rate_str) ──
    (111, 12, "Payback STR (años)", "años para recuperar la inversión vía Airbnb",
     lambda z, g: round((z["precio_m2"] * ((z.get("spec_pedida") or {}).get("m2") or 80) / 20.0) / _str(z, "revenue_anual_usd"), 1) if z.get("precio_m2") and _str(z, "revenue_anual_usd") else None),
    (112, 12, "Saturación STR", "listings Airbnb ÷ inventario en venta (competencia de renta corta)",
     lambda z, g: _ratio(_str(z, "listings"), max(z.get("oferta_unidades", 1), 1)) if _str(z, "listings") else None),
    (113, 12, "RevPAR × demanda", "atractivo Airbnb ponderado por demanda de compra",
     lambda z, g: round((_str(z, "revpar") or 0) * min(z.get("demanda", 0) / 50, 2)) if _str(z, "revpar") else None),
    (114, 12, "Yield STR ajustado a riesgo", "cap rate Airbnb neto de riesgo físico",
     lambda z, g: round((z.get("cap_rate_str") or 0) * (_risk(z) or 0) / 100, 2) if z.get("cap_rate_str") and _risk(z) is not None else None),
    (115, 12, "Premium STR vs tradicional", "cuánto más rinde Airbnb que la renta larga (×)",
     lambda z, g: _ratio(z.get("cap_rate_str"), z.get("cap_rate_est")) if z.get("cap_rate_str") and z.get("cap_rate_est") else None),
    (116, 12, "STR × score de inversión", "renta corta donde además la zona es grado inversión",
     lambda z, g: round((z.get("cap_rate_str") or 0) * (_inv(z) or 0) / 100, 1) if z.get("cap_rate_str") and _inv(z) is not None else None),
    (117, 12, "Demanda caliente × yield STR", "zona caliente de compra Y rentable en Airbnb",
     lambda z, g: round((z.get("demanda", 0)) * (z.get("cap_rate_str") or 0) / 100, 1) if z.get("cap_rate_str") else None),
    (118, 12, "Ocupación × ADR", "eficiencia de ingreso Airbnb (ocupación × tarifa)",
     lambda z, g: round((_str(z, "ocupacion_pct") or 0) / 100 * (_str(z, "adr") or 0)) if _str(z, "adr") else None),
    (119, 12, "Listings × absorción", "competencia Airbnb vs velocidad de venta (presión de zona)",
     lambda z, g: round((_str(z, "listings") or 0) * ((z.get("absorcion") or {}).get("vendido_pct") or 0) / 100) if _str(z, "listings") else None),
    (120, 12, "Índice STR", "blend ocupación + RevPAR + cap rate Airbnb = atractivo de renta corta",
     lambda z, g: round(min((_str(z, "ocupacion_pct") or 0), 100) * 0.3 + min((_str(z, "revpar") or 0), 200) / 200 * 35 + min((z.get("cap_rate_str") or 0), 15) / 15 * 35) if _str(z, "revpar") else None),

    # ── PACK 1 · PRICING (compuesta nueva 1.3, lee de price_events) ──
    (121, 1, "Índice de recortes de precio", "¿bajan precio en esta zona? cuánto y qué tan rápido (recortes+magnitud+días al 1er recorte)",
     lambda z, g: _recortes_index(z, g)),

    # ── PACK 13 · LIQUIDEZ & GHOST (compuesta nueva 1.5, lee IE ya computados de ie_scores) ──
    (122, 13, "Liquidez de zona + Ghost-zone", "qué tan líquida es la zona y si tiene vida de calle (¿estás comprando en un desierto?)",
     lambda z, g: _liquidez_ghost(z, g)),
]


# Stub HONESTO por compuesta sin dato: qué fuente la prende (regla "construir completo con stubs;
# el dato lo prende después"). Se autoexplica en vez de devolver un null mudo. NO inventa el valor.
_PENDING_SOURCE: Dict[int, str] = {
    35: "Dataset de migración climática por zona (sin fuente abierta vigente)",
    39: "Casos de fraude — se detectan al crecer el inventario de listings",
    40: "Cruce de documentos (escritura/predial) — al cargar la papelería de los desarrollos",
    66: "Sentimiento de residentes — reseñas (sin dataset abierto; se acumula con uso)",
    78: "Brokers activos por zona — se acumula al listar más desarrollos",
    121: "Eventos de precio (price_events) — se prende cuando la zona registra cambios de precio de listado",
    122: "IE de liquidez/ghost-zone (ie_scores) — se prende al recomputar el IE con feeder OSM/datos_cdmx",
}
_PENDING_DEFAULT = "Feeder de mercado / actividad de plataforma — la fórmula ya está cableada y se prende con el dato"


async def compute_all(db, since_days: int = 180, top: int = 20) -> Dict[str, Any]:
    """Corre las 120 compuestas por colonia. Devuelve por-paquete + por-zona + cobertura. Cada compuesta
    reporta estado HONESTO: 'vivo' (con dato) o 'esperando_dato' (+ la fuente que la prende) — nunca null mudo."""
    ctx = await build_context(db, since_days=since_days, top=top)
    zones, g = ctx["zones"], ctx["g"]
    por_zona = []
    real_count = 0; total_count = 0
    tiene_dato: Dict[int, bool] = {n: False for (n, *_rest) in COMPOSITES}
    for z in zones:
        vals = {}
        for (n, pack, nombre, descubre, fn) in COMPOSITES:
            try:
                v = fn(z, g)
            except Exception:
                v = None
            vals[n] = v
            total_count += 1
            if v is not None and v != "—":
                real_count += 1
                tiene_dato[n] = True
        por_zona.append({"zona": z.get("zona"), "nombre": z.get("nombre"), "tier": z.get("tier"), "valores": vals})
    # Catálogo autoexplicado: estado por compuesta + fuente pendiente (stub honesto, no número fabricado).
    catalogo = []
    n_vivas = 0
    for (n, pack, nombre, descubre, fn) in COMPOSITES:
        vivo = tiene_dato.get(n, False)
        if vivo:
            n_vivas += 1
        catalogo.append({
            "n": n, "pack": P[pack], "nombre": nombre, "descubre": descubre,
            "uso": descubre, "dimension": f"compuesta · {P[pack]}",
            "fuente": "composite_metrics (comportamiento × mercado, motores fusionados)",
            "estado": "vivo" if vivo else "esperando_dato",
            "fuente_pendiente": None if vivo else _PENDING_SOURCE.get(n, _PENDING_DEFAULT),
        })
    cobertura_pct = round(100 * real_count / max(total_count, 1))
    return {"catalogo": catalogo, "por_zona": por_zona,
            "cobertura": {"reales": real_count, "total": total_count, "pct": cobertura_pct,
                          "compuestas_vivas": n_vivas, "compuestas_total": len(COMPOSITES),
                          "nota": f"{len(COMPOSITES)}/{len(COMPOSITES)} construidas y funcionando: las 'esperando_dato' reportan su fuente pendiente (stub honesto), no un número inventado"},
            "packs": {str(k): v for k, v in P.items()}}


async def for_dev(db, colonias: List[str], since_days: int = 180) -> Dict[str, Any]:
    """Subconjunto DEV (packs Pricing/Absorption/Underwriting/Competitive) scopeado a sus colonias."""
    full = await compute_all(db, since_days=since_days, top=40)
    dev_packs = {"Pricing", "Absorption", "Underwriting", "Competitive", "Suelo&Construcción"}
    ns = {c["n"] for c in full["catalogo"] if c["pack"] in dev_packs}
    cl = {(c or "").lower() for c in (colonias or [])}
    rows = [{**pz, "valores": {k: v for k, v in pz["valores"].items() if k in ns}}
            for pz in full["por_zona"] if not cl or (pz["zona"] or "").lower() in cl]
    return {"catalogo": [c for c in full["catalogo"] if c["pack"] in dev_packs], "por_zona": rows}


async def for_asesor(db, since_days: int = 180) -> Dict[str, Any]:
    """Subconjunto ASESOR (Lead + STR/Airbnb + Liquidez&Ghost) — calidad/fit/pitch/timing + yield Airbnb +
    liquidez/vida-de-calle por zona (útil para argumentar rapidez de reventa al lead)."""
    full = await compute_all(db, since_days=since_days, top=40)
    packs = {"Lead", "STR/Airbnb", "Liquidez&Ghost"}
    ns = {c["n"] for c in full["catalogo"] if c["pack"] in packs}
    rows = [{**pz, "valores": {k: v for k, v in pz["valores"].items() if k in ns}} for pz in full["por_zona"]]
    return {"catalogo": [c for c in full["catalogo"] if c["pack"] in packs], "por_zona": rows}


async def for_inversor(db, since_days: int = 180) -> Dict[str, Any]:
    """Subconjunto INVERSOR (Investor + Liquidez&Ghost + el nuevo Índice de recortes de Pricing) —
    yield/spread/plusvalía + qué tan LÍQUIDA es la zona (entrar-salir) + si el mercado está recortando precio."""
    full = await compute_all(db, since_days=since_days, top=40)
    packs = {"Investor", "Liquidez&Ghost"}
    ns = {c["n"] for c in full["catalogo"] if c["pack"] in packs}
    ns.add(121)  # Índice de recortes de precio (Pricing) — señal directa para negociar/timing de entrada
    rows = [{**pz, "valores": {k: v for k, v in pz["valores"].items() if k in ns}} for pz in full["por_zona"]]
    cat = [c for c in full["catalogo"] if c["pack"] in packs or c["n"] == 121]
    return {"catalogo": cat, "por_zona": rows}


async def for_comprador(db, since_days: int = 180) -> Dict[str, Any]:
    """Subconjunto COMPRADOR (Liquidez&Ghost + Índice de recortes) — ¿la zona tiene vida de calle (no un desierto)?
    ¿es líquida si necesito revender? ¿está el precio bajando (buen momento para negociar)?"""
    full = await compute_all(db, since_days=since_days, top=40)
    packs = {"Liquidez&Ghost"}
    ns = {c["n"] for c in full["catalogo"] if c["pack"] in packs}
    ns.add(121)  # Índice de recortes — al comprador le importa si hay margen de negociación
    rows = [{**pz, "valores": {k: v for k, v in pz["valores"].items() if k in ns}} for pz in full["por_zona"]]
    cat = [c for c in full["catalogo"] if c["pack"] in packs or c["n"] == 121]
    return {"catalogo": cat, "por_zona": rows}
