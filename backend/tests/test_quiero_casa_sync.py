"""Vigía headless de Quiero Casa (Google Sheet público). Prueba lo puro: la llave estable por
SKU (sobrevive a que el dev renombre pestañas con emojis — el bug del 20-jul), la exclusión de
comerciales y el manejo multi-torre. El fetch/sincronizar viven en integración (red + BD)."""
from openpyxl import Workbook

import quiero_casa_sync as qc


def _ws(rows):
    wb = Workbook()
    ws = wb.active
    for r in rows:
        ws.append(r)
    return ws


HDR = ["Torre", "Nivel", "N° Depto", "SKU", "Estatus", "Rec", "Baños",
       "Estac", "m² Hab", "m² Total", "Balcón", "Terraza", "Roof Garden Priv", "Precio"]


def test_codigo_estable_por_sku_no_por_pestana():
    # El nombre de la pestaña ("🔵 AN1 …") NO manda; el prefijo de SKU (IE1) sí.
    unidades = {"IE1-0A-N001-P-0101": {}, "IE1-0A-N002-P-0201": {}, "IE1-0B-N003-P-0301": {}}
    assert qc._codigo_estable(unidades) == "IE1"


def test_codigo_estable_toma_el_prefijo_dominante():
    unidades = {"CM1-0A-N001-P-0101": {}, "CM1-0A-N002-P-0102": {}, "X-9": {}}
    assert qc._codigo_estable(unidades) == "CM1"


def test_parse_excluye_comerciales_y_arma_llave_sku():
    ws = _ws([
        ["Comunal 50"], [], HDR,
        ["A", "N001", "101", "CM1-0A-N001-P-0101", "Disponible", 2, 1, 1, 52.2, 52.2, "N/D", "N/D", "N/D", "2,379,330"],
        ["A", "N001", "LC-01", "CM1-0A-N001-P-LC01", "Disponible", 0, 1, 0, 47, 47, "N/D", "N/D", "N/D", "8,400,000"],
        ["A", "N002", "Local 02", "CM1-0A-N002-P-L02", "Disponible", 0, 1, 0, 50, 50, "N/D", "N/D", "N/D", "9,000,000"],
    ])
    out = qc._parse_tab(ws)
    assert set(out.keys()) == {"CM1-0A-N001-P-0101"}          # el depto sí; los 2 locales fuera
    assert out["CM1-0A-N001-P-0101"]["precio"] == 2379330.0
    assert out["CM1-0A-N001-P-0101"]["status"] == "disponible"


def test_parse_multitorre_prefija_la_unidad_con_torre():
    ws = _ws([
        ["X"], [], HDR,
        ["A", "N001", "101", "X-0A-N001-P-0101", "Disponible", 2, 1, 1, 60, 60, "", "", "", "3000000"],
        ["B", "N001", "101", "X-0B-N001-P-0101", "Apartado", 2, 1, 1, 60, 60, "", "", "", "3000000"],
    ])
    out = qc._parse_tab(ws)
    unidades = {v["unidad"] for v in out.values()}
    assert unidades == {"A-101", "B-101"}                      # torre en la unidad (lección The Park)
    assert any(v["status"] == "apartado" for v in out.values())


def test_num_limpia_formato():
    assert qc._num("2,379,330") == 2379330.0
    assert qc._num("N/D") is None
    assert qc._num(None) is None
