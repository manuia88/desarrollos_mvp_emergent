"""C1 Escala · Índices del portal Dev que faltaban (full-scan → index scan).

Cada query caliente del portal Dev que antes barría la colección entera ahora
tiene su índice. Todos con `background=True` (no bloquean el arranque) y
FAIL-OPEN por índice (si uno falla — p.ej. datos duplicados en un índice único —
no tumba el resto ni el arranque). Idempotente: `create_index` es no-op si ya existe.

NO se crean índices ÚNICOS aquí a propósito: un único sobre datos existentes con
duplicados fallaría; la meta es VELOCIDAD de lectura, no la restricción.
"""
from __future__ import annotations

import logging

log = logging.getLogger("dmx.dev_scale_indexes")

# (colección, lista de specs de índice) — specs en formato motor/pymongo.
_DEV_SCALE_SPECS = {
    # IE breakdown / mapas / export — query por zona+código+stub
    "ie_scores": [[("zone_id", 1), ("code", 1), ("is_stub", 1)]],
    # Dashboard / listados por organización
    "projects": [[("dev_org_id", 1)], [("developer_id", 1)]],
    # Inventario y estados de unidad
    # (developer_unit_overrides.unit_id y dev_org_settings.dev_org_id ya existen
    #  como índices ÚNICOS — no se repiten aquí para no chocar por nombre.)
    "units": [[("project_id", 1), ("status", 1)]],
    "developer_unit_overrides": [[("dev_id", 1)]],
    "unit_engagement": [[("dev_id", 1), ("unit_id", 1)]],
    "unit_holds": [[("unit_id", 1)], [("dev_id", 1), ("status", 1)]],
    # Fotos / assets públicos
    "dev_assets": [[("development_id", 1)], [("development_id", 1), ("asset_type", 1)]],
    # CRM / demanda — leads y citas por org + tiempo
    "leads": [[("dev_org_id", 1), ("created_at", -1)], [("project_id", 1)],
              [("inmobiliaria_id", 1), ("created_at", -1)]],
    "appointments": [[("dev_org_id", 1), ("created_at", -1)], [("created_at", -1)]],
    # Configuración / pagos por proyecto (dev_org_settings ya tiene único en dev_org_id)
    "dev_payment_schemes": [[("project_id", 1)]],
    # Ficha del proyecto (project_full) — sub-colecciones por proyecto
    "project_amenities": [[("project_id", 1)]],
    "project_commercialization": [[("project_id", 1)]],
    "project_construction_progress": [[("project_id", 1)]],
    # ── Auditoría de rendimiento (Batch 11) · índices faltantes confirmados ──
    # colonias se consulta por el campo `id` (NO _id) en _colonia_value / colonia_watch_list
    # (público, caliente) sobre ~2,788 docs → antes COLLSCAN.
    "colonias": [[("id", 1)]],
    # buyer_signals se filtra por type + ventana de created_at_dt en múltiples scans de demanda
    # (demand_by_feature, marketplace_granularity) → compuesto (type, created_at_dt).
    "buyer_signals": [[("type", 1), ("created_at_dt", -1)]],
    # marketplace_searches se recorre por rango de fecha (demanda_mapa) sin índice de solo-fecha.
    "marketplace_searches": [[("created_at_dt", -1)]],
    # asistente_messages se filtra por role (+ fecha, tras el fix de query del backlog) en conversation_intel /
    # competitor_mentions → índice (role, created_at) para cuando la query deje de traer todo.
    "asistente_messages": [[("role", 1), ("created_at", 1)]],
}


async def ensure_dev_scale_indexes(db) -> None:
    created = 0
    for coll, specs in _DEV_SCALE_SPECS.items():
        for keys in specs:
            try:
                await db[coll].create_index(keys, background=True)
                created += 1
            except Exception as exc:
                log.warning(f"[dev_scale_indexes] {coll} {keys} warning: {exc}")
    log.info(f"[dev_scale_indexes] ensured {created} índices (background)")
