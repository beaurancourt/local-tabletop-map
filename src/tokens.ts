import type { Token } from './types';

export const DEFAULT_TOKEN_COLOR = '#4f8cff';

/** Suggested conditions/labels; the input is still free text. */
export const TAG_SUGGESTIONS = [
  'blinded', 'blessed', 'burning', 'charmed', 'concentrating', 'cursed',
  'deafened', 'exhausted', 'frightened', 'grappled', 'hidden', 'incapacitated',
  'invisible', 'paralysed', 'poisoned', 'prone', 'restrained', 'stunned',
  'unconscious',
];

export const MAX_TAG_LENGTH = 24;

/** One canonical form for a tag: no leading #, collapsed spaces, lower-case. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .slice(0, MAX_TAG_LENGTH)
    .trim();
}

/** Add unless empty or already present; returns the same array for a no-op. */
export function addTokenTag(tags: string[], raw: string): string[] {
  const tag = normalizeTag(raw);
  if (!tag || tags.includes(tag)) return tags;
  return [...tags, tag];
}

export function removeTokenTag(tags: string[], raw: string): string[] {
  const tag = normalizeTag(raw);
  return tags.filter((existing) => existing !== tag);
}

/** HP is clamped to 0..max; an unset max (0) is always 0 HP. */
export function clampHp(hp: number, maxHp: number): number {
  if (!Number.isFinite(maxHp) || maxHp <= 0) return 0;
  if (!Number.isFinite(hp)) return 0;
  return Math.max(0, Math.min(Math.round(hp), Math.round(maxHp)));
}

export function healthRatio(hp: number, maxHp: number): number {
  if (!Number.isFinite(maxHp) || maxHp <= 0) return 0;
  if (!Number.isFinite(hp)) return 0;
  return Math.max(0, Math.min(1, hp / maxHp));
}

/**
 * WoW-style thresholds: green above half, yellow from a quarter to a half,
 * red below a quarter. An unset maximum gets a neutral grey (no bar is drawn).
 */
export function healthColor(hp: number, maxHp: number): string {
  if (!Number.isFinite(maxHp) || maxHp <= 0) return '#6b7280';
  const ratio = healthRatio(hp, maxHp);
  if (ratio > 0.5) return '#22c55e';
  if (ratio > 0.25) return '#eab308';
  return '#ef4444';
}

export function tokenCenter(
  token: Pick<Token, 'gridX' | 'gridY'>,
  gridSize: number,
  gridOffsetX: number,
  gridOffsetY: number
): { x: number; y: number } {
  return {
    x: gridOffsetX + (token.gridX + 0.5) * gridSize,
    y: gridOffsetY + (token.gridY + 0.5) * gridSize,
  };
}

export function cellForPoint(
  x: number,
  y: number,
  gridSize: number,
  gridOffsetX: number,
  gridOffsetY: number
): { gridX: number; gridY: number } {
  const size = gridSize || 50;
  return {
    gridX: Math.floor((x - gridOffsetX) / size),
    gridY: Math.floor((y - gridOffsetY) / size),
  };
}

export function newTokenId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `token-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeToken(
  name: string,
  gridX: number,
  gridY: number,
  options: { owner?: string | null; hp?: number; maxHp?: number; color?: string } = {}
): Token {
  const maxHp = Math.max(0, Math.round(options.maxHp ?? 10));
  return {
    id: newTokenId(),
    name: name.trim() || 'Token',
    owner: options.owner ?? null,
    gridX: Math.round(gridX),
    gridY: Math.round(gridY),
    maxHp,
    hp: clampHp(options.hp ?? maxHp, maxHp),
    color: options.color ?? DEFAULT_TOKEN_COLOR,
    tags: [],
  };
}
