"""ACTAS DE INGESTA — cada carga escribe su acta; toda acta se puede DESHACER.

El trío del masivo seguro (07-15): auditabilidad (qué fuentes, cuántas unidades, veredictos
por capa, tiempo) + reversa (respaldo del estado previo del dev → deshacer_lote restaura) +
la materia prima del juez periódico (file_ids de las fuentes para re-juzgar cada mes).
Colección: actas_ingesta. $0.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


async def abrir_acta(db, development_id: str, origen: str,
                     fuentes_meta: Optional[List[Dict[str, Any]]] = None) -> str:
    """Antes de tocar nada: respaldo del estado previo (las unidades del dev tal cual)."""
    previas = await db.units.find({"development_id": development_id}, {"_id": 0}).to_list(5000)
    acta_id = f"acta_{secrets.token_urlsafe(8)}"
    await db.actas_ingesta.insert_one({
        "id": acta_id, "development_id": development_id, "origen": origen,
        "ts": datetime.now(timezone.utc).isoformat(),
        "fuentes": fuentes_meta or [],
        "respaldo_unidades": previas, "n_previas": len(previas),
        "estado": "abierta"})
    return acta_id


async def cerrar_acta(db, acta_id: str, resultado: Dict[str, Any]) -> None:
    await db.actas_ingesta.update_one({"id": acta_id},
                                      {"$set": {"estado": "cerrada",
                                                "resultado": resultado}})


async def deshacer_lote(db, acta_id: str) -> Dict[str, Any]:
    """La reversa: restaura las unidades EXACTAS previas a la carga (y borra las nuevas).
    La bitácora NO se toca (append-only: la historia de que pasó, se queda)."""
    acta = await db.actas_ingesta.find_one({"id": acta_id}, {"_id": 0})
    if not acta:
        return {"ok": False, "error": "acta no encontrada"}
    dev = acta["development_id"]
    await db.units.delete_many({"development_id": dev})
    for u in acta.get("respaldo_unidades") or []:
        await db.units.insert_one(dict(u))
    await db.actas_ingesta.update_one({"id": acta_id},
                                      {"$set": {"estado": "revertida"}})
    # re-conciliar al estado restaurado
    import prototype_engine as PE
    await PE.materializar(db, dev)
    return {"ok": True, "development_id": dev,
            "unidades_restauradas": acta.get("n_previas")}
