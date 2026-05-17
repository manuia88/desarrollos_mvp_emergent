/**
 * W5.11 Parte 2 — DuplicateDiffCard
 * Componente reutilizable que muestra diff side-by-side entre canonical y candidate.
 * - Verde: campos con match exacto (score 100)
 * - Amber: match parcial fuzzy (75-99)
 * - Gris: sin match / campo vacío
 * Props: canonical {object}, candidate {object}, breakdown {email,phone,nombre,address}, cross_asesor {bool}
 */
import React from 'react';
import { AlertTriangle, Check, MinusCircle } from 'lucide-react';

const FIELD_LABELS = {
  first_name: 'Nombre', last_name: 'Apellido', email: 'Email', phone: 'Teléfono',
  address: 'Dirección', assigned_to: 'Asesor asignado', status_v2: 'Estatus',
  source: 'Fuente', created_at: 'Creado', id: 'ID',
  name: 'Nombre', location: 'Ubicación',
};

const BREAKDOWN_WEIGHTS = {
  email: 0.40, phone: 0.30, nombre: 0.20, address: 0.10,
};

function fieldScore(fieldKey, breakdown = {}) {
  const map = { email: breakdown.email, phone: breakdown.phone };
  // nombre maps to first_name/last_name
  if (['first_name', 'last_name', 'name'].includes(fieldKey)) return breakdown.nombre;
  if (['address', 'location', 'colonia'].includes(fieldKey)) return breakdown.address;
  return map[fieldKey];
}

function diffTone(score) {
  if (score === undefined || score === null) return 'neutral';
  if (score >= 100) return 'match';
  if (score >= 75) return 'partial';
  return 'neutral';
}

const TONES = {
  match:   { color: '#86efac', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.22)' },
  partial: { color: '#fcd34d', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.22)' },
  neutral: { color: 'var(--cream-3)', bg: 'rgba(255,255,255,0.02)', border: 'var(--border)' },
};

function DiffCell({ value, score }) {
  const tone = diffTone(score);
  const { color, bg, border } = TONES[tone];
  const Icon = tone === 'match' ? Check : tone === 'partial' ? AlertTriangle : MinusCircle;
  const displayVal = value == null || value === '' ? '—' : String(value).slice(0, 80);
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 6, padding: '6px 10px', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
      <Icon size={11} color={color} style={{ flexShrink: 0, marginTop: 2 }} />
      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color, wordBreak: 'break-all', lineHeight: 1.5 }}>{displayVal}</span>
    </div>
  );
}

const DISPLAY_FIELDS = ['first_name', 'last_name', 'name', 'email', 'phone', 'address', 'assigned_to', 'source', 'status_v2', 'created_at', 'id'];

export default function DuplicateDiffCard({ canonical = {}, candidate = {}, breakdown = {}, cross_asesor = false }) {
  // Unión de campos relevantes entre ambos docs
  const allKeys = [...new Set([...DISPLAY_FIELDS, ...Object.keys(canonical), ...Object.keys(candidate)])]
    .filter(k => !['_id', 'merged_into', 'deleted_at'].includes(k));

  return (
    <div data-testid="duplicate-diff-card" style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 8 }}>
      {/* Cross-asesor warning */}
      {cross_asesor && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: 8, padding: '9px 14px', marginBottom: 12 }}>
          <AlertTriangle size={13} color="#fda4af" />
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#fda4af' }}>
            Ambos registros asignados a asesores diferentes · revisar manualmente antes de fusionar
          </span>
        </div>
      )}

      {/* Score breakdown strip */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {Object.entries(BREAKDOWN_WEIGHTS).map(([field, weight]) => {
          const score = breakdown[field] ?? 0;
          const tone = diffTone(score);
          const { color, bg, border } = TONES[tone];
          return (
            <div key={field} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 6, padding: '4px 10px', display: 'flex', gap: 5, alignItems: 'center' }}>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color, textTransform: 'uppercase' }}>{field}</span>
              <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 12, color }}>{score}</span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--cream-3)' }}>×{weight}</span>
            </div>
          );
        })}
        <div style={{ background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.28)', borderRadius: 6, padding: '4px 10px', display: 'flex', gap: 5, alignItems: 'center' }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#a5b4fc', textTransform: 'uppercase' }}>TOTAL</span>
          <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: '#a5b4fc' }}>
            {Object.entries(BREAKDOWN_WEIGHTS).reduce((s, [f, w]) => s + (breakdown[f] ?? 0) * w, 0).toFixed(1)}
          </span>
        </div>
      </div>

      {/* Side-by-side diff */}
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 4 }}>
        {/* Header */}
        <div />
        {['Canonico (mantener)', 'Candidato (merge)'].map(h => (
          <div key={h} style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 10px' }}>{h}</div>
        ))}
        {/* Rows */}
        {allKeys.map(key => {
          const valA = canonical[key];
          const valB = candidate[key];
          if (valA == null && valB == null) return null;
          const score = fieldScore(key, breakdown);
          return (
            <React.Fragment key={key}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', padding: '4px 0', alignSelf: 'center' }}>{FIELD_LABELS[key] || key}</div>
              <DiffCell value={valA} score={score} />
              <DiffCell value={valB} score={score} />
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
