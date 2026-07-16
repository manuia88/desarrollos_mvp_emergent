"""DESCARGA SEGURA — backoff + caché + modo PACIENTE (Google frena los masivos largos).

Reglas:
  · CACHÉ por file_id en ~/dmx_data/drive_cache — lo ya bajado JAMÁS se re-baja
    (el juez periódico dominical dejaba de ser una tormenta de descargas).
  · Espaciado configurable entre descargas (env DMX_DESCARGA_ESPACIO, default 0.5s).
  · Backoff 3-15-60s ante 403/429.
  · MODO PACIENTE (paciente=True, para masivos): tras agotar el backoff corto espera
    enfriamientos LARGOS (5 min, hasta ~1h por archivo) — el bloqueo anti-abuso de
    Google se libera solo y el masivo TERMINA en vez de morir (cazado 07-15: ~350
    descargas → 403 'Sorry...' sostenido).
$0. Lo usan: juez periódico, extractor de cotas y el masivo.
"""
from __future__ import annotations

import asyncio
import os
import pathlib
from typing import Optional, Tuple

CACHE = pathlib.Path.home() / "dmx_data" / "drive_cache"
_ultimo_hit = 0.0
ENFRIAMIENTO_S = 300          # pausa larga del modo paciente
MAX_ENFRIAMIENTOS = 12        # ≈1h de paciencia máxima por archivo


async def descargar(conn, file_id: str, mime: str = "",
                    usar_cache: bool = True,
                    paciente: bool = False) -> Tuple[bytes, str]:
    CACHE.mkdir(parents=True, exist_ok=True)
    ruta = CACHE / f"{file_id}.bin"
    if usar_cache and ruta.exists() and ruta.stat().st_size > 0:
        return ruta.read_bytes(), mime
    import bulk_ingest_engine as bie
    global _ultimo_hit
    loop = asyncio.get_event_loop()
    espacio = float(os.environ.get("DMX_DESCARGA_ESPACIO", "0.5"))
    espera = max(0.0, espacio - (loop.time() - _ultimo_hit))
    if espera:
        await asyncio.sleep(espera)
    ultimo_error: Optional[Exception] = None
    pausas = [0, 3, 15, 60] + ([ENFRIAMIENTO_S] * MAX_ENFRIAMIENTOS if paciente else [])
    for pausa in pausas:
        if pausa:
            await asyncio.sleep(pausa)
        try:
            data, mime_out = await bie._download_file_bytes(conn, file_id, mime)
            _ultimo_hit = loop.time()
            ruta.write_bytes(data)
            return data, mime_out
        except Exception as e:  # noqa: BLE001
            ultimo_error = e
            if "403" not in str(e) and "429" not in str(e):
                break
    raise ultimo_error  # type: ignore[misc]
