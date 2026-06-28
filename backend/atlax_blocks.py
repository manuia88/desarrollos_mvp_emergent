"""Atlax F3 — bloques generativos.

Convierte la INTENCIÓN de una consulta en UI estructurada (tabla comparativa, tarjetas, simulador de pagos, mapa) con
DATOS REALES (DEVELOPMENTS + motores existentes: investment_simulator, natural_risk). Cero dato inventado. El front
(AtlaxBlocks) renderiza message.blocks=[{type,data}]. Best-effort: vacío → la respuesta degrada a solo texto.

Bloques:
- comparison_table   — ≥2 zonas mencionadas. Métricas: precio (desde/hasta/m²), recámaras, entrega, plusvalía, riesgo.
- development_cards   — búsqueda en 1 zona.
- payment_breakdown   — intención de financiamiento (enganche/hipoteca) + un precio (de la query o de la zona).
- mini_map            — intención de ubicación ("en el mapa") → pins de los desarrollos.
"""
import asyncio
import re
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
    out = {}
    for d in _devs():
        slug = (d.get("colonia_id") or "").strip()
        if slug and slug not in out:
            out[slug] = d.get("colonia") or slug.replace("-", " ").title()
    return out


def _pm2(d):
    p = d.get("price_from")
    m2 = (d.get("m2_range") or [0])[0]
    return (p / m2) if (p and m2) else None


def _zone_price(slug: str):
    """Precio 'desde' de la zona (instantáneo, sin motor) — para el fallback del simulador."""
    precios = [d.get("price_from") for d in _devs() if d.get("colonia_id") == slug and d.get("price_from")]
    return min(precios) if precios else None


async def _zone_row(db, slug: str, name: str):
    """Métricas REALES de la zona: barato desde DEVELOPMENTS + plusvalía (investment_simulator) + riesgo (natural_risk).
    Cero dato inventado; best-effort en los motores (no rompe si fallan)."""
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
        "sismic_zone": None,
        "vida": None,
    }
    try:
        rep = (round(sum(precios) / len(precios)) if precios else None) or ((row["precio_m2"] or 0) * 80) or None
        if rep and db is not None:
            from investment_simulator_engine import simulate
            sim = await simulate(db, rep, 60, 80, slug, financiamiento_pct=0.80)
            row["plusvalia_pct"] = ((sim or {}).get("base") or {}).get("aprec_anual_pct")
    except Exception:
        pass
    try:
        if db is not None:
            import natural_risk_engine as nre
            risk = await nre.compute_natural_risk_zone(db, slug)
            if risk and risk.get("available"):
                row["sismic_zone"] = risk.get("sismic_zone")
    except Exception:
        pass
    # Vida de barrio (densidad de amenidades REAL · denue_zone_density) — señal de "qué tan animada está la zona".
    try:
        if db is not None:
            vd = await db.denue_zone_density.find_one({"zone_id": slug}, {"_id": 0, "businesses_count_total": 1})
            tot = (vd or {}).get("businesses_count_total")
            if tot is not None:
                row["vida"] = "Muy animada" if tot >= 800 else "Animada" if tot >= 350 else "Tranquila"
    except Exception:
        pass
    return row


def _detect_zones(query: str):
    nq = _norm(query)
    out, seen = [], set()
    for slug, name in sorted(_known_zones().items(), key=lambda kv: -len(kv[1])):
        if slug in seen:
            continue
        if _norm(name) in nq or _norm(slug.replace("-", " ")) in nq:
            out.append((slug, name))
            seen.add(slug)
    return out


def _dev_card(d) -> dict:
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


def _extract_price(query: str):
    """Saca un precio del texto: '4M' / '4 millones' / '4mdp' / '$4,500,000'. None si no hay."""
    nq = _norm(query)
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:millones|millon|mdp|m\b)", nq)
    if m:
        return int(float(m.group(1)) * 1_000_000)
    m = re.search(r"\$?\s*([\d,]{6,})", query)
    if m:
        try:
            return int(m.group(1).replace(",", ""))
        except ValueError:
            pass
    return None


def _payment_block(precio):
    """Desglose de pago REAL: enganche 20% + crédito + mensualidad (20 años, tasa ~10.5%). Fórmula estándar."""
    if not precio or precio < 200_000 or precio > 1_000_000_000:
        return None
    rate, n = 0.105, 240
    enganche = round(precio * 0.20)
    credito = precio - enganche
    rm = rate / 12.0
    mensualidad = round(credito * rm / (1 - (1 + rm) ** -n)) if rm else round(credito / n)
    return {"type": "payment_breakdown", "data": {
        "precio": precio, "enganche": enganche, "enganche_pct": 20, "credito": credito,
        "mensualidad": mensualidad, "tasa_pct": round(rate * 100, 1), "plazo_anios": 20,
    }}


def _map_block(zones):
    """Pins (lng/lat) de los desarrollos de las zonas mencionadas (o todos). center = [lng, lat]."""
    slugs = [s for s, _ in zones] if zones else None
    pins = []
    for d in _devs():
        if slugs and d.get("colonia_id") not in slugs:
            continue
        c = d.get("center")
        if isinstance(c, list) and len(c) == 2:
            pins.append({"lng": c[0], "lat": c[1], "name": d.get("name"),
                         "id": d.get("id"), "price": d.get("price_from")})
    pins = pins[:12]
    return {"type": "mini_map", "data": {"pins": pins}} if pins else None


async def build_generative_blocks(db, query: str) -> list:
    """Bloques generativos para una consulta. Cero dato inventado; vacío si no aplica."""
    blocks = []
    try:
        nq = _norm(query)
        zones = _detect_zones(query)

        # 1) PAGOS — intención de financiamiento (exclusivo)
        if any(w in nq for w in ("enganche", "hipoteca", "mensualidad", "credito", "financ", "cuanto pago", "cuanto pagaria")):
            precio = _extract_price(query) or (_zone_price(zones[0][0]) if zones else None)
            pb = _payment_block(precio)
            if pb:
                return [pb]

        # 2) MAPA — intención de ubicación (aditivo)
        if any(w in nq for w in ("mapa", "donde estan", "ubicacion", "en el mapa", "donde queda")):
            mb = _map_block(zones)
            if mb:
                blocks.append(mb)

        # 3) COMPARATIVA — ≥2 zonas mencionadas
        if len(zones) >= 2:
            rows = [r for r in await asyncio.gather(*[_zone_row(db, s, n) for s, n in zones[:4]]) if r]
            if len(rows) >= 2:
                blocks.append({"type": "comparison_table", "data": {"zones": rows}})
                return blocks

        # 4) TARJETAS — 1 zona en una búsqueda
        if len(zones) == 1:
            slug, _name = zones[0]
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
