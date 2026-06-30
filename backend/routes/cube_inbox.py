"""BUZÓN CROSS-PORTAL — el LECTOR de `db.cube_actions`. Cierra el flywheel agéntico.

El superadmin (el cubo) ESCRIBE acciones ruteadas (`activacion.activar` → db.cube_actions: 'construye esto' al dev,
'esta oportunidad calza con N leads' al asesor). Hasta ahora el buzón se escribía SIN LECTOR (lazo abierto).
Aquí el dev y el asesor LEEN su buzón y lo ACTÚAN (marcar visto/aplicado/descartado). Reusa activacion.listar /
activacion.actualizar_estado — no duplica. Para el dev, marca relevancia por sus colonias y las ordena primero.
"""
from typing import Any, Set

from fastapi import APIRouter, Request

router = APIRouter(tags=["cube-inbox"])


async def _dev_colonias(db, user) -> Set[str]:
    """Colonias donde el dev tiene proyectos — para priorizar las acciones que le tocan."""
    try:
        from routes.developer import _user_dev_ids
        dev_ids = _user_dev_ids(user)
    except Exception:
        dev_ids = []
    cols: Set[str] = set()
    if dev_ids:
        async for d in db.developments.find({"developer_id": {"$in": list(dev_ids)}}, {"colonia_id": 1, "colonia": 1}):
            c = d.get("colonia_id") or d.get("colonia")
            if c:
                cols.add(c)
    return cols


@router.get("/api/desarrollador/cube-actions")
async def dev_cube_actions(request: Request) -> Any:
    """Buzón del DEV: lo que el cubo le mandó construir/ajustar. Relevantes (sus colonias) primero."""
    from routes.developer import require_dev_admin
    user = await require_dev_admin(request)
    db = request.app.state.db
    import activacion as ac
    res = await ac.listar(db, destino="dev", estado="pendiente")
    cols = await _dev_colonias(db, user)
    for a in res["acciones"]:
        a["relevante"] = bool(a.get("colonia") and a["colonia"] in cols)
    res["acciones"] = sorted(res["acciones"], key=lambda a: 0 if a.get("relevante") else 1)  # estable: relevantes primero
    res["mias"] = sum(1 for a in res["acciones"] if a.get("relevante"))
    return res


@router.post("/api/desarrollador/cube-actions/{action_id}/estado")
async def dev_cube_action_estado(action_id: str, request: Request) -> Any:
    from routes.developer import require_dev_admin
    await require_dev_admin(request)
    db = request.app.state.db
    b = await request.json()
    import activacion as ac
    return await ac.actualizar_estado(db, action_id, b.get("estado", "visto"))


@router.get("/api/desarrollador/memory")
async def dev_memory(request: Request) -> Any:
    """Contexto persistente del DEV (lente Personal): sus zonas de foco + historial de decisiones + tesis inferida.
    La memoria propia del dev (no depende del Cerebro, que está off por flag)."""
    from routes.developer import require_dev_admin, _user_dev_ids
    user = await require_dev_admin(request)
    db = request.app.state.db
    import dev_memory_engine as dm
    return await dm.get_dev_context(
        db, user_id=getattr(user, "user_id", None),
        org_id=getattr(user, "tenant_id", None) or getattr(user, "org_id", None),
        dev_ids=_user_dev_ids(user),
    )


@router.get("/api/asesor/cube-actions")
async def asesor_cube_actions(request: Request) -> Any:
    """Buzón del ASESOR: oportunidades que el cubo detectó y que calzan con leads que ya buscan ese segmento."""
    from routes.advisor import require_advisor
    await require_advisor(request)
    db = request.app.state.db
    import activacion as ac
    return await ac.listar(db, destino="asesor", estado="pendiente")


@router.post("/api/asesor/cube-actions/{action_id}/estado")
async def asesor_cube_action_estado(action_id: str, request: Request) -> Any:
    from routes.advisor import require_advisor
    await require_advisor(request)
    db = request.app.state.db
    b = await request.json()
    import activacion as ac
    return await ac.actualizar_estado(db, action_id, b.get("estado", "visto"))
