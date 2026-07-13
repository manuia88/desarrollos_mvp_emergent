"""
market_4s_transfer.py — TRANSFERENCIA de priors 4S a colonias SIN estudio (anti-dependencia).

Doctrina (founder 2026-07-12): 4S da datos a DMX, DMX NO depende de 4S. Un estudio cuesta ~$500k
y cubre UNA zona; la plataforma tiene 1,812 colonias. Este motor generaliza sin comprar más estudios:

  Los átomos 4S no solo describen zonas — describen COMPORTAMIENTO por perfil de mercado
  (qué pide/paga/aguanta un comprador de cierto nivel de precio). Ese comportamiento se
  TRANSFIERE a colonias de perfil similar, con etiqueta honesta de procedencia:

    · real         — la colonia está en zona de influencia de un estudio (dato medido).
    · transferido  — colonia de perfil similar (precio/m² cercano a un arquetipo 4S);
                     el prior aplica con confianza media/baja y se dice de dónde viene.
    · sin_prior    — ninguna zona 4S se parece (p.ej. Lomas de Chapultepec, ultra-premium):
                     los motores siguen con sus estimados de siempre. NUNCA se inventa.

  El sustituto permanente del estudio es el CONTRASTE (market_4s_prior): la señal viva del
  marketplace confirma/corrige el prior — con señal propia suficiente, el prior deja de importar.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.market_4s_transfer")

# umbrales de similitud (distancia relativa de precio/m² al arquetipo). Estrictos a propósito:
# es mejor decir "sin prior" que transferir el comportamiento de un mercado que no se parece
# (Lomas a $150k/m² NO se comporta como Reforma a $99k — similitud 0.66 se rechaza).
_SIM_MEDIA = 0.80    # ≥80% similar → prior transferible con confianza media
_SIM_BAJA = 0.70     # 70-80% → transferible con confianza baja (solo orientativo)


async def _arquetipos(db) -> List[Dict[str, Any]]:
    """Perfil de mercado de cada estudio desde los átomos: precio/m² ponderado de obra nueva."""
    acc: Dict[str, Dict[str, float]] = {}
    try:
        async for f in db.facts_4s.find({"tema": "oferta_subzonas"}, {"_id": 0}):
            e = acc.setdefault(f["estudio"], {"pm2_u": 0.0, "u": 0.0})
            if f["pregunta"] == "precio_m2_prom" and isinstance(f.get("valor"), (int, float)):
                e.setdefault("_pm2_por_sz", {})[f.get("subzona")] = float(f["valor"])
            if f["pregunta"] == "unidades" and isinstance(f.get("valor"), (int, float)):
                e.setdefault("_u_por_sz", {})[f.get("subzona")] = float(f["valor"])
    except Exception as ex:
        log.warning("[4s_transfer] arquetipos fail-open: %s", ex)
        return []
    out = []
    for estudio, e in acc.items():
        pm2s = e.get("_pm2_por_sz") or {}
        us = e.get("_u_por_sz") or {}
        num = sum(pm2s[sz] * us.get(sz, 1) for sz in pm2s)
        den = sum(us.get(sz, 1) for sz in pm2s)
        if den > 0:
            out.append({"estudio": estudio, "precio_m2": round(num / den)})
    return out


async def _precio_m2_colonia(db, colonia_nombre: str) -> Optional[float]:
    """precio/m² de la colonia desde el universo propio (db.colonias / colonia_valoracion)."""
    try:
        c = await db.colonias.find_one({"name": colonia_nombre}, {"_id": 0, "precio_pm2": 1})
        if c and c.get("precio_pm2"):
            return float(c["precio_pm2"])
    except Exception as e:
        log.warning("[4s_transfer] precio colonia fail-open: %s", e)
    return None


async def prior_para_colonia(db, colonia_nombre: str,
                             precio_m2: Optional[float] = None) -> Dict[str, Any]:
    """El prior de mercado aplicable a CUALQUIER colonia, con procedencia honesta.
    real (zona 4S) → transferido (perfil similar) → sin_prior (motores siguen como siempre)."""
    from market_4s_prior import _zonas_influencia, prior_zona
    from market_4s_bridge import norm_colonia

    nc = norm_colonia(colonia_nombre or "")

    # 1) ¿medido? (zona de influencia de un estudio)
    est_cols = await _zonas_influencia(db)
    candidatos = [e for e, cols in est_cols.items() if nc in cols]
    if candidatos:
        estudio = "puente_alvarado" if "puente_alvarado" in candidatos else candidatos[0]
        prior = await prior_zona(db, estudio)
        return {"colonia": colonia_nombre, "modo": "real", "estudio_fuente": estudio,
                "similitud": 1.0, "confianza": "alta", "es_estimado": False, "prior": prior,
                "leyenda": f"Dato medido: la colonia está en la zona de influencia del estudio {estudio}."}

    # 2) ¿transferible? (perfil de precio similar a un arquetipo)
    pm2 = precio_m2 if precio_m2 else await _precio_m2_colonia(db, colonia_nombre)
    arqs = await _arquetipos(db)
    if pm2 and arqs:
        mejor, sim = None, -1.0
        for a in arqs:
            s = 1.0 - abs(pm2 - a["precio_m2"]) / max(pm2, a["precio_m2"])
            if s > sim:
                mejor, sim = a, s
        if mejor and sim >= _SIM_BAJA:
            prior = await prior_zona(db, mejor["estudio"])
            confianza = "media" if sim >= _SIM_MEDIA else "baja"
            return {"colonia": colonia_nombre, "modo": "transferido",
                    "estudio_fuente": mejor["estudio"], "similitud": round(sim, 2),
                    "confianza": confianza, "es_estimado": True, "prior": prior,
                    "leyenda": (f"Prior TRANSFERIDO del estudio {mejor['estudio']} "
                                f"(perfil de precio similar: ${pm2:,.0f}/m² vs ${mejor['precio_m2']:,}/m² · "
                                f"similitud {round(sim*100)}%). Orientativo, no medido — la señal viva del "
                                f"marketplace lo confirma o corrige.")}

    # 3) sin prior — honesto, nada se rompe
    return {"colonia": colonia_nombre, "modo": "sin_prior", "estudio_fuente": None,
            "similitud": 0.0, "confianza": None, "es_estimado": True, "prior": None,
            "leyenda": ("Ninguna zona 4S se parece a esta colonia (o falta su precio/m²). "
                        "Los motores siguen con sus estimados propios; la señal del marketplace "
                        "construye el perfil real con el uso.")}
