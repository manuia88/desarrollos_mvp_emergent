# W4.16 Sub-C — MCP Distribution Submissions

Templates and target URLs for submitting the DesarrollosMX MCP server to public
registries. **Founder / agencia action items** (no dev work needed).

---

## 1. mcp.so (community registry)

**URL**: https://mcp.so/server/submit
**Fields required**:
- **Name**: `DesarrollosMX MCP Server`
- **Description (160ch)**: `Inteligencia inmobiliaria CDMX agentic · Zone Score · modelo hedónico · simulador inversión · briefings IE · 18 tools.`
- **Repository URL**: `https://github.com/desarrollosmx/mcp-server` (pendiente publicar)
- **Tags**: `real-estate · mexico · cdmx · hedonic · agentic · investment-analysis`
- **Categories**: `Real Estate`, `Data`, `Analytics`
- **Logo**: 512×512 PNG (usar branding cream + gradient)
- **Maintainer**: `team@desarrollosmx.com`

**Submission notes**:
- Subir captura de Claude Desktop conectado mostrando el tool list.
- Demo video 30s (Loom o YouTube unlisted) ejecutando una query.

---

## 2. awesome-mcp (GitHub repo)

**URL**: https://github.com/punkpeye/awesome-mcp-servers
**Process**: PR adding entry under `## Real Estate` (sección nueva si no existe).

**Entry template (markdown)**:
```markdown
- **[DesarrollosMX](https://desarrollosmx.com/connect/mcp/tutorial)** — MCP server for CDMX real estate intelligence. 18 agentic tools: Zone Score, hedonic regression, investment simulator, briefing IE, demand-supply gap, advisor matching. Spanish (es-MX) + English. Free tier available.
```

**PR description checklist**:
- [ ] Entry follows alphabetical order in the section
- [ ] Link is HTTPS
- [ ] Description ≤ 200 chars
- [ ] Includes pricing model note
- [ ] Includes license info (MIT for client SDK, proprietary for backend)

---

## 3. Anthropic MCP Directory

**URL**: TBD (placeholder · directorio oficial Anthropic en roadmap H2 2026)
**Tracking**: https://www.anthropic.com/news/model-context-protocol
**Action**: cuando GA, enviar email a `mcp-directory@anthropic.com` con:
- DMX MCP server URL
- Use cases (real estate intelligence CDMX)
- Pricing tier (free + Pro)
- Compliance docs (LFPDPPP México)

---

## 4. ChatGPT Custom GPT Store

**URL**: https://chatgpt.com/gpts/editor
**Process**: Crear GPT que envuelve nuestro MCP endpoint vía OpenAI Actions.
**Fields**:
- **Name**: `DMX Real Estate Intelligence`
- **Description**: `AI inmobiliaria CDMX · análisis de zonas, inversión, briefings y comercialización.`
- **Conversation starters**:
  - `Analiza una inversión preventa en Polanco`
  - `Compara Roma Norte vs Del Valle para 12M MXN`
  - `Genera un briefing IE para mi cliente`
  - `Top 10 colonias por ROI 12m`

---

## 5. Perplexity Spaces (futuro)

**URL**: TBD (feature en beta)
**Notes**: Perplexity está beta-testing custom spaces que aceptan MCP servers.
Suscribirse al newsletter Perplexity Developer para anuncio público.

---

## Tracking de adoptions

Cuando un usuario hace setup vía tutorial → backend log automático:
```bash
POST /api/mcp/track-adoption
{
  "client_type": "claude_desktop",
  "source": "tutorial"
}
```

Stats agregadas (solo superadmin):
```bash
GET /api/mcp/adoption-stats
```

Sources válidos: `organic · tutorial · mcp_so · awesome_mcp · anthropic_registry · referral`
