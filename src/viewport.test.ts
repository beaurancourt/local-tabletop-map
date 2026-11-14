import { describe, expect, it } from 'vitest';
import {
  clampScale,
  fitScale,
  fitView,
  gmPlayerView,
  maxScale,
  minScale,
  panView,
  pinchView,
  recenterView,
  screenToMap,
  zoomView,
} from './viewport';

const close = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 6);

describe('player viewport maths', () => {
  it('fits and centres the whole map', () => {
    const view = fitView(800, 600, 1200, 800);
    close(view.scale, 1.333333);
    close(view.offsetX, 66.666667);
    close(view.offsetY, 0);
    close(fitScale(800, 600, 400, 400), 0.5);
    const portrait = fitView(800, 600, 400, 800);
    close(portrait.scale, 0.5);
    close(portrait.offsetX, 0);
    close(portrait.offsetY, 250);
  });

  it('builds the GM framing from calibration and offset', () => {
    const view = gmPlayerView(96, 50, { x: 100, y: 50 });
    close(view.scale, 1.92);
    close(view.offsetX, -192);
    close(view.offsetY, -96);
  });

  it('zooms around a focus point without moving the map under it', () => {
    const start = fitView(800, 600, 1200, 800);
    const focus = { x: 300, y: 200 };
    const before = screenToMap(start, focus);
    const zoomed = zoomView(start, 2, focus, start.scale, 1.92);
    const after = screenToMap(zoomed, focus);
    close(after.x, before.x);
    close(after.y, before.y);
    close(zoomed.scale, start.scale * 2);
  });

  it('clamps zoom to the fit and reading limits', () => {
    const fit = 0.5;
    const base = 1.92;
    close(minScale(fit), 0.5);
    close(maxScale(fit, base), 4);
    close(clampScale(0.01, fit, base), 0.5);
    close(clampScale(100, fit, base), 4);
    const tiny = 4.4;
    close(minScale(tiny), 1);
    close(maxScale(tiny, 1.92), 8.8);
    // The GM framing may be smaller than the fit; allow it as the floor.
    close(minScale(1.3, 0.96), 0.96);
    close(clampScale(0.5, 1.3, 0.96), 0.96);
  });

  it('pans in screen space', () => {
    const view = panView({ scale: 2, offsetX: 10, offsetY: 20 }, -5, 7);
    expect(view).toEqual({ scale: 2, offsetX: 5, offsetY: 27 });
  });

  it('pinches around the moving midpoint', () => {
    const start = { scale: 1, offsetX: 0, offsetY: 0 };
    const view = pinchView(
      start,
      100,
      { x: 200, y: 200 },
      200,
      { x: 250, y: 210 },
      1,
      4,
    );
    close(view.scale, 2);
    const anchor = screenToMap(start, { x: 200, y: 200 });
    const underFinger = screenToMap(view, { x: 250, y: 210 });
    close(underFinger.x, anchor.x);
    close(underFinger.y, anchor.y);
  });

  it('recentres a local view when the viewport resizes or rotates', () => {
    const view = { scale: 2, offsetX: 20, offsetY: 30 };
    const resized = recenterView(view, { width: 400, height: 800 }, { width: 800, height: 400 });
    expect(resized).toEqual({ scale: 2, offsetX: 220, offsetY: -170 });
  });
});
