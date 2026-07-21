"""Palanca 3 (auditoría 07-20): el ciclo del Vigía. Clasificador de listas UNIVERSAL (GDC
'_LP.pdf' dejó de ser invisible) + aprende 'VENDIDO' de la lista (no lo degrada a reservado)."""
from lista_apply import _status_lista
from vigia_engine import _es_lista

MIME = "application/pdf"


def test_clasificador_universal_caza_lp_y_vp():
    # GDC nombra '<PROYECTO>_LP.pdf' (antes invisible); CLASS nombra 'VP_Lista' (ya se veía)
    assert _es_lista("ALTAVISTA_LP.pdf", MIME) is True
    assert _es_lista("Comunal_LP.pdf", MIME) is True
    assert _es_lista("VP_Lista_de_Precios X.pdf", MIME) is True
    assert _es_lista("Cotizador.pdf", MIME) is True


def test_clasificador_no_confunde_otros_docs():
    assert _es_lista("Brochure Nupol.pdf", MIME) is False
    assert _es_lista("Planos Torre A.pdf", MIME) is False
    assert _es_lista("render_fachada.jpg", "image/jpeg") is False


def test_aprende_vendido_de_la_lista():
    assert _status_lista("VENDIDO") == "vendido"
    assert _status_lista("sold") == "vendido"
    assert _status_lista("apartado") == "reservado"
    assert _status_lista("no_disponible") == "reservado"
    assert _status_lista("Disponible") == "disponible"
    assert _status_lista("cualquier cosa") is None
