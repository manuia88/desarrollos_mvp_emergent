"""LEADS DEL SUPERADMIN + PEDIDOS A DESARROLLADORES (auditoría 07-17 · visibilidad).

Antes: la bandeja ligaba a /superadmin/leads (ruta muerta) y las colecciones
solicitudes_gdc/solicitudes_class solo vivían en Mongo (cero referencias en código).

  GET /api/superadmin/leads             → TODOS los leads con su proyecto (nombre real si existe;
                                          si el development_id ya no existe → proyecto_borrado=true
                                          conservando el id — NO se esconden ni se borran),
                                          asesor/inmobiliaria, fuente, fecha, status + totales.
  GET /api/superadmin/solicitudes-devs  → lo que les pedimos a CLASS/GDC, unificado y en humano:
                                          {desarrollador, proyecto, qué falta, por qué, fecha, estado}.

Lógica pura en fila_lead()/fila_solicitud() (testeable sin Mongo); Mongo solo en los async. $0.
"""
from __future__ import annotations

from collections import Counter
from typing import Any, Dict, List

from fastapi import APIRouter, Request

from permissions import require_superadmin

router = APIRouter(prefix="/api/superadmin")


def _db(request: Request):
    return request.app.state.db


# ─── ENTREGA 1 · leads ──────────────────────────────────────────────────────

def fila_lead(ld: Dict[str, Any], nombres_dev: Dict[str, str],
              nombres_user: Dict[str, str], nombres_inmo: Dict[str, str]) -> Dict[str, Any]:
    """Un lead crudo de Mongo → renglón homogéneo para la tabla (dos universos de campos:
    los seed traen assignee_name/channel, los reales traen contact/source/assigned_to)."""
    pid = ld.get("development_id") or ld.get("project_id") or ""
    proyecto = nombres_dev.get(pid)
    contact = ld.get("contact") or {}
    asesor = (ld.get("assignee_name")
              or nombres_user.get(ld.get("assigned_to") or "")
              or nombres_user.get(ld.get("asesor_id") or ""))
    inmo_id = ld.get("inmobiliaria_id") or ""
    return {
        "id": ld.get("id"),
        "nombre": ld.get("name") or contact.get("name") or "Sin nombre",
        "email": ld.get("email") or contact.get("email"),
        "telefono": ld.get("phone") or contact.get("phone"),
        "status": ld.get("status") or "nuevo",
        "fuente": ld.get("channel") or ld.get("source") or ld.get("origin") or "—",
        "fecha": str(ld.get("created_at") or "")[:10],
        "asesor": asesor,
        "inmobiliaria": nombres_inmo.get(inmo_id) or (inmo_id or None),
        "presupuesto_mxn": ld.get("budget_mxn"),
        "development_id": pid or None,          # se CONSERVA el id aunque el proyecto ya no exista
        "proyecto": proyecto or (pid or None),
        "proyecto_borrado": bool(ld.get("proyecto_borrado")) or (bool(pid) and proyecto is None),
        "nota": ld.get("nota"),
        "demo": bool(ld.get("_demo_home")),
    }


async def leads_todos(db) -> Dict[str, Any]:
    nombres_dev: Dict[str, str] = {}
    async for d in db.developments.find({}, {"_id": 0, "id": 1, "name": 1}).limit(3000):
        nombres_dev[d["id"]] = d.get("name") or d["id"]
    nombres_user: Dict[str, str] = {}
    async for u in db.users.find({}, {"_id": 0, "user_id": 1, "name": 1}).limit(2000):
        if u.get("user_id"):
            nombres_user[u["user_id"]] = u.get("name") or u["user_id"]
    nombres_inmo: Dict[str, str] = {}
    async for i in db.inmobiliarias.find({}, {"_id": 0, "id": 1, "name": 1}).limit(500):
        if i.get("id"):
            nombres_inmo[i["id"]] = i.get("name") or i["id"]

    filas: List[Dict[str, Any]] = []
    async for ld in db.leads.find({}, {"_id": 0}).limit(2000):
        filas.append(fila_lead(ld, nombres_dev, nombres_user, nombres_inmo))
    filas.sort(key=lambda f: f["fecha"] or "", reverse=True)

    por_status = Counter(f["status"] for f in filas)
    por_proyecto = Counter((f["proyecto"] or "sin proyecto") for f in filas)
    return {
        "leads": filas,
        "n": len(filas),
        "n_proyecto_borrado": sum(1 for f in filas if f["proyecto_borrado"]),
        "totales": {
            "por_status": dict(por_status.most_common()),
            "por_proyecto": dict(por_proyecto.most_common()),
        },
    }


@router.get("/leads")
async def leads_endpoint(request: Request):
    """Vista total de leads del superadmin — nada se esconde (huérfanos marcados, no borrados)."""
    await require_superadmin(request)
    return await leads_todos(_db(request))


# ─── ENTREGA 2 · pedidos a los desarrolladores ──────────────────────────────

QUE_FALTA = {
    "planos_por_tipo": "Planos por tipo de depto",
    "columna_banos_listas": "Columna de baños en las listas de precios",
    "laminas_faltantes": "Láminas de planos faltantes",
    "lista_precios_illinois": "Lista de precios",
    "galeria_recorrido": "Fotos de galería (recorrido incompleto)",
}


def fila_solicitud(doc: Dict[str, Any], desarrollador: str) -> Dict[str, Any]:
    """Un doc de solicitudes_gdc/_class → renglón humano. Si el detalle empieza con
    'Proyecto: …' se separa el proyecto del porqué (así se escriben los de CLASS)."""
    tipo = doc.get("tipo") or "pedido"
    proyectos = list(doc.get("proyectos") or [])
    detalle = (doc.get("detalle") or "").strip()

    proyecto, por_que = None, detalle
    if detalle and ":" in detalle[:45]:
        pref, resto = detalle.split(":", 1)
        proyecto, por_que = pref.strip(), resto.strip()
    if not proyecto:
        if len(proyectos) == 1:
            proyecto = proyectos[0]
        elif proyectos:
            proyecto = f"{len(proyectos)} proyectos"
    if not por_que and proyectos:
        por_que = f"Falta en: {', '.join(proyectos[:5])}" + (" …" if len(proyectos) > 5 else "")

    return {
        "desarrollador": desarrollador,
        "tipo": tipo,
        "que_falta": QUE_FALTA.get(tipo, tipo.replace("_", " ").capitalize()),
        "proyecto": proyecto or "—",
        "proyectos": proyectos,
        "por_que": por_que,
        "fecha": str(doc.get("ts") or "")[:10],
        "estado": doc.get("estado") or "pendiente",
    }


async def solicitudes_devs(db) -> Dict[str, Any]:
    filas: List[Dict[str, Any]] = []
    for col, dev in (("solicitudes_class", "CLASS"), ("solicitudes_gdc", "GDC")):
        async for doc in db[col].find({}, {"_id": 0}).limit(200):
            filas.append(fila_solicitud(doc, dev))
    filas.sort(key=lambda f: f["fecha"], reverse=True)
    return {
        "solicitudes": filas,
        "n": len(filas),
        "pendientes": sum(1 for f in filas if f["estado"] == "pendiente"),
    }


@router.get("/solicitudes-devs")
async def solicitudes_endpoint(request: Request):
    """Lo que les pedimos a CLASS/GDC (datos faltantes en fuente) — visible, ya no solo en Mongo."""
    await require_superadmin(request)
    return await solicitudes_devs(_db(request))
