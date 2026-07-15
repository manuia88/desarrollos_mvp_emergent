"""W5.12 Parte 1 — Knowledge Graph Engine (Neo4j wrapper + sync helpers).

Provee:
  - KGDriver singleton (AsyncGraphDatabase wrapper · retry exp backoff)
  - Constantes NODE_TYPES / EDGE_TYPES
  - ensure_kg_constraints(driver) — unicidad por nodo + indices compuestos
  - health_check() → {connected, version, last_ping_ms}
  - kg_sync.* helpers (idempotent MERGE) — no-op si KG_AVAILABLE=False
  - Audit log integration en cada operacion (audit_immutable_engine.log)

Convencion: NUNCA Cypher libre desde rutas — solo plantillas registradas en
kg_template_registry para `query` superadmin. Operaciones internas (sync,
rebuild) usan Cypher hardcodeado aqui mismo.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.kg")

# ─── Constantes ───────────────────────────────────────────────────────────────

NODE_TYPES: List[str] = [
    "Project", "Unit", "DevOrg", "Zone", "Comparable",
    "Lead", "BehavioralSession", "IEScore", "Molde",
]

EDGE_TYPES: List[str] = [
    "OWNED_BY", "LOCATED_IN", "HAS_UNIT", "INTERESTED_IN",
    "REPRESENTS", "VIEWED", "SCORED_BY", "COMPARABLE_TO",
    "IN_SAME_ZONE_AS", "DUPLICATE_OF", "HAS_MOLDE", "MOLDE_IN_ZONE",
]

# Global availability flag — set during startup via health_check()
KG_AVAILABLE: bool = False
KG_LAST_PING_MS: Optional[float] = None
KG_VERSION: Optional[str] = None
KG_LAST_ERROR: Optional[str] = None


# ─── KGDriver singleton ───────────────────────────────────────────────────────

class KGDriver:
    """Async Neo4j driver wrapper · retry 3x exp backoff · singleton."""

    _instance: Optional["KGDriver"] = None
    _lock = asyncio.Lock()

    def __init__(self) -> None:
        self._driver = None
        self._uri = os.environ.get("NEO4J_URI", "bolt://neo4j:7687")
        self._user = os.environ.get("NEO4J_USER", "neo4j")
        self._password = os.environ.get("NEO4J_PASSWORD", "changeme_in_prod")

    @classmethod
    async def get(cls) -> "KGDriver":
        async with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
                await cls._instance._connect()
            return cls._instance

    async def _connect(self) -> None:
        try:
            from neo4j import AsyncGraphDatabase
            self._driver = AsyncGraphDatabase.driver(
                self._uri,
                auth=(self._user, self._password),
                max_connection_lifetime=3600,
                connection_timeout=5.0,
            )
        except Exception as exc:
            log.warning(f"[KG] driver init failed: {exc}")
            self._driver = None

    def session(self):
        """Async session context manager. Caller must `async with`."""
        if self._driver is None:
            raise RuntimeError("KG driver not initialized")
        return self._driver.session()

    async def run(self, cypher: str, params: Optional[Dict[str, Any]] = None, retries: int = 3) -> List[Dict[str, Any]]:
        """Ejecuta Cypher con retry exponencial (3x · 0.2s, 0.4s, 0.8s)."""
        if self._driver is None:
            raise RuntimeError("KG driver not initialized")
        last_exc: Optional[Exception] = None
        for attempt in range(retries):
            try:
                async with self._driver.session() as sess:
                    result = await sess.run(cypher, params or {})
                    rows = []
                    async for rec in result:
                        rows.append(dict(rec))
                    return rows
            except Exception as exc:
                last_exc = exc
                if attempt < retries - 1:
                    await asyncio.sleep(0.2 * (2 ** attempt))
                else:
                    log.warning(f"[KG] cypher failed after {retries} retries: {exc}")
        raise last_exc or RuntimeError("KG run failed")

    async def close(self) -> None:
        if self._driver is not None:
            try:
                await self._driver.close()
            except Exception:
                pass
            self._driver = None


# ─── Health check ─────────────────────────────────────────────────────────────

async def health_check() -> Dict[str, Any]:
    """Ping Neo4j · actualiza KG_AVAILABLE global.

    Retorna dict con `connected`, `version`, `last_ping_ms`, `error`.
    """
    global KG_AVAILABLE, KG_LAST_PING_MS, KG_VERSION, KG_LAST_ERROR

    started = time.perf_counter()
    try:
        drv = await KGDriver.get()
        if drv._driver is None:
            raise RuntimeError("driver no inicializado")
        rows = await drv.run(
            "CALL dbms.components() YIELD name, versions RETURN name, versions LIMIT 1",
            retries=1,
        )
        elapsed = (time.perf_counter() - started) * 1000
        version = "unknown"
        if rows:
            row = rows[0]
            versions = row.get("versions") or []
            if versions:
                version = versions[0] if isinstance(versions, list) else str(versions)
        KG_AVAILABLE = True
        KG_LAST_PING_MS = elapsed
        KG_VERSION = version
        KG_LAST_ERROR = None
        return {
            "connected": True,
            "version": version,
            "last_ping_ms": round(elapsed, 2),
            "uri": _sanitize_uri(drv._uri),
        }
    except Exception as exc:
        elapsed = (time.perf_counter() - started) * 1000
        KG_AVAILABLE = False
        KG_LAST_PING_MS = elapsed
        KG_LAST_ERROR = str(exc)[:240]
        return {
            "connected": False,
            "version": None,
            "last_ping_ms": round(elapsed, 2),
            "error": KG_LAST_ERROR,
        }


def _sanitize_uri(uri: str) -> str:
    """Esconde credenciales si vienen embedidas en uri (no es nuestro caso pero por safety)."""
    if "@" in uri:
        scheme, _, rest = uri.partition("://")
        _, _, host = rest.rpartition("@")
        return f"{scheme}://{host}"
    return uri


# ─── Constraints + indexes ────────────────────────────────────────────────────

CONSTRAINT_CYPHERS: List[str] = [
    # Unicidad por id en cada NODE_TYPE
    "CREATE CONSTRAINT project_id_unique IF NOT EXISTS FOR (n:Project) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT unit_id_unique IF NOT EXISTS FOR (n:Unit) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT devorg_id_unique IF NOT EXISTS FOR (n:DevOrg) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT zone_slug_unique IF NOT EXISTS FOR (n:Zone) REQUIRE n.slug IS UNIQUE",
    "CREATE CONSTRAINT comparable_id_unique IF NOT EXISTS FOR (n:Comparable) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT lead_id_unique IF NOT EXISTS FOR (n:Lead) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT behavioral_id_unique IF NOT EXISTS FOR (n:BehavioralSession) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT iescore_id_unique IF NOT EXISTS FOR (n:IEScore) REQUIRE n.id IS UNIQUE",
    # Indices compuestos
    "CREATE INDEX project_dev_org_idx IF NOT EXISTS FOR (n:Project) ON (n.dev_org_id)",
    "CREATE INDEX lead_client_global_idx IF NOT EXISTS FOR (n:Lead) ON (n.client_global_id)",
    "CREATE INDEX behavioral_user_intent_idx IF NOT EXISTS FOR (n:BehavioralSession) ON (n.user_id, n.intent)",
    "CREATE INDEX zone_slug_idx IF NOT EXISTS FOR (n:Zone) ON (n.slug)",
]


async def ensure_kg_constraints() -> Dict[str, Any]:
    """Crea constraints + indices idempotentes. Solo si KG_AVAILABLE."""
    if not KG_AVAILABLE:
        return {"ok": False, "reason": "kg_unavailable"}
    drv = await KGDriver.get()
    created = 0
    errors: List[str] = []
    for cy in CONSTRAINT_CYPHERS:
        try:
            await drv.run(cy, retries=1)
            created += 1
        except Exception as exc:
            errors.append(f"{cy[:60]}: {exc}")
    log.info(f"[KG] constraints applied · {created}/{len(CONSTRAINT_CYPHERS)} OK · errors={len(errors)}")
    return {"ok": True, "applied": created, "total": len(CONSTRAINT_CYPHERS), "errors": errors[:5]}


# ─── kg_sync helpers (idempotent) ─────────────────────────────────────────────

class _KGSync:
    """Namespace para sync incremental. Cada metodo es no-op si KG_AVAILABLE=False."""

    async def upsert_lead_node(self, db, lead_doc: Dict[str, Any]) -> Optional[str]:
        """MERGE Lead + edge INTERESTED_IN Project. Idempotente."""
        if not KG_AVAILABLE:
            log.debug("[KG sync] upsert_lead_node skipped · KG_AVAILABLE=False")
            return None
        lead_id = lead_doc.get("id") or lead_doc.get("lead_id")
        if not lead_id:
            return None
        project_id = lead_doc.get("project_id") or lead_doc.get("project")
        cypher = """
        MERGE (l:Lead {id: $lead_id})
        SET l.client_global_id = $client_gid,
            l.status = $status,
            l.assigned_to = $assigned_to,
            l.dev_org_id = $dev_org_id,
            l.created_at = $created_at,
            l.updated_at = $updated_at
        WITH l, $project_id AS pid
        WHERE pid IS NOT NULL AND pid <> ''
        MERGE (p:Project {id: pid})
        MERGE (l)-[r:INTERESTED_IN]->(p)
        SET r.last_seen = $updated_at
        RETURN l.id AS lead_id
        """
        params = {
            "lead_id": lead_id,
            "client_gid": lead_doc.get("client_global_id"),
            "status": lead_doc.get("status"),
            "assigned_to": lead_doc.get("assigned_to") or lead_doc.get("created_by"),
            "dev_org_id": lead_doc.get("dev_org_id"),
            "created_at": lead_doc.get("created_at"),
            "updated_at": lead_doc.get("updated_at") or lead_doc.get("created_at"),
            "project_id": project_id,
        }
        try:
            drv = await KGDriver.get()
            await drv.run(cypher, params, retries=2)
            await _audit(db, action="kg_lead_upsert", entity_id=lead_id, payload={"project_id": project_id})
            log.info(f"[KG sync] lead_node upserted · id={lead_id} project={project_id}")
            return lead_id
        except Exception as exc:
            log.warning(f"[KG sync] upsert_lead_node failed · id={lead_id}: {exc}")
            return None

    async def upsert_project_node(self, db, project_doc: Dict[str, Any]) -> Optional[str]:
        if not KG_AVAILABLE:
            return None
        pid = project_doc.get("id") or project_doc.get("project_id")
        if not pid:
            return None
        cypher = """
        MERGE (p:Project {id: $id})
        SET p.name = $name,
            p.dev_org_id = $dev_org_id,
            p.zone_slug = $zone_slug,
            p.precio_min = $precio_min,
            p.precio_max = $precio_max,
            p.updated_at = $updated_at
        WITH p, $dev_org_id AS dorg
        WHERE dorg IS NOT NULL AND dorg <> ''
        MERGE (d:DevOrg {id: dorg})
        MERGE (p)-[:OWNED_BY]->(d)
        RETURN p.id AS id
        """
        params = {
            "id": pid,
            "name": project_doc.get("name") or project_doc.get("nombre"),
            "dev_org_id": project_doc.get("dev_org_id") or project_doc.get("developer_id"),
            "zone_slug": project_doc.get("zone_slug") or project_doc.get("colonia_slug"),
            "precio_min": project_doc.get("precio_min") or project_doc.get("price_min"),
            "precio_max": project_doc.get("precio_max") or project_doc.get("price_max"),
            "updated_at": project_doc.get("updated_at"),
        }
        try:
            drv = await KGDriver.get()
            await drv.run(cypher, params, retries=2)
            await _audit(db, action="kg_project_upsert", entity_id=pid, payload={"dev_org_id": params["dev_org_id"]})
            return pid
        except Exception as exc:
            log.warning(f"[KG sync] upsert_project_node failed · id={pid}: {exc}")
            return None

    async def upsert_transaction_node(self, db, tx_doc: Dict[str, Any]) -> Optional[str]:
        if not KG_AVAILABLE:
            return None
        tid = tx_doc.get("id") or tx_doc.get("transaction_id")
        if not tid:
            return None
        cypher = """
        MERGE (c:Comparable {id: $id})
        SET c.zone_slug = $zone_slug,
            c.price = $price,
            c.tipo = $tipo,
            c.closed_at = $closed_at
        RETURN c.id AS id
        """
        params = {
            "id": tid,
            "zone_slug": tx_doc.get("zone_slug") or tx_doc.get("colonia_slug"),
            "price": tx_doc.get("price") or tx_doc.get("precio"),
            "tipo": tx_doc.get("tipo") or tx_doc.get("type"),
            "closed_at": tx_doc.get("closed_at") or tx_doc.get("created_at"),
        }
        try:
            drv = await KGDriver.get()
            await drv.run(cypher, params, retries=2)
            return tid
        except Exception as exc:
            log.warning(f"[KG sync] upsert_transaction_node failed · id={tid}: {exc}")
            return None

    async def upsert_behavioral_node(self, db, ev_doc: Dict[str, Any]) -> Optional[str]:
        if not KG_AVAILABLE:
            return None
        eid = ev_doc.get("id") or ev_doc.get("event_id") or ev_doc.get("session_id")
        if not eid:
            return None
        cypher = """
        MERGE (b:BehavioralSession {id: $id})
        SET b.user_id = $user_id,
            b.intent = $intent,
            b.event_type = $event_type,
            b.created_at = $created_at
        WITH b, $project_id AS pid
        WHERE pid IS NOT NULL AND pid <> ''
        MERGE (p:Project {id: pid})
        MERGE (b)-[v:VIEWED]->(p)
        SET v.last_seen = $created_at
        RETURN b.id AS id
        """
        params = {
            "id": eid,
            "user_id": ev_doc.get("user_id"),
            "intent": ev_doc.get("intent") or ev_doc.get("event_intent"),
            "event_type": ev_doc.get("event_type") or ev_doc.get("type"),
            "created_at": ev_doc.get("created_at") or ev_doc.get("timestamp"),
            "project_id": ev_doc.get("project_id"),
        }
        try:
            drv = await KGDriver.get()
            await drv.run(cypher, params, retries=2)
            return eid
        except Exception as exc:
            log.warning(f"[KG sync] upsert_behavioral_node failed · id={eid}: {exc}")
            return None

    async def set_lead_status(self, db, lead_id: str, status: str, actor_user_id: Optional[str] = None) -> bool:
        """Actualiza Lead.status. Idempotente. Audit log."""
        if not KG_AVAILABLE:
            log.debug("[KG sync] set_lead_status skipped · KG_AVAILABLE=False")
            return False
        cypher = """
        MERGE (l:Lead {id: $id})
        SET l.status = $status, l.updated_at = datetime()
        RETURN l.id AS id
        """
        try:
            drv = await KGDriver.get()
            rows = await drv.run(cypher, {"id": lead_id, "status": status}, retries=2)
            await _audit(
                db, action="kg_lead_status_set", entity_id=lead_id,
                payload={"status": status},
                actor_user_id=actor_user_id,
            )
            log.info(f"[KG sync] lead_status set · id={lead_id} status={status}")
            return bool(rows)
        except Exception as exc:
            log.warning(f"[KG sync] set_lead_status failed · id={lead_id}: {exc}")
            return False


# Singleton expuesto
    async def upsert_molde_node(self, db, molde_doc: Dict[str, Any],
                                zone_slug: Optional[str] = None) -> Optional[str]:
        """MERGE Molde + edges (Project)-[:HAS_MOLDE]->(Molde)-[:MOLDE_IN_ZONE]->(Zone).
        El Catálogo de Moldes (07-15) entra al grafo: dev↔proyecto↔molde↔zona navegable.
        Idempotente · no-op sin Neo4j (mismo contrato que el resto del sync)."""
        if not KG_AVAILABLE:
            log.debug("[KG sync] upsert_molde_node skipped · KG_AVAILABLE=False")
            return None
        pid = molde_doc.get("prototype_id")
        if not pid:
            return None
        cypher = """
        MERGE (m:Molde {id: $id})
        SET m.nombre = $nombre,
            m.huella = $huella,
            m.estado = $estado,
            m.recamaras = $recamaras,
            m.banos = $banos,
            m.m2 = $m2,
            m.unidades_total = $unidades_total,
            m.nacio_at = $nacio_at,
            m.agoto_at = $agoto_at
        WITH m, $project_id AS pid
        WHERE pid IS NOT NULL AND pid <> ''
        MERGE (p:Project {id: pid})
        MERGE (p)-[:HAS_MOLDE]->(m)
        WITH m, $zone_slug AS zs
        WHERE zs IS NOT NULL AND zs <> ''
        MERGE (z:Zone {slug: zs})
        MERGE (m)-[:MOLDE_IN_ZONE]->(z)
        RETURN m.id AS molde_id
        """
        params = {
            "id": pid, "nombre": molde_doc.get("nombre"),
            "huella": molde_doc.get("huella"), "estado": molde_doc.get("estado"),
            "recamaras": molde_doc.get("recamaras"), "banos": molde_doc.get("banos"),
            "m2": molde_doc.get("m2_construido"),
            "unidades_total": molde_doc.get("unidades_total"),
            "nacio_at": molde_doc.get("nacio_at"), "agoto_at": molde_doc.get("agoto_at"),
            "project_id": molde_doc.get("development_id"), "zone_slug": zone_slug,
        }
        try:
            drv = await KGDriver.get()
            await drv.run(cypher, params, retries=2)
            await _audit(db, action="kg_molde_upsert", entity_id=pid,
                         payload={"project_id": molde_doc.get("development_id")})
            return pid
        except Exception as exc:
            log.warning(f"[KG sync] upsert_molde_node failed · id={pid}: {exc}")
            return None

    async def sync_moldes(self, db) -> int:
        """Barrido idempotente del Catálogo de Moldes completo al grafo (post-conciliación)."""
        if not KG_AVAILABLE:
            return 0
        n = 0
        zonas = {d["id"]: d.get("colonia_id") for d in await db.developments.find(
            {}, {"_id": 0, "id": 1, "colonia_id": 1}).to_list(500)}
        async for m in db.dmx_prototypes.find({}, {"_id": 0}):
            if await self.upsert_molde_node(db, m, zonas.get(m.get("development_id"))):
                n += 1
        return n


kg_sync = _KGSync()


# ─── Audit helper (delgado wrapper a audit_immutable_engine) ──────────────────

async def _audit(db, *, action: str, entity_id: str, payload: Dict[str, Any], actor_user_id: Optional[str] = None) -> Optional[str]:
    """Loguea operacion KG en audit_immutable chain. No-op si falla (best-effort)."""
    try:
        from audit_immutable_engine import log as audit_log
        actor = {"user_id": actor_user_id or "kg_system", "role": "system"}
        return await audit_log(
            db, actor=actor, action=action,
            entity_type="kg", entity_id=entity_id,
            before=None, after=payload,
        )
    except Exception as exc:
        log.warning(f"[KG audit] audit log failed action={action}: {exc}")
        return None
