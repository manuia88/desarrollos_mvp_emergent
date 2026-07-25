"""Filtro ÚNICO para separar los leads REALES de los de demostración.

POR QUÉ (auditoría A–Z 2026-07-24): de los 59 leads de la base, 28 son de demostración —vienen con
`_demo_home: True` y hasta con el id escrito `lead_demo_0`— y 53 apuntan a un proyecto que ya fue
borrado. Los tableros los contaban todos por igual, así que el founder veía "leads" que no existen y
ningún asesor podría trabajar.

No se borran: se marcan como lo que son y se excluyen al contar. Borrarlos perdería el rastro de las
pruebas y no arregla la causa, que es contar sin filtrar.

USO:
    from leads_reales import SOLO_REALES, con_reales
    n = await db.leads.count_documents(con_reales({"development_id": dev_id}))
"""
from __future__ import annotations

from typing import Any, Dict

# Un lead es de demostración si trae CUALQUIERA de estas marcas.
SOLO_REALES: Dict[str, Any] = {
    "_demo_home": {"$ne": True},          # marca explícita del sembrado demo
    "env": {"$ne": "demo"},               # ambiente marcado como demo
    "id": {"$not": {"$regex": "^lead_demo"}},   # id que se autodeclara demo
    "proyecto_borrado": {"$ne": True},    # su desarrollo ya no existe: no es trabajable
}


def con_reales(consulta: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """Agrega el filtro de leads reales a una consulta existente, sin pisar sus condiciones."""
    q = dict(consulta or {})
    cond = [SOLO_REALES]
    if q:
        cond.append(q)
    return {"$and": cond} if len(cond) > 1 else dict(SOLO_REALES)


def es_real(lead: Dict[str, Any]) -> bool:
    """Misma regla, para filtrar en memoria una lista ya cargada."""
    if not lead:
        return False
    if lead.get("_demo_home") is True or lead.get("env") == "demo":
        return False
    if str(lead.get("id") or "").startswith("lead_demo"):
        return False
    if lead.get("proyecto_borrado") is True:
        return False
    return True
