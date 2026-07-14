"""Catálogo Vivo (Fase A rebuild UX): el índice único en lenguaje humano. Cero pérdida
(agrega los 44 bloques + productos), 6 dominios, búsqueda universal."""
from catalogo_maestro import construir_catalogo, buscar, DOMINIOS


def test_catalogo_completo_y_sin_perdida():
    cat = construir_catalogo()
    # los 6 dominios existen y todos tienen piezas
    assert len(cat["dominios"]) == 6
    assert {d["id"] for d in cat["dominios"]} == set(DOMINIOS)
    assert all(d["n_piezas"] > 0 for d in cat["dominios"]), "un dominio vacío = card sin casa"
    # cero pérdida: los bloques de reportes están indexados como piezas
    ids = {p["id"] for p in cat["piezas"]}
    for bloque in ("reporte_transiciones", "reporte_absorcion_viva", "reporte_etapa_vida",
                   "reporte_indice_adelantado"):
        assert bloque in ids, f"bloque perdido del catálogo: {bloque}"
    # dedup: carfax/dmx30 viven como producto/índice, NO como reporte suelto
    assert "reporte_carfax" not in ids and "reporte_dmx30" not in ids
    # los 3 productos del moat son piezas de primera clase
    assert {"estudio_dmx", "dmx30_producto", "carfax_producto"} <= ids
    # FASE D: los 7 lentes de Desarrollos ahora son descubribles (antes solo por clic interno)
    lentes = {"lente_construir", "lente_gusto", "lente_comportamiento", "lente_stock",
              "lente_macro", "lente_competencia", "lente_ia"}
    assert lentes <= ids, f"lentes faltantes del catálogo: {lentes - ids}"
    # y todos deep-linkean a su lente (no al genérico)
    for p in cat["piezas"]:
        if p["id"] in lentes:
            assert "lente=" in p["ruta_ui"], f"{p['id']} sin deep-link a su lente"
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


def test_hubs_listan_sus_pestanas():
    """AUDITORÍA D: cada hub-vista debe listar sus pestañas ('incluye') para que buscar
    cualquier término de sub-tab lo encuentre (cerró el gap 'gov data'→0 resultados)."""
    cat = construir_catalogo()
    porid = {p["id"]: p for p in cat["piezas"]}
    # el hub de datos incluye 'Gov Data MX' → buscar 'gov data' lo encuentra
    assert "Gov Data MX" in porid["ingesta_datos"].get("incluye", [])
    r = buscar(cat, texto="gov data")
    assert r["n"] >= 1 and any(p["id"] == "ingesta_datos" for p in r["piezas"])
    # operación incluye compliance/fraude/observabilidad
    inc = porid["operacion_salud"].get("incluye", [])
    assert "Compliance" in inc and "Patrones de fraude" in inc
    for term in ("compliance", "fraude", "duplicados", "reputación"):
        assert buscar(cat, texto=term)["n"] >= 1, f"'{term}' no encuentra su hub"


def test_contadores_coherentes():
    cat = construir_catalogo()
    assert cat["n_piezas"] == len(cat["piezas"])
    assert sum(d["n_piezas"] for d in cat["dominios"]) == cat["n_piezas"]
    assert sum(cat["por_tipo"].values()) == cat["n_piezas"]


def test_cero_perdida_de_vistas_del_sidebar():
    """AUDITORÍA FASE A: el test viejo solo cubría bloques → 7 vistas del sidebar quedaron fuera.
    Ahora se exige que TODA ruta mayor del portal tenga una pieza en el catálogo."""
    cat = construir_catalogo()
    rutas = {p["ruta_ui"].split("?")[0] for p in cat["piezas"] if p["ruta_ui"]}
    for r in ("/superadmin/tenants", "/superadmin/inmobiliaria-leads", "/superadmin/ia-conversacional",
              "/superadmin/phase5-foundation", "/superadmin/transactions", "/superadmin/knowledge-graph",
              "/superadmin/granularidad", "/superadmin/mercado", "/superadmin/metrics-cube",
              "/superadmin/operacion", "/superadmin/monetizacion", "/superadmin/datos"):
        assert r in rutas, f"vista del sidebar SIN pieza en el catálogo: {r}"


def test_sin_titulos_duplicados():
    """CARFAX y DMX-30 no deben aparecer dos veces (producto + reporte con el mismo título)."""
    cat = construir_catalogo()
    from collections import Counter
    titulos = Counter(p["titulo"].lower().split("(")[0].strip() for p in cat["piezas"])
    dups = {t: n for t, n in titulos.items() if n > 1}
    assert not dups, f"títulos duplicados en el catálogo: {dups}"


def test_reportes_hacen_deep_link():
    """Toda pieza tipo reporte debe hacer DEEP-LINK a su destino exacto: los bloques del
    generador con ?tab=reportes&bloque=, los lentes de Desarrollos con ?lente=."""
    cat = construir_catalogo()
    reps = [p for p in cat["piezas"] if p["tipo"] == "reporte"]
    assert reps
    for p in reps:
        assert ("tab=reportes&bloque=" in p["ruta_ui"] or "lente=" in p["ruta_ui"]), \
            f"{p['id']} no hace deep-link ({p['ruta_ui']})"


def test_features_con_capa_humana():
    """El registro _FEATURE_HUMANO cubre ≥30 features con lenguaje real (las features solo se
    registran al cargar la app; en test aislado el registry está vacío, por eso se prueba el
    MAPA directamente, que es lo que garantiza la calidad en vivo)."""
    from catalogo_maestro import _FEATURE_HUMANO
    assert len(_FEATURE_HUMANO) >= 30
    for key, tupla in _FEATURE_HUMANO.items():
        assert len(tupla) == 6, f"{key} mal formado"
        dominio, ruta, que_es, que_dice, beneficio, que_hago = tupla
        assert dominio in DOMINIOS and ruta.startswith("/superadmin/")
        assert all(len(x) > 5 for x in (que_es, que_dice, beneficio, que_hago))
