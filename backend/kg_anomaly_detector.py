"""W5.12 Parte 2 — KG Anomaly Detector (5 queries nightly).

Detecta patrones sospechosos en el grafo y los persiste en `kg_anomalies`
(TTL 30d). Notifica a superadmin via notifications_engine.kg_alert cuando
severity=='high'.

Queries pre-built (NO Cypher libre):
  1. fraud_rings:        3+ asesores que comparten 5+ leads cross-asesor
  2. devs_ghost:         DevOrg con 10+ Project sin Comparable trx 90d
  3. leads_zombies:      Lead status contactado|calificado sin behavioral 60d
  4. asesores_fantasma:  asesor_id sin last_login 30d en users collection
  5. zone_collapse:      Zone con drop >70% VIEWED edges vs trimestre prev
"""
from __future__ import annotations

import logging
import secrets as _secrets
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.kg.anomaly")


SEVERITY = {"high": 3, "medium": 2, "low": 1}
ANOMALY_TYPES = ["fraud_rings", "devs_ghost", "leads_zombies", "asesores_fantasma", "zone_collapse"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aid() -> str:
    return f"anom_{_secrets.token_urlsafe(10)}"


# ─── Main entry point ────────────────────────────────────────────────────────

async def run_anomaly_detection(db) -> Dict[str, Any]:
    from knowledge_graph_engine import KG_AVAILABLE, KGDriver
    started = time.perf_counter()
    summary: Dict[str, Any] = {
        "detected": 0,
        "by_type": {t: 0 for t in ANOMALY_TYPES},
        "by_severity": {"high": 0, "medium": 0, "low": 0},
        "duration_s": 0,
        "skipped": False,
        "errors": [],
    }

    if not KG_AVAILABLE:
        summary["skipped"] = True
        summary["errors"].append("KG_AVAILABLE=False · anomaly detection no ejecutada")
        log.warning("[KG anomaly] skipped · KG_AVAILABLE=False")
        return summary

    drv = await KGDriver.get()
    now_iso = _now().isoformat()
    anomalies: List[Dict[str, Any]] = []

    for fn, anomaly_type in [
        (_q_fraud_rings, "fraud_rings"),
        (_q_devs_ghost, "devs_ghost"),
        (_q_leads_zombies, "leads_zombies"),
        (_q_asesores_fantasma, "asesores_fantasma"),
        (_q_zone_collapse, "zone_collapse"),
    ]:
        try:
            rows = await fn(drv, db)
            for r in rows:
                doc = {
                    "id": _aid(),
                    "type": anomaly_type,
                    "severity": r.get("severity", "medium"),
                    "entity_id": r.get("entity_id", ""),
                    "entity_type": r.get("entity_type", ""),
                    "details": r.get("details", {}),
                    "detected_at": now_iso,
                }
                anomalies.append(doc)
                summary["by_type"][anomaly_type] += 1
                summary["by_severity"][doc["severity"]] = summary["by_severity"].get(doc["severity"], 0) + 1
        except Exception as exc:
            summary["errors"].append(f"{anomaly_type}: {str(exc)[:200]}")
            log.warning(f"[KG anomaly] {anomaly_type} failed: {exc}")

    summary["detected"] = len(anomalies)
    summary["duration_s"] = round(time.perf_counter() - started, 2)

    # Persist
    if anomalies:
        try:
            await db.kg_anomalies.insert_many(anomalies)
        except Exception as exc:
            summary["errors"].append(f"persist: {str(exc)[:200]}")
            log.warning(f"[KG anomaly] persist failed: {exc}")

    # Notify superadmins on high severity
    high_count = summary["by_severity"].get("high", 0)
    if high_count > 0:
        try:
            from notifications_engine import emit_notification
            cursor = db.users.find({"role": "superadmin"}, {"_id": 0, "user_id": 1, "tenant_id": 1})
            async for u in cursor:
                uid = u.get("user_id")
                if not uid:
                    continue
                await emit_notification(
                    db,
                    user_id=uid,
                    tenant_id=u.get("tenant_id") or "default",
                    type="kg_alert",
                    severity="high",
                    title=f"{high_count} anomalia(s) critica(s) detectadas en el Knowledge Graph",
                    body=f"Tipos: {', '.join(t for t, n in summary['by_type'].items() if n > 0)}. Revisa el panel /superadmin/knowledge-graph.",
                    payload=summary,
                    action_url="/superadmin/knowledge-graph",
                )
        except Exception as exc:
            log.warning(f"[KG anomaly] notify failed: {exc}")

    # Audit log
    try:
        from audit_immutable_engine import log as audit_log
        audit_id = await audit_log(
            db,
            actor={"user_id": "kg_anomaly_cron", "role": "system"},
            action="kg_anomaly_detected",
            entity_type="kg",
            entity_id="anomaly_detection",
            before=None,
            after=summary,
        )
        log.info(f"[KG anomaly] {summary['detected']} anomalias detectadas · audit_log_id={audit_id}")
    except Exception as exc:
        log.warning(f"[KG anomaly] audit log failed: {exc}")

    return summary


# ─── Queries pre-built ───────────────────────────────────────────────────────

async def _q_fraud_rings(drv, db) -> List[Dict[str, Any]]:
    """3+ asesores que comparten 5+ leads cross-asesor."""
    cypher = """
    MATCH (l1:Lead), (l2:Lead)
    WHERE l1.client_global_id = l2.client_global_id
      AND l1.client_global_id IS NOT NULL
      AND l1.assigned_to IS NOT NULL
      AND l2.assigned_to IS NOT NULL
      AND l1.assigned_to < l2.assigned_to
    WITH l1.assigned_to AS asesor_a, l2.assigned_to AS asesor_b,
         collect(DISTINCT l1.client_global_id) AS shared
    WHERE size(shared) >= 5
    RETURN asesor_a, asesor_b, size(shared) AS shared_count, shared[..10] AS sample_clients
    LIMIT 100
    """
    rows = await drv.run(cypher, {}, retries=1)
    out: List[Dict[str, Any]] = []
    # Agrupar por asesor para detectar rings (3+ asesores conectados via shared clients)
    pairs: Dict[str, set] = {}
    for r in rows:
        a, b = r.get("asesor_a"), r.get("asesor_b")
        pairs.setdefault(a, set()).add(b)
        pairs.setdefault(b, set()).add(a)
    rings_seen: set = set()
    for asesor, peers in pairs.items():
        if len(peers) >= 2:  # asesor connectado a 2+ otros = ring 3+
            ring_key = tuple(sorted([asesor, *peers]))
            if ring_key not in rings_seen:
                rings_seen.add(ring_key)
                out.append({
                    "entity_id": asesor,
                    "entity_type": "asesor_ring",
                    "severity": "high",
                    "details": {
                        "members": list(ring_key),
                        "size": len(ring_key),
                        "sample_pairs": rows[:5],
                    },
                })
    return out[:50]


async def _q_devs_ghost(drv, db) -> List[Dict[str, Any]]:
    """DevOrg con 10+ Project sin Comparable trx 90d."""
    cypher = """
    MATCH (d:DevOrg)<-[:OWNED_BY]-(p:Project)
    OPTIONAL MATCH (p)-[:COMPARABLE_TO]->(c:Comparable)
    WITH d, p, max(c.closed_at) AS last_closed
    WITH d, count(p) AS projects_count,
         sum(CASE WHEN last_closed IS NULL OR last_closed < $cutoff THEN 1 ELSE 0 END) AS ghost_projects
    WHERE projects_count >= 10 AND ghost_projects >= 10
    RETURN d.id AS dev_org_id, d.name AS dev_name,
           projects_count, ghost_projects
    ORDER BY ghost_projects DESC
    LIMIT 50
    """
    cutoff = (_now() - timedelta(days=90)).isoformat()
    rows = await drv.run(cypher, {"cutoff": cutoff}, retries=1)
    return [
        {
            "entity_id": r.get("dev_org_id"),
            "entity_type": "dev_org",
            "severity": "medium",
            "details": {
                "dev_name": r.get("dev_name"),
                "projects_count": r.get("projects_count"),
                "ghost_projects": r.get("ghost_projects"),
            },
        }
        for r in rows
    ]


async def _q_leads_zombies(drv, db) -> List[Dict[str, Any]]:
    """Lead status contactado|calificado sin BehavioralSession 60d."""
    cypher = """
    MATCH (l:Lead)
    WHERE l.status IN ['contactado', 'calificado']
      AND l.updated_at < $cutoff
    OPTIONAL MATCH (b:BehavioralSession)
      WHERE b.user_id = l.client_global_id AND b.created_at >= $cutoff
    WITH l, count(b) AS recent_sessions
    WHERE recent_sessions = 0
    RETURN l.id AS lead_id, l.status AS status,
           l.assigned_to AS asesor_id, l.updated_at AS last_update
    ORDER BY l.updated_at ASC
    LIMIT 200
    """
    cutoff = (_now() - timedelta(days=60)).isoformat()
    rows = await drv.run(cypher, {"cutoff": cutoff}, retries=1)
    return [
        {
            "entity_id": r.get("lead_id"),
            "entity_type": "lead",
            "severity": "low",
            "details": {
                "status": r.get("status"),
                "asesor_id": r.get("asesor_id"),
                "last_update": r.get("last_update"),
            },
        }
        for r in rows
    ]


async def _q_asesores_fantasma(drv, db) -> List[Dict[str, Any]]:
    """Asesor_id en leads sin last_login 30d (cross-check users collection)."""
    cypher = """
    MATCH (l:Lead)
    WHERE l.assigned_to IS NOT NULL AND l.updated_at >= $cutoff
    RETURN DISTINCT l.assigned_to AS asesor_id, count(l) AS recent_leads
    """
    cutoff = (_now() - timedelta(days=30)).isoformat()
    rows = await drv.run(cypher, {"cutoff": cutoff}, retries=1)
    out: List[Dict[str, Any]] = []
    for r in rows:
        asesor_id = r.get("asesor_id")
        if not asesor_id:
            continue
        try:
            user = await db.users.find_one(
                {"$or": [{"user_id": asesor_id}, {"id": asesor_id}]},
                {"_id": 0, "last_login_at": 1, "email": 1, "first_name": 1},
            ) or {}
            last_login = user.get("last_login_at")
            if not last_login or last_login < cutoff:
                out.append({
                    "entity_id": asesor_id,
                    "entity_type": "asesor",
                    "severity": "medium",
                    "details": {
                        "email": user.get("email"),
                        "first_name": user.get("first_name"),
                        "last_login": last_login,
                        "recent_leads": r.get("recent_leads"),
                    },
                })
        except Exception:
            continue
    return out[:100]


async def _q_zone_collapse(drv, db) -> List[Dict[str, Any]]:
    """Zone con drop >70% VIEWED edges vs trimestre anterior."""
    cypher = """
    MATCH (z:Zone)<-[:LOCATED_IN]-(p:Project)<-[v:VIEWED]-(b:BehavioralSession)
    WHERE v.last_seen >= $cur_start
    WITH z, count(v) AS views_current
    OPTIONAL MATCH (z)<-[:LOCATED_IN]-(p2:Project)<-[v2:VIEWED]-(b2:BehavioralSession)
    WHERE v2.last_seen >= $prev_start AND v2.last_seen < $cur_start
    WITH z, views_current, count(v2) AS views_prev
    WHERE views_prev >= 20 AND (toFloat(views_current) / views_prev) < 0.30
    RETURN z.slug AS zone_slug, z.name AS zone_name,
           views_current, views_prev,
           round((1.0 - (toFloat(views_current) / views_prev)) * 100, 1) AS drop_pct
    ORDER BY drop_pct DESC
    LIMIT 30
    """
    now = _now()
    cur_start = (now - timedelta(days=90)).isoformat()
    prev_start = (now - timedelta(days=180)).isoformat()
    rows = await drv.run(cypher, {"cur_start": cur_start, "prev_start": prev_start}, retries=1)
    return [
        {
            "entity_id": r.get("zone_slug"),
            "entity_type": "zone",
            "severity": "high" if (r.get("drop_pct") or 0) >= 80 else "medium",
            "details": {
                "zone_name": r.get("zone_name"),
                "views_current": r.get("views_current"),
                "views_prev": r.get("views_prev"),
                "drop_pct": r.get("drop_pct"),
            },
        }
        for r in rows
    ]


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_kg_anomaly_indexes(db) -> None:
    try:
        from pymongo import ASCENDING, DESCENDING
        await db.kg_anomalies.create_index([("detected_at", DESCENDING)], name="detected_at_idx")
        await db.kg_anomalies.create_index([("type", ASCENDING), ("severity", ASCENDING)], name="type_severity_idx")
        # TTL 30d
        await db.kg_anomalies.create_index("detected_at", expireAfterSeconds=30 * 86400, name="ttl_30d")
        await db.kg_anomalies.create_index("id", unique=True, sparse=True)
        log.info("[KG anomaly] indexes OK")
    except Exception as exc:
        log.warning(f"[KG anomaly] index creation warning: {exc}")
