import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AutoZoom, sweepLevels } from '../src/autozoom.ts';

const base = { min: 1, max: 8, videoWidth: 1920, videoHeight: 1080, decoded: false };

test('far undecodable code → zoom in, bounded by fit', () => {
  const z = new AutoZoom();
  const next = z.update({ ...base, now: 1000, zoom: 1, hint: { cx: 960, cy: 540, size: 60, module: 2, full: true } });
  assert.ok(next && next > 1.8, `got ${next}`);
});

test('does not zoom past the screen edge when code is off-centre', () => {
  const z = new AutoZoom();
  const next = z.update({ ...base, now: 1000, zoom: 1, hint: { cx: 1700, cy: 540, size: 60, module: 2, full: true } });
  // visible half-width at zoom k is 960/k; code edge at 1700-960+30=770 → k ≤ ~1.2
  assert.ok(next === null || next < 1.3, `got ${next}`);
});

test('big readable code → leave zoom alone', () => {
  const z = new AutoZoom();
  assert.equal(z.update({ ...base, now: 1000, zoom: 1, hint: { cx: 960, cy: 540, size: 500, module: 18, full: true } }), null);
});

test('settle period suppresses back-to-back changes', () => {
  const z = new AutoZoom();
  const h = { cx: 960, cy: 540, size: 60, module: 2, full: true };
  assert.ok(z.update({ ...base, now: 1000, zoom: 1, hint: h }));
  assert.equal(z.update({ ...base, now: 1100, zoom: 2, hint: h }), null);
});

test('user hold suppresses auto zoom', () => {
  const z = new AutoZoom();
  z.hold(1000);
  assert.equal(z.update({ ...base, now: 2000, zoom: 1, hint: { cx: 960, cy: 540, size: 60, module: 2, full: true } }), null);
});

test('nothing visible → returns to 1× then sweeps up and back', () => {
  const z = new AutoZoom();
  const seq: number[] = [];
  let zoom = 3;
  for (let t = 0; t < 12000; t += 100) {
    const n = z.update({ ...base, now: t, zoom, hint: null });
    if (n !== null) { seq.push(n); zoom = n; }
  }
  assert.equal(seq[0], 1);
  assert.deepEqual(seq.slice(1, 5), sweepLevels(1, 8).slice(1, 5));
  assert.ok(seq.includes(8) && seq.lastIndexOf(1) > seq.indexOf(8), `seq ${seq}`);
});

test('no zoom hardware → never asks', () => {
  const z = new AutoZoom();
  assert.equal(z.update({ ...base, max: 1, now: 5000, zoom: 1, hint: null }), null);
});
