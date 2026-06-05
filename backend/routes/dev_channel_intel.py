"""Dev Channel Intel — comparador broker vs in-house + ranking de asesores.

GET /api/dev/channel-intel?project_id=   (sin project_id = PORTAFOLIO: todos tus proyectos)

  · channels: in-house vs broker lado a lado (mix, conversión, ticket, interacción, velocidad).
  · asesores: ranking por interacción + cierres + win-rate + ticket (general o por proyecto).
  · projects: tus proyectos (para el toggle general/por-proyecto).

Lee los campos lead↔asesor↔canal (assignee/channel/interactions/budget). Construido para el
estado final: cada lead nuevo con esos campos lo enciende. Fail-open por bloque.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("dmx.channel_intel")
router = APIRouter(prefix="/api/dev", tags=["channel_intel"])

GANADO = ("cerrado_ganado", "ganado", "won")
PERDIDO = ("cerrado_perdido", "perdido", "lost")


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


def _mean(vals: List[float]):
    return round(sum(vals) / len(vals)) if vals else None


@router.get("/channel-intel")
async def channel_intel(request: Request, project_id: Optional[str] = None):
    user = await _auth(request)
    db = _db(request)
    dev_ids = _user_dev_ids(user)
    if project_id and project_id not in dev_ids:
        raise HTTPException(403, "Proyecto no accesible")
    scope = [project_id] if project_id else dev_ids

    from data_developments import DEVELOPMENTS_BY_ID
    projects = [{"id": pid, "name": (DEVELOPMENTS_BY_ID.get(pid) or {}).get("name", pid)} for pid in dev_ids]

    leads = await db.leads.find(
        {"development_id": {"$in": scope}},
        {"_id": 0, "status": 1, "channel": 1, "assignee_id": 1, "assignee_name": 1,
         "interactions": 1, "budget_mxn": 1, "first_response_hrs": 1},
    ).to_list(5000)

    ch_acc: Dict[str, Dict[str, List]] = defaultdict(lambda: {"n": 0, "won": 0, "lost": 0, "tk": [], "ix": [], "rh": []})
    asr_acc: Dict[str, Dict[str, Any]] = {}
    for l in leads:
        ch = l.get("channel") or "inhouse"
        st = l.get("status")
        c = ch_acc[ch]
        c["n"] += 1
        if st in GANADO:
            c["won"] += 1
        if st in PERDIDO:
            c["lost"] += 1
        if l.get("budget_mxn"):
            c["tk"].append(l["budget_mxn"])
        if l.get("interactions") is not None:
            c["ix"].append(l["interactions"])
        if l.get("first_response_hrs") is not None:
            c["rh"].append(l["first_response_hrs"])
        aid = l.get("assignee_id")
        if aid:
            a = asr_acc.setdefault(aid, {"id": aid, "name": l.get("assignee_name") or aid,
                                         "channel": ch, "leads": 0, "won": 0, "lost": 0,
                                         "ix": 0, "tk": [], "rh": []})
            a["leads"] += 1
            if st in GANADO:
                a["won"] += 1
            if st in PERDIDO:
                a["lost"] += 1
            a["ix"] += (l.get("interactions") or 0)
            if l.get("budget_mxn"):
                a["tk"].append(l["budget_mxn"])
            if l.get("first_response_hrs") is not None:
                a["rh"].append(l["first_response_hrs"])

    def _ch(label, key):
        c = ch_acc.get(key)
        if not c or not c["n"]:
            return {"channel": label, "key": key, "leads": 0}
        decided = c["won"] + c["lost"]
        return {
            "channel": label, "key": key, "leads": c["n"], "cierres": c["won"],
            "win_rate": round(c["won"] / decided * 100, 1) if decided else None,
            "conversion": round(c["won"] / c["n"] * 100, 1) if c["n"] else None,
            "avg_ticket": _mean(c["tk"]), "avg_interactions": round(sum(c["ix"]) / len(c["ix"]), 1) if c["ix"] else None,
            "avg_response_hrs": round(sum(c["rh"]) / len(c["rh"]), 1) if c["rh"] else None,
        }

    channels = [_ch("In-house", "inhouse"), _ch("Brokers", "broker")]

    asesores = []
    for a in asr_acc.values():
        decided = a["won"] + a["lost"]
        asesores.append({
            "id": a["id"], "name": a["name"], "channel": a["channel"],
            "leads": a["leads"], "cierres": a["won"],
            "win_rate": round(a["won"] / decided * 100, 1) if decided else None,
            "interactions": a["ix"], "avg_ticket": _mean(a["tk"]),
            "avg_response_hrs": _mean(a["rh"]),
        })
    asesores.sort(key=lambda x: x["interactions"], reverse=True)

    return {
        "scope": "proyecto" if project_id else "portafolio",
        "scope_label": (DEVELOPMENTS_BY_ID.get(project_id) or {}).get("name", project_id) if project_id else "Todos tus proyectos",
        "project_id": project_id, "projects": projects,
        "leads_total": len(leads), "channels": channels, "asesores": asesores,
    }


async def ensure_channel_intel_indexes(db):
    try:
        await db.leads.create_index([("development_id", 1), ("channel", 1)])
    except Exception:
        pass
