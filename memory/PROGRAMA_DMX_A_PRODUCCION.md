# Programa Maestro — DMX a Producción Impecable

> **Plan maestro que gobierna TODO el trabajo de aquí al lanzamiento.** No es un prompt: es la
> directiva de método. Su **Fase 0** es el prompt de auditoría exhaustiva
> (`memory/PROMPT_AUDITORIA_FABLE5.md`, 12 bloques). Creado 2026-06-11.

---

## Principio Rector

Meta: **DMX en producción, impecable, aprovechando todo lo construido.** PERO un "refactor total
de un jalón" es la forma #1 de romper un repo vibecoded de 1,200+ archivos. Por eso esto es un
**PROGRAMA por fases con red de seguridad**: cada cambio deja el repo **VERDE** y funcionando; lo
nuevo coexiste con lo viejo hasta migrar (**strangler-fig**); nunca big-bang.
**REGLA DE ORO: nunca rompas lo que ya funciona.**

## "100% / Impecable" = Criterios Falsificables

Sin esto, "impecable" es opinión:
- Cada cambio: **build + lint + tests + smoke en VERDE** antes de mergear.
- **0 fugas cross-tenant** (PROBADAS con 2 tenants, no leídas) · **0 P0 abiertos**.
- Cada número etiquetado por **origen real** (dato/cálculo/supuesto) — ningún seed/stub vendido como real.
- Cada feature: **cableada end-to-end o borrada**. Cero huérfanas, cero flags que esconden cosas a medias.
- Cada pantalla: estados **carga/vacío/error** + accesibilidad básica.
- **Privacidad** (borrado real/retención/consentimiento, LFPDPPP) · **observabilidad** + **backups** + **rollback probado**.
- **Tests** cubriendo los caminos críticos (auth, tenant-scope, dinero, los 4 portales, marketplace).

## Secuencia (cada fase con gate; no avanzas sin verde)

| Fase | Foco | Salida |
|---|---|---|
| **F0 · Diagnóstico Total** | Corre el prompt de 12 bloques (`PROMPT_AUDITORIA_FABLE5.md`) hasta cobertura 100% (el ledger `REPO_COBERTURA.md` es la prueba). | `REPO_PLAN_MAESTRO.md` priorizado + lista de P0 |
| **F1 · Red de Seguridad** | Tests de caracterización en los caminos críticos + CI que corre en cada cambio. *No se refactoriza sin red.* | Suite de tests + CI verde |
| **F2 · Estabilizar** | Cerrar P0/P1: seguridad cross-tenant, privacidad, correctitud del dato, costo/abuso, prod-readiness. Lo que bloquea producción primero. | P0 = 0 |
| **F3 · Despertar lo Apagado** | Cablear/exponer/borrar lo construido-sin-conectar (Cerebro, motores ML, huérfanas). ROI alto, riesgo bajo. | Cero huérfanas |
| **F4 · Refactor Incremental por Rebanada** | Capa de datos (encapsular Mongo) → tenant-scope en UN choke-point obligatorio → servicios → API delgada → front. Strangler-fig: cada rebanada shipea verde, lo viejo se retira al final. | Columna vertebral limpia |
| **F5 · Front / UX / UI Impecable** | Sistema de diseño único, por portal, jerarquía, estados, accesibilidad, lenguaje humano. | UI consistente y pulida |
| **F6 · Endurecimiento de Producción** | Observabilidad, backups, headers/CORS/rate-limit, carga 10k, costo IA sostenible. | Listo para tráfico real |
| **F7 · Lanzamiento** | Beta brokers → público, con rollback y monitoreo. | En producción |

## Cómo Ejecutarlo con IA (no "una sesión hace todo")

- **Por rebanada**, con orquestación multi-agente (fan-out por módulo/portal), cada agente con su
  ledger + verificación adversarial + checkpoint humano en lo delicado.
- El **ledger de cobertura** gobierna el avance entre sesiones (nada se pierde, nada se repite).
- Cada PR: **pequeño, verde, reversible**. Commits frecuentes + tags de checkpoint.

## Honestidad de Alcance

Es un programa de **semanas/meses + TUS decisiones de producto en los gates.** "Como Salesforce" en
capacidad agéntica/datos es el **NORTE** (ver `DMX_NORTH_STAR_AI.md`, `IA_FIRST_VISION.md`), no un
sprint: se alcanza por capas sobre esta base. El refactor + la estabilización dejan la plataforma
sólida; el producto-Salesforce se construye encima, ciclo a ciclo.

---

## Artefactos del Programa

- `memory/PROMPT_AUDITORIA_FABLE5.md` — el prompt de 12 bloques = **Fase 0** (diagnóstico exhaustivo).
- `memory/PROGRAMA_DMX_A_PRODUCCION.md` — este doc (la directiva de método que gobierna todo).
- `REPO_COBERTURA.md` + `REPO_PLAN_MAESTRO.md` — los genera Fable 5 al correr la F0.

## Prompt-Lanzador para Nuevo Chat con Fable 5

Pega esto en una sesión NUEVA de Fable 5 (Claude Code) en la raíz del repo:

```
Vas a co-liderar conmigo el programa "DMX a Producción Impecable". El plan maestro de método
está en memory/PROGRAMA_DMX_A_PRODUCCION.md y la Fase 0 (auditoría exhaustiva de 12 bloques)
en memory/PROMPT_AUDITORIA_FABLE5.md.

1. LEE ambos archivos COMPLETOS antes de actuar (son tu contrato y tu mapa; no asumas, léelos).
2. Confirma que entendiste el Principio Rector (nunca romper lo que funciona, incremental, red
   de seguridad) y los criterios de "impecable".
3. Empieza la FASE 0 tal como la define PROMPT_AUDITORIA_FABLE5.md: corre el ARRANQUE
   (git status/log/branch), construye el inventario completo REPO_COBERTURA.md, dame el "STACK
   CONFIRMADO" + el PLAN, y DETENTE a esperar mi OK. No corras los bloques todavía.

Read-only en F0. Evidencia archivo:línea. Honestidad brutal. Trabaja por bloques con pausa.
```
