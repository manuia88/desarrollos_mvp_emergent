"""Tanda B.1 · Tests del motor central de Señales Honestas (metric_normalizer)
+ su integración en los 5 índices DMX. Funciones PURAS (sin DB).

Verifica:
- percentiles / percentile_rank correctos
- banda por percentil real (Muy Baja … Muy Alta)
- población chica → marca "estimado" honesto
- invertir solo voltea el color, no la etiqueta
- DENUE_DENSITY_REF es fuente única (no 3000 ni duplicado)
- los 5 índices exponen nivel/etiqueta/percentil + compat (valor/banda legacy)
"""
import pytest

import metric_normalizer as mn

pytestmark = pytest.mark.unit


# ─── percentiles / rank ──────────────────────────────────────────────────────
def test_percentiles_basic():
    d = mn.percentiles([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
    assert d["n"] == 10
    assert d["min"] == 10 and d["max"] == 100
    assert d["p50"] == pytest.approx(55.0)


def test_percentiles_empty():
    assert mn.percentiles([])["n"] == 0
    assert mn.percentiles([None, None])["n"] == 0


def test_percentile_rank_monotonic():
    sv = sorted([10, 20, 30, 40, 50])
    assert mn.percentile_rank(5, sv) < mn.percentile_rank(35, sv) < mn.percentile_rank(55, sv)


# ─── banda por percentil ─────────────────────────────────────────────────────
def test_band_low_mid_high():
    d = mn.percentiles(list(range(0, 101, 10)))
    assert mn.band_from_dist(d, 5)["nivel"] == "muy_baja"
    assert mn.band_from_dist(d, 55)["nivel"] == "media"
    assert mn.band_from_dist(d, 95)["nivel"] == "muy_alta"


def test_band_real_not_estimated_when_enough_population():
    d = mn.percentiles(list(range(0, 101, 5)))  # n=21 >= MIN_REAL
    b = mn.band_from_dist(d, 50)
    assert b["es_estimado"] is False
    assert b["percentil"] is not None
    assert str(b["comparado_con"]) in b["leyenda"]


def test_band_small_population_marks_estimated():
    b = mn.band_from_values(70, [60, 80])  # n=2 < MIN_REAL
    assert b["es_estimado"] is True
    assert "guía" in b["leyenda"].lower()


def test_band_none_value_is_sin_dato():
    b = mn.band_from_dist(mn.percentiles([1, 2, 3]), None)
    assert b["etiqueta"] == "Sin Dato Aún"
    assert b["es_estimado"] is True


def test_invertir_flips_color_not_label():
    d = mn.percentiles(list(range(0, 101, 10)))
    normal = mn.band_from_dist(d, 95)
    inverted = mn.band_from_dist(d, 95, invertir=True)
    assert normal["etiqueta"] == inverted["etiqueta"] == "Muy Alta"
    assert normal["color"] == "verde" and inverted["color"] == "rojo"


def test_etiquetas_son_title_case_humano():
    d = mn.percentiles(list(range(0, 101, 10)))
    for v in (5, 25, 50, 70, 95):
        et = mn.band_from_dist(d, v)["etiqueta"]
        assert et in {"Muy Baja", "Baja", "Media", "Alta", "Muy Alta"}


def test_denue_ref_es_fuente_unica():
    assert mn.DENUE_DENSITY_REF == 500.0  # ya no 3000; única fuente


# ─── integración en los 5 índices DMX ────────────────────────────────────────
def test_indices_exponen_senal_honesta_y_compat():
    import dmx_indices_engine as ix
    from data_seed import COLONIAS

    ix.ensure_index_distributions(COLONIAS)
    r = ix.compute_indices(COLONIAS[0])

    # honesto
    idm = r["idm"]
    assert idm["etiqueta"] in {"Muy Baja", "Baja", "Media", "Alta", "Muy Alta"}
    for i in r["indices"]:
        assert i["nivel"] in {"muy_baja", "baja", "media", "alta", "muy_alta"}
        assert i["etiqueta"]
        assert "leyenda" in i and "comparado_con" in i
        # compat con UI previa
        assert i["banda"] in {"alto", "medio", "bajo"}
        assert "valor" in i and "letra" in i


def test_distribucion_es_por_ciudad():
    import dmx_indices_engine as ix
    from data_seed import COLONIAS

    dist = ix.ensure_index_distributions(COLONIAS, refresh=True)
    # ahora la distribución está agrupada por ciudad: {ciudad: {clave: dist}}
    assert "CDMX" in dist
    assert dist["CDMX"]["IDM"]["n"] == len(COLONIAS)


def test_gentrificacion_se_muestra_como_banda_honesta():
    import zone_cycle_engine as zce
    from data_seed import COLONIAS

    zce.ensure_cycle_distributions(COLONIAS)
    z = zce.compute_zone_cycle(COLONIAS[0])
    g = z["gentrificacion"]
    assert g["etiqueta"] in {"Muy Baja", "Baja", "Media", "Alta", "Muy Alta"}
    assert g["nivel"] in {"alta", "media", "baja"}          # compat UI previa
    assert "leyenda" in g and "comparado_con" in g
    assert "city" in z


def test_bandas_no_mezclan_ciudades():
    """Una colonia de otra ciudad se compara solo contra su ciudad (no contra CDMX)."""
    import dmx_indices_engine as ix
    from data_seed import COLONIAS
    import copy

    otra = copy.deepcopy(COLONIAS[0]); otra["id"] = "gdl-centro"; otra["name"] = "GDL Centro"; otra["city"] = "Guadalajara"
    universo = list(COLONIAS) + [otra]
    dist = ix.ensure_index_distributions(universo, refresh=True)
    assert "Guadalajara" in dist and "CDMX" in dist
    assert dist["Guadalajara"]["IDM"]["n"] == 1   # solo su ciudad
