"""Phase 4 Batch 20 · services — Sankey attribution flow.

Compute 4-level Sankey: source → asesor → stage → outcome.
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Any, Dict


def _now() -> datetime:
    return datetime.now(timezone.utc)


WON = {"won", "ganado", "cerrado_ganado", "closed_won"}
LOST = {"lost", "perdido", "cerrado_perdido", "closed_lost"}


async def compute_sankey_flow(db, project_id: str, period: str = "30d") -> Dict[str, Any]:
    """Returns {nodes:[{id,label,type}], links:[{source,target,value}]} for project."""
    days = {"7d": 7, "30d": 30, "90d": 90}.get(period, 30)
    since = (_now() - timedelta(days=days)).isoformat()

    # Pull leads in period for project
    leads = await db.leads.find(
        {"project_id": project_id, "created_at": {"$gte": since}},
        {"_id": 0},
    ).to_list(5000)

    # Pull source attribution
    lead_ids = [ld.get("id") or ld.get("lead_id") for ld in leads]
    attribs = await db.lead_source_attribution.find(
        {"lead_id": {"$in": lead_ids}},
        {"_id": 0},
    ).to_list(10000)
    attr_by_lead = {a["lead_id"]: a for a in attribs}

    # Pull tracking links to enrich source
    link_ids = list({a.get("touchpoints", [{}])[0].get("link_id")
                      for a in attribs if a.get("touchpoints")})
    links = await db.tracking_links.find(
        {"link_id": {"$in": [li for li in link_ids if li]}},
        {"_id": 0, "link_id": 1, "utm_source": 1, "utm_campaign": 1, "asesor_id": 1},
    ).to_list(2000)
    link_by_id = {ln["link_id"]: ln for ln in links}

    # Aggregate flow counts
    flow: Dict[tuple, int] = {}
    sources_seen: set = set()
    asesores_seen: set = set()
    stages_seen: set = set()
    outcomes_seen: set = set()

    def stage_of(ld):
        return (ld.get("lead_stage") or ld.get("status") or "nuevo").lower()

    def outcome_of(stage):
        if stage in WON:
            return "won"
        if stage in LOST:
            return "lost"
        return "open"

    def source_of(ld, attr):
        if attr and attr.get("touchpoints"):
            tp = attr["touchpoints"][-1]
            link_id = tp.get("link_id")
            if link_id and link_id in link_by_id:
                return f"src:{link_by_id[link_id].get('utm_source', 'other')}"
            if tp.get("utm_source"):
                return f"src:{tp['utm_source']}"
        return f"src:{ld.get('source', 'organic')}"

    for ld in leads:
        lid = ld.get("id") or ld.get("lead_id")
        attr = attr_by_lead.get(lid)
        src = source_of(ld, attr)
        asesor = ld.get("assigned_to") or ld.get("asesor_id") or "unassigned"
        stage = stage_of(ld)
        outcome = outcome_of(stage)
        asesor_node = f"ase:{asesor}"
        stage_node = f"stg:{stage}"
        outcome_node = f"out:{outcome}"

        sources_seen.add(src)
        asesores_seen.add(asesor_node)
        stages_seen.add(stage_node)
        outcomes_seen.add(outcome_node)

        flow[(src, asesor_node)] = flow.get((src, asesor_node), 0) + 1
        flow[(asesor_node, stage_node)] = flow.get((asesor_node, stage_node), 0) + 1
        flow[(stage_node, outcome_node)] = flow.get((stage_node, outcome_node), 0) + 1

    # Resolve asesor labels
    asesor_ids = [a.split(":", 1)[1] for a in asesores_seen if a != "ase:unassigned"]
    user_lookup = {}
    if asesor_ids:
        async for u in db.users.find(
            {"user_id": {"$in": asesor_ids}},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1},
        ):
            user_lookup[u["user_id"]] = u.get("name") or u.get("email") or u["user_id"]

    def label_for(node_id: str) -> str:
        prefix, val = node_id.split(":", 1)
        if prefix == "src":
            return val.replace("_", " ").title()
        if prefix == "ase":
            return user_lookup.get(val, "Sin asignar" if val == "unassigned" else val)
        if prefix == "stg":
            return val.replace("_", " ").title()
        if prefix == "out":
            return {"won": "Ganado", "lost": "Perdido", "open": "Abierto"}.get(val, val)
        return node_id

    def type_for(node_id: str) -> str:
        prefix = node_id.split(":", 1)[0]
        return {"src": "source", "ase": "asesor",
                 "stg": "stage", "out": "outcome"}.get(prefix, "stage")

    all_nodes = sorted(sources_seen) + sorted(asesores_seen) + sorted(stages_seen) + sorted(outcomes_seen)
    nodes = [{"id": n, "label": label_for(n), "type": type_for(n)} for n in all_nodes]
    links = [
        {"source": s, "target": t, "value": v}
        for (s, t), v in flow.items() if v > 0
    ]
    return {"nodes": nodes, "links": links, "period": period, "project_id": project_id}
