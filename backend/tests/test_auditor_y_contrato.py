"""Auditor del Catálogo (reglas invariantes) + Contrato Marketplace (el match congelado).
Puro, sin Mongo. Si alguien rompe el vínculo interno→público, esto truena antes que el founder."""
import auditor_catalogo as AU
import marketplace_contract as MC


def _u(**kw):
    base = {"id": "u1", "unit_number": "A-101", "price_mxn": 5_000_000, "size_m2": 84.0,
            "m2_privative": 84.0, "bedrooms": 2, "bathrooms": 2.0, "status": "disponible",
            "prototype_id": "p0", "level": 1}
    base.update(kw)
    return base


def _ctx(units, moldes=None, **kw):
    ctx = {"units": units, "moldes": moldes or [], "programas": set(), "cotejo": None,
           "assets": [], "unidades_en_bitacora": {u["id"] for u in units}}
    ctx.update(kw)
    return ctx


# ═══ AUDITOR: las reglas cazan lo que cazó el founder (y lo que aún no) ════════
def test_regla_m2_coherencia_caza_el_caso_a1505():
    """130 habitables + 14.25 balcón ≠ 282.75 totales → alerta con el delta exacto."""
    u = _u(m2_privative=130.0, m2_balcony=14.25, m2_total=282.75)
    h = AU.r_m2_coherencia(u, {})
    assert h and h["severidad"] == "alerta" and "+138.5" in h["detalle"]
    # una unidad que SÍ cuadra no alerta
    assert AU.r_m2_coherencia(_u(m2_privative=84, m2_balcony=6, m2_total=90), {}) is None


def test_reglas_unidad_basicas():
    assert AU.r_campos_obligatorios(_u(bedrooms=None), {})["severidad"] == "error"
    assert AU.r_campos_obligatorios(_u(), {}) is None
    # $500/m² = precio o m² rotos
    assert AU.r_precio_rango(_u(price_mxn=42_000), {})["severidad"] == "error"
    assert AU.r_precio_rango(_u(), {}) is None
    assert AU.r_molde_asignado(_u(prototype_id=None), {}) is not None
    assert AU.r_estatus_valido(_u(status="quién sabe"), {}) is not None


def test_reglas_molde_y_desarrollo():
    m_agotado = {"prototype_id": "p0", "nombre": "2R", "estado": "agotado"}
    ctx = _ctx([_u()], [m_agotado])
    assert AU.r_molde_estado_coherente(m_agotado, ctx)["severidad"] == "error"
    # duplicados de número de unidad
    d = {"id": "dev1", "name": "Alba"}
    ctx2 = _ctx([_u(), _u(id="u2")])          # mismo unit_number A-101
    assert AU.r_duplicados(d, ctx2)["severidad"] == "error"
    # price_from desalineado
    assert AU.r_price_from({"id": "dev1", "name": "Alba", "price_from": 9_999_999},
                           _ctx([_u()]))["severidad"] == "alerta"
    # bitácora incompleta
    ctx3 = _ctx([_u()]); ctx3["unidades_en_bitacora"] = set()
    assert AU.r_bitacora_cubre(d, ctx3)["severidad"] == "alerta"
    # sin dueño
    assert AU.r_dueno({"id": "dev1", "name": "Alba"}, _ctx([_u()]))["severidad"] == "error"


def test_auditar_desarrollo_puro_ancla_al_atomo():
    d = {"id": "dev1", "name": "Alba", "developer_id": "org1", "price_from": 5_000_000}
    hs = AU.auditar_desarrollo_puro(d, _ctx([_u(m2_total=282.75, m2_privative=130.0)]))
    m2h = next(h for h in hs if h["regla"] == "m2_coherencia")
    assert m2h["unit_id"] == "u1" and m2h["development_id"] == "dev1"   # el átomo exacto
    r = AU.resumen_hallazgos(hs)
    assert r["alerta"] >= 1
    # una regla que truena NO tira la auditoría (fail-soft probado)
    hs2 = AU.auditar_desarrollo_puro(d, {"units": [None], "moldes": [],
                                         "programas": set(), "cotejo": None, "assets": [],
                                         "unidades_en_bitacora": set()})
    assert isinstance(hs2, list)


# ═══ CONTRATO MARKETPLACE: el match interno→público, garantizado ═══════════════
def test_contrato_tarjeta_lleva_todo_el_atomo_publico():
    u = _u(orientacion="poniente", vista="parque", plano_url="/api/assets-static/x.jpg",
           m2_terrace=9.5, patio_m2=0, parking_spots=2, parking_type="techado",
           bodega="B-12", amueblado="si", price_display="$5,000,000")
    card = MC.tarjeta_publica_unidad(u)
    assert card["orientation"] == "poniente" and card["vista"] == "parque"
    assert card["plano_url"] == "/api/assets-static/x.jpg"
    assert card["m2_terrace"] == 9.5 and card["bodega"] == "B-12"
    assert card["price"] == 5_000_000 and card["prototype_id"] == "p0"
    # el verificador confirma CERO violaciones en la tarjeta canónica
    assert MC.violaciones_contrato(u, card) == []


def test_contrato_caza_campo_roto_y_fuga_interna():
    u = _u(orientacion="norte")
    card = MC.tarjeta_publica_unidad(u)
    # 1) alguien "arregla" la tarjeta y rompe el mapeo → el verificador lo caza
    rota = {**card, "orientation": None}
    assert any("orientation" in v for v in MC.violaciones_contrato(u, rota))
    # 2) alguien filtra un campo INTERNO al público → también
    fuga = {**card, "notas": "el dev acepta 10% de descuento si..."}
    assert any("INTERNO" in v for v in MC.violaciones_contrato(u, fuga))


def test_contrato_nunca_publico_es_disjunto_del_contrato():
    """Nadie puede poner un campo prohibido en el contrato sin que truene aquí."""
    publicos = {campo for campo, _ in MC.CONTRATO_UNIDAD}
    assert not (publicos & MC.NUNCA_PUBLICO)
