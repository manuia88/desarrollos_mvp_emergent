"""La ficha no debe marcar FALTA lo que SÍ está en las fuentes (incidente 07-16).

El masivo guarda precios/pagos/amenidades EN las unidades y el Maestro; la ficha
los lee del doc del dev. project_readiness ahora deriva de la fuente de verdad.
"""
from routes.dev_project_full import project_readiness


def _full(**over):
    base = {
        "nombre": "X", "price_from": 4_000_000,
        "ubicacion": {"lat": 19.4, "colonia": "Roma"},
        "amenidades": {"amenities": ["gym"], "confirmado_ninguna": False, "servicios": {}},
        "pagos": {"schemes": [{"nombre": "Según lista"}]},
        "construccion": {"overall_percent": 100, "sistema_constructivo": {}},
        "comercializacion": {"configured": True},
        "contenido": {"photos": 5, "assets": 5}, "legal": {"docs": 0, "estado": "sin"},
    }
    base.update(over)
    return base


def _falta(full):
    return {m["label"] for m in project_readiness(full)["missing"]}


def test_price_from_derivado_no_es_falta():
    # con precio (aunque venga de unidades) → Datos básicos NO falta
    assert "Datos básicos" not in _falta(_full(price_from=4_000_000))
    assert "Datos básicos" in _falta(_full(price_from=None))


def test_forma_de_pago_desde_desglose_por_unidad():
    # la lista trae crédito/enganche por unidad → un scheme derivado basta
    assert "Formas de pago" not in _falta(_full(pagos={"schemes": [{"nombre": "Según lista"}]}))
    assert "Formas de pago" in _falta(_full(pagos={"schemes": []}))


def test_amenidades_pocas_o_confirmado_ninguna_no_es_falta():
    # 1 amenidad del Maestro = completo (FALTA≠CERO)
    assert "Amenidades" not in _falta(_full(amenidades={"amenities": ["roof"], "confirmado_ninguna": False}))
    # "SIN AMENIDADES" confirmado = respondido, no FALTA
    assert "Amenidades" not in _falta(_full(amenidades={"amenities": [], "confirmado_ninguna": True}))
    # sin lista Y sin confirmar = sí falta
    assert "Amenidades" in _falta(_full(amenidades={"amenities": [], "confirmado_ninguna": False}))


def test_avance_entrega_inmediata_no_es_falta():
    # entrega inmediata = 100% construido → Avance de obra NO falta
    assert "Avance de obra" not in _falta(_full(construccion={"overall_percent": 100, "sistema_constructivo": {}}))
    # preventa sin avance = sí falta (genuino)
    assert "Avance de obra" in _falta(_full(construccion={"overall_percent": None, "sistema_constructivo": {}}))
