/**
 * W6.4 · PublishTemplateModal · selecciona un workflow propio, lo publica como template.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listMyWorkflows, publishTemplate } from '../../../api/marketplaceTemplates';

const CREAM = '#F0EBE0';
const MUTED = 'rgba(240,235,224,0.62)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';

const CATEGORIES = ['nurture', 'post-visita', 'win-back', 'custom'];

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11, opacity: 0.7, letterSpacing: 0.6, textTransform: 'uppercase' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export default function PublishTemplateModal({ open, onClose, onPublished }) {
  const { t } = useTranslation('common');
  const [workflows, setWorkflows] = useState([]);
  const [workflowId, setWorkflowId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('custom');
  const [priceMxn, setPriceMxn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [okMsg, setOkMsg] = useState(null);

  useEffect(() => {
    let cancel = false;
    if (open) {
      setErr(null); setOkMsg(null);
      listMyWorkflows().then((r) => {
        if (!cancel) setWorkflows(r.items || []);
      }).catch((e) => {
        if (!cancel) setErr(e?.body?.detail || e?.message || t('common.error', 'Error'));
      });
    }
    return () => { cancel = true; };
  }, [open, t]);

  const handleSubmit = useCallback(async () => {
    if (!workflowId) {
      setErr(t('marketplaceTemplates.publish.errWorkflow', 'Selecciona un workflow'));
      return;
    }
    if (!title || title.length < 4) {
      setErr(t('marketplaceTemplates.publish.errTitle', 'Título mínimo 4 caracteres'));
      return;
    }
    setBusy(true); setErr(null);
    try {
      await publishTemplate({
        workflow_id: workflowId,
        title,
        description,
        category,
        price_mxn: Number(priceMxn) || 0,
      });
      setOkMsg(t('marketplaceTemplates.publish.ok',
                  'Enviado a revisión · te notificaremos al aprobar'));
      setTimeout(() => { onPublished?.(); }, 1200);
    } catch (e) {
      setErr(e?.body?.detail || e?.message || t('common.error', 'Error'));
    } finally {
      setBusy(false);
    }
  }, [workflowId, title, description, category, priceMxn, onPublished, t]);

  if (!open) return null;

  return (
    <div
      data-testid="mt-publish-modal"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(6,8,15,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
          background: '#0B0F19', border: BORDER, borderRadius: 18, color: CREAM,
          padding: 28, display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 800 }}>
            {t('marketplaceTemplates.publish.title', 'Publicar plantilla')}
          </h2>
          <button
            type="button" onClick={onClose}
            style={{
              background: 'transparent', border: BORDER, color: CREAM,
              padding: '4px 12px', borderRadius: 9999, cursor: 'pointer',
            }}
          >×</button>
        </div>

        <p style={{ margin: 0, color: MUTED, fontSize: 13, lineHeight: 1.55 }}>
          {t('marketplaceTemplates.publish.helper',
             'Selecciona un workflow propio para publicarlo. Se enviará a revisión interna antes de aparecer en el catálogo.')}
        </p>

        <Field label={t('marketplaceTemplates.publish.workflowLabel', 'Workflow a publicar')}>
          <select
            data-testid="mt-publish-workflow"
            value={workflowId}
            onChange={(e) => setWorkflowId(e.target.value)}
            style={{
              padding: '10px 12px', borderRadius: 12, border: BORDER,
              background: 'transparent', color: CREAM,
            }}
          >
            <option value="">— {t('marketplaceTemplates.publish.workflowEmpty', 'selecciona uno')} —</option>
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>{w.name} ({(w.nodes || []).length} nodes)</option>
            ))}
          </select>
        </Field>

        <Field label={t('marketplaceTemplates.publish.titleLabel', 'Título')}>
          <input
            data-testid="mt-publish-title"
            value={title} onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder={t('marketplaceTemplates.publish.titlePlaceholder',
                           'Ej. Seguimiento post-visita 7 días')}
            style={{
              padding: '10px 12px', borderRadius: 12, border: BORDER,
              background: 'transparent', color: CREAM,
            }}
          />
        </Field>

        <Field label={t('marketplaceTemplates.publish.descLabel', 'Descripción')}>
          <textarea
            data-testid="mt-publish-desc"
            value={description} onChange={(e) => setDescription(e.target.value)}
            maxLength={2000} rows={4}
            placeholder={t('marketplaceTemplates.publish.descPlaceholder',
                           'Qué hace · cuándo usarlo · resultado esperado')}
            style={{
              padding: '10px 12px', borderRadius: 12, border: BORDER,
              background: 'transparent', color: CREAM, fontFamily: 'inherit', resize: 'vertical',
            }}
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label={t('marketplaceTemplates.publish.categoryLabel', 'Categoría')}>
            <select
              data-testid="mt-publish-category"
              value={category} onChange={(e) => setCategory(e.target.value)}
              style={{
                padding: '10px 12px', borderRadius: 12, border: BORDER,
                background: 'transparent', color: CREAM,
              }}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{t(`marketplaceTemplates.category.${c}`, c)}</option>
              ))}
            </select>
          </Field>

          <Field label={t('marketplaceTemplates.publish.priceLabel', 'Precio MXN (0 = gratis)')}>
            <input
              data-testid="mt-publish-price"
              type="number" min={0} max={10000} step={10}
              value={priceMxn} onChange={(e) => setPriceMxn(e.target.value)}
              style={{
                padding: '10px 12px', borderRadius: 12, border: BORDER,
                background: 'transparent', color: CREAM,
              }}
            />
          </Field>
        </div>

        {err && (
          <div style={{ padding: 10, borderRadius: 10, background: 'rgba(248,113,113,0.12)',
                         border: '1px solid rgba(248,113,113,0.3)', color: '#FCA5A5', fontSize: 13 }}>
            {err}
          </div>
        )}

        {okMsg && (
          <div style={{ padding: 10, borderRadius: 10, background: 'rgba(134,239,172,0.12)',
                         border: '1px solid rgba(134,239,172,0.3)', color: '#86EFAC', fontSize: 13 }}>
            {okMsg}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
          <button
            type="button" onClick={onClose}
            style={{
              padding: '10px 18px', borderRadius: 9999, border: BORDER,
              background: 'transparent', color: CREAM, cursor: 'pointer',
            }}
          >
            {t('common.cancel', 'Cancelar')}
          </button>
          <button
            type="button"
            data-testid="mt-publish-submit"
            disabled={busy}
            onClick={handleSubmit}
            style={{
              padding: '10px 20px', borderRadius: 9999, border: 'none', cursor: 'pointer',
              background: GRAD, color: '#fff', fontWeight: 700, opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? '…' : t('marketplaceTemplates.publish.submit', 'Enviar a revisión')}
          </button>
        </div>
      </div>
    </div>
  );
}
