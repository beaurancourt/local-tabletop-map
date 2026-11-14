import { describe, expect, it, vi } from 'vitest';

// The parsers are pure, but persistence.ts imports the Tauri filesystem/path
// plugins and store.ts imports the Tauri event bus at module scope.
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  mkdir: vi.fn(),
  exists: vi.fn(),
}));
vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn(),
  join: vi.fn(),
}));
vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn(),
  listen: vi.fn(),
}));

import { applySavedState, parseSavedMapState } from './persistence';
import { createDefaultState } from './store';
import type { SavedMapState } from './types';

function savedState(overrides: Partial<SavedMapState> = {}): SavedMapState {
  return {
    filePath: '/maps/crypt.png',
    imageWidth: 800,
    imageHeight: 600,
    gridSize: 50,
    gridVisible: true,
    gridColor: '#aabbcc',
    gridOpacity: 0.4,
    gridOffsetX: 12,
    gridOffsetY: 7,
    fog: { cells: [[true, false]], cols: 2, rows: 1 },
    drawings: [{
      id: 'd1',
      points: [{ x: 1, y: 2 }],
      color: '#ff0000',
      strokeWidth: 3,
    }],
    blocks: { cells: { '0,0': '#222222' } },
    textLabels: [],
    tokens: [{
      id: 't1',
      name: 'Aria',
      owner: 'Aria',
      gridX: 2,
      gridY: 3,
      hp: 7,
      maxHp: 10,
      color: '#4f8cff',
      tags: ['scout'],
    }],
    view: { scale: 1.5, offsetX: 20, offsetY: 30 },
    playerViewOffset: { x: 100, y: 50 },
    calibration: { pixelsPerInch: 96, savedPixelsPerInch: 96 },
    savedAt: '2026-11-14T12:00:00.000Z',
    ...overrides,
  };
}

describe('parseSavedMapState', () => {
  it('accepts a complete saved map state', () => {
    const saved = savedState();
    expect(parseSavedMapState(JSON.stringify(saved))).toEqual(saved);
  });

  it('rejects invalid JSON with a readable message', () => {
    expect(() => parseSavedMapState('{ nope')).toThrow(/Not valid JSON/);
  });

  it('rejects unrelated JSON instead of partially loading it', () => {
    expect(() => parseSavedMapState(JSON.stringify({ format: 'cartographer-views', gm: '', player: '' })))
      .toThrow(/Not a VTT saved map state/);
    expect(() => parseSavedMapState(JSON.stringify({ hello: 'world' })))
      .toThrow(/Not a VTT saved map state/);
  });

  it('rejects a state whose tokens are not an array', () => {
    expect(() => parseSavedMapState(JSON.stringify({ ...savedState(), tokens: 'nope' })))
      .toThrow(/Not a VTT saved map state/);
  });

  it('rejects a state with no saved grid geometry', () => {
    expect(() => parseSavedMapState(JSON.stringify({ ...savedState(), gridSize: 'big' })))
      .toThrow(/Not a VTT saved map state/);
  });
});

describe('applySavedState without an image', () => {
  it('clears the image but keeps grid, fog, drawings and tokens', () => {
    const current = {
      ...createDefaultState(),
      map: {
        ...createDefaultState().map,
        imageUrl: 'http://server/media/old.svg',
        imageWidth: 1024,
        imageHeight: 768,
        filePath: '/old/map.png',
      },
    };
    const saved = savedState();
    const next = applySavedState(current, saved, null);

    expect(next.map.imageUrl).toBeNull();
    expect(next.map.playerImageUrl).toBeNull();
    expect(next.map.filePath).toBe('/maps/crypt.png');
    expect(next.map.imageWidth).toBe(800);
    expect(next.map.imageHeight).toBe(600);
    expect(next.map.gridSize).toBe(50);
    expect(next.map.gridOffsetX).toBe(12);
    expect(next.fog).toEqual(saved.fog);
    expect(next.drawings).toEqual(saved.drawings);
    expect(next.tokens).toEqual(saved.tokens);
    expect(next.map.hexmap).toBeNull();
  });
});
