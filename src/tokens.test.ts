import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOKEN_COLOR,
  cellForPoint,
  clampHp,
  healthColor,
  healthRatio,
  makeToken,
  normalizeTag,
  addTokenTag,
  removeTokenTag,
  tokenCenter,
  MAX_TAG_LENGTH,
} from './tokens';

describe('token HP maths', () => {
  it('clamps HP into 0..max and treats an unset maximum as zero', () => {
    expect(clampHp(5, 10)).toBe(5);
    expect(clampHp(-3, 10)).toBe(0);
    expect(clampHp(14, 10)).toBe(10);
    expect(clampHp(5, 0)).toBe(0);
    expect(clampHp(Number.NaN, 10)).toBe(0);
    expect(clampHp(5.6, 10)).toBe(6);
  });

  it('reports a bounded health ratio', () => {
    expect(healthRatio(5, 10)).toBe(0.5);
    expect(healthRatio(0, 10)).toBe(0);
    expect(healthRatio(20, 10)).toBe(1);
    expect(healthRatio(-2, 10)).toBe(0);
    expect(healthRatio(5, 0)).toBe(0);
  });

  it('uses green above half, yellow through a quarter, red below, grey for unset', () => {
    expect(healthColor(11, 10)).toBe('#22c55e');
    expect(healthColor(6, 10)).toBe('#22c55e');
    expect(healthColor(5, 10)).toBe('#eab308');
    expect(healthColor(3, 10)).toBe('#eab308');
    expect(healthColor(2, 10)).toBe('#ef4444');
    expect(healthColor(0, 10)).toBe('#ef4444');
    expect(healthColor(5, 0)).toBe('#6b7280');
  });
});

describe('token position maths', () => {
  it('centres a token in its grid cell, accounting for grid offset', () => {
    expect(tokenCenter({ gridX: 0, gridY: 0 }, 50, 10, 20)).toEqual({ x: 35, y: 45 });
    expect(tokenCenter({ gridX: 2, gridY: 1 }, 50, 10, 20)).toEqual({ x: 135, y: 95 });
  });

  it('maps a dropped centre back to the cell under it', () => {
    expect(cellForPoint(35, 45, 50, 10, 20)).toEqual({ gridX: 0, gridY: 0 });
    expect(cellForPoint(135, 95, 50, 10, 20)).toEqual({ gridX: 2, gridY: 1 });
    expect(cellForPoint(9, 19, 50, 10, 20)).toEqual({ gridX: -1, gridY: -1 });
  });
});

describe('token tags', () => {
  it('normalises case, #, whitespace and length', () => {
    expect(normalizeTag('  #Prone  ')).toBe('prone');
    expect(normalizeTag('On   Fire')).toBe('on fire');
    expect(normalizeTag('   ')).toBe('');
    expect(normalizeTag('x'.repeat(MAX_TAG_LENGTH + 10))).toHaveLength(MAX_TAG_LENGTH);
  });

  it('adds, removes and refuses duplicate spellings', () => {
    let tags: string[] = [];
    tags = addTokenTag(tags, 'Prone');
    expect(tags).toEqual(['prone']);
    const same = addTokenTag(tags, '  #PRONE ');
    expect(same).toBe(tags);
    tags = addTokenTag(tags, 'On Fire');
    expect(tags).toEqual(['prone', 'on fire']);
    expect(addTokenTag(tags, '   ')).toBe(tags);
    expect(removeTokenTag(tags, 'Prone')).toEqual(['on fire']);
    expect(removeTokenTag(tags, 'missing')).toEqual(tags);
  });
});

describe('new tokens', () => {
  it('gets a stable non-empty id, owner field and clamped HP', () => {
    const token = makeToken('Goblin', 3, 4, { maxHp: 7, hp: 99 });
    expect(token.id.length).toBeGreaterThan(8);
    expect(makeToken('Orc', 0, 0).id).not.toBe(token.id);
    expect(token).toMatchObject({
      name: 'Goblin',
      owner: null,
      gridX: 3,
      gridY: 4,
      maxHp: 7,
      hp: 7,
      color: DEFAULT_TOKEN_COLOR,
      tags: [],
    });
  });

  it('keeps an owner and a zero maximum when supplied', () => {
    const token = makeToken('Unset', 0, 0, { owner: 'alice', maxHp: 0, hp: 9 });
    expect(token.owner).toBe('alice');
    expect(token.maxHp).toBe(0);
    expect(token.hp).toBe(0);
  });
});
