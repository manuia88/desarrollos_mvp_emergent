// W5.22 Z.1 Sub-C — MoodBoardSection (embebible en /portal/desarrollador/proyecto/:id)
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../../../api/studio';
import { Plus, Trash2, Layers, GripVertical } from 'lucide-react';

const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';

export default function MoodBoardSection({ projectId }) {
  const { t } = useTranslation();
  const [boards, setBoards] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [active, setActive] = useState(null);

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [b, a] = await Promise.all([
        api.listMoodBoards(projectId),
        api.listStudioAssets({ project_id: projectId, limit: 100 }),
      ]);
      setBoards(b.items || []);
      setAssets(a.items || []);
      if (b.items?.length && !active) setActive(b.items[0]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    if (!newName.trim()) return;
    const r = await api.createMoodBoard({
      project_id: projectId,
      name: newName.trim(),
      asset_ids: [],
      color_palette: [],
    });
    setNewName('');
    setCreating(false);
    setActive(r.board);
    await load();
  };

  const remove = async (id) => {
    if (!window.confirm(t('studio.mood_board.confirm_delete'))) return;
    await api.deleteMoodBoard(id);
    if (active?.id === id) setActive(null);
    await load();
  };

  const toggleAsset = async (assetId) => {
    if (!active) return;
    const ids = active.asset_ids || [];
    const next = ids.includes(assetId) ? ids.filter((i) => i !== assetId) : [...ids, assetId];
    const r = await api.updateMoodBoard(active.id, { asset_ids: next });
    setActive(r.board);
    await load();
  };

  const reorder = async (fromIdx, toIdx) => {
    if (!active) return;
    const ids = [...(active.asset_ids || [])];
    const [moved] = ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, moved);
    const r = await api.updateMoodBoard(active.id, { asset_ids: ids });
    setActive(r.board);
    await load();
  };

  if (!projectId) {
    return (
      <div data-testid="mood-board-no-project" style={{ padding: 24, color: 'var(--cream-3)' }}>
        {t('studio.mood_board.no_project_msg')}
      </div>
    );
  }

  if (loading) {
    return (
      <div data-testid="mood-board-loading" style={{ padding: 24, color: 'var(--cream-3)' }}>
        {t('studio.mood_board.loading')}
      </div>
    );
  }

  return (
    <div data-testid="mood-board-section" style={{ padding: '14px 0' }}>
      {/* Boards list */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {boards.map((b) => (
          <button
            key={b.id}
            data-testid={`mood-tab-${b.id}`}
            onClick={() => setActive(b)}
            style={tabStyle(active?.id === b.id)}>
            <Layers size={12} /> {b.name}
          </button>
        ))}
        {!creating ? (
          <button data-testid="new-board-btn" onClick={() => setCreating(true)} style={addBtn()}>
            <Plus size={12} /> {t('studio.mood_board.new_board')}
          </button>
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              data-testid="new-board-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              placeholder={t('studio.mood_board.name_placeholder')}
              style={inputStyle()}
            />
            <button data-testid="create-board" onClick={create} style={addBtn()}>OK</button>
            <button onClick={() => { setCreating(false); setNewName(''); }} style={ghostBtn()}>
              {t('studio.mood_board.cancel')}
            </button>
          </div>
        )}
      </div>

      {!active ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--cream-3)' }}>
          {t('studio.mood_board.select_or_create')}
        </div>
      ) : (
        <>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontFamily: 'Outfit', fontWeight: 700, fontSize: 20, color: 'var(--cream)' }}>
              {active.name}
            </h3>
            <button onClick={() => remove(active.id)} data-testid="delete-board" style={dangerBtn()}>
              <Trash2 size={12} /> {t('studio.mood_board.delete_board')}
            </button>
          </div>

          {/* Selected assets in board */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: 'var(--cream-3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              {t('studio.mood_board.in_board')} ({(active.asset_ids || []).length})
            </div>
            <div data-testid="board-grid" style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {(active.asset_ids || []).map((aid, idx) => {
                const asset = assets.find((a) => a.id === aid);
                if (!asset) return null;
                return (
                  <AssetTile
                    key={aid}
                    asset={asset}
                    selected
                    index={idx}
                    onToggle={() => toggleAsset(aid)}
                    onReorderLeft={() => idx > 0 && reorder(idx, idx - 1)}
                    onReorderRight={() => idx < (active.asset_ids.length - 1) && reorder(idx, idx + 1)}
                    t={t}
                  />
                );
              })}
            </div>
          </div>

          {/* Available assets to add */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--cream-3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              {t('studio.mood_board.available_assets')}
            </div>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {assets
                .filter((a) => !(active.asset_ids || []).includes(a.id))
                .slice(0, 24)
                .map((a) => (
                  <AssetTile
                    key={a.id}
                    asset={a}
                    onToggle={() => toggleAsset(a.id)}
                    t={t}
                  />
                ))}
              {assets.length === 0 && (
                <div style={{ gridColumn: '1 / -1', padding: 24, color: 'var(--cream-3)', fontSize: 13 }}>
                  {t('studio.mood_board.no_assets_yet')}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AssetTile({ asset, selected, index, onToggle, onReorderLeft, onReorderRight, t }) {
  const isPhoto = asset.asset_type === 'photo' && asset.r2_url;
  return (
    <div
      data-testid={`asset-tile-${asset.id}`}
      style={{
        padding: 8,
        background: 'rgba(13,17,28,0.62)',
        border: `1px solid ${selected ? 'rgba(99,102,241,0.50)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 14, backdropFilter: 'blur(24px)',
        position: 'relative',
      }}>
      {selected && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--cream-3)', fontWeight: 700 }}>#{index + 1}</span>
          <div style={{ display: 'inline-flex', gap: 2 }}>
            <button data-testid={`reorder-left-${asset.id}`} onClick={onReorderLeft} style={miniBtn()}>‹</button>
            <button data-testid={`reorder-right-${asset.id}`} onClick={onReorderRight} style={miniBtn()}>›</button>
          </div>
        </div>
      )}
      <div style={{
        width: '100%', aspectRatio: '1 / 1',
        background: isPhoto ? `url(${asset.r2_url}) center/cover` : 'rgba(99,102,241,0.10)',
        borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 6,
      }}>
        {!isPhoto && (
          <div style={{ fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase' }}>{asset.asset_type}</div>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {asset.filename}
      </div>
      <button
        data-testid={`toggle-${asset.id}`}
        onClick={onToggle}
        style={{
          marginTop: 6, width: '100%',
          padding: '5px 8px',
          background: selected ? 'transparent' : GRADIENT,
          color: selected ? 'var(--cream-2)' : '#FFF',
          border: selected ? '1px solid rgba(255,255,255,0.14)' : 'none',
          borderRadius: 9999, cursor: 'pointer',
          fontSize: 11, fontWeight: 600,
        }}>
        {selected ? t('studio.mood_board.remove') : t('studio.mood_board.add')}
      </button>
    </div>
  );
}

const tabStyle = (active) => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '6px 14px',
  background: active ? GRADIENT : 'transparent',
  color: active ? '#FFF' : 'var(--cream-2)',
  border: '1px solid rgba(255,255,255,0.14)', borderRadius: 9999,
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
  cursor: 'pointer',
});
const addBtn = () => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '6px 14px',
  background: GRADIENT, color: '#FFF',
  border: 'none', borderRadius: 9999,
  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
  cursor: 'pointer',
});
const ghostBtn = () => ({
  padding: '6px 12px',
  background: 'transparent', color: 'var(--cream-2)',
  border: '1px solid rgba(255,255,255,0.14)', borderRadius: 9999,
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
  cursor: 'pointer',
});
const dangerBtn = () => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '6px 12px',
  background: 'transparent', color: '#EF4444',
  border: '1px solid rgba(239,68,68,0.30)', borderRadius: 9999,
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
  cursor: 'pointer',
});
const inputStyle = () => ({
  padding: '6px 12px',
  background: 'rgba(6,8,15,0.7)', color: 'var(--cream)',
  border: '1px solid rgba(255,255,255,0.14)', borderRadius: 9999,
  fontFamily: 'DM Sans', fontSize: 12, outline: 'none',
});
const miniBtn = () => ({
  width: 22, height: 22,
  background: 'transparent', color: 'var(--cream-2)',
  border: '1px solid rgba(255,255,255,0.14)', borderRadius: 9999,
  cursor: 'pointer', fontSize: 12, lineHeight: 1,
});
