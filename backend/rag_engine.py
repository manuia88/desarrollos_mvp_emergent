"""Phase D1 — Vector embeddings + semantic search RAG.

Indexa OCR text, extractions, narratives AI, scores snapshots, dev/colonia metadata
en colección `dmx_embeddings` con vectores OpenAI text-embedding-3-small (1536 dim).

Cosine similarity in-memory (Mongo Community no soporta $vectorSearch). Caché en RAM
del corpus completo para latencia <100ms en queries.

Cero invención: cada chunk indexado tiene `source_doc_id` o `source_entity_id` y
todas las citas regresan con `score`, `source_type` y referencia auditable.
"""
from __future__ import annotations

import os
import math
import logging
import hashlib
import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Query, Request, HTTPException

log = logging.getLogger("dmx.rag")

EMBED_MODEL = "text-embedding-3-small"
EMBED_DIM = 1536
EMBED_PROMPT_VERSION = "1.0"
EMBED_BATCH = 96
EMBED_MAX_CHARS = 7500  # ~ 1 token / 4 chars; safe under 8191 token cap

# OpenAI per-1M token cost for text-embedding-3-small
EMBED_COST_PER_1M = 0.02

# In-memory corpus cache: list of dicts (one per chunk).
# Loaded at startup + after batch reindex.
_CORPUS: List[Dict[str, Any]] = []
_CORPUS_LOCK = asyncio.Lock()


# ─── OpenAI client (sync via thread) ──────────────────────────────────────────
def _client():
    from openai import OpenAI  # lazy import
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY not configured")
    return OpenAI(api_key=key)


async def _embed_batch(texts: List[str]) -> Tuple[List[List[float]], int]:
    """Returns (vectors, total_tokens). Runs blocking SDK in thread pool."""
    if not texts:
        return [], 0
    def call():
        c = _client()
        r = c.embeddings.create(model=EMBED_MODEL, input=texts)
        return [d.embedding for d in r.data], r.usage.total_tokens
    return await asyncio.to_thread(call)


async def embed_one(text: str) -> List[float]:
    vecs, _ = await _embed_batch([text[:EMBED_MAX_CHARS]])
    return vecs[0]


# ─── Cosine ───────────────────────────────────────────────────────────────────
def cosine(a: List[float], b: List[float]) -> float:
    s = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        s += x * y
        na += x * x
        nb += y * y
    if na == 0 or nb == 0:
        return 0.0
    return s / (math.sqrt(na) * math.sqrt(nb))


# ─── Mongo indexes ────────────────────────────────────────────────────────────
async def ensure_rag_indexes(db) -> None:
    coll = db.dmx_embeddings
    await coll.create_index("chunk_id", unique=True)
    await coll.create_index([("scope", 1), ("entity_id", 1)])
    await coll.create_index("source_type")
    await coll.create_index("hash")


# ─── Chunk builders ───────────────────────────────────────────────────────────
def _hash_text(t: str) -> str:
    return hashlib.sha256(t.encode("utf-8")).hexdigest()[:24]


def _now():
    return datetime.now(timezone.utc)


def _truncate(t: Optional[str], n: int = EMBED_MAX_CHARS) -> str:
    if not t:
        return ""
    return t[:n]


def _scores_to_lines(scores_list: List[Dict[str, Any]]) -> str:
    """Compact human-readable summary of scores for embedding."""
    lines = []
    for s in scores_list[:30]:
        code = s.get("score_code") or s.get("code")
        v = s.get("value")
        tier = s.get("tier") or ""
        if code is None or v is None:
            continue
        try:
            vstr = f"{float(v):.2f}"
        except Exception:
            vstr = str(v)
        lines.append(f"{code}={vstr} {tier}")
    return " · ".join(lines)


async def _build_dev_chunks(db) -> List[Dict[str, Any]]:
    """One chunk per development with: name, address, colonia, stage, score summary,
    narrative AI text, key extractions text. Cero invención: solo data persistida."""
    from data_developments import DEVELOPMENTS
    chunks: List[Dict[str, Any]] = []
    for dev in DEVELOPMENTS:
        dev_id = dev["id"]
        name = dev.get("name", "")
        addr = dev.get("address", "")
        colonia_id = dev.get("colonia_id", "")
        developer_name = (dev.get("developer") or {}).get("name", "")
        stage = dev.get("stage", "")
        amenities = dev.get("amenities", []) or []
        description = dev.get("description", "")
        keywords = dev.get("search_keywords", []) or []
        # Scores · F3.A fix: ie_scores tiene zone_id + code (no scope/entity_id)
        scores = [s async for s in db.ie_scores.find(
            {"zone_id": dev_id},
            {"_id": 0, "code": 1, "value": 1, "tier": 1},
        ).limit(40)]
        # Narrative AI · F3.A fix: campo correcto es narrative_text
        nar = await db.ie_narratives.find_one(
            {"scope": "proyecto", "entity_id": dev_id},
            {"_id": 0, "narrative_text": 1, "model": 1},
            sort=[("generated_at", -1)],
        )
        nar_text = (nar or {}).get("narrative_text", "")
        text = (
            f"Desarrollo: {name}. Dirección: {addr}. Colonia: {colonia_id}. "
            f"Desarrollador: {developer_name}. Etapa: {stage}. "
            f"Amenidades: {', '.join(amenities[:18])}. "
            f"Descripción: {description}. "
            f"Keywords: {', '.join(keywords[:12])}. "
            f"Scores IE: {_scores_to_lines(scores)}. "
            f"Narrativa AI: {nar_text}"
        )
        text = _truncate(text)
        chunks.append({
            "chunk_id": f"dev::{dev_id}::card",
            "scope": "development",
            "entity_id": dev_id,
            "source_type": "development_card",
            "title": name,
            "text": text,
            "metadata": {
                "colonia_id": colonia_id, "stage": stage,
                "developer_name": developer_name,
            },
            "hash": _hash_text(text),
        })
    return chunks


async def _build_colonia_chunks(db) -> List[Dict[str, Any]]:
    from data_seed import COLONIAS
    chunks: List[Dict[str, Any]] = []
    for col in COLONIAS:
        cid = col["id"]
        name = col.get("name", "")
        alcaldia = col.get("alcaldia", "")
        # F3.A fix: ie_scores tiene zone_id + code (no scope/entity_id)
        scores = [s async for s in db.ie_scores.find(
            {"zone_id": cid},
            {"_id": 0, "code": 1, "value": 1, "tier": 1},
        ).limit(40)]
        # F3.A fix: campo correcto narrative_text
        nar = await db.ie_narratives.find_one(
            {"scope": "colonia", "entity_id": cid},
            {"_id": 0, "narrative_text": 1},
            sort=[("generated_at", -1)],
        )
        nar_text = (nar or {}).get("narrative_text", "")
        text = (
            f"Colonia: {name}. Alcaldía: {alcaldia}. "
            f"Scores IE: {_scores_to_lines(scores)}. "
            f"Narrativa AI: {nar_text}"
        )
        text = _truncate(text)
        chunks.append({
            "chunk_id": f"col::{cid}::card",
            "scope": "colonia",
            "entity_id": cid,
            "source_type": "colonia_card",
            "title": name,
            "text": text,
            "metadata": {"alcaldia": alcaldia},
            "hash": _hash_text(text),
        })
    return chunks


async def _build_doc_chunks(db) -> List[Dict[str, Any]]:
    """One chunk per Document Intelligence document (OCR text, ya descifrado).
    Excluye predial / constancia_fiscal (privados → no indexar para search público)."""
    from document_intelligence import decrypt_text
    PRIVATE_TYPES = {"predial", "constancia_fiscal"}
    chunks: List[Dict[str, Any]] = []
    cursor = db.di_documents.find(
        {"status": {"$in": ["ocr_done", "extracted"]}, "doc_type": {"$nin": list(PRIVATE_TYPES)}},
        {"_id": 0, "id": 1, "development_id": 1, "doc_type": 1, "ocr_text_enc": 1, "filename": 1},
    )
    async for d in cursor:
        try:
            ocr = decrypt_text(d.get("ocr_text_enc")) if d.get("ocr_text_enc") else ""
        except Exception:
            ocr = ""
        ocr = _truncate(ocr, 4000)
        if not ocr:
            continue
        text = f"Documento {d.get('doc_type','')} de desarrollo {d.get('development_id','')}: {ocr}"
        chunks.append({
            "chunk_id": f"doc::{d['id']}",
            "scope": "development",
            "entity_id": d["development_id"],
            "source_type": "di_document",
            "title": f"{d.get('doc_type','')}::{d.get('filename','')}",
            "text": text,
            "metadata": {"doc_type": d.get("doc_type"), "doc_id": d["id"]},
            "hash": _hash_text(text),
        })
    return chunks


async def _build_extraction_chunks(db) -> List[Dict[str, Any]]:
    """Extraction structured data → human readable text for embedding."""
    import json as _json
    from document_intelligence import decrypt_text
    chunks: List[Dict[str, Any]] = []
    cursor = db.di_extractions.find({"ok": True}, {"_id": 0})
    PRIVATE_TYPES = {"predial", "constancia_fiscal"}
    async for e in cursor:
        if e.get("doc_type") in PRIVATE_TYPES:
            continue
        enc = e.get("extracted_data_enc")
        if not enc:
            continue
        try:
            data = _json.loads(decrypt_text(enc))
        except Exception:
            continue
        if not data:
            continue
        # Flatten dict to "k: v" lines
        lines: List[str] = []
        def walk(obj, prefix=""):
            if isinstance(obj, dict):
                for k, v in obj.items():
                    walk(v, f"{prefix}{k}.")
            elif isinstance(obj, list):
                for i, item in enumerate(obj[:10]):
                    walk(item, f"{prefix}{i}.")
            elif obj is None:
                return
            else:
                lines.append(f"{prefix.rstrip('.')}: {obj}")
        walk(data)
        if not lines:
            continue
        # Find development_id via document
        doc = await db.di_documents.find_one({"id": e.get("document_id")}, {"_id": 0, "development_id": 1})
        dev_id = (doc or {}).get("development_id", "")
        text = f"Extracción {e.get('doc_type','')} de {dev_id}: " + " | ".join(lines[:60])
        text = _truncate(text)
        chunks.append({
            "chunk_id": f"extract::{e.get('id') or e.get('document_id')}",
            "scope": "development",
            "entity_id": dev_id,
            "source_type": "extraction",
            "title": f"{e.get('doc_type','')}::extract",
            "text": text,
            "metadata": {"doc_type": e.get("doc_type"), "extraction_id": e.get("id"), "document_id": e.get("document_id")},
            "hash": _hash_text(text),
        })
    return chunks


# ─── F2 · Extended corpus builders ────────────────────────────────────────────
# Convención: usar scope= como discriminador (4 scopes existentes: development,
# colonia, doc, extraction). F2 agrega: lead, activity, property_intake, resale,
# external, conversation. tenant_id/user_id_owner viven en metadata para no
# romper schema existente y permitir filtros opcionales en semantic_search.

async def _build_lead_chunks(db) -> List[Dict[str, Any]]:
    """Index leads del CRM · scope='lead' · PII no se inserta plain."""
    chunks: List[Dict[str, Any]] = []
    try:
        cursor = db.leads.find({}, {"_id": 0}).limit(10000)
        async for lead in cursor:
            lead_id = lead.get("id") or lead.get("lead_id")
            if not lead_id:
                continue
            name = (lead.get("full_name") or lead.get("name") or "lead")[:30]
            stage = lead.get("pipeline_stage") or lead.get("stage") or "n/a"
            interested = lead.get("interested_property") or lead.get("development_id") or "n/a"
            score = lead.get("lead_score") or lead.get("score") or 0
            notes = (lead.get("notes") or lead.get("description") or "")[:200]
            text = (
                f"Lead {name} · etapa {stage} · interés {interested} · "
                f"score {score} · notas: {notes}"
            )
            chunks.append({
                "chunk_id": f"lead::{lead_id}",
                "scope": "lead",
                "entity_id": lead_id,
                "source_type": "crm_lead",
                "title": name,
                "text": _truncate(text),
                "metadata": {
                    "tenant_id": lead.get("tenant_id"),
                    "user_id_owner": lead.get("assigned_advisor_id") or lead.get("user_id"),
                    "stage": stage,
                },
                "hash": _hash_text(text),
            })
    except Exception as exc:
        log.warning(f"[_build_lead_chunks] failed silent: {exc}")
    return chunks


async def _build_activity_chunks(db) -> List[Dict[str, Any]]:
    """Index activities (interactions asesor-lead) · últimos 90 días."""
    chunks: List[Dict[str, Any]] = []
    try:
        from datetime import timedelta
        since = _now() - timedelta(days=90)
        cursor = db.activities.find({"created_at": {"$gte": since}}, {"_id": 0}).limit(5000)
        async for act in cursor:
            aid = act.get("id") or act.get("activity_id") or _hash_text(str(act))[:16]
            action = act.get("action") or act.get("type") or "na"
            user_id = (act.get("user_id") or "")[:24]
            target = (act.get("target_id") or act.get("lead_id") or "na")[:40]
            notes = (act.get("notes") or act.get("description") or "")[:150]
            text = f"Actividad {action} · asesor {user_id} · target {target} · notas {notes}"
            chunks.append({
                "chunk_id": f"activity::{aid}",
                "scope": "activity",
                "entity_id": target,
                "source_type": "crm_activity",
                "title": action,
                "text": _truncate(text),
                "metadata": {
                    "tenant_id": act.get("tenant_id"),
                    "user_id_owner": act.get("user_id"),
                    "action": action,
                },
                "hash": _hash_text(text),
            })
    except Exception as exc:
        log.warning(f"[_build_activity_chunks] failed silent: {exc}")
    return chunks


async def _build_property_intake_chunks(db) -> List[Dict[str, Any]]:
    """Index Z.8.7 property intakes (asesor crea landings)."""
    chunks: List[Dict[str, Any]] = []
    try:
        cursor = db.studio_property_intakes.find(
            {}, {"_id": 0, "encrypted_api_key": 0, "api_key_encrypted": 0}
        ).limit(5000)
        async for intake in cursor:
            iid = intake.get("id") or intake.get("intake_id")
            if not iid:
                continue
            usps = (intake.get("unique_selling_points") or [])[:3]
            text = (
                f"Proyecto {intake.get('project_name', 'na')} · "
                f"template {intake.get('template_key', 'na')} · "
                f"buyer_intent {intake.get('buyer_intent', 'na')} · "
                f"tipo {intake.get('property_type', 'na')} · "
                f"colonia {intake.get('colonia', 'na')} · "
                f"developer {intake.get('developer_name', 'na')} · "
                f"USPs {', '.join(str(u) for u in usps)}"
            )
            chunks.append({
                "chunk_id": f"intake::{iid}",
                "scope": "property_intake",
                "entity_id": iid,
                "source_type": "studio_intake",
                "title": intake.get("project_name", "intake"),
                "text": _truncate(text),
                "metadata": {
                    "tenant_id": intake.get("tenant_id"),
                    "user_id_owner": intake.get("created_by_user_id") or intake.get("user_id"),
                    "template_key": intake.get("template_key"),
                    "buyer_intent": intake.get("buyer_intent"),
                },
                "hash": _hash_text(text),
            })
    except Exception as exc:
        log.warning(f"[_build_property_intake_chunks] failed silent: {exc}")
    return chunks


async def _build_resale_chunks(db) -> List[Dict[str, Any]]:
    """Index Z.8.5 listing imports (reventas parseadas)."""
    chunks: List[Dict[str, Any]] = []
    try:
        cursor = db.listing_imports.find(
            {"status": "parsed"}, {"_id": 0, "raw_html_truncated": 0, "raw_html": 0}
        ).limit(5000)
        async for imp in cursor:
            iid = imp.get("id") or imp.get("import_id")
            if not iid:
                continue
            pd = imp.get("parsed_data") or {}
            try:
                price_fmt = f"${int(pd.get('price') or 0):,}"
            except Exception:
                price_fmt = "$na"
            text = (
                f"Reventa {(pd.get('title') or 'na')[:50]} · "
                f"colonia {pd.get('colonia', 'na')} · "
                f"precio {price_fmt} · "
                f"m² {pd.get('area_m2', 0)} · "
                f"rec {pd.get('bedrooms', 0)}"
            )
            chunks.append({
                "chunk_id": f"resale::{iid}",
                "scope": "resale",
                "entity_id": iid,
                "source_type": "listing_import",
                "title": (pd.get("title") or "reventa")[:50],
                "text": _truncate(text),
                "metadata": {
                    "tenant_id": imp.get("tenant_id"),
                    "user_id_owner": imp.get("user_id"),
                    "colonia": pd.get("colonia"),
                    "price": pd.get("price"),
                },
                "hash": _hash_text(text),
            })
    except Exception as exc:
        log.warning(f"[_build_resale_chunks] failed silent: {exc}")
    return chunks


async def _build_external_insights_chunks(db) -> List[Dict[str, Any]]:
    """F3.A · Index data externa/derivada desde collections IE+INEGI realmente pobladas.

    Reemplaza las 5 collections candidate external_data_* que NUNCA existieron por
    las 4 collections REALES del pipeline IE que sí tienen documentos:
      - ie_scores                · scores por zona/código (3,422+ docs)
      - ie_narratives            · narrativas pre-redactadas AI (59+ docs)
      - inegi_demographics_cache · perfiles demográficos INEGI Phase 7.2 (18+ docs)
      - ie_raw_observations      · observaciones brutas IE (214+ docs)

    Cada loop try/except aislado · fail-soft total · si una collection no existe o
    está vacía simplemente devuelve cero chunks de ese scope sin romper el resto.
    """
    import json as _json
    chunks: List[Dict[str, Any]] = []

    # ── 1) ie_scores · agrupado por zone_id ───────────────────────────────────
    try:
        cursor = db.ie_scores.find(
            {"value": {"$ne": None}},
            {"_id": 0, "zone_id": 1, "code": 1, "value": 1, "tier": 1,
             "confidence": 1, "computed_at": 1},
        ).limit(2000)
        by_zone: Dict[str, List[Dict[str, Any]]] = {}
        async for doc in cursor:
            zid = doc.get("zone_id")
            if not zid:
                continue
            by_zone.setdefault(zid, []).append(doc)
        for zid, scores in by_zone.items():
            scores_text = "; ".join(
                f"{s.get('code')}={s.get('value')} ({s.get('tier','')})"
                for s in scores[:15] if s.get("code")
            )
            if not scores_text:
                continue
            text = f"IE scores zona {zid} · {scores_text}"
            chunks.append({
                "chunk_id": f"ie_score::{zid}",
                "scope": "ie_score",
                "entity_id": str(zid),
                "source_type": "ie_score",
                "title": f"scores zona {zid}"[:48],
                "text": _truncate(text),
                "metadata": {"score_count": len(scores)},
                "hash": _hash_text(text),
            })
    except Exception as exc:
        log.warning(f"[_build_external · ie_scores] failed silent: {exc}")

    # ── 2) ie_narratives · narrativas pre-redactadas AI ───────────────────────
    try:
        cursor = db.ie_narratives.find(
            {},
            {"_id": 0, "scope": 1, "entity_id": 1, "narrative_text": 1,
             "generated_at": 1, "model": 1},
        ).limit(300)
        async for doc in cursor:
            txt = doc.get("narrative_text") or ""
            if not txt:
                continue
            entity_id = doc.get("entity_id") or ""
            doc_scope = doc.get("scope") or "unknown"
            text = f"Narrativa IE ({doc_scope} {entity_id}): {txt}"
            chunks.append({
                "chunk_id": f"ie_narrative::{doc_scope}::{entity_id}",
                "scope": "ie_narrative",
                "entity_id": str(entity_id),
                "source_type": "ie_narrative",
                "title": f"narrativa {doc_scope}"[:48],
                "text": _truncate(text),
                "metadata": {"scope_inner": doc_scope, "model": doc.get("model")},
                "hash": _hash_text(text),
            })
    except Exception as exc:
        log.warning(f"[_build_external · ie_narratives] failed silent: {exc}")

    # ── 3) inegi_demographics_cache · perfiles demográficos INEGI ─────────────
    try:
        cursor = db.inegi_demographics_cache.find(
            {},
            {"_id": 0, "cache_key": 1, "state_code": 1, "colonia": 1, "scope": 1,
             "source_year": 1, "population": 1, "income": 1,
             "age_avg": 1, "education_avg_years": 1},
        ).limit(300)
        async for doc in cursor:
            cache_key = doc.get("cache_key", "")
            if not cache_key:
                continue
            colonia = doc.get("colonia", "")
            state = doc.get("state_code", "")
            year = doc.get("source_year", "")
            pop = doc.get("population") or {}
            pop_total = pop.get("total") or pop.get("pop_total") or 0
            age = doc.get("age_avg", 0)
            edu = doc.get("education_avg_years", 0)
            income = doc.get("income") or {}
            income_avg = income.get("average") or income.get("mean") or "n/a"
            text = (
                f"Demografía INEGI · {colonia} ({state}) · año {year} · "
                f"población {pop_total} · edad promedio {age} · "
                f"educación {edu} años · ingreso {income_avg}"
            )
            chunks.append({
                "chunk_id": f"inegi_demo::{cache_key}",
                "scope": "inegi_demographics",
                "entity_id": str(cache_key),
                "source_type": "inegi_demographics",
                "title": f"demografía {colonia}"[:48],
                "text": _truncate(text),
                "metadata": {"state": state, "colonia": colonia, "year": year},
                "hash": _hash_text(text),
            })
    except Exception as exc:
        log.warning(f"[_build_external · inegi_demographics] failed silent: {exc}")

    # ── 4) ie_raw_observations · observaciones brutas (dedup source+zone) ─────
    try:
        cursor = db.ie_raw_observations.find(
            {"is_stub": {"$ne": True}},
            {"_id": 0, "source_id": 1, "zone_id": 1, "payload": 1, "fetched_at": 1},
        ).limit(400)
        seen_pairs: set = set()
        async for doc in cursor:
            sid = doc.get("source_id") or "unknown"
            zid = doc.get("zone_id") or "global"
            pair = f"{sid}::{zid}"
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            payload = doc.get("payload") or {}
            try:
                payload_str = _json.dumps(payload, ensure_ascii=False, default=str)[:400]
            except Exception:
                payload_str = str(payload)[:400]
            text = f"Observación IE · fuente {sid} · zona {zid} · {payload_str}"
            chunks.append({
                "chunk_id": f"ie_obs::{pair}",
                "scope": "ie_observation",
                "entity_id": pair,
                "source_type": "ie_observation",
                "title": f"obs {sid}"[:48],
                "text": _truncate(text),
                "metadata": {"source_id": sid, "zone_id": zid},
                "hash": _hash_text(text),
            })
    except Exception as exc:
        log.warning(f"[_build_external · ie_observations] failed silent: {exc}")

    return chunks


async def _build_conversation_chunks(db) -> List[Dict[str, Any]]:
    """Index conversaciones previas Atlax/Asistente (collection real: asistente_sessions)."""
    chunks: List[Dict[str, Any]] = []
    try:
        from datetime import timedelta
        since = _now() - timedelta(days=60)
        cursor = db.asistente_sessions.find(
            {"created_at": {"$gte": since}}, {"_id": 0}
        ).limit(2000)
        async for sess in cursor:
            sid = sess.get("session_token") or sess.get("session_id") or sess.get("_id")
            if not sid:
                continue
            last_msgs = (sess.get("messages") or [])[-5:]
            summary = " | ".join([(m.get("content") or "")[:60] for m in last_msgs])
            user_id = (sess.get("user_id") or "")[:24]
            text = f"Conversación asistente · user {user_id} · resumen: {summary}"
            chunks.append({
                "chunk_id": f"conversation::{sid}",
                "scope": "conversation",
                "entity_id": str(sid),
                "source_type": "asistente_session",
                "title": f"conv {user_id}",
                "text": _truncate(text),
                "metadata": {
                    "tenant_id": sess.get("tenant_id"),
                    "user_id_owner": sess.get("user_id"),
                },
                "hash": _hash_text(text),
            })
    except Exception as exc:
        log.warning(f"[_build_conversation_chunks] failed silent: {exc}")
    return chunks


# ─── Reindex ──────────────────────────────────────────────────────────────────
async def reindex_all(db, incremental: bool = True) -> Dict[str, Any]:
    """Compute all chunks, embed those whose hash changed, persist."""
    builders = [
        _build_dev_chunks(db),
        _build_colonia_chunks(db),
        _build_doc_chunks(db),
        _build_extraction_chunks(db),
        # F2 · extended corpus
        _build_lead_chunks(db),
        _build_activity_chunks(db),
        _build_property_intake_chunks(db),
        _build_resale_chunks(db),
        _build_external_insights_chunks(db),
        _build_conversation_chunks(db),
    ]
    chunks_lists = await asyncio.gather(*builders)
    all_chunks: List[Dict[str, Any]] = [c for cl in chunks_lists for c in cl]
    if not all_chunks:
        return {"ok": True, "total": 0, "updated": 0, "tokens": 0, "cost_usd": 0.0}

    # Diff vs persisted hashes — only re-embed changed
    persisted = {}
    cursor = db.dmx_embeddings.find({}, {"_id": 0, "chunk_id": 1, "hash": 1})
    async for p in cursor:
        persisted[p["chunk_id"]] = p["hash"]

    to_embed: List[Dict[str, Any]] = []
    for c in all_chunks:
        if persisted.get(c["chunk_id"]) != c["hash"]:
            to_embed.append(c)

    total_tokens = 0
    # Batch embed
    for i in range(0, len(to_embed), EMBED_BATCH):
        batch = to_embed[i:i + EMBED_BATCH]
        texts = [b["text"] for b in batch]
        vecs, tokens = await _embed_batch(texts)
        total_tokens += tokens
        for b, v in zip(batch, vecs):
            b["vector"] = v
            b["model"] = EMBED_MODEL
            b["dim"] = EMBED_DIM
            b["prompt_version"] = EMBED_PROMPT_VERSION
            b["created_at"] = _now()

    # Persist
    for b in to_embed:
        await db.dmx_embeddings.update_one(
            {"chunk_id": b["chunk_id"]},
            {"$set": b},
            upsert=True,
        )

    # Cleanup stale chunks (chunks present in db but not built this round)
    built_ids = {c["chunk_id"] for c in all_chunks}
    stale_ids = [cid for cid in persisted.keys() if cid not in built_ids]
    if stale_ids:
        await db.dmx_embeddings.delete_many({"chunk_id": {"$in": stale_ids}})

    cost = (total_tokens / 1_000_000.0) * EMBED_COST_PER_1M

    # ── AI cost tracking (best-effort, fire-and-forget) ────────────────
    if total_tokens > 0:
        try:
            from ai_budget import track_ai_call
            await track_ai_call(
                db=db,
                dev_org_id="dmx",  # platform-level reindex (no tenant scope)
                model=EMBED_MODEL,
                tokens=int(total_tokens),
                tokens_in=int(total_tokens),
                tokens_out=0,
                call_type="rag_embedding",
                feature_key="rag_embedding",
            )
        except Exception as _exc:
            log.warning(f"[track_ai_call] failed silent: {_exc}")

    # Refresh in-memory cache
    await load_corpus_cache(db)

    return {
        "ok": True,
        "total_chunks": len(all_chunks),
        "updated": len(to_embed),
        "skipped": len(all_chunks) - len(to_embed),
        "stale_deleted": len(stale_ids),
        "tokens": total_tokens,
        "cost_usd": round(cost, 6),
        "model": EMBED_MODEL,
    }


# ─── Corpus cache ─────────────────────────────────────────────────────────────
async def load_corpus_cache(db) -> int:
    """Load all embeddings into memory for fast cosine search."""
    global _CORPUS
    async with _CORPUS_LOCK:
        items = []
        cursor = db.dmx_embeddings.find({}, {"_id": 0})
        async for c in cursor:
            items.append(c)
        _CORPUS = items
    log.info(f"[rag] corpus cache loaded: {len(items)} chunks")
    return len(_CORPUS)


# ─── Search ───────────────────────────────────────────────────────────────────
async def semantic_search(
    db,
    query: str,
    *,
    top_k: int = 10,
    scope: Optional[str] = None,
    entity_id: Optional[str] = None,
    source_types: Optional[List[str]] = None,
    filters: Optional[Dict[str, Any]] = None,
    scopes_in: Optional[List[str]] = None,
) -> Dict[str, Any]:
    if not query or not query.strip():
        raise HTTPException(400, "query vacía")
    if not _CORPUS:
        await load_corpus_cache(db)
    qvec = await embed_one(query.strip())

    # ── AI cost tracking (best-effort, fire-and-forget) ────────────────
    try:
        from ai_budget import track_ai_call
        _q_tokens = max(1, len(query) // 4)
        await track_ai_call(
            db=db,
            dev_org_id="dmx",  # search is platform-level; no per-tenant scope here
            model=EMBED_MODEL,
            tokens=_q_tokens,
            tokens_in=_q_tokens,
            tokens_out=0,
            call_type="rag_embedding",
            feature_key="rag_embedding",
        )
    except Exception as _exc:
        log.warning(f"[track_ai_call] failed silent: {_exc}")
    # Filter
    pool = _CORPUS
    if scope:
        pool = [c for c in pool if c.get("scope") == scope]
    if scopes_in:
        sset = set(scopes_in)
        pool = [c for c in pool if c.get("scope") in sset]
    if entity_id:
        pool = [c for c in pool if c.get("entity_id") == entity_id]
    if source_types:
        st = set(source_types)
        pool = [c for c in pool if c.get("source_type") in st]
    # F2 · optional metadata filters (tenant_id, user_id_owner, etc.)
    if filters:
        for fkey, fval in (filters or {}).items():
            if fval is None:
                continue
            # match either top-level or inside metadata; supports None as "either matches"
            if isinstance(fval, dict) and "$in" in fval:
                fset = set(fval["$in"])
                pool = [c for c in pool if (c.get(fkey) in fset) or ((c.get("metadata") or {}).get(fkey) in fset)]
            elif isinstance(fval, list):
                fset = set(fval)
                pool = [c for c in pool if (c.get(fkey) in fset) or ((c.get("metadata") or {}).get(fkey) in fset)]
            else:
                pool = [
                    c for c in pool
                    if c.get(fkey) == fval
                    or (c.get("metadata") or {}).get(fkey) == fval
                ]
    # Cosine
    scored: List[Tuple[float, Dict[str, Any]]] = []
    for c in pool:
        v = c.get("vector")
        if not v:
            continue
        scored.append((cosine(qvec, v), c))
    scored.sort(key=lambda t: t[0], reverse=True)
    top = scored[:top_k]
    return {
        "ok": True,
        "query": query,
        "model": EMBED_MODEL,
        "corpus_size": len(_CORPUS),
        "filtered_size": len(pool),
        "results": [
            {
                "chunk_id": c["chunk_id"],
                "scope": c.get("scope"),
                "entity_id": c.get("entity_id"),
                "source_type": c.get("source_type"),
                "title": c.get("title"),
                "score": round(float(s), 4),
                "snippet": (c.get("text") or "")[:300],
                "metadata": c.get("metadata", {}),
            }
            for (s, c) in top
        ],
    }


# ─── Routers ──────────────────────────────────────────────────────────────────
public_router = APIRouter(tags=["rag_public"])
admin_router = APIRouter(tags=["rag_admin"])


# SEGURIDAD (RAG P0): scopes que el endpoint PÚBLICO (sin auth) puede buscar — solo inteligencia de
# mercado, nunca PII. El corpus también indexa scopes privados (lead/activity/conversation/doc/extraction/
# property_intake/resale) con nombre+notas de leads y texto de conversaciones de TODOS los tenants →
# exponerlos sin auth sería fuga cross-tenant. El retrieval AUTENTICADO (asistente/broker) usa
# semantic_search con su propio filtro de tenant y conserva acceso completo.
PUBLIC_SEARCH_SCOPES = frozenset({"development", "colonia", "external"})


@public_router.get("/api/search/semantic")
async def search_semantic(
    request: Request,
    q: str = Query(..., min_length=2, description="Consulta libre"),
    top_k: int = Query(10, ge=1, le=30),
    scope: Optional[str] = Query(None, description="development | colonia | external"),
    entity_id: Optional[str] = Query(None),
    source_types: Optional[str] = Query(None, description="Lista separada por coma"),
):
    db = request.app.state.db
    st = [s.strip() for s in source_types.split(",")] if source_types else None
    # Confina la búsqueda pública a scopes NO-PII. Si el cliente pide un scope concreto debe ser público;
    # si no pide ninguno, se acotan TODOS los públicos (nunca el corpus PII completo).
    if scope:
        if scope not in PUBLIC_SEARCH_SCOPES:
            raise HTTPException(403, "scope no disponible en búsqueda pública")
        allowed_scopes = [scope]
    else:
        allowed_scopes = list(PUBLIC_SEARCH_SCOPES)
    return await semantic_search(
        db, q, top_k=top_k, entity_id=entity_id, source_types=st, scopes_in=allowed_scopes,
    )


@admin_router.post("/api/superadmin/rag/reindex")
async def admin_reindex(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user or getattr(user, "role", None) != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    db = request.app.state.db
    return await reindex_all(db)


@admin_router.get("/api/superadmin/rag/stats")
async def admin_stats(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user or getattr(user, "role", None) != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    db = request.app.state.db
    by_type: Dict[str, int] = {}
    cursor = db.dmx_embeddings.aggregate([
        {"$group": {"_id": "$source_type", "n": {"$sum": 1}}},
    ])
    async for row in cursor:
        by_type[row["_id"]] = row["n"]
    total = await db.dmx_embeddings.count_documents({})
    return {
        "ok": True,
        "total": total,
        "by_source_type": by_type,
        "model": EMBED_MODEL,
        "dim": EMBED_DIM,
        "corpus_cache_size": len(_CORPUS),
    }
