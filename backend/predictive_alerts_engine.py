"""W5.x F8 · Predictive Alerts engine.

Agrega eventos cross-feature (behavioral_events · lead_captures · lead_capture_events ·
reverse_search_cache · comparison_cache) sobre ventanas temporales, aplica 8 reglas
heurísticas y genera alertas priorizadas con urgency_score 0-100.

Persistencia:
  - predictive_alerts (permanente · status active/snoozed/contacted/dismissed)
  - predictive_alerts_runs (TTL 30d · audit de corridas cron)

NO duplica data · NO mock · FAIL-SOFT por source (si una collection no existe,
retorna {} para ese source y continúa).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.predictive_alerts")

COLLECTION_ALERTS = "predictive_alerts"
COLLECTION_RUNS = "predictive_alerts_runs"
RUNS_TTL_DAYS = 30
DEFAULT_ADVISOR_FALLBACK_ENV = "PREDICTIVE_ALERTS_FALLBACK_ADVISOR_ID"

VALID_STATUS = {"active", "snoozed", "contacted", "dismissed"}
VALID_TIERS = {"alta", "media", "baja"}
VALID_SIGNALS = {
    "enamorado",       # 1 · same property_id ≥3 views in 5d
    "decision",        # 2 · comparison session with ≥3 items
    "enfriando",       # 3 · pdf_download + no contact_event 72h
    "presupuesto_bajo",  # 4 · 2+ reverse_search with descending price_max
    "trending",        # 5 · property-level signal (10+ anon views 48h) · NO crea alert por lead
    "re_engaged",      # 6 · 5-10d idle + new activity
    "abandono_modal",  # 7 · score≥60 should_trigger + no lead_captures match
    "indeciso",        # 8 · same comparison combo ≥2 times
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid() -> str:
    return f"alert_{uuid.uuid4().hex[:16]}"


def compute_urgency_tier(score: int) -> str:
    """Mapea urgency_score 0-100 → tier alta|media|baja."""
    try:
        s = int(score)
    except Exception:
        s = 0
    if s >= 75:
        return "alta"
    if s >= 50:
        return "media"
    return "baja"


def compute_smart_snooze_hours(urgency_tier: str) -> int:
    """Snooze adaptativo según tier · alta=12h max · media=48h · baja=168h (7d)."""
    tier = (urgency_tier or "").lower()
    if tier == "alta":
        return 12
    if tier == "media":
        return 48
    return 168


# ─── aggregate_events ────────────────────────────────────────────────────────

async def aggregate_events(
    db,
    *,
    lead_id: Optional[str] = None,
    session_id: Optional[str] = None,
    days: int = 14,
) -> Dict[str, Any]:
    """Junta eventos de 5 sources últimos N days · scopeado a lead_id o session_id.

    Sources (FAIL-SOFT por fuente):
      1. behavioral_events    (W4.4)
      2. lead_capture_events  (F7)
      3. lead_captures        (F7 · si lead_id)
      4. reverse_search_cache (F5 · si session_id)
      5. comparison_cache     (F4.2)

    Retorna dict con keys:
      property_views_by_id          {prop_id: count}
      properties_compared_sessions  [{ids, ts}]
      pdf_downloads                 [{ts, property_id?}]
      reverse_searches              [{ts, price_max?, audience?}]
      contact_events                [{ts, type}]
      time_since_last_activity_hours
      behavioral_score_history      [{ts, score, should_trigger}]
      lead_doc                      lead_captures doc (si lead_id) o None
    """
    if not lead_id and not session_id:
        raise ValueError("aggregate_events requiere lead_id o session_id")
    days = max(1, min(int(days or 14), 90))
    cutoff = _now() - timedelta(days=days)

    out: Dict[str, Any] = {
        "property_views_by_id": {},
        "properties_compared_sessions": [],
        "pdf_downloads": [],
        "reverse_searches": [],
        "contact_events": [],
        "time_since_last_activity_hours": None,
        "behavioral_score_history": [],
        "lead_doc": None,
    }
    if db is None:
        return out

    last_activity_ts: Optional[datetime] = None

    def _upd_last(ts):
        nonlocal last_activity_ts
        if isinstance(ts, datetime):
            if last_activity_ts is None or ts > last_activity_ts:
                last_activity_ts = ts

    # 1) behavioral_events
    try:
        q: Dict[str, Any] = {"timestamp": {"$gte": cutoff}}
        if session_id:
            q["session_id"] = session_id
        cur = db.behavioral_events.find(q, {"_id": 0})
        async for ev in cur:
            etype = ev.get("event_type")
            ts = ev.get("timestamp")
            _upd_last(ts)
            meta = ev.get("metadata") or {}
            prop_id = meta.get("property_id") or meta.get("entity_id")
            if etype == "page_view" and prop_id:
                out["property_views_by_id"][prop_id] = out["property_views_by_id"].get(prop_id, 0) + 1
            if etype in ("click", "submit") and (meta.get("kind") == "contact" or ev.get("feature") == "contact"):
                out["contact_events"].append({"ts": ts, "type": etype})
    except Exception as e:
        log.debug(f"[predictive_alerts] behavioral_events read fail: {e}")

    # 2) lead_capture_events
    try:
        q2: Dict[str, Any] = {"captured_at": {"$gte": cutoff}}
        if session_id:
            q2["visitor_session_id"] = session_id
        cur = db.lead_capture_events.find(q2, {"_id": 0})
        async for ev in cur:
            ts = ev.get("captured_at")
            _upd_last(ts)
            out["behavioral_score_history"].append({
                "ts": ts,
                "score": int(ev.get("score") or 0),
                "should_trigger": bool(ev.get("should_trigger")),
                "suggested_audience": ev.get("suggested_audience"),
                "properties_viewed_count": int(ev.get("properties_viewed_count") or 0),
            })
    except Exception as e:
        log.debug(f"[predictive_alerts] lead_capture_events read fail: {e}")

    # 3) lead_captures (si lead_id · y por session_id para PDF downloads)
    try:
        q3: Dict[str, Any] = {"created_at": {"$gte": cutoff}}
        if lead_id:
            q3 = {"lead_id": lead_id}
        elif session_id:
            q3["visitor_session_id"] = session_id
        cur = db.lead_captures.find(q3, {"_id": 0})
        async for lc in cur:
            ts = lc.get("created_at")
            _upd_last(ts)
            if not out["lead_doc"] and (lead_id or session_id):
                out["lead_doc"] = lc
            if lc.get("pdf_file_id") or lc.get("pdf_url"):
                out["pdf_downloads"].append({"ts": ts, "property_id": lc.get("property_id")})
    except Exception as e:
        log.debug(f"[predictive_alerts] lead_captures read fail: {e}")

    # 4) reverse_search_cache · sin session_id no se puede scopear (cache global)
    #    Lo aproximamos: si session_id presente, leemos lead_capture_events asociados
    #    con same visitor para inferir reverse searches recientes. Si lead tiene
    #    audience info, agregamos audiencia. Esta sección es best-effort.
    try:
        if session_id:
            # No hay session_id en reverse_search_cache; sólo audience/parsed/limit.
            # Para scoping correcto leemos los eventos del visitor que tengan
            # suggested_audience setting (proxy de búsqueda activa).
            recent_cap_events = await db.lead_capture_events.find(
                {"visitor_session_id": session_id, "captured_at": {"$gte": cutoff}},
                {"_id": 0, "captured_at": 1, "suggested_audience": 1},
                sort=[("captured_at", -1)],
            ).to_list(length=50)
            for ev in recent_cap_events:
                if ev.get("suggested_audience"):
                    out["reverse_searches"].append({
                        "ts": ev.get("captured_at"),
                        "audience": ev.get("suggested_audience"),
                        "price_max": None,
                    })
    except Exception as e:
        log.debug(f"[predictive_alerts] reverse_search_cache read fail: {e}")

    # 5) comparison_cache · cache global · scopeamos por entity_ids overlap con
    #    property_views_by_id (proxy de interés). Best-effort.
    try:
        cur = db.comparison_cache.find({"generated_at": {"$gte": cutoff}}, {"_id": 0})
        viewed = set(out["property_views_by_id"].keys())
        async for cmp in cur:
            ent_ids = (cmp.get("entity_ids") or [])
            ids_set = set(ent_ids)
            if viewed and not (ids_set & viewed):
                continue
            ts = cmp.get("generated_at")
            _upd_last(ts)
            out["properties_compared_sessions"].append({
                "ids": ent_ids,
                "ts": ts,
                "audience": cmp.get("audience"),
            })
    except Exception as e:
        log.debug(f"[predictive_alerts] comparison_cache read fail: {e}")

    if last_activity_ts:
        delta_hours = (_now() - last_activity_ts).total_seconds() / 3600.0
        out["time_since_last_activity_hours"] = round(delta_hours, 2)

    return out


# ─── detect_signals ──────────────────────────────────────────────────────────

def detect_signals(aggregated: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Aplica 8 reglas heurísticas · retorna lista de signals detectados.

    Cada signal: {signal_type, urgency_score, message_template, property_id?, confidence}.
    """
    signals: List[Dict[str, Any]] = []
    if not aggregated:
        return signals

    views = aggregated.get("property_views_by_id") or {}
    comparisons = aggregated.get("properties_compared_sessions") or []
    pdfs = aggregated.get("pdf_downloads") or []
    rev = aggregated.get("reverse_searches") or []
    contacts = aggregated.get("contact_events") or []
    score_hist = aggregated.get("behavioral_score_history") or []
    idle_h = aggregated.get("time_since_last_activity_hours")
    lead_doc = aggregated.get("lead_doc")

    # 1 · enamorado · misma property_id ≥3 dentro 5 días
    for prop_id, count in views.items():
        if count >= 3:
            signals.append({
                "signal_type": "enamorado",
                "urgency_score": 85,
                "property_id": prop_id,
                "message_template": (
                    "Este lead vio {count} veces la propiedad {prop_id} en últimos días · "
                    "alta intención de compra"
                ).format(count=count, prop_id=prop_id),
                "confidence": 0.85,
            })

    # 2 · decision · comparison session con ≥3 items
    for sess in comparisons:
        ids = sess.get("ids") or []
        if len(ids) >= 3:
            signals.append({
                "signal_type": "decision",
                "urgency_score": 80,
                "property_id": ids[0] if ids else None,
                "message_template": (
                    "Lead comparó {n} propiedades en una sesión · está en fase de decisión final"
                ).format(n=len(ids)),
                "confidence": 0.80,
            })
            break  # 1 signal decision basta

    # 3 · enfriando · pdf_downloads existe + sin contact_event últimas 72h
    if pdfs:
        cutoff_72h = _now() - timedelta(hours=72)
        recent_contact = any(
            isinstance(c.get("ts"), datetime) and c.get("ts") >= cutoff_72h
            for c in contacts
        )
        if not recent_contact:
            signals.append({
                "signal_type": "enfriando",
                "urgency_score": 65,
                "property_id": pdfs[0].get("property_id"),
                "message_template": (
                    "Lead descargó brochure pero no ha contactado en 72h · reactivar antes que enfríe"
                ),
                "confidence": 0.70,
            })

    # 4 · presupuesto_bajo · 2+ reverse_searches con price_max descendente
    if len(rev) >= 2:
        prices = [r.get("price_max") for r in rev if r.get("price_max")]
        if len(prices) >= 2 and prices[0] > prices[-1]:
            signals.append({
                "signal_type": "presupuesto_bajo",
                "urgency_score": 55,
                "property_id": None,
                "message_template": (
                    "Lead ha bajado su rango de presupuesto · sugerir opciones en su nuevo rango"
                ),
                "confidence": 0.65,
            })

    # 6 · re_engaged · idle 120-240h Y nueva actividad (idle válido implica
    #     que tiene actividad reciente · pero queremos rango específico)
    if idle_h is not None and 120 <= idle_h <= 240:
        signals.append({
            "signal_type": "re_engaged",
            "urgency_score": 60,
            "property_id": None,
            "message_template": (
                "Lead regresa tras {h}h inactivo · momento clave para reactivar"
            ).format(h=int(idle_h)),
            "confidence": 0.70,
        })

    # 7 · abandono_modal · último score≥60 should_trigger + sin lead_captures match
    if score_hist:
        last = score_hist[-1] if score_hist else {}
        if int(last.get("score") or 0) >= 60 and last.get("should_trigger") and not lead_doc:
            signals.append({
                "signal_type": "abandono_modal",
                "urgency_score": 75,
                "property_id": None,
                "message_template": (
                    "Lead alcanzó score conductual alto ({s}) pero no se capturó · "
                    "intentar canal alterno"
                ).format(s=int(last.get("score") or 0)),
                "confidence": 0.75,
            })

    # 8 · indeciso · comparisons con misma combinación ids ≥2 veces
    combo_counts: Dict[str, int] = {}
    for sess in comparisons:
        ids = sorted(sess.get("ids") or [])
        key = "|".join(ids)
        if not key:
            continue
        combo_counts[key] = combo_counts.get(key, 0) + 1
    for key, c in combo_counts.items():
        if c >= 2:
            first_id = key.split("|")[0] if key else None
            signals.append({
                "signal_type": "indeciso",
                "urgency_score": 50,
                "property_id": first_id,
                "message_template": (
                    "Lead comparó la misma combinación {n} veces · necesita empujón para decidir"
                ).format(n=c),
                "confidence": 0.60,
            })
            break  # 1 signal indeciso basta

    return signals


# ─── advisor assignment ──────────────────────────────────────────────────────

async def assign_advisor_for_alert(
    db,
    lead_id: Optional[str],
    session_id: Optional[str],
    property_id: Optional[str],
) -> Optional[str]:
    """Resuelve advisor_id para una alerta.

    Orden:
      1. lead_captures.advisor_id (si lead_id)
      2. lead_capture_marketplace_engine.assign_advisor(property_id)
      3. env PREDICTIVE_ALERTS_FALLBACK_ADVISOR_ID
      4. primer user con role advisor
    Retorna advisor_id o None.
    """
    import os
    if db is None:
        return os.environ.get(DEFAULT_ADVISOR_FALLBACK_ENV)

    # 1) lead_captures
    if lead_id:
        try:
            lc = await db.lead_captures.find_one(
                {"lead_id": lead_id}, {"_id": 0, "advisor_id": 1}
            )
            if lc and lc.get("advisor_id"):
                return lc["advisor_id"]
        except Exception as e:
            log.debug(f"[predictive_alerts] lead advisor lookup fail: {e}")

    # 2) property → advisor via lead_capture_marketplace_engine.assign_advisor
    if property_id:
        try:
            from lead_capture_marketplace_engine import assign_advisor as _assign
            info = await _assign(db, property_id)
            if isinstance(info, dict) and info.get("advisor_id"):
                return info["advisor_id"]
        except Exception as e:
            log.debug(f"[predictive_alerts] property advisor lookup fail: {e}")

    # 3) env fallback
    env_fallback = os.environ.get(DEFAULT_ADVISOR_FALLBACK_ENV)
    if env_fallback:
        return env_fallback

    # 4) first advisor in users
    try:
        u = await db.users.find_one(
            {"role": {"$in": ["advisor", "asesor_admin"]}},
            {"_id": 0, "user_id": 1, "id": 1},
        )
        if u:
            return u.get("user_id") or u.get("id")
    except Exception as e:
        log.debug(f"[predictive_alerts] users fallback fail: {e}")

    return None


# ─── create_alert ────────────────────────────────────────────────────────────

async def create_alert(
    db,
    signal: Dict[str, Any],
    lead_id: Optional[str],
    session_id: Optional[str],
    property_id: Optional[str],
    advisor_id: Optional[str],
) -> Dict[str, Any]:
    """Crea predictive_alert · skip si duplicate (mismo advisor+lead/session+signal 24h)."""
    if db is None:
        return {"duplicate": False, "alert_id": None, "error": "no_db"}

    signal_type = signal.get("signal_type")
    if signal_type not in VALID_SIGNALS:
        return {"duplicate": False, "alert_id": None, "error": "invalid_signal"}

    # Duplicate check
    try:
        cutoff = _now() - timedelta(hours=24)
        dup_query: Dict[str, Any] = {
            "advisor_id": advisor_id,
            "signal_type": signal_type,
            "status": "active",
            "created_at": {"$gte": cutoff},
        }
        if lead_id:
            dup_query["lead_id"] = lead_id
        elif session_id:
            dup_query["session_id"] = session_id
        existing = await db[COLLECTION_ALERTS].find_one(dup_query, {"_id": 0, "alert_id": 1})
        if existing:
            return {"duplicate": True, "alert_id": existing.get("alert_id")}
    except Exception as e:
        log.debug(f"[predictive_alerts] dup check fail: {e}")

    alert_id = _uid()
    urgency_score = int(signal.get("urgency_score") or 0)
    tier = compute_urgency_tier(urgency_score)

    # property title lookup (best-effort)
    property_title = None
    if property_id:
        try:
            dev = await db.developments.find_one(
                {"$or": [{"id": property_id}, {"_id": property_id}, {"slug": property_id}]},
                {"_id": 0, "name": 1, "title": 1, "slug": 1},
            )
            if dev:
                property_title = dev.get("name") or dev.get("title") or dev.get("slug")
            if not property_title:
                try:
                    from data_developments import DEVELOPMENTS_BY_ID
                    dev_mem = DEVELOPMENTS_BY_ID.get(property_id) or {}
                    property_title = dev_mem.get("name") or dev_mem.get("title")
                except Exception:
                    pass
        except Exception:
            pass

    doc = {
        "alert_id": alert_id,
        "lead_id": lead_id,
        "session_id": session_id,
        "advisor_id": advisor_id,
        "signal_type": signal_type,
        "urgency_score": urgency_score,
        "urgency_tier": tier,
        "property_id": property_id,
        "property_title": property_title,
        "message": signal.get("message_template") or "",
        "created_at": _now(),
        "snoozed_until": None,
        "contacted_at": None,
        "dismissed_at": None,
        "status": "active",
        "raw_events": {
            "confidence": signal.get("confidence"),
        },
    }
    try:
        await db[COLLECTION_ALERTS].insert_one(dict(doc))
    except Exception as e:
        log.warning(f"[predictive_alerts] insert alert failed: {e}")
        return {"duplicate": False, "alert_id": None, "error": str(e)}

    # audit (fail-soft)
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "system", "role": "system"},
            action="predictive_alert_created",
            entity_type="predictive_alert",
            entity_id=alert_id,
            before=None,
            after={
                "signal_type": signal_type,
                "urgency_score": urgency_score,
                "urgency_tier": tier,
                "advisor_id": advisor_id,
                "lead_id": lead_id,
                "session_id": session_id,
                "property_id": property_id,
            },
        )
    except Exception as e:
        log.debug(f"[predictive_alerts] audit log fail: {e}")

    out = dict(doc)
    out["duplicate"] = False
    return out


# ─── email digest 8am ────────────────────────────────────────────────────────

async def email_digest_daily(db, advisor_id: str) -> Dict[str, Any]:
    """Envía digest top-10 alertas activas últimas 24h vía notifications_engine."""
    result = {"advisor_id": advisor_id, "alerts_sent_count": 0, "success": False}
    if db is None or not advisor_id:
        return result

    cutoff = _now() - timedelta(hours=24)
    try:
        cur = db[COLLECTION_ALERTS].find(
            {"advisor_id": advisor_id, "status": "active", "created_at": {"$gte": cutoff}},
            {"_id": 0},
            sort=[("urgency_score", -1), ("created_at", -1)],
        ).limit(10)
        alerts = await cur.to_list(length=10)
    except Exception as e:
        log.warning(f"[predictive_alerts] digest query fail: {e}")
        return result

    if not alerts:
        result["success"] = True
        return result

    # Build HTML + text
    rows_html = []
    rows_text = []
    for a in alerts:
        tier = a.get("urgency_tier", "media")
        color = {"alta": "#e11d48", "media": "#f59e0b", "baja": "#64748b"}.get(tier, "#64748b")
        rows_html.append(
            f"<tr><td style='padding:6px;color:{color};font-weight:600'>"
            f"{tier.upper()}</td><td style='padding:6px'>"
            f"{a.get('signal_type','')}</td><td style='padding:6px'>"
            f"{a.get('property_title') or a.get('property_id') or '—'}</td>"
            f"<td style='padding:6px'>{a.get('message','')[:140]}</td></tr>"
        )
        rows_text.append(
            f"- [{tier.upper()}] {a.get('signal_type','')} · "
            f"{a.get('property_title') or a.get('property_id') or '—'} · "
            f"{a.get('message','')[:140]}"
        )
    body_html = (
        "<p>Tus 10 alertas predictivas top de hoy:</p>"
        "<table style='border-collapse:collapse;font-family:sans-serif;font-size:13px'>"
        "<thead><tr><th>Tier</th><th>Signal</th><th>Propiedad</th><th>Mensaje</th></tr></thead>"
        f"<tbody>{''.join(rows_html)}</tbody></table>"
    )
    body_text = "Tus 10 alertas predictivas top de hoy:\n" + "\n".join(rows_text)

    try:
        from notifications_engine import emit_notification
        await emit_notification(
            db,
            user_id=advisor_id,
            type="generic",
            severity="normal",
            title="Tus 10 alertas top de hoy",
            body=body_text,
            payload={"html": body_html, "alerts_count": len(alerts)},
            channels=["email", "in_app"],
        )
        result["alerts_sent_count"] = len(alerts)
        result["success"] = True
    except Exception as e:
        log.warning(f"[predictive_alerts] email_digest_daily emit failed: {e}")
        return result

    # audit
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "system", "role": "system"},
            action="predictive_alerts_digest_sent",
            entity_type="predictive_alerts_digest",
            entity_id=advisor_id,
            before=None,
            after={"alerts_count": len(alerts), "ts": _now().isoformat()},
        )
    except Exception:
        pass

    return result


# ─── indexes ─────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    """Indexes idempotentes para predictive_alerts + predictive_alerts_runs."""
    if db is None:
        return
    try:
        await db[COLLECTION_ALERTS].create_index(
            "alert_id", unique=True, name="pa_alert_id_uniq"
        )
        await db[COLLECTION_ALERTS].create_index(
            [("advisor_id", 1), ("status", 1)], name="pa_advisor_status"
        )
        await db[COLLECTION_ALERTS].create_index(
            [("created_at", -1)], name="pa_created_desc"
        )
        await db[COLLECTION_ALERTS].create_index(
            [("lead_id", 1), ("signal_type", 1)],
            name="pa_lead_signal",
            sparse=True,
        )
        await db[COLLECTION_RUNS].create_index(
            "ttl_until", expireAfterSeconds=0, name="pa_runs_ttl"
        )
        log.info("[predictive_alerts] indexes OK")
    except Exception as e:
        log.warning(f"[predictive_alerts] ensure_indexes failed: {e}")
