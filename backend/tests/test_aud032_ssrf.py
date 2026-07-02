"""Regresión AUD-032 (Batch 5 · SSRF) — POST /api/public/search/by-url.

`parse_external_url` (services/url_parser.py) hacía fetch de la URL cruda del usuario (endpoint
anónimo) validando la fuente por SUBSTRING → `http://inmuebles24.com.mx@169.254.169.254/...` pasaba
y el server leía metadata de nube / servicios internos (SSRF CRÍTICO). Fix: detección por hostname
real + guard anti-SSRF canónico (services.url_guard) + follow_redirects=False.

url_parser/url_guard se importan sin inicializar cliente LLM → tests de comportamiento reales.
"""
import os
import re

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _src(rel):
    return open(os.path.join(BACKEND, rel), encoding="utf-8").read()


def test_aud032_detect_source_por_hostname_no_substring():
    from services.url_parser import _detect_source
    # Trucos SSRF: el dominio soportado va en userinfo/query/path pero el HOST real es interno.
    for u in [
        "http://inmuebles24.com.mx@169.254.169.254/latest/meta-data/",
        "http://169.254.169.254/?x=inmuebles24.com.mx",
        "http://127.0.0.1:6379/vivanuncios.com.mx",
    ]:
        assert _detect_source(u) is None, f"SSRF trick aún detecta source: {u}"
    # Host legítimo (dominio soportado o subdominio) sí pasa.
    assert _detect_source("https://www.inmuebles24.com.mx/propiedades/x") == "inmuebles24.com.mx"


def test_aud032_guard_bloquea_destinos_internos():
    from services.url_guard import is_safe_url
    for u in [
        "http://169.254.169.254/latest/meta-data/",   # metadata cloud
        "http://127.0.0.1:6379/",                       # loopback
        "http://10.0.0.5:8080/",                        # privada
        "http://localhost/admin",
    ]:
        assert is_safe_url(u, label="t") is False, f"guard NO bloqueó destino interno: {u}"


def test_aud032_parse_external_url_cablea_guard_y_corta_redirects():
    src = _src("services/url_parser.py")
    m = re.search(r"async def parse_external_url\(.*?\n(?=\nasync def |\ndef |\Z)", src, re.S)
    assert m, "no se encontró parse_external_url"
    body = m.group(0)
    assert "assert_safe_url" in body, "parse_external_url debe llamar al guard anti-SSRF antes del fetch"
    assert "follow_redirects=False" in body, "debe cortar redirects (evita redirect-a-interno / DNS-rebinding)"
