"""Catálogo Vivo (Fase A rebuild UX): el índice único en lenguaje humano. Cero pérdida
(agrega los 44 bloques + productos), 6 dominios, búsqueda universal."""
from catalogo_maestro import construir_catalogo, buscar, DOMINIOS


def test_catalogo_completo_y_sin_perdida():
    cat = construir_catalogo()
    # los 6 dominios existen y todos tienen piezas
    assert len(cat["dominios"]) == 6
    assert {d["id"] for d in cat["dominios"]} == set(DOMINIOS)
    assert all(d["n_piezas"] > 0 for d in cat["dominios"]), "un dominio vacío = card sin casa"
    # cero pérdida: los 44 bloques de reportes están indexados como piezas
    ids = {p["id"] for p in cat["piezas"]}
    for bloque in ("reporte_transiciones", "reporte_absorcion_viva", "reporte_etapa_vida",
                   "reporte_indice_adelantado", "reporte_carfax"):
        assert bloque in ids, f"bloque perdido del catálogo: {bloque}"
    # los 3 productos del moat son piezas de primera clase
    assert {"estudio_dmx", "dmx30_producto", "carfax_producto"} <= ids
    # toda pieza trae la capa HUMANA completa (nada vacío)
    for p in cat["piezas"]:
        for campo in ("titulo", "que_es", "que_dice", "beneficio", "que_hago"):
            assert p[campo] and len(p[campo]) > 3, f"{p['id']} sin {campo}"
        assert p["dominio"] in DOMINIOS


def test_busqueda_universal():
    cat = construir_catalogo()
    # texto libre: 'estudio' encuentra el producto Estudio DMX
    r = buscar(cat, texto="estudio")
    assert any(p["id"] == "estudio_dmx" for p in r["piezas"])
    # filtro por dominio
    prod = buscar(cat, dominio="productos")
    assert prod["n"] >= 3 and all(p["dominio"] == "productos" for p in prod["piezas"])
    # filtro por 'necesita': las piezas que piden unidad
    unidad = buscar(cat, necesita="unit_id")
    assert unidad["n"] >= 1 and all("unit_id" in p["necesita"] for p in unidad["piezas"])
    # combinado: dominio + texto
    r2 = buscar(cat, dominio="demanda", texto="quién")
    assert all(p["dominio"] == "demanda" for p in r2["piezas"])


def test_contadores_coherentes():
    cat = construir_catalogo()
    assert cat["n_piezas"] == len(cat["piezas"])
    assert sum(d["n_piezas"] for d in cat["dominios"]) == cat["n_piezas"]
    assert sum(cat["por_tipo"].values()) == cat["n_piezas"]
