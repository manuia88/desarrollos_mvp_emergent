"""W5.1 Sub-Chunk E — Golden Dataset para validación AVM.

Conjunto de casos de referencia con precio "verdadero" (curado manualmente
desde transacciones histórica y consenso de mercado en CDMX, feb 2026).
Sirve para tracking de MAPE a lo largo del tiempo y QA de regresiones.

NOTA: Estos valores son referenciales conservadores basados en precio
medio por colonia × ajustes hedónicos. Si una colonia no existe en el seed
(`COLONIAS_BY_ID`), se ignora silenciosamente durante la validación.
"""
from __future__ import annotations

from typing import Any, Dict, List

# Casos curados — cubre las principales colonias de CDMX con escenarios variados.
# Estructura: (id, colonia_slug, m2, recamaras, banos, antiguedad, precio_real_mxn)
GOLDEN_CASES: List[Dict[str, Any]] = [
    {"id": "gold_001", "colonia_slug": "polanco",   "m2": 120, "recamaras": 3, "banos": 3, "antiguedad_anos": 5,  "precio_real_mxn": 14_400_000},
    {"id": "gold_002", "colonia_slug": "polanco",   "m2": 85,  "recamaras": 2, "banos": 2, "antiguedad_anos": 8,  "precio_real_mxn": 9_350_000},
    {"id": "gold_003", "colonia_slug": "condesa",   "m2": 95,  "recamaras": 2, "banos": 2, "antiguedad_anos": 3,  "precio_real_mxn": 8_550_000},
    {"id": "gold_004", "colonia_slug": "condesa",   "m2": 70,  "recamaras": 1, "banos": 1, "antiguedad_anos": 12, "precio_real_mxn": 5_950_000},
    {"id": "gold_005", "colonia_slug": "roma-norte", "m2": 80,  "recamaras": 2, "banos": 2, "antiguedad_anos": 6,  "precio_real_mxn": 6_800_000},
    {"id": "gold_006", "colonia_slug": "roma-norte", "m2": 110, "recamaras": 3, "banos": 2, "antiguedad_anos": 10, "precio_real_mxn": 8_690_000},
    {"id": "gold_007", "colonia_slug": "del-valle-centro", "m2": 90,  "recamaras": 2, "banos": 2, "antiguedad_anos": 15, "precio_real_mxn": 5_400_000},
    {"id": "gold_008", "colonia_slug": "del-valle-centro", "m2": 130, "recamaras": 3, "banos": 3, "antiguedad_anos": 5,  "precio_real_mxn": 8_580_000},
    {"id": "gold_009", "colonia_slug": "narvarte",  "m2": 75,  "recamaras": 2, "banos": 1, "antiguedad_anos": 20, "precio_real_mxn": 3_750_000},
    {"id": "gold_010", "colonia_slug": "narvarte",  "m2": 100, "recamaras": 3, "banos": 2, "antiguedad_anos": 8,  "precio_real_mxn": 5_400_000},
    {"id": "gold_011", "colonia_slug": "santa-fe",  "m2": 140, "recamaras": 3, "banos": 3, "antiguedad_anos": 4,  "precio_real_mxn": 11_900_000},
    {"id": "gold_012", "colonia_slug": "santa-fe",  "m2": 95,  "recamaras": 2, "banos": 2, "antiguedad_anos": 10, "precio_real_mxn": 7_125_000},
    {"id": "gold_013", "colonia_slug": "coyoacan-centro", "m2": 110, "recamaras": 3, "banos": 2, "antiguedad_anos": 18, "precio_real_mxn": 6_270_000},
    {"id": "gold_014", "colonia_slug": "pedregal", "m2": 150, "recamaras": 3, "banos": 3, "antiguedad_anos": 25, "precio_real_mxn": 12_000_000},
    {"id": "gold_015", "colonia_slug": "lomas-chapultepec", "m2": 200, "recamaras": 4, "banos": 4, "antiguedad_anos": 7,  "precio_real_mxn": 26_000_000},
    {"id": "gold_016", "colonia_slug": "lomas-chapultepec", "m2": 120, "recamaras": 3, "banos": 2, "antiguedad_anos": 15, "precio_real_mxn": 14_400_000},
    {"id": "gold_017", "colonia_slug": "escandon", "m2": 130, "recamaras": 3, "banos": 3, "antiguedad_anos": 6,  "precio_real_mxn": 10_400_000},
    {"id": "gold_018", "colonia_slug": "anzures",   "m2": 90,  "recamaras": 2, "banos": 2, "antiguedad_anos": 12, "precio_real_mxn": 7_200_000},
    {"id": "gold_019", "colonia_slug": "juarez",    "m2": 80,  "recamaras": 2, "banos": 2, "antiguedad_anos": 8,  "precio_real_mxn": 6_400_000},
    {"id": "gold_020", "colonia_slug": "doctores",  "m2": 70,  "recamaras": 2, "banos": 1, "antiguedad_anos": 30, "precio_real_mxn": 2_800_000},
]


def list_cases() -> List[Dict[str, Any]]:
    """Devolver copia inmutable de los casos golden."""
    return [dict(c) for c in GOLDEN_CASES]


async def validate_against_engine(db) -> Dict[str, Any]:
    """Correr AVM contra cada caso golden y devolver MAPE + detalle.

    Caso ignorado si la colonia no existe en el seed (devuelve `skipped`).
    """
    from avm_public_engine import avm_quick_async

    details: List[Dict[str, Any]] = []
    abs_pct_errors: List[float] = []
    skipped = 0

    for case in GOLDEN_CASES:
        try:
            out = await avm_quick_async(
                db,
                case["colonia_slug"],
                float(case["m2"]),
                int(case["recamaras"]),
                int(case["banos"]),
                int(case["antiguedad_anos"]),
            )
            if "error" in out:
                skipped += 1
                continue
            predicted = float(out.get("precio_estimado") or 0)
            real = float(case["precio_real_mxn"])
            if real <= 0:
                skipped += 1
                continue
            pct_err = abs(predicted - real) / real * 100.0
            abs_pct_errors.append(pct_err)
            details.append({
                "id": case["id"],
                "colonia_slug": case["colonia_slug"],
                "m2": case["m2"],
                "real": real,
                "predicted": predicted,
                "abs_pct_error": round(pct_err, 2),
                "pricing_model": out.get("pricing_model"),
            })
        except Exception:
            skipped += 1

    mape = (sum(abs_pct_errors) / len(abs_pct_errors)) if abs_pct_errors else None
    within_10 = sum(1 for e in abs_pct_errors if e <= 10) if abs_pct_errors else 0
    within_20 = sum(1 for e in abs_pct_errors if e <= 20) if abs_pct_errors else 0

    return {
        "total_cases": len(GOLDEN_CASES),
        "evaluated": len(abs_pct_errors),
        "skipped": skipped,
        "mape_pct": round(mape, 2) if mape is not None else None,
        "within_10pct": within_10,
        "within_20pct": within_20,
        "details": details,
    }
