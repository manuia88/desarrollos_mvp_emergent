"""SANKEY DE SUSTITUCIÓN — el grafo de la competencia real. Cuando un comprador no encuentra X, ¿a qué se va? Reconstruye
los flujos de la misma persona (visitor_id) entre segmentos: qué tipología buscó vs qué tipologías terminó viendo, o de
qué zona a qué zona. Define la competencia REAL (lo que sustituye a lo que). Reusa buyer_signals (visitor_id + entity/unit).
"""
from collections import Counter, defaultdict
from typing import Any, Dict, List


async def sankey(db, por: str = "tipologia", geo=None, top: int = 20) -> Dict[str, Any]:
    """Flujos origen→destino de la misma persona. por='tipologia' (rec→rec) o 'zona' (colonia→colonia)."""
    from data_developments import DEVELOPMENTS_BY_ID
    import facet_engine as fe
    # 1) por visitor: la secuencia de unidades/zonas que vio
    vistos: Dict[str, List] = defaultdict(list)
    q = {"type": {"$in": ["unit_view", "ficha_view", "view"]}, "visitor_id": {"$ne": None}}
    cols = fe._geo_cols(geo) if geo else None
    if cols:
        q["colonia"] = {"$in": list(cols)}
    async for s in db.buyer_signals.find(q, {"_id": 0, "visitor_id": 1, "entity_id": 1, "unit_number": 1, "created_at_dt": 1}):
        d = DEVELOPMENTS_BY_ID.get(s.get("entity_id"))
        if not d:
            continue
        if por == "zona":
            seg = d.get("colonia") or d.get("colonia_id")
        else:  # tipologia — necesita la unidad
            u = next((x for x in (d.get("units") or []) if str(x.get("unit_number")) == str(s.get("unit_number"))), None)
            seg = fe._band_recamaras(u.get("bedrooms")) if u else None
        if seg:
            vistos[s["visitor_id"]].append((s.get("created_at_dt"), seg))
    # 2) flujos consecutivos (de un segmento al siguiente que vio la misma persona)
    flujos: Counter = Counter()
    for vid, seq in vistos.items():
        seq = [s for _, s in sorted([(t or 0, s) for t, s in seq], key=lambda x: str(x[0]))]
        for a, b in zip(seq, seq[1:]):
            if a != b:
                flujos[(a, b)] += 1
    enlaces = [{"origen": k[0], "destino": k[1], "n": v} for k, v in flujos.most_common(top)]
    nodos = sorted({x for k in flujos for x in k})
    return {"por": por, "geo": list(geo) if geo else None, "nodos": nodos, "enlaces": enlaces,
            "lectura": f"competencia real: cuando alguien vio un segmento y luego otro ({por}). El flujo grueso = sustitución frecuente.",
            "fuente": "buyer_signals (misma persona, secuencia de vistas)"}
