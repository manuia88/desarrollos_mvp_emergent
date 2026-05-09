"""W2.6 SA8 — Anomaly Detection Engine for Founder Console.

Cron `founder_anomaly_detection` runs at 06:00 MX daily. Aggregates last 24h
metrics per source and flags deviations >2σ vs 30d baseline. Each candidate
gets Claude Haiku reasoning (cost-optimized, NOT Sonnet). Inserts into
`db.founder_anomalies` if confidence > 0.7. Emails founder via Resend if
critical, throttled 1/day per source.

Sources detected:
  • ai_cost_spike_per_tenant — unusual MTD spend vs 30d trend
  • tenant_inactivity — >14d no login (last activity in audit_log)
  • ingestion_failures — repeated failed jobs in last 24h
  • metrics_cube_conversion_drop — alcaldia conversion_rate <0.5× 30d avg
  • feature_flag_thrash — same feature toggled on/off rapidly (<1h)
"""
from __future__ import annotations

import logging
import os
import secrets
import statistics
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.anomaly_detection_engine")

ANOMALY_SOURCES = (
    "ai_cost", "tenant_activity", "metrics_cube", "ingestion", "conversion",
)

FOUNDER_ALERT_EMAIL = os.environ.get("FOUNDER_ALERT_EMAIL", "founder@desarrollosmx.io")


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return "anom_" + secrets.token_urlsafe(10)


# ─── Detection sources ────────────────────────────────────────────────────────

async def detect_ai_cost_anomalies(db) -> List[Dict[str, Any]]:
    """Flag tenants whose last 24h spend deviates >2σ from their 30d daily avg."""
    out: List[Dict[str, Any]] = []
    now = datetime.now(timezone.utc)
    since_30d = (now - timedelta(days=30)).isoformat()
    since_24h = (now - timedelta(hours=24)).isoformat()

    try:
        # Get distinct tenants with activity last 30d
        pipeline = [
            {"$match": {"ts": {"$gte": since_30d}}},
            {"$group": {"_id": "$dev_org_id",
                        "total_30d": {"$sum": "$cost_mxn"},
                        "count_30d": {"$sum": 1}}},
        ]
        tenant_rows = []
        async for r in db.ai_call_events.aggregate(pipeline):
            tenant_rows.append(r)

        for tr in tenant_rows:
            tenant_id = tr.get("_id")
            if not tenant_id:
                continue
            total_30d = float(tr.get("total_30d") or 0)
            avg_daily = total_30d / 30.0

            # last 24h spend
            cur_24h = db.ai_call_events.aggregate([
                {"$match": {"dev_org_id": tenant_id, "ts": {"$gte": since_24h}}},
                {"$group": {"_id": None, "total": {"$sum": "$cost_mxn"}}},
            ])
            spend_24h = 0.0
            async for x in cur_24h:
                spend_24h = float(x.get("total") or 0)

            if avg_daily < 5 or spend_24h < 10:  # noise floor
                continue

            # Cheap σ: get daily totals last 30d
            daily_pipeline = [
                {"$match": {"dev_org_id": tenant_id, "ts": {"$gte": since_30d}}},
                {"$group": {"_id": "$daily_iso", "total": {"$sum": "$cost_mxn"}}},
            ]
            daily_totals = []
            async for d in db.ai_call_events.aggregate(daily_pipeline):
                daily_totals.append(float(d.get("total") or 0))
            if len(daily_totals) < 5:
                continue
            try:
                sd = statistics.stdev(daily_totals)
            except Exception:
                sd = 0.0
            if sd <= 0:
                continue

            deviation = (spend_24h - avg_daily) / sd
            if deviation >= 2.0:
                out.append({
                    "source": "ai_cost",
                    "severity": "critical" if deviation >= 3.0 else "warning",
                    "message": f"Spike de costo IA en tenant {tenant_id}: ${spend_24h:.0f} MXN (24h) vs avg ${avg_daily:.0f}/día",
                    "evidence": {
                        "tenant_id": tenant_id,
                        "baseline_daily_avg_mxn": round(avg_daily, 2),
                        "observed_24h_mxn": round(spend_24h, 2),
                        "deviation_sigma": round(deviation, 2),
                        "deviation_pct": round((spend_24h / max(avg_daily, 1) - 1) * 100, 1),
                    },
                })
    except Exception as e:
        log.warning(f"[anomaly] ai_cost detect failed: {e}")
    return out


async def detect_tenant_inactivity(db) -> List[Dict[str, Any]]:
    """Flag tenants with no audit activity in >14 days."""
    out: List[Dict[str, Any]] = []
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=14)).isoformat()
    try:
        async for t in db.tenants.find({}, {"_id": 0}):
            tid = t.get("id") or t.get("tenant_id")
            if not tid:
                continue
            # Only flag enterprise/pro tenants (not free trials)
            plan = (t.get("plan_tier") or "").lower()
            if plan in ("free", "trial", ""):
                continue
            recent = await db.audit_log.find_one(
                {"actor.tenant_id": tid, "ts": {"$gte": cutoff}}, {"_id": 0, "ts": 1},
            )
            if recent:
                continue
            last_any = await db.audit_log.find_one(
                {"actor.tenant_id": tid}, {"_id": 0, "ts": 1}, sort=[("ts", -1)],
            )
            last_ts = (last_any or {}).get("ts")
            days_dark = None
            if last_ts:
                try:
                    d = datetime.fromisoformat(last_ts.replace("Z", "+00:00")) \
                        if isinstance(last_ts, str) else last_ts
                    if d.tzinfo is None:
                        d = d.replace(tzinfo=timezone.utc)
                    days_dark = (now - d).days
                except Exception:
                    pass
            out.append({
                "source": "tenant_activity",
                "severity": "warning",
                "message": f"Tenant {tid} ({t.get('name', '?')}) sin actividad hace {days_dark or '>14'}d (plan {plan})",
                "evidence": {
                    "tenant_id": tid, "plan_tier": plan,
                    "days_dark": days_dark, "last_activity": last_ts,
                },
            })
    except Exception as e:
        log.warning(f"[anomaly] tenant_inactivity failed: {e}")
    return out


async def detect_ingestion_failures(db) -> List[Dict[str, Any]]:
    """Flag if >3 ingestion jobs failed in last 24h."""
    out: List[Dict[str, Any]] = []
    now = datetime.now(timezone.utc)
    since = (now - timedelta(hours=24)).isoformat()
    try:
        # bulk_ingest_jobs collection used by W1.4
        failed = await db.bulk_ingest_jobs.count_documents(
            {"created_at": {"$gte": since}, "status": {"$in": ["failed", "error"]}},
        )
        total = await db.bulk_ingest_jobs.count_documents({"created_at": {"$gte": since}})
        if failed >= 3:
            fail_rate = (failed / max(total, 1)) * 100
            out.append({
                "source": "ingestion",
                "severity": "critical" if failed >= 10 else "warning",
                "message": f"{failed} jobs de ingesta fallaron en 24h ({fail_rate:.0f}% de {total})",
                "evidence": {
                    "failed_count": failed, "total_count": total,
                    "fail_rate_pct": round(fail_rate, 1),
                },
            })
    except Exception as e:
        log.warning(f"[anomaly] ingestion failed: {e}")
    return out


async def detect_conversion_drops(db) -> List[Dict[str, Any]]:
    """Flag alcaldias with conversion_rate <0.5× their 90d trend."""
    out: List[Dict[str, Any]] = []
    try:
        # Compare current period vs 90d period at alcaldia tier
        cur_rows = {}
        async for r in db.cube_aggregations.find(
            {"tier": "alcaldia", "period": "current"}, {"_id": 0},
        ):
            cur_rows[r.get("tier_id")] = r
        async for r in db.cube_aggregations.find(
            {"tier": "alcaldia", "period": "90d"}, {"_id": 0},
        ):
            tid = r.get("tier_id")
            cur = cur_rows.get(tid)
            if not cur:
                continue
            cur_conv = (cur.get("kpis") or {}).get("conversion_rate")
            base_conv = (r.get("kpis") or {}).get("conversion_rate")
            if cur_conv is None or base_conv is None or base_conv < 5:
                continue
            if cur_conv < base_conv * 0.5:
                out.append({
                    "source": "metrics_cube",
                    "severity": "warning",
                    "message": f"Conversión cae en {r.get('name')}: {cur_conv:.1f}% (actual) vs {base_conv:.1f}% (90d)",
                    "evidence": {
                        "tier": "alcaldia", "tier_id": tid, "name": r.get("name"),
                        "current_conversion_pct": cur_conv,
                        "baseline_90d_pct": base_conv,
                        "deviation_pct": round((cur_conv / base_conv - 1) * 100, 1),
                    },
                })
    except Exception as e:
        log.warning(f"[anomaly] conversion_drops failed: {e}")
    return out


async def detect_feature_flag_thrash(db) -> List[Dict[str, Any]]:
    """Same (tenant, feature_key) toggled on→off→on in <1h."""
    out: List[Dict[str, Any]] = []
    now = datetime.now(timezone.utc)
    since = (now - timedelta(hours=24)).isoformat()
    try:
        toggles: Dict[str, List[Dict[str, Any]]] = {}
        async for r in db.audit_log.find(
            {"entity_type": "tenant_feature", "ts": {"$gte": since}}, {"_id": 0},
        ):
            eid = r.get("entity_id") or ""
            toggles.setdefault(eid, []).append(r)
        for eid, events in toggles.items():
            if len(events) < 3:
                continue
            # Sort by ts asc
            events.sort(key=lambda e: e.get("ts") or "")
            try:
                first_ts = events[0].get("ts")
                last_ts = events[-1].get("ts")
                t1 = datetime.fromisoformat(first_ts.replace("Z", "+00:00"))
                t2 = datetime.fromisoformat(last_ts.replace("Z", "+00:00"))
                if t1.tzinfo is None:
                    t1 = t1.replace(tzinfo=timezone.utc)
                if t2.tzinfo is None:
                    t2 = t2.replace(tzinfo=timezone.utc)
                if (t2 - t1).total_seconds() < 3600 and len(events) >= 3:
                    out.append({
                        "source": "tenant_activity",
                        "severity": "info",
                        "message": f"Feature flag thrash: {eid} ({len(events)} cambios <1h)",
                        "evidence": {
                            "entity_id": eid, "toggle_count": len(events),
                            "window_seconds": int((t2 - t1).total_seconds()),
                        },
                    })
            except Exception:
                continue
    except Exception as e:
        log.warning(f"[anomaly] flag_thrash failed: {e}")
    return out


# ─── Claude Haiku reasoning (cost-optimized) ──────────────────────────────────

async def _claude_haiku_reasoning(candidate: Dict[str, Any]) -> Dict[str, Any]:
    """Single Haiku call for reasoning + confidence. Returns {confidence, summary, recommendation}."""
    api_key = os.environ.get("EMERGENT_LLM_KEY") or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return {"confidence": 0.75, "summary": candidate.get("message", ""),
                "recommendation": "Revisar manualmente."}
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
    except Exception:
        return {"confidence": 0.75, "summary": candidate.get("message", ""),
                "recommendation": "Revisar manualmente."}
    try:
        prompt = (
            "Eres un analista del negocio inmobiliario LATAM en español MX. "
            "Te paso una posible anomalía detectada en la plataforma. Responde SOLO con JSON "
            "compacto en español MX con keys: `confidence` (float 0-1), `summary` (string máx 220 chars), "
            "`recommendation` (string máx 180 chars, una acción concreta).\n\n"
            f"Source: {candidate.get('source')}\n"
            f"Severity: {candidate.get('severity')}\n"
            f"Message: {candidate.get('message')}\n"
            f"Evidence: {candidate.get('evidence')}\n"
        )
        chat = LlmChat(
            api_key=api_key, session_id=f"anom-{secrets.token_urlsafe(6)}",
            system_message="Eres un analista financiero inmobiliario. Responde SOLO JSON válido.",
        ).with_model("anthropic", "claude-haiku-4-5").with_max_tokens(280)
        resp = await chat.send_message(UserMessage(text=prompt))
        text = (resp or "").strip()
        # Strip code fences if present
        if "```" in text:
            text = text.split("```")[1] if text.startswith("```") else text
            if text.startswith("json"):
                text = text[4:]
            text = text.strip("` \n")
        import json as _json
        data = _json.loads(text)
        return {
            "confidence": float(data.get("confidence", 0.75)),
            "summary": str(data.get("summary", candidate.get("message", "")))[:300],
            "recommendation": str(data.get("recommendation", ""))[:240],
        }
    except Exception as e:
        log.warning(f"[anomaly] Haiku reasoning failed: {e}")
        return {"confidence": 0.7, "summary": candidate.get("message", ""),
                "recommendation": "Revisar manualmente.", "error": str(e)[:120]}


# ─── Email throttling ─────────────────────────────────────────────────────────

async def _maybe_email_founder(db, anomaly: Dict[str, Any]) -> bool:
    """Send Resend email if critical; throttle 1/day per source."""
    if anomaly.get("severity") != "critical":
        return False
    source = anomaly.get("source")
    today_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    throttle_key = f"founder_anomaly:{source}:{today_iso}"

    existing = await db.founder_email_throttle.find_one(
        {"key": throttle_key}, {"_id": 0},
    )
    if existing:
        return False

    resend_key = os.environ.get("RESEND_API_KEY")
    if not resend_key:
        log.info(f"[anomaly] RESEND_API_KEY missing, skip email for {source}")
        return False
    try:
        import httpx
        ev = anomaly.get("evidence") or {}
        body = {
            "from": "DMX Founder Console <no-reply@desarrollosmx.io>",
            "to": [FOUNDER_ALERT_EMAIL],
            "subject": f"[DMX] Anomalía CRÍTICA · {source}",
            "html": (
                f"<div style='font-family:sans-serif;color:#06080F;'>"
                f"<h2 style='margin:0 0 12px;'>Anomalía detectada</h2>"
                f"<p><strong>Fuente:</strong> {source}<br>"
                f"<strong>Severidad:</strong> {anomaly.get('severity')}<br>"
                f"<strong>Mensaje:</strong> {anomaly.get('message')}</p>"
                f"<p><strong>Evidencia:</strong></p>"
                f"<pre style='background:#F0EBE0;padding:10px;border-radius:6px;font-size:11px;'>"
                f"{ev}</pre>"
                f"<p><a href='https://desarrollosmx.io/superadmin' "
                f"style='background:linear-gradient(90deg,#6366F1,#EC4899);color:#fff;"
                f"padding:8px 18px;border-radius:9999px;text-decoration:none;'>"
                f"Abrir Founder Console</a></p>"
                f"</div>"
            ),
        }
        async with httpx.AsyncClient() as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {resend_key}"},
                json=body, timeout=10,
            )
            ok = r.status_code in (200, 202)
        await db.founder_email_throttle.insert_one({
            "key": throttle_key, "source": source, "sent_at": _iso(), "ok": ok,
        })
        return ok
    except Exception as e:
        log.warning(f"[anomaly] email send failed: {e}")
        return False


# ─── Cron entrypoint ──────────────────────────────────────────────────────────

async def run_anomaly_detection(db) -> Dict[str, Any]:
    """Cron entrypoint at 06:00 MX. Runs all detectors, reasons via Haiku,
    inserts qualifying anomalies, emails critical (throttled).
    """
    started = datetime.now(timezone.utc)
    candidates: List[Dict[str, Any]] = []
    candidates.extend(await detect_ai_cost_anomalies(db))
    candidates.extend(await detect_tenant_inactivity(db))
    candidates.extend(await detect_ingestion_failures(db))
    candidates.extend(await detect_conversion_drops(db))
    candidates.extend(await detect_feature_flag_thrash(db))

    inserted = 0
    emailed = 0
    ai_cost_total = 0.0
    for c in candidates:
        # Dedup: check if same (source, fingerprint of message) already open
        try:
            same = await db.founder_anomalies.find_one({
                "source": c["source"],
                "message": c["message"],
                "status": {"$in": ["open", "investigating"]},
            }, {"_id": 0, "id": 1})
            if same:
                continue
        except Exception:
            pass

        # Haiku reasoning
        reasoning = await _claude_haiku_reasoning(c)
        # Track AI cost (rough: 200 in + 200 out tokens for haiku)
        try:
            from ai_budget import track_ai_call
            await track_ai_call(
                db, dev_org_id="dmx_internal", model="claude-haiku-4-5-20251001",
                tokens=400, call_type="anomaly_reasoning",
                tokens_in=200, tokens_out=200, feature_key="founder_anomaly_detection",
            )
            ai_cost_total += 0.04  # ~MXN per call estimate
        except Exception:
            pass

        if reasoning.get("confidence", 0) < 0.7:
            continue

        doc = {
            "id": _new_id(),
            "detected_at": _iso(),
            "source": c["source"],
            "severity": c["severity"],
            "message": c["message"],
            "evidence": c.get("evidence", {}),
            "claude_reasoning": reasoning,
            "status": "open",
            "ai_cost_mxn": 0.04,
        }
        try:
            await db.founder_anomalies.insert_one(dict(doc))
            inserted += 1
        except Exception as e:
            log.warning(f"[anomaly] insert failed: {e}")
            continue

        if await _maybe_email_founder(db, doc):
            emailed += 1

    elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    summary = {
        "ok": True, "candidates": len(candidates), "inserted": inserted,
        "emailed": emailed, "ai_cost_mxn": round(ai_cost_total, 2),
        "elapsed_s": round(elapsed, 2), "completed_at": _iso(),
    }
    log.info(f"[anomaly] run done — {summary}")
    return summary


# ─── Cron registration helper ─────────────────────────────────────────────────

def schedule_anomaly_detection_cron(scheduler, db) -> None:
    """Register cron `founder_anomaly_detection` at 06:00 MX."""
    try:
        from cron_heartbeat import wrap_apscheduler_job
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            wrap_apscheduler_job(run_anomaly_detection, "founder_anomaly_detection"),
            CronTrigger(hour=6, minute=0, timezone="America/Mexico_City"),
            args=[db], id="founder_anomaly_detection",
            replace_existing=True, misfire_grace_time=1800,
        )
    except Exception as e:
        log.warning(f"[anomaly] schedule failed: {e}")


async def ensure_indexes(db) -> None:
    try:
        await db.founder_anomalies.create_index(
            [("status", 1), ("detected_at", -1)], name="anom_status_date",
        )
        await db.founder_anomalies.create_index([("source", 1)], name="anom_source")
        await db.founder_anomalies.create_index("id", unique=True, name="anom_id_uniq")
        await db.founder_quick_actions.create_index(
            [("user_id", 1), ("sort_order", 1)], name="qa_user_order",
        )
        await db.founder_email_throttle.create_index(
            [("key", 1)], unique=True, name="anom_throttle_key",
        )
    except Exception as e:
        log.warning(f"[anomaly] ensure_indexes failed: {e}")
