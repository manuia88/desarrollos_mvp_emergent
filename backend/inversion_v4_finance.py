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
    if renta_corto:
        egresos += sum(_g(inp, k, 0.0) for k in (
            "servicios", "limpieza", "comision_plataforma", "admin_profesional", "reposicion_amenidades"))

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
        servicio_deuda_anual = am["pmt"] * 12.0
        saldo_pendiente = am["saldo_pendiente"]
        cred = {
            "ltv": ltv, "tasa_anual_pct": round(tasa_anual * 100, 2), "monto_credito": round(monto_credito),
            "capital_propio": round(capital_propio), "pmt_mensual": round(am["pmt"]),
            "saldo_pendiente": round(saldo_pendiente), "equity_buildup": round(am["equity_buildup"]),
            "dscr": round(noi / servicio_deuda_anual, 2) if servicio_deuda_anual else None,
            "debt_yield_pct": round(noi / monto_credito * 100, 2) if monto_credito else None,
            "cobertura_renta_pct": round((ingreso_bruto_anual / 12.0) / am["pmt"] * 100) if am["pmt"] else None,
        }

    # ── cash-on-cash (§4.3) ──
    capital_base = capital_propio if con_credito else costo_total
    flujo_caja_anual_1 = noi - capex_reserve - servicio_deuda_anual
    cash_on_cash = (flujo_caja_anual_1 / capital_base) if capital_base else 0.0

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

    return {
        "ok": True, "perfil": perfil, "multifamily": multifamily, "con_credito": con_credito,
        # capa pro (valores crudos)
        "noi": round(noi), "cap_rate_pct": round(cap_rate * 100, 2),
        "cash_on_cash_pct": round(cash_on_cash * 100, 2),
        "flujo_caja_anual_1": round(flujo_caja_anual_1), "flujo_mensual_1": round(flujo_caja_anual_1 / 12.0),
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
        # reglas / alertas
        "apalancamiento": apalancamiento,
        "alertas": {"coc_negativo": coc_negativo, "dscr_bajo_1": (cred.get("dscr") is not None and cred["dscr"] < 1),
                    "cap_bajo_cetes": cap_bajo_cetes, "inputs_incoherentes": incoherencia},
    }


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
    return {"por_exit_cap": exit_row, "por_apreciacion": apr_row}


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
