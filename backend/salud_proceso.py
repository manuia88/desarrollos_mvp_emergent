"""SALUD DEL PROCESO — detecta que el backend corre código VIEJO (incidente 07-15).

`uvicorn --reload` NO es garantía: en el masivo el proceso corrió 8h sin recargar y
la app sirvió código de hace 8 horas — el founder habría visto datos viejos y creído
que el trabajo no estaba. El commit de git NO delata esto (HEAD es el mismo recargado
o no). Lo que SÍ delata: si algún archivo .py del backend fue modificado DESPUÉS de
que el proceso arrancó, entonces el reload debió correr y (si el código en memoria no
cambió) está viejo.

Regla: newest(mtime de *.py) > ARRANQUE_TS  ⇒  código viejo, reiniciar.
Puro/testeable en evaluar(); el I/O de disco vive en estado_proceso(). $0.
"""
from __future__ import annotations

import pathlib
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def evaluar(arranque_iso: Optional[str],
            archivos: List[Dict[str, Any]]) -> Dict[str, Any]:
    """archivos = [{'nombre': str, 'mtime': float(epoch)}]. Devuelve si el código en
    memoria quedó atrás y cuáles archivos son más nuevos que el arranque."""
    if not arranque_iso:
        return {"codigo_viejo": False, "nota": "sin marca de arranque"}
    try:
        arranque = datetime.fromisoformat(arranque_iso).timestamp()
    except (ValueError, TypeError):
        return {"codigo_viejo": False, "nota": "marca de arranque ilegible"}
    # margen: cambios en los 5s previos al arranque cuentan como ya cargados
    nuevos = sorted((a for a in archivos if (a.get("mtime") or 0) > arranque + 5),
                    key=lambda a: -(a.get("mtime") or 0))
    if not nuevos:
        return {"codigo_viejo": False,
                "nota": "el proceso tiene el código más reciente"}
    return {"codigo_viejo": True,
            "n_archivos_nuevos": len(nuevos),
            "mas_nuevo": nuevos[0]["nombre"],
            "ejemplos": [a["nombre"] for a in nuevos[:8]],
            "nota": f"{len(nuevos)} archivo(s) cambiaron DESPUÉS del arranque — el "
                    f"backend corre código VIEJO, reinícialo (run_dev.sh)"}


async def estado_proceso(db=None) -> Dict[str, Any]:
    import subprocess

    import server as _srv
    raiz = pathlib.Path(__file__).parent
    archivos = [{"nombre": p.name, "mtime": p.stat().st_mtime}
                for p in raiz.glob("*.py")]
    archivos += [{"nombre": f"routes/{p.name}", "mtime": p.stat().st_mtime}
                 for p in (raiz / "routes").glob("*.py")]
    arranque = getattr(_srv, "ARRANQUE_TS", None)
    try:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                                capture_output=True, text=True, timeout=3,
                                cwd=str(raiz.parent)).stdout.strip()
    except Exception:  # noqa: BLE001
        commit = None
    salud = evaluar(arranque, archivos)
    return {"corriendo_desde": arranque, "commit": commit,
            "verificado_at": datetime.now(timezone.utc).isoformat(), **salud}
