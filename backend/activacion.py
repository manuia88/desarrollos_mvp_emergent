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


async def listar(db, destino: Optional[str] = None, estado: Optional[str] = None) -> Dict[str, Any]:
    q = {}
    if destino:
        q["destino"] = destino
    if estado:
        q["estado"] = estado
    acciones = []
    async for a in db.cube_actions.find(q, {"_id": 0}).sort("created_at", -1).limit(100):
        a["created_at"] = a["created_at"].isoformat() if isinstance(a.get("created_at"), dt.datetime) else a.get("created_at")
        acciones.append(a)
    return {"acciones": acciones, "total": len(acciones),
            "por_destino": {d: await db.cube_actions.count_documents({"destino": d}) for d in DESTINOS}}


ESTADOS = ("pendiente", "visto", "aplicado", "descartado")


async def actualizar_estado(db, action_id: str, estado: str, destino: Optional[str] = None) -> Dict[str, Any]:
    """Cambia el estado de UNA acción. SCOPED por destino (un portal solo toca SU buzón) + estado validado contra
    enum (no string arbitrario → cierra XSS almacenado). 404-equivalente si no matchea (no muta acción ajena)."""
    if estado not in ESTADOS:
        return {"ok": False, "error": f"estado inválido: {estado}", "estados": list(ESTADOS)}
    q: Dict[str, Any] = {"id": action_id}
    if destino:
        q["destino"] = destino  # un dev solo toca destino=dev, un asesor solo destino=asesor
    r = await db.cube_actions.update_one(q, {"$set": {"estado": estado, "actualizado": dt.datetime.utcnow()}})
    return {"ok": r.matched_count > 0, "id": action_id, "estado": estado, "matched": r.matched_count}
