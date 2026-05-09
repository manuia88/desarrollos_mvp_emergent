"""W4.2A — MCP HTTP Server.

Expone el Model Context Protocol (MCP) vía HTTP REST.
Implementa el protocolo MCP JSON sin dependencia del SDK oficial
(SDK mcp>=0.1.0 incompatible con fastapi 0.104.1/anyio<4 en este entorno).

Endpoints:
  GET  /mcp/tools                  → lista 8 tools con descripción + inputSchema
  POST /mcp/call/{tool_name}       → llama una tool (body = params JSON)
  POST /mcp                        → protocolo MCP JSON-RPC estándar (tools/list + tools/call)

Auth: header X-DMX-API-Key o Authorization: Bearer {key}
Usage log: db.mcp_usage_logs per call.
"""
from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from mcp_tools import MCP_TOOLS, dispatch_tool, McpToolError

log = logging.getLogger("dmx.mcp_server")

router = APIRouter(tags=["mcp"])


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _db(req: Request):
    return req.app.state.db


async def _validate_mcp_key(request: Request) -> Dict[str, Any]:
    """Accept X-DMX-API-Key OR Authorization: Bearer header.

    Returns the api_key doc from db.public_api_keys.
    Raises HTTPException 403 if invalid/missing.
    """
    raw_key = (
        request.headers.get("x-dmx-api-key")
        or request.headers.get("X-DMX-API-Key")
        or ""
    ).strip()

    # Fallback to Authorization: Bearer
    if not raw_key:
        auth = (request.headers.get("authorization") or "").strip()
        if auth.lower().startswith("bearer "):
            raw_key = auth.split(" ", 1)[1].strip()

    if not raw_key:
        raise HTTPException(403, "API key requerida (X-DMX-API-Key o Authorization: Bearer)")

    db = _db(request)
    key_hash = _hash_key(raw_key)
    doc = await db.public_api_keys.find_one({"key_hash": key_hash}, {"_id": 0})
    if not doc:
        raise HTTPException(403, "API key inválida")
    if doc.get("status") != "active":
        raise HTTPException(403, f"API key {doc.get('status')}")

    return doc


async def _log_usage(
    db,
    api_key_id: str,
    tool_name: str,
    params: Dict[str, Any],
    status: str,
) -> None:
    """Insert usage record into db.mcp_usage_logs (best-effort)."""
    try:
        await db.mcp_usage_logs.insert_one({
            "log_id": str(uuid.uuid4()),
            "api_key_id": api_key_id,
            "tool_name": tool_name,
            "params": params,
            "status": status,
            "timestamp": _now_iso(),
        })
    except Exception as e:
        log.warning(f"[mcp] mcp_usage_logs insert failed: {e}")


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/tools")
async def list_tools(request: Request):
    """List all available DMX MCP tools with descriptions and input schemas."""
    await _validate_mcp_key(request)
    return {"tools": MCP_TOOLS}


@router.post("/call/{tool_name}")
async def call_tool_rest(tool_name: str, request: Request):
    """Call a specific DMX MCP tool by name.

    Body: JSON object with tool parameters (see /mcp/tools for schemas).
    Returns: { content: [{type: "json", data: {...}}] }
    """
    key_doc = await _validate_mcp_key(request)
    db = _db(request)

    try:
        params: Dict[str, Any] = await request.json()
    except Exception:
        params = {}

    status = "ok"
    try:
        result = await dispatch_tool(db, tool_name, params, key_doc=key_doc)
    except ValueError as e:
        await _log_usage(db, key_doc.get("id", ""), tool_name, params, "error_unknown_tool")
        raise HTTPException(404, str(e))
    except McpToolError as e:
        await _log_usage(db, key_doc.get("id", ""), tool_name, params, "error_phase_y")
        raise HTTPException(403, str(e))
    except Exception as e:
        log.warning(f"[mcp] call_tool {tool_name}: {e}")
        status = "error"
        result = {"error": str(e)}

    await _log_usage(db, key_doc.get("id", ""), tool_name, params, status)

    return {
        "tool": tool_name,
        "content": [{"type": "json", "data": result}],
    }


class McpJsonRpcBody(BaseModel):
    method: str
    params: Optional[Dict[str, Any]] = None
    id: Optional[Any] = None


@router.post("")
@router.post("/")
async def mcp_jsonrpc(body: McpJsonRpcBody, request: Request):
    """Standard MCP JSON-RPC style endpoint.

    Supported methods:
      tools/list  — lists available tools (no params)
      tools/call  — calls a tool (params: {name, arguments})
    """
    key_doc = await _validate_mcp_key(request)
    db = _db(request)
    rpc_id = body.id

    if body.method == "tools/list":
        await _log_usage(db, key_doc.get("id", ""), "tools/list", {}, "ok")
        return {"id": rpc_id, "result": {"tools": MCP_TOOLS}}

    if body.method == "tools/call":
        params = body.params or {}
        tool_name = params.get("name", "")
        arguments = params.get("arguments", {})
        status = "ok"
        try:
            result = await dispatch_tool(db, tool_name, arguments, key_doc=key_doc)
        except ValueError as e:
            await _log_usage(db, key_doc.get("id", ""), tool_name, arguments, "error_unknown_tool")
            return {"id": rpc_id, "error": {"code": 404, "message": str(e)}}
        except McpToolError as e:
            await _log_usage(db, key_doc.get("id", ""), tool_name, arguments, "error_phase_y")
            return {"id": rpc_id, "error": {"code": -32603, "message": str(e)}}
        except Exception as e:
            log.warning(f"[mcp] jsonrpc tools/call {tool_name}: {e}")
            status = "error"
            result = {"error": str(e)}

        await _log_usage(db, key_doc.get("id", ""), tool_name, arguments, status)
        return {
            "id": rpc_id,
            "result": {"content": [{"type": "json", "data": result}]},
        }

    raise HTTPException(400, f"Método MCP no soportado: '{body.method}'. Soportados: tools/list, tools/call")


# ─── Indexes ─────────────────────────────────────────────────────────────────

async def ensure_mcp_indexes(db) -> None:
    await db.mcp_usage_logs.create_index(
        [("api_key_id", 1), ("timestamp", -1)], background=True
    )
    await db.mcp_usage_logs.create_index(
        [("tool_name", 1), ("timestamp", -1)], background=True
    )
    # TTL: purge logs > 90 days
    try:
        await db.mcp_usage_logs.create_index(
            "timestamp", expireAfterSeconds=90 * 86400, background=True,
            name="mcp_logs_ttl_90d"
        )
    except Exception:
        pass
