"""Palanca 7 · multi-tenant / authz analítico (auditoría 07-20).

El crítico: los endpoints analíticos del dev gateaban con el resolver SEED (sync) → el dev REAL
(ingerido) no veía lo suyo y el fallback demo podía filtrar seed ajeno. Ahora TODOS resuelven con
`user_dev_ids_db` (seed + devs reales del tenant) y traen el dato db-first. Estos tests fallan si
alguien revierte un guard. Leen el .py de DISCO (patrón AUD-025: importar routes inicializa el LLM).
"""
import os
import re

import mongomock_motor
import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Archivos cuyo _user_dev_ids DEBE ser async + DB-aware (seed + reales).
_DBAWARE_REQUEST = [
    "routes/dev_price_history.py", "routes/dev_sales_intel.py", "routes/dev_broker_intel.py",
    "routes/dev_insights_intel.py", "routes/dev_channel_intel.py", "routes/dev_amenity_intel.py",
    "routes/location_intel.py", "routes/dev_batch2.py", "routes/dev_batch10.py",
    "routes/dev_batch11.py", "routes/developer.py",
]


def _src(rel):
    return open(os.path.join(BACKEND, rel), encoding="utf-8").read()


@pytest.mark.parametrize("rel", _DBAWARE_REQUEST)
def test_resolver_es_async_db_aware(rel):
    src = _src(rel)
    assert "async def _user_dev_ids(request, user)" in src, f"{rel}: _user_dev_ids debe ser async(request,user)"
    assert "user_dev_ids_db" in src, f"{rel}: debe delegar en user_dev_ids_db (seed + reales)"


@pytest.mark.parametrize("rel", _DBAWARE_REQUEST + ["routes/dev_project_full.py", "routes/cube_inbox.py"])
def test_no_quedan_callsites_sync(rel):
    """Ninguna llamada _user_dev_ids(user) SIN await (fuga: seed-only)."""
    src = _src(rel)
    sync = re.findall(r"(?<!await )(?<!def )_user_dev_ids\(user\)", src)
    assert not sync, f"{rel}: quedan {len(sync)} callsites sync de _user_dev_ids"


@pytest.mark.parametrize("rel", ["routes/dev_price_history.py", "routes/dev_sales_intel.py",
                                 "routes/dev_broker_intel.py", "routes/dev_insights_intel.py",
                                 "routes/dev_amenity_intel.py"])
def test_intel_lee_db_first(rel):
    """El proyecto se trae con resolve_dev_doc (db-first), no con DEVELOPMENTS_BY_ID.get() del seed."""
    src = _src(rel)
    assert "resolve_dev_doc" in src, f"{rel}: debe usar resolve_dev_doc (db-first)"
    assert "dev = DEVELOPMENTS_BY_ID.get(project_id)" not in src, f"{rel}: sigue leyendo el dev del seed"


def test_dev_batch11_audit_llamada_correcta():
    """El bug: log_mutation(user_id=,role=,org_id=,ip=) → TypeError tragado → auditoría perdida."""
    src = _src("routes/dev_batch11.py")
    assert "user_id=user.user_id, role=user.role, org_id=" not in src, "sigue el log_mutation roto (audit perdida)"
    m = re.search(r"al\.log_mutation\(\s*db,\s*\{", src)
    assert m, "log_mutation debe llamarse con actor dict como 2º posicional"


def test_sensitive_collections_registradas():
    import tenant_scope as t
    for c in ("price_events", "unit_status_events", "dmx_market_snapshots"):
        assert c in t.SENSITIVE_COLLECTIONS, f"{c} debe estar en SENSITIVE_COLLECTIONS"


# ── comportamiento (mongomock) ──────────────────────────────────────────────────
@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["t"]


@pytest.mark.asyncio
async def test_user_dev_ids_db_no_cruza_tenant(db):
    from tenant_scope import user_dev_ids_db
    await db.developments.insert_many([
        {"id": "d_mia", "developer_id": "org_A"},
        {"id": "d_ajena", "developer_id": "org_B"},
    ])
    user = {"role": "developer_admin", "tenant_id": "org_A", "user_id": "u1"}
    ids = await user_dev_ids_db(db, user)
    assert "d_mia" in ids and "d_ajena" not in ids     # nunca el dev de otro tenant


@pytest.mark.asyncio
async def test_record_price_event_stampa_org(db):
    from routes.dev_price_history import record_price_event
    dev = {"colonia_id": "roma", "alcaldia": "Cuauhtémoc", "developer_id": "org_A", "dev_org_id": "org_A"}
    await record_price_event(db, "d1", {"id": "u1", "m2_privative": 50}, 4_000_000, 5_000_000, dev=dev)
    ev = await db.price_events.find_one({"unit_id": "u1"})
    assert ev["org_id"] == "org_A" and ev["dev_org_id"] == "org_A"   # antes: solo dev_id (namespace)


def test_snapshot_scope_filter():
    from dmx_snapshots import scope_filter_for
    assert scope_filter_for(None) == {}                                # superadmin god-view
    f = scope_filter_for(["org_A"])
    # deja pasar mercado (owner None/ausente) + entidad del propio org
    assert {"owner_org": None} in f["$or"] and {"owner_org": {"$in": ["org_A"]}} in f["$or"]


@pytest.mark.asyncio
async def test_latest_match_por_subcampo(db):
    import dmx_snapshots as s
    await s.write_snapshot(db, tier="colonia", tier_id="roma", measure="tension",
                           value=1.5, period="2026-07-01", dims={"gran": "day", "recamaras": 2})
    # buscar por subcampo (gran) SIN exigir el doc dims completo → antes daba None (match exacto)
    got = await s.latest(db, tier="colonia", tier_id="roma", measure="tension", dims={"gran": "day"})
    assert got is not None and got["value"] == 1.5
