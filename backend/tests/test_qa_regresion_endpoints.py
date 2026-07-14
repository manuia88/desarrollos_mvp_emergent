"""AUDITORÍA QA — regresión de los 3 defectos 5xx encontrados por el barrido funcional.

Cada uno reventaba con 500 en su lógica; estos tests congelan el fix sin necesitar servidor vivo.
"""
from datetime import datetime, timezone


def test_narratives_guard_no_revienta_sin_user(monkeypatch):
    """narratives/budget daba 500 (AttributeError: NoneType.role) sin sesión → debe ser 401.
    OJO: NO importamos el server real — su import registra features de Studio en el catálogo
    compartido y contamina el test de integridad de wave2. Stub de módulo, aislado."""
    import asyncio
    import sys
    import types
    import narrative_engine
    from fastapi import HTTPException

    async def _fake_get_current_user(request):
        return None  # sin sesión

    monkeypatch.setitem(sys.modules, "server",
                        types.SimpleNamespace(get_current_user=_fake_get_current_user))

    async def run():
        try:
            await narrative_engine._require_superadmin(object())
            return None
        except HTTPException as e:
            return e.status_code

    assert asyncio.run(run()) == 401


def test_soc_aware_normaliza_naive():
    """soc-franchise/my-score daba 500 (naive - aware). _aware() coacciona a UTC-aware."""
    from soc_franchise_engine import _aware, _now
    naive = datetime(2026, 1, 1, 12, 0, 0)            # como lo devuelve Mongo
    aware = _aware(naive)
    assert aware.tzinfo is not None
    # ahora la resta que reventaba funciona
    _ = (_now() - aware).days
    # un datetime ya aware pasa intacto
    ya = datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert _aware(ya) is ya


def test_studio_engines_importa_sin_ruta_docker(monkeypatch):
    """studio/my-budget daba 500 (OSError /app read-only) al importar studio_engines en local.
    El mkdir defensivo permite importar aunque la ruta no exista/sea read-only."""
    import importlib
    monkeypatch.setenv("STUDIO_STORAGE_PATH", "/proc/nonexistent-readonly/studio")
    import studio_engines
    # re-importar con la ruta imposible NO debe lanzar
    importlib.reload(studio_engines)
    assert hasattr(studio_engines, "get_or_create_budget")
