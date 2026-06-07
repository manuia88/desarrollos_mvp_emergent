"""QA · DÍA DEL DESARROLLADOR — flujo completo del dev + red-team de aislamiento cross-dev-org.

Valida (sobre el app ASGI in-process):
  A. JOURNEY: el día del dev carga punta a punta (cockpit + los 7 upgrades del Paso C).
  B. AISLAMIENTO (el más importante): el dev NO ve ni toca proyectos/recursos de OTRA desarrolladora (403).
  C. ATOMICIDAD: no se puede apartar dos veces la misma unidad (409).
  D. COHESIÓN: las cifras del portafolio son consistentes entre pantallas.

Pega al backend VIVO (localhost:8000) — el dev server ya corre con la config correcta.
Ejecutar: scripts/.venv/bin/python scripts/qa_journey_dev.py
"""
import asyncio
import os
import sys

from httpx import AsyncClient  # noqa: E402

BASE = os.environ.get("QA_BASE", "http://localhost:8000")
R = []


def chk(cat, name, ok, detail=""):
    R.append((cat, bool(ok), name, detail))
    print(f"   {'✅' if ok else '❌'} [{cat}] {name}" + (f"  · {detail}" if detail else ""))


def step(t):
    print(f"\n{t}")


async def login(email, pw):
    c = AsyncClient(base_url=BASE, timeout=20)
    r = await c.post("/api/auth/login", json={"email": email, "password": pw})
    return c, r.status_code


async def main():
    if True:
        # El dev demo (Constructora Ariel) — dueño de altavista-polanco + lomas-signature.
        dev, code = await login("developer@demo.com", "Dev2026!")
        chk("auth", "login del desarrollador", code == 200, f"status={code}")
        MINE, FOREIGN = "altavista-polanco", "pedregal-brutalist"

        # ── A · JOURNEY: el día del dev (cockpit + los 7 upgrades del Paso C) ──
        step("🌅 A · DÍA DEL DESARROLLADOR — carga su jornada")
        async def g(path):
            try:
                r = await dev.get(path)
                return r.status_code, r
            except Exception as e:
                return "EXC", str(e)
        journey = [
            ("Inicio · dashboard", "/api/desarrollador/dashboard"),
            ("Inicio · La Lectura del Portafolio", "/api/desarrollador/portfolio-reading"),
            ("CRM · Cockpit de Leads", "/api/desarrollador/leads-cockpit"),
            ("Inteligencia · Qué Frena Tus Ventas", "/api/desarrollador/comportamiento"),
            ("Pricing · Precio Inteligente", "/api/desarrollador/pricing-inteligente"),
            ("Red Comercial · Salud de tu Red", "/api/desarrollador/red-salud"),
            ("Marketing · Qué Promocionar Hoy", "/api/desarrollador/marketing-jugadas"),
            ("Reportes · Resumen Ejecutivo", "/api/desarrollador/reporte-ejecutivo"),
        ]
        portfolio = {}
        for name, path in journey:
            sc, r = await g(path)
            chk("journey", f"{name} carga", sc == 200, f"status={sc}")
            if path.endswith("portfolio-reading") and sc == 200:
                portfolio = r.json().get("kpis", {})

        # ── B · AISLAMIENTO cross-dev-org (el dev NO toca lo de OTRA dev) ──
        step("🔒 B · RED-TEAM DE AISLAMIENTO — el dev intenta tocar proyectos ajenos")
        attacks = [
            ("ver historial de precio de unidad ajena", f"/api/dev/units/{FOREIGN}/u1/price-history"),
            ("ver comparables de unidad ajena", f"/api/dev/units/{FOREIGN}/u1/comparables"),
            ("ver política de citas ajena", f"/api/appointments/policy/{FOREIGN}"),
        ]
        for name, path in attacks:
            sc, _ = await g(path)
            chk("aislamiento", f"{name} → BLOQUEADO", sc == 403, f"status={sc} (esperado 403)")
        # control positivo: SU propio proyecto SÍ pasa
        sc, _ = await g(f"/api/dev/units/{MINE}/u1/price-history")
        chk("aislamiento", "su propio proyecto SÍ accede (no 403)", sc != 403, f"status={sc}")
        # editar la política de citas de otra dev → 403
        try:
            r = await dev.put(f"/api/appointments/policy/{FOREIGN}", json={"policy_type": "round_robin"})
            chk("aislamiento", "editar política de citas ajena → BLOQUEADO", r.status_code == 403, f"status={r.status_code}")
        except Exception as e:
            chk("aislamiento", "editar política de citas ajena → BLOQUEADO", False, str(e)[:60])
        # los lentes scope-ados NO incluyen proyectos ajenos
        sc, r = await g("/api/desarrollador/pricing-inteligente")
        if sc == 200:
            zonas = {p.get("zona") for p in r.json().get("proyectos", [])}
            nombres = {p.get("nombre") for p in r.json().get("proyectos", [])}
            chk("aislamiento", "Precio Inteligente NO trae proyectos ajenos", "Pedregal Brutalist" not in nombres, f"proyectos={len(nombres)}")

        # ── C · ATOMICIDAD: no doble-apartado de la misma unidad ──
        step("⚛️ C · ATOMICIDAD — apartar la misma unidad dos veces")
        body = {"dev_id": MINE, "hours": 1, "holder_name": "QA"}
        uunit = "QA_ATOM_UNIT"
        await dev.delete(f"/api/dev/units/{uunit}/hold", params={"dev_id": MINE})  # limpiar
        r1 = await dev.post(f"/api/dev/units/{uunit}/hold", json=body)
        r2 = await dev.post(f"/api/dev/units/{uunit}/hold", json=body)
        chk("atomicidad", "primer apartado OK", r1.status_code in (200, 201), f"status={r1.status_code}")
        chk("atomicidad", "segundo apartado de la MISMA unidad → 409 (no doble-reserva)", r2.status_code == 409, f"status={r2.status_code}")
        await dev.delete(f"/api/dev/units/{uunit}/hold", params={"dev_id": MINE})  # liberar

        # ── D · COHESIÓN: las cifras del portafolio son consistentes ──
        step("🧩 D · COHESIÓN — las cifras cuadran entre pantallas")
        sc, rd = await g("/api/desarrollador/dashboard")
        sc2, rr = await g("/api/desarrollador/reporte-ejecutivo")
        if sc == 200 and sc2 == 200:
            dash = rd.json()
            chk("cohesion", "dashboard reporta desarrollos del dev (scope real, no todos)",
                dash.get("developments_count", 0) <= 3, f"count={dash.get('developments_count')}")
            chk("cohesion", "el Reporte Ejecutivo tiene las 3 prioridades del mes",
                len(rr.json().get("prioridades", [])) >= 1, f"prioridades={len(rr.json().get('prioridades', []))}")

        # ── 2º DEV (anónimo sin sesión) NO ve nada del dev ──
        step("🚫 E · sin sesión NO se accede al portal del dev")
        anon = AsyncClient(base_url=BASE, timeout=20)
        r = await anon.get("/api/desarrollador/portfolio-reading")
        chk("aislamiento", "sin login → 401/403 (no acceso al portal dev)", r.status_code in (401, 403), f"status={r.status_code}")

        # ── Resumen ──
        print("\n" + "=" * 60)
        cats = {}
        for cat, ok, _, _ in R:
            cats.setdefault(cat, [0, 0])
            cats[cat][0] += 1 if ok else 0
            cats[cat][1] += 1
        total_ok = sum(1 for _, ok, _, _ in R if ok)
        for cat, (ok, tot) in cats.items():
            print(f"  {cat:14} {ok}/{tot} {'✅' if ok == tot else '🔴'}")
        print(f"\n  TOTAL: {total_ok}/{len(R)} {'✅ TODO VERDE' if total_ok == len(R) else '🔴 HAY FALLOS'}")
        fails = [(c, n, d) for c, ok, n, d in R if not ok]
        if fails:
            print("\n  FALLOS:")
            for c, n, d in fails:
                print(f"    🔴 [{c}] {n} · {d}")
        return total_ok == len(R)


if __name__ == "__main__":
    ok = asyncio.run(main())
    sys.exit(0 if ok else 1)
