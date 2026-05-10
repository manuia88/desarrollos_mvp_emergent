"""W4.8 Y.5 — Observability + Replay Debugger + AI ROI per-Dev Engine.

Cuatro módulos integrados que cierran Phase Y al 100%:

1. AuditReplay      — timeline cronológica de TODA la actividad agentic por target.
2. MLAccuracy       — accuracy real (rolling 30/90/180d) de features ML medibles.
3. ReplayDebugger   — re-ejecuta un evento Phase Y en simulation_mode (no afecta data).
4. AIROIPerDev      — ROI monetario consolidado por org (lift_mxn / cost_mxn).

Collections nuevas: audit_replay_events · ml_accuracy_log · ai_roi_per_dev
Reusa: subagent_runs · lead_routings · visit_prep_dossiers · email_replies ·
       disc_profiles · nurture_sequences · whatif_scenarios · director_messages ·
       atlax_messages · argumentario_scripts · pricing_recommendations ·
       marketing_recommendations · lead_recommendations.

Phase Y guard: feature_tiers.observability_dashboard ≥ T1 (developer self) ·
               superadmin always · master_switch off → 503 graceful.
"""
from __future__ import annotations

import logging
import math
import statistics
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.agentic_crm.observability")

USD_TO_MXN = 18.0  # tipo de cambio aproximado para ROI rollups
HOURS_SAVED = {
    "smart_routing":   0.4,   # vs manual ~24h pero traducido a hora-hombre real
    "visit_prep":      0.5,
    "argumentario":    1.0,
    "reply_classifier": 0.083,  # 5 min/reply
    "nurture_touch":   0.25,
    "disc_inference":  0.166,
}
ASESOR_HOURLY_MXN = 250.0  # benchmark CDMX asesor inmobiliario


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Any) -> Optional[str]:
    if isinstance(dt, datetime):
        return dt.isoformat()
    if isinstance(dt, str):
        return dt
    return None


# ─── Phase Y guard helper (compartido) ────────────────────────────────────────
async def _check_observability_access(db, org_id: str) -> Tuple[bool, str]:
    """Returns (allowed, tier_or_reason)."""
    try:
        from routes_phase_y_controls import get_phase_y_settings
        s = await get_phase_y_settings(db, org_id)
        if not s.get("agentic_enabled", False):
            return False, "master_switch_off"
        tier = (s.get("feature_tiers") or {}).get("observability_dashboard", "off")
        if not tier or tier == "off":
            return False, "tier_off"
        return True, tier
    except Exception as exc:
        log.warning(f"[observability] phase_y check failed ({org_id}): {exc}")
        return False, f"phase_y_check_error: {exc}"


# ═══════════════════════════════════════════════════════════════════════════════
# 1) AUDIT REPLAY
# ═══════════════════════════════════════════════════════════════════════════════
class AuditReplay:
    """Timeline cronológica unificada de actividad agentic por target."""

    EVENT_SOURCES = (
        "subagent_runs", "lead_routings", "visit_prep_dossiers", "email_replies",
        "disc_profiles", "nurture_sequences", "argumentario_scripts",
        "director_messages", "atlax_messages", "whatif_scenarios",
    )

    def __init__(self, db):
        self.db = db

    async def record_event(self, event: Dict[str, Any]) -> str:
        """Persiste un evento en audit_replay_events.

        Schema mínimo: org_id, target_type, target_id, event_type, created_at.
        Otros: event_subtype, agent_name, input_summary, output_summary, layer_used,
        latency_ms, cost_usd, parent_event_id, tier_at_time.
        """
        if not event.get("org_id") or not event.get("event_type"):
            log.warning("[audit_replay] skipping event sin org_id/event_type")
            return ""
        doc = {
            "_id": event.get("_id") or f"are_{uuid.uuid4().hex[:14]}",
            "org_id": event["org_id"],
            "target_type": event.get("target_type", "org"),
            "target_id": event.get("target_id") or event["org_id"],
            "event_type": event["event_type"],
            "event_subtype": event.get("event_subtype"),
            "agent_name": event.get("agent_name"),
            "input_summary": str(event.get("input_summary") or "")[:500],
            "output_summary": str(event.get("output_summary") or "")[:500],
            "layer_used": event.get("layer_used"),
            "latency_ms": event.get("latency_ms"),
            "cost_usd": event.get("cost_usd"),
            "parent_event_id": event.get("parent_event_id"),
            "tier_at_time": event.get("tier_at_time"),
            "created_at": event.get("created_at") or _now(),
        }
        try:
            await self.db.audit_replay_events.insert_one(doc)
            return doc["_id"]
        except Exception as exc:
            log.warning(f"[audit_replay] insert failed: {exc}")
            return ""

    async def get_timeline(
        self, org_id: str, target_type: str, target_id: str,
        days: int = 30, limit: int = 500,
    ) -> Dict[str, Any]:
        """Reconstruye timeline cruzando audit_replay_events + collections nativas.

        Estrategia: derivar eventos en vivo de las collections existentes (sin
        depender de inserts exhaustivos) + merge con cualquier evento explícito
        en audit_replay_events.
        """
        since = _now() - timedelta(days=days)
        events: List[Dict[str, Any]] = []

        # 1) Explicit audit_replay_events
        try:
            cur = self.db.audit_replay_events.find(
                {"org_id": org_id, "target_id": target_id,
                 "created_at": {"$gte": since}},
                {"_id": 1, "event_type": 1, "event_subtype": 1, "agent_name": 1,
                 "input_summary": 1, "output_summary": 1, "layer_used": 1,
                 "latency_ms": 1, "cost_usd": 1, "parent_event_id": 1,
                 "tier_at_time": 1, "created_at": 1, "target_type": 1},
            ).sort("created_at", -1).limit(limit)
            async for d in cur:
                d["_source"] = "audit_replay_events"
                events.append(d)
        except Exception as exc:
            log.warning(f"[audit_replay] events read fail: {exc}")

        # 2) Smart routings (target_type=lead)
        if target_type == "lead":
            try:
                cur = self.db.lead_routings.find(
                    {"org_id": org_id, "lead_id": target_id,
                     "routed_at": {"$gte": since}},
                    {"_id": 1, "suggested_asesor_id": 1, "fit_score": 1,
                     "status": 1, "routing_layer": 1, "routed_at": 1,
                     "latency_ms": 1, "cost_usd": 1},
                ).sort("routed_at", -1).limit(limit)
                async for d in cur:
                    events.append({
                        "_id": d.get("_id") or f"sr_{d.get('lead_id', '?')}",
                        "event_type": "smart_routing",
                        "event_subtype": d.get("status"),
                        "agent_name": "SmartRoutingEngine",
                        "input_summary": f"lead={target_id}",
                        "output_summary": f"asesor={d.get('suggested_asesor_id')} fit={d.get('fit_score')} status={d.get('status')}",
                        "layer_used": d.get("routing_layer"),
                        "latency_ms": d.get("latency_ms"),
                        "cost_usd": d.get("cost_usd"),
                        "tier_at_time": None,
                        "created_at": d.get("routed_at"),
                        "_source": "lead_routings",
                    })
            except Exception:
                pass

            # Visit prep dossiers
            try:
                cur = self.db.visit_prep_dossiers.find(
                    {"org_id": org_id, "lead_id": target_id,
                     "dossier_generated_at": {"$gte": since}},
                    {"_id": 1, "asesor_id": 1, "project_id": 1,
                     "layer_used": 1, "dossier_generated_at": 1,
                     "tokens": 1, "cost_usd": 1, "latency_ms": 1, "status": 1},
                ).sort("dossier_generated_at", -1).limit(limit)
                async for d in cur:
                    events.append({
                        "_id": d.get("_id"),
                        "event_type": "visit_prep",
                        "event_subtype": d.get("status"),
                        "agent_name": "VisitPrepEngine",
                        "input_summary": f"lead={target_id} project={d.get('project_id')}",
                        "output_summary": f"asesor={d.get('asesor_id')} layer={d.get('layer_used')}",
                        "layer_used": d.get("layer_used"),
                        "latency_ms": d.get("latency_ms"),
                        "cost_usd": d.get("cost_usd"),
                        "created_at": d.get("dossier_generated_at"),
                        "_source": "visit_prep_dossiers",
                    })
            except Exception:
                pass

            # Email replies clasificados
            try:
                cur = self.db.email_replies.find(
                    {"org_id": org_id, "lead_id": target_id,
                     "received_at": {"$gte": since}},
                    {"_id": 1, "from_email": 1, "subject": 1,
                     "classification": 1, "classified_at": 1,
                     "received_at": 1, "cost_usd": 1, "layer_used": 1,
                     "status": 1},
                ).sort("received_at", -1).limit(limit)
                async for d in cur:
                    cls = d.get("classification") or {}
                    events.append({
                        "_id": d.get("_id"),
                        "event_type": "reply_classifier",
                        "event_subtype": cls.get("category") or d.get("status"),
                        "agent_name": "ReplyClassifierEngine",
                        "input_summary": f"from={d.get('from_email')} subject={(d.get('subject') or '')[:60]}",
                        "output_summary": f"cat={cls.get('category')} urg={cls.get('urgency')} conf={cls.get('confidence_score')}",
                        "layer_used": d.get("layer_used") or cls.get("layer_used"),
                        "cost_usd": d.get("cost_usd"),
                        "created_at": d.get("classified_at") or d.get("received_at"),
                        "_source": "email_replies",
                    })
            except Exception:
                pass

            # DISC profiles
            try:
                doc = await self.db.disc_profiles.find_one(
                    {"org_id": org_id, "lead_id": target_id,
                     "inferred_at": {"$gte": since}},
                    {"_id": 1, "predominant_type": 1, "confidence_score": 1,
                     "layer_used": 1, "inferred_at": 1, "cost_usd": 1},
                )
                if doc:
                    events.append({
                        "_id": doc.get("_id"),
                        "event_type": "disc",
                        "event_subtype": doc.get("predominant_type"),
                        "agent_name": "DISCInferencer",
                        "input_summary": f"lead={target_id}",
                        "output_summary": f"type={doc.get('predominant_type')} conf={doc.get('confidence_score')}",
                        "layer_used": doc.get("layer_used"),
                        "cost_usd": doc.get("cost_usd"),
                        "created_at": doc.get("inferred_at"),
                        "_source": "disc_profiles",
                    })
            except Exception:
                pass

            # Nurture sequences
            try:
                doc = await self.db.nurture_sequences.find_one(
                    {"org_id": org_id, "lead_id": target_id},
                    {"_id": 1, "sequence_type": 1, "status": 1,
                     "current_step": 1, "total_steps": 1, "layer_used": 1,
                     "generated_at": 1, "cost_usd": 1},
                )
                if doc and doc.get("generated_at"):
                    gen = doc.get("generated_at")
                    if isinstance(gen, str):
                        try:
                            gen = datetime.fromisoformat(gen.replace("Z", "+00:00"))
                        except Exception:
                            gen = None
                    if not gen or gen >= since:
                        events.append({
                            "_id": doc.get("_id"),
                            "event_type": "nurture_sequence",
                            "event_subtype": doc.get("status"),
                            "agent_name": "NurtureIntelligentEngine",
                            "input_summary": f"lead={target_id} type={doc.get('sequence_type')}",
                            "output_summary": f"step {doc.get('current_step')}/{doc.get('total_steps')} layer={doc.get('layer_used')}",
                            "layer_used": doc.get("layer_used"),
                            "cost_usd": doc.get("cost_usd"),
                            "created_at": doc.get("generated_at"),
                            "_source": "nurture_sequences",
                        })
            except Exception:
                pass

            # Argumentario
            try:
                doc = await self.db.argumentario_scripts.find_one(
                    {"org_id": org_id, "lead_id": target_id},
                    {"id": 1, "disc_type": 1, "layer_used": 1, "status": 1,
                     "generated_at": 1, "cost_usd": 1, "tokens": 1},
                )
                if doc:
                    events.append({
                        "_id": doc.get("id") or f"arg_{target_id}",
                        "event_type": "argumentario",
                        "event_subtype": doc.get("status"),
                        "agent_name": "ArgumentarioEngine",
                        "input_summary": f"lead={target_id} disc={doc.get('disc_type')}",
                        "output_summary": f"layer={doc.get('layer_used')} status={doc.get('status')} tokens={doc.get('tokens')}",
                        "layer_used": doc.get("layer_used"),
                        "cost_usd": doc.get("cost_usd"),
                        "created_at": doc.get("generated_at"),
                        "_source": "argumentario_scripts",
                    })
            except Exception:
                pass

            # Atlax messages
            try:
                cur = self.db.atlax_messages.find(
                    {"org_id": org_id, "lead_id": target_id,
                     "created_at": {"$gte": since}},
                    {"_id": 1, "role": 1, "content": 1, "intent": 1,
                     "created_at": 1, "cost_usd": 1, "layer_used": 1},
                ).sort("created_at", -1).limit(50)
                async for d in cur:
                    events.append({
                        "_id": d.get("_id"),
                        "event_type": "atlax_message",
                        "event_subtype": d.get("role"),
                        "agent_name": "AtlaxEngine",
                        "input_summary": f"role={d.get('role')} intent={d.get('intent')}",
                        "output_summary": str(d.get("content") or "")[:120],
                        "layer_used": d.get("layer_used"),
                        "cost_usd": d.get("cost_usd"),
                        "created_at": d.get("created_at"),
                        "_source": "atlax_messages",
                    })
            except Exception:
                pass

        # 3) Project-level: subagent_runs + director_messages
        if target_type == "project":
            try:
                cur = self.db.subagent_runs.find(
                    {"org_id": org_id, "project_id": target_id,
                     "created_at": {"$gte": since}},
                    {"_id": 1, "agent_type": 1, "status": 1,
                     "fallback_layer": 1, "tokens_in": 1, "tokens_out": 1,
                     "cost_usd": 1, "latency_ms": 1, "output_summary": 1,
                     "created_at": 1},
                ).sort("created_at", -1).limit(limit)
                async for d in cur:
                    events.append({
                        "_id": d.get("_id"),
                        "event_type": "sub_agent_run",
                        "event_subtype": d.get("agent_type"),
                        "agent_name": f"{d.get('agent_type')}_agent",
                        "input_summary": f"project={target_id}",
                        "output_summary": d.get("output_summary"),
                        "layer_used": d.get("fallback_layer") or "llm",
                        "cost_usd": d.get("cost_usd"),
                        "latency_ms": d.get("latency_ms"),
                        "created_at": d.get("created_at"),
                        "_source": "subagent_runs",
                    })
            except Exception:
                pass

        # 4) Org-level: director_messages + whatif_scenarios
        if target_type == "org":
            try:
                cur = self.db.director_messages.find(
                    {"org_id": org_id, "created_at": {"$gte": since}},
                    {"_id": 1, "role": 1, "session_id": 1, "tool_calls": 1,
                     "cost_usd": 1, "layer_used": 1, "created_at": 1,
                     "content": 1},
                ).sort("created_at", -1).limit(80)
                async for d in cur:
                    tc = len(d.get("tool_calls") or [])
                    events.append({
                        "_id": d.get("_id"),
                        "event_type": "director_call",
                        "event_subtype": d.get("role"),
                        "agent_name": "DirectorAgent",
                        "input_summary": f"session={d.get('session_id')} role={d.get('role')}",
                        "output_summary": f"tool_calls={tc} content={(d.get('content') or '')[:80]}",
                        "layer_used": d.get("layer_used"),
                        "cost_usd": d.get("cost_usd"),
                        "created_at": d.get("created_at"),
                        "_source": "director_messages",
                    })
            except Exception:
                pass

            try:
                cur = self.db.whatif_scenarios.find(
                    {"org_id": org_id, "created_at": {"$gte": since}},
                    {"_id": 1, "scenario_name": 1, "status": 1,
                     "result_summary": 1, "cost_usd": 1, "created_at": 1},
                ).sort("created_at", -1).limit(40)
                async for d in cur:
                    events.append({
                        "_id": d.get("_id"),
                        "event_type": "whatif",
                        "event_subtype": d.get("status"),
                        "agent_name": "WhatIfEngine",
                        "input_summary": d.get("scenario_name"),
                        "output_summary": str(d.get("result_summary") or "")[:120],
                        "cost_usd": d.get("cost_usd"),
                        "created_at": d.get("created_at"),
                        "_source": "whatif_scenarios",
                    })
            except Exception:
                pass

        # Sort timeline desc by created_at, isoformat datetimes
        def _ts(e):
            t = e.get("created_at")
            if isinstance(t, datetime):
                return t.timestamp()
            if isinstance(t, str):
                try:
                    return datetime.fromisoformat(t.replace("Z", "+00:00")).timestamp()
                except Exception:
                    return 0
            return 0

        events.sort(key=_ts, reverse=True)
        for e in events:
            if isinstance(e.get("created_at"), datetime):
                e["created_at"] = e["created_at"].isoformat()

        # Aggregate stats
        total_cost = sum(float(e.get("cost_usd") or 0) for e in events)
        by_type: Dict[str, int] = {}
        by_layer: Dict[str, int] = {}
        for e in events:
            by_type[e["event_type"]] = by_type.get(e["event_type"], 0) + 1
            ly = e.get("layer_used") or "n/a"
            by_layer[ly] = by_layer.get(ly, 0) + 1

        return {
            "ok": True,
            "org_id": org_id,
            "target_type": target_type,
            "target_id": target_id,
            "days": days,
            "total_events": len(events),
            "total_cost_usd": round(total_cost, 6),
            "by_event_type": by_type,
            "by_layer_used": by_layer,
            "events": events[:limit],
        }


# ═══════════════════════════════════════════════════════════════════════════════
# 2) ML ACCURACY (rolling)
# ═══════════════════════════════════════════════════════════════════════════════
class MLAccuracy:
    """Accuracy real de features ML medibles · MAPE + hit_rate."""

    FEATURES = (
        "pricing_rec", "smart_routing", "nurture_seq",
        "disc_inference", "argumentario", "avm",
    )

    def __init__(self, db):
        self.db = db

    async def compute_accuracy(
        self, feature_name: str, org_id: Optional[str] = None, days: int = 30,
    ) -> Dict[str, Any]:
        """Calcula MAPE + hit_rate para un feature en un periodo."""
        since = _now() - timedelta(days=days)
        result: Dict[str, Any] = {
            "ok": True,
            "feature_name": feature_name,
            "org_id": org_id,
            "days": days,
            "period_start": since.isoformat(),
            "period_end": _now().isoformat(),
            "sample_size": 0,
            "metrics": {},
        }

        if feature_name == "pricing_rec":
            result.update(await self._accuracy_pricing(since, org_id))
        elif feature_name == "smart_routing":
            result.update(await self._accuracy_routing(since, org_id))
        elif feature_name == "nurture_seq":
            result.update(await self._accuracy_nurture(since, org_id))
        elif feature_name == "disc_inference":
            result.update(await self._accuracy_disc(since, org_id))
        elif feature_name == "argumentario":
            result.update(await self._accuracy_argumentario(since, org_id))
        elif feature_name == "avm":
            result.update(await self._accuracy_avm(since, org_id))
        else:
            result["error"] = f"feature {feature_name} no soportado"

        # Persist rollup
        try:
            await self.db.ml_accuracy_log.insert_one({
                "_id": f"mla_{uuid.uuid4().hex[:12]}",
                "feature_name": feature_name,
                "org_id": org_id or "_all",
                "period_start": since,
                "period_end": _now(),
                "sample_size": result.get("sample_size", 0),
                "metrics": result.get("metrics", {}),
                "computed_at": _now(),
            })
        except Exception:
            pass

        return result

    async def _accuracy_pricing(self, since, org_id):
        q: Dict[str, Any] = {
            "status": "applied",
            "applied_at": {"$gte": since},
        }
        if org_id:
            q["org_id"] = org_id
        cur = self.db.pricing_recommendations.find(
            q, {"_id": 0, "delta_pct": 1, "expected_lift_pct": 1,
                "actual_lift_pct": 1, "applied_at": 1},
        ).limit(500)
        errors: List[float] = []
        applied = 0
        async for d in cur:
            applied += 1
            exp = float(d.get("expected_lift_pct") or 0)
            act = d.get("actual_lift_pct")
            if act is not None and exp != 0:
                err = abs(exp - float(act)) / abs(exp) * 100
                errors.append(err)
        mape = round(statistics.mean(errors), 2) if errors else None
        return {
            "sample_size": applied,
            "metrics": {
                "applied_recommendations": applied,
                "with_actuals": len(errors),
                "MAPE_pct": mape,
                "hit_rate_pct": (
                    round(100 * sum(1 for e in errors if e < 30) / len(errors), 1)
                    if errors else None
                ),
            },
        }

    async def _accuracy_routing(self, since, org_id):
        q: Dict[str, Any] = {"routed_at": {"$gte": since}}
        if org_id:
            q["org_id"] = org_id
        cur = self.db.lead_routings.find(
            q, {"_id": 0, "lead_id": 1, "fit_score": 1, "status": 1},
        ).limit(1000)
        accepted = 0
        accepted_high_fit = 0
        rejected_high_fit = 0
        total = 0
        lead_ids_won: List[str] = []
        accepted_lead_ids: List[str] = []
        async for d in cur:
            total += 1
            fit = float(d.get("fit_score") or 0)
            st = d.get("status")
            if st == "accepted":
                accepted += 1
                accepted_lead_ids.append(d.get("lead_id"))
                if fit >= 70:
                    accepted_high_fit += 1
            elif st == "rejected" and fit >= 70:
                rejected_high_fit += 1

        # Conversion correlation
        if accepted_lead_ids:
            try:
                won_cur = self.db.leads.find(
                    {"id": {"$in": accepted_lead_ids[:500]},
                     "status": {"$in": ["closed_won", "ganado", "closed"]}},
                    {"_id": 0, "id": 1},
                ).limit(500)
                async for ld in won_cur:
                    lead_ids_won.append(ld["id"])
            except Exception:
                pass

        conv_rate = (
            round(100 * len(lead_ids_won) / accepted, 2) if accepted else None
        )
        return {
            "sample_size": total,
            "metrics": {
                "total_routings": total,
                "accepted": accepted,
                "accepted_high_fit_pct": (
                    round(100 * accepted_high_fit / accepted, 1) if accepted else None
                ),
                "rejected_high_fit_anomaly": rejected_high_fit,
                "conversion_rate_pct": conv_rate,
                "wins": len(lead_ids_won),
            },
        }

    async def _accuracy_nurture(self, since, org_id):
        q: Dict[str, Any] = {"generated_at": {"$gte": since}}
        if org_id:
            q["org_id"] = org_id
        cur = self.db.nurture_sequences.find(
            q, {"_id": 0, "touches": 1, "status": 1},
        ).limit(800)
        sent_total = 0
        opened = 0
        replied = 0
        completed = 0
        total_seq = 0
        async for s in cur:
            total_seq += 1
            if s.get("status") == "completed":
                completed += 1
            for t in s.get("touches") or []:
                if t.get("sent_at"):
                    sent_total += 1
                    if t.get("opened_at"):
                        opened += 1
                    if t.get("replied_at"):
                        replied += 1
        return {
            "sample_size": total_seq,
            "metrics": {
                "sequences_generated": total_seq,
                "sequences_completed": completed,
                "sent_touches": sent_total,
                "open_rate_pct": (
                    round(100 * opened / sent_total, 1) if sent_total else None
                ),
                "reply_rate_pct": (
                    round(100 * replied / sent_total, 1) if sent_total else None
                ),
            },
        }

    async def _accuracy_disc(self, since, org_id):
        q: Dict[str, Any] = {"inferred_at": {"$gte": since}}
        if org_id:
            q["org_id"] = org_id
        cur = self.db.disc_profiles.find(
            q, {"_id": 0, "lead_id": 1, "predominant_type": 1,
                "confidence_score": 1, "layer_used": 1},
        ).limit(800)
        total = 0
        confidences: List[float] = []
        type_counts: Dict[str, int] = {}
        async for d in cur:
            total += 1
            c = float(d.get("confidence_score") or 0)
            if c > 0:
                confidences.append(c)
            t = d.get("predominant_type") or "unknown"
            type_counts[t] = type_counts.get(t, 0) + 1
        return {
            "sample_size": total,
            "metrics": {
                "profiles_inferred": total,
                "avg_confidence": (
                    round(statistics.mean(confidences), 2) if confidences else None
                ),
                "type_distribution": type_counts,
            },
        }

    async def _accuracy_argumentario(self, since, org_id):
        q: Dict[str, Any] = {"generated_at": {"$gte": since.isoformat()}}
        if org_id:
            q["org_id"] = org_id
        cur = self.db.argumentario_scripts.find(
            q, {"_id": 0, "status": 1, "layer_used": 1, "cost_usd": 1},
        ).limit(800)
        generated = 0
        used = 0
        total_cost = 0.0
        by_layer: Dict[str, int] = {}
        async for d in cur:
            generated += 1
            if d.get("status") == "used":
                used += 1
            total_cost += float(d.get("cost_usd") or 0)
            ly = d.get("layer_used") or "unknown"
            by_layer[ly] = by_layer.get(ly, 0) + 1
        adoption = round(100 * used / generated, 1) if generated else None
        return {
            "sample_size": generated,
            "metrics": {
                "argumentarios_generated": generated,
                "argumentarios_used": used,
                "adoption_rate_pct": adoption,
                "total_cost_usd": round(total_cost, 4),
                "by_layer": by_layer,
            },
        }

    async def _accuracy_avm(self, since, org_id):
        q: Dict[str, Any] = {"created_at": {"$gte": since}}
        if org_id:
            q["org_id"] = org_id
        try:
            cur = self.db.avm_runs.find(
                q, {"_id": 0, "estimated_value": 1, "actual_sale_price": 1},
            ).limit(500)
            errs: List[float] = []
            n = 0
            async for d in cur:
                n += 1
                e = d.get("estimated_value")
                a = d.get("actual_sale_price")
                if e and a and e > 0:
                    errs.append(abs(float(e) - float(a)) / float(e) * 100)
            return {
                "sample_size": n,
                "metrics": {
                    "avm_runs": n,
                    "with_actuals": len(errs),
                    "MAPE_pct": (
                        round(statistics.mean(errs), 2) if errs else None
                    ),
                },
            }
        except Exception:
            return {"sample_size": 0,
                    "metrics": {"avm_runs": 0, "note": "avm_runs collection no presente"}}

    async def get_accuracy_dashboard(
        self, org_id: Optional[str] = None, days: int = 30,
    ) -> Dict[str, Any]:
        """Dashboard cross-feature."""
        out: Dict[str, Any] = {
            "ok": True, "org_id": org_id, "days": days,
            "computed_at": _now().isoformat(), "features": {},
        }
        for f in self.FEATURES:
            try:
                out["features"][f] = await self.compute_accuracy(f, org_id, days)
            except Exception as exc:
                log.warning(f"[ml_accuracy] {f} failed: {exc}")
                out["features"][f] = {"error": str(exc)}
        return out


# ═══════════════════════════════════════════════════════════════════════════════
# 3) REPLAY DEBUGGER
# ═══════════════════════════════════════════════════════════════════════════════
class ReplayDebugger:
    """Re-ejecuta evento Phase Y en simulation_mode · NO afecta data real."""

    REPLAYABLE_TYPES = {
        "argumentario", "smart_routing", "visit_prep",
        "disc", "reply_classifier", "nurture_sequence",
    }

    def __init__(self, db):
        self.db = db

    async def list_replayable_events(
        self, org_id: str, days: int = 7, limit: int = 100,
    ) -> Dict[str, Any]:
        """Lista eventos de los últimos N días replayables."""
        since = _now() - timedelta(days=days)
        items: List[Dict[str, Any]] = []

        # argumentario_scripts
        try:
            cur = self.db.argumentario_scripts.find(
                {"org_id": org_id, "generated_at": {"$gte": since.isoformat()}},
                {"_id": 0, "id": 1, "lead_id": 1, "asesor_id": 1,
                 "disc_type": 1, "layer_used": 1, "status": 1,
                 "generated_at": 1, "cost_usd": 1},
            ).sort("generated_at", -1).limit(limit)
            async for d in cur:
                items.append({
                    "event_id": d.get("id"),
                    "event_type": "argumentario",
                    "target_type": "lead",
                    "target_id": d.get("lead_id"),
                    "asesor_id": d.get("asesor_id"),
                    "subtype": d.get("disc_type"),
                    "layer_used": d.get("layer_used"),
                    "status": d.get("status"),
                    "cost_usd": d.get("cost_usd"),
                    "created_at": d.get("generated_at"),
                })
        except Exception:
            pass

        # lead_routings
        try:
            cur = self.db.lead_routings.find(
                {"org_id": org_id, "routed_at": {"$gte": since}},
                {"_id": 1, "lead_id": 1, "suggested_asesor_id": 1,
                 "routing_layer": 1, "status": 1, "routed_at": 1,
                 "fit_score": 1, "cost_usd": 1},
            ).sort("routed_at", -1).limit(limit)
            async for d in cur:
                items.append({
                    "event_id": d.get("_id"),
                    "event_type": "smart_routing",
                    "target_type": "lead",
                    "target_id": d.get("lead_id"),
                    "subtype": f"fit={d.get('fit_score')}",
                    "layer_used": d.get("routing_layer"),
                    "status": d.get("status"),
                    "cost_usd": d.get("cost_usd"),
                    "created_at": _iso(d.get("routed_at")),
                })
        except Exception:
            pass

        # visit_prep_dossiers
        try:
            cur = self.db.visit_prep_dossiers.find(
                {"org_id": org_id, "dossier_generated_at": {"$gte": since}},
                {"_id": 1, "lead_id": 1, "asesor_id": 1, "project_id": 1,
                 "layer_used": 1, "dossier_generated_at": 1,
                 "visit_scheduled_at": 1, "status": 1, "cost_usd": 1},
            ).sort("dossier_generated_at", -1).limit(limit)
            async for d in cur:
                items.append({
                    "event_id": d.get("_id"),
                    "event_type": "visit_prep",
                    "target_type": "lead",
                    "target_id": d.get("lead_id"),
                    "asesor_id": d.get("asesor_id"),
                    "project_id": d.get("project_id"),
                    "subtype": _iso(d.get("visit_scheduled_at")),
                    "layer_used": d.get("layer_used"),
                    "status": d.get("status"),
                    "cost_usd": d.get("cost_usd"),
                    "created_at": _iso(d.get("dossier_generated_at")),
                })
        except Exception:
            pass

        # disc_profiles
        try:
            cur = self.db.disc_profiles.find(
                {"org_id": org_id, "inferred_at": {"$gte": since}},
                {"_id": 1, "lead_id": 1, "predominant_type": 1,
                 "layer_used": 1, "inferred_at": 1, "cost_usd": 1},
            ).sort("inferred_at", -1).limit(limit)
            async for d in cur:
                items.append({
                    "event_id": d.get("_id"),
                    "event_type": "disc",
                    "target_type": "lead",
                    "target_id": d.get("lead_id"),
                    "subtype": d.get("predominant_type"),
                    "layer_used": d.get("layer_used"),
                    "cost_usd": d.get("cost_usd"),
                    "created_at": _iso(d.get("inferred_at")),
                })
        except Exception:
            pass

        # Sort desc by created_at
        items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        return {
            "ok": True, "org_id": org_id, "days": days,
            "total": len(items), "events": items[:limit],
        }

    async def replay_event(
        self, org_id: str, event_id: str, event_type: str,
        actor_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Re-ejecuta el engine en simulation_mode con los inputs originales.

        Estrategia: lee el doc original · invoca el engine pertinente con
        simulation_override=True · captura step-by-step · NO persiste fuera de
        log_activity.
        """
        if event_type not in self.REPLAYABLE_TYPES:
            return {"ok": False, "error": f"event_type {event_type} no replayable"}

        original: Optional[Dict[str, Any]] = None
        replay_output: Optional[Dict[str, Any]] = None
        replay_layer: Optional[str] = None
        replay_error: Optional[str] = None
        steps: List[Dict[str, Any]] = []

        try:
            if event_type == "argumentario":
                original = await self.db.argumentario_scripts.find_one(
                    {"id": event_id, "org_id": org_id}, {"_id": 0},
                )
                if not original:
                    return {"ok": False, "error": "evento original no encontrado"}
                steps.append({"step": 1, "phase": "fetch_original",
                              "data": {"lead_id": original.get("lead_id"),
                                       "disc_type": original.get("disc_type"),
                                       "layer_used": original.get("layer_used")}})

                # Force simulation_mode at engine level
                from agentic_crm.argumentario_engine import _build_heuristic_argumentario
                steps.append({"step": 2, "phase": "force_simulation_mode",
                              "data": {"reason": "replay_debugger always uses sim"}})

                # Re-fetch lead context (mismo input)
                lead = await self.db.leads.find_one(
                    {"id": original.get("lead_id")}, {"_id": 0},
                ) or {}
                lead_name = (lead.get("contact") or {}).get("name") or original.get("lead_id")
                replay_output = _build_heuristic_argumentario(
                    original.get("disc_type") or "MIX",
                    original.get("budget_band") or "medio",
                    original.get("segment") or "residencial",
                    lead_name, lead.get("zone") or "CDMX",
                )
                replay_layer = "heuristic"
                steps.append({"step": 3, "phase": "execute_heuristic_layer",
                              "data": {"opening_keys": list(replay_output.get("opening_script", {}).keys()),
                                       "closing_recommended": (replay_output.get("closing_technique") or {}).get("recommended"),
                                       "discovery_n": len(replay_output.get("discovery_questions") or [])}})

            elif event_type == "smart_routing":
                original = await self.db.lead_routings.find_one(
                    {"_id": event_id, "org_id": org_id},
                )
                if not original:
                    return {"ok": False, "error": "evento original no encontrado"}
                steps.append({"step": 1, "phase": "fetch_original",
                              "data": {"lead_id": original.get("lead_id"),
                                       "fit_score": original.get("fit_score"),
                                       "layer": original.get("routing_layer")}})
                # Heuristic re-route via engine sim mode
                from agentic_crm.smart_routing_engine import SmartRoutingEngine
                engine = SmartRoutingEngine(self.db, org_id)
                try:
                    res = await engine.route_lead(
                        original.get("lead_id"), simulation_override=True,
                    )
                    replay_output = res
                    replay_layer = res.get("routing_layer")
                    steps.append({"step": 2, "phase": "execute_sim_routing",
                                  "data": {"asesor": res.get("suggested_asesor_id"),
                                           "fit": res.get("fit_score"),
                                           "layer": res.get("routing_layer")}})
                except Exception as exc:
                    replay_error = str(exc)
                    steps.append({"step": 2, "phase": "execute_failed",
                                  "data": {"error": str(exc)[:200]}})

            elif event_type == "visit_prep":
                original = await self.db.visit_prep_dossiers.find_one(
                    {"_id": event_id, "org_id": org_id},
                )
                if not original:
                    return {"ok": False, "error": "evento original no encontrado"}
                steps.append({"step": 1, "phase": "fetch_original",
                              "data": {"lead_id": original.get("lead_id"),
                                       "asesor_id": original.get("asesor_id"),
                                       "layer": original.get("layer_used")}})
                from agentic_crm.visit_prep_engine import VisitPrepEngine
                engine = VisitPrepEngine(self.db, org_id)
                try:
                    res = await engine.generate_dossier(
                        original.get("lead_id"),
                        original.get("asesor_id"),
                        original.get("project_id"),
                        _iso(original.get("visit_scheduled_at")) or _now().isoformat(),
                        simulation_override=True,
                    )
                    replay_output = {"dossier_id": res.get("dossier_id"),
                                     "layer_used": res.get("layer_used"),
                                     "talking_points_n": len((res.get("content") or {}).get("talking_points") or [])}
                    replay_layer = res.get("layer_used")
                    steps.append({"step": 2, "phase": "execute_sim_dossier",
                                  "data": replay_output})
                except Exception as exc:
                    replay_error = str(exc)
                    steps.append({"step": 2, "phase": "execute_failed",
                                  "data": {"error": str(exc)[:200]}})

            elif event_type == "disc":
                original = await self.db.disc_profiles.find_one(
                    {"_id": event_id, "org_id": org_id},
                )
                if not original:
                    return {"ok": False, "error": "evento original no encontrado"}
                steps.append({"step": 1, "phase": "fetch_original",
                              "data": {"lead_id": original.get("lead_id"),
                                       "type": original.get("predominant_type"),
                                       "conf": original.get("confidence_score")}})
                from agentic_crm.disc_inferencer_engine import DISCInferencer
                engine = DISCInferencer(self.db, org_id)
                try:
                    res = await engine.infer_profile(
                        original.get("lead_id"), force_refresh=False,
                        simulation_override=True,
                    )
                    replay_output = {"predominant_type": res.get("predominant_type"),
                                     "confidence_score": res.get("confidence_score"),
                                     "layer_used": res.get("layer_used")}
                    replay_layer = res.get("layer_used")
                    steps.append({"step": 2, "phase": "execute_sim_disc",
                                  "data": replay_output})
                except Exception as exc:
                    replay_error = str(exc)
                    steps.append({"step": 2, "phase": "execute_failed",
                                  "data": {"error": str(exc)[:200]}})

            else:
                return {"ok": False, "error": f"replay no implementado para {event_type}"}

        except Exception as exc:
            log.exception(f"[replay_debugger] failed: {exc}")
            replay_error = str(exc)

        # Diff: compara output original vs replay
        diff = self._compute_diff(original or {}, replay_output or {}, event_type)

        # Activity log
        try:
            await self.db.activity_log.insert_one({
                "id": f"act_{uuid.uuid4().hex[:12]}",
                "type": "observability.replay_executed",
                "org_id": org_id,
                "event_type": event_type,
                "event_id": event_id,
                "actor_id": actor_id,
                "replay_layer": replay_layer,
                "had_error": bool(replay_error),
                "created_at": _now(),
            })
        except Exception:
            pass

        # Strip sensitive content from original for response
        original_clean = self._sanitize_doc(original or {})

        return {
            "ok": True,
            "org_id": org_id,
            "event_id": event_id,
            "event_type": event_type,
            "original": original_clean,
            "replay": {
                "output": replay_output,
                "layer_used": replay_layer,
                "error": replay_error,
            },
            "diff": diff,
            "steps": steps,
            "replayed_at": _now().isoformat(),
        }

    @staticmethod
    def _sanitize_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
        """Convierte datetime → iso · trim payloads grandes."""
        out = {}
        for k, v in doc.items():
            if k == "_id":
                continue
            if isinstance(v, datetime):
                out[k] = v.isoformat()
            elif isinstance(v, (str, int, float, bool)) or v is None:
                out[k] = v
            elif isinstance(v, dict):
                out[k] = {k2: (_iso(v2) if isinstance(v2, datetime) else v2)
                          for k2, v2 in list(v.items())[:30]}
            elif isinstance(v, list):
                out[k] = v[:10] if all(not isinstance(x, dict) for x in v[:3]) else (
                    [{kk: (_iso(vv) if isinstance(vv, datetime) else vv) for kk, vv in x.items()}
                     for x in v[:5] if isinstance(x, dict)]
                )
            else:
                out[k] = str(v)[:200]
        return out

    @staticmethod
    def _compute_diff(original: Dict[str, Any], replay: Dict[str, Any],
                      event_type: str) -> Dict[str, Any]:
        """Diff conservador: layer_used · type/category · scores."""
        diff: Dict[str, Any] = {}
        orig_layer = original.get("layer_used") or original.get("routing_layer")
        repl_layer = replay.get("layer_used") if isinstance(replay, dict) else None
        diff["layer_changed"] = bool(orig_layer and repl_layer and orig_layer != repl_layer)
        diff["original_layer"] = orig_layer
        diff["replay_layer"] = repl_layer

        if event_type == "smart_routing":
            diff["asesor_changed"] = bool(
                original.get("suggested_asesor_id") and replay.get("suggested_asesor_id")
                and original.get("suggested_asesor_id") != replay.get("suggested_asesor_id")
            )
            of = float(original.get("fit_score") or 0)
            rf = float(replay.get("fit_score") or 0)
            diff["fit_score_delta"] = round(rf - of, 2) if (of or rf) else None
        elif event_type == "disc":
            diff["disc_type_changed"] = bool(
                original.get("predominant_type") and replay.get("predominant_type")
                and original.get("predominant_type") != replay.get("predominant_type")
            )
        elif event_type == "argumentario":
            orig_close = ((original.get("content") or {}).get("closing_technique") or {}).get("recommended")
            repl_close = ((replay.get("closing_technique") if replay else {}) or {}).get("recommended")
            diff["closing_changed"] = bool(orig_close and repl_close and orig_close != repl_close)
        return diff


# ═══════════════════════════════════════════════════════════════════════════════
# 4) AI ROI PER-DEV
# ═══════════════════════════════════════════════════════════════════════════════
class AIROIPerDev:
    """ROI monetario consolidado por org · lift_mxn / cost_mxn."""

    AVG_DEAL_DEFAULT_MXN = 5_000_000.0  # fallback

    def __init__(self, db):
        self.db = db

    async def compute_dev_roi(
        self, org_id: str, days: int = 30, persist: bool = True,
    ) -> Dict[str, Any]:
        """Calcula lift consolidado vs cost Phase Y."""
        since = _now() - timedelta(days=days)
        period_start = since
        period_end = _now()

        # Avg deal size (heurística: avg de leads cerrados o fallback)
        avg_deal = await self._estimate_avg_deal(org_id)

        # Pricing lift
        pricing = await self._lift_pricing(org_id, since)
        # Marketing lift
        marketing = await self._lift_marketing(org_id, since, avg_deal)
        # Lead conversion lift
        lead_conv = await self._lift_lead_conversion(org_id, since, avg_deal)
        # Time saved (asesor)
        time_saved = await self._compute_time_saved(org_id, since)
        # Phase Y cost (USD → MXN)
        cost = await self._compute_phase_y_cost(org_id, since)

        total_lift_mxn = (
            pricing["lift_mxn"] + marketing["lift_mxn"]
            + lead_conv["lift_mxn"] + time_saved["value_mxn"]
        )
        cost_mxn = cost["cost_usd"] * USD_TO_MXN
        roi_ratio = round(total_lift_mxn / cost_mxn, 2) if cost_mxn > 0 else None

        result: Dict[str, Any] = {
            "ok": True,
            "org_id": org_id,
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "days": days,
            "computed_at": _now().isoformat(),
            "avg_deal_mxn": round(avg_deal, 0),
            "totals": {
                "pricing_lift_mxn":         round(pricing["lift_mxn"], 0),
                "marketing_lift_mxn":       round(marketing["lift_mxn"], 0),
                "lead_conversion_lift_mxn": round(lead_conv["lift_mxn"], 0),
                "time_saved_value_mxn":     round(time_saved["value_mxn"], 0),
                "time_saved_hours_asesor":  round(time_saved["hours_total"], 1),
                "total_lift_mxn":           round(total_lift_mxn, 0),
                "cost_phase_y_usd":         round(cost["cost_usd"], 4),
                "cost_phase_y_mxn":         round(cost_mxn, 0),
                "roi_ratio":                roi_ratio,
            },
            "breakdown": {
                "pricing_recs_applied":     pricing["count"],
                "marketing_recs_applied":   marketing["count"],
                "lead_recs_applied":        lead_conv["count"],
                "smart_routings":           time_saved["counts"]["smart_routing"],
                "visit_dossiers":           time_saved["counts"]["visit_prep"],
                "argumentarios_used":       time_saved["counts"]["argumentario"],
                "replies_classified":       time_saved["counts"]["reply_classifier"],
                "nurture_touches_sent":     time_saved["counts"]["nurture_touch"],
                "disc_profiles":            time_saved["counts"]["disc_inference"],
                "subagent_runs":            cost["counts"]["subagent_runs"],
                "director_messages":        cost["counts"]["director_messages"],
                "atlax_messages":           cost["counts"]["atlax_messages"],
            },
            "version": 1,
        }

        if persist:
            try:
                doc_id = f"roi_{org_id}_{period_end.strftime('%Y%m%d_%H')}"
                await self.db.ai_roi_per_dev.update_one(
                    {"_id": doc_id},
                    {"$set": {
                        "_id": doc_id,
                        "org_id": org_id,
                        "period_start": period_start,
                        "period_end": period_end,
                        "computed_at": _now(),
                        "totals": result["totals"],
                        "breakdown": result["breakdown"],
                        "avg_deal_mxn": result["avg_deal_mxn"],
                        "version": 1,
                    }},
                    upsert=True,
                )
            except Exception as exc:
                log.warning(f"[ai_roi] persist failed: {exc}")

        return result

    async def get_matrix(self, days: int = 30, limit: int = 200,
                         tier_filter: Optional[str] = None) -> Dict[str, Any]:
        """Cross-org matrix sorted por roi_ratio desc. Lee últimos rollups."""
        try:
            cur = self.db.ai_roi_per_dev.find(
                {}, {"_id": 0},
            ).sort("computed_at", -1).limit(limit * 5)
            seen_orgs: Dict[str, Dict[str, Any]] = {}
            async for d in cur:
                org = d.get("org_id")
                if not org or org in seen_orgs:
                    continue
                seen_orgs[org] = d

            rows: List[Dict[str, Any]] = []
            for org, d in seen_orgs.items():
                # Optional tier filter via phase_y_settings
                tier_at_time = "unknown"
                try:
                    s = await self.db.phase_y_settings.find_one(
                        {"org_id": org}, {"_id": 0, "feature_tiers": 1},
                    )
                    tier_at_time = (
                        (s or {}).get("feature_tiers", {}).get("observability_dashboard", "off")
                    )
                except Exception:
                    pass
                if tier_filter and tier_at_time != tier_filter:
                    continue
                rows.append({
                    "org_id": org,
                    "tier": tier_at_time,
                    "roi_ratio": d.get("totals", {}).get("roi_ratio"),
                    "lift_mxn": d.get("totals", {}).get("total_lift_mxn"),
                    "cost_mxn": d.get("totals", {}).get("cost_phase_y_mxn"),
                    "computed_at": _iso(d.get("computed_at")),
                })
            rows.sort(key=lambda x: (x.get("roi_ratio") or 0), reverse=True)
            return {
                "ok": True, "days": days, "total_orgs": len(rows),
                "rows": rows[:limit],
            }
        except Exception as exc:
            log.warning(f"[ai_roi] matrix failed: {exc}")
            return {"ok": False, "error": str(exc), "rows": []}

    # ── Helpers ────────────────────────────────────────────────────────────────
    async def _estimate_avg_deal(self, org_id: str) -> float:
        """Promedio precio_max budget de leads del org · fallback default."""
        try:
            cur = self.db.leads.find(
                {"dev_org_id": org_id, "budget_max": {"$gt": 0}},
                {"_id": 0, "budget_max": 1},
            ).limit(50)
            vals: List[float] = []
            async for d in cur:
                vals.append(float(d["budget_max"]))
            if vals:
                return statistics.mean(vals)
        except Exception:
            pass
        return self.AVG_DEAL_DEFAULT_MXN

    async def _lift_pricing(self, org_id, since) -> Dict[str, Any]:
        cnt = 0
        lift = 0.0
        try:
            cur = self.db.pricing_recommendations.find(
                {"org_id": org_id, "status": "applied",
                 "applied_at": {"$gte": since}},
                {"_id": 0, "delta_pct": 1, "current_price": 1,
                 "expected_lift_pct": 1, "estimated_units": 1,
                 "actual_lift_pct": 1},
            ).limit(500)
            async for d in cur:
                cnt += 1
                price = float(d.get("current_price") or 0)
                exp = float(d.get("actual_lift_pct") or d.get("expected_lift_pct") or 0)
                units = float(d.get("estimated_units") or 1)
                # lift = price × delta% × units (asume velocidad)
                lift += price * (exp / 100.0) * units
        except Exception:
            pass
        return {"count": cnt, "lift_mxn": max(0.0, lift)}

    async def _lift_marketing(self, org_id, since, avg_deal) -> Dict[str, Any]:
        cnt = 0
        lift = 0.0
        try:
            cur = self.db.marketing_recommendations.find(
                {"org_id": org_id, "status": "applied",
                 "applied_at": {"$gte": since}},
                {"_id": 0, "expected_lift_pct": 1, "estimated_units": 1},
            ).limit(500)
            async for d in cur:
                cnt += 1
                exp = float(d.get("expected_lift_pct") or 0)
                units = float(d.get("estimated_units") or 1)
                lift += avg_deal * (exp / 100.0) * units
        except Exception:
            pass
        return {"count": cnt, "lift_mxn": max(0.0, lift)}

    async def _lift_lead_conversion(self, org_id, since, avg_deal) -> Dict[str, Any]:
        cnt = 0
        lift = 0.0
        try:
            cur = self.db.lead_recommendations.find(
                {"org_id": org_id, "status": "applied",
                 "applied_at": {"$gte": since}},
                {"_id": 0, "conversion_uplift_pct": 1,
                 "estimated_leads_recovered": 1},
            ).limit(500)
            async for d in cur:
                cnt += 1
                up = float(d.get("conversion_uplift_pct") or 0)
                rec = float(d.get("estimated_leads_recovered") or 1)
                lift += avg_deal * (up / 100.0) * rec
        except Exception:
            pass
        return {"count": cnt, "lift_mxn": max(0.0, lift)}

    async def _compute_time_saved(self, org_id, since) -> Dict[str, Any]:
        counts: Dict[str, int] = {}
        # Smart routings
        try:
            counts["smart_routing"] = await self.db.lead_routings.count_documents({
                "org_id": org_id, "routed_at": {"$gte": since},
                "status": {"$in": ["accepted", "rejected", "reassigned"]},
            })
        except Exception:
            counts["smart_routing"] = 0
        # Visit prep
        try:
            counts["visit_prep"] = await self.db.visit_prep_dossiers.count_documents({
                "org_id": org_id, "dossier_generated_at": {"$gte": since},
            })
        except Exception:
            counts["visit_prep"] = 0
        # Argumentario (only "used")
        try:
            counts["argumentario"] = await self.db.argumentario_scripts.count_documents({
                "org_id": org_id, "status": "used",
                "generated_at": {"$gte": since.isoformat()},
            })
        except Exception:
            counts["argumentario"] = 0
        # Reply classifier
        try:
            counts["reply_classifier"] = await self.db.email_replies.count_documents({
                "org_id": org_id, "received_at": {"$gte": since},
                "status": {"$in": ["action_taken", "archived"]},
            })
        except Exception:
            counts["reply_classifier"] = 0
        # Nurture touches sent
        try:
            sent_total = 0
            cur = self.db.nurture_sequences.find(
                {"org_id": org_id, "generated_at": {"$gte": since}},
                {"_id": 0, "touches": 1},
            ).limit(500)
            async for s in cur:
                for t in s.get("touches") or []:
                    if t.get("sent_at"):
                        sent_total += 1
            counts["nurture_touch"] = sent_total
        except Exception:
            counts["nurture_touch"] = 0
        # DISC profiles
        try:
            counts["disc_inference"] = await self.db.disc_profiles.count_documents({
                "org_id": org_id, "inferred_at": {"$gte": since},
            })
        except Exception:
            counts["disc_inference"] = 0

        hours_total = sum(
            counts.get(k, 0) * HOURS_SAVED.get(k, 0) for k in HOURS_SAVED
        )
        value_mxn = hours_total * ASESOR_HOURLY_MXN
        return {
            "counts": counts,
            "hours_total": hours_total,
            "value_mxn": value_mxn,
        }

    async def _compute_phase_y_cost(self, org_id, since) -> Dict[str, Any]:
        cost_usd = 0.0
        counts: Dict[str, int] = {}
        # subagent_runs
        try:
            cur = self.db.subagent_runs.find(
                {"org_id": org_id, "created_at": {"$gte": since}},
                {"_id": 0, "cost_usd": 1},
            ).limit(2000)
            n = 0
            async for d in cur:
                n += 1
                cost_usd += float(d.get("cost_usd") or 0)
            counts["subagent_runs"] = n
        except Exception:
            counts["subagent_runs"] = 0
        # director_messages
        try:
            cur = self.db.director_messages.find(
                {"org_id": org_id, "created_at": {"$gte": since}},
                {"_id": 0, "cost_usd": 1},
            ).limit(2000)
            n = 0
            async for d in cur:
                n += 1
                cost_usd += float(d.get("cost_usd") or 0)
            counts["director_messages"] = n
        except Exception:
            counts["director_messages"] = 0
        # atlax_messages
        try:
            cur = self.db.atlax_messages.find(
                {"org_id": org_id, "created_at": {"$gte": since}},
                {"_id": 0, "cost_usd": 1},
            ).limit(2000)
            n = 0
            async for d in cur:
                n += 1
                cost_usd += float(d.get("cost_usd") or 0)
            counts["atlax_messages"] = n
        except Exception:
            counts["atlax_messages"] = 0
        # argumentario_scripts
        try:
            cur = self.db.argumentario_scripts.find(
                {"org_id": org_id, "generated_at": {"$gte": since.isoformat()}},
                {"_id": 0, "cost_usd": 1},
            ).limit(1000)
            async for d in cur:
                cost_usd += float(d.get("cost_usd") or 0)
        except Exception:
            pass
        return {"cost_usd": cost_usd, "counts": counts}


# ═══════════════════════════════════════════════════════════════════════════════
# CRONS — registrados desde scheduler_ie.py
# ═══════════════════════════════════════════════════════════════════════════════
async def run_ai_roi_daily_rollup(db) -> Dict[str, Any]:
    """Cron diario 02:00 MX · agrega ROI per-dev por todas las orgs con tier ≥ T1."""
    try:
        cur = db.phase_y_settings.find(
            {"agentic_enabled": True}, {"_id": 0, "org_id": 1, "feature_tiers": 1},
        )
        org_docs: List[Dict[str, Any]] = []
        async for d in cur:
            org_docs.append(d)
    except Exception as exc:
        log.warning(f"[ai_roi_cron] load orgs failed: {exc}")
        return {"error": str(exc), "orgs_processed": 0}

    processed = 0
    errors = 0
    engine = AIROIPerDev(db)
    for od in org_docs:
        org_id = od.get("org_id")
        if not org_id:
            continue
        tier_raw = (od.get("feature_tiers") or {}).get("observability_dashboard", "off")
        if not tier_raw or tier_raw == "off":
            continue
        try:
            await engine.compute_dev_roi(org_id, days=30, persist=True)
            processed += 1
        except Exception as exc:
            errors += 1
            log.warning(f"[ai_roi_cron] org={org_id} err: {exc}")
    summary = {"orgs_processed": processed, "errors": errors,
               "ts": _now().isoformat()}
    log.info(f"[ai_roi_cron] done · {summary}")
    return summary


async def run_ml_accuracy_monthly_rollup(db) -> Dict[str, Any]:
    """Cron mensual día 1 03:00 MX · agrega accuracy por feature."""
    engine = MLAccuracy(db)
    summary: Dict[str, Any] = {"orgs_processed": 0, "ts": _now().isoformat()}
    try:
        # Global rollup (org_id=None)
        for f in MLAccuracy.FEATURES:
            try:
                await engine.compute_accuracy(f, org_id=None, days=30)
            except Exception as exc:
                log.warning(f"[ml_accuracy_cron] feature={f} err: {exc}")

        # Per-org rollups
        cur = db.phase_y_settings.find(
            {"agentic_enabled": True}, {"_id": 0, "org_id": 1, "feature_tiers": 1},
        )
        async for d in cur:
            org = d.get("org_id")
            if not org:
                continue
            tier_raw = (d.get("feature_tiers") or {}).get("observability_dashboard", "off")
            if not tier_raw or tier_raw == "off":
                continue
            for f in MLAccuracy.FEATURES:
                try:
                    await engine.compute_accuracy(f, org_id=org, days=30)
                except Exception:
                    pass
            summary["orgs_processed"] += 1
    except Exception as exc:
        log.warning(f"[ml_accuracy_cron] failed: {exc}")
        summary["error"] = str(exc)
    log.info(f"[ml_accuracy_cron] done · {summary}")
    return summary


# ═══════════════════════════════════════════════════════════════════════════════
# INDEXES
# ═══════════════════════════════════════════════════════════════════════════════
async def ensure_observability_indexes(db) -> None:
    """Índices para audit_replay_events · ml_accuracy_log · ai_roi_per_dev."""
    try:
        await db.audit_replay_events.create_index(
            [("org_id", 1), ("target_id", 1), ("created_at", -1)],
            name="idx_are_org_target_time", background=True,
        )
        await db.audit_replay_events.create_index(
            [("event_type", 1), ("created_at", -1)],
            name="idx_are_type_time", background=True,
        )
        await db.audit_replay_events.create_index(
            "created_at", expireAfterSeconds=180 * 86400,
            name="idx_are_ttl_180d", background=True,
        )

        await db.ml_accuracy_log.create_index(
            [("feature_name", 1), ("org_id", 1), ("computed_at", -1)],
            name="idx_mla_feature_org_time", background=True,
        )
        await db.ml_accuracy_log.create_index(
            "computed_at", expireAfterSeconds=365 * 86400,
            name="idx_mla_ttl_1y", background=True,
        )

        await db.ai_roi_per_dev.create_index(
            [("org_id", 1), ("period_end", -1)],
            name="idx_roi_org_period", background=True,
        )
        await db.ai_roi_per_dev.create_index(
            [("computed_at", -1)],
            name="idx_roi_computed", background=True,
        )
        log.info("[observability] indexes OK")
    except Exception as exc:
        log.warning(f"[observability] ensure_indexes failed: {exc}")
