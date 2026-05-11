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

_LLMS_TXT = """\
# DesarrollosMX (DMX)

Spatial decision intelligence platform for LATAM real estate.  
Mexico City focus · 700+ colonias indexed · Dubai expansion planned.

## Data offerings

- **IE Engine** — 23+ scores per property (zone, project, unit scope). See /methodology
- **DRPI Index** — hedonic regression price index per colonia (monthly). See /api/zones/{zone_id}/scores
- **Risk Score** — 4-dim composite: crime (SESNSP) + natural hazards (CENAPRED) + perception (ENVIPE) + title heuristic
- **700+ CDMX colonias** indexed with structured demographic + market data
- **Comparable analytics** — absorption velocity, sold-out velocity, new-launch detection per colonia

## Recommended starting points

- `/methodology` — full methodology, R², and data sources
- `/inteligencia` — overview of 97 IE indicators
- `/api/openapi.json` — OpenAPI v3 spec (full API surface)
- `/api/mcp` — Model Context Protocol HTTP endpoint (5 tools, see tools/list)
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

founder@desarrollosmx.com · https://desarrollosmx.com
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
    "/desarrollo/altavista-polanco",
    "/desarrollo/polanco-moderno",
    "/desarrollo/condesa-terraza",
    "/desarrollo/roma-norte-orquidea",
    "/desarrollo/santa-fe-one",
    "/desarrollo/coyoacan-jardin",
    "/desarrollo/narvarte-35",
    "/desarrollo/napoles-loft",
    "/desarrollo/doctores-68",
    "/desarrollo/tamaulipas-89",
    "/widget/bank-avm",
    "/widget/insurance-risk",
]


@router.get("/llms.txt", response_class=PlainTextResponse)
async def serve_llms_txt():
    return PlainTextResponse(_LLMS_TXT, media_type="text/plain; charset=utf-8")


@router.get("/sitemap.xml")
async def serve_sitemap(request: Request):
    """Dynamic sitemap: base URLs + SEO filter combos from db.seo_filter_combos."""
    # Base static URLs
    entries = list(_SITEMAP_URLS)

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
        "contact_email": "founder@desarrollosmx.com",
        "legal_info_url": f"{BASE_URL}/terminos",
    }
