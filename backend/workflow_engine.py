"""W6.AS.1 · Workflow Builder Visual · execution engine.

Visual workflow DAG executor: triggers → actions → conditions → delays.
Persistence in `workflows` + `workflow_runs` collections.

Aurora design: idempotent per execution_id · NO double-fire · 3x retry
con exponential backoff via workflow_queue.

Triggers (4):
  - lead.new                   → cuando se inserta lead nuevo
  - lead.stage_changed         → cuando status_v2 transita
  - lead.no_response_X_hours   → cuando lead sin actividad por N horas
  - lead.custom_event          → evento custom (birthday · anniversary)

Actions (5):
  - send_whatsapp  → whatsapp_engine WAEngine
  - send_email     → notifications_engine (fallback log)
  - create_task    → db.tasks insert
  - move_stage     → CRM pipeline_engine set_state
  - call_webhook   → httpx POST con HMAC-SHA256

Conditions (IF/ELSE) con operadores: eq · neq · gt · lt · in · contains
sobre lead fields: zone · price · score · disc · tags · stage · custom.

Delay nodes: wait X minutes/hours/days antes de siguiente node.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.workflow_engine")

# ─── Schemas ──────────────────────────────────────────────────────────────────

TRIGGER_TYPES = ("lead.new", "lead.stage_changed", "lead.no_response_X_hours", "lead.custom_event")
ACTION_TYPES = ("send_whatsapp", "send_email", "create_task", "move_stage", "call_webhook")
CONDITION_OPS = ("eq", "neq", "gt", "lt", "in", "contains")
NODE_TYPES = ("trigger", "action", "condition", "delay")

MAX_NODES_PER_WORKFLOW = 50
MAX_WORKFLOWS_PER_USER = 20
MAX_DEPTH = 30  # evitar ciclos infinitos
RETRY_ATTEMPTS = 3
WEBHOOK_TIMEOUT_S = 10


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _wf_id() -> str:
    return f"wf_{uuid.uuid4().hex[:14]}"


def _run_id() -> str:
    return f"wfrun_{uuid.uuid4().hex[:14]}"


def _exec_id() -> str:
    """Idempotency key per ejecución concreta."""
    return f"wfexec_{secrets.token_urlsafe(12)}"


# ─── Workflow validation ──────────────────────────────────────────────────────

def validate_workflow(doc: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """Valida nodes/edges. Retorna (ok, error)."""
    nodes = doc.get("nodes") or []
    edges = doc.get("edges") or []
    if not nodes:
        return False, "workflow vacío · agregar al menos 1 trigger + 1 action"
    if len(nodes) > MAX_NODES_PER_WORKFLOW:
        return False, f"máximo {MAX_NODES_PER_WORKFLOW} nodes"

    ids_seen = set()
    triggers = 0
    actions = 0
    for n in nodes:
        nid = n.get("id")
        ntype = n.get("type")
        if not nid or not ntype:
            return False, "node sin id/type"
        if nid in ids_seen:
            return False, f"node id duplicado: {nid}"
        ids_seen.add(nid)
        if ntype not in NODE_TYPES:
            return False, f"node type inválido: {ntype}"
        if ntype == "trigger":
            triggers += 1
            tcfg = (n.get("config") or {}).get("trigger_type")
            if tcfg not in TRIGGER_TYPES:
                return False, f"trigger_type inválido: {tcfg}"
        if ntype == "action":
            actions += 1
            acfg = (n.get("config") or {}).get("action_type")
            if acfg not in ACTION_TYPES:
                return False, f"action_type inválido: {acfg}"
        if ntype == "condition":
            cfg = n.get("config") or {}
            if cfg.get("op") not in CONDITION_OPS:
                return False, f"condition op inválido: {cfg.get('op')}"

    if triggers != 1:
        return False, "workflow requiere exactamente 1 trigger"
    if actions < 1:
        return False, "workflow requiere al menos 1 action"

    # Validar edges referencian nodes existentes
    for e in edges:
        s = e.get("source")
        t = e.get("target")
        if s not in ids_seen or t not in ids_seen:
            return False, f"edge referencia node inexistente: {s}→{t}"
    return True, None


def _build_adjacency(edges: List[Dict[str, Any]]) -> Dict[str, List[Tuple[str, Optional[str]]]]:
    """Mapa source → [(target, branch)] donde branch es 'true'/'false' para conditions."""
    adj: Dict[str, List[Tuple[str, Optional[str]]]] = {}
    for e in edges:
        s = e.get("source")
        t = e.get("target")
        branch = e.get("branch")  # 'true' | 'false' | None
        if not s or not t:
            continue
        adj.setdefault(s, []).append((t, branch))
    return adj


def _find_trigger_node(nodes: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    for n in nodes:
        if n.get("type") == "trigger":
            return n
    return None


def _node_by_id(nodes: List[Dict[str, Any]], nid: str) -> Optional[Dict[str, Any]]:
    for n in nodes:
        if n.get("id") == nid:
            return n
    return None


# ─── Trigger evaluation ───────────────────────────────────────────────────────

def evaluate_trigger(workflow: Dict[str, Any], event: Dict[str, Any]) -> bool:
    """True si event matchea trigger config del workflow.

    event = {"type": "lead.new" | ..., "lead_id": str, "data": {...}}
    """
    if workflow.get("status") != "active":
        return False
    trigger_node = _find_trigger_node(workflow.get("nodes") or [])
    if not trigger_node:
        return False
    cfg = trigger_node.get("config") or {}
    expected_type = cfg.get("trigger_type")
    if expected_type != event.get("type"):
        return False

    # Filtros adicionales por tipo
    if expected_type == "lead.stage_changed":
        target_stage = cfg.get("stage")
        if target_stage and event.get("data", {}).get("to_stage") != target_stage:
            return False
    if expected_type == "lead.no_response_X_hours":
        hours = int(cfg.get("hours") or 24)
        actual = int(event.get("data", {}).get("hours_no_response") or 0)
        if actual < hours:
            return False
    if expected_type == "lead.custom_event":
        event_name = cfg.get("event_name")
        if event_name and event.get("data", {}).get("event_name") != event_name:
            return False
    return True


# ─── Condition evaluation ────────────────────────────────────────────────────

def _evaluate_condition(condition_config: Dict[str, Any], lead_context: Dict[str, Any]) -> bool:
    """Aplica operador sobre field del lead."""
    field = condition_config.get("field", "")
    op = condition_config.get("op", "eq")
    expected = condition_config.get("value")

    # Soporta paths simples (zone · price · score) y custom.X
    actual: Any = lead_context
    for part in field.split("."):
        if isinstance(actual, dict):
            actual = actual.get(part)
        else:
            actual = None
            break

    try:
        if op == "eq":
            return actual == expected
        if op == "neq":
            return actual != expected
        if op == "gt":
            return actual is not None and float(actual) > float(expected)
        if op == "lt":
            return actual is not None and float(actual) < float(expected)
        if op == "in":
            if isinstance(expected, list):
                return actual in expected
            return False
        if op == "contains":
            if isinstance(actual, str) and isinstance(expected, str):
                return expected.lower() in actual.lower()
            if isinstance(actual, list):
                return expected in actual
            return False
    except Exception as exc:
        log.warning(f"[workflow_engine] condition eval error: {exc}")
        return False
    return False


# ─── Action executors ────────────────────────────────────────────────────────

async def _action_send_whatsapp(db, params: Dict[str, Any], lead_context: Dict[str, Any]) -> Dict[str, Any]:
    try:
        from whatsapp_engine import WAEngine
        org_id = lead_context.get("tenant_id") or lead_context.get("dev_org_id") or "dmx"
        engine = WAEngine(db, org_id=org_id)
        to = params.get("to") or (lead_context.get("contact") or {}).get("whatsapp")
        body = _render_template(params.get("body", ""), lead_context)
        if not to:
            return {"ok": False, "error": "no_whatsapp_number"}
        result = await engine.send_message(
            to_number=to, body=body, lead_id=lead_context.get("id"),
            template_name=params.get("template"),
        )
        return {"ok": bool(result.get("ok", True)), "result": result}
    except Exception as exc:
        log.warning(f"[workflow_engine] send_whatsapp error: {exc}")
        return {"ok": False, "error": str(exc)}


async def _action_send_email(db, params: Dict[str, Any], lead_context: Dict[str, Any]) -> Dict[str, Any]:
    try:
        to = params.get("to") or (lead_context.get("contact") or {}).get("email")
        subject = _render_template(params.get("subject", ""), lead_context)
        body = _render_template(params.get("body", ""), lead_context)
        if not to:
            return {"ok": False, "error": "no_email"}
        # Intento: notifications_engine real; fallback log
        try:
            from notifications_engine import send_email_notification  # type: ignore
            r = await send_email_notification(db, to=to, subject=subject, body=body)
            return {"ok": True, "result": r}
        except Exception:
            log.info(f"[workflow_engine] email-stub to={to} subject={subject[:60]}")
            await db.workflow_email_outbox.insert_one({
                "_id": f"em_{secrets.token_urlsafe(8)}",
                "to": to, "subject": subject, "body": body,
                "lead_id": lead_context.get("id"),
                "created_at": _now(),
            })
            return {"ok": True, "stub": True}
    except Exception as exc:
        log.warning(f"[workflow_engine] send_email error: {exc}")
        return {"ok": False, "error": str(exc)}


async def _action_create_task(db, params: Dict[str, Any], lead_context: Dict[str, Any]) -> Dict[str, Any]:
    try:
        task = {
            "id": f"task_{secrets.token_urlsafe(8)}",
            "lead_id": lead_context.get("id"),
            "tenant_id": lead_context.get("tenant_id") or lead_context.get("dev_org_id"),
            "assigned_to": params.get("assigned_to") or lead_context.get("assigned_to"),
            "title": _render_template(params.get("title", "Tarea workflow"), lead_context),
            "description": _render_template(params.get("description", ""), lead_context),
            "due_at": (
                _now() + timedelta(days=int(params.get("due_in_days") or 1))
            ).isoformat(),
            "source": "workflow",
            "status": "open",
            "created_at": _now(),
        }
        await db.tasks.insert_one(task)
        return {"ok": True, "task_id": task["id"]}
    except Exception as exc:
        log.warning(f"[workflow_engine] create_task error: {exc}")
        return {"ok": False, "error": str(exc)}


async def _action_move_stage(db, params: Dict[str, Any], lead_context: Dict[str, Any]) -> Dict[str, Any]:
    try:
        lead_id = lead_context.get("id")
        if not lead_id:
            return {"ok": False, "error": "lead_id_missing"}
        target_stage = params.get("stage")
        if not target_stage:
            return {"ok": False, "error": "stage_missing"}
        try:
            from pipeline_engine import set_state  # type: ignore
            r = await set_state(db, lead_id, target_stage, reason="workflow")
            return {"ok": True, "result": r}
        except Exception:
            # Fallback: update directo
            await db.leads.update_one(
                {"id": lead_id},
                {"$set": {"status_v2": target_stage, "last_activity_at": _now().isoformat()}},
            )
            return {"ok": True, "fallback": True}
    except Exception as exc:
        log.warning(f"[workflow_engine] move_stage error: {exc}")
        return {"ok": False, "error": str(exc)}


def _is_safe_webhook_url(url: str) -> Tuple[bool, str]:
    """G.94 SSRF protection · valida URL destino seguro para webhook.

    Bloquea:
    - Protocolos no-HTTP(S)
    - Hostnames loopback (localhost · 127.0.0.0/8)
    - Hostnames link-local (169.254.0.0/16 · incluye AWS/GCP/Azure metadata 169.254.169.254)
    - Hostnames RFC1918 privados (10/8 · 172.16/12 · 192.168/16)
    - Hostnames *.internal · *.local · *.svc.cluster
    """
    import socket
    import ipaddress
    from urllib.parse import urlparse

    if not url or not url.startswith(("http://", "https://")):
        return False, "invalid_protocol"

    try:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower().strip()
    except Exception:
        return False, "invalid_url_parse"

    if not host:
        return False, "missing_host"

    # Bloquear suffixes obviamente internos
    BLOCKED_SUFFIXES = (".internal", ".local", ".svc.cluster.local", ".cluster.local")
    if any(host.endswith(s) for s in BLOCKED_SUFFIXES):
        return False, "internal_suffix"
    if host in ("localhost", "ip6-localhost", "ip6-loopback"):
        return False, "localhost"

    # Resolver hostname → IPs · validar cada una
    try:
        addrs = socket.getaddrinfo(host, None)
    except Exception:
        return False, "dns_resolve_failed"

    for addr in addrs:
        ip_str = addr[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except Exception:
            continue
        # is_private cubre RFC1918 (10/8 · 172.16/12 · 192.168/16) + IPv6 ULA
        # is_loopback cubre 127.0.0.0/8 + ::1
        # is_link_local cubre 169.254.0.0/16 (AWS/GCP/Azure metadata) + fe80::/10
        # is_multicast / is_reserved / is_unspecified bonus
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            return False, f"blocked_ip_range:{ip_str}"

    return True, "ok"


async def _action_call_webhook(db, params: Dict[str, Any], lead_context: Dict[str, Any]) -> Dict[str, Any]:
    try:
        import httpx
        url = params.get("url")
        # G.94 SSRF fix · valida URL contra rangos privados/loopback/metadata
        is_safe, reason = _is_safe_webhook_url(url or "")
        if not is_safe:
            log.warning(f"[workflow_engine] webhook blocked SSRF: {reason} · url={url}")
            return {"ok": False, "error": f"url_blocked_ssrf:{reason}"}
        secret = params.get("secret") or ""
        payload = {
            "lead_id": lead_context.get("id"),
            "tenant_id": lead_context.get("tenant_id"),
            "data": params.get("payload") or {},
            "ts": _now().isoformat(),
        }
        body_bytes = str(payload).encode("utf-8")
        sig = ""
        if secret:
            sig = hmac.new(secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
        headers = {"Content-Type": "application/json"}
        if sig:
            headers["X-DMX-Signature"] = sig
        # follow_redirects=False · evita bypass via 302 a IP interna
        async with httpx.AsyncClient(timeout=WEBHOOK_TIMEOUT_S, follow_redirects=False) as client:
            r = await client.post(url, json=payload, headers=headers)
        return {"ok": 200 <= r.status_code < 300, "status_code": r.status_code}
    except Exception as exc:
        log.warning(f"[workflow_engine] webhook error: {exc}")
        return {"ok": False, "error": str(exc)}


async def _execute_action(db, action_type: str, params: Dict[str, Any], lead_context: Dict[str, Any]) -> Dict[str, Any]:
    if action_type == "send_whatsapp":
        return await _action_send_whatsapp(db, params, lead_context)
    if action_type == "send_email":
        return await _action_send_email(db, params, lead_context)
    if action_type == "create_task":
        return await _action_create_task(db, params, lead_context)
    if action_type == "move_stage":
        return await _action_move_stage(db, params, lead_context)
    if action_type == "call_webhook":
        return await _action_call_webhook(db, params, lead_context)
    return {"ok": False, "error": f"action_type_desconocido:{action_type}"}


def _render_template(text: str, lead_context: Dict[str, Any]) -> str:
    """Sustitución simple {nombre} {whatsapp} {zone} desde lead_context.

    NO uses str.format con dict crudo (riesgo KeyError). Solo claves
    conocidas + tolera placeholders desconocidos dejándolos intactos.
    """
    if not isinstance(text, str) or "{" not in text:
        return text or ""
    contact = lead_context.get("contact") or {}
    flat = {
        "nombre": contact.get("nombre") or contact.get("name") or "",
        "whatsapp": contact.get("whatsapp") or "",
        "email": contact.get("email") or "",
        "zone": lead_context.get("zone") or "",
        "price": str(lead_context.get("price") or ""),
        "stage": lead_context.get("status_v2") or "",
        "score": str(lead_context.get("heat_score") or ""),
    }
    out = text
    for k, v in flat.items():
        out = out.replace("{" + k + "}", str(v) if v is not None else "")
    return out


# ─── Workflow execution (DAG walk) ────────────────────────────────────────────

async def _load_lead_context(db, lead_id: str) -> Dict[str, Any]:
    if not lead_id:
        return {}
    try:
        ld = await db.leads.find_one({"id": lead_id}, {"_id": 0}) or {}
        return ld
    except Exception:
        return {}


async def execute_workflow(
    db,
    workflow: Dict[str, Any],
    lead_id: Optional[str],
    context_extra: Optional[Dict[str, Any]] = None,
    dry_run: bool = False,
    execution_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Recorre DAG desde el trigger node, ejecutando actions/conditions/delays.

    Idempotency: si execution_id ya existe en workflow_runs (status=done),
    retorna ese run sin re-ejecutar.
    """
    nodes: List[Dict[str, Any]] = workflow.get("nodes") or []
    edges: List[Dict[str, Any]] = workflow.get("edges") or []
    trigger = _find_trigger_node(nodes)
    if not trigger:
        return {"ok": False, "error": "no_trigger_node"}

    exec_id = execution_id or _exec_id()

    # Idempotency check
    if not dry_run:
        existing = await db.workflow_runs.find_one(
            {"execution_id": exec_id, "status": {"$in": ["done", "running"]}}, {"_id": 0, "id": 1, "status": 1},
        )
        if existing:
            return {"ok": True, "skipped": "idempotent", "run_id": existing.get("id"), "status": existing.get("status")}

    lead_context = await _load_lead_context(db, lead_id) if lead_id else {}
    if context_extra:
        lead_context = {**lead_context, **context_extra}

    adj = _build_adjacency(edges)

    run_doc = {
        "id": _run_id(),
        "execution_id": exec_id,
        "workflow_id": workflow.get("id"),
        "lead_id": lead_id,
        "status": "running",
        "started_at": _now(),
        "finished_at": None,
        "dry_run": bool(dry_run),
        "steps": [],
        "error": None,
    }
    if not dry_run:
        try:
            await db.workflow_runs.insert_one(dict(run_doc))
        except Exception as exc:
            log.warning(f"[workflow_engine] persist run failed: {exc}")

    steps: List[Dict[str, Any]] = []
    # BFS desde nodes hijos del trigger
    queue: List[Tuple[str, int]] = [(child, 0) for child, _branch in adj.get(trigger.get("id"), [])]
    visited = set()

    while queue:
        node_id, depth = queue.pop(0)
        if depth > MAX_DEPTH:
            steps.append({"node_id": node_id, "skipped": "max_depth"})
            break
        if node_id in visited:
            continue
        visited.add(node_id)

        node = _node_by_id(nodes, node_id)
        if not node:
            continue
        ntype = node.get("type")
        ncfg = node.get("config") or {}
        step: Dict[str, Any] = {"node_id": node_id, "type": ntype, "ts": _now().isoformat()}

        if ntype == "action":
            atype = ncfg.get("action_type")
            params = ncfg.get("params") or {}
            if dry_run:
                step["result"] = {"ok": True, "dry_run": True, "action_type": atype}
            else:
                # Retry loop 3x exponential
                attempt = 0
                result: Dict[str, Any] = {"ok": False}
                while attempt < RETRY_ATTEMPTS:
                    attempt += 1
                    result = await _execute_action(db, atype, params, lead_context)
                    if result.get("ok"):
                        break
                    await _async_sleep(min(2 ** attempt, 8))
                step["attempts"] = attempt
                step["result"] = result
            steps.append(step)
            # Continuar a hijos
            for child, _br in adj.get(node_id, []):
                queue.append((child, depth + 1))

        elif ntype == "condition":
            outcome = _evaluate_condition(ncfg, lead_context)
            step["result"] = {"outcome": outcome}
            steps.append(step)
            wanted_branch = "true" if outcome else "false"
            for child, branch in adj.get(node_id, []):
                if branch is None or branch == wanted_branch:
                    queue.append((child, depth + 1))

        elif ntype == "delay":
            unit = ncfg.get("unit", "minutes")
            amount = int(ncfg.get("amount") or 0)
            seconds = amount * {"minutes": 60, "hours": 3600, "days": 86400}.get(unit, 60)
            step["result"] = {"delay_seconds": seconds, "reschedule": True}
            steps.append(step)
            # En workflow runs con delay > 0, agendamos resto del DAG en queue
            children = [c for c, _br in adj.get(node_id, [])]
            if not dry_run and seconds > 0 and children:
                try:
                    from workflow_queue import schedule_continuation
                    await schedule_continuation(
                        db,
                        workflow_id=workflow.get("id"),
                        lead_id=lead_id,
                        execution_id=exec_id,
                        run_id=run_doc["id"],
                        from_node_ids=children,
                        run_at=_now() + timedelta(seconds=seconds),
                    )
                except Exception as exc:
                    log.warning(f"[workflow_engine] schedule delay failed: {exc}")
                # NO continuar inline tras delay; el continuation lo retomará
                continue
            # Si dry_run o delay=0 → continuar inline
            for child in children:
                queue.append((child, depth + 1))

        else:
            # trigger u otros: skip
            for child, _br in adj.get(node_id, []):
                queue.append((child, depth + 1))

    run_doc["steps"] = steps
    run_doc["status"] = "done"
    run_doc["finished_at"] = _now()

    if not dry_run:
        try:
            await db.workflow_runs.update_one(
                {"id": run_doc["id"]},
                {"$set": {
                    "status": "done",
                    "finished_at": run_doc["finished_at"],
                    "steps": steps,
                }},
            )
        except Exception as exc:
            log.warning(f"[workflow_engine] update run failed: {exc}")

    return {"ok": True, "run_id": run_doc["id"], "execution_id": exec_id, "steps": steps, "dry_run": dry_run}


async def _async_sleep(seconds: int) -> None:
    """Wrapper async-safe."""
    import asyncio
    try:
        await asyncio.sleep(seconds)
    except Exception:
        pass


# ─── Continuation execution (delays) ──────────────────────────────────────────

async def continue_execution(
    db,
    workflow_id: str,
    lead_id: Optional[str],
    execution_id: str,
    run_id: str,
    from_node_ids: List[str],
) -> Dict[str, Any]:
    """Retoma DAG después de un delay desde nodes hijos."""
    wf = await db.workflows.find_one({"id": workflow_id, "deleted_at": None}, {"_id": 0})
    if not wf:
        return {"ok": False, "error": "workflow_not_found"}
    nodes = wf.get("nodes") or []
    edges = wf.get("edges") or []
    adj = _build_adjacency(edges)
    lead_context = await _load_lead_context(db, lead_id) if lead_id else {}

    new_steps: List[Dict[str, Any]] = []
    queue: List[Tuple[str, int]] = [(nid, 0) for nid in from_node_ids]
    visited: set = set()

    while queue:
        node_id, depth = queue.pop(0)
        if depth > MAX_DEPTH or node_id in visited:
            continue
        visited.add(node_id)
        node = _node_by_id(nodes, node_id)
        if not node:
            continue
        ntype = node.get("type")
        ncfg = node.get("config") or {}
        step: Dict[str, Any] = {"node_id": node_id, "type": ntype, "ts": _now().isoformat(), "continuation": True}

        if ntype == "action":
            atype = ncfg.get("action_type")
            params = ncfg.get("params") or {}
            attempt = 0
            result: Dict[str, Any] = {"ok": False}
            while attempt < RETRY_ATTEMPTS:
                attempt += 1
                result = await _execute_action(db, atype, params, lead_context)
                if result.get("ok"):
                    break
                await _async_sleep(min(2 ** attempt, 8))
            step["attempts"] = attempt
            step["result"] = result
            new_steps.append(step)
            for child, _br in adj.get(node_id, []):
                queue.append((child, depth + 1))

        elif ntype == "condition":
            outcome = _evaluate_condition(ncfg, lead_context)
            step["result"] = {"outcome": outcome}
            new_steps.append(step)
            wanted = "true" if outcome else "false"
            for child, branch in adj.get(node_id, []):
                if branch is None or branch == wanted:
                    queue.append((child, depth + 1))

        elif ntype == "delay":
            unit = ncfg.get("unit", "minutes")
            amount = int(ncfg.get("amount") or 0)
            seconds = amount * {"minutes": 60, "hours": 3600, "days": 86400}.get(unit, 60)
            children = [c for c, _br in adj.get(node_id, [])]
            if seconds > 0 and children:
                from workflow_queue import schedule_continuation
                await schedule_continuation(
                    db,
                    workflow_id=workflow_id,
                    lead_id=lead_id,
                    execution_id=execution_id,
                    run_id=run_id,
                    from_node_ids=children,
                    run_at=_now() + timedelta(seconds=seconds),
                )
                step["result"] = {"delay_seconds": seconds, "reschedule": True}
                new_steps.append(step)
                continue
            for child in children:
                queue.append((child, depth + 1))

    try:
        await db.workflow_runs.update_one(
            {"id": run_id},
            {"$push": {"steps": {"$each": new_steps}}},
        )
    except Exception:
        pass
    return {"ok": True, "run_id": run_id, "added_steps": len(new_steps)}


# ─── Dispatch entry (called from event hooks) ────────────────────────────────

async def dispatch_event(db, event: Dict[str, Any]) -> Dict[str, Any]:
    """Llama desde producers (lead.new, pipeline transitions, custom hooks).

    Encuentra workflows con status=active + trigger matcheando event,
    los ejecuta secuencialmente. Idempotency via execution_id derivada.

    Audit forense G.90 fix · CRÍTICO tenant isolation:
    Resuelve el tenant_id del lead PRIMERO · solo dispara workflows del mismo tenant
    (workflow Tenant A NUNCA debe ejecutarse sobre lead Tenant B).
    """
    fired: List[Dict[str, Any]] = []
    lead_id = event.get("lead_id")

    # G.90 fix · resolver tenant_id del lead para isolation cross-tenant
    lead_tenant_id = None
    if lead_id:
        try:
            lead_doc = await db.leads.find_one(
                {"id": lead_id},
                {"_id": 0, "tenant_id": 1, "dev_org_id": 1},
            )
            if lead_doc:
                lead_tenant_id = lead_doc.get("tenant_id") or lead_doc.get("dev_org_id")
        except Exception as exc:
            log.warning(f"[workflow_engine] dispatch tenant resolve failed: {exc}")
            # FAIL-CLOSED: si no podemos resolver tenant, no disparar (security > availability)
            return {"ok": False, "error": "tenant_resolve_failed", "fired": 0}

    # Query con tenant_id filter cuando aplica · fallback si lead sin tenant
    query: Dict[str, Any] = {"status": "active", "deleted_at": None}
    if lead_tenant_id:
        query["tenant_id"] = lead_tenant_id
    try:
        cursor = db.workflows.find(query, {"_id": 0})
        wfs = await cursor.to_list(length=500)
    except Exception as exc:
        log.warning(f"[workflow_engine] dispatch list failed: {exc}")
        return {"ok": False, "error": str(exc), "fired": 0}

    for wf in wfs:
        if not evaluate_trigger(wf, event):
            continue
        # exec_id determinístico = wf+lead+event_type+date(min granular)
        seed = f"{wf.get('id')}|{lead_id}|{event.get('type')}|{event.get('data', {}).get('event_name', '')}|{_now().strftime('%Y%m%d%H')}"
        exec_id = "wfexec_" + hashlib.sha1(seed.encode("utf-8")).hexdigest()[:16]
        r = await execute_workflow(
            db, wf, lead_id=lead_id, context_extra=event.get("data") or {}, execution_id=exec_id,
        )
        fired.append({"workflow_id": wf.get("id"), "run_id": r.get("run_id"), "skipped": r.get("skipped")})
    return {"ok": True, "fired": len(fired), "details": fired}


# ─── Indexes ─────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    try:
        await db.workflows.create_index("id", unique=True)
        await db.workflows.create_index([("owner_user_id", 1), ("status", 1)], name="idx_wf_owner_status", background=True)
        await db.workflows.create_index("status", background=True)
        await db.workflow_runs.create_index("id", unique=True)
        await db.workflow_runs.create_index([("workflow_id", 1), ("started_at", -1)], background=True)
        await db.workflow_runs.create_index([("lead_id", 1), ("started_at", -1)], background=True, sparse=True)
        await db.workflow_runs.create_index("execution_id", unique=False, background=True)
        # TTL 90d en started_at (Mongo TTL requires datetime BSON, started_at es datetime)
        await db.workflow_runs.create_index("started_at", expireAfterSeconds=90 * 86400, background=True, name="ttl_wfrun_90d")
        log.info("[workflow_engine] indexes OK")
    except Exception as exc:
        log.warning(f"[workflow_engine] ensure_indexes warning: {exc}")
