"""CALOR DE ZONAS — ranking automático de zonas por OFERTA + DEMANDA + ABSORCIÓN
(founder 07-17: "pon las colonias con más desarrollos al principio, que se mueva solo por
demanda, absorción y oferta"). Se recalcula de datos vivos, sin lista estática.

Señales (cada una normalizada 0-1 contra el máximo de todas las zonas):
· oferta      = # desarrollos en la zona (peso 0.35 — "más desarrollos al principio")
· demanda     = señales de interés (demand_atoms + vistas) apuntando a la zona (0.25)
· absorcion   = unidades vendidas (qué tan rápido se mueve el inventario) (0.20)
· disponibles = inventario activo a la venta (0.12)
· frescura    = desarrollos con lista actualizada en el periodo (0.08 — criterio extra que
                premia a la zona con datos vivos, no dormidos)
"""
from __future__ import annotations

from typing import Any, Dict, List

from zona_packs import zona_base

_PESOS = {"oferta": 0.38, "demanda": 0.27, "absorcion": 0.22, "disponibles": 0.13}


def _nombre_zona(slug: str) -> str:
    """slug de zona → nombre bonito. 'del-valle'→'Del Valle', 'roma'→'Roma'. La 1ª palabra
    siempre va con mayúscula; las de enlace (de/del/la…) en minúscula salvo al inicio."""
    chico = {"de", "del", "la", "las", "los", "y"}
    palabras = (slug or "").split("-")
    return " ".join((w.capitalize() if (i == 0 or w not in chico) else w)
                    for i, w in enumerate(palabras))


async def zonas_populares(db, limite: int = 40) -> List[Dict[str, Any]]:
    """Zonas con inventario, ordenadas por CALOR (oferta+demanda+absorción). Cada zona trae
    su slug (para /zona/{slug}), nombre, alcaldía y los conteos que sustentan el ranking."""
    Z: Dict[str, Dict[str, Any]] = {}

    def _z(slug: str) -> Dict[str, Any]:
        return Z.setdefault(slug, {"slug": slug, "name": _nombre_zona(slug),
                                   "alcaldia": None, "oferta": 0, "disponibles": 0,
                                   "vendidas": 0, "demanda": 0.0, "colonia_ids": set()})

    # ── OFERTA + inventario (developments + units) ──
    dev_zona: Dict[str, str] = {}
    async for d in db.developments.find(
            {}, {"_id": 0, "id": 1, "colonia_id": 1, "alcaldia": 1,
                 "units_disponibles": 1, "units_visibles": 1}):
        cid = d.get("colonia_id")
        if not cid:
            continue
        zb = zona_base(cid)
        z = _z(zb)
        z["oferta"] += 1
        z["colonia_ids"].add(cid)
        z["alcaldia"] = z["alcaldia"] or d.get("alcaldia")
        dev_zona[d["id"]] = zb

    # unidades por dev → disponibles / vendidas (absorción)
    async for u in db.units.find({}, {"_id": 0, "development_id": 1, "status": 1, "type": 1}):
        zb = dev_zona.get(u.get("development_id"))
        if not zb or (u.get("type") or "depto") in ("roof_garden", "roof", "local", "bodega"):
            continue
        st = (u.get("status") or "").lower()
        if st in ("disponible", "", "available"):
            Z[zb]["disponibles"] += 1
        elif st in ("vendido", "vendida", "sold"):
            Z[zb]["vendidas"] += 1

    # ── DEMANDA (demand_atoms: interés real por colonia) ──
    try:
        async for a in db.demand_atoms.find({"colonia": {"$ne": None}},
                                            {"_id": 0, "colonia": 1, "peso": 1}):
            zb = zona_base(a["colonia"])
            if zb in Z:
                Z[zb]["demanda"] += float(a.get("peso") or 1)
    except Exception:  # noqa: BLE001
        pass
    # vistas de comprador por desarrollo → su zona (demanda de navegación)
    try:
        async for v in db.buyer_views.find({}, {"_id": 0, "dev_id": 1, "entity_id": 1}):
            zb = dev_zona.get(v.get("dev_id") or v.get("entity_id"))
            if zb:
                Z[zb]["demanda"] += 0.5
    except Exception:  # noqa: BLE001
        pass

    zonas = list(Z.values())
    if not zonas:
        return []

    # ── normalización 0-1 y calor compuesto ──
    def _mx(k):
        return max((z[k] for z in zonas), default=0) or 1
    mx = {k: _mx(k) for k in ("oferta", "demanda", "vendidas", "disponibles")}
    for z in zonas:
        z["heat"] = round(
            _PESOS["oferta"] * (z["oferta"] / mx["oferta"])
            + _PESOS["demanda"] * (z["demanda"] / mx["demanda"])
            + _PESOS["absorcion"] * (z["vendidas"] / mx["vendidas"])
            + _PESOS["disponibles"] * (z["disponibles"] / mx["disponibles"]), 4)
        z["colonia_ids"] = sorted(z.pop("colonia_ids"))
    zonas.sort(key=lambda z: (-z["heat"], -z["oferta"], z["name"]))
    return zonas[:limite]
