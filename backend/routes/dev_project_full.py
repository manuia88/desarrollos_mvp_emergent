"""Dev Project Full — capa de lectura ÚNICA (B0.1). Fusiona seed/developments + las
colecciones por-tab (amenidades, comercialización, pagos, construcción, precio, contenido)
en un payload canónico. Fin del silo: una sola fuente que dev/asesor/marketplace/superadmin
pueden consumir (B0.3/B2/B3 reusan project_full()).

Upgrade que cierra el ciclo: project_readiness() = "qué tan lista está la ficha para publicar"
(% + qué falta + a qué tab ir), consumido HOY por el Inicio de la ficha (no standalone).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("dmx.project_full")
router = APIRouter(prefix="/api/dev", tags=["project_full"])


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


async def project_full(db, pid: str) -> Optional[Dict[str, Any]]:
    """Payload canónico del proyecto (seed/developments/projects + colecciones por-tab).
    Fuente única reusable por todos los portales. Fail-open por bloque."""
    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(pid)
    if not dev:
        dev = (await db.developments.find_one({"id": pid}, {"_id": 0})
               or await db.projects.find_one({"$or": [{"id": pid}, {"slug": pid}]}, {"_id": 0}))
    if not dev:
        return None

    async def _find(col, q):
        try:
            return await db[col].find_one(q, {"_id": 0})
        except Exception:
            return None

    am = await _find("project_amenities", {"project_id": pid}) or {}
    comm = await _find("project_commercialization", {"project_id": pid})
    psd = await _find("dev_payment_schemes", {"project_id": pid}) or {}
    con = await _find("project_construction_progress", {"project_id": pid}) or {}

    try:
        n_assets = await db.dev_assets.count_documents({"development_id": pid})
    except Exception:
        n_assets = 0
    photos = dev.get("photos") if isinstance(dev.get("photos"), list) else []

    ph = dev.get("price_history") or []
    since = None
    if len(ph) >= 2 and ph[0].get("price"):
        since = round((ph[-1]["price"] / ph[0]["price"] - 1) * 100, 1)

    center = dev.get("center") or [None, None]
    return {
        "project_id": pid, "nombre": dev.get("name"), "stage": dev.get("stage"),
        "price_from": dev.get("price_from"), "price_to": dev.get("price_to"),
        "units_total": len(dev.get("units") or []) or dev.get("units_total"),
        "delivery_estimate": dev.get("delivery_estimate"),
        "ubicacion": {
            "lat": center[1] if len(center) > 1 else None, "lng": center[0] if center else None,
            "colonia": dev.get("colonia"), "colonia_id": dev.get("colonia_id"), "alcaldia": dev.get("alcaldia"),
        },
        "amenidades": {
            "amenities": am.get("amenities") or dev.get("amenities") or [],
            "servicios": am.get("servicios") or {}, "amenity_scope": am.get("amenity_scope") or {},
        },
        "comercializacion": {
            "configured": bool(comm),
            "works_with_brokers": (comm or {}).get("works_with_brokers", False),
            "in_house_only": (comm or {}).get("in_house_only", True),
            "default_commission_pct": (comm or {}).get("default_commission_pct", 3.0),
            "broker_policy": (comm or {}).get("broker_policy") or {},
            "sales_policy": (comm or {}).get("sales_policy") or {},
        },
        "pagos": {"schemes": psd.get("schemes") or [], "fecha_inicio": psd.get("fecha_inicio"), "fecha_entrega": psd.get("fecha_entrega")},
        "construccion": {
            "overall_percent": con.get("overall_percent"), "current_stage": con.get("current_stage"),
            "sistema_constructivo": con.get("sistema_constructivo") or {},
        },
        "contenido": {"photos": len(photos), "assets": n_assets, "video": bool(dev.get("video_url")), "tour": bool(dev.get("tour360_url"))},
        "plusvalia_desde_lanzamiento_pct": since,
        "source": "seed" if DEVELOPMENTS_BY_ID.get(pid) else "db",
    }


def project_readiness(full: Dict[str, Any]) -> Dict[str, Any]:
    """Qué tan lista está la ficha para publicar a los portales (% + qué falta + a qué tab ir)."""
    a = full.get("amenidades") or {}
    pay = full.get("pagos") or {}
    con = full.get("construccion") or {}
    loc = full.get("ubicacion") or {}
    cont = full.get("contenido") or {}
    comm = full.get("comercializacion") or {}
    checks = [
        ("Datos básicos", bool(full.get("nombre") and full.get("price_from")), "inicio"),
        ("Ubicación en el mapa", bool(loc.get("lat") and loc.get("colonia")), "ubicacion"),
        ("Amenidades", len(a.get("amenities") or []) >= 3, "amenidades"),
        ("Servicios del desarrollo", len(a.get("servicios") or {}) >= 1, "amenidades"),
        ("Sistema constructivo", bool((con.get("sistema_constructivo") or {}).get("cimentacion")), "avance"),
        ("Formas de pago", len(pay.get("schemes") or []) >= 1, "comercializacion"),
        ("Política comercial", bool(comm.get("configured")), "comercializacion"),
        ("Fotos del proyecto", (cont.get("photos") or 0) >= 3, "contenido"),
        ("Avance de obra", (con.get("overall_percent") or 0) > 0, "avance"),
    ]
    passed = sum(1 for _, ok, _ in checks if ok)
    pct = round(passed / len(checks) * 100)
    return {
        "pct": pct, "passed": passed, "total": len(checks),
        "missing": [{"label": l, "tab": t} for l, ok, t in checks if not ok],
        "publishable": pct >= 80,
    }


@router.get("/projects/{project_id}/full")
async def get_project_full(project_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    if project_id not in _user_dev_ids(user):
        raise HTTPException(403, "Proyecto no accesible")
    full = await project_full(db, project_id)
    if not full:
        raise HTTPException(404, "Proyecto no encontrado")
    full["readiness"] = project_readiness(full)
    return full


async def ensure_project_full_indexes(db):
    return None
