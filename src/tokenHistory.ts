import type { Token } from './types';
import {
  HistoryManager,
  createTokenChangeOperation,
  type TokenChangeOperation,
} from './history';

/**
 * Token edits are recorded with the existing `history.ts` command pattern.
 * One press is one step:
 *
 * - a drag ends in one `onTokenMove`, so it records one operation;
 * - typing in an HP/name/owner/colour field updates the live state per
 *   keystroke, but `TokenEditSession` records one operation when the field is
 *   committed (blur or Enter);
 * - adding, removing and tag edits are discrete actions and each records one
 *   operation.
 */
export function tokenEquals(a: Token, b: Token): boolean {
  const at = a.tags ?? [];
  const bt = b.tags ?? [];
  return a.id === b.id
    && a.name === b.name
    && (a.owner ?? null) === (b.owner ?? null)
    && a.gridX === b.gridX
    && a.gridY === b.gridY
    && a.hp === b.hp
    && a.maxHp === b.maxHp
    && a.color === b.color
    && at.length === bt.length
    && at.every((tag, index) => tag === bt[index]);
}

/** Push one token operation, ignoring a commit that changed nothing. */
export function recordTokenChange(
  history: HistoryManager,
  before: Token | null,
  after: Token | null,
): boolean {
  if (!before && !after) return false;
  if (before && after && tokenEquals(before, after)) return false;
  history.push(createTokenChangeOperation(before, after));
  return true;
}

/**
 * Coalesces a field-editing session into one history step. The panel starts a
 * session on focus and commits the token as it stands on blur/Enter; the many
 * intermediate states produced while typing never reach the history stack.
 */
export class TokenEditSession {
  private active: { id: string; field: string; token: Token } | null = null;

  begin(token: Token, field: string): void {
    this.active = {
      id: token.id,
      field,
      token: { ...token, tags: [...(token.tags ?? [])] },
    };
  }

  get activeId(): string | null {
    return this.active?.id ?? null;
  }

  get activeField(): string | null {
    return this.active?.field ?? null;
  }

  /** Finish the session with the token's current value; null when nothing changed. */
  commit(current: Token | null): TokenChangeOperation | null {
    const active = this.active;
    this.active = null;
    if (!active) return null;
    if (!current || current.id !== active.id) return null;
    if (tokenEquals(active.token, current)) return null;
    return createTokenChangeOperation(active.token, current);
  }

  cancel(): void {
    this.active = null;
  }
}
