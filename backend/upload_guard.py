"""upload_guard — validación UNIFORME de archivos subidos (nombre / extensión / tamaño).

Reusable por TODOS los endpoints de upload (antes cada uno validaba distinto o nada → riesgo
de archivos enormes o nombres con path-traversal). Codifica el patrón bueno de free_audit.
"""
from __future__ import annotations

from typing import Optional, Tuple

from fastapi import HTTPException

IMAGES = ("png", "jpg", "jpeg", "webp", "gif")
DOCS = ("pdf", "png", "jpg", "jpeg", "webp")
SHEETS = ("csv", "xlsx", "xls")


def safe_ext(filename: Optional[str], allowed: Tuple[str, ...]) -> str:
    """Valida nombre (sin path-traversal) y extensión en la allowlist. Devuelve la extensión."""
    if not filename:
        raise HTTPException(400, "invalid_file")
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(400, "invalid_filename")
    name = filename.lower()
    ext = name.rsplit(".", 1)[-1] if "." in name else ""
    if ext not in allowed:
        raise HTTPException(400, f"format_not_allowed:{ext or 'none'}")
    return ext


def check_size(content: Optional[bytes], max_mb: int = 10) -> None:
    if not content:
        raise HTTPException(400, "empty_file")
    if len(content) > max_mb * 1024 * 1024:
        raise HTTPException(400, "file_too_large")


async def validate(file, content: Optional[bytes] = None, *,
                   allowed: Tuple[str, ...] = DOCS, max_mb: int = 10) -> Tuple[str, bytes]:
    """Valida nombre+extensión y tamaño. Lee el archivo si no se pasó `content`.
    Devuelve (ext, content). Lanza HTTPException 400 si algo falla."""
    ext = safe_ext(getattr(file, "filename", None), allowed)
    if content is None:
        content = await file.read()
    check_size(content, max_mb)
    return ext, content
