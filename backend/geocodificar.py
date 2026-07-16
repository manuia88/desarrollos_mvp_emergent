"""GEOCODIFICAR — dirección → (lat, lng) con OpenStreetMap/Nominatim ($0, sin API de pago).

OSM ya es fuente verificada del stack. Reglas para no poner el pin en el lugar
equivocado (founder 07-16):
  · caché en disco por dirección (Nominatim pide 1 req/seg — no re-consultar),
  · sanity check: el resultado DEBE caer dentro de CDMX/ZMVM (si no, se descarta),
  · devuelve la confianza (importance de OSM) para que el caller decida.
Puro salvo la llamada HTTP; el bounding box y el limpiador son testeables.
"""
from __future__ import annotations

import json
import pathlib
import re
import time
from typing import Any, Dict, Optional

CACHE = pathlib.Path.home() / "dmx_data" / "geocode_cache"
# ZMVM (CDMX + conurbados: Huixquilucan/Naucalpan/etc.) — el pin debe caer aquí
BBOX = {"lat_min": 19.0, "lat_max": 19.9, "lng_min": -99.5, "lng_max": -98.8}
_ultimo = [0.0]


def dentro_de_zmvm(lat: float, lng: float) -> bool:
    return (BBOX["lat_min"] <= lat <= BBOX["lat_max"]
            and BBOX["lng_min"] <= lng <= BBOX["lng_max"])


def limpiar_direccion(dir_: str) -> str:
    """Normaliza para geocodificar: quita 'Alcaldía'/'Col.' abreviaturas ruidosas,
    conserva calle+número+colonia+alcaldía+CP+ciudad."""
    s = re.sub(r"\bAlcald[ií]a\b", "", dir_ or "", flags=re.IGNORECASE)
    s = re.sub(r"\bCol\.\s*", "Colonia ", s, flags=re.IGNORECASE)
    s = re.sub(r"\s+", " ", s).strip().rstrip(".")
    if "méxico" not in s.lower():
        s += ", Ciudad de México, México"
    return s


def _consulta_nominatim(params: Dict[str, str]) -> Optional[Dict[str, Any]]:
    import urllib.parse
    import urllib.request
    espera = 1.1 - (time.time() - _ultimo[0])   # Nominatim: máx 1 req/seg
    if espera > 0:
        time.sleep(espera)
    base = {"format": "json", "limit": 1, "countrycodes": "mx", "addressdetails": 1}
    q = urllib.parse.urlencode({**base, **params})
    req = urllib.request.Request(
        f"https://nominatim.openstreetmap.org/search?{q}",
        headers={"User-Agent": "DesarrollosMX/1.0 (geocode; contacto@desarrollosmx.io)"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())
        _ultimo[0] = time.time()
        return data[0] if data else None
    except Exception:  # noqa: BLE001
        _ultimo[0] = time.time()
        return None


def _partes(direccion: str) -> Dict[str, str]:
    """Descompone 'Calle 122, Col. X, Alcaldía Y, CP 00000, Ciudad de México'."""
    seg = [s.strip() for s in re.split(r",", direccion or "") if s.strip()]
    calle = seg[0] if seg else ""
    colonia = next((re.sub(r"(?i)^col(onia)?\.?\s*", "", s) for s in seg
                    if re.match(r"(?i)^col", s)), "")
    cp = next((re.sub(r"\D", "", s) for s in seg if re.search(r"\d{5}", s)), "")
    alcaldias = ("Cuauhtémoc", "Benito Juárez", "Álvaro Obregón", "Miguel Hidalgo",
                 "Coyoacán", "Gustavo A. Madero", "Huixquilucan", "Naucalpan")
    alcaldia = next((a for a in alcaldias
                     if a.lower() in direccion.lower()
                     or a.replace("á", "a").replace("é", "e").lower()
                     in direccion.lower()), "")
    return {"calle": calle, "colonia": colonia, "cp": cp, "alcaldia": alcaldia}


def _variantes(direccion: str) -> list:
    """Consultas de más a menos específica; se prueba en orden hasta que una caiga
    en ZMVM (así '122 Hortensia' que confunde a full-text sí resuelve estructurado)."""
    p = _partes(direccion)
    out = []
    if p["calle"]:
        out.append({"street": p["calle"], "city": "Ciudad de México",
                    **({"county": p["alcaldia"]} if p["alcaldia"] else {}),
                    **({"postalcode": p["cp"]} if p["cp"] else {})})
    if p["colonia"] and p["alcaldia"]:
        out.append({"q": f"{p['colonia']}, {p['alcaldia']}, Ciudad de México"})
    out.append({"q": limpiar_direccion(direccion)})
    if p["colonia"]:
        out.append({"q": f"Colonia {p['colonia']}, Ciudad de México"})
    return out


def geocodificar(direccion: str, usar_cache: bool = True) -> Optional[Dict[str, Any]]:
    """dirección → {lat, lng, confianza, fuente, display, nivel} o None. Prueba
    variantes: si acierta la calle exacta = nivel 'calle'; si solo la colonia = 'colonia'."""
    if not direccion or not direccion.strip():
        return None
    CACHE.mkdir(parents=True, exist_ok=True)
    clave = re.sub(r"[^a-z0-9]", "_", direccion.lower())[:120]
    ruta = CACHE / f"{clave}.json"
    if usar_cache and ruta.exists():
        c = json.loads(ruta.read_text())
        return c or None
    resultado = None
    for i, params in enumerate(_variantes(direccion)):
        r = _consulta_nominatim(params)
        if not r:
            continue
        lat, lng = float(r["lat"]), float(r["lon"])
        if dentro_de_zmvm(lat, lng):
            resultado = {"lat": round(lat, 6), "lng": round(lng, 6),
                         "confianza": round(float(r.get("importance") or 0), 3),
                         "fuente": "nominatim_osm", "display": r.get("display_name"),
                         "nivel": "calle" if i == 0 else "colonia"}
            break
    ruta.write_text(json.dumps(resultado or {}))
    return resultado


async def geocodificar_dev(db, development_id: str) -> Optional[Dict[str, Any]]:
    """Resuelve el GPS de un dev desde su dirección si aún no tiene lat. Fail-open."""
    d = await db.developments.find_one({"id": development_id},
                                       {"_id": 0, "lat": 1, "address_full": 1,
                                        "address": 1})
    if not d or d.get("lat") is not None:
        return None
    geo = geocodificar(d.get("address_full") or d.get("address") or "")
    if geo:
        center = [geo["lng"], geo["lat"]]
        await db.developments.update_one(
            {"id": development_id},
            {"$set": {"lat": geo["lat"], "lng": geo["lng"], "center": center,
                      "geo_fuente": geo["fuente"], "geo_confianza": geo["confianza"]}})
    return geo
