"""Detector de código viejo (incidente 07-15: uvicorn --reload corrió 8h sin recargar)."""
from datetime import datetime, timezone

from salud_proceso import evaluar


def _iso(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat()


def test_codigo_al_dia():
    arranque_epoch = 1_000_000
    archivos = [{"nombre": "a.py", "mtime": arranque_epoch - 100},
                {"nombre": "b.py", "mtime": arranque_epoch - 5}]
    r = evaluar(_iso(arranque_epoch), archivos)
    assert r["codigo_viejo"] is False


def test_codigo_viejo_delata_archivo():
    """El caso real: un archivo cambió DESPUÉS de que el proceso arrancó → viejo."""
    arranque_epoch = 1_000_000
    archivos = [{"nombre": "viejo.py", "mtime": arranque_epoch - 500},
                {"nombre": "censo_total.py", "mtime": arranque_epoch + 3600},
                {"nombre": "routes/inventario.py", "mtime": arranque_epoch + 60}]
    r = evaluar(_iso(arranque_epoch), archivos)
    assert r["codigo_viejo"] is True
    assert r["n_archivos_nuevos"] == 2
    assert r["mas_nuevo"] == "censo_total.py"        # el más reciente primero
    assert "reinícialo" in r["nota"]


def test_margen_5s_no_falsea():
    """Cambios en los 5s previos al arranque cuentan como ya cargados (no alarma)."""
    arranque_epoch = 1_000_000
    archivos = [{"nombre": "x.py", "mtime": arranque_epoch + 3}]
    assert evaluar(_iso(arranque_epoch), archivos)["codigo_viejo"] is False


def test_sin_arranque_no_alarma():
    assert evaluar(None, [{"nombre": "x.py", "mtime": 9e9}])["codigo_viejo"] is False
    assert evaluar("no-es-fecha", [])["codigo_viejo"] is False
