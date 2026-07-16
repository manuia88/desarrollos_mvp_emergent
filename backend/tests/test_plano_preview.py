"""Preview de planos PDF→PNG (bug 07-16: PDF en <img> = caja blanca)."""
import pathlib

from plano_preview import render_preview


def test_render_pdf_inexistente_no_truena(tmp_path):
    assert render_preview("/no/existe.pdf", tmp_path, "x") is None


def test_render_pdf_real_genera_png(tmp_path):
    """Si hay un plano PDF en caché, debe salir un PNG con contenido (usa pdftoppm)."""
    import shutil
    if not shutil.which("pdftoppm"):
        import pytest
        pytest.skip("pdftoppm (poppler) no instalado")
    cache = pathlib.Path.home() / "dmx_data" / "drive_cache"
    pdfs = list(cache.glob("*.bin"))[:20] if cache.exists() else []
    # los .bin de listas VP son PDF; toma el primero que abra como PDF
    for p in pdfs:
        if p.read_bytes()[:5] == b"%PDF-":
            png = render_preview(str(p), tmp_path, "preview")
            assert png and pathlib.Path(png).exists()
            assert pathlib.Path(png).stat().st_size > 1000    # imagen real, no vacía
            return
    import pytest
    pytest.skip("sin PDF en caché para probar el render")
