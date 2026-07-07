"""Geocodificador de direcciones → (lat, lng). Usa Mapbox (MAPBOX_TOKEN ya configurado; sin key nueva de Google).

Por qué: la ingesta masiva casi nunca extrae coordenadas de los PDFs (10/13 devs con lat/lng NULL). Sin lat/lng el
proyecto NO cae en el mapa del marketplace ni en la celda atómica. Este motor convierte la dirección (calle + colonia
+ alcaldía) en coordenadas, con sesgo a CDMX para no confundir calles del mismo nombre en otra ciudad.

Diseño: fail-open (nunca rompe la ingesta), cacheado por texto de dirección, umbral de relevancia para no pegar
coordenadas basura. Si algún día se prefiere Google, basta cambiar `_mapbox_forward` por un `_google_forward` con la
misma firma (address→(lat,lng,relevance)).
"""
from __future__ import annotations

import logging
import os
from typing import Optional, Tuple

log = logging.getLogger("dmx.geocode")

# Sesgo geográfico a la Zona Metropolitana del Valle de México (evita match de calle homónima en otra ciudad).
_CDMX_PROXIMITY = "-99.1332,19.4326"          # Zócalo CDMX (lng,lat)
_CDMX_BBOX = "-99.365,19.05,-98.94,19.60"     # bbox aprox ZMVM (minLng,minLat,maxLng,maxLat)
_MIN_RELEVANCE = 0.55                          # por debajo de esto no confiamos en el resultado

_cache: dict[str, Tuple[Optional[float], Optional[float]]] = {}


def _token() -> Optional[str]:
    tok = os.environ.get("MAPBOX_TOKEN") or os.environ.get("REACT_APP_MAPBOX_TOKEN")
    if tok:
        return tok
    # Fallback: leer backend/.env directo (para scripts/backfills que no cargan dotenv). El server sí lo tiene en env.
    try:
        here = os.path.dirname(os.path.abspath(__file__))
        with open(os.path.join(here, ".env")) as fh:
            for line in fh:
                if line.strip().startswith("MAPBOX_TOKEN="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:  # noqa: BLE001
        pass
    return None


def _query(address: Optional[str], colonia: Optional[str], alcaldia: Optional[str],
           city: str = "Ciudad de México, México") -> str:
    parts = [p for p in (address, colonia, alcaldia, city) if p and str(p).strip()]
    # dedup conservando orden (evita "Juárez, Juárez")
    seen, out = set(), []
    for p in parts:
        k = str(p).strip().lower()
        if k not in seen:
            seen.add(k)
            out.append(str(p).strip())
    return ", ".join(out)


async def _mapbox_forward(q: str, token: str) -> Tuple[Optional[float], Optional[float], float]:
    import httpx
    from urllib.parse import quote
    url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{quote(q)}.json"
    params = {"access_token": token, "country": "mx", "limit": 1, "language": "es",
              "proximity": _CDMX_PROXIMITY, "bbox": _CDMX_BBOX, "types": "address,poi,place"}
    async with httpx.AsyncClient(timeout=float(os.environ.get("GEOCODE_TIMEOUT", "15"))) as c:
        r = await c.get(url, params=params)
        if r.status_code != 200:
            return None, None, 0.0
        feats = (r.json() or {}).get("features") or []
        if not feats:
            return None, None, 0.0
        f = feats[0]
        ctr = f.get("center") or []
        rel = float(f.get("relevance") or 0.0)
        if len(ctr) == 2:
            return ctr[1], ctr[0], rel  # center = [lng, lat] → (lat, lng, relevance)
        return None, None, rel


async def geocode(address: Optional[str] = None, colonia: Optional[str] = None,
                  alcaldia: Optional[str] = None, city: str = "Ciudad de México, México",
                  min_relevance: float = _MIN_RELEVANCE) -> Tuple[Optional[float], Optional[float]]:
    """Dirección → (lat, lng) o (None, None). Fail-open, cacheado. Requiere al menos calle o colonia."""
    if not (address or colonia):
        return None, None
    token = _token()
    if not token:
        return None, None
    q = _query(address, colonia, alcaldia, city)
    if q in _cache:
        return _cache[q]
    try:
        lat, lng, rel = await _mapbox_forward(q, token)
        if lat is None or rel < min_relevance:
            # reintento sin la calle (a veces la calle mal parseada baja la relevancia; la colonia sola centra la zona)
            if address and colonia:
                q2 = _query(None, colonia, alcaldia, city)
                lat2, lng2, rel2 = await _mapbox_forward(q2, token)
                if lat2 is not None and rel2 >= min_relevance:
                    lat, lng = lat2, lng2
                else:
                    lat, lng = None, None
            else:
                lat, lng = None, None
    except Exception as e:  # noqa: BLE001
        log.warning(f"[geocode] fail-open '{q[:60]}': {e}")
        lat, lng = None, None
    _cache[q] = (lat, lng)
    return lat, lng


def available() -> bool:
    return bool(_token())
