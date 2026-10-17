import assert from 'node:assert/strict';
import test from 'node:test';

import { nearest, project, zoomAt } from '../src/plot.js';

function close(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not close to ${expected}`);
}

test('projects increasing valence rightward and increasing arousal upward', () => {
  const view = Object.freeze({ x: 25, y: 40, scale: 200 });
  assert.deepEqual(project({ valence: 0, arousal: 0 }, view), { x: 25, y: 240 });
  assert.deepEqual(project({ valence: 1, arousal: 0 }, view), { x: 225, y: 240 });
  assert.deepEqual(project({ valence: 0, arousal: 1 }, view), { x: 25, y: 40 });
  assert.deepEqual(project({ valence: 1, arousal: 1 }, view), { x: 225, y: 40 });
  assert.deepEqual(project({ valence: 0.5, arousal: 0.5 }, view), { x: 125, y: 140 });
});

test('projection applies pan and scale without changing input coordinates', () => {
  const clip = Object.freeze({ valence: 0.25, arousal: 0.75 });
  const first = project(clip, { x: -100, y: 80, scale: 400 });
  const second = project(clip, { x: -80, y: 50, scale: 800 });
  assert.deepEqual(first, { x: 0, y: 180 });
  assert.deepEqual(second, { x: 120, y: 250 });
  assert.deepEqual(clip, { valence: 0.25, arousal: 0.75 });
});

test('zoom preserves the world coordinate beneath an arbitrary anchor', () => {
  const view = Object.freeze({ x: -170, y: 65, scale: 400 });
  for (const [x, y] of [[0, 0], [110, 215], [-500, 1200]]) {
    const anchor = { valence: (x - view.x) / view.scale, arousal: 1 - (y - view.y) / view.scale };
    for (const factor of [0.5, 1, 1.1, 2]) {
      const zoomed = zoomAt(view, x, y, factor);
      close(zoomed.scale, view.scale * factor);
      const projected = project(anchor, zoomed);
      close(projected.x, x);
      close(projected.y, y);
    }
  }
  assert.deepEqual(view, { x: -170, y: 65, scale: 400 });
});

test('zoom clamps both limits while preserving the requested anchor', () => {
  const view = { x: 12, y: -17, scale: 400 };
  const anchor = { valence: 0.37, arousal: 0.81 };
  const point = project(anchor, view);
  for (const [factor, expectedScale] of [[0.0001, 80], [10000, 5000]]) {
    const zoomed = zoomAt(view, point.x, point.y, factor);
    assert.equal(zoomed.scale, expectedScale);
    const after = project(anchor, zoomed);
    close(after.x, point.x);
    close(after.y, point.y);
  }
});

test('attempting to zoom past a reached limit leaves the view unchanged', () => {
  for (const [scale, factor] of [[80, 0.5], [5000, 2]]) {
    const view = Object.freeze({ x: 123.5, y: -42.25, scale });
    assert.deepEqual(zoomAt(view, 410, 75, factor), view);
  }
});

test('zoom and its inverse restore the original view away from limits', () => {
  const view = { x: -125, y: 87, scale: 350 };
  const zoomed = zoomAt(view, 246, 91, 1.7);
  const restored = zoomAt(zoomed, 246, 91, 1 / 1.7);
  for (const key of ['x', 'y', 'scale']) close(restored[key], view[key]);
});

test('nearest selects the closest point by screen distance, not array order', () => {
  const first = Object.freeze({ id: 'first', valence: 0.3, arousal: 0.8 });
  const second = Object.freeze({ id: 'second', valence: 0.4, arousal: 0.8 });
  const clips = Object.freeze([first, second]);
  const view = Object.freeze({ x: 20, y: 30, scale: 100 });
  assert.strictEqual(nearest(clips, view, 58, 50), second);
  assert.strictEqual(nearest([...clips].reverse(), view, 58, 50), second);
  assert.strictEqual(nearest(clips, view, 51, 50), first);
  assert.equal(nearest(clips, view, 500, 500), null);
  assert.equal(nearest([], view, 50, 50), null);
});

test('nearest uses a strict screen-pixel radius at different zoom scales', () => {
  const clip = Object.freeze({ id: 'sample', valence: 0.25, arousal: 0.75 });
  for (const scale of [80, 400, 5000]) {
    const view = { x: -25, y: 40, scale };
    const point = project(clip, view);
    assert.strictEqual(nearest([clip], view, point.x + 17, point.y), clip);
    assert.equal(nearest([clip], view, point.x + 18, point.y), null);
    assert.equal(nearest([clip], view, point.x + 19, point.y), null);
    assert.strictEqual(nearest([clip], view, point.x + 25, point.y, 26), clip);
    assert.equal(nearest([clip], view, point.x + 26, point.y, 26), null);
  }
});

test('nearest checks Euclidean distance and keeps the first item in an exact tie', () => {
  const origin = { id: 'origin', valence: 0, arousal: 1 };
  const overlap = { id: 'overlap', valence: 0, arousal: 1 };
  const view = { x: 0, y: 0, scale: 100 };
  assert.equal(nearest([origin], view, 13, 13), null);
  assert.strictEqual(nearest([origin], view, 12, 12), origin);
  assert.strictEqual(nearest([origin, overlap], view, 0, 0), origin);
  assert.strictEqual(nearest([overlap, origin], view, 0, 0), overlap);
});
