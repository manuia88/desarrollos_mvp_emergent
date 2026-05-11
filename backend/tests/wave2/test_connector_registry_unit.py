"""Wave 2 · Tests connector_registry.py · 14 tests unidad sin DB.

Cubre:
- CONNECTOR_CATALOG integrity (11 connectors + shape required keys)
- get_catalog / get_meta (lookups puros)
- env_present (env var detection · None-safe · unknown connectors)
- HEALTHCHECKS registry consistency con catalog
- compute_status (lógica pura: stub / failed / degraded / ok)
- replay_range validation errors (ValueError on bad inputs · sin DB)
- retry_connector validation (ValueError si no soporta retry)

Funciones SKIPED (necesitan Mongo o red):
- record_invocation · run_healthcheck · aggregate_24h · find_last_failure
- hc_* (network healthchecks) · healthcheck_all_connectors · ensure_connector_indexes

NO toca infra · NO modifica código · solo lectura.
"""
import os
import pytest

from connector_registry import (
    CONNECTOR_CATALOG,
    HEALTHCHECKS,
    compute_status,
    env_present,
    get_catalog,
    get_meta,
    replay_range,
    retry_connector,
)


pytestmark = pytest.mark.unit


# ─── 1. CONNECTOR_CATALOG: integrity ─────────────────────────────────────────


def test_catalog_has_11_connectors():
    """W2.1 SA2 declara 11 connectors canónicos (claude_haiku..posthog)."""
    assert len(CONNECTOR_CATALOG) == 11


def test_catalog_required_keys_in_every_entry():
    """Cada entry tiene los 7 keys obligatorios para que UI/healthcheck funcione."""
    required = {"id", "name", "category", "icon_key", "required_env",
                "supports_retry", "supports_replay"}
    for c in CONNECTOR_CATALOG:
        missing = required - set(c.keys())
        assert not missing, f"{c.get('id')} missing keys: {missing}"


def test_catalog_ids_unique():
    """No duplicate connector ids · clave primaria del catálogo."""
    ids = [c["id"] for c in CONNECTOR_CATALOG]
    assert len(ids) == len(set(ids))


def test_catalog_categories_are_canonical():
    """Categorías permitidas: ai · geo · email · drive · calendar · observability."""
    allowed = {"ai", "geo", "email", "drive", "calendar", "observability"}
    for c in CONNECTOR_CATALOG:
        assert c["category"] in allowed, f"{c['id']} cat={c['category']}"


# ─── 2. get_catalog: retorna copies (no muta original) ───────────────────────


def test_get_catalog_returns_isolated_copies():
    """Mutar el resultado de get_catalog no debe afectar el CONNECTOR_CATALOG global."""
    snapshot = get_catalog()
    snapshot[0]["id"] = "MUTATED"
    fresh = get_catalog()
    assert fresh[0]["id"] != "MUTATED"


# ─── 3. get_meta: lookup por id ──────────────────────────────────────────────


def test_get_meta_known_id_returns_dict():
    """Connector conocido → dict con name correcto."""
    meta = get_meta("claude_haiku")
    assert meta is not None
    assert meta["name"] == "Claude Haiku 4.5"
    assert meta["category"] == "ai"


def test_get_meta_unknown_id_returns_none():
    """Connector desconocido → None (None-safe lookup)."""
    assert get_meta("nonexistent_xyz") is None


# ─── 4. env_present: env var detection ───────────────────────────────────────


def test_env_present_missing_key_returns_false(monkeypatch):
    """Sin EMERGENT_LLM_KEY → claude_haiku reporta env ausente."""
    monkeypatch.delenv("EMERGENT_LLM_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert env_present("claude_haiku") is False


def test_env_present_with_key_returns_true(monkeypatch):
    """Con EMERGENT_LLM_KEY presente → claude_haiku detecta env ok."""
    monkeypatch.setenv("EMERGENT_LLM_KEY", "fake-key")
    assert env_present("claude_haiku") is True


def test_env_present_no_required_returns_true():
    """google_drive no tiene required_env → siempre True (depende de drive_connection)."""
    # required_env: [] en catálogo
    assert env_present("google_drive") is True


def test_env_present_unknown_connector_returns_false():
    """Connector desconocido → False (None-safe)."""
    assert env_present("not_a_real_connector") is False


# ─── 5. HEALTHCHECKS registry consistency ────────────────────────────────────


def test_healthchecks_cover_all_catalog_ids():
    """Cada connector del catálogo tiene healthcheck registrado (no orphans)."""
    catalog_ids = {c["id"] for c in CONNECTOR_CATALOG}
    hc_ids = set(HEALTHCHECKS.keys())
    assert hc_ids == catalog_ids


# ─── 6. compute_status: lógica pura (db arg no usado en estas ramas) ─────────


@pytest.mark.asyncio
async def test_compute_status_is_stub_marker_returns_stub():
    """Connector con is_stub=True (microsoft_calendar) → 'stub' siempre."""
    pytest.importorskip("pytest_asyncio")
    s = await compute_status(None, "microsoft_calendar", {})
    assert s == "stub"


@pytest.mark.asyncio
async def test_compute_status_env_missing_returns_stub(monkeypatch):
    """Sin env vars requeridas → 'stub' (sin red, sin DB)."""
    pytest.importorskip("pytest_asyncio")
    monkeypatch.delenv("MAPBOX_TOKEN", raising=False)
    s = await compute_status(None, "mapbox_geocoding", {})
    assert s == "stub"


@pytest.mark.asyncio
async def test_compute_status_no_invocations_returns_ok(monkeypatch):
    """Con env presente y cero invocaciones 24h → 'ok' (no es failure)."""
    pytest.importorskip("pytest_asyncio")
    monkeypatch.setenv("MAPBOX_TOKEN", "fake")
    agg = {"fail_count_24h": 0, "success_count_24h": 0}
    s = await compute_status(None, "mapbox_geocoding", agg)
    assert s == "ok"


@pytest.mark.asyncio
async def test_compute_status_degraded_when_ratio_above_30pct(monkeypatch):
    """fail_count/total > 0.30 AND fail >= 2 → 'degraded'."""
    pytest.importorskip("pytest_asyncio")
    monkeypatch.setenv("MAPBOX_TOKEN", "fake")
    agg = {
        "fail_count_24h": 4,
        "success_count_24h": 6,  # 4/10 = 0.40 > 0.30
        "last_success_at": "2026-05-10T12:00:00+00:00",
        "last_check_at": "2026-05-10T12:00:00+00:00",
    }
    s = await compute_status(None, "mapbox_geocoding", agg)
    assert s == "degraded"


@pytest.mark.asyncio
async def test_compute_status_failed_when_never_succeeded(monkeypatch):
    """Último check failed AND last_success None → 'failed'."""
    pytest.importorskip("pytest_asyncio")
    monkeypatch.setenv("MAPBOX_TOKEN", "fake")
    agg = {
        "fail_count_24h": 1,
        "success_count_24h": 0,
        "last_check_at": "2026-05-10T00:00:00+00:00",
        "last_success_at": None,
    }
    s = await compute_status(None, "mapbox_geocoding", agg)
    assert s == "failed"


# ─── 7. replay_range: validation errors (sin DB call · raise antes) ──────────


@pytest.mark.asyncio
async def test_replay_range_invalid_dates_raises(monkeypatch):
    """Fechas no ISO 8601 → ValueError."""
    pytest.importorskip("pytest_asyncio")
    monkeypatch.setenv("MAPBOX_TOKEN", "fake")
    with pytest.raises(ValueError, match="Fechas inválidas"):
        await replay_range(None, "mapbox_geocoding", "bad", "bad")


@pytest.mark.asyncio
async def test_replay_range_to_before_from_raises(monkeypatch):
    """to_ts < from_ts → ValueError."""
    pytest.importorskip("pytest_asyncio")
    monkeypatch.setenv("MAPBOX_TOKEN", "fake")
    with pytest.raises(ValueError, match="to_ts debe ser"):
        await replay_range(
            None, "mapbox_geocoding",
            "2026-05-10T00:00:00+00:00", "2026-05-09T00:00:00+00:00",
        )


@pytest.mark.asyncio
async def test_replay_range_above_7_days_raises(monkeypatch):
    """Rango > 7 días → ValueError (límite operacional)."""
    pytest.importorskip("pytest_asyncio")
    monkeypatch.setenv("MAPBOX_TOKEN", "fake")
    with pytest.raises(ValueError, match="máximo 7 días"):
        await replay_range(
            None, "mapbox_geocoding",
            "2026-05-01T00:00:00+00:00", "2026-05-10T00:00:00+00:00",
        )


@pytest.mark.asyncio
async def test_replay_range_unsupported_connector_raises():
    """Connector sin supports_replay → ValueError (mapbox_static)."""
    pytest.importorskip("pytest_asyncio")
    with pytest.raises(ValueError, match="no soporta replay"):
        await replay_range(
            None, "mapbox_static",
            "2026-05-09T00:00:00+00:00", "2026-05-10T00:00:00+00:00",
        )


# ─── 8. retry_connector: validation ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_retry_connector_unsupported_raises():
    """Connector sin supports_retry → ValueError antes de tocar DB."""
    pytest.importorskip("pytest_asyncio")
    with pytest.raises(ValueError, match="no soporta retry"):
        await retry_connector(None, "mapbox_static")
