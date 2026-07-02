"""W5.11 Parte 1 — Motor Entity Resolution + Deduplicación (8 capas).

8 capas de decisión:
  1. Normalización multi-campo (email, phone, nombre, address)
  2. Score combinado ponderado (email×0.40 + phone×0.30 + nombre×0.20 + address×0.10)
  3. MIN_MATCHED_FIELDS ≥ 2 (mínimo 2 campos con score ≥ 80)
  4. Blacklist (par marcado como NOT dup → nunca sugerir de nuevo)
  5. Ventana temporal (>1 año → forzar manual review)
  6. Cross-asesor (assigned_to diferente → forzar manual, tier=medium)
  7. Threshold auto-merge (≥95) vs manual review (75-94)
  8. Archive inmutable + undo window 30d

API pública:
    compute_score(a, b) → {score_combined, breakdown, matched_fields}
    detect_duplicates(db, entity_type) → list
    auto_merge(db, canonical_id, candidate_id, entity_type, actor) → merge_id
    undo_merge(db, merge_id, actor) → bool
    detect_broker_fraud_pattern(db, asesor_id) → dict
    ensure_indexes(db)
"""
from __future__ import annotations

import logging
import re
import secrets
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.entity_resolution")

# ─── Umbrales ─────────────────────────────────────────────────────────────────
THRESHOLD_AUTO_MERGE = 95
THRESHOLD_MANUAL_REVIEW = 75
MIN_MATCHED_FIELDS = 2
FIELD_MATCH_MIN = 80   # Score mínimo para contar un campo como "matched"
TEMPORAL_WARN_DAYS = 365   # >1 año → forzar manual
UNDO_WINDOW_DAYS = 30
FRAUD_PATTERN_THRESHOLD = 3   # ≥3 intentos sospechosos en 30d
# Límite de pares a evaluar por entity_type (evita O(n²) explosivo en prod)
MAX_PAIRS_PER_RUN = 2000

# Títulos comunes que se eliminan en normalización de nombre
_TITULOS = re.compile(
    r"\b(sr\.?|sra\.?|dr\.?|dra\.?|lic\.?|ing\.?|arq\.?|mtro\.?|c\.p\.?)\b",
    re.IGNORECASE,
)


# ─── Normalización ────────────────────────────────────────────────────────────

def normalize_email(s: Optional[str]) -> str:
    if not s:
        return ""
    s = s.strip().lower()
    # Gmail: eliminar puntos en parte local (juan.lopez@gmail.com → juanlopez@gmail.com)
    if "@gmail.com" in s or "@googlemail.com" in s:
        local, _, domain = s.partition("@")
        local = local.replace(".", "").split("+")[0]  # también quitar alias +xxx
        s = f"{local}@{domain}"
    return s


def normalize_phone(s: Optional[str]) -> str:
    if not s:
        return ""
    # Solo dígitos
    digits = re.sub(r"[^\d]", "", s)
    # Eliminar prefijo de país México (+52 / 52) y prefijo móvil 1
    if digits.startswith("521") and len(digits) == 13:
        digits = digits[3:]   # 521XXXXXXXXXX → 10d
    elif digits.startswith("52") and len(digits) == 12:
        digits = digits[2:]   # 52XXXXXXXXXX → 10d
    elif digits.startswith("1") and len(digits) == 11:
        digits = digits[1:]   # USA 1XXXXXXXXXX → 10d (algunos MX usan)
    return digits


def normalize_name(s: Optional[str]) -> str:
    if not s:
        return ""
    # Eliminar acentos
    nfkd = unicodedata.normalize("NFKD", s)
    ascii_str = nfkd.encode("ascii", "ignore").decode("ascii")
    # Lowercase, eliminar títulos, collapse spaces
    result = _TITULOS.sub("", ascii_str.lower())
    result = re.sub(r"\s+", " ", result).strip()
    return result


def normalize_address(s: Optional[str]) -> str:
    if not s:
        return ""
    s = s.lower().strip()
    # Eliminar acentos
    nfkd = unicodedata.normalize("NFKD", s)
    s = nfkd.encode("ascii", "ignore").decode("ascii")
    # Abreviaturas comunes
    s = re.sub(r"\bcalle\b", "c.", s)
    s = re.sub(r"\bavenida\b", "av.", s)
    s = re.sub(r"\bcolonia\b", "col.", s)
    return re.sub(r"\s+", " ", s).strip()


# ─── Score combinado ──────────────────────────────────────────────────────────

def compute_score(
    entity_a: Dict[str, Any],
    entity_b: Dict[str, Any],
) -> Dict[str, Any]:
    """Calcula score de similitud entre dos entidades.
    Pesos: email×0.40 + phone×0.30 + nombre×0.20 + address×0.10
    """
    from rapidfuzz import fuzz

    # Email (match exacto normalizado = 100, sino 0)
    email_a = normalize_email(_get_email(entity_a))
    email_b = normalize_email(_get_email(entity_b))
    email_score = 100 if (email_a and email_b and email_a == email_b) else 0

    # Phone (match exacto normalizado = 100, sino 0)
    phone_a = normalize_phone(_get_phone(entity_a))
    phone_b = normalize_phone(_get_phone(entity_b))
    phone_score = 100 if (phone_a and phone_b and phone_a == phone_b) else 0

    # Nombre (fuzzy WRatio)
    name_a = normalize_name(_get_name(entity_a))
    name_b = normalize_name(_get_name(entity_b))
    if name_a and name_b:
        nombre_score = fuzz.WRatio(name_a, name_b)
    else:
        nombre_score = 0

    # Address (fuzzy WRatio)
    addr_a = normalize_address(_get_address(entity_a))
    addr_b = normalize_address(_get_address(entity_b))
    if addr_a and addr_b:
        address_score = fuzz.WRatio(addr_a, addr_b)
    else:
        address_score = 0

    score_combined = (
        email_score * 0.40
        + phone_score * 0.30
        + nombre_score * 0.20
        + address_score * 0.10
    )

    breakdown = {
        "email": round(email_score, 1),
        "phone": round(phone_score, 1),
        "nombre": round(nombre_score, 1),
        "address": round(address_score, 1),
    }

    # Campos con match real (ambos tienen dato + score >= FIELD_MATCH_MIN)
    matched_fields = 0
    if email_a and email_b and email_score >= FIELD_MATCH_MIN:
        matched_fields += 1
    if phone_a and phone_b and phone_score >= FIELD_MATCH_MIN:
        matched_fields += 1
    if name_a and name_b and nombre_score >= FIELD_MATCH_MIN:
        matched_fields += 1
    if addr_a and addr_b and address_score >= FIELD_MATCH_MIN:
        matched_fields += 1

    return {
        "score_combined": round(score_combined, 2),
        "breakdown": breakdown,
        "matched_fields": matched_fields,
    }


# ─── Capas de decisión ────────────────────────────────────────────────────────

async def is_in_blacklist(db, a_id: str, b_id: str) -> bool:
    """Capa 4: Blacklist de pares marcados como NOT duplicate."""
    result = await db.dedup_blacklist.find_one({
        "$or": [
            {"entity_a_id": a_id, "entity_b_id": b_id},
            {"entity_a_id": b_id, "entity_b_id": a_id},
        ]
    })
    return result is not None


def is_in_temporal_window(entity_a: Dict, entity_b: Dict) -> Tuple[bool, bool]:
    """Capa 5: Ventana temporal.
    Returns (temporal_ok, requires_manual_due_age)
    temporal_ok = True si diff ≤ 90d
    requires_manual_due_age = True si diff > TEMPORAL_WARN_DAYS (1 año)
    """
    ts_a = _parse_ts(entity_a.get("created_at"))
    ts_b = _parse_ts(entity_b.get("created_at"))
    if not ts_a or not ts_b:
        return True, False
    diff = abs((ts_a - ts_b).total_seconds()) / 86400
    temporal_ok = diff <= 90
    requires_manual = diff > TEMPORAL_WARN_DAYS
    return temporal_ok, requires_manual


def is_cross_asesor(entity_a: Dict, entity_b: Dict) -> bool:
    """Capa 6: Cross-asesor. assigned_to diferente → forzar manual."""
    a_asesor = entity_a.get("assigned_to") or ""
    b_asesor = entity_b.get("assigned_to") or ""
    if not a_asesor or not b_asesor:
        return False
    return a_asesor != b_asesor


# ─── Detect duplicates ────────────────────────────────────────────────────────

async def detect_duplicates(
    db, entity_type: str
) -> List[Dict[str, Any]]:
    """Detecta pares duplicados en la collection dada.
    Aplica las 8 capas de decisión.
    Retorna lista de dicts para insertar en entity_duplicates_pending.
    """
    collection = _get_collection(db, entity_type)
    if collection is None:
        log.warning(f"[dedup] unknown entity_type={entity_type}")
        return []

    # Cargar entidades activas (no merged, no deleted)
    docs: List[Dict] = []
    async for doc in collection.find(
        {"merged_into": {"$exists": False}, "deleted_at": {"$exists": False}},
        {"_id": 0},
    ).limit(500):  # Límite conservador para evitar O(n²) explosivo
        docs.append(doc)

    pending: List[Dict] = []
    evaluated = 0
    total_pairs = 0

    for i in range(len(docs)):
        for j in range(i + 1, len(docs)):
            total_pairs += 1
            if total_pairs > MAX_PAIRS_PER_RUN:
                log.warning(f"[dedup] entity_type={entity_type} hit MAX_PAIRS_PER_RUN limit")
                break

            a = docs[i]
            b = docs[j]
            a_id = _get_id(a)
            b_id = _get_id(b)

            if not a_id or not b_id:
                continue

            evaluated += 1

            # Capa 4: Blacklist
            if await is_in_blacklist(db, a_id, b_id):
                continue

            # Score
            result = compute_score(a, b)
            score = result["score_combined"]
            matched = result["matched_fields"]

            # Capa 3: Mínimo campos
            if matched < MIN_MATCHED_FIELDS:
                continue
            # Capa 2: Umbral mínimo
            if score < THRESHOLD_MANUAL_REVIEW:
                continue

            # Capa 5: Ventana temporal
            _, requires_manual_age = is_in_temporal_window(a, b)

            # Capa 6: Cross-asesor
            cross = is_cross_asesor(a, b)

            # Determinar tier y si auto-merge aplica
            if score >= THRESHOLD_AUTO_MERGE and not cross and not requires_manual_age:
                tier = "high"
            elif cross or requires_manual_age:
                tier = "medium"
            else:
                tier = "medium" if score < 90 else "high"

            # Canonical = el más antiguo
            canonical_id, candidate_id = _order_canonical(a, b)

            # Verificar si ya existe pending para este par
            existing = await db.entity_duplicates_pending.find_one({
                "canonical_id": canonical_id,
                "candidate_id": candidate_id,
                "status": {"$in": ["pending"]},
            })
            if existing:
                continue

            pending_doc = {
                "id": f"dedup_{secrets.token_urlsafe(10)}",
                "entity_type": entity_type,
                "canonical_id": canonical_id,
                "candidate_id": candidate_id,
                "score_combined": score,
                "breakdown": result["breakdown"],
                "matched_fields": matched,
                "confidence_tier": tier,
                "cross_asesor": cross,
                "requires_manual_age": requires_manual_age,
                "status": "pending",
                "detected_at": _now().isoformat(),
                "resolved_by": None,
                "resolved_at": None,
                "resolved_action": None,
            }
            pending.append(pending_doc)

        if total_pairs > MAX_PAIRS_PER_RUN:
            break

    log.info(f"[dedup] entity_type={entity_type} docs={len(docs)} evaluated={evaluated} pending={len(pending)}")
    return pending


# ─── Auto-merge ───────────────────────────────────────────────────────────────

async def auto_merge(
    db,
    canonical_id: str,
    candidate_id: str,
    entity_type: str,
    actor: Optional[Dict] = None,
) -> str:
    """Regla 8: NUNCA hard-delete. Archive + soft-delete candidate + audit."""
    if actor is None:
        actor = {"user_id": "entity_resolution_engine", "role": "system"}

    collection = _get_collection(db, entity_type)

    # Fetch ambas entidades
    canonical = await collection.find_one({"$or": [{"id": canonical_id}, {"user_id": canonical_id}]}, {"_id": 0})
    candidate = await collection.find_one({"$or": [{"id": candidate_id}, {"user_id": candidate_id}]}, {"_id": 0})

    if not canonical or not candidate:
        raise ValueError(f"[auto_merge] entity not found: canonical={canonical_id} candidate={candidate_id}")

    now = _now()
    merge_id = f"merge_{secrets.token_urlsafe(12)}"

    # Archive ambos payloads
    archive_doc = {
        "id": merge_id,
        "entity_type": entity_type,
        "canonical_id": canonical_id,
        "candidate_id": candidate_id,
        "original_canonical_payload": canonical,
        "original_candidate_payload": candidate,
        "merged_at": now.isoformat(),
        "merged_by": actor.get("user_id", "system"),
        "undo_window_expires_at": (now + timedelta(days=UNDO_WINDOW_DAYS)).isoformat(),
        "status": "active",
    }
    await db.merged_entities_archive.insert_one(dict(archive_doc))
    archive_doc.pop("_id", None)

    # Soft-delete candidate
    candidate_id_field = "user_id" if entity_type == "users" else "id"
    await collection.update_one(
        {candidate_id_field: candidate_id},
        {"$set": {
            "merged_into": canonical_id,
            "deleted_at": now.isoformat(),
            "merge_id": merge_id,
        }},
    )

    # Actualizar referencias del candidate al canonical en leads/contacts
    if entity_type in ("users", "contacts"):
        await db.leads.update_many(
            {"contact_id": candidate_id},
            {"$set": {"contact_id": canonical_id}},
        )

    # Marcar pending como merged
    await db.entity_duplicates_pending.update_many(
        {
            "$or": [
                {"canonical_id": canonical_id, "candidate_id": candidate_id},
                {"canonical_id": candidate_id, "candidate_id": canonical_id},
            ],
            "status": "pending",
        },
        {"$set": {"status": "merged", "resolved_by": actor.get("user_id"), "resolved_at": now.isoformat(), "resolved_action": "auto_merge"}},
    )

    # Audit inmutable
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor=actor,
            action="merge",
            entity_type=entity_type,
            entity_id=canonical_id,
            before={"candidate": candidate},
            after={"canonical": canonical, "merge_id": merge_id},
        )
    except Exception as exc:
        log.warning(f"[auto_merge] audit log failed: {exc}")

    log.info(f"[auto_merge] {entity_type} canonical={canonical_id} <- candidate={candidate_id} merge_id={merge_id}")
    return merge_id


async def undo_merge(
    db,
    merge_id: str,
    actor: Optional[Dict] = None,
) -> bool:
    """Deshace merge si dentro del undo_window (30d). Restaura candidate."""
    if actor is None:
        actor = {"user_id": "system", "role": "system"}

    archive = await db.merged_entities_archive.find_one({"id": merge_id}, {"_id": 0})
    if not archive:
        log.warning(f"[undo_merge] archive not found: {merge_id}")
        return False

    if archive.get("status") == "undone":
        log.warning(f"[undo_merge] already undone: {merge_id}")
        return False

    # Verificar ventana de undo
    expires_str = archive.get("undo_window_expires_at", "")
    if expires_str:
        expires = _parse_ts(expires_str)
        if expires and _now() > expires:
            log.warning(f"[undo_merge] undo window expired for {merge_id}")
            return False

    entity_type = archive.get("entity_type", "leads")
    candidate_id = archive.get("candidate_id")
    candidate_payload = archive.get("original_candidate_payload", {})
    collection = _get_collection(db, entity_type)
    candidate_id_field = "user_id" if entity_type == "users" else "id"

    if not candidate_id or not candidate_payload:
        return False

    # Restaurar candidate (remover merged_into, deleted_at, merge_id)
    await collection.update_one(
        {candidate_id_field: candidate_id},
        {"$unset": {"merged_into": "", "deleted_at": "", "merge_id": ""}},
    )

    # Marcar archive como undone
    await db.merged_entities_archive.update_one(
        {"id": merge_id},
        {"$set": {"status": "undone", "undone_at": _now().isoformat(), "undone_by": actor.get("user_id")}},
    )

    # Audit
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor=actor,
            action="undo_merge",
            entity_type=entity_type,
            entity_id=archive.get("canonical_id", ""),
            before={"merge_id": merge_id, "status": "active"},
            after={"merge_id": merge_id, "status": "undone"},
        )
    except Exception as exc:
        log.warning(f"[undo_merge] audit log failed: {exc}")

    log.info(f"[undo_merge] restored candidate={candidate_id} merge_id={merge_id}")
    return True


# ─── Broker Fraud Pattern Detection ──────────────────────────────────────────

async def detect_broker_fraud_pattern(
    db,
    asesor_id: str,
) -> Dict[str, Any]:
    """Detecta patrón de fraude: mismo asesor crea variantes de mismo cliente
    con cambios mínimos (1-2 dígitos tel/email) en últimos 30d.
    """
    cutoff = (_now() - timedelta(days=30)).isoformat()

    # Leads recientes de este asesor
    recent_leads: List[Dict] = []
    async for doc in db.leads.find(
        {
            "$or": [{"assigned_to": asesor_id}, {"created_by": asesor_id}],
            "created_at": {"$gte": cutoff},
            "merged_into": {"$exists": False},
        },
        {"_id": 0, "id": 1, "email": 1, "phone": 1, "first_name": 1, "last_name": 1, "created_at": 1},
    ).limit(200):
        recent_leads.append(doc)

    suspicious_attempts: List[Dict] = []
    seen_pairs: set = set()

    for i in range(len(recent_leads)):
        for j in range(i + 1, len(recent_leads)):
            a = recent_leads[i]
            b = recent_leads[j]

            pair_key = tuple(sorted([a.get("id", ""), b.get("id", "")]))
            if pair_key in seen_pairs:
                continue
            seen_pairs.add(pair_key)

            # Detectar: mismo nombre + phone/email con 1-2 caracteres de diferencia
            name_a = normalize_name(_get_name(a))
            name_b = normalize_name(_get_name(b))
            email_a = normalize_email(a.get("email", ""))
            email_b = normalize_email(b.get("email", ""))
            phone_a = normalize_phone(a.get("phone", ""))
            phone_b = normalize_phone(b.get("phone", ""))

            from rapidfuzz import fuzz
            name_sim = fuzz.WRatio(name_a, name_b) if name_a and name_b else 0

            if name_sim < 85:
                continue

            # Detectar variaciones mínimas de contacto
            fields_changed = []
            if email_a and email_b and email_a != email_b:
                email_dist = _levenshtein(email_a, email_b)
                if email_dist <= 2:
                    fields_changed.append(f"email_dist={email_dist}")
            if phone_a and phone_b and phone_a != phone_b:
                phone_dist = _levenshtein(phone_a, phone_b)
                if phone_dist <= 2:
                    fields_changed.append(f"phone_dist={phone_dist}")

            if fields_changed:
                result = compute_score(a, b)
                suspicious_attempts.append({
                    "lead_a": a.get("id"),
                    "lead_b": b.get("id"),
                    "score": result["score_combined"],
                    "name_similarity": name_sim,
                    "fields_changed": fields_changed,
                    "lead_a_created": a.get("created_at"),
                    "lead_b_created": b.get("created_at"),
                })

    pattern_count = len(suspicious_attempts)

    if pattern_count >= FRAUD_PATTERN_THRESHOLD:
        # Upsert broker_fraud_patterns
        now_iso = _now().isoformat()
        await db.broker_fraud_patterns.update_one(
            {"asesor_id": asesor_id},
            {"$set": {
                "asesor_id": asesor_id,
                "pattern_count_30d": pattern_count,
                "last_detected_at": now_iso,
                "sample_attempts": suspicious_attempts[:5],  # máximo 5 muestras
            }},
            upsert=True,
        )
        # Obtener _id limpio
        await db.broker_fraud_patterns.update_one(
            {"asesor_id": asesor_id, "id": {"$exists": False}},
            {"$set": {"id": f"fraud_{secrets.token_urlsafe(8)}"}},
        )

        # Notif superadmin
        try:
            from notifications_engine import emit_notification
            # Buscar superadmins
            async for su in db.users.find({"role": "superadmin"}, {"_id": 0, "user_id": 1, "id": 1}):
                su_id = su.get("user_id") or su.get("id")
                if su_id:
                    await emit_notification(
                        db,
                        user_id=su_id,
                        tenant_id=None,
                        type="generic",
                        severity="critical",
                        title="Patron de fraude detectado",
                        body=f"Asesor {asesor_id} tiene {pattern_count} intentos sospechosos en 30d · revisar entity_resolution",
                        payload={"asesor_id": asesor_id, "pattern_count": pattern_count},
                        action_url="/superadmin/entity-resolution/fraud-patterns",
                    )
        except Exception as exc:
            log.warning(f"[fraud] notification failed: {exc}")

        log.warning(f"[fraud] PATTERN DETECTED asesor={asesor_id} count={pattern_count}")

    return {"asesor_id": asesor_id, "pattern_count": pattern_count, "suspicious_attempts": suspicious_attempts}


# ─── ensure_indexes ───────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    from pymongo import ASCENDING, DESCENDING

    # entity_duplicates_pending
    await db.entity_duplicates_pending.create_index(
        [("entity_type", ASCENDING), ("status", ASCENDING)], name="idx_dedup_type_status"
    )
    await db.entity_duplicates_pending.create_index(
        [("canonical_id", ASCENDING), ("candidate_id", ASCENDING)], name="idx_dedup_pair", unique=False
    )
    await db.entity_duplicates_pending.create_index(
        [("score_combined", DESCENDING)], name="idx_dedup_score"
    )

    # dedup_blacklist
    await db.dedup_blacklist.create_index(
        [("entity_a_id", ASCENDING), ("entity_b_id", ASCENDING)], name="idx_blacklist_pair"
    )

    # merged_entities_archive
    await db.merged_entities_archive.create_index(
        [("canonical_id", ASCENDING)], name="idx_archive_canonical"
    )
    await db.merged_entities_archive.create_index(
        [("status", ASCENDING)], name="idx_archive_status"
    )

    # dedup_runs: TTL 90d
    await db.dedup_runs.create_index(
        [("ran_at_dt", ASCENDING)],
        expireAfterSeconds=90 * 86400,
        name="ttl_dedup_runs_90d",
    )
    await db.dedup_runs.create_index(
        [("entity_type", ASCENDING)], name="idx_dedup_runs_type"
    )

    # broker_fraud_patterns
    await db.broker_fraud_patterns.create_index(
        [("asesor_id", ASCENDING)], unique=True, name="uniq_fraud_asesor"
    )
    await db.broker_fraud_patterns.create_index(
        [("pattern_count_30d", DESCENDING)], name="idx_fraud_count"
    )

    log.info("[w5.11] entity_resolution indexes OK")


# ─── Helpers internos ─────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _get_id(doc: Dict) -> Optional[str]:
    return doc.get("id") or doc.get("user_id")


def _get_email(doc: Dict) -> str:
    return doc.get("email") or doc.get("contact", {}).get("email", "") or ""


def _get_phone(doc: Dict) -> str:
    raw = (
        doc.get("phone")
        or doc.get("contact", {}).get("phone", "")
        or doc.get("tel", "")
        or ""
    )
    return str(raw)


def _get_name(doc: Dict) -> str:
    first = doc.get("first_name") or ""
    last = doc.get("last_name") or ""
    if first or last:
        return f"{first} {last}".strip()
    # Alternativa para developments y users
    return doc.get("name") or doc.get("contact", {}).get("name", "") or ""


def _get_address(doc: Dict) -> str:
    return (
        doc.get("address")
        or doc.get("location", "")
        or doc.get("colonia", "")
        or ""
    )


def _get_collection(db, entity_type: str):
    mapping = {
        "leads": db.leads,
        "contacts": db.contacts,
        "users": db.users,
        "developments": db.developments,
        "broker_orgs": db.broker_orgs,
    }
    return mapping.get(entity_type)


def _order_canonical(a: Dict, b: Dict) -> Tuple[str, str]:
    """El canónico es el más antiguo (created_at menor)."""
    ts_a = _parse_ts(a.get("created_at"))
    ts_b = _parse_ts(b.get("created_at"))
    a_id = _get_id(a) or ""
    b_id = _get_id(b) or ""
    if ts_a and ts_b:
        return (a_id, b_id) if ts_a <= ts_b else (b_id, a_id)
    return a_id, b_id


def _parse_ts(val: Any) -> Optional[datetime]:
    if not val:
        return None
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    if isinstance(val, str):
        try:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _levenshtein(a: str, b: str) -> int:
    """Distancia de Levenshtein simple para strings cortos."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    n, m = len(a), len(b)
    dp = list(range(m + 1))
    for i in range(1, n + 1):
        prev = i
        for j in range(1, m + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            curr = min(dp[j] + 1, prev + 1, dp[j - 1] + cost)
            dp[j - 1] = prev
            prev = curr
        dp[m] = prev
    return dp[m]
