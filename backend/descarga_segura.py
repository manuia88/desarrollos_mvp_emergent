"""DESCARGA SEGURA — backoff exponencial + caché local (Google nos frenó a ~130 descargas).

El masivo de 13 proyectos moriría contra el throttle. Reglas:
  · CACHÉ por file_id en ~/dmx_data/drive_cache — lo ya bajado JAMÁS se re-baja
    (el juez periódico dominical dejaba de ser una tormenta de descargas).
  · Espaciado de 0.5s entre descargas reales + backoff 3-15-60s ante 403/429.
$0. Lo usan: juez periódico, extractor de cotas y el masivo.
"""
from __future__ import annotations

import asyncio
import pathlib
from typing import Optional, Tuple

CACHE = pathlib.Path.home() / "dmx_data" / "drive_cache"
_ultimo_hit = 0.0


async def descargar(conn, file_id: str, mime: str = "",
                    usar_cache: bool = True) -> Tuple[bytes, str]:
    CACHE.mkdir(parents=True, exist_ok=True)
    ruta = CACHE / f"{file_id}.bin"
    if usar_cache and ruta.exists() and ruta.stat().st_size > 0:
        return ruta.read_bytes(), mime
    import bulk_ingest_engine as bie
    global _ultimo_hit
    loop = asyncio.get_event_loop()
    espera = max(0.0, 0.5 - (loop.time() - _ultimo_hit))
    if espera:
        await asyncio.sleep(espera)
    ultimo_error: Optional[Exception] = None
    for intento, pausa in enumerate((0, 3, 15, 60)):
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
