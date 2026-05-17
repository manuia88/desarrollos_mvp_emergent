"""W5.ASR.3 Parte 1 · Smart Lists Engine (asesor).

5 presets hard-coded que filtran leads V2:
  1. hot_leads          — Buyer tier=hot · status_v2 activo · sin nurture/perdido
  2. sin_contactar_48h  — status_v2=lead_nuevo · first_contact_sent_at=None · created>48h
  3. stalled_14d        — status_v2 activo · last_activity_at>14d · sin nurture
  4. visita_pendiente   — status_v2=visita · visit_outcome=None · cita_id set
  5. negociacion_activa — status_v2=negociacion

Cache LRU in-memory (1000 entries · TTL 5 min) por (asesor_id, preset_key).
"""
from __future__ import annotations

import logging
import time
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional

log = logging.getLogger("dmx.smart_lists")

_CACHE: "OrderedDict[str, tuple]" = OrderedDict()
_CACHE_MAX = 1000
_CACHE_TTL_S = 300  # 5 min


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── PRESETS (5 hard-coded · NO collection) ──────────────────────────────────

def _q_hot_leads(asesor_id: str) -> Dict[str, Any]:
    return {
        "$or": [{"assigned_to": asesor_id}, {"asesor_id": asesor_id}],
        "status_v2": {"$in": ["contactado", "calificado", "visita", "negociacion"]},
        "nurture_active": {"$ne": True},
        "lost_at": None,
    }


def _q_sin_contactar_48h(asesor_id: str) -> Dict[str, Any]:
    cutoff = (_now() - timedelta(hours=48)).isoformat()
    return {
        "$or": [{"assigned_to": asesor_id}, {"asesor_id": asesor_id}],
        "status_v2": "lead_nuevo",
        "first_contact_sent_at": None,
        "created_at": {"$lt": cutoff},
    }


def _q_stalled_14d(asesor_id: str) -> Dict[str, Any]:
    cutoff = (_now() - timedelta(days=14)).isoformat()
    return {
        "$or": [{"assigned_to": asesor_id}, {"asesor_id": asesor_id}],
        "status_v2": {"$in": ["contactado", "calificado", "visita", "negociacion"]},
        "last_activity_at": {"$lt": cutoff},
        "nurture_active": {"$ne": True},
    }


def _q_visita_pendiente(asesor_id: str) -> Dict[str, Any]:
    return {
        "$or": [{"assigned_to": asesor_id}, {"asesor_id": asesor_id}],
        "status_v2": "visita",
        "visit_outcome": None,
        "cita_id": {"$ne": None},
    }


def _q_negociacion_activa(asesor_id: str) -> Dict[str, Any]:
    return {
        "$or": [{"assigned_to": asesor_id}, {"asesor_id": asesor_id}],
        "status_v2": "negociacion",
    }


PRESETS: Dict[str, Dict[str, Any]] = {
    "hot_leads": {
        "label": "Hot leads",
        "icon": "Flame",
        "color": "rose",
        "description": "Tier hot · pipeline activo",
        "query_builder": _q_hot_leads,
        "requires_buyer_score_join": True,
        "tier_filter": "hot",
    },
    "sin_contactar_48h": {
        "label": "Sin contactar (48h)",
        "icon": "Clock",
        "color": "amber",
        "description": "Leads nuevos sin primer contacto >48h",
        "query_builder": _q_sin_contactar_48h,
        "requires_buyer_score_join": False,
    },
    "stalled_14d": {
        "label": "Sin actividad (14d)",
        "icon": "AlertTriangle",
        "color": "amber",
        "description": "Sin movimientos hace +14 días",
        "query_builder": _q_stalled_14d,
        "requires_buyer_score_join": False,
    },
    "visita_pendiente": {
        "label": "Visita pendiente",
        "icon": "Calendar",
        "color": "indigo",
        "description": "Cita agendada sin outcome",
        "query_builder": _q_visita_pendiente,
        "requires_buyer_score_join": False,
    },
    "negociacion_activa": {
        "label": "En negociación",
        "icon": "TrendingUp",
        "color": "green",
        "description": "En etapa de negociación",
        "query_builder": _q_negociacion_activa,
        "requires_buyer_score_join": False,
    },
}


def list_presets() -> List[Dict[str, Any]]:
    """Devuelve metadata pública de los 5 presets (sin query_builder · safe para UI)."""
    return [
        {
            "key": k,
            "label": v["label"],
            "icon": v["icon"],
            "color": v["color"],
            "description": v.get("description", ""),
        }
        for k, v in PRESETS.items()
    ]


def get_preset(key: str) -> Optional[Dict[str, Any]]:
    return PRESETS.get(key)


# ─── Cache helpers ───────────────────────────────────────────────────────────

def _cache_key(asesor_id: str, preset_key: str, kind: str) -> str:
    return f"{asesor_id}::{preset_key}::{kind}"


def _cache_get(key: str) -> Optional[Any]:
    entry = _CACHE.get(key)
    if not entry:
        return None
    value, ts = entry
    if (time.monotonic() - ts) > _CACHE_TTL_S:
        _CACHE.pop(key, None)
        return None
    _CACHE.move_to_end(key)
    return value


def _cache_set(key: str, value: Any) -> None:
    _CACHE[key] = (value, time.monotonic())
    _CACHE.move_to_end(key)
    while len(_CACHE) > _CACHE_MAX:
        _CACHE.popitem(last=False)


def invalidate_cache_for_asesor(asesor_id: str) -> None:
    """Limpia entradas cache del asesor · llamar tras cambios en sus leads."""
    drop = [k for k in _CACHE if k.startswith(f"{asesor_id}::")]
    for k in drop:
        _CACHE.pop(k, None)


# ─── Buyer score JOIN helper ────────────────────────────────────────────────

async def _filter_by_buyer_score_tier(
    db, leads: List[Dict[str, Any]], target_tier: str,
) -> List[Dict[str, Any]]:
    """Filtra leads cuyo contacto tenga buyer_scores.tier == target_tier.

    Linking: lead.contact.email → db.users.email → users.user_id → buyer_scores.user_id
    """
    if not leads:
        return []
    emails: List[str] = []
    for ld in leads:
        em = ((ld.get("contact") or {}).get("email") or "").lower()
        if em:
            emails.append(em)
    if not emails:
        return []
    # email → user_id
    email_to_uid: Dict[str, str] = {}
    try:
        async for u in db.users.find(
            {"email": {"$in": list(set(emails))}},
            {"_id": 0, "user_id": 1, "email": 1},
        ):
            if u.get("user_id") and u.get("email"):
                email_to_uid[u["email"].lower()] = u["user_id"]
    except Exception as exc:
        log.warning(f"[smart_lists] users JOIN failed · {exc}")
        return []
    uids = list(email_to_uid.values())
    if not uids:
        return []
    # user_id → tier
    uid_to_tier: Dict[str, str] = {}
    score_map: Dict[str, Dict[str, Any]] = {}
    try:
        async for s in db.buyer_scores.find(
            {"user_id": {"$in": uids}},
            {"_id": 0, "user_id": 1, "score": 1, "tier": 1, "delta_pct": 1},
        ):
            uid_to_tier[s["user_id"]] = s.get("tier", "cold")
            score_map[s["user_id"]] = {
                "value": s.get("score", 0),
                "tier": s.get("tier", "cold"),
                "delta_pct": s.get("delta_pct", 0),
            }
    except Exception as exc:
        log.warning(f"[smart_lists] buyer_scores JOIN failed · {exc}")
        return []
    # Filter + enrich
    out: List[Dict[str, Any]] = []
    for ld in leads:
        em = ((ld.get("contact") or {}).get("email") or "").lower()
        uid = email_to_uid.get(em) if em else None
        if uid and uid_to_tier.get(uid) == target_tier:
            ld["buyer_score"] = score_map.get(uid)
            out.append(ld)
    return out


async def _enrich_with_buyer_score(
    db, leads: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Anota buyer_score (best-effort) sin filtrar. Para listas sin tier_filter."""
    if not leads:
        return leads
    emails = [((ld.get("contact") or {}).get("email") or "").lower()
              for ld in leads]
    emails = [e for e in emails if e]
    if not emails:
        for ld in leads:
            ld["buyer_score"] = None
        return leads
    email_to_uid: Dict[str, str] = {}
    try:
        async for u in db.users.find(
            {"email": {"$in": list(set(emails))}},
            {"_id": 0, "user_id": 1, "email": 1},
        ):
            if u.get("user_id") and u.get("email"):
                email_to_uid[u["email"].lower()] = u["user_id"]
        uids = list(email_to_uid.values())
        score_map: Dict[str, Dict[str, Any]] = {}
        if uids:
            async for s in db.buyer_scores.find(
                {"user_id": {"$in": uids}},
                {"_id": 0, "user_id": 1, "score": 1, "tier": 1, "delta_pct": 1},
            ):
                score_map[s["user_id"]] = {
                    "value": s.get("score", 0),
                    "tier": s.get("tier", "cold"),
                    "delta_pct": s.get("delta_pct", 0),
                }
        for ld in leads:
            em = ((ld.get("contact") or {}).get("email") or "").lower()
            uid = email_to_uid.get(em) if em else None
            ld["buyer_score"] = score_map.get(uid) if uid else None
    except Exception as exc:
        log.warning(f"[smart_lists] enrich score failed · {exc}")
        for ld in leads:
            ld["buyer_score"] = None
    return leads


# ─── Count + list ────────────────────────────────────────────────────────────

async def count_lead_in_preset(db, preset_key: str, asesor_id: str) -> int:
    preset = PRESETS.get(preset_key)
    if not preset:
        return 0
    ck = _cache_key(asesor_id, preset_key, "count")
    cached = _cache_get(ck)
    if cached is not None:
        return cached

    query = preset["query_builder"](asesor_id)
    if preset.get("requires_buyer_score_join"):
        # Necesitamos JOIN · traemos los lead docs y filtramos
        leads = await db.leads.find(query, {"_id": 0, "id": 1, "contact": 1}).to_list(2000)
        filtered = await _filter_by_buyer_score_tier(db, leads, preset["tier_filter"])
        count = len(filtered)
    else:
        try:
            count = await db.leads.count_documents(query)
        except Exception as exc:
            log.warning(f"[smart_lists] count failed for {preset_key} · {exc}")
            count = 0
    _cache_set(ck, count)
    return count


async def count_all_presets(db, asesor_id: str) -> Dict[str, int]:
    """Devuelve {preset_key: count} para los 5 presets · usa cache 5 min."""
    return {
        k: await count_lead_in_preset(db, k, asesor_id)
        for k in PRESETS.keys()
    }


async def list_leads_in_preset(
    db, preset_key: str, asesor_id: str,
    limit: int = 50, offset: int = 0,
) -> List[Dict[str, Any]]:
    """Lista de leads que matchean el preset · projection compacta para UI."""
    preset = PRESETS.get(preset_key)
    if not preset:
        return []
    query = preset["query_builder"](asesor_id)
    projection = {
        "_id": 0,
        "id": 1, "contact": 1, "status_v2": 1, "status": 1,
        "intent": 1, "source": 1, "last_activity_at": 1, "created_at": 1,
        "budget_range": 1, "project_id": 1, "lost_at": 1, "nurture_active": 1,
        "tags": 1, "first_contact_sent_at": 1, "visit_outcome": 1, "cita_id": 1,
    }
    limit = max(1, min(int(limit or 50), 200))
    offset = max(0, int(offset or 0))

    if preset.get("requires_buyer_score_join"):
        # Trae más para poder filtrar antes de paginar
        leads = await (
            db.leads.find(query, projection)
            .sort("last_activity_at", -1)
            .limit(2000)
            .to_list(2000)
        )
        filtered = await _filter_by_buyer_score_tier(db, leads, preset["tier_filter"])
        page = filtered[offset:offset + limit]
        return _to_contacto_shape(page)
    else:
        leads = await (
            db.leads.find(query, projection)
            .sort("last_activity_at", -1)
            .skip(offset).limit(limit).to_list(limit)
        )
        leads = await _enrich_with_buyer_score(db, leads)
        return _to_contacto_shape(leads)


def _to_contacto_shape(leads: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Mapea lead → shape compatible con tabla de AsesorContactos.

    Lead dict → contacto-like dict (id, first_name, last_name, phones, emails,
    tipo, temperatura, buyer_score, tags, source, status_v2, last_activity_at).
    """
    out: List[Dict[str, Any]] = []
    for ld in leads:
        contact = ld.get("contact") or {}
        name = (contact.get("name") or "").strip()
        if " " in name:
            first_name, last_name = name.split(" ", 1)
        else:
            first_name = name or "—"
            last_name = ""
        out.append({
            "id": ld["id"],
            "_smart_list_lead": True,
            "first_name": first_name,
            "last_name": last_name,
            "phones": [contact.get("phone")] if contact.get("phone") else [],
            "emails": [contact.get("email")] if contact.get("email") else [],
            "tipo": ld.get("intent") or "comprador",
            "temperatura": _temp_from_status_v2(ld.get("status_v2")),
            "buyer_score": ld.get("buyer_score"),
            "tags": ld.get("tags") or [],
            "source": ld.get("source"),
            "status_v2": ld.get("status_v2"),
            "last_activity_at": ld.get("last_activity_at"),
            "project_id": ld.get("project_id"),
            "nurture_active": bool(ld.get("nurture_active")),
            "lost_at": ld.get("lost_at"),
        })
    return out


def _temp_from_status_v2(status: Optional[str]) -> str:
    """Mapea status_v2 → temperatura legacy para mantener UI consistente."""
    if status in ("vendido",):
        return "cliente"
    if status in ("negociacion", "cierre", "visita"):
        return "caliente"
    if status in ("calificado", "contactado"):
        return "tibio"
    return "frio"
