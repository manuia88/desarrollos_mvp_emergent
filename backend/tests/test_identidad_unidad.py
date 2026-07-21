"""Identidad canónica de unidad (Palanca 1c, auditoría 07-20). El fix de torres-nombre:
'Humbolt 201' y 'Madison 201' ya NO colapsan a '201' (resolvió 152 colisiones reales)."""
from identidad_unidad import norm_unidad


def test_torres_con_nombre_palabra_no_colapsan():
    assert norm_unidad("Humbolt 201") == "HUMBOLT-201"
    assert norm_unidad("Madison 201") == "MADISON-201"
    assert norm_unidad("Humbolt 201") != norm_unidad("Madison 201")   # el bug


def test_regresion_patrones_previos_intactos():
    assert norm_unidad("A-107") == "A-107"
    assert norm_unidad("B 304") == "B-304"
    assert norm_unidad("T2-1901") == "T2-1901"
    assert norm_unidad("1901") == "1901"
    assert norm_unidad("201") == "201"
    assert norm_unidad("PH 1201") == "PH-1201"


def test_acentos_y_espacios():
    assert norm_unidad("  a-107 ") == "A-107"
    assert norm_unidad("Ático 305") == "ATICO-305"     # normaliza acento + torre-palabra
