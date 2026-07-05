"""W5.5 Parte 1 — Live Pulse Engine.

5 signal computers + compose_score + orchestrator compute_pulse + persist + indexes.

Cada signal computer es async y retorna shape estandar:
    {
        "value": float,         # numero observado periodo current
        "baseline": float,      # promedio diario baseline
        "delta_pct": float,     # ((value/period_days - baseline) / baseline) * 100 cap [-100,+500]
        "source": str,          # "real" | "stub" | "insufficient_data" | "unavailable"
        "confidence": float     # 0.0-1.0
    }

compose_score(signals) → 0-100 sigmoid weighted sum sobre delta_pct.
compute_pulse(db, zone_slug) → orchestrator asyncio.gather de las 5 signals.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import math
import os
import re
import secrets as _secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.live_pulse")


# ─── Utils ────────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _sid() -> str:
    return f"pulse_{_secrets.token_urlsafe(10)}"


def _cap_delta(delta: float) -> float:
    return max(-100.0, min(500.0, float(delta)))


def _confidence(volume: float) -> float:
    return round(min(float(volume) / 100.0, 1.0), 3)


# ─── Signal 1: search velocity (atlax_threads) ───────────────────────────────

async def compute_search_velocity(
    db, zone_slug: str, days: int = 30, baseline_days: int = 90,
) -> Dict[str, Any]:
    now = _now()
    cur_cutoff = (now - timedelta(days=days)).isoformat()
    base_cutoff = (now - timedelta(days=baseline_days)).isoformat()
    try:
        # Heuristica: zone_slug en metadata o contenido (case-insensitive)
        regex = {"$regex": zone_slug, "$options": "i"}
        zone_q = {"$or": [
            {"metadata.zone_slug": zone_slug},
            {"context.zone_slug": zone_slug},
            {"zone_id": zone_slug},
            {"intent_zones": zone_slug},
            # censo 2026-07-05: el schema real es title/first_message_at (content/created_at NO existen) —
            # la señal siempre daba 0 aunque hubiera hilos reales.
            {"title": regex},
        ]}
        cur_count = await db.atlax_threads.count_documents({
            **zone_q, "first_message_at": {"$gte": cur_cutoff},
        })
        base_count = await db.atlax_threads.count_documents({
            **zone_q, "first_message_at": {"$gte": base_cutoff},
        })
        baseline_per_day = (base_count / float(baseline_days)) if baseline_days > 0 else 0.0
        cur_per_day = (cur_count / float(days)) if days > 0 else 0.0
        if baseline_per_day > 0:
            delta_pct = _cap_delta(((cur_per_day - baseline_per_day) / baseline_per_day) * 100.0)
        else:
            delta_pct = 100.0 if cur_count > 0 else 0.0
        source = "real" if cur_count > 0 else "insufficient_data"
        return {
            "value": float(cur_count),
            "baseline": round(baseline_per_day, 4),
            "delta_pct": round(delta_pct, 2),
            "source": source,
            "confidence": _confidence(cur_count),
        }
    except Exception as exc:
        log.warning(f"[live_pulse] search_velocity failed for {zone_slug}: {exc}")
        return {"value": 0, "baseline": 0, "delta_pct": 0, "source": "unavailable", "confidence": 0.0}


# ─── Signal 2: view volume (behavioral_events) ───────────────────────────────

async def compute_view_volume(
    db, zone_slug: str, days: int = 30, baseline_days: int = 90,
) -> Dict[str, Any]:
    now = _now()
    # P0.9 · reconexión: la data real vive en behavioral_events (no behavioral_tracking_events).
    # El writer guarda timestamp (datetime/Date), page (pathname) y metadata libre — no un campo zone_slug.
    # → filtro por timestamp (datetime, NO ISO) e infiero la "vista de zona" de:
    #   (a) metadata etiquetada en origen (endstate, ver behavioralTracker.usePageViewTracking)
    #   (b) la URL pública de la zona /colonia/<slug> o /mapa/<alcaldia>/<slug>.
    cur_cutoff = now - timedelta(days=days)
    base_cutoff = now - timedelta(days=baseline_days)
    try:
        slug_rx = re.escape(zone_slug)
        zone_q = {"$or": [
            {"metadata.zone_slug": zone_slug},
            {"metadata.colonia_slug": zone_slug},
            {"page": {"$regex": f"/colonia/{slug_rx}(?:[/?#]|$)", "$options": "i"}},
            {"page": {"$regex": f"/zona/{slug_rx}(?:[/?#]|$)", "$options": "i"}},   # censo 2026-07-05: la página pública de zona ES /zona/<slug>
            {"page": {"$regex": f"/mapa/[^/]+/{slug_rx}(?:[/?#]|$)", "$options": "i"}},
        ]}
        cur_count = await db.behavioral_events.count_documents({
            **zone_q, "timestamp": {"$gte": cur_cutoff},
        })
        base_count = await db.behavioral_events.count_documents({
            **zone_q, "timestamp": {"$gte": base_cutoff},
        })
        baseline_per_day = (base_count / float(baseline_days)) if baseline_days > 0 else 0.0
        cur_per_day = (cur_count / float(days)) if days > 0 else 0.0
        if baseline_per_day > 0:
            delta_pct = _cap_delta(((cur_per_day - baseline_per_day) / baseline_per_day) * 100.0)
        else:
            delta_pct = 100.0 if cur_count > 0 else 0.0
        source = "real" if cur_count > 0 else "insufficient_data"
        return {
            "value": float(cur_count),
            "baseline": round(baseline_per_day, 4),
            "delta_pct": round(delta_pct, 2),
            "source": source,
            "confidence": _confidence(cur_count),
        }
    except Exception as exc:
        log.warning(f"[live_pulse] view_volume failed for {zone_slug}: {exc}")
        return {"value": 0, "baseline": 0, "delta_pct": 0, "source": "unavailable", "confidence": 0.0}


# ─── Signal 3: trend velocity (apify_trends_cache) ───────────────────────────

async def compute_trend_velocity(db, zone_slug: str) -> Dict[str, Any]:
    apify_real = os.environ.get("APIFY_TRENDS_REAL", "false").lower() == "true"

    if not apify_real:
        # Heuristico determinista: hash(zone_slug + ISO_week) % 50 - 25 → [-25, +24]
        iso_week = _now().strftime("%G-W%V")
        seed_input = f"{zone_slug}_{iso_week}".encode("utf-8")
        seed = int(hashlib.sha256(seed_input).hexdigest()[:8], 16)
        delta = float((seed % 50) - 25)
        return {
            "value": delta,
            "baseline": 0.0,
            "delta_pct": _cap_delta(delta),
            "source": "stub",
            "confidence": 0.3,
        }

    # Real: slope linear ultimos 30d en apify_trends_cache
    try:
        cutoff = (_now() - timedelta(days=30)).isoformat()
        cursor = db.apify_trends_cache.find(
            {"zone_slug": zone_slug, "cached_at": {"$gte": cutoff}},
            {"_id": 0, "interest_score": 1, "cached_at": 1},
        ).sort("cached_at", 1).limit(60)
        scores: List[float] = []
        async for d in cursor:
            sc = d.get("interest_score")
            if isinstance(sc, (int, float)):
                scores.append(float(sc))
        n = len(scores)
        if n < 2:
            return {"value": 0, "baseline": 0, "delta_pct": 0, "source": "insufficient_data", "confidence": 0.0}
        # slope normalizado: (last_avg - first_avg) / first_avg * 100
        first_half = scores[: n // 2]
        second_half = scores[n // 2:]
        v_first = sum(first_half) / max(len(first_half), 1)
        v_second = sum(second_half) / max(len(second_half), 1)
        delta = _cap_delta(((v_second - v_first) / v_first) * 100.0) if v_first > 0 else 0.0
        return {
            "value": round(v_second, 4),
            "baseline": round(v_first, 4),
            "delta_pct": round(delta, 2),
            "source": "real",
            "confidence": min(n / 30.0, 1.0),
        }
    except Exception as exc:
        log.warning(f"[live_pulse] trend_velocity failed for {zone_slug}: {exc}")
        return {"value": 0, "baseline": 0, "delta_pct": 0, "source": "unavailable", "confidence": 0.0}


# ─── Signal 4: lead intent velocity ──────────────────────────────────────────

async def compute_lead_intent_velocity(
    db, zone_slug: str, days: int = 30, baseline_days: int = 180,
) -> Dict[str, Any]:
    now = _now()
    cur_cutoff = (now - timedelta(days=days)).isoformat()
    base_cutoff = (now - timedelta(days=baseline_days)).isoformat()
    try:
        zone_q = {"$or": [
            {"zone_id": zone_slug},
            {"colonia_slug": zone_slug},
            {"interest_zones": zone_slug},
        ]}
        cur_count = await db.leads.count_documents({
            **zone_q, "created_at": {"$gte": cur_cutoff},
        })
        base_count = await db.leads.count_documents({
            **zone_q, "created_at": {"$gte": base_cutoff},
        })
        baseline_per_day = (base_count / float(baseline_days)) if baseline_days > 0 else 0.0
        cur_per_day = (cur_count / float(days)) if days > 0 else 0.0
        if baseline_per_day > 0:
            delta_pct = _cap_delta(((cur_per_day - baseline_per_day) / baseline_per_day) * 100.0)
        else:
            delta_pct = 100.0 if cur_count > 0 else 0.0
        source = "real" if cur_count > 0 else "insufficient_data"
        return {
            "value": float(cur_count),
            "baseline": round(baseline_per_day, 4),
            "delta_pct": round(delta_pct, 2),
            "source": source,
            "confidence": _confidence(cur_count),
        }
    except Exception as exc:
        log.warning(f"[live_pulse] lead_intent failed for {zone_slug}: {exc}")
        return {"value": 0, "baseline": 0, "delta_pct": 0, "source": "unavailable", "confidence": 0.0}


# ─── Signal 5: price movement (forecast_engine DRPI) ─────────────────────────

async def compute_price_movement(db, zone_slug: str) -> Dict[str, Any]:
    try:
        try:
            import forecast_engine  # type: ignore
            get_drpi_delta = getattr(forecast_engine, "get_drpi_delta", None)
        except Exception:
            get_drpi_delta = None

        if get_drpi_delta is not None:
            try:
                res = await get_drpi_delta(zone_slug, days=30)  # type: ignore
            except TypeError:
                # firma alternativa
                res = await get_drpi_delta(db, zone_slug, window_days=30)  # type: ignore
            if isinstance(res, dict):
                drpi_delta = float(res.get("delta_pct") or res.get("delta") or 0.0)
            elif isinstance(res, (int, float)):
                drpi_delta = float(res)
            else:
                drpi_delta = 0.0
            return {
                "value": round(drpi_delta, 2),
                "baseline": 0.0,
                "delta_pct": _cap_delta(drpi_delta),
                "source": "real",
                "confidence": 0.8,
            }
        # Fallback: leer ultimo snapshot drpi_snapshots (no rompe spec ya que sigue siendo "real")
        snap = await db.drpi_snapshots.find_one(
            {"zone_id": zone_slug}, {"_id": 0, "delta_pct": 1}, sort=[("computed_at", -1)],
        )
        if snap and isinstance(snap.get("delta_pct"), (int, float)):
            drpi_delta = float(snap["delta_pct"])
            return {
                "value": round(drpi_delta, 2),
                "baseline": 0.0,
                "delta_pct": _cap_delta(drpi_delta),
                "source": "real",
                "confidence": 0.8,
            }
        return {"value": 0, "baseline": 0, "delta_pct": 0, "source": "unavailable", "confidence": 0.0}
    except Exception as exc:
        log.warning(f"[live_pulse] price_movement failed for {zone_slug}: {exc}")
        return {"value": 0, "baseline": 0, "delta_pct": 0, "source": "unavailable", "confidence": 0.0}


# ─── Signal 6 (W5.15 P2 Sub-E): accuracy_drift ───────────────────────────────
# Preparatorio · weight=0 inicial · activacion gradual via ACCURACY_DRIFT_WEIGHT env var.

async def compute_accuracy_drift(db, zone_slug: str) -> Dict[str, Any]:
    """Mide la mejora/empeoramiento de la precision del AVM en la zona.

    delta_pct negativo = MAPE_30d < baseline_180d = el modelo MEJORO. Para que
    ese delta sea senal POSITIVA en Live Pulse, lo invertimos.
    """
    try:
        import accuracy_engine
        m30 = await accuracy_engine.compute_mape_rolling(db, zone_slug, days=30)
        m180 = await accuracy_engine.compute_mape_rolling(db, zone_slug, days=180)
        if not m30.get("available"):
            return {"value": 0, "baseline": 0, "delta_pct": 0,
                    "source": "insufficient_data", "confidence": 0.0}
        mape_30 = float(m30["mape_pct"])
        mape_180 = float(m180.get("mape_pct") or mape_30)
        # Mejora = baseline - actual. Mejor accuracy = signal positivo.
        improvement_pp = mape_180 - mape_30
        # Normalizamos a un delta_pct similar al de las otras senales (cap [-100,500])
        delta = _cap_delta(improvement_pp * 5.0)
        return {
            "value": round(mape_30, 4),
            "baseline": round(mape_180, 4),
            "delta_pct": round(delta, 2),
            "source": "real",
            "confidence": min(int(m30.get("sample_size") or 0) / 100.0, 1.0),
        }
    except Exception as exc:
        log.warning(f"[live_pulse] accuracy_drift failed for {zone_slug}: {exc}")
        return {"value": 0, "baseline": 0, "delta_pct": 0, "source": "unavailable", "confidence": 0.0}


# ─── Score composer ──────────────────────────────────────────────────────────

WEIGHTS = {
    "search_velocity": 0.35,
    "view_volume": 0.25,
    "trend_velocity": 0.15,
    "lead_intent_velocity": 0.20,
    "price_movement": 0.05,
    # W5.15 P2 — preparatorio. Activacion gradual via env ACCURACY_DRIFT_WEIGHT.
    "accuracy_drift": float(os.environ.get("ACCURACY_DRIFT_WEIGHT", "0") or 0),
}


def compose_score(signals: Dict[str, Dict[str, Any]]) -> float:
    """Score 0-100 sigmoid · SOLO las señales reales lo mueven (los stubs no contaminan).
    Se re-normaliza al peso real usado, para no inventar movimiento con dato sintético."""
    total_weight = sum(w for w in WEIGHTS.values() if w > 0)
    weighted_sum = 0.0
    used_weight = 0.0
    for key, weight in WEIGHTS.items():
        if weight <= 0:
            continue
        sig = signals.get(key) or {}
        if sig.get("source") != "real":   # stub/unavailable/insufficient → NO mueven el score
            continue
        delta = max(-100.0, min(500.0, float(sig.get("delta_pct") or 0.0)))
        weighted_sum += delta * weight
        used_weight += weight
    if used_weight <= 0:
        return 50.0   # sin dato real → neutral (se acompaña de data_quality.es_estimado)
    weighted_sum *= total_weight / used_weight   # escala como si el peso real cubriera todo
    score = 100.0 / (1.0 + math.exp(-weighted_sum / 30.0))
    return round(score, 2)


def data_quality(signals: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    """Cuánto del pulso viene de dato real vs estimado — para mostrar 'estimando' honesto."""
    total = sum(w for w in WEIGHTS.values() if w > 0) or 1.0
    real = sum(w for k, w in WEIGHTS.items() if w > 0 and (signals.get(k) or {}).get("source") == "real")
    frac = round(real / total, 2)
    return {"real_weight": frac, "es_estimado": frac < 0.5,
            "lectura": ("Datos reales" if frac >= 0.8 else "Parcialmente estimado" if frac >= 0.5 else "Estimado — aún sin datos en vivo de esta zona")}


def score_bucket(score: float) -> str:
    if score <= 40:
        return "cold"
    if score <= 65:
        return "warm"
    if score <= 85:
        return "hot"
    return "surging"


def _stub_flags(signals: Dict[str, Dict[str, Any]]) -> Dict[str, bool]:
    return {k: (v.get("source") in ("stub", "unavailable", "insufficient_data")) for k, v in signals.items()}


# ─── Orchestrator ────────────────────────────────────────────────────────────

async def compute_pulse(db, zone_slug: str) -> Dict[str, Any]:
    """Orchestrator: 6 signals en paralelo + score + bucket. NO persiste."""
    sv, vv, tv, lv, pm, ad = await asyncio.gather(
        compute_search_velocity(db, zone_slug),
        compute_view_volume(db, zone_slug),
        compute_trend_velocity(db, zone_slug),
        compute_lead_intent_velocity(db, zone_slug),
        compute_price_movement(db, zone_slug),
        compute_accuracy_drift(db, zone_slug),
        return_exceptions=True,
    )

    def _safe(x: Any) -> Dict[str, Any]:
        if isinstance(x, Exception):
            log.warning(f"[live_pulse] signal exception for {zone_slug}: {x}")
            return {"value": 0, "baseline": 0, "delta_pct": 0, "source": "unavailable", "confidence": 0.0}
        return x

    signals = {
        "search_velocity": _safe(sv),
        "view_volume": _safe(vv),
        "trend_velocity": _safe(tv),
        "lead_intent_velocity": _safe(lv),
        "price_movement": _safe(pm),
        "accuracy_drift": _safe(ad),
    }
    score = compose_score(signals)

    # ── F2 Sub-D · RAG context (external macro) for downstream LLM consumers ──
    # Live Pulse itself has no LLM call, but its snapshot is consumed by W5.6
    # Storyteller and W5.5 dashboards which render LLM-enriched copy. Surfacing
    # external macro context here lets those consumers cite without re-fetching.
    _rag_context_text = ""
    try:
        from rag_context_helper import get_external_context
        _ec = await get_external_context(db, zone=zone_slug)
        if _ec:
            _rag_context_text = _ec
    except Exception as _rag_exc:
        log.warning(f"[rag_wiring live_pulse] failed silent: {_rag_exc}")
        _rag_context_text = ""

    out = {
        "zone_slug": zone_slug,
        "score": score,
        "bucket": score_bucket(score),
        "signals": signals,
        "computed_at": _iso(_now()),
        "stub_flags": _stub_flags(signals),
        "data_quality": data_quality(signals),   # honestidad: cuánto es real vs estimado
    }
    if _rag_context_text:
        out["rag_context"] = _rag_context_text
    return out


async def persist_snapshot(db, pulse: Dict[str, Any]) -> Optional[str]:
    try:
        doc = {
            "id": _sid(),
            "zone_slug": pulse["zone_slug"],
            "score": pulse["score"],
            "bucket": pulse.get("bucket"),
            "signals": pulse["signals"],
            "computed_at": pulse["computed_at"],
            "stub_flags": pulse.get("stub_flags") or {},
        }
        await db.live_pulse_snapshots.insert_one(dict(doc))
        return doc["id"]
    except Exception as exc:
        log.warning(f"[live_pulse] persist_snapshot failed: {exc}")
        return None


def summarize_signals(signals: Dict[str, Dict[str, Any]]) -> Dict[str, float]:
    """Resumen compacto de deltas para payload de alerta."""
    return {k: round(float(v.get("delta_pct") or 0.0), 1) for k, v in signals.items()}


# ─── Indexes ─────────────────────────────────────────────────────────────────

async def ensure_live_pulse_indexes(db) -> None:
    """Crea indexes y TTL para todas las colecciones live_pulse_*."""
    try:
        from pymongo import ASCENDING, DESCENDING

        # Snapshots: index temporal + por zona, sin TTL (history necesaria)
        await db.live_pulse_snapshots.create_index(
            [("computed_at", DESCENDING)], name="computed_desc",
        )
        await db.live_pulse_snapshots.create_index(
            [("zone_slug", ASCENDING), ("computed_at", DESCENDING)], name="zone_computed_idx",
        )
        await db.live_pulse_snapshots.create_index("id", unique=True, sparse=True)

        # Subscriptions
        await db.live_pulse_subscriptions.create_index(
            [("user_id", ASCENDING), ("zone_slug", ASCENDING)], name="user_zone_idx",
        )
        await db.live_pulse_subscriptions.create_index("id", unique=True, sparse=True)

        # Alerts sent — TTL 30d sobre sent_at_dt (datetime)
        await db.live_pulse_alerts_sent.create_index(
            [("sent_at_dt", DESCENDING)], name="alerts_sent_desc",
        )
        await db.live_pulse_alerts_sent.create_index("hash", unique=True, sparse=True)
        try:
            await db.live_pulse_alerts_sent.create_index(
                "sent_at_dt", name="alerts_ttl", expireAfterSeconds=2_592_000,
            )
        except Exception:
            pass

        # Readiness history — TTL 365d sobre recorded_at_dt
        await db.live_pulse_readiness_history.create_index(
            [("recorded_at", DESCENDING)], name="readiness_recorded_desc",
        )
        try:
            await db.live_pulse_readiness_history.create_index(
                "recorded_at_dt", name="readiness_ttl", expireAfterSeconds=31_536_000,
            )
        except Exception:
            pass

        log.info("[live_pulse] indexes OK")
    except Exception as exc:
        log.warning(f"[live_pulse] index creation warning: {exc}")


# alias publico
ensure_indexes = ensure_live_pulse_indexes
