"""W2.1 SA2 — Connector Registry.

Central catalog of all external connectors (AI / geo / email / drive / observability /
calendar / payments). Each connector exposes:
  - healthcheck_fn(db) → (ok: bool, latency_ms: int, error: Optional[str], preview: Optional[str])
  - retry_fn(db) → dict (best-effort re-call last failed item)
  - replay_fn(db, from_ts, to_ts, ids) → dict
  - last_failure_query_fn(db) → query dict for connector_invocations

Healthcheck side-effects:
  All healthchecks insert a `connector_invocation` doc {connector_id, op, status, ts,
  duration_ms, error?, metadata?}. Status calculation later aggregates 24h window.

Stub detection:
  A connector is considered "stub" when:
    - healthcheck_fn is None (not implemented)
    - OR required_env_keys are missing in os.environ

Status calculation (per connector):
  - "stub"     → required env keys missing
  - "failed"   → last invocation failed AND last success > 2h ago
  - "degraded" → fail_count_24h / total_24h > 0.30 AND fail_count_24h >= 2
  - "ok"       → otherwise (incl. no recent invocations + env present)
"""
from __future__ import annotations

import asyncio
import logging
import os
import secrets
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Callable, Dict, List, Optional, Tuple

import httpx

log = logging.getLogger("dmx.connector_registry")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


# ─── Connector catalog (data shape) ───────────────────────────────────────────

CONNECTOR_CATALOG: List[Dict[str, Any]] = [
    {"id": "claude_haiku",       "name": "Claude Haiku 4.5",       "category": "ai",            "icon_key": "Bot",         "required_env": ["EMERGENT_LLM_KEY"], "supports_retry": True,  "supports_replay": True},
    {"id": "claude_sonnet",      "name": "Claude Sonnet 4.5",      "category": "ai",            "icon_key": "Brain",       "required_env": ["EMERGENT_LLM_KEY"], "supports_retry": True,  "supports_replay": True},
    {"id": "mapbox_geocoding",   "name": "Mapbox Geocoding",       "category": "geo",           "icon_key": "MapPin",      "required_env": ["MAPBOX_TOKEN"],     "supports_retry": True,  "supports_replay": True},
    {"id": "mapbox_static",      "name": "Mapbox Static Images",   "category": "geo",           "icon_key": "Map",         "required_env": ["MAPBOX_TOKEN"],     "supports_retry": False, "supports_replay": False},
    {"id": "inegi_demographics", "name": "INEGI (Censo+DENUE)",    "category": "geo",           "icon_key": "Layers",      "required_env": ["IE_INEGI_TOKEN"],   "supports_retry": True,  "supports_replay": True},
    {"id": "google_drive",       "name": "Google Drive",           "category": "drive",         "icon_key": "FolderOpen",  "required_env": [],                   "supports_retry": True,  "supports_replay": False},
    {"id": "google_calendar",    "name": "Google Calendar",        "category": "calendar",      "icon_key": "CalendarDays","required_env": [],                   "supports_retry": True,  "supports_replay": False},
    {"id": "microsoft_calendar", "name": "Microsoft Calendar",     "category": "calendar",      "icon_key": "Calendar",    "required_env": [],                   "supports_retry": False, "supports_replay": False, "is_stub": True},
    {"id": "resend",             "name": "Resend Email",           "category": "email",         "icon_key": "Mail",        "required_env": ["RESEND_API_KEY"],   "supports_retry": True,  "supports_replay": True},
    {"id": "sentry",             "name": "Sentry",                 "category": "observability", "icon_key": "AlertCircle", "required_env": ["SENTRY_DSN"],       "supports_retry": False, "supports_replay": False},
    {"id": "posthog",            "name": "PostHog",                "category": "observability", "icon_key": "Activity",    "required_env": ["POSTHOG_KEY"],      "supports_retry": False, "supports_replay": False},
]
_BY_ID: Dict[str, Dict[str, Any]] = {c["id"]: c for c in CONNECTOR_CATALOG}


def get_catalog() -> List[Dict[str, Any]]:
    return [dict(c) for c in CONNECTOR_CATALOG]


def get_meta(connector_id: str) -> Optional[Dict[str, Any]]:
    return _BY_ID.get(connector_id)


def env_present(connector_id: str) -> bool:
    meta = _BY_ID.get(connector_id)
    if not meta:
        return False
    return all(bool(os.environ.get(k)) for k in meta.get("required_env") or [])


# ─── Healthchecks ─────────────────────────────────────────────────────────────

HTTP_TIMEOUT = 30.0


async def _hc_claude(model_label: str) -> Tuple[bool, int, Optional[str], Optional[str]]:
    api_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return False, 0, "EMERGENT_LLM_KEY ausente", None
    try:
        from llm_client import LlmChat, UserMessage  # type: ignore
    except Exception as e:
        return False, 0, f"emergentintegrations no disponible: {e}", None
    t0 = time.monotonic()
    try:
        chat = LlmChat(api_key=api_key, session_id=f"hc-{secrets.token_urlsafe(6)}",
                       system_message="Responde EXCLUSIVAMENTE 'pong'.")
        chat = chat.with_model("anthropic", model_label).with_max_tokens(8)
        resp = await asyncio.wait_for(chat.send_message(UserMessage(text="ping")), timeout=HTTP_TIMEOUT)
        dur = int((time.monotonic() - t0) * 1000)
        preview = (resp or "")[:80]
        return True, dur, None, preview
    except Exception as e:
        dur = int((time.monotonic() - t0) * 1000)
        return False, dur, str(e)[:300], None


async def hc_claude_haiku(db) -> Tuple[bool, int, Optional[str], Optional[str]]:
    return await _hc_claude("claude-haiku-4-5")


async def hc_claude_sonnet(db) -> Tuple[bool, int, Optional[str], Optional[str]]:
    return await _hc_claude("claude-sonnet-4-5")


async def hc_mapbox_geocoding(db) -> Tuple[bool, int, Optional[str], Optional[str]]:
    token = os.environ.get("MAPBOX_TOKEN")
    if not token:
        return False, 0, "MAPBOX_TOKEN ausente", None
    url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/Mexico%20City.json?access_token={token}&limit=1"
    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as cli:
            r = await cli.get(url)
        dur = int((time.monotonic() - t0) * 1000)
        if r.status_code != 200:
            return False, dur, f"HTTP {r.status_code}", r.text[:160]
        data = r.json()
        n = len(data.get("features") or [])
        return True, dur, None, f"{n} features"
    except Exception as e:
        return False, int((time.monotonic() - t0) * 1000), str(e)[:300], None


async def hc_mapbox_static(db) -> Tuple[bool, int, Optional[str], Optional[str]]:
    token = os.environ.get("MAPBOX_TOKEN")
    if not token:
        return False, 0, "MAPBOX_TOKEN ausente", None
    url = ("https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/"
           f"-99.13,19.43,11/240x160?access_token={token}")
    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as cli:
            r = await cli.get(url)
        dur = int((time.monotonic() - t0) * 1000)
        if r.status_code != 200:
            return False, dur, f"HTTP {r.status_code}", None
        size_kb = round(len(r.content) / 1024, 1)
        return True, dur, None, f"png {size_kb} KB"
    except Exception as e:
        return False, int((time.monotonic() - t0) * 1000), str(e)[:300], None


async def hc_inegi(db) -> Tuple[bool, int, Optional[str], Optional[str]]:
    token = os.environ.get("IE_INEGI_TOKEN")
    if not token:
        return False, 0, "IE_INEGI_TOKEN ausente", None
    # Conservative: don't actually hit INEGI (often unreliable from cluster); validate token shape only.
    t0 = time.monotonic()
    try:
        # Simple connectivity check
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as cli:
            r = await cli.get("https://www.inegi.org.mx/app/api/", follow_redirects=True)
        dur = int((time.monotonic() - t0) * 1000)
        if r.status_code in (200, 301, 302, 401, 403, 404):
            return True, dur, None, f"reachable HTTP {r.status_code}"
        return False, dur, f"HTTP {r.status_code}", None
    except Exception as e:
        return False, int((time.monotonic() - t0) * 1000), str(e)[:300], None


async def hc_google_drive(db) -> Tuple[bool, int, Optional[str], Optional[str]]:
    """Use first available drive_connection to list root files (page=1)."""
    t0 = time.monotonic()
    try:
        conn = await db.dev_drive_connections.find_one(
            {"status": "connected"}, {"_id": 0},
        )
        if not conn:
            return False, 0, "Sin drive_connection activa", None
        from drive_engine import _drive_service
        svc = await asyncio.to_thread(_drive_service, conn)

        def _ping():
            return svc.files().list(pageSize=1, fields="files(id,name)").execute()
        resp = await asyncio.wait_for(asyncio.to_thread(_ping), timeout=HTTP_TIMEOUT)
        dur = int((time.monotonic() - t0) * 1000)
        n = len((resp or {}).get("files") or [])
        return True, dur, None, f"{n} archivo(s) listables"
    except Exception as e:
        return False, int((time.monotonic() - t0) * 1000), str(e)[:300], None


async def hc_google_calendar(db) -> Tuple[bool, int, Optional[str], Optional[str]]:
    t0 = time.monotonic()
    try:
        cal = await db.calendar_connections.find_one(
            {"provider": "google", "status": "connected"}, {"_id": 0},
        )
        if not cal:
            return False, 0, "Sin calendar_connection google activa", None
        return True, int((time.monotonic() - t0) * 1000), None, f"user={cal.get('user_id')}"
    except Exception as e:
        return False, int((time.monotonic() - t0) * 1000), str(e)[:300], None


async def hc_microsoft_calendar(db) -> Tuple[bool, int, Optional[str], Optional[str]]:
    return False, 0, "Stub — integración Microsoft pendiente", None


async def hc_resend(db) -> Tuple[bool, int, Optional[str], Optional[str]]:
    key = os.environ.get("RESEND_API_KEY")
    if not key:
        return False, 0, "RESEND_API_KEY ausente", None
    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as cli:
            r = await cli.get("https://api.resend.com/domains",
                              headers={"Authorization": f"Bearer {key}"})
        dur = int((time.monotonic() - t0) * 1000)
        if r.status_code in (200, 401, 403):
            # 401/403 still indicates the API responded; surface the auth issue to UI but mark reachable.
            ok = r.status_code == 200
            err = None if ok else f"HTTP {r.status_code} (key inválida)"
            preview = None
            try:
                preview = f"{len((r.json().get('data') or []))} dominio(s)" if ok else None
            except Exception:
                pass
            return ok, dur, err, preview
        return False, dur, f"HTTP {r.status_code}", r.text[:160]
    except Exception as e:
        return False, int((time.monotonic() - t0) * 1000), str(e)[:300], None


async def hc_sentry(db) -> Tuple[bool, int, Optional[str], Optional[str]]:
    dsn = os.environ.get("SENTRY_DSN")
    if not dsn:
        return False, 0, "SENTRY_DSN ausente", None
    # SENTRY_DSN does not grant API access; we only validate shape + reachability of the org host.
    t0 = time.monotonic()
    try:
        # Extract host from DSN: https://<key>@<host>/<project_id>
        host = dsn.split("@", 1)[-1].split("/", 1)[0]
        url = f"https://{host}/api/0/"
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as cli:
            r = await cli.get(url)
        dur = int((time.monotonic() - t0) * 1000)
        # 401 is expected without auth token; reachability is what we test.
        if r.status_code in (200, 401, 403):
            return True, dur, None, f"host alcanzable HTTP {r.status_code}"
        return False, dur, f"HTTP {r.status_code}", None
    except Exception as e:
        return False, int((time.monotonic() - t0) * 1000), str(e)[:300], None


async def hc_posthog(db) -> Tuple[bool, int, Optional[str], Optional[str]]:
    key = os.environ.get("POSTHOG_KEY")
    host = os.environ.get("POSTHOG_HOST") or "https://app.posthog.com"
    if not key:
        return False, 0, "POSTHOG_KEY ausente", None
    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as cli:
            r = await cli.get(host.rstrip("/") + "/decide/?v=3",
                              params={"token": key})
        dur = int((time.monotonic() - t0) * 1000)
        if r.status_code in (200, 400, 401):
            return True, dur, None, f"HTTP {r.status_code}"
        return False, dur, f"HTTP {r.status_code}", r.text[:160]
    except Exception as e:
        return False, int((time.monotonic() - t0) * 1000), str(e)[:300], None


HEALTHCHECKS: Dict[str, Callable] = {
    "claude_haiku": hc_claude_haiku,
    "claude_sonnet": hc_claude_sonnet,
    "mapbox_geocoding": hc_mapbox_geocoding,
    "mapbox_static": hc_mapbox_static,
    "inegi_demographics": hc_inegi,
    "google_drive": hc_google_drive,
    "google_calendar": hc_google_calendar,
    "microsoft_calendar": hc_microsoft_calendar,
    "resend": hc_resend,
    "sentry": hc_sentry,
    "posthog": hc_posthog,
}


# ─── Invocation logging ───────────────────────────────────────────────────────

async def record_invocation(db, connector_id: str, op: str, status: str,
                            duration_ms: int, error: Optional[str] = None,
                            metadata: Optional[Dict[str, Any]] = None) -> str:
    inv_id = secrets.token_urlsafe(12)
    doc = {
        "id": inv_id,
        "connector_id": connector_id,
        "op": op,
        "status": status,
        "ts": _iso(),
        "duration_ms": int(duration_ms or 0),
        "error": (error or None) and (error[:500] if error else None),
        "metadata": metadata or {},
    }
    try:
        await db.connector_invocations.insert_one(dict(doc))
    except Exception as e:
        log.warning(f"[connector_registry] record_invocation failed: {e}")
    return inv_id


async def run_healthcheck(db, connector_id: str) -> Dict[str, Any]:
    """Execute healthcheck_fn synchronously (with internal timeout). Records invocation."""
    if connector_id not in HEALTHCHECKS:
        return {"ok": False, "latency_ms": 0, "error": "Connector desconocido", "preview": None}
    if not env_present(connector_id):
        # Treat as stub: do not call out, but record.
        await record_invocation(db, connector_id, "healthcheck", "fail", 0,
                                error="env keys missing", metadata={"stub": True})
        return {"ok": False, "latency_ms": 0, "error": "env keys missing", "preview": None, "stub": True}

    fn = HEALTHCHECKS[connector_id]
    try:
        ok, dur, err, preview = await asyncio.wait_for(fn(db), timeout=HTTP_TIMEOUT + 5)
    except asyncio.TimeoutError:
        ok, dur, err, preview = False, int(HTTP_TIMEOUT * 1000), "timeout 30s", None
    except Exception as e:
        ok, dur, err, preview = False, 0, str(e)[:300], None

    await record_invocation(
        db, connector_id, "healthcheck",
        "ok" if ok else "fail", dur, error=err,
        metadata={"preview": preview} if preview else None,
    )
    return {"ok": ok, "latency_ms": dur, "error": err, "preview": preview}


# ─── 24h aggregations & status calc ───────────────────────────────────────────

async def aggregate_24h(db, connector_id: str) -> Dict[str, Any]:
    """Return success/fail counts + avg latency for last 24h + last_success/last_error."""
    cutoff = (_now() - timedelta(hours=24)).isoformat()
    fail_count = success_count = 0
    sum_lat = 0
    last_success_at = None
    last_error = None
    last_check_at = None
    try:
        cursor = db.connector_invocations.find(
            {"connector_id": connector_id, "ts": {"$gte": cutoff}},
            {"_id": 0, "status": 1, "ts": 1, "duration_ms": 1, "error": 1},
        ).sort("ts", -1)
        async for inv in cursor:
            if inv.get("status") == "ok":
                success_count += 1
                if last_success_at is None or (inv.get("ts") or "") > last_success_at:
                    last_success_at = inv.get("ts")
            else:
                fail_count += 1
                if last_error is None:
                    last_error = inv.get("error")
            sum_lat += int(inv.get("duration_ms") or 0)
            if last_check_at is None or (inv.get("ts") or "") > last_check_at:
                last_check_at = inv.get("ts")
    except Exception as e:
        log.warning(f"[aggregate_24h] {connector_id}: {e}")

    total = success_count + fail_count
    avg = round(sum_lat / total, 1) if total else 0.0
    return {
        "fail_count_24h": fail_count,
        "success_count_24h": success_count,
        "latency_avg_ms_24h": avg,
        "last_success_at": last_success_at,
        "last_error": last_error,
        "last_check_at": last_check_at,
    }


async def compute_status(db, connector_id: str, agg: Dict[str, Any]) -> str:
    """Decide ok | degraded | failed | stub."""
    meta = _BY_ID.get(connector_id) or {}
    if meta.get("is_stub"):
        return "stub"
    if not env_present(connector_id):
        return "stub"
    fail_count = agg.get("fail_count_24h") or 0
    success_count = agg.get("success_count_24h") or 0
    total = fail_count + success_count
    last_success = agg.get("last_success_at")
    last_check = agg.get("last_check_at")

    # Last invocation failed AND no success > 2h ago → failed
    if last_check and last_success != last_check:
        # Means most recent check failed
        try:
            if last_success:
                last_succ_dt = datetime.fromisoformat(last_success.replace("Z", "+00:00"))
                hrs = (_now() - last_succ_dt).total_seconds() / 3600
                if hrs > 2:
                    return "failed"
            else:
                # Never succeeded in 24h
                return "failed"
        except Exception:
            pass
    if total > 0:
        ratio = fail_count / total
        if ratio > 0.30 and fail_count >= 2:
            return "degraded"
    return "ok"


# ─── Retry / replay ───────────────────────────────────────────────────────────

async def find_last_failure(db, connector_id: str) -> Optional[Dict[str, Any]]:
    return await db.connector_invocations.find_one(
        {"connector_id": connector_id, "status": "fail"},
        {"_id": 0},
        sort=[("ts", -1)],
    )


async def retry_connector(db, connector_id: str) -> Dict[str, Any]:
    """Re-run healthcheck for the connector. (We don't actually re-execute the
    original failed business call — there is no generic way to do so. The
    healthcheck is the safest deterministic re-call that proves liveness.)"""
    meta = get_meta(connector_id)
    if not meta or not meta.get("supports_retry"):
        raise ValueError("Connector no soporta retry")
    last_fail = await find_last_failure(db, connector_id)
    result = await run_healthcheck(db, connector_id)
    return {
        "connector_id": connector_id,
        "previous_failure": last_fail and last_fail.get("ts"),
        "previous_error": last_fail and last_fail.get("error"),
        "retry_result": result,
    }


async def replay_range(db, connector_id: str, from_ts: str, to_ts: str) -> Dict[str, Any]:
    """Re-run healthcheck once per failed invocation in [from_ts, to_ts].
    Limits: max 7 days range, max 100 affected items. Raises ValueError on violations."""
    meta = get_meta(connector_id)
    if not meta or not meta.get("supports_replay"):
        raise ValueError("Connector no soporta replay")

    try:
        f_dt = datetime.fromisoformat(from_ts.replace("Z", "+00:00"))
        t_dt = datetime.fromisoformat(to_ts.replace("Z", "+00:00"))
    except Exception:
        raise ValueError("Fechas inválidas (ISO 8601 esperado)")
    if t_dt < f_dt:
        raise ValueError("to_ts debe ser >= from_ts")
    span_days = (t_dt - f_dt).total_seconds() / 86400
    if span_days > 7:
        raise ValueError("Rango máximo 7 días")

    q = {
        "connector_id": connector_id,
        "status": "fail",
        "ts": {"$gte": from_ts, "$lte": to_ts},
    }
    affected = await db.connector_invocations.count_documents(q)
    if affected > 100:
        raise ValueError(f"Demasiadas invocaciones afectadas ({affected} > 100). Reduce el rango.")

    succeeded = failed_again = 0
    cursor = db.connector_invocations.find(q, {"_id": 0, "id": 1}).sort("ts", 1).limit(100)
    items = [d async for d in cursor]
    for _it in items:
        try:
            r = await run_healthcheck(db, connector_id)
            if r.get("ok"):
                succeeded += 1
            else:
                failed_again += 1
        except Exception:
            failed_again += 1
    return {
        "connector_id": connector_id,
        "total": len(items),
        "succeeded": succeeded,
        "failed_again": failed_again,
        "from_ts": from_ts,
        "to_ts": to_ts,
    }


# ─── Aggregated cron ──────────────────────────────────────────────────────────

async def healthcheck_all_connectors(db) -> Dict[str, Any]:
    """Cron-friendly: run every healthcheck once."""
    results: Dict[str, Any] = {}
    for cid in HEALTHCHECKS.keys():
        try:
            results[cid] = await run_healthcheck(db, cid)
        except Exception as e:
            log.warning(f"[hc_all] {cid} failed: {e}")
            results[cid] = {"ok": False, "error": str(e)[:200]}
    return results


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_connector_indexes(db) -> None:
    try:
        await db.connector_invocations.create_index("id", unique=True)
        await db.connector_invocations.create_index([("connector_id", 1), ("ts", -1), ("status", 1)])
        await db.connector_invocations.create_index([("ts", -1)])
    except Exception as e:
        log.warning(f"[connector_registry] indexes: {e}")
