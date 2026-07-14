"""FASE E — la matriz de trazabilidad como GUARDIA PERMANENTE.

Congela la prueba de cero pérdida: si alguien borra una vista del nav o del catálogo,
o agrega una capacidad al portal sin darle casa, este test se pone rojo. Es la garantía
viva de la regla del founder: "no quiero perder ningún motor, score, feature, tab".
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools"))

from matriz_trazabilidad import (  # noqa: E402
    cargar_crawl, construir_indice_ux, clasificar_ruta, clasificar_tab,
)


def test_cero_paginas_huerfanas():
    """Las 24 páginas del crawl original deben tener casa en la UX nueva (nav o catálogo)."""
    crawl = cargar_crawl()
    ux = construir_indice_ux()
    huerfanas = [p["ruta"] for p in crawl if clasificar_ruta(p["ruta"], ux)[0] == "HUERFANO"]
    assert not huerfanas, f"páginas del crawl sin casa en la UX nueva: {huerfanas}"
    assert len(crawl) == 24


def test_cero_pestanas_sin_casa():
    """Cada pestaña del crawl es o una capacidad hallable, o cromo de UI (botón/filtro/valor).
    Ninguna puede quedar como capacidad sin destino."""
    crawl = cargar_crawl()
    ux = construir_indice_ux()
    sin_casa = []
    for page in crawl:
        for t in page.get("tabs", []):
            label = t if isinstance(t, str) else (t.get("label") or t.get("text") or "")
            if clasificar_tab(label, ux)[0] == "SIN_CASA":
                sin_casa.append((page["ruta"], label))
    assert not sin_casa, f"pestañas del crawl sin casa: {sin_casa}"


def test_las_capacidades_reales_son_buscables():
    """Muestra puntual: las capacidades que la matriz recuperó (motores/scores de sub-tabs)
    deben encontrarse por búsqueda — no solo estar 'en su página'."""
    from catalogo_maestro import construir_catalogo, buscar
    cat = construir_catalogo()
    for termino in ("precisión pronóstico", "denue", "heatmap", "alta manual",
                    "mapa de tensión", "drill-down", "equilibrio 4s"):
        r = buscar(cat, texto=termino)
        assert r["n"] >= 1, f"capacidad recuperada por la matriz pero NO buscable: '{termino}'"
