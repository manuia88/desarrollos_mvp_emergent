"""W7.AS.3.B — Function calling wrapper (Atlax tools) para el broker IA.

Módulo puro importable por conversation_engine.py. NO endpoints · NO UI.

Provee:
  - dispatch_tool(tool_name, params, db) -> dict (async)
        Wrapper sobre el catálogo de tools Atlax/MCP (mcp_tools). Valida que la
        tool exista, la ejecuta, audita la llamada y devuelve un resultado que
        SIEMPRE cita la fuente (tool_id + result_summary) para que el engine la
        muestre al usuario. Si la tool usa LLM → track_ai_call (W2.3 budget).

  - available_tools() -> list[str]
        Nombres de tools dispatchables (derivado del registro vivo).

FAIL-OPEN: nunca crashea el engine. Tool desconocida → {ok:false, error}.
Fallo de ejecución → {ok:false, error} con la fuente citada igualmente.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.conversation_fc")

# Tools que consumen LLM (gatillan track_ai_call). Espejo de mcp_tools._KEY_DOC_TOOLS
# que son las agénticas/Director que invocan modelo.
_LLM_TOOLS = {
    "director_chat", "director_session_summary", "whatif_simulate",
}

# Modelo nominal para budget si la tool no reporta el suyo.
_DEFAULT_MODEL = "claude-sonnet-4"


def available_tools() -> List[str]:
    """Lista de nombres de tools dispatchables (registro vivo de mcp_tools)."""
    try:
        from mcp_tools import MCP_TOOLS
        return [t.get("name") for t in MCP_TOOLS if t.get("name")]
    except Exception as exc:
        log.debug(f"[conversation_fc] available_tools fail-open: {exc}")
        return []


def _summarize_result(result: Any) -> str:
    """Resumen corto y legible del resultado de la tool (para citar en respuesta)."""
    if result is None:
        return "sin datos"
    if isinstance(result, dict):
        # Campos típicos más informativos primero.
        for k in ("assistant_message", "summary", "name", "title", "score",
                  "result", "message"):
            if k in result and result[k] not in (None, ""):
                return str(result[k])[:240]
        keys = list(result.keys())[:6]
        return "campos: " + ", ".join(keys) if keys else "resultado vacío"
    if isinstance(result, list):
        return f"{len(result)} resultados"
    return str(result)[:240]


async def _audit(db: Any, record: Dict[str, Any]) -> None:
    """Audita la llamada en db.conversation_tool_calls. Best-effort (no raise)."""
    if db is None:
        return
    try:
        coll = getattr(db, "conversation_tool_calls", None)
        if coll is None:
            return
        await coll.insert_one(dict(record))
    except Exception as exc:
        log.debug(f"[conversation_fc] audit skip: {exc}")


async def _maybe_track_ai(db: Any, tool_name: str, params: Dict[str, Any],
                          result: Any) -> None:
    """Si la tool usó LLM, registra el consumo en el budget (W2.3)."""
    if tool_name not in _LLM_TOOLS or db is None:
        return
    try:
        from ai_budget import track_ai_call
        res = result if isinstance(result, dict) else {}
        tokens_in = int(res.get("tokens_in") or 0)
        tokens_out = int(res.get("tokens_out") or 0)
        total = tokens_in + tokens_out
        dev_org_id = (params or {}).get("tenant_id") or (params or {}).get("org_id") or "unknown"
        await track_ai_call(
            db,
            dev_org_id=dev_org_id,
            model=_DEFAULT_MODEL,
            tokens=total,
            call_type="conversation_tool",
            tokens_in=tokens_in or None,
            tokens_out=tokens_out or None,
            feature_key=f"conversation:{tool_name}",
        )
    except Exception as exc:
        log.debug(f"[conversation_fc] track_ai_call skip: {exc}")


async def dispatch_tool(tool_name: str, params: Optional[Dict[str, Any]], db: Any) -> Dict[str, Any]:
    """Despacha una tool del catálogo Atlax/MCP y cita su fuente.

    Args:
        tool_name: nombre de la tool (debe existir en el registro).
        params: argumentos de la tool.
        db: handle Mongo (para audit + track_ai_call). Puede ser None.

    Returns:
        {
          "ok": bool,
          "tool_id": <tool_name>,           # fuente citable
          "result": <payload de la tool>,   # solo si ok
          "result_summary": <texto corto>,  # cita para la respuesta
          "latency_ms": <float>,
          "error": <str>,                   # solo si !ok
        }
    FAIL-OPEN: nunca levanta excepción; tool desconocida o fallo → ok=False.
    """
    params = params if isinstance(params, dict) else {}
    started = time.perf_counter()

    # 1) Validar que la tool existe.
    tools = available_tools()
    if tools and tool_name not in tools:
        record = {
            "ok": False,
            "tool_id": tool_name,
            "error": f"Tool desconocida: '{tool_name}'",
            "result_summary": "tool no registrada",
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
        }
        await _audit(db, {**record, "ts": time.time(), "params_keys": list(params.keys())})
        return record

    # 2) Ejecutar via el dispatcher real (mcp_tools).
    try:
        from mcp_tools import dispatch_tool as _mcp_dispatch
        key_doc = params.get("key_doc")  # opcional, para tools con gating
        result = await _mcp_dispatch(db, tool_name, params, key_doc)
        latency = round((time.perf_counter() - started) * 1000, 2)

        await _maybe_track_ai(db, tool_name, params, result)

        out = {
            "ok": True,
            "tool_id": tool_name,
            "result": result,
            "result_summary": _summarize_result(result),
            "latency_ms": latency,
        }
        await _audit(db, {"ok": True, "tool_id": tool_name, "ts": time.time(),
                          "latency_ms": latency, "params_keys": list(params.keys())})
        return out

    except Exception as exc:  # FAIL-OPEN — cita fuente igualmente
        latency = round((time.perf_counter() - started) * 1000, 2)
        record = {
            "ok": False,
            "tool_id": tool_name,
            "error": str(exc)[:240],
            "result_summary": f"fallo al ejecutar {tool_name}",
            "latency_ms": latency,
        }
        await _audit(db, {**record, "ts": time.time(), "params_keys": list(params.keys())})
        return record
