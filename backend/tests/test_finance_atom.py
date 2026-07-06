"""CUBO TOTAL F1 — átomo financiero (dmx_finance_atom).

Fija: (1) materialización por unidad (esquemas + escenarios hipotecarios + planos indexables),
(2) bandas de mensualidad/enganche como dimensión, (3) honestidad (sin precio → sin finance;
sin fechas de obra → mensualidad_preventa None, no 0), (4) el corte del founder es filtrable.
"""
import mongomock_motor
import pytest

import dmx_finance_atom as F


@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["dmx_test"]


def test_bandas():
    assert F.banda_mensualidad(14_000) == "<15k"
    assert F.banda_mensualidad(19_999) == "15-20k"
    assert F.banda_mensualidad(28_000) == "20-30k"
    assert F.banda_mensualidad(None) == "sin_dato"
    assert F.banda_enganche(9.9) == "<10%"
    assert F.banda_enganche(10) == "10-20%"
    assert F.banda_enganche(None) == "sin_dato"


@pytest.mark.asyncio
async def test_materialize_y_corte_founder(db):
    # 3 unidades: barata (entra al corte), cara (no), sin precio (honesta: sin finance)
    await db.dmx_units.insert_many([
        {"unit_id": "u-barata", "development_id": "p1",
         "commercial": {"precio_lista_mxn": 2_000_000, "status": "disponible"},
         "areas": {"m2_privativo": 55, "m2_balcon": 4}, "parking": [{"arreglo": "lineal"}],
         "geo": {"alcaldia": "Benito Juárez", "colonia_id": "narvarte"}},
        {"unit_id": "u-cara", "development_id": "p1",
         "commercial": {"precio_lista_mxn": 9_000_000, "status": "vendido"},
         "areas": {"m2_privativo": 140}, "parking": [],
         "geo": {"alcaldia": "Benito Juárez", "colonia_id": "napoles"}},
        {"unit_id": "u-sin-precio", "development_id": "p1",
         "commercial": {"status": "disponible"}, "areas": {}, "geo": {}},
    ])
    r = await F.materialize_finance(db)
    assert r["materializadas"] == 2 and r["sin_precio"] == 1

    barata = await db.dmx_units.find_one({"unit_id": "u-barata"}, {"_id": 0})
    fin = barata["finance"]
    # escenarios: 2 aforos × 2 plazos, mensualidad positiva y creciente con aforo
    assert len(fin["escenarios"]) == 4
    m8020 = fin["mens_80_20"]; m9020 = fin["mens_90_20"]
    assert m8020 and m9020 and m9020 > m8020
    # tasa declarada con fuente + es_estimado (honestidad)
    assert fin["tasa_fuente"] in ("banxico_vivo", "seed_mercado")
    assert isinstance(fin["tasa_es_estimado"], bool)
    # esquemas default (sin dev_payment_schemes): enganche mínimo 10 del default y ticket > 0
    assert fin["enganche_min_pct"] is not None
    assert fin["ticket_entrada_min"] > 0
    # sin fechas de obra → mensualidad_preventa None (no 0 fingiendo dato)
    assert all(e["mensualidad_preventa"] is None for e in fin["esquemas"] if not e["meses_restantes"])

    # sin precio → sin finance (no se inventa)
    sp = await db.dmx_units.find_one({"unit_id": "u-sin-precio"}, {"_id": 0})
    assert "finance" not in sp

    # EL CORTE DEL FOUNDER filtrable: BJ + balcón + <65m² + cajón + enganche≤10 + mensualidad tope
    corte = {
        "geo.alcaldia": {"$regex": "^benito", "$options": "i"},
        "areas.m2_balcon": {"$gt": 0},
        "areas.m2_privativo": {"$lt": 65},
        "parking.0": {"$exists": True},
        "finance.enganche_min_pct": {"$lte": 10},
        "finance.mens_80_20": {"$lt": m8020 + 1},
    }
    matches = [u async for u in db.dmx_units.find(corte, {"_id": 0, "unit_id": 1})]
    assert [m["unit_id"] for m in matches] == ["u-barata"]


@pytest.mark.asyncio
async def test_flatten_carries_finance_dims(db):
    """El cross-cut ve las dims financieras vía flatten_atom."""
    import dmx_cube_feed as feed
    atom = {"unit_id": "x", "development_id": "p", "commercial": {"precio_lista_mxn": 2_500_000, "status": "disponible"},
            "areas": {"m2_privativo": 60}, "interior": {"recamaras": 2}, "geo": {"colonia_id": "narvarte"},
            "finance": {"banda_mensualidad": "15-20k", "banda_enganche": "<10%",
                        "mens_80_20": 18_500, "enganche_min_pct": 5.0, "ticket_entrada_min": 175_000}}
    row = feed.flatten_atom(atom)
    assert row["banda_mensualidad"] == "15-20k"
    assert row["banda_enganche"] == "<10%"
    assert row["mens_80_20"] == 18_500
    # sin finance → sin_dato (no revienta)
    row2 = feed.flatten_atom({**atom, "finance": None})
    assert row2["banda_mensualidad"] == "sin_dato"
