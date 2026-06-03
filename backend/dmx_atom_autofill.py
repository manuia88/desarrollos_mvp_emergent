"""
DMX · Fase 1.3 — AUTO-LLENADO del átomo desde NLP (brochure / lista de precios)
═══════════════════════════════════════════════════════════════════════════════
Cierra el ciclo "sin dato → se autollena": toma una extracción LLM (plantilla 'lp'
de recipes/extraction, que ya devuelve unidades {tipo,m2,precio,recamaras,banos,
status,planta}) y la FUSIONA en el átomo (dmx_units) — fill-only: el dato existente
nunca se pisa, solo se llenan los nulls. Si el dev no tiene átomos, los CREA.

extract_lp_units(text) usa el extraction_engine (Claude) existente. Dormant-safe:
sin LLM key / sin libs → devuelve [] y marca dormant (no rompe nada).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from dmx_unit_schema import COLLECTIONS
from dmx_cube_feed import tipologia_from_beds

UNITS = COLLECTIONS["units"]


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _num(v) -> Optional[float]:
    try:
        if v in (None, ""):
            return None
        return float(str(v).replace(",", "").replace("$", "").strip())
    except (TypeError, ValueError):
        return None


def _lp_unit_to_atom(u: Dict[str, Any], development_id: str, idx: int,
                     dev: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Mapea una unidad extraída ('lp') al átomo (parcial · solo lo que trae)."""
    dev = dev or {}
    beds = u.get("recamaras")
    try:
        beds = int(beds) if beds is not None else None
    except (TypeError, ValueError):
        beds = None
    m2 = _num(u.get("m2"))
    precio = _num(u.get("precio"))
    uid = (u.get("unit_id") or u.get("unidad")
           or f"{development_id}-lp-{u.get('planta') or idx}")
    atom = {
        "unit_id": str(uid),
        "development_id": development_id,
        "org_id": dev.get("developer_id"),
        "developer_id": dev.get("developer_id"),
        "tipologia": tipologia_from_beds(beds) if beds is not None else None,
        "areas": {"m2_construido": m2, "m2_privativo": m2},
        "interior": {"recamaras": beds, "banos_completos": _num(u.get("banos"))},
        "position": {"piso": u.get("planta")},
        "commercial": {"precio_lista_mxn": precio, "status": u.get("status")},
        "geo": {"colonia_id": dev.get("colonia_id"), "alcaldia": dev.get("alcaldia")},
        "sources": {"_origin": "lp_extraction"},
        "updated_at": _iso(),
    }
    return atom


def _fill_only(prev: Dict[str, Any], new: Dict[str, Any]) -> Dict[str, Any]:
    """Mezcla recursiva fill-only: el valor previo NO-nulo gana; solo se llenan nulls."""
    out: Dict[str, Any] = {}
    for k, nv in new.items():
        pv = prev.get(k)
        if isinstance(nv, dict) and isinstance(pv, dict):
            out[k] = _fill_only(pv, nv)
        elif pv in (None, "", [], {}):
            out[k] = nv
        else:
            out[k] = pv
    return out


async def autofill_atom_from_lp(db, development_id: str, units: List[Dict[str, Any]],
                                dev: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Fusiona unidades extraídas en el átomo. Fill-only (no pisa dato). Crea si no existe."""
    created = filled = 0
    for i, u in enumerate(units or []):
        atom = _lp_unit_to_atom(u, development_id, i, dev)
        uid = atom["unit_id"]
        prev = await db[UNITS].find_one({"unit_id": uid}, {"_id": 0})
        if prev:
            merged = _fill_only(prev, atom)
            merged["updated_at"] = _iso()
            await db[UNITS].update_one({"unit_id": uid}, {"$set": merged})
            filled += 1
        else:
            await db[UNITS].update_one(
                {"unit_id": uid},
                {"$set": atom, "$setOnInsert": {"created_at": _iso()}},
                upsert=True,
            )
            created += 1
    return {"development_id": development_id, "created": created, "filled": filled,
            "units_in": len(units or [])}


async def extract_lp_units(text: str) -> Dict[str, Any]:
    """Extrae unidades de texto libre (brochure/lista de precios) vía Claude.
    Dormant-safe: sin LLM key/libs → {dormant:True, units:[]}."""
    if not text or len(text.strip()) < 10:
        return {"dormant": False, "units": [], "reason": "texto vacío"}
    try:
        import extraction_engine as ee
        out = await ee._call_claude("adhoc_lp", "lp", text, 0.0)  # reusa pipeline LLM existente
        units = (out or {}).get("unidades") or []
        return {"dormant": False, "units": units, "raw_keys": list((out or {}).keys())}
    except Exception as e:
        # sin key/libs/red → dormido, listo para activarse cuando se configure el LLM
        return {"dormant": True, "units": [], "reason": str(e)[:160]}


async def extract_and_autofill(db, development_id: str, text: str,
                               dev: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Pipeline completo: extrae del texto → autollena el átomo. Dormant-safe."""
    ex = await extract_lp_units(text)
    if ex.get("dormant"):
        return {"ok": True, "dormant": True, "reason": ex.get("reason"),
                "development_id": development_id, "created": 0, "filled": 0}
    res = await autofill_atom_from_lp(db, development_id, ex["units"], dev)
    return {"ok": True, "dormant": False, **res}
