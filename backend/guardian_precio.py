"""GUARDIÁN UNIVERSAL DE PRECIO — un solo lugar por donde debe pasar todo cambio de precio.

POR QUÉ EXISTE (auditoría A–Z, 2026-07-24): había **16 lugares distintos** en el backend que
podían escribir un precio en `db.units`, y **solo uno** (`lista_apply`) pasaba por el guardián de
plausibilidad. Es decir: el error de The Park (una lista mal leída que quiso cambiar 79 deptos por
153) podía repetirse por otras 15 puertas sin que nada lo frenara ni quedara registro.

QUÉ HACE, en una línea: antes de escribir un precio pregunta "¿esto es creíble?", y **siempre**
deja registro de quién lo cambió, desde qué valor, con qué fuente — aplicado o bloqueado.

DIFERENCIA CON `lista_peek.diff_plausible`: aquel mide el TAMAÑO DE UN LOTE (cuántas unidades
aparecen/desaparecen en una lista). Este mide **una unidad a la vez**, así que sirve para cualquier
camino: ingesta, motor de precios, edición del superadmin, script suelto.

CRITERIO (conservador a propósito: bloquear de más solo pide un OK; bloquear de menos publica un
precio equivocado a un comprador):
  · salto mayor a ±40% respecto al precio vigente → a revisión
  · precio no positivo, o por debajo del piso absoluto → a revisión
  · $/m² fuera del rango sano del mercado CDMX → a revisión
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

# Un precio residencial en CDMX/Edomex no baja de aquí. Debajo = casi siempre una celda mal leída
# (un número de cajón, un porcentaje, un enganche tomado como precio total).
PISO_ABSOLUTO_MXN = 300_000
# Salto máximo tolerado sin revisión humana, en cualquier dirección.
TOPE_SALTO_PCT = 40.0
# Rango sano de precio por m² (MXN). Fuera de esto casi siempre es unidad equivocada o m² malo.
PM2_MIN, PM2_MAX = 12_000, 250_000


def precio_plausible(
    actual: Optional[float],
    nuevo: Optional[float],
    m2: Optional[float] = None,
) -> Tuple[bool, Optional[str]]:
    """¿Es creíble mover el precio de `actual` a `nuevo`? → (ok, motivo_en_español).

    Puro y testeable: no toca la base ni la red. `motivo` viene escrito para que el founder lo
    entienda sin jerga, porque termina en la tarjeta de revisión.
    """
    if nuevo is None:
        return False, "el precio nuevo viene vacío"
    try:
        nuevo = float(nuevo)
    except (TypeError, ValueError):
        return False, f"el precio nuevo no es un número ({nuevo!r})"

    if nuevo <= 0:
        return False, "el precio nuevo es cero o negativo"
    if nuevo < PISO_ABSOLUTO_MXN:
        return False, (f"${nuevo:,.0f} es demasiado bajo para un departamento — "
                       f"suele ser una celda mal leída (un enganche o un número de cajón)")

    if m2:
        try:
            pm2 = nuevo / float(m2)
            if pm2 < PM2_MIN:
                return False, (f"sale a ${pm2:,.0f} por m² ({nuevo:,.0f} ÷ {m2} m²), "
                               f"muy por debajo de cualquier zona — revisa el precio o los metros")
            if pm2 > PM2_MAX:
                return False, (f"sale a ${pm2:,.0f} por m², fuera de rango incluso para Polanco — "
                               f"revisa el precio o los metros")
        except (TypeError, ValueError, ZeroDivisionError):
            pass

    if actual:
        try:
            actual = float(actual)
            if actual > 0:
                salto = abs(nuevo - actual) / actual * 100.0
                if salto > TOPE_SALTO_PCT:
                    direccion = "sube" if nuevo > actual else "baja"
                    return False, (f"{direccion} {salto:.0f}% de golpe "
                                   f"(${actual:,.0f} → ${nuevo:,.0f}) — nadie mueve un precio así "
                                   f"sin avisar; probable lista cruzada o mal leída")
        except (TypeError, ValueError):
            pass

    return True, None


def _norm(s: str) -> str:
    """Nombre comparable: sin acentos, sin ruido de archivo, en mayúsculas."""
    import re
    import unicodedata
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    s = s.upper().replace("_", " ").replace("-", " ")
    s = re.sub(r"\.(PDF|XLSX?|CSV)\b", " ", s)
    # ruido que aparece en TODOS los nombres de lista y no distingue proyectos
    for basura in ("LISTA DE PRECIOS", "LISTA", "PRECIOS", "VP ", " LP", "COPIA DE",
                   "ACTUALIZADA", "VIGENTE", "FINAL", "TORRE", "ETAPA"):
        s = s.replace(basura, " ")
    s = re.sub(r"\d{1,2}[ /-]\w{3}", " ", s)      # fechas tipo "17 jul"
    return re.sub(r"[^A-Z0-9 ]", " ", s)


def _tokens(s: str) -> set:
    return {t for t in _norm(s).split() if len(t) > 2}


def fuente_plausible(dev_name: str, fuente: str, otros_devs: Optional[Dict[str, str]] = None):
    """¿El archivo del que sale el precio pertenece a ESTE desarrollo? → (ok, motivo).

    Segunda capa del guardián, y la que faltaba. El caso real: el vigía aplicó
    `THE PARK GUADALUPE INN_LP.pdf` a unidades de **Único Priveé**, dejando el 103 publicado
    $1,267,314 fuera de su propia lista. Ese error NO lo caza un guardián de magnitud: el salto
    era de 32.7% (bajo el tope) y el precio por m² quedaba en rango. Es un error de IDENTIDAD.

    `otros_devs` = {dev_id: nombre} del resto del catálogo. Si el nombre del archivo se parece
    MÁS a otro desarrollo que a este, es cruce de listas y se frena.
    """
    if not fuente or not dev_name:
        return True, None                      # sin datos suficientes, no estorbar
    tf, td = _tokens(fuente), _tokens(dev_name)
    if not tf or not td:
        return True, None
    propio = len(tf & td)

    # OJO: no basta con que el archivo comparta ALGO con este desarrollo. Varios proyectos de un
    # mismo desarrollador comparten marca ("Único Priveé" / "Único Coyoacán", "Icon San Ángel" /
    # "Icon Beyond"), así que un token en común no prueba nada. Lo que decide es la COMPARACIÓN:
    # si el nombre del archivo se parece MÁS a otro desarrollo que a este, es cruce de listas.
    mejor_otro, mejor_n = None, 0
    for nombre in (otros_devs or {}).values():
        n = len(tf & _tokens(nombre))
        if n > mejor_n:
            mejor_otro, mejor_n = nombre, n

    if mejor_otro and mejor_n > propio:
        return False, (f"la lista «{fuente}» se parece más a «{mejor_otro}» que a «{dev_name}» — "
                       f"no le pego precios de otro proyecto sin que lo confirmes")
    if propio == 0 and mejor_n >= 2:
        return False, (f"la lista «{fuente}» parece ser de «{mejor_otro}», no de «{dev_name}»")
    return True, None


async def aplicar_precio(
    db,
    unit: Dict[str, Any],
    nuevo: Optional[float],
    *,
    fuente: str,
    actor: str,
    forzar: bool = False,
) -> Dict[str, Any]:
    """Punto único para cambiar el precio de UNA unidad. Valida, escribe si procede y **siempre** registra.

    - `fuente`: de dónde salió el precio (nombre del archivo, motor, pantalla).
    - `actor`:  quién lo hizo (vigía, superadmin, ingesta, motor_ml…).
    - `forzar`: aplicar aunque el guardián lo marque (para cuando un humano ya lo revisó y aprobó).

    Devuelve {aplicado: bool, motivo: str|None}. Nunca lanza: si algo falla, no aplica y lo dice.
    """
    ahora = datetime.now(timezone.utc).isoformat()
    actual = unit.get("price") or unit.get("price_mxn")
    m2 = unit.get("m2_total") or unit.get("m2_privative") or unit.get("size_m2")
    ok, motivo = precio_plausible(actual, nuevo, m2)

    evento = {
        "unit_id": unit.get("id"),
        "dev_id": unit.get("development_id"),
        "unit_number": unit.get("unit_number"),
        "old_price": actual,
        "new_price": nuevo,
        "changed_at": ahora,
        "fuente": fuente,
        "actor": actor,
        "guardian_ok": bool(ok),
        "guardian_motivo": motivo,
        "aplicado": bool(ok or forzar),
        "forzado": bool(forzar and not ok),
    }
    try:
        await db.price_events.insert_one(dict(evento))
    except Exception:
        pass   # el registro nunca debe impedir la operación

    if not ok and not forzar:
        return {"aplicado": False, "motivo": motivo}

    try:
        await db.units.update_one(
            {"id": unit.get("id")},
            {"$set": {"price": nuevo, "price_mxn": nuevo,
                      "price_display": f"${int(nuevo):,}",
                      "price_fuente": fuente, "price_actor": actor,
                      "updated_at": ahora}},
        )
    except Exception as e:
        return {"aplicado": False, "motivo": f"no se pudo escribir: {type(e).__name__}"}

    return {"aplicado": True, "motivo": None}


async def pendientes_de_revision(db, dev_id: Optional[str] = None, limite: int = 50) -> list:
    """Los cambios de precio que el guardián FRENÓ y esperan el OK de un humano."""
    q: Dict[str, Any] = {"guardian_ok": False, "aplicado": False}
    if dev_id:
        q["dev_id"] = dev_id
    out = []
    try:
        cur = db.price_events.find(q, {"_id": 0}).sort("changed_at", -1).limit(limite)
        async for e in cur:
            out.append(e)
    except Exception:
        pass
    return out
