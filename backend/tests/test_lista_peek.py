"""Lista peek: 'lista modificada' debe decir QUÉ se modificó. Parsers deterministas ($0,
sin IA) + diff puro. Caso real validado 07-17: Avalia Torre B — B 204 bajó -3.4% y volvió
a disponible; Torre A cambió el archivo pero no los datos."""
from lista_peek import (diff_unidades, es_cambio_real, lineas_de_cambios, norm_unidad,
                        unidades_de_texto)


def test_norm_unidad_unifica_plumas():
    assert norm_unidad("A-204") == norm_unidad("A 204") == norm_unidad("a204") == "A204"
    assert norm_unidad("Humbolt 201") == "HUMBOLT201"


def test_unidades_de_texto_lee_unidad_y_precio():
    texto = """LISTA DE PRECIOS JULIO
A-204   113 m2   $6,194,300   2 REC
A-305   84 m2    $4,850,000
B 101   VENDIDO
Estacionamiento: 2
"""
    u = unidades_de_texto(texto)
    assert u["A204"]["precio"] == 6194300 and u["A305"]["precio"] == 4850000
    # el m² (113) jamás se confunde con precio; VENDIDO se lee como status
    assert u["B101"]["precio"] is None and u["B101"]["status"] == "no_disponible"
    assert "ESTACIONAMIENTO2" not in u        # línea sin precio ni status no entra


def test_diff_unidades_cuenta_las_tres_cosas():
    base = {"A204": {"unidad": "A 204", "precio": 6194300, "status": "no_disponible"},
            "A305": {"unidad": "A 305", "precio": 4850000, "status": None},
            "A401": {"unidad": "A 401", "precio": 5000000, "status": None}}
    actual = {"A204": {"unidad": "A 204", "precio": 5981600, "status": None},
              "A305": {"unidad": "A 305", "precio": 4850000, "status": None},
              "A502": {"unidad": "A 502", "precio": 7000000, "status": None}}
    d = diff_unidades(base, actual)
    assert d["cambios_precio"] == [{"unidad": "A 204", "antes": 6194300, "ahora": 5981600}]
    assert d["cambios_status"] == [{"unidad": "A 204", "antes": "no_disponible",
                                    "ahora": "disponible"}]
    assert d["ya_no_estan"] == ["A 401"] and d["nuevas"] == ["A 502"]
    assert d["totales"]["antes"] == 3 and d["totales"]["ahora"] == 3


def test_lineas_de_cambios_hablan_humano():
    d = diff_unidades({"A204": {"unidad": "A 204", "precio": 6194300, "status": None}},
                      {"A204": {"unidad": "A 204", "precio": 5981600, "status": None}})
    d["base"] = "la versión anterior de la lista"
    ls = lineas_de_cambios(d)
    assert any("$6,194,300 → $5,981,600" in l and "-3.4%" in l for l in ls)
    assert any("comparado contra la versión anterior" in l for l in ls)


def test_sin_cambios_lo_dice_sin_alarmar():
    base = {"A1": {"unidad": "A1", "precio": 100_0000 * 5, "status": None}}
    d = diff_unidades(base, dict(base))
    d["base"] = "el catálogo"
    assert any("cambió el archivo, no los datos" in l for l in lineas_de_cambios(d))


def test_peek_fallido_avisa_honesto():
    assert any("no pude leer" in l for l in lineas_de_cambios(None))
    assert any("primera lectura" in l for l in
               lineas_de_cambios({"nota": "primera lectura: 9 unidades con precio — desde el "
                                          "próximo cambio te digo el diff exacto"}))


def test_es_cambio_real_distingue_accionable_de_no_op():
    """El partidor de la bandeja Telegram (07-22): cambio de datos = accionable; re-subida
    idéntica = no-op que se colapsa. Primera lectura cuenta como accionable (hay algo que ver)."""
    assert es_cambio_real({"cambios_precio": [{"unidad": "A1"}]}) is True
    assert es_cambio_real({"cambios_status": [{"unidad": "A1"}]}) is True
    assert es_cambio_real({"nuevas": ["B2"]}) is True
    assert es_cambio_real({"ya_no_estan": ["C3"]}) is True
    assert es_cambio_real({"nota": "primera lectura: 9 unidades con precio"}) is True
    # no-op: re-subida sin cambios de datos (mismos precios/estados, nada nuevo/ido)
    assert es_cambio_real({"cambios_precio": [], "cambios_status": [], "nuevas": [],
                           "ya_no_estan": [], "totales": {}}) is False
    assert es_cambio_real({}) is False
    assert es_cambio_real(None) is False
