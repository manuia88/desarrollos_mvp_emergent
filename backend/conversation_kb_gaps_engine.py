"""W7.AS.3.D · Round 2 · Knowledge-Base Gaps engine.

Detecta patrones "no supe responder" en las conversaciones del agente IA y
sugiere entradas FAQ para que el superadmin cierre el hueco de conocimiento.

Señales de gap (cualquiera dispara · se agregan por pregunta normalizada):
  1. handoff/taken_over inmediato con sentiment negative (frustración → humano)
  2. respuesta del IA en modo stub/cortesía (LLM cayó · stub=True)
  3. mensaje de cortesía por error técnico ("tuve un problema técnico…")

Pipeline: detect_gaps() escanea ventana N días, normaliza la última pregunta
del lead antes del fallo, y hace upsert idempotente en `conversation_kb_gaps`
con occurrences acumuladas. Cache 7d (meta doc) para ser cron-friendly.

Acciones superadmin:
  - list_gaps()        → gaps abiertos ordenados por occurrences
  - add_faq()          → convierte gap en FAQ (`conversation_faqs`) + verify_source
                         opcional vía insights_factcheck_engine (W6.11)
  - dismiss_gap()      → descarta el gap (status=dismissed)
  - gap_stats()        → top gaps de la semana + totales

Collections:
  conversation_kb_gaps   {gap_id, sample_question, normalized, occurrences,
                          signals[], status open|converted|dismissed, faq_id?,
                          first_seen, last_seen, tenant_id?}
  conversation_faqs      {faq_id, question, answer, source_url?, verified?,
                          from_gap_id, created_by, created_at}
  conversation_kb_gaps_meta  {_id="last_run", ran_at}   (cache 7d)

FAIL-OPEN: cualquier fallo de DB/engine retorna shape neutro sin crash.
"""
from __future__ import annotations

import hashlib
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.conversation_kb_gaps")

DETECT_WINDOW_DAYS = 7
RUN_CACHE_DAYS = 7            # cron-friendly: no re-escanear si corrió hace <7d
COURTESY_MARKERS = ("tuve un problema técnico", "problema tecnico al procesar")
_STOPWORDS = {
    "el", "la", "los", "las", "un", "una", "de", "del", "que", "qué", "como",
    "cómo", "para", "por", "con", "en", "y", "o", "a", "es", "me", "mi", "tu",
    "se", "lo", "al", "su", "este", "esta", "hay", "tiene", "quiero", "puedo",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Any) -> Any:
    return dt.isoformat() if isinstance(dt, datetime) else dt


def _faq_id() -> str:
    return f"faq_{uuid.uuid4().hex[:14]}"


def _normalize(text: str) -> str:
    """Normaliza una pregunta a su 'huella' para agrupar gaps similares."""
    t = (text or "").lower().strip()
    t = re.sub(r"[^\wáéíóúñ\s]", " ", t)
    tokens = [w for w in t.split() if w and w not in _STOPWORDS and len(w) > 2]
    return " ".join(sorted(set(tokens)))[:200]


def _gap_id(normalized: str, tenant_id: Optional[str]) -> str:
    seed = f"{normalized}|{tenant_id or 'default'}"
    return "kbgap_" + hashlib.sha1(seed.encode("utf-8")).hexdigest()[:20]


def _neutral(reason: str, **extra: Any) -> Dict[str, Any]:
    out = {"ok": False, "reason": reason}
    out.update(extra)
    return out


# ─── Detection ─────────────────────────────────────────────────────────────────

async def detect_gaps(
    db, days: int = DETECT_WINDOW_DAYS, force: bool = False,
    tenant_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Escanea conversaciones recientes y hace upsert de gaps detectados.

    Cron-friendly: si corrió hace <RUN_CACHE_DAYS y force=False, no re-escanea.
    FAIL-OPEN: ante cualquier error retorna {ok: False, detected: 0}.

    Returns: {ok, detected, scanned_threads, cached, ran_at}
    """
    if db is None:
        return _neutral("no_db", detected=0)
    try:
        # cron cache · evita re-escaneo costoso
        if not force:
            meta = await db.conversation_kb_gaps_meta.find_one({"_id": "last_run"})
            if meta and meta.get("ran_at"):
                ran = meta["ran_at"]
                if isinstance(ran, datetime) and (_now() - ran) < timedelta(days=RUN_CACHE_DAYS):
                    return {"ok": True, "detected": 0, "cached": True,
                            "ran_at": _iso(ran), "scanned_threads": 0}

        since = _now() - timedelta(days=max(1, int(days or DETECT_WINDOW_DAYS)))
        q: Dict[str, Any] = {
            "last_message_at": {"$gte": since},
            "$or": [
                {"status": {"$in": ["handoff", "taken_over"]}},
                {"sentiment": "negative"},
            ],
        }
        if tenant_id:
            q["tenant_id"] = tenant_id

        threads = await db.conversation_threads.find(
            q, {"_id": 1, "tenant_id": 1, "status": 1, "sentiment": 1},
        ).limit(1000).to_list(length=1000)

        detected = 0
        for th in threads:
            cid = th.get("_id")
            t_tenant = th.get("tenant_id")
            signals: List[str] = []
            if th.get("status") in ("handoff", "taken_over") and th.get("sentiment") == "negative":
                signals.append("negative_handoff")

            # última pregunta del lead + si el IA respondió en stub/cortesía
            msgs = await db.conversation_messages.find(
                {"conversation_id": cid, "role": {"$in": ["user", "assistant"]}},
                {"_id": 0, "role": 1, "content": 1, "stub": 1, "created_at": 1},
            ).sort("created_at", 1).limit(60).to_list(length=60)

            last_user_q = None
            for m in msgs:
                role = m.get("role")
                content = (m.get("content") or "")
                if role == "user":
                    last_user_q = content
                elif role == "assistant":
                    low = content.lower()
                    if m.get("stub") and last_user_q:
                        signals.append("llm_stub_fallback")
                    if any(mk in low for mk in COURTESY_MARKERS) and last_user_q:
                        signals.append("technical_error_reply")

            if not signals or not last_user_q:
                continue

            normalized = _normalize(last_user_q)
            if not normalized:
                continue
            gid = _gap_id(normalized, t_tenant)
            now = _now()
            res = await db.conversation_kb_gaps.update_one(
                {"gap_id": gid},
                {
                    "$setOnInsert": {
                        "gap_id": gid, "normalized": normalized,
                        "sample_question": last_user_q[:400],
                        "status": "open", "first_seen": now, "tenant_id": t_tenant,
                        "faq_id": None,
                    },
                    "$set": {"last_seen": now},
                    "$inc": {"occurrences": 1},
                    "$addToSet": {"signals": {"$each": sorted(set(signals))}},
                },
                upsert=True,
            )
            if getattr(res, "upserted_id", None) is not None:
                detected += 1

        await db.conversation_kb_gaps_meta.update_one(
            {"_id": "last_run"}, {"$set": {"ran_at": _now()}}, upsert=True,
        )
        return {"ok": True, "detected": detected, "cached": False,
                "scanned_threads": len(threads), "ran_at": _iso(_now())}
    except Exception as exc:  # FAIL-OPEN
        log.warning(f"[kb_gaps] detect failed: {exc}")
        return _neutral("detect_error", detected=0, error=str(exc))


# ─── Read ───────────────────────────────────────────────────────────────────────

async def list_gaps(
    db, status: str = "open", limit: int = 50, tenant_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Lista gaps ordenados por occurrences desc. FAIL-OPEN → lista vacía."""
    if db is None:
        return {"ok": False, "gaps": [], "count": 0, "reason": "no_db"}
    try:
        q: Dict[str, Any] = {}
        if status and status != "all":
            q["status"] = status
        if tenant_id:
            q["tenant_id"] = tenant_id
        docs = await db.conversation_kb_gaps.find(q, {"_id": 0}).sort(
            "occurrences", -1).limit(min(int(limit or 50), 200)).to_list(length=200)
        for d in docs:
            d["first_seen"] = _iso(d.get("first_seen"))
            d["last_seen"] = _iso(d.get("last_seen"))
        return {"ok": True, "gaps": docs, "count": len(docs)}
    except Exception as exc:  # FAIL-OPEN
        log.warning(f"[kb_gaps] list failed: {exc}")
        return {"ok": False, "gaps": [], "count": 0, "reason": "list_error"}


async def gap_stats(db, days: int = 7) -> Dict[str, Any]:
    """Top gaps + totales para el dashboard superadmin. FAIL-OPEN."""
    if db is None:
        return {"ok": False, "open": 0, "converted": 0, "dismissed": 0, "top": []}
    try:
        coll = db.conversation_kb_gaps
        open_n = await coll.count_documents({"status": "open"})
        conv_n = await coll.count_documents({"status": "converted"})
        dism_n = await coll.count_documents({"status": "dismissed"})
        top = await coll.find({"status": "open"}, {"_id": 0, "gap_id": 1,
              "sample_question": 1, "occurrences": 1, "signals": 1}).sort(
              "occurrences", -1).limit(10).to_list(length=10)
        return {"ok": True, "open": open_n, "converted": conv_n,
                "dismissed": dism_n, "top": top}
    except Exception as exc:  # FAIL-OPEN
        log.warning(f"[kb_gaps] stats failed: {exc}")
        return {"ok": False, "open": 0, "converted": 0, "dismissed": 0, "top": []}


# ─── Actions ──────────────────────────────────────────────────────────────────

async def add_faq(
    db, gap_id: str, question: str, answer: str,
    source_url: Optional[str] = None, actor: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Convierte un gap en FAQ. Idempotente (gap ya convertido → retorna su faq).

    Si source_url se provee, intenta verify_source (W6.11 · best-effort).
    FAIL-OPEN: ante error retorna {ok: False}.
    """
    if db is None:
        return _neutral("no_db")
    if not gap_id or not (question or "").strip() or not (answer or "").strip():
        return _neutral("missing_fields")
    try:
        gap = await db.conversation_kb_gaps.find_one({"gap_id": gap_id}, {"_id": 0})
        if not gap:
            return _neutral("gap_not_found", gap_id=gap_id)
        if gap.get("status") == "converted" and gap.get("faq_id"):
            return {"ok": True, "idempotent": True, "faq_id": gap["faq_id"],
                    "gap_id": gap_id, "status": "converted"}

        # verify_source opcional (best-effort · no bloquea)
        verified = None
        if source_url:
            try:
                from insights_factcheck_engine import verify_source
                vr = await verify_source(db, question.strip(), source_url.strip())
                if isinstance(vr, dict) and "error" not in vr:
                    verified = vr.get("verdict") or vr.get("status") or True
            except Exception as exc:
                log.warning(f"[kb_gaps] verify_source skipped: {exc}")

        fid = _faq_id()
        now = _now()
        await db.conversation_faqs.insert_one({
            "faq_id": fid, "question": question.strip()[:600],
            "answer": answer.strip()[:4000],
            "source_url": (source_url or "").strip()[:600] or None,
            "verified": verified, "from_gap_id": gap_id,
            "created_by": (actor or {}).get("user_id", "superadmin"),
            "created_at": now,
        })
        await db.conversation_kb_gaps.update_one(
            {"gap_id": gap_id},
            {"$set": {"status": "converted", "faq_id": fid, "converted_at": now}},
        )
        await _audit(db, actor, "kb_gap_add_faq", gap_id,
                     {"faq_id": fid, "verified": bool(verified)})
        return {"ok": True, "idempotent": False, "faq_id": fid,
                "gap_id": gap_id, "status": "converted", "verified": verified}
    except Exception as exc:  # FAIL-OPEN
        log.warning(f"[kb_gaps] add_faq failed: {exc}")
        return _neutral("add_faq_error", error=str(exc))


async def dismiss_gap(db, gap_id: str, actor: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Descarta un gap (status=dismissed). Idempotente. FAIL-OPEN."""
    if db is None:
        return _neutral("no_db")
    if not gap_id:
        return _neutral("missing_gap_id")
    try:
        gap = await db.conversation_kb_gaps.find_one({"gap_id": gap_id}, {"_id": 0, "status": 1})
        if not gap:
            return _neutral("gap_not_found", gap_id=gap_id)
        if gap.get("status") == "dismissed":
            return {"ok": True, "idempotent": True, "gap_id": gap_id, "status": "dismissed"}
        await db.conversation_kb_gaps.update_one(
            {"gap_id": gap_id},
            {"$set": {"status": "dismissed", "dismissed_at": _now()}},
        )
        await _audit(db, actor, "kb_gap_dismiss", gap_id, {})
        return {"ok": True, "idempotent": False, "gap_id": gap_id, "status": "dismissed"}
    except Exception as exc:  # FAIL-OPEN
        log.warning(f"[kb_gaps] dismiss failed: {exc}")
        return _neutral("dismiss_error", error=str(exc))


async def _audit(db, actor: Optional[Dict[str, Any]], action: str, entity_id: str, after: Dict[str, Any]) -> None:
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db, actor=actor or {"user_id": "superadmin", "role": "superadmin"},
            action=action, entity_type="conversation_kb_gap",
            entity_id=entity_id, after=after,
        )
    except Exception as exc:
        log.warning(f"[kb_gaps] audit failed silent: {exc}")


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    """Idempotente / fail-soft."""
    try:
        await db.conversation_kb_gaps.create_index("gap_id", unique=True)
        await db.conversation_kb_gaps.create_index(
            [("status", 1), ("occurrences", -1)], background=True)
        await db.conversation_kb_gaps.create_index([("tenant_id", 1)], background=True)
        await db.conversation_faqs.create_index("faq_id", unique=True)
        await db.conversation_faqs.create_index([("from_gap_id", 1)], background=True)
    except Exception as exc:
        log.warning(f"[kb_gaps] ensure_indexes failed: {exc}")
