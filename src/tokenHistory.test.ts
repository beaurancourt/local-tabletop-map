import { describe, expect, it } from 'vitest';
import type { AppState, Token } from './types';
import { HistoryManager, createTokenChangeOperation } from './history';
import { TokenEditSession, recordTokenChange, tokenEquals } from './tokenHistory';

const token = (patch: Partial<Token> = {}): Token => ({
  id: 'token-1',
  name: 'Token 1',
  owner: null,
  gridX: 2,
  gridY: 3,
  hp: 10,
  maxHp: 10,
  color: '#4f8cff',
  tags: [],
  ...patch,
});

const stateWith = (...tokens: Token[]): AppState => ({
  map: {
    imageUrl: null,
    playerImageUrl: null,
    filePath: null,
    imageWidth: 800,
    imageHeight: 600,
    gridSize: 50,
    gridVisible: true,
    gridColor: '#000000',
    gridOpacity: 0.3,
    gridOffsetX: 0,
    gridOffsetY: 0,
    hexmap: null,
  },
  fog: { cells: [], cols: 0, rows: 0 },
  drawings: [],
  blocks: { cells: {} },
  textLabels: [],
  tokens,
  laserPoints: [],
  laserColor: '#ff0000',
  view: { scale: 1, offsetX: 0, offsetY: 0 },
  playerViewOffset: { x: 0, y: 0 },
  calibration: { pixelsPerInch: 96, savedPixelsPerInch: 96 },
  initiative: { visible: false, mode: 'classic', entities: [], drawSteel: { round: 1, groups: [] } },
});

const first = (state: AppState): Token => state.tokens[0];

describe('token history operations', () => {
  it('adds, moves, edits and removes a token with one operation each', () => {
    const added = token();
    const add = createTokenChangeOperation(null, added);
    const afterAdd = add.apply(stateWith());
    expect(afterAdd.tokens).toEqual([added]);
    expect(add.unapply(afterAdd).tokens).toEqual([]);

    const moved = { ...added, gridX: 3, gridY: 4 };
    const move = createTokenChangeOperation(added, moved);
    const afterMove = move.apply(stateWith(added));
    expect(first(afterMove)).toMatchObject({ gridX: 3, gridY: 4 });
    expect(first(move.unapply(afterMove))).toMatchObject({ gridX: 2, gridY: 3 });

    const edited = { ...moved, hp: 4, tags: ['prone'] };
    const edit = createTokenChangeOperation(moved, edited);
    expect(first(edit.unapply(stateWith(edited)))).toMatchObject({ hp: 10, tags: [] });

    const remove = createTokenChangeOperation(added, null);
    expect(remove.apply(stateWith(added)).tokens).toEqual([]);
    expect(remove.unapply(stateWith()).tokens).toEqual([added]);
  });

  it('leaves other tokens alone when one is undone', () => {
    const target = token();
    const other = token({ id: 'token-2', name: 'Other', gridX: 6, gridY: 7 });
    const moved = { ...target, gridX: 4, gridY: 4 };
    const playerMovedOther = { ...other, gridX: 8, gridY: 9 };
    const after = createTokenChangeOperation(target, moved)
      .unapply(stateWith(moved, playerMovedOther));
    expect(after.tokens.find((t) => t.id === 'token-2')).toEqual(playerMovedOther);
    expect(after.tokens.find((t) => t.id === 'token-1')).toEqual(target);
  });

  it('undoes and redoes through the shared HistoryManager stack', () => {
    const before = token();
    const after = { ...before, hp: 6 };
    const history = new HistoryManager();
    history.push(createTokenChangeOperation(before, after));

    const undone = history.undo(stateWith(after));
    expect(first(undone!)).toMatchObject({ hp: 10 });
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);

    const redone = history.redo(undone!);
    expect(first(redone!)).toMatchObject({ hp: 6 });
  });

  it('ignores a change that is equal and keeps the 100-step depth', () => {
    const history = new HistoryManager();
    expect(recordTokenChange(history, token(), token())).toBe(false);
    expect(history.getUndoCount()).toBe(0);

    for (let i = 0; i < 105; i += 1) {
      recordTokenChange(history, token(), token({ hp: i }));
    }
    expect(history.getUndoCount()).toBe(100);
  });
});

describe('token edit coalescing', () => {
  it('turns many HP keystrokes into one commit step', () => {
    const session = new TokenEditSession();
    const before = token({ hp: 10 });
    session.begin(before, 'hp');

    // The panel updates live state on every keystroke; the session only sees
    // the final token when the field blurs.
    const operation = session.commit(token({ hp: 7 }));
    expect(operation).not.toBeNull();
    expect(operation!.before).toMatchObject({ hp: 10 });
    expect(operation!.after).toMatchObject({ hp: 7 });

    const history = new HistoryManager();
    recordTokenChange(history, operation!.before, operation!.after);
    expect(history.getUndoCount()).toBe(1);
    expect(first(history.undo(stateWith(token({ hp: 7 })))!)).toMatchObject({ hp: 10 });
  });

  it('does not record a focus that changed nothing, or a cancelled edit', () => {
    const session = new TokenEditSession();
    session.begin(token(), 'name');
    expect(session.commit(token())).toBeNull();
    expect(session.commit(token({ name: 'Changed' }))).toBeNull(); // already ended

    session.begin(token(), 'name');
    session.cancel();
    expect(session.commit(token({ name: 'Changed' }))).toBeNull();
  });

  it('records separate commits for separate fields', () => {
    const session = new TokenEditSession();
    const history = new HistoryManager();
    const base = token();

    session.begin(base, 'name');
    let op = session.commit({ ...base, name: 'Aria' });
    recordTokenChange(history, op!.before, op!.after);

    session.begin({ ...base, name: 'Aria' }, 'hp');
    op = session.commit({ ...base, name: 'Aria', hp: 3 });
    recordTokenChange(history, op!.before, op!.after);

    expect(history.getUndoCount()).toBe(2);
  });

  it('records each discrete tag edit as its own step', () => {
    const history = new HistoryManager();
    const base = token();
    const prone = { ...base, tags: ['prone'] };
    const both = { ...prone, tags: ['prone', 'poisoned'] };

    recordTokenChange(history, base, prone);
    recordTokenChange(history, prone, both);
    expect(history.getUndoCount()).toBe(2);
  });

  it('compares tags and owner as part of the token', () => {
    expect(tokenEquals(token(), token())).toBe(true);
    expect(tokenEquals(token(), token({ tags: ['prone'] }))).toBe(false);
    expect(tokenEquals(token(), token({ owner: 'Aria' }))).toBe(false);
    expect(tokenEquals(token({ owner: null }), token({ owner: null }))).toBe(true);
  });
});
