"""W5.12 Parte 1 — KG ETL: rebuild_full + edge builders.

Itera collections Mongo y replica al grafo Neo4j en batches.
Idempotente · usa MERGE Cypher · resiliente a errores parciales.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List

log = logging.getLogger("dmx.kg.etl")

BATCH_SIZE = 500


async def rebuild_full(db) -> Dict[str, Any]:
    """Reconstruye el grafo completo desde Mongo.

    Orden: nodos primero (8 collections) → edges (orden topologico).
    Cypher batched MERGE 500/batch.
    """
    from knowledge_graph_engine import KG_AVAILABLE, KGDriver

    started = time.perf_counter()
    summary: Dict[str, Any] = {
        "nodes_created": 0,
        "edges_created": 0,
        "errors": [],
        "duration_s": 0,
        "skipped": False,
    }

    if not KG_AVAILABLE:
        summary["skipped"] = True
        summary["errors"].append("KG_AVAILABLE=False · ETL no ejecutado")
        log.warning("[KG ETL] rebuild_full skipped · KG no disponible")
        return summary

    drv = await KGDriver.get()

    # ─── Nodos ───────────────────────────────────────────────────────────────
    summary["nodes_created"] += await _load_projects(db, drv, summary)
    summary["nodes_created"] += await _load_units(db, drv, summary)
    summary["nodes_created"] += await _load_dev_orgs(db, drv, summary)
    summary["nodes_created"] += await _load_zones(db, drv, summary)
    summary["nodes_created"] += await _load_comparables(db, drv, summary)
    summary["nodes_created"] += await _load_leads(db, drv, summary)
    summary["nodes_created"] += await _load_behavioral(db, drv, summary)
    summary["nodes_created"] += await _load_iescores(db, drv, summary)

    # ─── Edges ───────────────────────────────────────────────────────────────
    summary["edges_created"] += await _edge_project_owned_by(db, drv, summary)
    summary["edges_created"] += await _edge_project_located_in(db, drv, summary)
    summary["edges_created"] += await _edge_project_has_unit(db, drv, summary)
    summary["edges_created"] += await _edge_lead_interested_in(db, drv, summary)
    summary["edges_created"] += await _edge_behavioral_viewed(db, drv, summary)
    summary["edges_created"] += await _edge_project_scored_by(db, drv, summary)
    summary["edges_created"] += await _edge_comparable_to(db, drv, summary)
    summary["edges_created"] += await _edge_devorg_duplicate_of(db, drv, summary)

    summary["duration_s"] = round(time.perf_counter() - started, 2)
    log.info(
        f"[KG ETL] rebuild_full done · nodes={summary['nodes_created']} "
        f"edges={summary['edges_created']} errors={len(summary['errors'])} "
        f"duration={summary['duration_s']}s"
    )

    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "kg_cron", "role": "system"},
            action="kg_rebuild",
            entity_type="kg",
            entity_id="rebuild_full",
            before=None,
            after=summary,
        )
    except Exception as exc:
        log.warning(f"[KG ETL] audit log of rebuild failed: {exc}")

    return summary


# ─── Helpers de carga por collection ──────────────────────────────────────────

async def _batched_run(drv, cypher: str, batch: List[Dict[str, Any]]) -> int:
    if not batch:
        return 0
    try:
        await drv.run(cypher, {"rows": batch}, retries=2)
        return len(batch)
    except Exception as exc:
        log.warning(f"[KG ETL] batch failed (size={len(batch)}): {exc}")
        return 0


async def _load_projects(db, drv, summary) -> int:
    cypher = """
    UNWIND $rows AS row
    MERGE (p:Project {id: row.id})
    SET p.name = row.name,
        p.dev_org_id = row.dev_org_id,
        p.zone_slug = row.zone_slug,
        p.precio_min = row.precio_min,
        p.precio_max = row.precio_max,
        p.updated_at = row.updated_at
    """
    return await _stream_to_neo(
        db, drv, summary,
        collection="developments",
        cypher=cypher,
        mapper=lambda d: {
            "id": d.get("id") or d.get("project_id"),
            "name": d.get("name") or d.get("nombre"),
            "dev_org_id": d.get("dev_org_id") or d.get("developer_id"),
            "zone_slug": d.get("zone_slug") or d.get("colonia_slug"),
            "precio_min": d.get("precio_min") or d.get("price_min"),
            "precio_max": d.get("precio_max") or d.get("price_max"),
            "updated_at": d.get("updated_at"),
        },
        skip_if=lambda d: not (d.get("id") or d.get("project_id")),
    )


async def _load_units(db, drv, summary) -> int:
    cypher = """
    UNWIND $rows AS row
    MERGE (u:Unit {id: row.id})
    SET u.project_id = row.project_id,
        u.numero = row.numero,
        u.tipo = row.tipo,
        u.precio = row.precio,
        u.estatus = row.estatus
    """
    return await _stream_to_neo(
        db, drv, summary,
        collection="units",
        cypher=cypher,
        mapper=lambda d: {
            "id": d.get("id") or d.get("unit_id"),
            "project_id": d.get("project_id") or d.get("development_id"),
            "numero": d.get("numero") or d.get("number"),
            "tipo": d.get("tipo") or d.get("type"),
            "precio": d.get("precio") or d.get("price"),
            "estatus": d.get("estatus") or d.get("status"),
        },
        skip_if=lambda d: not (d.get("id") or d.get("unit_id")),
    )


async def _load_dev_orgs(db, drv, summary) -> int:
    cypher = """
    UNWIND $rows AS row
    MERGE (d:DevOrg {id: row.id})
    SET d.name = row.name, d.tenant_id = row.tenant_id
    """
    return await _stream_to_neo(
        db, drv, summary,
        collection="inmobiliarias",
        cypher=cypher,
        mapper=lambda d: {
            "id": d.get("id") or d.get("dev_org_id") or d.get("tenant_id"),
            "name": d.get("name") or d.get("nombre"),
            "tenant_id": d.get("tenant_id"),
        },
        skip_if=lambda d: not (d.get("id") or d.get("dev_org_id") or d.get("tenant_id")),
    )


async def _load_zones(db, drv, summary) -> int:
    cypher = """
    UNWIND $rows AS row
    MERGE (z:Zone {slug: row.slug})
    SET z.name = row.name,
        z.alcaldia = row.alcaldia,
        z.tier = row.tier
    """
    return await _stream_to_neo(
        db, drv, summary,
        collection="colonias",   # Palanca 5: 'zones' NO existe → la real es 'colonias' (2,788)
        cypher=cypher,
        mapper=lambda d: {
            "slug": d.get("slug") or d.get("zone_slug") or d.get("colonia_slug"),
            "name": d.get("name") or d.get("nombre"),
            "alcaldia": d.get("alcaldia"),
            "tier": d.get("tier"),
        },
        skip_if=lambda d: not (d.get("slug") or d.get("zone_slug") or d.get("colonia_slug")),
    )


async def _load_comparables(db, drv, summary) -> int:
    cypher = """
    UNWIND $rows AS row
    MERGE (c:Comparable {id: row.id})
    SET c.zone_slug = row.zone_slug,
        c.price = row.price,
        c.tipo = row.tipo,
        c.closed_at = row.closed_at
    """
    return await _stream_to_neo(
        db, drv, summary,
        collection="transactions_history",
        cypher=cypher,
        mapper=lambda d: {
            "id": d.get("id") or d.get("transaction_id"),
            "zone_slug": d.get("zone_slug") or d.get("colonia_slug"),
            "price": d.get("price") or d.get("precio"),
            "tipo": d.get("tipo") or d.get("type"),
            "closed_at": d.get("closed_at") or d.get("created_at"),
        },
        skip_if=lambda d: not (d.get("id") or d.get("transaction_id")),
    )


async def _load_leads(db, drv, summary) -> int:
    cypher = """
    UNWIND $rows AS row
    MERGE (l:Lead {id: row.id})
    SET l.client_global_id = row.client_gid,
        l.status = row.status,
        l.assigned_to = row.assigned_to,
        l.dev_org_id = row.dev_org_id,
        l.project_id = row.project_id,
        l.created_at = row.created_at,
        l.updated_at = row.updated_at
    """
    return await _stream_to_neo(
        db, drv, summary,
        collection="leads",
        cypher=cypher,
        mapper=lambda d: {
            "id": d.get("id"),
            "client_gid": d.get("client_global_id"),
            "status": d.get("status"),
            "assigned_to": d.get("assigned_to") or d.get("created_by"),
            "dev_org_id": d.get("dev_org_id"),
            "project_id": d.get("project_id"),
            "created_at": d.get("created_at"),
            "updated_at": d.get("updated_at"),
        },
        skip_if=lambda d: not d.get("id"),
    )


async def _load_behavioral(db, drv, summary) -> int:
    cypher = """
    UNWIND $rows AS row
    MERGE (b:BehavioralSession {id: row.id})
    SET b.user_id = row.user_id,
        b.intent = row.intent,
        b.event_type = row.event_type,
        b.created_at = row.created_at,
        b.project_id = row.project_id
    """
    # P0.9 · reconexión: la data real vive en behavioral_events (timestamp/page/metadata).
    return await _stream_to_neo(
        db, drv, summary,
        collection="behavioral_events",
        cypher=cypher,
        mapper=lambda d: {
            "id": d.get("id") or d.get("event_id") or d.get("session_id"),
            "user_id": d.get("user_id"),
            "intent": d.get("intent") or d.get("event_intent"),
            "event_type": d.get("event_type") or d.get("type"),
            "created_at": d.get("created_at") or d.get("timestamp"),
            "project_id": d.get("project_id"),
        },
        skip_if=lambda d: not (d.get("id") or d.get("event_id") or d.get("session_id")),
    )


async def _load_iescores(db, drv, summary) -> int:
    cypher = """
    UNWIND $rows AS row
    MERGE (s:IEScore {id: row.id})
    SET s.project_id = row.project_id,
        s.score = row.score,
        s.computed_at = row.computed_at
    """
    # Palanca 5 (auditoría 07-20): leía 'intelligent_explorer_scores' (INEXISTENTE) → 0 nodos.
    # La colección real es 'ie_scores' (20,654), con value/zone_id (no score/project_id).
    return await _stream_to_neo(
        db, drv, summary,
        collection="ie_scores",
        cypher=cypher,
        mapper=lambda d: {
            "id": d.get("id") or f"{d.get('zone_id') or d.get('dev_id','')}_{d.get('computed_at','')}",
            "project_id": d.get("zone_id") or d.get("dev_id"),
            "score": d.get("value") if d.get("value") is not None else d.get("score"),
            "computed_at": d.get("computed_at") or d.get("created_at"),
        },
        skip_if=lambda d: not (d.get("zone_id") or d.get("dev_id")) or d.get("is_proxy"),
    )


async def _stream_to_neo(
    db, drv, summary, *, collection: str, cypher: str, mapper, skip_if,
) -> int:
    total = 0
    try:
        cursor = db[collection].find({}, {"_id": 0}).batch_size(BATCH_SIZE)
        batch: List[Dict[str, Any]] = []
        async for doc in cursor:
            if skip_if(doc):
                continue
            try:
                batch.append(mapper(doc))
            except Exception as exc:
                summary["errors"].append(f"{collection} mapper: {exc}")
                continue
            if len(batch) >= BATCH_SIZE:
                total += await _batched_run(drv, cypher, batch)
                batch = []
        if batch:
            total += await _batched_run(drv, cypher, batch)
    except Exception as exc:
        msg = f"{collection}: {exc}"
        summary["errors"].append(msg)
        log.warning(f"[KG ETL] {msg}")
    return total


# ─── Edges ───────────────────────────────────────────────────────────────────

async def _edge_project_owned_by(db, drv, summary) -> int:
    cypher = """
    MATCH (p:Project), (d:DevOrg {id: p.dev_org_id})
    WHERE p.dev_org_id IS NOT NULL AND p.dev_org_id <> ''
    MERGE (p)-[:OWNED_BY]->(d)
    RETURN count(p) AS n
    """
    return await _count_run(drv, cypher, summary, "OWNED_BY")


async def _edge_project_located_in(db, drv, summary) -> int:
    cypher = """
    MATCH (p:Project), (z:Zone {slug: p.zone_slug})
    WHERE p.zone_slug IS NOT NULL AND p.zone_slug <> ''
    MERGE (p)-[:LOCATED_IN]->(z)
    RETURN count(p) AS n
    """
    return await _count_run(drv, cypher, summary, "LOCATED_IN")


async def _edge_project_has_unit(db, drv, summary) -> int:
    cypher = """
    MATCH (u:Unit), (p:Project {id: u.project_id})
    WHERE u.project_id IS NOT NULL AND u.project_id <> ''
    MERGE (p)-[:HAS_UNIT]->(u)
    RETURN count(u) AS n
    """
    return await _count_run(drv, cypher, summary, "HAS_UNIT")


async def _edge_lead_interested_in(db, drv, summary) -> int:
    cypher = """
    MATCH (l:Lead), (p:Project {id: l.project_id})
    WHERE l.project_id IS NOT NULL AND l.project_id <> ''
    MERGE (l)-[r:INTERESTED_IN]->(p)
    SET r.last_seen = l.updated_at
    RETURN count(l) AS n
    """
    return await _count_run(drv, cypher, summary, "INTERESTED_IN")


async def _edge_behavioral_viewed(db, drv, summary) -> int:
    cypher = """
    MATCH (b:BehavioralSession), (p:Project {id: b.project_id})
    WHERE b.project_id IS NOT NULL AND b.project_id <> ''
    MERGE (b)-[r:VIEWED]->(p)
    SET r.last_seen = b.created_at
    RETURN count(b) AS n
    """
    return await _count_run(drv, cypher, summary, "VIEWED")


async def _edge_project_scored_by(db, drv, summary) -> int:
    cypher = """
    MATCH (s:IEScore), (p:Project {id: s.project_id})
    WHERE s.project_id IS NOT NULL AND s.project_id <> ''
    MERGE (p)-[:SCORED_BY]->(s)
    RETURN count(s) AS n
    """
    return await _count_run(drv, cypher, summary, "SCORED_BY")


async def _edge_comparable_to(db, drv, summary) -> int:
    """COMPARABLE_TO entre Project y Comparable basado en zone + precio similar (±15%)."""
    cypher = """
    MATCH (p:Project), (c:Comparable)
    WHERE p.zone_slug = c.zone_slug
      AND p.precio_min IS NOT NULL
      AND c.price IS NOT NULL
      AND c.price >= p.precio_min * 0.85
      AND c.price <= coalesce(p.precio_max, p.precio_min) * 1.15
    MERGE (p)-[:COMPARABLE_TO]->(c)
    RETURN count(*) AS n
    """
    return await _count_run(drv, cypher, summary, "COMPARABLE_TO")


async def _edge_devorg_duplicate_of(db, drv, summary) -> int:
    """DUPLICATE_OF DevOrg→DevOrg desde entity_resolution merges (W5.11)."""
    total = 0
    try:
        cursor = db.merged_entities_archive.find(
            {"entity_type": "broker_orgs"}, {"_id": 0, "original_canonical_payload": 1, "original_candidate_payload": 1},
        ).limit(2000)
        batch: List[Dict[str, str]] = []
        async for arch in cursor:
            can = (arch.get("original_canonical_payload") or {})
            cand = (arch.get("original_candidate_payload") or {})
            a = can.get("id") or can.get("tenant_id")
            b = cand.get("id") or cand.get("tenant_id")
            if a and b:
                batch.append({"a": a, "b": b})
            if len(batch) >= BATCH_SIZE:
                total += await _flush_dup(drv, batch)
                batch = []
        if batch:
            total += await _flush_dup(drv, batch)
    except Exception as exc:
        summary["errors"].append(f"DUPLICATE_OF: {exc}")
    return total


async def _flush_dup(drv, batch) -> int:
    cypher = """
    UNWIND $rows AS row
    MERGE (a:DevOrg {id: row.a})
    MERGE (b:DevOrg {id: row.b})
    MERGE (a)-[:DUPLICATE_OF]->(b)
    """
    try:
        await drv.run(cypher, {"rows": batch}, retries=2)
        return len(batch)
    except Exception:
        return 0


async def _count_run(drv, cypher: str, summary, label: str) -> int:
    try:
        rows = await drv.run(cypher, {}, retries=2)
        if rows:
            return int(rows[0].get("n") or 0)
        return 0
    except Exception as exc:
        summary["errors"].append(f"{label}: {exc}")
        return 0
