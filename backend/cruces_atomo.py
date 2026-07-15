"""LOS CRUCES DEL ÁTOMO — 188 motores existentes apuntados a cada unidad del catálogo.

Tercera corrida (founder 07-15: "cruza datos, cruza motores, upgrade brutal"). Cada función
cruza UNA capa existente contra el átomo — juntas arman la FICHA 720°:
  · SUELO (avm_predios 1.08M + catastro): tierra vs construcción, oficial
  · ZONA (zone_scores 2.7k + risk 3.8k): calidad y riesgo de la colonia, ya calculados
  · FINANZAS (esquema real del dev + tasa): mensualidad e ingreso requerido
  · CAPACIDAD (demand_atoms genoma): cuántos perfiles reales PUEDEN pagarla
  · SCORE DMX v1 (transparente): la calificación AAA–D del átomo
  · ARGUMENTO (battle card del átomo): la munición de venta auto-redactada
  · ECUACIÓN DEL PRECIO v1: precio = molde en su piso ± prima específica + % tierra

Todo puro/testeable salvo los lectores de Mongo. $0, sin IA. Fail-soft: una capa sin dato
devuelve None y la ficha lo dice honesto — jamás inventa.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

TASA_HIPOTECARIA_DEFAULT = 0.115   # tasa anual de referencia (parametrizable)
PLAZO_ANIOS_DEFAULT = 20


# ─── AVM COLONIA: el premium de obra nueva, medido contra 1.08M avalúos ───────
# (honestidad 07-15: avm_predios es valor de PROPIEDAD por m², no de tierra — el cruce
# correcto es "cuánto premium pagas por estrenar vs el valor AVM promedio de la colonia")
async def suelo_atomo(db, colonia_id: str, pm2_unidad: Optional[float]) -> Optional[Dict[str, Any]]:
    if not colonia_id:
        return None
    av = await db.avm_predios.find_one({"colonia_id": colonia_id},
                                       {"_id": 0, "avm_m2_colonia": 1, "avm_m2": 1})
    if not av:
        return None
    avm_m2 = av.get("avm_m2_colonia") or av.get("avm_m2")
    out: Dict[str, Any] = {"avm_m2_colonia": avm_m2}
    if avm_m2 and pm2_unidad:
        out["premium_obra_nueva_pct"] = round((pm2_unidad - avm_m2) * 100 / avm_m2, 1)
    return out


# ─── ZONA: los scores que YA existen, por fin visibles en el átomo ────────────
async def zona_atomo(db, colonia_id: str) -> Optional[Dict[str, Any]]:
    if not colonia_id:
        return None
    z = await db.zone_scores.find_one({"zone_id": colonia_id}, {"_id": 0}) or {}
    r = await db.risk_scores_zone.find_one({"zone_id": colonia_id}, {"_id": 0}) or {}
    grade = z.get("grade") or z.get("letter") or (z.get("score") is not None and str(z["score"]))
    riesgo = None
    comps = r.get("components") or {}
    if comps:
        malos = [k for k, v in comps.items() if isinstance(v, (int, float)) and v >= 70]
        riesgo = "alto en " + ", ".join(malos[:2]) if malos else "sin focos rojos"
    if not grade and not riesgo:
        return None
    return {"grade": grade or None, "riesgo": riesgo}


# ─── FINANZAS: mensualidad e ingreso requerido con el esquema REAL del dev ────
def finanzas_atomo(u: Dict[str, Any], tasa_anual: float = TASA_HIPOTECARIA_DEFAULT,
                   plazo_anios: int = PLAZO_ANIOS_DEFAULT) -> Optional[Dict[str, Any]]:
    precio = u.get("price_mxn") or u.get("price")
    if not precio:
        return None
    enganche = u.get("enganche_mxn") or (precio * (u.get("enganche_pct") or 20) / 100)
    credito = u.get("credito_mxn") or (precio - enganche)
    i = tasa_anual / 12
    n = plazo_anios * 12
    mensualidad = credito * (i * (1 + i) ** n) / ((1 + i) ** n - 1) if credito > 0 else 0
    return {"enganche": round(enganche), "credito": round(credito),
            "mensualidad": round(mensualidad),
            "ingreso_requerido": round(mensualidad / 0.33) if mensualidad else None,
            "tasa": tasa_anual, "plazo_anios": plazo_anios}


# ─── CAPACIDAD: el genoma de demanda contra la mensualidad de ESTA unidad ─────
def capacidad_genoma(mensualidad: Optional[float],
                     mensualidades_max: List[float]) -> Optional[Dict[str, Any]]:
    """Cuántos perfiles REALES del genoma pueden pagar esta unidad (poder de compra,
    no clics). Con genoma chico se dice el número tal cual — honesto."""
    if not mensualidad or not mensualidades_max:
        return None
    alcanzan = sum(1 for m in mensualidades_max if m >= mensualidad)
    return {"alcanzan": alcanzan, "de": len(mensualidades_max),
            "pct": round(alcanzan * 100 / len(mensualidades_max))}


# ─── SCORE DMX v1: la calificación transparente del átomo (AAA–D) ─────────────
def score_dmx(posicion: Optional[Dict[str, Any]], tension: Optional[float],
              percentil_pm2: Optional[int], zona_grade: Optional[str],
              verificado: bool = False) -> Dict[str, Any]:
    """Compuesto explicable (cada punto con su porqué): posición vs gemelas (40) +
    tensión de demanda (20) + accesibilidad de precio (20) + zona (10) + dato verificado (10)."""
    puntos, porque = 0.0, []
    if posicion:
        pct = posicion.get("vs_molde_pct") or 0
        p = max(0.0, min(40.0, 20 - pct * 2))          # −10% → 40 pts · +10% → 0
        puntos += p
        porque.append(f"posición vs gemelas {pct:+.1f}% → {p:.0f}/40")
    if tension is not None:
        p = min(20.0, tension * 20)
        puntos += p
        porque.append(f"tensión de demanda {tension} → {p:.0f}/20")
    if percentil_pm2 is not None:
        p = (100 - percentil_pm2) * 0.2
        puntos += p
        porque.append(f"accesibilidad (percentil {percentil_pm2}) → {p:.0f}/20")
    if zona_grade:
        mapa = {"A": 10, "B": 7, "C": 4, "D": 1}
        p = mapa.get(str(zona_grade)[:1].upper(), 5)
        puntos += p
        porque.append(f"zona {zona_grade} → {p}/10")
    if verificado:
        puntos += 10
        porque.append("dato verificado 2 fuentes → 10/10")
    letra = ("AAA" if puntos >= 75 else "AA" if puntos >= 60 else "A" if puntos >= 45
             else "B" if puntos >= 30 else "C" if puntos >= 15 else "D")
    return {"puntos": round(puntos), "letra": letra, "porque": porque,
            "metodo": "score_dmx_v1_transparente"}


# ─── ARGUMENTO DE VENTA: la battle card del átomo, auto-redactada ─────────────
def argumento_venta(numero: str, analisis: Dict[str, Any],
                    finanzas: Optional[Dict[str, Any]] = None,
                    capacidad: Optional[Dict[str, Any]] = None) -> List[str]:
    a = analisis or {}
    out: List[str] = []
    v = a.get("vs_molde_ajustado_pct")
    if v is not None and v <= -3:
        out.append(f"El {numero} está {abs(v):.1f}% por DEBAJO de sus gemelas (mismo plano, "
                   f"ajustado por piso) — es de lo mejor preciado del edificio.")
    if a.get("gemela_mas_barata") and v is not None and v > 3:
        g = a["gemela_mas_barata"]
        out.append(f"Si el precio frena, la alternativa es {g.get('unidad')} "
                   f"(${(g.get('precio') or 0):,.0f}, piso {g.get('piso')}) — mismo plano.")
    if a.get("percentil_pm2") is not None and a["percentil_pm2"] <= 30:
        out.append(f"Por $/m² está en el {a['percentil_pm2']}% más accesible del desarrollo.")
    if a.get("busquedas_compatibles"):
        out.append(f"{a['busquedas_compatibles']} búsquedas reales del marketplace le quedan "
                   f"a esta unidad — no va a esperar para siempre.")
    if capacidad and capacidad.get("alcanzan"):
        out.append(f"{capacidad['alcanzan']} de {capacidad['de']} perfiles del genoma pueden "
                   f"pagar su mensualidad — hay para quién.")
    if finanzas and finanzas.get("mensualidad"):
        out.append(f"Con el esquema del desarrollador: ${finanzas['enganche']:,.0f} de enganche "
                   f"y ~${finanzas['mensualidad']:,.0f}/mes.")
    if a.get("exterior_pct"):
        out.append(f"El {a['exterior_pct']}% del total es espacio exterior propio.")
    return out


# ─── ECUACIÓN DEL PRECIO v1: el precio descompuesto en factores medidos ───────
def descomposicion_precio(u: Dict[str, Any], posicion: Optional[Dict[str, Any]],
                          suelo: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    precio = u.get("price_mxn") or u.get("price")
    m2 = u.get("size_m2") or u.get("m2_total")
    if not precio or not m2 or not posicion:
        return None
    pct = posicion.get("vs_molde_pct")
    if pct is None:
        return None
    base = precio / (1 + pct / 100)
    factores = [{"factor": "su molde en su piso (gemelas ajustadas)", "monto": round(base)},
                {"factor": "prima/descuento específico de esta unidad",
                 "monto": round(precio - base), "pct": pct}]
    out = {"precio": round(precio), "factores": factores,
           "metodo": "molde_en_su_piso ± específico (v1)"}
    if suelo and suelo.get("premium_obra_nueva_pct") is not None:
        out["premium_obra_nueva_pct"] = suelo["premium_obra_nueva_pct"]
    return out


# ─── lector del genoma (una vez por ficha) ────────────────────────────────────
async def mensualidades_del_genoma(db) -> List[float]:
    out: List[float] = []
    async for a in db.demand_atoms.find({"dimension": "finanzas.mensualidad_max"},
                                        {"_id": 0, "valor": 1}):
        try:
            out.append(float(str(a.get("valor")).replace(",", "")))
        except (TypeError, ValueError):
            pass
    return out
