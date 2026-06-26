"""W6.11 — Insights fact-check + Courses engine.

Two responsibilities (one module for cohesion):
  1. verify_source(claim_text, source_url) → LLM-based verification with
     {confidence 0-100, verdict, sources_consulted, rationale}. Cache 30d.
  2. CRUD for Insights Courses (collection `insights_courses`) — series of
     lessons published as educational content alongside the W5.20 sources.

Both operate within es-MX, sin emojis, voz editorial.
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.insights_factcheck_engine")

FACTCHECK_CACHE_DAYS = 30
DEFAULT_COURSES_LIMIT = 20

_VERDICTS = {"verified", "disputed", "unverified"}


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _short_uid() -> str:
    return uuid.uuid4().hex[:16]


def _slugify(text: str) -> str:
    t = (text or "").lower().strip()
    t = re.sub(r"[áàä]", "a", t)
    t = re.sub(r"[éèë]", "e", t)
    t = re.sub(r"[íìï]", "i", t)
    t = re.sub(r"[óòö]", "o", t)
    t = re.sub(r"[úùü]", "u", t)
    t = re.sub(r"ñ", "n", t)
    t = re.sub(r"[^a-z0-9]+", "-", t)
    t = re.sub(r"-+", "-", t).strip("-")
    return t[:80] or _short_uid()


def _cache_key(claim: str, url: str) -> str:
    h = hashlib.sha256()
    h.update((claim or "").encode("utf-8"))
    h.update(b"|")
    h.update((url or "").encode("utf-8"))
    return h.hexdigest()[:32]


def _heuristic_verdict(claim: str, url: str) -> Dict[str, Any]:
    """Used when LLM not available · returns conservative 'unverified' state."""
    confidence = 35 if (claim and url) else 15
    verdict = "unverified"
    if any(d in (url or "") for d in (".gob.mx", ".gov", "inegi", "banxico", "oecd", "bis.org", "imf.org")):
        confidence = 65
        verdict = "disputed"
    return {
        "confidence": confidence,
        "verdict": verdict,
        "rationale": "Verificación heurística sin LLM disponible · no concluyente",
        "sources_consulted": [url] if url else [],
    }


async def _call_llm_factcheck(claim: str, url: str) -> Dict[str, Any]:
    api_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return _heuristic_verdict(claim, url)

    try:
        from llm_client import LlmChat, UserMessage

        sys_msg = (
            "Eres un fact-checker editorial de DesarrollosMX (es-MX). "
            "Evalúa si la afirmación está respaldada por la fuente declarada. "
            "Responde en JSON estricto sin texto extra: "
            '{"confidence": int 0-100, "verdict": "verified"|"disputed"|"unverified", '
            '"rationale": "2 líneas máximo en es-MX", "sources_consulted": [string]}. '
            "Sé conservador: si dudas, marca disputed o unverified."
        )
        prompt = (
            f"Afirmación: {claim}\n"
            f"Fuente declarada (URL): {url}\n\n"
            "Devuelve SOLO el JSON."
        )
        chat = LlmChat(
            api_key=api_key,
            session_id=f"factcheck_{_cache_key(claim, url)}",
            system_message=sys_msg,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        msg = UserMessage(text=prompt)
        text = (await chat.send_message(msg)) or ""

        import json

        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return _heuristic_verdict(claim, url)
        parsed = json.loads(match.group(0))
        confidence = int(parsed.get("confidence", 0))
        verdict = (parsed.get("verdict") or "unverified").lower()
        if verdict not in _VERDICTS:
            verdict = "unverified"
        return {
            "confidence": max(0, min(100, confidence)),
            "verdict": verdict,
            "rationale": (parsed.get("rationale") or "")[:400],
            "sources_consulted": list(parsed.get("sources_consulted") or []),
        }
    except Exception as exc:
        log.warning(f"[insights_factcheck] LLM call failed: {exc}")
        return _heuristic_verdict(claim, url)


async def verify_source(db, claim_text: str, source_url: str) -> Dict[str, Any]:
    """Verify a claim against a source. Cache 30d."""
    claim = (claim_text or "").strip()
    url = (source_url or "").strip()
    if not claim or not url:
        return {"error": "claim_text y source_url requeridos"}

    key = _cache_key(claim, url)
    now = datetime.now(timezone.utc)

    try:
        cached = await db.insights_factcheck_cache.find_one({"cache_key": key}, {"_id": 0})
    except Exception:
        cached = None
    if cached:
        exp_raw = cached.get("expires_at")
        if isinstance(exp_raw, str):
            try:
                exp_dt = datetime.fromisoformat(exp_raw)
            except Exception:
                exp_dt = now - timedelta(seconds=1)
        else:
            exp_dt = exp_raw or (now - timedelta(seconds=1))
        if exp_dt.tzinfo is None:
            exp_dt = exp_dt.replace(tzinfo=timezone.utc)
        if exp_dt > now:
            return {**cached.get("result", {}), "cached": True, "fetched_at": cached.get("fetched_at")}

    result = await _call_llm_factcheck(claim, url)
    record = {
        "cache_key": key,
        "claim": claim[:600],
        "source_url": url[:600],
        "result": result,
        "fetched_at": _iso_now(),
        "expires_at": (now + timedelta(days=FACTCHECK_CACHE_DAYS)).isoformat(),
    }
    try:
        await db.insights_factcheck_cache.update_one(
            {"cache_key": key}, {"$set": record}, upsert=True
        )
    except Exception as exc:
        log.warning(f"[insights_factcheck] cache write failed: {exc}")

    return {**result, "cached": False, "fetched_at": record["fetched_at"]}


# ─── Courses CRUD ────────────────────────────────────────────────────────────


async def list_courses(db, limit: int = DEFAULT_COURSES_LIMIT, offset: int = 0) -> Dict[str, Any]:
    limit = max(1, min(int(limit or DEFAULT_COURSES_LIMIT), 100))
    offset = max(0, int(offset or 0))
    items: List[Dict[str, Any]] = []
    try:
        cursor = (
            db.insights_courses.find(
                {"published": True},
                {"_id": 0, "id": 1, "slug": 1, "title": 1, "description": 1,
                 "lessons_count": 1, "created_at": 1},
            )
            .sort("created_at", -1)
            .skip(offset)
            .limit(limit)
        )
        async for doc in cursor:
            items.append(doc)
        total = await db.insights_courses.count_documents({"published": True})
    except Exception as exc:
        log.warning(f"[insights_courses] list failed: {exc}")
        total = 0
    return {"items": items, "total": total, "limit": limit, "offset": offset}


async def get_course(db, slug: str) -> Dict[str, Any]:
    if not slug:
        return {"error": "slug requerido"}
    try:
        doc = await db.insights_courses.find_one({"slug": slug, "published": True}, {"_id": 0})
    except Exception as exc:
        log.warning(f"[insights_courses] get failed: {exc}")
        doc = None
    if not doc:
        return {"error": f"curso '{slug}' no encontrado"}
    return doc


async def create_course(db, data: Dict[str, Any], actor: Dict[str, Any]) -> Dict[str, Any]:
    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    if not title or len(title) < 3:
        return {"error": "title requerido (mínimo 3 caracteres)"}
    slug = (data.get("slug") or _slugify(title))[:100]

    exists = await db.insights_courses.find_one({"slug": slug}, {"_id": 1})
    if exists:
        return {"error": f"slug '{slug}' ya existe"}

    lessons = list(data.get("lessons") or [])
    doc = {
        "id": _short_uid(),
        "slug": slug,
        "title": title[:200],
        "description": description[:1000],
        "lessons": lessons,
        "lessons_count": len(lessons),
        "source_urls": list(data.get("source_urls") or []),
        "published": bool(data.get("published", True)),
        "created_at": _iso_now(),
        "updated_at": _iso_now(),
        "created_by": actor.get("user_id") if isinstance(actor, dict) else None,
    }
    await db.insights_courses.insert_one(dict(doc))

    try:
        from audit_immutable_engine import log as audit_log

        await audit_log(
            db,
            actor=actor,
            action="insights_course_created",
            entity_type="insights_course",
            entity_id=doc["id"],
            before=None,
            after={"slug": slug, "title": title, "lessons_count": doc["lessons_count"]},
        )
    except Exception as exc:
        log.warning(f"[insights_courses] audit failed: {exc}")

    doc.pop("_id", None)
    return {"ok": True, "course": doc}


async def update_course(db, slug: str, data: Dict[str, Any], actor: Dict[str, Any]) -> Dict[str, Any]:
    if not slug:
        return {"error": "slug requerido"}
    existing = await db.insights_courses.find_one({"slug": slug}, {"_id": 0})
    if not existing:
        return {"error": f"curso '{slug}' no encontrado"}

    updates: Dict[str, Any] = {"updated_at": _iso_now()}
    for k in ("title", "description", "lessons", "source_urls", "published"):
        if k in data:
            updates[k] = data[k]
    if "lessons" in updates:
        updates["lessons_count"] = len(updates["lessons"] or [])

    await db.insights_courses.update_one({"slug": slug}, {"$set": updates})

    try:
        from audit_immutable_engine import log as audit_log

        await audit_log(
            db,
            actor=actor,
            action="insights_course_updated",
            entity_type="insights_course",
            entity_id=existing.get("id", slug),
            before={k: existing.get(k) for k in updates.keys() if k != "updated_at"},
            after={k: v for k, v in updates.items() if k != "updated_at"},
        )
    except Exception as exc:
        log.warning(f"[insights_courses] audit failed: {exc}")

    return {"ok": True, "slug": slug, "updated": list(updates.keys())}


async def delete_course(db, slug: str, actor: Dict[str, Any]) -> Dict[str, Any]:
    if not slug:
        return {"error": "slug requerido"}
    existing = await db.insights_courses.find_one({"slug": slug}, {"_id": 0, "id": 1, "title": 1})
    if not existing:
        return {"error": f"curso '{slug}' no encontrado"}
    await db.insights_courses.delete_one({"slug": slug})

    try:
        from audit_immutable_engine import log as audit_log

        await audit_log(
            db,
            actor=actor,
            action="insights_course_deleted",
            entity_type="insights_course",
            entity_id=existing.get("id", slug),
            before={"slug": slug, "title": existing.get("title")},
            after=None,
        )
    except Exception as exc:
        log.warning(f"[insights_courses] audit failed: {exc}")

    return {"ok": True, "slug": slug}


async def ensure_factcheck_indexes(db) -> None:
    try:
        await db.insights_factcheck_cache.create_index("cache_key", unique=True)
        await db.insights_factcheck_cache.create_index("expires_at")
        await db.insights_courses.create_index("slug", unique=True)
        await db.insights_courses.create_index("published")
    except Exception as exc:
        log.warning(f"[insights_factcheck] ensure_indexes failed: {exc}")
