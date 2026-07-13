"""OLAS F (simulación + la capa que aprende) y G (productos) — números exactos + honestidad."""
from datetime import datetime, timedelta, timezone

import pytest

from test_market_timeline import _DB, _patch, _siembra_vida


async def _atomo(db, visitor, dim, val, colonia="condesa"):
    await db.demand_atoms.insert_one({"visitor_id": visitor, "colonia": colonia,
                                      "dimension": dim, "valor": val, "peso": 1.0,
                                      "ts": datetime.now(timezone.utc).isoformat()})


def _unidad(uid, colonia="condesa", precio=5000000.0, m2=80.0, rec=2, disponible=True, dev="d1"):
    return {"colonia": colonia, "dev_id": dev, "disponible": disponible, "unit_id": uid,
            "precio": precio, "m2": m2, "recamaras": rec, "piso": 3, "status": "disponible",
            "crudos": {}, "vector": {"producto.recamaras": str(rec)}}


# ═══ F1 · Bayes formal ═══
@pytest.mark.asyncio
async def test_f1_posterior_se_mueve_hacia_lo_observado():
    """Prior 4S: 2 rec=50%, 3 rec=50%. Observado: 10 visitantes piden 2 rec, 0 piden 3 →
    el posterior de 2 rec SUBE del prior y el de 3 BAJA — el estudio se actualiza solo."""
    from ola_f_engines import bayes_formal
    db = _DB()
    for opcion, pct in (("2", 50), ("3", 50)):
        await db.facts_4s.insert_one({"unidad": "pct", "tema": "producto",
                                      "pregunta": "dormitorios_pct", "estudio": "coyoacan",
                                      "opcion": opcion, "valor": pct, "corte_key": ""})
    for i in range(10):
        await _atomo(db, f"v{i}", "producto.recamaras", "2")
    r = await bayes_formal(db)
    tabla = r["tablas"][0]
    filas = {f["opcion"]: f for f in tabla["filas"]}
    assert filas["2"]["posterior_pct"] > 50 > filas["3"]["posterior_pct"]
    assert filas["2"]["movimiento"] > 0 > filas["3"]["movimiento"]
    assert tabla["credibilidad_observado_pct"] == pytest.approx(33.3, abs=0.1)  # 10/(10+20)


# ═══ F2 · Gemelo v2 ═══
@pytest.mark.asyncio
async def test_f2_proyecto_hipotetico_matchea_y_objeta():
    """Proyecto 2 rec / 5 MDP en condesa: el buscador compatible matchea ≥75; al que pide
    3 rec le sale la objeción 'pide más recámaras' — el brief de ajuste."""
    from ola_f_engines import gemelo_demanda_v2
    db = _DB()
    await _atomo(db, "ok", "producto.recamaras", "2")
    await _atomo(db, "ok", "finanzas.presupuesto_banda_mdp", "5.0-5.2")
    await _atomo(db, "no", "producto.recamaras", "3")
    await _atomo(db, "no", "finanzas.presupuesto_banda_mdp", "5.0-5.2")
    r = await gemelo_demanda_v2(db, proyecto={"colonia": "condesa", "precio_mdp": 5.0,
                                              "recamaras": 2, "m2": 75, "features": []})
    por_v = {f["visitor_id"]: f for f in r["matcheo"]}
    assert por_v["ok"]["compatibilidad_pct"] >= 75
    assert por_v["no"]["compatibilidad_pct"] < 75
    assert r["compradores_probables"] == 1
    assert r["objecion_dominante"] == "pide más recámaras"


# ═══ F3 · Simulador ═══
@pytest.mark.asyncio
async def test_f3_simulador_reproducible_y_sensible_al_precio(monkeypatch):
    """Misma semilla = mismo resultado; bajar el precio NO reduce las ventas simuladas."""
    from ola_f_engines import simulador_mercado
    db = _DB()
    for i in range(6):
        await _atomo(db, f"v{i}", "producto.recamaras", "2")
        await _atomo(db, f"v{i}", "finanzas.presupuesto_banda_mdp", "5.0-5.2")
    _patch(monkeypatch, [_unidad(f"u{i}", precio=5100000.0 + i * 10000) for i in range(8)])
    r1 = await simulador_mercado(db, rondas=50, semilla=7)
    r2 = await simulador_mercado(db, rondas=50, semilla=7)
    assert r1["ventas_simuladas"] == r2["ventas_simuladas"]      # reproducible
    barato = await simulador_mercado(db, delta_precio_pct=-10, rondas=50, semilla=7)
    assert barato["ventas_simuladas"]["mediana"] >= r1["ventas_simuladas"]["mediana"]


# ═══ F4 · Predicciones + drift ═══
@pytest.mark.asyncio
async def test_f4_bascula_registra_y_evalua(monkeypatch):
    """La predicción queda escrita hoy; una predicción vieja 'sube' con pm2 que SÍ subió
    cuenta como acierto — precisión sin maquillaje."""
    from ola_f_engines import registrar_predicciones, evaluar_drift
    db = _DB()
    for i in range(4):
        await _atomo(db, f"v{i}", "producto.recamaras", "2")
    _patch(monkeypatch, [_unidad("u1", precio=8000000.0, m2=100.0)])   # pm2 hoy = 80k
    r = await registrar_predicciones(db)
    # BÁSCULA UNIVERSAL: índice (por colonia) + reloj (ciudad) + simulador (ciudad) = 3
    assert r["predicciones_registradas"] == 3
    motores = {d.get("motor") for d in db.genoma_predicciones.docs.values()}
    assert motores == {"indice_adelantado", "reloj_ciclo", "simulador"}
    # siembra una predicción MADURA (35 días): predijo 'sube' desde pm2 70k → hoy 80k = acierto
    vieja = (datetime.now(timezone.utc) - timedelta(days=35)).isoformat()[:10]
    await db.genoma_predicciones.insert_one({"colonia": "condesa", "fecha": vieja,
                                             "indice": 70.0, "pm2_al_predecir": 70000,
                                             "prediccion": "sube"})
    ev = await evaluar_drift(db, dias_madurez=30)
    assert ev["n_evaluadas"] == 1 and ev["precision_global_pct"] == 100.0
    assert ev["evaluadas"][0]["real"] == "sube"
    assert ev["precision_por_motor"] == [{"motor": "indice_adelantado", "n": 1, "precision_pct": 100.0}]


# ═══ F5 · Valor de la información ═══
@pytest.mark.asyncio
async def test_f5_ranking_de_captura(monkeypatch):
    """Unidades sin precio (campo que alimenta 6 motores) rankean arriba como 'qué capturar'."""
    import data_developments
    from ola_f_engines import valor_informacion
    monkeypatch.setattr(data_developments, "DEVELOPMENTS", [
        {"id": "d1", "colonia": "Condesa", "units": [
            {"id": "u1", "m2": 80, "recamaras": 2, "status": "disponible"},   # SIN precio
            {"id": "u2", "m2": 90, "recamaras": 2, "status": "disponible"},   # SIN precio
        ]}])
    db = _DB()
    _patch(monkeypatch, [])
    r = await valor_informacion(db)
    assert r["ranking"][0]["que_capturar"] == "precio en el inventario"
    assert r["ranking"][0]["faltan"] == 2 and r["ranking"][0]["motores_beneficiados"] == 6


# ═══ G1 · Estudio DMX ═══
@pytest.mark.asyncio
async def test_g1_estudio_dmx_se_genera_y_guarda(monkeypatch):
    from ola_g_products import estudio_dmx, _SECCIONES_ESTUDIO
    db = _DB()
    _patch(monkeypatch, [_unidad("u1")])
    await _atomo(db, "v1", "producto.recamaras", "2")
    r = await estudio_dmx(db, colonias=["condesa"])
    assert r["folio"].startswith("DMX-") and r["n_secciones"] == len(_SECCIONES_ESTUDIO)
    assert r["guardado"] and r["guardado"]["ok"]                 # quedó en la memoria de reportes
    assert any(s.get("seccion_estudio", "").startswith("1 ·") for s in r["secciones"])
    assert "procedencia" in r["metodologia"] or "procedencia" in str(r["secciones"][0])


# ═══ G2 · DMX-30 ═══
@pytest.mark.asyncio
async def test_g2_dmx30_serie_beta_sharpe(monkeypatch):
    """5 días de clima por colonia → índice base-100 y beta/sharpe calculados de la serie."""
    from ola_g_products import dmx30
    db = _DB()
    _patch(monkeypatch, [_unidad("u1", "condesa"), _unidad("u2", "roma_norte", precio=6000000.0)])
    await _atomo(db, "v1", "producto.recamaras", "2", colonia="condesa")
    base = {"condesa": 90000, "roma_norte": 70000}
    for d in range(5):
        fecha = f"2026-07-{10 + d:02d}"
        await db.contexto_timeline.insert_one({"fecha": fecha, "por_colonia": {
            c: {"pm2_mediana": p * (1 + 0.01 * d * (1 if c == "condesa" else 2))}
            for c, p in base.items()}})
    r = await dmx30(db)
    assert r["indice_serie"][0]["dmx30"] == 100.0                # base 100
    assert r["indice_serie"][-1]["dmx30"] > 100.0                # el mercado simulado subió
    filas = {f["colonia"]: f for f in r["constituyentes"]}
    assert filas["roma_norte"]["beta"] is not None and filas["condesa"]["beta"] is not None
    assert filas["roma_norte"]["beta"] > filas["condesa"]["beta"]   # roma se mueve 2× el índice


# ═══ G3 · CARFAX ═══
@pytest.mark.asyncio
async def test_g3_carfax_historia_y_veredicto(monkeypatch):
    """El dossier de u1: 2 eventos de precio en la bitácora, cambio detectado, señales contadas
    — y una unidad inexistente responde honesto."""
    from ola_g_products import carfax
    db = _DB()
    _patch(monkeypatch, [_unidad("u1", precio=4500000.0)])
    await _siembra_vida(db, "u1", "condesa", [
        ("2026-06-01T00:00:00+00:00", 5000000, True, {}),
        ("2026-07-01T00:00:00+00:00", 4500000, True, {})])
    await db.buyer_signals.insert_one({"type": "unit_view", "entity_id": "u1"})
    await db.buyer_signals.insert_one({"type": "unit_save", "entity_id": "u1"})
    r = await carfax(db, unit_id="u1")
    assert len(r["historia_precios"]) == 2
    assert any(c["campo"] == "precio" and c["delta_pct"] == -10.0 for c in r["cambios"])
    assert r["senales"] == {"vistas": 1, "dwell_fotos": 0, "guardados": 1}
    assert r["identidad"]["colonia"] == "condesa"
    nada = await carfax(db, unit_id="fantasma")
    assert nada["es_estimado"] and "no existe" in nada["lectura"]


@pytest.mark.asyncio
async def test_olas_f_g_honestas_sin_datos(monkeypatch):
    """UNIVERSAL (regla Lomas): todos los motores F+G con db vacía responden honesto."""
    import ola_f_engines as of
    import ola_g_products as og
    db = _DB()
    _patch(monkeypatch, [])
    for fn in (of.bayes_formal, of.gemelo_demanda_v2, of.simulador_mercado,
               of.evaluar_drift, of.valor_informacion, og.dmx30):
        r = await fn(db)
        assert isinstance(r, dict) and "lectura" in r
    r = await og.carfax(db, unit_id="x")
    assert r["es_estimado"]
