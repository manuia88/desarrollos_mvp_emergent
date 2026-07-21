"""Rediseño del parte 'para un niño de 5 años' (founder 07-20): traductor a lenguaje humano,
precio corto y el paginador que arregla el corte a media palabra del parte viejo."""
from parte_engine import _mm, _traducir_status, _paginar


def test_precio_corto():
    assert _mm(6064800) == "$6.06M"
    assert _mm(950000) == "$950,000"
    assert _mm(None) is None
    assert _mm("N/D") is None


def test_traductor_lenguaje_nino():
    assert _traducir_status("disponible", "vendido") == ("🏠", "se vendió")
    assert _traducir_status("reservado", "disponible") == ("🟢", "volvió a estar en venta")
    assert _traducir_status("disponible", "reservado") == ("🔴", "se apartó")
    assert _traducir_status("disponible", "no_disponible") == ("🔴", "se apartó")
    # desconocido: cae a la transición cruda, sin reventar
    ic, txt = _traducir_status("x", "y")
    assert ic == "•" and "x" in txt and "y" in txt


def test_paginar_nunca_corta_a_media_palabra():
    bloques = ["A" * 2000, "B" * 2000, "C" * 2000]
    texto = "\n\n".join(bloques)
    partes = _paginar(texto, tope=3800)
    assert len(partes) >= 2                       # no cabe en uno
    # cada parte respeta el tope y NO parte un bloque a la mitad
    for p in partes:
        assert len(p) <= 3800
    assert "".join(partes).count("A") == 2000     # el bloque A quedó íntegro
    assert all(set(b) <= {"A", "B", "C", "\n"} for b in partes)


def test_paginar_corto_es_un_solo_mensaje():
    assert len(_paginar("hola\n\nmundo", 3800)) == 1
