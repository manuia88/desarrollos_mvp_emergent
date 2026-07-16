"""Estado del catálogo en el tiempo: el comparativo entre dos fotos (founder 07-16)."""
from estado_catalogo import delta


def test_primera_foto_sin_comparativo():
    r = delta(None, {"global": {"unidades": 588}})
    assert "primera foto" in r["nota"]


def test_delta_reporta_cambios():
    antes = {"ts": "2026-07-01", "global": {"cobertura_fuente_pct": 92.4, "unidades": 523,
                                            "censo_pct": 99.6, "assets": 1716}}
    ahora = {"ts": "2026-07-16", "global": {"cobertura_fuente_pct": 97.6, "unidades": 588,
                                            "censo_pct": 100.0, "assets": 2431}}
    r = delta(antes, ahora)
    assert r["cambios"]["cobertura_fuente_pct"]["delta"] == 5.2
    assert r["cambios"]["unidades"]["delta"] == 65
    assert r["cambios"]["assets"]["delta"] == 715
    assert r["desde"] == "2026-07-01" and r["hasta"] == "2026-07-16"


def test_delta_ignora_lo_que_no_cambio():
    igual = {"global": {"unidades": 588, "censo_pct": 100.0}}
    r = delta(igual, {"global": {"unidades": 588, "censo_pct": 100.0}})
    assert r["cambios"] == {}          # nada cambió → comparativo vacío, sin ruido
