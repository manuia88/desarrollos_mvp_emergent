"""W4.2D3 — Sistemático generator de filter combo URLs CDMX SEO.

Genera ~400-500 combos prioritizados por intent + realismo + volumen estimado.
Output: CSV con score 0-100 para validación founder.

Uso: python3 W4.2D3_generate_combos.py
"""
import csv
from itertools import product

# ─── DATA: colonias seedeadas (16) con tier + price band ─────────────────────
COLONIAS = {
    # Tier 1 Ultra-Premium
    "polanco":            {"name": "Polanco",              "alcaldia": "Miguel Hidalgo",  "tier": 1, "min_price_realistic": 12_000_000, "max_price_realistic": 80_000_000},
    "lomas-chapultepec":  {"name": "Lomas de Chapultepec", "alcaldia": "Miguel Hidalgo",  "tier": 1, "min_price_realistic": 18_000_000, "max_price_realistic": 100_000_000},
    "pedregal":           {"name": "Jardines del Pedregal","alcaldia": "Álvaro Obregón",  "tier": 1, "min_price_realistic": 25_000_000, "max_price_realistic": 150_000_000},

    # Tier 2 Premium
    "roma-norte":         {"name": "Roma Norte",           "alcaldia": "Cuauhtémoc",      "tier": 2, "min_price_realistic": 5_000_000, "max_price_realistic": 25_000_000},
    "condesa":            {"name": "Condesa",              "alcaldia": "Cuauhtémoc",      "tier": 2, "min_price_realistic": 6_000_000, "max_price_realistic": 28_000_000},
    "coyoacan-centro":    {"name": "Coyoacán Centro",      "alcaldia": "Coyoacán",        "tier": 2, "min_price_realistic": 5_000_000, "max_price_realistic": 25_000_000},
    "santa-fe":           {"name": "Santa Fe",             "alcaldia": "Cuajimalpa",      "tier": 2, "min_price_realistic": 6_000_000, "max_price_realistic": 30_000_000},
    "napoles":            {"name": "Nápoles",              "alcaldia": "Benito Juárez",   "tier": 2, "min_price_realistic": 4_000_000, "max_price_realistic": 18_000_000},

    # Tier 3 Mid-Market
    "juarez":             {"name": "Juárez",               "alcaldia": "Cuauhtémoc",      "tier": 3, "min_price_realistic": 3_500_000, "max_price_realistic": 15_000_000},
    "cuauhtemoc":         {"name": "Cuauhtémoc",           "alcaldia": "Cuauhtémoc",      "tier": 3, "min_price_realistic": 3_000_000, "max_price_realistic": 12_000_000},
    "del-valle-centro":   {"name": "Del Valle Centro",     "alcaldia": "Benito Juárez",   "tier": 3, "min_price_realistic": 4_500_000, "max_price_realistic": 18_000_000},
    "narvarte":           {"name": "Narvarte Poniente",    "alcaldia": "Benito Juárez",   "tier": 3, "min_price_realistic": 3_000_000, "max_price_realistic": 12_000_000},
    "escandon":           {"name": "Escandón",             "alcaldia": "Miguel Hidalgo",  "tier": 3, "min_price_realistic": 4_000_000, "max_price_realistic": 14_000_000},
    "anzures":            {"name": "Anzures",              "alcaldia": "Miguel Hidalgo",  "tier": 3, "min_price_realistic": 4_500_000, "max_price_realistic": 16_000_000},
    "roma-sur":           {"name": "Roma Sur",             "alcaldia": "Cuauhtémoc",      "tier": 3, "min_price_realistic": 3_500_000, "max_price_realistic": 14_000_000},

    # Tier 4 Accessible
    "doctores":           {"name": "Doctores",             "alcaldia": "Cuauhtémoc",      "tier": 4, "min_price_realistic": 1_800_000, "max_price_realistic": 6_000_000},
}

# Tipologías: depto = mayoría · casa = solo Tier 1 + Coyoacán + Pedregal · loft = solo zonas hipster
TIPO_AVAILABILITY = {
    "depto": list(COLONIAS.keys()),  # universal
    "casa": ["lomas-chapultepec", "pedregal", "coyoacan-centro"],
    "loft": ["roma-norte", "condesa", "juarez", "cuauhtemoc"],
}

# Bedroom ranges (interpreted as recamaras_min)
BEDROOM_RANGES = [1, 2, 3, 4]

# Price brackets (MXN)
PRICE_BRACKETS = [3_000_000, 5_000_000, 8_000_000, 12_000_000, 15_000_000, 20_000_000, 30_000_000]

# Stages
STAGES = ["preventa", "en_construccion", "entrega_inmediata"]


# ─── Scoring heuristics ──────────────────────────────────────────────────────
def score_realism(combo: dict) -> int:
    """0-30 puntos basado en realismo de mercado."""
    colonia = combo["colonia"]
    rec = combo.get("recamaras_min")
    precio = combo.get("precio_max")
    tipo = combo.get("tipo")
    info = COLONIAS[colonia]

    score = 25  # default reasonable

    # Penalties
    if precio and precio < info["min_price_realistic"] * 0.6:
        score -= 15  # precio_max muy por debajo del piso de la zona = no hay oferta
    if precio and precio > info["max_price_realistic"] * 1.3:
        score -= 5  # precio muy alto = redundante (capturado sin filtro)

    # Tipo casa solo donde tiene sentido
    if tipo == "casa" and colonia not in TIPO_AVAILABILITY["casa"]:
        return 0  # invalid combo

    # Loft solo zonas hipster
    if tipo == "loft" and colonia not in TIPO_AVAILABILITY["loft"]:
        return 0

    # 4+ recs solo Tier 1
    if rec == 4 and info["tier"] > 2:
        score -= 10

    # 1 rec solo zonas profesional/hipster (Tier 2-3 hipster)
    if rec == 1 and info["tier"] == 1:
        score -= 8  # Polanco rara vez ofrece estudios

    # Doctores 3+ recs raro
    if colonia == "doctores" and rec and rec >= 3:
        score -= 12

    return max(0, min(30, score))


def score_intent(combo: dict) -> int:
    """0-30 puntos basado en strength del intent."""
    score = 5  # base browse intent

    if combo.get("colonia"):
        score += 10  # zona específica = intent claro

    if combo.get("recamaras_min") and combo.get("precio_max"):
        score += 15  # filtros juntos = intent compra muy claro
    elif combo.get("recamaras_min") or combo.get("precio_max"):
        score += 8

    if combo.get("stage") == "preventa":
        score += 5  # investment intent
    elif combo.get("stage") == "entrega_inmediata":
        score += 3  # move-in ready intent

    if combo.get("tipo"):
        score += 2  # tipo specific

    return min(30, score)


def score_volume(combo: dict) -> int:
    """0-25 puntos basado en volumen estimado CDMX."""
    info = COLONIAS[combo["colonia"]]
    # Tier 1 + Tier 2 capturan más búsquedas alto-valor
    base = {1: 22, 2: 18, 3: 12, 4: 6}[info["tier"]]

    # Rec 2 = más buscado en CDMX (sweet spot)
    rec = combo.get("recamaras_min")
    if rec == 2:
        base += 3
    elif rec == 3:
        base += 1
    elif rec == 1:
        base -= 2  # menos demanda
    elif rec == 4:
        base -= 3

    return min(25, max(0, base))


def score_differentiation(combo: dict) -> int:
    """0-15 puntos · diferenciación vs Inmuebles24/Lamudi."""
    if combo.get("stage") == "preventa":
        return 15  # competidores no indexan bien preventa
    if combo.get("stage") == "entrega_inmediata":
        return 8
    return 5  # baseline para combos zone+filter estándar


def total_score(combo: dict) -> int:
    return score_realism(combo) + score_intent(combo) + score_volume(combo) + score_differentiation(combo)


def build_canonical_url(combo: dict) -> str:
    """Construye URL canónica con params alfabéticos."""
    params = []
    for k in sorted(combo.keys()):
        v = combo[k]
        if v is not None and v != "":
            params.append(f"{k}={v}")
    qs = "&".join(params) if params else ""
    return f"/marketplace?{qs}" if qs else "/marketplace"


def build_query_text(combo: dict) -> str:
    """Construye query humano para reference."""
    info = COLONIAS[combo["colonia"]]
    tipo = combo.get("tipo", "departamento")
    tipo_plural = {"depto": "Departamentos", "casa": "Casas", "loft": "Lofts"}.get(tipo, "Departamentos")

    parts = [tipo_plural]
    if combo.get("recamaras_min"):
        parts.append(f"{combo['recamaras_min']} recámaras")
    parts.append(f"en {info['name']}")
    if combo.get("precio_max"):
        precio_m = combo["precio_max"] / 1_000_000
        if precio_m >= 1:
            parts.append(f"hasta ${precio_m:.0f}M")
        else:
            parts.append(f"hasta ${combo['precio_max']:,}")
    if combo.get("stage") == "preventa":
        parts.append("preventa")
    elif combo.get("stage") == "entrega_inmediata":
        parts.append("entrega inmediata")

    return " ".join(parts)


# ─── Generación sistemática ──────────────────────────────────────────────────
def generate_all_combos():
    combos = []

    # Pattern 1: Solo colonia (browse)
    for colonia in COLONIAS:
        combos.append({"colonia": colonia})

    # Pattern 2: Colonia + tipo
    for colonia, tipo in product(COLONIAS, ["depto", "casa", "loft"]):
        combos.append({"colonia": colonia, "tipo": tipo})

    # Pattern 3: Colonia + recamaras
    for colonia, rec in product(COLONIAS, BEDROOM_RANGES):
        combos.append({"colonia": colonia, "recamaras_min": rec})

    # Pattern 4: Colonia + recamaras + precio
    for colonia, rec, precio in product(COLONIAS, BEDROOM_RANGES, PRICE_BRACKETS):
        combos.append({"colonia": colonia, "recamaras_min": rec, "precio_max": precio})

    # Pattern 5: Colonia + tipo + recamaras + precio
    for colonia, tipo, rec, precio in product(COLONIAS, ["depto", "casa", "loft"], BEDROOM_RANGES, PRICE_BRACKETS):
        combos.append({"colonia": colonia, "tipo": tipo, "recamaras_min": rec, "precio_max": precio})

    # Pattern 6: Colonia + stage
    for colonia, stage in product(COLONIAS, STAGES):
        combos.append({"colonia": colonia, "stage": stage})

    # Pattern 7: Colonia + stage + recamaras
    for colonia, stage, rec in product(COLONIAS, STAGES, BEDROOM_RANGES):
        combos.append({"colonia": colonia, "stage": stage, "recamaras_min": rec})

    return combos


def deduplicate_and_score(combos):
    """Dedup por canonical URL + score cada combo."""
    seen = {}
    for c in combos:
        url = build_canonical_url(c)
        if url not in seen:
            seen[url] = c
    scored = []
    for c in seen.values():
        s = total_score(c)
        if s == 0:  # invalid combos (e.g., casa fuera de Tier 1)
            continue
        scored.append({
            "canonical_url": build_canonical_url(c),
            "query_text": build_query_text(c),
            "colonia": c.get("colonia"),
            "tipo": c.get("tipo", ""),
            "recamaras_min": c.get("recamaras_min", ""),
            "precio_max": c.get("precio_max", ""),
            "stage": c.get("stage", ""),
            "tier": COLONIAS[c["colonia"]]["tier"],
            "score_realism": score_realism(c),
            "score_intent": score_intent(c),
            "score_volume": score_volume(c),
            "score_differentiation": score_differentiation(c),
            "score_total": s,
            "founder_decision": "",  # to fill manually
        })
    scored.sort(key=lambda x: -x["score_total"])
    return scored


if __name__ == "__main__":
    all_combos = generate_all_combos()
    print(f"Generated {len(all_combos)} raw combos")
    scored = deduplicate_and_score(all_combos)
    print(f"After dedup + invalid filter: {len(scored)} valid combos")
    print(f"Top 10 by score: {[(c['query_text'], c['score_total']) for c in scored[:10]]}")
    print(f"Score 70+: {sum(1 for c in scored if c['score_total'] >= 70)}")
    print(f"Score 50-69: {sum(1 for c in scored if 50 <= c['score_total'] < 70)}")
    print(f"Score <50: {sum(1 for c in scored if c['score_total'] < 50)}")

    # Write all combos
    with open("W4.2D3_combos_generated.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(scored[0].keys()))
        writer.writeheader()
        writer.writerows(scored)

    # Write top 200 priority
    with open("W4.2D3_top_200_priority.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(scored[0].keys()))
        writer.writeheader()
        writer.writerows(scored[:200])

    print(f"\n✓ Wrote W4.2D3_combos_generated.csv ({len(scored)} rows)")
    print(f"✓ Wrote W4.2D3_top_200_priority.csv (200 rows)")
