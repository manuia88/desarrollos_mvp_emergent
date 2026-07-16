"""Presentación GDC: nivel de página/unidad + discrepancias documentadas (lista manda)."""
from presentacion_gdc import (discrepancias_presentacion, nivel_de_pagina,
                              nivel_de_unidad)


def test_nivel_de_pagina():
    assert nivel_de_pagina("Nivel 4") == 4
    assert nivel_de_pagina("Nivel 1 - PA") == 1
    assert nivel_de_pagina("Casa Condesa Vasconcelos 107") is None
    assert nivel_de_pagina("") is None


def test_nivel_de_unidad():
    assert nivel_de_unidad("402") == 4          # dígitos de piso
    assert nivel_de_unidad("1201") == 12
    assert nivel_de_unidad("101", level=1) == 1  # el campo level manda
    assert nivel_de_unidad("PH", level=None) is None
    assert nivel_de_unidad("Local 3") is None    # <3 dígitos → sin nivel claro


def test_discrepancias_lista_manda():
    # la presentación anuncia 103, la lista tiene 87 → documentado, la lista manda
    d = discrepancias_presentacion(
        {"total_units_presentacion": 103, "estatus_presentacion": "preventa"},
        {"total_units_lista": 87, "estatus_carpeta": "entrega inmediata"})
    campos = {h["campo"]: h for h in d}
    assert campos["total_units"]["resolucion"] == "lista"
    assert campos["estatus"]["resolucion"] == "verificar_carpeta"
    # sin pelea → sin hallazgos
    assert discrepancias_presentacion(
        {"total_units_presentacion": 87}, {"total_units_lista": 87}) == []
