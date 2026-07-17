"""EL JUEZ CRUZADO — contradicciones ENTRE documentos del MISMO desarrollo.

El cotejo (cotejo_engine) confronta el mismo CAMPO entre fuentes molde a molde. Este juez
caza otra familia de mentiras: lo que un documento AFIRMA contra lo que otro documento
DEMUESTRA. Casos reales que lo parieron (07-17):

  · El folleto de Único Coyoacán vende "desde 91 m²" — pero la lista de precios arranca
    en 64 m². El folleto promete un piso de entrada que la lista contradice.
  · Un plano de nivel rotula el depto 1802 — y la lista no lo trae. O la lista está
    incompleta (unidad fantasma vendible que no vendemos) o el plano está viejo.
  · "Único Coyoacán" está en Portales Norte (Benito Juárez): el NOMBRE alude a una
    colonia que no es la real. Marketing de ubicación — informativo, no bloquea.

Reglas: folleto_vs_lista · plano_vs_lista · nombre_vs_colonia.
Mismo shape de hallazgo que el auditor: {regla, severidad, ref, detalle, accion}.
Severidades: 'alerta' (contradicción dura entre documentos) · 'aviso' (informativo).
Lógica PURA testeable sin Mongo; Mongo y pdfplumber solo en juzgar_cruzado(). $0, sin IA.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, Iterable, List, Optional

from identidad_unidad import norm_unidad

ALERTA, AVISO = "alerta", "aviso"

# Tolerancias: los folletos redondean ("desde 91 m²" con mínimo real 90.4 no es mentira).
TOL_M2_PCT = 0.03          # ±3% o 2 m² — más que eso ya no es redondeo, es otro producto
TOL_PRECIO_PCT = 0.05      # ±5% — listas se mueven; más que eso el "desde" es anzuelo
# Tipos comerciales: un local de 28 m² NO desmiente un folleto que vende deptos "desde 60".
_TIPOS_NO_DEPTO = {"local", "bodega", "oficina", "estacionamiento", "cajon"}
# El plano solo genera avisos "en lista pero sin plano" si los planos rotulan ≥50% de la
# lista: con cobertura parcial (planos de una sola torre) esos avisos serían puro ruido.
_COBERTURA_MIN_VICEVERSA = 0.5
# más de N planos "huérfanos" (rotulan un número que la lista no trae) = desajuste de
# nomenclatura, no N unidades faltantes → 1 aviso resumen en vez de N alertas de ruido
_MAX_HUERFANOS_DETALLE = 6


def _h(regla: str, severidad: str, ref: str, detalle: str, accion: str,
       **extra) -> Dict[str, Any]:
    """Mismo patrón de hallazgo que auditor_catalogo._h (+ accion, que el parte exige)."""
    return {"regla": regla, "severidad": severidad, "ref": ref,
            "detalle": detalle, "accion": accion, **extra}


def _sin_acentos(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s or "")
                   if unicodedata.category(c) != "Mn")


# ═══ 1 · FOLLETO vs LISTA ══════════════════════════════════════════════════════
# "desde 91 m²" / "desde $2,590,000" / "desde $2.59 MDP"
_RE_DESDE_M2 = re.compile(
    r"desde\s+(?:los\s+)?(\d{2,3}(?:[.,]\d{1,2})?)\s*m[²2](?!\w)", re.IGNORECASE)
_RE_DESDE_PRECIO = re.compile(
    r"desde\s*(\$)?\s*(\d(?:[\d,.]*\d)?)\s*(mdp|mill[oó]n(?:es)?|mxn|m\.n\.?)?",
    re.IGNORECASE)


def _num(txt: str) -> Optional[float]:
    """'2,590,000' → 2590000 · '2.59' → 2.59 · basura → None."""
    t = (txt or "").strip().replace(" ", "")
    if re.fullmatch(r"\d{1,3}(,\d{3})+(\.\d+)?", t):     # separador de miles gringo
        t = t.replace(",", "")
    t = t.rstrip(".,")
    try:
        return float(t.replace(",", "."))
    except ValueError:
        return None


def desde_m2_de_folleto(texto: str) -> Optional[float]:
    """El 'desde X m²' MÁS CHICO del folleto (puede haber uno por tipología; el que
    compite contra el mínimo real de la lista es el menor de todos)."""
    vals = [_num(m.group(1)) for m in _RE_DESDE_M2.finditer(texto or "")]
    vals = [v for v in vals if v and 20 <= v <= 1000]
    return min(vals) if vals else None


def desde_precio_de_folleto(texto: str) -> Optional[float]:
    """El 'desde $X' más chico. Exige señal de dinero ($ o sufijo MDP/millones/MXN)
    para no confundirse con 'desde 91 m²' u otros 'desde' sin precio."""
    vals: List[float] = []
    for m in _RE_DESDE_PRECIO.finditer(texto or ""):
        signo, cuerpo, sufijo = m.group(1), m.group(2), (m.group(3) or "").lower()
        if not signo and not sufijo:
            continue
        v = _num(cuerpo)
        if v is None:
            continue
        if sufijo.startswith(("mdp", "mill")):
            v *= 1_000_000
        if 300_000 <= v <= 200_000_000:                  # banda plausible CDMX
            vals.append(v)
    return min(vals) if vals else None


def _minimos_reales(unidades: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Mínimos de la LISTA viva (solo vivienda: los tipos comerciales no cuentan)."""
    min_m2 = min_precio = None
    ref_m2 = ref_precio = None
    for u in unidades or []:
        tipo = str(u.get("tipo") or u.get("type") or "departamento").lower()
        if tipo in _TIPOS_NO_DEPTO:
            continue
        m2 = u.get("size_m2") or u.get("m2_total")
        precio = u.get("price_mxn") or u.get("price")
        if m2 and m2 > 0 and (min_m2 is None or m2 < min_m2):
            min_m2, ref_m2 = float(m2), u.get("unit_number") or u.get("id")
        if precio and precio > 0 and (min_precio is None or precio < min_precio):
            min_precio, ref_precio = float(precio), u.get("unit_number") or u.get("id")
    return {"min_m2": min_m2, "ref_m2": ref_m2,
            "min_precio": min_precio, "ref_precio": ref_precio}


def folleto_vs_lista(texto_folleto: str,
                     unidades: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """¿Lo que el folleto PROMETE como piso de entrada cuadra con la lista REAL?

    Ambas direcciones son contradicción: si el folleto dice "desde 91 m²" y la lista
    arranca en 64, el folleto esconde el producto chico (o la lista trae unidades que
    el folleto ya no vende); si promete "desde $2.59M" y lo más barato cuesta $3.1M,
    el 'desde' es anzuelo. En ambos casos alguien publica un dato que otro documento
    del MISMO desarrollo desmiente — eso nunca se deja pasar en silencio."""
    if not (texto_folleto or "").strip() or not unidades:
        return []
    hallazgos: List[Dict[str, Any]] = []
    reales = _minimos_reales(unidades)

    f_m2 = desde_m2_de_folleto(texto_folleto)
    r_m2 = reales["min_m2"]
    if f_m2 is not None and r_m2 is not None:
        tol = max(2.0, r_m2 * TOL_M2_PCT)
        if abs(f_m2 - r_m2) > tol:
            direccion = (f"pero la lista arranca en {r_m2:g} m² ({reales['ref_m2']}) — "
                         f"el folleto esconde el producto más chico"
                         if f_m2 > r_m2 else
                         f"pero la unidad más chica de la lista mide {r_m2:g} m² "
                         f"({reales['ref_m2']}) — el folleto promete un tamaño de "
                         f"entrada que ya no existe")
            hallazgos.append(_h(
                "folleto_vs_lista", ALERTA, "folleto",
                f"el folleto vende 'desde {f_m2:g} m²' {direccion}",
                "corrige el folleto o la lista: el dato publicado debe salir de la "
                "lista viva, no al revés",
                campo="m2", folleto=f_m2, lista=r_m2, unidad_minima=reales["ref_m2"]))

    f_p = desde_precio_de_folleto(texto_folleto)
    r_p = reales["min_precio"]
    if f_p is not None and r_p is not None and abs(f_p - r_p) > r_p * TOL_PRECIO_PCT:
        direccion = (f"pero la unidad más barata cuesta ${r_p:,.0f} "
                     f"({reales['ref_precio']}) — 'desde' anzuelo"
                     if f_p < r_p else
                     f"pero la lista tiene unidades desde ${r_p:,.0f} "
                     f"({reales['ref_precio']}) — folleto desactualizado")
        hallazgos.append(_h(
            "folleto_vs_lista", ALERTA, "folleto",
            f"el folleto promete 'desde ${f_p:,.0f}' {direccion}",
            "alinea el 'desde' del folleto con el mínimo real de la lista",
            campo="precio", folleto=f_p, lista=r_p, unidad_minima=reales["ref_precio"]))
    return hallazgos


# ═══ 2 · PLANO vs LISTA ════════════════════════════════════════════════════════
def _llaves(u: Any) -> set:
    """Llaves de identidad tolerantes a torre: el plano suele rotular SOLO el número
    ('201'); la lista/BD trae la torre como letra-guion ('A-201'), letra-espacio
    ('B 201') o palabra-espacio ('Sauce 201'). Se genera el nombre normalizado Y su
    núcleo numérico final para que todos empaten (07-17: sin el núcleo salían 221
    falsos positivos por prefijo de torre-palabra)."""
    n = norm_unidad(u)
    if not n:
        return set()
    llaves = {n}
    sin_guion = re.sub(r"^[A-Z]+\d?-", "", n)
    if sin_guion != n:
        llaves.add(sin_guion)
    m = re.search(r"(\d{2,4})[A-Z]?$", n)        # 'SAUCE201'/'B201' → '201'
    if m:
        llaves.add(m.group(1))
    return llaves


def plano_vs_lista(unidades_plano: Iterable[Any],
                   unidades_lista: Iterable[Any]) -> List[Dict[str, Any]]:
    """Unidades ROTULADAS en plano ausentes de la lista (alerta: unidad fantasma o
    plano viejo) y viceversa (aviso, solo con cobertura de planos ≥50% — con planos
    parciales el 'falta en plano' sería ruido, no señal)."""
    plano = [str(u) for u in (unidades_plano or []) if str(u or "").strip()]
    lista = [str(u) for u in (unidades_lista or []) if str(u or "").strip()]
    if not plano or not lista:
        return []
    llaves_lista: set = set()
    for u in lista:
        llaves_lista |= _llaves(u)
    llaves_plano: set = set()
    for u in plano:
        llaves_plano |= _llaves(u)

    hallazgos: List[Dict[str, Any]] = []
    huerfanos = [u for u in dict.fromkeys(plano) if not (_llaves(u) & llaves_lista)]
    # cuando SON POCOS es señal fina (unidad concreta que el plano tiene y la lista no);
    # cuando son MUCHOS es un desajuste de nomenclatura entre plano y lista (07-17: Almina
    # rotula 1507/201 con otro esquema) → 1 aviso resumen, no 145 alertas de ruido
    if 0 < len(huerfanos) <= _MAX_HUERFANOS_DETALLE:
        for u in huerfanos:
            hallazgos.append(_h(
                "plano_vs_lista", ALERTA, u,
                f"el plano rotula el depto {u} pero la lista de precios no lo trae",
                "confirma con el dev: si la unidad existe la lista está incompleta "
                "(inventario vendible que no vendemos); si no, el plano está viejo",
                origen="plano_sin_lista"))
    elif huerfanos:
        hallazgos.append(_h(
            "plano_vs_lista", AVISO, f"{len(huerfanos)} planos",
            f"{len(huerfanos)} planos rotulan números que la lista no trae con ese "
            f"formato (p.ej. {', '.join(huerfanos[:5])}) — probable esquema de "
            f"numeración distinto entre planos y lista, no {len(huerfanos)} faltantes",
            "revisar la nomenclatura: emparejar el número del plano con el de la lista",
            origen="plano_sin_lista_masivo", n=len(huerfanos)))

    en_plano = sum(1 for u in lista if _llaves(u) & llaves_plano)
    if en_plano / len(lista) >= _COBERTURA_MIN_VICEVERSA:
        for u in lista:
            if not (_llaves(u) & llaves_plano):
                hallazgos.append(_h(
                    "plano_vs_lista", AVISO, u,
                    f"la lista vende la unidad {u} pero ningún plano la rotula "
                    f"(los planos sí cubren {en_plano} de {len(lista)})",
                    "consigue la lámina de esa unidad o revisa si es un error de "
                    "número en la lista",
                    origen="lista_sin_plano"))
    return hallazgos


# ═══ 3 · NOMBRE vs COLONIA ═════════════════════════════════════════════════════
_SUFIJOS_ZONA = r"\b(norte|sur|oriente|poniente|centro|ampliacion)\b"


def _lexicon_lugares() -> set:
    """Lugares CDMX que un nombre comercial puede invocar. REUSA el catálogo SEO
    (seo_landings_config) en vez de duplicar la lista; se agregan las bases sin
    sufijo cardinal ('Portales Norte' → también 'portales')."""
    from seo_landings_config import ALCALDIAS_CDMX, COLONIAS_TARGET
    lugares: set = set()
    nombres = [i["name"] for i in COLONIAS_TARGET.values()] + list(ALCALDIAS_CDMX.values())
    for n in nombres:
        norm = _sin_acentos(n).lower().strip()
        base = re.sub(_SUFIJOS_ZONA, "", norm).strip()
        for cand in (norm, base):
            if len(cand) >= 4:
                lugares.add(cand)
    return lugares


def nombre_vs_colonia(nombre_dev: str, colonia: str,
                      alcaldia: Optional[str] = None) -> List[Dict[str, Any]]:
    """¿El nombre comercial alude a una colonia DISTINTA de la real? 'Único Coyoacán'
    en Portales Norte. Es AVISO informativo, no alerta: el marketing de ubicación es
    legal y común — pero el founder debe saberlo antes que el comprador. Si el lugar
    aludido coincide con la colonia real O con su alcaldía ('X Coyoacán' en Del Carmen,
    alcaldía Coyoacán), el nombre es honesto y no se dice nada."""
    if not (nombre_dev or "").strip() or not (colonia or "").strip():
        return []
    nombre_n = _sin_acentos(nombre_dev).lower()
    colonia_n = _sin_acentos(colonia).lower().strip()
    colonia_base = re.sub(_SUFIJOS_ZONA, "", colonia_n).strip()
    alcaldia_n = _sin_acentos(alcaldia or "").lower().strip()

    alusiones = sorted((p for p in _lexicon_lugares()
                        if re.search(rf"\b{re.escape(p)}\b", nombre_n)),
                       key=len, reverse=True)
    # 'hipodromo condesa' ya contiene 'condesa': solo cuenta la alusión más larga
    alusiones = [a for i, a in enumerate(alusiones)
                 if not any(a in largo for largo in alusiones[:i])]
    if not alusiones:
        return []

    def _honesta(a: str) -> bool:
        return (a in colonia_n or a in colonia_base or colonia_base == a
                or (bool(alcaldia_n) and a in alcaldia_n))

    if any(_honesta(a) for a in alusiones):
        return []
    lugar = alusiones[0]
    return [_h(
        "nombre_vs_colonia", AVISO, nombre_dev,
        f"el nombre '{nombre_dev}' alude a {lugar.title()} pero el desarrollo está "
        f"en {colonia}" + (f" ({alcaldia})" if alcaldia else "") +
        " — marketing de ubicación",
        "verifica la dirección real y decide si la ficha debe aclarar la colonia "
        "verdadera al comprador",
        lugar_aludido=lugar, colonia_real=colonia)]


# ═══ La corrida completa (Mongo + PDFs) ════════════════════════════════════════
def _texto_de_pdf(storage_path: str) -> str:
    """Texto de un PDF de dev_assets. Primero el archivo tal cual (los assets del
    pipeline masivo viven en claro); si no abre, el descifrado de document_intelligence
    (los subidos por portal viven cifrados). Fail-soft: '' si nada abre."""
    import io

    import pdfplumber
    try:
        with pdfplumber.open(storage_path) as pdf:
            return "\n".join((p.extract_text() or "") for p in pdf.pages[:40])
    except Exception:  # noqa: BLE001
        pass
    try:
        from document_intelligence import read_encrypted_file
        data = read_encrypted_file(storage_path)
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            return "\n".join((p.extract_text() or "") for p in pdf.pages[:40])
    except Exception:  # noqa: BLE001
        return ""


async def juzgar_cruzado(db, development_id: str) -> List[Dict[str, Any]]:
    """Junta los documentos del desarrollo (folletos PDF de dev_assets, deptos
    rotulados por los planos ya ingeridos, unidades efectivas del catálogo) y corre
    las 3 reglas puras. Devuelve la lista de hallazgos; no persiste (el integrador
    decide dónde viven, igual que el resto de jueces)."""
    import asyncio

    from unidades_efectivas import unidades_efectivas

    dev = await db.developments.find_one(
        {"id": development_id},
        {"_id": 0, "name": 1, "colonia": 1, "alcaldia": 1, "neighborhood": 1, "zone": 1})
    if not dev:
        return []
    units = await unidades_efectivas(db, {"development_id": development_id})
    hallazgos: List[Dict[str, Any]] = []

    # folleto: todo PDF brochure/documento del dev → un solo texto (el 'desde' mínimo manda)
    textos: List[str] = []
    async for a in db.dev_assets.find(
            {"development_id": development_id,
             "asset_type": {"$in": ["brochure", "documento"]}},
            {"_id": 0, "id": 1, "storage_path": 1, "mime_type": 1, "filename": 1,
             "texto_extraido": 1}):
        sp = a.get("storage_path")
        es_pdf = "pdf" in str(a.get("mime_type") or "").lower() or \
            str(a.get("filename") or sp or "").lower().endswith(".pdf")
        if not sp or not es_pdf:
            continue
        # CACHÉ (07-17: la 1ª corrida global tardó >15 min re-leyendo decks de 100MB
        # en cada auditoría): el texto se extrae UNA vez y vive en el asset
        if a.get("texto_extraido") is not None:
            t = a["texto_extraido"]
        else:
            import os as _os
            try:
                if _os.path.getsize(sp) > 25 * 1024 * 1024:
                    continue            # deck gigante: fuera del juez horario
            except OSError:
                continue
            t = await asyncio.to_thread(_texto_de_pdf, sp)
            if a.get("id"):
                await db.dev_assets.update_one(
                    {"id": a["id"]}, {"$set": {"texto_extraido": t[:200_000]}})
        if t.strip():
            textos.append(t)
    if textos:
        hallazgos += folleto_vs_lista("\n".join(textos), units)

    # planos: los deptos que las láminas YA ingeridas declaran (campo `deptos` del
    # pipeline masivo; fallback: lo que el nombre del archivo rotula, vía plano_binder)
    unidades_plano: List[str] = []
    async for a in db.dev_assets.find(
            {"development_id": development_id,
             "asset_type": {"$in": ["plano_unidad", "plano_nivel"]}},
            {"_id": 0, "deptos": 1, "filename": 1}):
        if a.get("deptos"):
            unidades_plano += [str(d) for d in a["deptos"]]
        elif a.get("filename"):
            try:
                from plano_binder import deptos_de_archivo
                unidades_plano += deptos_de_archivo(a["filename"])[0]
            except Exception:  # noqa: BLE001
                pass
    if unidades_plano:
        hallazgos += plano_vs_lista(
            unidades_plano,
            [u.get("unit_number") or u.get("id") for u in units])

    hallazgos += nombre_vs_colonia(
        dev.get("name") or "",
        dev.get("colonia") or dev.get("neighborhood") or dev.get("zone") or "",
        alcaldia=dev.get("alcaldia"))
    return hallazgos
