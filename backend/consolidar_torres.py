"""CONSOLIDAR TORRES — un proyecto multi-torre en UNA sola ficha (founder 07-21).

Quiero Casa se ingirió con una ficha POR TORRE (Jilotepec×3, Camarones×4, …). El modelo ya soporta
multi-torre en un dev (The Park: `developments.torres[]` + `units.tower`); esto migra los splits a esa
forma canónica: mueve units + eventos + overrides + átomos + assets (renders/planos) a la ficha
canónica, ETIQUETA la torre de cada depto (prefijo del número, o el nombre de la ficha origen), fija
`torres[]` y borra las fichas vacías. Reusa la doctrina de cascada de P7/P8. Fail-open, idempotente.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

# stores keyed al dev que hay que re-apuntar al canónico (colección, campo)
_KEYED: List[Tuple[str, str]] = [
    ("units", "development_id"),
    ("unit_status_events", "dev_id"),
    ("price_events", "dev_id"),
    ("oferta_timeline", "dev_id"),
    ("developer_unit_overrides", "dev_id"),
    ("developer_unit_overrides", "development_id"),
    ("dev_assets", "development_id"),
    ("project_assets", "development_id"),
    ("dmx_units", "development_id"),
    ("moldes", "development_id"),
    ("dmx_prototypes", "development_id"),
]

_ROMAN = {"ii": "II", "iii": "III", "iv": "IV"}


def tower_label(unit_number: Any, dev_name: str, dev_id: str, fallback: Optional[str] = None) -> str:
    """La torre de un depto: (1) prefijo-letra del número ('A-405'→'A'); si no, (2) etiqueta explícita
    `fallback` si se pasó; si no, (3) del NOMBRE/ID origen ('… Torre D'→'D', 'Churubusco II'→'II')."""
    m = re.match(r"^\s*([A-Z])[\s\-]", str(unit_number or "").strip().upper())
    if m:
        return m.group(1)
    if fallback:
        return fallback
    src = f"{dev_name or ''} {dev_id or ''}"
    mt = re.search(r"torre[_\s]+([a-z])(?:[_\s]+y[_\s]+([a-z]))?", src, re.I)
    if mt:
        return (mt.group(1) + ("-" + mt.group(2) if mt.group(2) else "")).upper()
    mr = re.search(r"\b(ii|iii|iv)\b", src, re.I)
    if mr:
        return _ROMAN[mr.group(1).lower()]
    mn = re.search(r"[_\s](\d)\b", src)
    if mn:
        return mn.group(1)
    return "U"     # única / sin distinción


async def consolidar_proyecto(db, canonical_id: str, fuentes: List[str],
                              nombre: Optional[str] = None) -> Dict[str, Any]:
    """Junta `fuentes` (dev_ids) en `canonical_id`. El canónico PUEDE venir en fuentes (se re-etiqueta
    igual). Devuelve el conteo por store. No borra el canónico."""
    can = await db.developments.find_one({"id": canonical_id}, {"_id": 0})
    if not can:
        return {"ok": False, "error": f"canónico {canonical_id} no existe"}
    # fuentes: cada una es dev_id (str) o (dev_id, etiqueta_fallback)
    norm: List[Tuple[str, Optional[str]]] = [(f, None) if isinstance(f, str) else (f[0], f[1]) for f in fuentes]
    torres: set = set()
    movidas = 0
    # 1) etiquetar torre en TODOS los units (incluye el canónico) + mover al canónico
    for src, label in norm:
        srcdev = await db.developments.find_one({"id": src}, {"_id": 0, "name": 1})
        srcname = (srcdev or {}).get("name") or src
        async for u in db.units.find({"development_id": src}, {"_id": 0, "id": 1, "unit_number": 1}):
            tl = tower_label(u.get("unit_number"), srcname, src, fallback=label)
            torres.add(tl)
            patch: Dict[str, Any] = {"tower": tl}
            if src != canonical_id:
                patch["development_id"] = canonical_id
                movidas += 1
            await db.units.update_one({"id": u["id"]}, {"$set": patch})
    # 2) re-apuntar los stores keyed (eventos/overrides/átomos/assets) de las fuentes NO canónicas
    reap: Dict[str, int] = {}
    for src, _label in norm:
        if src == canonical_id:
            continue
        for coll, field in _KEYED:
            if coll == "units":
                continue    # ya movidas arriba
            r = await db[coll].update_many({field: src}, {"$set": {field: canonical_id}})
            if r.modified_count:
                reap[coll] = reap.get(coll, 0) + r.modified_count
    # 3) fijar torres[] + total + borrar fichas fuente vacías
    total = await db.units.count_documents({"development_id": canonical_id})
    dev_patch: Dict[str, Any] = {"torres": sorted(torres), "total_units": total}
    if nombre:
        dev_patch["name"] = nombre
    await db.developments.update_one({"id": canonical_id}, {"$set": dev_patch})
    borradas = []
    for src, _label in norm:
        if src == canonical_id:
            continue
        vivas = await db.units.count_documents({"development_id": src})
        if vivas == 0:
            await db.developments.delete_one({"id": src})
            borradas.append(src)
    return {"ok": True, "canonical": canonical_id, "torres": sorted(torres),
            "units_movidas": movidas, "total_units": total,
            "reapuntados": reap, "fichas_borradas": borradas}
