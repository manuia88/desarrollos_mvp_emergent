"""
IE Engine — connector framework + 4 piloto implementations (Phase A2).

Architecture:
- BaseConnector defines the contract every source must satisfy.
- Each subclass implements `test_connection`, `fetch`, `parse`. Phase A2 only
  needs 4 real connectors (NOAA, datos_cdmx, FGJ_CDMX, OSM); the remaining 13
  use StubConnector which always returns mock observations.
- get_connector(source_doc) is the factory consumed by the route layer.
- All connectors degrade to mock data when credentials are missing — never
  crash. is_stub flag in the returned observation marks synthetic rows.

Phase A2 does NOT include parse_manual_upload (Phase A3) nor APScheduler
cron triggers (Phase A4).
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ok(msg: str) -> Tuple[bool, str]:
    return True, msg


def _fail(msg: str) -> Tuple[bool, str]:
    return False, msg


# ─── Base ────────────────────────────────────────────────────────────────────
class BaseConnector:
    source_id: str = ""

    def __init__(self, source_doc: Dict[str, Any], credentials: Dict[str, str]):
        self.source = source_doc
        self.credentials = credentials or {}

    # ── public contract ────────────────────────────────────────────────────
    async def test_connection(self) -> Tuple[bool, str]:
        """Lightweight ping that proves credentials/endpoint are valid."""
        raise NotImplementedError

    async def fetch(self, since: Optional[datetime] = None, zone_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Fetch raw observations. MUST never raise — return mock_data() on failure."""
        raise NotImplementedError

    def parse(self, raw: Any) -> List[Dict[str, Any]]:
        """Normalize a raw payload into observation dicts (no DB writes)."""
        if isinstance(raw, list):
            return raw
        return [{"payload": raw}]

    # ── helpers ────────────────────────────────────────────────────────────
    def _stub_obs(self, n: int = 5, **base) -> List[Dict[str, Any]]:
        """Build deterministic-ish synthetic observations marked is_stub=True."""
        out = []
        for i in range(n):
            out.append({
                "source_id": self.source_id or self.source.get("id"),
                "zone_id": base.get("zone_id"),
                "payload": {**base, "stub_index": i, "label": f"{self.source.get('id','?')}-stub-{i}"},
                "fetched_at": _now(),
                "is_stub": True,
                "upload_id": None,
            })
        return out

    def _real_obs(self, payload: Any, zone_id: Optional[str] = None) -> Dict[str, Any]:
        return {
            "source_id": self.source_id or self.source.get("id"),
            "zone_id": zone_id,
            "payload": payload,
            "fetched_at": _now(),
            "is_stub": False,
            "upload_id": None,
        }


# ─── 1. NOAA — api_key ───────────────────────────────────────────────────────
class NOAAConnector(BaseConnector):
    source_id = "noaa"
    BASE = "https://www.ncei.noaa.gov/cdo-web/api/v2"

    async def test_connection(self) -> Tuple[bool, str]:
        token = self.credentials.get("api_key") or os.environ.get("IE_NOAA_API_KEY")
        if not token:
            return _fail("Falta IE_NOAA_API_KEY o credential api_key.")
        try:
            async with httpx.AsyncClient(timeout=10) as http:
                r = await http.get(f"{self.BASE}/datasets", headers={"token": token}, params={"limit": 1})
            if r.status_code == 200:
                return _ok(f"NOAA OK · {r.json().get('metadata', {}).get('resultset', {}).get('count', 0)} datasets disponibles.")
            if r.status_code in (401, 403):
                return _fail(f"NOAA rechazó el token (HTTP {r.status_code}).")
            return _fail(f"NOAA HTTP {r.status_code}.")
        except httpx.HTTPError as e:
            return _fail(f"Error de red NOAA: {e}")

    async def fetch(self, since=None, zone_id=None) -> List[Dict[str, Any]]:
        token = self.credentials.get("api_key") or os.environ.get("IE_NOAA_API_KEY")
        if not token:
            return self._stub_obs(n=5, station="STUB_GHCND_USW00094728", element="TAVG")
        try:
            async with httpx.AsyncClient(timeout=15) as http:
                r = await http.get(
                    f"{self.BASE}/data",
                    headers={"token": token},
                    params={"datasetid": "GHCND", "stationid": "GHCND:USW00094728",
                            "startdate": "2024-01-01", "enddate": "2024-01-07", "limit": 10},
                )
            if r.status_code != 200:
                return self._stub_obs(n=3, error=f"http {r.status_code}")
            results = r.json().get("results", [])
            return [self._real_obs(x, zone_id=zone_id) for x in results] or self._stub_obs(n=3)
        except httpx.HTTPError:
            return self._stub_obs(n=3)


# ─── 2. datos.cdmx — ckan_resource ───────────────────────────────────────────
class DatosCDMXConnector(BaseConnector):
    source_id = "datos_cdmx"

    def _base_url(self) -> str:
        return (self.credentials.get("base_url")
                or os.environ.get("IE_DATOS_CDMX_BASE_URL")
                or "https://datos.cdmx.gob.mx/api/3/action")

    def _resource(self) -> Optional[str]:
        return self.credentials.get("resource_id")

    async def test_connection(self) -> Tuple[bool, str]:
        url = f"{self._base_url()}/site_read"
        try:
            async with httpx.AsyncClient(timeout=10) as http:
                r = await http.get(url)
            if r.status_code == 200 and r.json().get("success"):
                return _ok("Portal datos.cdmx CKAN responde OK.")
            return _fail(f"datos.cdmx HTTP {r.status_code}.")
        except httpx.HTTPError as e:
            return _fail(f"Error de red datos.cdmx: {e}")

    async def fetch(self, since=None, zone_id=None) -> List[Dict[str, Any]]:
        rid = self._resource()
        if not rid:
            return self._stub_obs(n=4, note="Sin resource_id — configura uno desde 'Conectar'.")
        try:
            async with httpx.AsyncClient(timeout=20) as http:
                r = await http.get(f"{self._base_url()}/datastore_search", params={"resource_id": rid, "limit": 25})
            if r.status_code != 200 or not r.json().get("success"):
                return self._stub_obs(n=3, error=f"http {r.status_code}")
            records = r.json().get("result", {}).get("records", [])
            return [self._real_obs(x, zone_id=zone_id) for x in records] or self._stub_obs(n=3)
        except httpx.HTTPError:
            return self._stub_obs(n=3)


# ─── 3. FGJ CDMX — ckan_resource (mismo CKAN, distinto resource_id) ─────────
class FGJCDMXConnector(DatosCDMXConnector):
    source_id = "fgj_cdmx"

    def _resource(self) -> Optional[str]:
        return self.credentials.get("resource_id") or os.environ.get("IE_FGJ_CDMX_RESOURCE_ID")


# ─── 4. OSM Overpass — keyless_url ───────────────────────────────────────────
class OSMOverpassConnector(BaseConnector):
    source_id = "osm_overpass"

    def _endpoint(self) -> str:
        return (os.environ.get("IE_OSM_OVERPASS_URL")
                or self.source.get("endpoint")
                or "https://overpass-api.de/api/interpreter")

    async def test_connection(self) -> Tuple[bool, str]:
        try:
            async with httpx.AsyncClient(timeout=10, headers={"User-Agent": "DesarrollosMX-IE/1.0"}) as http:
                # Tiny POST proves the interpreter responds; /status sometimes 406s without a UA.
                r = await http.post(self._endpoint(), data={"data": "[out:json];out count;"})
            if r.status_code == 200:
                return _ok("Overpass interpreter OK.")
            return _fail(f"Overpass HTTP {r.status_code}.")
        except httpx.HTTPError as e:
            return _fail(f"Error de red Overpass: {e}")

    async def fetch(self, since=None, zone_id=None) -> List[Dict[str, Any]]:
        # Bounding-box pequeño sobre Polanco, CDMX — solo amenities=parking como muestra.
        query = (
            "[out:json][timeout:15];"
            "(node[\"amenity\"=\"parking\"](19.43,-99.21,19.44,-99.20););"
            "out body 5;"
        )
        try:
            async with httpx.AsyncClient(timeout=25, headers={"User-Agent": "DesarrollosMX-IE/1.0"}) as http:
                r = await http.post(self._endpoint(), data={"data": query})
            if r.status_code != 200:
                return self._stub_obs(n=3, error=f"http {r.status_code}")
            elements = r.json().get("elements", [])
            return [self._real_obs(x, zone_id=zone_id) for x in elements] or self._stub_obs(n=3)
        except httpx.HTTPError:
            return self._stub_obs(n=3)


# ─── Named real connectors (Phase B1 — 3 new reals: Banxico, INEGI, AirROI) ──
class BanxicoConnector(BaseConnector):
    source_id = "banxico"
    BASE = "https://www.banxico.org.mx/SieAPIRest/service/v1"
    # SF43718 = Tipo de cambio FIX USD/MXN (serie más estable, buen ping)
    PING_SERIE = "SF43718"

    def _token(self) -> Optional[str]:
        return self.credentials.get("token") or os.environ.get("IE_BANXICO_TOKEN")

    async def test_connection(self) -> Tuple[bool, str]:
        token = self._token()
        if not token:
            return _fail("Falta IE_BANXICO_TOKEN.")
        try:
            async with httpx.AsyncClient(timeout=10) as http:
                r = await http.get(f"{self.BASE}/series/{self.PING_SERIE}/datos/oportuno",
                                   headers={"Bmx-Token": token, "Accept": "application/json"})
            if r.status_code == 200:
                return _ok("Banxico SIE OK.")
            return _fail(f"Banxico HTTP {r.status_code}.")
        except httpx.HTTPError as e:
            return _fail(f"Error de red Banxico: {e}")

    async def fetch(self, since=None, zone_id=None) -> List[Dict[str, Any]]:
        token = self._token()
        if not token:
            return self._stub_obs(n=5, serie=self.PING_SERIE, note="sin token")
        # Multi-serie: USD/MXN + CETES28d + UDIS — base para IE_COL_PLUSVALIA_HIST
        series = "SF43718,SF43936,SP68257"
        try:
            async with httpx.AsyncClient(timeout=15) as http:
                r = await http.get(f"{self.BASE}/series/{series}/datos/oportuno",
                                   headers={"Bmx-Token": token, "Accept": "application/json"})
            if r.status_code != 200:
                return self._stub_obs(n=3, error=f"http {r.status_code}")
            series_list = r.json().get("bmx", {}).get("series", [])
            out: List[Dict[str, Any]] = []
            for s in series_list:
                for d in s.get("datos", []):
                    out.append(self._real_obs({
                        "serie": s.get("idSerie"),
                        "titulo": s.get("titulo"),
                        "fecha": d.get("fecha"),
                        "valor": d.get("dato"),
                    }))
            return out or self._stub_obs(n=3)
        except httpx.HTTPError:
            return self._stub_obs(n=3)


class INEGIConnector(BaseConnector):
    source_id = "inegi"
    # BISE (Banco de Indicadores): 1 token cubre Censo+AGEB+ENIGH+DENUE+SCIAN
    BASE = "https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/INDICATOR"

    def _token(self) -> Optional[str]:
        return self.credentials.get("token") or os.environ.get("IE_INEGI_TOKEN")

    async def test_connection(self) -> Tuple[bool, str]:
        token = self._token()
        if not token:
            return _fail("Falta IE_INEGI_TOKEN.")
        # Indicador 1002000001 = Población total (México), área 00 = nación.
        try:
            async with httpx.AsyncClient(timeout=10) as http:
                r = await http.get(f"{self.BASE}/1002000001/es/00/false/BISE/2.0/{token}?type=json")
            if r.status_code == 200 and "Series" in r.text:
                return _ok("INEGI BISE OK.")
            return _fail(f"INEGI HTTP {r.status_code} · {r.text[:120]}")
        except httpx.HTTPError as e:
            return _fail(f"Error de red INEGI: {e}")

    async def fetch(self, since=None, zone_id=None) -> List[Dict[str, Any]]:
        token = self._token()
        if not token:
            return self._stub_obs(n=5, note="sin token")
        # Set mínimo: población total + edad mediana + ingreso laboral promedio nacional
        indicators = ["1002000001", "1002000002", "6200093976"]
        out: List[Dict[str, Any]] = []
        try:
            async with httpx.AsyncClient(timeout=20) as http:
                for ind in indicators:
                    r = await http.get(f"{self.BASE}/{ind}/es/00/false/BISE/2.0/{token}?type=json")
                    if r.status_code != 200:
                        continue
                    payload = r.json()
                    series = payload.get("Series", [])
                    for s in series:
                        for obs in s.get("OBSERVATIONS", [])[:5]:
                            out.append(self._real_obs({
                                "indicador": ind,
                                "periodo": obs.get("TIME_PERIOD"),
                                "valor": obs.get("OBS_VALUE"),
                            }, zone_id=zone_id))
            return out or self._stub_obs(n=3)
        except httpx.HTTPError:
            return self._stub_obs(n=3)


class AirRoiConnector(BaseConnector):
    source_id = "airroi"
    BASE = "https://api.airroi.com/v1"
    # AirROI costs money per call. Cron never touches this; only explicit recompute.

    def _key(self) -> Optional[str]:
        return self.credentials.get("api_key") or os.environ.get("IE_AIRROI_API_KEY")

    async def test_connection(self) -> Tuple[bool, str]:
        key = self._key()
        if not key:
            return _fail("Falta IE_AIRROI_API_KEY.")
        try:
            async with httpx.AsyncClient(timeout=10) as http:
                r = await http.get(f"{self.BASE}/markets",
                                   headers={"Authorization": f"Bearer {key}"},
                                   params={"limit": 1})
            if r.status_code == 200:
                return _ok("AirROI API OK.")
            if r.status_code == 401:
                return _fail("AirROI key rechazada (401).")
            return _fail(f"AirROI HTTP {r.status_code}.")
        except httpx.HTTPError as e:
            return _fail(f"Error de red AirROI: {e}")

    async def fetch(self, since=None, zone_id=None) -> List[Dict[str, Any]]:
        key = self._key()
        if not key:
            return self._stub_obs(n=4, note="sin key")
        # Pull CDMX markets (cheap; detailed comp queries via recompute with allow_paid)
        try:
            async with httpx.AsyncClient(timeout=15) as http:
                r = await http.get(f"{self.BASE}/markets",
                                   headers={"Authorization": f"Bearer {key}"},
                                   params={"country": "MX", "city": "Mexico City", "limit": 20})
            if r.status_code != 200:
                return self._stub_obs(n=3, error=f"http {r.status_code}")
            items = r.json() if isinstance(r.json(), list) else r.json().get("data", [])
            return [self._real_obs(it, zone_id=zone_id) for it in items] or self._stub_obs(n=3)
        except httpx.HTTPError:
            return self._stub_obs(n=3)


# ─── Stub fallback for the other 13 sources ─────────────────────────────────
class StubConnector(BaseConnector):
    """Used for sources that don't have a real connector yet."""
    async def test_connection(self) -> Tuple[bool, str]:
        return _ok(f"Modo stub para {self.source.get('id')} — devuelve mock data sin red.")

    async def fetch(self, since=None, zone_id=None) -> List[Dict[str, Any]]:
        return self._stub_obs(n=4, mode=self.source.get("access_mode"))


# ─── Named stub connectors (sources with no real API yet): source-specific mocks ──
class SACMEXStub(StubConnector):
    source_id = "sacmex"

    async def fetch(self, since=None, zone_id=None):
        zonas = ["polanco", "condesa", "roma_norte"]
        return [dict(self._stub_obs(n=1, colonia=z, cortes_30d=2 + i, duracion_promedio_h=4 + i * 1.5)[0])
                for i, z in enumerate(zonas)]


class LocatelStub(StubConnector):
    source_id = "locatel"

    async def fetch(self, since=None, zone_id=None):
        return [dict(self._stub_obs(n=1, reporte=f"R-2024-{i:05d}",
                                    tipo="bache" if i % 2 == 0 else "iluminacion")[0])
                for i in range(4)]


class ConaguaSMNStub(StubConnector):
    source_id = "conagua_smn"

    async def test_connection(self):
        return _ok("CONAGUA SMN webservice público — stub no llama (pivot pendiente).")

    async def fetch(self, since=None, zone_id=None):
        return [dict(self._stub_obs(n=1, estacion=f"SMN-{i:03d}", temp_c=21 + i * 0.4, humedad=58 + i)[0])
                for i in range(5)]


class GTFSCDMXStub(StubConnector):
    source_id = "gtfs_cdmx"

    async def test_connection(self):
        url = os.environ.get("IE_GTFS_CDMX_URL")
        if not url:
            return _fail("Falta IE_GTFS_CDMX_URL — DNS gtfs.cdmx.gob.mx pendiente, pivot CKAN.")
        return _ok("GTFS feed URL configurada.")

    async def fetch(self, since=None, zone_id=None):
        modos = ["metro", "metrobus", "ecobici"]
        return [dict(self._stub_obs(n=1, modo=m, lineas=12 - i, estaciones=195 - i * 30)[0])
                for i, m in enumerate(modos)]


class CENAPREDStub(StubConnector):
    source_id = "cenapred"

    async def fetch(self, since=None, zone_id=None):
        capas = ["sismo_microzonificacion", "inundacion_2020", "deslave"]
        return [dict(self._stub_obs(n=1, capa=c, features_count=42 - i * 8)[0])
                for i, c in enumerate(capas)]


# ─── Factory ─────────────────────────────────────────────────────────────────
_REAL: Dict[str, type] = {
    "noaa":         NOAAConnector,
    "datos_cdmx":   DatosCDMXConnector,
    "fgj_cdmx":     FGJCDMXConnector,
    "osm_overpass": OSMOverpassConnector,
    "banxico":      BanxicoConnector,
    "inegi":        INEGIConnector,
    "airroi":       AirRoiConnector,
}

_NAMED_STUBS: Dict[str, type] = {
    "sacmex":      SACMEXStub,
    "locatel":     LocatelStub,
    "conagua_smn": ConaguaSMNStub,
    "gtfs_cdmx":   GTFSCDMXStub,
    "cenapred":    CENAPREDStub,
}


def get_connector(source_doc: Dict[str, Any], credentials: Dict[str, str]) -> BaseConnector:
    sid = source_doc.get("id")
    cls = _REAL.get(sid) or _NAMED_STUBS.get(sid) or StubConnector
    return cls(source_doc, credentials)


def connector_kind(source_id: str) -> str:
    if source_id in _REAL:
        return "real"
    if source_id in _NAMED_STUBS:
        return "named_stub"
    return "stub"


def new_job_id() -> str:
    return f"job_{uuid.uuid4().hex[:12]}"
