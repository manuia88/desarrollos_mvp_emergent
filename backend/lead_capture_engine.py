"""W5.ASR.5 Parte 1 — Lead Capture Engine.

Funciones principales:
    register_alias(db, asesor_id, alias_slug?) → {alias_email, alias_slug}
    list_aliases_by_asesor(db, asesor_id) → list
    build_alias_map(db) → {alias_email: asesor_id}
    process_email_capture(db, raw_email, alias_email_to_asesor_id_map) → dict
    process_fb_lead_ad(db, payload, stub_mode=True) → dict
    track_utm(db, lead_id, utm_dict) → None
    ensure_indexes(db) → None
"""
from __future__ import annotations

import logging
import os
import re
import secrets
import unicodedata
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.lead_capture_engine")

# ─── Constantes ───────────────────────────────────────────────────────────────
ALIAS_DOMAIN = "leads.desarrollosmx.io"
CAPTURE_EVENT_TTL_DAYS = 90


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid(prefix: str = "lc") -> str:
    return f"{prefix}_{secrets.token_urlsafe(10)}"


def _slugify(text: str) -> str:
    """Convierte texto a slug URL-safe."""
    nfkd = unicodedata.normalize("NFKD", text)
    ascii_text = nfkd.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")
    return slug[:30] or "asesor"


# ─── Alias Management ─────────────────────────────────────────────────────────

async def register_alias(
    db, asesor_id: str, alias_slug: Optional[str] = None
) -> Dict[str, Any]:
    """Crea alias único leads-{slug}-{uid8}@leads.desarrollosmx.io.
    Idempotente: si ya existe un alias activo para el asesor, retorna el existente.
    """
    existing = await db.lead_capture_aliases.find_one(
        {"asesor_id": asesor_id, "active": True}, {"_id": 0}
    )
    if existing:
        return {
            "alias_email": existing["alias_email"],
            "alias_slug": existing["alias_slug"],
            "created_at": existing["created_at"],
            "existed": True,
        }

    # Generar slug a partir del asesor_id si no se provee
    slug = _slugify(alias_slug or asesor_id)
    short_uid = asesor_id[:8].replace("-", "").lower()
    alias_email = f"leads-{slug}-{short_uid}@{ALIAS_DOMAIN}"

    doc = {
        "id": _uid("alias"),
        "asesor_id": asesor_id,
        "alias_email": alias_email,
        "alias_slug": slug,
        "created_at": _now().isoformat(),
        "active": True,
    }
    try:
        await db.lead_capture_aliases.insert_one(dict(doc))
        doc.pop("_id", None)
    except Exception as exc:  # noqa: BLE001
        # Probable violación de unique index (race condition) — devolver existente
        log.warning(f"[register_alias] insert conflict, retrying read: {exc}")
        existing2 = await db.lead_capture_aliases.find_one(
            {"asesor_id": asesor_id, "active": True}, {"_id": 0}
        )
        if existing2:
            return {
                "alias_email": existing2["alias_email"],
                "alias_slug": existing2["alias_slug"],
                "created_at": existing2["created_at"],
                "existed": True,
            }
        raise

    return {
        "alias_email": alias_email,
        "alias_slug": slug,
        "created_at": doc["created_at"],
        "existed": False,
    }


async def list_aliases_by_asesor(db, asesor_id: str) -> List[Dict[str, Any]]:
    cursor = db.lead_capture_aliases.find(
        {"asesor_id": asesor_id}, {"_id": 0}
    ).sort("created_at", -1)
    return [doc async for doc in cursor]


async def build_alias_map(db) -> Dict[str, str]:
    """Retorna {alias_email: asesor_id} para todos los aliases activos."""
    out: Dict[str, str] = {}
    async for doc in db.lead_capture_aliases.find({"active": True}, {"_id": 0, "alias_email": 1, "asesor_id": 1}):
        out[doc["alias_email"]] = doc["asesor_id"]
    return out


# ─── Email Capture ─────────────────────────────────────────────────────────────

async def process_email_capture(
    db,
    raw_email: dict,
    alias_email_to_asesor_id_map: Dict[str, str],
) -> Dict[str, Any]:
    """Procesa email inbound:
    1. Identifica asesor destino via alias_email en header To:
    2. Parsea el email con los parsers especializados
    3. Crea lead en db.leads si extracción exitosa
    4. Persiste capture_event (éxito o fallo)
    5. Emite lead_journey step 'captured'
    """
    event_id = _uid("cevt")
    ingested_at = _now().isoformat()

    # Extraer dirección To: del email
    to_header = (
        raw_email.get("to")
        or raw_email.get("To")
        or raw_email.get("recipient")
        or ""
    )
    to_addresses: List[str] = []
    for part in re.split(r"[,;]", to_header):
        m = re.search(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", part)
        if m:
            to_addresses.append(m.group(0).lower())

    # Match alias
    matched_asesor_id: Optional[str] = None
    matched_alias_email: Optional[str] = None
    for addr in to_addresses:
        if addr in alias_email_to_asesor_id_map:
            matched_asesor_id = alias_email_to_asesor_id_map[addr]
            matched_alias_email = addr
            break

    if not matched_asesor_id:
        await _log_capture_event(db, event_id, ingested_at, source="email_alias",
                                 raw_payload=raw_email, parser_used=None,
                                 success=False, error_msg="no_alias_match")
        return {"captured": False, "reason": "no_alias_match", "event_id": event_id}

    # Parsear email
    from lead_capture_parsers import parse_email
    parser_used, extracted = parse_email(raw_email)

    if not extracted:
        await _log_capture_event(db, event_id, ingested_at, source="email_alias",
                                 raw_payload=raw_email, parser_used=parser_used,
                                 success=False, error_msg="extraction_failed")
        return {
            "captured": False,
            "reason": "extraction_failed",
            "parser_used": parser_used,
            "event_id": event_id,
        }

    # Determinar source
    source_map = {
        "inmuebles24": "portal_inmuebles24",
        "lamudi": "portal_lamudi",
        "generic_alias": "email_alias",
    }
    source = source_map.get(parser_used, "email_alias")

    # Crear lead
    lead_id = _uid("lead")
    now_iso = _now().isoformat()
    lead_doc = {
        "id": lead_id,
        "first_name": _first_name(extracted.get("name")),
        "last_name": _last_name(extracted.get("name")),
        "email": (extracted.get("email") or "").lower() or None,
        "phone": extracted.get("phone"),
        "status_v2": "lead_nuevo",  # V2 canónico (era "nuevo" = valor V1 → invisible a smart lists)
        "source": source,
        "origin": "inbound_email",
        "assigned_to": matched_asesor_id,
        "portal_listing_id": extracted.get("listing_id"),
        "portal_listing_url": extracted.get("listing_url"),
        "notes": extracted.get("message") or "",
        "alias_email_matched": matched_alias_email,
        "nurture_active": False,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    try:
        await db.leads.insert_one(dict(lead_doc))
        lead_doc.pop("_id", None)
        # Puente al CRM del asesor (idempotente) — antes este lead de email NO llegaba a Contactos.
        try:
            from services.lead_bridge import mirror_lead_to_asesor_contacto
            await mirror_lead_to_asesor_contacto(db, lead_doc)
        except Exception as _bexc:  # noqa: BLE001
            log.debug(f"[process_email_capture] mirror skip: {_bexc}")
    except Exception as exc:  # noqa: BLE001
        log.error(f"[process_email_capture] lead insert failed: {exc}")
        await _log_capture_event(db, event_id, ingested_at, source=source,
                                 raw_payload=raw_email, parser_used=parser_used,
                                 success=False, error_msg=str(exc))
        return {"captured": False, "reason": "db_error", "event_id": event_id}

    # Journey step 'captured'
    try:
        from lead_journey_engine import emit_step
        await emit_step(
            db,
            lead_id=lead_id,
            tenant_id=None,
            step_type="captured",
            actor_type="system",
            actor_id="lead_capture_engine",
            payload={"source": source, "parser": parser_used, "alias": matched_alias_email},
        )
    except Exception:  # noqa: BLE001
        pass

    # AI hooks + Smart Routing (todos fire-and-forget)
    import asyncio as _asyncio
    lead_email = lead_doc.get("email")
    lead_display_name = (
        " ".join(filter(None, [lead_doc.get("first_name"), lead_doc.get("last_name")])) or None
    )
    _asyncio.create_task(
        _run_postcapture_hooks(db, lead_id, matched_asesor_id, source, lead_email, lead_display_name, parser_used)
    )

    await _log_capture_event(
        db, event_id, ingested_at,
        source=source,
        raw_payload=_safe_payload(raw_email),
        parser_used=parser_used,
        parsed_lead_id=lead_id,
        success=True,
    )

    return {
        "captured": True,
        "lead_id": lead_id,
        "source": source,
        "asesor_id": matched_asesor_id,
        "parser_used": parser_used,
        "event_id": event_id,
    }


# ─── FB Lead Ads ──────────────────────────────────────────────────────────────

async def process_fb_lead_ad(
    db,
    payload: dict,
    stub_mode: bool = True,
) -> Dict[str, Any]:
    """Procesa webhook FB Lead Ads.
    stub_mode=True (default): acepta payload sin validar firma Meta.
    stub_mode=False: requiere META_APP_SECRET para validar X-Hub-Signature-256.
    """
    event_id = _uid("fbevt")
    ingested_at = _now().isoformat()

    if not stub_mode:
        meta_secret = os.environ.get("META_APP_SECRET", "")
        if not meta_secret:
            await _log_capture_event(db, event_id, ingested_at, source="fb_lead_ads",
                                     raw_payload=payload, parser_used="fb_lead_ads",
                                     success=False, error_msg="META_APP_SECRET_missing")
            return {
                "captured": False,
                "reason": "META_APP_SECRET not configured · use stub_mode=true",
            }
        # Validación de firma se hace en la capa de route (header X-Hub-Signature-256)
        # El engine confía en que el router ya validó antes de llamar aquí

    # Extraer campos estándar FB Lead Ads
    field_data: List[dict] = payload.get("field_data") or []
    fields: Dict[str, str] = {f["name"]: f["values"][0] for f in field_data if f.get("values")}

    full_name = (
        fields.get("full_name")
        or fields.get("nombre_completo")
        or fields.get("first_name", "") + " " + fields.get("last_name", "")
    ).strip() or None

    email = (fields.get("email") or "").lower() or None
    phone = (fields.get("phone_number") or fields.get("phone") or fields.get("telefono") or "").strip() or None
    fb_form_id = str(payload.get("form_id") or "")
    fb_page_id = str(payload.get("page_id") or "")

    if not email and not phone:
        await _log_capture_event(db, event_id, ingested_at, source="fb_lead_ads",
                                 raw_payload=payload, parser_used="fb_lead_ads_stub" if stub_mode else "fb_lead_ads",
                                 success=False, error_msg="no_email_no_phone")
        return {"captured": False, "reason": "no_email_no_phone", "event_id": event_id}

    # Lookup asesor via fb_lead_ads_config
    config = await db.fb_lead_ads_config.find_one(
        {"form_id": fb_form_id, "active": True}, {"_id": 0}
    ) if fb_form_id else None

    asesor_id = (config or {}).get("asesor_id")

    lead_id = _uid("lead")
    now_iso = _now().isoformat()
    lead_doc = {
        "id": lead_id,
        "first_name": _first_name(full_name),
        "last_name": _last_name(full_name),
        "email": email,
        "phone": phone,
        "status_v2": "lead_nuevo",  # V2 canónico (era "nuevo" = valor V1 → invisible a smart lists)
        "source": "fb_lead_ads",
        "origin": "fb_lead_ads_webhook",
        "assigned_to": asesor_id,
        "fb_form_id": fb_form_id,
        "fb_page_id": fb_page_id,
        "utm_source": "facebook",
        "utm_medium": "lead_ads",
        "utm_campaign": fields.get("campaign_name") or None,
        "nurture_active": False,
        "notes": "",
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    try:
        await db.leads.insert_one(dict(lead_doc))
        lead_doc.pop("_id", None)
        # Puente al CRM del asesor (idempotente) — antes este lead de FB Ads NO llegaba a Contactos.
        try:
            from services.lead_bridge import mirror_lead_to_asesor_contacto
            await mirror_lead_to_asesor_contacto(db, lead_doc)
        except Exception as _bexc:  # noqa: BLE001
            log.debug(f"[process_fb_lead_ad] mirror skip: {_bexc}")
    except Exception as exc:  # noqa: BLE001
        log.error(f"[process_fb_lead_ad] lead insert failed: {exc}")
        await _log_capture_event(db, event_id, ingested_at, source="fb_lead_ads",
                                 raw_payload=payload,
                                 parser_used="fb_lead_ads_stub" if stub_mode else "fb_lead_ads",
                                 success=False, error_msg=str(exc))
        return {"captured": False, "reason": "db_error", "event_id": event_id}

    # Journey step
    try:
        from lead_journey_engine import emit_step
        await emit_step(
            db, lead_id=lead_id, step_type="captured",
            actor_type="system", actor_id="fb_lead_ads_webhook",
            payload={"source": "fb_lead_ads", "form_id": fb_form_id, "stub_mode": stub_mode},
        )
    except Exception:
        pass

    parser_used_str = "fb_lead_ads_stub" if stub_mode else "fb_lead_ads"

    # AI hooks + SmartRouting + notif (fire-and-forget)
    import asyncio as _asyncio
    lead_display_name = (
        " ".join(filter(None, [lead_doc.get("first_name"), lead_doc.get("last_name")])) or None
    )
    _asyncio.create_task(
        _run_postcapture_hooks(db, lead_id, asesor_id, "fb_lead_ads", email, lead_display_name, parser_used_str)
    )

    await _log_capture_event(
        db, event_id, ingested_at,
        source="fb_lead_ads",
        raw_payload=_safe_payload(payload),
        parser_used=parser_used_str,
        parsed_lead_id=lead_id,
        success=True,
    )

    return {
        "captured": True,
        "lead_id": lead_id,
        "source": "fb_lead_ads",
        "asesor_id": asesor_id,
        "stub_mode": stub_mode,
        "event_id": event_id,
    }


# ─── AI Post-capture hooks ────────────────────────────────────────────────────

async def _run_postcapture_hooks(
    db,
    lead_id: str,
    asesor_id: Optional[str],
    source: str,
    lead_email: Optional[str],
    lead_display_name: Optional[str],
    parser_used: Optional[str],
) -> None:
    """Ejecuta todos los hooks de IA post-captura en paralelo (fire-and-forget).
    Cada hook tiene su try/except individual — un fallo no afecta a los demás.
    """

    # Hook 1: SmartRouting — reasignar asesor si hay criterios mejores
    try:
        from agentic_crm.smart_routing_engine import SmartRoutingEngine
        engine = SmartRoutingEngine(db, "dmx")
        await engine.route_lead(lead_id)
        log.debug(f"[hooks] SmartRouting OK lead={lead_id}")
    except Exception as exc:  # noqa: BLE001
        log.debug(f"[hooks] SmartRouting skip lead={lead_id}: {exc}")

    # Refresh asesor_id post-routing (puede haber cambiado)
    routed_asesor_id = asesor_id
    try:
        updated_lead = await db.leads.find_one({"id": lead_id}, {"_id": 0, "assigned_to": 1})
        if updated_lead:
            routed_asesor_id = updated_lead.get("assigned_to") or asesor_id
    except Exception:
        pass

    # Hook 2: BuyerScore — si el email del lead coincide con un usuario registrado
    try:
        if lead_email:
            matched_user = await db.users.find_one(
                {"email": lead_email}, {"_id": 0, "user_id": 1, "id": 1}
            )
            if matched_user:
                uid = matched_user.get("user_id") or matched_user.get("id")
                if uid:
                    from buyer_score_engine import compute_user_score, upsert_score
                    score_data = await compute_user_score(db, uid)
                    await upsert_score(db, uid, score_data)
                    log.debug(f"[hooks] BuyerScore updated uid={uid} lead={lead_id}")
    except Exception as exc:  # noqa: BLE001
        log.debug(f"[hooks] BuyerScore skip lead={lead_id}: {exc}")

    # Hook 3: Smart Match — skip silencioso (necesita user_id registrado · deferido a Parte 3)
    # (requiere user_id de comprador, que no tenemos si el lead es nuevo y anónimo)

    # Hook 4: Notificación al asesor
    try:
        if routed_asesor_id:
            from notifications_engine import rule_lead_captured_auto
            await rule_lead_captured_auto(
                db,
                lead_id=lead_id,
                asesor_id=routed_asesor_id,
                source=source,
                lead_name=lead_display_name,
                parser_used=parser_used,
            )
            log.debug(f"[hooks] notif lead_captured_auto emitida asesor={routed_asesor_id}")
    except Exception as exc:  # noqa: BLE001
        log.warning(f"[hooks] notif rule_lead_captured_auto failed lead={lead_id}: {exc}")


# ─── UTM Tracking ─────────────────────────────────────────────────────────────

UTM_FIELDS = ("utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term")


async def track_utm(db, lead_id: str, utm_dict: Dict[str, str]) -> None:
    """Actualiza campos UTM en lead existente. Solo actualiza campos presentes."""
    patch = {k: v for k, v in utm_dict.items() if k in UTM_FIELDS and v}
    if not patch:
        return
    try:
        await db.leads.update_one(
            {"id": lead_id},
            {"$set": {**patch, "updated_at": _now().isoformat()}},
        )
    except Exception as exc:  # noqa: BLE001
        log.warning(f"[track_utm] update failed for {lead_id}: {exc}")


def extract_utm_from_request(request) -> Dict[str, str]:
    """Extrae parámetros UTM de los query params de la request."""
    params = dict(request.query_params)
    return {k: params[k] for k in UTM_FIELDS if k in params and params[k]}


# ─── Índices Mongo ─────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    from pymongo import ASCENDING

    # lead_capture_aliases: unique alias_email + index por asesor
    await db.lead_capture_aliases.create_index(
        [("alias_email", ASCENDING)], unique=True, name="uniq_alias_email"
    )
    await db.lead_capture_aliases.create_index(
        [("asesor_id", ASCENDING), ("active", ASCENDING)],
        name="idx_alias_asesor_active",
    )

    # lead_capture_events: TTL 90 días
    await db.lead_capture_events.create_index(
        [("ingested_at_dt", ASCENDING)],
        expireAfterSeconds=CAPTURE_EVENT_TTL_DAYS * 86400,
        name="ttl_capture_events_90d",
    )
    await db.lead_capture_events.create_index(
        [("source", ASCENDING), ("success", ASCENDING)],
        name="idx_events_source_success",
    )

    # fb_lead_ads_config
    await db.fb_lead_ads_config.create_index(
        [("asesor_id", ASCENDING), ("active", ASCENDING)],
        name="idx_fb_config_asesor",
    )
    await db.fb_lead_ads_config.create_index(
        [("form_id", ASCENDING)],
        name="idx_fb_config_form_id",
    )

    log.info("[w5.asr.5] lead_capture indexes OK")


# ─── Helpers internos ─────────────────────────────────────────────────────────

async def _log_capture_event(
    db,
    event_id: str,
    ingested_at: str,
    *,
    source: str,
    raw_payload: Any,
    parser_used: Optional[str],
    success: bool,
    error_msg: Optional[str] = None,
    parsed_lead_id: Optional[str] = None,
) -> None:
    try:
        await db.lead_capture_events.insert_one({
            "id": event_id,
            "source": source,
            "raw_payload": _safe_payload(raw_payload),
            "parsed_lead_id": parsed_lead_id,
            "parser_used": parser_used,
            "success": success,
            "error_msg": error_msg,
            "ingested_at": ingested_at,
            "ingested_at_dt": _now(),  # Para el índice TTL
        })
    except Exception as exc:  # noqa: BLE001
        log.warning(f"[_log_capture_event] insert failed: {exc}")


def _safe_payload(payload: Any) -> Any:
    """Limita tamaño del payload para persistencia en audit."""
    if isinstance(payload, dict):
        safe = {}
        for k, v in payload.items():
            if isinstance(v, str) and len(v) > 2000:
                safe[k] = v[:2000] + "...[truncated]"
            else:
                safe[k] = v
        return safe
    return payload


def _first_name(full_name: Optional[str]) -> Optional[str]:
    if not full_name:
        return None
    parts = full_name.strip().split()
    return parts[0][:60] if parts else None


def _last_name(full_name: Optional[str]) -> Optional[str]:
    if not full_name:
        return None
    parts = full_name.strip().split()
    return " ".join(parts[1:])[:100] if len(parts) > 1 else None
