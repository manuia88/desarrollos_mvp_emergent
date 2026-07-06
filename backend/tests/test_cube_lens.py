"""CUBO TOTAL F4 — la capa de lentes (cube_lens).

Fija la POLÍTICA DE SEGURIDAD del cerebro fuera del superadmin:
(1) celda bajo el K de la lente → SUPRIMIDA (no etiquetada como en god-view),
(2) grupos chicos → enmascarados, (3) dev solo ve SUS unidades exactas,
(4) asesor no ve prob_venta ni unidades vendidas, (5) comprador recibe BANDAS
de demanda (jamás conteos exactos) con K=K_ANON_MIN canónico, (6) rol sin lente → error.
"""
import datetime as dt

import mongomock_motor
import pytest

import cube_lens as cl
from anonymization_engine import K_ANON_MIN


@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["dmx_test"]


def _unidad(uid, dev_id, colonia, status="disponible", precio=3_000_000):
    return {"unit_id": uid, "development_id": dev_id,
            "commercial": {"precio_lista_mxn": precio, "status": status},
            "areas": {"m2_privativo": 60}, "interior": {"recamaras": 2},
            "geo": {"colonia_id": colonia, "alcaldia": "Benito Juárez"}}


async def _seed(db, n=6):
    await db.dmx_units.insert_many(
        [_unidad(f"a{i}", "dev-mio", "narvarte") for i in range(n // 2)]
        + [_unidad(f"b{i}", "dev-ajeno", "narvarte",
                   status="vendido" if i == 0 else "disponible") for i in range(n - n // 2)])


@pytest.mark.asyncio
async def test_supresion_bajo_k(db):
    await db.dmx_units.insert_many([_unidad("u1", "d1", "narvarte"), _unidad("u2", "d1", "narvarte")])
    r = await cl.consulta_con_lente(db, "asesor", [])
    assert r["suprimido"] is True and r["n"] is None      # n=2 < K=3 → ni el número se da
    assert "kpis" not in r


@pytest.mark.asyncio
async def test_grupos_chicos_enmascarados(db):
    await _seed(db, n=6)
    await db.dmx_units.insert_one(_unidad("solo", "d9", "polanco"))   # 1 unidad en polanco
    r = await cl.consulta_con_lente(db, "asesor", [], ["colonia"])
    grupos = {tuple(g["valores"].values()): g for g in r["grupos"]}
    assert grupos[("narvarte",)]["enmascarado"] is False
    assert grupos[("polanco",)]["n"] is None and grupos[("polanco",)]["enmascarado"] is True


@pytest.mark.asyncio
async def test_dev_solo_sus_unidades(db):
    await _seed(db, n=6)
    r = await cl.consulta_con_lente(db, "dev", [], own_development_ids=["dev-mio"])
    assert r["n"] == 6                                     # el agregado es de TODO el mercado
    assert all(u["development_id"] == "dev-mio" for u in r["unidades"])   # exactas: solo suyas


@pytest.mark.asyncio
async def test_asesor_sin_prob_venta_ni_vendidas(db):
    await _seed(db, n=6)
    r = await cl.consulta_con_lente(db, "asesor", [])
    assert all(u.get("status") == "disponible" for u in r["unidades"])
    assert all("prob_venta" not in u for u in r["unidades"])


@pytest.mark.asyncio
async def test_comprador_bandas_nunca_exactos(db):
    ahora = dt.datetime.utcnow()
    await db.marketplace_searches.insert_many([
        {"ip_hash": f"ip{i}", "colonias": ["narvarte"], "features_pedidos": [],
         "created_at_dt": ahora} for i in range(12)])
    r = await cl.espejo_con_lente(db, "comprador",
                                  [{"campo": "colonia", "op": "eq", "valor": "narvarte"}])
    assert r["personas_banda"] == "10-24" and r["hay_demanda"] is True
    assert "personas" not in r                             # el conteo exacto NO viaja al público
    # bajo K → suprimido del todo
    await db.marketplace_searches.delete_many({"ip_hash": {"$in": [f"ip{i}" for i in range(9)]}})
    r2 = await cl.espejo_con_lente(db, "comprador",
                                   [{"campo": "colonia", "op": "eq", "valor": "narvarte"}])
    assert r2["personas_banda"] is None and r2["hay_demanda"] is False
    assert r2["momentum"] is None                          # sin banda tampoco se insinúa tendencia
    assert cl.LENTES["comprador"]["k"] == K_ANON_MIN       # K canónico, no hardcodeado


@pytest.mark.asyncio
async def test_espejo_interno_exacto_con_flag(db):
    ahora = dt.datetime.utcnow()
    await db.marketplace_searches.insert_many([
        {"ip_hash": f"ip{i}", "colonias": ["narvarte"], "features_pedidos": [],
         "created_at_dt": ahora} for i in range(4)])
    r = await cl.espejo_con_lente(db, "dev", [{"campo": "colonia", "op": "eq", "valor": "narvarte"}],
                                  n_oferta=2)
    assert r["personas"] == 4 and r["tension_por_unidad"] == 2.0   # exacto para el dev
    assert r["publicable"] is True                                 # 4 ≥ K interna(3)


@pytest.mark.asyncio
async def test_rol_desconocido_falla_cerrado(db):
    r = await cl.consulta_con_lente(db, "hacker", [])
    assert r["ok"] is False
    r2 = await cl.espejo_con_lente(db, "", [])
    assert r2["ok"] is False


# ─── Regresión review adversarial F4 ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_n_disponibles_no_cuenta_vendidas(db):
    """[ALTO] el headline 'disponibles' NO incluye vendidas/reservadas (mentía urgencia +
    filtraba absorción de un dev identificable)."""
    await db.dmx_units.insert_many(
        [_unidad(f"d{i}", "d1", "narvarte") for i in range(4)]
        + [_unidad(f"v{i}", "d1", "narvarte", status="vendido") for i in range(3)])
    r = await cl.consulta_con_lente(db, "comprador", [])
    assert r["n"] == 7 and r["n_disponibles"] == 4          # total interno vs headline honesto


@pytest.mark.asyncio
async def test_espejo_total_mercado_no_se_presenta_como_corte(db):
    """[CRÍTICO] filtros sin cara de demanda → NINGUNA lente presenta el total del mercado
    como demanda del corte (números nulos + flag, en pública E interna)."""
    ahora = dt.datetime.utcnow()
    await db.marketplace_searches.insert_many([
        {"ip_hash": f"ip{i}", "colonias": ["polanco"], "features_pedidos": [],
         "created_at_dt": ahora} for i in range(10)])
    corte = [{"campo": "walkability", "op": "gt", "valor": 70}]   # sin cara de demanda
    pub = await cl.espejo_con_lente(db, "comprador", corte)
    assert pub["espejo_total_mercado"] is True and pub["hay_demanda"] is False
    assert pub["personas_banda"] is None and pub["caliente"] is False
    interno = await cl.espejo_con_lente(db, "dev", corte)
    assert interno["espejo_total_mercado"] is True and interno["personas"] is None
    assert interno["tension_por_unidad"] is None


# ─── F6 · lente PARTNER (el cliente de data) ──────────────────────────────────

@pytest.mark.asyncio
async def test_partner_cero_unidades_grupos_en_banda(db):
    """F6: el partner recibe agregados k≥5, CERO unidades individuales y grupos en BANDA de n."""
    await db.dmx_units.insert_many(
        [_unidad(f"u{i}", "dev-x", "narvarte") for i in range(7)]
        + [_unidad(f"v{i}", "dev-y", "polanco") for i in range(2)])   # polanco chico
    r = await cl.consulta_con_lente(db, "partner", [], ["colonia"])
    assert r["ok"] and r["unidades"] == []                   # jamás unidades individuales
    grupos = {tuple(g["valores"].values()): g for g in r["grupos"]}
    assert grupos[("narvarte",)]["n_banda"] == "5-9"         # banda, no el 7 exacto
    assert "n" not in grupos[("narvarte",)] or grupos[("narvarte",)].get("n") is None
    assert grupos[("polanco",)]["enmascarado"] is True       # celda chica suprimida
    assert cl.LENTES["partner"]["k"] == K_ANON_MIN


def test_require_scope():
    """F6: una key CON scopes solo consume sus productos; sin scopes = compat total."""
    import public_api_auth as pa
    ctx_scoped = pa.ApiKeyContext(id="k1", tenant_id="t", tier="enterprise",
                                  monthly_quota_calls=10, calls_this_month=1, calls_remaining=9,
                                  status="active", scopes=("drpi",))
    ctx_open = pa.ApiKeyContext(id="k2", tenant_id="t", tier="enterprise",
                                monthly_quota_calls=10, calls_this_month=1, calls_remaining=9,
                                status="active")
    pa.require_scope(ctx_open, "cuts")                       # sin scopes → pasa (compat)
    pa.require_scope(ctx_scoped, "drpi")                     # su producto → pasa
    import pytest as _pt
    from fastapi import HTTPException
    with _pt.raises(HTTPException):
        pa.require_scope(ctx_scoped, "cuts")                 # producto ajeno → 403


# ─── F6 hardening (auditoría) ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_partner_gate_contribuyentes(db):
    """[FUGA] corte de <3 devs → ritmo de venta (vendidas/disponibles/absorción) SUPRIMIDO."""
    # 8 unidades de UN solo dev
    await db.dmx_units.insert_many([
        {"unit_id": f"u{i}", "development_id": "dev-solo",
         "commercial": {"precio_lista_mxn": 3_000_000, "status": "vendido" if i == 0 else "disponible"},
         "areas": {"m2_privativo": 55}, "interior": {"recamaras": 2},
         "geo": {"colonia_id": "narvarte"}} for i in range(8)])
    r = await cl.consulta_con_lente(db, "partner", [])
    assert r["pocos_contribuyentes"] is True
    assert "vendidas" not in r["kpis"] and "disponibles" not in r["kpis"] and "absorcion_pct" not in r["kpis"]
    assert r["kpis"].get("precio_prom")                      # precio de LISTA se mantiene (público)
    assert r["n_disponibles"] is None
    # con ≥3 devs: el ritmo SÍ viaja
    await db.dmx_units.insert_many([
        {"unit_id": f"a{i}", "development_id": f"dev-{i}",
         "commercial": {"precio_lista_mxn": 3_000_000, "status": "disponible"},
         "areas": {"m2_privativo": 55}, "interior": {"recamaras": 2},
         "geo": {"colonia_id": "narvarte"}} for i in range(3)])
    r2 = await cl.consulta_con_lente(db, "partner", [])
    assert r2["pocos_contribuyentes"] is False
    assert "disponibles" in r2["kpis"]
