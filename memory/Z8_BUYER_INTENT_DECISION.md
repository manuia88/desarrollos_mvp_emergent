# Z.8 · Buyer Intent Architecture Decision (Canonical)

**Fecha**: 2026-05-20
**Decision**: hybrid · intent target explícito por template con override en los flexibles
**Status**: APPROVED founder · base para Z8_TEMPLATE_PROMPTS_FINAL.md

---

## Contexto

Los 10 templates de Studio Z.8 deben servir a 2 macro-arquetipos de comprador:
- **VIVIR** (residencia personal / familiar / patrimonial-vivienda)
- **INVERTIR** (capital deployment, renta, plusvalía, sucesión patrimonial)

Data del mercado CDMX pre-venta:
- ~70% inversionistas (estudios NAR + Softec + observación local)
- ~30% end-users
- Developers presentan al mismo activo a ambos audiences sin separar landing

## Opciones evaluadas

| Opción | Pro | Con | Descartada |
|---|---|---|---|
| **A · Status quo** (10 templates con intent implícito) | Simple | Pierde audiences cross-arquetipo · Family-invertir no tiene template | ✗ |
| **B · 20 templates** (Family-vivir / Family-invertir / etc.) | Máxima precisión | Doble mantenimiento · prompts redundantes 80% · overkill | ✗ |
| **C · 1 prompt genérico con intent modifier** | 10 archivos · flexibilidad | Prompts complejos · calidad diluida · pierde la quirurgia | ✗ |
| **D · 12 templates** (8 vivir-puros + 4 invertir-puros) | Quirúrgico | Complica menú del broker · ambigüedad de categoría | ✗ |
| **E · Hybrid · intent target explícito** | Claridad + flexibilidad donde aplica · 10 archivos | Requiere `buyer_intent` en form para hybrid templates | ✅ |

## Decisión final · Opción E

10 templates · cada uno declara `intent_target` en su prompt header:

| Categoría | Templates | Intent target | Broker override |
|---|---|---|---|
| **live_only** | Family · First-Home · Boutique | Fijo · vivir | No |
| **invest_only** | Investor | Fijo · invertir | No |
| **hybrid** | Luxury · Urgent · Social-proof · Compare · Scrollytelling · Video-first | Default + override | Sí · `buyer_intent` form field |

### Justificación por template

| # | Template | Intent | Razón |
|---|---|---|---|
| 1 | Luxury | hybrid (default: live) | HNW puede comprar 3ra residencia o tesis patrimonial · family offices ya invierten luxury |
| 2 | Family | live_only | Decisión emocional · niños · escuelas · "donde van a crecer" · invertir-family es nicho mínimo |
| 3 | First-Home | live_only | Joven primer crédito Infonavit/Fovissste · decisión personal · invertir-first-home extremadamente raro |
| 4 | Investor | invest_only | 100% inversión patrimonial · racional numérico · vivir-investor rompe el tono |
| 5 | Boutique | live_only | Cultural / coleccionista · vivir o trofeo personal · invertir-boutique es coleccionismo no inversión |
| 6 | Urgent | hybrid (default: invest) | Escasez universal · "última fase" aplica a comprador vivir Y a inversionista |
| 7 | Scrollytelling | hybrid (default: live) | Narrativa cinemática seduce a ambos · ajuste de copy según intent |
| 8 | Video-first | hybrid (default: live) | Visual seduce a ambos · ajuste de copy según intent |
| 9 | Social-proof | hybrid (default: live) | "47 familias ya viven aquí" vs "47 inversionistas ya compraron" · misma estructura |
| 10 | Compare | hybrid (default: invest) | Shoppers racionales · comparan vivir Y invertir distinto |

## Form schema impact

El form de creación de landing recibe 1 campo nuevo:

```python
buyer_intent: Optional[Literal["live", "invest", "mixed"]] = None
```

UI behavior:
- Si `template_key` ∈ {family, first_home, boutique}: campo oculto / forzado a `live`
- Si `template_key` == `investor`: campo oculto / forzado a `invest`
- Si `template_key` ∈ hybrid templates: campo visible con default según tabla anterior
- Default visual: radio group con 3 opciones · ayuda text explicando diferencia

## Prompt LLM impact

Cada prompt hybrid recibe `buyer_intent` en su input y bifurca:
- Headlines distintos según intent
- Anti-objeciones distintas según intent
- Stack items distintos según intent
- Lead form fields distintos (capital líquido si invest · mensualidad si live · ambos si mixed)
- CTA copy distinto

Cada prompt live_only o invest_only **ignora** `buyer_intent` aunque venga en el input (defensive).

## Cómo crece esta decisión

Si futuras versiones agregan templates (W5.x posteriores), heredan esta clasificación:
- Si el template es claramente single-intent: declararlo `live_only` o `invest_only`
- Si sirve a ambos: declarar `hybrid` con default explícito + override habilitado

## Referencias

- `memory/Z8_TEMPLATE_PROMPTS_FINAL.md` — los 10 prompts implementan esta decisión
- `memory/Z8_FORM_SCHEMA_FINAL.md` — schema del form con `buyer_intent` field
- `memory/WAVE5_PLAN.md` — Z.8.7 SUB-A
