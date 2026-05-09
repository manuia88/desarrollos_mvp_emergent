"""W4.4B — Phase Y.1B · Director Memory Engine.

Memory Layer RAG usando MongoDB $text index (sin vector embeddings — Y.2 si necesario).
Híbrido retrieval: 70% text-score + 30% recency-score.
Multi-tenant: filtro org_id obligatorio en todos los retrievals.
TTL: expire_old() soft-delete entradas no accedidas en >180 días.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.director_memory")

# Source type constants
ST_DIAGNOSTIC   = "diagnostic"
ST_IE_SCORE     = "ie_score"
ST_BEHAVIORAL   = "behavioral"
ST_SUMMARY      = "director_summary"

VALID_SOURCE_TYPES = {ST_DIAGNOSTIC, ST_IE_SCORE, ST_BEHAVIORAL, ST_SUMMARY}

# Significancia de cambio IE score para indexar
IE_SCORE_DELTA_THRESHOLD = 5.0


def _memory_id() -> str:
    return f"mem_{uuid.uuid4().hex[:16]}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _recency_score(created_at: datetime, window_days: int = 30) -> float:
    """0.0 (muy viejo) → 1.0 (hoy). Ventana de 30 días."""
    if not created_at:
        return 0.0
    age_days = (_now() - created_at.replace(tzinfo=timezone.utc) if created_at.tzinfo is None else _now() - created_at).days
    return max(0.0, 1.0 - age_days / window_days)


def _truncate(text: str, max_chars: int = 80) -> str:
    if not text:
        return ""
    return text[:max_chars] + ("…" if len(text) > max_chars else "")


def _make_diagnostic_summary(report: Dict[str, Any]) -> str:
    """Extrae resumen de top 3 hallazgos + top 3 recomendaciones del diagnostic report."""
    parts = []

    # Findings
    findings = report.get("findings") or report.get("hallazgos") or []
    if isinstance(findings, list) and findings:
        top3 = [str(f.get("text", f) if isinstance(f, dict) else f) for f in findings[:3]]
        parts.append("Hallazgos: " + " | ".join(top3))

    # Recommendations
    recs = report.get("recommendations") or report.get("recomendaciones") or []
    if isinstance(recs, list) and recs:
        top3 = [str(r.get("text", r) if isinstance(r, dict) else r) for r in recs[:3]]
        parts.append("Recomendaciones: " + " | ".join(top3))

    # Fallback: usar campos genéricos
    if not parts:
        for key in ("summary", "resumen", "conclusion", "texto", "content"):
            val = report.get(key)
            if val and isinstance(val, str):
                parts.append(val[:300])
                break

    return " — ".join(parts) if parts else "Reporte diagnóstico sin resumen estructurado."


def _make_ie_score_text(developer_id: str, old_score: float, new_score: float, delta_breakdown: Dict) -> str:
    delta = round(new_score - old_score, 2)
    direction = "subió" if delta > 0 else "bajó"
    text = f"Score IE del desarrollador {developer_id} {direction} de {old_score:.1f} a {new_score:.1f} (delta {delta:+.2f})."
    if delta_breakdown:
        parts = [f"{k}:{v:+.2f}" for k, v in list(delta_breakdown.items())[:4]]
        text += " Factores: " + ", ".join(parts) + "."
    return text


def _make_behavioral_text(session_id: str, events: List[Dict], top_features: List[str]) -> str:
    n = len(events)
    features_str = ", ".join(top_features[:5]) if top_features else "varios"
    first = events[0]["timestamp"] if events else _now()
    last = events[-1]["timestamp"] if events else _now()
    if isinstance(first, datetime) and isinstance(last, datetime):
        span_min = int((last - first).total_seconds() / 60) if first != last else 0
    else:
        span_min = 0
    return (
        f"Sesión behavioral {session_id}: {n} eventos en {span_min} min. "
        f"Features principales: {features_str}."
    )


class DirectorMemoryEngine:
    def __init__(self, db, org_id: str):
        self.db = db
        self.org_id = org_id
        self._col = db.director_memory_index

    async def ingest_diagnostic(self, diagnostic_report_id: str) -> Optional[str]:
        """Indexa un diagnostic report. Retorna memory_id o None si ya existe."""
        # Idempotente: no re-indexar si ya existe
        existing = await self._col.find_one({"source_id": diagnostic_report_id, "org_id": self.org_id}, {"_id": 1})
        if existing:
            return str(existing["_id"])

        report = await self.db.diagnostic_reports.find_one({"id": diagnostic_report_id}, {"_id": 0})
        if not report:
            # Fallback: buscar por _id string
            from bson import ObjectId
            try:
                report = await self.db.diagnostic_reports.find_one({"_id": ObjectId(diagnostic_report_id)}, {"_id": 0})
            except Exception:
                pass
        if not report:
            log.warning(f"[memory] diagnostic_report '{diagnostic_report_id}' no encontrado")
            return None

        summary = _make_diagnostic_summary(report)
        content_text = (
            summary + " " +
            str(report.get("content", "") or report.get("texto", "") or "")[:2000]
        ).strip()

        mid = _memory_id()
        await self._col.insert_one({
            "_id": mid,
            "org_id": self.org_id,
            "source_type": ST_DIAGNOSTIC,
            "source_id": diagnostic_report_id,
            "source_collection": "diagnostic_reports",
            "content_text": content_text,
            "content_summary": summary[:500],
            "embedding_provider": "none",
            "created_at": _now(),
            "last_accessed_at": None,
            "access_count": 0,
            "metadata": {
                "developer_id": report.get("developer_id"),
                "period": report.get("period"),
            },
        })
        log.info(f"[memory] ingested diagnostic {diagnostic_report_id} → {mid}")
        return mid

    async def ingest_ie_score_change(
        self,
        developer_id: str,
        old_score: float,
        new_score: float,
        delta_breakdown: Optional[Dict] = None,
    ) -> Optional[str]:
        """Indexa cambio de IE score si delta > ±5 puntos."""
        delta = abs(new_score - old_score)
        if delta < IE_SCORE_DELTA_THRESHOLD:
            return None  # no significativo

        source_id = f"{developer_id}_{int(_now().timestamp())}"
        content_text = _make_ie_score_text(developer_id, old_score, new_score, delta_breakdown or {})

        mid = _memory_id()
        await self._col.insert_one({
            "_id": mid,
            "org_id": self.org_id,
            "source_type": ST_IE_SCORE,
            "source_id": source_id,
            "source_collection": "ie_scores",
            "content_text": content_text,
            "content_summary": content_text[:200],
            "embedding_provider": "none",
            "created_at": _now(),
            "last_accessed_at": None,
            "access_count": 0,
            "metadata": {
                "developer_id": developer_id,
                "old_score": old_score,
                "new_score": new_score,
                "delta": round(new_score - old_score, 2),
            },
        })
        log.info(f"[memory] ingested ie_score_change {developer_id} {old_score}→{new_score} → {mid}")
        return mid

    async def ingest_behavioral_session(self, session_id: str) -> Optional[str]:
        """Indexa sesión behavioral si tuvo ≥5 eventos. Idempotente."""
        existing = await self._col.find_one({"source_id": session_id, "org_id": self.org_id}, {"_id": 1})
        if existing:
            return str(existing["_id"])

        events = await self.db.behavioral_events.find(
            {"session_id": session_id},
            {"_id": 0, "feature": 1, "timestamp": 1, "event_type": 1},
        ).sort("timestamp", 1).to_list(length=200)

        if len(events) < 5:
            return None  # umbral mínimo no alcanzado

        # Top features
        feature_counts: Dict[str, int] = {}
        for e in events:
            f = e.get("feature") or e.get("event_type", "unknown")
            feature_counts[f] = feature_counts.get(f, 0) + 1
        top_features = sorted(feature_counts, key=lambda k: -feature_counts[k])[:5]

        content_text = _make_behavioral_text(session_id, events, top_features)

        mid = _memory_id()
        await self._col.insert_one({
            "_id": mid,
            "org_id": self.org_id,
            "source_type": ST_BEHAVIORAL,
            "source_id": session_id,
            "source_collection": "behavioral_events",
            "content_text": content_text,
            "content_summary": content_text[:200],
            "embedding_provider": "none",
            "created_at": _now(),
            "last_accessed_at": None,
            "access_count": 0,
            "metadata": {
                "event_count": len(events),
                "top_features": top_features,
            },
        })
        log.info(f"[memory] ingested behavioral_session {session_id} ({len(events)} events) → {mid}")
        return mid

    async def retrieve(
        self,
        query_text: str,
        top_k: int = 5,
        source_types: Optional[List[str]] = None,
        recency_weight: float = 0.3,
    ) -> List[Dict[str, Any]]:
        """
        Hybrid retrieval: 70% text-score + 30% recency.
        Filtro org_id obligatorio para multi-tenant safety.
        Actualiza last_accessed_at + access_count.
        """
        if not query_text or not query_text.strip():
            return []

        semantic_weight = 1.0 - recency_weight
        base_q: Dict[str, Any] = {"org_id": self.org_id}
        if source_types:
            valid_types = [s for s in source_types if s in VALID_SOURCE_TYPES]
            if valid_types:
                base_q["source_type"] = {"$in": valid_types}

        candidates: Dict[str, Dict[str, Any]] = {}

        # ── Pass 1: $text search (semantic component) ──────────────────────────
        try:
            text_q = {**base_q, "$text": {"$search": query_text}}
            cursor = self._col.find(
                text_q,
                {"_id": 1, "source_type": 1, "content_summary": 1, "created_at": 1,
                 "metadata": 1, "access_count": 1, "score": {"$meta": "textScore"}},
            ).sort([("score", {"$meta": "textScore"})]).limit(top_k * 3)
            text_hits = await cursor.to_list(length=top_k * 3)
        except Exception:
            text_hits = []

        # Normalize text scores to [0, 1]
        max_ts = max((h.get("score", 0) for h in text_hits), default=1.0)
        for h in text_hits:
            mid = str(h["_id"])
            candidates[mid] = {
                "memory_id": mid,
                "source_type": h.get("source_type"),
                "content_summary": h.get("content_summary", ""),
                "created_at": h.get("created_at"),
                "metadata": h.get("metadata") or {},
                "access_count": h.get("access_count", 0),
                "text_score": h.get("score", 0) / max(max_ts, 1e-6),
                "recency_score": 0.0,
            }

        # ── Pass 2: Recency supplement — recent docs even without text match ──
        recency_q = {**base_q, "created_at": {"$gte": _now() - timedelta(days=30)}}
        recent_hits = await self._col.find(
            recency_q,
            {"_id": 1, "source_type": 1, "content_summary": 1, "created_at": 1, "metadata": 1, "access_count": 1},
        ).sort("created_at", -1).limit(top_k * 2).to_list(length=top_k * 2)

        for h in recent_hits:
            mid = str(h["_id"])
            rec_score = _recency_score(h.get("created_at"), window_days=30)
            if mid not in candidates:
                candidates[mid] = {
                    "memory_id": mid,
                    "source_type": h.get("source_type"),
                    "content_summary": h.get("content_summary", ""),
                    "created_at": h.get("created_at"),
                    "metadata": h.get("metadata") or {},
                    "access_count": h.get("access_count", 0),
                    "text_score": 0.0,
                    "recency_score": rec_score,
                }
            else:
                candidates[mid]["recency_score"] = rec_score

        if not candidates:
            return []

        # ── Score and rank ─────────────────────────────────────────────────────
        for c in candidates.values():
            c["final_score"] = (
                semantic_weight * c["text_score"] +
                recency_weight * c["recency_score"]
            )

        ranked = sorted(candidates.values(), key=lambda x: -x["final_score"])[:top_k]

        # ── Update access metadata ─────────────────────────────────────────────
        hit_ids = [r["memory_id"] for r in ranked]
        await self._col.update_many(
            {"_id": {"$in": hit_ids}},
            {"$set": {"last_accessed_at": _now()}, "$inc": {"access_count": 1}},
        )

        # Serialize
        for r in ranked:
            ts = r.get("created_at")
            r["created_at"] = ts.isoformat() if isinstance(ts, datetime) else str(ts or "")

        return ranked

    async def expire_old(self, days: int = 180) -> int:
        """Elimina entradas no accedidas en >N días. Retorna count eliminados."""
        cutoff = _now() - timedelta(days=days)
        # Eliminar si last_accessed_at es None (nunca accedido) y created_at > days old
        # OR last_accessed_at < cutoff
        query = {
            "org_id": self.org_id,
            "$or": [
                {"last_accessed_at": None, "created_at": {"$lt": cutoff}},
                {"last_accessed_at": {"$lt": cutoff}},
            ],
        }
        result = await self._col.delete_many(query)
        log.info(f"[memory] expire_old(days={days}) org={self.org_id}: deleted {result.deleted_count}")
        return result.deleted_count


# ─── Global expire (all orgs, for weekly cron) ───────────────────────────────
async def expire_all_orgs(db, days: int = 180) -> int:
    """Cron semanal: expira entradas de todos los orgs."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.director_memory_index.delete_many({
        "$or": [
            {"last_accessed_at": None, "created_at": {"$lt": cutoff}},
            {"last_accessed_at": {"$lt": cutoff}},
        ]
    })
    log.info(f"[memory] expire_all_orgs(days={days}): deleted {result.deleted_count}")
    return result.deleted_count


# ─── Daily cron ingest ────────────────────────────────────────────────────────
async def run_memory_daily_ingest(db) -> Dict[str, int]:
    """
    Cron diario 04:30 MX:
    - Ingesta diagnostic_reports (last 24h)
    - Ingesta ie_score_changes significativos (last 24h)
    - Ingesta behavioral_sessions con ≥5 eventos (last 24h)
    """
    since = datetime.now(timezone.utc) - timedelta(hours=25)  # 25h para no perder edge cases
    counts = {"diagnostic": 0, "ie_score": 0, "behavioral": 0}

    # 1. Diagnostic reports nuevos
    try:
        new_reports = await db.diagnostic_reports.find(
            {"created_at": {"$gte": since}},
            {"_id": 0, "id": 1, "developer_id": 1, "org_id": 1},
        ).limit(200).to_list(length=200)

        for r in new_reports:
            org_id = r.get("org_id", "unknown")
            engine = DirectorMemoryEngine(db, org_id)
            mem_id = await engine.ingest_diagnostic(r.get("id", ""))
            if mem_id:
                counts["diagnostic"] += 1
    except Exception as e:
        log.warning(f"[memory_cron] diagnostic ingest error: {e}")

    # 2. IE score changes significativos (usa ie_scores_history si existe)
    try:
        score_changes = await db.ie_scores_history.find(
            {"timestamp": {"$gte": since}, "delta": {"$exists": True}},
            {"_id": 0},
        ).limit(200).to_list(length=200)

        for sc in score_changes:
            delta = abs(sc.get("delta") or 0)
            if delta < IE_SCORE_DELTA_THRESHOLD:
                continue
            org_id = sc.get("org_id", "unknown")
            engine = DirectorMemoryEngine(db, org_id)
            mem_id = await engine.ingest_ie_score_change(
                developer_id=sc.get("developer_id", ""),
                old_score=float(sc.get("old_score", 0)),
                new_score=float(sc.get("new_score", 0)),
                delta_breakdown=sc.get("delta_breakdown", {}),
            )
            if mem_id:
                counts["ie_score"] += 1
    except Exception as e:
        log.warning(f"[memory_cron] ie_score ingest error: {e}")

    # 3. Behavioral sessions con ≥5 eventos
    try:
        # Agrupamos session_ids únicos de behavioral_events de las últimas 25h
        pipeline = [
            {"$match": {"timestamp": {"$gte": since}}},
            {"$group": {"_id": "$session_id", "count": {"$sum": 1}, "org_id": {"$first": "$org_id"}}},
            {"$match": {"count": {"$gte": 5}}},
            {"$limit": 200},
        ]
        sessions = await db.behavioral_events.aggregate(pipeline).to_list(length=200)
        for s in sessions:
            org_id = s.get("org_id") or "unknown"
            engine = DirectorMemoryEngine(db, org_id)
            mem_id = await engine.ingest_behavioral_session(s["_id"])
            if mem_id:
                counts["behavioral"] += 1
    except Exception as e:
        log.warning(f"[memory_cron] behavioral ingest error: {e}")

    log.info(f"[memory_cron] daily ingest done: {counts}")
    return counts


# ─── Indexes ──────────────────────────────────────────────────────────────────
async def ensure_indexes(db) -> None:
    try:
        col = db.director_memory_index

        # TEXT index para búsqueda semántica simple
        await col.create_index(
            [("content_text", "text"), ("content_summary", "text")],
            name="idx_mem_text_search",
            default_language="spanish",
            weights={"content_summary": 3, "content_text": 1},
        )
        await col.create_index(
            [("org_id", 1), ("source_type", 1), ("created_at", -1)],
            name="idx_mem_org_type_time",
        )
        await col.create_index("source_id", name="idx_mem_source_id")
        await col.create_index("last_accessed_at", name="idx_mem_last_accessed")
        await col.create_index([("org_id", 1), ("created_at", -1)], name="idx_mem_org_time")
        log.info("[memory] indexes OK")
    except Exception as exc:
        log.warning(f"[memory] ensure_indexes failed: {exc}")
