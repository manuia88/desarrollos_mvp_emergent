"""Developer Track Record (founder checklist · devs destacados) — track record VERIFICABLE, no auto-reportado:
cruza datos REALES del propio sistema (fechas prometidas vs reales, historial de precio, avance de obra) para
que el % en tiempo y la plusvalía NO sean afirmaciones del dev sino medición. build-for-endstate: cada métrica
es fail-open; se prende conforme entra el dato (entregas reales, más proyectos).

NO publica un ranking mientras los devs sean de ejemplo (regla del founder: cero inventado); expone el track
record POR desarrollador para su propia ficha/confianza. El ranking público se enciende con devs reales.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.dev_track_record")


def _plusvalia_obra(price_history: Optional[List[Dict[str, Any]]]) -> Optional[float]:
    """Plusvalía acumulada durante la obra: precio 'Hoy' vs 'Lanzamiento' del propio historial del proyecto."""
    if not price_history or len(price_history) < 2:
        return None
    try:
        base = float(price_history[0].get("price") or 0)
        hoy = float(price_history[-1].get("price") or 0)
        if base > 0 and hoy > 0:
            return round((hoy / base - 1) * 100, 1)
    except Exception:  # noqa: BLE001
        return None
    return None


def _en_tiempo(cp: Any) -> Optional[bool]:
    """¿El proyecto va en tiempo? Lee construction_progress.status (dato ya mostrado en la ficha)."""
    if not isinstance(cp, dict):
        return None
    st = (cp.get("status") or "").lower()
    if "tiempo" in st or "según calendario" in st or "adelant" in st:
        return True
    if "retras" in st or "demor" in st:
        return False
    return None


async def compute_developer_track_record(db, developer_id: str) -> Dict[str, Any]:
    """Track record medido de un desarrollador desde sus proyectos reales. Fail-open por métrica."""
    # Fuente rica: el seed DEVELOPMENTS_BY_ID (price_history + construction_progress). Fallback a db.developments
    # (proyectos ingeridos/reales). Merge por id para no duplicar.
    projects, seen = [], set()
    try:
        from data_developments import DEVELOPMENTS_BY_ID
        for d in DEVELOPMENTS_BY_ID.values():
            if d.get("developer_id") == developer_id:
                projects.append(d)
                seen.add(d.get("id"))
    except Exception:  # noqa: BLE001
        pass
    async for d in db.developments.find(
            {"developer_id": developer_id},
            {"_id": 0, "id": 1, "name": 1, "delivery_estimate": 1, "delivered_at": 1,
             "fecha_entrega_real": 1, "construction_progress": 1, "price_history": 1}):
        if d.get("id") not in seen:
            projects.append(d)
    n = len(projects)
    entregados = [p for p in projects if p.get("delivered_at") or p.get("fecha_entrega_real")]
    # % ENTREGA A TIEMPO (solo con entregas reales → dormido hasta que haya)
    on_time, on_time_base = 0, 0
    for p in entregados:
        real = p.get("delivered_at") or p.get("fecha_entrega_real")
        prometido = p.get("delivery_estimate")
        if real and prometido:
            on_time_base += 1
            if str(real)[:7] <= str(prometido)[:7]:
                on_time += 1
    on_time_pct = round(100 * on_time / on_time_base) if on_time_base else None
    # EN TIEMPO ahora (proyectos en desarrollo con status en calendario) — proxy real mientras no hay entregas
    en_tiempo_flags = [_en_tiempo(p.get("construction_progress")) for p in projects]
    en_tiempo_flags = [x for x in en_tiempo_flags if x is not None]
    en_tiempo_pct = round(100 * sum(1 for x in en_tiempo_flags if x) / len(en_tiempo_flags)) if en_tiempo_flags else None
    # PLUSVALÍA durante obra (del historial de precio de cada proyecto)
    plusvs = [x for x in (_plusvalia_obra(p.get("price_history")) for p in projects) if x is not None]
    plusvalia_obra_pct = round(sum(plusvs) / len(plusvs), 1) if plusvs else None
    return {
        "developer_id": developer_id,
        "proyectos": n,
        "entregados": len(entregados),
        "on_time_pct": on_time_pct,                 # % entrega a tiempo (dormido hasta 1ra entrega real)
        "on_time_muestra": on_time_base,
        "en_tiempo_pct": en_tiempo_pct,             # % de proyectos en desarrollo que van en calendario
        "plusvalia_obra_pct": plusvalia_obra_pct,   # plusvalía promedio acumulada durante la obra
        "fuente": "medido de fechas prometidas vs reales, avance de obra e historial de precio (no auto-reportado)",
    }
