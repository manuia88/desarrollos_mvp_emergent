# Backlog — Enhancements diferidos

Mejoras decididas pero pospuestas (con el porqué). No perderlas.

---

## P2 #3 — "Staged a tu gusto" (amueblado virtual por estilo en la ficha-experiencia)
**Diferido 2026-06-28 · founder: "documentado y seguimos".**

**Qué:** en el image-reveal de `AtlaxExperiencia`, revelar el MISMO cuarto **amueblado en el estilo preferido del
comprador** (moderno / cálido / minimalista) — el wow visual máximo de la personalización.

**Por qué se difiere (no técnico):** requiere **gasto en Replicate** (la generación de staging cuesta por imagen) +
es **lento** (~10-30s, no en vivo → hay que pre-generar 2-3 estilos por dev y cachear) + es **imagen GENERADA** (regla
anti-alucinación: etiquetar "amueblado virtual").

**Listo para construir cuando el founder autorice el gasto:**
- El motor YA existe: `virtual_staging_engine.py` + `routes/virtual_staging.py` (`POST /api/virtual-staging`
  {input_image_url, room_type, styles[1-3]}).
- `REPLICATE_API_TOKEN` YA está en el env.
- Patrón a seguir (igual que P2 #4 parallax): endpoint que pre-genera por dev en **background** + cachea + sirve; la
  experiencia revela la variante que matchea el estilo del comprador (de `visitor_taste.keys.features`:
  moderno/lujo/madera → estilo). Cold-start del perfilador.

**Costo aprox:** ~3 estilos × N fotos clave × por dev (Replicate). Controlable: solo el cuarto del hero, solo devs
activos, trigger manual del dev/founder.

---

## Áreas de oportunidad diferidas (sesión 2026-06-28)
**Tras solucionar #1 (harness e2e), #3 (loop de aprendizaje), #4 (cold-start), #8 (seguridad/rate-limit).**

- **#5 — Lift readout (¿la personalización sube el engagement?):** la instrumentación YA está (`experiencia_views`
  {personalized,basis} + conteo en el intel del founder). El READOUT comparativo (dwell personalizada vs estándar) se
  difiere: con datos semilla es ruidoso + el join experiencia↔dwell es flojo. Construir cuando haya volumen real.
- **#6 — Performance a escala:** materializar `demand-twin` + `donde-vivir` en cron (como el cache de taste). Diferido:
  PREMATURO al scale actual (dashboard calls, ~100ms). Hacer cuando el tráfico lo pida.
- **#2 — Deploy + validar con datos reales:** ACCIÓN DEL FOUNDER (memoria: "tú prendes; yo dejo listo"). Correr
  `scripts/smoke_e2e.py` pre-deploy.
- **#7 — Pipeline de video real del dev (Studio/3DGS) + gate de calidad de foto:** el "wow" depende de contenido real.
  Build mayor (subida + storage + el gate). Backlog.

## Terminal de Zona — rediseño UI/UX (diferido a módulo SUPERADMIN · 2026-06-29)
**Estado:** la página `/superadmin/terminal-zona` VERIFICADA renderizando con dato real (founder confirmó "sí se ve").
Backend completo: 120 compuestas · 4 escalas · 16 atributos · financiero · AirROI · riesgo natural+crimen.
**Diferido:** mejorar mucho la UI/UX (founder: "hay que mejorar mucho la UI/UX, lo revisamos en el módulo de superadmin").
Construida funcional, no pulida — el rediseño visual va cuando toque el portal superadmin.
