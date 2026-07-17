"""Amarre de planos: triple candado torre+depto+área (+regla FLEX de recámaras).
Casos reales de Almina 07-16: láminas ALMINA_ARQ decían TORRE B adentro y estaban
amarradas a unidades de Torre A; 'Copia de A-107.pdf' adentro era el stack x07 (117 m²)."""
from plano_binder import (area_cuadra, area_de_lamina, deptos_de_archivo,
                          lamina_cuadra_con_unidad, recamaras_de_lamina,
                          terraza_de_lamina, torre_de_lamina, torre_de_unidad)


def test_torre_se_lee_del_contenido_no_del_nombre():
    assert torre_de_lamina("TIPO DE DEPARTAMENTO\nTORRE B\nNIVEL 3, 5, 7") == "B"
    assert torre_de_lamina("torre a\nInformación") == "A"
    assert torre_de_lamina("sin torre declarada") is None


def test_torre_de_unidad():
    assert torre_de_unidad("A-1104") == "A"
    assert torre_de_unidad("B S3 - 1") == "B"
    assert torre_de_unidad("PB 107") is None       # sin prefijo de torre
    assert torre_de_unidad("101") is None


def test_area_y_terraza_y_recamaras_del_ocr():
    t = "Información\nÁrea: 113.00 m2\nTerraza: 9.55\n3 RECÁMARAS"
    assert area_de_lamina(t) == 113.0
    assert terraza_de_lamina(t) == 9.55
    assert recamaras_de_lamina(t) == 3
    assert area_de_lamina("A= 117 M2 TIPO 7") == 117.0   # rótulo CAD
    assert area_de_lamina("sin area") is None


def test_deptos_del_nombre_de_archivo():
    # lista explícita
    ds, rec = deptos_de_archivo("Copia de A-304,504,704,904,1104,1304.pdf")
    assert ds == ["304", "504", "704", "904", "1104", "1304"] and rec is None
    # variante de recámaras (PB con opción 2/3 rec)
    ds, rec = deptos_de_archivo("Copia de A-108 2 rec.pdf")
    assert ds == ["108"] and rec == 2
    # familia niveles×stack (el nombre solo trae el 1er depto; la lista se expande)
    ds, rec = deptos_de_archivo("ALMINA_ARQ_N 3,5,7,9,11,13-304.pdf")
    assert ds == ["304", "504", "704", "904", "1104", "1304"]
    ds, _ = deptos_de_archivo("ALMINA_ARQ_NIVEL 2-203.pdf")
    assert ds == ["203"]


def test_area_cuadra_directa_terraza_y_totales():
    assert area_cuadra(113.0, None, 112.95, 112.95) is True          # directa
    assert area_cuadra(112.0, 34.19, 146.65, 176.0) is True          # priv = área+terraza
    assert area_cuadra(117.0, None, 176.0, 176.0) is False           # no explica los m²


def test_regla_flex_de_recamaras():
    # FLEX real: lámina 3 REC / lista 2 rec, misma huella (113 vs 112.95) → SÍ amarra
    assert lamina_cuadra_con_unidad(113.0, 9.55, 3, 2.0, 112.95, 112.95) is True
    # caso A-107: lámina 2 REC 117+59=176 vs unidad 3 rec 176 → NO (solo cuadra vía terraza
    # y las recámaras no coinciden: es otro depto, el nombre del archivo miente)
    assert lamina_cuadra_con_unidad(117.0, 59.0, 2, 3.0, 176.0, 176.0) is False
    # mismas recámaras → vía terraza sí vale (PB 107: 112+34.19 ≈ 146.65)
    assert lamina_cuadra_con_unidad(112.0, 34.19, 3, 3.0, 146.65, 176.0) is True
