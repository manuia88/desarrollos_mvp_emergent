"""Atlax F3 — bloques generativos.

Convierte la INTENCIÓN de una consulta en UI estructurada (tabla comparativa, tarjetas, …) con DATOS REALES
(DEVELOPMENTS / motores existentes). Cero dato inventado. El front (AtlaxBubble) renderiza message.blocks=[{type,data}].

Hoy:
- `comparison_table` — cuando la consulta menciona ≥2 zonas (colonias con desarrollos), arma la comparativa real.
- `development_cards` — cuando es una búsqueda con una zona + (opcional) presupuesto, arma las tarjetas de desarrollos.

Reusa DEVELOPMENTS (la misma fuente que /api/zona/{slug}/inversion y el sitemap). Sin HTTP, sin simulate pesado.
"""
import asyncio
import unicodedata


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s or "").lower())
    return "".join(c for c in s if not unicodedata.combining(c)).strip()


def _devs():
    try:
        from data_developments import DEVELOPMENTS
        return DEVELOPMENTS
    except Exception:
        return []


def _known_zones() -> dict:
    """{slug: display_name} de las colonias CON desarrollos (zonas con contenido real)."""
    out = {}
    for d in _devs():
        slug = (d.get("colonia_id") or "").strip()
        if slug and slug not in out:
            out[slug] = d.get("colonia") or slug.replace("-", " ").title()
    return out


def _pm2(d) -> float | None:
    p = d.get("price_from")
    m2 = (d.get("m2_range") or [0])[0]
    return (p / m2) if (p and m2) else None


async def _zone_row(db, slug: str, name: str):
    """Métricas REALES de la zona: lo barato desde DEVELOPMENTS (precio/recámaras/etapa) + plusvalía del motor
    investment_simulator (best-effort, mismo cálculo que /api/zona/{slug}/inversion). Cero dato inventado."""
    devs = [d for d in _devs() if d.get("colonia_id") == slug]
    if not devs:
        return None
    precios = [d.get("price_from") for d in devs if d.get("price_from")]
    precios_to = [(d.get("price_to") or d.get("price_from")) for d in devs if d.get("price_from")]
    pm2s = [v for v in (_pm2(d) for d in devs) if v]
    beds = [b for d in devs for b in (d.get("bedrooms_range") or []) if isinstance(b, (int, float))]
    row = {
        "slug": slug, "name": name,
        "alcaldia": next((d.get("alcaldia") for d in devs if d.get("alcaldia")), None),
        "n_desarrollos": len(devs),
        "precio_desde": min(precios) if precios else None,
        "precio_hasta": max(precios_to) if precios_to else None,
        "precio_m2": round(sum(pm2s) / len(pm2s)) if pm2s else None,
        "recamaras": [int(min(beds)), int(max(beds))] if beds else None,
        "entrega_inmediata": sum(1 for d in devs if d.get("stage") == "entrega_inmediata"),
        "plusvalia_pct": None,
    }
    # Plusvalía REAL (motor) sobre un depto representativo de la zona — best-effort, no rompe si falla.
    try:
        rep = (round(sum(precios) / len(precios)) if precios else None) or ((row["precio_m2"] or 0) * 80) or None
        if rep and db is not None:
            from investment_simulator_engine import simulate
            sim = await simulate(db, rep, 60, 80, slug, financiamiento_pct=0.80)
            row["plusvalia_pct"] = ((sim or {}).get("base") or {}).get("aprec_anual_pct")
    except Exception:
        pass
    return row


def _detect_zones(query: str):
    """[(slug, name)] de zonas mencionadas en la consulta (match normalizado contra colonias con datos)."""
    nq = _norm(query)
    out, seen = [], set()
    # ordena por nombre más largo primero → "roma norte" gana sobre "roma"
    for slug, name in sorted(_known_zones().items(), key=lambda kv: -len(kv[1])):
        if slug in seen:
            continue
        if _norm(name) in nq or _norm(slug.replace("-", " ")) in nq:
            out.append((slug, name))
            seen.add(slug)
    return out


def _dev_card(d) -> dict:
    """Tarjeta de desarrollo (datos reales) — el front la pinta con su componente."""
    return {
        "id": d.get("id"),
        "name": d.get("name"),
        "colonia": d.get("colonia") or d.get("colonia_id"),
        "alcaldia": d.get("alcaldia"),
        "price_from": d.get("price_from"),
        "price_display": d.get("price_from_display"),
        "image": (d.get("photos") or [None])[0],
        "stage": d.get("stage"),
        "bedrooms_range": d.get("bedrooms_range"),
        "url": f"/desarrollo/{d.get('id')}" if d.get("id") else None,
    }


async def build_generative_blocks(db, query: str) -> list:
    """Bloques generativos para una consulta. Cero dato inventado; vacío si no aplica (degrada a solo-texto)."""
    blocks = []
    try:
        zones = _detect_zones(query)
        # 1) COMPARATIVA — ≥2 zonas mencionadas
        if len(zones) >= 2:
            rows = [r for r in await asyncio.gather(*[_zone_row(db, s, n) for s, n in zones[:4]]) if r]
            if len(rows) >= 2:
                blocks.append({"type": "comparison_table", "data": {"zones": rows}})
                return blocks  # comparativa gana; no mezclamos con tarjetas
        # 2) TARJETAS — 1 zona mencionada en una consulta de búsqueda
        if len(zones) == 1:
            slug, _name = zones[0]
            nq = _norm(query)
            looks_search = any(w in nq for w in (
                "depa", "departamento", "casa", "propiedad", "desarrollo", "compr", "busc",
                "muestr", "ensename", "ver ", "vivir", "preventa", "millones", "mdp", "presupuesto"))
            if looks_search:
                devs = [d for d in _devs() if d.get("colonia_id") == slug and d.get("price_from")]
                devs.sort(key=lambda d: d.get("price_from") or 0)
                cards = [_dev_card(d) for d in devs[:4]]
                if cards:
                    blocks.append({"type": "development_cards", "data": {"zona": _name, "cards": cards}})
    except Exception:
        return []
    return blocks
