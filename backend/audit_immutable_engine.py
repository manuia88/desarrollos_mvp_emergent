"""W5.11 Parte 1 — Audit Log Inmutable (Merkle-like chain).

REGLAS ABSOLUTAS:
  - Nunca UPDATE ni DELETE sobre audit_immutable (solo INSERT).
  - verify_chain detecta cualquier alteración posterior.
  - log() encadena checksum_sha256 + prev_checksum para garantía criptográfica.

API pública:
    log(db, actor, action, entity_type, entity_id, before, after, request) → audit_id
    verify_chain(db, from_id, to_id) → {valid, broken_at}
    query_audit(db, filters, limit) → list
    ensure_indexes(db)
"""
from __future__ import annotations

import hashlib
import json
import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

_log = logging.getLogger("dmx.audit_immutable")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid() -> str:
    return f"aud_{secrets.token_urlsafe(12)}"


def _sha256(data: Any) -> str:
    raw = json.dumps(data, sort_keys=True, default=str, ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _hash_ip(request) -> Optional[str]:
    if request is None:
        return None
    try:
        ip = getattr(request, "client", None)
        ip_str = ip.host if ip else ""
        return hashlib.sha256(ip_str.encode()).hexdigest()[:16] if ip_str else None
    except Exception:
        return None


# ─── Core: log ────────────────────────────────────────────────────────────────

async def log(
    db,
    actor: Dict[str, Any],
    action: str,
    entity_type: str,
    entity_id: str,
    before: Optional[Any] = None,
    after: Optional[Any] = None,
    request=None,
) -> str:
    """Inserta un row inmutable en audit_immutable encadenando checksum SHA-256.

    Parámetros:
        actor  : dict con claves user_id, role (o str para actor del sistema)
        action : ej. 'merge', 'undo_merge', 'reject', 'login'
        before : estado previo del documento (puede ser None)
        after  : estado nuevo del documento (puede ser None)

    Retorna el audit_id del row insertado.
    """
    if isinstance(actor, str):
        actor = {"user_id": actor, "role": "system"}

    actor_user_id = actor.get("user_id", "system")
    actor_role = actor.get("role", "system")

    audit_id = _uid()
    ts = _now()
    ts_iso = ts.isoformat()

    # Fetch prev_checksum del último row en la cadena (orden temporal)
    prev_checksum: Optional[str] = None
    try:
        last = await db.audit_immutable.find_one(
            {},
            {"_id": 0, "checksum_sha256": 1},
            sort=[("timestamp", -1)],
        )
        if last:
            prev_checksum = last.get("checksum_sha256")
    except Exception as exc:
        _log.warning(f"[audit] could not fetch prev checksum: {exc}")

    # Construir documento (sin checksum todavía)
    doc_body = {
        "id": audit_id,
        "timestamp": ts_iso,
        "actor_user_id": actor_user_id,
        "actor_role": actor_role,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "before_state": before,
        "after_state": after,
        "ip_hash": _hash_ip(request),
        "prev_checksum": prev_checksum,
    }

    # Calcular checksum sobre el documento completo (incluyendo prev_checksum)
    checksum = _sha256(doc_body)
    doc_body["checksum_sha256"] = checksum

    try:
        await db.audit_immutable.insert_one(dict(doc_body))
    except Exception as exc:
        _log.error(f"[audit] insert failed: {exc}")
        raise

    _log.debug(f"[audit] logged id={audit_id} action={action} entity={entity_type}/{entity_id}")
    return audit_id


# ─── verify_chain ─────────────────────────────────────────────────────────────

async def verify_chain(
    db,
    from_id: Optional[str] = None,
    to_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Verifica integridad criptográfica de la cadena de audit.

    Itera en orden temporal.
    Si detecta prev_checksum != checksum del anterior → retorna invalid + broken_at.
    """
    # Si se especifican from/to por timestamp de sus IDs, necesitamos las timestamps
    # Enfoque conservador: iterar toda la cadena (o desde/hasta IDs explícitos)
    rows: List[Dict] = []
    try:
        cursor = db.audit_immutable.find({}, {"_id": 0}).sort("timestamp", 1)
        rows = [r async for r in cursor]
    except Exception as exc:
        return {"valid": False, "broken_at": None, "error": str(exc)}

    if not rows:
        return {"valid": True, "rows_checked": 0}

    # Filtrar rango si se especifica
    if from_id or to_id:
        from_ts = None
        to_ts = None
        if from_id:
            fr = next((r for r in rows if r.get("id") == from_id), None)
            if fr:
                from_ts = fr.get("timestamp")
        if to_id:
            tr = next((r for r in rows if r.get("id") == to_id), None)
            if tr:
                to_ts = tr.get("timestamp")
        if from_ts:
            rows = [r for r in rows if r.get("timestamp", "") >= from_ts]
        if to_ts:
            rows = [r for r in rows if r.get("timestamp", "") <= to_ts]

    prev_checksum: Optional[str] = None
    checked = 0

    for row in rows:
        row_id = row.get("id", "?")
        stored_checksum = row.get("checksum_sha256")
        stored_prev = row.get("prev_checksum")

        # Verificar que prev_checksum coincide con checksum del anterior
        if checked == 0:
            # Primer row: prev_checksum debe ser None
            if stored_prev is not None:
                _log.warning(f"[audit.verify] first row {row_id} has non-null prev_checksum")
                # No consideramos esto ruptura (puede haber rows previos fuera del rango)
        else:
            if stored_prev != prev_checksum:
                return {
                    "valid": False,
                    "broken_at": row_id,
                    "rows_checked": checked,
                    "reason": "prev_checksum_mismatch",
                }

        # Verificar que el checksum almacenado corresponde al contenido del documento
        doc_for_hash = {k: v for k, v in row.items() if k != "checksum_sha256"}
        recomputed = _sha256(doc_for_hash)
        if recomputed != stored_checksum:
            return {
                "valid": False,
                "broken_at": row_id,
                "rows_checked": checked,
                "reason": "checksum_mismatch_content_altered",
            }

        prev_checksum = stored_checksum
        checked += 1

    return {"valid": True, "rows_checked": checked}


# ─── query_audit (read-only) ──────────────────────────────────────────────────

async def query_audit(
    db,
    filters: Optional[Dict[str, Any]] = None,
    limit: int = 100,
    skip: int = 0,
) -> List[Dict[str, Any]]:
    """Query read-only sobre audit_immutable. NUNCA modifica. Solo SELECT."""
    limit = min(limit, 500)
    query = {}
    if filters:
        if filters.get("entity_id"):
            query["entity_id"] = filters["entity_id"]
        if filters.get("entity_type"):
            query["entity_type"] = filters["entity_type"]
        if filters.get("actor_user_id"):
            query["actor_user_id"] = filters["actor_user_id"]
        if filters.get("action"):
            query["action"] = filters["action"]
        if filters.get("date_from") or filters.get("date_to"):
            ts_filter: Dict[str, str] = {}
            if filters.get("date_from"):
                ts_filter["$gte"] = filters["date_from"]
            if filters.get("date_to"):
                ts_filter["$lte"] = filters["date_to"]
            query["timestamp"] = ts_filter

    rows = []
    cursor = db.audit_immutable.find(query, {"_id": 0}).sort("timestamp", -1).skip(skip).limit(limit)
    async for row in cursor:
        rows.append(row)
    return rows


# ─── ensure_indexes ───────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    from pymongo import ASCENDING, DESCENDING

    # Principal orden temporal (desc para queries recientes)
    await db.audit_immutable.create_index(
        [("timestamp", DESCENDING)], name="idx_audit_timestamp_desc"
    )
    # Por entidad
    await db.audit_immutable.create_index(
        [("entity_type", ASCENDING), ("entity_id", ASCENDING)],
        name="idx_audit_entity",
    )
    # Por actor
    await db.audit_immutable.create_index(
        [("actor_user_id", ASCENDING)], name="idx_audit_actor"
    )
    # Por acción
    await db.audit_immutable.create_index(
        [("action", ASCENDING)], name="idx_audit_action"
    )

    _log.info("[w5.11] audit_immutable indexes OK")
