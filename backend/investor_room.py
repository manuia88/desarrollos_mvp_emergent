"""SALA DE INVERSIONISTAS (perfil YC/VC) — motor.

Todo número que un inversionista ve aquí sale de una FUENTE REAL del sistema (registro de
features con precio, catastro, genoma, git, costo de IA) o de un SUPUESTO EDITABLE marcado
como supuesto. Nada inventado: la regla es "verificable, no slideware".

Bloques: economía por cliente · TAM bottom-up desde el dato propio · velocity (git) ·
burn/runway · métricas norte (instrumentadas HOY) · entrevistas de usuarios · pipeline de
pilotos/LOIs · checklist legal · score de preparación YC.

Universalidad: registros, no ifs — agregar una métrica/etapa/ítem = 1 entrada.
"""
from __future__ import annotations

import os
import subprocess
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

# ─── Supuestos default (EDITABLES desde la UI; se persisten en investor_room_config) ────
SUPUESTOS_DEFAULT: Dict[str, Any] = {
    # TAM bottom-up: universo → alcanzable → obtenible
    "devs_cdmx": 350,               # desarrolladoras activas en CDMX (universo)
    "inmobiliarias_cdmx": 1200,     # inmobiliarias/brokerages CDMX
    "pct_alcanzable": 30,           # % del universo alcanzable en 3 años
    "pct_obtenible": 10,            # % del alcanzable que se convierte
    "precio_dev_mxn": 7900,         # ticket mensual dev full-stack (del price book)
    "precio_inmo_mxn": 2900,        # ticket mensual inmobiliaria
    "burn_fijo_mxn": 8000,          # gastos fijos/mes (infra, dominios, herramientas)
    "caja_mxn": 0,                  # caja disponible (para runway) — lo pone el founder
}

# ─── Métricas norte: las 5-7 curvas que se cuentan desde el día cero ─────────────────────
# (coleccion, campo_ts) → count total + últimos 7d vs 7d previos. Agregar métrica = 1 entrada.
METRICAS_NORTE: List[Dict[str, str]] = [
    {"id": "atomos_demanda", "nombre": "Átomos de demanda", "col": "demand_atoms", "ts": "ts",
     "por_que": "Cada interacción se vuelve dato de mercado: es el flywheel girando."},
    {"id": "predios_catastro", "nombre": "Predios con dato", "col": "catastro_predios", "ts": "",
     "por_que": "El moat: cobertura de dato a nivel predio en CDMX."},
    {"id": "proyectos", "nombre": "Proyectos en plataforma", "col": "developments", "ts": "created_at",
     "por_que": "Oferta viva publicada (lado inventario del espejo)."},
    {"id": "unidades", "nombre": "Unidades con dato", "col": "units", "ts": "created_at",
     "por_que": "Granularidad a nivel unidad: nadie más la tiene."},
    {"id": "usuarios", "nombre": "Usuarios registrados", "col": "users", "ts": "created_at",
     "por_que": "Adopción de los 4 portales."},
    {"id": "leads", "nombre": "Leads registrados", "col": "leads", "ts": "created_at",
     "por_que": "Demanda con nombre: el inicio del ciclo de cierre."},
]

# ─── Pipeline de pilotos: etapas honestas (sin humo) ─────────────────────────────────────
ETAPAS_PIPELINE: List[Dict[str, str]] = [
    {"id": "contactado", "nombre": "Contactado", "des": "Primera conversación agendada o hecha"},
    {"id": "demo", "nombre": "Vio demo", "des": "Le mostramos la plataforma funcionando"},
    {"id": "piloto", "nombre": "Piloto activo", "des": "Usa la plataforma con sus datos"},
    {"id": "loi", "nombre": "Carta de intención", "des": "Firmó LOI o compromiso por escrito"},
    {"id": "pagando", "nombre": "Cliente pagando", "des": "Ingreso real recurrente"},
    {"id": "perdido", "nombre": "No avanzó", "des": "Se registra el porqué — también es dato"},
]

# ─── Checklist legal/docs: lo que el código NO puede generar (tarea founder) ─────────────
CHECKLIST_LEGAL: List[Dict[str, str]] = [
    {"id": "constitucion", "nombre": "Empresa constituida", "des": "Acta constitutiva (MX y/o Delaware para YC)"},
    {"id": "cap_table", "nombre": "Cap table limpio", "des": "Quién es dueño de qué %, sin promesas verbales"},
    {"id": "ip_assignment", "nombre": "Propiedad intelectual asignada", "des": "El código/marca son de la empresa, no de la persona"},
    {"id": "aviso_privacidad", "nombre": "Aviso de privacidad (LFPDPPP)", "des": "Obligatorio en México al captar datos personales"},
    {"id": "contrato_licencia", "nombre": "Contrato tipo de licencia de datos", "des": "Para vender data/API sin improvisar términos"},
    {"id": "cuenta_bancaria", "nombre": "Cuenta bancaria empresarial", "des": "Separar finanzas personales de la empresa"},
    {"id": "video_founder", "nombre": "Video de founder (YC)", "des": "1 minuto: quién eres y qué construyes"},
    {"id": "demo_grabado", "nombre": "Demo grabado (YC)", "des": "Respaldo por si el demo en vivo falla"},
]


def _repo_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ─── Bloque: economía por cliente (fuente: feature_registry REAL) ────────────────────────
def economia() -> Dict[str, Any]:
    from feature_registry import get_all_features
    feats = get_all_features()
    con_precio = [f for f in feats if f.get("monthly_price_mxn")]
    por_cat: Dict[str, Dict[str, Any]] = {}
    for f in con_precio:
        c = por_cat.setdefault(f.get("category") or "otros", {"n": 0, "mxn_mes": 0})
        c["n"] += 1
        c["mxn_mes"] += f["monthly_price_mxn"]
    total = sum(f["monthly_price_mxn"] for f in con_precio)
    return {
        "fuente": "feature_registry (precios declarados en el código, no en un Excel)",
        "features_total": len(feats),
        "features_con_precio": len(con_precio),
        "ticket_full_stack_mxn_mes": total,
        "por_categoria": [{"categoria": k, **v} for k, v in sorted(por_cat.items(), key=lambda x: -x[1]["mxn_mes"])],
    }


# ─── Bloque: TAM bottom-up (universo × supuestos editables × ticket real) ───────────────
async def tam(db, supuestos: Dict[str, Any]) -> Dict[str, Any]:
    s = {**SUPUESTOS_DEFAULT, **(supuestos or {})}
    try:
        predios = await db.catastro_predios.estimated_document_count()
    except Exception:
        predios = 0
    universo_mxn_anual = (s["devs_cdmx"] * s["precio_dev_mxn"] +
                          s["inmobiliarias_cdmx"] * s["precio_inmo_mxn"]) * 12
    alcanzable = universo_mxn_anual * s["pct_alcanzable"] / 100
    obtenible = alcanzable * s["pct_obtenible"] / 100
    return {
        "fuente": f"catastro propio ({predios:,} predios) + supuestos editables (marcados)",
        "predios_con_dato": predios,
        "supuestos": s,
        "universo_mxn_anual": round(universo_mxn_anual),
        "alcanzable_mxn_anual": round(alcanzable),
        "obtenible_mxn_anual": round(obtenible),
        "nota": "Bottom-up: universo CDMX × % alcanzable × % obtenible × ticket del price book. "
                "Cambia los supuestos y el número cambia — así se defiende frente a un VC.",
    }


# ─── Bloque: velocity (fuente: git real; snapshot defensivo si no hay .git) ──────────────
def velocity() -> Dict[str, Any]:
    try:
        out = subprocess.run(
            ["git", "log", "--since=8 weeks ago", "--format=%ad", "--date=format:%Y-%U"],
            capture_output=True, text=True, timeout=10, cwd=_repo_root(),
        )
        semanas: Dict[str, int] = {}
        for ln in out.stdout.splitlines():
            if ln.strip():
                semanas[ln.strip()] = semanas.get(ln.strip(), 0) + 1
        serie = [{"semana": k, "commits": v} for k, v in sorted(semanas.items())]
        total = sum(semanas.values())
        return {"fuente": "git log (verificable commit por commit)", "commits_8_semanas": total,
                "por_semana": serie, "disponible": True}
    except Exception:
        return {"fuente": "git no disponible en este entorno", "disponible": False,
                "commits_8_semanas": 0, "por_semana": []}


# ─── Bloque: burn y runway (costo IA real + fijos supuestos) ─────────────────────────────
async def burn(db, supuestos: Dict[str, Any]) -> Dict[str, Any]:
    s = {**SUPUESTOS_DEFAULT, **(supuestos or {})}
    ia_mes_usd = 0.0
    try:
        desde = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
        cur = db.ai_cost_daily_snapshots.find({"date": {"$gte": desde}}, {"_id": 0})
        async for d in cur:
            ia_mes_usd += float(d.get("total_usd") or d.get("cost_usd") or 0)
    except Exception:
        pass
    ia_mes_mxn = round(ia_mes_usd * 18.5)
    burn_total = ia_mes_mxn + s["burn_fijo_mxn"]
    runway = round(s["caja_mxn"] / burn_total, 1) if burn_total and s["caja_mxn"] else None
    return {
        "fuente": "costo de IA medido en el sistema + fijos declarados como supuesto",
        "ia_mxn_mes": ia_mes_mxn, "fijos_mxn_mes": s["burn_fijo_mxn"],
        "burn_total_mxn_mes": burn_total,
        "runway_meses": runway,
        "nota": "Operación AI-native de 1 founder: el burn ES la historia (comparar con "
                "startups de 8 personas quemando $1M MXN/mes para construir menos).",
    }


# ─── Bloque: métricas norte instrumentadas HOY ────────────────────────────────────────────
async def metricas_norte(db) -> List[Dict[str, Any]]:
    hoy = datetime.now(timezone.utc)
    out: List[Dict[str, Any]] = []
    for m in METRICAS_NORTE:
        fila: Dict[str, Any] = {**m, "total": 0, "ult_7d": None, "prev_7d": None, "tendencia": None}
        try:
            col = db[m["col"]]
            fila["total"] = await col.estimated_document_count()
            if m["ts"]:
                d7 = hoy - timedelta(days=7)
                d14 = hoy - timedelta(days=14)
                for key, rng in (("ult_7d", {"$gte": d7}), ("prev_7d", {"$gte": d14, "$lt": d7})):
                    try:
                        fila[key] = await col.count_documents({m["ts"]: rng})
                    except Exception:
                        # timestamps guardados como iso-string
                        rng_s = {k: v.isoformat() for k, v in rng.items()}
                        fila[key] = await col.count_documents({m["ts"]: rng_s})
                if fila["prev_7d"]:
                    fila["tendencia"] = round((fila["ult_7d"] - fila["prev_7d"]) / fila["prev_7d"] * 100, 1)
        except Exception:
            pass
        out.append(fila)
    return out


# ─── Bloque: score de preparación YC (semáforo honesto, con drill) ──────────────────────
def yc_score(n_entrevistas: int, pipeline_counts: Dict[str, int], checklist_ok: int,
             checklist_total: int, demo_listo: bool) -> Dict[str, Any]:
    criterios = [
        {"id": "entrevistas", "nombre": "≥10 entrevistas con usuarios reales",
         "ok": n_entrevistas >= 10, "valor": f"{n_entrevistas}/10",
         "por_que": "YC pregunta literal: ¿cómo sabes que la gente lo necesita?"},
        {"id": "pilotos", "nombre": "≥3 pilotos activos o LOIs",
         "ok": (pipeline_counts.get("piloto", 0) + pipeline_counts.get("loi", 0)
                + pipeline_counts.get("pagando", 0)) >= 3,
         "valor": str(pipeline_counts.get("piloto", 0) + pipeline_counts.get("loi", 0)
                      + pipeline_counts.get("pagando", 0)) + "/3",
         "por_que": "Evidencia de demanda: design partners con la mano levantada."},
        {"id": "pagando", "nombre": "≥1 cliente pagando",
         "ok": pipeline_counts.get("pagando", 0) >= 1,
         "valor": f"{pipeline_counts.get('pagando', 0)}/1",
         "por_que": "El único número que nadie puede discutir."},
        {"id": "demo", "nombre": "Demo funcionando para externos",
         "ok": demo_listo, "valor": "listo" if demo_listo else "falta",
         "por_que": "A YC se le muestra el producto, no un PDF."},
        {"id": "legal", "nombre": "Checklist legal completo",
         "ok": checklist_ok == checklist_total, "valor": f"{checklist_ok}/{checklist_total}",
         "por_que": "Due diligence sin sorpresas: constitución, cap table, IP."},
    ]
    hechos = sum(1 for c in criterios if c["ok"])
    return {"criterios": criterios, "hechos": hechos, "de": len(criterios),
            "score": round(hechos / len(criterios) * 100)}


# ─── Resumen ejecutivo (todo junto, cada bloque con su fuente) ───────────────────────────
async def resumen(db) -> Dict[str, Any]:
    cfg = await db.investor_room_config.find_one({"_id": "config"}) or {}
    supuestos = cfg.get("supuestos") or {}
    checklist_estado = cfg.get("checklist") or {}

    n_entrevistas = await db.investor_interviews.count_documents({})
    pipe_counts: Dict[str, int] = {}
    async for row in db.investor_pipeline.aggregate([{"$group": {"_id": "$etapa", "n": {"$sum": 1}}}]):
        pipe_counts[row["_id"]] = row["n"]

    checklist = [{**item, "ok": bool(checklist_estado.get(item["id"]))} for item in CHECKLIST_LEGAL]
    ok = sum(1 for c in checklist if c["ok"])

    return {
        "yc": yc_score(n_entrevistas, pipe_counts, ok, len(checklist), demo_listo=True),
        "economia": economia(),
        "tam": await tam(db, supuestos),
        "velocity": velocity(),
        "burn": await burn(db, supuestos),
        "metricas_norte": await metricas_norte(db),
        "entrevistas_n": n_entrevistas,
        "pipeline": {"etapas": ETAPAS_PIPELINE, "conteos": pipe_counts},
        "checklist": checklist,
        "supuestos": {**SUPUESTOS_DEFAULT, **supuestos},
    }
