"""COBERTURA DE FUENTE — capa 7: ¿capturamos TODO lo que la fuente contiene?

El reclamo del founder (07-16): los 6 filtros verifican que lo cargado esté CORRECTO,
pero ninguno mide cuánto de lo que el Maestro/lista/Drive CONTIENE realmente llegó al
catálogo. Por eso la misma clase de error se repite: 'la fuente lo tiene, no lo usamos'
(price_from, planos, cotejo, amenidades). Este motor invierte el modelo:

  · toma CADA campo que la fuente trae (29 columnas del Maestro),
  · verifica que aterrice en el catálogo (unidad / dev / amenidades / comercialización),
  · reporta la cobertura % + los HUECOS específicos, ANTES de que el founder los cace.

No es "verifica lo que subí" (censo, capa 6) sino "rinde cuentas de todo lo que la
fuente tiene" (cobertura, capa 7). El registro CAMPOS es la doctrina consultable:
columna nueva del Maestro = un renglón aquí y queda medida para siempre.

Puro/testeable en cobertura_dev(); el I/O (leer Maestro) vive en el driver. $0.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional, Tuple

# (columna del Maestro, ámbito, ¿la fila trae valor?, ¿el catálogo lo capturó?)
# ámbito 'unidad' = se mide por unidad; 'dev' = una vez por desarrollo.
Chequeo = Tuple[str, str, Callable[[Dict], bool], Callable[[Dict, List[Dict]], bool]]


def _tiene(v) -> bool:
    return v not in (None, "", [], {}) and str(v).strip().lower() not in ("nan", "none")


def _tiene_dinero(v) -> bool:
    """Para cuotas/fondos: '0' o 0 = NO hay cuota (no es un dato que capturar).
    Distingue 'la fuente trae $X' de 'la fuente dice que no aplica' (founder 07-16)."""
    if not _tiene(v):
        return False
    try:
        return float(str(v).replace(",", "").split()[0]) != 0
    except (ValueError, IndexError):
        return True    # '12,000 USD' u otro texto = sí hay valor (queda como nota)


CAMPOS: List[Chequeo] = [
    # ── por UNIDAD (la fila del Maestro) ──────────────────────────────────────
    ("RECAMARAS", "unidad", lambda f: _tiene(f.get("RECAMARAS")),
     lambda u, us: _tiene(u.get("bedrooms"))),
    ("BAÑOS", "unidad", lambda f: _tiene(f.get("BAÑOS")),
     lambda u, us: _tiene(u.get("bathrooms"))),
    ("ESTACIONAMIENTOS", "unidad", lambda f: _tiene(f.get("ESTACIONAMIENTOS")),
     lambda u, us: u.get("parking_spots") is not None),
    ("TIPO DE ESTACIONAMIENTO", "unidad", lambda f: _tiene(f.get("TIPO DE ESTACIONAMIENTO")),
     lambda u, us: _tiene(u.get("parking_type"))),
    ("M2 HABITABLE", "unidad", lambda f: _tiene(f.get("M2 HABITABLE")),
     lambda u, us: _tiene(u.get("size_m2"))),
    ("M2 BALCONES / TERRAZA  / PATIO- JARDIN", "unidad",
     lambda f: _tiene(f.get("M2 BALCONES / TERRAZA  / PATIO- JARDIN")),
     lambda u, us: any(_tiene(u.get(k)) for k in ("m2_balcony", "patio_m2", "m2_terrace"))),
    ("M2 ROOF GARDEN", "unidad", lambda f: _tiene(f.get("M2 ROOF GARDEN")),
     lambda u, us: _tiene(u.get("m2_roof_garden"))),
    ("M2 TOTAL", "unidad", lambda f: _tiene(f.get("M2 TOTAL")),
     lambda u, us: _tiene(u.get("m2_total"))),
    ("BODEGA", "unidad", lambda f: _tiene(f.get("BODEGA")),
     lambda u, us: u.get("bodega") is not None),
    ("CUARTO DE SERVICIO", "unidad", lambda f: _tiene(f.get("CUARTO DE SERVICIO")),
     lambda u, us: u.get("cuarto_servicio") is not None),
    ("PRECIO ACTUAL", "unidad", lambda f: _tiene(f.get("PRECIO ACTUAL")),
     lambda u, us: _tiene(u.get("price_mxn") or u.get("price"))),
    ("AMUEBLADO", "unidad", lambda f: _tiene(f.get("AMUEBLADO")),
     lambda u, us: u.get("amueblado") is not None),
    ("RECAMARAS OPCIONALES", "unidad", lambda f: _tiene(f.get("RECAMARAS OPCIONALES")),
     lambda u, us: u.get("recamaras_opcionales") is not None),
    ("NOTAS IMPORTANTES DE LA UNIDAD", "unidad",
     lambda f: _tiene(f.get("NOTAS IMPORTANTES DE LA UNIDAD")),
     lambda u, us: _tiene(u.get("notas_fuente") or u.get("notas"))),
    # ── por DESARROLLO (una vez) ──────────────────────────────────────────────
    ("AMENIDADES", "dev", lambda f: _tiene(f.get("AMENIDADES")),
     lambda dev, ctx: bool((ctx["amenities"] or {}).get("amenities")
                           or (ctx["amenities"] or {}).get("amenities_confirmado_ninguna"))),
    ("ACABADOS A LA ENTREGA", "dev", lambda f: _tiene(f.get("ACABADOS A LA ENTREGA")),
     lambda dev, ctx: _tiene(dev.get("acabados_entrega"))),
    ("ESTATUS DEL DESARROLLO", "dev", lambda f: _tiene(f.get("ESTATUS DEL DESARROLLO")),
     lambda dev, ctx: _tiene(dev.get("stage") or dev.get("etapa_comercial"))),
    ("FECHA DE ENTREGA", "dev", lambda f: _tiene(f.get("FECHA DE ENTREGA")),
     lambda dev, ctx: _tiene(dev.get("delivery_estimate"))),
    ("ALCALDIA / MUNICIPIO", "dev", lambda f: _tiene(f.get("ALCALDIA / MUNICIPIO")),
     lambda dev, ctx: _tiene(dev.get("alcaldia"))),
    ("ZONAS CERCANAS A LA UBICACIÓN", "dev",
     lambda f: _tiene(f.get("ZONAS CERCANAS A LA UBICACIÓN")),
     lambda dev, ctx: _tiene(dev.get("zonas_cercanas"))),
    ("DOMICILIO DE UBICACIÓN", "dev", lambda f: _tiene(f.get("DOMICILIO DE UBICACIÓN")),
     lambda dev, ctx: _tiene(dev.get("address") or dev.get("address_full"))),
    ("UBICACIÓN GOOGLE MAPS", "dev", lambda f: _tiene(f.get("UBICACIÓN GOOGLE MAPS")),
     lambda dev, ctx: dev.get("lat") is not None or _tiene(dev.get("maps_url"))),
    ("FONDO DE MANTENIMIENTO ANTICIPADO", "dev",
     lambda f: _tiene_dinero(f.get("FONDO DE MANTENIMIENTO ANTICIPADO")),
     lambda dev, ctx: dev.get("fondo_mantenimiento_mxn") is not None
     or bool(dev.get("fondo_mantenimiento_nota"))),
    ("CUOTA DE EQUIPAMIENTO AMENIDADES", "dev",
     lambda f: _tiene_dinero(f.get("CUOTA DE EQUIPAMIENTO AMENIDADES")),
     lambda dev, ctx: dev.get("cuota_equipamiento_mxn") is not None
     or bool(dev.get("cuota_equipamiento_nota"))),
    ("TOTAL DEPTOS EN EL DESARROLLO", "dev",
     lambda f: _tiene(f.get("TOTAL DEPTOS EN EL DESARROLLO")),
     lambda dev, ctx: dev.get("total_units") is not None),
    ("DEPARTAMENTO MUESTRA", "dev", lambda f: _tiene(f.get("DEPARTAMENTO MUESTRA")),
     lambda dev, ctx: dev.get("departamento_muestra") is not None),
    ("COMISION", "dev", lambda f: _tiene(f.get("COMISION")),
     lambda dev, ctx: (ctx["comm"] or {}).get("default_commission_pct") is not None),
]


def cobertura_dev(filas_maestro: List[Dict[str, Any]], dev_doc: Dict[str, Any],
                  units: List[Dict[str, Any]], amenities: Optional[Dict] = None,
                  comm: Optional[Dict] = None,
                  match_unidad=None) -> Dict[str, Any]:
    """Mide qué % de lo que la fuente TRAE quedó capturado. match_unidad(fila)->unit
    empareja la fila del Maestro con su unidad del catálogo (para lo por-unidad)."""
    ctx = {"amenities": amenities or {}, "comm": comm or {}}
    huecos: List[Dict[str, Any]] = []
    con_fuente = capturado = 0
    for columna, ambito, trae, capta in CAMPOS:
        if ambito == "dev":
            if not any(trae(f) for f in filas_maestro):
                continue
            con_fuente += 1
            if capta(dev_doc, ctx):
                capturado += 1
            else:
                huecos.append({"campo": columna, "ambito": "dev",
                               "nota": "el Maestro lo trae y el catálogo NO lo tiene"})
        else:  # por unidad: ¿las unidades que deberían tenerlo, lo tienen?
            filas_con = [f for f in filas_maestro if trae(f)]
            if not filas_con:
                continue
            con_fuente += 1
            faltan = 0
            for f in filas_con:
                u = match_unidad(f) if match_unidad else None
                if u is None or not capta(u, units):
                    faltan += 1
            if faltan == 0:
                capturado += 1
            else:
                huecos.append({"campo": columna, "ambito": "unidad", "faltan": faltan,
                               "de": len(filas_con),
                               "nota": f"{faltan}/{len(filas_con)} unidades sin el dato "
                                       f"que el Maestro sí trae"})
    return {"columnas_con_fuente": con_fuente, "capturadas": capturado,
            "cobertura_pct": round(capturado * 100 / con_fuente, 1) if con_fuente else None,
            "huecos": huecos}


async def _cobertura_lista(db, development_id: str, units: List[Dict[str, Any]],
                           dev: Dict[str, Any]) -> Dict[str, Any]:
    """Cobertura cuando la FUENTE es la lista (GDC, sin Maestro): cada columna del header
    debe estar capturada. `columnas_no_mapeadas` (columnas del header que el extractor no
    reconoció) son los huecos; el resto quedó en `fuente_lista` de cada unidad."""
    from datetime import datetime, timezone
    _INTERNOS = {"_valida_m2", "tipo", "esquemas_pago", "level"}
    capturadas = sorted({k for u in units for k in (u.get("fuente_lista") or {})
                         if k not in _INTERNOS})
    no_mapeadas = dev.get("columnas_no_mapeadas") or []
    con_fuente = len(capturadas) + len(no_mapeadas)
    huecos = [{"campo": c, "ambito": "lista", "faltan": len(units), "de": len(units),
               "nota": "columna del header de la lista que el extractor no capturó"}
              for c in no_mapeadas]
    r = {"columnas_con_fuente": con_fuente, "capturadas": len(capturadas),
         "cobertura_pct": round(len(capturadas) * 100 / con_fuente, 1) if con_fuente else None,
         "huecos": huecos, "fuente": "lista"}
    doc = {"development_id": development_id, "ts": datetime.now(timezone.utc).isoformat(), **r}
    await db.cobertura_fuente.update_one({"development_id": development_id},
                                         {"$set": doc}, upsert=True)
    return r


async def registrar_cobertura_dev(db, development_id: str) -> Optional[Dict[str, Any]]:
    """Auto-cobertura SIN depender del Excel: lee el renglón crudo del Maestro que se
    guardó en cada unidad (`fuente_maestro`) al cargar. Si no hay renglones crudos
    (dev viejo sin snapshot), no toca lo ya medido. Append al histórico + upsert último."""
    from datetime import datetime, timezone

    from identidad_unidad import norm_unidad
    units = await db.units.find({"development_id": development_id}, {"_id": 0}).to_list(5000)
    filas = [u["fuente_maestro"] for u in units if u.get("fuente_maestro")]
    if not filas:
        # sin Maestro: si la fuente de unidad es la LISTA (GDC), medir cobertura contra
        # las columnas del header — todo lo que la lista trae debe estar capturado
        dev_l = await db.developments.find_one(
            {"id": development_id}, {"_id": 0, "fuente_unidad": 1, "columnas_no_mapeadas": 1})
        if dev_l and dev_l.get("fuente_unidad") == "lista":
            return await _cobertura_lista(db, development_id, units, dev_l)
        return None
    por_num = {norm_unidad(u.get("unit_number") or ""): u for u in units}
    dev = await db.developments.find_one({"id": development_id}, {"_id": 0}) or {}
    am = await db.project_amenities.find_one({"project_id": development_id}, {"_id": 0})
    comm = await db.project_commercialization.find_one({"project_id": development_id}, {"_id": 0})

    def match(f):
        return por_num.get(norm_unidad(str(f.get("_unit") or f.get("PRODUCTO") or "")))
    r = cobertura_dev(filas, dev, units, am, comm, match_unidad=match)
    doc = {"development_id": development_id, "ts": datetime.now(timezone.utc).isoformat(), **r}
    await db.cobertura_fuente.update_one({"development_id": development_id},
                                         {"$set": doc}, upsert=True)
    return r
