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


def test_regla_alias_invisible_caza_direccion_perdida():
    """El caso founder 07-15: address lleno, address_full vacío → la ficha decía FALTA."""
    d = {"id": "dev1", "name": "Alba", "address": "Cam. Real de Minas 7"}
    h = AU.r_alias_invisible(d, {})
    assert h and h["canonico"] == "address_full" and h["alias"] == "address"
    # con el canónico lleno, silencio
    assert AU.r_alias_invisible({"id": "d", "address_full": "x", "address": "x"}, {}) is None


def test_regla_dev_basicos():
    d = {"id": "dev1", "name": "Alba"}
    h = AU.r_dev_basicos(d, _ctx([_u()]))
    assert h and "address_full" in h["faltan"]
    completo = {"id": "d", "address_full": "x", "description": "y",
                "delivery_estimate": "z"}
    assert AU.r_dev_basicos(completo, _ctx([_u()])) is None


# ═══ EL PORTÓN (pre-auditoría del lote) + LA LISTA DE PEDIDOS ══════════════════
def test_pre_auditoria_caza_el_lote_roto_antes_de_aprobar():
    extracted = {"project_name": "Torre X", "units": [
        {"unit_number": "A-101", "price_mxn": 5_000_000, "size_m2": 84.0,
         "m2_interior": 84.0, "m2_total": 90.0, "m2_balcony": 6.0,
         "bedrooms": 2, "bathrooms": 2, "status": "disponible"},
        # el A-1505 del futuro: sin recámaras y con m² fantasma
        {"unit_number": "PH-1", "price_mxn": 11_000_000, "size_m2": 130.0,
         "m2_interior": 130.0, "m2_total": 282.0, "m2_balcony": 14.0,
         "status": "disponible", "campo_marciano": "??"},
    ]}
    pre = AU.pre_auditar_extraccion(extracted)
    reglas = {h["regla"] for h in pre["hallazgos"]}
    assert "m2_coherencia" in reglas          # los m² fantasma, ANTES del clic
    assert "campos_obligatorios" in reglas    # el PH sin recámaras, ANTES del clic
    assert "campos_sin_colocar" in reglas     # L21: 'campo_marciano' capturado sin lugar
    assert pre["resumen"]["error"] >= 1
    assert any("roof" in p for p in pre["preguntas_al_dev"])   # pregunta ya redactada
    # un lote limpio pasa en silencio
    limpio = {"units": [{"unit_number": "B-1", "price_mxn": 5_000_000, "size_m2": 80.0,
                         "m2_interior": 80.0, "m2_total": 80.0, "bedrooms": 2,
                         "bathrooms": 2, "status": "disponible"}]}
    assert AU.pre_auditar_extraccion(limpio)["resumen"] == {"error": 0, "alerta": 0,
                                                            "aviso": 0}


def test_lista_pedidos_redacta_y_al_dia():
    from lista_pedidos import armar_pedido
    p = armar_pedido("CLASS", ["Servicios (gas/agua/luz)"],
                     ["¿El piso 15 tiene roof privado?"],
                     [{"etiqueta": "3R·113", "fuentes": {"lista": 3, "plano": 2},
                       "nota": "posible FLEX"}],
                     [{"campo": "orientacion", "etiqueta": "orientación", "n": 80}])
    assert p["n_puntos"] == 4 and not p["al_dia"]
    assert "Hola equipo CLASS" in p["texto"] and "roof privado" in p["texto"]
    assert "posible FLEX" in p["texto"] and "80 unidades" in p["texto"]
    # dev al día = pedido vacío, sin texto fantasma
    ok = armar_pedido("CLASS", [], [], [], [])
    assert ok["al_dia"] and ok["texto"] == "" and ok["n_puntos"] == 0


# ═══ PERFIL DEL DEV + CLASIFICADORES DEL VIGÍA (los puntos ciegos, cerrados) ═══
def test_etapa_y_tipo_doc_desde_nombres():
    from vigia_engine import etapa_de_nombre, clasificar_documento
    assert etapa_de_nombre("Cordobanes - ENTREGA INMEDIATA Polanco") == "entrega_inmediata"
    assert etapa_de_nombre("NUA Interlomas - Preventa") == "preventa"
    assert etapa_de_nombre("Jai Reforma 36 - Inversion") == "inversion"
    assert etapa_de_nombre("RENTAS INTERLOMAS") == "rentas"
    assert etapa_de_nombre("Carpeta X") is None
    assert clasificar_documento("Lista de Acabados.pdf") == "acabados"
    assert clasificar_documento("VP_Lista_de_Precios NUA T1 SF.pdf") == "lista_precios"
    assert clasificar_documento("Reglamento de condominio.pdf") == "reglamento"


def test_radar_drive_marca_ingeridos_y_etapas():
    from perfil_dev import radar_drive, agregados
    foto = {"proyectos": ["Almina San Angel - ENTREGA INMEDIATA", "NUA Interlomas - Preventa"],
            "archivos": [
                {"proyecto": "Almina San Angel - ENTREGA INMEDIATA", "es_lista": True,
                 "tipo_doc": "lista_precios"},
                {"proyecto": "NUA Interlomas - Preventa", "es_lista": True,
                 "tipo_doc": "lista_precios"},
                {"proyecto": "NUA Interlomas - Preventa", "es_lista": False,
                 "tipo_doc": "acabados"}]}
    r = radar_drive(foto, ["Almina San Ángel"])
    alm = next(p for p in r if "Almina" in p["proyecto"])
    nua = next(p for p in r if "NUA" in p["proyecto"])
    assert alm["ingerido"] and alm["etapa"] == "entrega_inmediata"
    assert not nua["ingerido"] and nua["documentos"].get("acabados") == 1
    ag = agregados(r)
    assert ag["sin_ingerir"] == 1 and ag["por_etapa"]["preventa"] == 1


def test_yield_bruto_rieles_de_renta():
    from molde_metrics import yield_bruto
    # sin rentas: None (no se inventa)
    assert yield_bruto([{"price_mxn": 5_000_000}]) is None
    # con renta: 25k×12 ÷ 5M = 6% bruto
    y = yield_bruto([{"price_mxn": 5_000_000, "renta_mxn": 25_000}])
    assert y["yield_bruto_pct"] == 6.0 and y["renta_prom"] == 25_000


def test_reglas_de_la_prueba_2proyectos():
    """Las 2 reglas que nacieron de la prueba NUA/Nupol (07-15)."""
    # crédito+enganche≠precio → error (columna corrida)
    u = _u(credito_mxn=4_000_000, enganche_mxn=500_000)   # 4.5M ≠ 5M
    assert AU.r_dinero_coherencia(u, {})["severidad"] == "error"
    assert AU.r_dinero_coherencia(_u(credito_mxn=4_000_000, enganche_mxn=1_000_000), {}) is None
    # el caso 516: más unidades vivas que el total declarado del edificio
    d = {"id": "d1", "name": "NUA", "total_units_project": 100}
    ctx = _ctx([_u(id=f"u{i}", unit_number=f"A-{i}") for i in range(120)])
    assert AU.r_total_edificio(d, ctx)["severidad"] == "error"
    assert AU.r_total_edificio({"id": "d", "total_units_project": 258}, _ctx([_u()])) is None
