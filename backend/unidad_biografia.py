"""BIOGRAFÍA DE LA UNIDAD — el nivel DEBAJO de la unidad. Una unidad no es sus specs: es su historia de mercado.
Reconstruye, de dato REAL: su huella de demanda (quién la vio/guardó), su embudo, su curva de calor, su posición de
precio (percentil + AVM), la descomposición de su premium por atributo, sus unidades competidoras (co-vistas), el
pronóstico del proyecto y cuándo la miran. No inventa: lo que no hay queda latente con su razón.

Reusa avm_public_engine (AVM), probability_engine (P venta del proyecto), buyer_signals (comportamiento), DEVELOPMENTS.
"""
import datetime as dt
import statistics
from collections import Counter
from typing import Any, Dict

_SOLD = ("vendido", "reservado", "sold", "reserved", "apartado")
_ATTRS = [("terraza", "Terraza"), ("balcon", "Balcón"), ("roof_garden", "Roof garden"),
          ("bodega", "Bodega"), ("pet_friendly", "Pet friendly")]


def _pm2(u):
    return (u["price"] / u["m2_total"]) if u.get("price") and u.get("m2_total") else None


def _percentil(valor, universo):
    vals = sorted(v for v in universo if v is not None)
    if not vals or valor is None:
        return None
    menores = sum(1 for v in vals if v < valor)
    return round(100 * menores / len(vals))


async def biografia_unidad(db, dev_id: str, unit_number: str) -> Dict[str, Any]:
    from data_developments import DEVELOPMENTS, DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(dev_id)
    if not dev:
        return {"error": f"desarrollo desconocido: {dev_id}"}
    unit = next((u for u in (dev.get("units") or []) if str(u.get("unit_number")) == str(unit_number)), None)
    if not unit:
        return {"error": f"unidad desconocida: {unit_number}"}
    colonia = dev.get("colonia_id")
    col_units = [u for d in DEVELOPMENTS if d.get("colonia_id") == colonia for u in (d.get("units") or [])]
    dev_units = dev.get("units") or []

    # ── 1) HUELLA DE DEMANDA (comportamiento real sobre esta unidad) ──
    cuenta = Counter(); visitantes = set(); semanas = Counter(); horas = Counter(); dias = Counter()
    co_visitantes = set()
    async for s in db.buyer_signals.find({"entity_id": dev_id, "unit_number": str(unit_number)},
                                         {"_id": 0, "type": 1, "visitor_id": 1, "created_at_dt": 1}):
        cuenta[s.get("type")] += 1
        if s.get("visitor_id"):
            visitantes.add(s["visitor_id"])
            if s.get("type") in ("unit_view", "ficha_view", "view"):
                co_visitantes.add(s["visitor_id"])
        t = s.get("created_at_dt")
        if isinstance(t, dt.datetime):
            semanas[int((dt.datetime.utcnow() - t).days // 7)] += 1
            horas[t.hour] += 1
            dias[t.weekday()] += 1
    vistas = cuenta.get("unit_view", 0) + cuenta.get("ficha_view", 0) + cuenta.get("view", 0)
    guardados = cuenta.get("unit_save", 0) + cuenta.get("save", 0) + cuenta.get("like", 0)
    intents = cuenta.get("intent", 0) + cuenta.get("lead", 0)
    huella = {
        "vistas": vistas, "guardados": guardados, "interes_alto": intents, "visitantes_unicos": len(visitantes),
        "curva_calor": [{"semanas_atras": i, "señales": semanas.get(i, 0)} for i in range(0, 8)],
        "cuando_la_miran": {"hora_pico": (horas.most_common(1)[0][0] if horas else None),
                            "dia_pico": (["lun", "mar", "mié", "jue", "vie", "sáb", "dom"][dias.most_common(1)[0][0]] if dias else None)},
    }
    # ── 2) EMBUDO de esta unidad ──
    embudo = {"vistas": vistas, "guardados": guardados, "interes_alto": intents,
              "conv_vista_guardado": (round(100 * guardados / vistas) if vistas else None),
              "conv_guardado_interes": (round(100 * intents / guardados) if guardados else None)}

    # ── 3) POSICIÓN DE PRECIO (percentil en el dev y en la colonia) ──
    posicion = {
        "precio": unit.get("price"), "precio_m2": _pm2(unit),
        "percentil_en_dev": _percentil(unit.get("price"), [u.get("price") for u in dev_units]),
        "percentil_en_colonia": _percentil(unit.get("price"), [u.get("price") for u in col_units]),
        "percentil_m2_colonia": _percentil(_pm2(unit), [_pm2(u) for u in col_units]),
        "mediana_m2_colonia": (round(statistics.median([p for p in (_pm2(u) for u in col_units) if p])) if col_units else None),
    }

    # ── 4) DESCOMPOSICIÓN DEL PREMIUM (cuánto suma cada atributo que tiene, en la colonia) ──
    premium = []
    for fid, lbl in _ATTRS:
        if not unit.get(fid):
            continue
        con = [_pm2(u) for u in col_units if u.get(fid) and _pm2(u)]
        sin = [_pm2(u) for u in col_units if not u.get(fid) and _pm2(u)]
        if con and sin:
            lift = round(100 * (statistics.median(con) - statistics.median(sin)) / statistics.median(sin))
            premium.append({"atributo": lbl, "lift_pct": lift, "n": len(con) + len(sin)})
    premium.sort(key=lambda x: -x["lift_pct"])

    # ── 5) UNIDADES COMPETIDORAS (co-vistas: qué más vieron quienes vieron ésta) ──
    competidoras = Counter()
    if co_visitantes:
        async for s in db.buyer_signals.find({"visitor_id": {"$in": list(co_visitantes)}, "type": {"$in": ["unit_view", "ficha_view"]}},
                                             {"_id": 0, "entity_id": 1, "unit_number": 1}):
            key = (s.get("entity_id"), s.get("unit_number"))
            if key != (dev_id, str(unit_number)) and key[1]:
                competidoras[key] += 1
    comp_list = [{"desarrollo": (DEVELOPMENTS_BY_ID.get(k[0]) or {}).get("name", k[0]), "unidad": k[1], "co_vistas": v}
                 for k, v in competidoras.most_common(6)]

    # ── 6) AVM (¿bien puesto el precio?) — reusa avm_public_engine ──
    avm = {"latente": True, "razon": "AVM no disponible para esta colonia/unidad"}
    try:
        import avm_public_engine as ae
        r = await ae.avm_quick_async(db, colonia, float(unit.get("m2_total") or 0), int(unit.get("bedrooms") or 0),
                                     int(unit.get("bathrooms") or 0), 0,
                                     attrs={"vista": unit.get("vista"), "terraza": unit.get("terraza"), "piso": unit.get("level")})
        est = r.get("precio_estimado")
        if est and unit.get("price"):
            dif = round(100 * (unit["price"] - est) / est)
            avm = {"latente": False, "estimado": round(est), "precio_lista": unit["price"], "dif_pct": dif,
                   "confianza": r.get("confidence"), "rango": [r.get("range_low"), r.get("range_high")], "drivers": r.get("drivers_resumen"),
                   "lectura": f"el precio de lista está {abs(dif)}% {'arriba' if dif > 0 else 'abajo'} del valor estimado (${round(est/1e6,1)}M)"}
    except Exception:
        pass

    # ── 7) PRONÓSTICO (P venta del proyecto — contexto; el motor es a nivel proyecto) ──
    forecast = {"latente": True, "razon": "pronóstico a nivel proyecto no disponible"}
    try:
        import probability_engine as pe
        pr = await pe.compute_sells_complete(db, dev_id, months=12)
        p = pr.get("probability_pct")
        if p is not None:
            forecast = {"latente": False, "p_venta_proyecto_12m": float(p), "nivel": "proyecto",
                        "confianza": pr.get("confidence_lvl"), "explicacion": pr.get("explanation_es"),
                        "nota": "probabilidad a nivel proyecto (contexto); el ritmo de esta unidad lo da su curva de calor"}
    except Exception:
        pass

    return {
        "unidad": {"desarrollo": dev.get("name"), "dev_id": dev_id, "unidad": unit_number, "colonia": dev.get("colonia"),
                   "precio": unit.get("price"), "m2": unit.get("m2_total"), "recamaras": unit.get("bedrooms"),
                   "banos": unit.get("bathrooms"), "vista": unit.get("vista"), "piso": unit.get("level"),
                   "atributos": [lbl for fid, lbl in _ATTRS if unit.get(fid)], "status": unit.get("status")},
        "huella_demanda": huella, "embudo": embudo, "posicion_precio": posicion,
        "premium_atributos": premium, "competidoras": comp_list, "avm": avm, "pronostico": forecast,
        "lectura": f"{vistas} vistas · {guardados} guardados · {len(visitantes)} personas · percentil precio {posicion['percentil_en_colonia']} en su colonia",
        "fuente": "buyer_signals + DEVELOPMENTS.units + avm_public_engine + probability_engine",
    }
