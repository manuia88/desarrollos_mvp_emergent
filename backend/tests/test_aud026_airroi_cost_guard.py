"""Regresión AUD-026 — incidente de COSTO: AirROI (API de pago) se disparaba en continuo.

Causa raíz: airroi (access_mode 'api_key') caía en CRON_AUTO_INGEST_MODES → los dos crons
(run_hourly_status_check cada hora vía test_connection + run_daily_ingestion diario vía fetch)
lo llamaban ~25×/día sin autorización. Estos tests fallan si alguien revierte cualquiera de las
3 defensas: (1) crons excluyen conectores de pago, (2) kill-switch AIRROI_ENABLED, (3) la ruta
enrich pasa por el candado cacheado+capado _airroi_zone en vez del conector directo.

connectors_ie y dmx_external_enrich se pueden IMPORTAR sin inicializar el cliente LLM (a diferencia
de server.py, ver AUD-025), así que aquí sí hacemos tests de comportamiento reales.
"""
import asyncio
import os
import re

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _src(rel):
    return open(os.path.join(BACKEND, rel), encoding="utf-8").read()


# ─── Defensa 1: los crons NUNCA tocan un conector de pago ───────────────────────
def test_aud026_crons_excluyen_conectores_de_pago():
    src = _src("scheduler_ie.py")
    assert re.search(r'PAID_CONNECTORS\s*=\s*\{[^}]*"airroi"', src), \
        "airroi debe estar en PAID_CONNECTORS"
    # Ambas queries de ingesta/health-check deben excluir PAID_CONNECTORS.
    ingestion_queries = re.findall(
        r'access_mode":\s*\{"\$in":\s*list\(CRON_AUTO_INGEST_MODES\)\}[^}]*\}', src)
    assert len(ingestion_queries) >= 2, \
        f"esperaba las 2 queries de cron (diaria + horaria), encontré {len(ingestion_queries)}"
    for q in ingestion_queries:
        assert "PAID_CONNECTORS" in q and "$nin" in q, \
            f"una query de cron NO excluye conectores de pago (regresión de costo): {q}"


# ─── Defensa 2: kill-switch global AIRROI_ENABLED ───────────────────────────────
def test_aud026_kill_switch_corta_ambas_llamadas():
    import connectors_ie as ci
    prev = os.environ.get("AIRROI_ENABLED")
    os.environ["AIRROI_ENABLED"] = "false"
    try:
        c = ci.AirRoiConnector({"id": "airroi"}, {})
        assert ci.AirRoiConnector._kill_switch_on() is True
        ok, msg = asyncio.run(c.test_connection())
        assert "DESACTIVADO" in msg, f"test_connection debió cortar: {msg}"
        obs = asyncio.run(c.fetch(zone_id="Polanco"))
        assert obs and obs[0].get("is_stub"), "fetch debió devolver stub sin pegar a la API"
    finally:
        if prev is None:
            os.environ.pop("AIRROI_ENABLED", None)
        else:
            os.environ["AIRROI_ENABLED"] = prev


def test_aud026_default_no_desactiva_la_feature():
    """Sin el env (o con cualquier valor 'truthy'), la feature sigue viva por las vías capadas."""
    import connectors_ie as ci
    prev = os.environ.get("AIRROI_ENABLED")
    os.environ.pop("AIRROI_ENABLED", None)
    try:
        assert ci.AirRoiConnector._kill_switch_on() is False
    finally:
        if prev is not None:
            os.environ["AIRROI_ENABLED"] = prev


# ─── Defensa 3: enrich pasa por el candado único (no el conector directo) ───────
def test_aud026_fetch_source_airroi_no_llama_conector_directo():
    src = _src("dmx_external_enrich.py")
    m = re.search(r"async def _fetch_source\(.*?\n(?=\nasync def )", src, re.S)
    assert m, "no se encontró _fetch_source"
    body = m.group(0)
    assert "_airroi_zone" in body, \
        "la ruta airroi debe delegar en _airroi_zone (candado cacheado+capado)"
    assert 'if source_id == "airroi"' in body, "debe interceptar airroi ANTES del conector genérico"


def test_aud026_fetch_source_airroi_sin_db_no_pega():
    """Sin db no hay candado → NO debe salir a la red; devuelve stub."""
    import dmx_external_enrich as e
    r = asyncio.run(e._fetch_source("airroi", "Polanco"))
    assert r["is_stub"] and not r.get("payloads"), \
        "airroi sin db debe ser stub (no llamar a la API de pago)"
