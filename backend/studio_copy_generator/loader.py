"""W5.22 Z.8.7 Sub-B · Prompt .md loader con mtime-based cache.

Reads /app/memory/{filename}.md · cache invalidated cuando mtime cambia.
Si el archivo no existe → raises FileNotFoundError con mensaje claro.
"""
from __future__ import annotations

import logging
import os
from threading import Lock
from typing import Dict, Tuple

log = logging.getLogger("dmx.studio_copy_loader")

def _resolve_memory_dir() -> str:
    """Resolve memory dir · env override > pod path > repo path."""
    env = os.environ.get("DMX_MEMORY_DIR")
    if env and os.path.isdir(env):
        return env
    if os.path.isdir("/app/memory"):
        return "/app/memory"
    # repo-relative fallback (Mac dev / pre-deploy)
    here = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    candidate = os.path.join(here, "memory")
    return candidate if os.path.isdir(candidate) else "/app/memory"


MEMORY_DIR = _resolve_memory_dir()
_cache: Dict[str, Tuple[float, str]] = {}
_lock = Lock()


def load_prompt_md(filename: str) -> str:
    """Lee /app/memory/{filename} · cache invalidated por mtime.

    Args:
        filename: nombre relativo (e.g. "Z8_PROMPT_01_LUXURY.md")
    Returns:
        Contenido completo del archivo .md como string.
    Raises:
        FileNotFoundError si el archivo no existe.
    """
    if not filename:
        raise ValueError("filename vacio")
    if "/" in filename or ".." in filename:
        raise ValueError(f"filename invalido (no path traversal): {filename}")
    path = os.path.join(MEMORY_DIR, filename)
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Prompt source no encontrado: {path}. "
            f"Crea el archivo en /app/memory/ siguiendo el spec Z8_TEMPLATE_PROMPTS_INDEX."
        )
    try:
        mtime = os.path.getmtime(path)
    except OSError as exc:
        raise FileNotFoundError(f"mtime read failed for {path}: {exc}") from exc

    with _lock:
        cached = _cache.get(filename)
        if cached and cached[0] == mtime:
            return cached[1]
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        _cache[filename] = (mtime, content)
        return content


def clear_cache() -> None:
    with _lock:
        _cache.clear()
