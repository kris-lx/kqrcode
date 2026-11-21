import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze as analyzeRaw, locate, moire, symbolModules, type AnalyzeInput, type AnalyzeOptions, type Decoder } from '../src/engine.ts';
import { createZXingDecoder } from '../src/decoder-zxing.ts';
import { jsqrDecoder } from '../src/decoder-jsqr.ts';
import { render, renderSymbol } from './helpers.ts';

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

/* ---------------- QR family: QR Code, Micro QR, rMQR ---------------- */

const FAMILY = [
  ['QRCode', 'qr_code'],
  ['MicroQRCode', 'micro_qr_code'],
  ['RMQRCode', 'rm_qr_code'],
] as const;

for (const [zx, format] of FAMILY) {
  test(`decodes ${format} and reports format, version and EC level`, async () => {
    const r = await analyze(await renderSymbol(zx, 'KPAY:12345', { module: 5, angle: 20 }));
    assert.equal(r.text, 'KPAY:12345');
    assert.equal(r.format, format);
    assert.ok(r.version, 'version');
    assert.match(r.ecLevel ?? '', /^[LMQH]$/);
  });

  test(`${format}: module size estimate drives zoom correctly`, async () => {
    const r = await analyze(await renderSymbol(zx, 'KPAY:12345', { module: 6 }));
    assert.ok(r.hint && Math.abs(r.hint.module - 6) < 1, `module ${r.hint?.module}`);
  });

  test(`${format}: far + blurred decodes`, async () => {
    const r = await analyze(await renderSymbol(zx, 'KPAY:12345', { module: 3, angle: 15, blur: true, cx: 900 }));
    assert.equal(r.text, 'KPAY:12345');
  });
}

test('formats option filters the QR family', async () => {
  const micro = await renderSymbol('MicroQRCode', 'KPAY:12345', { module: 5 });
  assert.equal((await analyze(micro, { formats: ['qr_code'] })).text, undefined);
  assert.equal((await analyze(micro, { formats: ['micro_qr_code'] })).format, 'micro_qr_code');
  const qr = await renderSymbol('QRCode', 'KPAY:12345', { module: 5 });
  assert.equal((await analyze(qr, { formats: ['micro_qr_code', 'rm_qr_code'] })).text, undefined);
  assert.equal((await analyze(qr, { formats: ['qr_code'] })).format, 'qr_code');
  const rmqr = await renderSymbol('RMQRCode', 'KPAY:12345', { module: 5 });
  assert.equal((await analyze(rmqr, { formats: ['qr_code', 'micro_qr_code'] })).text, undefined);
});

test('jsQR fallback reports qr_code and honours formats', async () => {
  const img = render(TEXT, { module: 6 });
  const r = await analyzeRaw(img, { thorough: true }, jsqrDecoder);
  assert.equal(r.format, 'qr_code');
  assert.equal((await analyzeRaw(img, { thorough: true, formats: ['micro_qr_code'] }, jsqrDecoder)).text, undefined);
});

test('symbolModules', () => {
  assert.equal(symbolModules('qr_code', '1'), 21);
  assert.equal(symbolModules('qr_code', '40'), 177);
  assert.equal(symbolModules('micro_qr_code', 'M1'), 11);
  assert.equal(symbolModules('micro_qr_code', 'M4'), 17);
  assert.equal(symbolModules('rm_qr_code', 'R13x27'), 27);
  assert.equal(symbolModules(undefined, ''), 25);
});

// a long EMVCo payment payload (~200 chars, QR version 9) – the codes people scan off screens
const EMV = '00020101021238670016A00526628466257701082771041802030010324LAKMXXX202611210001234565204599953034185406150000'
  + '5802LA5918KHAMPHOUI SHOP LTD6009VIENTIANE62400108INV1234505121234567890120708T00123456304';

for (const angle of [0, 23, 92, 161]) {
  test(`reads a dense code filmed off a screen (moiré), ${angle}°`, async () => {
    const img = render(EMV, { module: 4, angle, screen: 0.45 });
    assert.equal((await analyze(img, { invert: true })).text, EMV);
  });
}

test('moire score tells a filmed screen from a camera scene', () => {
  const gray = (img: AnalyzeInput) => { const g = new Uint8Array(img.width * img.height); for (let i = 0; i < g.length; i++) g[i] = img.data[i * 4]; return g; };
  const clean = render(EMV, { module: 4 }), screen = render(EMV, { module: 4, screen: 0.25 });
  assert.ok(moire(gray(clean), clean.width, clean.height) < 18);
  assert.ok(moire(gray(screen), screen.width, screen.height) > 18);
});
