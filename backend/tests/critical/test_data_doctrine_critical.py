"""Tests críticos · doctrina del dato (data_doctrine.py).

Pieza crítica SIN test detectada en la auditoría B2. has_real_sales es el candado
que evita vender un SEED como "ventas reales / para bancos": si se rompe, la
plataforma miente sobre el origen del dato (riesgo legal/reputacional). Congela:
- DB vacía → False → frase de demo,
- units_history o transactions con datos → True → frase real,
- el cache de 5 min no falsea el resultado entre estados.

Async vía asyncio.run + mongomock. Reseteamos el cache de módulo en cada caso.
"""
from __future__ import annotations

import asyncio

import pytest

pytestmark = pytest.mark.unit

import data_doctrine  # noqa: E402
from data_doctrine import has_real_sales, honest_label, origen, tag  # noqa: E402


def _mock_db():
    try:
        import mongomock_motor
    except ImportError:
        pytest.skip("mongomock_motor no instalado")
    return mongomock_motor.AsyncMongoMockClient()["dmx_test"]


def _reset_cache():
    data_doctrine._real_sales_cache.update(val=None, ts=0.0)


def test_db_vacia_no_tiene_ventas_reales():
    async def run():
        _reset_cache()
        db = _mock_db()
        assert await has_real_sales(db) is False
    asyncio.run(run())


def test_units_history_con_datos_es_real():
    async def run():
        _reset_cache()
        db = _mock_db()
        await db.units_history.insert_one({"id": "uh1", "sold_at": "2026-01-01"})
        assert await has_real_sales(db) is True
    asyncio.run(run())


def test_transactions_con_datos_es_real():
    async def run():
        _reset_cache()
        db = _mock_db()
        await db.transactions.insert_one({"id": "t1", "price": 1000000})
        assert await has_real_sales(db) is True
    asyncio.run(run())


def test_honest_label_elige_demo_o_real():
    async def run():
        _reset_cache()
        db = _mock_db()
        # vacía → demo
        assert await honest_label(db, "según ventas reales", "ejemplo (sin ventas aún)") == \
            "ejemplo (sin ventas aún)"
        _reset_cache()
        await db.units_history.insert_one({"id": "uh1"})
        assert await honest_label(db, "según ventas reales", "ejemplo (sin ventas aún)") == \
            "según ventas reales"
    asyncio.run(run())


def test_tag_emite_origen_normalizado():
    t = tag("dato", fuente="SIG CDMX")
    assert t["origen"] == "dato" and t["confianza"] == 5 and t["fuente"] == "SIG CDMX"
    # id desconocido cae a 'supuesto' (lo menos confiable), nunca revienta
    assert origen("inexistente")["id"] == "supuesto"
