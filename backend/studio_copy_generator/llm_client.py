"""W5.22 Z.8.7 Sub-B · LLM client wrapper (EMERGENT_LLM_KEY · in-memory TTL cache).

Reusa el pattern de emergentintegrations (NO crea cliente nuevo).
Cache in-memory (no Redis en este pod) con TTL 24h por cache_key.
Fallback gracioso si la llamada al LLM falla.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from threading import Lock
from typing import Any, Dict, Optional, Tuple

log = logging.getLogger("dmx.studio_copy_llm")

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
MODEL_NAME = os.environ.get("STUDIO_COPY_MODEL", "claude-opus-4-7")
MAX_TOKENS = 8000
TEMPERATURE = 0.7
CACHE_TTL = 86400  # 24h

_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_lock = Lock()


def _cache_get(key: str) -> Optional[Dict[str, Any]]:
    with _lock:
        entry = _cache.get(key)
        if not entry:
            return None
        expires_at, value = entry
        if time.time() > expires_at:
            _cache.pop(key, None)
            return None
        return value


def _cache_set(key: str, value: Dict[str, Any]) -> None:
    with _lock:
        _cache[key] = (time.time() + CACHE_TTL, value)


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Extrae primer bloque JSON valido del texto retornado por el LLM."""
    if not text:
        return None
    # Try fenced ```json blocks first
    fenced = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else None
    if not candidate:
        # Greedy first { ... last }
        first = text.find("{")
        last = text.rfind("}")
        if first >= 0 and last > first:
            candidate = text[first:last + 1]
    if not candidate:
        return None
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        return None


async def _invoke_llm(prompt: str) -> str:
    """Invoca el LLM via emergentintegrations + EMERGENT_LLM_KEY.

    Raises:
        RuntimeError si la llamada falla.
    """
    if not EMERGENT_LLM_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY missing in env")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
    except ImportError as exc:
        raise RuntimeError(f"emergentintegrations not installed: {exc}") from exc

    # Reuse pattern de asistente_engine.py / ai_suggestions.py
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"studio_copy_{int(time.time())}",
        system_message="Eres un copywriter inmobiliario experto que retorna SOLO JSON valido.",
    ).with_model("anthropic", MODEL_NAME)
    # with_max_tokens es opcional · algunas versiones del SDK no la exponen
    try:
        chat = chat.with_max_tokens(MAX_TOKENS)
    except AttributeError:
        pass
    msg = UserMessage(text=prompt)
    return await chat.send_message(msg)


async def call_llm(prompt: str, cache_key: str, force_regenerate: bool = False) -> Dict[str, Any]:
    """Entry point cacheado.

    Returns:
        {"data": dict | None, "cached": bool, "fallback": bool, "error": str | None, "raw": str}
    """
    if not force_regenerate:
        hit = _cache_get(cache_key)
        if hit is not None:
            return {**hit, "cached": True}

    try:
        raw = await asyncio.wait_for(_invoke_llm(prompt), timeout=120)
        parsed = _extract_json(raw)
        if parsed is None:
            return {"data": None, "cached": False, "fallback": True, "error": "no_valid_json_in_llm_response", "raw": raw[:500] if raw else ""}
        result: Dict[str, Any] = {"data": parsed, "cached": False, "fallback": False, "error": None, "raw": ""}
        _cache_set(cache_key, result)
        return result
    except Exception as exc:
        log.warning("[studio_copy_llm] LLM call failed (soft): %s", exc)
        return {"data": None, "cached": False, "fallback": True, "error": str(exc)[:240], "raw": ""}
