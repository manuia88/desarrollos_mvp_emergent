"""
DMX · Fase 2.4 — EL CEREBRO SOBRE EL CUBO (detección → propuesta → tu OK)
═══════════════════════════════════════════════════════════════════════════════
Cierra el ciclo IA-first: el cubo + las capas IA (hedónico, demand-gap, prob_venta)
se convierten en ACCIONES agénticas. El detector lee el cubo, detecta señales, y
PROPONE tareas al Cerebro (cerebro/store.propose_task) usando las acciones DEV que
ya existen en el registry (dev.where_to_build, dev.best_amenity, deal.change_price,
dev.health_alert). Cada propuesta pasa por los candados (autoriza + multi-tenant);
las delicadas quedan AWAITING_APPROVAL → el humano aprueba en la Sala de Control.

Multi-tenant: el mercado (demand-gap, hedónico) es compartido; precio-fuera-de-mercado
y unidades-estancadas se acotan a los desarrollos del usuario (tenant_scope).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from dmx_unit_schema import COLLECTIONS
import dmx_demand
import dmx_hedonic_atom
from cerebro import store
from cerebro.contract import CEREBRO_TASKS

import logging

log = logging.getLogger("dmx.cerebro_market")

UNITS = COLLECTIONS["units"]


async def _already_open(db, user, action: str, titulo: Optional[str]) -> bool:
    """Evita duplicar la misma jugada si ya está abierta (idempotente entre cargas)."""
    try:
        uid = store._uid_of(user)
        doc = await db[CEREBRO_TASKS].find_one({
            "user_id": uid, "action": action, "params.titulo": titulo,
            "status": {"$in": ["proposed", "awaiting_approval"]}})
        return doc is not None
    except Exception:
        return False


# Filtro imposible: no empata con nada. Es lo que se devuelve cuando NO se puede establecer qué
# desarrollos son del usuario. Un filtro de permisos que falla debe CERRAR, nunca abrir.
_NADA: Dict[str, Any] = {"development_id": {"$in": []}}


async def _dev_unit_query(db, user) -> Dict[str, Any]:
    """Filtro del átomo acotado a los desarrollos del usuario (superadmin = todo).

    FUGA DE DATOS ENTRE CLIENTES, corregida (auditoría 07-26). Tenía dos fallas encadenadas:

      1. Leía `user_dev_ids`, que resuelve contra la semilla EN MEMORIA — y esa semilla se apagó el
         14-jul: hoy tiene 0 elementos. Así que cualquier usuario que no fuera superadmin obtenía
         lista vacía, siempre.
      2. Y con la lista vacía devolvía `{}`, que en Mongo significa **sin filtro**. O sea: no poder
         determinar qué es tuyo daba acceso a TODO.

    El resultado real: el Cerebro recorría las 6,420 unidades de los 134 desarrollos y proponía
    "baja el precio de esta unidad" nombrando el identificador, el precio por m² y la colonia **de
    otro cliente**. Con `CEREBRO_ENABLED=true` y aceptando a cualquier usuario con sesión.

    Ahora: se resuelve contra la BASE (`user_dev_ids_db`, que es la que conoce los desarrollos
    ingeridos), y si no se puede determinar la pertenencia se devuelve un filtro que no empata con
    nada. Sin datos propios se ve vacío, no se ve todo.
    """
    try:
        import tenant_scope
        if tenant_scope.is_superadmin(user):
            return {}
        ids = await tenant_scope.user_dev_ids_db(db, user)
        return {"development_id": {"$in": ids}} if ids else _NADA
    except Exception:  # noqa: BLE001
        log.warning("[cerebro] no se pudo acotar por cliente — se cierra el filtro", exc_info=True)
        return _NADA


async def _zone_medians(db) -> Dict[str, float]:
    return await dmx_demand._colonia_median_pm2(db)


async def _price_outlier(db, user, medians: Dict[str, float]) -> Optional[Dict[str, Any]]:
    """Unidad disponible del dev con precio/m² más por ENCIMA de la mediana de su zona."""
    q = {**(await _dev_unit_query(db, user)), "commercial.status": "disponible"}
    worst = None
    async for a in db[UNITS].find(q, {"_id": 0, "unit_id": 1, "areas": 1, "commercial": 1, "geo": 1, "tipologia": 1}):
        com = a.get("commercial") or {}; areas = a.get("areas") or {}
        z = (a.get("geo") or {}).get("colonia_id")
        precio = com.get("precio_lista_mxn"); m2 = areas.get("m2_privativo") or areas.get("m2_construido")
        if not (precio and m2 and z and medians.get(z)):
            continue
        pm2 = precio / m2
        delta = (pm2 / medians[z] - 1) * 100
        if worst is None or delta > worst["delta_pct"]:
            worst = {"unit_id": a["unit_id"], "colonia": z, "tipologia": a.get("tipologia"),
                     "precio_m2": round(pm2), "zona_mediana_m2": round(medians[z]), "delta_pct": round(delta, 1)}
    if worst and worst["delta_pct"] >= 12:  # >12% sobre la zona = vale la pena revisar
        worst["titulo"] = f"{worst['unit_id']} está {worst['delta_pct']}% sobre la zona"
        worst["detalle"] = f"${worst['precio_m2']:,}/m² vs mediana ${worst['zona_mediana_m2']:,}/m² en {worst['colonia']}"
        return worst
    return None


async def _stale_units(db, user) -> Optional[Dict[str, Any]]:
    """Unidades disponibles del dev con prob. de venta baja (estancadas)."""
    q = {**(await _dev_unit_query(db, user)), "commercial.status": "disponible",
         "demand.prob_venta": {"$lt": 0.4}}
    n = await db[UNITS].count_documents(q)
    if n <= 0:
        return None
    sample = []
    async for a in db[UNITS].find(q, {"_id": 0, "unit_id": 1}).limit(5):
        sample.append(a["unit_id"])
    return {"count": n, "ejemplos": sample,
            "titulo": f"{n} unidades con baja probabilidad de venta",
            "detalle": "Revisa precio/marketing o reasigna asesor"}


async def detect_and_propose(db, user, *, max_proposals: int = 6) -> Dict[str, Any]:
    """Lee el cubo → detecta → propone tareas al Cerebro (con tu OK donde aplica)."""
    proposed: List[Dict[str, Any]] = []

    async def _propose(action, params, reason):
        if await _already_open(db, user, action, params.get("titulo")):
            return  # ya está abierta esta misma jugada · no duplicar
        r = await store.propose_task(db, user, action=action, params=params,
                                     proposed_by="cerebro:market", reason=reason)
        if r.get("ok"):
            proposed.append({"action": action, "status": r["task"]["status"],
                             "needs_approval": r["task"]["needs_approval"], "params": params})

    # 1) ¿Dónde construir? — top demand-gap (mercado compartido)
    try:
        g = await dmx_demand.demand_gap(db, top=4)
        for cell in g["cells"]:
            if len(proposed) >= 2:
                break
            if cell["verdict"].startswith(("Demanda sin", "Se agota")):
                await _propose("dev.where_to_build",
                               {"colonia": cell["colonia"], "tipologia": cell["tipologia"],
                                "available": cell["available"], "absorcion_pct": cell["absorcion_pct"],
                                "titulo": f"Construir {str(cell['tipologia']).replace('_',' ')} en {cell['colonia']}",
                                "detalle": f"{cell['verdict']} · {cell['available']} disp · absorción {cell['absorcion_pct']}%"},
                               "demand-gap del cubo")
    except Exception:
        pass

    # 2) ¿Qué amenidad vende? — hedónico (mercado compartido)
    try:
        h = await dmx_hedonic_atom.fit_and_rank(db, None, persist=False)
        top = next((a for a in h.get("amenity_ranker", [])
                    if a["significativo"] and a["impacto_pct_precio_m2"] > 0), None)
        if top:
            await _propose("dev.best_amenity",
                           {"amenity": top["atributo"], "impacto_pct": top["impacto_pct_precio_m2"],
                            "titulo": f"{top['atributo']} suma +{top['impacto_pct_precio_m2']}% al precio/m²",
                            "detalle": "Priorízalo en producto y marketing"},
                           "hedónico del cubo")
    except Exception:
        pass

    # 3) Precio fuera de mercado — unidad del dev (delicada → tu OK)
    try:
        medians = await _zone_medians(db)
        out = await _price_outlier(db, user, medians)
        if out:
            await _propose("deal.change_price", out, "precio vs mediana de zona")
    except Exception:
        pass

    # 4) Unidades estancadas — del dev
    try:
        stale = await _stale_units(db, user)
        if stale:
            await _propose("dev.health_alert", stale, "prob. de venta baja")
    except Exception:
        pass

    return {"proposed": len(proposed), "tasks": proposed[:max_proposals]}