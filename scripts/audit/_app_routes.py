"""Cargador compartido de la tabla de rutas REAL (runtime, no regex).

Importa el FastAPI app y lee app.routes — robusto ante prefijos dinámicos, includes
condicionales y routers duplicados (donde un regex falla). Sandbox de storage para que
el import no haga mkdir de rutas del contenedor (/app) en entornos read-only.

Uso:
    from _app_routes import load_routes
    for r in load_routes():
        r.method, r.path, r.func_name, r.file, r.line, r.body
"""
from __future__ import annotations

import inspect
import os
import sys
import tempfile
from dataclasses import dataclass
from typing import List, Optional

BACKEND = os.path.join(os.path.dirname(__file__), "..", "..", "backend")
BACKEND = os.path.abspath(BACKEND)


@dataclass
class RouteInfo:
    method: str
    path: str
    func_name: str
    file: Optional[str]      # ruta relativa a backend/ si aplica
    line: Optional[int]
    body: str                # código fuente del handler (vacío si no se pudo leer)


def _sandbox_env() -> None:
    tmp = tempfile.mkdtemp(prefix="dmx_audit_")
    for k in ("DI_UPLOAD_DIR", "STUDIO_STORAGE_PATH", "WIZARD_STORAGE_PATH", "IE_UPLOAD_DIR",
              "FREE_AUDIT_STORAGE", "TOUR3DGS_STORAGE_PATH", "ASSET_UPLOAD_DIR",
              "BROCHURE_STORAGE_PATH", "STATE_OF_CDMX_STORAGE", "IE_STORAGE_PATH", "UPLOAD_DIR"):
        os.environ.setdefault(k, tmp)
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "audit_dummy")
    _stub_missing_deps()


def _stub_missing_deps() -> None:
    """Stubea SIEMPRE emergentintegrations (el paquete privado del LLM) para que la auditoría sea
    DETERMINISTA entre local y CI: el CI no lo instala, y con el real vs el stub el set de routers
    que importan difiere (try/except). El audit no ejecuta el LLM — solo levanta la tabla de rutas —
    así que forzar el stub da el mismo conteo/handlers en todos lados."""
    import types

    class _Any:
        def __init__(self, *a, **k): pass
        def __getattr__(self, _): return _Any()
        def __call__(self, *a, **k): return _Any()

    for name in ("emergentintegrations", "emergentintegrations.llm", "emergentintegrations.llm.chat"):
        mod = types.ModuleType(name)
        mod.__getattr__ = lambda _n: _Any  # type: ignore[attr-defined]
        sys.modules[name] = mod


def load_routes() -> List[RouteInfo]:
    _sandbox_env()
    if BACKEND not in sys.path:
        sys.path.insert(0, BACKEND)
    import server  # noqa: import-time side effects acotados por el sandbox
    out: List[RouteInfo] = []
    for r in server.app.routes:
        methods = getattr(r, "methods", None)
        path = getattr(r, "path", None)
        ep = getattr(r, "endpoint", None)
        if not methods or not path or ep is None:
            continue
        try:
            src_file = inspect.getsourcefile(ep)
            line = inspect.getsourcelines(ep)[1]
            body = inspect.getsource(ep)
        except Exception:
            src_file, line, body = None, None, ""
        rel = None
        if src_file and BACKEND in src_file:
            rel = os.path.relpath(src_file, BACKEND)
        for m in methods:
            if m in ("HEAD", "OPTIONS"):
                continue
            out.append(RouteInfo(m, path, getattr(ep, "__name__", "?"), rel, line, body))
    return out
