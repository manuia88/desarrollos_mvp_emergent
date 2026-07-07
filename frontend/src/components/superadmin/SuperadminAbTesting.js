// W7.AS.3.G · SuperadminAbTesting — dashboard A/B testing de prompts.
// 4 columnas: lista tests | Variante A | Variante B | resultados chi² + winner.
// Botón "Pick Winner" auto cuando p<0.05 + n≥100 · pick manual siempre disponible.
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlaskConical, RefreshCw, Plus, Trophy, Trash2, Loader2 } from 'lucide-react';
import SuperadminLayout from './SuperadminLayout';
import AbTestCreateModal from './AbTestCreateModal';

const API = process.env.REACT_APP_BACKEND_URL || '';
const GRADIENT = 'linear-gradient(135deg, #6366F1, #EC4899)';
const AUTO_MIN_N = 100;

function authHeaders() {
  const t = localStorage.getItem('dmx_token') || localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function SuperadminAbTesting({ embedded }) {
  const { t } = useTranslation('conversation_ab_testing');
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [results, setResults] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const loadTests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/superadmin/ab-testing/list`, { headers: authHeaders() });
      const data = res.ok ? await res.json() : { tests: [] };
      setTests(data.tests || []);
    } catch (e) {
      setTests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadResults = useCallback(async (id) => {
    setResults(null);
    try {
      const res = await fetch(`${API}/api/superadmin/ab-testing/results/${id}`, { headers: authHeaders() });
      if (res.ok) setResults(await res.json());
    } catch (e) { /* no-op */ }
  }, []);

  useEffect(() => { loadTests(); }, [loadTests]);
  useEffect(() => { if (selectedId) loadResults(selectedId); }, [selectedId, loadResults]);

  const selected = tests.find((x) => x.test_id === selectedId) || null;

  const pickWinner = useCallback(async (variant) => {
    if (!selectedId) return;
    try {
      await fetch(`${API}/api/superadmin/ab-testing/pick-winner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ test_id: selectedId, variant: variant || null }),
      });
      await loadTests();
      await loadResults(selectedId);
    } catch (e) { /* no-op */ }
  }, [selectedId, loadTests, loadResults]);

  const removeTest = useCallback(async (id) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(t('confirm_delete'))) return;
    try {
      await fetch(`${API}/api/superadmin/ab-testing/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (selectedId === id) { setSelectedId(null); setResults(null); }
      await loadTests();
    } catch (e) { /* no-op */ }
  }, [selectedId, loadTests, t]);

  const sig = results?.statistical_significance || {};
  const nTotal = results?.n_total || 0;
  const canAutoPick = sig.state === 'ok' && sig.significant && nTotal >= AUTO_MIN_N;

  const colBox = { background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, overflowY: 'auto' };
  const heading = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'rgba(240,235,224,0.55)', marginBottom: 12 };

  const variantCol = (key) => {
    const v = (selected?.variants || {})[key] || {};
    const r = results?.[key] || {};
    const isWinner = (selected?.winner || results?.winner) === key;
    const accent = key === 'A' ? '#6366F1' : '#EC4899';
    return (
      <div style={colBox}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ ...heading, marginBottom: 0, color: accent }}>{key === 'A' ? t('variant_a') : t('variant_b')}</span>
          {isWinner ? <span style={{ fontSize: 10, fontWeight: 800, background: GRADIENT, color: '#fff', padding: '2px 8px', borderRadius: 9999 }}>{t('winner_badge')}</span> : null}
        </div>
        {!selected ? (
          <div style={{ color: 'rgba(240,235,224,0.4)', fontSize: 13 }}>{t('select_hint')}</div>
        ) : (
          <>
            <div style={{ ...heading, fontSize: 10 }}>{t('prompt')}</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12, whiteSpace: 'pre-wrap', marginBottom: 14, maxHeight: 200, overflowY: 'auto' }}>
              {v.prompt || '—'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
              <span style={{ color: 'rgba(240,235,224,0.5)' }}>{t('users')}</span><b>{r.users ?? v.users ?? 0}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
              <span style={{ color: 'rgba(240,235,224,0.5)' }}>{t('conversions')}</span><b>{r.conversions ?? v.conversions ?? 0}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
              <span style={{ color: 'rgba(240,235,224,0.5)' }}>{t('rate')}</span>
              <b style={{ color: accent }}>{((r.rate ?? 0) * 100).toFixed(1)}%</b>
            </div>
            {selected.status === 'running' ? (
              <button type="button" onClick={() => pickWinner(key)}
                style={{ marginTop: 14, width: '100%', background: 'rgba(255,255,255,0.06)', border: `1px solid ${accent}55`, borderRadius: 10, color: 'var(--cream, #F0EBE0)', padding: '8px 0', cursor: 'pointer', fontWeight: 600, fontSize: 12.5 }}>
                {key === 'A' ? t('pick_a') : t('pick_b')}
              </button>
            ) : null}
          </>
        )}
      </div>
    );
  };

  return (
    <SuperadminLayout bare={embedded}>
      <div style={{ padding: 24, color: 'var(--cream, #F0EBE0)', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: GRADIENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FlaskConical size={20} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22, margin: 0 }}>{t('title')}</h1>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(240,235,224,0.55)' }}>{t('subtitle')}</p>
          </div>
          <button type="button" onClick={loadTests}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--cream, #F0EBE0)', padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
            <RefreshCw size={14} /> {t('refresh')}
          </button>
          <button type="button" onClick={() => setModalOpen(true)}
            style={{ background: GRADIENT, border: 'none', borderRadius: 10, color: '#fff', padding: '9px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 12.5 }}>
            <Plus size={15} /> {t('create_test')}
          </button>
        </div>

        {/* 4-col layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 1fr 320px', gap: 14, height: 'calc(100vh - 200px)' }}>
          {/* col 1 · tests list */}
          <div style={colBox}>
            <div style={heading}>{t('list_title')}</div>
            {loading ? (
              <div style={{ color: 'rgba(240,235,224,0.5)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> {t('loading')}
              </div>
            ) : tests.length === 0 ? (
              <div style={{ color: 'rgba(240,235,224,0.4)', fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('empty_tests')}</div>
                <div style={{ fontSize: 12 }}>{t('empty_hint')}</div>
              </div>
            ) : tests.map((tst) => (
              <button key={tst.test_id} type="button" onClick={() => setSelectedId(tst.test_id)}
                style={{ width: '100%', textAlign: 'left', background: selectedId === tst.test_id ? 'rgba(99,102,241,0.14)' : 'transparent', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--cream, #F0EBE0)', padding: '10px 12px', cursor: 'pointer', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tst.name}</span>
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 9999, background: 'rgba(255,255,255,0.06)', color: tst.status === 'running' ? '#22C55E' : '#94A3B8', whiteSpace: 'nowrap' }}>
                    {tst.status === 'running' ? t('status_running') : t('status_completed')}
                  </span>
                </div>
                {tst.winner ? <div style={{ fontSize: 11, color: '#F59E0B', marginTop: 3 }}>🏆 {t('winner')}: {tst.winner}</div> : null}
              </button>
            ))}
          </div>

          {/* col 2 · variant A · col 3 · variant B */}
          {variantCol('A')}
          {variantCol('B')}

          {/* col 4 · results + winner */}
          <div style={colBox}>
            <div style={heading}>{t('results_title')}</div>
            {!selected ? (
              <div style={{ color: 'rgba(240,235,224,0.4)', fontSize: 13 }}>{t('select_hint')}</div>
            ) : !results ? (
              <div style={{ color: 'rgba(240,235,224,0.5)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> {t('loading')}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                  <span style={{ color: 'rgba(240,235,224,0.5)' }}>{t('n_total')}</span><b>{nTotal}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                  <span style={{ color: 'rgba(240,235,224,0.5)' }}>{t('chi2')}</span>
                  <b>{sig.chi2 != null ? sig.chi2 : '—'}</b>
                </div>
                <div style={{
                  fontSize: 12.5, padding: '8px 10px', borderRadius: 9999, textAlign: 'center', marginBottom: 14,
                  background: sig.significant ? 'rgba(34,197,94,0.14)' : 'rgba(245,158,11,0.12)',
                  color: sig.significant ? '#22C55E' : '#F59E0B',
                }}>
                  {sig.state === 'insufficient_data' ? t('insufficient_data') : (sig.significant ? t('significant') : t('not_significant'))}
                </div>

                <div style={{ ...heading, fontSize: 10 }}>{t('winner')}</div>
                {(selected.winner || results.winner) ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, marginBottom: 14 }}>
                    <Trophy size={18} color="#F59E0B" /> {selected.winner || results.winner}
                  </div>
                ) : (
                  <div style={{ color: 'rgba(240,235,224,0.4)', fontSize: 12.5, marginBottom: 14 }}>{t('no_winner')}</div>
                )}

                {selected.status === 'running' && canAutoPick ? (
                  <button type="button" onClick={() => pickWinner(null)}
                    style={{ width: '100%', background: GRADIENT, border: 'none', borderRadius: 10, color: '#fff', padding: '10px 0', cursor: 'pointer', fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Trophy size={15} /> {t('pick_winner')}
                  </button>
                ) : null}

                <button type="button" onClick={() => removeTest(selected.test_id)}
                  style={{ width: '100%', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#EF4444', padding: '9px 0', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5 }}>
                  <Trash2 size={14} /> {t('delete')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <AbTestCreateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => { loadTests(); }}
      />
    </SuperadminLayout>
  );
}
