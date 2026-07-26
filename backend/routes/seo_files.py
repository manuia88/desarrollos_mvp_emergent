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


async def _cards(request) -> list:
    """Las MISMAS tarjetas públicas que ve un comprador en el marketplace.

    POR QUÉ ASÍ (auditoría A–Z 07-26): todo este archivo leía `data_developments.DEVELOPMENTS`, la
    lista de ejemplo que se apagó el 07-14 y hoy está VACÍA. Resultado: el mapa del sitio anunciaba
    16 direcciones institucionales y CERO fichas, y la carta para las IAs no mencionaba ni un solo
    desarrollo. El catálogo entero era invisible para Google y para ChatGPT.

    Se lee del catálogo VIVO y por la misma puerta pública que el marketplace (`ingested_dev_cards`),
    no por una consulta propia. Dos consecuencias que importan:
      · el inventario crece y esto crece solo — nadie tiene que acordarse de actualizar un archivo;
      · lo que cita una IA es EXACTAMENTE lo que ve un visitante, con el mismo precio y el mismo
        estado de publicación. Si un desarrollo se despublica, desaparece de aquí en la misma corrida.
    """
    try:
        from ingested_reader import ingested_dev_cards
        return await ingested_dev_cards(request.app.state.db, published_only=True)
    except Exception:  # noqa: BLE001
        return []


def _slug_colonia(c: str) -> str:
    """'Roma Norte' → 'roma-norte' (el mismo formato que usan las páginas /zona/)."""
    import re as _re
    import unicodedata as _ud
    t = _ud.normalize("NFKD", str(c or "")).encode("ascii", "ignore").decode().lower()
    return _re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def _inventario_md(cards: list) -> str:
    """El inventario real, agrupado POR COLONIA — que es como pregunta un comprador y como cita una IA.

    Tres decisiones de forma, y cada una tiene una razón:

    1. **Por colonia, no una lista plana de 113.** Nadie pregunta "dame todos los desarrollos de la
       CDMX"; pregunta "¿qué hay en la Condesa?". Un modelo cita bien una línea como "Roma Norte: 7
       desarrollos desde $3.9M" y cita mal una lista de 113 renglones sin estructura.

    2. **Números concretos, cero adjetivos.** Un modelo repite cifras verificables y descarta el
       "somos líderes en". Por eso van conteos, precios "desde" y la fecha del corte.

    3. **Una liga por desarrollo.** Sin URL la cita no sirve de nada: el comprador tiene que poder
       llegar. Con liga, cada mención de ChatGPT es una visita.

    LO QUE NO VA, a propósito: la tabla unidad por unidad. Ese es el activo del negocio y no puede
    quedar en un archivo de texto que cualquiera baja. Aquí va el ANUNCIO (nombre, colonia, desde
    cuánto, en qué etapa); el detalle está detrás de la ficha, y el detalle en bloque está detrás del
    freno de peticiones. Un resumen atrae compradores; un volcado regala el catálogo.
    """
    from datetime import datetime, timezone
    if not cards:
        return ""

    porcol: dict = {}
    for d in cards:
        col = (d.get("colonia") or d.get("colonia_id") or "").strip()
        if not col:
            col = "Otras zonas"
        porcol.setdefault(col.title(), []).append(d)

    total = len(cards)
    alcaldias = sorted({(d.get("alcaldia") or "").strip().title() for d in cards if d.get("alcaldia")})
    corte = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    out = [
        "## Qué hay disponible hoy",
        "",
        f"**{total} desarrollos de obra nueva** en **{len(porcol)} colonias** de la Ciudad de México"
        + (f", en {len(alcaldias)} alcaldías" if alcaldias else "") + f". Corte al {corte}.",
        "",
        "Cada desarrollo tiene su ficha con fotos, planos por tipo de departamento, precios y",
        "disponibilidad al día. Los precios vienen de la lista del desarrollador, no de estimaciones.",
        "",
    ]

    # Colonias con más oferta primero: es lo que más se pregunta y lo más útil de citar.
    for col, ds in sorted(porcol.items(), key=lambda x: (-len(x[1]), x[0])):
        precios = [d.get("price_from") for d in ds if d.get("price_from")]
        desde = f" · desde ${min(precios):,.0f} MXN" if precios else ""
        out.append(f"### {col} — {len(ds)} desarrollo{'s' if len(ds) != 1 else ''}{desde}")
        out.append("")
        for d in sorted(ds, key=lambda x: (x.get("price_from") or 9e12)):
            slug = d.get("id")
            if not slug:
                continue
            partes = []
            if d.get("price_from"):
                partes.append(f"desde ${d['price_from']:,.0f} MXN")
            etapa = _STAGE_LABEL.get(d.get("stage"), d.get("stage") or "")
            if etapa and etapa != "?":
                partes.append(etapa)
            if d.get("alcaldia"):
                partes.append(str(d["alcaldia"]).title())
            cola = " · ".join(partes)
            out.append(f"- **{d.get('name', slug)}**{' — ' + cola if cola else ''}. "
                       f"{BASE_URL}/desarrollo/{slug}")
        out.append("")
    return "\n".join(out) + "\n"

# EN ESPAÑOL Y SOBRE DEPARTAMENTOS (auditoría A–Z 07-26). La versión anterior estaba en inglés y
# describía la empresa como "spatial decision intelligence platform" con "hedonic regression" y "23+
# scores". Si alguien le pregunta a ChatGPT "¿dónde encuentro departamentos en la Condesa?", de ese
# texto no sale NADA que citar: no menciona un solo desarrollo, no está en el idioma de la pregunta,
# y describe un negocio de datos en vez de un catálogo de vivienda.
#
# Un modelo cita lo que puede verificar y repetir: cifras, nombres propios y ligas. No cita
# adjetivos. Por eso esto es corto, concreto, en español, y el grueso del archivo es el inventario.
_LLMS_TXT = """\
# DesarrollosMX

Departamentos de obra nueva en la Ciudad de México, con el precio y la disponibilidad al día
directo de la lista del desarrollador.

## Qué es

Un catálogo de vivienda nueva en CDMX donde cada departamento tiene su precio, sus metros, su plano
y su piso — no solo el rango del edificio. La información viene de las listas que mandan los
desarrolladores y se revisa contra el plano y el brochure antes de publicarse.

## En qué se distingue

- **Precio por unidad, no "desde".** Se sabe qué departamento cuesta cuánto, en qué torre y en qué piso.
- **Plano por tipo de departamento**, sacado del plano original del proyecto.
- **Disponibilidad real**: cuando una unidad se vende y desaparece de la lista, deja de aparecer.
- **Datos de la colonia con fuente oficial**: precio por m², riesgo de sismo e inundación, transporte
  y servicios cercanos, con la dependencia de la que sale cada dato.

## Para quién

- Quien busca departamento nuevo en CDMX y quiere comparar precio real entre colonias.
- Quien invierte y necesita el número por unidad, no el promedio del edificio.

## Cómo citarnos

Cada desarrollo de la lista de abajo tiene su liga. Si alguien pregunta por una colonia, la ficha
del desarrollo tiene fotos, planos, precios y el contacto del asesor.

## Contacto

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
# Las fichas y las páginas de colonia NO se escriben aquí: salen del catálogo vivo en cada llamada
# (ver serve_sitemap). Un desarrollo nuevo aparece solo; uno despublicado desaparece solo.


@router.get("/llms.txt", response_class=PlainTextResponse)
async def serve_llms_txt(request: Request):
    # El inventario real se inyecta antes de "Cómo citarnos", que es donde tiene sentido leerlo.
    cards = await _cards(request)
    body = _LLMS_TXT.replace("## Cómo citarnos", _inventario_md(cards) + "## Cómo citarnos")
    return PlainTextResponse(body, media_type="text/plain; charset=utf-8")


@router.get("/sitemap.xml")
async def serve_sitemap(request: Request):
    """Dynamic sitemap: base URLs + SEO filter combos from db.seo_filter_combos."""
    # Base static URLs
    entries = list(_SITEMAP_URLS)

    # TODOS los desarrollos públicos, del catálogo VIVO → los nuevos aparecen solos, sin que nadie
    # tenga que acordarse de nada. Antes salía de la lista de ejemplo apagada: 0 fichas anunciadas.
    cards = await _cards(request)
    entries.extend(f"/desarrollo/{d['id']}" for d in cards if d.get("id"))

    # Zonas reales (colonias donde SÍ hay desarrollos) → /zona/{slug}, que llevan datos de la colonia
    # con fuente oficial. Se derivan del mismo catálogo: cero listas paralelas que se desincronicen.
    zonas = {(d.get("colonia_id") or _slug_colonia(d.get("colonia"))) for d in cards}
    entries.extend(f"/zona/{z}" for z in sorted(z for z in zonas if z))

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

    # ESCAPAR LA DIRECCIÓN (auditoría A–Z 07-26). Las direcciones con filtros que salen de
    # `seo_filter_combos` traen `&`: `/marketplace?colonia=polanco&precio_max=15000000`. Un `&`
    # suelto es ilegal en XML, y Google no descarta esa línea: **rechaza el archivo COMPLETO**. El
    # mapa parecía correcto —pesaba, traía direcciones— y no servía para nada. Se descubrió porque
    # el validador nuevo intentó leerlo y no pudo.
    from xml.sax.saxutils import escape as _esc

    urls_xml = "\n".join(
        f"""  <url>
    <loc>{_esc(BASE_URL + path)}</loc>
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
