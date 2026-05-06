"""Phase 4 Batch 34 · services — Lead-to-Asesor Smart Match.

Algoritmo 5-component weighted (total 100):
  - Zona expertise (30): deals zona/colonia 12m / max equipo
  - Price range match (25): cercanía avg_deal_price asesor vs budget lead
  - Intent type match (20): coincidencia tipo lead (inversionista/familia/...)
  - Response time score (15): linear scale (rt < 4h = 100)
  - Capacity score (10): inverso de leads_active / max_capacity

Top 3 reasons via Claude Haiku ≤30 palabras (cost-gated, cache via match_id).
Cache 60min en db.lead_match_scores.
"""
from __future__ import annotations

import logging
import math
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.lead_to_asesor_match")

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
HAIKU_MODEL = "claude-haiku-4-5-20251001"
CACHE_TTL_MIN = 60
WON = ["won", "ganado", "cerrado_ganado", "closed_won"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


# ─── Component scorers ────────────────────────────────────────────────────────

async def _zona_expertise(
    db, asesor_id: str, target_colonia: str, target_ciudad: str,
    team_max_deals: int,
) -> Dict[str, Any]:
    """deals zona último 12m / max equipo · score 0-30."""
    if not target_colonia and not target_ciudad:
        return {"score": 0.0, "deals": 0}

    since = (_now() - timedelta(days=365)).isoformat()
    # leads cerrados del asesor en zona (2 queries para evitar pipeline complejo)
    leads = await db.leads.find(
        {"$and": [
            {"$or": [{"assigned_to": asesor_id}, {"asesor_id": asesor_id}]},
            {"$or": [
                {"status": {"$in": WON}},
                {"lead_stage": {"$in": WON}},
            ]},
            {"$or": [
                {"won_at": {"$gte": since}},
                {"updated_at": {"$gte": since}},
                {"created_at": {"$gte": since}},
            ]},
        ]},
        {"_id": 0, "project_id": 1, "development_id": 1},
    ).limit(200).to_list(200)

    if not leads:
        return {"score": 0.0, "deals": 0}

    pids = [le.get("project_id") or le.get("development_id") for le in leads if le.get("project_id") or le.get("development_id")]
    if not pids:
        return {"score": 0.0, "deals": 0}

    devs = await db.developments.find(
        {"id": {"$in": pids}},
        {"_id": 0, "id": 1, "colonia": 1, "ciudad": 1},
    ).to_list(200)
    by_id = {d["id"]: d for d in devs}

    deals_in_zone = 0
    for le in leads:
        pid = le.get("project_id") or le.get("development_id")
        d = by_id.get(pid)
        if not d:
            continue
        match_zone = (
            (target_colonia and d.get("colonia", "").lower() == target_colonia.lower()) or
            (target_ciudad and d.get("ciudad", "").lower() == target_ciudad.lower())
        )
        if match_zone:
            deals_in_zone += 1

    if team_max_deals == 0:
        return {"score": 0.0, "deals": deals_in_zone}

    ratio = min(1.0, deals_in_zone / team_max_deals)
    return {"score": round(ratio * 30, 2), "deals": deals_in_zone}


async def _price_range_match(
    db, asesor_id: str, target_budget: float,
) -> Dict[str, Any]:
    """Cercanía avg_deal_price asesor vs budget lead · score 0-25."""
    if target_budget <= 0:
        return {"score": 12.5, "avg_price": 0}

    leads = await db.leads.find(
        {"$and": [
            {"$or": [{"assigned_to": asesor_id}, {"asesor_id": asesor_id}]},
            {"$or": [
                {"status": {"$in": WON}},
                {"lead_stage": {"$in": WON}},
            ]},
        ]},
        {"_id": 0, "expected_value": 1, "deal_value": 1, "price": 1},
    ).limit(50).to_list(50)

    prices = []
    for le in leads:
        v = le.get("deal_value") or le.get("expected_value") or le.get("price")
        if v and v > 0:
            prices.append(float(v))

    if not prices:
        return {"score": 10.0, "avg_price": 0}  # sin track record → score base

    avg = sum(prices) / len(prices)
    # Distance ratio: 0 = idéntico, 1 = lejano
    if avg <= 0 or target_budget <= 0:
        return {"score": 10.0, "avg_price": avg}
    distance = abs(math.log10(avg) - math.log10(target_budget))
    closeness = max(0.0, 1.0 - distance)  # 1.0 si log10 difiere 0, 0 si difiere ≥1
    return {"score": round(closeness * 25, 2), "avg_price": round(avg, 2)}


async def _intent_type_match(
    db, asesor_id: str, lead_intent: str,
) -> Dict[str, Any]:
    """Coincidencia tipo de lead (inversionista/familia/primer_hogar/etc) · 0-20."""
    if not lead_intent:
        return {"score": 10.0, "matched": False}

    pipe = [
        {"$match": {
            "$or": [{"assigned_to": asesor_id}, {"asesor_id": asesor_id}],
        }},
        {"$group": {
            "_id": "$lead_type",
            "total": {"$sum": 1},
            "won": {"$sum": {"$cond": [
                {"$in": ["$status", WON]}, 1, 0,
            ]}},
        }},
    ]
    rows = await db.leads.aggregate(pipe).to_list(20)
    by_type = {r["_id"]: r for r in rows if r.get("_id")}

    if not by_type:
        return {"score": 10.0, "matched": False}

    matched = by_type.get(lead_intent)
    if not matched or matched["total"] == 0:
        return {"score": 5.0, "matched": False}

    conv = matched["won"] / matched["total"]
    # Best conversion entre todos los tipos del asesor
    best_conv = max(
        (r["won"] / r["total"] for r in by_type.values() if r["total"] > 0),
        default=conv,
    )
    if best_conv == 0:
        return {"score": 10.0, "matched": True}
    rel = conv / best_conv
    return {"score": round(rel * 20, 2), "matched": True}


async def _response_time_score(db, asesor_id: str) -> Dict[str, Any]:
    """rt < 4h = 100 (peso 15). Linear hasta rt = 24h = 0."""
    snap = await db.asesor_metrics_snapshots.find_one(
        {"asesor_id": asesor_id},
        {"_id": 0, "response_time_hours": 1},
        sort=[("snapshot_at", -1)],
    )
    rt = float((snap or {}).get("response_time_hours", 24.0) or 24.0)
    if rt <= 4:
        ratio = 1.0
    elif rt >= 24:
        ratio = 0.0
    else:
        ratio = max(0.0, 1.0 - (rt - 4) / 20.0)
    return {"score": round(ratio * 15, 2), "response_time_hours": rt}


async def _capacity_score(db, asesor_id: str) -> Dict[str, Any]:
    """Inverso leads_active / max_capacity · 0-10. Default max=20."""
    snap = await db.asesor_metrics_snapshots.find_one(
        {"asesor_id": asesor_id},
        {"_id": 0, "leads_active": 1},
        sort=[("snapshot_at", -1)],
    )
    active = int((snap or {}).get("leads_active", 0) or 0)
    max_cap = 20
    if active >= max_cap:
        return {"score": 0.0, "leads_active": active}
    ratio = 1.0 - (active / max_cap)
    return {"score": round(ratio * 10, 2), "leads_active": active}


# ─── Lead context extractor ───────────────────────────────────────────────────

async def _lead_context(db, lead_id: str) -> Dict[str, Any]:
    lead = await db.leads.find_one(
        {"$or": [{"id": lead_id}, {"lead_id": lead_id}]}, {"_id": 0},
    )
    if not lead:
        lead = await db.users.find_one({"user_id": lead_id}, {"_id": 0})

    target_budget = 0.0
    target_colonia = ""
    target_ciudad = ""
    target_intent = ""

    if lead:
        target_budget = float(
            lead.get("budget_max") or lead.get("expected_value")
            or lead.get("budget") or 0,
        )
        target_intent = lead.get("lead_type") or ""

        # Saved searches B25 si existen
        try:
            saved = await db.saved_searches.find_one(
                {"user_id": lead_id}, {"_id": 0, "filters": 1},
            )
            if saved:
                f = saved.get("filters") or {}
                if f.get("price_max") and target_budget == 0:
                    target_budget = float(f["price_max"])
                target_colonia = f.get("colonia") or target_colonia
                target_ciudad = f.get("ciudad") or target_ciudad
        except Exception:
            pass

    return {
        "lead": lead or {},
        "budget": target_budget,
        "colonia": target_colonia,
        "ciudad": target_ciudad,
        "intent": target_intent,
    }


# ─── Project context ──────────────────────────────────────────────────────────

async def _project_context(db, project_id: Optional[str]) -> Dict[str, Any]:
    if not project_id:
        return {}
    proj = await db.developments.find_one(
        {"id": project_id},
        {"_id": 0, "id": 1, "name": 1, "colonia": 1, "ciudad": 1,
         "price_from": 1, "tier": 1},
    )
    return proj or {}


# ─── Reasons via Claude Haiku ─────────────────────────────────────────────────

async def _generate_reasons(
    asesor_name: str, score_breakdown: Dict[str, Any],
) -> List[str]:
    """Top 3 razones cortas. Cost-gated."""
    if not EMERGENT_LLM_KEY:
        return _heuristic_reasons(score_breakdown)

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"match_reasons_{uuid.uuid4().hex[:8]}",
            system_message=(
                "Genera 3 razones SHORT por las que un asesor es buen match para "
                "un lead. REGLAS:\n"
                "1) Idioma es-MX. Sin emojis.\n"
                "2) Cada razón ≤30 palabras.\n"
                "3) Concreto: cita el dato/score (X deals · response Yh · capacidad Z%).\n"
                "4) Output: 3 líneas separadas por \\n. SIN bullets ni numeración.\n"
                "5) Ejemplo: 'Polanco expertise (8 deals 2024)\\nResponse time 1.2h\\n4 leads activos (capacidad libre)'"
            ),
        ).with_model("anthropic", HAIKU_MODEL)

        zone_data = score_breakdown.get("zona_expertise", {})
        price_data = score_breakdown.get("price_range_match", {})
        rt_data = score_breakdown.get("response_time_score", {})
        cap_data = score_breakdown.get("capacity_score", {})

        prompt = (
            f"Asesor: {asesor_name}\n"
            f"Zona: {zone_data.get('deals',0)} deals últimos 12m (score {zone_data.get('score',0)}/30)\n"
            f"Avg deal price: ${int(price_data.get('avg_price',0)):,} (score {price_data.get('score',0)}/25)\n"
            f"Response time: {rt_data.get('response_time_hours',0):.1f}h (score {rt_data.get('score',0)}/15)\n"
            f"Leads activos: {cap_data.get('leads_active',0)}/20 (score {cap_data.get('score',0)}/10)\n\n"
            f"Genera las 3 razones."
        )
        resp = await chat.send_message(UserMessage(text=prompt))
        text = (resp or "").strip()
        lines = [ln.strip().lstrip("-•·* ").strip() for ln in text.split("\n") if ln.strip()]
        return lines[:3] if lines else _heuristic_reasons(score_breakdown)
    except Exception as e:
        log.warning(f"[match] reasons exception: {e}")
        return _heuristic_reasons(score_breakdown)


def _heuristic_reasons(sb: Dict[str, Any]) -> List[str]:
    out = []
    z = sb.get("zona_expertise", {})
    if z.get("deals", 0) > 0:
        out.append(f"Zona expertise: {z['deals']} deals últimos 12m")
    rt = sb.get("response_time_score", {})
    if rt.get("response_time_hours", 24) <= 6:
        out.append(f"Response time {rt['response_time_hours']:.1f}h promedio")
    cap = sb.get("capacity_score", {})
    if cap.get("leads_active", 20) < 10:
        out.append(f"Capacidad libre ({cap['leads_active']}/20 leads activos)")
    if not out:
        out.append("Mejor opción del pool disponible")
    return out[:3]


# ─── Public API ───────────────────────────────────────────────────────────────

async def compute_match(
    db,
    lead_id: str,
    project_id: Optional[str] = None,
    asesor_pool: Optional[List[str]] = None,
    force: bool = False,
) -> Dict[str, Any]:
    # Cache lookup
    if not force:
        cached = await db.lead_match_scores.find_one(
            {"lead_id": lead_id, "project_id": project_id}, {"_id": 0},
        )
        if cached:
            ca = cached.get("computed_at")
            if isinstance(ca, datetime):
                if ca.tzinfo is None:
                    ca = ca.replace(tzinfo=timezone.utc)
                age_min = (_now() - ca).total_seconds() / 60.0
                if age_min < CACHE_TTL_MIN:
                    cached["computed_at"] = _iso(ca)
                    cached["from_cache"] = True
                    return cached

    # Pool fallback: todos los asesores activos
    if not asesor_pool:
        users = await db.users.find(
            {"role": {"$in": ["advisor", "asesor_admin"]}, "active": {"$ne": False}},
            {"_id": 0, "user_id": 1},
        ).limit(20).to_list(20)
        asesor_pool = [u["user_id"] for u in users]

    if not asesor_pool:
        raise ValueError("Sin asesores en el pool")

    lead_ctx = await _lead_context(db, lead_id)
    proj_ctx = await _project_context(db, project_id)

    # Resolver zona destino: project zone > lead saved_search > nada
    target_colonia = proj_ctx.get("colonia") or lead_ctx.get("colonia") or ""
    target_ciudad = proj_ctx.get("ciudad") or lead_ctx.get("ciudad") or ""
    target_budget = proj_ctx.get("price_from") or lead_ctx.get("budget") or 0

    # Pre-pass: max deals zona del equipo
    team_zone_deals: List[int] = []
    for aid in asesor_pool:
        z = await _zona_expertise(db, aid, target_colonia, target_ciudad, 1)
        team_zone_deals.append(z.get("deals", 0))
    max_team = max(team_zone_deals) if team_zone_deals else 1

    # Compute per asesor
    candidates: List[Dict[str, Any]] = []
    asesor_names: Dict[str, str] = {}
    if asesor_pool:
        users = await db.users.find(
            {"user_id": {"$in": asesor_pool}},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1},
        ).to_list(50)
        asesor_names = {
            u["user_id"]: u.get("name") or u.get("email", "Asesor")
            for u in users
        }

    for aid in asesor_pool:
        zona = await _zona_expertise(db, aid, target_colonia, target_ciudad, max_team or 1)
        price = await _price_range_match(db, aid, target_budget)
        intent = await _intent_type_match(db, aid, lead_ctx.get("intent", ""))
        rt = await _response_time_score(db, aid)
        cap = await _capacity_score(db, aid)

        breakdown = {
            "zona_expertise": zona,
            "price_range_match": price,
            "intent_type_match": intent,
            "response_time_score": rt,
            "capacity_score": cap,
        }
        match_pct = round(
            zona["score"] + price["score"] + intent["score"]
            + rt["score"] + cap["score"], 1,
        )

        candidates.append({
            "asesor_id": aid,
            "asesor_name": asesor_names.get(aid, "Asesor"),
            "match_pct": match_pct,
            "score_breakdown": breakdown,
            "top_3_reasons": [],  # se rellenará para winner
        })

    # Sort desc match_pct
    candidates.sort(key=lambda c: c["match_pct"], reverse=True)

    # Generar reasons solo para winner (cost gating)
    winner_id = ""
    if candidates:
        winner = candidates[0]
        winner_id = winner["asesor_id"]
        winner["top_3_reasons"] = await _generate_reasons(
            winner["asesor_name"], winner["score_breakdown"],
        )

    match_id = str(uuid.uuid4())
    doc = {
        "match_id": match_id,
        "lead_id": lead_id,
        "project_id": project_id,
        "candidates": candidates,
        "winner_asesor_id": winner_id,
        "computed_at": _now(),
        "ttl_minutes": CACHE_TTL_MIN,
    }
    await db.lead_match_scores.update_one(
        {"lead_id": lead_id, "project_id": project_id},
        {"$set": doc},
        upsert=True,
    )

    try:
        from routes_dev_batch14 import log_activity
        await log_activity(
            db, actor_id="system", actor_type="system",
            action="lead_match_computed", entity_id=match_id,
            entity_type="lead_match",
            metadata={"lead_id": lead_id, "winner": winner_id,
                      "score": candidates[0]["match_pct"] if candidates else 0},
        )
    except Exception:
        pass

    out = dict(doc)
    out["computed_at"] = _iso(doc["computed_at"])
    out["from_cache"] = False
    return out


async def get_match(db, match_id: str) -> Optional[Dict[str, Any]]:
    doc = await db.lead_match_scores.find_one({"match_id": match_id}, {"_id": 0})
    if not doc:
        return None
    if isinstance(doc.get("computed_at"), datetime):
        doc["computed_at"] = _iso(doc["computed_at"])
    return doc


async def get_recent_matches_for_lead(
    db, lead_id: str, limit: int = 5,
) -> List[Dict[str, Any]]:
    cur = db.lead_match_scores.find(
        {"lead_id": lead_id}, {"_id": 0},
    ).sort("computed_at", -1).limit(limit)
    rows = await cur.to_list(limit)
    for r in rows:
        if isinstance(r.get("computed_at"), datetime):
            r["computed_at"] = _iso(r["computed_at"])
    return rows


async def ensure_lead_match_indexes(db) -> None:
    await db.lead_match_scores.create_index("match_id", unique=True)
    await db.lead_match_scores.create_index([("lead_id", 1), ("project_id", 1)])
    await db.lead_match_scores.create_index([("lead_id", 1), ("computed_at", -1)])
    log.info("[lead_match] indexes ensured")
