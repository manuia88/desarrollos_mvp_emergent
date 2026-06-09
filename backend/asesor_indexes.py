"""Índices de las colecciones del módulo asesor (CRM).

Paso 3 de la auditoría: hasta ahora estas colecciones NO tenían NINGÚN índice
→ COLLSCAN en cada endpoint del asesor (abrir "Mis Leads" escaneaba toda la
colección). Las formas de consulta se extrajeron de routes/advisor.py +
services/* (owner_id / contacto_id / id como filtros; created_at/ts/due_at/date
como orden).

create_index es idempotente (si el índice ya existe, no-op). FAIL-OPEN por
índice: si uno falla (p.ej. datos duplicados), se loggea y sigue — nunca tumba
el arranque.
"""
import logging

log = logging.getLogger("dmx.asesor_indexes")

# coll → lista de índices (cada índice = lista de (campo, dirección))
_SPECS = {
    "asesor_contactos": [
        [("owner_id", 1), ("created_at", -1)],   # board: leads del asesor por fecha
        [("id", 1)],                              # lookup por PK lógica ({id}/{id,owner_id})
        [("owner_id", 1), ("phones_norm", 1)],    # dedup por teléfono (multikey)
    ],
    "asesor_operaciones": [
        [("owner_id", 1), ("status", 1)],         # conteos por etapa de operación
        [("owner_id", 1), ("created_at", -1)],    # listado por fecha
        [("id", 1)],
        [("contacto_id", 1)],                     # overview del contacto
    ],
    "asesor_tareas": [
        [("owner_id", 1), ("done", 1), ("due_at", 1)],  # pendientes por vencimiento
        [("owner_id", 1), ("entity_id", 1)],            # tareas ligadas a un contacto
        [("id", 1)],
    ],
    "asesor_busquedas": [
        [("owner_id", 1), ("contacto_id", 1)],    # búsqueda del contacto
        [("owner_id", 1), ("created_at", -1)],
        [("id", 1)],
    ],
    "asesor_contacto_timeline": [
        [("contacto_id", 1), ("ts", -1)],         # timeline del contacto (overview)
    ],
    "asesor_taste_profile": [
        [("owner_id", 1), ("contacto_id", 1)],    # clave del upsert + lecturas
    ],
    "asesor_photo_tags": [
        [("dev_id", 1)],
    ],
    "asesor_briefings": [
        [("user_id", 1), ("date", -1)],           # último briefing del asesor
    ],
    "lead_events": [
        [("owner_id", 1), ("contacto_id", 1), ("ts", -1)],  # hilo de actividad del lead
    ],
}


async def ensure_asesor_indexes(db) -> None:
    created = 0
    for coll, indexes in _SPECS.items():
        for keys in indexes:
            try:
                await db[coll].create_index(keys, background=True)
                created += 1
            except Exception as exc:
                log.warning(f"[asesor_indexes] {coll} {keys} warning: {exc}")
    log.info(f"[asesor_indexes] ensured {created} índices")
