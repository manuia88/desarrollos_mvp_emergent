"""Fuente DROPBOX para la ingesta (founder 07-08): carpetas compartidas públicas, SIN token.

Un link compartido de Dropbox (dl=0) se puede descargar completo como ZIP (dl=1). De ahí armamos el mismo
árbol de archivos que usa el recon (nombre, carpeta, tipo) y un lector de bytes por archivo — el resto del
pipeline (recon → plan → extracción → gate) es idéntico. Límite de seguridad: 400 MB por zip.

Upgrade futuro: token de Dropbox (API oficial) para carpetas privadas y listado sin descargar todo.
"""
from __future__ import annotations

import io
import logging
import mimetypes
import re
import zipfile
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.dropbox_source")

MAX_ZIP_BYTES = 400 * 1024 * 1024


def is_dropbox_url(url: str) -> bool:
    return "dropbox.com" in (url or "").lower()


def _zip_url(url: str) -> str:
    """Fuerza la descarga zip del share público (dl=1)."""
    u = re.sub(r"([?&])dl=0", r"\1dl=1", url)
    if "dl=1" not in u:
        u += ("&" if "?" in u else "?") + "dl=1"
    return u


async def fetch_tree(url: str) -> Tuple[List[Dict[str, Any]], Dict[str, bytes]]:
    """Descarga el zip del share y devuelve (files_meta compatibles con el pipeline, bytes por id).
    files_meta: id=ruta dentro del zip · name · mimeType (por extensión) · immediate_folder."""
    import httpx
    async with httpx.AsyncClient(timeout=300, follow_redirects=True) as c:
        r = await c.get(_zip_url(url))
        r.raise_for_status()
        data = r.content
    if len(data) > MAX_ZIP_BYTES:
        raise RuntimeError(f"zip de Dropbox demasiado grande ({len(data)/1e6:.0f} MB > 400 MB)")
    zf = zipfile.ZipFile(io.BytesIO(data))
    files: List[Dict[str, Any]] = []
    blobs: Dict[str, bytes] = {}
    for info in zf.infolist():
        if info.is_dir() or info.file_size == 0:
            continue
        path = info.filename
        name = path.rsplit("/", 1)[-1]
        if name.startswith(".") or "__MACOSX" in path:
            continue
        parts = path.split("/")
        folder = parts[-2] if len(parts) >= 2 else None
        mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
        files.append({"id": path, "name": name, "mimeType": mime,
                      "immediate_folder": folder, "size": str(info.file_size),
                      "md5Checksum": f"{info.CRC:x}:{info.file_size}"})
        blobs[path] = zf.read(info)
    log.info(f"[dropbox] {url[:50]}… → {len(files)} archivos ({len(data)/1e6:.0f} MB)")
    return files, blobs
