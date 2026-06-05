"""Asesor Playbook (B3.1) — el asesor ve, por proyecto del dev: si PUEDE venderlo, su COMISIÓN,
la POLÍTICA (broker/venta), las FORMAS DE PAGO, los SELLOS (construcción + legal) y QUÉ OFRECERLE
al cliente. Cierra el ciclo dev→asesor: lo que el desarrollador configura en su ficha llega al asesor.

Consume la capa unificada (project_full) + project_commercialization + autorización (is_authorized) +
preassignments. NO edita las funciones gigantes de advisor.py (archivo nuevo, additive).
IA-first: 'qué ofrecer' se genera en lenguaje del asesor (rule-based hoy, stub-extensible a LLM).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("dmx.asesor_playbook")
router = APIRouter(prefix="/api/asesor", tags=["asesor_playbook"])


async def _resolve_dev_org(db, pid: str):
    from data_developments import DEVELOPMENTS_BY_ID
    d = DEVELOPMENTS_BY_ID.get(pid)
    if d:
        return d.get("dev_org_id") or d.get("developer_id")
    doc = (await db.projects.find_one({"$or": [{"id": pid}, {"slug": pid}]}, {"_id": 0, "dev_org_id": 1})
           or await db.developments.find_one({"id": pid}, {"_id": 0, "dev_org_id": 1}))
    return (doc or {}).get("dev_org_id")


def _que_ofrecer(full: Dict[str, Any], sello_con: Dict[str, Any], sello_leg: Dict[str, Any]) -> List[str]:
    """Puntos de venta listos para decirle al cliente (lenguaje del asesor)."""
    puntos: List[str] = []
    if sello_con.get("configured"):
        puntos.append(sello_con["descripcion"])
    if sello_leg.get("configured"):
        puntos.append(sello_leg["descripcion"])
    schemes = (full.get("pagos") or {}).get("schemes") or []
    if schemes:
        best = max(schemes, key=lambda s: s.get("descuento_pct") or 0)
        if (best.get("descuento_pct") or 0) > 0:
            puntos.append(f"{best.get('nombre')}: {best.get('descuento_pct')}% de descuento pagando {best.get('firma_pct')}% de enganche.")
        else:
            engs = [s.get("firma_pct") for s in schemes if s.get("firma_pct") is not None]
            puntos.append(f"{len(schemes)} formas de pago" + (f" (enganche desde {min(engs)}%)." if engs else "."))
    serv = (full.get("amenidades") or {}).get("servicios") or {}
    if serv:
        puntos.append(f"Servicios del desarrollo: {', '.join(serv.keys())}.")
    pv = full.get("plusvalia_desde_lanzamiento_pct")
    if pv:
        puntos.append(f"Plusvalía +{pv}% desde el lanzamiento — fuerte para el cliente inversionista.")
    n_am = len((full.get("amenidades") or {}).get("amenities") or [])
    if n_am:
        puntos.append(f"{n_am} amenidades para resaltar según el perfil del cliente.")
    return puntos


@router.get("/proyecto/{project_id}/playbook")
async def asesor_playbook(project_id: str, request: Request):
    from routes.advisor import require_advisor
    user = await require_advisor(request)
    db = request.app.state.db
    from tenant_scope import tenant_of
    from routes.dev_project_full import project_full, legal_seal
    from routes.dev_batch2 import construction_seal
    from services.advisor_authorization import is_authorized

    full = await project_full(db, project_id)
    if not full:
        raise HTTPException(404, "Proyecto no encontrado")

    dev_org = await _resolve_dev_org(db, project_id)
    asesor_id = getattr(user, "user_id", None)
    asesor_tenant = tenant_of(user)

    comm = await db.project_commercialization.find_one({"project_id": project_id}, {"_id": 0}) or {}
    in_house_only = bool(comm.get("in_house_only", True))
    works_brokers = bool(comm.get("works_with_brokers", False))
    bp = comm.get("broker_policy") or {}
    sp = comm.get("sales_policy") or {}
    default_comm = comm.get("default_commission_pct") or bp.get("comision_pct") or 3.0

    pre = None
    if asesor_id:
        pre = await db.project_preassignments.find_one(
            {"project_id": project_id, "assigned_user_id": asesor_id, "active": True}, {"_id": 0})

    # Estado de acceso (jerarquía: interno → preasignado → autorizado → puede_solicitar → no_disponible)
    if asesor_tenant and dev_org and asesor_tenant == dev_org:
        estado, puede = "interno", True
    elif pre:
        estado, puede = "preasignado", True
    elif dev_org and asesor_id and await is_authorized(db, asesor_id, dev_org):
        estado, puede = "autorizado", True
    elif works_brokers and not in_house_only:
        estado, puede = "puede_solicitar", False
    else:
        estado, puede = "no_disponible", False

    motivo = {
        "interno": "Eres del equipo del desarrollador.",
        "preasignado": "El desarrollador te asignó este proyecto.",
        "autorizado": "Tienes acceso aprobado con este desarrollador.",
        "puede_solicitar": "Trabaja con brokers — solicita acceso para venderlo.",
        "no_disponible": ("Venta exclusiva del equipo interno del desarrollador." if in_house_only
                          else "Por ahora no abre a brokers externos."),
    }[estado]

    comision_pct = (pre or {}).get("commission_pct") or default_comm
    comision_fuente = "tu pre-asignación" if (pre and pre.get("commission_pct")) else "política del desarrollador"

    sello_con = construction_seal((full.get("construccion") or {}).get("sistema_constructivo") or {})
    leg = full.get("legal") or {}
    sello_leg = legal_seal(leg.get("estado"), leg.get("docs") or 0, leg.get("verificados") or 0)

    return {
        "project_id": project_id, "nombre": full.get("nombre"),
        "colonia": (full.get("ubicacion") or {}).get("colonia"),
        "precio_desde": full.get("price_from"),
        "acceso": {"puede_vender": puede, "estado": estado, "motivo": motivo,
                   "dev_org_id": dev_org, "solicitar_url": "/asesor/mini-market" if estado == "puede_solicitar" else None},
        "comision": {"pct": comision_pct, "fuente": comision_fuente,
                     "esquema_pago": bp.get("comision_pago_esquema"), "dias": bp.get("comision_pago_dias"),
                     "escalonada": bp.get("comision_escalonada")},
        "politica": {"in_house_only": in_house_only, "works_with_brokers": works_brokers,
                     "registro_leads": bp.get("registro_leads"), "descuento_max_pct": bp.get("descuento_max_pct"),
                     "cobrokering": bp.get("cobrokering_reparto"), "exclusividad": bp.get("exclusividad"),
                     "configured": bool(comm)},
        "apartado": {"monto": sp.get("apartado_mxn"), "condiciones": sp.get("apartado_condiciones"),
                     "incluye": sp.get("incluye"), "cancelacion": sp.get("cancelacion_politica")},
        "formas_pago": (full.get("pagos") or {}).get("schemes") or [],
        "sello_constructivo": sello_con, "sello_legal": sello_leg,
        "servicios": (full.get("amenidades") or {}).get("servicios") or {},
        "que_ofrecer": _que_ofrecer(full, sello_con, sello_leg),
    }
