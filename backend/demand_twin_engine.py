"""Gemelo de Demanda (cuña brújula · moonshot superadmin) — el "SimCity de la demanda de MX".

Modela, por ZONA, la demanda habitacional cruzando 4 señales que ya viven en la plataforma (REUSO, no se duplica):
  1. Lo DEMANDADO (qué + cuánto): db.marketplace_searches agregado por colonia (volumen + precio/recámaras/m² pedidos).
  2. El INTERÉS comportamental: db.facts_buyer_signals (interés + compradores distintos, K-anon, del Fix #1).
  3. La OFERTA: data_developments (cuántos devs + desde qué precio en la zona).
  4. El HUECO: db.demanda_insatisfecha (qué buscaron y NO encontraron).

→ Score de OPORTUNIDAD = mucha demanda · poca oferta · con hueco = dónde conviene construir. Consultable por el founder.
Fail-open.
"""
import logging

log = logging.getLogger("dmx.demand_twin")


async def build_demand_twin(db, limit: int = 60):
    zonas = {}

    # 1 · Lo DEMANDADO (marketplace_searches por colonia)
    try:
        async for r in db.marketplace_searches.aggregate([
            {"$unwind": "$colonias"},
            {"$group": {
                "_id": "$colonias",
                "busquedas": {"$sum": 1},
                "precio_prom": {"$avg": "$precio_max"},
                "rec_prom": {"$avg": "$recamaras_min"},
                "m2_prom": {"$avg": "$m2_min"},
                "alertas": {"$sum": {"$cond": [{"$eq": ["$alert", True]}, 1, 0]}},
            }},
        ]):
            z = str(r.get("_id") or "").strip().lower()
            if not z:
                continue
            zonas[z] = {
                "colonia": z,
                "demanda_busquedas": r.get("busquedas", 0),
                "alertas": r.get("alertas", 0),
                "spec": {
                    "precio_max_prom": round(r["precio_prom"]) if r.get("precio_prom") else None,
                    "recamaras": round(r["rec_prom"], 1) if r.get("rec_prom") else None,
                    "m2": round(r["m2_prom"]) if r.get("m2_prom") else None,
                },
                "interes": 0.0, "compradores": 0, "oferta_devs": 0,
                "oferta_precio_desde": None, "falta": [],
            }
    except Exception as e:  # noqa: BLE001
        log.warning(f"[demand_twin] searches fail: {e}")

    # 2 · INTERÉS comportamental (facts_buyer_signals)
    try:
        async for f in db.facts_buyer_signals.find(
                {"scope": "colonia"}, {"_id": 0, "colonia": 1, "interest_score": 1, "distinct_visitors": 1}):
            z = str(f.get("colonia") or "").lower()
            if z in zonas:
                zonas[z]["interes"] = round(f.get("interest_score") or 0, 1)
                zonas[z]["compradores"] = f.get("distinct_visitors") or 0
    except Exception as e:  # noqa: BLE001
        log.warning(f"[demand_twin] facts fail: {e}")

    # 3 · OFERTA (developments por colonia)
    try:
        from data_developments import DEVELOPMENTS
        supply = {}
        for d in DEVELOPMENTS:
            z = str(d.get("colonia_id") or d.get("colonia") or "").strip().lower()
            if not z:
                continue
            s = supply.setdefault(z, {"n": 0, "precios": []})
            s["n"] += 1
            if d.get("price_from"):
                s["precios"].append(d["price_from"])
        for z, s in supply.items():
            if z in zonas:
                zonas[z]["oferta_devs"] = s["n"]
                zonas[z]["oferta_precio_desde"] = min(s["precios"]) if s["precios"] else None
    except Exception as e:  # noqa: BLE001
        log.warning(f"[demand_twin] supply fail: {e}")

    # 4 · HUECO (demanda_insatisfecha)
    try:
        async for u in db.demanda_insatisfecha.find({}, {"_id": 0, "zona": 1, "falta_top": 1}):
            z = str(u.get("zona") or "").lower()
            if z in zonas:
                zonas[z]["falta"] = (u.get("falta_top") or [])[:5]
    except Exception as e:  # noqa: BLE001
        log.warning(f"[demand_twin] unmet fail: {e}")

    # 5 · OPORTUNIDAD = mucha demanda · poca oferta · con hueco
    rows = []
    for p in zonas.values():
        dem = p["demanda_busquedas"] + p["compradores"] * 2
        hueco = 1.5 if p["falta"] else 1.0
        p["oportunidad"] = round(dem * hueco / (p["oferta_devs"] + 1), 1)
        p["demanda_total"] = dem
        rows.append(p)
    rows.sort(key=lambda r: -r["oportunidad"])
    return rows[:max(1, min(int(limit or 60), 200))]
