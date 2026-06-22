"""Motor financiero de inversión inmobiliaria — grado institucional (PROMPT v4). Adaptado a Python/FastAPI.

Motor PURO (sin I/O): toma inputs y devuelve todas las métricas. Fórmulas con fuente (NO improvisadas):
- NOI, cap rate going-in, cash-on-cash (Wall Street Prep, FNRP, Ryan O'Connell CFA, Plante Moran)
- Amortización francesa paramétrica + DSCR + debt yield (Keyway, Wiss)
- Exit cap rate + income approach multifamily (FNRP, NCREIF/CBRE, CREA, Tecnitasa)
- Flujos después de impuestos + TIR/MIRR/VPN + equity multiple (capital TOTAL aportado) + ROI real/nominal
- Regla de apalancamiento + check de coherencia de Gordon (Geltner & Miller)
Correcciones v4 incluidas: equity multiple cuenta TODO el capital (no solo CF_0); VPN descuenta a CETES+prima;
exit cap rate preferente; multifamily muestra cap implícito vs mercado + brecha; coherencia cap≈descuento−crecimiento.

El ISR lo calcula inversion_v4_tax.py (se inyecta). Los datos de mercado vienen de market_rates_engine (se inyectan).
"""
from typing import List, Dict, Any, Optional, Callable


# ───────────────────────── primitivas financieras (verificadas vs numpy-financial) ─────────────────────────
def npv(rate: float, flows: List[float]) -> float:
    """VPN de una serie de flujos (flows[0] en t=0)."""
    return sum(cf / ((1.0 + rate) ** i) for i, cf in enumerate(flows))


def irr(flows: List[float], lo: float = -0.9999, hi: float = 10.0, tol: float = 1e-7) -> Optional[float]:
    """TIR por bisección robusta (busca cambio de signo del VPN). None si no converge (sin solución real)."""
    if not flows or all(f >= 0 for f in flows) or all(f <= 0 for f in flows):
        return None
    f_lo, f_hi = npv(lo, flows), npv(hi, flows)
    if f_lo * f_hi > 0:
        # escanear para hallar un cambio de signo
        prev_r, prev_v = lo, f_lo
        r = lo
        found = False
        while r < hi:
            r += 0.01
            v = npv(r, flows)
            if prev_v * v <= 0:
                lo, hi, found = prev_r, r, True
                break
            prev_r, prev_v = r, v
        if not found:
            return None
    for _ in range(200):
        mid = (lo + hi) / 2.0
        v = npv(mid, flows)
        if abs(v) < tol:
            return mid
        if npv(lo, flows) * v < 0:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2.0


def mirr(flows: List[float], finance_rate: float, reinvest_rate: float) -> Optional[float]:
    """TIR modificada: financia los flujos negativos a finance_rate y reinvierte los positivos a reinvest_rate."""
    n = len(flows) - 1
    if n <= 0:
        return None
    pv_neg = sum(cf / ((1.0 + finance_rate) ** i) for i, cf in enumerate(flows) if cf < 0)
    fv_pos = sum(cf * ((1.0 + reinvest_rate) ** (n - i)) for i, cf in enumerate(flows) if cf > 0)
    if pv_neg == 0 or fv_pos <= 0:
        return None
    return (fv_pos / -pv_neg) ** (1.0 / n) - 1.0


def pmt(principal: float, monthly_rate: float, n_months: int) -> float:
    """Pago mensual de un crédito (amortización francesa). Paramétrico para cualquier tasa/plazo."""
    if n_months <= 0:
        return 0.0
    if monthly_rate <= 0:
        return principal / n_months
    return principal * monthly_rate / (1.0 - (1.0 + monthly_rate) ** (-n_months))


def amortization(principal: float, monthly_rate: float, n_months: int, through_month: int) -> Dict[str, float]:
    """Tabla de amortización hasta through_month. Devuelve saldo pendiente + capital pagado (equity buildup) + interés/capital acumulado."""
    p = pmt(principal, monthly_rate, n_months)
    saldo = principal
    interes_acum = capital_acum = 0.0
    for _ in range(min(through_month, n_months)):
        interes = saldo * monthly_rate
        capital = p - interes
        saldo -= capital
        interes_acum += interes
        capital_acum += capital
    return {"pmt": p, "saldo_pendiente": max(0.0, saldo), "equity_buildup": capital_acum,
            "interes_acum": interes_acum, "capital_acum": capital_acum}


def payoff_con_abono(principal: float, monthly_rate: float, n_months: int, abono_mensual: float) -> Dict[str, float]:
    """Amortización con ABONO mensual a capital (pago extra) → liquidas antes y pagas menos intereses. Devuelve
    meses para liquidar + interés total con abono. (Ejercicios de 'pago a capital'.)"""
    p = pmt(principal, monthly_rate, n_months)
    saldo = principal
    interes_total = 0.0
    mes = 0
    while saldo > 0.005 and mes < n_months:
        interes = saldo * monthly_rate
        capital = (p - interes) + abono_mensual
        if capital >= saldo:
            interes_total += interes
            saldo = 0.0
            mes += 1
            break
        saldo -= capital
        interes_total += interes
        mes += 1
    return {"meses_payoff": mes, "interes_total": interes_total, "pmt_base": p}


def tabla_amortizacion_anual(principal: float, monthly_rate: float, n_months: int) -> list:
    """Amortización por AÑO (todo el plazo): cuánto se va a capital y a interés cada año + saldo al cierre del año.
    Para mostrar cómo, año con año, cada vez se va menos a interés y más a capital hasta liquidar."""
    p = pmt(principal, monthly_rate, n_months)
    saldo = principal
    filas, anio = [], 0
    cap_anio = int_anio = 0.0
    for mes in range(1, n_months + 1):
        interes = saldo * monthly_rate
        capital = min(p - interes, saldo)
        saldo -= capital
        cap_anio += capital
        int_anio += interes
        if mes % 12 == 0 or mes == n_months or saldo <= 0.005:
            anio += 1
            filas.append({"anio": anio, "capital": round(cap_anio), "interes": round(int_anio), "saldo_fin": round(max(0.0, saldo))})
            cap_anio = int_anio = 0.0
        if saldo <= 0.005:
            break
    return filas


def _g(d: Dict[str, Any], k: str, default: float) -> float:
    v = d.get(k)
    try:
        return float(v) if v is not None else default
    except (TypeError, ValueError):
        return default


# ───────────────────────── motor principal ─────────────────────────
def analyze(inp: Dict[str, Any], isr_fn: Optional[Callable] = None) -> Dict[str, Any]:
    """Evalúa una inversión. inp = inputs (§3 del prompt). isr_fn(contexto)->{isr_renta_anual, isr_venta} opcional
    (lo provee inversion_v4_tax). Devuelve todas las métricas + capa de explicación. Cero datos de mercado hardcodeados:
    cetes_1a/inflacion/etc. se pasan en inp (los inyecta el caller desde market_rates_engine)."""
    # ── ejes ──
    perfil = inp.get("perfil", "fisica")                      # fisica | moral
    num_unidades = int(_g(inp, "num_unidades", 1))
    multifamily = num_unidades >= 5                            # umbral Fannie/Freddie (§2)
    con_credito = bool(inp.get("con_credito", True))
    renta_corto = inp.get("modo_renta", "largo") == "corto"

    # ── propiedad ──
    valor = _g(inp, "valor_propiedad", 0.0)
    terreno_pct = _g(inp, "valor_terreno_pct", 0.30)
    escrit_pct = _g(inp, "gastos_escrituracion_pct", 0.08)
    equipamiento = _g(inp, "costo_equipamiento", 0.0)
    costo_total = valor * (1.0 + escrit_pct) + equipamiento

    # ── renta → ingreso efectivo anual neto de vacancia ──
    if renta_corto:
        ingreso_bruto_anual = _g(inp, "tarifa_noche", 0.0) * 365.0 * _g(inp, "ocupacion_pct", 0.0)
        vacancia = 0.0
    else:
        renta_mensual = _g(inp, "renta_mensual", 0.0)
        vacancia = _g(inp, "tasa_vacancia", 0.05)
        ingreso_bruto_anual = renta_mensual * 12.0
    ingreso_efectivo_anual = ingreso_bruto_anual * (1.0 - vacancia)

    # ── egresos operativos (NO crédito/depreciación/CapEx/ISR) ──
    egresos = sum(_g(inp, k, 0.0) for k in (
        "predial", "cuota_condominio", "seguro", "mantenimiento", "comision_administracion", "comision_colocacion"))
    egresos_extra_corto = 0.0
    if renta_corto:
        # costos REALES de Airbnb que NO tiene la renta larga: plataforma, limpieza, servicios (luz/internet/agua),
        # gestión profesional, reposición de amenidades. Si no los mandan, se estiman como % del ingreso bruto (default 22%).
        egresos_extra_corto = sum(_g(inp, k, 0.0) for k in (
            "servicios", "limpieza", "comision_plataforma", "admin_profesional", "reposicion_amenidades"))
        if egresos_extra_corto <= 0:
            egresos_extra_corto = ingreso_bruto_anual * _g(inp, "costo_airbnb_pct", 0.22)
        egresos += egresos_extra_corto

    # ── NOI (§4.1) ──
    noi = ingreso_efectivo_anual - egresos
    cap_rate = (noi / valor) if valor else 0.0                # going-in (§4.2)
    capex_reserve = ingreso_bruto_anual * _g(inp, "capex_reserve_pct", 0.04)

    # ── crédito (§4.4) ──
    cred: Dict[str, Any] = {}
    monto_credito = saldo_pendiente = servicio_deuda_anual = 0.0
    capital_propio = costo_total
    if con_credito:
        ltv = _g(inp, "ltv", 0.80)
        tasa_anual = _g(inp, "tasa_anual", 0.1145)            # Banxico Q1-2026; editable
        convencion = inp.get("convencion_tasa", "nominal")
        tasa_mensual = (tasa_anual / 12.0) if convencion == "nominal" else (1.0 + tasa_anual) ** (1.0 / 12.0) - 1.0
        plazo = int(_g(inp, "plazo_meses", 240))
        monto_credito = valor * ltv
        capital_propio = costo_total - monto_credito
        horizonte = int(_g(inp, "horizonte_anios", 5))
        am = amortization(monto_credito, tasa_mensual, plazo, horizonte * 12)
        am1 = amortization(monto_credito, tasa_mensual, plazo, 12)  # primer año: cuánto del pago anual va a capital vs interés
        servicio_deuda_anual = am["pmt"] * 12.0
        saldo_pendiente = am["saldo_pendiente"]
        interes_total = am["pmt"] * plazo - monto_credito         # interés TOTAL a todo el plazo
        cred = {
            "ltv": ltv, "tasa_anual_pct": round(tasa_anual * 100, 2), "tasa_mensual_pct": round(tasa_mensual * 100, 4),
            "plazo_meses": plazo, "plazo_anios": round(plazo / 12),
            "monto_credito": round(monto_credito), "capital_propio": round(capital_propio),
            "pmt_mensual": round(am["pmt"]), "pago_anual": round(am["pmt"] * 12.0),
            "interes_anio1": round(am1["interes_acum"]), "capital_anio1": round(am1["capital_acum"]),
            "tabla_anual": tabla_amortizacion_anual(monto_credito, tasa_mensual, plazo),
            "pago_total_plazo": round(am["pmt"] * plazo), "interes_total": round(interes_total),
            "interes_en_horizonte": round(am["interes_acum"]), "capital_en_horizonte": round(am["capital_acum"]),
            "saldo_pendiente": round(saldo_pendiente), "equity_buildup": round(am["equity_buildup"]),
            "dscr": round(noi / servicio_deuda_anual, 2) if servicio_deuda_anual else None,
            "debt_yield_pct": round(noi / monto_credito * 100, 2) if monto_credito else None,
            "cobertura_renta_pct": round((ingreso_bruto_anual / 12.0) / am["pmt"] * 100) if am["pmt"] else None,
        }
        # ABONO A CAPITAL (pago extra mensual · ejercicios de pago a capital) → liquidas antes y ahorras intereses
        abono = _g(inp, "abono_capital_mensual", 0.0)
        if abono > 0:
            pa = payoff_con_abono(monto_credito, tasa_mensual, plazo, abono)
            cred["abono"] = {
                "abono_mensual": round(abono), "meses_payoff": pa["meses_payoff"], "anios_payoff": round(pa["meses_payoff"] / 12.0, 1),
                "interes_total_con_abono": round(pa["interes_total"]),
                "interes_ahorrado": round(interes_total - pa["interes_total"]),
                "anios_ahorrados": round((plazo - pa["meses_payoff"]) / 12.0, 1),
            }

    # ── cash-on-cash (§4.3) ──
    capital_base = capital_propio if con_credito else costo_total
    flujo_caja_anual_1 = noi - capex_reserve - servicio_deuda_anual
    cash_on_cash = (flujo_caja_anual_1 / capital_base) if capital_base else 0.0

    # ── PUNTO DE EQUILIBRIO · renta bruta mensual para que el flujo sea 0 (dejar de poner de tu bolsa) ──
    _vac = _g(inp, "tasa_vacancia", 0.05)
    _corto_f = (egresos_extra_corto / ingreso_bruto_anual) if (renta_corto and ingreso_bruto_anual) else 0.0
    _egresos_fijos = egresos - egresos_extra_corto                 # los que NO escalan con la renta (predial, mantenim, seguro)
    _denom = 1.0 - _vac - _g(inp, "capex_reserve_pct", 0.04) - _corto_f
    renta_equilibrio_mensual = round(((_egresos_fijos + servicio_deuda_anual) / _denom) / 12.0) if _denom > 0 else None
    # ocupación de equilibrio (solo Airbnb): % de ocupación al que el flujo = 0
    ocupacion_equilibrio_pct = None
    if renta_corto:
        _tarifa = _g(inp, "tarifa_noche", 0.0)
        if _tarifa > 0 and renta_equilibrio_mensual:
            ocupacion_equilibrio_pct = round((renta_equilibrio_mensual * 12.0) / (_tarifa * 365.0) * 100, 1)

    # ── horizonte / mercado ──
    horizonte = int(_g(inp, "horizonte_anios", 5))
    crec_renta = _g(inp, "crecimiento_renta_anual", 0.05)
    aprec = _g(inp, "apreciacion_anual", 0.087)              # SHF Q1-2026
    comision_venta = _g(inp, "comision_venta_pct", 0.05)
    inflacion = _g(inp, "inflacion_anual", 0.045)
    cetes_1a = _g(inp, "cetes_1a", 0.07)                     # inyectado (market_rates)
    prima_riesgo = _g(inp, "prima_riesgo_inmobiliario", 0.05)
    tasa_descuento = cetes_1a + prima_riesgo                 # v4: NO solo CETES (§3.6)

    # ── valor de salida (§4.5) — exit cap rate preferente ──
    noi_salida = noi * ((1.0 + crec_renta) ** (horizonte - 1))
    exit_cap = _g(inp, "exit_cap_rate", 0.0)
    going_in_cap = _g(inp, "going_in_cap_rate", 0.0)
    if exit_cap > 0:
        valor_venta = noi_salida / exit_cap                 # institucional
    else:
        valor_venta = valor * ((1.0 + aprec) ** horizonte)  # alternativa simple (PF)
    costos_venta = valor_venta * comision_venta

    mf: Dict[str, Any] = {}
    if multifamily:
        precio_pagado = valor
        cap_implicito = (noi / precio_pagado) if precio_pagado else 0.0
        valor_mercado = (noi / going_in_cap) if going_in_cap > 0 else None
        brecha = (precio_pagado / valor_mercado - 1.0) if valor_mercado else None
        mf = {
            "num_unidades": num_unidades,
            "cap_implicito_pct": round(cap_implicito * 100, 2),
            "going_in_cap_pct": round(going_in_cap * 100, 2) if going_in_cap else None,
            "valor_mercado": round(valor_mercado) if valor_mercado else None,
            "brecha_precio_pct": round(brecha * 100, 1) if brecha is not None else None,
            "noi_por_unidad": round(noi / num_unidades) if num_unidades else None,
        }

    # ── ISR (se inyecta · §5) ──
    isr_renta_anual = 0.0
    isr_venta = 0.0
    isr_info: Dict[str, Any] = {}
    if isr_fn:
        ctx = {**inp, "noi": noi, "ingreso_bruto_anual": ingreso_bruto_anual, "valor_propiedad": valor,
               "valor_venta": valor_venta, "costo_adquisicion": costo_total, "horizonte_anios": horizonte,
               "terreno_pct": terreno_pct, "multifamily": multifamily, "perfil": perfil,
               "servicio_deuda_anual": servicio_deuda_anual}
        try:
            r = isr_fn(ctx) or {}
            isr_renta_anual = float(r.get("isr_renta_anual") or 0.0)
            isr_venta = float(r.get("isr_venta") or 0.0)
            isr_info = r
        except Exception:
            isr_info = {}

    # ── flujos después de impuestos (§4.8) ── NOI crece con renta; PMT fijo; deprec. ya dentro del ISR ──
    flows: List[float] = [-(capital_propio if con_credito else costo_total)]
    flujos_anuales = []
    for y in range(1, horizonte + 1):
        noi_y = noi * ((1.0 + crec_renta) ** (y - 1))
        flujo_caja_y = noi_y - capex_reserve - servicio_deuda_anual
        cf = flujo_caja_y - isr_renta_anual
        if y == horizonte:
            cf += valor_venta - costos_venta - isr_venta - (saldo_pendiente if con_credito else 0.0)
        flows.append(cf)
        flujos_anuales.append(round(cf))

    # ── métricas terminales ──
    tir = irr(flows)
    tir_reinv = cetes_1a
    mirr_v = mirr(flows, _g(inp, "tasa_anual", 0.1145) if con_credito else tasa_descuento, tir_reinv)
    vpn = npv(tasa_descuento, flows)
    # equity multiple v4: aportes = |CF_0| + Σ|CF_y<0| ; entradas = Σ CF_y>0
    aportes = sum(-cf for cf in flows if cf < 0)
    entradas = sum(cf for cf in flows if cf > 0)
    equity_multiple = (entradas / aportes) if aportes else None
    roi_nominal = ((entradas - aportes) / aportes) if aportes else None
    roi_anualizado = ((1.0 + roi_nominal) ** (1.0 / horizonte) - 1.0) if (roi_nominal is not None and roi_nominal > -1) else None
    roi_real = ((1.0 + roi_anualizado) / (1.0 + inflacion) - 1.0) if roi_anualizado is not None else None

    # ── TIR desapalancada (para la regla de apalancamiento) ──
    flows_unlev = [-costo_total]
    for y in range(1, horizonte + 1):
        noi_y = noi * ((1.0 + crec_renta) ** (y - 1))
        cf = noi_y - capex_reserve - isr_renta_anual
        if y == horizonte:
            cf += valor_venta - costos_venta - isr_venta
        flows_unlev.append(cf)
    tir_desapalancada = irr(flows_unlev)

    # ── mejor año para vender (curva de TIR por año de salida) ──
    mejor_anio, mejor_tir = _mejor_anio_venta(inp, noi, capex_reserve, servicio_deuda_anual, isr_renta_anual,
                                              crec_renta, aprec, exit_cap, comision_venta, con_credito,
                                              capital_propio, costo_total, monto_credito, valor, isr_venta,
                                              _g(inp, "tasa_anual", 0.1145), inp.get("convencion_tasa", "nominal"),
                                              int(_g(inp, "plazo_meses", 240)))

    # ── reglas / alertas ──
    apalancamiento = None
    if con_credito and tir_desapalancada is not None:
        tasa_cred = _g(inp, "tasa_anual", 0.1145)
        apalancamiento = "positivo" if tir_desapalancada > tasa_cred else "negativo"
    coc_negativo = flujo_caja_anual_1 < 0
    cap_bajo_cetes = cap_rate < cetes_1a
    # coherencia de Gordon (§4.11): cap ≈ descuento − crecimiento
    cap_teorico = tasa_descuento - crec_renta
    incoherencia = abs(cap_rate - cap_teorico) > 0.04 if cap_rate else False

    # ── ANÁLISIS INSTITUCIONAL (due diligence de fondo) ──
    # #2 descomposición del retorno (NCREIF: income vs capital return) — % del total de la ganancia
    _atr = {"renta": sum(noi * ((1.0 + crec_renta) ** (y - 1)) - capex_reserve - servicio_deuda_anual - isr_renta_anual for y in range(1, horizonte + 1)),
            "patrimonio": (cred.get("equity_buildup", 0.0) if con_credito else 0.0),
            "plusvalia": (valor_venta - valor - costos_venta - isr_venta)}
    _tot_atr = sum(_atr.values())
    descomposicion = {k: round(v / _tot_atr * 100, 1) for k, v in _atr.items()} if _tot_atr else None
    # #3 spread sobre tasa libre de riesgo + yield on cost (Geltner & Miller)
    yield_on_cost = (noi / costo_total) if costo_total else 0.0
    # #4 préstamo máximo a un DSCR objetivo (1.2x): PV de la mensualidad que da ese DSCR
    prestamo_max_dscr = None
    if con_credito and tasa_mensual > 0 and noi > 0:
        pmt_obj = (noi / 1.2) / 12.0
        prestamo_max_dscr = round(pmt_obj * (1.0 - (1.0 + tasa_mensual) ** (-plazo)) / tasa_mensual)
    # #6 estabilización (lease-up): NOI año-1 con vacancia inicial mayor vs NOI estabilizado (steady state)
    vac_ini = _g(inp, "vacancia_inicial_pct", 0.0)
    estabilizacion = None
    if vac_ini > 0:
        noi_leaseup = ingreso_bruto_anual * (1.0 - vacancia - vac_ini) - egresos
        estabilizacion = {"noi_estabilizado": round(noi), "noi_ano1_leaseup": round(noi_leaseup),
                          "vacancia_inicial_pct": round(vac_ini * 100, 1)}
    # MÉTRICAS DE REPORTE A NIVEL FONDO (INREV/NCREIF · deep research 2026-06-22) — modo institucional
    venta_neta_exit = max(0.0, valor_venta - costos_venta - isr_venta - (saldo_pendiente if con_credito else 0.0))
    pic = aportes  # paid-in capital (capital aportado: enganche + aportaciones cuando el flujo es negativo)
    _op_flows = list(flujos_anuales[:-1]) + ([flujos_anuales[-1] - venta_neta_exit] if flujos_anuales else [])
    distrib_ops = sum(cf for cf in _op_flows if cf > 0)                # distribuciones operativas POSITIVAS realizadas
    dpi = (distrib_ops / pic) if pic else None                        # Distributions to Paid-In (realizado, sin la venta)
    rvpi = (venta_neta_exit / pic) if pic else None                   # Residual Value to Paid-In (valor al vender / PIC)
    tvpi = ((distrib_ops + venta_neta_exit) / pic) if pic else None   # Total Value to Paid-In = DPI + RVPI
    twr_unlev = (1.0 + cap_rate) * (1.0 + aprec) - 1.0                # NCREIF total return SIN apalancar (income+appreciation)
    tger = (egresos / valor) if valor else None                       # Total Global Expense Ratio (costos del vehículo / GAV)
    metricas_fondo = {
        "pic": round(pic), "tvpi": round(tvpi, 2) if tvpi is not None else None,
        "dpi": round(dpi, 2) if dpi is not None else None, "rvpi": round(rvpi, 2) if rvpi is not None else None,
        "twr_unlev_pct": round(twr_unlev * 100, 2),
        "income_return_pct": round(cap_rate * 100, 2), "apreciacion_return_pct": round(aprec * 100, 2),
        "tger_pct": round(tger * 100, 2) if tger is not None else None,
    }
    analisis_institucional = {
        "descomposicion_retorno_pct": descomposicion,
        "spread_vs_cetes_pts": round((cap_rate - cetes_1a) * 100, 2),
        "yield_on_cost_pct": round(yield_on_cost * 100, 2),
        "prestamo_max_dscr12": prestamo_max_dscr,
        "dscr_objetivo": 1.2,
        "estabilizacion": estabilizacion,
        "metricas_fondo": metricas_fondo,
    }

    return {
        "ok": True, "perfil": perfil, "multifamily": multifamily, "con_credito": con_credito,
        # desglose del costo (estilo pro-forma) + fuentes de cada dato (de dónde sale)
        "desglose": {
            "valor_propiedad": round(valor), "enganche": round(capital_propio) if con_credito else round(costo_total),
            "monto_credito": round(monto_credito), "gastos_escrituracion": round(valor * escrit_pct),
            "equipamiento": round(equipamiento), "costo_total": round(costo_total),
            "ingreso_bruto_anual": round(ingreso_bruto_anual), "ingreso_efectivo_anual": round(ingreso_efectivo_anual),
            "egresos_operativos": round(egresos), "capex_reserve": round(capex_reserve),
            # de qué se componen los gastos de escrituración (proporcional al total; ISAI lo afina el Proyector de Impuestos)
            "escrituracion_detalle": [
                {"concepto": "ISAI (impuesto por comprar)", "monto": round(valor * escrit_pct * 0.625), "nota": "el monto exacto lo calcula el Proyector de Impuestos"},
                {"concepto": "Honorarios del notario", "monto": round(valor * escrit_pct * 0.1875), "nota": "redacta y da fe de la escritura"},
                {"concepto": "Registro Público de la Propiedad", "monto": round(valor * escrit_pct * 0.125), "nota": "inscribe el depa a tu nombre"},
                {"concepto": "Avalúo, certificados y gestoría", "monto": round(valor * escrit_pct * 0.0625), "nota": "trámites previos"},
            ],
        },
        # CUANDO LO VENDAS (impuestos) — reusa el ISR de venta del Proyector de Impuestos
        "venta": {
            "valor_venta": round(valor_venta), "ganancia_bruta": round(valor_venta - valor),
            "comision": round(costos_venta), "isr": round(isr_venta),
            "saldo_credito": round(saldo_pendiente) if con_credito else 0,
            "neto": round(valor_venta - costos_venta - isr_venta - (saldo_pendiente if con_credito else 0.0)),
            "horizonte_anios": horizonte,
        },
        "fuentes": {
            "plusvalia": "SHF (Sociedad Hipotecaria Federal), Q1-2026", "tasa_hipotecaria": "Banxico, prom. Q1-2026",
            "cetes": "Banxico SIE (CETES 28/364d, en vivo)", "udis": "Banxico SIE (SP68257)", "fix_usd": "Banxico SIE (SF43718)",
            "cap_rate": "calculado (NOI ÷ precio)",
            "renta": ("AirROI (renta corta / Airbnb por zona)" if renta_corto else "promedio de renta de la zona (motor DMX)"),
            "isr": "LISR 2026 · estimación (detalle fino en el Proyector de Impuestos)",
            "amortizacion": "amortización francesa estándar", "metricas": "TIR/MIRR/VPN (Geltner & Miller · CFA)",
        },
        # capa pro (valores crudos)
        "noi": round(noi), "cap_rate_pct": round(cap_rate * 100, 2),
        "cash_on_cash_pct": round(cash_on_cash * 100, 2),
        "flujo_caja_anual_1": round(flujo_caja_anual_1), "flujo_mensual_1": round(flujo_caja_anual_1 / 12.0),
        "renta_equilibrio_mensual": renta_equilibrio_mensual, "ocupacion_equilibrio_pct": ocupacion_equilibrio_pct,
        "costo_total": round(costo_total), "capital_invertido": round(capital_base),
        "valor_venta": round(valor_venta), "costos_venta": round(costos_venta),
        "neto_al_vender": round(valor_venta - costos_venta - isr_venta - (saldo_pendiente if con_credito else 0.0)),
        "plusvalia_neta": round(valor_venta - valor),
        "tir_pct": round(tir * 100, 2) if tir is not None else None,
        "tir_desapalancada_pct": round(tir_desapalancada * 100, 2) if tir_desapalancada is not None else None,
        "mirr_pct": round(mirr_v * 100, 2) if mirr_v is not None else None,
        "vpn": round(vpn),
        "equity_multiple": round(equity_multiple, 2) if equity_multiple is not None else None,
        "roi_anualizado_pct": round(roi_anualizado * 100, 2) if roi_anualizado is not None else None,
        "roi_real_pct": round(roi_real * 100, 2) if roi_real is not None else None,
        "tasa_descuento_pct": round(tasa_descuento * 100, 2),
        "cetes_1a_pct": round(cetes_1a * 100, 2),
        "credito": cred, "multifamily_info": mf, "isr": isr_info,
        "flujos_anuales": flujos_anuales,
        "mejor_anio_venta": mejor_anio, "mejor_anio_tir_pct": round(mejor_tir * 100, 2) if mejor_tir is not None else None,
        # atribución del retorno (cascada · §4.9)
        "atribucion": {
            "renta_neta_acum": round(sum(noi * ((1.0 + crec_renta) ** (y - 1)) - capex_reserve - servicio_deuda_anual - isr_renta_anual for y in range(1, horizonte + 1))),
            "equity_buildup": round(cred.get("equity_buildup", 0.0)) if con_credito else 0,
            "plusvalia": round(valor_venta - valor - costos_venta - isr_venta),
        },
        "analisis_institucional": analisis_institucional,
        # reglas / alertas
        "apalancamiento": apalancamiento,
        "alertas": {"coc_negativo": coc_negativo, "dscr_bajo_1": (cred.get("dscr") is not None and cred["dscr"] < 1),
                    "cap_bajo_cetes": cap_bajo_cetes, "inputs_incoherentes": incoherencia},
    }


def proyeccion(inp: Dict[str, Any], isr_fn: Optional[Callable] = None, anios=(1, 3, 5, 10, 15, 20)) -> Dict[str, Any]:
    """Proyección año a año (cap rate, plusvalía, valor, renta, mensualidad, neto al vender, TIR-si-vendes) + el MEJOR
    año para salir (vender vs quedarse). Corre el motor saliendo en cada año → la curva de TIR por año de salida."""
    base = analyze(inp, isr_fn)
    noi = base.get("noi", 0.0)
    ingreso_bruto = (base.get("desglose") or {}).get("ingreso_bruto_anual", 0.0)
    # año 0 = PRECIO del inmueble (sin escrituración), para que la curva de valor sea coherente: año0 < año1 < ...
    valor_compra = (base.get("desglose") or {}).get("valor_propiedad") or base.get("costo_total", 0)
    crec = _g(inp, "crecimiento_renta_anual", 0.05)
    aprec = _g(inp, "apreciacion_anual", 0.075)
    # tasa de oportunidad (hurdle): lo que ganarías sin riesgo + prima por el riesgo inmobiliario. Marco de disposición
    # óptima = "retorno marginal de retener" (Geltner, Miller, Clayton & Eichholtz, Commercial Real Estate Analysis & Investments).
    hurdle = _g(inp, "cetes_1a", 0.07) + _g(inp, "prima_riesgo_inmobiliario", 0.05)
    rows: List[Dict[str, Any]] = []
    best_y, best_tir, mejor_marginal_y = None, None, None
    for y in anios:
        ry = analyze({**inp, "horizonte_anios": y}, isr_fn)
        cred = ry.get("credito") or {}
        noi_y = round(noi * ((1.0 + crec) ** (y - 1)))
        renta_bruta_y = round(ingreso_bruto * ((1.0 + crec) ** (y - 1)))
        pmt = cred.get("pmt_mensual", 0) or 0
        diferencial_mensual = round(noi_y / 12.0 - pmt)   # lo que te queda (o pones) al mes tras gastos y crédito
        valor_y = ry.get("valor_venta") or 0
        # retorno marginal de retener un año más ≈ renta sobre el valor actual (cap rate "vivo") + plusvalía esperada
        retorno_marginal = (noi_y / valor_y + aprec) if valor_y else 0.0
        rows.append({
            "anio": y, "valor": valor_y, "plusvalia_acum": ry.get("plusvalia_neta"),
            "noi_anual": noi_y, "cap_rate_pct": ry.get("cap_rate_pct"),
            "renta_bruta_mensual": round(renta_bruta_y / 12.0), "renta_mensual": round(noi_y / 12.0),
            "mensualidad_credito": pmt, "diferencial_mensual": diferencial_mensual, "saldo_credito": cred.get("saldo_pendiente", 0),
            "neto_al_vender": ry.get("neto_al_vender"), "tir_si_vendes": ry.get("tir_pct"),
            "retorno_marginal_pct": round(retorno_marginal * 100, 2),
        })
        t = ry.get("tir_pct")
        if t is not None and (best_tir is None or t > best_tir):
            best_tir, best_y = t, y
        if retorno_marginal >= hurdle:                 # mientras retenerlo beneficie más que tu alternativa, conviene quedárselo
            mejor_marginal_y = y
    # payback: primer año en que lo que te llevas al vender (neto) ya recupera lo que pusiste
    cap_inv = base.get("capital_invertido", 0)
    payback_anio = next((row["anio"] for row in rows if (row.get("neto_al_vender") or 0) >= cap_inv), None)
    # recomendación honesta: la regla de disposición (retorno marginal vs hurdle), no solo "máxima TIR"
    hpct = round(hurdle * 100, 1)
    if mejor_marginal_y is None:
        rec = (f"Bajo estos supuestos, el rendimiento de SEGUIR reteniéndolo (renta sobre su valor + plusvalía ~{aprec*100:.1f}%) "
               f"ya está por debajo de tu tasa de oportunidad (~{hpct}%): este inmueble es más una jugada de plusvalía/refugio "
               f"que de rendimiento puro. Tiene sentido si valoras el activo físico y la protección. La columna 'TIR si vendes' "
               f"muestra tu rendimiento realizado en cada año de salida.")
    elif mejor_marginal_y >= max(anios):
        rec = (f"Conviene quedártelo: retenerlo un año más te rinde (~renta/valor + plusvalía) por encima de tu tasa de "
               f"oportunidad (~{hpct}%) en todo el horizonte. Como los costos de comprar/vender se reparten en más años, "
               f"la 'TIR si vendes' mejora cuanto más lo tengas. Vende cuando el rendimiento de retenerlo caiga de tu alternativa, "
               f"necesites el dinero, o la plusvalía se desacelere.")
    else:
        rec = (f"Punto de salida sugerido: ~año {mejor_marginal_y}. Hasta ahí, retenerlo te rinde más que tu tasa de oportunidad "
               f"(~{hpct}%); después, el rendimiento de seguir reteniéndolo cae por debajo y conviene vender y reinvertir. "
               f"Regla de 'retorno marginal de retención' (Geltner & Miller).")
    return {"rows": rows, "mejor_anio": best_y, "mejor_tir_pct": best_tir, "payback_anio": payback_anio,
            "salida_marginal_anio": mejor_marginal_y, "hurdle_pct": hpct, "recomendacion": rec, "valor_compra": round(valor_compra),
            "bibliografia": "Geltner, Miller, Clayton & Eichholtz — Commercial Real Estate Analysis & Investments (decisión de disposición / retorno marginal de retención).",
            "veredicto_salida": ("VENDER" if mejor_marginal_y and mejor_marginal_y < max(anios) else "QUEDÁRSELO")}


def comparar_renta(inp: Dict[str, Any], isr_fn: Optional[Callable] = None) -> Dict[str, Any]:
    """Compara largo plazo vs Airbnb (corto plazo) con los mismos datos de propiedad → ingresos/egresos/TIR de cada uno."""
    largo = analyze({**inp, "modo_renta": "largo"}, isr_fn)
    corto = analyze({**inp, "modo_renta": "corto"}, isr_fn)

    def _resumen(res, modo):
        dg = res.get("desglose", {}) or {}
        ingreso_anual = dg.get("ingreso_bruto_anual") or 0
        out = {"tir_pct": res.get("tir_pct"), "cap_rate_pct": res.get("cap_rate_pct"),
               "flujo_mensual": res.get("flujo_mensual_1"), "noi": res.get("noi"),
               "ingreso_anual": round(ingreso_anual), "ingreso_mensual": round(ingreso_anual / 12.0),
               "egresos_anual": round(dg.get("egresos_operativos") or 0)}
        if modo == "corto":
            occ = _g(inp, "ocupacion_pct", 0.6)
            out["tarifa_noche"] = round(_g(inp, "tarifa_noche", 0))
            out["ocupacion_pct"] = round(occ * 100)
            out["noches_mes"] = round(occ * 30)
        return out

    return {
        "largo": _resumen(largo, "largo"), "corto": _resumen(corto, "corto"),
        "gana": "corto" if (corto.get("tir_pct") or -99) > (largo.get("tir_pct") or -99) else "largo",
    }


def escenarios(inp: Dict[str, Any], isr_fn: Optional[Callable] = None) -> Dict[str, Any]:
    """3 escenarios (base / optimista / pesimista) con sets de supuestos distintos — como modela un comité de inversión
    el downside. Mueve plusvalía, tasa del crédito y vacancia."""
    apr = _g(inp, "apreciacion_anual", 0.075)
    ta = _g(inp, "tasa_anual", 0.1145)
    vac = _g(inp, "tasa_vacancia", 0.05)
    defs = {
        "optimista": {"apreciacion_anual": round(apr + 0.015, 4), "tasa_anual": round(max(0.02, ta - 0.01), 4), "tasa_vacancia": round(max(0.0, vac - 0.02), 4)},
        "pesimista": {"apreciacion_anual": round(max(0.0, apr - 0.015), 4), "tasa_anual": round(ta + 0.02, 4), "tasa_vacancia": round(vac + 0.05, 4)},
    }

    def pack(res):
        return {"tir_pct": res.get("tir_pct"), "neto_al_vender": res.get("neto_al_vender"),
                "flujo_mensual": res.get("flujo_mensual_1"), "roi_pct": res.get("roi_anualizado_pct")}
    out = {"base": pack(analyze(inp, isr_fn))}
    for k, delta in defs.items():
        out[k] = pack(analyze({**inp, **delta}, isr_fn))
    out["supuestos"] = {
        "optimista": f"plusvalía {round((apr+0.015)*100,1)}% · tasa {round((ta-0.01)*100,1)}% · vacancia {round(max(0,vac-0.02)*100)}%",
        "pesimista": f"plusvalía {round(max(0,apr-0.015)*100,1)}% · tasa {round((ta+0.02)*100,1)}% · vacancia {round((vac+0.05)*100)}%",
    }
    return out


def proforma(inp: Dict[str, Any], isr_fn: Optional[Callable] = None) -> List[Dict[str, Any]]:
    """Estado de flujos año por año (pro-forma de comité): ingreso bruto → NOI → −servicio de deuda → flujo libre.
    Determinista (la renta crece a crecimiento_renta_anual, el servicio de deuda es fijo) — barato, sin analyze por año."""
    base = analyze(inp, isr_fn)
    noi0 = base.get("noi", 0.0)
    ingreso0 = (base.get("desglose") or {}).get("ingreso_bruto_anual", 0.0)
    crec = _g(inp, "crecimiento_renta_anual", 0.05)
    cred = base.get("credito") or {}
    servicio = (cred.get("pmt_mensual", 0) or 0) * 12.0
    hz = int(_g(inp, "horizonte_anios", 5))
    rows = []
    for y in range(1, hz + 1):
        f = (1.0 + crec) ** (y - 1)
        noi_y = noi0 * f
        rows.append({"anio": y, "ingreso_bruto": round(ingreso0 * f), "noi": round(noi_y),
                     "servicio_deuda": round(servicio), "flujo_libre": round(noi_y - servicio)})
    return rows


def portafolio(units: List[Dict[str, Any]], inp: Dict[str, Any], isr_fn: Optional[Callable] = None, descuento_pct: float = 0.0) -> Dict[str, Any]:
    """Modo fondo: corre N unidades (mismos supuestos de crédito/horizonte) y las AGREGA en un portafolio.
    Cap rate combinado (ponderado por NOI), TIR del portafolio (suma de flujos elemento a elemento), DSCR combinado,
    inversión/precio/NOI/flujo/neto totales. descuento_pct aplica un descuento por volumen al precio de cada unidad."""
    if not units:
        return {"n_unidades": 0}
    res = []
    for u in units:
        precio = (u.get("precio") or 0) * (1.0 - descuento_pct)
        sub = {**inp, "valor_propiedad": precio,
               "predial": round(precio * 0.0016), "mantenimiento": round(precio * 0.0024), "seguro": round(precio * 0.0012)}
        if u.get("renta"):
            sub["renta_mensual"] = u["renta"]
        res.append(analyze(sub, isr_fn))
    # TIR del portafolio: flujo completo por unidad = [-inversión] + flujos_anuales, sumados elemento a elemento
    streams = [[-(r.get("capital_invertido") or 0)] + (r.get("flujos_anuales") or []) for r in res]
    maxlen = max((len(s) for s in streams), default=0)
    combined = [0.0] * maxlen
    for s in streams:
        for i, cf in enumerate(s):
            combined[i] += cf
    tir_port = irr(combined)
    precio_total = sum((r.get("desglose") or {}).get("valor_propiedad", 0) for r in res)
    inversion_total = sum(r.get("capital_invertido", 0) for r in res)
    noi_total = sum(r.get("noi", 0) for r in res)
    servicio_total = sum(((r.get("credito") or {}).get("pmt_mensual", 0) or 0) * 12 for r in res)
    flujo_total = sum(r.get("flujo_mensual_1", 0) for r in res)
    neto_total = sum(r.get("neto_al_vender", 0) for r in res)
    cap_comb = (noi_total / precio_total) if precio_total else 0.0
    dscr_comb = (noi_total / servicio_total) if servicio_total else None
    return {
        "n_unidades": len(res), "precio_total": round(precio_total), "inversion_total": round(inversion_total),
        "noi_total": round(noi_total), "cap_rate_combinado_pct": round(cap_comb * 100, 2),
        "servicio_deuda_total": round(servicio_total), "dscr_combinado": round(dscr_comb, 2) if dscr_comb is not None else None,
        "flujo_mensual_total": round(flujo_total), "neto_al_vender_total": round(neto_total),
        "tir_portafolio_pct": round(tir_port * 100, 2) if tir_port is not None else None,
        "descuento_pct": round(descuento_pct * 100, 1),
        "unidades": [{"label": u.get("label") or f"Unidad {i + 1}", "precio": round((u.get("precio") or 0) * (1.0 - descuento_pct)),
                      "tir_pct": res[i].get("tir_pct"), "cap_rate_pct": res[i].get("cap_rate_pct"),
                      "flujo_mensual": res[i].get("flujo_mensual_1")} for i, u in enumerate(units)],
    }


def montecarlo(inp: Dict[str, Any], isr_fn: Optional[Callable] = None, n: int = 400) -> Optional[Dict[str, Any]]:
    """Simulación Monte Carlo (§9 Nivel 2): varía apreciación/vacancia/tasa (normal) → distribución de TIR, VaR
    (p5/p50/p95) y probabilidad de que la TIR quede por debajo de CETES. Determinístico (seed) para reproducibilidad."""
    import random
    aprec = _g(inp, "apreciacion_anual", 0.075)
    vac = _g(inp, "tasa_vacancia", 0.05)
    tasa = _g(inp, "tasa_anual", 0.1145)
    cetes = _g(inp, "cetes_1a", 0.07)
    rnd = random.Random(42)
    tirs: List[float] = []
    for _ in range(n):
        ap = max(-0.05, rnd.gauss(aprec, 0.025))
        va = min(0.4, max(0.0, rnd.gauss(vac, 0.04)))
        ta = max(0.05, rnd.gauss(tasa, 0.012)) if inp.get("con_credito", True) else tasa
        r = analyze({**inp, "apreciacion_anual": ap, "tasa_vacancia": va, "tasa_anual": ta, "exit_cap_rate": 0.0}, isr_fn)
        t = r.get("tir_pct")
        if t is not None:
            tirs.append(t)
    if not tirs:
        return None
    tirs.sort()

    def pctl(p):
        return tirs[min(len(tirs) - 1, int(p * len(tirs)))]
    prob = sum(1 for t in tirs if t < cetes * 100) / len(tirs)
    # histograma (8 cubetas)
    lo, hi = tirs[0], tirs[-1]
    span = (hi - lo) or 1.0
    buckets = [0] * 8
    for t in tirs:
        buckets[min(7, int((t - lo) / span * 8))] += 1
    return {"n": len(tirs), "p5": round(pctl(0.05), 1), "p50": round(pctl(0.50), 1), "p95": round(pctl(0.95), 1),
            "media": round(sum(tirs) / len(tirs), 1), "prob_bajo_cetes_pct": round(prob * 100),
            "hist": [{"desde": round(lo + i * span / 8, 1), "n": b} for i, b in enumerate(buckets)]}


def sensibilidad(inp: Dict[str, Any], isr_fn: Optional[Callable] = None) -> Dict[str, Any]:
    """Matriz de sensibilidad (§4.5: 0.25% en exit cap mueve la TIR 200-400pb → obligatoria). Varía exit cap rate y
    apreciación, devuelve la TIR de cada escenario. Si no hay exit cap, deriva una base del cap rate going-in."""
    base = analyze(inp, isr_fn)
    cap_going = (base.get("cap_rate_pct") or 6.0) / 100.0
    exit_base = _g(inp, "exit_cap_rate", 0.0) or max(0.04, cap_going)
    # 1D exit cap rate: base ± 1% en pasos de 0.25%
    exit_row = []
    for d in (-0.01, -0.005, -0.0025, 0.0, 0.0025, 0.005, 0.01):
        ec = round(exit_base + d, 4)
        if ec <= 0:
            continue
        r = analyze({**inp, "exit_cap_rate": ec}, isr_fn)
        exit_row.append({"exit_cap_pct": round(ec * 100, 2), "tir_pct": r.get("tir_pct"), "es_base": d == 0.0})
    # 1D apreciación: base ± 2% en pasos de 1%
    apr_base = _g(inp, "apreciacion_anual", 0.075)
    apr_row = []
    for d in (-0.03, -0.02, -0.01, 0.0, 0.01, 0.02, 0.03):
        ap = round(apr_base + d, 4)
        r = analyze({**inp, "apreciacion_anual": ap, "exit_cap_rate": 0.0}, isr_fn)
        apr_row.append({"apreciacion_pct": round(ap * 100, 1), "tir_pct": r.get("tir_pct"), "es_base": d == 0.0})
    # 2D · mapa de calor: TIR según tasa del crédito (filas) × plusvalía (columnas)
    tasa_base = _g(inp, "tasa_anual", 0.1145)
    tasas = [round(tasa_base + d, 4) for d in (-0.02, -0.01, 0.0, 0.01, 0.02) if tasa_base + d > 0]
    aprs = [round(apr_base + d, 4) for d in (-0.02, -0.01, 0.0, 0.01, 0.02)]
    matriz = []
    for ta in tasas:
        celdas = []
        for ap in aprs:
            rr = analyze({**inp, "tasa_anual": ta, "apreciacion_anual": ap, "exit_cap_rate": 0.0}, isr_fn)
            celdas.append({"tir_pct": rr.get("tir_pct"), "es_base": abs(ta - tasa_base) < 1e-9 and abs(ap - apr_base) < 1e-9})
        matriz.append({"tasa_pct": round(ta * 100, 2), "celdas": celdas})
    return {"por_exit_cap": exit_row, "por_apreciacion": apr_row,
            "por_tasa_aprec": {"aprec_cols": [round(a * 100, 1) for a in aprs], "filas": matriz}}


def _mejor_anio_venta(inp, noi, capex, servicio, isr_renta, crec, aprec, exit_cap, com_venta, con_credito,
                      cap_propio, costo_total, monto_credito, valor, isr_venta, tasa_anual, convencion, plazo) -> tuple:
    """Curva de TIR por año de salida (2..10) → el año que maximiza la TIR. Sin recalcular ISR de venta por año (aprox)."""
    tasa_mensual = (tasa_anual / 12.0) if convencion == "nominal" else (1.0 + tasa_anual) ** (1.0 / 12.0) - 1.0
    best_y, best_tir = None, None
    for h in range(2, 11):
        noi_salida = noi * ((1.0 + crec) ** (h - 1))
        valor_venta = (noi_salida / exit_cap) if exit_cap > 0 else valor * ((1.0 + aprec) ** h)
        saldo = amortization(monto_credito, tasa_mensual, plazo, h * 12)["saldo_pendiente"] if con_credito else 0.0
        flows = [-(cap_propio if con_credito else costo_total)]
        for y in range(1, h + 1):
            noi_y = noi * ((1.0 + crec) ** (y - 1))
            cf = noi_y - capex - servicio - isr_renta
            if y == h:
                cf += valor_venta - valor_venta * com_venta - isr_venta - saldo
            flows.append(cf)
        t = irr(flows)
        if t is not None and (best_tir is None or t > best_tir):
            best_tir, best_y = t, h
    return best_y, best_tir
