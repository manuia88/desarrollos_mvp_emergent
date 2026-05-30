"""B1 · /api/asesor/contactos/{cid}/overview · unit tests (4).

Cubre el agregador de actividad del perfil-hub:
- shape: timeline unificado ordenado por ts (desc) + merge de fuentes (timeline/busqueda/operacion/insights)
- FAIL-OPEN por fuente: si client_insights truena, el resto responde igual (200) y sources['insights']=='error'
- aislamiento owner_id: el contacto de otro asesor → 404
- /tareas ?contacto_id= (filtro additive · default sin filtro = comportamiento actual)

Sin infra real: mongomock_motor (fixture mock_db de conftest). require_advisor monkeypatched a un
usuario asesor; compute_client_insights stubbed para hermetismo (sin LLM/red).

Run: python3 -m pytest tests/test_asesor_overview.py -v
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from types import SimpleNamespace

import pytest

import routes.advisor as advisor


OWNER = "test-asesor-001"


def _now():
    return datetime.now(timezone.utc)


def _req(mock_db):
    """Fake Request mínima: solo expone request.app.state.db (lo que usa get_db)."""
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db=mock_db)))


def _as_owner(monkeypatch, owner=OWNER):
    async def fake_require(request):
        return SimpleNamespace(user_id=owner, role="advisor")
    monkeypatch.setattr(advisor, "require_advisor", fake_require)


def _stub_insights(monkeypatch, payload=None, raise_exc=False):
    import services.client_insights as ci

    async def fake(db, lead_id, asesor_id="", force=False):
        if raise_exc:
            raise RuntimeError("insights down")
        return payload or {"timeline": [], "next_action": None}
    monkeypatch.setattr(ci, "compute_client_insights", fake)


async def _seed_contact(mock_db, cid="c1", owner=OWNER):
    await mock_db.asesor_contactos.insert_one({"id": cid, "owner_id": owner, "first_name": "Ana"})


# ─── 1 · shape + merge de fuentes + orden por ts desc ────────────────────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_overview_shape_and_merge(mock_db, monkeypatch):
    _as_owner(monkeypatch)
    await _seed_contact(mock_db, "c1")
    t0 = _now()
    await mock_db.asesor_contacto_timeline.insert_one({
        "id": "tl1", "contacto_id": "c1", "owner_id": OWNER, "kind": "nota",
        "body": "crédito aprobado", "ts": t0 - timedelta(days=2),
    })
    await mock_db.asesor_busquedas.insert_one({
        "id": "b1", "contacto_id": "c1", "owner_id": OWNER, "stage": "buscando",
        "colonias": ["Polanco"], "created_at": t0 - timedelta(days=5),
    })
    await mock_db.asesor_operaciones.insert_one({
        "id": "o1", "contacto_id": "c1", "owner_id": OWNER, "status": "propuesta",
        "op_code": "ABC-123", "created_at": t0 - timedelta(days=1),
    })
    _stub_insights(monkeypatch, {
        "timeline": [{"ts": (t0 - timedelta(hours=3)).isoformat(), "type": "view", "label": "Vio Polanco"}],
        "next_action": {"title": "Llamar hoy"},
    })

    out = await advisor.get_contacto_overview("c1", _req(mock_db))

    assert out["contacto_id"] == "c1"
    assert out["count"] == 4
    assert len(out["timeline"]) == 4
    # todas las fuentes ok
    assert out["sources"] == {"timeline": "ok", "busquedas": "ok", "operaciones": "ok", "insights": "ok"}
    # cada evento tiene la forma normalizada
    for ev in out["timeline"]:
        assert set(["ts", "source", "kind", "title", "body"]).issubset(ev.keys())
    # orden por ts desc: el insight (hace 3h) es el más reciente, la búsqueda (hace 5d) el más viejo
    assert out["timeline"][0]["source"] == "insights"
    assert out["timeline"][-1]["source"] == "busqueda"
    assert out["next_action"] == {"title": "Llamar hoy"}


# ─── 2 · FAIL-OPEN: si insights truena, el resto responde (200) ──────────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_overview_fail_open_per_source(mock_db, monkeypatch):
    _as_owner(monkeypatch)
    await _seed_contact(mock_db, "c1")
    await mock_db.asesor_contacto_timeline.insert_one({
        "id": "tl1", "contacto_id": "c1", "owner_id": OWNER, "kind": "nota",
        "body": "hola", "ts": _now(),
    })
    _stub_insights(monkeypatch, raise_exc=True)

    out = await advisor.get_contacto_overview("c1", _req(mock_db))

    # la fuente caída se marca 'error' pero NO tumba la respuesta
    assert out["sources"]["insights"] == "error"
    assert out["sources"]["timeline"] == "ok"
    # el evento de timeline sigue presente
    assert out["count"] == 1
    assert out["timeline"][0]["source"] == "timeline"


# ─── 3 · aislamiento owner_id: contacto de otro asesor → 404 ─────────────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_overview_owner_isolation(mock_db, monkeypatch):
    _as_owner(monkeypatch)  # somos OWNER
    await _seed_contact(mock_db, "c-otro", owner="otro-asesor")  # contacto de OTRO
    _stub_insights(monkeypatch)

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as ei:
        await advisor.get_contacto_overview("c-otro", _req(mock_db))
    assert ei.value.status_code == 404


# ─── 4 · /tareas ?contacto_id= filtra (additive · default sin filtro) ────────
@pytest.mark.unit
@pytest.mark.asyncio
async def test_tareas_contacto_id_filter(mock_db, monkeypatch):
    _as_owner(monkeypatch)
    await mock_db.asesor_tareas.insert_many([
        {"id": "t1", "owner_id": OWNER, "tipo": "lead", "entity_id": "c1", "due_at": "2026-06-01", "done": False},
        {"id": "t2", "owner_id": OWNER, "tipo": "lead", "entity_id": "c2", "due_at": "2026-06-02", "done": False},
    ])

    # con contacto_id=c1 → solo la tarea ligada a c1
    only_c1 = await advisor.list_tareas(_req(mock_db), contacto_id="c1")
    assert [t["id"] for t in only_c1] == ["t1"]

    # default (sin contacto_id) = comportamiento actual: ambas
    todas = await advisor.list_tareas(_req(mock_db))
    assert {t["id"] for t in todas} == {"t1", "t2"}
