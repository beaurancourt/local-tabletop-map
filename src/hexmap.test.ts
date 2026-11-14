import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: vi.fn() }));

import { buildHexMapMeta, parseHexMapText, renderHexMapSvg } from './hexmap';
import type { HexMapFile } from './hexmap';

const hexFile: HexMapFile = {
  format: 'vtt-hexmap',
  version: 1,
  orientation: 'flat',
  hexRadius: 30,
  cols: 2,
  rows: 2,
  terrains: { plains: '#3d5a2a', water: '#1d3f5e' },
  hexes: [
    { col: 1, row: 1, terrain: 'plains', label: '1' },
    { col: 2, row: 1, terrain: 'water' },
  ],
};

describe('parseHexMapText', () => {
  it('accepts a vtt-hexmap file', () => {
    expect(parseHexMapText(JSON.stringify(hexFile))).toEqual(hexFile);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseHexMapText('not json')).toThrow(/valid JSON/);
  });

  it('rejects a saved map state or other JSON that is not a hex map', () => {
    expect(() => parseHexMapText(JSON.stringify({ filePath: '/map.png', imageWidth: 10 })))
      .toThrow(/Not a vtt-hexmap file/);
  });
});

describe('hex map rendering', () => {
  it('derives geometry from the file and renders an SVG sized to match', () => {
    const meta = buildHexMapMeta(hexFile);
    const svg = renderHexMapSvg(hexFile, { showLabels: true });

    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
    expect(meta.cols).toBe(2);
    expect(meta.rows).toBe(2);
    expect(svg).toContain(`width="${meta.width}"`);
    expect(svg).toContain(`height="${meta.height}"`);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('can omit hex labels for the player render', () => {
    const withLabels = renderHexMapSvg(hexFile, { showLabels: true });
    const withoutLabels = renderHexMapSvg(hexFile, { showLabels: false });
    expect(withLabels).toContain('>1<');
    expect(withoutLabels).not.toContain('>1<');
  });
});
