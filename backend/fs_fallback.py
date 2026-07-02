"""Helper de storage con fallback — [AUD-008].

Varios engines creaban sus directorios de storage EN IMPORT-TIME con default hardcodeado
a /app/... (el path del contenedor Emergent). En cualquier máquina sin /app escribible
(dev local, CI) el import explotaba con OSError → pytest ni siquiera podía RECOLECTAR
la suite (9 errores de colección, 0 tests corridos).

dir_or_tmp(): intenta el path preferido (env var o /app default). Si el filesystem no
lo permite, cae a un directorio temporal por-módulo. En el contenedor Emergent /app es
escribible → comportamiento IDÉNTICO al de antes; el fallback solo aplica donde antes
había un crash.
"""
from pathlib import Path
import tempfile


def dir_or_tmp(preferred: Path, slug: str) -> Path:
    """mkdir del path preferido; si no se puede (FS read-only / sin permisos), tmp/dmx_storage/<slug>."""
    try:
        preferred.mkdir(parents=True, exist_ok=True)
        return preferred
    except OSError:
        fb = Path(tempfile.gettempdir()) / "dmx_storage" / slug
        fb.mkdir(parents=True, exist_ok=True)
        return fb
