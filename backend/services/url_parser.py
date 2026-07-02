"""Phase 4 Batch 25 · services — URL Parser para portales inmobiliarios.

Parsers para: Inmuebles24, Vivanuncios, EasyBroker.
Estrategia: JSON-LD structured data → Open Graph meta → selectores específicos.
Los sitios usan JS rendering pero el SSR inicial suele incluir JSON-LD y OG tags.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

log = logging.getLogger("dmx.url_parser")

SUPPORTED_SOURCES = ["inmuebles24.com.mx", "vivanuncios.com.mx", "easybroker.com"]

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
}


def _detect_source(url: str) -> Optional[str]:
    # [AUD-032] Validar por HOSTNAME real, no por substring de la URL completa. Antes `if src in url_lower`
    # dejaba pasar `http://inmuebles24.com.mx@169.254.169.254/...` o `http://10.0.0.5/?x=inmuebles24.com.mx`
    # (el dominio soportado en userinfo/query/path) → el fetch iba a un destino interno (SSRF).
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return None
    for src in SUPPORTED_SOURCES:
        if host == src or host.endswith("." + src):
            return src
    return None


def _parse_price(raw: str) -> Optional[int]:
    """Extrae precio numérico de cadena como '$2,500,000', 'MXN 2500000', etc."""
    if not raw:
        return None
    cleaned = re.sub(r"[^\d]", "", str(raw))
    try:
        return int(cleaned) if cleaned else None
    except Exception:
        return None


def _extract_jsonld(soup: BeautifulSoup) -> List[Dict]:
    """Extrae todos los bloques JSON-LD del HTML."""
    blocks = []
    for tag in soup.find_all("script", {"type": "application/ld+json"}):
        try:
            data = json.loads(tag.string or "")
            if isinstance(data, list):
                blocks.extend(data)
            elif isinstance(data, dict):
                blocks.append(data)
        except Exception:
            pass
    return blocks


def _from_og(soup: BeautifulSoup, prop: str) -> Optional[str]:
    tag = soup.find("meta", {"property": f"og:{prop}"}) or \
          soup.find("meta", {"name": f"og:{prop}"})
    return tag.get("content") if tag else None


def _from_meta(soup: BeautifulSoup, *names: str) -> Optional[str]:
    for name in names:
        tag = soup.find("meta", {"name": name}) or \
              soup.find("meta", {"property": name})
        if tag:
            return tag.get("content")
    return None


# ─── Inmuebles24 ──────────────────────────────────────────────────────────────

async def _parse_inmuebles24(url: str, soup: BeautifulSoup) -> Dict[str, Any]:
    result: Dict[str, Any] = {"source": "inmuebles24.com.mx", "original_url": url}

    # JSON-LD first
    jlds = _extract_jsonld(soup)
    for jld in jlds:
        typ = jld.get("@type", "")
        if "RealEstateListing" in typ or "Apartment" in typ or "House" in typ or "Product" in typ:
            result["title"] = jld.get("name") or jld.get("headline")
            offers = jld.get("offers", {})
            if isinstance(offers, dict):
                result["price_mxn"] = _parse_price(str(offers.get("price", "")))
                result["currency"] = offers.get("priceCurrency", "MXN")
            address = jld.get("address", {})
            if isinstance(address, dict):
                result["location"] = {
                    "colonia": address.get("addressLocality"),
                    "alcaldia": address.get("addressRegion"),
                    "lat": None, "lng": None,
                }
            desc = jld.get("description")
            if desc:
                result["description"] = desc[:500]
            imgs = jld.get("image", [])
            if isinstance(imgs, list):
                result["photos"] = [i if isinstance(i, str) else i.get("url", "") for i in imgs[:5]]
            elif isinstance(imgs, str):
                result["photos"] = [imgs]
            break

    # OG fallback
    if not result.get("title"):
        result["title"] = _from_og(soup, "title") or (soup.title.string if soup.title else None)
    if not result.get("photos"):
        og_img = _from_og(soup, "image")
        result["photos"] = [og_img] if og_img else []

    # Selectors específicos Inmuebles24
    if not result.get("price_mxn"):
        price_tag = (
            soup.find("div", {"data-qa": "price-value"}) or
            soup.find("span", class_=re.compile(r"price|precio", re.I)) or
            soup.find("p", class_=re.compile(r"price|precio", re.I))
        )
        if price_tag:
            result["price_mxn"] = _parse_price(price_tag.get_text())

    # Rooms, bathrooms, m2 from meta or text
    full_text = soup.get_text(" ", strip=True)
    # m2 patterns
    m2_match = re.search(r"(\d{2,4})\s*m[²2]?\s*(totales?|construid[ao]s?)?", full_text, re.I)
    if m2_match:
        result["m2_total"] = int(m2_match.group(1))
    # rooms
    rooms_match = re.search(r"(\d+)\s*(recámara|habitación|cuarto|dormitorio)s?", full_text, re.I)
    if rooms_match:
        result["rooms"] = int(rooms_match.group(1))
    baths_match = re.search(r"(\d+)\s*(baño|sanitario)s?", full_text, re.I)
    if baths_match:
        result["bathrooms"] = int(baths_match.group(1))

    # Geolocation from script
    geo_match = re.search(r'"lat(?:itude)?"\s*:\s*([0-9.\-]+).*?"l(?:ng|ong|ongitude)?"\s*:\s*([0-9.\-]+)', full_text[:5000])
    if geo_match:
        try:
            lat, lng = float(geo_match.group(1)), float(geo_match.group(2))
            if 14 < lat < 25 and -120 < lng < -85:  # bounds México
                result.setdefault("location", {})["lat"] = lat
                result.setdefault("location", {})["lng"] = lng
        except Exception:
            pass

    return result


# ─── Vivanuncios ──────────────────────────────────────────────────────────────

async def _parse_vivanuncios(url: str, soup: BeautifulSoup) -> Dict[str, Any]:
    result: Dict[str, Any] = {"source": "vivanuncios.com.mx", "original_url": url}

    jlds = _extract_jsonld(soup)
    for jld in jlds:
        if any(k in jld.get("@type", "") for k in ["RealEstate", "Product", "Listing"]):
            result["title"] = jld.get("name") or jld.get("headline")
            offers = jld.get("offers", {})
            if isinstance(offers, dict):
                result["price_mxn"] = _parse_price(str(offers.get("price", "")))

    # OG fallback
    if not result.get("title"):
        result["title"] = _from_og(soup, "title") or (soup.title.string if soup.title else None)
    if not result.get("price_mxn"):
        price_tag = soup.find(class_=re.compile(r"price|precio|valor", re.I))
        if price_tag:
            result["price_mxn"] = _parse_price(price_tag.get_text())

    og_img = _from_og(soup, "image")
    result["photos"] = [og_img] if og_img else []

    desc = _from_og(soup, "description") or _from_meta(soup, "description")
    if desc:
        result["description"] = desc[:500]

    full_text = soup.get_text(" ", strip=True)
    m2_match = re.search(r"(\d{2,4})\s*m[²2]", full_text, re.I)
    if m2_match:
        result["m2_total"] = int(m2_match.group(1))
    rooms_match = re.search(r"(\d+)\s*(recámara|cuarto)s?", full_text, re.I)
    if rooms_match:
        result["rooms"] = int(rooms_match.group(1))

    return result


# ─── EasyBroker ───────────────────────────────────────────────────────────────

async def _parse_easybroker(url: str, soup: BeautifulSoup) -> Dict[str, Any]:
    result: Dict[str, Any] = {"source": "easybroker.com", "original_url": url}

    # EasyBroker suele tener datos en window.__INITIAL_STATE__ o JSON-LD
    scripts = soup.find_all("script")
    for s in scripts:
        text = s.string or ""
        if "INITIAL_STATE" in text or '"listing"' in text:
            # Buscar objetos de precio/ubicación
            price_m = re.search(r'"price"\s*:\s*"?(\d+)', text)
            if price_m:
                result["price_mxn"] = int(price_m.group(1))
            lat_m = re.search(r'"lat(?:itude)?"\s*:\s*([0-9.\-]+)', text)
            lng_m = re.search(r'"l(?:ng|ong|ongitude)?"\s*:\s*([0-9.\-]+)', text)
            if lat_m and lng_m:
                try:
                    result.setdefault("location", {})
                    result["location"]["lat"] = float(lat_m.group(1))
                    result["location"]["lng"] = float(lng_m.group(1))
                except Exception:
                    pass
            break

    jlds = _extract_jsonld(soup)
    for jld in jlds:
        if any(k in str(jld.get("@type", "")) for k in ["RealEstate", "Product", "House", "Apartment"]):
            result["title"] = result.get("title") or jld.get("name")
            if not result.get("price_mxn"):
                offers = jld.get("offers", {})
                if isinstance(offers, dict):
                    result["price_mxn"] = _parse_price(str(offers.get("price", "")))
            break

    if not result.get("title"):
        result["title"] = _from_og(soup, "title") or (soup.title.string if soup.title else None)
    og_img = _from_og(soup, "image")
    result["photos"] = [og_img] if og_img else []

    desc = _from_og(soup, "description") or _from_meta(soup, "description")
    if desc:
        result["description"] = desc[:500]

    full_text = soup.get_text(" ", strip=True)
    m2_match = re.search(r"(\d{2,4})\s*m[²2]", full_text, re.I)
    if m2_match:
        result["m2_total"] = int(m2_match.group(1))
    rooms_match = re.search(r"(\d+)\s*(recámara|habitación|cuarto|dormitorio)s?", full_text, re.I)
    if rooms_match:
        result["rooms"] = int(rooms_match.group(1))
    baths_match = re.search(r"(\d+)\s*(baño)s?", full_text, re.I)
    if baths_match:
        result["bathrooms"] = int(baths_match.group(1))

    return result


# ─── Main dispatcher ──────────────────────────────────────────────────────────

async def parse_external_url(url: str) -> Dict[str, Any]:
    """
    Detecta la fuente y parsea la propiedad.
    Devuelve dict con campos extraídos o error si fuente no soportada.
    """
    if not url or not url.startswith(("http://", "https://")):
        return {
            "error": "URL inválida",
            "supported": SUPPORTED_SOURCES,
        }

    source = _detect_source(url)
    if not source:
        return {
            "error": "Source no soportado",
            "supported": SUPPORTED_SOURCES,
        }

    # [AUD-032] Guard anti-SSRF ANTES del fetch (reusa el canónico services.url_guard, igual que
    # parallax_engine): bloquea localhost / IP privada-reservada / metadata de nube (169.254.169.254).
    # Endpoint anónimo → sin esto, un atacante hacía que el server leyera servicios internos.
    try:
        from services.url_guard import assert_safe_url
        assert_safe_url(url, label="external_search")
    except Exception:
        return {"error": "URL no permitida", "supported": SUPPORTED_SOURCES}

    try:
        async with httpx.AsyncClient(
            headers=_HEADERS,
            timeout=10.0,
            follow_redirects=False,  # [AUD-032] un redirect a destino interno evadiría el guard (DNS-rebinding)
            limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            html = resp.text
    except httpx.HTTPStatusError as e:
        return {
            "error": f"HTTP {e.response.status_code} al acceder a la URL",
            "source": source,
            "supported": SUPPORTED_SOURCES,
        }
    except httpx.TimeoutException:
        return {
            "error": "Tiempo de espera agotado al acceder al portal",
            "source": source,
            "supported": SUPPORTED_SOURCES,
        }
    except Exception as e:
        log.warning(f"[url_parser] fetch failed for {source}: {e}")
        return {
            "error": f"No se pudo acceder al portal: {str(e)[:80]}",
            "source": source,
            "supported": SUPPORTED_SOURCES,
        }

    soup = BeautifulSoup(html, "lxml")

    try:
        if "inmuebles24" in source:
            result = await _parse_inmuebles24(url, soup)
        elif "vivanuncios" in source:
            result = await _parse_vivanuncios(url, soup)
        elif "easybroker" in source:
            result = await _parse_easybroker(url, soup)
        else:
            return {"error": "Source no soportado", "supported": SUPPORTED_SOURCES}
    except Exception as e:
        log.error(f"[url_parser] parser failed for {source}: {e}")
        return {
            "error": "Error al parsear la página",
            "source": source,
            "supported": SUPPORTED_SOURCES,
        }

    # Limpiar NaN/None photos
    result["photos"] = [p for p in result.get("photos", []) if p]

    # Verificar que tenemos datos mínimos
    if not result.get("title") and not result.get("price_mxn"):
        result["warning"] = "Datos limitados disponibles. El sitio puede requerir JavaScript."

    return result
