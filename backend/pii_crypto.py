"""C3 Privacidad · Cifrado de PII en reposo (reusa la llave Fernet del sistema).

Reusa el cifrador de Document Intelligence (IE_FERNET_KEY) — una sola llave para
todo el sistema. FAIL-SOFT por diseño: si la llave no está o algo falla, NO
revienta el flujo (devuelve el dato tal cual + marca `encrypted=False`), porque
perder una captura de lead por un problema de cifrado sería peor que el riesgo.

Importante (decisión de arquitectura): NO se cifran aquí los campos que se usan
como LLAVE de búsqueda/JOIN (email/teléfono que unen los dos universos de leads y
el borrado DSR por email). Cifrar esos rompería los JOIN y el DSR sin una
migración con índice ciego (hash determinista). Eso va como batch propio.
Este módulo se usa para BYTES sensibles (PDF personalizado) y texto-libre que no
sea llave de búsqueda.

API:
    from pii_crypto import try_encrypt_bytes, try_decrypt_bytes, available
"""
from __future__ import annotations

import logging
from typing import Tuple

log = logging.getLogger("dmx.pii_crypto")


def available() -> bool:
    """¿Hay llave de cifrado disponible?"""
    try:
        from document_intelligence import _get_cipher
        _get_cipher()
        return True
    except Exception:
        return False


def try_encrypt_bytes(data: bytes) -> Tuple[bytes, bool]:
    """Cifra bytes. Devuelve (bytes, encrypted_bool). FAIL-SOFT: si no se puede,
    devuelve los bytes originales + False (nunca lanza)."""
    if not data:
        return data, False
    try:
        from document_intelligence import encrypt_bytes
        return encrypt_bytes(data), True
    except Exception as e:
        log.warning(f"[pii_crypto] encrypt_bytes no disponible (guarda en claro): {e}")
        return data, False


def try_decrypt_bytes(token: bytes, *, was_encrypted: bool) -> bytes:
    """Descifra si estaba cifrado. FAIL-SOFT: si falla, devuelve el token tal cual."""
    if not was_encrypted:
        return token
    try:
        from document_intelligence import decrypt_bytes
        return decrypt_bytes(token)
    except Exception as e:
        log.warning(f"[pii_crypto] decrypt_bytes falló: {e}")
        return token


def try_encrypt_text(text: str) -> Tuple[str, bool]:
    """Cifra texto-libre (no llave de búsqueda). Devuelve (str, encrypted_bool)."""
    if not text:
        return text, False
    try:
        from document_intelligence import encrypt_text
        return encrypt_text(text), True
    except Exception as e:
        log.warning(f"[pii_crypto] encrypt_text no disponible (guarda en claro): {e}")
        return text, False


def try_decrypt_text(token: str, *, was_encrypted: bool) -> str:
    if not was_encrypted:
        return token
    try:
        from document_intelligence import decrypt_text
        return decrypt_text(token)
    except Exception as e:
        log.warning(f"[pii_crypto] decrypt_text falló: {e}")
        return token
