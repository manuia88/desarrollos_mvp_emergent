"""Tests de regresión de los 7 FIXES del examen de eficiencia (07-08).

Cada test bloquea un modo de falla real que el examen de 17 proyectos descubrió. Todos puros
(sin Mongo/red): validan la lógica determinista de validación, costo, absorción, edificio y downscale.
"""
import pytest

import bulk_ingest_engine as bie
import llm_client


# ── FIX 1 · contrato de cobertura (cascarón vacío) ───────────────────────────
def test_fix1_cascaron_vacio_reprueba_critico():
    """Recon halló lista pero se extrajeron 0 unidades → CRÍTICO, jamás publica (Terralia/CasaRoma151/Unico)."""
    v = bie.validate_extraction({"units": []}, {"listas_precios": [{"name": "LP.pdf"}]}, {}, "Terralia")
    assert v["critical_fail"] is True
    assert v["publicable"] is False
    assert v["score"] <= 50
    check = next(c for c in v["checks"] if c["check"] == "inventario_no_vacio")
    assert check["ok"] is False and check["critical"] is True


def test_fix1_sin_fuente_no_es_critico():
    """Sin lista NI fichas (anti-fantasma legítimo) → units=[] NO dispara el crítico de cobertura."""
    v = bie.validate_extraction({"units": []}, {"listas_precios": [], "fichas_por_depto": []}, {}, "SoloBrochure")
    check = next(c for c in v["checks"] if c["check"] == "inventario_no_vacio")
    assert check["ok"] is True   # no había fuente → no se le exige inventario


def test_fix1_lista_con_unidades_pasa():
    v = bie.validate_extraction(
        {"units": [{"unit_number": "101", "price_mxn": 3_000_000, "size_m2_total": 50, "prototype": "01"}],
         "total_units": 10},
        {"listas_precios": [{"name": "Terralia LP.pdf"}]}, {"total_units_edificio": 10}, "Terralia")
    assert v["critical_fail"] is False and v["publicable"] is True


# ── FIX 3 · edificio coherente ───────────────────────────────────────────────
def test_fix3_edificio_incoherente_marca_check():
    v = bie.validate_extraction(
        {"units": [{"unit_number": "101", "price_mxn": 3e6, "size_m2_total": 50},
                   {"unit_number": "102", "price_mxn": 3e6, "size_m2_total": 50}],
         "total_units": 1},
        {"listas_precios": [{"name": "LP.pdf"}]}, {}, "CasaRoma350")
    check = next(c for c in v["checks"] if c["check"] == "edificio_coherente")
    assert check["ok"] is False


# ── FIX 4 · listas de rango (baños float + min/max) ──────────────────────────
def test_fix4_banos_medios_no_se_truncan():
    """2.5 baños ya no se redondea a 2 (Bilú perdía los .5 en 17 unidades)."""
    out = bie._sanitize_extraction({"units": [{"unit_number": "M", "bathrooms": 2.5}]})
    assert out["units"][0]["bathrooms"] == 2.5


def test_fix4_precio_rango_min_max():
    out = bie._sanitize_extraction({"units": [{"unit_number": "TipoB", "price_min_mxn": 21_800_000,
                                               "price_max_mxn": 21_600_000}]})
    u = out["units"][0]
    assert u["price_min_mxn"] == 21_600_000 and u["price_max_mxn"] == 21_800_000  # se ordenan


# ── FIX 6 · costo real por tokens ────────────────────────────────────────────
def test_fix6_costo_por_tokens_no_es_fijo():
    barato = llm_client.estimate_cost_mxn({"input_tokens": 2000, "output_tokens": 300})
    caro = llm_client.estimate_cost_mxn({"input_tokens": 40000, "output_tokens": 4000})   # PDF nativo pesado
    assert caro > barato > 0
    assert llm_client.estimate_cost_mxn(None) == 0.0
    assert llm_client.estimate_cost_mxn({}) == 0.0


# ── FIX 7 · downscale de imágenes que pasan el límite base64 ─────────────────
def test_fix7_imagen_chica_pasa_intacta():
    b = b"x" * 1000
    fit = bie._fit_image_bytes(b, "image/png")
    assert fit is not None and fit[0] == b


def test_fix7_imagen_gigante_se_reescala_o_omite():
    from PIL import Image
    import io
    # imagen enorme (raw > 7.2MB tras encode) → debe reescalar a algo que quepa, o None (nunca reventar)
    im = Image.new("RGB", (6000, 6000), (123, 200, 50))
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    big = buf.getvalue()
    fit = bie._fit_image_bytes(big, "image/png")
    if fit is not None:
        assert len(fit[0]) <= bie._IMG_RAW_CAP


# ── FIX 5 · absorción solo con ancla (probado vía la lógica del validador de pct) ──
def test_fix5_pct_colocado_requiere_total_mayor_a_disponibles():
    """pct_colocado solo cuando total_edificio > disponibles (evita 0% o 100% falsos)."""
    # este cálculo vive inline en run(); replicamos su invariante clave
    def pct(disp, tot):
        return round((1 - disp / tot) * 100) if (tot and tot > disp) else None
    assert pct(0, 0) is None        # sin datos
    assert pct(5, 5) is None        # total == disponibles → no inventar 0%
    assert pct(5, 20) == 75         # caso real
