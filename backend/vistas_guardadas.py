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
