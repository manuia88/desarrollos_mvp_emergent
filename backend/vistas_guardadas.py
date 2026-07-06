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


async def _huella_corte(db, ref_tipo: str, ref_id: str, medidas: Dict[str, Any]) -> None:
    """F5 · un punto de historia por (corte, día) — idempotente (re-correr el cron no duplica)."""
    try:
        fecha = dt.datetime.utcnow().strftime("%Y-%m-%d")
        await db.cube_corte_snapshots.update_one(
            {"ref_tipo": ref_tipo, "ref_id": ref_id, "fecha": fecha},
            {"$set": {**{k: v for k, v in medidas.items()}, "at": dt.datetime.utcnow()}},
            upsert=True)
    except Exception:  # noqa: BLE001 — la historia jamás tumba la alerta
        pass


async def evaluar_alertas_corte(db) -> Dict[str, Any]:
    """Re-corre cada corte guardado con alerta activa, compara vs snapshot y notifica cambios."""
    import cube_query_libre as ql
    disparadas = []
    revisadas = 0
    async for v in db.saved_views.find({"tipo": "explorador"}, {"_id": 0}):
        # auditoría F5: la HUELLA es para TODAS las vistas (el 📈 lo promete); la alerta solo
        # decide si además se notifica.
        alerta_activa = (v.get("alerta") or {}).get("tipo") == "corte" and (v.get("alerta") or {}).get("activa")
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
        umbral = float((v.get("alerta") or {}).get("umbral_pct", 10))
        cambios = _delta_corte(v.get("snapshot"), nuevo, umbral) if alerta_activa else []
        await db.saved_views.update_one({"id": v["id"]}, {"$set": {
            "snapshot": nuevo, "ultimo_check": dt.datetime.utcnow(), "disparada": bool(cambios)}})
        # F5 · HISTORIA: cada corrida deja huella (1 punto/día por corte) — el corte gana tiempo.
        # El espejo viaja en la historia (¿la demanda de este corte sube?), no en la alerta.
        try:
            import demand_intelligence as _di
            esp = await _di.espejo_de_corte(db, d.get("filtros") or [],
                                            universo=d.get("universo") or "unidades",
                                            n_oferta=k.get("disponibles"))
            personas = None if esp.get("espejo_total_mercado") else esp.get("personas")
            tension = None if esp.get("espejo_total_mercado") else esp.get("tension_por_unidad")
        except Exception:  # noqa: BLE001
            personas = tension = None
        await _huella_corte(db, "vista", v["id"], {**nuevo, "disponibles": k.get("disponibles"),
                                                   "personas": personas, "tension": tension})
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
    async def _evaluar_todo(db):
        r1 = await evaluar_alertas_corte(db)
        r2 = await evaluar_cortes_asesor(db)
        return {"superadmin": r1.get("lectura"), "asesores": r2.get("lectura")}

    wrapped = wrap_apscheduler_job(_evaluar_todo, "cube_view_alerts")
    scheduler.add_job(wrapped, CronTrigger(hour=7, minute=30, timezone="America/Mexico_City"),
                      id="cube_view_alerts", replace_existing=True, kwargs={"db": db})


async def evaluar_cortes_asesor(db) -> Dict[str, Any]:
    """CUBO F4 (auditoría) — el asesor también merece la campana: re-corre el corte de cada
    búsqueda guardada de sus clientes, compara vs el snapshot en el doc y notifica AL DUEÑO
    ('al cliente de la búsqueda X le entraron 3 unidades / se calentó su corte').
    Reusa _delta_corte + emit_notification. Primera corrida = línea base (sin disparo)."""
    import cube_lens
    from routes.advisor import _busqueda_a_corte
    disparadas = []
    revisadas = 0
    # deals terminales fuera: una búsqueda ganada/perdida no gasta cubo ni hace ruido
    async for b in db.asesor_busquedas.find({"stage": {"$nin": ["ganada", "perdida"]}}, {"_id": 0}):
        corte = _busqueda_a_corte(b)
        if not corte or not b.get("owner_id"):
            continue
        revisadas += 1
        try:
            lente = await cube_lens.consulta_con_lente(db, "asesor", corte)
        except Exception:  # noqa: BLE001
            continue
        if not lente.get("ok") or lente.get("suprimido"):
            continue
        k = lente.get("kpis") or {}
        nuevo = {"n": lente.get("n_disponibles"), "precio_prom": k.get("precio_prom"),
                 "absorcion_pct": k.get("absorcion_pct")}
        cambios = _delta_corte(b.get("corte_snapshot"), nuevo, 10.0)
        await db.asesor_busquedas.update_one({"id": b["id"]}, {"$set": {
            "corte_snapshot": nuevo, "corte_checked_at": dt.datetime.utcnow()}})
        # huella CON espejo (misma riqueza que las vistas — sin esto el asesor nunca podría
        # ver "¿se calentó el corte de mi cliente?")
        try:
            esp = await cube_lens.espejo_con_lente(db, "asesor", corte, n_oferta=nuevo["n"])
            personas = esp.get("personas")
            tension = esp.get("tension_por_unidad")
        except Exception:  # noqa: BLE001
            personas = tension = None
        await _huella_corte(db, "busqueda", b["id"], {**nuevo, "personas": personas, "tension": tension})
        if cambios:
            disparadas.append({"busqueda": b["id"], "cambios": cambios})
            try:
                from notifications_engine import emit_notification
                await emit_notification(
                    db, user_id=b["owner_id"], type="cube_view_alert", severity="normal",
                    title="El corte de tu cliente cambió",
                    body=" · ".join(cambios),
                    payload={"busqueda_id": b["id"], "contacto_id": b.get("contacto_id")},
                    action_url="/asesor/busquedas")
            except Exception:  # noqa: BLE001
                pass
    return {"revisadas": revisadas, "disparadas": disparadas,
            "lectura": f"{len(disparadas)} cortes de clientes cambiaron de {revisadas} vigilados"}


async def ensure_indexes(db) -> None:
    """F5 · la huella exige unicidad real (cron + corrida manual concurrentes no deben duplicar
    el punto del día) y la lectura no debe collscanear."""
    try:
        await db.cube_corte_snapshots.create_index(
            [("ref_tipo", 1), ("ref_id", 1), ("fecha", 1)], unique=True,
            name="corte_snapshot_uniq")
    except Exception:  # noqa: BLE001
        pass
