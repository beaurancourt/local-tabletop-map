import type { Tool } from './types';

/**
 * Pointer-down precedence on the map, shared by the desktop DM, the browser GM
 * and the browser player. A press on a token always belongs to the token; the
 * active tool only decides what an empty-map press does.
 *
 * `pan` and `token` both pan the map on an empty-map drag. The token tool then
 * places a token on the click that ends a drag-free press, so a stray drag over
 * empty map never drops a token by accident. The painting tools (fog, draw,
 * laser, block, text) keep the map for themselves.
 */
export type MapPress = 'token' | 'place-token' | 'pan' | 'tool';

export interface MapPressContext {
  onToken: boolean;
  activeTool: Tool;
  /** True once the layer has actually moved during the current press. */
  dragged: boolean;
}

export function mapPress({ onToken, activeTool, dragged }: MapPressContext): MapPress {
  if (onToken) return 'token';
  if (activeTool === 'pan') return 'pan';
  if (activeTool === 'token') return dragged ? 'pan' : 'place-token';
  return 'tool';
}

/** The layer follows the pointer when the tool is `pan` or `token`. */
export function emptyMapPans(activeTool: Tool): boolean {
  return activeTool === 'pan' || activeTool === 'token';
}

/** Painting tools act on an empty-map press; pan and token are handled above. */
export function toolActsOnEmptyMap(activeTool: Tool): boolean {
  return !emptyMapPans(activeTool);
}
