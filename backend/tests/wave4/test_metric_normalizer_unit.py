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


def test_colonias_map_row_heterogeneo():
    """El cargador del catálogo mapea esquemas oficiales distintos a un doc limpio."""
    import colonias_catalog as cc
    m = cc._map_row({"nom_colonia": "ROMA NORTE", "alcaldia": "Cuauhtémoc", "lat": 19.41, "lon": -99.16}, "CDMX")
    assert m["name"] == "Roma Norte" and m["alcaldia"] == "Cuauhtémoc"
    assert m["city"] == "CDMX" and m["center"] == [-99.16, 19.41]
    assert m["id"] == "roma-norte-cuauhtemoc"
    # nombre alterno + sin coords
    m2 = cc._map_row({"asentamiento": "Polanco V Sección", "delegacion": "Miguel Hidalgo"}, "CDMX")
    assert m2["name"] == "Polanco V Sección" and m2["center"] is None
    # sin nombre → descarta
    assert cc._map_row({"foo": "bar"}, "CDMX") is None


def test_score_bridge_solo_cuenta_dato_externo_real():
    """El puente cuenta REAL solo dato externo (DENUE/SESNSP/DRPI); stub y seed_proxy NO."""
    import score_bridge as sb
    sub = {
        "lifestyle":  {"value": 80, "source": "denue"},       # → vida (real)
        "amenidades": {"value": 70, "source": "denue"},       # → comercio (real)
        "seguridad":  {"value": 90, "source": "sesnsp"},      # → seguridad + riesgo (real)
        "transporte": {"value": 60, "source": "seed_proxy"},  # → movilidad: NO cuenta (es la semilla)
        "precio":     {"value": 50, "source": "stub"},        # → plusvalia: NO cuenta (sin dato)
        "vibe":       {"value": 40, "source": "stub"},
    }
    r = sb.map_subscores(sub)
    assert r["scores"].get("vida") == 80 and r["scores"].get("comercio") == 70
    assert r["scores"].get("seguridad") == 90 and r["scores"].get("riesgo") == 90
    assert "movilidad" not in r["scores"]    # seed_proxy excluido
    assert "plusvalia" not in r["scores"]    # stub excluido
    assert r["reales"] == 4 and r["es_estimado"] is True   # 4 de 7 (falta educacion siempre)


def test_score_bridge_sin_datos_todo_pendiente():
    import score_bridge as sb
    r = sb.map_subscores({})
    assert r["reales"] == 0 and r["cobertura_pct"] == 0 and r["es_estimado"] is True


def test_osm_clasifica_pois_a_categorias_dmx():
    """El motor OSM mapea tags reales a categorías; las claves de vida usan tokens en español."""
    import osm_engine as osm
    assert osm._classify({"amenity": "restaurant"}) == "restaurante"
    assert osm._classify({"amenity": "cafe"}) == "cafe"
    assert osm._classify({"amenity": "bar"}) == "bar"
    assert osm._classify({"shop": "supermarket"}) == "mercado"
    assert osm._classify({"amenity": "pharmacy"}) == "farmacia"
    assert osm._classify({"leisure": "park"}) == "recreacion"
    assert osm._classify({"shop": "florist"}) == "otro_comercio"   # cuenta para densidad total
    assert osm._classify({"highway": "residential"}) is None        # no es comercio


def test_fgj_pesa_por_gravedad():
    """Seguridad FGJ: lo violento pesa mucho, el bajo impacto poco, lo no-delictivo nada."""
    import crime_fgj_engine as fgj
    assert fgj._weight("HOMICIDIO DOLOSO") == 6.0
    assert fgj._weight("VIOLACIÓN") == 6.0
    assert fgj._weight("DELITO DE BAJO IMPACTO") == 1.0
    assert fgj._weight("HECHO NO DELICTIVO") == 0.0
    assert fgj._weight("ROBO DE OBJETOS") == 2.0          # otros → medio
    # lo violento pesa más que el bajo impacto (no castiga a la zona concurrida por hurto menor)
    assert fgj._weight("HOMICIDIO DOLOSO") > fgj._weight("DELITO DE BAJO IMPACTO")


def test_osm_clasifica_transporte_y_educacion():
    """OSM clasifica transporte (Metro/paradas) y escuelas → dimensiones movilidad + educación."""
    import osm_engine as osm
    assert osm._classify({"railway": "station"}) == "transporte"
    assert osm._classify({"railway": "subway_entrance"}) == "transporte"
    assert osm._classify({"highway": "bus_stop"}) == "transporte"
    assert osm._classify({"amenity": "bus_station"}) == "transporte"
    assert osm._classify({"amenity": "school"}) == "escuela"
    assert osm._classify({"amenity": "university"}) == "escuela"


def test_bridge_mapea_movilidad_y_educacion():
    """El puente mapea movilidad←transporte y educacion←educacion."""
    import score_bridge as sb
    sub = {
        "transporte": {"value": 80, "source": "osm"},   # → movilidad real
        "educacion":  {"value": 70, "source": "osm"},   # → educacion real
    }
    r = sb.map_subscores(sub)
    assert r["scores"].get("movilidad") == 80
    assert r["scores"].get("educacion") == 70


def test_osm_keys_compatibles_con_lifestyle():
    """Las categorías de vida de OSM deben matchear el detector de lifestyle (vida)."""
    import osm_engine as osm
    from zone_subscores_compute import LIFESTYLE_CATEGORIES
    vida_keys = {"restaurante", "bar", "cafe", "ocio", "recreacion"}
    for k in vida_keys:
        assert any(token in k for token in LIFESTYLE_CATEGORIES), f"{k} no lo detecta lifestyle"


def test_resale_filtra_atipicos():
    """Tanda C: la referencia de reventa excluye precios inflados (MAD robusto)."""
    import resale_data as rd
    dentro, atip = rd._split_outliers([48000, 50000, 52000, 49000, 51000, 200000])
    assert len(atip) == 1 and 200000 not in dentro
    assert round(rd._median(dentro)) == 50000   # no lo arrastra el inflado
    # con <4 puntos no filtra (sin base estadística)
    d2, a2 = rd._split_outliers([50000, 999999])
    assert len(a2) == 0


def test_resale_clasifica_precio():
    """Tanda C: clasifica el precio del asesor vs el rango típico (honesto, palabra)."""
    import resale_data as rd
    ref = {"pm2": 50000, "rango_bajo": 48500, "rango_alto": 51500, "fuente": "captaciones"}
    assert rd.clasificar_precio(50000, ref)["banda"] == "en_rango"
    assert rd.clasificar_precio(58000, ref)["banda"] == "alto"
    assert rd.clasificar_precio(75000, ref)["banda"] == "muy_alto"
    assert rd.clasificar_precio(30000, ref)["banda"] == "muy_bajo"
    assert rd.clasificar_precio(50000, {"fuente": "insuficiente"})["banda"] == "sin_referencia"


def test_resale_confianza_por_n():
    import resale_data as rd
    assert rd._confianza(8) == "alta"
    assert rd._confianza(4) == "media"
    assert rd._confianza(2) == "baja"
    assert rd._confianza(1) == "insuficiente"


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
