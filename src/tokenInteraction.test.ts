import { describe, expect, it } from 'vitest';
import type { Tool } from './types';
import { emptyMapPans, mapPress, toolActsOnEmptyMap } from './tokenInteraction';

const tools: Tool[] = ['pan', 'token', 'fogReveal', 'fogHide', 'draw', 'laser', 'block', 'text'];

describe('map press precedence', () => {
  it('gives every tool press on a token to the token', () => {
    for (const activeTool of tools) {
      expect(mapPress({ onToken: true, activeTool, dragged: false })).toBe('token');
      // Even after the press has dragged (a token drag has already begun), a
      // token press is still not a map pan or a placement.
      expect(mapPress({ onToken: true, activeTool, dragged: true })).toBe('token');
    }
  });

  it('pans empty map with pan and token, and places only on a drag-free token click', () => {
    expect(mapPress({ onToken: false, activeTool: 'pan', dragged: false })).toBe('pan');
    expect(mapPress({ onToken: false, activeTool: 'pan', dragged: true })).toBe('pan');
    expect(mapPress({ onToken: false, activeTool: 'token', dragged: false })).toBe('place-token');
    expect(mapPress({ onToken: false, activeTool: 'token', dragged: true })).toBe('pan');
  });

  it('leaves the painting and text tools on the map', () => {
    for (const activeTool of ['fogReveal', 'fogHide', 'draw', 'laser', 'block', 'text'] as Tool[]) {
      expect(mapPress({ onToken: false, activeTool, dragged: false })).toBe('tool');
    }
  });

  it('matches the draggable layer and the painting-tool guards', () => {
    for (const activeTool of tools) {
      const pans = emptyMapPans(activeTool);
      expect(pans).toBe(activeTool === 'pan' || activeTool === 'token');
      expect(toolActsOnEmptyMap(activeTool)).toBe(!pans);
    }
  });
});
