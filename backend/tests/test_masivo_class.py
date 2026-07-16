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


def test_conciliador_de_definiciones_dessea_102():
    """Lección founder 07-15: 'habitable' del Maestro (205.09) = hab de la lista
    (186.95) + terraza (18.14). Eso NO es pelea — el conciliador lo explica."""
    from fusion_fuentes import conciliar_m2
    expl = conciliar_m2(186.95, 205.09, {"balcón": 14.31, "terraza": 18.14, "roof": 0})
    assert expl and "terraza" in expl and "205.09" in expl
    # suma de varios exteriores también cuenta (hab + balcón + terraza)
    assert conciliar_m2(186.95, 219.40, {"balcón": 14.31, "terraza": 18.14})
    # pelea REAL (ninguna identidad cuadra) → None, se documenta
    assert conciliar_m2(186.95, 199.99, {"balcón": 14.31, "terraza": 18.14}) is None
    assert conciliar_m2(None, 205.09, {"terraza": 18.14}) is None
    # y la fusión ya NO la reporta como discrepancia
    us, _, disc = fusionar_con_maestro(
        [{"unit_number": "2- 102", "size_m2": 186.95, "price_mxn": 10_350_000,
          "m2_balcony": 14.31, "m2_terrace": 18.14}],
        [{"_producto": "Dessea 2-Unidad 102", "m2_habitable": 205.09,
          "precio": 10_350_000, "bedrooms": 3}], torre="")
    assert not disc and us[0]["bedrooms"] == 3
    assert any("no es pelea" in n for n in us[0]["notas_fuentes"])


def test_vocabulario_total_y_terraza_sobreviven():
    """Bug Dessea 102: el merge esperaba 'size_m2_total' y tiraba patio — el
    vocabulario ahora emite AMBAS llaves y el desglose completo."""
    v = a_vocabulario({"unidad": "102", "m2_habitable": 186.95, "m2_total": 219.40,
                       "m2_balcon": 14.31, "m2_patio": 18.14, "m2_roof": 0.0,
                       "precio": 10_350_000, "credito": 7_250_000,
                       "enganche": 3_100_000, "bodegas": 1, "estacionamientos": 3,
                       "_valida_m2": True, "_valida_dinero": True})
    assert v["m2_total"] == 219.40 and v["size_m2_total"] == 219.40
    assert v["patio_m2"] == 18.14 and v["m2_balcony"] == 14.31
    assert v["parking_spots"] == 3 and v["bodega"] == 1


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
