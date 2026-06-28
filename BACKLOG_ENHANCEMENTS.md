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
