"""Parte SEMANAL numérico + sanadores durables (founder 07-21).

· El semanal ahora LIDERA con el titular numérico e hipersegmentado y absorción/ritmo/meses leen el
  MISMO ledger que el titular (antes: '15 vendidas' arriba, '0 salieron' abajo → incoherente).
· Sanadores self-healing: colonia_id desde nombre (hueco Edomex, durable ante re-ingesta) + re-amarre
  de plantas de nivel a unidades que perdieron plano_url (The Park quedó a medias).
"""
from datetime import datetime, timedelta, timezone

import mongomock_motor
import pytest


@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["t"]


def _hace(dias):
    return (datetime.now(timezone.utc) - timedelta(days=dias)).isoformat()


# ── parte semanal: titular numérico + coherencia con absorción ───────────────────
@pytest.mark.asyncio
async def test_resumen_cuenta_del_ledger_hipersegmentado(db):
    from parte_engine import _sec_resumen
    await db.developments.insert_one({"id": "d1", "name": "Casa Condesa"})
    desde = _hace(7)
    for un in ("101", "102", "205"):
        await db.unit_status_events.insert_one({
            "new_status": "vendido", "changed_at": _hace(2), "dev_id": "d1", "price": 5_000_000})
    await db.price_events.insert_one({"changed_at": _hace(1), "dev_id": "d1", "delta_pct": -5})
    out = "\n".join(await _sec_resumen(db, desde))
    assert "3</b> vendidas" in out and "Casa Condesa (3)" in out   # hipersegmentado por dev
    assert "1</b> cambios de precio" in out


@pytest.mark.asyncio
async def test_resumen_excluye_revertidos(db):
    from parte_engine import _sec_resumen
    await db.developments.insert_one({"id": "d1", "name": "X"})
    await db.unit_status_events.insert_one({"new_status": "vendido", "changed_at": _hace(1),
                                            "dev_id": "d1", "price": 1, "revertido": True})
    out = "\n".join(await _sec_resumen(db, _hace(7)))
    assert "0</b> vendidas" in out or "0 vendidas" in out          # el revertido no cuenta


@pytest.mark.asyncio
async def test_absorcion_y_resumen_coherentes(db):
    """El bug que cacé: absorción leía market_timeline (0) y contradecía al titular (ledger)."""
    from parte_engine import _sec_resumen, _sec_absorcion, _ventas_ledger
    await db.developments.insert_one({"id": "d1", "name": "X"})
    await db.units.insert_one({"id": "u1", "development_id": "d1", "status": "disponible"})
    for _ in range(4):
        await db.unit_status_events.insert_one({"new_status": "vendido", "changed_at": _hace(1),
                                                "dev_id": "d1", "price": 1})
    desde = _hace(7)
    assert len(await _ventas_ledger(db, desde)) == 4
    absor = "\n".join(await _sec_absorcion(db, desde))
    assert "4 unidades salieron" in absor                          # mismo número que el titular


# ── The Park: re-amarre de plantas de nivel ──────────────────────────────────────
@pytest.mark.asyncio
async def test_bind_plantas_nivel_amarra_por_nivel(db):
    from presentacion_gdc import bind_plantas_nivel
    await db.dev_assets.insert_one({"development_id": "tp", "asset_type": "plano_nivel",
                                    "nivel": 3, "storage_path": "/x/planta_nivel_3.png"})
    await db.units.insert_many([
        {"id": "u1", "development_id": "tp", "unit_number": "Humbolt 301", "level": 3},  # nivel 3 → amarra
        {"id": "u2", "development_id": "tp", "unit_number": "Humbolt 201", "level": 2},  # nivel 2 sin planta
    ])
    r = await bind_plantas_nivel(db, "tp")
    assert r["amarradas"] == 1 and r["sin_planta"] == 1
    u1 = await db.units.find_one({"id": "u1"})
    assert u1["plano_url"].endswith("planta_nivel_3.png") and u1["plano_nivel"] == 3
    u2 = await db.units.find_one({"id": "u2"})
    assert not u2.get("plano_url")                                 # piso 2 honesto: sin plano


@pytest.mark.asyncio
async def test_sanar_plantas_solo_actua_con_hueco(db):
    from presentacion_gdc import sanar_plantas_nivel
    await db.dev_assets.insert_one({"development_id": "tp", "asset_type": "plano_nivel",
                                    "nivel": 3, "storage_path": "/x/planta_nivel_3.png"})
    await db.units.insert_one({"id": "u1", "development_id": "tp", "unit_number": "301", "level": 3})
    r1 = await sanar_plantas_nivel(db)
    assert r1.get("tp") == 1                                       # había hueco → amarró
    r2 = await sanar_plantas_nivel(db)
    assert "tp" not in r2                                          # ya sin hueco → no re-escribe


# ── colonia durable desde nombre ─────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_sanar_colonia_desde_nombre(db):
    from ingested_reader import sanar_colonia_desde_nombre
    await db.colonias.insert_one({"id": "el-mirador-naucalpan", "name": "Fraccionamiento El Mirador"})
    await db.developments.insert_one({"id": "d1", "colonia": "Fraccionamiento El Mirador", "colonia_id": None})
    await db.units.insert_one({"id": "u1", "development_id": "d1"})
    r = await sanar_colonia_desde_nombre(db)
    assert r["devs"] == 1 and r["units"] == 1
    d = await db.developments.find_one({"id": "d1"})
    assert d["colonia_id"] == "el-mirador-naucalpan"
    u = await db.units.find_one({"id": "u1"})
    assert u["colonia_id"] == "el-mirador-naucalpan"


@pytest.mark.asyncio
async def test_sanar_colonia_salta_nombre_ambiguo(db):
    from ingested_reader import sanar_colonia_desde_nombre
    # dos colonias con el MISMO nombre → ambiguo, no se amarra (evita geo equivocada)
    await db.colonias.insert_many([{"id": "el-mirador-cdmx", "name": "El Mirador"},
                                   {"id": "el-mirador-edomex", "name": "El Mirador"}])
    await db.developments.insert_one({"id": "d1", "colonia": "El Mirador", "colonia_id": None})
    r = await sanar_colonia_desde_nombre(db)
    assert r["devs"] == 0                                          # ambiguo → no adivina
    d = await db.developments.find_one({"id": "d1"})
    assert d.get("colonia_id") is None
