"""Phase 4 Batch 0.5 — Diagnostic Engine core.

Architecture
------------
- `Probe` base class with: id, module, severity, description, async `run(db, project_id, user) → ProbeResult`.
- `ProbeResult` dataclass with pass/fail/location/recommendation/recurrence.
- Global registry `PROBE_REGISTRY` populated via `register_probe(probe)`.
- `run_diagnostics(db, project_id, scope, user)` orchestrates all or filtered probes
  and persists a `project_diagnostics` document.
- Error categories: schema_integrity, wiring_broken, sync_failure, stale_data,
  ai_failure, permission_issue, performance, integration_external,
  data_quality, orphan_record.
"""
from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone, timedelta
from typing import Any, Callable, Dict, List, Optional

log = logging.getLogger("dmx.diagnostic")

SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}
ERROR_TYPES = (
    "schema_integrity", "wiring_broken", "sync_failure", "stale_data",
    "ai_failure", "permission_issue", "performance", "integration_external",
    "data_quality", "orphan_record",
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class ProbeResult:
    probe_id: str
    module: str
    severity: str
    passed: bool
    description: str = ""
    error_type: Optional[str] = None
    location: Optional[str] = None
    recommendation: Optional[str] = None
    action_id: Optional[str] = None  # auto-fix hook id
    recurrence_count: int = 0
    first_detected: Optional[str] = None
    last_detected: Optional[str] = None
    duration_ms: Optional[int] = None
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class Probe:
    """Base probe. Subclass + register via `register_probe` OR use `functional_probe`."""
    id: str = "base"
    module: str = "unknown"
    severity: str = "medium"
    description: str = ""
    # One of ERROR_TYPES (when fails)
    default_error_type: str = "schema_integrity"

    async def run(self, db, project_id: Optional[str], user) -> ProbeResult:  # pragma: no cover
        raise NotImplementedError


PROBE_REGISTRY: List[Probe] = []


def register_probe(probe: Probe):
    """Idempotent registration (prevents double-register on hot reload)."""
    if any(p.id == probe.id for p in PROBE_REGISTRY):
        return
    PROBE_REGISTRY.append(probe)


def functional_probe(
    id: str,
    module: str,
    severity: str,
    description: str,
    fn: Callable,
    default_error_type: str = "schema_integrity",
):
    """Wrap a plain async function as a Probe instance.

    fn signature: async fn(db, project_id, user) -> dict with keys:
      {passed: bool, error_type?: str, location?: str, recommendation?: str,
       action_id?: str, extra?: dict}
    """
    class _FP(Probe):
        pass
    _FP.id = id
    _FP.module = module
    _FP.severity = severity
    _FP.description = description
    _FP.default_error_type = default_error_type

    async def _run(self, db, project_id, user) -> ProbeResult:
        t0 = time.perf_counter()
        try:
            res = await fn(db, project_id, user)
        except Exception as e:
            log.warning(f"[probe {id}] raised: {e}")
            res = {
                "passed": False,
                "error_type": "wiring_broken",
                "location": f"probe:{id}",
                "recommendation": f"Excepción en probe: {str(e)[:160]}",
            }
        dur_ms = int((time.perf_counter() - t0) * 1000)
        return ProbeResult(
            probe_id=self.id,
            module=self.module,
            severity=self.severity,
            passed=bool(res.get("passed")),
            description=self.description,
            error_type=None if res.get("passed") else (res.get("error_type") or self.default_error_type),
            location=res.get("location"),
            recommendation=res.get("recommendation"),
            action_id=res.get("action_id"),
            duration_ms=dur_ms,
            extra=res.get("extra") or {},
        )

    _FP.run = _run
    register_probe(_FP())


# ─── Recurrence tracker ──────────────────────────────────────────────────────

async def _update_recurrence(db, project_id: Optional[str], result: ProbeResult):
    """Upsert recurrence doc so we can surface 'error X occurred in N projects'."""
    if result.passed:
        return
    key = {"probe_id": result.probe_id, "project_id": project_id or "__user__"}
    now_iso = _now().isoformat()
    existing = await db.probe_recurrence.find_one(key, {"_id": 0})
    if existing:
        await db.probe_recurrence.update_one(
            key, {"$set": {"last_detected": now_iso},
                  "$inc": {"recurrence_count": 1}}
        )
        result.recurrence_count = (existing.get("recurrence_count", 0) or 0) + 1
        result.first_detected = existing.get("first_detected")
        result.last_detected = now_iso
    else:
        await db.probe_recurrence.insert_one({
            **key, "recurrence_count": 1,
            "first_detected": now_iso, "last_detected": now_iso,
            "module": result.module, "severity": result.severity,
            "error_type": result.error_type,
        })
        result.recurrence_count = 1
        result.first_detected = now_iso
        result.last_detected = now_iso


# ─── Runner ──────────────────────────────────────────────────────────────────

async def run_diagnostics(
    db, project_id: Optional[str], scope: str = "all",
    user=None, trigger: str = "manual",
    module_filter: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Run all applicable probes and persist a diagnostic report.

    scope: 'all' | 'critical' | 'specific_modules'
    module_filter: list of module names when scope='specific_modules'
    """
    # Load probes (import modules lazily so registry fills)
    try:
        import probes  # noqa: F401 — triggers __init__.py side-effect registration
    except Exception as e:
        log.warning(f"probes import failed: {e}")

    # Filter
    selected: List[Probe] = []
    for p in PROBE_REGISTRY:
        if scope == "critical" and p.severity not in ("critical", "high"):
            continue
        if scope == "specific_modules" and module_filter and p.module not in module_filter:
            continue
        selected.append(p)

    # Execute
    results: List[ProbeResult] = []
    for p in selected:
        try:
            r = await p.run(db, project_id, user)
        except Exception as e:
            r = ProbeResult(
                probe_id=p.id, module=p.module, severity=p.severity,
                passed=False, error_type="wiring_broken",
                location=f"probe.run:{p.id}",
                recommendation=f"Probe raised: {str(e)[:200]}",
            )
        await _update_recurrence(db, project_id, r)
        results.append(r)

    # Summary
    total = len(results)
    passed = sum(1 for r in results if r.passed)
    failed = total - passed
    # warnings = failed of severity medium/low
    warnings = sum(1 for r in results if not r.passed and r.severity in ("medium", "low"))
    criticals = sum(1 for r in results if not r.passed and r.severity == "critical")

    by_module: Dict[str, Dict[str, int]] = {}
    for r in results:
        m = by_module.setdefault(r.module, {"pass": 0, "fail": 0})
        m["pass" if r.passed else "fail"] += 1

    by_severity: Dict[str, int] = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for r in results:
        if not r.passed:
            by_severity[r.severity] = by_severity.get(r.severity, 0) + 1

    dev_org_id = (getattr(user, "tenant_id", None) or
                  getattr(user, "org_id", None) or "unknown") if user else "unknown"

    diag_id = f"diag_{uuid.uuid4().hex[:14]}"
    now_iso = _now().isoformat()
    doc = {
        "id": diag_id,
        "project_id": project_id,
        "dev_org_id": dev_org_id,
        "run_at": now_iso,
        "run_by_user_id": getattr(user, "user_id", None),
        "trigger": trigger,
        "scope": scope,
        "total_probes": total, "passed": passed,
        "warnings": warnings, "failed": failed, "criticals": criticals,
        "probes_results": [r.to_dict() for r in results],
        "summary": {"by_module": by_module, "by_severity": by_severity},
    }
    await db.project_diagnostics.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


# ─── Auto-fix registry ───────────────────────────────────────────────────────

AUTO_FIX_HANDLERS: Dict[str, Callable] = {}


def register_auto_fix(action_id: str, handler: Callable):
    AUTO_FIX_HANDLERS[action_id] = handler


async def run_auto_fix(action_id: str, db, project_id: str, user) -> Dict[str, Any]:
    handler = AUTO_FIX_HANDLERS.get(action_id)
    if not handler:
        return {"ok": False, "error": f"No handler for action {action_id}"}
    try:
        result = await handler(db, project_id, user)
        return {"ok": True, **(result or {})}
    except Exception as e:
        log.warning(f"[auto-fix {action_id}] failed: {e}")
        return {"ok": False, "error": str(e)[:200]}


# ─── AI-assisted recommendations ─────────────────────────────────────────────

async def ai_recommend_for_failure(db, dev_org_id: str, result: ProbeResult) -> Optional[Dict]:
    """Claude Haiku call when no deterministic recommendation exists.

    Cache 24h by (probe_id, error_signature).
    """
    import os
    import json
    import re
    emergent_key = os.environ.get("EMERGENT_LLM_KEY")
    if not emergent_key or result.passed:
        return None
    sig = f"{result.probe_id}__{result.error_type or 'x'}__{(result.location or '')[:60]}"
    cached = await db.diagnostic_ai_cache.find_one({"sig": sig}, {"_id": 0})
    if cached:
        try:
            if datetime.fromisoformat(cached["expires_at"]) > _now():
                return cached["rec"]
        except Exception:
            pass
    try:
        from ai_budget import is_within_budget, track_ai_call
        if not await is_within_budget(db, dev_org_id):
            return None
    except Exception:
        pass
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        system = (
            "Eres un experto ingeniero backend de DMX (plataforma real estate LATAM FastAPI+React+MongoDB). "
            "Dado el resultado de una probe fallida, sugiere fix específico. "
            "Output JSON sin markdown: "
            '{"recommendation": "<texto es-MX>", "location": "<archivo:linea o endpoint>", "severity_suggested": "low|medium|high|critical"}'
        )
        user_text = (
            f"Probe: {result.probe_id}\nMódulo: {result.module}\nSeveridad actual: {result.severity}\n"
            f"Error type: {result.error_type}\nLocation: {result.location}\n"
            f"Descripción: {result.description}\nExtra: {result.extra}"
        )
        chat = LlmChat(
            api_key=emergent_key,
            session_id=f"diag_rec_{sig[:40]}",
            system_message=system,
        ).with_model("anthropic", "claude-haiku-4-5")
        raw = await chat.send_message(UserMessage(text=user_text))
        if not raw:
            return None
        text = raw.strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.S).strip()
        rec = json.loads(text)
        try:
            await track_ai_call(
                db, dev_org_id, "claude-haiku-4-5", 0, "diagnostic_recommendation",
                tokens_in=(len(system) + len(user_text)) // 4, tokens_out=len(raw) // 4,
            )
        except Exception:
            pass
        await db.diagnostic_ai_cache.update_one(
            {"sig": sig},
            {"$set": {"sig": sig, "rec": rec,
                      "expires_at": (_now() + timedelta(hours=24)).isoformat()}},
            upsert=True,
        )
        return rec
    except Exception as e:
        log.warning(f"[ai-rec] failed: {e}")
        return None


# ─── Indexes ─────────────────────────────────────────────────────────────────

async def ensure_diagnostic_indexes(db):
    await db.project_diagnostics.create_index([("project_id", 1), ("run_at", -1)], background=True)
    await db.project_diagnostics.create_index([("dev_org_id", 1), ("run_at", -1)], background=True)
    await db.project_diagnostics.create_index("id", unique=True, background=True)
    await db.probe_recurrence.create_index(
        [("probe_id", 1), ("project_id", 1)], unique=True, background=True
    )
    await db.probe_recurrence.create_index([("recurrence_count", -1)], background=True)
    await db.user_diagnostics.create_index([("user_id", 1), ("run_at", -1)], background=True)
    await db.user_problem_reports.create_index([("status", 1), ("created_at", -1)], background=True)
    await db.user_problem_reports.create_index("id", unique=True, background=True)
    await db.diagnostic_ai_cache.create_index("sig", unique=True, background=True)
    await db.diagnostic_ai_cache.create_index("expires_at", expireAfterSeconds=86400, background=True)
