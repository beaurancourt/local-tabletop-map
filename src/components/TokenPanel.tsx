import { useEffect, useRef, useState } from 'react';
import type { Token } from '../types';
import { addTokenTag, clampHp, healthColor, removeTokenTag, TAG_SUGGESTIONS } from '../tokens';
import { TokenEditSession } from '../tokenHistory';

interface TokenPanelProps {
  tokens: Token[];
  onPlace: () => void;
  onChange: (id: string, patch: Partial<Token>) => void;
  onRemove: (id: string) => void;
  /** One history step when a field edit is committed (blur/Enter). */
  onCommit?: (before: Token, after: Token) => void;
  /** Token selected on the map; the matching row is highlighted and scrolled to. */
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** A double-click on the map asks the panel to focus this token's name field. */
  focusToken?: { id: string; nonce: number } | null;
}

export function TokenPanel({
  tokens,
  onPlace,
  onChange,
  onRemove,
  onCommit,
  selectedId = null,
  onSelect,
  focusToken = null,
}: TokenPanelProps) {
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // Live typing updates the parent on every keystroke; the edit session turns
  // the whole field edit into one history operation when it commits.
  const editSession = useRef(new TokenEditSession());
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;

  const commitFieldEdit = () => {
    const id = editSession.current.activeId;
    if (!id) return;
    const current = tokensRef.current.find((candidate) => candidate.id === id) ?? null;
    const operation = editSession.current.commit(current);
    if (operation?.before && operation.after) onCommit?.(operation.before, operation.after);
  };

  const beginFieldEdit = (token: Token, field: string) => {
    editSession.current.begin(token, field);
  };

  useEffect(() => {
    if (!selectedId) return;
    rowRefs.current.get(selectedId)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  useEffect(() => {
    if (!focusToken) return;
    const row = rowRefs.current.get(focusToken.id);
    if (!row) return;
    row.scrollIntoView({ block: 'nearest' });
    row.querySelector<HTMLInputElement>('input.token-name')?.focus();
  }, [focusToken]);

  return (
    <div className="token-panel">
      <div className="token-panel-head">
        <h3>Tokens</h3>
        <button onClick={onPlace}>Place token</button>
      </div>
      <p className="token-panel-hint">
        Click the map to place. Tokens are grid cells, not free pixels; press a token on the map to
        select and edit it, whatever tool is active. Both windows see the name and HP bar. The owner
        is reserved for the network layer.
      </p>

      {tokens.length === 0 && <p className="token-panel-empty">No tokens placed.</p>}

      {tokens.map((token) => (
        <div
          className={`token-row${selectedId === token.id ? ' selected' : ''}`}
          key={token.id}
          title={`id: ${token.id}`}
          data-token-id={token.id}
          data-selected={selectedId === token.id ? 'true' : undefined}
          aria-current={selectedId === token.id ? 'true' : undefined}
          ref={(el) => {
            if (el) rowRefs.current.set(token.id, el);
            else rowRefs.current.delete(token.id);
          }}
          onClick={() => onSelect?.(token.id)}
          onFocusCapture={() => onSelect?.(token.id)}
        >
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
              onFocus={() => beginFieldEdit(token, 'name')}
              onBlur={commitFieldEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
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
                onFocus={() => beginFieldEdit(token, 'hp')}
                onBlur={commitFieldEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
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
                onFocus={() => beginFieldEdit(token, 'maxHp')}
                onBlur={commitFieldEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
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
                onFocus={() => beginFieldEdit(token, 'owner')}
                onBlur={commitFieldEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
            </label>
            <input
              className="token-color"
              type="color"
              value={token.color}
              aria-label="Token colour"
              onChange={(e) => onChange(token.id, { color: e.target.value })}
              onFocus={() => beginFieldEdit(token, 'color')}
              onBlur={commitFieldEdit}
            />
          </div>

          <TokenTags
            token={token}
            onChange={(patch) => onChange(token.id, patch)}
            onCommit={(before, after) => onCommit?.(before, after)}
          />
        </div>
      ))}
    </div>
  );
}

function TokenTags({
  token,
  onChange,
  onCommit,
}: {
  token: Token;
  onChange: (patch: Partial<Token>) => void;
  onCommit?: (before: Token, after: Token) => void;
}) {
  const [draft, setDraft] = useState('');
  const tags = token.tags ?? [];

  // A tag add/remove is a discrete action, so unlike typing it is one history
  // step immediately.
  const commitPatch = (patch: Partial<Token>) => {
    onChange(patch);
    onCommit?.(token, { ...token, ...patch });
  };

  const add = () => {
    const next = addTokenTag(tags, draft);
    if (next !== tags) commitPatch({ tags: next });
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
              onClick={() => commitPatch({ tags: removeTokenTag(tags, tag) })}
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
