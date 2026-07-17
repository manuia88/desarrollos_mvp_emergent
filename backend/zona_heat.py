"""CALOR DE ZONAS — ranking automático de zonas por lo que un COMPRADOR puede comprar HOY,
qué tanto la buscan, y qué tan viva está (founder 07-17). DINÁMICO: se recalcula de datos
vivos en cada request; cuando el robot aplica cambios de lista (precio/estatus) al inventario,
el siguiente cálculo reordena solo — un proyecto que se agota BAJA porque su disponible cae.

CORRECCIÓN 07-17 (founder cazó, aplica a TODOS los proyectos): antes pesaba "vendidas de por
vida" (0.22) → una zona AGOTADA (los Icon: 348 vendidas, 1 depa) salía arriba aunque no
hubiera qué comprar. Ahora el peso manda al INVENTARIO ACTIVO + DEMANDA:
· disponibles   = unidades a la venta AHORA (0.34 — lo que de verdad puede comprar)
· demanda       = señales de interés reales (demand_atoms + vistas) (0.30)
· oferta_activa = # desarrollos CON inventario disponible (0.22 — no cuenta los agotados)
· deseabilidad  = ventas históricas, RAÍZ (topada) → solo bonus de "zona probada" (0.14)
Las zonas SIN inventario disponible quedan al final (nada que ofrecer al comprador).
Cuando haya histórico real de ventas en el tiempo, 'deseabilidad' se cambia por velocidad
reciente (ventana 90d) — hoy las fechas son de la carga, no de ventas longitudinales.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List

from zona_packs import zona_base

_PESOS = {"disponibles": 0.34, "demanda": 0.30, "oferta_activa": 0.22, "deseabilidad": 0.14}


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
                                   "alcaldia": None, "oferta": 0, "oferta_activa": 0,
                                   "disponibles": 0, "vendidas": 0, "demanda": 0.0,
                                   "colonia_ids": set()})

    # ── OFERTA + inventario (developments + units) ──
    dev_zona: Dict[str, str] = {}
    async for d in db.developments.find(
            {}, {"_id": 0, "id": 1, "colonia_id": 1, "alcaldia": 1}):
        cid = d.get("colonia_id")
        if not cid:
            continue
        zb = zona_base(cid)
        z = _z(zb)
        z["oferta"] += 1
        z["colonia_ids"].add(cid)
        z["alcaldia"] = z["alcaldia"] or d.get("alcaldia")
        dev_zona[d["id"]] = zb

    # unidades por dev → disponibles / vendidas; y qué DEVS tienen inventario vivo
    dev_disp: Dict[str, int] = {}
    async for u in db.units.find({}, {"_id": 0, "development_id": 1, "status": 1, "type": 1}):
        did = u.get("development_id")
        zb = dev_zona.get(did)
        if not zb or (u.get("type") or "depto") in ("roof_garden", "roof", "local", "bodega"):
            continue
        st = (u.get("status") or "").lower()
        if st in ("disponible", "", "available"):
            Z[zb]["disponibles"] += 1
            dev_disp[did] = dev_disp.get(did, 0) + 1
        elif st in ("vendido", "vendida", "sold"):
            Z[zb]["vendidas"] += 1
    # oferta_activa = desarrollos CON al menos 1 disponible (los agotados no cuentan)
    for did, n in dev_disp.items():
        if n > 0:
            Z[dev_zona[did]]["oferta_activa"] += 1

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

    # ── normalización 0-1 y calor compuesto (deseabilidad = raíz de vendidas, topada) ──
    for z in zonas:
        z["deseabilidad"] = math.sqrt(z["vendidas"])
    def _mx(k):
        return max((z[k] for z in zonas), default=0) or 1
    mx = {k: _mx(k) for k in ("disponibles", "demanda", "oferta_activa", "deseabilidad")}
    for z in zonas:
        vivo = z["disponibles"] > 0                 # ¿hay algo que comprar?
        z["heat"] = round(
            _PESOS["disponibles"] * (z["disponibles"] / mx["disponibles"])
            + _PESOS["demanda"] * (z["demanda"] / mx["demanda"])
            + _PESOS["oferta_activa"] * (z["oferta_activa"] / mx["oferta_activa"])
            + _PESOS["deseabilidad"] * (z["deseabilidad"] / mx["deseabilidad"]), 4)
        z["agotada"] = not vivo
        z["colonia_ids"] = sorted(z.pop("colonia_ids"))
        z.pop("deseabilidad", None)
    # las zonas SIN inventario disponible van al final (nada que comprar), luego por calor
    zonas.sort(key=lambda z: (z["agotada"], -z["heat"], -z["oferta_activa"], z["name"]))
    return zonas[:limite]
