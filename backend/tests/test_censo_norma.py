"""Censo como norma: la BD contra la última lista del dev, al peso."""
from censo_norma import comparar
from error_matrix import resumen, matriz


def _bd(num, price, status="disponible"):
    return {"unit_number": num, "price": price, "status": status}


def test_comparar_caza_precio_y_estado():
    snap = {"A204": {"unidad": "A 204", "precio": 5981600, "status": None},
            "A305": {"unidad": "A 305", "precio": 4850000, "status": None},
            "A401": {"unidad": "A 401", "precio": None, "status": "no_disponible"}}
    bd = [_bd("A-204", 6194300),            # precio viejo → falla
          _bd("A-305", 4850000, "vendido"),  # la lista la OFRECE → no puede estar vendida
          _bd("A-401", 5000000)]             # sombreada en lista, disponible en BD → falla
    r = comparar(snap, bd)
    assert r["cotejadas"] == 3
    campos = sorted((f["unidad"], f["campo"]) for f in r["fallas"])
    assert campos == [("A 204", "precio"), ("A 305", "estado"), ("A 401", "estado")]


def test_comparar_al_peso_tolera_un_peso():
    snap = {"X1": {"unidad": "X1", "precio": 5000001, "status": None}}
    assert comparar(snap, [_bd("X1", 5000000)])["fallas"] == []


def test_matriz_de_jueces_sabe_lo_que_no_ve():
    """El juez de jueces: hay celdas cubiertas Y deudas declaradas — nunca 100% falso."""
    r = resumen()
    assert r["total"] >= 40 and 0 < r["cubiertas"] < r["total"]
    assert r["faltantes"], "las deudas se declaran, no se esconden"
    # los casos que nos mordieron tienen juez
    m = {(c["campo"], c["modo"]): c["juez"] for c in matriz()}
    assert m[("precio", "tapado_por_banner")]          # Jai 25L
    assert m[("estado", "sombreado_invisible")]        # Dessea PH03
    assert m[("unidad", "renglon_omitido")]            # Único Roma
    assert m[("proyecto", "renombre_como_nuevo")]      # Cordobanes
