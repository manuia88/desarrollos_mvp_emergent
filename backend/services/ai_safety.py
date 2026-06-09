"""C4 Seguridad de IA · helpers reusables (4 portales): saneo de prompts,
nombres de archivo seguros, escape de regex y guardia anti-SSRF.

Cada bloqueo deja un evento de observabilidad (`ai_safety_block`) → la Sala de
Seguridad lo ve. Cierra el ciclo: intento → se neutraliza → queda registrado.
"""
from __future__ import annotations

import ipaddress
import logging
import re
from urllib.parse import urlparse

log = logging.getLogger("dmx.ai_safety")

_SECURITY_EVENT = "ai_safety_block"


def _emit(kind: str, detail: dict | None = None) -> None:
    try:
        from observability import capture_event
        capture_event("system", _SECURITY_EVENT, {"kind": kind, **(detail or {})})
    except Exception:
        pass


# ─── 1) Saneo de entrada a la IA (anti prompt-injection) ──────────────────────

_INJECTION_RE = re.compile(
    r"(?i)(ignore (all |the )?(previous|above) instructions?|"
    r"system prompt|you are now|disregard (all|previous)|\[/?INST\]|</?s>|assistant:\s)"
)


def sanitize_llm_input(text, *, max_len: int = 400, label: str = "") -> str:
    """Neutraliza texto controlable por el usuario antes de meterlo a un prompt.
    Quita saltos de línea (rompen la estructura), filtra frases de inyección
    típicas y acota la longitud. Si detecta inyección, lo registra."""
    if text is None:
        return ""
    s = str(text).replace("\r", " ").replace("\n", " ")
    if _INJECTION_RE.search(s):
        s = _INJECTION_RE.sub("[filtrado]", s)
        _emit("prompt_injection", {"label": label})
    return s[:max_len].strip()


# ─── 2) Nombre de archivo seguro (anti CRLF / header / path injection) ────────

def safe_filename(name, *, default: str = "archivo", max_len: int = 80) -> str:
    """Sanitiza para `Content-Disposition` (solo alfanum, punto, guion, guion bajo)."""
    base = re.sub(r"[^A-Za-z0-9._-]", "", str(name or ""))[:max_len].strip(".")
    return base or default


# ─── 3) Escape de regex (anti ReDoS / inyección en $regex) ────────────────────

def escape_regex(value, *, max_len: int = 120) -> str:
    return re.escape(str(value or "")[:max_len])


# ─── 4) Guardia anti-SSRF para URLs que el servidor va a buscar ───────────────

_BLOCKED_HOST_SUFFIXES = (".local", ".internal", ".localhost")
_BLOCKED_HOST_NAMES = {"localhost", "metadata.google.internal"}


def is_public_url_safe(url, *, label: str = "") -> bool:
    """¿Es seguro que el SERVIDOR haga fetch de esta URL? Bloquea esquemas no
    http(s), localhost, IPs privadas/loopback/link-local/reservadas y el endpoint
    de metadata de la nube. (Primera capa; para hostnames no resuelve DNS — eso
    es una capa extra futura. El radio aquí es bajo: son fotos del propio dev.)"""
    try:
        p = urlparse(str(url or "").strip())
    except Exception:
        return False
    if p.scheme not in ("http", "https"):
        _emit("ssrf_blocked", {"label": label, "reason": "scheme"})
        return False
    host = (p.hostname or "").lower()
    if not host:
        _emit("ssrf_blocked", {"label": label, "reason": "no_host"})
        return False
    if host in _BLOCKED_HOST_NAMES or host.endswith(_BLOCKED_HOST_SUFFIXES):
        _emit("ssrf_blocked", {"label": label, "reason": "local_name", "host": host})
        return False
    try:
        ip = ipaddress.ip_address(host)
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
            _emit("ssrf_blocked", {"label": label, "reason": "private_ip", "host": host})
            return False
    except ValueError:
        # host es un nombre, no una IP literal → pasa esta capa.
        pass
    return True
