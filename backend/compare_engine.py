"""COMPARE ENGINE — la capa del PORQUÉ. No 'cuántos' ni 'cuáles', sino: ¿qué atributo MUEVE qué resultado, y cuánto?
Parte la población por un facet (con/sin amenidades, preventa/inmediata, con/sin terraza, tier, geo…) y compara MÉTRICAS
DE RESULTADO (meses para vender, sell-through, absorción, precio/m², demanda) → el DELTA cuantificado con su n.

Responde la frase del founder: 'los proyectos sin amenidades tardan +N meses en venderse que los que sí tienen'.
"""
import datetime as dt
import statistics
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional


def _months_since(fl) -> Optional[float]:
    if not fl:
        return None
    try:
        f = dt.datetime.fromisoformat(str(fl).replace("Z", "")[:10])
        return max((dt.datetime.utcnow() - f).days / 30.0, 0.5)
    except Exception:
        return None


_SOLD = ("vendido", "reservado", "sold", "reserved", "apartado")


def _dev_metrics(d: Dict, sigcounts: Counter) -> Dict[str, Any]:
    """Métricas de resultado de UN desarrollo (las que se comparan)."""
    units = d.get("units") or []
    total = len(units)
    sold = sum(1 for u in units if str(u.get("status") or "").lower() in _SOLD)
    months = _months_since(d.get("fecha_lanzamiento"))
    absor = (sold / months) if months else None                      # unidades vendidas / mes
    meses_vender = ((total - sold) / absor) if absor and absor > 0.05 else None  # meses para agotar inventario
    prices = [u["price"] / u["m2_total"] for u in units if u.get("price") and u.get("m2_total")]
    return {
        "sell_through": round(100 * sold / total) if total else None,
        "absorcion": round(absor, 2) if absor is not None else None,
        "meses_vender": round(min(meses_vender, 120), 1) if meses_vender is not None else None,
        "precio_m2": round(statistics.median(prices)) if prices else None,
        "demanda": sigcounts.get(d.get("id"), 0),
        "n_units": total,
    }


# resultados comparables: id -> (etiqueta, unidad, mejor_es)
OUTCOMES = {
    "meses_vender": ("Meses para vender", "meses", "menos"),
    "sell_through": ("% vendido", "%", "más"),
    "absorcion": ("Absorción", "u/mes", "más"),
    "precio_m2": ("Precio por m²", "$/m²", "—"),
    "demanda": ("Demanda (señales)", "señales", "más"),
}


async def _dev_signal_counts(db, cutoff) -> Counter:
    counts: Counter = Counter()
    q = {"type": {"$in": ["ficha_view", "unit_view", "like", "save", "intent", "lead", "atlax_query"]}}
    if cutoff:
        q["created_at_dt"] = {"$gte": cutoff}
    async for s in db.buyer_signals.find(q, {"_id": 0, "entity_id": 1}):
        if s.get("entity_id"):
            counts[s["entity_id"]] += 1
    return counts


def _split_value(d, split):
    """Valor del facet de split para un desarrollo. Reusa los extractores del facet_engine + unit-level agregados."""
    import facet_engine as fe
    if split in fe._DEV_FACETS:
        return fe._DEV_FACETS[split](d)
    # splits a nivel unidad → atributo presente en el desarrollo (sí/no)
    if split in ("terraza", "balcon", "roof_garden", "bodega", "pet_friendly"):
        has = any(u.get(split) for u in (d.get("units") or []))
        return f"con {split}" if has else f"sin {split}"
    return None


SPLITS = ["amenidades_nivel", "entrega", "tamaño_edificio", "altura", "tier_precio", "creditos", "property_type",
          "colonia", "alcaldia", "terraza", "roof_garden", "bodega", "pet_friendly"]


async def compare(db, split: str, outcome: str = "meses_vender", geo: Optional[tuple] = None,
                  since_days: int = 365) -> Dict[str, Any]:
    """Parte los desarrollos por [split] y compara [outcome] entre grupos → el delta cuantificado con n."""
    from data_developments import DEVELOPMENTS
    import facet_engine as fe
    if outcome not in OUTCOMES:
        return {"error": f"resultado desconocido: {outcome}", "outcomes": list(OUTCOMES)}
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=since_days)
    sig = await _dev_signal_counts(db, cutoff)
    grupos: Dict[str, List[float]] = defaultdict(list)
    devs_por_grupo: Dict[str, int] = defaultdict(int)
    units_por_grupo: Dict[str, int] = defaultdict(int)
    for d in DEVELOPMENTS:
        if not fe._geo_match(d, geo):
            continue
        val = _split_value(d, split)
        if val is None:
            continue
        met = _dev_metrics(d, sig)
        ov = met.get(outcome)
        devs_por_grupo[val] += 1
        units_por_grupo[val] += met["n_units"]
        if ov is not None:
            grupos[val].append(ov)
    filas = []
    for val, vals in grupos.items():
        filas.append({"grupo": val, "valor": round(statistics.median(vals), 1), "n_desarrollos": devs_por_grupo[val],
                      "n_unidades": units_por_grupo[val], "n_con_dato": len(vals)})
    mejor_es = OUTCOMES[outcome][2]
    filas.sort(key=lambda r: r["valor"], reverse=(mejor_es == "más"))
    delta = None
    if len(filas) >= 2:
        vals = [f["valor"] for f in filas]
        delta = round(max(vals) - min(vals), 1)
    # lectura tipo founder
    lectura = None
    if len(filas) >= 2 and delta:
        peor, mejor = (filas[-1], filas[0]) if mejor_es != "—" else (filas[0], filas[-1])
        u = OUTCOMES[outcome][1]
        lectura = f"'{peor['grupo']}' vs '{mejor['grupo']}': {abs(delta)} {u} de diferencia en {OUTCOMES[outcome][0].lower()} (n={peor['n_desarrollos']} vs {mejor['n_desarrollos']} desarrollos)"
    latente = len(filas) == 0
    razon_latente = None
    if latente and outcome in ("meses_vender", "absorcion"):
        razon_latente = "requiere fecha_lanzamiento para medir velocidad — se activa cuando se capture (hoy solo 1/18 la tiene)"
    elif latente:
        razon_latente = "sin dato suficiente en los grupos"
    return {"split": split, "outcome": outcome, "outcome_label": OUTCOMES[outcome][0], "unidad": OUTCOMES[outcome][1],
            "mejor_es": mejor_es, "geo": list(geo) if geo else None, "grupos": filas, "delta": delta,
            "latente": latente, "razon_latente": razon_latente, "lectura": lectura,
            "procedencia": {"fuente": "DEVELOPMENTS.units + buyer_signals", "metodo": "mediana por grupo",
                            "cautela": "n bajo = señal débil; no inferir causalidad estricta"}}


async def auto_insights(db, geo: Optional[tuple] = None, min_delta_rel: float = 0.25, top: int = 15) -> Dict[str, Any]:
    """Barre split × outcome y sube los deltas más grandes y con sustento (n≥2 por grupo). El generador del 'porqué'."""
    pares = [(s, o) for s in SPLITS for o in ("meses_vender", "sell_through", "demanda", "precio_m2")]
    hallazgos = []
    for split, outcome in pares:
        try:
            r = await compare(db, split, outcome, geo=geo)
        except Exception:
            continue
        filas = [f for f in r.get("grupos", []) if f["n_con_dato"] >= 1 and f["n_desarrollos"] >= 2]
        if len(filas) < 2 or not r.get("delta"):
            continue
        vals = [f["valor"] for f in filas]
        base = max(abs(min(vals)), 1)
        rel = r["delta"] / base
        if rel < min_delta_rel:
            continue
        hallazgos.append({"split": split, "outcome": outcome, "delta": r["delta"], "unidad": r["unidad"],
                          "rel": round(rel, 2), "lectura": r["lectura"], "grupos": filas[:4],
                          "confianza": "alta" if all(f["n_desarrollos"] >= 4 for f in filas[:2]) else "media" if all(f["n_desarrollos"] >= 2 for f in filas[:2]) else "baja"})
    hallazgos.sort(key=lambda h: -h["rel"])
    return {"hallazgos": hallazgos[:top], "geo": list(geo) if geo else None,
            "lectura": "qué atributo mueve qué resultado, cuantificado — ordenado por impacto relativo (con n y cautela)",
            "splits": SPLITS, "outcomes": list(OUTCOMES)}
