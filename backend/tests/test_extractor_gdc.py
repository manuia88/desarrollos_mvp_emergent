"""Extractor GDC — familia header-driven (columnas variables, esquemas de pago, estatus
en celda). Los fixtures reales viven en scratchpad; si no están, se prueba la lógica pura."""
import pathlib

import pytest

from extractores_layout import (_dinero_gdc, detecta_gdc, extraer_gdc,
                                extraer_gdc_bodegas)

SP = pathlib.Path("/private/tmp/claude-501/-Users-manuelacosta-Developer-desarrollos-mvp-emergent"
                  "/71957709-de6c-409e-8543-2c59c1c9cf67/scratchpad/gdc")


def test_dinero_con_espacios():
    # GDC mete espacios adentro del monto
    assert _dinero_gdc("$ 1 4,310,848.82") == 14310848.82
    assert _dinero_gdc("$ 5 ,561,679.68") == 5561679.68
    assert _dinero_gdc("$9,029,400.00") == 9029400.0
    assert _dinero_gdc("VENDIDO") is None
    assert _dinero_gdc("") is None


def test_detector_gdc():
    assert detecta_gdc("CASA CONDESA_LP.pdf") is True
    assert detecta_gdc("x.pdf", "ESQUEMA DE PAGO ...") is True
    # una lista de CLASS NO debe caer en GDC
    assert detecta_gdc("VP_Lista_de_Precios NUA T2 SF.pdf") is False


_REALES = SP.exists() and any(SP.glob("*_LP.pdf"))


@pytest.mark.skipif(not _REALES, reason="sin fixtures GDC en scratchpad")
def test_casa_condesa_header_driven():
    """Formato: NIVEL·DEPTO·BALCON·TERRAZA·M2·Cajones·Rec·Baños·[10% 90%]."""
    r = extraer_gdc((SP / "CASA_CONDESA_LP.pdf").read_bytes())
    assert r["familia"] == "gdc" and r["validacion"]["total"] >= 70
    # cobertura (capa 7): capturamos toda columna del header · derivados declarados
    assert r["cobertura_lista_ok"] is True and r["columnas_no_mapeadas"] == []
    assert "size_m2" in r["campos_derivados"]
    u101 = next(u for u in r["unidades"] if u["unit_number"] == "101")
    assert u101["m2_total"] == 235.0 and u101["m2_terrace"] == 43.0
    assert u101["size_m2"] == 192.0            # interior = total − exteriores
    assert u101["bedrooms"] == 3.0 and u101["bathrooms"] == 2.5
    assert u101["status"] == "disponible" and u101["price_mxn"] > 18_000_000
    assert any(u["status"] == "vendido" for u in r["unidades"])   # estatus en celda


def test_bodegas_parseo():
    """Lista de bodegas: 'NIVEL CLAVE M2 PRECIO' (o APARTADO en vez de $)."""
    from extractores_layout import _BODEGA_RE, _dinero_gdc
    m = _BODEGA_RE.match("1 SOTANO B-01 6.25 $260,000.00")
    assert m and m.group(2) == "B-01" and _dinero_gdc(m.group(4)) == 260000.0
    ap = _BODEGA_RE.match("5 SOTANO B-08 4.27 APARTADO")
    assert ap and ap.group(2) == "B-08" and _dinero_gdc(ap.group(4)) is None


@pytest.mark.skipif(not (SP / "gdc_condesa_bodegas.pdf").exists(),
                    reason="sin fixture de bodegas")
def test_bodegas_fixture_real():
    r = extraer_gdc_bodegas((SP / "gdc_condesa_bodegas.pdf").read_bytes())
    assert r["familia"] == "gdc_bodegas" and r["validacion"]["total"] >= 10
    b01 = next(u for u in r["unidades"] if u["unit_number"] == "B-01")
    assert b01["tipo"] == "bodega" and b01["price_mxn"] == 260000.0
    assert any(u["status"] == "reservado" for u in r["unidades"])   # B-08 APARTADO


@pytest.mark.skipif(not _REALES, reason="sin fixtures GDC en scratchpad")
def test_casa_alpes_multiples_esquemas():
    """Casa Alpes trae 3 esquemas de pago (30/20/50 · 20/20/60 · 10/10/80)."""
    r = extraer_gdc((SP / "CASA_ALPES_LP.pdf").read_bytes())
    conprecio = [u for u in r["unidades"] if u.get("esquemas_pago")]
    assert conprecio and len(conprecio[0]["esquemas_pago"]) == 3


@pytest.mark.skipif(not _REALES, reason="sin fixtures GDC en scratchpad")
def test_via_sin_recamaras_no_truena():
    """Vía Insurgentes NO trae columnas de recámaras/baños — no debe fallar."""
    r = extraer_gdc((SP / "VIA_INSURGENTES_LP.pdf").read_bytes())
    assert r["validacion"]["total"] >= 80
    assert all(u.get("m2_total") for u in r["unidades"] if u.get("_valida_m2"))
