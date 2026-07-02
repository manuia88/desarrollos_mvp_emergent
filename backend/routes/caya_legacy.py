"""W4.4E.5.2 — Legacy redirect /api/caya/* → /api/atlax/*

Window: 90 días desde 2026-05-09. Eliminar after 2026-08-07.

NOTA: 308 Permanent Redirect preserva method (POST/GET) y body. Los clientes
legacy del bubble Caya verán este redirect transparente. Header
`X-Atlax-Migration: deprecated-90d` permite a clientes auditar su uso del path antiguo.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

log = logging.getLogger("dmx.routes_caya_legacy")

router = APIRouter(tags=["caya-legacy"])

# TODO(2026-08-07): eliminar este router cuando termine la deprecation window de 90 días.
DEPRECATION_HEADER = {"X-Atlax-Migration": "deprecated-90d"}


@router.api_route(
    "/api/caya/{rest_path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    include_in_schema=False,
)
async def caya_redirect(rest_path: str, request: Request):
    """308 Permanent Redirect a /api/atlax/{rest_path} preservando query string."""
    target = f"/api/atlax/{rest_path}"
    qs = request.url.query
    if qs:
        target = f"{target}?{qs}"
    log.info(f"[caya-legacy] redirect {request.method} /api/caya/{rest_path} → {target}")
    return RedirectResponse(url=target, status_code=308, headers=DEPRECATION_HEADER)
