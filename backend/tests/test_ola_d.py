"""OLA D — tiempo + finanzas: 8 motores sobre la bitácora unificada + genoma.
Cada test siembra datos reales-en-forma y verifica números exactos + honestidad (es_estimado)."""
from datetime import datetime, timedelta, timezone

import pytest

import demand_mirror
from test_market_timeline import _DB, _patch, _siembra_vida


def _hace(dias: int, horas: int = 12) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=dias, hours=-(horas - 12))).isoformat()


async def _atomo(db, visitor, colonia, dim, val, dias, peso=1.0):
    await db.demand_atoms.insert_one({
        "visitor_id": visitor, "colonia": colonia, "dimension": dim, "valor": val,
        "peso": peso, "ts": _hace(dias)})


@pytest.mark.asyncio
async def test_d1_indice_adelantado_demanda_creciente_gana(monkeypatch):
    """Colonia con demanda ACELERANDO + poca oferta debe rankear arriba de la plana."""
    from ola_d_engines import indice_adelantado
    db = _DB()
    # caliente: 1 visitante hace 45d → 4 en los últimos 30d, 2 disponibles
    for i in range(4):
        await _atomo(db, f"v{i}", "caliente", "producto.recamaras", "2", dias=5)
    await _atomo(db, "viejo", "caliente", "producto.recamaras", "2", dias=45)
    # fria: 3 → 1 (demanda cayendo), 30 disponibles
    await _atomo(db, "f1", "fria", "producto.recamaras", "2", dias=5)
    for i in range(3):
        await _atomo(db, f"fp{i}", "fria", "producto.recamaras", "2", dias=45)
    unidades = ([{"colonia": "caliente", "dev_id": "d1", "disponible": True, "unit_id": f"c{i}",
                  "precio": 5e6, "m2": 80.0, "vector": {}, "crudos": {}} for i in range(2)]
                + [{"colonia": "fria", "dev_id": "d2", "disponible": True, "unit_id": f"f{i}",
                    "precio": 5e6, "m2": 80.0, "vector": {}, "crudos": {}} for i in range(30)])
    _patch(monkeypatch, unidades)
    r = await indice_adelantado(db)
    assert r["filas"][0]["colonia"] == "caliente"
    top = {f["colonia"]: f for f in r["filas"]}
    assert top["caliente"]["indice"] > top["fria"]["indice"]
    assert top["caliente"]["momentum_demanda"] > 50 > top["fria"]["momentum_demanda"]


@pytest.mark.asyncio
async def test_d2_reloj_ciclo_expansion(monkeypatch):
    """Alzas de precio + inventario absorbiéndose (salidas>altas) = EXPANSIÓN, burbuja baja
    (la demanda también crece)."""
    from ola_d_engines import reloj_ciclo
    db = _DB()
    _patch(monkeypatch, [])
    # bitácora: u1 sube de precio; u2/u3 se venden (salidas); solo 1 alta este periodo
    await _siembra_vida(db, "u1", "condesa", [
        (_hace(40), 5000000, True, {}), (_hace(5), 5400000, True, {})])
    for uid in ("u2", "u3"):
        await _siembra_vida(db, uid, "condesa", [
            (_hace(40), 4000000, True, {}), (_hace(4), 4000000, False, {"status": "vendido"})])
    for i in range(6):   # demanda creciendo (más visitantes recientes que previos)
        await _atomo(db, f"v{i}", "condesa", "producto.recamaras", "2", dias=3)
    await _atomo(db, "vp", "condesa", "producto.recamaras", "2", dias=40)
    r = await reloj_ciclo(db)
    assert r["fase"] == "expansion"
    assert r["burbuja_score"] == 0        # sube CON demanda y el inventario se seca — sin aire
    assert r["ejes"]["alzas_precio"] == 1 and r["ejes"]["salidas"] == 2


@pytest.mark.asyncio
async def test_d3_accesibilidad_mensualidad_e_ingreso(monkeypatch):
    """Precio mediano 5MDP, 20% enganche, 20 años: la mensualidad y el ingreso requerido salen
    de la fórmula de pago fijo con la tasa CF303 — y la sensibilidad ±200pb es monótona."""
    from ola_d_engines import accesibilidad, _mensualidad, _tasa_hipotecaria
    db = _DB()
    _patch(monkeypatch, [{"colonia": "condesa", "dev_id": "d1", "disponible": True, "unit_id": "u1",
                          "precio": 5000000.0, "m2": 80.0, "vector": {}, "crudos": {}}])
    r = await accesibilidad(db)
    fila = r["filas"][0]
    esperada = round(_mensualidad(4000000, _tasa_hipotecaria()["tasa"], 20))
    assert fila["mensualidad"] == esperada
    assert fila["ingreso_requerido"] == round(esperada / 0.30)
    mens = [s["mensualidad"] for s in r["sensibilidad_ciudad"]]
    assert mens == sorted(mens)           # más tasa → más mensualidad, siempre


@pytest.mark.asyncio
async def test_d4_termometro_caliente_vs_frio():
    """Visitante reciente+profundo+con finanzas HIERVE; el de una señal vieja queda frío."""
    from ola_d_engines import termometro_leads
    db = _DB()
    for i in range(6):
        await _atomo(db, "caliente", "condesa", f"producto.dim{i}", "x", dias=1)
    await _atomo(db, "caliente", "condesa", "finanzas.presupuesto_banda_mdp", "5.0-5.2", dias=0)
    await _atomo(db, "frio", "condesa", "producto.recamaras", "2", dias=40, peso=0.3)
    r = await termometro_leads(db)
    assert r["n_visitantes"] == 2
    top, bajo = r["leads"][0], r["leads"][-1]
    assert top["visitor_id"] == "caliente" and top["banda"] in ("hirviendo", "caliente")
    assert bajo["visitor_id"] == "frio" and bajo["banda"] in ("frio", "tibio")
    assert top["dio_finanzas"] and not bajo["dio_finanzas"]


@pytest.mark.asyncio
async def test_d5_cap_rate_y_comprar_vs_rentar(monkeypatch):
    """Reusa rentability_from_pm2 (canónico): cap rate presente y price_to_rent coherente."""
    from ola_d_engines import cap_rate_renta
    db = _DB()
    _patch(monkeypatch, [{"colonia": "condesa", "dev_id": "d1", "disponible": True, "unit_id": "u1",
                          "precio": 8000000.0, "m2": 100.0, "vector": {}, "crudos": {}}])
    r = await cap_rate_renta(db)
    fila = r["filas"][0]
    assert fila["cap_rate_pct"] is not None and fila["cap_rate_pct"] > 0
    assert fila["renta_mensual_est"] > 0
    # price_to_rent = precio / renta anual — coherencia interna exacta
    assert fila["price_to_rent"] == round(8000000 / (fila["renta_mensual_est"] * 12), 1)
    assert fila["comprar_entre_rentar"] > 0


@pytest.mark.asyncio
async def test_d6_cronobiologia_detecta_pico():
    from ola_d_engines import cronobiologia
    db = _DB()
    base = datetime.now(timezone.utc).replace(hour=21, minute=0)
    martes = base - timedelta(days=(base.weekday() - 1) % 7 or 7)   # el martes pasado, 21h
    for i in range(5):
        await db.demand_atoms.insert_one({"visitor_id": f"v{i}", "colonia": "condesa",
                                          "dimension": "producto.recamaras", "valor": "2",
                                          "peso": 1.0, "ts": martes.isoformat()})
    await db.demand_atoms.insert_one({"visitor_id": "x", "colonia": "condesa",
                                      "dimension": "producto.banos", "valor": "1", "peso": 1.0,
                                      "ts": (martes - timedelta(days=1)).replace(hour=9).isoformat()})
    r = await cronobiologia(db)
    assert r["pico"]["hora"] == "15:00" and r["pico"]["dia"] == "martes"   # 21 UTC = 15 CDMX
    assert r["n_senales"] == 6


@pytest.mark.asyncio
async def test_d7_elasticidad_despertar_y_neto_isr(monkeypatch):
    """Una baja de precio con 1 vista antes y 3 después = despertar +200%; y el neto del
    vendedor usa el núcleo canónico art. 126 (isr>0, neto<venta)."""
    from ola_d_engines import elasticidad_impuestos
    db = _DB()
    _patch(monkeypatch, [{"colonia": "condesa", "dev_id": "d1", "disponible": True, "unit_id": "u1",
                          "precio": 6000000.0, "m2": 80.0, "vector": {}, "crudos": {}}])
    await _siembra_vida(db, "u1", "condesa", [
        (_hace(30), 6500000, True, {}), (_hace(10), 6000000, True, {})])
    momento_baja = datetime.now(timezone.utc) - timedelta(days=10)
    await db.buyer_signals.insert_one({"type": "unit_view", "entity_id": "u1",
                                       "created_at_dt": momento_baja - timedelta(days=3)})
    for d in (1, 2, 3):
        await db.buyer_signals.insert_one({"type": "unit_view", "entity_id": "u1",
                                           "created_at_dt": momento_baja + timedelta(days=d)})
    r = await elasticidad_impuestos(db)
    el = r["elasticidad"]
    assert el["n_bajas_observadas"] == 1
    assert el["casos"][0]["vistas_antes"] == 1 and el["casos"][0]["vistas_despues"] == 3
    assert el["despertar_mediano_pct"] == 200.0
    neto = r["post_impuestos"]["filas"][0]
    assert 0 < neto["isr_estimado"] < neto["precio_venta_mediano"]
    assert neto["neto_vendedor"] == neto["precio_venta_mediano"] - neto["isr_estimado"]


@pytest.mark.asyncio
async def test_d8_curva_obra_prima_por_etapa(monkeypatch):
    """Entrega inmediata más cara que preventa → la prima se mide del dato, etapas descubiertas."""
    from ola_d_engines import curva_obra
    db = _DB()
    await db.developments.insert_one({"id": "dev_pre", "stage": "preventa"})
    await db.developments.insert_one({"id": "dev_ent", "stage": "entrega_inmediata"})
    _patch(monkeypatch, [
        {"colonia": "condesa", "dev_id": "dev_pre", "disponible": True, "unit_id": "p1",
         "precio": 5000000.0, "m2": 100.0, "vector": {}, "crudos": {}},
        {"colonia": "condesa", "dev_id": "dev_ent", "disponible": True, "unit_id": "e1",
         "precio": 6000000.0, "m2": 100.0, "vector": {}, "crudos": {}},
    ])
    r = await curva_obra(db)
    etapas = {f["etapa"]: f for f in r["filas"]}
    assert r["filas"][0]["etapa"] == "preventa"          # orden conocido primero
    assert etapas["entrega_inmediata"]["prima_vs_preventa_pct"] == 20.0
    assert not r["es_estimado"]


@pytest.mark.asyncio
async def test_ola_d_honesta_sin_datos(monkeypatch):
    """UNIVERSAL: los 8 motores con db vacía responden es_estimado/vacío honesto, jamás truenan
    (regla anti-dependencia: Lomas sin datos NO rompe nada)."""
    import ola_d_engines as od
    db = _DB()
    _patch(monkeypatch, [])
    for fn in (od.indice_adelantado, od.reloj_ciclo, od.accesibilidad, od.termometro_leads,
               od.cap_rate_renta, od.cronobiologia, od.elasticidad_impuestos, od.curva_obra):
        r = await fn(db)
        assert isinstance(r, dict) and "lectura" in r


@pytest.mark.asyncio
async def test_campana_termometro_transicion_sin_spam(monkeypatch):
    """El visitante que PASA a hirviendo dispara UNA campana; la segunda corrida del mismo día
    no duplica; el tibio no molesta a nadie."""
    import notifications_engine
    from ola_d_engines import revisar_termometro
    db = _DB()
    # hirviendo: reciente + profundo + finanzas + muchas dimensiones
    for i in range(7):
        await _atomo(db, "hot", "condesa", f"producto.dim{i}", "x", dias=0)
    await _atomo(db, "hot", "condesa", "finanzas.presupuesto_banda_mdp", "5.0-5.2", dias=0)
    await _atomo(db, "tibio", "condesa", "producto.recamaras", "2", dias=30, peso=0.3)
    await db.users.insert_one({"role": "superadmin", "user_id": "founder"})

    campanas = []
    async def _fake_emit(db_, **kw):
        campanas.append(kw)
    monkeypatch.setattr(notifications_engine, "emit_notification", _fake_emit)

    r1 = await revisar_termometro(db)
    assert r1["nuevos_hirviendo"] == 1
    assert len(campanas) == 1 and campanas[0]["type"] == "lead_hirviendo"
    assert "hot" in str(campanas[0]["payload"]["visitantes"])
    r2 = await revisar_termometro(db)          # ya estaba hirviendo → sin spam
    assert r2["nuevos_hirviendo"] == 0 and len(campanas) == 1
    # la temperatura quedó PERSISTIDA (hipersegmentable después)
    guardados = [d for d in db.lead_temperaturas.docs.values()]
    assert {d["visitor_id"] for d in guardados} == {"hot", "tibio"}
