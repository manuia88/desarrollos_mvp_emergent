"""ATLAS DE MÉTRICAS — el explorador universal de entidades. Dada CUALQUIER entidad (de lo nano a lo super-macro, en
CUALQUIER dimensión), devuelve su FICHA completa de métricas: todas las medidas aplicables del grid (con procedencia) +
la fusión institucional + lo conductual (unidades más vistas, vistas-sin-cita, perfil de cliente, forma de pago, lo que
más piden) + navegación (padre/hijos) + insights. El grid es la capa de datos; esto es la capa de PRODUCTO.

Niveles (nano→macro): unidad · prototipo · desarrollo · cp · colonia · corredor · alcaldia · ciudad.
Dimensiones-entidad (no solo geo): atributo · tipologia · tier · perfil(intención) · desarrollador.
"""
from collections import Counter
from typing import Any, Dict, List

from metric_registry import REGISTRY

GEO_LEVELS = ["unidad", "prototipo", "desarrollo", "cp", "colonia", "corredor", "alcaldia", "ciudad"]
ENTITY_TYPES = GEO_LEVELS + ["atributo", "tipologia", "tier", "perfil", "desarrollador"]


def _entity_dims(tipo: str, eid: str) -> Dict[str, Any]:
    """Traduce (tipo, id) al filtro dimensional del grid."""
    if tipo in ("colonia", "alcaldia", "corredor", "desarrollo"):
        return {"geo": (tipo, eid)}
    if tipo == "ciudad":
        return {}  # ciudad-wide
    if tipo == "cp":
        return {"geo": ("cp", eid)}
    if tipo == "prototipo":  # eid = "dev_id::PROTO"
        dev, _, pr = eid.partition("::")
        return {"geo": ("desarrollo", dev), "_prototipo": pr}
    if tipo == "unidad":  # eid = "dev_id::unit_number"
        dev, _, un = eid.partition("::")
        return {"geo": ("desarrollo", dev), "_unidad": un}
    if tipo == "atributo":
        return {"atributo": eid}
    if tipo == "tipologia":
        return {"tipologia": eid}
    if tipo == "tier":
        return {"tier_precio": eid}
    if tipo == "perfil":
        return {"intencion": eid}
    if tipo == "desarrollador":
        return {"_desarrollador": eid}
    return {}


# ── navegación jerárquica ───────────────────────────────────────────────────────
def entity_children(tipo: str, eid: str) -> List[Dict[str, str]]:
    from data_developments import DEVELOPMENTS, DEVELOPMENTS_BY_ID
    import demand_intelligence as di
    out = []
    if tipo == "ciudad":
        for a in sorted({d.get("alcaldia") for d in DEVELOPMENTS if d.get("alcaldia")}):
            out.append({"tipo": "alcaldia", "id": a, "nombre": a})
    elif tipo == "alcaldia":
        for c in sorted({d.get("corredor") if False else di._corridor(d.get("colonia_id"), d.get("alcaldia")) for d in DEVELOPMENTS if d.get("alcaldia") == eid}):
            if c:
                out.append({"tipo": "corredor", "id": c, "nombre": c.replace("-", " ").title()})
    elif tipo == "corredor":
        seen = set()
        for d in DEVELOPMENTS:
            if di._corridor(d.get("colonia_id"), d.get("alcaldia")) == eid and d.get("colonia_id") not in seen:
                seen.add(d.get("colonia_id")); out.append({"tipo": "colonia", "id": d["colonia_id"], "nombre": d.get("colonia") or d["colonia_id"]})
    elif tipo == "colonia":
        for d in DEVELOPMENTS:
            if d.get("colonia_id") == eid:
                out.append({"tipo": "desarrollo", "id": d["id"], "nombre": d.get("name") or d["id"]})
    elif tipo == "desarrollo":
        d = DEVELOPMENTS_BY_ID.get(eid)
        for pr in sorted({str(u.get("prototype") or "").upper() for u in (d.get("units") if d else []) if u.get("prototype")}):
            out.append({"tipo": "prototipo", "id": f"{eid}::{pr}", "nombre": f"Prototipo {pr}"})
    elif tipo == "prototipo":
        dev, _, pr = eid.partition("::")
        d = DEVELOPMENTS_BY_ID.get(dev)
        for u in (d.get("units") if d else []):
            if str(u.get("prototype") or "").upper() == pr:
                out.append({"tipo": "unidad", "id": f"{dev}::{u.get('unit_number')}", "nombre": f"Unidad {u.get('unit_number')}"})
    return out[:60]


def entity_breadcrumb(tipo: str, eid: str) -> List[Dict[str, str]]:
    from data_developments import DEVELOPMENTS_BY_ID
    import demand_intelligence as di
    crumbs = [{"tipo": "ciudad", "id": "CDMX", "nombre": "CDMX"}]
    dev = None
    if tipo in ("unidad", "prototipo"):
        dev = DEVELOPMENTS_BY_ID.get(eid.split("::")[0])
    elif tipo == "desarrollo":
        dev = DEVELOPMENTS_BY_ID.get(eid)
    if dev:
        alc = dev.get("alcaldia"); cor = di._corridor(dev.get("colonia_id"), alc)
        if alc:
            crumbs.append({"tipo": "alcaldia", "id": alc, "nombre": alc})
        if cor:
            crumbs.append({"tipo": "corredor", "id": cor, "nombre": cor.replace("-", " ").title()})
        crumbs.append({"tipo": "colonia", "id": dev.get("colonia_id"), "nombre": dev.get("colonia")})
        crumbs.append({"tipo": "desarrollo", "id": dev.get("id"), "nombre": dev.get("name")})
        if tipo in ("prototipo", "unidad"):
            crumbs.append({"tipo": tipo, "id": eid, "nombre": eid.split("::")[-1]})
    elif tipo == "colonia":
        crumbs.append({"tipo": "colonia", "id": eid, "nombre": eid})
    elif tipo == "alcaldia":
        crumbs.append({"tipo": "alcaldia", "id": eid, "nombre": eid})
    return crumbs


# ── lo conductual (lo nuevo que el founder pidió) ───────────────────────────────
async def _behavioral(db, tipo, eid, dims, ventana):
    import grid_engine as ge
    out = {}
    cut = ge._window_cutoff(ventana)
    cols = ge._geo_colonias(dims)
    base_q = {}
    if cut:
        base_q["created_at_dt"] = {"$gte": cut}
    if tipo in ("desarrollo", "prototipo", "unidad"):
        dev_id = eid.split("::")[0]
        base_q["entity_id"] = dev_id
    elif cols:
        base_q["colonia"] = {"$in": list(cols)}
    # unidades MÁS vistas + VISTAS SIN CITA (vista online pero sin lead/cita)
    if tipo in ("desarrollo", "prototipo"):
        vistas_unit = Counter(); leads_unit = set()
        async for s in db.buyer_signals.find({**base_q, "type": {"$in": ["unit_view", "unit_save", "lead", "intent"]}},
                                             {"_id": 0, "unit_number": 1, "type": 1, "visitor_id": 1}):
            un = s.get("unit_number")
            if s["type"] in ("unit_view",) and un:
                vistas_unit[un] += 1
            if s["type"] in ("lead", "intent") and s.get("visitor_id"):
                leads_unit.add(s["visitor_id"])
        out["unidades_mas_vistas"] = [{"unidad": u, "vistas": n} for u, n in vistas_unit.most_common(6)]
        total_vistas = sum(vistas_unit.values())
        out["vistas_sin_cita"] = {"vistas": total_vistas, "convirtieron_a_contacto": len(leads_unit),
                                  "sin_cita_pct": round(100 * (1 - len(leads_unit) / max(total_vistas, 1))) if total_vistas else None}
    # perfil del cliente interesado (segmento/intención/dispositivo)
    intent = Counter(); device = Counter(); vis = set()
    async for s in db.buyer_signals.find(base_q, {"_id": 0, "type": 1, "value": 1, "meta": 1, "device": 1, "visitor_id": 1}):
        if s.get("visitor_id"):
            vis.add(s["visitor_id"])
        v = (s.get("value") or (s.get("meta") or {}).get("intent") or "").lower()
        if "invert" in v:
            intent["invertir"] += 1
        elif "vivir" in v:
            intent["vivir"] += 1
        if s.get("device"):
            device[s["device"]] += 1
    out["perfil_cliente"] = {"visitantes_unicos": len(vis), "intencion": dict(intent), "dispositivo": dict(device)}
    # forma de pago + lo que más piden
    pago = Counter(); amen = Counter(); presu = []
    async for s in db.buyer_signals.find({**base_q, "type": {"$in": ["payment_explore", "roi_explore", "atlax_query", "atlax_profile"]}},
                                         {"_id": 0, "meta": 1}):
        meta = s.get("meta") or {}
        if meta.get("esquema"):
            pago[str(meta["esquema"]).lower()] += 1
        if meta.get("enganche"):
            try:
                presu.append(float(meta["enganche"]))
            except (TypeError, ValueError):
                pass
        import demand_intelligence as _di
        for a in _di._as_feature_list(meta.get("amenidades")):
            amen[str(a).lower()] += 1
    out["forma_pago"] = dict(pago)
    out["lo_que_mas_piden"] = {"amenidades": [a for a, _ in amen.most_common(5)],
                               "enganche_tipico": (round(sum(presu) / len(presu)) if presu else None)}
    return out


# ── la ficha universal ──────────────────────────────────────────────────────────
async def entity_panel(db, tipo: str, eid: str, ventana: str = "90d") -> Dict[str, Any]:
    """Ficha completa de una entidad: todas las medidas del grid por tema (con procedencia) + fusión + conductual + nav."""
    import grid_engine as ge
    if tipo not in ENTITY_TYPES:
        return {"error": f"tipo de entidad desconocido: {tipo}", "tipos": ENTITY_TYPES}
    dims = {k: v for k, v in _entity_dims(tipo, eid).items() if not k.startswith("_")}
    dims["ventana"] = ventana

    # 1) TODAS las medidas aplicables del grid, por tema (oferta/demanda/cruce), con procedencia
    temas = {"oferta": [], "demanda": [], "cruce": []}
    for meta in REGISTRY:
        c = await ge.compute(db, meta["id"], dims)
        temas[meta["lado"]].append({"id": meta["id"], "medida": c.get("medida"), "valor": c.get("valor"),
                                    "unidad": c.get("unidad"), "n": c.get("n"), "confianza": c.get("confianza"),
                                    "latente": c.get("latente"), "uso": c.get("uso"), "comparativo": c.get("comparativo"),
                                    "procedencia": c.get("procedencia")})

    # 2) FUSIÓN institucional (zone_intelligence / development_intelligence)
    fusion = None
    try:
        import demand_intelligence as di
        if tipo == "colonia":
            zs = await di.zone_intelligence(db, colonias=[eid], top=1, with_airroi=True, with_underwriting=True)
            fusion = (zs.get("zonas") or [None])[0]
        elif tipo in ("desarrollo", "prototipo", "unidad"):
            dv = await di.development_intelligence(db, dev_id=eid.split("::")[0])
            fusion = (dv.get("desarrollos") or [None])[0]
    except Exception:
        pass

    # 3) CONDUCTUAL
    try:
        behavioral = await _behavioral(db, tipo, eid, dims, ventana)
    except Exception:
        behavioral = {}

    # 4) INSIGHTS de la entidad (latente-aware)
    insights = []
    abso = next((m for m in temas["oferta"] if m["id"] == "of.sell_through" and not m["latente"]), None)
    gap = next((m for m in temas["cruce"] if m["id"] == "x.gap_oferta_demanda" and not m["latente"]), None)
    if abso:
        insights.append(f"{abso['valor']}% del inventario vendido (n={abso['n']}).")
    if gap and isinstance(gap["valor"], (int, float)) and gap["valor"] > 0:
        insights.append(f"Demanda insatisfecha: {gap['valor']} búsquedas por encima del inventario.")

    cobertura = {"reales": sum(1 for t in temas.values() for m in t if not m["latente"]),
                 "total": sum(len(t) for t in temas.values())}
    return {
        "entidad": {"tipo": tipo, "id": eid, "ventana": ventana},
        "breadcrumb": entity_breadcrumb(tipo, eid), "hijos": entity_children(tipo, eid),
        "temas": temas, "fusion": fusion, "conductual": behavioral, "insights": insights,
        "cobertura": cobertura,
        "lectura": "ficha universal de métricas de la entidad — cada celda con su procedencia; latentes esperan dato",
    }
