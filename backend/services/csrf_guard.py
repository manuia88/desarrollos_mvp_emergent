"""Guardia anti-CSRF compartida para endpoints GET que MUTAN estado o GASTAN IA.

Contexto (P3-CSRF-02): un `<img src=…>` cross-site, un `<link>` o una navegación
top-level pueden disparar un GET *con cookies/credenciales del navegador de la
víctima*. Si ese GET escribe en la base (aunque sea idempotente) o invoca un LLM,
un atacante puede forzar mutaciones o quemar presupuesto de IA sin que la víctima
lo sepa (CSRF). Los POST/PUT/PATCH ya están protegidos por el preflight CORS;
los GET "simples" NO — de ahí esta capa.

Mecanismo (idéntico al ya desplegado en `ai-summary-v2`):
  (a) Exigir un header NO-SIMPLE (`X-Requested-With` o `X-DMX-Client`). El front
      (apiClient) SIEMPRE lo manda; un `<img>`/navegación cross-site NO puede fijar
      headers custom → si falta, 403. CORS ya hace allow-list de `X-Requested-With`
      en server.py.
  (b) (opcional) Rate-limit por usuario en la ruta cara (generación con LLM), vía
      `services.ratelimit`, para que ni un usuario autenticado pueda hacer loop al
      modelo.

FAIL-SOFT: cualquier error interno del check NUNCA tumba una petición legítima —
solo un header claramente ausente se rechaza. NO duplica lógica: es la versión
reutilizable del patrón inline que vivía solo en `routes/dev_batch4_4.py`.
"""
from __future__ import annotations

import logging

log = logging.getLogger("dmx.csrf_guard")

# Headers que un cross-site <img>/navegación NO puede fijar (no son "simple headers").
_CLIENT_HEADERS = ("x-requested-with", "x-dmx-client")


def has_client_header(request) -> bool:
    """True si la petición trae un header de cliente no-simple. Fail-soft: ante
    cualquier error trata como presente (nunca rompe a un cliente legítimo)."""
    try:
        for h in _CLIENT_HEADERS:
            if (request.headers.get(h) or "").strip():
                return True
        return False
    except Exception:
        return True


def require_client_header(request) -> None:
    """Levanta HTTPException(403) si falta el header de cliente. Llamar al INICIO
    del handler GET — antes de cualquier lectura de DB o gasto de IA."""
    if not has_client_header(request):
        try:
            from fastapi import HTTPException
        except Exception:  # FastAPI siempre está; defensivo de todos modos.
            raise PermissionError("Falta header de cliente (X-Requested-With / X-DMX-Client)")
        raise HTTPException(403, "Falta header de cliente (X-Requested-With / X-DMX-Client)")


def gen_allowed(user, bucket: str, limit: int, window: int) -> bool:
    """Limiter de ventana deslizante por usuario para la ruta cara (gen con LLM).
    Fail-soft: si el limiter no está disponible, permite (nunca bloquea legítimo)."""
    try:
        from services import ratelimit as _rl
        uid = getattr(user, "user_id", None) or "anon"
        return _rl.allow(bucket, str(uid), limit, window)
    except Exception:
        return True
