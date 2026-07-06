"""CUBO TOTAL F3 — espejo de demanda por corte + alertas de corte guardado.

Fija: (1) demand_cut es CONJUNTIVO sobre marketplace_searches y cuenta personas distintas
(visitor_id con fallback ip_hash), (2) espejo_de_corte declara los filtros sin cara de demanda
(espejo parcial, honesto), (3) la alerta de corte NO dispara sin línea base, dispara cuando el
corte cambia y notifica al superadmin, (4) el evaluador viejo ignora las alertas tipo 'corte'.
"""
import datetime as dt

import mongomock_motor
import pytest

import demand_intelligence as di
import vistas_guardadas as vg


@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["dmx_test"]


def _busqueda(ip, colonias=None, features=None, mens=None, dias=5, visitor=None):
    return {"ip_hash": ip, "visitor_id": visitor, "colonias": colonias or [],
            "features_pedidos": features or [], "mensualidad_max": mens,
            "created_at_dt": dt.datetime.utcnow() - dt.timedelta(days=dias)}


@pytest.mark.asyncio
async def test_demand_cut_conjuntivo_y_personas(db):
    await db.marketplace_searches.insert_many([
        _busqueda("ip1", ["narvarte"], ["balcon"], 28_000),
        _busqueda("ip1", ["narvarte"], ["balcon"], 25_000),           # misma persona, 2 búsquedas
        _busqueda("ip2", ["narvarte"], ["terraza"], 28_000),          # feature distinta → fuera
        _busqueda("ip3", ["polanco"], ["balcon"], 28_000),            # otra colonia → fuera
        _busqueda("ip4", ["narvarte"], ["balcon"], 90_000),           # tope mayor → fuera
        _busqueda("ip5", ["narvarte"], ["balcon"], 28_000, dias=400), # vieja → fuera de la ventana
    ])
    r = await di.demand_cut(db, colonias=["narvarte"], features=["balcon"], mensualidad_max=30_000)
    assert r["busquedas"] == 2 and r["personas"] == 1                 # conjuntivo + distinct honesto


@pytest.mark.asyncio
async def test_espejo_de_corte_parcial_declarado(db):
    await db.marketplace_searches.insert_many([
        _busqueda("ip1", ["narvarte"], ["balcon"], 28_000),
        _busqueda("ip2", ["narvarte"], ["balcon"], 29_000),
    ])
    filtros = [
        {"campo": "colonia", "op": "eq", "valor": "narvarte"},
        {"campo": "has_balcon", "op": "eq", "valor": True},
        {"campo": "mens_80_20", "op": "lt", "valor": 30_000},
        {"campo": "walkability", "op": "gt", "valor": 70},            # sin cara de demanda
    ]
    r = await di.espejo_de_corte(db, filtros)
    assert r["personas"] == 2 and r["busquedas"] == 2
    assert r["espejo_parcial"] is True and r["no_espejables"] == ["walkability"]
    assert set(r["espejados"]) == {"colonia", "has_balcon", "mens_80_20"}


@pytest.mark.asyncio
async def test_espejo_alcaldia_resuelve_colonias(db):
    await db.colonias.insert_many([
        {"id": "narvarte", "alcaldia": "Benito Juárez"},
        {"id": "napoles", "alcaldia": "Benito Juárez"},
        {"id": "polanco", "alcaldia": "Miguel Hidalgo"},
    ])
    await db.marketplace_searches.insert_many([
        _busqueda("ip1", ["napoles"]), _busqueda("ip2", ["polanco"]),
    ])
    r = await di.espejo_de_corte(db, [{"campo": "alcaldia", "op": "eq", "valor": "benito-juarez"}])
    assert r["busquedas"] == 1                                        # solo la búsqueda en BJ


@pytest.mark.asyncio
async def test_alerta_corte_baseline_cambio_y_notificacion(db):
    await db.users.insert_one({"id": "sa1", "role": "superadmin", "email": "sa@dmx.io"})
    # corte guardado: todo el mercado de unidades
    await vg.guardar(db, "Mi corte", "explorador",
                     {"filtros": [], "agrupar_por": [], "universo": "unidades"},
                     alerta={"tipo": "corte", "activa": True, "umbral_pct": 10})
    await db.dmx_units.insert_one({"unit_id": "u1", "development_id": "d1",
                                   "commercial": {"precio_lista_mxn": 1_000_000, "status": "disponible"},
                                   "areas": {"m2_privativo": 50}, "geo": {"colonia_id": "narvarte"}})
    # 1a corrida: fija la línea base, NO dispara (sin base no hay cambio honesto)
    r1 = await vg.evaluar_alertas_corte(db)
    assert r1["revisadas"] == 1 and r1["disparadas"] == []
    v = await db.saved_views.find_one({"tipo": "explorador"}, {"_id": 0})
    assert v["snapshot"]["n"] == 1
    # entra una unidad al corte → 2a corrida dispara y notifica al superadmin
    await db.dmx_units.insert_one({"unit_id": "u2", "development_id": "d1",
                                   "commercial": {"precio_lista_mxn": 2_000_000, "status": "disponible"},
                                   "areas": {"m2_privativo": 60}, "geo": {"colonia_id": "narvarte"}})
    r2 = await vg.evaluar_alertas_corte(db)
    assert len(r2["disparadas"]) == 1
    assert any("entraron 1" in c for c in r2["disparadas"][0]["cambios"])
    notif = await db.notifications.find_one({"type": "cube_view_alert"}, {"_id": 0})
    assert notif and notif["user_id"] == "sa1" and notif["action_url"] == "/superadmin/mercado"
    # 3a corrida sin cambios → no dispara
    r3 = await vg.evaluar_alertas_corte(db)
    assert r3["disparadas"] == []


@pytest.mark.asyncio
async def test_evaluador_viejo_ignora_alertas_corte(db):
    await vg.guardar(db, "Corte X", "explorador", {"filtros": []},
                     alerta={"tipo": "corte", "activa": True})
    r = await vg.evaluar_alertas(db)                                  # el de umbrales del screener
    assert r["disparadas"] == []
    v = await db.saved_views.find_one({"nombre": "Corte X"}, {"_id": 0})
    assert v["ultimo_check"] is None                                  # ni lo tocó


# ─── Regresión de los 10 hallazgos de la review adversarial F3 ────────────────

@pytest.mark.asyncio
async def test_sin_identidad_no_acuna_personas(db):
    """[ALTO] búsquedas sin visitor_id NI ip_hash (asesor_anon) NO inflan personas."""
    await db.marketplace_searches.insert_many([
        _busqueda("ip1", ["narvarte"]),
        {"ip_hash": None, "visitor_id": None, "colonias": ["narvarte"], "features_pedidos": [],
         "mensualidad_max": None, "created_at_dt": dt.datetime.utcnow()},
        {"ip_hash": None, "visitor_id": None, "colonias": ["narvarte"], "features_pedidos": [],
         "mensualidad_max": None, "created_at_dt": dt.datetime.utcnow()},
    ])
    r = await di.demand_cut(db, colonias=["narvarte"])
    assert r["busquedas"] == 3 and r["personas"] == 1
    assert r["busquedas_sin_identidad"] == 2                          # declarado, no fingido


@pytest.mark.asyncio
async def test_colonia_tecleada_se_canonicaliza(db):
    """'Roma Norte' tecleado a mano matchea las búsquedas guardadas como 'roma-norte'."""
    await db.marketplace_searches.insert_many([
        _busqueda("ip1", ["roma-norte"]), _busqueda("ip2", ["roma-norte"]),
    ])
    r = await di.espejo_de_corte(db, [{"campo": "colonia", "op": "eq", "valor": "Roma Norte"}])
    assert r["busquedas"] == 2 and "colonia" in r["espejados"]


@pytest.mark.asyncio
async def test_alcaldia_sin_resolver_no_infla(db):
    """alcaldía que no resuelve a colonias → no_espejables (NO se elimina el filtro en silencio)."""
    await db.marketplace_searches.insert_many([
        _busqueda("ip1", ["polanco"]), _busqueda("ip2", ["del-valle"]),
    ])
    # db.colonias vacía → la alcaldía no resuelve
    r = await di.espejo_de_corte(db, [{"campo": "alcaldia", "op": "eq", "valor": "benito-juarez"}])
    assert "alcaldia" in r["no_espejables"] and r["espejo_parcial"] is True
    assert r["espejo_total_mercado"] is True                          # y se declara como total


@pytest.mark.asyncio
async def test_valor_invalido_no_crashea(db):
    """valor None o no numérico → no_espejables, nunca 500."""
    r = await di.espejo_de_corte(db, [
        {"campo": "precio", "op": "lt", "valor": None},
        {"campo": "recamaras", "op": "gte", "valor": "dos"},
    ])
    assert set(r["no_espejables"]) == {"precio", "recamaras"}


@pytest.mark.asyncio
async def test_corte_100pct_no_espejable_se_declara_total(db):
    """corte solo de índices de zona → el número es demanda TOTAL y se dice explícito."""
    await db.marketplace_searches.insert_many([_busqueda("ip1"), _busqueda("ip2")])
    r = await di.espejo_de_corte(db, [{"campo": "walkability", "op": "gt", "valor": 70}])
    assert r["espejo_total_mercado"] is True
    assert "TOTAL" in r["lectura"]


@pytest.mark.asyncio
async def test_espejo_acota_filtros(db):
    """más de 12 filtros se truncan (mismo tope que el motor) — sin fan-out por request."""
    filtros = [{"campo": "alcaldia", "op": "eq", "valor": f"x{i}"} for i in range(50)]
    r = await di.espejo_de_corte(db, filtros)
    assert len(r["espejados"]) + len(r["no_espejables"]) <= 12


def test_delta_corte_absorcion_desde_cero():
    """[falso negativo] absorción 0→50 SÍ dispara (puntos, no pct relativo sobre falsy)."""
    import vistas_guardadas as v
    cambios = v._delta_corte({"n": 40, "precio_prom": 5_000_000, "absorcion_pct": 0},
                             {"n": 40, "precio_prom": 5_000_000, "absorcion_pct": 50}, 10)
    assert any("absorción subió 50.0 pts" in c for c in cambios)
    # y X→0 también
    cambios2 = v._delta_corte({"n": 40, "precio_prom": 5_000_000, "absorcion_pct": 50},
                              {"n": 40, "precio_prom": 5_000_000, "absorcion_pct": 0}, 10)
    assert any("absorción bajó" in c for c in cambios2)


# ─── Ampliación post-feedback del founder ("¿ampliaste la mirada?") ───────────

@pytest.mark.asyncio
async def test_espejo_ancho_banos_etapa_amenidades(db):
    """El espejo cubre TODO lo que las búsquedas declaran: baños, etapa y amenidades."""
    await db.marketplace_searches.insert_many([
        {**_busqueda("ip1", ["narvarte"]), "banos_min": 2, "stage_pedido": "preventa",
         "amenidades_pedidas": ["alberca", "gym"]},
        {**_busqueda("ip2", ["narvarte"]), "banos_min": 1, "stage_pedido": None,
         "amenidades_pedidas": []},
    ])
    filtros = [
        {"campo": "banos", "op": "gte", "valor": 2},
        {"campo": "etapa", "op": "eq", "valor": "preventa"},
        {"campo": "amenidades_edificio", "op": "eq", "valor": "alberca"},
    ]
    r = await di.espejo_de_corte(db, filtros)
    assert r["busquedas"] == 1                                        # solo ip1 cumple los 3
    assert set(r["espejados"]) == {"banos", "etapa", "amenidades_edificio"}
    assert r["no_espejables"] == []


@pytest.mark.asyncio
async def test_tension_por_unidad(db):
    """TENSIÓN = personas del corte / unidades del corte (el número del moat)."""
    await db.marketplace_searches.insert_many([
        _busqueda("ip1", ["narvarte"]), _busqueda("ip2", ["narvarte"]),
        _busqueda("ip3", ["narvarte"]), _busqueda("ip4", ["narvarte"]),
    ])
    r = await di.espejo_de_corte(db, [{"campo": "colonia", "op": "eq", "valor": "narvarte"}],
                                 n_oferta=2)
    assert r["tension_por_unidad"] == 2.0                             # 4 personas / 2 unidades
    assert "tensión" in r["lectura"]
    # sin n_oferta o espejo total → no se inventa tensión
    r2 = await di.espejo_de_corte(db, [{"campo": "colonia", "op": "eq", "valor": "narvarte"}])
    assert r2["tension_por_unidad"] is None


@pytest.mark.asyncio
async def test_momentum_de_demanda(db):
    """MOMENTUM: mitad reciente vs mitad previa de la ventana (¿la demanda sube o baja?)."""
    await db.marketplace_searches.insert_many([
        _busqueda("ip1", ["narvarte"], dias=5),                       # reciente (ventana 180: mitad=90)
        _busqueda("ip2", ["narvarte"], dias=10),                      # reciente
        _busqueda("ip3", ["narvarte"], dias=120),                     # previa
    ])
    r = await di.demand_cut(db, colonias=["narvarte"])
    assert r["busquedas_recientes"] == 2 and r["busquedas_previas"] == 1
    assert r["momentum_pct"] == 100.0                                 # 2 vs 1 = +100%
    # sin previas → momentum None (no se inventa una tendencia con base 0)
    await db.marketplace_searches.delete_many({"ip_hash": "ip3"})
    r2 = await di.demand_cut(db, colonias=["narvarte"])
    assert r2["momentum_pct"] is None


# ─── F5 · el TIEMPO del cubo ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_huella_diaria_idempotente_con_espejo(db):
    """F5: cada corrida del cron deja 1 punto/día por corte (re-correr NO duplica) y la huella
    lleva el espejo (personas/tensión) — el corte gana línea de tiempo."""
    await db.users.insert_one({"id": "sa1", "role": "superadmin"})
    await vg.guardar(db, "Corte hist", "explorador",
                     {"filtros": [{"campo": "colonia", "op": "eq", "valor": "narvarte"}],
                      "agrupar_por": [], "universo": "unidades"},
                     alerta={"tipo": "corte", "activa": True, "umbral_pct": 10})
    await db.dmx_units.insert_many([
        {"unit_id": f"u{i}", "development_id": "d1",
         "commercial": {"precio_lista_mxn": 2_000_000, "status": "disponible"},
         "areas": {"m2_privativo": 50}, "geo": {"colonia_id": "narvarte"}} for i in range(4)])
    await db.marketplace_searches.insert_many([
        {"ip_hash": f"ip{i}", "visitor_id": None, "colonias": ["narvarte"], "features_pedidos": [],
         "created_at_dt": dt.datetime.utcnow()} for i in range(6)])
    await vg.evaluar_alertas_corte(db)
    await vg.evaluar_alertas_corte(db)                       # 2a corrida el MISMO día
    huellas = [h async for h in db.cube_corte_snapshots.find({"ref_tipo": "vista"}, {"_id": 0})]
    assert len(huellas) == 1                                 # idempotente por (corte, día)
    h = huellas[0]
    assert h["n"] == 4 and h["disponibles"] == 4
    assert h["personas"] == 6 and h["tension"] == 1.5        # 6 personas / 4 disponibles


@pytest.mark.asyncio
async def test_huella_de_busqueda_asesor(db):
    """F5: las búsquedas de clientes del asesor también dejan huella diaria."""
    await db.asesor_busquedas.insert_one({"id": "b1", "owner_id": "as1", "contacto_id": "c1",
                                          "colonias": ["narvarte"], "recamaras_min": 1})
    await db.dmx_units.insert_many([
        {"unit_id": f"u{i}", "development_id": "d1",
         "commercial": {"precio_lista_mxn": 2_000_000, "status": "disponible"},
         "areas": {"m2_privativo": 50}, "interior": {"recamaras": 2},
         "geo": {"colonia_id": "narvarte"}} for i in range(3)])
    r = await vg.evaluar_cortes_asesor(db)
    assert r["revisadas"] == 1
    h = await db.cube_corte_snapshots.find_one({"ref_tipo": "busqueda", "ref_id": "b1"}, {"_id": 0})
    assert h and h["n"] == 3                                 # disponibles del corte del cliente


@pytest.mark.asyncio
async def test_huella_sin_alerta_tambien(db):
    """[auditoría F5] la huella es para TODAS las vistas explorador — la alerta solo notifica."""
    await vg.guardar(db, "Sin alerta", "explorador",
                     {"filtros": [], "agrupar_por": [], "universo": "unidades"}, alerta=None)
    await db.dmx_units.insert_one({"unit_id": "u1", "development_id": "d1",
                                   "commercial": {"precio_lista_mxn": 1_000_000, "status": "disponible"},
                                   "areas": {"m2_privativo": 50}, "geo": {"colonia_id": "narvarte"}})
    r = await vg.evaluar_alertas_corte(db)
    assert r["revisadas"] == 1 and r["disparadas"] == []     # sin alerta no notifica...
    h = await db.cube_corte_snapshots.find_one({"ref_tipo": "vista"}, {"_id": 0})
    assert h and h["n"] == 1                                 # ...pero SÍ deja huella (el 📈 lo promete)


@pytest.mark.asyncio
async def test_busqueda_terminal_no_gasta_cubo(db):
    """[auditoría F5] búsquedas ganadas/perdidas quedan fuera del cron."""
    await db.asesor_busquedas.insert_many([
        {"id": "b1", "owner_id": "a1", "colonias": ["narvarte"], "stage": "activa"},
        {"id": "b2", "owner_id": "a1", "colonias": ["narvarte"], "stage": "ganada"},
    ])
    r = await vg.evaluar_cortes_asesor(db)
    assert r["revisadas"] == 1
