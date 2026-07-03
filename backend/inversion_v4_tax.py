"""Módulo fiscal México 2026 (PROMPT v4 §5) — verificado contra LISR vigente. ESTIMACIÓN: el cálculo definitivo lo
hace el contador/notario. Tarifas y UDIS se actualizan anual → parametrizado.

Cubre: tarifa progresiva art. 152 (11 tramos 1.92%–35%), RESICO PF (113-E), arrendamiento deducción ciega/real
(114-115), asalariado/PFAE (96/100-110), Persona Moral 30% (art. 9), ISR venta PF con exención casa habitación
(93-XIX-a, 700k UDIS) o ganancia con terreno/construcción separados + INPC (124), ISR venta PM, IVA (residencial
exento / comercial 16%). Fuente: Anexo 8 RMF 2026 (DOF 28/12/2025); arts. 9, 34-I, 93-XIX-a, 96, 100-110, 113-E,
114-115, 124, 152 LISR.
"""
from typing import Dict, Any, List, Callable

# Tarifa ANUAL art. 152 (base ISR 2024; actualizar con Anexo 8 RMF vigente). [lim_inf, cuota_fija, % excedente].
ISR_ANUAL_2026: List[List[float]] = [
    [0.01, 0.0, 0.0192],
    [8952.50, 171.88, 0.0640],
    [75984.56, 4461.94, 0.1088],
    [133536.08, 10723.55, 0.1600],
    [155229.81, 14194.54, 0.1792],
    [185852.58, 19682.13, 0.2136],
    [374837.89, 60049.40, 0.2352],
    [590796.00, 110842.74, 0.3000],
    [1127926.85, 271981.99, 0.3200],
    [1503902.47, 392294.17, 0.3400],
    [4511707.38, 1414947.85, 0.3500],
]
# RESICO PF (art. 113-E) por ingreso MENSUAL: [tope_mensual, tasa].
RESICO_PF: List[List[float]] = [
    [25000.0, 0.010], [50000.0, 0.011], [83333.33, 0.015], [208333.33, 0.020], [3500000.0 / 12.0, 0.025],
]
RESICO_PF_TOPE_ANUAL = 3_500_000.0


def tarifa_art152(base_anual: float) -> float:
    """ISR anual por la tarifa progresiva (art. 152). base_anual = base gravable del año."""
    if base_anual <= 0:
        return 0.0
    row = ISR_ANUAL_2026[0]
    for r in ISR_ANUAL_2026:
        if base_anual >= r[0]:
            row = r
        else:
            break
    return row[1] + (base_anual - row[0]) * row[2]


def tasa_marginal_art152(base_anual: float) -> float:
    """Tasa marginal (del tramo) para mostrar/usar como editable."""
    row = ISR_ANUAL_2026[0]
    for r in ISR_ANUAL_2026:
        if base_anual >= r[0]:
            row = r
        else:
            break
    return row[2]


def resico_pf(ingreso_mensual_bruto: float) -> float:
    """ISR RESICO PF mensual (sin deducciones)."""
    if ingreso_mensual_bruto <= 0:
        return 0.0
    for tope, tasa in RESICO_PF:
        if ingreso_mensual_bruto <= tope:
            return ingreso_mensual_bruto * tasa
    return ingreso_mensual_bruto * 0.025


def _g(d: Dict[str, Any], k: str, default: float) -> float:
    v = d.get(k)
    try:
        return float(v) if v is not None else default
    except (TypeError, ValueError):
        return default


def isr_renta_anual(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """ISR anual sobre la renta según régimen. ctx trae: regimen_fiscal, ingreso_bruto_anual, predial, perfil, etc.
    Compara RESICO vs arrendamiento (ciega/real) y reporta cuál paga menos."""
    perfil = ctx.get("perfil", "fisica")
    ingreso = _g(ctx, "ingreso_bruto_anual", 0.0)
    predial = _g(ctx, "predial", 0.0)
    valor = _g(ctx, "valor_propiedad", 0.0)
    terreno_pct = _g(ctx, "terreno_pct", 0.30)
    intereses = _g(ctx, "intereses_hipoteca_anual", 0.0)
    if perfil == "moral":
        depr = valor * (1.0 - terreno_pct) * 0.05                       # art. 34-I
        gastos = sum(_g(ctx, k, 0.0) for k in ("predial", "mantenimiento", "seguro", "comision_administracion"))
        utilidad = ingreso - gastos - depr - intereses
        isr = max(0.0, utilidad) * 0.30                                 # art. 9
        return {"isr_renta_anual": round(isr), "regimen_efectivo": "moral_30", "isr_renta_efectivo_pct": round(isr / ingreso * 100, 1) if ingreso else 0}

    regimen = ctx.get("regimen_fiscal", "auto")
    tasa_marg = ctx.get("tasa_isr_marginal")  # editable; si None se deriva de la tarifa

    # RESICO (si aplica por tope)
    isr_resico = sum(resico_pf((ingreso / 12.0)) for _ in [0]) * 12.0 if ingreso <= RESICO_PF_TOPE_ANUAL else None
    # Arrendamiento ciega
    base_ciega = max(0.0, ingreso * (1.0 - 0.35) - predial)
    isr_ciega = tarifa_art152(base_ciega) if tasa_marg is None else base_ciega * float(tasa_marg)
    # Arrendamiento real
    deducc_real = sum(_g(ctx, k, 0.0) for k in ("predial", "mantenimiento", "seguro")) + intereses + valor * (1 - terreno_pct) * 0.05
    base_real = max(0.0, ingreso - deducc_real)
    isr_real = tarifa_art152(base_real) if tasa_marg is None else base_real * float(tasa_marg)

    opciones = {"resico": isr_resico, "arrend_ciega": round(isr_ciega), "arrend_real": round(isr_real)}
    if regimen in ("resico", "arrend_ciega", "arrend_real"):
        elegido = opciones.get(regimen)
    elif regimen in ("asalariado", "pfae", "honorarios"):
        base = ingreso if regimen == "asalariado" else base_real
        elegido = base * float(tasa_marg) if tasa_marg is not None else tarifa_art152(base)
        opciones[regimen] = round(elegido)
    else:  # auto → el menor entre los aplicables
        aplicables = {k: v for k, v in opciones.items() if v is not None}
        regimen = min(aplicables, key=aplicables.get)
        elegido = aplicables[regimen]
    elegido = round(elegido or 0.0)
    return {"isr_renta_anual": elegido, "regimen_efectivo": regimen, "opciones_isr": opciones,
            "isr_renta_efectivo_pct": round(elegido / ingreso * 100, 1) if ingreso else 0}


def isr_venta(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """ISR sobre la ganancia de venta. PF: exención casa habitación (700k UDIS) o ganancia con terreno/construcción
    separados + INPC. PM: (venta − valor en libros) × 30%. ESTIMACIÓN (lo definitivo lo hace el notario)."""
    perfil = ctx.get("perfil", "fisica")
    valor_venta = _g(ctx, "valor_venta", 0.0)
    costo_adq = _g(ctx, "costo_adquisicion", 0.0)
    terreno_pct = _g(ctx, "terreno_pct", 0.30)
    anios = int(_g(ctx, "horizonte_anios", 5))
    multifamily = ctx.get("multifamily", False)

    if perfil == "moral":
        # Depreciación PM 5%/año topada al valor de la construcción (no puede depreciar el terreno
        # ni pasar del 100% del edificio). Antes sin tope: >20 años depreciaba >100% → sobrestimaba ISR.
        costo_constr_pm = costo_adq * (1 - terreno_pct)
        depr_acum = min(costo_constr_pm * 0.05 * anios, costo_constr_pm)
        valor_libros = costo_adq - depr_acum
        isr = max(0.0, valor_venta - valor_libros) * 0.30
        return {"isr_venta": round(isr), "exento": False, "nota": "PM: (venta − valor en libros) × 30%"}

    # PF — exención casa habitación
    udis = _g(ctx, "udis_actual", 8.40)
    tope_exencion = 700000.0 * udis
    es_casa = ctx.get("es_casa_habitacion", True)
    tipo_residencial = ctx.get("tipo_inmueble", "residencial") == "residencial"
    if (tipo_residencial and es_casa and not multifamily and valor_venta <= tope_exencion
            and not ctx.get("uso_exencion_3anios", False)):
        return {"isr_venta": 0, "exento": True, "nota": f"Exención casa habitación (art. 93-XIX-a · tope {round(tope_exencion):,} MXN)"}

    # PF gravable — REUSA el núcleo art. 126 del Proyector (single source of truth de la tarifa), con INPC
    # PROXY a futuro: la venta es a N años, el INPC futuro no existe todavía → (1+inflación)^años es lo correcto
    # para proyectar. Antes usaba una tarifa art. 152 propia → daba un número distinto al Proyector aunque la UI
    # decía "el mismo motor". La comisión de venta NO entra en la base del ISR (se resta aparte en "neto al vender").
    import tax_projector_engine as _tpe
    inpc_factor = _g(ctx, "inpc_factor", (1.0 + _g(ctx, "inflacion_anual", 0.045)) ** anios)
    core = _tpe._isr_art126_core(costo_adq, valor_venta, terreno_pct, anios, inpc_factor)
    if core["ganancia_total"] <= 0:
        return {"isr_venta": 0, "exento": False, "nota": "Sin ganancia gravable tras actualización por INPC"}
    return {"isr_venta": int(core["isr_total"]), "exento": False, "ganancia_gravable": round(core["ganancia_gravable"]),
            "isr_entidad": int(core["isr_entidad"]), "isr_federacion": int(core["isr_federacion"]),
            "tasa_efectiva_pct": core["tasa_efectiva_pct"],
            "nota": "Art. 126 LISR (mismo método del Proyector de Impuestos) · INPC proxy a futuro · el cálculo definitivo lo hace el notario"}


def iva(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """IVA según USO (no escala): habitacional exento / comercial 16% acreditable."""
    uso = ctx.get("tipo_uso", "habitacional")
    if uso == "habitacional" or ctx.get("tipo_inmueble", "residencial") == "residencial":
        return {"iva_pct": 0, "exento": True, "nota": "Renta habitacional exenta de IVA"}
    return {"iva_pct": 16, "exento": False, "nota": "Comercial/amueblado: IVA 16% acreditable"}


def make_isr_fn(extra: Dict[str, Any] = None) -> Callable:
    """Devuelve isr_fn(ctx)->{isr_renta_anual, isr_venta, ...} para inyectar en inversion_v4_finance.analyze."""
    extra = extra or {}

    def _fn(ctx: Dict[str, Any]) -> Dict[str, Any]:
        c = {**ctx, **extra}
        renta = isr_renta_anual(c)
        venta = isr_venta(c)
        return {"isr_renta_anual": renta["isr_renta_anual"], "isr_venta": venta["isr_venta"],
                "renta": renta, "venta": venta, "iva": iva(c)}
    return _fn
