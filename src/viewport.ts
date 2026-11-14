import type { ViewState } from './types';

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Scale that fits the whole map inside the viewport. */
export function fitScale(mapWidth: number, mapHeight: number, width: number, height: number): number {
  if (!mapWidth || !mapHeight || !width || !height) return 1;
  return Math.min(width / mapWidth, height / mapHeight);
}

/** The initial fit view: the whole map centred in the viewport. */
export function fitView(mapWidth: number, mapHeight: number, width: number, height: number): ViewState {
  const scale = fitScale(mapWidth, mapHeight, width, height);
  return {
    scale,
    offsetX: (width - mapWidth * scale) / 2,
    offsetY: (height - mapHeight * scale) / 2,
  };
}

/**
 * The GM's player framing: calibration maps one inch to a number of screen
 * pixels, and playerViewOffset is in map coordinates. This is only a starting
 * point for the browser player; it is never shared back to the GM.
 */
export function gmPlayerView(
  pixelsPerInch: number,
  gridSize: number,
  offset: Point,
): ViewState {
  const scale = gridSize > 0 ? pixelsPerInch / gridSize : 1;
  return {
    scale,
    offsetX: -offset.x * scale,
    offsetY: -offset.y * scale,
  };
}

/**
 * The browser player may zoom from the whole-map fit down to a little beyond
 * the GM's framing, and up to 4 map pixels per screen pixel (or twice the fit
 * for tiny maps, which are already larger than the viewport at 1:1).
 */
export function minScale(fit: number, base = 1): number {
  return Math.max(0.01, Math.min(fit, base, 1));
}

export function maxScale(fit: number, base: number): number {
  return Math.max(4, fit * 2, base * 2);
}

export function clampScale(scale: number, fit: number, base: number): number {
  return Math.max(minScale(fit, base), Math.min(maxScale(fit, base), scale));
}

/** Convert a screen point inside the viewport to map coordinates. */
export function screenToMap(view: ViewState, point: Point): Point {
  return {
    x: (point.x - view.offsetX) / view.scale,
    y: (point.y - view.offsetY) / view.scale,
  };
}

/** Zoom around a screen point, keeping that map point under the pointer. */
export function zoomView(
  view: ViewState,
  factor: number,
  focus: Point,
  fit: number,
  base: number,
): ViewState {
  const scale = clampScale(view.scale * factor, fit, base);
  const anchor = screenToMap(view, focus);
  return {
    scale,
    offsetX: focus.x - anchor.x * scale,
    offsetY: focus.y - anchor.y * scale,
  };
}

/** Pan by a screen-space delta. */
export function panView(view: ViewState, dx: number, dy: number): ViewState {
  return {
    scale: view.scale,
    offsetX: view.offsetX + dx,
    offsetY: view.offsetY + dy,
  };
}

/**
 * Pinch: start and current distances and midpoints are in screen space. The
 * map point under the starting midpoint stays under the current midpoint while
 * the scale changes.
 */
export function pinchView(
  startView: ViewState,
  startDistance: number,
  startMid: Point,
  currentDistance: number,
  currentMid: Point,
  fit: number,
  base: number,
): ViewState {
  if (startDistance <= 0) return startView;
  const scale = clampScale(startView.scale * (currentDistance / startDistance), fit, base);
  const anchor = screenToMap(startView, startMid);
  return {
    scale,
    offsetX: currentMid.x - anchor.x * scale,
    offsetY: currentMid.y - anchor.y * scale,
  };
}

/**
 * Keep the same map point under the viewport centre when its size changes, so
 * a phone rotating or a browser window resizing does not make the map jump.
 */
export function recenterView(view: ViewState, oldSize: Size, newSize: Size): ViewState {
  return {
    scale: view.scale,
    offsetX: view.offsetX + (newSize.width - oldSize.width) / 2,
    offsetY: view.offsetY + (newSize.height - oldSize.height) / 2,
  };
}
