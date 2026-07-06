"""VISTAS GUARDADAS + ALERTAS — la productividad del analista. Guarda una definición de cubo (criterios del screener, nodo
del explorador, config del heatmap) con un nombre; vuelve a ella con un clic; y opcionalmente pone una ALERTA por umbral
('avísame cuando el gap de terraza en Polanco pase de 50'). Persistente en db.saved_views. Reusa screener para evaluar.
"""
import datetime as dt
import uuid
from typing import Any, Dict, Optional


async def guardar(db, nombre: str, tipo: str, definicion: Dict[str, Any], alerta: Optional[Dict] = None) -> Dict[str, Any]:
    """tipo: 'screener'|'explorador'|'heatmap'|'memorandum'. definicion: el estado para reconstruir la vista.
    alerta (opcional): {metrica, op, valor, colonia} para vigilar un umbral."""
    doc = {"id": f"view_{uuid.uuid4().hex[:10]}", "nombre": nombre, "tipo": tipo, "definicion": definicion,
           "alerta": alerta, "created_at": dt.datetime.utcnow(), "ultimo_check": None, "disparada": False}
    await db.saved_views.insert_one(dict(doc))
    doc.pop("_id", None)
    return {"ok": True, "vista": {k: v for k, v in doc.items() if k != "created_at"}}


async def listar(db) -> Dict[str, Any]:
    vistas = []
    async for v in db.saved_views.find({}, {"_id": 0}).sort("created_at", -1):
        v["created_at"] = v["created_at"].isoformat() if isinstance(v.get("created_at"), dt.datetime) else None
        v["ultimo_check"] = v["ultimo_check"].isoformat() if isinstance(v.get("ultimo_check"), dt.datetime) else None
        vistas.append(v)
    return {"vistas": vistas, "total": len(vistas)}


async def borrar(db, view_id: str) -> Dict[str, Any]:
    r = await db.saved_views.delete_one({"id": view_id})
    return {"ok": r.deleted_count > 0, "id": view_id}


async def evaluar_alertas(db) -> Dict[str, Any]:
    """Recorre las vistas con alerta, evalúa el umbral (reusa screener._valor) y marca las disparadas."""
    import screener as sc
    disparadas = []
    async for v in db.saved_views.find({"alerta": {"$ne": None}}, {"_id": 0}):
        a = v["alerta"]
        if a.get("tipo") == "corte":   # las alertas de corte del Explorador las evalúa evaluar_alertas_corte
            continue
        col = a.get("colonia")
        try:
            valor = await sc._valor(db, a["metrica"], col) if col else None
        except Exception:
            valor = None
        op = sc._OPS.get(a.get("op"))
        cumple = bool(valor is not None and op and op(valor, a.get("valor")))
        await db.saved_views.update_one({"id": v["id"]}, {"$set": {"ultimo_check": dt.datetime.utcnow(), "disparada": cumple, "valor_actual": valor}})
        if cumple:
            disparadas.append({"vista": v["nombre"], "id": v["id"], "metrica": a["metrica"], "colonia": col,
                               "valor_actual": valor, "umbral": f"{sc._OP_TXT.get(a['op'],'')} {a['valor']}",
                               "lectura": f"'{v['nombre']}': {sc._label(a['metrica'])} en {col} = {valor} ({sc._OP_TXT.get(a['op'],'')} {a['valor']})"})
    return {"disparadas": disparadas, "total_con_alerta": await db.saved_views.count_documents({"alerta": {"$ne": None}}),
            "lectura": f"{len(disparadas)} alertas activas"}


# ─── CUBO TOTAL F3 · ALERTAS POR CORTE (Explorador) ───────────────────────────
# Una vista tipo 'explorador' con alerta={"tipo":"corte","activa":True,"umbral_pct":10} se re-corre
# cada mañana: si el corte CAMBIÓ (entraron/salieron unidades, movió el precio promedio o la
# absorción más que el umbral), notifica a los superadmins con deep-link al Hub.
# La primera corrida solo fija el snapshot base (no dispara — sin línea base no hay cambio honesto).

def _delta_corte(viejo: Optional[Dict], nuevo: Dict, umbral_pct: float) -> list:
    if not viejo:
        return []
    cambios = []
    dn = (nuevo.get("n") or 0) - (viejo.get("n") or 0)
    if dn > 0:
        cambios.append(f"entraron {dn} unidades al corte")
    elif dn < 0:
        cambios.append(f"salieron {-dn} unidades del corte")
    va, vn = viejo.get("precio_prom"), nuevo.get("precio_prom")
    if va and vn and va > 0:
        pct = (vn - va) / va * 100
        if abs(pct) >= umbral_pct:
            cambios.append(f"precio promedio {'subió' if pct > 0 else 'bajó'} {abs(pct):.1f}%")
    # absorción se compara en PUNTOS (0→50 ES el cambio más grande del mercado, no un falsy a saltar)
    va, vn = viejo.get("absorcion_pct"), nuevo.get("absorcion_pct")
    if va is not None and vn is not None and abs(vn - va) >= umbral_pct:
        cambios.append(f"absorción {'subió' if vn > va else 'bajó'} {abs(vn - va):.1f} pts")
    return cambios


async def evaluar_alertas_corte(db) -> Dict[str, Any]:
    """Re-corre cada corte guardado con alerta activa, compara vs snapshot y notifica cambios."""
    import cube_query_libre as ql
    disparadas = []
    revisadas = 0
    async for v in db.saved_views.find({"tipo": "explorador", "alerta.tipo": "corte",
                                        "alerta.activa": True}, {"_id": 0}):
        revisadas += 1
        d = v.get("definicion") or {}
        try:
            r = await ql.consulta(db, d.get("filtros") or [], d.get("agrupar_por") or [],
                                  universo=d.get("universo") or "unidades")
        except Exception:  # noqa: BLE001
            continue
        if not r.get("ok"):
            continue
        k = r.get("kpis") or {}
        nuevo = {"n": r.get("n"), "precio_prom": k.get("precio_prom"), "absorcion_pct": k.get("absorcion_pct")}
        cambios = _delta_corte(v.get("snapshot"), nuevo, float(v["alerta"].get("umbral_pct", 10)))
        await db.saved_views.update_one({"id": v["id"]}, {"$set": {
            "snapshot": nuevo, "ultimo_check": dt.datetime.utcnow(), "disparada": bool(cambios)}})
        if cambios:
            disparadas.append({"vista": v["nombre"], "id": v["id"], "cambios": cambios})
            try:
                from notifications_engine import emit_notification
                async for su in db.users.find({"role": "superadmin"}, {"_id": 0, "user_id": 1, "id": 1}).limit(50):
                    su_id = su.get("user_id") or su.get("id")
                    if su_id:
                        await emit_notification(
                            db, user_id=su_id, type="cube_view_alert", severity="normal",
                            title=f"Tu corte '{v['nombre']}' cambió",
                            body=" · ".join(cambios),
                            payload={"view_id": v["id"], "cambios": cambios},
                            action_url="/superadmin/mercado")
            except Exception:  # noqa: BLE001
                pass
    return {"revisadas": revisadas, "disparadas": disparadas,
            "lectura": f"{len(disparadas)} cortes cambiaron de {revisadas} vigilados"}


def register_vistas_corte_cron(scheduler, db) -> None:
    """Cron 07:30 MX — evalúa los cortes guardados antes de que empiece el día del founder."""
    from apscheduler.triggers.cron import CronTrigger
    from cron_heartbeat import wrap_apscheduler_job
    wrapped = wrap_apscheduler_job(evaluar_alertas_corte, "cube_view_alerts")
    scheduler.add_job(wrapped, CronTrigger(hour=7, minute=30, timezone="America/Mexico_City"),
                      id="cube_view_alerts", replace_existing=True, kwargs={"db": db})
