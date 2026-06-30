"""ACTIVACIÓN CROSS-PORTAL — 'el cubo ACTÚA'. Un hallazgo (oportunidad / ficha del auto-arquitecto) se convierte en una
ACCIÓN ruteada: al DEV ('construye esto'), al ASESOR ('esta oportunidad calza con leads que buscan X'), o al MARKETPLACE.
Persiste en db.cube_actions (el libro mayor de acciones) — el portal destino la consume. Para asesor, cuenta los leads/
búsquedas que ya piden ese segmento (demanda potencial real). No inventa.
"""
import datetime as dt
import uuid
from typing import Any, Dict, List, Optional

DESTINOS = ("dev", "asesor", "marketplace")


async def _leads_potenciales(db, colonia: Optional[str], filtro: Optional[Dict]) -> int:
    """Cuántas búsquedas/señales ya piden este segmento en la colonia (la demanda que el asesor podría atender)."""
    import facet_engine as fe
    if not colonia:
        return 0
    geo = ("colonia", colonia)
    if filtro:
        fid = next(iter(filtro))
        try:
            r = await fe.facet_query(db, "unidades", group_by=fid, geo=geo)
            m = next((x for x in r["relacional"]["por_valor"] if str(x["valor"]) == str(filtro[fid])), None)
            return m["demanda"] if m else 0
        except Exception:
            return 0
    return 0


async def activar(db, destino: str, titulo: str, detalle: str, colonia: Optional[str] = None,
                  filtro: Optional[Dict] = None, payload: Optional[Dict] = None, actor: str = "superadmin") -> Dict[str, Any]:
    if destino not in DESTINOS:
        return {"ok": False, "error": f"destino inválido: {destino}", "destinos": list(DESTINOS)}
    leads = await _leads_potenciales(db, colonia, filtro) if destino == "asesor" else None
    doc = {"id": f"act_{uuid.uuid4().hex[:10]}", "destino": destino, "titulo": titulo, "detalle": detalle,
           "colonia": colonia, "filtro": filtro, "payload": payload or {}, "leads_potenciales": leads,
           "estado": "pendiente", "actor": actor, "created_at": dt.datetime.utcnow()}
    await db.cube_actions.insert_one(dict(doc))
    doc.pop("_id", None)
    doc["created_at"] = doc["created_at"].isoformat()
    extra = f" · {leads} leads potenciales ya buscan esto" if leads else ""
    return {"ok": True, "accion": doc, "lectura": f"Acción enviada a {destino}: {titulo}{extra}"}


async def listar(db, destino: Optional[str] = None, estado: Optional[str] = None,
                 tenant_id: Optional[str] = None) -> Dict[str, Any]:
    """Lista acciones del buzón. Cuando `tenant_id` viene (dev/asesor logueado), el estado se overlaya PER-TENANT
    desde db.cube_action_user_state (keyed por action_id+tenant_id) — el doc cube_actions NUNCA se muta por estado,
    así dev-A no pisa el visto/descartado de dev-B. El reader público (marketplace) pasa tenant_id=None y ve el
    estado global del doc. Fail-soft: si la colección de estado per-tenant falla, cae al estado del doc."""
    q = {}
    if destino:
        q["destino"] = destino
    # Cargamos todo el buzón del destino y filtramos por estado DESPUÉS de overlayar el per-tenant.
    raw = []
    async for a in db.cube_actions.find(q, {"_id": 0}).sort("created_at", -1).limit(200):
        a["created_at"] = a["created_at"].isoformat() if isinstance(a.get("created_at"), dt.datetime) else a.get("created_at")
        raw.append(a)

    overlay: Dict[str, str] = {}
    if tenant_id and raw:
        try:
            ids = [a.get("id") for a in raw if a.get("id")]
            async for s in db.cube_action_user_state.find(
                    {"action_id": {"$in": ids}, "tenant_id": str(tenant_id)}, {"_id": 0}):
                if s.get("action_id") and s.get("estado"):
                    overlay[s["action_id"]] = s["estado"]
        except Exception:
            overlay = {}  # fail-soft: sin per-tenant, usamos el estado del doc

    acciones = []
    for a in raw:
        if tenant_id:
            a["estado"] = overlay.get(a.get("id"), "pendiente")  # default per-tenant: nadie lo ha tocado aún
        # Filtro por estado DESPUÉS del overlay (un dev solo ve lo que ÉL no marcó visto/descartado).
        if estado and a.get("estado") != estado:
            continue
        acciones.append(a)
        if len(acciones) >= 100:
            break
    return {"acciones": acciones, "total": len(acciones),
            "por_destino": {d: await db.cube_actions.count_documents({"destino": d}) for d in DESTINOS}}


ESTADOS = ("pendiente", "visto", "aplicado", "descartado")


async def actualizar_estado(db, action_id: str, estado: str, destino: Optional[str] = None,
                            tenant_id: Optional[str] = None) -> Dict[str, Any]:
    """Cambia el estado de UNA acción. SCOPED por destino (un portal solo toca SU buzón) + estado validado contra
    enum (no string arbitrario → cierra XSS almacenado). Cuando `tenant_id` viene, el estado se persiste PER-TENANT
    en db.cube_action_user_state (upsert keyed por action_id+tenant_id) — NO muta el doc global cube_actions, así
    dev-A no pisa el estado de dev-B. Sin tenant_id (compat), cae al comportamiento legacy sobre el doc global.
    404-equivalente si la acción no existe / no matchea el destino (no toca buzón ajeno)."""
    if estado not in ESTADOS:
        return {"ok": False, "error": f"estado inválido: {estado}", "estados": list(ESTADOS)}
    # Verifica que la acción exista y respete el scope por destino — sin mutarla.
    q: Dict[str, Any] = {"id": action_id}
    if destino:
        q["destino"] = destino  # un dev solo toca destino=dev, un asesor solo destino=asesor
    existe = await db.cube_actions.find_one(q, {"_id": 0, "id": 1})
    if not existe:
        return {"ok": False, "id": action_id, "estado": estado, "matched": 0}

    if tenant_id:
        try:
            await db.cube_action_user_state.update_one(
                {"action_id": action_id, "tenant_id": str(tenant_id)},
                {"$set": {"estado": estado, "destino": destino, "actualizado": dt.datetime.utcnow()}},
                upsert=True,
            )
            return {"ok": True, "id": action_id, "estado": estado, "matched": 1, "per_tenant": True}
        except Exception as e:  # noqa: BLE001 — fail-soft: no degradar a mutar el doc global
            return {"ok": False, "id": action_id, "estado": estado, "matched": 0, "error": str(e)[:140]}

    # Legacy / sin tenant: estado global en el doc (reader público, llamadas internas).
    r = await db.cube_actions.update_one(q, {"$set": {"estado": estado, "actualizado": dt.datetime.utcnow()}})
    return {"ok": r.matched_count > 0, "id": action_id, "estado": estado, "matched": r.matched_count}
