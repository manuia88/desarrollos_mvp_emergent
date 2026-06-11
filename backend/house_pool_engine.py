"""
Inmobiliaria DMX (house pool) — el destino de los leads de marketplace
======================================================================
Regla inviolable (LEAD_REGISTRATION_RULES §2 · §8.5): el lead que llega por el
marketplace y pide visita SIN un asesor que lo registró NO es del dev — es de MI
inmobiliaria (DMX house). Entra al pool `dmx_house` y se rutea a un asesor de la
casa disponible (round-robin / menos cargado). El dueño (superadmin) lo supervisa;
el asesor de la casa lo trabaja.

"Asesor de la casa" = empleado DMX (role advisor/asesor_admin) sin org externa
(tenant None o dmx_house). `asesor_freelance`/tenant externo = NO es de la casa.
Build-for-end-state: si aún no hay asesores de la casa, el lead queda en el pool
(assigned_asesor_id=None) y el dueño lo asigna a mano desde superadmin.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.house_pool")

# "Mi inmobiliaria" YA tiene identidad en el código: el módulo inmobiliaria resuelve la
# inmobiliaria del superadmin a "dmx_root" (inmobiliaria.py:_resolve_inmobiliaria_id). Las
# reglas la nombraron "dmx_house" en 2026-05-17, pero el código real usa "dmx_root" → alineamos
# al identificador VIVO para que el pool sea de verdad "mi inmobiliaria" y no un tenant paralelo.
DMX_HOUSE_ORG = "dmx_root"
HOUSE_ASESOR_ROLES = ("advisor", "asesor_admin")
# estados de un lead de la casa
OPEN_STATES = ("requested", "assigned", "accepted")


def is_house_asesor_doc(u: Dict[str, Any]) -> bool:
    """¿Este usuario es asesor de MI inmobiliaria? (empleado DMX, no broker externo)."""
    if not u:
        return False
    role = u.get("role")
    if role not in HOUSE_ASESOR_ROLES:
        return False
    tid = u.get("tenant_id")
    return tid in (None, "", DMX_HOUSE_ORG)


async def house_asesores(db) -> List[Dict[str, Any]]:
    """Lista de asesores de la casa (para repartir). FAIL-OPEN a []."""
    out: List[Dict[str, Any]] = []
    try:
        q = {"role": {"$in": list(HOUSE_ASESOR_ROLES)},
             "tenant_id": {"$in": [None, "", DMX_HOUSE_ORG]}}
        async for u in db.users.find(q, {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1}):
            if u.get("user_id"):
                out.append(u)
    except Exception as e:
        log.info("[house] house_asesores fail-open: %s", e)
    return out


async def _open_load(db, asesor_id: str) -> int:
    """Cuántos leads de la casa abiertos tiene ya este asesor (para balancear)."""
    try:
        return await db.visit_requests.count_documents(
            {"assigned_asesor_id": asesor_id, "status": {"$in": list(OPEN_STATES)}})
    except Exception:
        return 0


def _norm_zone(z) -> Optional[str]:
    """Normaliza una colonia a slug para comparar (Polanco == polanco == 'Polanco ')."""
    if not z:
        return None
    try:
        from data_developments import colonia_slug
        return colonia_slug(z)
    except Exception:
        return str(z).strip().lower().replace(" ", "-")


async def _asesor_zones(db, asesor_id: str) -> set:
    """Colonias que cubre el asesor (de su perfil · asesor_profiles.colonias). Set normalizado."""
    try:
        prof = await db.asesor_profiles.find_one({"user_id": asesor_id}, {"_id": 0, "colonias": 1})
        return {_norm_zone(c) for c in ((prof or {}).get("colonias") or []) if c}
    except Exception:
        return set()


async def _property_zone(db, lead_id: str) -> Optional[str]:
    """Colonia de la propiedad de la solicitud (para el match por zona)."""
    try:
        doc = await db.visit_requests.find_one({"id": lead_id}, {"_id": 0, "property_id": 1})
        pid = (doc or {}).get("property_id")
        if not pid:
            return None
        from data_developments import DEVELOPMENTS_BY_ID
        d = DEVELOPMENTS_BY_ID.get(pid)
        if d:
            return d.get("colonia")
        d = await db.developments.find_one({"id": pid}, {"_id": 0, "colonia": 1})
        return (d or {}).get("colonia")
    except Exception:
        return None


async def pick_house_asesor(db, zone=None) -> Optional[str]:
    """Reparto por ZONA + CARGA: primero los asesores que CUBREN la zona de la propiedad;
    entre esos (o entre todos si nadie la cubre · no dejar el lead varado) el MENOS cargado.
    None si no hay asesores de la casa."""
    ases = await house_asesores(db)
    if not ases:
        return None
    znorm = _norm_zone(zone)
    scored = []  # (asesor_id, load, cubre_zona)
    for a in ases:
        load = await _open_load(db, a["user_id"])
        covers = bool(znorm) and (znorm in await _asesor_zones(db, a["user_id"]))
        scored.append((a["user_id"], load, covers))
    matches = [s for s in scored if s[2]]
    pool = matches if matches else scored   # fallback: todos (zona sin cobertura → solo carga)
    pool.sort(key=lambda s: s[1])           # menos cargado primero
    return pool[0][0]


async def assign_house_lead(db, lead_id: str) -> Optional[str]:
    """Asigna (o re-asigna) un lead del pool a un asesor de la casa, por ZONA + CARGA.
    Devuelve el asesor_id o None (si aún no hay asesores de la casa · queda en el pool)."""
    zone = await _property_zone(db, lead_id)
    asesor_id = await pick_house_asesor(db, zone=zone)
    upd: Dict[str, Any] = {"owner_org": DMX_HOUSE_ORG}
    if asesor_id:
        covers = _norm_zone(zone) in await _asesor_zones(db, asesor_id) if zone else False
        upd["assigned_asesor_id"] = asesor_id
        upd["status"] = "assigned"
        upd["assigned_by"] = "zona+carga" if covers else "carga"  # transparencia del criterio
    try:
        await db.visit_requests.update_one({"id": lead_id}, {"$set": upd})
    except Exception as e:
        log.info("[house] assign fail-open: %s", e)
    return asesor_id
