"""W4.2B — SEO / GEO static files.

Sirve rutas públicas sin prefijo /api:
  GET /llms.txt              — markdown para crawlers AI
  GET /sitemap.xml           — XML sitemap
  GET /.well-known/ai-plugin.json — OpenAI plugin manifest
"""
from fastapi import APIRouter, Request
from fastapi.responses import PlainTextResponse, Response

router = APIRouter(tags=["seo"])

BASE_URL = "https://desarrollosmx.io"

_STAGE_LABEL = {"preventa": "Preventa", "construccion": "En construcción", "entrega_inmediata": "Entrega inmediata", "terminado": "Terminado"}


def _all_dev_slugs():
    """Slugs (=id) de TODOS los desarrollos reales → sitemap dinámico (ya no hardcodeado)."""
    try:
        from data_developments import DEVELOPMENTS
        return [d["id"] for d in DEVELOPMENTS if d.get("id")]
    except Exception:
        return []


def _dev_inventory_md():
    """Inventario REAL en markdown para llms.txt — lo que los crawlers de IA leen y citan
    (nombre · colonia · desde $ · recámaras · etapa · URL). Cero dato inventado: sale de DEVELOPMENTS."""
    try:
        from data_developments import DEVELOPMENTS
    except Exception:
        return ""
    lines = []
    for d in DEVELOPMENTS:
        slug = d.get("id")
        if not slug:
            continue
        name = d.get("name", slug)
        loc = d.get("colonia") or d.get("colonia_id") or ""
        if d.get("alcaldia"):
            loc = f"{loc}, {d['alcaldia']}"
        stage = _STAGE_LABEL.get(d.get("stage"), d.get("stage") or "")
        prices = [u.get("price") for u in (d.get("units") or []) if u.get("price")]
        desde = f" · desde ${min(prices):,.0f} MXN" if prices else ""
        beds = [b for b in (d.get("bedrooms_range") or []) if isinstance(b, (int, float))]
        rec = f" · {int(min(beds))}–{int(max(beds))} rec" if beds else ""
        lines.append(f"- **{name}** — {loc}{desde}{rec} · {stage}. {BASE_URL}/desarrollo/{slug}")
    if not lines:
        return ""
    return "## Desarrollos disponibles (obra nueva · CDMX)\n\n" + "\n".join(lines) + "\n\n"

_LLMS_TXT = """\
# DesarrollosMX (DMX)

Spatial decision intelligence platform for LATAM real estate.  
Mexico City focus · 700+ colonias indexed · Dubai expansion planned.

## Data offerings

- **IE Engine** — 23+ scores per property (zone, project, unit scope). See /methodology
- **DRPI Index** — hedonic regression price index per colonia (monthly). See /methodology
- **Risk Score** — 4-dim composite: crime (SESNSP) + natural hazards (CENAPRED) + perception (ENVIPE) + title heuristic
- **700+ CDMX colonias** indexed with structured demographic + market data
- **Comparable analytics** — absorption velocity, sold-out velocity, new-launch detection per colonia

## Recommended starting points

- `/methodology` — full methodology, R², and data sources
- `/inteligencia` — overview of 97 IE indicators
- `/api/mcp` — Model Context Protocol HTTP endpoint (5 tools · requiere API key)
- `/connect/mcp` — Setup guide for Claude Desktop / Cursor / ChatGPT

## MCP tools available

1. `get_zone_score` — IE scores for a colonia or development
2. `get_dev_diagnostic` — 6-rule diagnostic with recommended actions
3. `search_developments` — filter developments by colonia/price/stage
4. `get_unit_scores` — unit-level IE_UNIT_* scores
5. `get_methodology` — DRPI + Zone Score + Risk Score methodology

## Compliance

- LFPDPPP México (Ley Federal de Protección de Datos Personales en Posesión de los Particulares)
- k-anonymity ≥ 5 on all aggregate outputs
- Audit trail 5 years
- No PII in API responses (k-anon + suppression)

## Contact

founder@desarrollosmx.io · https://desarrollosmx.io
"""

_SITEMAP_URLS = [
    "/",
    "/methodology",
    "/inteligencia",
    "/marketplace",
    "/connect/mcp",
    "/privacy/dsr",
    "/docs/api",
    "/boletin",
    "/widget/bank-avm",
    "/widget/insurance-risk",
]
# Los /desarrollo/{slug} ya NO se hardcodean: se generan dinámicamente de DEVELOPMENTS (ver serve_sitemap).


@router.get("/llms.txt", response_class=PlainTextResponse)
async def serve_llms_txt():
    # Inyecta el inventario REAL (desarrollos) antes de Contact → los crawlers de IA leen y citan listings reales.
    body = _LLMS_TXT.replace("## Contact", _dev_inventory_md() + "## Contact")
    return PlainTextResponse(body, media_type="text/plain; charset=utf-8")


@router.get("/sitemap.xml")
async def serve_sitemap(request: Request):
    """Dynamic sitemap: base URLs + SEO filter combos from db.seo_filter_combos."""
    # Base static URLs
    entries = list(_SITEMAP_URLS)

    # TODOS los desarrollos reales (dinámico, ya no hardcodeado) → los nuevos aparecen solos
    entries.extend(f"/desarrollo/{s}" for s in _all_dev_slugs())

    # W5.2 — SEO themed landings
    try:
        from routes.seo_themed import all_theme_paths
        entries.extend(all_theme_paths())
    except Exception:
        pass

    # Dynamic combos from MongoDB (if request.app.state.db available)
    try:
        db = request.app.state.db
        combos = await db.seo_filter_combos.find(
            {}, {"_id": 0, "canonical_url": 1}
        ).limit(500).to_list(500)
        for c in combos:
            cu = c.get("canonical_url", "")
            if cu and cu.startswith(BASE_URL):
                path = cu[len(BASE_URL):]
                entries.append(path)
    except Exception:
        pass  # fallback to static only

    seen = set()
    unique_entries = []
    for e in entries:
        if e not in seen:
            seen.add(e)
            unique_entries.append(e)

    urls_xml = "\n".join(
        f"""  <url>
    <loc>{BASE_URL}{path}</loc>
    <changefreq>weekly</changefreq>
    <priority>{'1.0' if path == '/' else '0.7'}</priority>
  </url>"""
        for path in unique_entries
    )
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{urls_xml}
</urlset>"""
    return Response(content=xml, media_type="application/xml")


@router.get("/.well-known/ai-plugin.json")
async def serve_ai_plugin():
    return {
        "schema_version": "v1",
        "name_for_human": "DesarrollosMX",
        "name_for_model": "desarrollosmx",
        "description_for_human": (
            "Spatial decision intelligence for LATAM real estate. "
            "Access IE scores, DRPI price index, risk scores, and diagnostics for 700+ Mexico City colonias."
        ),
        "description_for_model": (
            "DesarrollosMX provides structured real estate intelligence for LATAM (Mexico City). "
            "Use get_zone_score, get_dev_diagnostic, search_developments, get_unit_scores, and get_methodology "
            "to answer questions about property prices, absorption rates, risk, and market comparables. "
            "All data is LFPDPPP-compliant, k-anonymized."
        ),
        "auth": {
            "type": "user_http",
            "authorization_type": "bearer",
        },
        "api": {
            "type": "openapi",
            "url": f"{BASE_URL}/api/openapi.json",
        },
        "logo_url": f"{BASE_URL}/logo192.png",
        "contact_email": "founder@desarrollosmx.io",
        "legal_info_url": f"{BASE_URL}/terminos",
    }
