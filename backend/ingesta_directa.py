"""INGESTA DIRECTA — merge, JAMÁS reemplazo (upgrade #2 del modelo de extracción).

La entrada canónica del masivo: unidades ya extraídas/fusionadas → merge_into_dev
(el mismo riel del bulk ingest: deltas de precio a price_events, estatus a
unit_status_events, campos finos sin borrar lo que hay) → bitácora → conciliador →
cotejo → auditor → grafo. La primera carga crea; TODA carga posterior apila historia.
Con identidad canónica: 'T2 - 1901' de la lista encuentra a 'T2-1901' de la base.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional


async def cargar_lote(db, target_dev_id: str, unidades: List[Dict[str, Any]],
                      origen: str = "ingesta_directa",
                      fuentes_pdf: Optional[List[bytes]] = None,
                      fuente_excel: Optional[bytes] = None,
                      fuentes_meta: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """unidades en el vocabulario de extracción (unit_number, price_mxn, size_m2,
    bedrooms…). Pasa TODO por el merge canónico + dispara el circuito completo."""
    import bulk_ingest_engine as bie
    from actas_ingesta import abrir_acta, cerrar_acta
    acta_id = await abrir_acta(db, target_dev_id, origen, fuentes_meta)
    item = {"extracted": {"units": unidades}, "job_id": None, "id": f"directa_{origen}"}
    antes = await db.units.count_documents({"development_id": target_dev_id})
    await bie.merge_into_dev(db, item, target_dev_id)
    despues = await db.units.count_documents({"development_id": target_dev_id})
    # el circuito automático (mismo orden que aprobar en la bandeja)
    try:
        from market_timeline import snapshot_oferta
        await snapshot_oferta(db, fuente=origen)
    except Exception:  # noqa: BLE001
        pass
    import prototype_engine as PE
    import cotejo_engine as CE
    r = await PE.materializar(db, target_dev_id)
    await CE.cotejar_desarrollo(db, target_dev_id)
    try:
        from auditor_catalogo import auditar
        await auditar(db, target_dev_id)
    except Exception:  # noqa: BLE001
        pass
    try:
        from knowledge_graph_engine import kg_sync
        await kg_sync.sync_moldes(db)
    except Exception:  # noqa: BLE001
        pass
    juez = None
    if fuentes_pdf:
        try:
            from juez_automatico import juzgar_desarrollo
            juez = await juzgar_desarrollo(db, target_dev_id, fuentes_pdf, fuente_excel)
        except Exception:  # noqa: BLE001 — el juez nunca bloquea la carga; su veredicto sí
            pass
    try:
        from ml_precios import entrenar_y_publicar
        await entrenar_y_publicar(db)      # el hedónico madura con cada carga
    except Exception:  # noqa: BLE001
        pass
    resultado = {"development_id": target_dev_id, "unidades_antes": antes,
                 "unidades_despues": despues, "moldes": r.get("prototipos"),
                 "origen": origen, "acta_id": acta_id,
                 "juez": {"pct": juez.get("pct"), "gate_98": juez.get("gate_98")} if juez else None}
    await cerrar_acta(db, acta_id, {k: v for k, v in resultado.items()
                                    if k != "development_id"})
    return resultado
