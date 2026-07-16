"""Cobertura de fuente (capa 7): mide cuánto del Maestro capturamos, no si es correcto."""
from cobertura_fuente import cobertura_dev


def test_captura_completa_da_100():
    filas = [{"RECAMARAS": 2, "BAÑOS": 2, "PRECIO ACTUAL": 5_000_000,
              "M2 HABITABLE": 80, "AMENIDADES": "GYM", "DOMICILIO DE UBICACIÓN": "X 1"}]
    unidad = {"bedrooms": 2, "bathrooms": 2, "price_mxn": 5_000_000, "size_m2": 80}
    dev = {"address": "X 1", "lat": 19.4}
    r = cobertura_dev(filas, dev, [unidad], amenities={"amenities": ["gym"]},
                      match_unidad=lambda f: unidad)
    assert r["cobertura_pct"] == 100.0 and not r["huecos"]


def test_hueco_source_tiene_catalogo_no():
    """El corazón del motor: el Maestro trae AMENIDADES y BAÑOS, el catálogo no →
    se reporta el hueco (esto es lo que los 6 filtros NO medían)."""
    filas = [{"RECAMARAS": 2, "BAÑOS": 2, "AMENIDADES": "GYM, SPA",
              "PRECIO ACTUAL": 5_000_000}]
    unidad = {"bedrooms": 2, "price_mxn": 5_000_000}      # sin bathrooms
    r = cobertura_dev(filas, {}, [unidad], amenities={},   # amenities vacío
                      match_unidad=lambda f: unidad)
    campos = {h["campo"] for h in r["huecos"]}
    assert "BAÑOS" in campos and "AMENIDADES" in campos
    assert r["cobertura_pct"] < 100


def test_columna_sin_valor_en_fuente_no_cuenta():
    """Si el Maestro NO trae la columna, no se exige (no infla ni baja el %)."""
    filas = [{"RECAMARAS": 2}]                             # solo recámaras
    unidad = {"bedrooms": 2}
    r = cobertura_dev(filas, {}, [unidad], match_unidad=lambda f: unidad)
    assert r["columnas_con_fuente"] == 1 and r["cobertura_pct"] == 100.0


def test_parcial_por_unidad():
    """4 filas traen amueblado, solo 2 unidades lo tienen → hueco 2/4."""
    filas = [{"AMUEBLADO": "SI"} for _ in range(4)]
    us = [{"amueblado": True}, {"amueblado": False}, {}, {}]
    it = iter(us)
    r = cobertura_dev(filas, {}, us, match_unidad=lambda f: next(it))
    h = [x for x in r["huecos"] if x["campo"] == "AMUEBLADO"]
    assert h and h[0]["faltan"] == 2 and h[0]["de"] == 4
