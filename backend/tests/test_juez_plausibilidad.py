"""Capa 0 del juez: PLAUSIBILIDAD — corre siempre, con o sin maestro, sobre TODAS las
unidades (no muestral). Lección 07-16: 'Lock-Off 1 rec o 2 lofts' llegó como 12 recámaras
a la ficha porque rec/baños solo se juzgaban contra el Excel maestro (GDC no tiene) y la
verificación comparaba plataforma vs extracción — consistente pero irreal."""
from juez_automatico import implausible, implausibles_de_unidades, juzgar_campos


def test_implausible_por_campo():
    assert implausible("bedrooms", 12) is True          # bug real Casa Roma 179
    assert implausible("bedrooms", 122) is True         # bug real 802 PH
    assert implausible("bathrooms", 12) is True
    assert implausible("bedrooms", 3) is False
    assert implausible("bathrooms", 2.5) is False
    assert implausible("bathrooms", 0.5) is False       # medio baño existe
    assert implausible("m2_total", 5) is True           # no existe depto de 5 m²
    assert implausible("m2_total", 1200) is True
    assert implausible("price_mxn", 50_000) is True     # precio imposible
    assert implausible("price_mxn", 8_000_000) is False
    assert implausible("bedrooms", None) is False       # sin dato no opina
    assert implausible("vista", "parque") is False      # campo sin cota no opina


def test_barrido_completo_no_muestral():
    units = [
        {"unit_number": "201", "bedrooms": 12, "bathrooms": 12, "m2_total": 45},
        {"unit_number": "202", "bedrooms": 1, "bathrooms": 1, "m2_total": 46},
    ]
    imp = implausibles_de_unidades(units)
    assert {(i["unidad"], i["campo"]) for i in imp} == {("201", "bedrooms"), ("201", "bathrooms")}


def test_implausible_tumba_el_gate_aunque_la_fuente_coincida():
    # la 'fuente' también dice 12 (garbage in): antes pasaba callado, ahora IMPLAUSIBLE
    muestra = [{"unidad": "201", "campo": "bedrooms", "valor": 12.0}]
    v = juzgar_campos(muestra, texto_pdf=["201 12 12 45 56"], filas_excel={})
    assert v["detalles"][0]["veredicto"] == "IMPLAUSIBLE"
    assert v["gate_98"] is False
