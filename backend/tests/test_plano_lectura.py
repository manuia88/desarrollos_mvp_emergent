"""Lectura del área del plano para el cotejo (2ª fuente) — conservadora por diseño."""
from plano_lectura import area_que_confirma, leer_area_plano, numeros_plausibles_m2


def test_numeros_plausibles_solo_rango_m2():
    t = "HORTENSIA 122 AREA HABITABLE 60.22 TOTAL 120.44 pasillo 1.55 x 4.93 CP 06400"
    nums = numeros_plausibles_m2(t)
    assert 60.22 in nums and 120.44 in nums
    assert 1.55 not in nums            # muy chico (cota, no m² de depto)
    assert 6400 not in numeros_plausibles_m2("CP 06400")   # entero, no decimal m²


def test_area_confirma_solo_si_coincide_con_lista():
    areas = [60.22, 120.44, 45.0]
    # la lista dice 60.2 → el plano lo confirma con 60.22 (±5%)
    assert area_que_confirma(areas, 60.2) == 60.22
    # la lista dice 200 → el plano NO lo confirma → None (sin falsa contradicción)
    assert area_que_confirma(areas, 200.0) is None
    assert area_que_confirma([], 60.0) is None
    assert area_que_confirma([60.0], None) is None


def test_lectura_sucia_no_inventa():
    """Texto revuelto/sin el área → None (el molde queda 1-fuente, honesto)."""
    assert leer_area_plano("RECAMARA RECAMARA RECAMARA sin numeros utiles", 80.0) is None
    # aunque haya muchos números, solo confirma el que casa con la lista
    assert leer_area_plano("31.2 44.9 79.05 210.5", 79.0) == 79.05


def test_elige_el_mas_cercano():
    # dos números caen en tolerancia → gana el más cercano al de la lista
    assert area_que_confirma([78.5, 79.05], 79.0) == 79.05
