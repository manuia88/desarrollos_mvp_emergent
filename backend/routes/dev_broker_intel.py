"""Dev Broker/Pagos Intel — cockpit "Pagos y brokers".

GET /api/dev/projects/{project_id}/broker-intel

  · pagos: tus formas de pago (enganche, descuento, financiamiento) — el dato más real.
  · canal: trabajas con brokers o in-house · comisión · política (bono velocidad, cobroking).
  · ventas: conversión y cierres (leads reales) · win-rate.
  · confianza: marca + historial de entregas (lo que percibe el broker/cliente).

Honesto: el ranking de brokers y "por qué se caen" necesitan leads asignados a brokers
(no hay en el demo) → stub que se autollena. Fail-open por bloque.
"""
from __future__ import annotations

import logging
from collections import Counter
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("dmx.broker_intel")
router = APIRouter(prefix="/api/dev", tags=["broker_intel"])


def _db(req: Request):
    return req.app.state.db


async def _auth(req: Request):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in ("developer_admin", "developer_member", "superadmin"):
        raise HTTPException(403, "Rol no autorizado")
    return user


def _user_dev_ids(user) -> List[str]:
    from tenant_scope import user_dev_ids
    return user_dev_ids(user)


def _tenant(user) -> str:
    from tenant_scope import tenant_of
    return tenant_of(user)


@router.get("/projects/{project_id}/broker-intel")
async def broker_intel(project_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    if project_id not in _user_dev_ids(user):
        raise HTTPException(403, "Proyecto no accesible")
    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(project_id)
    if not dev:
        raise HTTPException(404, "Proyecto no encontrado")

    # ── Pagos (reuso del endpoint real) ──────────────────────────────────────
    pagos: Dict[str, Any] = {}
    try:
        from routes.dev_batch1 import get_payment_schemes
        ps = await get_payment_schemes(project_id, request)
        schemes = ps.get("schemes") or []
        firmas = [float(s.get("firma_pct") or 0) for s in schemes if s.get("firma_pct") is not None]
        descs = [float(s.get("descuento_pct") or 0) for s in schemes]
        pagos = {
            "n_planes": len(schemes),
            "enganche_min": min(firmas) if firmas else None,
            "enganche_max": max(firmas) if firmas else None,
            "descuento_max": max(descs) if descs else 0,
            "financiamiento_meses": ps.get("meses_auto"),
            "planes": [{"nombre": s.get("nombre"), "firma_pct": s.get("firma_pct"),
                        "descuento_pct": s.get("descuento_pct")} for s in schemes],
        }
    except Exception as e:  # noqa
        log.warning(f"[broker-intel] pagos: {e}")

    # ── Canal / política comercial (reuso) ───────────────────────────────────
    canal: Dict[str, Any] = {}
    try:
        from routes.dev_batch11 import get_commercialization
        comm = await get_commercialization(project_id, request)
        bp = comm.get("broker_policy") or {}
        brokers_count = await db.project_brokers.count_documents(
            {"project_id": project_id, "status": {"$ne": "revoked"}})
        canal = {
            "works_with_brokers": comm.get("works_with_brokers"),
            "in_house_only": comm.get("in_house_only"),
            "comision_pct": bp.get("comision_pct") or comm.get("default_commission_pct"),
            "descuento_max_pct": bp.get("descuento_max_pct"),
            "bono": bp.get("comision_escalonada"),
            "cobrokering": bp.get("cobrokering_reparto"),
            "brokers_count": brokers_count,
        }
    except Exception as e:  # noqa
        log.warning(f"[broker-intel] canal: {e}")

    # ── Ventas (leads reales del proyecto) ───────────────────────────────────
    ventas: Dict[str, Any] = {}
    try:
        cur = db.leads.find({"development_id": project_id}, {"_id": 0, "status": 1})
        c: Counter = Counter()
        async for l in cur:
            c[l.get("status") or "nuevo"] += 1
        total = sum(c.values())
        ganados = c.get("cerrado_ganado", 0)
        perdidos = c.get("cerrado_perdido", 0)
        decididos = ganados + perdidos
        ventas = {
            "leads_total": total, "ganados": ganados, "perdidos": perdidos,
            "en_proceso": total - decididos,
            "win_rate": round(ganados / decididos * 100, 1) if decididos else None,
            "conversion_pct": round(ganados / total * 100, 1) if total else None,
        }
    except Exception as e:  # noqa
        log.warning(f"[broker-intel] ventas: {e}")

    # ── Confianza (IE scores) ────────────────────────────────────────────────
    confianza: Dict[str, Any] = {}
    try:
        async for d in db.ie_scores.find(
            {"zone_id": project_id, "is_stub": False,
             "code": {"$in": ["IE_PROY_MARCA_TRUST", "IE_PROY_DEVELOPER_DELIVERY_HIST"]}},
            {"_id": 0, "code": 1, "value": 1, "tier": 1},
        ):
            confianza[d["code"]] = {"value": d.get("value"), "tier": d.get("tier")}
    except Exception as e:  # noqa
        log.warning(f"[broker-intel] confianza: {e}")

    # ── Ranking de brokers (stub honesto: necesita leads asignados a brokers) ─
    broker_ranking_available = bool(canal.get("brokers_count"))

    return {
        "project_id": project_id, "name": dev.get("name"),
        "pagos": pagos, "canal": canal, "ventas": ventas, "confianza": confianza,
        "broker_ranking_available": broker_ranking_available,
    }


async def ensure_broker_intel_indexes(db):
    return None
