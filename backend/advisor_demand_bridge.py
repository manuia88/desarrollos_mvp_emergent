"""advisor_demand_bridge — el asesor también capta DEMANDA (búsquedas de sus clientes), pero vivía en un silo:
`asesor_busquedas` nunca llegaba a los agregados de demanda que consumen dev y superadmin (demand_intelligence,
dev_market, grafo del comprador). Este puente materializa esas búsquedas como DEMANDA ANÓNIMA en
`marketplace_searches` (source='asesor_anon') → cierra el cable roto sin romper AUTHZ.

Privacidad / AUTHZ (modelo canónico · [[AUTHZ_MODEL_LEADS]]):
  - Se ELIMINA toda PII y linaje: contacto_id, owner_id, notas, fuente, matched_dev_ids, id del asesor.
  - Solo viajan los CRITERIOS de demanda (zona, precio, recámaras, m², plazo, crédito).
  - dedup_key = hash(id de la búsqueda) → idempotente (re-correr NO duplica) sin exponer el id real.
  - El k-anon (≥3) lo aplican los agregados downstream (cube_olap / demand_intelligence), igual que con las
    búsquedas del perfilador y del marketplace. El asesor sigue viendo SOLO sus leads (esto no toca esa vía).
"""
import hashlib
import logging
import uuid
from datetime import datetime, timezone

log = logging.getLogger("dmx.advisor_demand_bridge")

MAX_BATCH = 5000


def _anon_doc(bq: dict) -> dict:
    """Una búsqueda del asesor → doc anónimo con el mismo shape que consume la demanda (marketplace_searches)."""
    cols = [c for c in (bq.get("colonias") or []) if c]
    matched = bq.get("matched_dev_ids") or []
    now = datetime.now(timezone.utc)
    created = bq.get("created_at")
    src_id = str(bq.get("id") or uuid.uuid4().hex)
    dedup = "asesor_" + hashlib.sha256(f"asesor_busq:{src_id}".encode()).hexdigest()[:20]
    return {
        "id": f"mks_{hashlib.sha256(src_id.encode()).hexdigest()[:12]}",
        "source": "asesor_anon",
        "colonias": cols,
        "colonia_id": (cols[0] if cols else None),
        "recamaras_min": bq.get("recamaras_min"),
        "banos_min": bq.get("banos_min"),
        "estacionamientos_min": bq.get("estacionamientos_min"),
        "m2_min": bq.get("m2_min"),
        "precio_max": bq.get("precio_max"),
        "precio_min": bq.get("precio_min"),
        "amenidades": bq.get("amenidades") or [],
        "plazo": bq.get("plazo_compra"),
        "credito": bq.get("credito_tipo"),
        "uso": None,
        "stages": [],
        "results_count": len(matched),
        "unmet": (len(matched) == 0),
        "visitor_id": None,   # anónimo: sin identidad ni linaje al asesor/cliente
        "ip_hash": None,
        "created_at": created if isinstance(created, str) else now.isoformat(),
        "created_at_dt": now,
        "dedup_key": dedup,
    }


async def materialize_asesor_busquedas(db, limit: int = MAX_BATCH) -> dict:
    """Idempotente (upsert por dedup_key). Corre a diario antes de la materialización del cubo."""
    n = 0
    try:
        cursor = db.asesor_busquedas.find({}, {"_id": 0}).sort("created_at", -1).limit(limit)
        async for bq in cursor:
            doc = _anon_doc(bq)
            await db.marketplace_searches.update_one(
                {"dedup_key": doc["dedup_key"]}, {"$set": doc}, upsert=True,
            )
            n += 1
    except Exception as e:  # noqa: BLE001
        log.warning(f"[advisor_demand_bridge] materialize falló: {e}")
    if n:
        log.info(f"[advisor_demand_bridge] materializadas {n} búsquedas del asesor → demanda anónima")
    return {"materialized": n, "source": "asesor_anon"}


async def match_asesor_busquedas(db, limit: int = MAX_BATCH) -> dict:
    """El RETORNO del ciclo (auditoría N3): la demanda del asesor subía al cubo pero nunca VOLVÍA como
    oportunidades. Matchea cada búsqueda activa contra el inventario (mismas primitivas que la casamentera:
    perfil duro por zona/precio/recámaras + unidades disponibles) y llena `matched_dev_ids` → el asesor ve
    qué desarrollos encajan con su cliente. Owner-scoped: todo queda en asesor_busquedas, cero PII fuera.
    También actualiza el espejo anónimo (results_count/unmet) → los agregados de demanda quedan honestos."""
    try:
        from data_developments import DEVELOPMENTS
        from routes.perfil_recomendar import _passes_extra
        from routes.casamentera import _profile_from_search, _matching_units
    except Exception as e:  # noqa: BLE001
        log.warning(f"[advisor_demand_bridge] match imports fallaron: {e}")
        return {"matched": 0}
    n = 0
    now = datetime.now(timezone.utc).isoformat()
    try:
        cursor = db.asesor_busquedas.find(
            {"stage": {"$nin": ["cerrada", "ganada", "perdida", "descartada"]}}, {"_id": 0}).limit(limit)
        async for bq in cursor:
            s = {  # shape que esperan las primitivas de la casamentera
                "colonias": bq.get("colonias") or [], "precio_max": bq.get("precio_max"),
                "recamaras_min": bq.get("recamaras_min"), "banos_min": bq.get("banos_min"),
                "estacionamientos_min": bq.get("estacionamientos_min"), "m2_min": bq.get("m2_min"),
            }
            try:
                prof = _profile_from_search(s)
            except Exception:
                continue
            matches = []
            for d in DEVELOPMENTS:
                try:
                    if not _passes_extra(d, prof):
                        continue
                    unidades = _matching_units(d, s)
                    if (d.get("units") or []) and not unidades:
                        continue  # tiene lista de precios pero ninguna unidad disponible cumple
                    matches.append(d.get("id"))
                    if len(matches) >= 12:
                        break
                except Exception:
                    continue
            if set(matches) != set(bq.get("matched_dev_ids") or []):
                await db.asesor_busquedas.update_one(
                    {"id": bq.get("id")},
                    {"$set": {"matched_dev_ids": matches, "matched_at": now}})
                n += 1
            # Espejo anónimo honesto: con matches, esa demanda deja de contar como insatisfecha.
            try:
                src_id = str(bq.get("id") or "")
                if src_id:
                    dedup = "asesor_" + hashlib.sha256(f"asesor_busq:{src_id}".encode()).hexdigest()[:20]
                    await db.marketplace_searches.update_one(
                        {"dedup_key": dedup},
                        {"$set": {"results_count": len(matches), "unmet": (len(matches) == 0)}})
            except Exception:
                pass
    except Exception as e:  # noqa: BLE001
        log.warning(f"[advisor_demand_bridge] match falló: {e}")
    if n:
        log.info(f"[advisor_demand_bridge] {n} búsquedas del asesor con matches actualizados")
    return {"matched": n}


async def ensure_indexes(db) -> None:
    try:
        await db.marketplace_searches.create_index(
            [("source", 1), ("dedup_key", 1)], name="mks_source_dedup",
        )
    except Exception as e:  # noqa: BLE001
        log.warning(f"[advisor_demand_bridge] index: {e}")


def register_advisor_bridge_job(scheduler, db) -> None:
    """Job diario 03:15 MX (antes de la materialización del cubo 03:30) → la demanda del asesor entra al ciclo."""
    from apscheduler.triggers.cron import CronTrigger

    async def _run():
        await materialize_asesor_busquedas(db)
        await match_asesor_busquedas(db)   # el retorno: llena matched_dev_ids para el asesor

    scheduler.add_job(
        _run, CronTrigger(hour=9, minute=15),  # 03:15 MX ≈ 09:15 UTC
        id="advisor_demand_bridge_daily", replace_existing=True, misfire_grace_time=3600,
    )
