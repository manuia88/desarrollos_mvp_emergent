"""Dev Amenity Intel — cierra el círculo de amenidades (valor + brecha vs competidores).

GET /api/dev/projects/{project_id}/amenity-intel

  · value_drivers: qué atributo sube tu precio/m² (hedónico) + $ defendible en TU inventario.
  · gap: amenidades que tienen tus competidores de la zona y tú no (con su valor si está modelado).
  · coverage: tu # de amenidades vs el promedio de la zona.

Doctrina del dato práctico: número + comparativo + acción. Fail-open por bloque.
"""
from __future__ import annotations

import logging
from collections import Counter
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("dmx.amenity_intel")
router = APIRouter(prefix="/api/dev", tags=["amenity_intel"])


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


async def _user_dev_ids(request, user) -> List[str]:
    # P7 (auditoría 07-20): seed + devs REALES del tenant (db.developments), no solo el seed.
    from tenant_scope import user_dev_ids_db
    return await user_dev_ids_db(_db(request), user)


# Driver del hedónico (label) → (checker de unidad, key de catálogo)
DRIVER_MAP = {
    "Roof garden privado": (lambda u: (u.get("m2_roof_garden") or 0) > 0, "roof_garden_privado"),
    "Balcón": (lambda u: (u.get("m2_balcony") or 0) > 0, "balcon"),
    "Terraza": (lambda u: (u.get("m2_terrace") or 0) > 0, "terraza_privada"),
    "Bodega": (lambda u: bool(u.get("bodega")), "bodega"),
    "2+ estacionamientos": (lambda u: (u.get("parking_spots") or 0) >= 2, "estacionamiento"),
}


def _flat_labels() -> Dict[str, str]:
    from routes.dev_batch11 import ALL_AMENIDADES
    out: Dict[str, str] = {}
    for sec in ALL_AMENIDADES.values():
        out.update(sec)
    return out


@router.get("/projects/{project_id}/amenity-intel")
async def amenity_intel(project_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    if project_id not in await _user_dev_ids(request, user):
        raise HTTPException(403, "Proyecto no accesible")

    from data_developments import DEVELOPMENTS   # comparadores de mercado (amenidades de zona): seed
    from ingested_reader import resolve_dev_doc  # P7: el proyecto del tenant db-first (seed→developments→projects)
    dev = await resolve_dev_doc(db, project_id)
    if not dev:
        raise HTTPException(404, "Proyecto no encontrado")

    labels = _flat_labels()
    units = dev.get("units", [])
    colonia_id = dev.get("colonia_id")
    alcaldia = dev.get("alcaldia")

    # Tus amenidades (doc guardado por el dev, si existe; si no, seed).
    your: List[str] = []
    try:
        doc = await db.project_amenities.find_one({"project_id": project_id}, {"_id": 0, "amenities": 1})
        your = (doc or {}).get("amenities") or dev.get("amenities") or []
    except Exception:
        your = dev.get("amenities") or []
    your_set = set(your)

    # ── 1 · Value drivers (hedónico) + $ en tu inventario ────────────────────
    drivers: List[Dict[str, Any]] = []
    key_to_pct: Dict[str, float] = {}
    sample_size = r2 = None
    try:
        import dmx_hedonic_atom
        rk = await dmx_hedonic_atom.fit_and_rank(db, None)
        sample_size = rk.get("sample_size")
        r2 = rk.get("r_squared")
        for item in (rk.get("amenity_ranker") or []):
            lbl = item.get("atributo")
            pct = item.get("impacto_pct_precio_m2")
            sig = item.get("significativo")
            checker, ckey = DRIVER_MAP.get(lbl, (None, None))
            if ckey and pct is not None:
                key_to_pct[ckey] = pct
            you_have = (ckey in your_set) if ckey else False
            units_with = [u for u in units if checker and checker(u)] if checker else []
            dollar = 0
            if pct and pct > 0 and units_with:
                dollar = round(sum((u.get("price") or 0) for u in units_with) * pct / 100)
            drivers.append({
                "label": lbl, "amenity_key": ckey, "impacto_pct": pct, "significativo": sig,
                "you_have": you_have, "units_with": len(units_with), "dollar_in_inventory": dollar,
            })
    except Exception as e:  # noqa
        log.warning(f"[amenity-intel] ranker: {e}")

    # ── 2 · Brecha vs competidores de la zona ────────────────────────────────
    comps = [d for d in DEVELOPMENTS if d["id"] != project_id and
             (d.get("colonia_id") == colonia_id or (alcaldia and d.get("alcaldia") == alcaldia))]
    freq: Counter = Counter()
    for c in comps:
        for a in set(c.get("amenities") or []):
            freq[a] += 1
    gap = []
    for a, n in freq.most_common():
        if a in your_set:
            continue
        gap.append({
            "amenity_key": a, "label": labels.get(a, a.replace("_", " ").title()),
            "competitors_with": n, "competitors_total": len(comps),
            "value_pct": key_to_pct.get(a),
        })

    # ── 3 · Cobertura ────────────────────────────────────────────────────────
    comp_counts = [len(set(c.get("amenities") or [])) for c in comps]
    zone_avg = round(sum(comp_counts) / len(comp_counts)) if comp_counts else None
    you_count = len(your_set)
    rank_pos = 1 + sum(1 for n in comp_counts if n > you_count) if comp_counts else None

    return {
        "project_id": project_id, "name": dev.get("name"),
        "value_drivers": drivers, "gap": gap[:6],
        "coverage": {
            "you_count": you_count, "zone_avg": zone_avg,
            "competitors_total": len(comps), "rank_pos": rank_pos,
        },
        "sample_size": sample_size, "r_squared": r2,
    }


async def ensure_amenity_intel_indexes(db):
    return None
