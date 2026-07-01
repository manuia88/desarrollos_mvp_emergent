"""
grafo_comprador_engine — El Grafo del Comprador (F2.1 · lado demanda del Modelo del Mundo).
═══════════════════════════════════════════════════════════════════════════════
QUÉ ES: por cada colonia × ETAPA DE VIDA, qué producto quiere realmente la demanda
(recámaras, baños, cajones, precio, amenidades, terraza) y cuánta demanda hay. Es la
versión VIVA del "Estudio de Demanda" de un estudio de mercado profesional — el dato
que faltaba para (1) emparejar leads, (2) decirle al dev qué construir, (3) alimentar
el agregado de superadmin.

CÓMO (cierra ciclos, no es standalone):
  • Lee preferencia REVELADA que ya capturamos (asesor_busquedas + tipo de contacto).
    No usa demografía (no la pedimos aún): INFIERE la etapa de vida de lo que el
    comprador BUSCA. "Build for endstate": hoy con poca data devuelve celdas honestas
    "sin dato suficiente"; se llena solo conforme entran búsquedas reales.
  • Agrega ANÓNIMO y con k-anonimato (una celda solo revela el producto si la alimentan
    ≥ K_MIN búsquedas) → así el mismo motor sirve al asesor (1 lead), al dev (su colonia)
    y a superadmin (toda la ciudad, todos los devs) sin exponer a nadie.
  • Banda honesta (metric_normalizer) en vez de números falsamente precisos. Cero deuda.

Lo consumen los 4 portales:
  - Asesor    → distintivo de etapa de vida en la ficha del lead (infer_contacto_segment).
  - Dev       → "Qué Quiere La Demanda Aquí" por colonia (build_grafo con colonia_id).
  - Superadmin→ agregado de todas las colonias / devs (build_grafo sin filtro).
  - Comprador → (indirecto) cada búsqueda/swipe alimenta el grafo.

Visión IA-first: esta es la capa de inferencia que convierte señal cruda en un modelo
de demanda consultable; se reentrena con la realidad (cierres) en F2.5 (Cerebro del Mercado).
"""
from __future__ import annotations

import logging
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.grafo_comprador")

# k-anonimato: una celda (colonia × segmento) solo revela el producto deseado si la
# alimentan al menos K_MIN búsquedas. Debajo → "sin dato suficiente" (honesto, cero deuda).
# P2.8 / KAN-01 · K canónico: una sola fuente de verdad (anonymization_engine.K_ANON_MIN=5).
# Antes 3 hardcodeado → garantía k=3 FALSA en el producto B2B. Fail-soft si falla el import.
try:
    from anonymization_engine import K_ANON_MIN as K_MIN
except Exception:  # fail-soft: nunca por debajo del piso canónico
    K_MIN = 5

# Catálogo de etapas de vida (build for endstate: las 8 del estudio de mercado +
# inversionista + indefinido). La inferencia v1 produce un subconjunto robusto desde la
# señal que ya tenemos; el resto se llena al capturar/inferir más demografía (F2.3+).
SEGMENTS = [
    {"key": "soltero_joven",       "label": "Soltero Joven (25-35)",      "grupo": "sin_hijos"},
    {"key": "adulto_independiente", "label": "Adulto Independiente (36+)", "grupo": "sin_hijos"},
    {"key": "pareja_sin_hijos",    "label": "Pareja Sin Hijos",           "grupo": "sin_hijos"},
    {"key": "pareja_con_hijos",    "label": "Pareja Con Hijos",           "grupo": "con_hijos"},
    {"key": "familia_consolidada", "label": "Familia Consolidada",        "grupo": "con_hijos"},
    {"key": "padre_madre_soltero", "label": "Padre / Madre Soltero",      "grupo": "con_hijos"},
    {"key": "inversionista",       "label": "Inversionista",              "grupo": "inversion"},
    {"key": "indefinido",          "label": "Sin Definir Aún",            "grupo": "indefinido"},
]
SEG_LABEL = {s["key"]: s["label"] for s in SEGMENTS}

# Amenidades que delatan la etapa de vida (señal de inferencia, sin pedir demografía).
_FAMILY_AMEN = {"area_infantil", "ludoteca", "splash_pad", "guarderia", "salon_gamer", "parque", "areas_verdes"}
_YOUNG_AMEN = {"coworking", "sky_bar", "roof_garden", "business_center", "cava_vinos", "gym"}
_TERRAZA_AMEN = {"terraza", "balcon", "balcón", "roof_garden", "terraza_privada", "roof_garden_privado"}


def infer_segment(busqueda: dict, contacto_tipo: Optional[str] = None) -> Tuple[str, int, List[str]]:
    """De una búsqueda (preferencia revelada) + tipo de contacto → etapa de vida inferida.
    NO usa demografía (no la capturamos aún): infiere de lo que el comprador BUSCA.
    Devuelve (segmento, confianza 0-100, razones[]). Honesto: 'indefinido' sin señal."""
    reasons: List[str] = []
    tipo = (contacto_tipo or "").strip().lower()
    if tipo in ("inversor", "inversionista"):
        return "inversionista", 85, ["marcado como inversionista"]

    rec = busqueda.get("recamaras_min")
    amen = {str(a).strip().lower() for a in (busqueda.get("amenidades") or [])}
    fam_hit = amen & _FAMILY_AMEN
    young_hit = amen & _YOUNG_AMEN

    score = 0
    seg = "indefinido"
    if fam_hit:
        seg = "pareja_con_hijos"; score += 35
        reasons.append("busca amenidades familiares")
    if isinstance(rec, (int, float)) and rec >= 3:
        if seg == "indefinido":
            seg = "pareja_con_hijos"
        score += 30; reasons.append(f"busca {int(rec)}+ recámaras")
    elif rec == 1:
        if seg == "indefinido":
            seg = "soltero_joven"
        score += 25; reasons.append("busca 1 recámara")
    elif rec == 2:
        if seg == "indefinido":
            seg = "pareja_sin_hijos"
        score += 20; reasons.append("busca 2 recámaras")
    if young_hit and seg in ("indefinido", "soltero_joven"):
        seg = "soltero_joven"; score += 15
        reasons.append("busca amenidades de soltero/joven")

    conf = min(90, score) if seg != "indefinido" else 0
    return seg, conf, reasons


def _median(vals: List) -> Optional[float]:
    v = sorted(x for x in vals if x is not None)
    return v[len(v) // 2] if v else None


def _mode(vals: List):
    c = Counter(x for x in vals if x is not None)
    return c.most_common(1)[0][0] if c else None


# P2.4 · caché TTL en memoria: el grafo hace full-scan de búsquedas/contactos; sin caché se
# recomputaba idéntico en cada request. 120s mantiene fresco sin escanear por cada llamada.
import time as _time
_GRAFO_CACHE: Dict[str, tuple] = {}
_GRAFO_TTL = 120
# Tope de seguridad de escaneo (acota el peor caso si la colección crece mucho).
_GRAFO_SCAN_CAP = 50000


async def build_grafo(db, colonia_id: Optional[str] = None, dias: int = 90) -> Dict[str, Any]:
    """El Grafo del Comprador: por colonia × etapa de vida, qué producto quiere la demanda.
    colonia_id=None → todas (vista superadmin/mercado). colonia_id="polanco" → una (vista dev).
    Anónimo, banda honesta, k-anonimato. FAIL-OPEN: nunca crashea, devuelve lo que pueda."""
    _ck = f"{colonia_id or 'all'}|{dias}"
    _hit = _GRAFO_CACHE.get(_ck)
    if _hit and (_time.time() - _hit[0]) < _GRAFO_TTL:
        return _hit[1]
    try:
        from data_seed import COLONIAS, COLONIAS_BY_ID
    except Exception:
        COLONIAS, COLONIAS_BY_ID = [], {}

    now = datetime.now(timezone.utc)
    since = (now - timedelta(days=dias)).isoformat()

    # 1. Tipo de contacto (para detectar inversionistas) — join ligero, fail-open.
    tipo_by_contacto: Dict[str, str] = {}
    try:
        async for c in db.asesor_contactos.find({}, {"_id": 0, "id": 1, "tipo": 1}).limit(_GRAFO_SCAN_CAP):
            tipo_by_contacto[c.get("id")] = c.get("tipo")
    except Exception as e:
        log.warning(f"[grafo] tipos fail-open: {e}")

    # 2. Recorrer búsquedas → acumular en celdas (colonia, segmento).
    cells: Dict[Tuple[str, str], dict] = defaultdict(lambda: {
        "n": 0, "rec": [], "ban": [], "caj": [], "precio": [], "m2": [],
        "amen": Counter(), "terraza_n": 0,
    })
    col_total: Counter = Counter()
    try:
        proj = {"_id": 0, "colonias": 1, "recamaras_min": 1, "banos_min": 1,
                "estacionamientos_min": 1, "precio_min": 1, "precio_max": 1,
                "m2_min": 1, "amenidades": 1, "contacto_id": 1, "created_at": 1}
        async for b in db.asesor_busquedas.find({}, proj).limit(_GRAFO_SCAN_CAP):
            ca = b.get("created_at")
            ca = ca.isoformat() if isinstance(ca, datetime) else str(ca or "")
            if ca and ca < since:
                continue
            cols = [str(x).strip().lower() for x in (b.get("colonias") or []) if x]
            if not cols:
                continue
            seg, _, _ = infer_segment(b, tipo_by_contacto.get(b.get("contacto_id")))
            amen = [str(a).strip().lower() for a in (b.get("amenidades") or [])]
            for col in cols:
                cell = cells[(col, seg)]
                cell["n"] += 1
                col_total[col] += 1
                if b.get("recamaras_min") is not None:
                    cell["rec"].append(b["recamaras_min"])
                if b.get("banos_min") is not None:
                    cell["ban"].append(b["banos_min"])
                if b.get("estacionamientos_min") is not None:
                    cell["caj"].append(b["estacionamientos_min"])
                p = b.get("precio_max") or b.get("precio_min")
                if p:
                    cell["precio"].append(int(p))
                if b.get("m2_min"):
                    cell["m2"].append(int(b["m2_min"]))
                for a in amen:
                    cell["amen"][a] += 1
                if any(t in amen for t in _TERRAZA_AMEN):
                    cell["terraza_n"] += 1
    except Exception as e:
        log.warning(f"[grafo] búsquedas agg fail-open: {e}")

    # 2b. P2.6 + Copiloto E5 · comprador→grafo: las búsquedas del MARKETPLACE/Perfilador (demanda revelada anónima)
    # entran como señal de demanda por colonia, JUNTO a las del asesor. Las del Perfilador traen el perfil completo
    # (recámaras/precio/etapa) → alimentan las celdas RICAS, no solo conteos. Cierra el ciclo dev/superadmin.
    mkt_by_name: Counter = Counter()
    try:
        proj2 = {"_id": 0, "colonia_id": 1, "colonias": 1, "recamaras_min": 1, "banos_min": 1,
                 "estacionamientos_min": 1, "precio_max": 1, "m2_min": 1, "amenidades": 1}
        async for s in db.marketplace_searches.find(
                {"created_at_dt": {"$gte": now - timedelta(days=dias)}}, proj2):
            slugs = s.get("colonias") or ([s.get("colonia_id")] if s.get("colonia_id") else [])
            names = []
            for sl in slugs:
                cc = COLONIAS_BY_ID.get(str(sl).strip().lower())
                nm = str((cc or {}).get("name", sl)).strip().lower()
                if nm:
                    names.append(nm)
            if not names:
                continue
            seg, _, _ = infer_segment(s, None)
            amen = [str(a).strip().lower() for a in (s.get("amenidades") or [])]
            for nm in names:
                mkt_by_name[nm] += 1
                col_total[nm] += 1
                cell = cells[(nm, seg)]   # celda RICA (igual que las búsquedas del asesor)
                cell["n"] += 1
                if s.get("recamaras_min") is not None:
                    cell["rec"].append(s["recamaras_min"])
                if s.get("banos_min") is not None:
                    cell["ban"].append(s["banos_min"])
                if s.get("estacionamientos_min") is not None:
                    cell["caj"].append(s["estacionamientos_min"])
                if s.get("precio_max"):
                    cell["precio"].append(int(s["precio_max"]))
                if s.get("m2_min"):
                    cell["m2"].append(int(s["m2_min"]))
                for a in amen:
                    cell["amen"][a] += 1
    except Exception as e:
        log.warning(f"[grafo] marketplace_searches fail-open: {e}")

    # 2c. Copiloto · espinazo: los LIKES del comprador (buyer_signals) suman como INTERÉS por colonia → el dev y
    # el superadmin ven no solo qué se busca, sino qué se DESEA (señal más fuerte). Cierra el ciclo del like.
    likes_by_col: Counter = Counter()
    try:
        # V3-GRAFO-COLONIA-LIKE: el deseo por colonia también incluye guardados ("save") y guardados de unidad de la
        # ficha v3 ("unit_save") — no solo likes — para que la señal de deseo no se apague al migrar a la v3. Aditivo, fail-open.
        async for ls in db.buyer_signals.find(
                {"type": {"$in": ["like", "save", "unit_save"]}, "active": True, "created_at_dt": {"$gte": now - timedelta(days=dias)}},
                {"_id": 0, "colonia": 1}):
            nm = str(ls.get("colonia") or "").strip().lower()
            if not nm:
                continue
            cc = COLONIAS_BY_ID.get(nm)
            nm = str((cc or {}).get("name", nm)).strip().lower()
            likes_by_col[nm] += 1
            col_total[nm] += 1  # el deseo cuenta para la banda de demanda de la colonia
    except Exception as e:
        log.warning(f"[grafo] buyer_signals likes fail-open: {e}")

    # 3. Banda honesta de demanda por colonia (percentil real del total de búsquedas).
    try:
        import metric_normalizer as _mn
        col_vals = [v for v in col_total.values() if v > 0]
        dist = _mn.dist_from_values(col_vals) if col_vals else {"n": 0}
    except Exception:
        _mn, dist = None, {"n": 0}

    # 4. Construir salida por colonia.
    name_to_col = {str(c.get("name", "")).strip().lower(): c for c in COLONIAS}
    target_name_l = None
    if colonia_id:
        cc = COLONIAS_BY_ID.get(colonia_id)
        if cc:
            target_name_l = str(cc.get("name", "")).strip().lower()

    by_col: Dict[str, List[Tuple[str, dict]]] = defaultdict(list)
    for (col, seg), cell in cells.items():
        by_col[col].append((seg, cell))

    out_colonias = []
    for col_name_l, seg_cells in by_col.items():
        if target_name_l and col_name_l != target_name_l:
            continue
        col_doc = name_to_col.get(col_name_l)
        total = col_total.get(col_name_l, 0)
        # P3-02 · re-id: el k-gate (KAN-01) gatea los SEGMENTOS pero el TOTAL de la colonia
        # quedaba crudo con n=1..4 → re-identificación. Aplica el MISMO K_MIN(=5) al total:
        # bajo K no se expone el conteo exacto ni la banda (sólo "<K, sin dato suficiente").
        col_k_suprimido = total < K_MIN
        if col_k_suprimido:
            banda_nivel, banda_et = ("sin_dato", "Sin dato suficiente (pocas búsquedas)")
        elif _mn and total:
            banda = _mn.band_from_dist(dist, total)
            banda_nivel, banda_et = banda.get("nivel"), banda.get("etiqueta")
        else:
            banda_nivel, banda_et = ("sin_dato", "Sin Búsquedas Aún")
        segments_out = []
        for seg, cell in sorted(seg_cells, key=lambda x: -x[1]["n"]):
            n = cell["n"]
            base = {"segmento": seg, "label": SEG_LABEL.get(seg, seg)}
            if n < K_MIN:
                # KAN-01 · gatea TODAS las dimensiones bajo K: no exponer ni el conteo
                # exacto (puede ser n=1) ni el producto de una celda sub-K. Banda honesta.
                base["demanda"] = None
                base["demanda_banda"] = f"<{K_MIN}"
                base["k_suprimido"] = True
                base["producto"] = None
                base["nota"] = "Sin dato suficiente (pocas búsquedas)."
            else:
                base["demanda"] = n
                base["producto"] = {
                    "recamaras": _mode(cell["rec"]),
                    "banos": _mode(cell["ban"]),
                    "cajones": _mode(cell["caj"]),
                    "precio_tipico": _median(cell["precio"]),
                    "m2_min_tipico": _median(cell["m2"]),
                    "top_amenidades": [a for a, _ in cell["amen"].most_common(4)],
                    "terraza_pct": int(round(100 * cell["terraza_n"] / n)) if n else 0,
                }
            segments_out.append(base)
        # KAN-01 · el segmento dominante sólo se revela si lo respalda una celda ≥ K
        # (si no, exponer "el #1 con n=1" reidentifica). Toma el primero NO suprimido.
        dominante = next(
            (s["segmento"] for s in segments_out if not s.get("k_suprimido")), None
        )
        out_colonias.append({
            "colonia_id": col_doc["id"] if col_doc else col_name_l,
            "colonia": col_doc["name"] if col_doc else col_name_l.title(),
            "alcaldia": col_doc.get("alcaldia") if col_doc else None,
            # P3-02 · bajo K no se expone el conteo exacto (n=1..4 re-identifica) ni los
            # sub-conteos (marketplace/likes); se devuelve banda "<K" honesta.
            "demanda_total": None if col_k_suprimido else total,
            "demanda_banda": f"<{K_MIN}" if col_k_suprimido else None,
            "k_suprimido": col_k_suprimido,
            "busquedas_marketplace": None if col_k_suprimido else mkt_by_name.get(col_name_l, 0),  # P2.6 · señal del comprador
            "likes_comprador": None if col_k_suprimido else likes_by_col.get(col_name_l, 0),       # Copiloto · deseo (like) por colonia
            "banda": banda_nivel,
            "etiqueta": banda_et,
            "segmento_dominante": dominante,
            "segmento_dominante_label": SEG_LABEL.get(dominante, "") if dominante else None,
            "segmentos": segments_out,
        })

    # P2.6 · colonias con SOLO búsquedas de marketplace (sin búsquedas de asesor aún) también
    # aparecen — demanda del comprador visible aunque no haya CRM. Build-for-endstate.
    _present = {c["colonia"].strip().lower() for c in out_colonias}
    for nm_l, cnt in mkt_by_name.items():
        if nm_l in _present:
            continue
        if target_name_l and nm_l != target_name_l:
            continue
        col_doc = name_to_col.get(nm_l)
        # P3-02 · re-id: estas colonias sólo tienen búsquedas de marketplace; cnt=1..4 expone
        # un total crudo re-identificable. Mismo K_MIN(=5): bajo K, banda "<K" sin conteo.
        col_k_suprimido = cnt < K_MIN
        banda = _mn.band_from_dist(dist, cnt) if (_mn and cnt and not col_k_suprimido) else {}
        out_colonias.append({
            "colonia_id": col_doc["id"] if col_doc else nm_l,
            "colonia": col_doc["name"] if col_doc else nm_l.title(),
            "alcaldia": col_doc.get("alcaldia") if col_doc else None,
            "demanda_total": None if col_k_suprimido else cnt,
            "demanda_banda": f"<{K_MIN}" if col_k_suprimido else None,
            "k_suprimido": col_k_suprimido,
            "busquedas_marketplace": None if col_k_suprimido else cnt,
            "likes_comprador": None if col_k_suprimido else likes_by_col.get(nm_l, 0),
            "banda": banda.get("nivel", "sin_dato"),
            "etiqueta": banda.get("etiqueta", "Sin dato suficiente (pocas búsquedas)" if col_k_suprimido else "Búsquedas del comprador"),
            "segmento_dominante": None,
            "segmento_dominante_label": None,
            "segmentos": [],
        })
    out_colonias.sort(key=lambda x: -(x.get("demanda_total") or 0))  # P3-02 · total puede ser None (k-suprimido)

    total_busq = sum(col_total.values())
    es_estimado = total_busq < 10
    _result = {
        "colonias": out_colonias,
        "segmentos_catalogo": SEGMENTS,
        "k_anonimato": K_MIN,
        "ventana_dias": dias,
        "muestra": total_busq,
        "es_estimado": es_estimado,
        "lectura": ("Aún con pocas búsquedas — el grafo se llena solo conforme entran búsquedas reales."
                    if es_estimado else f"Grafo vivo con {total_busq} búsquedas reales (últimos {dias} días)."),
        "data_source": "real",
    }
    _GRAFO_CACHE[_ck] = (_time.time(), _result)  # P2.4 · cachea el resultado (TTL 120s)
    if len(_GRAFO_CACHE) > 200:  # evita crecer sin límite
        _oldest = min(_GRAFO_CACHE, key=lambda k: _GRAFO_CACHE[k][0])
        del _GRAFO_CACHE[_oldest]
    return _result


async def infer_contacto_segment(db, owner_id: str, contacto_id: str) -> Dict[str, Any]:
    """Etapa de vida inferida de UN contacto (distintivo en la ficha del asesor).
    Toma su búsqueda más reciente + su tipo de contacto. FAIL-OPEN → indefinido."""
    try:
        tipo = None
        # Scope por dueño: un asesor SOLO ve sus propios contactos (cierra IDOR cross-tenant).
        cq = {"id": contacto_id}
        if owner_id:
            cq["owner_id"] = owner_id
        c = await db.asesor_contactos.find_one(cq, {"_id": 0, "tipo": 1})
        if owner_id and not c:
            return {"segmento": "indefinido", "label": SEG_LABEL["indefinido"],
                    "confianza": 0, "razones": []}
        if c:
            tipo = c.get("tipo")
        bq = {"contacto_id": contacto_id}
        if owner_id:
            bq["owner_id"] = owner_id
        b = await db.asesor_busquedas.find_one(
            bq, {"_id": 0}, sort=[("created_at", -1)])
        seg, conf, reasons = infer_segment(b or {}, tipo)
        return {"segmento": seg, "label": SEG_LABEL.get(seg, seg),
                "confianza": conf, "razones": reasons}
    except Exception as e:
        log.warning(f"[grafo] infer contacto fail-open: {e}")
        return {"segmento": "indefinido", "label": SEG_LABEL["indefinido"],
                "confianza": 0, "razones": []}
