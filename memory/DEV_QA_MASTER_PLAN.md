# QA Maestro del Portal Dev — "Día del Desarrollador"
**2026-06-08 · reusa la metodología del QA del Asesor + suma áreas de producto/experiencia.**

Estado: por arrancar (checkpoint de seguridad `checkpoint-pre-qa-dev` ya creado y pusheado).
Origen: el founder pidió un QA "master" que abarque TODAS las áreas, no solo las 7 olas técnicas.

---

## A) Lo que ya teníamos del Asesor (técnico · reusable)

**8 familias de problemas (buscar siempre · ver MODULE_HARDENING_PLAYBOOK):**
funciones ocultas · cables huérfanos · bugs latentes (`except: pass`) · IDOR/seguridad ·
atomicidad/carreras · modelo de datos forkeado · config fail-open · resiliencia.

**7 olas de QA (arneses `scripts/qa_*.py` · re-apuntar a rutas dev):**
1. E2E funcional (auth, CRUD, flujos felices) — `qa_sim.py`
2. Concurrencia + escala + integridad + fuzz — `qa_sim2.py`
3. Carga/estrés (10k docs, ráfagas) — `qa_load.py`
4. Red-team/pentest (NoSQL, IDOR, mass-assign, JWT, webhook, prompt-inj) — `qa_redteam.py`
5. Crons + features + métricas + barrido de TODAS las rutas + idempotencia + contrato — `qa_sim3.py`
6. Destructivo/chaos — `qa_destructive.py`
7. Día-en-la-vida + scorecard producción — `qa_journey_full.py` · **dev: `qa_journey_dev.py` ya existe**
   (journey + aislamiento cross-org [16/16] + atomicidad doble-apartado + cohesión cifras).

**Auditoría de producción (frentes):** seguridad · performance · datos · observabilidad.

**Gotchas (nos atoraron):** hallazgos STALE (verificar código actual, no el # de línea) ·
BD de prueba aislada (`dmx_qa_sim`, NUNCA `dmx_local`) · datos únicos por corrida + limpiar ·
cliente sin cookies para probar 401 · saber PARAR cuando las rondas convergen.

---

## B) Lo que SUMA el master QA (cubrir TODAS las áreas · alineado al founder)

Las que el asesor tocó poco y que más le importan al founder (donde salieron los 2 bugs de hoy):

| # | Área | Qué caza |
|---|---|---|
| A | **Lenguaje / "jergómetro"** | Barrido de TODO el texto: cero tecnicismos, cero "/100", Title Case, copy claro (raíz del bug del Diagnóstico) |
| B | **Honestidad de datos** | Nada random/seed/inventado mostrado como real; estados vacíos honestos ("Sin Dato Aún", no relleno) |
| C | **Estados de pantalla** | Cada vista: sin datos / con error / cargando (vacío, error, esqueleto) |
| D | **Móvil / responsive** | Que sirva en celular y tablet, no solo pantalla grande |
| E | **Visual + accesibilidad** | Tarjetas con borde+hover (regla del founder), contraste, foco, teclado, textos alternativos |
| F | **Coherencia entre portales** | Mismo dato = mismo número en dev, comprador, asesor, superadmin |
| G | **Permisos por rol y plan** | Cada quien ve solo lo suyo (no solo cross-org: también por tier/feature visibility) |
| H | **IA / Agentic** | Asistentes y predicciones sensatos, confianza honesta, "tu turno" (human-in-the-loop) funciona |
| I | **Primer día** | Dev nuevo con cuenta vacía: ¿la app lo guía o se ve rota? |
| J | **Resiliencia + observabilidad** | Si un motor falla, ¿sigue de pie (fail-open)? ¿el error llega a Sentry? |
| K | **Rendimiento percibido** | Carga rápido, no parpadea |

---

## C) Entregable
Un **scorecard maestro por área** (verde/ámbar/rojo) con los hallazgos en lenguaje claro,
ordenados por impacto. Igual que el del asesor, pero más completo.

## D) Orden propuesto (founder lo prioriza)
1. Áreas del usuario primero: **A lenguaje · B honestidad · C estados · D móvil · F coherencia.**
2. Luego las técnicas (7 olas re-apuntadas a dev) + el resto (G, H, I, J, K).

## E) Bugs ya cazados (manual · founder probando) — la versión sistemática los formaliza
- Doble-click en login → arreglado (confirma sesión antes de entrar al portal).
- Jerga en "Diagnóstico del proyecto" → 37 checks + módulos + términos a lenguaje claro.
