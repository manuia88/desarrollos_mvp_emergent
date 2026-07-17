"""Alerta de Oportunidad — cambio de oferta → quién la busca → bandeja del asesor.

Fija el contrato de alerta_oportunidad.py:
  (1) match_perfil PURO — presupuesto ×1.05, recámaras mín., colonia en lista (acentos incluidos),
      perfil vacío nunca matchea, dato faltante del cambio no descarta salvo colonia;
  (2) compradores_para — junta perfiles REALES de las 5 fuentes (favoritos, unit_save,
      marketplace_searches, saved_searches, asesor_busquedas, radar) con dedup por identidad
      y prioridad favorito_directo > busqueda_guardada > lead_preferencias > radar;
  (3) alertar_oportunidad — arma el cambio desde db.units, notifica al ASESOR del lead
      (emit_notification mockeado) y registra SIEMPRE en oportunidades_detectadas
      (atendida:false, dedup idempotente). Nunca contacta al comprador final;
  (4) endpoint bandeja — scope del asesor (suyas + sin asesor), orden ts desc.
"""
import types

import mongomock_motor
import pytest

import alerta_oportunidad as A
from alerta_oportunidad import match_perfil


@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["dmx_test"]


def _req(db):
    return types.SimpleNamespace(app=types.SimpleNamespace(state=types.SimpleNamespace(db=db)))


CAMBIO = {"dev_id": "avalia", "colonia": "narvarte", "precio": 4_150_000, "recamaras": 2, "m2": 68}


# ─── 1) match_perfil exhaustivo ──────────────────────────────────────────────

class TestMatchPerfil:
    def test_cuadra_todo(self):
        assert match_perfil(CAMBIO, {"presupuesto_max": 4_500_000, "recamaras_min": 2, "colonias": ["narvarte"]})

    def test_presupuesto_exacto(self):
        assert match_perfil(CAMBIO, {"presupuesto_max": 4_150_000})

    def test_presupuesto_con_holgura_5pct(self):
        # 4,150,000 ≤ 4,000,000 × 1.05 = 4,200,000 → sí cuadra (la baja lo metió en rango)
        assert match_perfil(CAMBIO, {"presupuesto_max": 4_000_000})

    def test_presupuesto_fuera_de_holgura(self):
        # 4,150,000 > 3,900,000 × 1.05 = 4,095,000 → no
        assert not match_perfil(CAMBIO, {"presupuesto_max": 3_900_000})

    def test_recamaras_igual_al_minimo(self):
        assert match_perfil(CAMBIO, {"recamaras_min": 2})

    def test_recamaras_insuficientes(self):
        assert not match_perfil(CAMBIO, {"recamaras_min": 3})

    def test_colonia_en_lista(self):
        assert match_perfil(CAMBIO, {"colonias": ["del-valle", "narvarte"]})

    def test_colonia_fuera_de_lista(self):
        assert not match_perfil(CAMBIO, {"colonias": ["polanco"]})

    def test_colonia_tolerante_acentos_y_mayusculas(self):
        c = dict(CAMBIO, colonia="Nápoles")
        assert match_perfil(c, {"colonias": ["napoles"]})
        assert match_perfil(c, {"colonias": ["NÁPOLES"]})

    def test_zonas_cuenta_como_colonias(self):
        assert match_perfil(CAMBIO, {"zonas": ["narvarte"]})

    def test_sin_lista_de_colonias_no_restringe(self):
        assert match_perfil(CAMBIO, {"presupuesto_max": 5_000_000, "colonias": []})

    def test_perfil_vacio_no_matchea(self):
        # sin ningún criterio no hay nada que cuadrar → no se spamea a todos
        assert not match_perfil(CAMBIO, {})
        assert not match_perfil(CAMBIO, {"colonias": [], "presupuesto_max": None, "recamaras_min": 0})

    def test_cambio_sin_precio_no_descarta(self):
        c = dict(CAMBIO, precio=None)
        assert match_perfil(c, {"presupuesto_max": 1_000_000})

    def test_cambio_sin_recamaras_no_descarta(self):
        c = dict(CAMBIO, recamaras=None)
        assert match_perfil(c, {"recamaras_min": 3})

    def test_cambio_sin_colonia_con_lista_si_descarta(self):
        # mejor callar que avisar de la zona equivocada
        c = dict(CAMBIO, colonia=None)
        assert not match_perfil(c, {"colonias": ["narvarte"]})

    def test_datos_ilegibles_no_truenan(self):
        c = dict(CAMBIO, precio="cuatro millones", recamaras="dos")
        assert match_perfil(c, {"presupuesto_max": 1, "recamaras_min": 9})

    def test_entradas_no_dict(self):
        assert not match_perfil(None, {"presupuesto_max": 1})
        assert not match_perfil(CAMBIO, None)


# ─── 2) compradores_para — fuentes reales + dedup + prioridad ────────────────

async def _seed_perfiles(db):
    await db.buyer_favoritos.insert_many([
        {"visitor_id": "v_fav", "dev_id": "avalia", "lead_id": "L_fav", "status": "activo"},
        {"visitor_id": "v_desc", "dev_id": "avalia", "status": "descartado"},   # descartado fuera
        {"visitor_id": "v_otro", "dev_id": "otro-dev"},                          # otro dev fuera
    ])
    await db.buyer_signals.insert_many([
        {"visitor_id": "v_unit", "entity_id": "avalia", "type": "unit_save", "unit_number": "B-204", "active": True},
        {"visitor_id": "v_radar", "entity_id": "avalia", "type": "like", "active": True},
        {"visitor_id": "v_fav", "entity_id": "avalia", "type": "save", "active": True},  # dup con favorito
        {"visitor_id": "v_off", "entity_id": "avalia", "type": "like", "active": False},  # inactiva fuera
    ])
    await db.marketplace_searches.insert_many([
        {"visitor_id": "v_busq", "lead_id": "L_busq", "alert": True,
         "colonias": ["narvarte"], "precio_max": 4_500_000, "recamaras_min": 2},
        {"visitor_id": "v_caro", "alert": True, "colonias": ["narvarte"], "precio_max": 2_000_000},  # no alcanza
        {"visitor_id": "v_sat", "alert": True, "satisfecha": True, "colonias": ["narvarte"]},        # satisfecha fuera
        {"visitor_id": "v_noal", "alert": False, "colonias": ["narvarte"]},                           # sin alerta fuera
    ])
    await db.saved_searches.insert_many([
        {"search_id": "ss1", "email": "ana@mail.com", "confirmed": True,
         "filters": {"colonia": "narvarte", "max_price": 4_400_000, "beds": 2}},
        {"search_id": "ss2", "email": "noconf@mail.com", "confirmed": False,
         "filters": {"colonia": "narvarte"}},                                                        # sin confirmar fuera
    ])
    await db.asesor_busquedas.insert_many([
        {"id": "bq1", "contacto_id": "C1", "owner_id": "asesor_1", "stage": "buscando",
         "colonias": ["narvarte"], "precio_max": 4_300_000, "recamaras_min": 2},
        {"id": "bq2", "contacto_id": "C2", "owner_id": "asesor_2", "stage": "perdida",
         "colonias": ["narvarte"], "precio_max": 9_000_000},                                          # cerrada fuera
    ])


@pytest.mark.asyncio
async def test_compradores_para_junta_todas_las_fuentes(db):
    await _seed_perfiles(db)
    out = await A.compradores_para(db, dict(CAMBIO, unit_number="B-204"))
    by_id = {(m.get("visitor_id") or m.get("contacto_id") or m.get("email")): m for m in out}

    assert by_id["v_fav"]["via"] == "favorito_directo"           # ♥ directo (gana al save dup)
    assert by_id["v_unit"]["via"] == "favorito_directo"          # vigila la unidad
    assert by_id["v_unit"].get("unidad_exacta") is True          # exactamente B-204
    assert by_id["v_busq"]["via"] == "busqueda_guardada"
    assert by_id["ana@mail.com"]["fuente"] == "saved_searches"
    assert by_id["C1"]["via"] == "lead_preferencias"
    assert by_id["C1"]["asesor_id"] == "asesor_1"                # el asesor viene pegado
    assert by_id["v_radar"]["via"] == "radar"

    # excluidos: descartado, otro dev, inactivo, caro, satisfecha, sin alerta, sin confirmar, cerrada
    for ausente in ("v_desc", "v_otro", "v_off", "v_caro", "v_sat", "v_noal", "noconf@mail.com", "C2"):
        assert ausente not in by_id
    # orden por prioridad: favoritos directos primero, radar al final
    assert out[0]["via"] == "favorito_directo"
    assert out[-1]["via"] == "radar"


@pytest.mark.asyncio
async def test_compradores_para_colecciones_vacias_no_inventa(db):
    out = await A.compradores_para(db, dict(CAMBIO))
    assert out == []


# ─── 3) alertar_oportunidad — flujo completo con mocks ───────────────────────

async def _seed_unidad(db):
    await db.units.insert_one({
        "id": "u_b204", "development_id": "avalia", "unit_number": "B-204",
        "bedrooms": 2, "m2_total": 68.0, "price": 4_150_000, "price_mxn": 4_150_000,
        "status": "disponible",
    })
    await db.developments.insert_one({"id": "avalia", "name": "Avalia", "colonia": "narvarte"})


def _capture_emit(monkeypatch):
    import notifications_engine as NE
    sent = []

    async def _fake_emit(db, **kw):
        sent.append(kw)
        return f"notif_{len(sent)}"

    monkeypatch.setattr(NE, "emit_notification", _fake_emit)
    return sent


@pytest.mark.asyncio
async def test_alertar_notifica_asesor_y_registra(db, monkeypatch):
    """Caso real Avalia B-204: bajó -3.4% → el lead con asesor dispara notificación AL ASESOR
    (nunca al comprador) y TODO match queda en oportunidades_detectadas atendida:false."""
    sent = _capture_emit(monkeypatch)
    await _seed_unidad(db)
    # favorito directo de un lead CON asesor asignado + una búsqueda anónima (sin asesor)
    await db.buyer_favoritos.insert_one({"visitor_id": "v1", "dev_id": "avalia", "lead_id": "L1"})
    await db.leads.insert_one({"id": "L1", "assigned_to": "asesor_9", "status": "buscando"})
    await db.marketplace_searches.insert_one(
        {"visitor_id": "v_anon", "alert": True, "colonias": ["narvarte"], "precio_max": 4_500_000})

    res = await A.alertar_oportunidad(db, "u_b204", "bajo_precio", 4_296_000, 4_150_000)

    assert res["ok"] and res["compradores"] == 2
    assert res["notificados"] == 1 and res["registrados"] == 2

    # notificación: al ASESOR, tipo price-drop, con el dato del cambio
    assert len(sent) == 1
    assert sent[0]["user_id"] == "asesor_9"
    assert sent[0]["type"] == "comparable_price_drop"
    assert "-3.4%" in sent[0]["body"]

    docs = [d async for d in db.oportunidades_detectadas.find({}, {"_id": 0})]
    assert len(docs) == 2
    assert all(d["atendida"] is False for d in docs)
    canales = {(d["comprador"].get("visitor_id")): d["canal"] for d in docs}
    assert canales["v1"] == "notificacion_asesor"       # con asesor → notificado
    assert canales["v_anon"] == "bandeja_asesor"        # sin asesor → solo bandeja
    d1 = next(d for d in docs if d["comprador"].get("visitor_id") == "v1")
    assert d1["asesor_id"] == "asesor_9"
    assert d1["unit"]["unit_number"] == "B-204" and d1["unit"]["dev_name"] == "Avalia"
    assert d1["cambio"] == {"tipo": "bajo_precio", "antes": 4_296_000, "ahora": 4_150_000, "pct": -3.4}


@pytest.mark.asyncio
async def test_alertar_es_idempotente(db, monkeypatch):
    """Correr dos veces el mismo cambio NO duplica registros (dedup como la casamentera)."""
    _capture_emit(monkeypatch)
    await _seed_unidad(db)
    await db.buyer_favoritos.insert_one({"visitor_id": "v1", "dev_id": "avalia"})

    r1 = await A.alertar_oportunidad(db, "u_b204", "bajo_precio", 4_296_000, 4_150_000)
    r2 = await A.alertar_oportunidad(db, "u_b204", "bajo_precio", 4_296_000, 4_150_000)

    assert r1["registrados"] == 1 and r2["registrados"] == 0
    assert await db.oportunidades_detectadas.count_documents({}) == 1


@pytest.mark.asyncio
async def test_alertar_volvio_disponible_usa_precio_de_la_unidad(db, monkeypatch):
    """El otro cambio del caso real: apartada → disponible. El match usa el precio REAL de la unidad."""
    sent = _capture_emit(monkeypatch)
    await _seed_unidad(db)
    # el perfil solo alcanza si se usa el precio de la unidad (status no es número)
    await db.asesor_busquedas.insert_one(
        {"id": "bq1", "contacto_id": "C1", "owner_id": "asesor_1", "stage": "buscando",
         "colonias": ["narvarte"], "precio_max": 4_200_000})

    res = await A.alertar_oportunidad(db, "u_b204", "volvio_disponible", "reservado", "disponible")

    assert res["compradores"] == 1 and res["notificados"] == 1
    assert sent[0]["user_id"] == "asesor_1"             # owner del perfil = asesor directo
    assert sent[0]["type"] == "generic"
    assert "disponible" in sent[0]["title"].lower()


@pytest.mark.asyncio
async def test_alertar_unidad_inexistente_no_truena(db, monkeypatch):
    _capture_emit(monkeypatch)
    res = await A.alertar_oportunidad(db, "no-existe", "bajo_precio", 1, 2)
    assert res["ok"] is False and res["razon"] == "unidad_no_encontrada"
    assert res["compradores"] == 0


# ─── 4) Endpoint bandeja — scope del asesor ──────────────────────────────────

def _patch_auth(monkeypatch, user_id, role="advisor"):
    import routes.advisor as ADV

    async def _fake(request):
        return types.SimpleNamespace(role=role, user_id=user_id)

    monkeypatch.setattr(ADV, "require_advisor", _fake)


async def _seed_bandeja(db):
    await db.oportunidades_detectadas.insert_many([
        {"id": "o1", "asesor_id": "asr_A", "atendida": False, "ts": "2026-07-17T10:00:00+00:00",
         "unit": {"dev_id": "avalia"}, "cambio": {"tipo": "bajo_precio"}, "comprador": {"via": "favorito_directo"}},
        {"id": "o2", "asesor_id": None, "atendida": False, "ts": "2026-07-17T12:00:00+00:00",
         "unit": {"dev_id": "avalia"}, "cambio": {"tipo": "volvio_disponible"}, "comprador": {"via": "radar"}},
        {"id": "o3", "asesor_id": "asr_B", "atendida": True, "ts": "2026-07-17T11:00:00+00:00",
         "unit": {"dev_id": "otro"}, "cambio": {"tipo": "bajo_precio"}, "comprador": {"via": "busqueda_guardada"}},
    ])


@pytest.mark.asyncio
async def test_bandeja_scope_del_asesor(db, monkeypatch):
    await _seed_bandeja(db)
    _patch_auth(monkeypatch, "asr_A")
    out = await A.oportunidades_mercado(_req(db))
    ids = [o["id"] for o in out["oportunidades"]]
    assert ids == ["o2", "o1"]                  # suyas + sin asesor · más recientes primero
    assert "o3" not in ids                      # la de OTRO asesor jamás se ve
    assert out["total"] == 2 and out["pendientes"] == 2


@pytest.mark.asyncio
async def test_bandeja_superadmin_ve_todo(db, monkeypatch):
    await _seed_bandeja(db)
    _patch_auth(monkeypatch, "root", role="superadmin")
    out = await A.oportunidades_mercado(_req(db))
    assert [o["id"] for o in out["oportunidades"]] == ["o2", "o3", "o1"]


@pytest.mark.asyncio
async def test_bandeja_solo_pendientes(db, monkeypatch):
    await _seed_bandeja(db)
    _patch_auth(monkeypatch, "asr_B")
    out = await A.oportunidades_mercado(_req(db), solo_pendientes=True)
    assert [o["id"] for o in out["oportunidades"]] == ["o2"]    # la atendida (o3) ya no estorba
