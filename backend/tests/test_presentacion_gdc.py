"""Presentación GDC: nivel de página/unidad + discrepancias documentadas (lista manda)."""
from presentacion_gdc import (deptos_de_pagina, discrepancias_presentacion,
                              nivel_de_pagina, nivel_de_unidad)


def test_deptos_de_pagina():
    # rango = unidades gemelas (mismo plano en pisos distintos)
    assert deptos_de_pagina("Depto 201 - 301 Gutiérrez Zamora 167") == ["201", "301"]
    assert deptos_de_pagina("Depto 103 Gutiérrez Zamora 167") == ["103"]
    assert deptos_de_pagina("Plantas Arquitectónicas") == []


def test_estatus_carpeta_manda_sobre_presentacion():
    # REGLA founder: la carpeta manda. Via está en 'entrega inmediata' aunque el deck
    # diga preventa → vale entrega inmediata.
    d = discrepancias_presentacion(
        {"estatus_presentacion": "preventa"},
        {"estatus_carpeta": "entrega inmediata"})
    est = next(h for h in d if h["campo"] == "estatus")
    assert est["resolucion"] == "carpeta_manda" and est["valor"] == "entrega inmediata"


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
    assert campos["estatus"]["resolucion"] == "carpeta_manda"
    # sin pelea → sin hallazgos
    assert discrepancias_presentacion(
        {"total_units_presentacion": 87}, {"total_units_lista": 87}) == []
