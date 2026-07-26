"""El mapa del sitio y la carta para las IAs: que anuncien el catálogo REAL y sean legibles.

POR QUÉ EXISTE ESTA PRUEBA (auditoría A–Z 2026-07-26). Dos fallas convivieron meses sin que nada
avisara, y las dos dejaban el SEO en cero:

  1. Los archivos se armaban de `data_developments.DEVELOPMENTS`, la lista de ejemplo que se apagó
     el 07-14. El mapa anunciaba 16 direcciones institucionales y CERO fichas: los 113 desarrollos
     eran invisibles para Google y para ChatGPT.

  2. El mapa metía direcciones con filtros (`?colonia=polanco&precio_max=…`) sin escapar el `&`.
     Un `&` suelto es ilegal en XML y Google **rechaza el archivo completo**, no la línea. El
     archivo pesaba, traía direcciones, y no servía para nada. Nadie lo habría notado a ojo.

Las dos son invisibles salvo que alguien intente LEER el archivo como lo lee Google. Eso hace esto.
"""
import os
import xml.etree.ElementTree as ET

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"


def _traer(ruta: str) -> str:
    r = requests.get(f"{BASE_URL}/api/seo/{ruta}", timeout=90)
    assert r.status_code == 200, f"{ruta} no responde: HTTP {r.status_code}"
    return r.text


@pytest.fixture(scope="module")
def sitemap():
    return _traer("sitemap.xml")


@pytest.fixture(scope="module")
def llms():
    return _traer("llms.txt")


def test_el_mapa_es_xml_valido(sitemap):
    """Si esto truena, Google descarta el archivo ENTERO y no indexa ni una ficha."""
    try:
        ET.fromstring(sitemap)
    except ET.ParseError as e:
        pytest.fail(f"el mapa del sitio no es XML válido — Google lo rechazaría completo: {e}")


def test_las_direcciones_con_filtros_van_escapadas(sitemap):
    """El caso concreto que rompió el archivo: `&` sin escapar dentro de <loc>.

    Se revisa el TEXTO CRUDO, no el XML ya interpretado: al leerlo, el intérprete convierte `&amp;`
    de vuelta en `&`, así que mirar ahí siempre encontraría un `&` y la prueba no probaría nada.
    """
    import re
    sueltos = re.findall(r"&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9A-Fa-f]+;)", sitemap)
    assert not sueltos, (
        f"hay {len(sueltos)} '&' sin escapar en el mapa del sitio. Google rechaza el archivo "
        f"COMPLETO por esto, no solo la línea — las direcciones con filtros "
        f"(?colonia=x&precio_max=y) tienen que escribirse con &amp;")


def test_el_mapa_anuncia_el_catalogo_real(sitemap):
    """El mapa tiene que traer fichas de desarrollo, no solo páginas institucionales."""
    raiz = ET.fromstring(sitemap)
    locs = [(e.text or "") for e in raiz.iter(NS + "loc")]
    fichas = [l for l in locs if "/desarrollo/" in l]
    assert fichas, ("el mapa no anuncia NI UNA ficha — es el síntoma exacto de estar leyendo la "
                    "lista de ejemplo apagada en vez del catálogo vivo")


def test_la_carta_para_las_ias_menciona_desarrollos(llms):
    """Si no nombra desarrollos con su liga, una IA no tiene qué citar cuando le preguntan
    '¿dónde hay departamentos en la Condesa?'."""
    assert "/desarrollo/" in llms, "llms.txt no menciona ni un desarrollo: no hay nada que citar"
    assert "## Qué hay disponible hoy" in llms, "falta el bloque de inventario"


def test_la_carta_no_filtra_dato_interno(llms):
    """Lo que se publica es el ANUNCIO (nombre, colonia, desde cuánto), nunca el activo.

    La tabla unidad por unidad, las comisiones, los puntajes internos y las rutas del disco NO
    pueden salir en un archivo de texto que cualquiera descarga.
    """
    prohibido = ["comisi", "commission", "/Users/", "dmx_data", "drive.google",
                 "ie_score", "zone_score", "unit_number", "fuente_lista"]
    encontrados = [p for p in prohibido if p.lower() in llms.lower()]
    assert not encontrados, f"llms.txt está filtrando dato interno: {encontrados}"
