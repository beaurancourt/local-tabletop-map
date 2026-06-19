import { useState } from 'react';
import { InitiativeState } from '../types';
import { sortedByInitiative, isValidDiceSpec, DEFAULT_DICE } from '../initiative';

interface InitiativeTrackerProps {
  initiative: InitiativeState;
  editable: boolean; // DM window can add/remove/reroll; player window is read-only
  onAdd?: (name: string, count: number, dice: string, isPc: boolean) => void;
  onRemove?: (id: string) => void;
  onReroll?: () => void;
  onClear?: () => void;
}

export function InitiativeTracker({
  initiative,
  editable,
  onAdd,
  onRemove,
  onReroll,
  onClear,
}: InitiativeTrackerProps) {
  const [name, setName] = useState('');
  const [count, setCount] = useState(1);
  const [dice, setDice] = useState(DEFAULT_DICE);
  const [isPc, setIsPc] = useState(false);

  if (!initiative.visible) return null;

  const ordered = sortedByInitiative(initiative.entities);
  const diceValid = isValidDiceSpec(dice);

  const submitAdd = () => {
    if (!name.trim() || !diceValid || !onAdd) return;
    onAdd(name, count, dice, isPc);
    setName('');
    setCount(1);
    // Keep the dice spec and PC flag so adding several groups in a row is quick.
  };

  return (
    <div className="initiative-tracker">
      <div className="initiative-header">
        <span className="initiative-title">Initiative</span>
        {editable && (
          <div className="initiative-header-actions">
            <button onClick={onReroll} title="Re-roll all initiative">Reroll</button>
            <button onClick={onClear} title="Remove all entities">Clear</button>
          </div>
        )}
      </div>

      <ol className="initiative-list">
        {ordered.length === 0 && (
          <li className="initiative-empty">No entities yet.</li>
        )}
        {ordered.map((e) => (
          <li key={e.id} className="initiative-row">
            <span className="initiative-roll">{e.roll ?? '—'}</span>
            <span className="initiative-name">{e.name}</span>
            {editable && <span className="initiative-dice">{e.dice}</span>}
            {editable && (
              <button
                className="initiative-remove"
                onClick={() => onRemove?.(e.id)}
                title={`Remove ${e.name}`}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ol>

      {editable && (
        <div className="initiative-add">
          <input
            type="text"
            placeholder="Name (e.g. bandit)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); }}
          />
          <div className="initiative-add-row">
            <label>
              <span>×</span>
              <input
                type="number"
                min={1}
                value={count}
                onChange={(e) => setCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              />
            </label>
            <input
              type="text"
              className={diceValid ? 'initiative-dice-input' : 'initiative-dice-input invalid'}
              placeholder="1d6"
              value={dice}
              onChange={(e) => setDice(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); }}
              title="Initiative dice, e.g. 1d20, 1d6, 1d20+3"
            />
            <button onClick={submitAdd} disabled={!name.trim() || !diceValid}>Add</button>
          </div>
          <label className="initiative-pc-label">
            <input
              type="checkbox"
              checked={isPc}
              onChange={(e) => setIsPc(e.target.checked)}
            />
            <span>Player character (kept when you Clear)</span>
          </label>
        </div>
      )}
    </div>
  );
}
