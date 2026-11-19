import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze as analyzeRaw, locate, type AnalyzeInput, type AnalyzeOptions, type Decoder } from '../src/engine.ts';
import { createZXingDecoder } from '../src/decoder-zxing.ts';
import { jsqrDecoder } from '../src/decoder-jsqr.ts';
import { render } from './helpers.ts';

const zx: Decoder = await createZXingDecoder();
const analyze = (img: AnalyzeInput, o: AnalyzeOptions = {}) => analyzeRaw(img, o, zx);

const TEXT = 'https://pay.example.com/kpay?order=1234567890&amt=88.00';

test('decodes upright, close', async () => {
  const r = await analyze(render(TEXT, { module: 8 }));
  assert.equal(r.text, TEXT);
});

for (const angle of [15, 45, 90, 137, 180, 270]) {
  test(`decodes rotated ${angle}°`, async () => {
    const r = await analyze(render(TEXT, { module: 6, angle }));
    assert.equal(r.text, TEXT);
  });
}

test('decodes inverted code', async () => {
  const r = await analyze(render(TEXT, { module: 6, invert: true }), { invert: true, thorough: true });
  assert.equal(r.text, TEXT);
});

test('locator finds a far, small code and estimates module size', async () => {
  const img = render(TEXT, { module: 3, angle: 30, cx: 400, cy: 250 });
  const gray = new Uint8Array(img.width * img.height);
  for (let i = 0; i < gray.length; i++) gray[i] = img.data[i * 4];
  const hint = locate(gray, img.width, img.height);
  assert.ok(hint, 'no hint');
  assert.ok(hint!.full, 'should see all three finders');
  assert.ok(Math.abs(hint!.module - 3) < 1, `module ${hint!.module}`);
  assert.ok(Math.hypot(hint!.cx - 400, hint!.cy - 250) < 30, `centre ${hint!.cx},${hint!.cy}`);
});

test('far + blurred code decodes through ROI tracking', async () => {
  const r = await analyze(render('KPAY:1234567890', { module: 4, angle: 20, blur: true, cx: 700, cy: 300 }));
  assert.equal(r.text, 'KPAY:1234567890');
});

test('ZXing decodes blurred 3px-module code that jsQR cannot', async () => {
  const img = render('KPAY:1234567890', { module: 3, angle: 20, blur: true, cx: 700, cy: 300 });
  assert.equal((await analyze(img)).text, 'KPAY:1234567890');
  const r = await analyzeRaw(img, { thorough: true }, jsqrDecoder);
  assert.equal(r.text, undefined); // jsQR fallback fails here…
  assert.ok(r.hint && r.hint.full); // …but the locator still drives auto-zoom
});

test('roiOnly: native-resolution crop of a tiny code decodes (iOS digital-zoom path)', async () => {
  const full = render('KPAY:1234567890', { module: 2.4, angle: 15, W: 3840, H: 2160, cx: 2800, cy: 700 });
  const x0 = 2800 - 130, y0 = 700 - 130, cw = 260;
  const crop = new Uint8ClampedArray(cw * cw * 4);
  for (let y = 0; y < cw; y++) for (let x = 0; x < cw; x++) {
    const s = ((y0 + y) * full.width + x0 + x) * 4, o = (y * cw + x) * 4;
    crop[o] = crop[o + 1] = crop[o + 2] = full.data[s]; crop[o + 3] = 255;
  }
  const r = await analyze({ data: crop, width: cw, height: cw }, { roiOnly: true, upscale: 2 });
  assert.equal(r.text, 'KPAY:1234567890');
  assert.ok(r.corners && r.corners.every((p) => p.x > 0 && p.x < cw));
});

test('no code → no text, no crash', async () => {
  const W = 640, H = 480;
  const data = new Uint8ClampedArray(W * H * 4).fill(128);
  const r = await analyze({ data, width: W, height: H });
  assert.equal(r.text, undefined);
});

// Sanity check only (catches accidental O(n²) regressions); real numbers live in bench/.
// Best of 5 so a busy CI machine or parallel test files don't make it flaky.
test('performance: 1080p empty frame stays fast (best of 5 < 150 ms)', async () => {
  const W = 1920, H = 1080;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < data.length; i += 4) data[i] = data[i + 1] = data[i + 2] = 100 + ((i >> 2) % 50);
  await analyze({ data, width: W, height: H }); // warm up
  let best = Infinity;
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    await analyze({ data, width: W, height: H });
    best = Math.min(best, performance.now() - t);
  }
  assert.ok(best < 150, `best ${best.toFixed(1)} ms`);
});
