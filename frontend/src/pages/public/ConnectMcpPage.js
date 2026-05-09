// W4.2B — ConnectMcpPage
// Página pública /connect/mcp — setup guide para Claude Desktop, Cursor, ChatGPT.
import React, { useState } from 'react';
import Navbar from '../../components/landing/Navbar';
import { Check } from '../../components/icons';
import { useAuth } from '../../App';

const BASE_URL = process.env.REACT_APP_BACKEND_URL || 'https://desarrollosmx.io';
const PUBLIC_BASE = 'https://desarrollosmx.io';
const MCP_URL = `${BASE_URL}/api/mcp`;

const EMBED_SCORE_SNIPPET = `<iframe src="${PUBLIC_BASE}/widgets/score/polanco" width="360" height="220" frameborder="0" loading="lazy" style="border:0; max-width:100%;"></iframe>`;
const EMBED_RISK_SNIPPET  = `<iframe src="${PUBLIC_BASE}/widgets/risk/polanco" width="360" height="240" frameborder="0" loading="lazy" style="border:0; max-width:100%;"></iframe>`;

const CLAUDE_CONFIG = JSON.stringify({
  mcpServers: {
    desarrollosmx: {
      url: MCP_URL,
      headers: { 'X-DMX-API-Key': 'TU_API_KEY' },
    },
  },
}, null, 2);

const CURSOR_CONFIG = JSON.stringify({
  mcp: {
    servers: {
      desarrollosmx: {
        url: MCP_URL,
        headers: { 'X-DMX-API-Key': 'TU_API_KEY' },
        transport: 'http',
      },
    },
  },
}, null, 2);

const TOOLS = [
  { name: 'get_zone_score',       desc: 'Scores IE de una colonia o desarrollo (23+ indicadores)', example: '{"zone_id": "polanco"}' },
  { name: 'get_dev_diagnostic',   desc: 'Diagnóstico 6-reglas con acciones recomendadas y costo/impacto', example: '{"dev_id": "altavista-polanco"}' },
  { name: 'search_developments',  desc: 'Buscar desarrollos por colonia, precio máximo o etapa', example: '{"colonia_id": "condesa", "price_max_mxn": 8000000}' },
  { name: 'get_unit_scores',      desc: 'Scores IE_UNIT_* para una unidad específica', example: '{"unit_id": "altavista-polanco-101"}' },
  { name: 'get_methodology',      desc: 'Metodología DRPI + Zone Score + Risk Score completa', example: '{}' },
];

const DIRECTOR_TOOLS = [
  {
    name: 'director_chat',
    tier: 'T1+',
    desc: 'Conversa con el Director AI Agent de tu organización (multi-tenant, agentic loop con 5 sub-tools).',
    example: '{"message": "¿Cuál es la conversión de leads de los últimos 30 días?"}',
  },
  {
    name: 'director_retrieve_memory',
    tier: 'T2+',
    desc: 'Recupera memorias RAG indexadas (diagnósticos, IE score deltas, behavioral, resúmenes).',
    example: '{"query": "pricing Polanco", "top_k": 5}',
  },
  {
    name: 'director_session_summary',
    tier: 'T1+',
    desc: 'Metadata + últimos N mensajes de una sesión (tokens, costo, status, role).',
    example: '{"session_id": "dses_abc123def456", "limit": 10}',
  },
];

function CopyBlock({ label, code }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ marginBottom: 24 }}>
      {label && (
        <div style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, color: 'var(--cream-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
          {label}
        </div>
      )}
      <div style={{ position: 'relative', borderRadius: 14, border: '1px solid rgba(255,255,255,0.10)', overflow: 'hidden' }}>
        <pre style={{
          margin: 0, padding: '16px 20px',
          background: 'rgba(13,16,23,0.95)',
          fontFamily: 'monospace', fontSize: 12.5, lineHeight: 1.65,
          color: '#a5b4fc', overflow: 'auto',
        }}>
          {code}
        </pre>
        <button
          onClick={copy}
          style={{
            position: 'absolute', top: 10, right: 10,
            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11,
            padding: '5px 14px', borderRadius: 9999,
            background: copied ? 'rgba(99,102,241,0.35)' : 'rgba(99,102,241,0.15)',
            border: '1px solid rgba(99,102,241,0.35)',
            color: copied ? '#a5b4fc' : 'var(--cream-2)',
            cursor: 'pointer', transition: 'background 0.15s',
            display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          {copied ? <><Check size={11} /> Copiado</> : 'Copiar'}
        </button>
      </div>
    </div>
  );
}

function Section({ step, title, children }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 9999, flexShrink: 0,
          background: 'linear-gradient(135deg, #6366F1, #EC4899)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: '#fff',
        }}>
          {step}
        </div>
        <h2 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', margin: 0 }}>
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

export default function ConnectMcpPage() {
  const { user } = useAuth();
  const apiKeysUrl = user ? '/superadmin/api-keys' : '/';

  return (
    <div data-testid="connect-mcp-page" style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--cream)' }}>
      <Navbar user={user} />
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Hero */}
        <div style={{ marginBottom: 48 }}>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
            textTransform: 'uppercase', marginBottom: 12,
            backgroundImage: 'linear-gradient(90deg, #6366F1, #EC4899)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            W4.2 · Model Context Protocol
          </div>
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(28px, 5vw, 48px)', margin: '0 0 14px', letterSpacing: '-0.025em' }}>
            Conecta DMX a tu asistente IA
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 16, color: 'var(--cream-2)', lineHeight: 1.7, margin: 0 }}>
            8 herramientas · 1 minuto de setup · gratis en tier free.{' '}
            DMX expone su Intelligence Engine y Director Agent directamente a Claude, Cursor y ChatGPT via MCP.
          </p>
        </div>

        {/* Step 1 — Get API key */}
        <Section step="1" title="Genera tu API Key">
          <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6, marginBottom: 16 }}>
            Necesitas una API Key gratuita para autenticarte. Tier free incluye 500 llamadas/mes.
          </p>
          <a
            href={apiKeysUrl}
            data-testid="connect-mcp-cta-apikey"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14,
              padding: '10px 22px', borderRadius: 9999,
              background: 'linear-gradient(90deg, #6366F1, #EC4899)',
              color: '#fff', textDecoration: 'none',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
          >
            Generar API Key
          </a>
        </Section>

        {/* Step 2 — Claude Desktop */}
        <Section step="2" title="Claude Desktop">
          <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6, marginBottom: 16 }}>
            Abre <code style={{ background: 'rgba(99,102,241,0.12)', padding: '2px 6px', borderRadius: 6, fontSize: 13 }}>~/Library/Application Support/Claude/claude_desktop_config.json</code>{' '}
            (macOS) o <code style={{ background: 'rgba(99,102,241,0.12)', padding: '2px 6px', borderRadius: 6, fontSize: 13 }}>%APPDATA%\Claude\claude_desktop_config.json</code>{' '}
            (Windows) y agrega:
          </p>
          <CopyBlock label="claude_desktop_config.json" code={CLAUDE_CONFIG} />
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', marginTop: -8 }}>
            Reemplaza <code>TU_API_KEY</code> con tu API Key y reinicia Claude Desktop.
          </p>
        </Section>

        {/* Step 3 — Cursor */}
        <Section step="3" title="Cursor">
          <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6, marginBottom: 16 }}>
            En Cursor, ve a <strong>Settings → MCP</strong> y agrega la siguiente configuración:
          </p>
          <CopyBlock label=".cursor/mcp.json" code={CURSOR_CONFIG} />
        </Section>

        {/* Step 4 — ChatGPT */}
        <Section step="4" title="ChatGPT GPTs (Custom Action)">
          <div style={{ padding: '16px 20px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.03)' }}>
            <ol style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.8, margin: 0, paddingLeft: 20 }}>
              <li>Crea un GPT en <a href="https://chat.openai.com/gpts/editor" style={{ color: '#a5b4fc' }} target="_blank" rel="noreferrer">chat.openai.com/gpts/editor</a></li>
              <li>En <strong>Configure → Actions → Create new action</strong></li>
              <li>Importa el OpenAPI spec desde <code style={{ background: 'rgba(99,102,241,0.12)', padding: '2px 5px', borderRadius: 5, fontSize: 12 }}>{BASE_URL}/api/openapi.json</code></li>
              <li>En Authentication, selecciona <strong>API Key</strong> → Header → <code style={{ background: 'rgba(99,102,241,0.12)', padding: '2px 5px', borderRadius: 5, fontSize: 12 }}>X-DMX-API-Key</code></li>
              <li>Activa las acciones: <code>get_zone_score</code>, <code>search_developments</code>, <code>get_dev_diagnostic</code></li>
            </ol>
          </div>
        </Section>

        {/* Step 5 — Tools reference */}
        <Section step="5" title="5 herramientas Intelligence Engine">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {TOOLS.map(t => (
              <div key={t.name} data-testid={`mcp-tool-${t.name}`} style={{
                padding: '14px 16px', borderRadius: 12,
                border: '1px solid rgba(99,102,241,0.20)',
                background: 'rgba(99,102,241,0.05)',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <code style={{ fontFamily: 'monospace', fontSize: 13, color: '#a5b4fc', fontWeight: 700 }}>{t.name}</code>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)' }}>{t.desc}</span>
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 11.5, color: 'var(--cream-3)', letterSpacing: '0.02em' }}>
                  Ejemplo: <span style={{ color: '#a5b4fc' }}>{t.example}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Step 6 — Director Agent tools (Phase Y.1C) */}
        <Section step="6" title="3 herramientas Director Agent · Phase Y">
          <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6, marginBottom: 16 }}>
            Conecta tu cliente MCP directamente al Director AI de tu organización. Multi-tenant, gated por
            Phase Y master switch + tier (T1+ para chat/summary, T2+ para retrieve_memory).
            Soporta agentic tool loop con 5 sub-tools internas (IE score, KPIs, comparables, memory).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            {DIRECTOR_TOOLS.map(t => (
              <div key={t.name} data-testid={`mcp-director-tool-${t.name}`} style={{
                padding: '14px 16px', borderRadius: 12,
                border: '1px solid rgba(236,72,153,0.25)',
                background: 'rgba(236,72,153,0.05)',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <code style={{ fontFamily: 'monospace', fontSize: 13, color: '#f9a8d4', fontWeight: 700 }}>{t.name}</code>
                  <span style={{
                    fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10,
                    padding: '2px 8px', borderRadius: 9999,
                    background: 'linear-gradient(90deg, rgba(99,102,241,0.30), rgba(236,72,153,0.30))',
                    color: 'var(--cream)', letterSpacing: '0.06em',
                  }}>{t.tier}</span>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)' }}>{t.desc}</span>
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 11.5, color: 'var(--cream-3)', letterSpacing: '0.02em' }}>
                  Ejemplo: <span style={{ color: '#f9a8d4' }}>{t.example}</span>
                </div>
              </div>
            ))}
          </div>

          <CopyBlock
            label="curl · director_chat (crea sesión nueva si omites session_id)"
            code={`curl -s -X POST "${MCP_URL}" \\
  -H "X-DMX-API-Key: TU_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "method": "tools/call",
    "params": {
      "name": "director_chat",
      "arguments": { "message": "¿Cuál es la conversión de leads de los últimos 30 días?" }
    },
    "id": 1
  }'`}
          />

          <CopyBlock
            label="curl · director_retrieve_memory (T2+)"
            code={`curl -s -X POST "${MCP_URL}/call/director_retrieve_memory" \\
  -H "X-DMX-API-Key: TU_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "pricing Polanco", "top_k": 5}'`}
          />

          <CopyBlock
            label="curl · director_session_summary"
            code={`curl -s -X POST "${MCP_URL}/call/director_session_summary" \\
  -H "X-DMX-API-Key: TU_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"session_id": "dses_abc123def456", "limit": 10}'`}
          />
        </Section>

        {/* Curl example */}
        <Section step="7" title="Prueba con curl">
          <CopyBlock
            label="Terminal"
            code={`curl -s -X POST "${MCP_URL}/call/get_zone_score" \\
  -H "X-DMX-API-Key: TU_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"zone_id": "polanco"}'`}
          />
        </Section>

        {/* Step 8 — Embed widgets en blogs */}
        <Section step="8" title="Embed widgets en tu blog">
          <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6, marginBottom: 16 }}>
            Pega cualquier <code style={{ background: 'rgba(99,102,241,0.12)', padding: '2px 6px', borderRadius: 6, fontSize: 13 }}>&lt;iframe&gt;</code>{' '}
            de DesarrollosMX en tu blog o página. Los widgets son responsive, branded y
            se actualizan automáticamente con datos live. Cambia <code>polanco</code> por
            cualquier slug de colonia ({' '}
            <a href="/marketplace" style={{ color: '#a5b4fc' }}>ver lista</a>
            {' '}).
          </p>

          <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', marginBottom: 18 }}>
            <div data-testid="embed-preview-score">
              <div style={{
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
                color: 'var(--cream-3)', letterSpacing: '0.08em', textTransform: 'uppercase',
                marginBottom: 8,
              }}>
                Widget Score · Preview
              </div>
              <iframe
                title="DMX Score Widget Preview"
                src={`${PUBLIC_BASE}/widgets/score/polanco`}
                width="360"
                height="220"
                frameBorder="0"
                loading="lazy"
                style={{ border: 0, maxWidth: '100%', borderRadius: 14, background: 'transparent' }}
              />
            </div>
            <div data-testid="embed-preview-risk">
              <div style={{
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
                color: 'var(--cream-3)', letterSpacing: '0.08em', textTransform: 'uppercase',
                marginBottom: 8,
              }}>
                Widget Risk · Preview
              </div>
              <iframe
                title="DMX Risk Widget Preview"
                src={`${PUBLIC_BASE}/widgets/risk/polanco`}
                width="360"
                height="240"
                frameBorder="0"
                loading="lazy"
                style={{ border: 0, maxWidth: '100%', borderRadius: 14, background: 'transparent' }}
              />
            </div>
          </div>

          <CopyBlock label="Embed Score widget" code={EMBED_SCORE_SNIPPET} />
          <CopyBlock label="Embed Risk widget" code={EMBED_RISK_SNIPPET} />

          <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', marginTop: -4 }}>
            Cada embed dispara un backlink natural a desarrollosmx.io · ayuda autoridad
            de dominio y compounding SEO/GEO. CORS abierto · cache CDN 5 min.
          </p>
        </Section>

      </main>

      <style>{`
        @media (max-width: 640px) {
          main { padding: 24px 16px 60px !important; }
          pre { font-size: 11px !important; }
        }
      `}</style>
    </div>
  );
}
