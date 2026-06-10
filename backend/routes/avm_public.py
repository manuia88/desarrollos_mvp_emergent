"""W4.18.2B Sub-D — AVM público routes + rate limit IP.

Rate limit 30/min/IP (in-memory bucket). Para prod cambiar a Redis.

W5.1 Sub-Chunk C — Añade widget-config (iframe) + landing SEO (JSON-LD) +
flag explain opt-in.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional
from fastapi import APIRouter, HTTPException, Request, Query
from fastapi.responses import JSONResponse

import avm_public_engine as eng

router = APIRouter()

# In-memory rate-limit bucket
_RL_BUCKET: Dict[str, Deque[float]] = defaultdict(deque)
RL_LIMIT = 30
RL_WINDOW_S = 60


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    if fwd:
        return fwd
    return request.client.host if request.client else "unknown"


def _rate_limit_check(ip: str) -> None:
    now = time.time()
    bucket = _RL_BUCKET[ip]
    while bucket and (now - bucket[0]) > RL_WINDOW_S:
        bucket.popleft()
    if len(bucket) >= RL_LIMIT:
        raise HTTPException(429, "rate_limit_exceeded")
    bucket.append(now)


@router.get("/api/avm-public/quick")
async def avm_quick_endpoint(
    request: Request,
    colonia_slug: str = Query(...),
    m2: float = Query(..., gt=0, le=10000),
    recamaras: int = Query(..., ge=0, le=15),
    banos: int = Query(..., ge=0, le=15),
    antiguedad_anos: int = Query(..., ge=0, le=200),
    explain: bool = Query(False),
    # AVM rico (opcional · atributos finos que mueven el precio)
    vista: Optional[str] = Query(None),
    estado_conservacion: Optional[str] = Query(None),
    condicion: Optional[str] = Query(None),
    orientacion: Optional[str] = Query(None),
    nivel: Optional[int] = Query(None),
    n_amenidades: int = Query(0, ge=0),
):
    _rate_limit_check(_client_ip(request))
    attrs = {"vista": vista, "estado_conservacion": estado_conservacion, "condicion": condicion,
             "orientacion": orientacion, "nivel": nivel, "n_amenidades": n_amenidades}
    attrs = {k: v for k, v in attrs.items() if v not in (None, 0, "")} or None
    out = await eng.avm_quick_async(
        request.app.state.db, colonia_slug, m2, recamaras, banos, antiguedad_anos,
        with_explain=explain, attrs=attrs,
    )
    if "error" in out:
        raise HTTPException(404, out["error"])
    return JSONResponse({"ok": True, **out})


@router.get("/api/avm-public/colonia/{slug}")
async def colonia_stats_endpoint(slug: str, request: Request):
    _rate_limit_check(_client_ip(request))
    out = eng.colonia_stats(slug)
    if "error" in out:
        raise HTTPException(404, out["error"])
    return JSONResponse({"ok": True, **out})


@router.get("/api/avm-public/colonias/top")
async def top_colonias(request: Request, limit: int = Query(30, ge=1, le=100)):
    _rate_limit_check(_client_ip(request))  # P2.9 · faltaba rate-limit aquí
    return JSONResponse({"ok": True, "colonias": eng.list_top_colonias(limit), "limit": limit})


# ── W5.1 Sub-Chunk C — Widget config (iframe embed) ───────────────────────────
@router.get("/api/avm-public/widget-config/{colonia_slug}")
async def avm_widget_config(
    colonia_slug: str,
    request: Request,
    theme: str = Query("dark", regex="^(dark|light)$"),
):
    """Devolver configuración mínima del widget iframe-embeddable.

    Theme: dark | light.
    """
    _rate_limit_check(_client_ip(request))
    stats = eng.colonia_stats(colonia_slug)
    if "error" in stats:
        raise HTTPException(404, stats["error"])

    palettes = {
        "dark": {
            "bg": "#06080F",
            "panel": "rgba(13,16,23,0.92)",
            "fg": "#F0EBE0",
            "fg_muted": "rgba(240,235,224,0.65)",
            "accent_a": "#6366F1",
            "accent_b": "#EC4899",
            "border": "rgba(255,255,255,0.10)",
        },
        "light": {
            "bg": "#F0EBE0",
            "panel": "#FFFFFF",
            "fg": "#06080F",
            "fg_muted": "rgba(6,8,15,0.65)",
            "accent_a": "#6366F1",
            "accent_b": "#EC4899",
            "border": "rgba(6,8,15,0.10)",
        },
    }
    palette = palettes[theme]

    return JSONResponse({
        "ok": True,
        "colonia_slug": colonia_slug,
        "colonia_name": stats["name"],
        "price_m2": stats["price_m2"],
        "theme": theme,
        "palette": palette,
        "embed_url": f"/widgets/avm/{colonia_slug}?theme={theme}",
        "landing_url": f"/valor/{colonia_slug}",
        "api_endpoint": "/api/avm-public/quick",
        "rate_limit": {"limit_per_min": RL_LIMIT, "window_s": RL_WINDOW_S},
        "powered_by": "DesarrollosMX",
    })


# ── W5.1 Sub-Chunk C — Landing SEO data (JSON-LD ready) ───────────────────────
@router.get("/api/avm-public/landing/{colonia_slug}")
async def avm_landing(colonia_slug: str, request: Request):
    """Datos enriquecidos para la landing /valor/:slug, incluye JSON-LD.

    Schema.org: WebPage + Place + AggregateOffer.
    """
    _rate_limit_check(_client_ip(request))
    stats = eng.colonia_stats(colonia_slug)
    if "error" in stats:
        raise HTTPException(404, stats["error"])

    # AVM estimación para vivienda "típica" (80m², 2 rec, 2 baños, 8 años)
    sample = await eng.avm_quick_async(
        request.app.state.db, colonia_slug, 80, 2, 2, 8, with_explain=True,
    )

    price_m2 = stats.get("price_m2") or 0
    name = stats["name"]
    canonical_url = f"/valor/{colonia_slug}"

    json_ld = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": f"¿Cuánto vale tu propiedad en {name}? · DesarrollosMX",
        "description": (
            f"Estimación AVM gratuita para {name}, CDMX. Precio promedio "
            f"${price_m2:,} MXN/m². Modelo hedónico OLS · Sin login · Resultado inmediato."
        ),
        "url": canonical_url,
        "isPartOf": {"@type": "WebSite", "name": "DesarrollosMX", "url": "/"},
        "about": {
            "@type": "Place",
            "name": name,
            "address": {
                "@type": "PostalAddress",
                "addressLocality": stats.get("alcaldia") or "CDMX",
                "addressRegion": "Ciudad de México",
                "addressCountry": "MX",
            },
        },
        "mainEntity": {
            "@type": "AggregateOffer",
            "priceCurrency": "MXN",
            "lowPrice": sample.get("range_low"),
            "highPrice": sample.get("range_high"),
            "offerCount": stats.get("total_devs_active") or 0,
            "itemOffered": {
                "@type": "Residence",
                "name": f"Vivienda típica en {name}",
                "floorSize": {"@type": "QuantitativeValue", "value": 80, "unitCode": "MTK"},
                "numberOfRooms": 2,
                "address": {
                    "@type": "PostalAddress",
                    "addressLocality": stats.get("alcaldia") or "CDMX",
                    "addressCountry": "MX",
                },
            },
        },
    }

    breadcrumb_ld = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "DesarrollosMX", "item": "/"},
            {"@type": "ListItem", "position": 2, "name": "Valores", "item": "/valores"},
            {"@type": "ListItem", "position": 3, "name": name, "item": canonical_url},
        ],
    }

    return JSONResponse({
        "ok": True,
        "colonia_slug": colonia_slug,
        "colonia_name": name,
        "alcaldia": stats.get("alcaldia"),
        "price_m2": price_m2,
        "tier": stats.get("tier"),
        "scores": stats.get("scores"),
        "demand_index": stats.get("demand_index"),
        "top_devs": stats.get("top_3_devs"),
        "sample_avm": sample,
        "meta": {
            "title": f"¿Cuánto vale tu propiedad en {name}? · DesarrollosMX",
            "description": (
                f"Estimación AVM gratuita en {name}, CDMX. "
                f"Modelo hedónico OLS · Sin login · Resultado inmediato."
            ),
            "canonical": canonical_url,
            "og_image": f"/og/colonia/{colonia_slug}.png",
        },
        "json_ld": [json_ld, breadcrumb_ld],
    })

# W5.FF4 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff4_register_feature
_w5ff4_register_feature("avm_public", plan_tier="free",       monthly_price_mxn=0,   category="intelligence", name="AVM Público")
_w5ff4_register_feature("valores_landing", plan_tier="free",       monthly_price_mxn=0,   category="growth",      name="Valores Landing")
