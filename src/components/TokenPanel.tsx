import { useState } from 'react';
import type { Token } from '../types';
import { addTokenTag, clampHp, healthColor, removeTokenTag, TAG_SUGGESTIONS } from '../tokens';

interface TokenPanelProps {
  tokens: Token[];
  onPlace: () => void;
  onChange: (id: string, patch: Partial<Token>) => void;
  onRemove: (id: string) => void;
}

export function TokenPanel({ tokens, onPlace, onChange, onRemove }: TokenPanelProps) {
  return (
    <div className="token-panel">
      <div className="token-panel-head">
        <h3>Tokens</h3>
        <button onClick={onPlace}>Place token</button>
      </div>
      <p className="token-panel-hint">
        Click the map to place. Tokens are grid cells, not free pixels; drag one onto another cell
        to move it. Both windows see the name and HP bar. The owner is reserved for the network
        layer.
      </p>

      {tokens.length === 0 && <p className="token-panel-empty">No tokens placed.</p>}

      {tokens.map((token) => (
        <div className="token-row" key={token.id} title={`id: ${token.id}`}>
          <div className="token-row-main">
            <span
              className="token-swatch"
              style={{ background: token.color }}
              aria-hidden="true"
            />
            <input
              className="token-name"
              value={token.name}
              aria-label="Token name"
              onChange={(e) => onChange(token.id, { name: e.target.value })}
            />
            <button className="token-remove" onClick={() => onRemove(token.id)} aria-label="Remove token">
              ×
            </button>
          </div>

          <div className="token-row-fields">
            <label>
              HP
              <input
                type="number"
                min="0"
                max={token.maxHp > 0 ? token.maxHp : undefined}
                value={token.hp}
                disabled={token.maxHp <= 0}
                onChange={(e) => onChange(token.id, { hp: clampHp(Number(e.target.value), token.maxHp) })}
              />
            </label>
            <span className="token-slash">/</span>
            <label>
              Max
              <input
                type="number"
                min="0"
                value={token.maxHp}
                onChange={(e) => {
                  const maxHp = Math.max(0, Math.round(Number(e.target.value) || 0));
                  onChange(token.id, { maxHp, hp: clampHp(token.hp, maxHp) });
                }}
              />
            </label>
            <span
              className="token-health-chip"
              style={{ background: token.maxHp > 0 ? healthColor(token.hp, token.maxHp) : '#6b7280' }}
              title="Health bar colour"
            />
          </div>

          <div className="token-row-owner">
            <label>
              Owner
              <input
                value={token.owner ?? ''}
                placeholder="unowned"
                onChange={(e) => onChange(token.id, { owner: e.target.value.trim() || null })}
              />
            </label>
            <input
              className="token-color"
              type="color"
              value={token.color}
              aria-label="Token colour"
              onChange={(e) => onChange(token.id, { color: e.target.value })}
            />
          </div>

          <TokenTags token={token} onChange={(patch) => onChange(token.id, patch)} />
        </div>
      ))}
    </div>
  );
}

function TokenTags({ token, onChange }: { token: Token; onChange: (patch: Partial<Token>) => void }) {
  const [draft, setDraft] = useState('');
  const tags = token.tags ?? [];

  const add = () => {
    const next = addTokenTag(tags, draft);
    if (next !== tags) onChange({ tags: next });
    setDraft('');
  };

  return (
    <div className="token-tags">
      <div className="token-tag-list">
        {tags.length === 0 && <span className="token-tags-empty">No tags</span>}
        {tags.map((tag) => (
          <span className="token-tag" key={tag}>
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag} tag`}
              onClick={() => onChange({ tags: removeTokenTag(tags, tag) })}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="token-tag-add">
        <input
          value={draft}
          list="token-tag-suggestions"
          placeholder="add tag"
          aria-label="New tag"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" onClick={add}>Add</button>
      </div>
      <datalist id="token-tag-suggestions">
        {TAG_SUGGESTIONS.map((tag) => <option key={tag} value={tag} />)}
      </datalist>
    </div>
  );
}
