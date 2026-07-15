"""El masivo de CLASS: la lógica de cruce/identidad se prueba antes de tocar datos."""
from masivo_class import (a_vocabulario, derivar_piso, extraer_direccion,
                          fusionar_con_maestro, sufijo_producto)


def test_derivar_piso_sin_inventar():
    assert derivar_piso("0101") == 1
    assert derivar_piso("1203") == 12
    assert derivar_piso("A 203") == 2
    assert derivar_piso("G-001") == 0          # planta baja
    assert derivar_piso("PB-107") == 0
    assert derivar_piso("PH01") is None        # penthouse: no se inventa el piso
    assert derivar_piso("02C") is None         # 2 dígitos + letra: ambiguo → None


def test_a_vocabulario_torre_y_notas():
    u = {"unidad": "1702", "m2_habitable": 80.0, "m2_total": 85.5, "m2_balcon": 5.5,
         "precio": 5_000_000, "credito": 4_000_000, "enganche": 1_000_000,
         "estacionamientos": 2, "_valida_m2": True, "_valida_dinero": True}
    v = a_vocabulario(u, torre="A")
    assert v["unit_number"] == "A-1702" and v["level"] == 17
    assert v["size_m2"] == 80.0 and v["parking_spots"] == 2
    assert "notas" not in v
    # si ya trae la torre, no se duplica
    assert a_vocabulario({**u, "unidad": "A 1702"}, torre="A")["unit_number"] == "A 1702"
    # inválida → nota honesta
    assert "cotejar" in a_vocabulario({**u, "_valida_m2": False}, torre="")["notas"]


def test_sufijo_producto_formatos_reales():
    assert sufijo_producto("Almina B-Unidad B - 1205") == "B - 1205"
    assert sufijo_producto("Cervantes 101 - 1107") == "1107"
    assert sufijo_producto("Dessea 1-Dessea 1 PH01") == "PH01"
    assert sufijo_producto("Panorama G - unidad G001") == "G001"
    assert sufijo_producto("Cordobanes 3 -Unidad 301") == "301"
    assert sufijo_producto("Zereniti SA Unidad - A 1702") == "A 1702"
    assert sufijo_producto("JAI Reforma - Unidad - 02C") == "02C"


def test_fusion_con_maestro_enriquece_y_documenta():
    unidades = [{"unit_number": "A-1702", "size_m2": 80.0, "price_mxn": 5_000_000},
                {"unit_number": "A-9999", "size_m2": 50.0, "price_mxn": 3_000_000}]
    filas = [{"_producto": "Zereniti SA Unidad - A 1702", "bedrooms": 2, "bathrooms": 2,
              "estacionamientos": 2, "m2_habitable": 80.0, "precio": 5_000_000},
             {"_producto": "Zereniti SA Unidad - A 1801", "bedrooms": 3,
              "m2_habitable": 120.0, "precio": 9_000_000, "m2_total": 130.0}]
    us, solo_maestro, disc = fusionar_con_maestro(unidades, filas, torre="A")
    assert us[0]["bedrooms"] == 2 and us[0]["parking_spots"] == 2   # maestro completó
    assert len(solo_maestro) == 1 and solo_maestro[0]["unit_number"] == "A 1801"
    assert solo_maestro[0]["level"] == 18 and "Maestro" in solo_maestro[0]["notas"]
    assert any("A-9999" in d for d in disc)     # en lista, no en maestro → pregunta
    assert any("A 1801" in d for d in disc)     # en maestro, no en lista → pregunta


def test_fusion_ceros_a_la_izquierda():
    """Bug real del masivo: la lista dice '0101', el Maestro '101' — misma unidad."""
    us, sm, disc = fusionar_con_maestro(
        [{"unit_number": "0101", "size_m2": 49.19, "price_mxn": 3_659_100}],
        [{"_producto": "Revolución - Unidad - 101", "bedrooms": 1, "bathrooms": 1,
          "m2_habitable": 49.19, "precio": 3_659_100}], torre="")
    assert us[0]["bedrooms"] == 1 and not sm     # matchea y el maestro completa
    assert not disc


def test_fusion_discrepancia_de_precio_no_pasa_callada():
    us, _, disc = fusionar_con_maestro(
        [{"unit_number": "301", "size_m2": 70.0, "price_mxn": 5_000_000}],
        [{"_producto": "Cordobanes 3 -Unidad 301", "m2_habitable": 70.0,
          "precio": 5_200_000}], torre="")
    assert any("precio" in d and "301" in d for d in disc)


def test_extraer_direccion():
    d = extraer_direccion("LISTA DE PRECIOS: X 13/07/2026\n"
                          "DIRECCIÓN: AV. REVOLUCIÓN 1412, COL. GUADALUPE INN, "
                          "ÁLVARO OBREGÓN, CP 01020, CIUDAD DE MÉXICO")
    assert d["colonia"] == "GUADALUPE INN" and d["alcaldia"] == "ÁLVARO OBREGÓN"
    assert d["ciudad"] == "Ciudad de México"
    d2 = extraer_direccion("DIRECCIÓN: HACIENDA DEL CIERVO 14, COL. HACIENDA DE LAS "
                           "PALMAS, HUIXQUILUCAN, CP 52763, ESTADO DE MÉXICO")
    assert d2["ciudad"] == "Estado de México" and d2["alcaldia"] == "HUIXQUILUCAN"
    assert extraer_direccion("sin dirección")["address"] is None
