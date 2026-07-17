"""JUECES DE NEGOCIO — lógica de MERCADO, no de higiene de datos.

El auditor caza datos rotos; estos jueces cazan cosas que un dato puede tener PERFECTAS
y aun así oler mal comercialmente:

  · esquema_vs_etapa — un esquema 10/90 (casi todo contra entrega) huele a entrega
    inmediata; 30/70 o mensualidades durante obra huelen a preventa. Si el olor del
    esquema contradice la etapa DECLARADA, alguien capturó mal la etapa o el esquema
    es de otra fase/torre.
  · descuento_entre_listas — dos fotos de la misma lista (Vigía): % de unidades que
    bajaron de precio y baja promedio = la NEGOCIABILIDAD real del dev. Oro para el
    asesor: este dev sí se sienta a negociar.
  · precio_estancado — disponibles cuyo precio no se mueve en N días con inventario
    todavía alto: o el dev está dormido (sobreprecio que nadie corrige) o el dato
    está podrido (lista que nadie actualiza). Ambos merecen llamada.

Mismo shape que el resto de jueces: {regla, severidad, ref, detalle, accion}.
Funciones PURAS sin Mongo (reciben los datos ya armados — precio_estancado recibe los
días YA calculados); Mongo solo en juzgar_negocio(). Si no hay historia suficiente
devuelve [] SIN inventar: la película apenas se acumula y un juez que opina sin datos
es peor que uno callado. $0, sin IA.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

ALERTA, AVISO = "alerta", "aviso"

# Umbrales de negociabilidad: con ≥30% del inventario rebajado y ≥5% de baja promedio
# ya no es "un ajuste": es política de descuentos → sube a alerta.
_NEGOCIABILIDAD_PCT_ALERTA = 30.0
_NEGOCIABILIDAD_BAJA_ALERTA = 5.0
_INVENTARIO_MIN_PCT = 20.0        # precio_estancado solo opina con >20% aún disponible
_ESTADOS_DISPONIBLE = {"disponible", "available", ""}


def _h(regla: str, severidad: str, ref: str, detalle: str, accion: str,
       **extra) -> Dict[str, Any]:
    """Mismo patrón de hallazgo que auditor_catalogo._h (+ accion)."""
    return {"regla": regla, "severidad": severidad, "ref": ref,
            "detalle": detalle, "accion": accion, **extra}


def _norm_txt(s: str) -> str:
    t = "".join(c for c in unicodedata.normalize("NFD", str(s or ""))
                if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", t).strip().lower()


# ═══ 1 · ESQUEMA DE PAGO vs ETAPA COMERCIAL ════════════════════════════════════
_ETAPAS_PREVENTA = {"preventa", "pre venta", "pre-venta", "lanzamiento",
                    "preconstruccion", "en construccion", "en_construccion",
                    "construccion", "obra"}
_ETAPAS_INMEDIATA = {"entrega inmediata", "entrega_inmediata", "inmediata",
                     "terminado", "escriturable", "estrenar"}


def olor_de_esquema(esquema_nota: str) -> Optional[str]:
    """A qué etapa HUELE el esquema (regla founder 07-17): enganche chico con casi
    todo contra entrega (10/90) = el edificio ya casi está → entrega inmediata;
    enganche grande (30/70) o mensualidades durante obra = te financian el ladrillo
    → preventa. None si el texto no trae señal."""
    t = _norm_txt(esquema_nota)
    if not t:
        return None
    m = re.search(r"\b(\d{1,2})\s*[/\-]\s*(\d{2,3})\b", t)
    if m and int(m.group(1)) + int(m.group(2)) == 100:
        enganche = int(m.group(1))
        if enganche <= 15:
            return "entrega_inmediata"
        if enganche >= 30:
            return "preventa"
    if re.search(r"mensualidad|durante (la )?obra|pagos? diferido|meses sin", t):
        return "preventa"
    return None


def _etapa_norm(etapa_comercial: str) -> Optional[str]:
    t = _norm_txt(etapa_comercial).replace("_", " ")
    if any(e.replace("_", " ") == t or e.replace("_", " ") in t
           for e in _ETAPAS_INMEDIATA):
        return "entrega_inmediata"
    if any(e.replace("_", " ") == t or e.replace("_", " ") in t
           for e in _ETAPAS_PREVENTA):
        return "preventa"
    return None


def esquema_vs_etapa(esquema_nota: str, etapa_comercial: str) -> List[Dict[str, Any]]:
    """Contradicción esquema↔etapa. Solo opina cuando AMBOS lados traen señal clara:
    un esquema ambiguo (20/80) o una etapa exótica no producen hallazgo — este juez
    prefiere callar a adivinar."""
    olor = olor_de_esquema(esquema_nota)
    etapa = _etapa_norm(etapa_comercial)
    if not olor or not etapa or olor == etapa:
        return []
    legible = {"entrega_inmediata": "entrega inmediata", "preventa": "preventa/obra"}
    return [_h(
        "esquema_vs_etapa", ALERTA, esquema_nota.strip()[:60],
        f"el esquema de pago '{esquema_nota.strip()}' huele a {legible[olor]} pero la "
        f"etapa declarada es '{etapa_comercial}' — o la etapa está mal capturada o el "
        f"esquema es de otra torre/fase",
        "confirma la etapa real con el dev; si el esquema es por torre, captúralo por "
        "torre en vez de a nivel desarrollo",
        olor_esquema=olor, etapa_declarada=etapa)]


# ═══ 2 · DESCUENTO ENTRE LISTAS (negociabilidad) ═══════════════════════════════
def descuento_entre_listas(snap_viejo: Dict[str, Dict[str, Any]],
                           snap_nuevo: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Dos fotos de la lista (dicts unidad→{precio}) → la negociabilidad del dev:
    % de unidades comunes que BAJARON y baja promedio. Un dev que baja precios entre
    listas negocia — el que no, aguanta. Sin unidades comunes con precio en ambas
    fotos no hay película → [] sin inventar."""
    comunes = [(k, float(v["precio"]), float(snap_nuevo[k]["precio"]))
               for k, v in (snap_viejo or {}).items()
               if k in (snap_nuevo or {})
               and v.get("precio") is not None
               and snap_nuevo[k].get("precio") is not None]
    if not comunes:
        return []
    # baja real: más de $1 y más de 0.1% (los redondeos de un parser no son descuento)
    bajas = [(k, pv, pn) for k, pv, pn in comunes
             if pv - pn > max(1.0, pv * 0.001)]
    if not bajas:
        return []
    pct = len(bajas) * 100.0 / len(comunes)
    prom = sum((pv - pn) * 100.0 / pv for _, pv, pn in bajas) / len(bajas)
    sev = ALERTA if (pct >= _NEGOCIABILIDAD_PCT_ALERTA
                     and prom >= _NEGOCIABILIDAD_BAJA_ALERTA) else AVISO
    return [_h(
        "descuento_entre_listas", sev, "lista",
        f"{len(bajas)} de {len(comunes)} unidades ({pct:.0f}%) bajaron de precio entre "
        f"listas, baja promedio {prom:.1f}% — este dev SÍ negocia",
        "úsalo en la mesa: hay margen real de descuento; revisa qué unidades bajaron "
        "y por qué (las bajas repetidas delatan el inventario que les pesa)",
        pct_unidades_con_baja=round(pct, 1), promedio_baja_pct=round(prom, 2),
        n_comunes=len(comunes),
        bajas=[{"unidad": k, "antes": pv, "ahora": pn} for k, pv, pn in bajas[:15]])]


# ═══ 3 · PRECIO ESTANCADO ══════════════════════════════════════════════════════
def precio_estancado(unidades: List[Dict[str, Any]],
                     dias_sin_cambio: Dict[str, int],
                     umbral_dias: int = 120) -> List[Dict[str, Any]]:
    """Disponibles cuyo precio lleva ≥ umbral_dias sin moverse, con inventario
    disponible aún >20%: dev dormido o dato podrido. PURA: recibe los días YA
    calculados (dict ref_unidad→días) — no lee Mongo ni el reloj. Las unidades sin
    historia registrada quedan FUERA (no se inventa que 'no ha cambiado' un precio
    que nunca vimos cambiar)."""
    if not unidades or not dias_sin_cambio:
        return []
    disponibles = [u for u in unidades
                   if str(u.get("status") or u.get("estatus") or "").lower()
                   in _ESTADOS_DISPONIBLE]
    inventario_pct = len(disponibles) * 100.0 / len(unidades)
    if inventario_pct <= _INVENTARIO_MIN_PCT:
        return []
    estancadas = []
    for u in disponibles:
        for ref in (u.get("unit_number"), u.get("id")):
            dias = dias_sin_cambio.get(ref) if ref else None
            if dias is not None:
                if dias >= umbral_dias:
                    estancadas.append({"unidad": u.get("unit_number") or u.get("id"),
                                       "dias": dias})
                break
    if not estancadas:
        return []
    max_dias = max(e["dias"] for e in estancadas)
    return [_h(
        "precio_estancado", ALERTA, "inventario",
        f"{len(estancadas)} unidades disponibles llevan ≥{umbral_dias} días sin cambio "
        f"de precio (la más vieja: {max_dias} días) con {inventario_pct:.0f}% del "
        f"inventario aún disponible — dev dormido o dato podrido",
        "confirma con el dev si la lista sigue viva; si sigue, el precio estático con "
        "inventario alto es señal de sobreprecio (y de espacio para negociar)",
        unidades=estancadas[:50], inventario_disponible_pct=round(inventario_pct, 1),
        umbral_dias=umbral_dias)]


# ═══ La corrida completa (Mongo) ═══════════════════════════════════════════════
def _tokens_nombre(nombre: str) -> set:
    """Tokens ≥4 letras del nombre del dev (mismo truco que juez_automatico para no
    confundir proyectos: 'ALMINA' no empata con 'ALTUS')."""
    return {t for t in re.split(r"\W+", _norm_txt(nombre).upper()) if len(t) >= 4}


async def juzgar_negocio(db, development_id: str) -> List[Dict[str, Any]]:
    """Arma los datos y corre los 3 jueces puros:
      · esquema/etapa desde developments,
      · las DOS últimas fotos de la misma lista del Vigía (vigia_listas_snapshot amarra
        por nombre de carpeta, no por development_id → se cruza por tokens del nombre),
      · días sin cambio de precio desde price_events (el historial append-only real).
    Cada pata que no tenga historia suficiente simplemente no opina."""
    dev = await db.developments.find_one(
        {"id": development_id},
        {"_id": 0, "name": 1, "esquema_pago_nota": 1, "etapa_comercial": 1, "stage": 1})
    if not dev:
        return []
    hallazgos: List[Dict[str, Any]] = []

    # 1 · esquema vs etapa
    hallazgos += esquema_vs_etapa(
        dev.get("esquema_pago_nota") or "",
        dev.get("etapa_comercial") or dev.get("stage") or "")

    # 2 · negociabilidad: ≥2 fotos del MISMO archivo de lista (huellas distintas)
    tokens = _tokens_nombre(dev.get("name") or "")
    por_archivo: Dict[str, List[Dict[str, Any]]] = {}
    if tokens:
        async for s in db.vigia_listas_snapshot.find(
                {}, {"_id": 0, "archivo_id": 1, "huella": 1, "ts": 1,
                     "unidades": 1, "dev": 1, "proyecto": 1}):
            etiqueta = _norm_txt(f"{s.get('dev') or ''} {s.get('proyecto') or ''}").upper()
            if any(t in etiqueta for t in tokens):
                por_archivo.setdefault(s.get("archivo_id") or "", []).append(s)
    fotos = max(por_archivo.values(), key=len, default=[])
    if len(fotos) >= 2:
        fotos.sort(key=lambda s: s.get("ts") or "")
        hallazgos += descuento_entre_listas(fotos[-2].get("unidades") or {},
                                            fotos[-1].get("unidades") or {})

    # 3 · precio estancado: días desde el ÚLTIMO evento de precio de cada unidad
    ultimo: Dict[str, str] = {}
    async for e in db.price_events.find(
            {"dev_id": development_id}, {"_id": 0, "unit_id": 1, "changed_at": 1}):
        uid, ts = e.get("unit_id"), e.get("changed_at")
        if uid and ts and ts > ultimo.get(uid, ""):
            ultimo[uid] = ts
    if ultimo:
        ahora = datetime.now(timezone.utc)
        dias_map: Dict[str, int] = {}
        for uid, ts in ultimo.items():
            try:
                t = datetime.fromisoformat(ts)
                if t.tzinfo is None:            # eventos legacy sin zona: se asumen UTC
                    t = t.replace(tzinfo=timezone.utc)
                dias_map[uid] = (ahora - t).days
            except ValueError:
                continue
        units = await db.units.find(
            {"development_id": development_id},
            {"_id": 0, "id": 1, "unit_number": 1, "status": 1}).to_list(5000)
        hallazgos += precio_estancado(units, dias_map)

    return hallazgos
