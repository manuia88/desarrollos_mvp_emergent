"""B4 MKT-3 · public_catalog del catálogo de colonias (db.colonias).

Prueba la fuente pública que alimenta la página de barrios: lee el catálogo REAL
(crece con el sync SIG), siembra perezosa si está vacío, ordena las colonias con
dato real primero, y descarta docs corruptos. Hermético (asyncio.run + mongomock),
corre en CI con `pytest -m unit`.
"""
from __future__ import annotations

import asyncio

import pytest

pytestmark = pytest.mark.unit

import colonias_catalog as cc  # noqa: E402


def _mock_db():
    try:
        import mongomock_motor
    except ImportError:
        pytest.skip("mongomock_motor no instalado")
    return mongomock_motor.AsyncMongoMockClient()["dmx_test"]


def test_siembra_perezosa_cuando_vacio():
    """Colección vacía → siembra el seed (16) en vez de devolver lista vacía."""
    async def run():
        db = _mock_db()
        rows = await cc.public_catalog(db)
        assert len(rows) >= 16
        assert all(r["id"] and r["name"] for r in rows)
        assert set(rows[0].keys()) == {"id", "name", "alcaldia", "has_data"}
    asyncio.run(run())


def test_refleja_catalogo_crecido():
    """Cuando el catálogo crece (sync SIG), public_catalog lista TODAS, no solo 16."""
    async def run():
        db = _mock_db()
        for i in range(40):
            await db.colonias.update_one(
                {"id": f"col-sig-{i}"},
                {"$set": {"id": f"col-sig-{i}", "name": f"Colonia SIG {i}",
                          "alcaldia": "Cuauhtémoc", "city": "CDMX"}},
                upsert=True)
        rows = await cc.public_catalog(db)
        assert len(rows) >= 40  # auto-crece, no se queda en 16
        assert "col-sig-7" in {r["id"] for r in rows}
    asyncio.run(run())


def test_ordena_con_dato_real_primero():
    """Las colonias con lectura real (cus/scores/vsuelo) van antes que las vacías."""
    async def run():
        db = _mock_db()
        await db.colonias.update_one(
            {"id": "zzz-sin-dato"},
            {"$set": {"id": "zzz-sin-dato", "name": "Zzz Sin Dato", "alcaldia": "X"}},
            upsert=True)
        await db.colonias.update_one(
            {"id": "aaa-con-dato"},
            {"$set": {"id": "aaa-con-dato", "name": "Aaa Con Dato", "alcaldia": "X",
                      "cus": 3.5, "scores_cobertura_pct": 80}},
            upsert=True)
        rows = await cc.public_catalog(db)
        assert any(r["has_data"] for r in rows)
        idx_con = next(i for i, r in enumerate(rows) if r["id"] == "aaa-con-dato")
        idx_sin = next(i for i, r in enumerate(rows) if r["id"] == "zzz-sin-dato")
        assert idx_con < idx_sin
    asyncio.run(run())


def test_descarta_docs_sin_id_o_nombre():
    """Docs corruptos (sin id o sin name) no se cuelan a la cara pública."""
    async def run():
        db = _mock_db()
        await db.colonias.update_one(
            {"id": "ok-1"}, {"$set": {"id": "ok-1", "name": "Colonia OK"}}, upsert=True)
        await db.colonias.insert_one({"name": "Sin Id"})        # sin id
        await db.colonias.insert_one({"id": "sin-nombre"})      # sin name
        rows = await cc.public_catalog(db)
        ids = {r["id"] for r in rows}
        assert "ok-1" in ids
        assert "sin-nombre" not in ids
        assert all(r["id"] and r["name"] for r in rows)
    asyncio.run(run())
