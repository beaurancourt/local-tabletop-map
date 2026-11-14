import type { Token } from './types';

export const DEFAULT_TOKEN_COLOR = '#4f8cff';

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
  };
}
