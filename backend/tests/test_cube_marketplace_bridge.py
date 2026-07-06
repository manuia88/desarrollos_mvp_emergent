"""CUBO TOTAL F4.1 — puente marketplace → corte del cubo.

Fija: (1) TODO el whitelist del buscador se mapea o se DECLARA en no_mapeados (regla de los
2 strikes: cubrir el vocabulario completo de la fuente), (2) valores basura no revientan,
(3) unit_feature/amenity multivalor → un filtro por valor.
"""
from cube_marketplace_bridge import filtros_marketplace_a_corte


def test_mapeo_completo_del_whitelist():
    filters = {
        "colonia": "roma-norte", "alcaldia": "benito-juarez", "beds": 2, "baths": "2",
        "parking": 1, "min_price": 2_000_000, "max_price": 5_000_000,
        "min_sqm": 50, "max_sqm": 90, "mensualidad_max": 30_000,
        "stage": "preventa", "orientacion": "sur", "piso_min": 3,
        "amenity": ["alberca", "gym"], "unit_feature": ["balcon", "terraza"],
        # sin cara en el cubo → declarados
        "enganche_max": 500_000, "plazo": "12m", "credito": "bancario",
        "apartado_max": 50_000, "descuento_min": 5, "esquema_pago": "80-20", "tipo": "depto",
    }
    corte, fuera = filtros_marketplace_a_corte(filters)
    campos = [(f["campo"], f["op"]) for f in corte]
    assert ("colonia", "eq") in campos and ("alcaldia", "eq") in campos
    assert ("recamaras", "gte") in campos and ("banos", "gte") in campos
    assert ("n_parking", "gte") in campos and ("piso", "gte") in campos
    assert ("precio", "lte") in campos and ("precio", "gte") in campos
    assert ("m2", "lte") in campos and ("m2", "gte") in campos
    assert ("mens_80_20", "lte") in campos and ("etapa", "eq") in campos
    assert ("orientacion", "eq") in campos
    assert sum(1 for c, _ in campos if c == "amenidades_edificio") == 2
    assert ("has_balcon", "eq") in campos and ("has_terraza", "eq") in campos
    # lo sin cara se DECLARA (no desaparece en silencio)
    assert {"enganche_max", "plazo", "credito", "apartado_max",
            "descuento_min", "esquema_pago", "tipo"} <= set(fuera)


def test_colonias_multiples_y_basura():
    corte, fuera = filtros_marketplace_a_corte({
        "colonia": ["roma-norte", "condesa"], "beds": "dos", "max_price": None, "raro": 1})
    assert corte[0] == {"campo": "colonia", "op": "in", "valor": ["roma-norte", "condesa"]}
    assert all(f["campo"] != "recamaras" for f in corte)   # 'dos' no coerciona
    assert "beds" in fuera and "raro" in fuera             # ...y se DECLARA, no desaparece


def test_vacio():
    corte, fuera = filtros_marketplace_a_corte({})
    assert corte == [] and fuera == []
