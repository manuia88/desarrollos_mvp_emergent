"""Guardia anti-SSRF compartida para renderers que hacen fetch SERVER-SIDE de
URLs provistas por el usuario (brochure / carrusel / parallax / multi-ratio /
og-image / screenshot …).

Regla: ANTES de cualquier `requests.get` / `httpx` / `urlopen` de una URL que
viene del input del usuario, llama a `assert_safe_url(url)`. Si la URL apunta a
localhost, una IP privada/loopback/link-local/reservada, el endpoint de metadata
de la nube (169.254.169.254 / metadata.google.internal) o usa un esquema que no
sea http/https (file:, gopher:, …), levanta `UnsafeURLError` y el fetch NUNCA
ocurre.

NO duplica lógica: delega la validación de esquema + host + IP + resolución DNS
(fail-closed) en `services.ai_safety.is_public_url_safe`, que ya es la capa
canónica anti-SSRF del repo. Aquí solo añade:
  · API que LEVANTA en vez de devolver bool (más difícil de ignorar el resultado).
  · Allow-list opcional de dominios por env `URL_GUARD_ALLOWLIST`
    (lista separada por comas; si se define, SOLO esos dominios — y sus
    subdominios — pasan, además de las verificaciones anti-SSRF).
"""
from __future__ import annotations

import logging
import os
from urllib.parse import urlparse

log = logging.getLogger("dmx.url_guard")


class UnsafeURLError(ValueError):
    """La URL no es segura para que el servidor la busque (anti-SSRF)."""


def _allowlist() -> set[str]:
    raw = os.environ.get("URL_GUARD_ALLOWLIST", "")
    return {d.strip().lower().lstrip(".") for d in raw.split(",") if d.strip()}


def _host_in_allowlist(host: str, allow: set[str]) -> bool:
    host = (host or "").lower()
    return any(host == d or host.endswith("." + d) for d in allow)


def is_safe_url(url, *, label: str = "") -> bool:
    """Versión booleana (fail-soft). True si el servidor puede hacer fetch."""
    # Capa 1: esquema + host + IP privada/reservada + resolución DNS (fail-closed).
    try:
        from services.ai_safety import is_public_url_safe
    except Exception:  # import defensivo; sin el guard canónico, fail-closed.
        log.warning("[url_guard] is_public_url_safe no disponible → fail-closed")
        return False
    if not is_public_url_safe(url, label=label or "url_guard"):
        return False
    # Capa 2 (opcional): allow-list de dominios por env.
    allow = _allowlist()
    if allow:
        try:
            host = urlparse(str(url or "").strip()).hostname or ""
        except Exception:
            return False
        if not _host_in_allowlist(host, allow):
            return False
    return True


def assert_safe_url(url, *, label: str = "") -> str:
    """Levanta `UnsafeURLError` si la URL no es segura para fetch server-side.
    Devuelve la URL (string, trim) si pasa — útil para usar inline antes del fetch."""
    if not is_safe_url(url, label=label):
        raise UnsafeURLError(f"URL no permitida para fetch server-side (anti-SSRF): {str(url)[:120]!r}")
    return str(url).strip()
