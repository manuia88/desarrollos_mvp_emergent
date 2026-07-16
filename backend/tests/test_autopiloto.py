"""El Autopiloto del catálogo: la póliza es código y el código se prueba."""
from autopiloto_catalogo import (NUNCA_SOLO, POLIZA, decidir_lote,
                                 decidir_publicacion, encendido)


def test_a1_porton_limpio_aprueba():
    d = decidir_lote({"resumen": {"error": 0, "alerta": 0, "aviso": 2}})
    assert d["accion"] == "aprobar" and d["regla"] == "A1"
    assert "0 errores" in d["evidencia"]


def test_a1_mas_estricto_que_modo_lote():
    # el modo-lote manual tolera alertas; la AUTONOMÍA no: 1 alerta → escala
    d = decidir_lote({"resumen": {"error": 0, "alerta": 1}})
    assert d["accion"] == "escalar" and d["regla"] == "A4"
    d = decidir_lote({"resumen": {"error": 3}})
    assert d["accion"] == "escalar"
    assert decidir_lote({}) ["accion"] == "aprobar"  # sin hallazgos = limpio


def test_a2_publicar_solo_con_tres_gates():
    ok = decidir_publicacion(85.0, True, 0)
    assert ok["accion"] == "publicar" and ok["regla"] == "A2"
    # cada gate caído, por separado, bloquea — y la evidencia DICE cuál
    assert "avance" in decidir_publicacion(70.0, True, 0)["evidencia"]
    assert "juez" in decidir_publicacion(90.0, False, 0)["evidencia"]
    assert "auditoría" in decidir_publicacion(90.0, True, 2)["evidencia"]
    assert decidir_publicacion(None, True, 0)["accion"] == "escalar"


def test_poliza_integra_y_legible():
    assert [r["regla"] for r in POLIZA] == ["A1", "A2", "A3", "A4"]
    for r in POLIZA:
        assert r["accion"] and r["solo_si"]          # cada regla se explica sola
    # la denylist cubre lo irreversible/sensible
    for palabra in ("borrar", "deshacer", "comisión", "despublicar"):
        assert palabra in NUNCA_SOLO


def test_kill_switch(monkeypatch):
    monkeypatch.setenv("AUTOPILOTO_CATALOGO", "off")
    assert encendido() is False
    monkeypatch.setenv("AUTOPILOTO_CATALOGO", "on")
    assert encendido() is True
