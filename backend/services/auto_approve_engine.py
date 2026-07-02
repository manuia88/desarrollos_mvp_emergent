"""Phase 13 · Batch 36 — Auto-Approve Engine.

3-gate check:
  Gate 1: dev_org tiene regla habilitada
  Gate 2: Trust Score del asesor >= threshold_trust_score
  Gate 3 (si require_zona_expertise): asesor tiene >= min_deals_closed_12m deals cerrados
          en target_colonias (o cualquier colonia si target_colonias vacío)

Schema dev_auto_approve_rules:
  { rule_id, dev_org_id (PK unique), enabled, threshold_trust_score (default 70),
    require_zona_expertise (default true), target_colonias: [str]?,
    min_deals_closed_12m (default 1), last_modified, modified_by }
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.auto_approve_engine")

WON_STATUSES = {"won", "ganado", "cerrado_ganado", "closed_won"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── Default rule ─────────────────────────────────────────────────────────────

DEFAULT_RULE: Dict[str, Any] = {
    "enabled": False,
    "threshold_trust_score": 70,
    "require_zona_expertise": True,
    "target_colonias": [],
    "min_deals_closed_12m": 1,
}


async def get_rule(db, dev_org_id: str) -> Dict[str, Any]:
    """Retorna la regla del dev_org o DEFAULT_RULE si no existe."""
    doc = await db.dev_auto_approve_rules.find_one(
        {"dev_org_id": dev_org_id}, {"_id": 0}
    )
    if not doc:
        return {**DEFAULT_RULE, "dev_org_id": dev_org_id, "rule_id": None}
    # Serialize datetimes
    out = dict(doc)
    for f in ("last_modified",):
        v = out.get(f)
        if isinstance(v, datetime):
            out[f] = v.isoformat()
    return out


async def upsert_rule(
    db,
    dev_org_id: str,
    modified_by: str,
    enabled: bool,
    threshold_trust_score: int,
    require_zona_expertise: bool,
    target_colonias: Optional[List[str]],
    min_deals_closed_12m: int,
) -> Dict[str, Any]:
    import uuid
    now = _now()
    patch = {
        "dev_org_id": dev_org_id,
        "enabled": bool(enabled),
        "threshold_trust_score": max(0, min(100, int(threshold_trust_score))),
        "require_zona_expertise": bool(require_zona_expertise),
        "target_colonias": list(target_colonias or []),
        "min_deals_closed_12m": max(0, int(min_deals_closed_12m)),
        "last_modified": now,
        "modified_by": modified_by,
    }
    # ensure rule_id on insert
    existing = await db.dev_auto_approve_rules.find_one(
        {"dev_org_id": dev_org_id}, {"_id": 0, "rule_id": 1}
    )
    if not existing:
        patch["rule_id"] = str(uuid.uuid4())

    await db.dev_auto_approve_rules.update_one(
        {"dev_org_id": dev_org_id},
        {"$set": patch},
        upsert=True,
    )
    return await get_rule(db, dev_org_id)


# ─── Core check ───────────────────────────────────────────────────────────────

async def check_auto_approve(db, asesor_id: str, dev_org_id: str) -> bool:
    """Retorna True SOLO si las 3 gates pasan."""
    # Gate 1: regla habilitada
    rule = await get_rule(db, dev_org_id)
    if not rule.get("enabled"):
        log.debug(f"[auto_approve] {asesor_id}@{dev_org_id}: gate1 FAIL (disabled)")
        return False

    threshold = int(rule.get("threshold_trust_score", 70))
    require_zona = bool(rule.get("require_zona_expertise", True))
    target_colonias: List[str] = [
        c.lower() for c in (rule.get("target_colonias") or [])
    ]
    min_deals = int(rule.get("min_deals_closed_12m", 1))

    # Gate 2: Trust Score
    trust_score = await _get_trust_score(db, asesor_id)
    if trust_score < threshold:
        log.debug(
            f"[auto_approve] {asesor_id}@{dev_org_id}: gate2 FAIL "
            f"(trust={trust_score} < threshold={threshold})"
        )
        return False

    # Gate 3: Zona expertise (optional)
    if require_zona:
        deals_in_zone = await _deals_in_zone_12m(db, asesor_id, target_colonias)
        if deals_in_zone < min_deals:
            log.debug(
                f"[auto_approve] {asesor_id}@{dev_org_id}: gate3 FAIL "
                f"(deals_in_zone={deals_in_zone} < min={min_deals})"
            )
            return False

    log.info(f"[auto_approve] {asesor_id}@{dev_org_id}: ALL GATES PASS → auto_approved")
    return True


# ─── Simulation ───────────────────────────────────────────────────────────────

async def simulate_rule(
    db,
    dev_org_id: str,
    threshold_trust_score: int,
    require_zona_expertise: bool,
    target_colonias: Optional[List[str]],
    min_deals_closed_12m: int,
) -> Dict[str, Any]:
    """Simula qué porcentaje de asesores activos pasarían con esta regla."""
    asesores = await db.users.find(
        {"role": {"$in": ["advisor", "asesor_admin"]}},
        {"_id": 0, "user_id": 1},
    ).to_list(500)

    if not asesores:
        return {"eligible_count": 0, "total_asesores": 0, "pct": 0}

    tc_lower = [c.lower() for c in (target_colonias or [])]
    eligible = 0
    for a in asesores:
        aid = a["user_id"]
        ts = await _get_trust_score(db, aid)
        if ts < threshold_trust_score:
            continue
        if require_zona_expertise:
            dz = await _deals_in_zone_12m(db, aid, tc_lower)
            if dz < min_deals_closed_12m:
                continue
        eligible += 1

    total = len(asesores)
    pct = round(eligible / total * 100, 1) if total else 0
    return {"eligible_count": eligible, "total_asesores": total, "pct": pct}


# ─── Private helpers ──────────────────────────────────────────────────────────

async def _get_trust_score(db, asesor_id: str) -> int:
    """Pull Trust Score from cache (B32). Fallback 0."""
    try:
        doc = await db.asesor_trust_scores.find_one(
            {"asesor_id": asesor_id}, {"_id": 0, "score": 1}
        )
        return int((doc or {}).get("score", 0))
    except Exception:
        return 0


async def _deals_in_zone_12m(
    db, asesor_id: str, target_colonias: List[str]
) -> int:
    """Cuenta deals cerrados en los últimos 12 meses en target_colonias.
    Si target_colonias vacío → cuenta en cualquier colonia.
    """
    since = (_now() - timedelta(days=365)).isoformat()

    # Leads cerrados del asesor en 12m
    q: Dict[str, Any] = {
        "$and": [
            {"$or": [
                {"assigned_to": asesor_id},
                {"asesor_id": asesor_id},
                {"assigned_user_id": asesor_id},
            ]},
            {"$or": [
                {"status": {"$in": list(WON_STATUSES)}},
                {"lead_stage": {"$in": list(WON_STATUSES)}},
            ]},
            {"$or": [
                {"created_at": {"$gte": since}},
                {"closed_at": {"$gte": since}},
                {"updated_at": {"$gte": since}},
            ]},
        ],
    }
    leads = await db.leads.find(q, {"_id": 0, "project_id": 1, "development_id": 1}).to_list(2000)

    if not target_colonias:
        # Sin restricción de zona → cuenta todos
        return len(leads)

    # Necesitamos obtener las colonias de cada lead via su proyecto
    if not leads:
        return 0

    proj_ids = list({
        ld.get("project_id") or ld.get("development_id")
        for ld in leads
        if ld.get("project_id") or ld.get("development_id")
    })

    # Buscar colonias en db.developments y db.projects
    colonia_map: Dict[str, str] = {}
    from data_developments import DEVELOPMENTS
    for dev in DEVELOPMENTS:
        pid = dev.get("id") or dev.get("project_id")
        if pid:
            colonia_map[pid] = (dev.get("colonia") or "").lower()

    # también buscar en db.projects
    try:
        proj_docs = await db.projects.find(
            {"id": {"$in": proj_ids}}, {"_id": 0, "id": 1, "colonia": 1}
        ).to_list(200)
        for p in proj_docs:
            if p.get("id") and p.get("colonia"):
                colonia_map[p["id"]] = p["colonia"].lower()
    except Exception:
        pass

    count = 0
    for ld in leads:
        pid = ld.get("project_id") or ld.get("development_id")
        colonia = colonia_map.get(pid, "")
        if any(tc in colonia or colonia in tc for tc in target_colonias):
            count += 1

    return count
