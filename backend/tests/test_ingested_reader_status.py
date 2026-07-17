"""Bug 07-17 (lo cazó la 2ª auditoría de flujos): Dessea 804 estaba 'bloqueado' en la BD
pero la API pública la servía 'disponible' — el mapa de status no conocía 'bloqueado' y el
default mandaba TODO lo desconocido a disponible. Regla: fail-visible, nunca vender fantasmas."""
from ingested_reader import normalize_unit


def _st(status):
    return normalize_unit({"unit_number": "804", "status": status})["status"]


def test_bloqueado_no_se_vuelve_disponible():
    assert _st("bloqueado") == "bloqueado"
    assert _st("bloqueada") == "bloqueado"
    assert _st("blocked") == "bloqueado"


def test_generos_y_sinonimos():
    assert _st("apartada") == _st("apartado") == _st("reserved") == "reservado"
    assert _st("vendida") == _st("sold") == "vendido"
    assert _st("no_disponible") == _st("no disponible") == "no_disponible"


def test_vacio_es_oferta_viva_pero_desconocido_no_se_traduce():
    assert _st("") == "disponible" and _st(None) == "disponible"
    # un status raro se conserva tal cual: que se note en la ficha, no que se venda
    assert _st("en litigio") == "en litigio"
