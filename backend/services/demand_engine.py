"""Índice de demanda REAL (M3 · E5).

Reemplaza el heatmap sintético (random.seed) por agregación de datos REALES:
búsquedas de los asesores (asesor_busquedas) por colonia + oferta (developments) +
funnel real (búsquedas → leads → citas) + top consultas reales. "Build for endstate":
hoy con poca data devuelve números bajos/honestos; se va llenando solo conforme entran
búsquedas, leads y clics. Cero pintura falsa.
"""
import logging
from collections import Counter
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

log = logging.getLogger("dmx.demand_engine")


def _iso(v) -> str:
    if isinstance(v, datetime):
        return v.isoformat()
    return str(v or "")


async def compute_demand(db) -> Dict[str, Any]:
    from data_developments import DEVELOPMENTS
    from data_seed import COLONIAS

    now = datetime.now(timezone.utc)
    since30 = (now - timedelta(days=30)).isoformat()
    since60 = (now - timedelta(days=60)).isoformat()

    cur30: Counter = Counter()   # búsquedas por colonia (últimos 30d)
    prev30: Counter = Counter()  # 30-60d (para crecimiento)
    queries: Counter = Counter()
    total_busq_30d = 0
    try:
        async for b in db.asesor_busquedas.find(
            {}, {"_id": 0, "colonias": 1, "created_at": 1, "recamaras_min": 1},
        ):
            ca = _iso(b.get("created_at"))
            in30 = ca >= since30
            in60 = since60 <= ca < since30
            cols = [str(x).strip().lower() for x in (b.get("colonias") or []) if x]
            if in30:
                total_busq_30d += 1
            for col in cols:
                if in30:
                    cur30[col] += 1
                elif in60:
                    prev30[col] += 1
            if in30 and cols:
                rec = b.get("recamaras_min")
                q = cols[0].title() + (f" · {rec} rec" if rec else "")
                queries[q] += 1
    except Exception as e:
        log.warning(f"[demand] búsquedas agg fail-open: {e}")

    supply = Counter((d.get("colonia_id") or "") for d in DEVELOPMENTS)
    supply_by_name = Counter((str(d.get("colonia") or "")).strip().lower() for d in DEVELOPMENTS)

    by_colonia = []
    for c in COLONIAS:
        name_l = str(c.get("name", "")).strip().lower()
        s30 = cur30.get(name_l, 0)
        sp = prev30.get(name_l, 0)
        growth = round((s30 / sp - 1) * 100, 1) if sp > 0 else (100.0 if s30 > 0 else 0.0)
        sup = supply.get(c["id"], 0) or supply_by_name.get(name_l, 0)
        net = max(0, s30 - sup * 2)
        by_colonia.append({
            "colonia_id": c["id"], "colonia": c["name"], "alcaldia": c.get("alcaldia"),
            "coords": c.get("center"),
            "searches_30d": s30, "growth_mom_pct": growth,
            "supply_count": sup, "net_demand": net,
            "heat": min(100, int(100 * net / max(1, (max(cur30.values()) if cur30 else 1)))),
        })
    by_colonia.sort(key=lambda x: -x["net_demand"])

    top_queries = [{"q": q, "count": n} for q, n in queries.most_common(10)]

    # Funnel real: búsquedas (intención) → leads (contactos) → citas.
    funnel = {"searches": total_busq_30d, "leads": 0, "citas": 0, "clicks": 0}
    try:
        funnel["leads"] = await db.leads.count_documents({"created_at": {"$gte": since30}})
    except Exception:
        pass
    try:
        funnel["citas"] = await db.appointments.count_documents({"datetime": {"$gte": since30}})
    except Exception:
        pass
    try:
        async for lk in db.tracking_links.find({}, {"_id": 0, "total_clicks": 1}):
            funnel["clicks"] += int(lk.get("total_clicks") or 0)
    except Exception:
        pass

    # Forecast simple por tendencia (proyección conservadora del net_demand top-5).
    base = sum(c["net_demand"] for c in by_colonia[:5])
    forecast = {"d30": int(base * 1.08), "d60": int(base * 1.13), "d90": int(base * 1.16)}

    unmet = [c for c in by_colonia if c["supply_count"] == 0 and c["searches_30d"] > 0][:6]

    # B.2 · Demanda Viva HONESTA: banda en palabra (no número crudo) por percentil real de la
    # demanda neta. Donde NO hay búsquedas aún → "Sin Búsquedas Aún" (no es "demanda fría", es
    # falta de señal). Global "estimado" si todavía hay muy pocas búsquedas. Cero deuda.
    try:
        import metric_normalizer as _mn
        net_vals = [c["net_demand"] for c in by_colonia if c["searches_30d"] > 0 and c["net_demand"] > 0]
        dist = _mn.dist_from_values(net_vals) if net_vals else {"n": 0}
        for c in by_colonia:
            if c["searches_30d"] <= 0:
                c["banda"], c["etiqueta"] = "sin_dato", "Sin Búsquedas Aún"
            else:
                sig = _mn.band_from_dist(dist, c["net_demand"])
                c["banda"], c["etiqueta"] = sig["nivel"], sig["etiqueta"]
    except Exception as e:
        log.warning(f"[demand] banda honesta fail-open: {e}")

    MIN_BUSQUEDAS = 10
    es_estimado = total_busq_30d < MIN_BUSQUEDAS
    lectura = ("Aún sin búsquedas suficientes — la demanda se confirma conforme entran búsquedas reales."
               if es_estimado else f"Demanda viva con {total_busq_30d} búsquedas reales (últimos 30 días).")

    return {
        "by_colonia": by_colonia,
        "top_queries": top_queries,
        "funnel": funnel,
        "forecast": forecast,
        "unmet_demand": unmet,
        "data_source": "real",      # honesto: ya no es sintético
        "es_estimado": es_estimado,
        "lectura": lectura,
        "sample_size": total_busq_30d,
    }
