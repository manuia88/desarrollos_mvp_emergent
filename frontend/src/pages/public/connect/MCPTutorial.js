// W4.16 Sub-C — MCP Tutorial (public /connect/mcp/tutorial)
import React, { useEffect, useState } from 'react';
import Navbar from '../../../components/landing/Navbar';

const API = process.env.REACT_APP_BACKEND_URL;

const CONFIG_JSON = `{
  "mcpServers": {
    "desarrollosmx": {
      "command": "npx",
      "args": ["-y", "@desarrollosmx/mcp-server"],
      "env": {
        "DMX_API_BASE": "https://api.desarrollosmx.io"
      }
    }
  }
}`;

const EXAMPLE_QUERIES = [
  { q: '¿Qué tan buena inversión es Polanco preventa con ticket 18M?',
    a: 'Analiza Zone Score · hedónico · gap · escenarios ROI · alternativas comparables.' },
  { q: '¿Cuál es el ROI esperado a 24 meses en Condesa para un depa 95 m²?',
    a: 'Simula 3 escenarios + TIR anual + cashflow proyectado.' },
  { q: 'Compara Roma Norte vs Del Valle para inversión de 12M MXN.',
    a: 'Side-by-side Zone Score · velocity · demand-supply · plusvalía 5y.' },
  { q: 'Dame las top 5 colonias con gap demanda-oferta positivo en 2026 Q2.',
    a: 'Pipeline DMX devuelve ranking actualizado con score normalizado.' },
  { q: 'Sugiere asesores DMX para distribución de un proyecto en Coyoacán.',
    a: 'Asesor matching basado en track record + zone expertise + DISC alignment.' },
  { q: 'Genera un briefing IE para mi cliente que busca Lomas con 25M.',
    a: 'Output: PDF + scoring 9 dimensiones + 3 propuestas finalistas.' },
];

const CLIENTS = ['Claude Desktop', 'ChatGPT (Custom GPT)', 'Perplexity', 'Cursor', 'Windsurf'];

export default function MCPTutorial() {
  const [copied, setCopied] = useState('');

  useEffect(() => {
    // Track adoption (source=tutorial)
    fetch(`${API}/api/mcp/track-adoption`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'tutorial' }),
    }).catch(() => {});
    try { window.posthog?.capture?.('mcp_tutorial_viewed'); } catch (_) {}
    try {
      document.title = 'Conecta Claude Desktop a DesarrollosMX · MCP Setup';
      const setMeta = (name, val, prop = false) => {
        const sel = prop ? `meta[property="${name}"]` : `meta[name="${name}"]`;
        let m = document.head.querySelector(sel);
        if (!m) {
          m = document.createElement('meta');
          if (prop) m.setAttribute('property', name); else m.setAttribute('name', name);
          document.head.appendChild(m);
        }
        m.setAttribute('content', val);
      };
      setMeta('description', 'Conecta Claude Desktop / ChatGPT / Perplexity a DesarrollosMX · 18 herramientas agentic para queries naturales sobre real estate CDMX.');
      setMeta('og:title', 'DMX MCP Server · Inteligencia inmobiliaria CDMX para tu IDE', true);
      setMeta('og:description', '18 tools agentic · queries naturales sobre real estate MX.', true);
    } catch (_) {}
  }, []);

  const copy = async (txt, key) => {
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(key);
      setTimeout(() => setCopied(''), 1800);
    } catch (_) {}
  };

  return (
    <div data-testid="mcp-tutorial-page" style={{
      background: '#06080F', color: '#F0EBE0', minHeight: '100vh', paddingBottom: 100,
    }}>
      <Navbar />
      <div style={{ height: 60 }} />
      <div style={{ height: 6, background: 'linear-gradient(90deg, #6366F1, #EC4899)' }} />

      {/* Hero */}
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '64px 24px 32px' }}>
        <span style={eyebrow}>DMX · MCP DISTRIBUTION</span>
        <h1 style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(36px, 5.5vw, 60px)',
          lineHeight: 1.1, letterSpacing: '-0.02em', margin: '12px 0 14px',
        }}>
          Conecta <span style={gradientText}>Claude Desktop</span> a DesarrollosMX
        </h1>
        <p style={{
          fontFamily: 'DM Sans', fontSize: 17, color: 'var(--cream-3, #a0a4b0)',
          maxWidth: 760, lineHeight: 1.55,
        }}>
          DMX MCP server expone <strong style={{ color: 'var(--cream)' }}>18 herramientas agentic</strong> · queries naturales
          sobre inteligencia inmobiliaria CDMX directo desde tu IDE.
        </p>
      </div>

      {/* Section 1 · What is MCP */}
      <Section title="¿Qué es MCP?">
        <div style={card}>
          <p style={p}>
            <strong style={{ color: 'var(--cream)' }}>Model Context Protocol</strong> (MCP) es el estándar
            abierto de Anthropic para conectar modelos de IA a fuentes de datos y herramientas externas
            de forma segura y composable.
          </p>
          <p style={p}>
            Al conectar Claude Desktop al servidor MCP de DesarrollosMX, obtienes acceso a Zone Score,
            modelos hedónicos, simulador de inversión, briefing IE, demand-supply gap, y herramientas
            de comercialización sin salir de tu interfaz preferida.
          </p>
        </div>
      </Section>

      {/* Section 2 · Setup */}
      <Section title="Setup en 3 pasos">
        <Step n={1} testid="mcp-step-1" title="Descarga Claude Desktop">
          <p style={p}>
            Descarga la app oficial desde{' '}
            <a href="https://claude.ai/download" target="_blank" rel="noopener noreferrer" style={link}>
              claude.ai/download
            </a>{' '}
            (macOS / Windows). Inicia sesión con tu cuenta Anthropic.
          </p>
        </Step>
        <Step n={2} testid="mcp-step-2" title="Configura claude_desktop_config.json">
          <p style={p}>
            Edita el archivo de configuración (rutas: <code style={codeInline}>~/Library/Application Support/Claude/claude_desktop_config.json</code> en macOS
            o <code style={codeInline}>%APPDATA%\Claude\claude_desktop_config.json</code> en Windows).
          </p>
          <div style={{ position: 'relative', marginTop: 12 }}>
            <pre style={codeBlock}>{CONFIG_JSON}</pre>
            <button
              type="button"
              onClick={() => copy(CONFIG_JSON, 'config')}
              style={{
                position: 'absolute', top: 12, right: 12,
                background: copied === 'config'
                  ? 'rgba(34,197,94,0.18)'
                  : 'rgba(240,235,224,0.10)',
                color: copied === 'config' ? '#86efac' : 'var(--cream)',
                border: '1px solid rgba(240,235,224,0.20)', borderRadius: 9999,
                padding: '5px 14px',
                fontFamily: 'Outfit', fontWeight: 700, fontSize: 10, letterSpacing: '0.08em',
                cursor: 'pointer',
              }}
            >
              {copied === 'config' ? 'COPIADO' : 'COPIAR'}
            </button>
          </div>
        </Step>
        <Step n={3} testid="mcp-step-3" title="Reinicia y prueba">
          <p style={p}>
            Cierra y reabre Claude Desktop. En el nuevo chat, pregunta:
          </p>
          <div style={{ ...quote }}>
            "¿Qué tan buena inversión es Polanco preventa con ticket 18M?"
          </div>
          <p style={{ ...p, marginTop: 12 }}>
            Claude usará el MCP server DMX para responder con datos reales.
          </p>
        </Step>
      </Section>

      {/* Section 3 · Query examples */}
      <Section title="Ejemplos de queries">
        <div style={{
          display: 'grid', gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        }}>
          {EXAMPLE_QUERIES.map((eq, i) => (
            <div
              key={i}
              data-testid={`mcp-query-example-${i + 1}`}
              style={{ ...card, padding: 18 }}
            >
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)', marginBottom: 8 }}>
                "{eq.q}"
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3, #a0a4b0)', lineHeight: 1.55 }}>
                → {eq.a}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Section 4 · Compatible clients */}
      <Section title="Compatible con">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {CLIENTS.map((c) => (
            <span
              key={c}
              style={{
                background: 'rgba(99,102,241,0.10)',
                border: '1px solid rgba(99,102,241,0.30)',
                borderRadius: 9999,
                padding: '8px 18px',
                fontFamily: 'Outfit', fontWeight: 700, fontSize: 12, letterSpacing: '0.04em',
                color: 'var(--cream)',
              }}
            >
              {c}
            </span>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <div style={{ maxWidth: 1000, margin: '60px auto 0', padding: '0 24px' }}>
        <div style={{
          ...card,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.10), rgba(236,72,153,0.10))',
          border: '1px solid rgba(99,102,241,0.30)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ maxWidth: 540 }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', marginBottom: 6 }}>
              ¿Eres asesor o desarrollador?
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-3, #a0a4b0)', lineHeight: 1.55 }}>
              Studio brochures · briefings IE · simulator · 3D tours · CRM agéntico. Empieza gratis.
            </div>
          </div>
          <a
            href="/broker-portal"
            data-testid="mcp-cta-broker"
            style={ctaPrimary}
          >
            IR A BROKER PORTAL
          </a>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 24px 0' }}>
      <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, margin: '0 0 18px', letterSpacing: '-0.01em' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Step({ n, title, children, testid }) {
  return (
    <div data-testid={testid} style={{
      ...card, marginBottom: 14,
      borderLeft: '3px solid #6366F1',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <span style={{
          width: 32, height: 32, borderRadius: 9999,
          background: 'linear-gradient(90deg, #6366F1, #EC4899)',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 14,
        }}>{n}</span>
        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)' }}>
          {title}
        </div>
      </div>
      {children}
    </div>
  );
}

// Styles
const eyebrow = {
  fontFamily: 'Outfit', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em',
  color: 'var(--cream-3, #a0a4b0)',
};
const gradientText = {
  background: 'linear-gradient(90deg, #6366F1, #EC4899)',
  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
};
const card = {
  background: 'rgba(13,16,23,0.92)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 18, padding: 22,
  backdropFilter: 'blur(24px)',
};
const p = { fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-3, #a0a4b0)', lineHeight: 1.6, margin: '0 0 10px' };
const link = { color: '#a5b4fc', textDecoration: 'underline' };
const codeInline = {
  background: 'rgba(15,18,28,0.85)',
  border: '1px solid rgba(240,235,224,0.10)',
  borderRadius: 6,
  padding: '2px 8px',
  fontFamily: 'monospace', fontSize: 12,
  color: 'var(--cream)',
};
const codeBlock = {
  background: '#0a0d14',
  border: '1px solid rgba(240,235,224,0.10)',
  borderRadius: 12,
  padding: '18px 16px',
  fontFamily: 'monospace', fontSize: 12,
  color: '#a5b4fc',
  overflow: 'auto',
  margin: 0,
};
const quote = {
  background: 'rgba(99,102,241,0.08)',
  border: '1px solid rgba(99,102,241,0.30)',
  borderLeft: '3px solid #EC4899',
  borderRadius: 10,
  padding: '12px 16px',
  marginTop: 10,
  fontFamily: 'DM Sans', fontStyle: 'italic',
  color: 'var(--cream)',
  fontSize: 14,
};
const ctaPrimary = {
  background: 'linear-gradient(90deg, #6366F1, #EC4899)',
  color: '#fff', border: 'none', borderRadius: 9999,
  padding: '12px 26px',
  fontFamily: 'Outfit', fontWeight: 800, fontSize: 12, letterSpacing: '0.1em',
  textDecoration: 'none', display: 'inline-block',
};
