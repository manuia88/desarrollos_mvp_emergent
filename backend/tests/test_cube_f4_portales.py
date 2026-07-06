"""CUBO TOTAL F4 — las lentes en los portales (asesor/dev/asistentes).

Fija: (1) la búsqueda del asesor se traduce completa al corte, (2) tensión de cortes del dev
ordena por tensión y solo usa SUS unidades, (3) el simulador de enganche cuenta compradores
reales que ALCANZAN la entrada (semántica declarada) y es honesto sin dato, (4) la tool
pública de Atlax está en el allow-list y responde en bandas (jamás conteos exactos).
"""
import datetime as dt

import mongomock_motor
import pytest

import demand_intelligence as di


@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["dmx_test"]


def _unidad(uid, dev_id, colonia, rec=2, precio=2_000_000, status="disponible", eng_pct=10.0):
    return {"unit_id": uid, "development_id": dev_id,
            "commercial": {"precio_lista_mxn": precio, "status": status},
            "areas": {"m2_privativo": 60}, "interior": {"recamaras": rec},
            "geo": {"colonia_id": colonia, "alcaldia": "Benito Juárez"},
            "finance": {"enganche_min_pct": eng_pct}}


def _busqueda_mkt(ip, colonias, dias=5, enganche=None):
    return {"ip_hash": ip, "visitor_id": None, "colonias": colonias, "features_pedidos": [],
            "enganche_max": enganche,
            "created_at_dt": dt.datetime.utcnow() - dt.timedelta(days=dias)}


def test_busqueda_asesor_a_corte_completa():
    from routes.advisor import _busqueda_a_corte
    b = {"colonias": ["narvarte", "napoles"], "precio_min": 2_000_000, "precio_max": 5_000_000,
         "recamaras_min": 2, "banos_min": 2, "estacionamientos_min": 1, "m2_min": 60,
         "amenidades": ["alberca", "gym"], "mascotas": True, "urgencia": "alta"}
    corte = _busqueda_a_corte(b)
    campos = [(f["campo"], f["op"]) for f in corte]
    assert ("colonia", "in") in campos
    assert ("precio", "lte") in campos and ("precio", "gte") in campos
    assert ("recamaras", "gte") in campos and ("banos", "gte") in campos
    assert ("n_parking", "gte") in campos and ("m2", "gte") in campos
    assert sum(1 for c, _ in campos if c == "amenidades_edificio") == 2


@pytest.mark.asyncio
async def test_tension_cortes_dev_ordena_y_scopea(db):
    await db.dmx_units.insert_many([
        _unidad("a1", "dev-mio", "narvarte", rec=2), _unidad("a2", "dev-mio", "narvarte", rec=2),
        _unidad("a3", "dev-mio", "polanco", rec=3),
        _unidad("x1", "dev-ajeno", "narvarte", rec=2),      # NO es mía → no crea celda
        _unidad("a4", "dev-mio", "narvarte", rec=2, status="vendido"),   # vendida → fuera
    ])
    # demanda: 4 personas piden narvarte 2R; nadie pide polanco 3R
    await db.marketplace_searches.insert_many(
        [{**_busqueda_mkt(f"ip{i}", ["narvarte"]), "recamaras_min": 2} for i in range(4)])
    r = await di.tension_cortes_dev(db, ["dev-mio"])
    assert len(r["celdas"]) == 2                            # narvarte-2R y polanco-3R (solo mías)
    top = r["celdas"][0]
    assert top["colonia"] == "narvarte" and top["disponibles"] == 2
    assert top["tension"] == 2.0                            # 4 personas / 2 disponibles
    assert r["celdas"][1]["tension"] is None                # polanco sin demanda → sin tensión fingida
    # sin desarrollos → honesto
    r2 = await di.tension_cortes_dev(db, [])
    assert r2["celdas"] == []


@pytest.mark.asyncio
async def test_simulador_enganche_cuenta_alcanzables(db):
    # proyecto con entrada mínima 2M · esquema actual 10% (200k)
    await db.dmx_units.insert_many([
        _unidad("u1", "p1", "narvarte", precio=2_000_000, eng_pct=10.0),
        _unidad("u2", "p1", "narvarte", precio=3_000_000, eng_pct=10.0),
    ])
    # 6 buscadores con enganche declarado en narvarte: 3 alcanzan 200k, 5 alcanzan 100k
    for i, eng in enumerate([250_000, 220_000, 200_000, 150_000, 120_000, 80_000]):
        await db.marketplace_searches.insert_one(_busqueda_mkt(f"ip{i}", ["narvarte"], enganche=eng))
    r = await di.simulador_enganche(db, "p1", pct_nuevo=5.0)
    assert r["ok"] and r["precio_entrada"] == 2_000_000
    assert r["actual"]["enganche_pct"] == 10.0 and r["actual"]["compradores_alcanzan"] == 3
    assert r["nuevo"]["enganche_mxn"] == 100_000 and r["nuevo"]["compradores_alcanzan"] == 5
    assert r["delta_compradores"] == 2 and r["suficiente_dato"] is True
    # sin búsquedas con enganche → honesto, sin proyección inventada
    await db.marketplace_searches.delete_many({})
    r2 = await di.simulador_enganche(db, "p1", pct_nuevo=5.0)
    assert r2["n_busquedas_con_enganche"] == 0 and r2["suficiente_dato"] is False
    assert "sin dato" in r2["lectura"]
    # proyecto sin unidades → declarado
    r3 = await di.simulador_enganche(db, "no-existe", pct_nuevo=5.0)
    assert r3["ok"] is False


@pytest.mark.asyncio
async def test_atlax_tool_demanda_del_corte_bandas(db):
    import asistente_engine as ae
    assert "demanda_del_corte" in ae.PUBLIC_TOOLS           # en el allow-list explícito
    ahora = dt.datetime.utcnow()
    await db.marketplace_searches.insert_many([
        {"ip_hash": f"ip{i}", "colonias": ["narvarte"], "features_pedidos": [],
         "created_at_dt": ahora} for i in range(7)])
    out = await ae._tool_demanda_del_corte(db, {"colonia": "narvarte"})
    assert "5-9" in str(out.get("demanda"))                 # banda, no el 7 exacto
    assert "7" not in str(out.get("demanda"))
    # sin criterios → error declarado, no corte de todo el mercado
    out2 = await ae._tool_demanda_del_corte(db, {})
    assert "error" in out2


# ─── Regresión review adversarial F4 ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_tension_celda_exacta_no_infla(db):
    """[ALTO] celda 2R: compatible quien pidió mínimo ≤2; quien exige 3+ NO cabe (antes gte
    contaba al de 3+ en la celda de 2R — demanda imposible)."""
    await db.dmx_units.insert_many([
        _unidad("a1", "dev-mio", "narvarte", rec=2), _unidad("a2", "dev-mio", "narvarte", rec=2)])
    await db.marketplace_searches.insert_many([
        {**_busqueda_mkt("ip1", ["narvarte"]), "recamaras_min": 2},   # cabe en 2R
        {**_busqueda_mkt("ip2", ["narvarte"]), "recamaras_min": 1},   # cabe en 2R
        {**_busqueda_mkt("ip3", ["narvarte"]), "recamaras_min": 3},   # NO cabe en 2R
    ])
    r = await di.tension_cortes_dev(db, ["dev-mio"])
    assert r["celdas"][0]["personas"] == 2                  # el de 3+ queda fuera


@pytest.mark.asyncio
async def test_tension_ordena_antes_de_recortar(db):
    """[MEDIO] con más celdas que el tope, la MÁS caliente sobrevive al recorte."""
    # 15 celdas frías (colonias c0..c14, 1R) + 1 caliente al final (narvarte 2R)
    docs = []
    for i in range(15):
        docs.append(_unidad(f"f{i}", "dev-mio", f"colonia-{i}", rec=1))
    docs += [_unidad("h1", "dev-mio", "narvarte", rec=2)]
    await db.dmx_units.insert_many(docs)
    await db.marketplace_searches.insert_many(
        [{**_busqueda_mkt(f"ip{i}", ["narvarte"]), "recamaras_min": 2} for i in range(5)])
    r = await di.tension_cortes_dev(db, ["dev-mio"], max_celdas=3)
    assert r["celdas"][0]["colonia"] == "narvarte"          # la caliente NO se truncó
    assert r["celdas_totales"] == 16 and len(r["celdas"]) == 3


@pytest.mark.asyncio
async def test_overrides_del_dev_mandan_en_simulador(db):
    """[MEDIO] el precio editado por el dev (developer_unit_overrides) manda sobre el seed."""
    await db.dmx_units.insert_one(_unidad("u1", "p1", "narvarte", precio=2_000_000, eng_pct=10.0))
    await db.developer_unit_overrides.insert_one({"unit_id": "u1", "dev_id": "p1", "price": 1_000_000})
    await db.marketplace_searches.insert_many(
        [_busqueda_mkt(f"ip{i}", ["narvarte"], enganche=120_000) for i in range(5)])
    r = await di.simulador_enganche(db, "p1", pct_nuevo=10.0)
    # entrada = 1M (override), 10% = 100k → los 5 con 120k alcanzan (con seed 2M serían 0)
    assert r["precio_entrada"] == 1_000_000
    assert r["nuevo"]["compradores_alcanzan"] == 5
    assert r["pct_actual_es_estimado"] is False             # eng_pct viene de la unidad
