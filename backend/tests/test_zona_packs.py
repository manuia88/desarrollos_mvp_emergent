"""Packs de colonia (founder 07-17): agrupar sub-colonias en una zona para que /zona/juarez
encuentre 'juarez-cuauhtemoc' y Roma=Norte+Sur, Condesa=Condesa+Hipódromo, etc."""
from zona_packs import zona_base, misma_zona


def test_zona_base_quita_alcaldia_y_variantes():
    assert zona_base("roma-norte-cuauhtemoc") == "roma"
    assert zona_base("roma-sur-ii-cuauhtemoc") == "roma"
    assert zona_base("juarez-cuauhtemoc") == "juarez"
    assert zona_base("del-valle-centro-benito-juarez") == "del-valle"
    assert zona_base("san-rafael-i-cuauhtemoc") == "san-rafael"
    assert zona_base("napoles-ampl-benito-juarez") == "napoles"
    assert zona_base("santa-fe-alvaro-obregon") == "santa-fe"


def test_alias_hipodromo_es_condesa_y_veronica_es_anzures():
    assert zona_base("hipodromo-cuauhtemoc") == "condesa"
    assert zona_base("hipodromo-condesa-cuauhtemoc") == "condesa"
    assert zona_base("condesa-cuauhtemoc") == "condesa"
    assert zona_base("veronica-anzures-miguel-hidalgo") == "anzures"
    assert zona_base("anzures-miguel-hidalgo") == "anzures"


def test_misma_zona_agrupa_pero_no_sobre_agrupa():
    # /zona/juarez encuentra la colonia Juárez…
    assert misma_zona("juarez-cuauhtemoc", "juarez")
    # …pero NO las colonias de la alcaldía Benito Juárez (acacias, del-valle…)
    assert not misma_zona("acacias-benito-juarez", "juarez")
    assert not misma_zona("del-valle-centro-benito-juarez", "juarez")
    # slug largo o corto dan el mismo pack
    assert misma_zona("roma-sur-cuauhtemoc", "roma-norte-cuauhtemoc")
    assert misma_zona("roma-sur-cuauhtemoc", "roma")
    # zonas distintas no se cruzan
    assert not misma_zona("roma-norte-cuauhtemoc", "condesa")
