"""Forense de listas: los 3 fraudes silenciosos, con sus casos reales como fixture
cuando el PDF existe en la máquina (Downloads) y sintéticos siempre."""
import os
import pytest
from lista_forense import _es_entrelazado, renglones_fantasma, unidades_sombreadas

_JAI = ('/Users/manuelacosta/Downloads/DESARROLLOS-CLASS/Jai Reforma 36 - Inversionistas '
        'AirBnb Col Juarez - PREVENTA/DISPONIBILIDAD Y PRECIOS/VP_Lista_de_Precios Jai reforma SF.pdf')
_DESSEA = ('/Users/manuelacosta/Downloads/DESARROLLOS-CLASS/Dessea Interlomas - ENTREGA '
           'INMEDIATA/DISPONIBILIDAD Y PRECIOS/VP_Lista_de_Precios Dessea 2 SF.pdf')
_ROMA = ('/Users/manuelacosta/Downloads/CLIENTES-EXTERNOS/UNICO-ROMA-DRIVE/'
         'LISTA DE PRECIOS/UNICO ROMA_LP.pdf')


def test_entrelazado_detecta_texto_zipeado():
    # tokens REALES de la fila Jai 25L tapada por el banner (leídos 07-17); basta con
    # que ALGUNOS de la fila disparen — 'D25ELPTO' solo alterna 2 veces y se tolera
    assert _es_entrelazado("4,7P9R3,E3C00IO.00")
    assert _es_entrelazado("HAB3I9T.3A1BLES")
    assert _es_entrelazado("T4O1T.2A4LES")
    # tokens normales de lista jamás disparan
    for t in ("A-204", "PH03", "25K", "Depto.", "4,793,300.00", "TORRE", "2-"):
        assert not _es_entrelazado(t), t


@pytest.mark.skipif(not os.path.exists(_JAI), reason="PDF real no está en esta máquina")
def test_jai_dispara_entrelazado():
    f = renglones_fantasma(open(_JAI, "rb").read())
    assert f["entrelazados"], "el banner encimado de Jai debe delatarse"


@pytest.mark.skipif(not os.path.exists(_ROMA), reason="PDF real no está en esta máquina")
def test_roma_reporta_los_8_renglones_omitidos():
    f = renglones_fantasma(open(_ROMA, "rb").read())
    assert f["omitidos"] == [5, 12, 13, 19, 25, 32, 36, 52]
    assert f["n_renglones"] == 68


@pytest.mark.skipif(not os.path.exists(_DESSEA), reason="PDF real no está en esta máquina")
def test_dessea_ph03_sombreada():
    assert "PH03" in unidades_sombreadas(open(_DESSEA, "rb").read())
